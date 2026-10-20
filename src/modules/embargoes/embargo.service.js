import { ensureTenantPayrollSchema } from '../../services/tenantProvisioner.service.js';

export async function listEmbargoes(tenantPrisma, { employeeId, status, search, page = 1, limit = 50 } = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const where = {};
  if (employeeId) where.employeeId = employeeId;
  if (status && status !== 'ALL') where.status = status;
  if (search) {
    where.OR = [
      { caseTitle: { contains: search } },
      { dossierNumber: { contains: search } },
      { court: { contains: search } },
      { employee: { lastName: { contains: search } } },
      { employee: { firstName: { contains: search } } },
      { employee: { fileNumber: { contains: search } } },
      { employee: { cuil: { contains: search } } },
    ];
  }

  const [totalCount, embargoes] = await Promise.all([
    tenantPrisma.employeeEmbargo.count({ where }),
    tenantPrisma.employeeEmbargo.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            fileNumber: true,
            lastName: true,
            firstName: true,
            cuil: true,
            status: true,
          },
        },
        concepts: {
          include: {
            concept: {
              select: {
                id: true,
                code: true,
                name: true,
                type: true,
                periodType: true,
                arcaConceptCode: true,
                isEmbargo: true,
              },
            },
          },
        },
      },
      orderBy: [{ priorityOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  // Calcular acumulado histórico y saldo para cada embargo
  const embargoesWithBalances = await Promise.all(
    embargoes.map(async (embargo) => {
      const conceptIds = embargo.concepts.map((c) => c.conceptId);
      let accumulatedAmount = 0;

      if (conceptIds.length > 0) {
        const items = await tenantPrisma.paySlipItem.findMany({
          where: {
            conceptId: { in: conceptIds },
            paySlip: {
              employeeId: embargo.employeeId,
              deletedAt: null,
            },
          },
          select: {
            amount: true,
          },
        });

        accumulatedAmount = items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
      }

      const totalAmount = embargo.totalAmount !== null ? Number(embargo.totalAmount) : null;
      const remainingBalance = embargo.hasCap && totalAmount !== null
        ? Math.max(0, Number((totalAmount - accumulatedAmount).toFixed(2)))
        : null;

      const progressPercent = embargo.hasCap && totalAmount && totalAmount > 0
        ? Math.min(100, Math.round((accumulatedAmount / totalAmount) * 100))
        : null;

      return {
        ...embargo,
        totalAmount,
        accumulatedAmount: Number(accumulatedAmount.toFixed(2)),
        remainingBalance,
        progressPercent,
      };
    })
  );

  // Estadísticas globales del panel
  const allActiveEmbargoes = await tenantPrisma.employeeEmbargo.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      hasCap: true,
      totalAmount: true,
      embargoType: true,
    },
  });

  const stats = {
    totalActive: allActiveEmbargoes.length,
    totalCappedDebt: allActiveEmbargoes
      .filter((e) => e.hasCap && e.totalAmount)
      .reduce((sum, e) => sum + Number(e.totalAmount), 0),
    totalAlimony: allActiveEmbargoes.filter((e) => e.embargoType === 'ALIMENTARIO').length,
  };

  return {
    embargoes: embargoesWithBalances,
    pagination: {
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 1,
    },
    stats,
  };
}

export async function getEmbargoById(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const embargo = await tenantPrisma.employeeEmbargo.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true,
          fileNumber: true,
          lastName: true,
          firstName: true,
          cuil: true,
          status: true,
        },
      },
      concepts: {
        include: {
          concept: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
              periodType: true,
              arcaConceptCode: true,
              isEmbargo: true,
            },
          },
        },
      },
    },
  });

  if (!embargo) {
    const err = new Error('El embargo judicial solicitado no existe');
    err.status = 404;
    throw err;
  }

  const conceptIds = embargo.concepts.map((c) => c.conceptId);
  let accumulatedAmount = 0;

  if (conceptIds.length > 0) {
    const items = await tenantPrisma.paySlipItem.findMany({
      where: {
        conceptId: { in: conceptIds },
        paySlip: {
          employeeId: embargo.employeeId,
          deletedAt: null,
        },
      },
      select: { amount: true },
    });
    accumulatedAmount = items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  }

  const totalAmount = embargo.totalAmount !== null ? Number(embargo.totalAmount) : null;
  const remainingBalance = embargo.hasCap && totalAmount !== null
    ? Math.max(0, Number((totalAmount - accumulatedAmount).toFixed(2)))
    : null;

  return {
    ...embargo,
    totalAmount,
    accumulatedAmount: Number(accumulatedAmount.toFixed(2)),
    remainingBalance,
  };
}

