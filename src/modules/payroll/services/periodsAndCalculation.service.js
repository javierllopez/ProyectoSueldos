import crypto from 'crypto';
import { ensureTenantPayrollSchema } from '../../../services/tenantProvisioner.service.js';
import {
  calculateEmployeePayroll,
  findBasicSalaryConcept,
  buildPayrollIndices,
  EMPLOYER_CONTRIBUTION_DEFINITIONS,
} from '../payroll.calculator.js';
import { validateAndSyncSalaryScalesForPeriod } from '../salaryScale.service.js';
import { hoursToDecimal, decimalToHours } from '../../../utils/timeFormat.js';
import {
  getPayrollSettings,
  resolveSettlementTypeConfig,
} from './conceptsAndRules.service.js';


// --- PERÍODOS FISCALES (MENSUALES) ---

export async function getActiveFiscalPeriod(tenantPrisma) {
  await ensureTenantPayrollSchema(tenantPrisma);

  return tenantPrisma.payrollFiscalPeriod.findFirst({
    where: { status: 'OPEN' },
    include: {
      settlements: {
        orderBy: { settlementNumber: 'asc' },
        include: {
          _count: { select: { paySlips: { where: { deletedAt: null } } } },
        },
      },
    },
  });
}

export async function listFiscalPeriods(tenantPrisma) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const [periods, closingAudits] = await Promise.all([
    tenantPrisma.payrollFiscalPeriod.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        settlements: {
          orderBy: { settlementNumber: 'asc' },
          include: {
            _count: { select: { paySlips: { where: { deletedAt: null } } } },
          },
        },
      },
    }),
    tenantPrisma.payrollClosingAudit?.findMany
      ? tenantPrisma.payrollClosingAudit.findMany({
          where: { scope: 'FISCAL_PERIOD' },
          select: { fiscalPeriodId: true, year: true, month: true },
        })
      : Promise.resolve([]),
  ]);

  const auditedKeys = new Set();
  for (const audit of closingAudits || []) {
    if (audit.fiscalPeriodId) auditedKeys.add(audit.fiscalPeriodId);
    if (audit.year && audit.month) auditedKeys.add(`${audit.year}-${audit.month}`);
  }

  return periods.map((fp) => {
    const hasClosingAudit = auditedKeys.has(fp.id) || auditedKeys.has(`${fp.year}-${fp.month}`);
    const isOrphanClosed =
      fp.status === 'CLOSED' &&
      !fp.closedBy &&
      (fp.settlements?.length || 0) === 0 &&
      !hasClosingAudit;
    return {
      ...fp,
      hasClosingAudit,
      isOrphanClosed,
    };
  });
}

export async function createFiscalPeriod(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const year = Number(data.year);
  const month = Number(data.month);

  // Regla Opción A: Solamente puede haber un período ABIERTO a la vez
  const existingOpen = await tenantPrisma.payrollFiscalPeriod.findFirst({
    where: { status: 'OPEN' },
  });

  if (existingOpen) {
    const err = new Error(
      `Ya existe un período abierto (${String(existingOpen.month).padStart(2, '0')}/${existingOpen.year}). Solamente puede haber un período abierto a la vez. Debe cerrar el período activo antes de iniciar uno nuevo.`
    );
    err.status = 400;
    throw err;
  }

  // Verificar si ya existe este período
  const existingPeriod = await tenantPrisma.payrollFiscalPeriod.findUnique({
    where: { year_month: { year, month } },
    include: {
      settlements: { select: { id: true } },
    },
  });

  if (existingPeriod) {
    const closingAudit = tenantPrisma.payrollClosingAudit?.findFirst
      ? await tenantPrisma.payrollClosingAudit.findFirst({
          where: {
            scope: 'FISCAL_PERIOD',
            OR: [{ fiscalPeriodId: existingPeriod.id }, { year, month }],
          },
          select: { id: true },
        })
      : null;

    const settlementsCount = existingPeriod.settlements?.length || 0;
    const isOrphanClosed =
      existingPeriod.status === 'CLOSED' &&
      !existingPeriod.closedBy &&
      settlementsCount === 0 &&
      !closingAudit;

    if (isOrphanClosed) {
      await validateAndSyncSalaryScalesForPeriod(tenantPrisma, {
        year,
        month,
        requireExplicitPeriodMatch: true,
      });

      return tenantPrisma.payrollFiscalPeriod.update({
        where: { id: existingPeriod.id },
        data: {
          status: 'OPEN',
          closedAt: null,
          closedBy: null,
          notes: data.notes ? String(data.notes).trim() : existingPeriod.notes,
        },
        include: {
          settlements: true,
        },
      });
    }

    const mm = String(month).padStart(2, '0');
    const closedDateStr = existingPeriod.closedAt
      ? new Date(existingPeriod.closedAt).toLocaleDateString('es-AR')
      : null;
    const err = new Error(
      `El período ${mm}/${year} ya fue cerrado${closedDateStr ? ` el ${closedDateStr}` : ''} (${settlementsCount} liquidación(es) registrada(s)) y no puede volver a abrirse.`
    );
    err.status = 400;
    throw err;
  }

  await validateAndSyncSalaryScalesForPeriod(tenantPrisma, {
    year,
    month,
    requireExplicitPeriodMatch: true,
  });

  return tenantPrisma.payrollFiscalPeriod.create({
    data: {
      id: crypto.randomUUID(),
      year,
      month,
      notes: data.notes ? String(data.notes).trim() : null,
      status: 'OPEN',
    },
    include: {
      settlements: true,
    },
  });
}

// --- LIQUIDACIONES INDIVIDUALES (payroll_periods) ---

export async function getPeriods(
  tenantPrisma,
  { search = '', page = 1, limit = 10, status, year, fiscalPeriodId, type, periodType }
) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const take = Math.max(1, Math.min(Number(limit) || 10, 100));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = {};
  if (status && status !== 'ALL') {
    if (String(status).toUpperCase() === 'OPEN') {
      where.status = { in: ['DRAFT', 'CALCULATED'] };
    } else {
      where.status = status;
    }
  }
  if (year) where.year = Number(year);
  if (fiscalPeriodId) where.fiscalPeriodId = fiscalPeriodId;
  const resolvedPeriodType = (periodType || type || '').trim();
  if (resolvedPeriodType && resolvedPeriodType !== 'ALL') {
    where.periodType = resolvedPeriodType;
  }
  if (search) {
    where.OR = [
      { settlementName: { contains: search } },
      { periodType: { contains: search } },
    ];
  }

  const [total, periods] = await Promise.all([
    tenantPrisma.payrollPeriod.count({ where }),
    tenantPrisma.payrollPeriod.findMany({
      where,
      skip,
      take,
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { settlementNumber: 'asc' }],
      include: {
        fiscalPeriod: true,
        _count: {
          select: { paySlips: { where: { deletedAt: null } } },
        },
      },
    }),
  ]);

  return {
    data: periods.map((p) => ({
      ...p,
      paySlipsCount: p._count.paySlips,
    })),
    meta: {
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}

export async function getPeriodById(tenantPrisma, periodId) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const period = await tenantPrisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: {
      fiscalPeriod: true,
      _count: {
        select: { paySlips: true },
      },
    },
  });

  if (!period) {
    const err = new Error('La liquidación / período solicitado no existe');
    err.status = 404;
    throw err;
  }

  return {
    ...period,
    paySlipsCount: period._count.paySlips,
  };
}

