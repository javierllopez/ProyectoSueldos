import { ensureTenantPayrollSchema } from '../../services/tenantProvisioner.service.js';
import { calculateEmployeePayroll, findBasicSalaryConcept } from './payroll.calculator.js';
import { generateLsdConceptsFile, generateLsdPayrollFile, validateLsdConsistency } from './lsdExporter.service.js';
import { hoursToDecimal, decimalToHours } from '../../utils/timeFormat.js';
import { validateConceptFormula } from './formulaValidator.js';

/**
 * Servicio de Liquidación de Sueldos, Haberes y Libro de Sueldos Digital (ARCA)
 */

// --- PERIODOS Y LIQUIDACIONES ---

export async function getPeriods(tenantPrisma, { search = '', page = 1, limit = 5, status, year }) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const take = Math.max(1, Math.min(Number(limit) || 5, 100));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = {};
  if (status) where.status = status;
  if (year) where.year = Number(year);
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

  const year = Number(data.year);
  const month = Number(data.month);
  const periodType = data.periodType || data.type || 'MONTHLY';

  // Obtener el siguiente número correlativo de liquidación para el período
  const existingCount = await tenantPrisma.payrollPeriod.count({
    where: { year, month, periodType },
  });
  const settlementNumber = existingCount + 1;

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const defaultName = data.settlementName || data.name || `${periodType === 'MONTHLY' ? 'Mensual' : periodType} - ${monthNames[month - 1]} ${year} (Liq. #${settlementNumber})`;

  return tenantPrisma.payrollPeriod.create({
    data: {
      year,
      month,
      periodType,
      settlementNumber,
      settlementName: defaultName,
      settlementType: data.settlementType || 'M',
      paymentDate: data.paymentDate ? new Date(data.paymentDate) : null,
      paymentPlace: data.paymentPlace || 'Casa Central',
      rubricDate: data.rubricDate ? new Date(data.rubricDate) : null,
      depositDate: data.depositDate ? new Date(data.depositDate) : null,
      depositBank: data.depositBank || null,
      status: 'DRAFT',
    },
  });
}

