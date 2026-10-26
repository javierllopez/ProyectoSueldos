import crypto from 'crypto';
import { ensureTenantIncomeTaxSchema } from '../../services/tenantProvisioner.service.js';
import { calculateEmployeeIncomeTax } from './incomeTax.calculator.js';
import {
  seedIncomeTaxDefaultsForYear,
  getIncomeTaxTableByPeriod,
  listIncomeTaxScales,
  listGeneralDeductionLimits,
} from './incomeTaxTable.service.js';

/**
 * Ejecuta la liquidación mensual acumulativa de Impuesto a las Ganancias Cuarta Categoría.
 */
export async function calculateMonthlyIncomeTax(
  tenantPrisma,
  { fiscalYear, month, settlementType = 'MONTHLY', employeeIds = null, description = null }
) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);

  const year = parseInt(fiscalYear, 10);
  const targetMonth = parseInt(month, 10);

  // 1. Asegurar tablas impositivas
  await seedIncomeTaxDefaultsForYear(tenantPrisma, year);
  const taxTable = await getIncomeTaxTableByPeriod(tenantPrisma, year, targetMonth);
  if (!taxTable) {
    const error = new Error(`No se encontró la tabla de deducciones del Art. 30 para ${targetMonth}/${year}`);
    error.status = 400;
    throw error;
  }

  const taxScales = await listIncomeTaxScales(tenantPrisma, { year, month: targetMonth });
  const generalLimits = await listGeneralDeductionLimits(tenantPrisma, { year });

  // 2. Obtener empleados a evaluar
  const whereEmp = { deletedAt: null };
  if (employeeIds && Array.isArray(employeeIds) && employeeIds.length > 0) {
    whereEmp.id = { in: employeeIds };
  }

  const employees = await tenantPrisma.employee.findMany({
    where: whereEmp,
    include: {
      salaryScale: true,
      relatives: {
        where: { deletedAt: null },
        include: { kinship: true },
      },
    },
  });

  // 3. Crear o resetear cabecera de IncomeTaxSettlement
  let settlement = await tenantPrisma.incomeTaxSettlement.findUnique({
    where: {
      fiscalYear_month_settlementType: {
        fiscalYear: year,
        month: targetMonth,
        settlementType,
      },
    },
  });

  if (settlement) {
    // Si ya existía, limpiar detalles previos para recalcular limpiamente
    await tenantPrisma.incomeTaxSettlementDetail.deleteMany({
      where: { settlementId: settlement.id },
    });
  } else {
    settlement = await tenantPrisma.incomeTaxSettlement.create({
      data: {
        id: crypto.randomUUID(),
        fiscalYear: year,
        month: targetMonth,
        settlementType,
        status: 'CALCULATED',
        description: description || `Liquidación Ganancias 4ta Cat. ${targetMonth}/${year}`,
      },
    });
  }

  let totalWithheldAmount = 0;
  let totalRefundAmount = 0;
  let totalEmployeesWithheld = 0;
  const calculatedDetails = [];

  for (const emp of employees) {
    // A. Recibos de sueldo del año hasta el mes actual
    const paySlips = await tenantPrisma.paySlip.findMany({
      where: {
        employeeId: emp.id,
        payrollPeriod: {
          year,
          month: { lte: targetMonth },
        },
      },
      include: {
        payrollPeriod: true,
      },
      orderBy: {
        payrollPeriod: { month: 'asc' },
      },
    });

    let currentMonthGross = 0;
    let priorMonthsGross = 0;
    let currentMonthLegalDeductions = 0;
    let priorMonthsLegalDeductions = 0;
    let actualSacAmount = 0;

    for (const slip of paySlips) {
      const pMonth = slip.payrollPeriod.month;
      const isSac = slip.payrollPeriod.periodType.startsWith('SAC');
      const gross = Number(slip.remunerativeSalary || slip.grossSalary || 0);
      const deductions = Number(slip.totalDeductions || 0);

      if (pMonth === targetMonth) {
        if (isSac) {
          actualSacAmount += gross;
        } else {
          currentMonthGross += gross;
          currentMonthLegalDeductions += deductions;
        }
      } else {
        priorMonthsGross += gross;
        priorMonthsLegalDeductions += deductions;
      }
    }

    // Si aún no se corrió el período de sueldos del mes actual, estimar con el básico
    if (currentMonthGross === 0 && paySlips.length === 0) {
      const basic = Number(emp.basicSalary || emp.salaryScale?.amount || 0);
      currentMonthGross = basic;
      // 17% aportes de ley (11% jubilación, 3% INSSJyP, 3% obra social)
      currentMonthLegalDeductions = Math.round(basic * 0.17 * 100) / 100;
    }

    // B. Doceava parte acumulada en liquidaciones de ganancias previas
    const priorDetails = await tenantPrisma.incomeTaxSettlementDetail.findMany({
      where: {
        employeeId: emp.id,
        settlement: {
          fiscalYear: year,
          month: { lt: targetMonth },
        },
      },
      include: { settlement: true },
      orderBy: { settlement: { month: 'asc' } },
    });

    let priorSacProjectedAccumulated = 0;
    let priorMonthsWithheldTax = 0;

    for (const pd of priorDetails) {
      priorSacProjectedAccumulated += Number(pd.sacProjectedMonth || 0);
      priorMonthsWithheldTax += Number(pd.netMonthlyWithholding || 0);
    }

    // C. Otros ingresos (pluriempleo)
    const otherIncomes = await tenantPrisma.employeeOtherIncome.findMany({
      where: {
        employeeId: emp.id,
        fiscalYear: year,
      },
    });

    // D. Deducciones Generales y Cargas Familiares del Ejercicio Fiscal
    const allDeductions = await tenantPrisma.employeeIncomeTaxDeduction.findMany({
      where: {
        employeeId: emp.id,
        fiscalYear: year,
      },
    });

    const generalDeductions = [];
    const empRelatives = [...(emp.relatives || [])];

    for (const d of allDeductions) {
      if (d.deductionType && d.deductionType.startsWith('CARGA_FAMILIA_')) {
        let meta = {};
        try {
          meta = JSON.parse(d.notes || '{}');
        } catch (e) {}

        const rawTaxType = d.deductionType.replace('CARGA_FAMILIA_', '');
        empRelatives.push({
          id: d.id,
          lastName: meta.lastName || d.providerName || 'Familiar Declarado SiRADIG',
          firstName: meta.firstName || '',
          documentNumber: d.voucherNumber || meta.documentNumber || '',
          birthDate: meta.birthDate ? new Date(meta.birthDate) : new Date(year - 5, 0, 1),
          appliesIncomeTax: true,
          incomeTaxDeductionType: rawTaxType,
          deductionPercentage: Number(meta.deductionPercentage || 100),
          isDisability: Boolean(meta.isDisability),
          hasNoIncomeOrBelowMni: true,
          validFromMonth: meta.fromMonth || 1,
          validToMonth: meta.toMonth || 12,
          isFiscalOnly: true,
        });
      } else {
        generalDeductions.push(d);
      }
    }

    // E. Pagos a Cuenta
    const paymentsOnAccount = await tenantPrisma.employeeIncomeTaxPaymentOnAccount.findMany({
      where: {
        employeeId: emp.id,
        fiscalYear: year,
      },
    });

    // Ejecutar cálculo del motor
    const calcResult = calculateEmployeeIncomeTax({
      employee: { ...emp, relatives: empRelatives },
      fiscalYear: year,
      month: targetMonth,
      currentMonthGross,
      priorMonthsGross,
      currentMonthLegalDeductions,
      priorMonthsLegalDeductions,
      actualSacAmount,
      priorSacProjectedAccumulated,
      otherIncomes,
      generalDeductions,
      paymentsOnAccount,
      taxTable,
      taxScales,
      generalLimits,
      priorMonthsWithheldTax,
    });

    // Guardar detalle individual
    const detail = await tenantPrisma.incomeTaxSettlementDetail.create({
      data: {
        id: crypto.randomUUID(),
        settlementId: settlement.id,
        employeeId: emp.id,
        currentMonthGross: calcResult.currentMonthGross,
        accumulatedGross: calcResult.accumulatedGross,
        sacProjectedMonth: calcResult.sacProjectedMonth,
        sacProjectedAccumulated: calcResult.sacProjectedAccumulated,
        otherEmployersGross: calcResult.otherEmployersGross,
        legalDeductionsAccumulated: calcResult.legalDeductionsAccumulated,
        generalDeductionsAccumulated: calcResult.generalDeductionsAccumulated,
        personalDeductionsAccumulated: calcResult.personalDeductionsAccumulated,
        familyDeductionDetails: calcResult.familyDeductionDetails,
        netTaxableIncomeAccumulated: calcResult.netTaxableIncomeAccumulated,
        determinedTaxAccumulated: calcResult.determinedTaxAccumulated,
        paymentsOnAccountAccumulated: calcResult.paymentsOnAccountAccumulated,
        priorMonthsWithheldTax: calcResult.priorMonthsWithheldTax,
        netMonthlyWithholding: calcResult.netMonthlyWithholding,
        isExportedToPayroll: false,
        notes: calcResult.isWithholding
          ? `Retención del período: $${calcResult.withholdingAmount}`
          : calcResult.isRefund
          ? `Saldo a favor del contribuyente (reintegro): $${calcResult.refundAmount}`
          : 'Sin saldo a retener ni reintegrar',
      },
    });

    if (calcResult.isWithholding) {
      totalWithheldAmount += calcResult.withholdingAmount;
      totalEmployeesWithheld++;
    } else if (calcResult.isRefund) {
      totalRefundAmount += calcResult.refundAmount;
    }

    calculatedDetails.push({
      ...calcResult,
      detailId: detail.id,
      employeeName: `${emp.lastName}, ${emp.firstName}`,
      employeeCuil: emp.cuil,
    });
  }

  // 4. Actualizar totales del encabezado
  const updatedSettlement = await tenantPrisma.incomeTaxSettlement.update({
    where: { id: settlement.id },
    data: {
      totalEmployeesEvaluated: employees.length,
      totalEmployeesWithheld,
      totalWithheldAmount: Math.round(totalWithheldAmount * 100) / 100,
      totalRefundAmount: Math.round(totalRefundAmount * 100) / 100,
      status: 'CALCULATED',
    },
  });

  return {
    settlement: updatedSettlement,
    evaluatedEmployeesCount: employees.length,
    employeesWithheldCount: totalEmployeesWithheld,
    totalWithheldAmount: Math.round(totalWithheldAmount * 100) / 100,
    totalRefundAmount: Math.round(totalRefundAmount * 100) / 100,
    details: calculatedDetails,
  };
}

