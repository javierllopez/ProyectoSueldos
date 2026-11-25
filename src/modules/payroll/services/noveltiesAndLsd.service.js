import crypto from 'crypto';
import { ensureTenantPayrollSchema } from '../../../services/tenantProvisioner.service.js';
import {
  generateLsdConceptsFile,
  generateLsdPayrollFile,
  validateLsdConsistency,
  generateMonthlyLsdPayrollFile,
  validateMonthlyLsdConsistency,
} from '../lsdExporter.service.js';
import {
  getPayrollSettings,
  getSettlementTypeMap,
  resolveSettlementTypeConfig,
} from './conceptsAndRules.service.js';
import { getPeriodById } from './periodsAndCalculation.service.js';

function isPeriodIncludedInLsd(periodType, stMap) {
  const key = String(periodType || 'MONTHLY').trim().toUpperCase();
  if (key === 'ALL') return true;
  const st = stMap.get(key);
  return st ? st.includeInLsd !== false : true;
}

// --- EXPORTACIÓN LIBRO DE SUELDOS DIGITAL (ARCA) ---

export async function exportLsdConcepts(tenantPrisma) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const [concepts, stMap] = await Promise.all([
    tenantPrisma.concept.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { code: 'asc' },
    }),
    getSettlementTypeMap(tenantPrisma),
  ]);

  const lsdConcepts = concepts.filter((c) => isPeriodIncludedInLsd(c.periodType, stMap));
  return generateLsdConceptsFile(lsdConcepts);
}

export async function exportLsdPayroll(tenantPrisma, periodId, company) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const [period, stMap] = await Promise.all([
    getPeriodById(tenantPrisma, periodId),
    getSettlementTypeMap(tenantPrisma),
  ]);

  const stConfig = stMap.get(String(period.periodType || 'MONTHLY').trim().toUpperCase());
  if (stConfig && stConfig.includeInLsd === false) {
    const err = new Error(
      `La liquidación "${period.settlementName || period.periodType}" corresponde al tipo "${stConfig.name}", que está excluido del Libro de Sueldos Digital ARCA.`
    );
    err.status = 400;
    throw err;
  }

  let companyProfile = company;
  if (!companyProfile?.cuit) {
    companyProfile = (await tenantPrisma.companyProfile.findFirst({ where: { deletedAt: null } })) || company || {};
  }

  const paySlips = await tenantPrisma.paySlip.findMany({
    where: { payrollPeriodId: periodId, deletedAt: null },
    include: {
      employee: {
        include: {
          department: true,
          jobPosition: true,
          healthInsurance: true,
          salaryScale: true,
          relatives: { where: { deletedAt: null }, include: { kinship: true } },
        },
      },
      items: { orderBy: { conceptCode: 'asc' } },
      basis: true,
    },
    orderBy: { employee: { fileNumber: 'asc' } },
  });

  if (paySlips.length === 0) {
    const err = new Error('La liquidación no tiene recibos calculados para exportar a ARCA');
    err.status = 400;
    throw err;
  }

  const payrollSettings = await getPayrollSettings(tenantPrisma);

  return generateLsdPayrollFile({
    company: companyProfile,
    period,
    paySlips,
    payrollSettings,
  });
}

export async function validateLsd(tenantPrisma, periodId) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const [period, stMap] = await Promise.all([
    getPeriodById(tenantPrisma, periodId),
    getSettlementTypeMap(tenantPrisma),
  ]);

  const stConfig = stMap.get(String(period.periodType || 'MONTHLY').trim().toUpperCase());
  if (stConfig && stConfig.includeInLsd === false) {
    return {
      isValid: true,
      errors: [],
      issues: [],
      warnings: [
        `El tipo de liquidación "${stConfig.name}" está excluido del Libro de Sueldos Digital ARCA.`,
      ],
      skipped: true,
    };
  }

  const paySlips = await tenantPrisma.paySlip.findMany({
    where: { payrollPeriodId: periodId, deletedAt: null },
    include: {
      employee: {
        include: {
          department: true,
          jobPosition: true,
          healthInsurance: true,
          salaryScale: true,
          relatives: { where: { deletedAt: null }, include: { kinship: true } },
        },
      },
      items: true,
      basis: true,
    },
    orderBy: { employee: { fileNumber: 'asc' } },
  });

  const payrollSettings = await getPayrollSettings(tenantPrisma);
  const companyProfile = await tenantPrisma.companyProfile.findFirst({ where: { deletedAt: null } });

  const allSettlements = await tenantPrisma.payrollPeriod.findMany({
    where: { year: period.year, month: period.month },
  });
  const settlements = allSettlements.filter((s) => isPeriodIncludedInLsd(s.periodType, stMap));

  return validateLsdConsistency({
    paySlips,
    payrollSettings,
    company: companyProfile || {},
    settlements,
  });
}

