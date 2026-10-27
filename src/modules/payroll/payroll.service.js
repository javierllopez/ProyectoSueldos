import { ensureTenantPayrollSchema } from '../../services/tenantProvisioner.service.js';
import { calculateEmployeePayroll, findBasicSalaryConcept, buildPayrollIndices } from './payroll.calculator.js';
import {
  generateLsdConceptsFile,
  generateLsdPayrollFile,
  validateLsdConsistency,
  generateMonthlyLsdPayrollFile,
  validateMonthlyLsdConsistency,
} from './lsdExporter.service.js';
import { hoursToDecimal, decimalToHours } from '../../utils/timeFormat.js';
import { validateConceptFormula } from './formulaValidator.js';

/**
 * Servicio de Liquidación de Sueldos, Haberes y Libro de Sueldos Digital (ARCA)
 */

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

  return tenantPrisma.payrollFiscalPeriod.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
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
  });

  if (existingPeriod) {
    const err = new Error(`El período ${String(month).padStart(2, '0')}/${year} ya se encuentra registrado.`);
    err.status = 400;
    throw err;
  }

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

export async function closeFiscalPeriod(tenantPrisma, fiscalPeriodId) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const fiscalPeriod = await tenantPrisma.payrollFiscalPeriod.findUnique({
    where: { id: fiscalPeriodId },
    include: { settlements: true },
  });

  if (!fiscalPeriod) {
    const err = new Error('El período fiscal solicitado no existe');
    err.status = 404;
    throw err;
  }

  if (fiscalPeriod.status === 'CLOSED') {
    const err = new Error('El período fiscal ya se encuentra cerrado');
    err.status = 400;
    throw err;
  }

  // Cerrar en cascada todas las liquidaciones abiertas del período
  await tenantPrisma.payrollPeriod.updateMany({
    where: { fiscalPeriodId, status: { not: 'CLOSED' } },
    data: { status: 'CLOSED', closedAt: new Date() },
  });

  return tenantPrisma.payrollFiscalPeriod.update({
    where: { id: fiscalPeriodId },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
    },
    include: {
      settlements: true,
    },
  });
}

// --- LIQUIDACIONES INDIVIDUALES (payroll_periods) ---

