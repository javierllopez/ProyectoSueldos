import crypto from 'crypto';
import { ensureTenantPersonnelSchema } from '../../services/tenantProvisioner.service.js';

// --- OBRAS SOCIALES (HEALTH INSURANCES) ---

export async function listHealthInsurances(tenantPrisma) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const list = await tenantPrisma.healthInsurance.findMany({
    where: { deletedAt: null },
    include: {
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  return list.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    employeeCount: item._count.employees,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
}

export async function getHealthInsuranceById(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const item = await tenantPrisma.healthInsurance.findFirst({
    where: { id, deletedAt: null },
    include: {
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
    },
  });

  if (!item) {
    const error = new Error('Obra Social no encontrada');
    error.status = 404;
    throw error;
  }

  return {
    ...item,
    employeeCount: item._count.employees,
  };
}

export async function createHealthInsurance(tenantPrisma, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  return tenantPrisma.healthInsurance.create({
    data: {
      id: crypto.randomUUID(),
      name: data.name,
      code: data.code || null,
    },
  });
}

export async function updateHealthInsurance(tenantPrisma, id, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getHealthInsuranceById(tenantPrisma, id);

  return tenantPrisma.healthInsurance.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.code !== undefined ? { code: data.code } : {}),
    },
  });
}

export async function deleteHealthInsurance(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getHealthInsuranceById(tenantPrisma, id);

  return tenantPrisma.healthInsurance.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// --- SINDICATOS Y MUTUALES (UNIONS & MUTUALS) ---

const conceptSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  calculationType: true,
  periodType: true,
  defaultValue: true,
  arcaConceptCode: true,
};

async function validateDeductionConcepts(tenantPrisma, conceptIds, entityLabel) {
  if (!conceptIds) return [];
  const rawList = Array.isArray(conceptIds) ? conceptIds : [conceptIds];
  const cleanIds = Array.from(new Set(rawList.map((id) => String(id || '').trim()).filter(Boolean)));
  if (cleanIds.length === 0) return [];

  const concepts = await tenantPrisma.concept.findMany({
    where: { id: { in: cleanIds }, deletedAt: null },
  });

  if (concepts.length !== cleanIds.length) {
    const foundIds = new Set(concepts.map((c) => c.id));
    const missing = cleanIds.find((id) => !foundIds.has(id));
    const error = new Error(`El concepto de sueldos '${missing}' seleccionado no existe`);
    error.status = 400;
    throw error;
  }

  for (const c of concepts) {
    if (c.type !== 'DEDUCTION') {
      const error = new Error(`El concepto ${c.code} - ${c.name} para ${entityLabel} debe ser de tipo Descuento (DEDUCTION)`);
      error.status = 400;
      throw error;
    }
  }

  return cleanIds;
}

async function propagateAffiliationConceptsToEmployees(tenantPrisma, {
  fieldName,
  entityId,
  entityName,
  newConceptIds = [],
  previousConceptIds = [],
}) {
  const affiliatedEmployees = await tenantPrisma.employee.findMany({
    where: { [fieldName]: entityId, deletedAt: null },
    select: { id: true },
  });

  const removedConceptIds = previousConceptIds.filter((id) => !newConceptIds.includes(id));

  for (const emp of affiliatedEmployees) {
    // 1. Asegurar conceptos activos asignados
    for (const conceptId of newConceptIds) {
      const existing = await tenantPrisma.employeeConcept.findUnique({
        where: {
          employeeId_conceptId: {
            employeeId: emp.id,
            conceptId,
          },
        },
      });
      if (!existing) {
        await tenantPrisma.employeeConcept.create({
          data: {
            id: crypto.randomUUID(),
            employeeId: emp.id,
            conceptId,
            amount: null,
            units: null,
            notes: `Afiliación a ${entityName}`,
            isActive: true,
          },
        });
      } else if (!existing.isActive) {
        await tenantPrisma.employeeConcept.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
      }
    }

    // 2. Desasignar conceptos removidos aplicando Opción B
    for (const oldConceptId of removedConceptIds) {
      const inClosedPaySlip = await tenantPrisma.paySlipItem.findFirst({
        where: {
          conceptId: oldConceptId,
          paySlip: {
            employeeId: emp.id,
            status: { in: ['ISSUED', 'SIGNED'] },
            payrollPeriod: { status: 'CLOSED' },
          },
        },
      });
      if (!inClosedPaySlip) {
        await tenantPrisma.employeeConcept.deleteMany({
          where: { employeeId: emp.id, conceptId: oldConceptId },
        });
      } else {
        await tenantPrisma.employeeConcept.updateMany({
          where: { employeeId: emp.id, conceptId: oldConceptId },
          data: { isActive: false },
        });
      }
    }
  }
}

