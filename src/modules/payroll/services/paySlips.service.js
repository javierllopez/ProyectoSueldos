import { ensureTenantPayrollSchema } from '../../../services/tenantProvisioner.service.js';
import { hydratePaySlips } from '../../../services/arcaCatalog.service.js';


// --- RECIBOS DE SUELDO ---

export async function getPaySlips(tenantPrisma, periodId, { search = '', page = 1, limit = 5, departmentId }) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const take = Math.max(1, Math.min(Number(limit) || 5, 10000));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = {
    payrollPeriodId: periodId,
    deletedAt: null,
  };

  if (departmentId) {
    where.employee = { departmentId };
  }

  if (search) {
    where.employee = {
      ...(where.employee || {}),
      OR: [
        { fileNumber: { contains: search } },
        { lastName: { contains: search } },
        { firstName: { contains: search } },
        { cuil: { contains: search } },
      ],
    };
  }

  const [total, slips] = await Promise.all([
    tenantPrisma.paySlip.count({ where }),
    tenantPrisma.paySlip.findMany({
      where,
      skip,
      take,
      orderBy: { employee: { lastName: 'asc' } },
      include: {
        payrollPeriod: {
          select: {
            id: true,
            status: true,
            settlementName: true,
          },
        },
        employee: {
          include: {
            department: true,
            jobPosition: true,
            healthInsurance: true,
            union: true,
          },
        },
      },
    }),
  ]);

  return {
    data: slips,
    meta: {
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}

export async function getBatchPaySlipsForPrint(tenantPrisma, periodId, { departmentId, search } = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const period = await tenantPrisma.payrollPeriod.findUnique({
    where: { id: periodId },
  });

  if (!period) {
    const err = new Error('La liquidación solicitada no existe');
    err.status = 404;
    throw err;
  }

  const companyProfile = await tenantPrisma.companyProfile.findFirst({
    where: { deletedAt: null },
  });

  const where = {
    payrollPeriodId: periodId,
    deletedAt: null,
  };

  if (departmentId && departmentId !== 'ALL') {
    where.employee = { departmentId };
  }

  if (search && String(search).trim()) {
    const term = String(search).trim();
    where.employee = {
      ...(where.employee || {}),
      OR: [
        { fileNumber: { contains: term } },
        { lastName: { contains: term } },
        { firstName: { contains: term } },
        { cuil: { contains: term } },
      ],
    };
  }

  const rawSlips = await tenantPrisma.paySlip.findMany({
    where,
    orderBy: { employee: { lastName: 'asc' } },
    include: {
      payrollPeriod: true,
      basis: true,
      items: {
        orderBy: { conceptCode: 'asc' },
      },
      employee: {
        include: {
          department: true,
          jobPosition: true,
          healthInsurance: true,
          union: true,
        },
      },
    },
  });

  const slips = await hydratePaySlips(rawSlips);

  const typePriority = {
    REMUNERATIVE: 1,
    NON_REMUNERATIVE: 2,
    DEDUCTION: 3,
    AUXILIARY: 4,
  };

  for (const s of slips) {
    if (Array.isArray(s.items)) {
      s.items.sort((a, b) => {
        const pA = typePriority[a.type] || 99;
        const pB = typePriority[b.type] || 99;
        if (pA !== pB) return pA - pB;
        return String(a.conceptCode).localeCompare(String(b.conceptCode), undefined, { numeric: true });
      });
    }
  }

  return {
    period,
    company: companyProfile,
    slips,
  };
}

export async function getPaySlipDetail(tenantPrisma, slipId) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const rawSlip = await tenantPrisma.paySlip.findUnique({
    where: { id: slipId },
    include: {
      payrollPeriod: true,
      basis: true,
      items: {
        orderBy: { conceptCode: 'asc' },
      },
      employee: {
        include: {
          department: true,
          jobPosition: true,
          healthInsurance: true,
          union: true,
          relatives: {
            where: { deletedAt: null },
            include: { kinship: true },
          },
        },
      },
    },
  });

  if (!rawSlip) {
    const err = new Error('El recibo solicitado no existe');
    err.status = 404;
    throw err;
  }

  const [slip] = await hydratePaySlips([rawSlip]);

  // Obtener perfil de la empresa
  const companyProfile = await tenantPrisma.companyProfile.findFirst({
    where: { deletedAt: null },
  });

  // Organizar items en bloques según normativa Decreto 407/2026 y auditoría
  const typePriority = {
    REMUNERATIVE: 1,
    NON_REMUNERATIVE: 2,
    DEDUCTION: 3,
    AUXILIARY: 4,
  };
  slip.items.sort((a, b) => {
    const pA = typePriority[a.type] || 99;
    const pB = typePriority[b.type] || 99;
    if (pA !== pB) return pA - pB;
    return String(a.conceptCode).localeCompare(String(b.conceptCode), undefined, { numeric: true });
  });

  const remunerativeItems = slip.items.filter((i) => i.type === 'REMUNERATIVE');
  const nonRemunerativeItems = slip.items.filter((i) => i.type === 'NON_REMUNERATIVE');
  const deductionItems = slip.items.filter((i) => i.type === 'DEDUCTION');
  const auxiliaryItems = slip.items.filter((i) => i.type === 'AUXILIARY');
  const visibleItems = slip.items.filter((i) => i.type !== 'AUXILIARY');
  const allItems = slip.items;

  const costDistribution = {
    netPercentage: Number(slip.pctNetSalary) || 0,
    deductionsPercentage: Number(slip.pctEmployeeDeductions) || 0,
    employerContributionsPercentage:
      Math.round(
        ((Number(slip.pctSocialSecurityContrib) || 0) +
          (Number(slip.pctHealthContrib) || 0) +
          (Number(slip.pctArtAndInsurance) || 0) +
          (Number(slip.pctUnionAndChambers) || 0)) *
          100
      ) / 100,
    distribution: [
      { name: 'Sueldo Neto de Bolsillo', percentage: Number(slip.pctNetSalary) || 0, color: '#2fb344' },
      { name: 'Retenciones al Trabajador', percentage: Number(slip.pctEmployeeDeductions) || 0, color: '#f59f00' },
      { name: 'Seguridad Social Patronal', percentage: Number(slip.pctSocialSecurityContrib) || 0, color: '#4263eb' },
      { name: 'Obra Social Patronal', percentage: Number(slip.pctHealthContrib) || 0, color: '#206bc4' },
      { name: 'ART y Seguros Patronales', percentage: Number(slip.pctArtAndInsurance) || 0, color: '#d63939' },
      { name: 'Sindicato Patronal', percentage: Number(slip.pctUnionAndChambers) || 0, color: '#74b816' },
    ],
  };

  return {
    ...slip,
    slip,
    netSalaryWords: slip.netSalaryWords,
    company: companyProfile,
    breakdown: {
      remunerativeItems,
      nonRemunerativeItems,
      deductionItems,
      auxiliaryItems,
      visibleItems,
      allItems,
    },
    costDistribution,
  };
}