export async function getPeriods(tenantPrisma, { search = '', page = 1, limit = 10, status, year, fiscalPeriodId }) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const take = Math.max(1, Math.min(Number(limit) || 10, 100));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = {};
  if (status) where.status = status;
  if (year) where.year = Number(year);
  if (fiscalPeriodId) where.fiscalPeriodId = fiscalPeriodId;
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
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { settlementNumber: 'desc' }],
      include: {
        fiscalPeriod: true,
        _count: {
          select: { paySlips: true },
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
  const periodType = data.periodType || data.type || 'MONTHLY';

  // Obtener el siguiente número correlativo de liquidación para el período fiscal
  const existingCount = await tenantPrisma.payrollPeriod.count({
    where: { fiscalPeriodId },
  });
  const settlementNumber = existingCount + 1;

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const typeNames = {
    MONTHLY: 'Mensual',
    QUINCE_1: '1ra Quincena',
    QUINCE_2: '2da Quincena',
    SAC_1: '1er SAC',
    SAC_2: '2do SAC',
    VACATIONS: 'Vacaciones',
    FINAL: 'Final',
  };
  const defaultName = data.settlementName || data.name || `${typeNames[periodType] || periodType} - ${monthNames[month - 1]} ${year} (Liq. #${settlementNumber})`;

  let liquidationDate = data.liquidationDate ? new Date(data.liquidationDate) : null;
  if (!liquidationDate) {
    if (periodType === 'QUINCE_1') {
      liquidationDate = new Date(year, month - 1, 15);
    } else {
      liquidationDate = new Date(year, month, 0);
    }
  }

  return tenantPrisma.payrollPeriod.create({
    data: {
      fiscalPeriodId,
      year,
      month,
      periodType,
      settlementNumber,
      settlementName: defaultName,
      settlementType: data.settlementType || (periodType.startsWith('QUINCE') ? 'Q' : 'M'),
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

export async function closePeriod(tenantPrisma, periodId) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const period = await getPeriodById(tenantPrisma, periodId);

  return tenantPrisma.payrollPeriod.update({
    where: { id: periodId },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
    },
  });
}

export async function deletePeriod(tenantPrisma, periodId) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const period = await getPeriodById(tenantPrisma, periodId);

  if (period.status === 'CLOSED') {
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

  if (period.status === 'CLOSED') {
    const err = new Error('La liquidación se encuentra cerrada. No es posible recalcular haberes.');
    err.status = 400;
    throw err;
  }

  // 1. Obtener parámetros, conceptos, matrices, valores fijos y escalas salariales
  const [payrollSettings, allConcepts, allMatrices, allFixedValues, allSalaryScales] = await Promise.all([
    getPayrollSettings(tenantPrisma),
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
      salaryScale: true,
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
      notes: dn.notes,
    });
    if (dn.concept.code === 'DIAS_TRABAJADOS' && dn.units !== null) {
      workedDaysByEmp.set(dn.employeeId, Number(dn.units));
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
  });

  let totalGrossPeriod = 0;
  let totalNetPeriod = 0;
  let totalEmployerCostPeriod = 0;
  const activeResults = [];
  const omittedEmployees = [];

  for (const emp of employees) {
    const empNovedades = novedadesByEmp.get(emp.id) || [];
    const empHistory = historyByEmp.get(emp.id) || [];
    const empEmbargoes = (embargoesByEmp.get(emp.id) || []).map((emb) => ({
      ...emb,
      conceptIds: new Set(emb.conceptIds),
      conceptCodes: new Set(emb.conceptCodes),
    }));

    const calculation = calculateEmployeePayroll({
      employee: emp,
      period,
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
      select: { id: true, employeeId: true },
    });
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

    // 5.4. Crear o actualizar recibos activos
    const typePriority = {
      REMUNERATIVE: 1,
      NON_REMUNERATIVE: 2,
      DEDUCTION: 3,
      AUXILIARY: 4,
    };

    for (const res of activeResults) {
      const { employee, calculation } = res;
      let slipId = existingSlipsMap.get(employee.id);

      if (slipId) {
        await tx.paySlip.update({
          where: { id: slipId },
          data: {
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
          },
        });
      } else {
        const created = await tx.paySlip.create({
          data: {
            payrollPeriodId: periodId,
            employeeId: employee.id,
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
          },
        });
        slipId = created.id;
      }

      res.slipId = slipId;

      // Ordenar items por jerarquía legal: Remunerativos -> No Remunerativos -> Deducciones -> Auxiliares
      const itemsToInsert = calculation.items.map((it) => ({
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
        formulaExplanation: it.formulaExplanation || null,
      }));

      itemsToInsert.sort((a, b) => {
        const pA = typePriority[a.type] || 99;
        const pB = typePriority[b.type] || 99;
        if (pA !== pB) return pA - pB;
        return String(a.conceptCode).localeCompare(String(b.conceptCode), undefined, { numeric: true });
      });

      await tx.paySlipItem.createMany({ data: itemsToInsert });

      // Crear bases imponibles ARCA F.931
      await tx.paySlipBasis.create({
        data: {
          paySlipId: slipId,
          ...calculation.basis,
        },
      });
    }

    // 5.5. Actualizar estado de embargos judiciales que hayan alcanzado su tope de deuda
    for (const res of activeResults) {
      const { calculation } = res;
      if (Array.isArray(calculation.activeEmbargoes)) {
        for (const emb of calculation.activeEmbargoes) {
          if (emb.hasCap && emb.remainingBalance !== null && emb.remainingBalance <= 0.01) {
            await tx.employeeEmbargo.update({
              where: { id: emb.id },
              data: {
                status: 'COMPLETED',
                endDate: period.paymentDate || new Date(),
              },
            });

            const conceptIdList = Array.from(emb.conceptIds || []);
            if (conceptIdList.length > 0) {
              await tx.employeeConcept.updateMany({
                where: {
                  employeeId: emb.employeeId,
                  conceptId: { in: conceptIdList },
                },
                data: {
                  isActive: false,
                },
              });
            }
          }
        }
      }
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
        status: activeSlipsCount > 0 ? 'CALCULATED' : 'OPEN',
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

  const slips = await tenantPrisma.paySlip.findMany({
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
          jobPosition: {
            include: {
              cct: true,
              category: true,
            },
          },
          healthInsurance: true,
          union: true,
        },
      },
    },
  });

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

  const slip = await tenantPrisma.paySlip.findUnique({
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
          jobPosition: {
            include: {
              cct: true,
              category: true,
            },
          },
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

  if (!slip) {
    const err = new Error('El recibo solicitado no existe');
    err.status = 404;
    throw err;
  }

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
    include: { payrollPeriod: true },
  });

  if (!slip) {
    const err = new Error('Recibo de sueldo no encontrado');
    err.status = 404;
    throw err;
  }

  if (slip.payrollPeriod?.status === 'CLOSED') {
    const err = new Error('No es posible modificar días trabajados de una liquidación cerrada legalmente');
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

  if (!slip) {
    const err = new Error('Recibo de sueldo no encontrado');
    err.status = 404;
    throw err;
  }

  if (slip.payrollPeriod?.status === 'CLOSED' || slip.payrollPeriod?.fiscalPeriod?.status === 'CLOSED') {
    const err = new Error('No es posible eliminar recibos de una liquidación cerrada legalmente');
    err.status = 400;
    throw err;
  }

  const periodId = slip.payrollPeriodId;

  await tenantPrisma.$transaction(async (tx) => {
    await tx.paySlipBasis.deleteMany({ where: { paySlipId: slipId } });
    await tx.paySlipItem.deleteMany({ where: { paySlipId: slipId } });
    await tx.paySlip.delete({ where: { id: slipId } });

    const remainingSlipsCount = await tx.paySlip.count({ where: { payrollPeriodId: periodId } });
    const periodTotals = await tx.paySlip.aggregate({
      where: { payrollPeriodId: periodId },
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

// --- PARÁMETROS Y ALÍCUOTAS PATRONALES ---

export async function getPayrollSettings(tenantPrisma) {
  await ensureTenantPayrollSchema(tenantPrisma);

  let settings = await tenantPrisma.payrollSetting.findFirst();
  if (!settings) {
    settings = await tenantPrisma.payrollSetting.create({
      data: {
        employerType: 'SERVICIOS_COMERCIO',
        sipaRate: 10.77,
        inssjypRate: 1.58,
        osRate: 6.00,
        fneRate: 0.94,
        aaffRate: 4.70,
        artRate: 3.50,
        artFixedFee: 850.00,
        scvoFee: 650.00,
        detractionBase: 7003.68,
        ansesMinCap: 82287.12,
        ansesMaxCap: 2674292.72,
        standardWeeklyHours: 48.00,
        standardMonthlyHours: 200.00,
      },
    });
  }
  return {
    ...settings,
    standardWeeklyHoursFormatted: decimalToHours(settings.standardWeeklyHours, '48:00'),
    standardMonthlyHoursFormatted: decimalToHours(settings.standardMonthlyHours, '200:00'),
  };
}

export async function updatePayrollSettings(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const current = await getPayrollSettings(tenantPrisma);

  const artRate =
    data.artRate !== undefined
      ? Number(data.artRate)
      : data.contribArtRate !== undefined
      ? Number(data.contribArtRate)
      : current.artRate;
  const artFixedFee =
    data.artFixedFee !== undefined
      ? Number(data.artFixedFee)
      : data.contribArtFixed !== undefined
      ? Number(data.contribArtFixed)
      : current.artFixedFee;
  const ansesMaxCap =
    data.ansesMaxCap !== undefined
      ? Number(data.ansesMaxCap)
      : data.maxRemunerationAnses !== undefined
      ? Number(data.maxRemunerationAnses)
      : current.ansesMaxCap;

  const standardWeeklyHours =
    data.standardWeeklyHours !== undefined
      ? hoursToDecimal(data.standardWeeklyHours, current.standardWeeklyHours || 48.00)
      : current.standardWeeklyHours;
  const standardMonthlyHours =
    data.standardMonthlyHours !== undefined
      ? hoursToDecimal(data.standardMonthlyHours, current.standardMonthlyHours || 200.00)
      : current.standardMonthlyHours;

  const updated = await tenantPrisma.payrollSetting.update({
    where: { id: current.id },
    data: {
      employerType: data.employerType || current.employerType,
      sipaRate: data.sipaRate !== undefined ? Number(data.sipaRate) : current.sipaRate,
      inssjypRate: data.inssjypRate !== undefined ? Number(data.inssjypRate) : current.inssjypRate,
      osRate: data.osRate !== undefined ? Number(data.osRate) : current.osRate,
      fneRate: data.fneRate !== undefined ? Number(data.fneRate) : current.fneRate,
      aaffRate: data.aaffRate !== undefined ? Number(data.aaffRate) : current.aaffRate,
      artRate,
      artFixedFee,
      scvoFee: data.scvoFee !== undefined ? Number(data.scvoFee) : current.scvoFee,
      detractionBase: data.detractionBase !== undefined ? Number(data.detractionBase) : current.detractionBase,
      ansesMinCap: data.ansesMinCap !== undefined ? Number(data.ansesMinCap) : current.ansesMinCap,
      ansesMaxCap,
      standardWeeklyHours,
      standardMonthlyHours,
    },
  });

  return {
    ...updated,
    standardWeeklyHoursFormatted: decimalToHours(updated.standardWeeklyHours, '48:00'),
    standardMonthlyHoursFormatted: decimalToHours(updated.standardMonthlyHours, '200:00'),
  };
}

// --- CONCEPTOS ---

export async function getConcepts(tenantPrisma, { search = '', page = 1, limit = 5, type, periodType, isPersistent, scope, excludeCalculated } = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const take = Math.max(1, Math.min(Number(limit) || 5, 1000));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = { deletedAt: null };
  if (type && type !== 'ALL') where.type = type;
  if (periodType && periodType !== 'ALL') where.periodType = periodType;
  if (isPersistent !== undefined && isPersistent !== null && isPersistent !== 'ALL' && isPersistent !== '') {
    where.isPersistent = isPersistent === true || isPersistent === 'true';
  }
  if (scope && scope !== 'ALL') {
    where.scope = scope;
  }
  if (excludeCalculated === true || excludeCalculated === 'true') {
    where.noveltyDataType = { not: 'CALCULADO' };
  }
  if (search) {
    where.OR = [
      { code: { contains: search } },
      { name: { contains: search } },
      { arcaConceptCode: { contains: search } },
    ];
  }

  const [total, concepts] = await Promise.all([
    tenantPrisma.concept.count({ where }),
    tenantPrisma.concept.findMany({
      where,
      skip,
      take,
      include: { matrix: true },
      orderBy: [{ code: 'asc' }],
    }),
  ]);

  return {
    data: concepts,
    meta: {
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}

export async function createConcept(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const existing = await tenantPrisma.concept.findUnique({
    where: { code: data.code.trim() },
  });
  if (existing) {
    const err = new Error(`Ya existe un concepto con el código "${data.code}"`);
    err.status = 409;
    throw err;
  }

  // Cargar conceptos, valores fijos, matrices y escalas salariales en paralelo para auditoría y validación
  const [allOtherConcepts, fixedValues, matrices, salaryScales] = await Promise.all([
    tenantPrisma.concept.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, calculationOrder: true },
    }),
    tenantPrisma.payrollFixedValue.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, value: true },
    }),
    tenantPrisma.payrollMatrix.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
    tenantPrisma.salaryScale.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, amount: true },
    }),
  ]);

  let calculationOrder = data.calculationOrder !== undefined && data.calculationOrder !== null
    ? Number(data.calculationOrder)
    : null;
  const noveltyDataType = data.noveltyDataType || 'CANTIDAD';

  // Si no se proveyó orden numérico explícito, determinar orden inteligente
  if (calculationOrder === null || isNaN(calculationOrder)) {
    const codeNum = parseInt(String(data.code).replace(/\D/g, '').slice(-4), 10);
    if (data.calculationType === 'FORMULA' && data.formula) {
      const matches = data.formula.match(/\[([A-Za-z0-9_]+)\]/g) || [];
      const refCodes = new Set(matches.map((m) => m.replace(/\[|\]/g, '').toUpperCase()));
      const maxRefOrder = allOtherConcepts
        .filter((c) => refCodes.has(String(c.code).toUpperCase()))
        .reduce((max, c) => Math.max(max, Number(c.calculationOrder) || 0), 0);
      calculationOrder = Math.max(maxRefOrder + 10, (!isNaN(codeNum) && codeNum > 0) ? codeNum : (data.type === 'DEDUCTION' ? 120 : (data.type === 'AUXILIARY' ? 25 : 50)));
    } else {
      calculationOrder = (!isNaN(codeNum) && codeNum > 0) ? codeNum : (data.type === 'DEDUCTION' ? 120 : (data.type === 'AUXILIARY' ? 25 : 50));
    }
  }

  // Validar consistencia y dependencias de la fórmula si aplica
  if (data.calculationType === 'FORMULA' && data.formula) {
    const validation = validateConceptFormula({
      formula: data.formula,
      conceptCode: data.code.trim(),
      type: data.type,
      calculationOrder,
      allConcepts: allOtherConcepts,
      fixedValues,
      matrices,
      salaryScales,
    });
    if (!validation.isValid) {
      const err = new Error(`Fórmula inválida: ${validation.errors.join('; ')}`);
      err.status = 400;
      throw err;
    }
  }

  return tenantPrisma.concept.create({
    data: {
      code: data.code.trim(),
      name: data.name.trim(),
      type: data.type,
      scope: data.scope || 'GENERAL',
      calculationType: data.calculationType || 'FIXED',
      calculationOrder,
      noveltyDataType,
      quantitySource: data.quantitySource || 'AUTO',
      periodType: data.periodType || data.settlementType || 'ALL',
      isPersistent: data.isPersistent !== undefined ? Boolean(data.isPersistent) : true,
      defaultValue: data.defaultValue !== undefined ? Number(data.defaultValue) : 0.00,
      formula: data.formula || null,
      matrixData: data.matrixData || null,
      matrixId: data.matrixId || null,
      arcaConceptCode: data.arcaConceptCode || (data.type === 'DEDUCTION' ? '810000' : '110000'),
      appliesSipaAporte: Boolean(data.appliesSipaAporte),
      appliesSipaContrib: Boolean(data.appliesSipaContrib),
      appliesInssjypAporte: Boolean(data.appliesInssjypAporte),
      appliesInssjypContrib: Boolean(data.appliesInssjypContrib),
      appliesOsAporte: Boolean(data.appliesOsAporte),
      appliesOsContrib: Boolean(data.appliesOsContrib),
      appliesFsrAporte: Boolean(data.appliesFsrAporte),
      appliesFsrContrib: Boolean(data.appliesFsrContrib),
      appliesRenatreAporte: Boolean(data.appliesRenatreAporte),
      appliesRenatreContrib: Boolean(data.appliesRenatreContrib),
      appliesAaffContrib: Boolean(data.appliesAaffContrib),
      appliesFneContrib: Boolean(data.appliesFneContrib),
      appliesLrtContrib: Boolean(data.appliesLrtContrib),
      appliesRegDifAporte: Boolean(data.appliesRegDifAporte),
      appliesRegEspAporte: Boolean(data.appliesRegEspAporte),
      appliesDetraccion: Boolean(data.appliesDetraccion),
      isRepeatable: Boolean(data.isRepeatable),
      isEmbargo: Boolean(data.isEmbargo),
    },
  });
}