export async function createPeriod(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  let fiscalPeriodId = data.fiscalPeriodId;
  let fiscalPeriod = null;

  if (fiscalPeriodId) {
    fiscalPeriod = await tenantPrisma.payrollFiscalPeriod.findUnique({
      where: { id: fiscalPeriodId },
    });
  } else {
    // Si no se proveyó fiscalPeriodId, asociar al período abierto activo
    fiscalPeriod = await tenantPrisma.payrollFiscalPeriod.findFirst({
      where: { status: 'OPEN' },
    });
  }

  if (!fiscalPeriod) {
    const err = new Error('No existe ningún período fiscal abierto para dar de alta liquidaciones. Debe abrir un período primero.');
    err.status = 400;
    throw err;
  }

  if (fiscalPeriod.status === 'CLOSED') {
    const err = new Error('No se pueden dar de alta liquidaciones en un período fiscal cerrado.');
    err.status = 400;
    throw err;
  }

  fiscalPeriodId = fiscalPeriod.id;
  const year = fiscalPeriod.year;
  const month = fiscalPeriod.month;
  const rawPeriodType = String(data.periodType || data.type || 'MONTHLY').trim().toUpperCase();
  const settlementTypeConfig = await resolveSettlementTypeConfig(tenantPrisma, rawPeriodType);
  if (!settlementTypeConfig) {
    const err = new Error(`El tipo de liquidación "${rawPeriodType}" no existe en la configuración del sistema.`);
    err.status = 400;
    throw err;
  }
  if (!settlementTypeConfig.isActive) {
    const err = new Error(`El tipo de liquidación "${settlementTypeConfig.name}" está inactivo y no admite nuevas liquidaciones.`);
    err.status = 400;
    throw err;
  }
  const periodType = settlementTypeConfig.code;

  // Obtener el siguiente número correlativo de liquidación para el período fiscal (usando MAX + 1 para evitar colisiones tras bajas)
  const getNextSettlementNumber = async () => {
    const agg = await tenantPrisma.payrollPeriod.aggregate({
      _max: { settlementNumber: true },
      where: { year, month },
    });
    return (Number(agg?._max?.settlementNumber) || 0) + 1;
  };

  let settlementNumber = await getNextSettlementNumber();

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const customSettlementName = data.settlementName || data.name || null;
  const buildSettlementName = (num) =>
    customSettlementName || `${settlementTypeConfig.name} - ${monthNames[month - 1]} ${year} (Liq. #${num})`;

  let liquidationDate = data.liquidationDate ? new Date(data.liquidationDate) : null;
  if (!liquidationDate) {
    if (periodType === 'QUINCE_1') {
      liquidationDate = new Date(year, month - 1, 15);
    } else {
      liquidationDate = new Date(year, month, 0);
    }
  }

  const buildCreatePayload = (num) => ({
    data: {
      fiscalPeriodId,
      year,
      month,
      periodType,
      settlementNumber: num,
      settlementName: buildSettlementName(num),
      settlementType: data.settlementType || settlementTypeConfig.arcaLsdType || (periodType.startsWith('QUINCE') ? 'Q' : 'M'),
      liquidationDate,
      paymentDate: data.paymentDate ? new Date(data.paymentDate) : null,
      paymentPlace: data.paymentPlace || 'Casa Central',
      rubricDate: data.rubricDate ? new Date(data.rubricDate) : null,
      depositDate: data.depositDate ? new Date(data.depositDate) : null,
      depositBank: data.depositBank || null,
      status: 'DRAFT',
    },
    include: {
      fiscalPeriod: true,
    },
  });

  try {
    return await tenantPrisma.payrollPeriod.create(buildCreatePayload(settlementNumber));
  } catch (err) {
    if (err.code === 'P2002') {
      // Autocuración en caliente: eliminar índices heredados y recalcular correlativo
      await ensureTenantPayrollSchema(tenantPrisma, { force: true });
      settlementNumber = await getNextSettlementNumber();
      return await tenantPrisma.payrollPeriod.create(buildCreatePayload(settlementNumber));
    }
    throw err;
  }
}

export async function updatePeriod(tenantPrisma, periodId, data) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const period = await getPeriodById(tenantPrisma, periodId);

  if (period.status === 'CLOSED' || period.fiscalPeriod?.status === 'CLOSED') {
    const err = new Error('No se puede modificar una liquidación que pertenece a un período cerrado');
    err.status = 400;
    throw err;
  }

  return tenantPrisma.payrollPeriod.update({
    where: { id: periodId },
    data: {
      settlementName: data.settlementName !== undefined ? data.settlementName : period.settlementName,
      settlementType: data.settlementType !== undefined ? data.settlementType : period.settlementType,
      liquidationDate: data.liquidationDate !== undefined ? (data.liquidationDate ? new Date(data.liquidationDate) : null) : period.liquidationDate,
      paymentDate: data.paymentDate !== undefined ? (data.paymentDate ? new Date(data.paymentDate) : null) : period.paymentDate,
      paymentPlace: data.paymentPlace !== undefined ? data.paymentPlace : period.paymentPlace,
      rubricDate: data.rubricDate !== undefined ? (data.rubricDate ? new Date(data.rubricDate) : null) : period.rubricDate,
      depositDate: data.depositDate !== undefined ? (data.depositDate ? new Date(data.depositDate) : null) : period.depositDate,
      depositBank: data.depositBank !== undefined ? data.depositBank : period.depositBank,
    },
  });
}