export async function getMonthlyLsdPeriods(tenantPrisma) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const [allPeriods, stMap] = await Promise.all([
    tenantPrisma.payrollPeriod.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { settlementNumber: 'asc' }],
      include: {
        _count: {
          select: { paySlips: { where: { deletedAt: null } } },
        },
      },
    }),
    getSettlementTypeMap(tenantPrisma),
  ]);

  const periods = allPeriods.filter((p) => isPeriodIncludedInLsd(p.periodType, stMap));

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  const typeLabels = {
    MONTHLY: 'Mensual',
    QUINCE_1: '1ra Quincena',
    QUINCE_2: '2da Quincena',
    SAC_1: '1er SAC',
    SAC_2: '2do SAC',
    VACATIONS: 'Vacaciones',
    FINAL: 'Final',
    RETROACTIVE: 'Retroactivo Paritario',
  };

  const groups = new Map();
  for (const p of periods) {
    const key = `${p.year}-${String(p.month).padStart(2, '0')}`;
    if (!groups.has(key)) {
      groups.set(key, {
        periodKey: key,
        year: p.year,
        month: p.month,
        monthName: monthNames[p.month - 1] || `Mes ${p.month}`,
        settlements: [],
        totalSlips: 0,
        hasOpen: false,
        allClosed: true,
      });
    }

    const grp = groups.get(key);
    const slipsCount = p._count?.paySlips || 0;
    grp.totalSlips += slipsCount;

    const isOpen = p.status !== 'CLOSED';
    if (isOpen) {
      grp.hasOpen = true;
      grp.allClosed = false;
    }

    grp.settlements.push({
      id: p.id,
      settlementName: p.settlementName,
      periodType: p.periodType,
      periodTypeLabel: stMap.get(String(p.periodType || '').toUpperCase())?.name || typeLabels[p.periodType] || p.periodType,
      settlementNumber: p.settlementNumber,
      settlementType: p.settlementType,
      status: p.status,
      liquidationDate: p.liquidationDate,
      paymentDate: p.paymentDate,
      slipsCount,
      totalGross: Number(p.totalGross || 0),
    });
  }

  return Array.from(groups.values()).map((grp) => {
    const typeNames = Array.from(new Set(grp.settlements.map((s) => s.periodTypeLabel || s.periodType))).join(', ');
    const count = grp.settlements.length;
    const openWarning = grp.hasOpen ? ' [Liquidación abierta]' : '';
    return {
      ...grp,
      label: `${grp.periodKey} | ${grp.monthName} ${grp.year} (${count} liq.: ${typeNames} - ${grp.totalSlips} recibos)${openWarning}`,
    };
  });
}

export async function getMonthlyLsdPreview(tenantPrisma, year, month) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const numYear = Number(year);
  const numMonth = Number(month);

  const [allSettlements, stMap] = await Promise.all([
    tenantPrisma.payrollPeriod.findMany({
      where: {
        year: numYear,
        month: numMonth,
      },
      orderBy: { settlementNumber: 'asc' },
      include: {
        _count: {
          select: { paySlips: { where: { deletedAt: null } } },
        },
      },
    }),
    getSettlementTypeMap(tenantPrisma),
  ]);

  if (allSettlements.length === 0) {
    const err = new Error(`No se registraron liquidaciones para el período ${String(numMonth).padStart(2, '0')}/${numYear}`);
    err.status = 404;
    throw err;
  }

  const settlements = allSettlements.filter((s) => isPeriodIncludedInLsd(s.periodType, stMap));
  if (settlements.length === 0) {
    const err = new Error(`Ninguna liquidación del período ${String(numMonth).padStart(2, '0')}/${numYear} está marcada para incluir en el Libro de Sueldos Digital ARCA`);
    err.status = 404;
    throw err;
  }

  const distinctEmployees = await tenantPrisma.paySlip.findMany({
    where: {
      payrollPeriodId: { in: settlements.map((s) => s.id) },
      deletedAt: null,
    },
    select: { employeeId: true },
    distinct: ['employeeId'],
  });

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  const typeLabels = {
    MONTHLY: 'Mensual',
    QUINCE_1: '1ra Quincena',
    QUINCE_2: '2da Quincena',
    SAC_1: '1er SAC (Junio)',
    SAC_2: '2do SAC (Diciembre)',
    VACATIONS: 'Vacaciones',
    FINAL: 'Liquidación Final',
    RETROACTIVE: 'Retroactivo Paritario',
  };

  const totalSlips = settlements.reduce((sum, s) => sum + (s._count?.paySlips || 0), 0);
  const totalGross = settlements.reduce((sum, s) => sum + Number(s.totalGross || 0), 0);
  const totalNet = settlements.reduce((sum, s) => sum + Number(s.totalNet || 0), 0);
  const hasOpen = settlements.some((s) => s.status !== 'CLOSED');

  let latestPaymentDate = null;
  for (const s of settlements) {
    const d = s.paymentDate || s.liquidationDate;
    if (d) {
      if (!latestPaymentDate || new Date(d) > new Date(latestPaymentDate)) {
        latestPaymentDate = d;
      }
    }
  }

  return {
    year: numYear,
    month: numMonth,
    periodKey: `${numYear}-${String(numMonth).padStart(2, '0')}`,
    monthName: monthNames[numMonth - 1] || `Mes ${numMonth}`,
    totalSettlements: settlements.length,
    totalSlips,
    uniqueEmployeesCount: distinctEmployees.length,
    totalGross: Math.round(totalGross * 100) / 100,
    totalNet: Math.round(totalNet * 100) / 100,
    hasOpen,
    latestPaymentDate,
    settlements: settlements.map((s) => ({
      id: s.id,
      settlementName: s.settlementName,
      periodType: s.periodType,
      periodTypeLabel: stMap.get(String(s.periodType || '').toUpperCase())?.name || typeLabels[s.periodType] || s.periodType,
      settlementNumber: s.settlementNumber,
      settlementType: s.settlementType,
      status: s.status,
      liquidationDate: s.liquidationDate,
      paymentDate: s.paymentDate,
      slipsCount: s._count?.paySlips || 0,
      totalGross: Number(s.totalGross || 0),
      totalNet: Number(s.totalNet || 0),
    })),
  };
}