export async function updatePaySlipWorkedDays(tenantPrisma, slipId, workedDays) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const slip = await tenantPrisma.paySlip.findUnique({
    where: { id: slipId },
    include: {
      payrollPeriod: {
        include: { fiscalPeriod: true },
      },
    },
  });

  if (!slip || slip.deletedAt) {
    const err = new Error('Recibo de sueldo no encontrado');
    err.status = 404;
    throw err;
  }

  if (
    slip.status === 'CLOSED' ||
    slip.payrollPeriod?.status === 'CLOSED' ||
    slip.payrollPeriod?.fiscalPeriod?.status === 'CLOSED'
  ) {
    const err = new Error('No es posible modificar días trabajados de una liquidación o recibo cerrado legalmente');
    err.status = 400;
    throw err;
  }

  const days = Math.max(0, Math.min(30, Math.round(Number(workedDays) || 0)));

  return tenantPrisma.paySlip.update({
    where: { id: slipId },
    data: { workedDays: days },
  });
}

/**
 * Elimina un recibo de sueldo individual de una liquidación abierta.
 * Si la liquidación está cerrada, arroja Error 400.
 * Actualiza automáticamente los totales del período.
 */
export async function deletePaySlip(tenantPrisma, slipId) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const slip = await tenantPrisma.paySlip.findUnique({
    where: { id: slipId },
    include: {
      payrollPeriod: {
        include: { fiscalPeriod: true },
      },
      employee: {
        select: { id: true, fileNumber: true, firstName: true, lastName: true },
      },
    },
  });

  if (!slip || slip.deletedAt) {
    const err = new Error('Recibo de sueldo no encontrado');
    err.status = 404;
    throw err;
  }

  if (
    slip.status === 'CLOSED' ||
    slip.payrollPeriod?.status === 'CLOSED' ||
    slip.payrollPeriod?.fiscalPeriod?.status === 'CLOSED'
  ) {
    const err = new Error('No es posible eliminar recibos de una liquidación o recibo cerrado legalmente');
    err.status = 400;
    throw err;
  }

  const periodId = slip.payrollPeriodId;

  await tenantPrisma.$transaction(async (tx) => {
    await tx.paySlipBasis.deleteMany({ where: { paySlipId: slipId } });
    await tx.paySlipItem.deleteMany({ where: { paySlipId: slipId } });
    await tx.paySlip.delete({ where: { id: slipId } });

    const remainingSlipsCount = await tx.paySlip.count({
      where: { payrollPeriodId: periodId, deletedAt: null },
    });
    const periodTotals = await tx.paySlip.aggregate({
      where: { payrollPeriodId: periodId, deletedAt: null },
      _sum: {
        grossSalary: true,
        netSalary: true,
        totalLaborCost: true,
      },
    });

    const updateData = {
      totalGross: periodTotals._sum.grossSalary || 0,
      totalNet: periodTotals._sum.netSalary || 0,
      totalEmployerCost: periodTotals._sum.totalLaborCost || 0,
    };
    if (remainingSlipsCount === 0) {
      updateData.status = 'DRAFT';
    }

    await tx.payrollPeriod.update({
      where: { id: periodId },
      data: updateData,
    });
  });

  return {
    success: true,
    message: `Recibo de sueldo del colaborador ${slip.employee?.lastName || ''}, ${slip.employee?.firstName || ''} (Legajo ${slip.employee?.fileNumber || '-'}) eliminado exitosamente`,
  };
}