export async function createEmbargo(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const employee = await tenantPrisma.employee.findUnique({
    where: { id: data.employeeId },
  });
  if (!employee) {
    const err = new Error('El colaborador seleccionado no existe');
    err.status = 404;
    throw err;
  }

  const concepts = await tenantPrisma.concept.findMany({
    where: { id: { in: data.conceptIds } },
  });
  if (concepts.length === 0) {
    const err = new Error('Debe seleccionar al menos un concepto válido');
    err.status = 400;
    throw err;
  }

  const hasCap = Boolean(data.hasCap);
  const totalAmount = hasCap ? Number(data.totalAmount) : null;

  const created = await tenantPrisma.$transaction(async (tx) => {
    // 1. Crear el legajo del embargo
    const embargo = await tx.employeeEmbargo.create({
      data: {
        employeeId: data.employeeId,
        caseTitle: data.caseTitle.trim(),
        dossierNumber: data.dossierNumber ? data.dossierNumber.trim() : null,
        court: data.court ? data.court.trim() : null,
        secretary: data.secretary ? data.secretary.trim() : null,
        judicialDistrict: data.judicialDistrict ? data.judicialDistrict.trim() : null,
        embargoType: data.embargoType || 'COMERCIAL',
        hasCap,
        totalAmount,
        priorityOrder: data.priorityOrder ? Number(data.priorityOrder) : 1,
        status: data.status || 'ACTIVE',
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        endDate: data.endDate ? new Date(data.endDate) : null,
        notes: data.notes ? data.notes.trim() : null,
        concepts: {
          create: data.conceptIds.map((cId) => ({ conceptId: cId })),
        },
      },
      include: {
        employee: true,
        concepts: {
          include: { concept: true },
        },
      },
    });

    // 2. Asegurar asignación activa en EmployeeConcept (novedades persistentes del empleado)
    for (const cId of data.conceptIds) {
      const existingAssignment = await tx.employeeConcept.findFirst({
        where: {
          employeeId: data.employeeId,
          conceptId: cId,
        },
      });

      if (!existingAssignment) {
        await tx.employeeConcept.create({
          data: {
            employeeId: data.employeeId,
            conceptId: cId,
            isActive: true,
            notes: `Embargo: ${data.caseTitle.trim()}`,
          },
        });
      } else if (!existingAssignment.isActive) {
        await tx.employeeConcept.update({
          where: { id: existingAssignment.id },
          data: { isActive: true },
        });
      }
    }

    return embargo;
  });

  return created;
}

export async function updateEmbargo(tenantPrisma, id, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const existing = await tenantPrisma.employeeEmbargo.findUnique({
    where: { id },
    include: { concepts: true },
  });
  if (!existing) {
    const err = new Error('El embargo judicial solicitado no existe');
    err.status = 404;
    throw err;
  }

  const hasCap = data.hasCap !== undefined ? Boolean(data.hasCap) : existing.hasCap;
  let totalAmount = existing.totalAmount;
  if (data.totalAmount !== undefined) {
    totalAmount = hasCap ? Number(data.totalAmount) : null;
  } else if (!hasCap) {
    totalAmount = null;
  }

  const updated = await tenantPrisma.$transaction(async (tx) => {
    // 1. Si se proporcionan nuevos conceptIds, sincronizar la relación
    if (data.conceptIds && Array.isArray(data.conceptIds)) {
      await tx.employeeEmbargoConcept.deleteMany({
        where: { embargoId: id },
      });

      await tx.employeeEmbargoConcept.createMany({
        data: data.conceptIds.map((cId) => ({
          embargoId: id,
          conceptId: cId,
        })),
      });

      // Asegurar que estén activos en el legajo del empleado
      for (const cId of data.conceptIds) {
        const assigned = await tx.employeeConcept.findFirst({
          where: { employeeId: existing.employeeId, conceptId: cId },
        });
        if (!assigned) {
          await tx.employeeConcept.create({
            data: {
              employeeId: existing.employeeId,
              conceptId: cId,
              isActive: true,
              notes: `Embargo: ${data.caseTitle || existing.caseTitle}`,
            },
          });
        } else if (!assigned.isActive) {
          await tx.employeeConcept.update({
            where: { id: assigned.id },
            data: { isActive: true },
          });
        }
      }
    }

    // 2. Si el embargo se pasa a CANCELLED o COMPLETED, podemos desactivar los EmployeeConcept si ya no aplican
    if (data.status === 'COMPLETED' || data.status === 'CANCELLED') {
      const conceptsToDeactivate = data.conceptIds || existing.concepts.map((c) => c.conceptId);
      await tx.employeeConcept.updateMany({
        where: {
          employeeId: existing.employeeId,
          conceptId: { in: conceptsToDeactivate },
        },
        data: { isActive: false },
      });
    } else if (data.status === 'ACTIVE') {
      const conceptsToActivate = data.conceptIds || existing.concepts.map((c) => c.conceptId);
      await tx.employeeConcept.updateMany({
        where: {
          employeeId: existing.employeeId,
          conceptId: { in: conceptsToActivate },
        },
        data: { isActive: true },
      });
    }

    const res = await tx.employeeEmbargo.update({
      where: { id },
      data: {
        caseTitle: data.caseTitle !== undefined ? data.caseTitle.trim() : existing.caseTitle,
        dossierNumber: data.dossierNumber !== undefined ? (data.dossierNumber ? data.dossierNumber.trim() : null) : existing.dossierNumber,
        court: data.court !== undefined ? (data.court ? data.court.trim() : null) : existing.court,
        secretary: data.secretary !== undefined ? (data.secretary ? data.secretary.trim() : null) : existing.secretary,
        judicialDistrict: data.judicialDistrict !== undefined ? (data.judicialDistrict ? data.judicialDistrict.trim() : null) : existing.judicialDistrict,
        embargoType: data.embargoType !== undefined ? data.embargoType : existing.embargoType,
        hasCap,
        totalAmount,
        priorityOrder: data.priorityOrder !== undefined ? Number(data.priorityOrder) : existing.priorityOrder,
        status: data.status !== undefined ? data.status : existing.status,
        startDate: data.startDate !== undefined ? (data.startDate ? new Date(data.startDate) : null) : existing.startDate,
        endDate: data.endDate !== undefined ? (data.endDate ? new Date(data.endDate) : null) : existing.endDate,
        notes: data.notes !== undefined ? (data.notes ? data.notes.trim() : null) : existing.notes,
      },
      include: {
        employee: true,
        concepts: {
          include: { concept: true },
        },
      },
    });

    return res;
  });

  return updated;
}