export async function validateMonthlyLsd(tenantPrisma, year, month) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const numYear = Number(year);
  const numMonth = Number(month);

  const [allSettlements, stMap] = await Promise.all([
    tenantPrisma.payrollPeriod.findMany({
      where: { year: numYear, month: numMonth },
      orderBy: { settlementNumber: 'asc' },
    }),
    getSettlementTypeMap(tenantPrisma),
  ]);

  if (allSettlements.length === 0) {
    const err = new Error(`No hay liquidaciones para auditar en el período ${String(numMonth).padStart(2, '0')}/${numYear}`);
    err.status = 400;
    throw err;
  }

  const settlements = allSettlements.filter((s) => isPeriodIncludedInLsd(s.periodType, stMap));
  if (settlements.length === 0) {
    return {
      isValid: true,
      errors: [],
      issues: [],
      warnings: [
        `Las liquidaciones de ${String(numMonth).padStart(2, '0')}/${numYear} corresponden a tipos excluidos del Libro de Sueldos Digital ARCA.`,
      ],
      skipped: true,
    };
  }

  const periodIds = settlements.map((s) => s.id);
  const paySlips = await tenantPrisma.paySlip.findMany({
    where: {
      payrollPeriodId: { in: periodIds },
      deletedAt: null,
    },
    include: {
      payrollPeriod: true,
      employee: {
        include: {
          department: true,
          jobPosition: true,
          healthInsurance: true,
          salaryScale: true,
          relatives: { where: { deletedAt: null }, include: { kinship: true } },
        },
      },
      items: true,
      basis: true,
    },
    orderBy: { employee: { fileNumber: 'asc' } },
  });

  const payrollSettings = await getPayrollSettings(tenantPrisma);
  const companyProfile = await tenantPrisma.companyProfile.findFirst({ where: { deletedAt: null } });

  return validateMonthlyLsdConsistency({
    year: numYear,
    month: numMonth,
    settlements,
    paySlips,
    payrollSettings,
    company: companyProfile || {},
  });
}

export async function exportMonthlyLsdPayroll(tenantPrisma, year, month, company) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const numYear = Number(year);
  const numMonth = Number(month);

  let companyProfile = company;
  if (!companyProfile?.cuit) {
    companyProfile = (await tenantPrisma.companyProfile.findFirst({ where: { deletedAt: null } })) || company || {};
  }

  const [allSettlements, stMap] = await Promise.all([
    tenantPrisma.payrollPeriod.findMany({
      where: { year: numYear, month: numMonth },
      orderBy: { settlementNumber: 'asc' },
    }),
    getSettlementTypeMap(tenantPrisma),
  ]);

  if (allSettlements.length === 0) {
    const err = new Error(`No hay liquidaciones registradas para el período ${String(numMonth).padStart(2, '0')}/${numYear}`);
    err.status = 400;
    throw err;
  }

  const settlements = allSettlements.filter((s) => isPeriodIncludedInLsd(s.periodType, stMap));
  if (settlements.length === 0) {
    const err = new Error(`No hay liquidaciones incluidas en Libro de Sueldos Digital ARCA para el período ${String(numMonth).padStart(2, '0')}/${numYear}`);
    err.status = 400;
    throw err;
  }

  const periodIds = settlements.map((s) => s.id);
  const paySlips = await tenantPrisma.paySlip.findMany({
    where: {
      payrollPeriodId: { in: periodIds },
      deletedAt: null,
    },
    include: {
      payrollPeriod: true,
      employee: {
        include: {
          department: true,
          jobPosition: true,
          healthInsurance: true,
          salaryScale: true,
          relatives: { where: { deletedAt: null }, include: { kinship: true } },
        },
      },
      items: { orderBy: { conceptCode: 'asc' } },
      basis: true,
    },
    orderBy: [
      { employee: { fileNumber: 'asc' } },
      { payrollPeriod: { settlementNumber: 'asc' } },
    ],
  });

  if (paySlips.length === 0) {
    const err = new Error(`El período ${String(numMonth).padStart(2, '0')}/${numYear} no tiene recibos calculados para exportar a ARCA`);
    err.status = 400;
    throw err;
  }

  const payrollSettings = await getPayrollSettings(tenantPrisma);

  return generateMonthlyLsdPayrollFile({
    company: companyProfile,
    year: numYear,
    month: numMonth,
    settlements,
    paySlips,
    payrollSettings,
  });
}