/**
 * Obtiene el listado de liquidaciones de Ganancias.
 */
export async function listSettlements(tenantPrisma, { fiscalYear } = {}) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);
  const where = {};
  if (fiscalYear) where.fiscalYear = parseInt(fiscalYear, 10);

  return tenantPrisma.incomeTaxSettlement.findMany({
    where,
    orderBy: [{ fiscalYear: 'desc' }, { month: 'desc' }],
  });
}

/**
 * Obtiene el detalle completo de una liquidación de Ganancias.
 */
export async function getSettlementById(tenantPrisma, settlementId) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);

  const settlement = await tenantPrisma.incomeTaxSettlement.findUnique({
    where: { id: settlementId },
    include: {
      details: {
        include: {
          employee: {
            select: {
              id: true,
              fileNumber: true,
              firstName: true,
              lastName: true,
              cuil: true,
            },
          },
        },
        orderBy: {
          employee: {
            lastName: 'asc',
          },
        },
      },
    },
  });

  if (!settlement) {
    const error = new Error('Liquidación de Ganancias no encontrada');
    error.status = 404;
    throw error;
  }

  return settlement;
}

/**
 * Exporta los saldos calculados (retenciones y reintegros) a la nómina de sueldos como Novedades del Período.
 * Valida los códigos oficiales de ARCA: 820000 para retención y 520002 para devolución.
 */