export async function deleteEmbargo(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const embargo = await tenantPrisma.employeeEmbargo.findUnique({
    where: { id },
    include: { concepts: true },
  });
  if (!embargo) {
    const err = new Error('El embargo judicial solicitado no existe');
    err.status = 404;
    throw err;
  }

  const conceptIds = embargo.concepts.map((c) => c.conceptId);
  const itemsCount = await tenantPrisma.paySlipItem.count({
    where: {
      conceptId: { in: conceptIds },
      paySlip: { employeeId: embargo.employeeId },
    },
  });

  if (itemsCount > 0) {
    // Si ya tiene recibos emitidos con retenciones, no se borra físicamente para no romper auditoría contable
    const updated = await tenantPrisma.employeeEmbargo.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    return {
      message: 'El embargo posee liquidaciones históricas emitidas. Se ha marcado su estado como CANCELADO.',
      embargo: updated,
    };
  }

  await tenantPrisma.employeeEmbargo.delete({
    where: { id },
  });

  return { message: 'Embargo judicial eliminado correctamente.' };
}

export async function getEmbargoDeductionHistory(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const embargo = await tenantPrisma.employeeEmbargo.findUnique({
    where: { id },
    include: {
      employee: {
        select: { id: true, fileNumber: true, lastName: true, firstName: true },
      },
      concepts: {
        include: { concept: true },
      },
    },
  });
  if (!embargo) {
    const err = new Error('El embargo judicial solicitado no existe');
    err.status = 404;
    throw err;
  }

  const conceptIds = embargo.concepts.map((c) => c.conceptId);
  if (conceptIds.length === 0) {
    return { embargo, history: [] };
  }

  const items = await tenantPrisma.paySlipItem.findMany({
    where: {
      conceptId: { in: conceptIds },
      paySlip: {
        employeeId: embargo.employeeId,
        deletedAt: null,
      },
    },
    include: {
      paySlip: {
        select: {
          id: true,
          status: true,
          payrollPeriod: {
            select: {
              id: true,
              settlementName: true,
              year: true,
              month: true,
              periodType: true,
              settlementNumber: true,
            },
          },
        },
      },
    },
    orderBy: [
      { paySlip: { payrollPeriod: { year: 'asc' } } },
      { paySlip: { payrollPeriod: { month: 'asc' } } },
      { paySlip: { payrollPeriod: { settlementNumber: 'asc' } } },
    ],
  });

  let runningAccumulated = 0;
  const totalAmount = embargo.totalAmount !== null ? Number(embargo.totalAmount) : null;

  const history = items.map((it) => {
    const amount = Number(it.amount || 0);
    runningAccumulated += amount;
    const balance = embargo.hasCap && totalAmount !== null
      ? Math.max(0, Number((totalAmount - runningAccumulated).toFixed(2)))
      : null;

    return {
      itemId: it.id,
      amount,
      runningAccumulated: Number(runningAccumulated.toFixed(2)),
      remainingBalance: balance,
      conceptCode: it.conceptCode,
      conceptName: it.conceptName,
      periodType: it.paySlip?.payrollPeriod?.periodType,
      periodName: it.paySlip?.payrollPeriod?.settlementName || `Período ${it.paySlip?.payrollPeriod?.month}/${it.paySlip?.payrollPeriod?.year}`,
      periodYear: it.paySlip?.payrollPeriod?.year,
      periodMonth: it.paySlip?.payrollPeriod?.month,
      settlementNumber: it.paySlip?.payrollPeriod?.settlementNumber,
      paySlipStatus: it.paySlip?.status,
    };
  });

  return {
    embargo: {
      id: embargo.id,
      caseTitle: embargo.caseTitle,
      court: embargo.court,
      hasCap: embargo.hasCap,
      totalAmount,
      accumulatedAmount: Number(runningAccumulated.toFixed(2)),
      remainingBalance: embargo.hasCap && totalAmount !== null
        ? Math.max(0, Number((totalAmount - runningAccumulated).toFixed(2)))
        : null,
      status: embargo.status,
      employee: embargo.employee,
    },
    history,
  };
}