// =====================================================================

function parseIdList(input) {
  if (!input) return [];
  const raw = Array.isArray(input) ? input : String(input).split(',');
  return Array.from(new Set(raw.map((x) => String(x || '').trim()).filter(Boolean)));
}

export async function listPeriodNovelties(tenantPrisma, periodId, { employeeId, conceptId, conceptIds } = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const where = { payrollPeriodId: periodId };
  if (employeeId) where.employeeId = employeeId;

  const multiConceptIds = parseIdList(conceptIds);
  if (conceptId) {
    const cid = String(conceptId).trim();
    if (multiConceptIds.length > 0) {
      if (!multiConceptIds.includes(cid)) multiConceptIds.push(cid);
    } else {
      where.conceptId = cid;
    }
  }
  if (multiConceptIds.length > 0) {
    where.conceptId = { in: multiConceptIds };
  }

  return tenantPrisma.periodNovelty.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          fileNumber: true,
          firstName: true,
          lastName: true,
          cuil: true,
          status: true,
          basicSalary: true,
          department: { select: { id: true, name: true } },
          jobPosition: { select: { id: true, name: true, categoryCode: true } },
        },
      },
      concept: true,
    },
    orderBy: [
      { employee: { lastName: 'asc' } },
      { concept: { code: 'asc' } },
    ],
  });
}

function resolveCanonicalPeriodFamily(periodType) {
  const upper = String(periodType || 'MONTHLY').trim().toUpperCase();
  if (upper === 'ALL') return 'ALL';
  if (upper === 'MONTHLY' || upper === 'MENSUAL') return 'MONTHLY';
  if (upper === 'QUINCE' || upper === 'QUINCENA' || upper === 'QUINCE_1' || upper === 'QUINCE_2') return 'QUINCE';
  if (upper === 'SAC' || upper === 'AGUINALDO' || upper === 'SAC_1' || upper === 'SAC_2') return 'SAC';
  if (upper === 'VACATIONS' || upper === 'VACACIONES') return 'VACATIONS';
  if (upper === 'FINAL' || upper === 'LIQUIDACION_FINAL') return 'FINAL';
  if (upper === 'RETROACTIVE' || upper === 'RETROACTIVO') return 'RETROACTIVE';
  return upper;
}

export function checkNoveltyConceptCompatibility(concept, period) {
  if (!concept || concept.deletedAt) {
    return { ok: false, message: 'El concepto especificado no existe' };
  }
  if (String(concept.scope || '').toUpperCase() !== 'INDIVIDUAL') {
    return {
      ok: false,
      message: `Solo pueden asignarse conceptos con alcance INDIVIDUAL. El concepto ${concept.code} es GENERAL.`,
    };
  }
  if (concept.isPersistent) {
    return {
      ok: false,
      message: `El concepto ${concept.code} (${concept.name}) es persistente. Debe gestionarse en Novedades Persistentes.`,
    };
  }
  if (String(concept.noveltyDataType || '').toUpperCase() === 'CALCULADO') {
    return {
      ok: false,
      message: `El concepto ${concept.code} (${concept.name}) es calculado automáticamente y no admite carga manual de novedades.`,
    };
  }

  const pType = String(period?.periodType || 'MONTHLY').trim().toUpperCase();
  const cPeriodType = String(concept.periodType || 'MONTHLY').trim().toUpperCase();
  const cFamily = resolveCanonicalPeriodFamily(cPeriodType);
  const pFamily = resolveCanonicalPeriodFamily(pType);

  if (cFamily !== 'ALL' && cFamily !== pFamily) {
    return {
      ok: false,
      message: `El concepto ${concept.code} (${concept.name}) pertenece al tipo "${cPeriodType}" y no corresponde a una liquidación de tipo "${pType}".`,
    };
  }
  return { ok: true };
}

function assertNoveltyConceptCompatible(concept, period) {
  const res = checkNoveltyConceptCompatibility(concept, period);
  if (!res.ok) {
    const err = new Error(res.message);
    err.status = 400;
    throw err;
  }
}