export async function deletePeriod(tenantPrisma, periodId) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const period = await getPeriodById(tenantPrisma, periodId);

  if (period.status === 'CLOSED' || period.fiscalPeriod?.status === 'CLOSED') {
    const err = new Error('No se puede eliminar una liquidación que ya ha sido cerrada legalmente');
    err.status = 400;
    throw err;
  }

  return tenantPrisma.payrollPeriod.delete({
    where: { id: periodId },
  });
}

// --- CÁLCULO DE NÓMINA / LIQUIDACIÓN ---

export async function calculatePeriod(tenantPrisma, periodId, { employeeIds = [], novedades = [] } = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const period = await getPeriodById(tenantPrisma, periodId);

  if (period.status === 'CLOSED' || period.fiscalPeriod?.status === 'CLOSED') {
    const err = new Error('La liquidación o período fiscal se encuentra cerrado. No es posible recalcular haberes.');
    err.status = 400;
    throw err;
  }

  // 1. Obtener parámetros, tipo de liquidación, conceptos, matrices, valores fijos y escalas salariales
  const [payrollSettings, settlementTypeConfig, allConcepts, allMatrices, allFixedValues, allSalaryScales] = await Promise.all([
    getPayrollSettings(tenantPrisma),
    resolveSettlementTypeConfig(tenantPrisma, period.periodType),
    tenantPrisma.concept.findMany({
      where: { isActive: true, deletedAt: null },
      include: { matrix: true },
    }),
    tenantPrisma.payrollMatrix.findMany({
      where: { isActive: true, deletedAt: null },
    }),
    tenantPrisma.payrollFixedValue.findMany({
      where: { isActive: true, deletedAt: null },
    }),
    tenantPrisma.salaryScale.findMany({
      where: { deletedAt: null },
      include: {
        periods: {
          orderBy: { validFrom: 'asc' },
        },
      },
    }),
  ]);

  // 2. Obtener empleados a liquidar
  const empWhere = { deletedAt: null };
  if (Array.isArray(employeeIds) && employeeIds.length > 0) {
    empWhere.id = { in: employeeIds };
  } else {
    empWhere.status = 'ACTIVE';
  }

  const employees = await tenantPrisma.employee.findMany({
    where: empWhere,
    include: {
      department: true,
      jobPosition: true,
      healthInsurance: true,
      union: true,
      mutual: true,
      salaryScale: {
        include: {
          periods: {
            orderBy: { validFrom: 'asc' },
          },
        },
      },
      workShift: true,
      relatives: {
        where: { deletedAt: null },
        include: { kinship: true },
      },
      assignedConcepts: {
        where: {
          isActive: true,
          concept: { deletedAt: null, isActive: true },
        },
        include: { concept: true },
      },
    },
  });

  if (employees.length === 0) {
    const err = new Error('No se encontraron empleados activos para procesar la liquidación');
    err.status = 400;
    throw err;
  }

  const basicConcept = findBasicSalaryConcept(allConcepts);
  const basicCode = basicConcept ? basicConcept.code : '1000';

  // Cargar novedades registradas en BD para este período
  const dbNovelties = await tenantPrisma.periodNovelty.findMany({
    where: { payrollPeriodId: periodId },
    include: { concept: true },
  });

  // Si la liquidación admite retroactivos y existen novedades cargadas para colaboradores INACTIVE,
  // incorporarlos en modo complementario de egresado sin esperar selección manual.
  if (
    (!Array.isArray(employeeIds) || employeeIds.length === 0) &&
    settlementTypeConfig?.allowsRetroactives === true &&
    dbNovelties.length > 0
  ) {
    const activeIds = new Set(employees.map((e) => e.id));
    const missingEmpIds = [...new Set(dbNovelties.map((dn) => dn.employeeId).filter((id) => id && !activeIds.has(id)))];
    if (missingEmpIds.length > 0) {
      const inactiveWithNovelties = await tenantPrisma.employee.findMany({
        where: { id: { in: missingEmpIds }, deletedAt: null },
        include: {
          department: true,
          jobPosition: true,
          healthInsurance: true,
          union: true,
          mutual: true,
          salaryScale: {
            include: {
              periods: {
                orderBy: { validFrom: 'asc' },
              },
            },
          },
          workShift: true,
          relatives: {
            where: { deletedAt: null },
            include: { kinship: true },
          },
          assignedConcepts: {
            where: {
              isActive: true,
              concept: { deletedAt: null, isActive: true },
            },
            include: { concept: true },
          },
        },
      });
      employees.push(...inactiveWithNovelties);
    }
  }

  // Mapa de novedades agrupadas por employeeId y mapa de días trabajados explícitos
  const novedadesByEmp = new Map();
  const workedDaysByEmp = new Map();

  // 1. Poblar con novedades guardadas en BD
  for (const dn of dbNovelties) {
    if (!novedadesByEmp.has(dn.employeeId)) {
      novedadesByEmp.set(dn.employeeId, []);
    }
    const items = novedadesByEmp.get(dn.employeeId);
    items.push({
      conceptCode: dn.concept.code,
      units: dn.units !== null ? Number(dn.units) : undefined,
      amount: dn.amount !== null ? Number(dn.amount) : undefined,
      adjustmentPeriod: dn.adjustmentPeriod || null,
      notes: dn.notes,
    });
    if (dn.concept.code === 'DIAS_TRABAJADOS' && dn.units !== null) {
      workedDaysByEmp.set(dn.employeeId, Number(dn.units));
    }
  }

  // 1.5. Aplicar días ARCA LSD guardados en Hojas de Liquidación Final (PROP-03) si no hay override explícito posterior
  if (tenantPrisma.finalSettlementWorksheet?.findMany) {
    try {
      const worksheets = await tenantPrisma.finalSettlementWorksheet.findMany({
        where: { payrollPeriodId: periodId },
        select: { employeeId: true, workedDaysForLsd: true },
      });
      for (const ws of worksheets || []) {
        if (!workedDaysByEmp.has(ws.employeeId) && ws.workedDaysForLsd !== null && ws.workedDaysForLsd !== undefined) {
          workedDaysByEmp.set(ws.employeeId, Number(ws.workedDaysForLsd));
        }
      }
    } catch (_) {
      // Tolerancia en entornos mock sin tabla de hojas finales
    }
  }

  // 2. Fusionar novedades adicionales enviadas en la petición si las hubiera
  for (const nov of novedades) {
    if (nov.employeeId) {
      if (nov.workedDays !== undefined && nov.workedDays !== null) {
        workedDaysByEmp.set(nov.employeeId, Number(nov.workedDays));
      }
      if (!novedadesByEmp.has(nov.employeeId)) {
        novedadesByEmp.set(nov.employeeId, []);
      }
      const existingItems = novedadesByEmp.get(nov.employeeId);
      const incomingItems = [...(nov.items || []), ...(nov.customItems || [])];
      for (const item of incomingItems) {
        const idx = existingItems.findIndex((i) => i.conceptCode === item.conceptCode);
        if (idx >= 0) {
          existingItems[idx] = item;
        } else {
          existingItems.push(item);
        }
      }
    }
  }

  // 3. Obtener histórico de recibos para métricas acumuladas (últimos 12 meses / año en curso)
  const empIds = employees.map((e) => e.id);
  const historicalSlips = await tenantPrisma.paySlip.findMany({
    where: {
      employeeId: { in: empIds },
      payrollPeriodId: { not: periodId },
      deletedAt: null,
      payrollPeriod: {
        OR: [
          { year: { lt: period.year } },
          { year: period.year, month: { lte: period.month } },
        ],
      },
    },
    include: {
      payrollPeriod: true,
      items: true,
    },
    orderBy: [
      { payrollPeriod: { year: 'desc' } },
      { payrollPeriod: { month: 'desc' } },
      { payrollPeriod: { settlementNumber: 'desc' } },
    ],
  });

  const historyByEmp = new Map();
  for (const slip of historicalSlips) {
    if (!historyByEmp.has(slip.employeeId)) {
      historyByEmp.set(slip.employeeId, []);
    }
    historyByEmp.get(slip.employeeId).push(slip);
  }

  // 3.5. Cargar embargos judiciales activos y calcular acumulados previos
  const activeEmbargoesList = await tenantPrisma.employeeEmbargo.findMany({
    where: {
      employeeId: { in: empIds },
      status: 'ACTIVE',
    },
    include: {
      concepts: {
        include: {
          concept: {
            select: { id: true, code: true, name: true, periodType: true },
          },
        },
      },
    },
    orderBy: [
      { priorityOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  const allEmbargoConceptIds = [...new Set(
    activeEmbargoesList.flatMap((e) => (e.concepts || []).map((c) => c.conceptId))
  )];

  let priorEmbargoDeductions = [];
  if (allEmbargoConceptIds.length > 0) {
    priorEmbargoDeductions = await tenantPrisma.paySlipItem.findMany({
      where: {
        conceptId: { in: allEmbargoConceptIds },
        paySlip: {
          employeeId: { in: empIds },
          payrollPeriodId: { not: periodId },
          deletedAt: null,
        },
      },
      select: {
        conceptId: true,
        amount: true,
        paySlip: {
          select: {
            employeeId: true,
          },
        },
      },
    });
  }

  const priorDeductionsByEmpAndConcept = new Map();
  for (const it of priorEmbargoDeductions) {
    const eId = it.paySlip.employeeId;
    if (!priorDeductionsByEmpAndConcept.has(eId)) {
      priorDeductionsByEmpAndConcept.set(eId, new Map());
    }
    const cMap = priorDeductionsByEmpAndConcept.get(eId);
    cMap.set(it.conceptId, (cMap.get(it.conceptId) || 0) + Number(it.amount || 0));
  }

  const embargoesByEmp = new Map();
  for (const emb of activeEmbargoesList) {
    if (!embargoesByEmp.has(emb.employeeId)) {
      embargoesByEmp.set(emb.employeeId, []);
    }
    const empConceptMap = priorDeductionsByEmpAndConcept.get(emb.employeeId);
    let priorAccumulated = 0;
    const conceptIds = new Set();
    const conceptCodes = new Set();
    for (const c of emb.concepts || []) {
      conceptIds.add(c.conceptId);
      if (c.concept?.code) conceptCodes.add(c.concept.code);
      if (empConceptMap && empConceptMap.has(c.conceptId)) {
        priorAccumulated += empConceptMap.get(c.conceptId);
      }
    }
    const totalAmount = emb.hasCap && emb.totalAmount !== null ? Number(emb.totalAmount) : null;
    const remainingBalance = emb.hasCap && totalAmount !== null
      ? Math.max(0, Number((totalAmount - priorAccumulated).toFixed(2)))
      : null;

    embargoesByEmp.get(emb.employeeId).push({
      id: emb.id,
      employeeId: emb.employeeId,
      caseTitle: emb.caseTitle,
      court: emb.court,
      hasCap: emb.hasCap,
      totalAmount,
      priorAccumulated,
      remainingBalance,
      currentDeducted: 0,
      conceptIds,
      conceptCodes,
    });
  }

  // 4. Pre-indexar catálogos para cálculo O(1) y procesar nómina
  const payrollIndices = buildPayrollIndices({
    allConcepts,
    allMatrices,
    allFixedValues,
    allSalaryScales,
    period,
  });

  let totalGrossPeriod = 0;
  let totalNetPeriod = 0;
  let totalEmployerCostPeriod = 0;
  const activeResults = [];
  const omittedEmployees = [];

  const appliesStatutoryDeductions = settlementTypeConfig
    ? settlementTypeConfig.appliesStatutoryDeductions !== false
    : true;

  for (const emp of employees) {
    const empNovedades = novedadesByEmp.get(emp.id) || [];
    const empHistory = historyByEmp.get(emp.id) || [];
    const empEmbargoes = appliesStatutoryDeductions
      ? (embargoesByEmp.get(emp.id) || []).map((emb) => ({
          ...emb,
          conceptIds: new Set(emb.conceptIds),
          conceptCodes: new Set(emb.conceptCodes),
        }))
      : [];

    const calculation = calculateEmployeePayroll({
      employee: emp,
      period,
      settlementTypeConfig,
      payrollSettings,
      inputItems: empNovedades,
      allConcepts,
      allMatrices,
      allFixedValues,
      allSalaryScales,
      indices: payrollIndices,
      historicalData: {
        slips: empHistory,
      },
      activeEmbargoes: empEmbargoes,
      workedDaysOverride: workedDaysByEmp.has(emp.id) ? workedDaysByEmp.get(emp.id) : null,
      isRetroactiveOnlyInactive: Boolean(
        emp.status !== 'ACTIVE' &&
        settlementTypeConfig?.allowsRetroactives === true &&
        String(period?.periodType || '').toUpperCase() !== 'FINAL'
      ),
    });

    const validConcepts = (calculation.items || []).filter(
      (it) => it.type !== 'AUXILIARY' && Number(it.amount || 0) !== 0
    );
    const hasValidConcepts = validConcepts.length > 0;

    if (!hasValidConcepts) {
      omittedEmployees.push({
        employee: emp,
        reason: 'Sin conceptos liquidados en este período',
      });
      continue;
    }

    totalGrossPeriod += calculation.totals.grossSalary;
    totalNetPeriod += calculation.totals.netSalary;
    totalEmployerCostPeriod += calculation.totals.totalLaborCost;

    activeResults.push({
      employee: emp,
      calculation,
      slipId: null,
    });
  }

  const allProcessedEmpIds = employees.map((e) => e.id);

  // 5. Guardar en transacción atómica optimizada
  await tenantPrisma.$transaction(async (tx) => {
    // 5.1. Consulta masiva de recibos existentes para todos los empleados del lote
    const existingSlips = await tx.paySlip.findMany({
      where: {
        payrollPeriodId: periodId,
        employeeId: { in: allProcessedEmpIds },
      },
      select: { id: true, employeeId: true, status: true },
    });
    const closedTargetSlip = existingSlips.find((s) => s.status === 'CLOSED');
    if (closedTargetSlip) {
      const err = new Error('No se pueden modificar o recalcular recibos que ya se encuentran cerrados.');
      err.status = 400;
      throw err;
    }
    const existingSlipsMap = new Map(existingSlips.map((s) => [s.employeeId, s.id]));

    // 5.2. Eliminar recibos previos de legajos que en esta corrida quedaron sin conceptos
    const omittedSlipsToDelete = omittedEmployees
      .map((o) => existingSlipsMap.get(o.employee.id))
      .filter(Boolean);

    if (omittedSlipsToDelete.length > 0) {
      await tx.paySlipItem.deleteMany({ where: { paySlipId: { in: omittedSlipsToDelete } } });
      await tx.paySlipBasis.deleteMany({ where: { paySlipId: { in: omittedSlipsToDelete } } });
      await tx.paySlip.deleteMany({ where: { id: { in: omittedSlipsToDelete } } });
    }

    // 5.3. Limpieza masiva de items y bases previas para recibos activos que se recalcularán
    const activeSlipIdsToClean = activeResults
      .map((r) => existingSlipsMap.get(r.employee.id))
      .filter(Boolean);

    if (activeSlipIdsToClean.length > 0) {
      await tx.paySlipItem.deleteMany({ where: { paySlipId: { in: activeSlipIdsToClean } } });
      await tx.paySlipBasis.deleteMany({ where: { paySlipId: { in: activeSlipIdsToClean } } });
    }

    // 5.4. Crear o actualizar recibos activos por lotes
    const typePriority = {
      REMUNERATIVE: 1,
      NON_REMUNERATIVE: 2,
      DEDUCTION: 3,
      AUXILIARY: 4,
    };

    const buildPaySlipData = (calculation) => ({
      grossSalary: calculation.totals.grossSalary,
      remunerativeSalary: calculation.totals.totalRemunerative,
      nonRemunerative: calculation.totals.totalNonRemunerative,
      totalDeductions: calculation.totals.totalDeductions,
      netSalary: calculation.totals.netSalary,
      netSalaryWords: calculation.totals.netSalaryWords,
      paymentDate: period.paymentDate,
      paymentMethod: calculation.paymentMethod,
      bankName: calculation.bankName,
      cbu: calculation.cbu,
      workedDays: calculation.workedDays,
      workedHours: calculation.workedHours,
      sipaContrib: calculation.employerContributions.sipaContrib,
      inssjypContrib: calculation.employerContributions.inssjypContrib,
      osContrib: calculation.employerContributions.osContrib,
      fneContrib: calculation.employerContributions.fneContrib,
      aaffContrib: calculation.employerContributions.aaffContrib,
      artContrib: calculation.employerContributions.artContrib,
      scvoContrib: calculation.employerContributions.scvoContrib,
      unionContrib: calculation.employerContributions.unionContrib,
      totalEmployerContrib: calculation.employerContributions.totalEmployerContrib,
      totalLaborCost: calculation.totals.totalLaborCost,
      pctNetSalary: calculation.percentages.pctNetSalary,
      pctEmployeeDeductions: calculation.percentages.pctEmployeeDeductions,
      pctSocialSecurityContrib: calculation.percentages.pctSocialSecurityContrib,
      pctHealthContrib: calculation.percentages.pctHealthContrib,
      pctArtAndInsurance: calculation.percentages.pctArtAndInsurance,
      pctUnionAndChambers: calculation.percentages.pctUnionAndChambers,
      signatureHash: calculation.signatureHash,
      status: 'ISSUED',
    });

    const slipsToCreate = [];
    const slipsToUpdate = [];
    const allItemsToInsert = [];
    const allBasesToInsert = [];

    for (const res of activeResults) {
      const { employee, calculation } = res;
      const slipPayload = buildPaySlipData(calculation);
      let slipId = existingSlipsMap.get(employee.id);

      if (slipId) {
        slipsToUpdate.push({ id: slipId, data: slipPayload });
      } else {
        slipId = crypto.randomUUID();
        slipsToCreate.push({
          id: slipId,
          payrollPeriodId: periodId,
          employeeId: employee.id,
          ...slipPayload,
        });
      }

      res.slipId = slipId;

      // Ordenar items por jerarquía legal: Remunerativos -> No Remunerativos -> Deducciones -> Auxiliares
      const empItems = calculation.items.map((it) => ({
        paySlipId: slipId,
        conceptId: it.conceptId,
        conceptCode: it.conceptCode,
        conceptName: it.conceptName,
        type: it.type,
        units: it.units,
        unitLabel: it.unitLabel,
        rate: it.rate,
        baseAmount: it.baseAmount,
        amount: it.amount,
        arcaConceptCode: it.arcaConceptCode,
        adjustmentPeriod: it.adjustmentPeriod || null,
        formulaExplanation: it.formulaExplanation || null,
        notes: it.notes || null,
      }));

      empItems.sort((a, b) => {
        const pA = typePriority[a.type] || 99;
        const pB = typePriority[b.type] || 99;
        if (pA !== pB) return pA - pB;
        return String(a.conceptCode).localeCompare(String(b.conceptCode), undefined, { numeric: true });
      });

      allItemsToInsert.push(...empItems);
      allBasesToInsert.push({
        paySlipId: slipId,
        ...calculation.basis,
      });
    }

    for (let i = 0; i < slipsToCreate.length; i += 200) {
      await tx.paySlip.createMany({ data: slipsToCreate.slice(i, i + 200) });
    }

    for (let i = 0; i < slipsToUpdate.length; i += 15) {
      const chunk = slipsToUpdate.slice(i, i + 15);
      await Promise.all(
        chunk.map((upd) =>
          tx.paySlip.update({
            where: { id: upd.id },
            data: upd.data,
          })
        )
      );
    }

    for (let i = 0; i < allItemsToInsert.length; i += 1000) {
      await tx.paySlipItem.createMany({ data: allItemsToInsert.slice(i, i + 1000) });
    }

    for (let i = 0; i < allBasesToInsert.length; i += 500) {
      await tx.paySlipBasis.createMany({ data: allBasesToInsert.slice(i, i + 500) });
    }

    // 5.5. Actualizar estado de embargos judiciales que hayan alcanzado su tope de deuda
    const completedEmbargoIds = [];
    const conceptsByEmployee = new Map();

    for (const res of activeResults) {
      const { calculation } = res;
      if (Array.isArray(calculation.activeEmbargoes)) {
        for (const emb of calculation.activeEmbargoes) {
          if (emb.hasCap && emb.remainingBalance !== null && emb.remainingBalance <= 0.01) {
            completedEmbargoIds.push(emb.id);
            const conceptIdList = Array.from(emb.conceptIds || []);
            if (conceptIdList.length > 0) {
              if (!conceptsByEmployee.has(emb.employeeId)) {
                conceptsByEmployee.set(emb.employeeId, new Set());
              }
              const targetSet = conceptsByEmployee.get(emb.employeeId);
              for (const cid of conceptIdList) targetSet.add(cid);
            }
          }
        }
      }
    }

    if (completedEmbargoIds.length > 0) {
      await tx.employeeEmbargo.updateMany({
        where: { id: { in: completedEmbargoIds } },
        data: {
          status: 'COMPLETED',
          endDate: period.paymentDate || new Date(),
        },
      });
    }

    for (const [employeeId, conceptIdSet] of conceptsByEmployee.entries()) {
      await tx.employeeConcept.updateMany({
        where: {
          employeeId,
          conceptId: { in: Array.from(conceptIdSet) },
        },
        data: { isActive: false },
      });
    }

    // Actualizar totales generales de la liquidación con la suma de todos los recibos vigentes del período
    const periodTotals = await tx.paySlip.aggregate({
      where: { payrollPeriodId: periodId, deletedAt: null },
      _sum: {
        grossSalary: true,
        netSalary: true,
        totalLaborCost: true,
      },
    });

    const activeSlipsCount = await tx.paySlip.count({
      where: { payrollPeriodId: periodId, deletedAt: null },
    });

    await tx.payrollPeriod.update({
      where: { id: periodId },
      data: {
        totalGross: periodTotals._sum.grossSalary || 0,
        totalNet: periodTotals._sum.netSalary || 0,
        totalEmployerCost: periodTotals._sum.totalLaborCost || 0,
        status: activeSlipsCount > 0 ? 'CALCULATED' : 'DRAFT',
      },
    });
  }, {
    maxWait: 15000,
    timeout: 60000,
  });

  return {
    periodId,
    processedEmployees: activeResults.length,
    omittedEmployeesCount: omittedEmployees.length,
    omittedEmployees: omittedEmployees.map((o) => ({
      id: o.employee.id,
      fileNumber: o.employee.fileNumber,
      fullName: `${o.employee.lastName}, ${o.employee.firstName}`,
      department: o.employee.department?.name || '-',
      reason: o.reason,
    })),
    warnings: omittedEmployees.length > 0
      ? [`Se omitieron ${omittedEmployees.length} legajo(s) por no registrar conceptos a liquidar en este período.`]
      : [],
    totalGross: Math.round(totalGrossPeriod * 100) / 100,
    totalNet: Math.round(totalNetPeriod * 100) / 100,
    totalEmployerCost: Math.round(totalEmployerCostPeriod * 100) / 100,
    slips: activeResults.map((r) => ({
      paySlipId: r.slipId,
      employeeId: r.employee.id,
      fileNumber: r.employee.fileNumber,
      netSalary: r.calculation?.totals?.netSalary || 0,
    })),
  };
}

// =====================================================================
// LIQUIDACIÓN INDIVIDUAL Y POR LOTE
// =====================================================================

export async function calculateSingleEmployee(tenantPrisma, periodId, employeeId) {
  const result = await calculatePeriod(tenantPrisma, periodId, {
    employeeIds: [employeeId],
  });

  const firstSlip = result.slips && result.slips.length > 0 ? result.slips[0] : null;
  let fullSlip = null;
  if (firstSlip?.paySlipId) {
    fullSlip = await tenantPrisma.paySlip.findUnique({
      where: { id: firstSlip.paySlipId },
      include: {
        items: true,
        employee: {
          include: { department: true },
        },
      },
    });

    if (fullSlip?.items) {
      const typePriority = {
        REMUNERATIVE: 1,
        NON_REMUNERATIVE: 2,
        DEDUCTION: 3,
        AUXILIARY: 4,
      };
      fullSlip.items.sort((a, b) => {
        const pA = typePriority[a.type] || 99;
        const pB = typePriority[b.type] || 99;
        if (pA !== pB) return pA - pB;
        return String(a.conceptCode).localeCompare(String(b.conceptCode), undefined, { numeric: true });
      });
    }
  }

  return {
    ...result,
    paySlipId: firstSlip?.paySlipId || null,
    paySlip: fullSlip,
  };
}

export async function calculateBatchEmployees(tenantPrisma, periodId, employeeIds) {
  return calculatePeriod(tenantPrisma, periodId, {
    employeeIds,
  });
}

/**
 * Agrega en un resumen unificado los conceptos liquidados y las contribuciones patronales
 * a partir de ítems de recibos y recibos de sueldo (de una o múltiples liquidaciones).
 */
function aggregateConceptsAndContributions({ items, allConcepts, paySlips, payrollSettings }) {
  const conceptOrderMap = new Map((allConcepts || []).map((c) => [c.code, c.calculationOrder ?? 999]));
  const conceptsMap = new Map();

  for (const it of items || []) {
    const code = it.conceptCode;
    const rawType = (it.type || '').toUpperCase();
    const normalizedType = rawType === 'DISCOUNT' ? 'DEDUCTION' : rawType;
    const amountNum = Number(it.amount || 0);

    if (!conceptsMap.has(code)) {
      conceptsMap.set(code, {
        code,
        name: it.conceptName,
        type: normalizedType,
        calculationOrder: conceptOrderMap.get(code) ?? 999,
        remunerativeAmount: 0,
        nonRemunerativeAmount: 0,
        deductionAmount: 0,
        employerContribAmount: 0,
        totalAmount: 0,
        employeeIds: new Set(),
        totalUnits: 0,
        unitLabel: it.unitLabel || null,
      });
    }

    const entry = conceptsMap.get(code);
    if (it.paySlip?.employeeId) {
      entry.employeeIds.add(it.paySlip.employeeId);
    }
    if (it.units !== null && it.units !== undefined) {
      entry.totalUnits += Number(it.units || 0);
    }

    if (normalizedType === 'REMUNERATIVE') {
      entry.remunerativeAmount += amountNum;
    } else if (normalizedType === 'NON_REMUNERATIVE') {
      entry.nonRemunerativeAmount += amountNum;
    } else if (normalizedType === 'DEDUCTION') {
      entry.deductionAmount += amountNum;
    }
    entry.totalAmount += amountNum;
  }

  // Agregar los rubros consolidados de contribuciones patronales a pagar (F.931 + ART + SCVO + Sindical)
  for (const def of EMPLOYER_CONTRIBUTION_DEFINITIONS) {
    const empIds = new Set();
    let contribSum = 0;

    for (const slip of paySlips || []) {
      const val = Number(slip[def.field] || 0);
      if (val > 0) {
        contribSum += val;
        if (slip.employeeId) empIds.add(slip.employeeId);
      }
    }

    const roundedSum = Math.round(contribSum * 100) / 100;
    if (roundedSum > 0) {
      const refRate = def.isFixedOnly
        ? Number(payrollSettings?.[def.fixedSettingKey] ?? def.defaultFixed ?? 0)
        : Number(
            def.settingKey && payrollSettings?.[def.settingKey] !== undefined
              ? payrollSettings[def.settingKey]
              : def.defaultRate
          );
      conceptsMap.set(def.code, {
        code: def.code,
        name: def.name,
        type: 'EMPLOYER_CONTRIB',
        calculationOrder: def.order,
        remunerativeAmount: 0,
        nonRemunerativeAmount: 0,
        deductionAmount: 0,
        employerContribAmount: roundedSum,
        totalAmount: roundedSum,
        employeeIds: empIds,
        totalUnits: refRate,
        unitLabel: def.isFixedOnly ? 'Fijo' : '%',
      });
    }
  }

  const conceptsList = Array.from(conceptsMap.values()).map((c) => ({
    code: c.code,
    conceptCode: c.code,
    name: c.name,
    conceptName: c.name,
    type: c.type,
    calculationOrder: c.calculationOrder,
    casesCount: c.employeeIds.size,
    remunerativeAmount: Math.round(c.remunerativeAmount * 100) / 100,
    remunerativeTotal: Math.round(c.remunerativeAmount * 100) / 100,
    nonRemunerativeAmount: Math.round(c.nonRemunerativeAmount * 100) / 100,
    nonRemunerativeTotal: Math.round(c.nonRemunerativeAmount * 100) / 100,
    deductionAmount: Math.round(c.deductionAmount * 100) / 100,
    deductionsTotal: Math.round(c.deductionAmount * 100) / 100,
    employerContribAmount: Math.round((c.employerContribAmount || 0) * 100) / 100,
    employerContribTotal: Math.round((c.employerContribAmount || 0) * 100) / 100,
    totalAmount: Math.round(c.totalAmount * 100) / 100,
    totalUnits: Math.round(c.totalUnits * 100) / 100,
    unitLabel: c.unitLabel,
  }));

  const typeOrder = {
    REMUNERATIVE: 1,
    NON_REMUNERATIVE: 2,
    DEDUCTION: 3,
    EMPLOYER_CONTRIB: 4,
  };

  conceptsList.sort((a, b) => {
    const orderA = typeOrder[a.type] || 99;
    const orderB = typeOrder[b.type] || 99;
    if (orderA !== orderB) return orderA - orderB;
    if (a.calculationOrder !== b.calculationOrder) return a.calculationOrder - b.calculationOrder;
    return String(a.code).localeCompare(String(b.code), undefined, { numeric: true });
  });

  let totalRemunerative = 0;
  let totalNonRemunerative = 0;
  let totalDeductions = 0;
  let totalEmployerContrib = 0;

  for (const c of conceptsList) {
    totalRemunerative += c.remunerativeAmount;
    totalNonRemunerative += c.nonRemunerativeAmount;
    totalDeductions += c.deductionAmount;
    totalEmployerContrib += c.employerContribAmount || 0;
  }

  totalRemunerative = Math.round(totalRemunerative * 100) / 100;
  totalNonRemunerative = Math.round(totalNonRemunerative * 100) / 100;
  totalDeductions = Math.round(totalDeductions * 100) / 100;
  totalEmployerContrib = Math.round(totalEmployerContrib * 100) / 100;
  const totalGross = Math.round((totalRemunerative + totalNonRemunerative) * 100) / 100;
  const totalNet = Math.round((totalGross - totalDeductions) * 100) / 100;
  const totalLaborCost = Math.round((totalGross + totalEmployerContrib) * 100) / 100;

  return {
    conceptsList,
    totalsBase: {
      totalRemunerative,
      totalNonRemunerative,
      totalGross,
      totalDeductions,
      totalNet,
      totalEmployerContrib,
      totalEmployerContributions: totalEmployerContrib,
      totalLaborCost,
      conceptsCount: conceptsList.length,
    },
  };
}

export async function getPeriodConceptsSummary(tenantPrisma, periodId) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const period = await tenantPrisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: {
      fiscalPeriod: true,
      _count: {
        select: { paySlips: { where: { deletedAt: null } } },
      },
    },
  });

  if (!period) {
    const err = new Error('La liquidación / período solicitado no existe');
    err.status = 404;
    throw err;
  }

  const company = await tenantPrisma.companyProfile.findFirst();

  const [items, allConcepts, paySlips, payrollSettings] = await Promise.all([
    tenantPrisma.paySlipItem.findMany({
      where: {
        paySlip: { payrollPeriodId: periodId, deletedAt: null },
        type: { in: ['REMUNERATIVE', 'NON_REMUNERATIVE', 'DEDUCTION', 'DISCOUNT'] },
      },
      include: {
        paySlip: {
          select: { employeeId: true },
        },
      },
    }),
    tenantPrisma.concept.findMany({
      where: { deletedAt: null },
      select: { code: true, calculationOrder: true, type: true },
    }),
    tenantPrisma.paySlip?.findMany
      ? tenantPrisma.paySlip.findMany({
          where: { payrollPeriodId: periodId, deletedAt: null },
          select: {
            employeeId: true,
            sipaContrib: true,
            inssjypContrib: true,
            osContrib: true,
            fneContrib: true,
            aaffContrib: true,
            artContrib: true,
            scvoContrib: true,
            unionContrib: true,
            totalEmployerContrib: true,
          },
        })
      : Promise.resolve([]),
    getPayrollSettings(tenantPrisma).catch(() => ({})),
  ]);

  const { conceptsList, totalsBase } = aggregateConceptsAndContributions({
    items,
    allConcepts,
    paySlips,
    payrollSettings,
  });

  return {
    period: {
      id: period.id,
      settlementName: period.settlementName,
      settlementNumber: period.settlementNumber,
      periodType: period.periodType,
      month: period.month,
      year: period.year,
      status: period.status,
      liquidationDate: period.liquidationDate,
      paymentDate: period.paymentDate,
      fiscalPeriod: period.fiscalPeriod,
      totalSlips: period._count.paySlips,
    },
    company: company || null,
    concepts: conceptsList,
    totals: {
      ...totalsBase,
      totalSlips: period._count.paySlips,
      totalEmployeesCount: period._count.paySlips,
    },
  };
}

/**
 * Obtiene el informe resumen consolidado de TODAS las liquidaciones pertenecientes
 * a un mismo Período Fiscal (por UUID de PayrollFiscalPeriod o clave YYYY-MM).
 */
export async function getFiscalPeriodConceptsSummary(tenantPrisma, fiscalPeriodIdOrKey) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const rawKey = String(fiscalPeriodIdOrKey || '').trim();
  const ymMatch = rawKey.match(/^(\d{4})-(\d{1,2})$/);

  let fiscalPeriod = null;
  let year = null;
  let month = null;

  if (ymMatch) {
    year = Number(ymMatch[1]);
    month = Number(ymMatch[2]);
    fiscalPeriod = await tenantPrisma.payrollFiscalPeriod.findUnique({
      where: { year_month: { year, month } },
    });
  } else if (rawKey) {
    fiscalPeriod = await tenantPrisma.payrollFiscalPeriod.findUnique({
      where: { id: rawKey },
    });
    if (fiscalPeriod) {
      year = fiscalPeriod.year;
      month = fiscalPeriod.month;
    }
  }

  const whereSettlements = fiscalPeriod?.id
    ? { OR: [{ fiscalPeriodId: fiscalPeriod.id }, { year, month }] }
    : year && month
      ? { year, month }
      : null;

  if (!whereSettlements) {
    const err = new Error('El período fiscal solicitado no existe');
    err.status = 404;
    throw err;
  }

  const settlements = await tenantPrisma.payrollPeriod.findMany({
    where: whereSettlements,
    orderBy: [{ settlementNumber: 'asc' }, { createdAt: 'asc' }],
    include: {
      _count: {
        select: { paySlips: { where: { deletedAt: null } } },
      },
    },
  });

  if (!fiscalPeriod && settlements.length === 0) {
    const err = new Error('El período fiscal solicitado no existe');
    err.status = 404;
    throw err;
  }

  const resolvedYear = fiscalPeriod?.year ?? settlements[0]?.year ?? year;
  const resolvedMonth = fiscalPeriod?.month ?? settlements[0]?.month ?? month;
  const monthStr = String(resolvedMonth).padStart(2, '0');
  const settlementIds = settlements.map((s) => s.id);

  const [company, items, allConcepts, paySlips, payrollSettings] = await Promise.all([
    tenantPrisma.companyProfile.findFirst(),
    settlementIds.length > 0
      ? tenantPrisma.paySlipItem.findMany({
          where: {
            paySlip: { payrollPeriodId: { in: settlementIds }, deletedAt: null },
            type: { in: ['REMUNERATIVE', 'NON_REMUNERATIVE', 'DEDUCTION', 'DISCOUNT'] },
          },
          include: {
            paySlip: {
              select: { employeeId: true },
            },
          },
        })
      : Promise.resolve([]),
    tenantPrisma.concept.findMany({
      where: { deletedAt: null },
      select: { code: true, calculationOrder: true, type: true },
    }),
    settlementIds.length > 0 && tenantPrisma.paySlip?.findMany
      ? tenantPrisma.paySlip.findMany({
          where: { payrollPeriodId: { in: settlementIds }, deletedAt: null },
          select: {
            employeeId: true,
            sipaContrib: true,
            inssjypContrib: true,
            osContrib: true,
            fneContrib: true,
            aaffContrib: true,
            artContrib: true,
            scvoContrib: true,
            unionContrib: true,
            totalEmployerContrib: true,
          },
        })
      : Promise.resolve([]),
    getPayrollSettings(tenantPrisma).catch(() => ({})),
  ]);

  const { conceptsList, totalsBase } = aggregateConceptsAndContributions({
    items,
    allConcepts,
    paySlips,
    payrollSettings,
  });

  const uniqueEmployeeIds = new Set((paySlips || []).map((s) => s.employeeId).filter(Boolean));
  const totalSlips = (paySlips || []).length;
  const totalEmployeesCount = uniqueEmployeeIds.size || totalSlips;

  const lastSettlement = settlements[settlements.length - 1] || null;
  const resolvedFiscalPeriod = fiscalPeriod || {
    id: `${resolvedYear}-${monthStr}`,
    year: resolvedYear,
    month: resolvedMonth,
    status: settlements.every((s) => s.status === 'CLOSED') ? 'CLOSED' : 'OPEN',
  };

  return {
    isFiscalPeriodSummary: true,
    fiscalPeriod: resolvedFiscalPeriod,
    settlements: settlements.map((s) => ({
      id: s.id,
      settlementName: s.settlementName,
      settlementNumber: s.settlementNumber,
      periodType: s.periodType,
      status: s.status,
      liquidationDate: s.liquidationDate,
      paymentDate: s.paymentDate,
      paySlipsCount: s._count?.paySlips || 0,
    })),
    period: {
      id: resolvedFiscalPeriod.id,
      settlementName: `Período ${monthStr}/${resolvedYear}`,
      settlementNumber: settlements.length,
      periodType: 'FISCAL_PERIOD',
      month: resolvedMonth,
      year: resolvedYear,
      status: resolvedFiscalPeriod.status,
      liquidationDate: lastSettlement?.liquidationDate || null,
      paymentDate: lastSettlement?.paymentDate || null,
      fiscalPeriod: resolvedFiscalPeriod,
      totalSlips,
      totalEmployees: totalEmployeesCount,
    },
    company: company || null,
    concepts: conceptsList,
    totals: {
      ...totalsBase,
      totalSlips,
      totalEmployeesCount,
      settlementsCount: settlements.length,
    },
  };
}