export async function updateConcept(tenantPrisma, conceptId, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const concept = await tenantPrisma.concept.findUnique({
    where: { id: conceptId },
  });
  if (!concept) {
    const err = new Error('El concepto solicitado no existe');
    err.status = 404;
    throw err;
  }

  const newPeriodType = data.periodType !== undefined ? data.periodType : data.settlementType;
  const calcOrder = data.calculationOrder !== undefined && data.calculationOrder !== null
    ? Number(data.calculationOrder)
    : (concept.calculationOrder || 100);
  const formula = data.formula !== undefined ? data.formula : concept.formula;
  const calcType = data.calculationType !== undefined ? data.calculationType : concept.calculationType;

  // Validar fórmula si aplica
  if (calcType === 'FORMULA' && formula) {
    const [allOtherConcepts, fixedValues, matrices, salaryScales] = await Promise.all([
      tenantPrisma.concept.findMany({
        where: { deletedAt: null, id: { not: conceptId } },
        select: { id: true, code: true, name: true, calculationOrder: true },
      }),
      tenantPrisma.payrollFixedValue.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true, name: true, value: true },
      }),
      tenantPrisma.payrollMatrix.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true, name: true },
      }),
      tenantPrisma.salaryScale.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true, name: true, amount: true },
      }),
    ]);
    const validation = validateConceptFormula({
      formula,
      conceptCode: concept.code,
      type: data.type !== undefined ? data.type : concept.type,
      calculationOrder: calcOrder,
      allConcepts: allOtherConcepts,
      fixedValues,
      matrices,
      salaryScales,
    });
    if (!validation.isValid) {
      const err = new Error(`Fórmula inválida: ${validation.errors.join('; ')}`);
      err.status = 400;
      throw err;
    }
  }

  return tenantPrisma.concept.update({
    where: { id: conceptId },
    data: {
      name: data.name !== undefined ? data.name.trim() : concept.name,
      type: data.type !== undefined ? data.type : concept.type,
      scope: data.scope !== undefined ? data.scope : concept.scope,
      calculationType: data.calculationType !== undefined ? data.calculationType : concept.calculationType,
      calculationOrder: calcOrder,
      noveltyDataType: data.noveltyDataType !== undefined ? data.noveltyDataType : (concept.noveltyDataType || 'CANTIDAD'),
      quantitySource: data.quantitySource !== undefined ? (data.quantitySource || 'AUTO') : (concept.quantitySource || 'AUTO'),
      periodType: newPeriodType !== undefined ? newPeriodType : concept.periodType,
      isPersistent: data.isPersistent !== undefined ? Boolean(data.isPersistent) : concept.isPersistent,
      defaultValue: data.defaultValue !== undefined ? Number(data.defaultValue) : concept.defaultValue,
      formula: data.formula !== undefined ? data.formula : concept.formula,
      matrixData: data.matrixData !== undefined ? data.matrixData : concept.matrixData,
      matrixId: data.matrixId !== undefined ? (data.matrixId || null) : concept.matrixId,
      arcaConceptCode: data.arcaConceptCode !== undefined ? data.arcaConceptCode : concept.arcaConceptCode,
      appliesSipaAporte: data.appliesSipaAporte !== undefined ? Boolean(data.appliesSipaAporte) : concept.appliesSipaAporte,
      appliesSipaContrib: data.appliesSipaContrib !== undefined ? Boolean(data.appliesSipaContrib) : concept.appliesSipaContrib,
      appliesInssjypAporte: data.appliesInssjypAporte !== undefined ? Boolean(data.appliesInssjypAporte) : concept.appliesInssjypAporte,
      appliesInssjypContrib: data.appliesInssjypContrib !== undefined ? Boolean(data.appliesInssjypContrib) : concept.appliesInssjypContrib,
      appliesOsAporte: data.appliesOsAporte !== undefined ? Boolean(data.appliesOsAporte) : concept.appliesOsAporte,
      appliesOsContrib: data.appliesOsContrib !== undefined ? Boolean(data.appliesOsContrib) : concept.appliesOsContrib,
      appliesFsrAporte: data.appliesFsrAporte !== undefined ? Boolean(data.appliesFsrAporte) : concept.appliesFsrAporte,
      appliesFsrContrib: data.appliesFsrContrib !== undefined ? Boolean(data.appliesFsrContrib) : concept.appliesFsrContrib,
      appliesRenatreAporte: data.appliesRenatreAporte !== undefined ? Boolean(data.appliesRenatreAporte) : concept.appliesRenatreAporte,
      appliesRenatreContrib: data.appliesRenatreContrib !== undefined ? Boolean(data.appliesRenatreContrib) : concept.appliesRenatreContrib,
      appliesAaffContrib: data.appliesAaffContrib !== undefined ? Boolean(data.appliesAaffContrib) : concept.appliesAaffContrib,
      appliesFneContrib: data.appliesFneContrib !== undefined ? Boolean(data.appliesFneContrib) : concept.appliesFneContrib,
      appliesLrtContrib: data.appliesLrtContrib !== undefined ? Boolean(data.appliesLrtContrib) : concept.appliesLrtContrib,
      appliesRegDifAporte: data.appliesRegDifAporte !== undefined ? Boolean(data.appliesRegDifAporte) : concept.appliesRegDifAporte,
      appliesRegEspAporte: data.appliesRegEspAporte !== undefined ? Boolean(data.appliesRegEspAporte) : concept.appliesRegEspAporte,
      appliesDetraccion: data.appliesDetraccion !== undefined ? Boolean(data.appliesDetraccion) : concept.appliesDetraccion,
      isRepeatable: data.isRepeatable !== undefined ? Boolean(data.isRepeatable) : concept.isRepeatable,
      isEmbargo: data.isEmbargo !== undefined ? Boolean(data.isEmbargo) : concept.isEmbargo,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : concept.isActive,
    },
  });
}