function formatUnionResponse(item) {
  const concepts = (item.unionConcepts && item.unionConcepts.length > 0)
    ? item.unionConcepts.map((uc) => uc.concept).filter(Boolean)
    : (item.concept ? [item.concept] : []);
  const conceptIds = (item.unionConcepts && item.unionConcepts.length > 0)
    ? item.unionConcepts.map((uc) => uc.conceptId)
    : (item.conceptId ? [item.conceptId] : []);
  const primaryConcept = concepts[0] || item.concept || null;
  const primaryConceptId = conceptIds[0] || item.conceptId || null;

  return {
    id: item.id,
    name: item.name,
    code: item.code,
    conceptId: primaryConceptId,
    concept: primaryConcept,
    conceptIds,
    concepts,
    employeeCount: item._count?.employees ?? 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function formatMutualResponse(item) {
  const concepts = (item.mutualConcepts && item.mutualConcepts.length > 0)
    ? item.mutualConcepts.map((mc) => mc.concept).filter(Boolean)
    : (item.concept ? [item.concept] : []);
  const conceptIds = (item.mutualConcepts && item.mutualConcepts.length > 0)
    ? item.mutualConcepts.map((mc) => mc.conceptId)
    : (item.conceptId ? [item.conceptId] : []);
  const primaryConcept = concepts[0] || item.concept || null;
  const primaryConceptId = conceptIds[0] || item.conceptId || null;

  return {
    id: item.id,
    name: item.name,
    code: item.code,
    conceptId: primaryConceptId,
    concept: primaryConcept,
    conceptIds,
    concepts,
    employeeCount: item._count?.employees ?? 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

// --- SINDICATOS (UNIONS) ---

export async function listUnions(tenantPrisma) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const list = await tenantPrisma.union.findMany({
    where: { deletedAt: null },
    include: {
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
      concept: { select: conceptSelect },
      unionConcepts: {
        include: { concept: { select: conceptSelect } },
      },
    },
    orderBy: { name: 'asc' },
  });

  return list.map(formatUnionResponse);
}

export async function getUnionById(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const item = await tenantPrisma.union.findFirst({
    where: { id, deletedAt: null },
    include: {
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
      concept: { select: conceptSelect },
      unionConcepts: {
        include: { concept: { select: conceptSelect } },
      },
    },
  });

  if (!item) {
    const error = new Error('Sindicato no encontrado');
    error.status = 404;
    throw error;
  }

  return formatUnionResponse(item);
}

export async function createUnion(tenantPrisma, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const rawConceptIds = data.conceptIds !== undefined
    ? data.conceptIds
    : (data.conceptId ? [data.conceptId] : []);
  const validConceptIds = await validateDeductionConcepts(tenantPrisma, rawConceptIds, 'el sindicato');
  const primaryConceptId = validConceptIds[0] || null;

  const unionId = crypto.randomUUID();
  const created = await tenantPrisma.$transaction(async (tx) => {
    await tx.union.create({
      data: {
        id: unionId,
        name: data.name,
        code: data.code || null,
        conceptId: primaryConceptId,
      },
    });

    if (validConceptIds.length > 0) {
      await tx.unionConcept.createMany({
        data: validConceptIds.map((cId) => ({
          id: crypto.randomUUID(),
          unionId,
          conceptId: cId,
        })),
      });
    }

    return tx.union.findUnique({
      where: { id: unionId },
      include: {
        _count: { select: { employees: { where: { deletedAt: null } } } },
        concept: { select: conceptSelect },
        unionConcepts: { include: { concept: { select: conceptSelect } } },
      },
    });
  });

  return formatUnionResponse(created);
}

export async function updateUnion(tenantPrisma, id, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const current = await getUnionById(tenantPrisma, id);

  const hasConceptUpdate = data.conceptIds !== undefined || data.conceptId !== undefined;
  let validConceptIds = current.conceptIds || [];
  if (hasConceptUpdate) {
    const rawConceptIds = data.conceptIds !== undefined
      ? data.conceptIds
      : (data.conceptId ? [data.conceptId] : []);
    validConceptIds = await validateDeductionConcepts(tenantPrisma, rawConceptIds, 'el sindicato');
  }
  const primaryConceptId = hasConceptUpdate ? (validConceptIds[0] || null) : current.conceptId;

  const updated = await tenantPrisma.$transaction(async (tx) => {
    const updatePayload = {};
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.code !== undefined) updatePayload.code = data.code || null;
    if (hasConceptUpdate) updatePayload.conceptId = primaryConceptId;

    await tx.union.update({
      where: { id },
      data: updatePayload,
    });

    if (hasConceptUpdate) {
      await tx.unionConcept.deleteMany({ where: { unionId: id } });
      if (validConceptIds.length > 0) {
        await tx.unionConcept.createMany({
          data: validConceptIds.map((cId) => ({
            id: crypto.randomUUID(),
            unionId: id,
            conceptId: cId,
          })),
        });
      }
    }

    return tx.union.findUnique({
      where: { id },
      include: {
        _count: { select: { employees: { where: { deletedAt: null } } } },
        concept: { select: conceptSelect },
        unionConcepts: { include: { concept: { select: conceptSelect } } },
      },
    });
  });

  if (data.applyToEmployees) {
    await propagateAffiliationConceptsToEmployees(tenantPrisma, {
      fieldName: 'unionId',
      entityId: id,
      entityName: updated.name,
      newConceptIds: validConceptIds,
      previousConceptIds: current.conceptIds || [],
    });
  }

  return formatUnionResponse(updated);
}

export async function deleteUnion(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getUnionById(tenantPrisma, id);

  return tenantPrisma.union.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// --- MUTUALES (MUTUALS) ---

export async function listMutuals(tenantPrisma) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const list = await tenantPrisma.mutual.findMany({
    where: { deletedAt: null },
    include: {
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
      concept: { select: conceptSelect },
      mutualConcepts: {
        include: { concept: { select: conceptSelect } },
      },
    },
    orderBy: { name: 'asc' },
  });

  return list.map(formatMutualResponse);
}

export async function getMutualById(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const item = await tenantPrisma.mutual.findFirst({
    where: { id, deletedAt: null },
    include: {
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
      concept: { select: conceptSelect },
      mutualConcepts: {
        include: { concept: { select: conceptSelect } },
      },
    },
  });

  if (!item) {
    const error = new Error('Mutual no encontrada');
    error.status = 404;
    throw error;
  }

  return formatMutualResponse(item);
}

export async function createMutual(tenantPrisma, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const rawConceptIds = data.conceptIds !== undefined
    ? data.conceptIds
    : (data.conceptId ? [data.conceptId] : []);
  const validConceptIds = await validateDeductionConcepts(tenantPrisma, rawConceptIds, 'la mutual');
  const primaryConceptId = validConceptIds[0] || null;

  const mutualId = crypto.randomUUID();
  const created = await tenantPrisma.$transaction(async (tx) => {
    await tx.mutual.create({
      data: {
        id: mutualId,
        name: data.name,
        code: data.code || null,
        conceptId: primaryConceptId,
      },
    });

    if (validConceptIds.length > 0) {
      await tx.mutualConcept.createMany({
        data: validConceptIds.map((cId) => ({
          id: crypto.randomUUID(),
          mutualId,
          conceptId: cId,
        })),
      });
    }

    return tx.mutual.findUnique({
      where: { id: mutualId },
      include: {
        _count: { select: { employees: { where: { deletedAt: null } } } },
        concept: { select: conceptSelect },
        mutualConcepts: { include: { concept: { select: conceptSelect } } },
      },
    });
  });

  return formatMutualResponse(created);
}

export async function updateMutual(tenantPrisma, id, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const current = await getMutualById(tenantPrisma, id);

  const hasConceptUpdate = data.conceptIds !== undefined || data.conceptId !== undefined;
  let validConceptIds = current.conceptIds || [];
  if (hasConceptUpdate) {
    const rawConceptIds = data.conceptIds !== undefined
      ? data.conceptIds
      : (data.conceptId ? [data.conceptId] : []);
    validConceptIds = await validateDeductionConcepts(tenantPrisma, rawConceptIds, 'la mutual');
  }
  const primaryConceptId = hasConceptUpdate ? (validConceptIds[0] || null) : current.conceptId;

  const updated = await tenantPrisma.$transaction(async (tx) => {
    const updatePayload = {};
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.code !== undefined) updatePayload.code = data.code || null;
    if (hasConceptUpdate) updatePayload.conceptId = primaryConceptId;

    await tx.mutual.update({
      where: { id },
      data: updatePayload,
    });

    if (hasConceptUpdate) {
      await tx.mutualConcept.deleteMany({ where: { mutualId: id } });
      if (validConceptIds.length > 0) {
        await tx.mutualConcept.createMany({
          data: validConceptIds.map((cId) => ({
            id: crypto.randomUUID(),
            mutualId: id,
            conceptId: cId,
          })),
        });
      }
    }

    return tx.mutual.findUnique({
      where: { id },
      include: {
        _count: { select: { employees: { where: { deletedAt: null } } } },
        concept: { select: conceptSelect },
        mutualConcepts: { include: { concept: { select: conceptSelect } } },
      },
    });
  });

  if (data.applyToEmployees) {
    await propagateAffiliationConceptsToEmployees(tenantPrisma, {
      fieldName: 'mutualId',
      entityId: id,
      entityName: updated.name,
      newConceptIds: validConceptIds,
      previousConceptIds: current.conceptIds || [],
    });
  }

  return formatMutualResponse(updated);
}

export async function deleteMutual(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getMutualById(tenantPrisma, id);

  return tenantPrisma.mutual.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