export async function getCarryoverSourceNovelties(
  tenantPrisma,
  targetPeriodId,
  { sourcePeriodId = null, conceptIds = null, includeInactive = false } = {}
) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const targetPeriod = await tenantPrisma.payrollPeriod.findUnique({
    where: { id: targetPeriodId },
  });
  if (!targetPeriod) {
    const err = new Error('La liquidación destino solicitada no existe');
    err.status = 404;
    throw err;
  }

  const allOtherPeriods = await tenantPrisma.payrollPeriod.findMany({
    where: { id: { not: targetPeriodId } },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { settlementNumber: 'desc' }],
    select: {
      id: true,
      year: true,
      month: true,
      periodType: true,
      settlementNumber: true,
      settlementName: true,
      status: true,
    },
  });

  const targetType = String(targetPeriod.periodType || 'MONTHLY').toUpperCase();
  const statusWeight = { CLOSED: 3, CALCULATED: 2, DRAFT: 1 };

  const availableSourcePeriods = [...allOtherPeriods]
    .map((p) => ({
      ...p,
      samePeriodType: String(p.periodType || '').toUpperCase() === targetType,
    }))
    .sort((a, b) => {
      if (a.samePeriodType !== b.samePeriodType) return a.samePeriodType ? -1 : 1;
      if (b.year !== a.year) return b.year - a.year;
      if (b.month !== a.month) return b.month - a.month;
      return (b.settlementNumber || 1) - (a.settlementNumber || 1);
    });

  let sourcePeriod = null;
  if (sourcePeriodId) {
    const cleanSourceId = String(sourcePeriodId).trim();
    if (cleanSourceId === targetPeriodId) {
      const err = new Error('No puede copiar novedades desde la misma liquidación destino');
      err.status = 400;
      throw err;
    }
    sourcePeriod = availableSourcePeriods.find((p) => p.id === cleanSourceId) || null;
    if (!sourcePeriod) {
      const err = new Error('La liquidación origen especificada no existe');
      err.status = 404;
      throw err;
    }
  } else {
    const sameTypeList = availableSourcePeriods.filter((p) => p.samePeriodType);
    const earlierSameType = sameTypeList.filter(
      (p) =>
        p.year < targetPeriod.year ||
        (p.year === targetPeriod.year && p.month < targetPeriod.month) ||
        (p.year === targetPeriod.year &&
          p.month === targetPeriod.month &&
          (p.settlementNumber || 1) < (targetPeriod.settlementNumber || 1))
    );
    const pool = earlierSameType.length > 0 ? earlierSameType : sameTypeList;
    if (pool.length > 0) {
      pool.sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        if (b.month !== a.month) return b.month - a.month;
        if ((b.settlementNumber || 1) !== (a.settlementNumber || 1)) {
          return (b.settlementNumber || 1) - (a.settlementNumber || 1);
        }
        return (statusWeight[b.status] || 0) - (statusWeight[a.status] || 0);
      });
      sourcePeriod = pool[0];
    }
  }

  if (!sourcePeriod) {
    return {
      sourcePeriod: null,
      sourceOrigin: 'NONE',
      availableSourcePeriods,
      concepts: [],
      items: [],
      skippedInactiveCount: 0,
      skippedIncompatibleConceptsCount: 0,
    };
  }

  const allNonPersConcepts = await tenantPrisma.concept.findMany({
    where: {
      deletedAt: null,
      scope: 'INDIVIDUAL',
      isPersistent: false,
    },
    orderBy: [{ code: 'asc' }],
  });

  const compatibleNonCalc = allNonPersConcepts.filter(
    (c) =>
      String(c.noveltyDataType || '').toUpperCase() !== 'CALCULADO' &&
      checkNoveltyConceptCompatibility(c, targetPeriod).ok
  );

  const requestedIds = parseIdList(conceptIds);
  let candidateConcepts = compatibleNonCalc;
  let skippedIncompatibleConceptsCount = 0;

  if (requestedIds.length > 0) {
    const requestedSet = new Set(requestedIds);
    candidateConcepts = compatibleNonCalc.filter((c) => requestedSet.has(c.id));
    skippedIncompatibleConceptsCount = Math.max(0, requestedSet.size - candidateConcepts.length);
  }

  if (candidateConcepts.length === 0) {
    return {
      sourcePeriod,
      sourceOrigin: 'NONE',
      availableSourcePeriods,
      concepts: [],
      items: [],
      skippedInactiveCount: 0,
      skippedIncompatibleConceptsCount,
    };
  }

  const candidateConceptMap = new Map(candidateConcepts.map((c) => [c.id, c]));
  const candidateIds = candidateConcepts.map((c) => c.id);

  let sourceOrigin = 'NONE';
  const rawRecords = [];

  if (sourcePeriod.status !== 'CLOSED') {
    const openNovs = await tenantPrisma.periodNovelty.findMany({
      where: {
        payrollPeriodId: sourcePeriod.id,
        conceptId: { in: candidateIds },
      },
      include: {
        employee: {
          select: { id: true, status: true, deletedAt: true },
        },
      },
    });
    if (openNovs.length > 0) {
      sourceOrigin = 'PERIOD_NOVELTIES';
      for (const nov of openNovs) {
        rawRecords.push({
          employeeId: nov.employeeId,
          employeeStatus: nov.employee?.status || 'ACTIVE',
          employeeDeletedAt: nov.employee?.deletedAt || null,
          conceptId: nov.conceptId,
          units: nov.units !== null && nov.units !== undefined ? Number(nov.units) : null,
          amount: nov.amount !== null && nov.amount !== undefined ? Number(nov.amount) : null,
          notes: nov.notes ? String(nov.notes).trim() : null,
          formulaAmountWarning: false,
        });
      }
    }
  }

  if (rawRecords.length === 0) {
    const slipItems = await tenantPrisma.paySlipItem.findMany({
      where: {
        conceptId: { in: candidateIds },
        paySlip: {
          payrollPeriodId: sourcePeriod.id,
          deletedAt: null,
        },
      },
      include: {
        paySlip: {
          select: {
            employeeId: true,
            employee: {
              select: { id: true, status: true, deletedAt: true },
            },
          },
        },
      },
    });

    if (slipItems.length > 0) {
      sourceOrigin = 'CLOSED_PAYSLIPS';
      const seenKeys = new Set();
      for (const item of slipItems) {
        const empId = item.paySlip?.employeeId;
        const cId = item.conceptId;
        const concept = candidateConceptMap.get(cId);
        if (!empId || !cId || !concept) continue;

        const pairKey = `${empId}::${cId}`;
        if (seenKeys.has(pairKey)) continue;
        seenKeys.add(pairKey);

        const dt = String(concept.noveltyDataType || '').toUpperCase();
        const isAmountType =
          dt === 'IMPORTE' || dt === 'AMOUNT' || concept.calculationType === 'FIXED_AMOUNT';
        const isNoneType = dt === 'SOLO_ASIGNACION' || dt === 'NONE' || dt === 'SIN_NOVEDAD';

        let unitsVal = null;
        let amountVal = null;
        let formulaAmountWarning = false;

        if (isAmountType) {
          unitsVal = 1;
          amountVal = item.amount !== null && item.amount !== undefined ? Number(item.amount) : 0;
          if (String(concept.calculationType || '').toUpperCase() === 'FORMULA') {
            formulaAmountWarning = true;
          }
        } else if (isNoneType) {
          unitsVal = 1;
          amountVal = null;
        } else {
          unitsVal = item.units !== null && item.units !== undefined ? Number(item.units) : 0;
          amountVal = null;
        }

        rawRecords.push({
          employeeId: empId,
          employeeStatus: item.paySlip?.employee?.status || 'ACTIVE',
          employeeDeletedAt: item.paySlip?.employee?.deletedAt || null,
          conceptId: cId,
          units: unitsVal,
          amount: amountVal,
          notes: item.notes ? String(item.notes).trim() : null,
          formulaAmountWarning,
        });
      }
    }
  }

  const allowInactive = includeInactive === true || includeInactive === 'true';
  const skippedInactiveEmpIds = new Set();
  const filteredItems = [];
  const conceptCounts = new Map();

  for (const rec of rawRecords) {
    if (rec.employeeDeletedAt) {
      skippedInactiveEmpIds.add(rec.employeeId);
      continue;
    }
    const isInactive = String(rec.employeeStatus || 'ACTIVE').toUpperCase() !== 'ACTIVE';
    if (isInactive && !allowInactive) {
      skippedInactiveEmpIds.add(rec.employeeId);
      continue;
    }
    filteredItems.push({
      employeeId: rec.employeeId,
      conceptId: rec.conceptId,
      units: rec.units,
      amount: rec.amount,
      notes: rec.notes,
      formulaAmountWarning: rec.formulaAmountWarning,
    });
    conceptCounts.set(rec.conceptId, (conceptCounts.get(rec.conceptId) || 0) + 1);
  }

  const conceptsSummary = candidateConcepts
    .filter((c) => conceptCounts.has(c.id))
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      type: c.type,
      noveltyDataType: c.noveltyDataType,
      calculationType: c.calculationType,
      arcaConceptCode: c.arcaConceptCode,
      count: conceptCounts.get(c.id) || 0,
    }));

  return {
    sourcePeriod,
    sourceOrigin,
    availableSourcePeriods,
    concepts: conceptsSummary,
    items: filteredItems,
    skippedInactiveCount: skippedInactiveEmpIds.size,
    skippedIncompatibleConceptsCount,
  };
}