export async function validateFormula(tenantPrisma, { formula, conceptCode, conceptType, type, calculationOrder = 100 }) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const [allConcepts, fixedValues, matrices, salaryScales] = await Promise.all([
    tenantPrisma.concept.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, calculationOrder: true },
    }),
    tenantPrisma.payrollFixedValue.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, value: true },
    }),
    tenantPrisma.payrollMatrix.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
    tenantPrisma.salaryScale.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, amount: true },
    }),
  ]);
  return validateConceptFormula({
    formula,
    conceptCode,
    type: type || conceptType,
    calculationOrder: Number(calculationOrder) || 100,
    allConcepts,
    fixedValues,
    matrices,
    salaryScales,
  });
}

export async function deleteConcept(tenantPrisma, conceptId) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const concept = await tenantPrisma.concept.findUnique({
    where: { id: conceptId },
  });
  if (!concept) {
    const err = new Error('El concepto solicitado no existe');
    err.status = 404;
    throw err;
  }

  return tenantPrisma.concept.update({
    where: { id: conceptId },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  });
}

// --- EXPORTACIÓN LIBRO DE SUELDOS DIGITAL (ARCA) ---

export async function exportLsdConcepts(tenantPrisma) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const concepts = await tenantPrisma.concept.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { code: 'asc' },
  });

  return generateLsdConceptsFile(concepts);
}