export async function exportSettlementToPayroll(
  tenantPrisma,
  settlementId,
  { payrollPeriodId, periodId, withholdingConceptId, refundConceptId }
) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);

  const targetPeriodId = payrollPeriodId || periodId;

  const settlement = await tenantPrisma.incomeTaxSettlement.findUnique({
    where: { id: settlementId },
    include: {
      details: true,
    },
  });

  if (!settlement) {
    const error = new Error('Liquidación de Ganancias no encontrada');
    error.status = 404;
    throw error;
  }

  // 1. Validar período de liquidación destino
  const payrollPeriod = await tenantPrisma.payrollPeriod.findUnique({
    where: { id: targetPeriodId },
    include: { paySlips: true },
  });

  if (!payrollPeriod) {
    const error = new Error('El período de liquidación de haberes seleccionado no existe');
    error.status = 400;
    throw error;
  }

  if (payrollPeriod.status === 'CLOSED') {
    const error = new Error('No se pueden exportar novedades a un período de sueldos cerrado');
    error.status = 400;
    throw error;
  }

  // 2. Validar concepto de retención seleccionado (debe tener código ARCA 820000)
  let withholdingConcept = null;
  if (withholdingConceptId) {
    withholdingConcept = await tenantPrisma.concept.findUnique({
      where: { id: withholdingConceptId },
    });
  } else {
    // Si no lo envió, buscar concepto predeterminado SU8200 o con código ARCA 820000
    withholdingConcept = await tenantPrisma.concept.findFirst({
      where: { arcaConceptCode: '820000', deletedAt: null },
    });
  }

  if (!withholdingConcept) {
    const error = new Error('No se encontró un concepto de retención válido con codificación ARCA 820000');
    error.status = 400;
    throw error;
  }

  if (withholdingConcept.arcaConceptCode !== '820000') {
    const error = new Error(
      `El concepto seleccionado "${withholdingConcept.name}" (${withholdingConcept.code}) tiene código ARCA "${withholdingConcept.arcaConceptCode}". Para retenciones de Ganancias 4ta Categoría es mandatorio el código ARCA 820000.`
    );
    error.status = 400;
    throw error;
  }

  // 3. Validar concepto de reintegro seleccionado (debe tener código ARCA 520002)
  let refundConcept = null;
  if (refundConceptId) {
    refundConcept = await tenantPrisma.concept.findUnique({
      where: { id: refundConceptId },
    });
  } else {
    // Buscar concepto predeterminado SU5200 o con código ARCA 520002
    refundConcept = await tenantPrisma.concept.findFirst({
      where: { arcaConceptCode: '520002', deletedAt: null },
    });
  }

  if (!refundConcept) {
    const error = new Error('No se encontró un concepto de reintegro válido con codificación ARCA 520002');
    error.status = 400;
    throw error;
  }

  if (refundConcept.arcaConceptCode !== '520002') {
    const error = new Error(
      `El concepto de reintegro seleccionado "${refundConcept.name}" (${refundConcept.code}) tiene código ARCA "${refundConcept.arcaConceptCode}". Para reintegros de Ganancias es mandatorio el código ARCA 520002.`
    );
    error.status = 400;
    throw error;
  }

  // 4. Crear o actualizar las novedades del período (PeriodNovelty)
  let exportedWithholdingsCount = 0;
  let exportedRefundsCount = 0;

  for (const detail of settlement.details) {
    const net = Number(detail.netMonthlyWithholding);

    if (net > 0) {
      // Retención
      const existingNovelty = await tenantPrisma.periodNovelty.findFirst({
        where: {
          payrollPeriodId: targetPeriodId,
          employeeId: detail.employeeId,
          conceptId: withholdingConcept.id,
        },
      });

      if (existingNovelty) {
        await tenantPrisma.periodNovelty.update({
          where: { id: existingNovelty.id },
          data: {
            amount: net,
            units: 1,
            notes: `Retención Ganancias 4ta Cat. Mes ${settlement.month}/${settlement.fiscalYear}`,
          },
        });
      } else {
        await tenantPrisma.periodNovelty.create({
          data: {
            id: crypto.randomUUID(),
            payrollPeriodId: targetPeriodId,
            employeeId: detail.employeeId,
            conceptId: withholdingConcept.id,
            amount: net,
            units: 1,
            notes: `Retención Ganancias 4ta Cat. Mes ${settlement.month}/${settlement.fiscalYear}`,
          },
        });
      }

      await tenantPrisma.incomeTaxSettlementDetail.update({
        where: { id: detail.id },
        data: { isExportedToPayroll: true },
      });
      exportedWithholdingsCount++;
    } else if (net < 0) {
      // Reintegro / Devolución
      const refundAmount = Math.abs(net);
      const existingNovelty = await tenantPrisma.periodNovelty.findFirst({
        where: {
          payrollPeriodId: targetPeriodId,
          employeeId: detail.employeeId,
          conceptId: refundConcept.id,
        },
      });

      if (existingNovelty) {
        await tenantPrisma.periodNovelty.update({
          where: { id: existingNovelty.id },
          data: {
            amount: refundAmount,
            units: 1,
            notes: `Devolución Saldo a Favor Ganancias 4ta Cat. Mes ${settlement.month}/${settlement.fiscalYear}`,
          },
        });
      } else {
        await tenantPrisma.periodNovelty.create({
          data: {
            id: crypto.randomUUID(),
            payrollPeriodId: targetPeriodId,
            employeeId: detail.employeeId,
            conceptId: refundConcept.id,
            amount: refundAmount,
            units: 1,
            notes: `Devolución Saldo a Favor Ganancias 4ta Cat. Mes ${settlement.month}/${settlement.fiscalYear}`,
          },
        });
      }

      await tenantPrisma.incomeTaxSettlementDetail.update({
        where: { id: detail.id },
        data: { isExportedToPayroll: true },
      });
      exportedRefundsCount++;
    }
  }

  // 5. Actualizar el estado de la liquidación de Ganancias
  await tenantPrisma.incomeTaxSettlement.update({
    where: { id: settlementId },
    data: {
      status: 'EXPORTED_TO_PAYROLL',
      withholdingConceptId: withholdingConcept.id,
      refundConceptId: refundConcept.id,
      exportedPayrollPeriodId: targetPeriodId,
      exportedAt: new Date(),
    },
  });

  const requiresRecalculation = payrollPeriod.paySlips.length > 0;

  return {
    settlementId,
    payrollPeriodId: targetPeriodId,
    payrollPeriodName: payrollPeriod.settlementName || `Período ${payrollPeriod.month}/${payrollPeriod.year}`,
    withholdingConcept: {
      id: withholdingConcept.id,
      code: withholdingConcept.code,
      name: withholdingConcept.name,
      arcaConceptCode: withholdingConcept.arcaConceptCode,
    },
    refundConcept: {
      id: refundConcept.id,
      code: refundConcept.code,
      name: refundConcept.name,
      arcaConceptCode: refundConcept.arcaConceptCode,
    },
    exportedWithholdingsCount,
    exportedRefundsCount,
    totalNoveltiesGenerated: exportedWithholdingsCount + exportedRefundsCount,
    requiresRecalculation,
    message: `Se exportaron ${exportedWithholdingsCount} retenciones y ${exportedRefundsCount} reintegros al período "${payrollPeriod.settlementName || `${payrollPeriod.month}/${payrollPeriod.year}`}". ${
      requiresRecalculation
        ? 'El período de sueldos ya poseía recibos calculados; se recomienda recalcular la nómina para aplicar las novedades.'
        : 'Las novedades quedaron registradas para la próxima liquidación del período.'
    }`,
  };
}