export async function upsertPeriodNovelty(tenantPrisma, periodId, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const period = await tenantPrisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: { fiscalPeriod: true },
  });
  if (!period) {
    const err = new Error('La liquidación / período solicitado no existe');
    err.status = 404;
    throw err;
  }
  if (period.status === 'CLOSED' || period.fiscalPeriod?.status === 'CLOSED') {
    const err = new Error('No se pueden modificar novedades en una liquidación o período cerrado');
    err.status = 400;
    throw err;
  }

  const concept = await tenantPrisma.concept.findUnique({ where: { id: data.conceptId } });
  assertNoveltyConceptCompatible(concept, period);

  const unitsVal = data.units !== undefined && data.units !== null && data.units !== '' ? Number(data.units) : null;
  const amountVal = data.amount !== undefined && data.amount !== null && data.amount !== '' ? Number(data.amount) : null;
  const notesVal = data.notes ? String(data.notes).trim() : null;

  const existing = await tenantPrisma.periodNovelty.findUnique({
    where: {
      payrollPeriodId_employeeId_conceptId: {
        payrollPeriodId: periodId,
        employeeId: data.employeeId,
        conceptId: data.conceptId,
      },
    },
  });

  if (existing) {
    return tenantPrisma.periodNovelty.update({
      where: { id: existing.id },
      data: {
        units: unitsVal,
        amount: amountVal,
        notes: notesVal,
      },
      include: {
        employee: true,
        concept: true,
      },
    });
  }

  return tenantPrisma.periodNovelty.create({
    data: {
      id: crypto.randomUUID(),
      payrollPeriodId: periodId,
      employeeId: data.employeeId,
      conceptId: data.conceptId,
      units: unitsVal,
      amount: amountVal,
      notes: notesVal,
    },
    include: {
      employee: true,
      concept: true,
    },
  });
}