export async function exportLsdPayroll(tenantPrisma, periodId, company) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const period = await getPeriodById(tenantPrisma, periodId);

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
  const period = await getPeriodById(tenantPrisma, periodId);

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

  const settlements = await tenantPrisma.payrollPeriod.findMany({
    where: { year: period.year, month: period.month },
  });

  return validateLsdConsistency({
    paySlips,
    payrollSettings,
    company: companyProfile || {},
    settlements,
  });
}

export async function getMonthlyLsdPeriods(tenantPrisma) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const periods = await tenantPrisma.payrollPeriod.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { settlementNumber: 'asc' }],
    include: {
      _count: {
        select: { paySlips: { where: { deletedAt: null } } },
      },
    },
  });

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
      periodTypeLabel: typeLabels[p.periodType] || p.periodType,
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

  const settlements = await tenantPrisma.payrollPeriod.findMany({
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
  });

  if (settlements.length === 0) {
    const err = new Error(`No se registraron liquidaciones para el período ${String(numMonth).padStart(2, '0')}/${numYear}`);
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
      periodTypeLabel: typeLabels[s.periodType] || s.periodType,
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

  const settlements = await tenantPrisma.payrollPeriod.findMany({
    where: { year: numYear, month: numMonth },
    orderBy: { settlementNumber: 'asc' },
  });

  if (settlements.length === 0) {
    const err = new Error(`No hay liquidaciones para auditar en el período ${String(numMonth).padStart(2, '0')}/${numYear}`);
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

  const settlements = await tenantPrisma.payrollPeriod.findMany({
    where: { year: numYear, month: numMonth },
    orderBy: { settlementNumber: 'asc' },
  });

  if (settlements.length === 0) {
    const err = new Error(`No hay liquidaciones registradas para el período ${String(numMonth).padStart(2, '0')}/${numYear}`);
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

// --- MATRICES DE LIQUIDACIÓN (LOOKUP MATRICES) ---

export async function getPayrollMatrices(tenantPrisma, { search = '', page = 1, limit = 5, matchType, isActive } = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const take = Math.max(1, Math.min(Number(limit) || 5, 100));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = { deletedAt: null };
  if (matchType) where.matchType = matchType;
  if (isActive !== undefined) where.isActive = String(isActive) === 'true' || isActive === true;
  if (search) {
    where.OR = [
      { code: { contains: search } },
      { name: { contains: search } },
      { inputConceptCode: { contains: search } },
    ];
  }

  const [total, matrices] = await Promise.all([
    tenantPrisma.payrollMatrix.count({ where }),
    tenantPrisma.payrollMatrix.findMany({
      where,
      skip,
      take,
      include: {
        _count: {
          select: { concepts: true },
        },
      },
      orderBy: { code: 'asc' },
    }),
  ]);

  return {
    data: matrices.map((m) => {
      let parsedRows = [];
      try {
        parsedRows = typeof m.rows === 'string' ? JSON.parse(m.rows) : (m.rows || []);
      } catch {
        parsedRows = [];
      }
      return {
        ...m,
        rowsCount: parsedRows.length,
        conceptsCount: m._count?.concepts || 0,
      };
    }),
    meta: {
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}

export async function getPayrollMatrixById(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const matrix = await tenantPrisma.payrollMatrix.findUnique({
    where: { id },
    include: {
      concepts: {
        where: { deletedAt: null },
        select: { id: true, code: true, name: true, type: true },
      },
    },
  });

  if (!matrix || matrix.deletedAt) {
    const err = new Error('La matriz solicitada no existe');
    err.status = 404;
    throw err;
  }

  let parsedRows = [];
  try {
    parsedRows = typeof matrix.rows === 'string' ? JSON.parse(matrix.rows) : (matrix.rows || []);
  } catch {
    parsedRows = [];
  }

  return {
    ...matrix,
    parsedRows,
  };
}

export async function createPayrollMatrix(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const code = data.code.trim().toUpperCase();
  const existing = await tenantPrisma.payrollMatrix.findUnique({
    where: { code },
  });

  if (existing && !existing.deletedAt) {
    const err = new Error(`Ya existe una matriz con el código "${code}"`);
    err.status = 409;
    throw err;
  }

  const rowsJson = typeof data.rows === 'string' ? data.rows : JSON.stringify(data.rows || []);

  return tenantPrisma.payrollMatrix.create({
    data: {
      code,
      name: data.name.trim(),
      description: data.description ? data.description.trim() : null,
      inputConceptCode: data.inputConceptCode.trim(),
      matchType: data.matchType || 'RANGE',
      defaultValue: data.defaultValue !== undefined ? Number(data.defaultValue) : 0.00,
      rows: rowsJson,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    },
  });
}

export async function updatePayrollMatrix(tenantPrisma, id, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const matrix = await tenantPrisma.payrollMatrix.findUnique({
    where: { id },
  });
  if (!matrix || matrix.deletedAt) {
    const err = new Error('La matriz solicitada no existe');
    err.status = 404;
    throw err;
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description ? data.description.trim() : null;
  if (data.inputConceptCode !== undefined) updateData.inputConceptCode = data.inputConceptCode.trim();
  if (data.matchType !== undefined) updateData.matchType = data.matchType;
  if (data.defaultValue !== undefined) updateData.defaultValue = Number(data.defaultValue);
  if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);
  if (data.rows !== undefined) {
    updateData.rows = typeof data.rows === 'string' ? data.rows : JSON.stringify(data.rows || []);
  }

  return tenantPrisma.payrollMatrix.update({
    where: { id },
    data: updateData,
  });
}

export async function deletePayrollMatrix(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const matrix = await tenantPrisma.payrollMatrix.findUnique({
    where: { id },
    include: {
      concepts: { where: { deletedAt: null } },
    },
  });

  if (!matrix || matrix.deletedAt) {
    const err = new Error('La matriz solicitada no existe');
    err.status = 404;
    throw err;
  }

  if (matrix.concepts && matrix.concepts.length > 0) {
    const conceptCodes = matrix.concepts.map((c) => c.code).join(', ');
    const err = new Error(`No es posible eliminar la matriz porque está siendo utilizada por los conceptos: ${conceptCodes}`);
    err.status = 400;
    throw err;
  }

  return tenantPrisma.payrollMatrix.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

// --- VALORES GLOBALES FIJOS (CONSTANTES DE LIQUIDACIÓN) ---

export async function getPayrollFixedValues(tenantPrisma, { search = '', page = 1, limit = 5, isActive }) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const take = Math.max(1, Math.min(Number(limit) || 5, 100));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = { deletedAt: null };
  if (isActive !== undefined && isActive !== 'ALL' && isActive !== '') {
    where.isActive = String(isActive) === 'true' || isActive === true;
  }
  if (search && String(search).trim() !== '') {
    const q = String(search).trim();
    where.OR = [
      { code: { contains: q } },
      { name: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const [total, fixedValues] = await Promise.all([
    tenantPrisma.payrollFixedValue.count({ where }),
    tenantPrisma.payrollFixedValue.findMany({
      where,
      skip,
      take,
      orderBy: { code: 'asc' },
    }),
  ]);

  return {
    data: fixedValues,
    meta: {
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}

export async function getPayrollFixedValueById(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const fixedValue = await tenantPrisma.payrollFixedValue.findUnique({
    where: { id },
  });

  if (!fixedValue || fixedValue.deletedAt) {
    const err = new Error('El valor fijo solicitado no existe');
    err.status = 404;
    throw err;
  }

  return fixedValue;
}

export async function createPayrollFixedValue(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const code = String(data.code).trim().toUpperCase().replace(/\s+/g, '_');
  const existing = await tenantPrisma.payrollFixedValue.findUnique({
    where: { code },
  });

  if (existing && !existing.deletedAt) {
    const err = new Error(`Ya existe un valor fijo con el código "${code}"`);
    err.status = 409;
    throw err;
  }

  if (existing && existing.deletedAt) {
    // Si existía pero estaba borrado, reactivarlo con los nuevos datos
    return tenantPrisma.payrollFixedValue.update({
      where: { id: existing.id },
      data: {
        code,
        name: data.name.trim(),
        description: data.description ? data.description.trim() : null,
        value: Number(data.value || 0),
        unit: data.unit ? data.unit.trim() : '$',
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
        deletedAt: null,
      },
    });
  }

  return tenantPrisma.payrollFixedValue.create({
    data: {
      code,
      name: data.name.trim(),
      description: data.description ? data.description.trim() : null,
      value: Number(data.value || 0),
      unit: data.unit ? data.unit.trim() : '$',
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    },
  });
}

export async function updatePayrollFixedValue(tenantPrisma, id, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const fixedValue = await tenantPrisma.payrollFixedValue.findUnique({
    where: { id },
  });

  if (!fixedValue || fixedValue.deletedAt) {
    const err = new Error('El valor fijo solicitado no existe');
    err.status = 404;
    throw err;
  }

  const updateData = {};
  if (data.code !== undefined) {
    const newCode = String(data.code).trim().toUpperCase().replace(/\s+/g, '_');
    if (newCode !== fixedValue.code) {
      const codeConflict = await tenantPrisma.payrollFixedValue.findUnique({
        where: { code: newCode },
      });
      if (codeConflict && codeConflict.id !== id && !codeConflict.deletedAt) {
        const err = new Error(`Ya existe otro valor fijo con el código "${newCode}"`);
        err.status = 409;
        throw err;
      }
      updateData.code = newCode;
    }
  }

  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description ? data.description.trim() : null;
  if (data.value !== undefined) updateData.value = Number(data.value);
  if (data.unit !== undefined) updateData.unit = data.unit.trim();
  if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);

  return tenantPrisma.payrollFixedValue.update({
    where: { id },
    data: updateData,
  });
}

export async function deletePayrollFixedValue(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const fixedValue = await tenantPrisma.payrollFixedValue.findUnique({
    where: { id },
  });

  if (!fixedValue || fixedValue.deletedAt) {
    const err = new Error('El valor fijo solicitado no existe');
    err.status = 404;
    throw err;
  }

  // Verificar si algún concepto activo utiliza este valor fijo en su fórmula
  const concepts = await tenantPrisma.concept.findMany({
    where: { isActive: true, deletedAt: null, calculationType: 'FORMULA' },
    select: { code: true, name: true, formula: true },
  });

  const matchingConcepts = concepts.filter((c) => {
    if (!c.formula) return false;
    const fUpper = c.formula.toUpperCase();
    return (
      fUpper.includes(`[${fixedValue.code}]`) ||
      fUpper.includes(`[VALOR:${fixedValue.code}]`) ||
      fUpper.includes(`[FIJO:${fixedValue.code}]`) ||
      fUpper.includes(`[CONST:${fixedValue.code}]`) ||
      fUpper.includes(`[VALOR:${fixedValue.name.toUpperCase()}]`)
    );
  });

  if (matchingConcepts.length > 0) {
    const list = matchingConcepts.map((c) => `${c.code} (${c.name})`).join(', ');
    const err = new Error(`No es posible eliminar el valor fijo porque está siendo utilizado en las fórmulas de los conceptos: ${list}`);
    err.status = 400;
    throw err;
  }

  return tenantPrisma.payrollFixedValue.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

// =====================================================================
// NOVEDADES NO PERSISTENTES DE PERÍODO (period_novelties)
// =====================================================================

export async function listPeriodNovelties(tenantPrisma, periodId, { employeeId, conceptId } = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const where = { payrollPeriodId: periodId };
  if (employeeId) where.employeeId = employeeId;
  if (conceptId) where.conceptId = conceptId;

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
  if (!concept || concept.deletedAt) {
    const err = new Error('El concepto especificado no existe');
    err.status = 400;
    throw err;
  }
  if (String(concept.scope || '').toUpperCase() !== 'INDIVIDUAL') {
    const err = new Error(`Solo pueden asignarse conceptos con alcance INDIVIDUAL. El concepto ${concept.code} es GENERAL.`);
    err.status = 400;
    throw err;
  }
  if (concept.isPersistent) {
    const err = new Error(`El concepto ${concept.code} (${concept.name}) es persistente. Debe gestionarse en Novedades Persistentes.`);
    err.status = 400;
    throw err;
  }

  // Validación estricta de compatibilidad de concepto vs liquidación
  const pType = (period.periodType || 'MONTHLY').toUpperCase();
  const cPeriodType = (concept.periodType || 'MONTHLY').toUpperCase();

  if (pType === 'MONTHLY' && cPeriodType === 'VACATIONS') {
    const err = new Error(`No se pueden cargar conceptos de tipo VACACIONES (${concept.code} - ${concept.name}) en una liquidación de tipo MENSUAL.`);
    err.status = 400;
    throw err;
  }
  if (pType === 'VACATIONS' && cPeriodType !== 'VACATIONS') {
    const err = new Error(`En una liquidación de VACACIONES solo pueden cargarse conceptos del tipo VACACIONES. El concepto ${concept.code} es ${cPeriodType}.`);
    err.status = 400;
    throw err;
  }
  if (pType !== 'VACATIONS' && cPeriodType === 'VACATIONS') {
    const err = new Error(`El concepto ${concept.code} (${concept.name}) es de tipo VACACIONES y solo puede cargarse en una liquidación de VACACIONES.`);
    err.status = 400;
    throw err;
  }
  if ((pType === 'SAC_1' || pType === 'SAC_2') && cPeriodType !== 'SAC' && cPeriodType !== 'SAC_1' && cPeriodType !== 'SAC_2' && cPeriodType !== 'MONTHLY') {
    const err = new Error(`En una liquidación de SAC solo pueden cargarse conceptos correspondientes a SAC.`);
    err.status = 400;
    throw err;
  }
  if (pType === 'FINAL' && cPeriodType !== 'FINAL' && cPeriodType !== 'MONTHLY') {
    const err = new Error(`El concepto ${concept.code} no corresponde a liquidaciones FINALES.`);
    err.status = 400;
    throw err;
  }

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

  const period = await tenantPrisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) {
    const err = new Error('La liquidación / período solicitado no existe');
    err.status = 404;
    throw err;
  }
  if (period.status === 'CLOSED') {
    const err = new Error('No se pueden modificar novedades en una liquidación cerrada');
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

export async function batchUpsertPeriodNovelties(tenantPrisma, periodId, items) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const period = await tenantPrisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) {
    const err = new Error('La liquidación / período solicitado no existe');
    err.status = 404;
    throw err;
  }
  if (period.status === 'CLOSED') {
    const err = new Error('No se pueden modificar novedades en una liquidación cerrada');
    err.status = 400;
    throw err;
  }

  const results = [];
  for (const item of items) {
    const saved = await upsertPeriodNovelty(tenantPrisma, periodId, item);
    results.push(saved);
  }

  return {
    savedCount: results.length,
    processedCount: results.length,
    data: results,
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

export async function getPeriodConceptsSummary(tenantPrisma, periodId) {
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

  const company = await tenantPrisma.companyProfile.findFirst();

  const [items, allConcepts] = await Promise.all([
    tenantPrisma.paySlipItem.findMany({
      where: {
        paySlip: { payrollPeriodId: periodId },
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
  ]);

  const conceptOrderMap = new Map(allConcepts.map((c) => [c.code, c.calculationOrder ?? 999]));

  const conceptsMap = new Map();

  for (const it of items) {
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
    totalAmount: Math.round(c.totalAmount * 100) / 100,
    totalUnits: Math.round(c.totalUnits * 100) / 100,
    unitLabel: c.unitLabel,
  }));

  const typeOrder = {
    REMUNERATIVE: 1,
    NON_REMUNERATIVE: 2,
    DEDUCTION: 3,
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

  for (const c of conceptsList) {
    totalRemunerative += c.remunerativeAmount;
    totalNonRemunerative += c.nonRemunerativeAmount;
    totalDeductions += c.deductionAmount;
  }

  totalRemunerative = Math.round(totalRemunerative * 100) / 100;
  totalNonRemunerative = Math.round(totalNonRemunerative * 100) / 100;
  totalDeductions = Math.round(totalDeductions * 100) / 100;
  const totalGross = Math.round((totalRemunerative + totalNonRemunerative) * 100) / 100;
  const totalNet = Math.round((totalGross - totalDeductions) * 100) / 100;

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
      totalRemunerative,
      totalNonRemunerative,
      totalGross,
      totalDeductions,
      totalNet,
      totalSlips: period._count.paySlips,
      conceptsCount: conceptsList.length,
    },
  };
}