export async function updatePeriod(tenantPrisma, periodId, data) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const period = await getPeriodById(tenantPrisma, periodId);

  if (period.status === 'CLOSED') {
    const err = new Error('No se puede modificar una liquidación que ha sido cerrada');
    err.status = 400;
    throw err;
  }

  return tenantPrisma.payrollPeriod.update({
    where: { id: periodId },
    data: {
      settlementName: data.settlementName !== undefined ? data.settlementName : period.settlementName,
      settlementType: data.settlementType !== undefined ? data.settlementType : period.settlementType,
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

  // 1. Obtener parámetros, conceptos, matrices y valores fijos
  const [payrollSettings, allConcepts, allMatrices, allFixedValues] = await Promise.all([
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

  // Mapa de novedades agrupadas por employeeId
  const novedadesByEmp = new Map();

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
  }

  // 2. Fusionar novedades adicionales enviadas en la petición si las hubiera
  for (const nov of novedades) {
    if (nov.employeeId) {
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

  // 4. Procesar cálculo para cada empleado
  let totalGrossPeriod = 0;
  let totalNetPeriod = 0;
  let totalEmployerCostPeriod = 0;
  const slipResults = [];

  for (const emp of employees) {
    const empNovedades = novedadesByEmp.get(emp.id) || [];
    const empHistory = historyByEmp.get(emp.id) || [];
    const calculation = calculateEmployeePayroll({
      employee: emp,
      period,
      payrollSettings,
      inputItems: empNovedades,
      allConcepts,
      allMatrices,
      allFixedValues,
      historicalData: {
        slips: empHistory,
      },
    });

    totalGrossPeriod += calculation.totals.grossSalary;
    totalNetPeriod += calculation.totals.netSalary;
    totalEmployerCostPeriod += calculation.totals.totalLaborCost;

    slipResults.push({
      employee: emp,
      calculation,
    });
  }

  // 4. Guardar en transacción atómica
  await tenantPrisma.$transaction(async (tx) => {
    for (const res of slipResults) {
      const { employee, calculation } = res;

      // Buscar si ya existía recibo en este período para el empleado
      const existingSlip = await tx.paySlip.findUnique({
        where: {
          payrollPeriodId_employeeId: {
            payrollPeriodId: periodId,
            employeeId: employee.id,
          },
        },
      });

      let slipId;
      if (existingSlip) {
        slipId = existingSlip.id;
        // Eliminar items y bases previas para recrear con los nuevos cálculos
        await tx.paySlipItem.deleteMany({ where: { paySlipId: slipId } });
        await tx.paySlipBasis.deleteMany({ where: { paySlipId: slipId } });

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

      // Crear items
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
      }));
      await tx.paySlipItem.createMany({ data: itemsToInsert });

      // Crear bases imponibles ARCA F.931
      await tx.paySlipBasis.create({
        data: {
          paySlipId: slipId,
          ...calculation.basis,
        },
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

    await tx.payrollPeriod.update({
      where: { id: periodId },
      data: {
        totalGross: periodTotals._sum.grossSalary || 0,
        totalNet: periodTotals._sum.netSalary || 0,
        totalEmployerCost: periodTotals._sum.totalLaborCost || 0,
        status: 'CALCULATED',
      },
    });
  });

  return {
    periodId,
    processedEmployees: slipResults.length,
    totalGross: Math.round(totalGrossPeriod * 100) / 100,
    totalNet: Math.round(totalNetPeriod * 100) / 100,
    totalEmployerCost: Math.round(totalEmployerCostPeriod * 100) / 100,
    slips: slipResults.map((r) => ({
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

  const take = Math.max(1, Math.min(Number(limit) || 5, 100));
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

export async function getConcepts(tenantPrisma, { search = '', page = 1, limit = 5, type, periodType, isPersistent, scope } = {}) {
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

  // Cargar conceptos, valores fijos y matrices en paralelo para auditoría y validación
  const [allOtherConcepts, fixedValues, matrices] = await Promise.all([
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
  ]);

  let calculationOrder = data.calculationOrder !== undefined && data.calculationOrder !== null
    ? Number(data.calculationOrder)
    : null;
  const noveltyDataType = data.noveltyDataType || 'CANTIDAD';

  // Si no se proveyó orden numérico explícito, determinar orden inteligente
  if (calculationOrder === null || isNaN(calculationOrder)) {
    if (data.calculationType === 'FORMULA' && data.formula) {
      const matches = data.formula.match(/\[([A-Za-z0-9_]+)\]/g) || [];
      const refCodes = new Set(matches.map((m) => m.replace(/\[|\]/g, '').toUpperCase()));
      const maxRefOrder = allOtherConcepts
        .filter((c) => refCodes.has(String(c.code).toUpperCase()))
        .reduce((max, c) => Math.max(max, Number(c.calculationOrder) || 0), 0);
      calculationOrder = Math.max(maxRefOrder + 10, data.type === 'DEDUCTION' ? 120 : (data.type === 'AUXILIARY' ? 25 : 50));
    } else {
      calculationOrder = data.type === 'DEDUCTION' ? 120 : (data.type === 'AUXILIARY' ? 25 : 50);
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
      isRepeatable: Boolean(data.isRepeatable),
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
    const [allOtherConcepts, fixedValues, matrices] = await Promise.all([
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
    ]);
    const validation = validateConceptFormula({
      formula,
      conceptCode: concept.code,
      type: data.type !== undefined ? data.type : concept.type,
      calculationOrder: calcOrder,
      allConcepts: allOtherConcepts,
      fixedValues,
      matrices,
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
      isRepeatable: data.isRepeatable !== undefined ? Boolean(data.isRepeatable) : concept.isRepeatable,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : concept.isActive,
    },
  });
}

export async function validateFormula(tenantPrisma, { formula, conceptCode, conceptType, type, calculationOrder = 100 }) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const [allConcepts, fixedValues, matrices] = await Promise.all([
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
  ]);
  return validateConceptFormula({
    formula,
    conceptCode,
    type: type || conceptType,
    calculationOrder: Number(calculationOrder) || 100,
    allConcepts,
    fixedValues,
    matrices,
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

  const paySlips = await tenantPrisma.paySlip.findMany({
    where: { payrollPeriodId: periodId, deletedAt: null },
    include: {
      employee: {
        include: {
          department: true,
          jobPosition: true,
          healthInsurance: true,
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

  return generateLsdPayrollFile({ company, period, paySlips });
}

export async function validateLsd(tenantPrisma, periodId) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const period = await getPeriodById(tenantPrisma, periodId);

  const paySlips = await tenantPrisma.paySlip.findMany({
    where: { payrollPeriodId: periodId, deletedAt: null },
    include: {
      employee: true,
      items: true,
      basis: true,
    },
  });

  return validateLsdConsistency({ paySlips });
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
        items: {
          orderBy: { conceptCode: 'asc' },
        },
        employee: {
          include: { department: true },
        },
      },
    });
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