export async function deletePeriodNovelty(tenantPrisma, periodId, noveltyId) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const period = await tenantPrisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: { fiscalPeriod: true },
  });
  if (!period) {
    const err = new Error('La liquidación / período solicitado no existe');
    err.status = 404;
    throw err;
  }
  if (period.status === 'CLOSED' || period.fiscalPeriod?.status === 'CLOSED') {
    const err = new Error('No se pueden modificar novedades en una liquidación o período cerrado');
    err.status = 400;
    throw err;
  }

  const novelty = await tenantPrisma.periodNovelty.findFirst({
    where: {
      id: noveltyId,
      payrollPeriodId: periodId,
    },
  });
  if (!novelty) {
    const err = new Error('Novedad de período no encontrada');
    err.status = 404;
    throw err;
  }

  await tenantPrisma.periodNovelty.delete({
    where: { id: novelty.id },
  });

  return { message: 'Novedad eliminada correctamente' };
}

export async function batchUpsertPeriodNovelties(
  tenantPrisma,
  periodId,
  items = [],
  { conceptId = null, removeEmployeeIds = [], removals = [], returnData = true, requireActiveEmployees = false } = {}
) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const period = await tenantPrisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: { fiscalPeriod: true },
  });
  if (!period) {
    const err = new Error('La liquidación / período solicitado no existe');
    err.status = 404;
    throw err;
  }
  if (period.status === 'CLOSED' || period.fiscalPeriod?.status === 'CLOSED') {
    const err = new Error('No se pueden modificar novedades en una liquidación o período cerrado');
    err.status = 400;
    throw err;
  }

  const safeItems = Array.isArray(items) ? items : [];

  // Deduplicar pares (employeeId, conceptId) conservando la última entrada del lote
  const dedupedMap = new Map();
  for (const item of safeItems) {
    dedupedMap.set(`${item.employeeId}::${item.conceptId}`, item);
  }
  const dedupedItems = Array.from(dedupedMap.values());

  // Unificar eliminaciones multiconcepto (removals[]) y formato monoconcepto legacy (removeEmployeeIds[])
  const removalsByConcept = new Map();
  const addRemovalPair = (empId, cId) => {
    const cleanEmp = empId ? String(empId).trim() : '';
    const cleanCon = cId ? String(cId).trim() : '';
    if (!cleanEmp || !cleanCon) return;
    if (dedupedMap.has(`${cleanEmp}::${cleanCon}`)) return;
    if (!removalsByConcept.has(cleanCon)) removalsByConcept.set(cleanCon, new Set());
    removalsByConcept.get(cleanCon).add(cleanEmp);
  };

  if (Array.isArray(removals)) {
    for (const rem of removals) {
      addRemovalPair(rem?.employeeId, rem?.conceptId);
    }
  }

  const targetRemoveConceptId = conceptId || dedupedItems[0]?.conceptId || null;
  if (Array.isArray(removeEmployeeIds) && targetRemoveConceptId) {
    for (const empId of removeEmployeeIds) {
      addRemovalPair(empId, targetRemoveConceptId);
    }
  }

  if (dedupedItems.length === 0 && removalsByConcept.size === 0) {
    return { savedCount: 0, deletedCount: 0, processedCount: 0, data: [] };
  }

  const conceptIds = Array.from(
    new Set([
      ...dedupedItems.map((i) => i.conceptId),
      ...Array.from(removalsByConcept.keys()),
    ])
  );
  const employeeIds = Array.from(new Set(dedupedItems.map((i) => i.employeeId)));

  const concepts = await tenantPrisma.concept.findMany({
    where: { id: { in: conceptIds } },
  });
  const conceptMap = new Map(concepts.map((c) => [c.id, c]));
  for (const cid of conceptIds) {
    assertNoveltyConceptCompatible(conceptMap.get(cid), period);
  }

  if (employeeIds.length > 0 && tenantPrisma.employee?.findMany) {
    const validEmployees = await tenantPrisma.employee.findMany({
      where: { id: { in: employeeIds }, deletedAt: null },
      select: { id: true, fileNumber: true, firstName: true, lastName: true, status: true },
    });
    if (validEmployees.length !== employeeIds.length) {
      const err = new Error('Uno o más colaboradores incluidos en el lote no existen o fueron eliminados');
      err.status = 400;
      throw err;
    }
    if (requireActiveEmployees === true) {
      const inactiveEmps = validEmployees.filter(
        (e) => String(e.status || '').toUpperCase() !== 'ACTIVE'
      );
      if (inactiveEmps.length > 0) {
        const labels = inactiveEmps
          .slice(0, 5)
          .map((e) => (e.fileNumber ? `Legajo ${e.fileNumber}` : e.id))
          .join(', ');
        const suffix = inactiveEmps.length > 5 ? ` y ${inactiveEmps.length - 5} más` : '';
        const err = new Error(
          `No se pueden importar novedades para colaboradores sin relación laboral activa: ${labels}${suffix}.`
        );
        err.status = 400;
        throw err;
      }
    }
  }

  const { savedIds, deletedCount } = await tenantPrisma.$transaction(
    async (tx) => {
      let delCount = 0;
      for (const [remConceptId, empIdSet] of removalsByConcept.entries()) {
        const empIdsForDel = Array.from(empIdSet);
        if (empIdsForDel.length === 0) continue;
        const delRes = await tx.periodNovelty.deleteMany({
          where: {
            payrollPeriodId: periodId,
            conceptId: remConceptId,
            employeeId: { in: empIdsForDel },
          },
        });
        delCount += delRes.count || 0;
      }

      const resultIds = [];
      if (dedupedItems.length > 0) {
        const existingList = await tx.periodNovelty.findMany({
          where: {
            payrollPeriodId: periodId,
            employeeId: { in: employeeIds },
            conceptId: { in: conceptIds },
          },
          select: { id: true, employeeId: true, conceptId: true },
        });
        const existingMap = new Map(
          existingList.map((e) => [`${e.employeeId}::${e.conceptId}`, e.id])
        );

        const toCreate = [];
        const toUpdate = [];

        for (const item of dedupedItems) {
          const unitsVal = item.units !== undefined && item.units !== null && item.units !== '' ? Number(item.units) : null;
          const amountVal = item.amount !== undefined && item.amount !== null && item.amount !== '' ? Number(item.amount) : null;
          const notesVal = item.notes ? String(item.notes).trim() : null;
          const key = `${item.employeeId}::${item.conceptId}`;
          const existingId = existingMap.get(key);

          if (existingId) {
            toUpdate.push({ id: existingId, units: unitsVal, amount: amountVal, notes: notesVal });
            resultIds.push(existingId);
          } else {
            const newId = crypto.randomUUID();
            toCreate.push({
              id: newId,
              payrollPeriodId: periodId,
              employeeId: item.employeeId,
              conceptId: item.conceptId,
              units: unitsVal,
              amount: amountVal,
              notes: notesVal,
            });
            resultIds.push(newId);
          }
        }

        for (let i = 0; i < toCreate.length; i += 200) {
          await tx.periodNovelty.createMany({ data: toCreate.slice(i, i + 200) });
        }

        for (let i = 0; i < toUpdate.length; i += 20) {
          const chunk = toUpdate.slice(i, i + 20);
          await Promise.all(
            chunk.map((upd) =>
              tx.periodNovelty.update({
                where: { id: upd.id },
                data: {
                  units: upd.units,
                  amount: upd.amount,
                  notes: upd.notes,
                },
              })
            )
          );
        }
      }

      return { savedIds: resultIds, deletedCount: delCount };
    },
    { maxWait: 10000, timeout: 30000 }
  );

  const shouldReturnData = returnData !== false;
  const results =
    shouldReturnData && savedIds.length > 0
      ? await tenantPrisma.periodNovelty.findMany({
        where: { id: { in: savedIds } },
        include: {
          employee: true,
          concept: true,
        },
      })
      : [];

  const savedCount = shouldReturnData ? results.length : savedIds.length;
  return {
    savedCount,
    deletedCount,
    processedCount: savedCount + deletedCount,
    data: results,
  };
}
