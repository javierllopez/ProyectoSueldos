/**
 * Motor de cálculo acumulativo del Impuesto a las Ganancias Cuarta Categoría
 * Conforme a Ley 27.743 y RG AFIP/ARCA 4003/2017
 */

/**
 * Calcula la liquidación mensual acumulativa de Impuesto a las Ganancias para un empleado.
 * 
 * @param {object} params
 * @param {object} params.employee - Datos del empleado con sus familiares
 * @param {number} params.fiscalYear - Año fiscal
 * @param {number} params.month - Mes a liquidar (1..12)
 * @param {number} params.currentMonthGross - Haberes remunerativos del mes actual
 * @param {number} params.priorMonthsGross - Haberes remunerativos acumulados de meses anteriores
 * @param {number} params.currentMonthLegalDeductions - Deducciones de ley del mes actual
 * @param {number} params.priorMonthsLegalDeductions - Deducciones de ley acumuladas de meses anteriores
 * @param {number} params.actualSacAmount - SAC real liquidado en el mes (si es mes 6 o 12)
 * @param {number} params.priorSacProjectedAccumulated - 1/12 acumulada en meses anteriores
 * @param {Array}  params.otherIncomes - Otros empleos del período fiscal hasta el mes actual
 * @param {Array}  params.generalDeductions - Deducciones generales del período hasta el mes actual
 * @param {Array}  params.paymentsOnAccount - Pagos a cuenta del período hasta el mes actual
 * @param {object} params.taxTable - Tabla oficial Art. 30 para (fiscalYear, month)
 * @param {Array}  params.taxScales - Escala oficial Art. 94 para (fiscalYear, month)
 * @param {Array}  params.generalLimits - Límites de deducciones generales del año
 * @param {number} params.priorMonthsWithheldTax - Retenciones ya practicadas en meses anteriores del año
 */
export function calculateEmployeeIncomeTax({
  employee,
  fiscalYear,
  month,
  currentMonthGross = 0,
  priorMonthsGross = 0,
  currentMonthLegalDeductions = 0,
  priorMonthsLegalDeductions = 0,
  actualSacAmount = 0,
  priorSacProjectedAccumulated = 0,
  otherIncomes = [],
  generalDeductions = [],
  paymentsOnAccount = [],
  taxTable,
  taxScales = [],
  generalLimits = [],
  priorMonthsWithheldTax = 0,
}) {
  const isSacMonth = month === 6 || month === 12;

  // 1. Ganancia Bruta del Empleo Principal
  const accumulatedGrossPrincipal = priorMonthsGross + currentMonthGross;

  // Prorrateo doceava parte de SAC (Art. 30 RG 4003)
  let sacProjectedMonth = 0;
  let sacProjectedAccumulated = 0;

  if (isSacMonth) {
    // En mes de SAC, se computa el SAC real percibido y se ajusta la proyección
    sacProjectedMonth = actualSacAmount;
    sacProjectedAccumulated = priorSacProjectedAccumulated + actualSacAmount;
  } else {
    // En meses normales, se adiciona la doceava parte del mes
    sacProjectedMonth = Math.round((currentMonthGross / 12) * 100) / 100;
    sacProjectedAccumulated = priorSacProjectedAccumulated + sacProjectedMonth;
  }

  // 2. Otros Empleos (Pluriempleo)
  let otherEmployersGross = 0;
  let otherEmployersLegalDeductions = 0;
  let otherEmployersPriorWithholding = 0;

  for (const oi of otherIncomes) {
    if (oi.month <= month) {
      otherEmployersGross += Number(oi.grossIncome || 0);
      otherEmployersLegalDeductions +=
        Number(oi.pensionContrib || 0) +
        Number(oi.healthInsuranceContrib || 0) +
        Number(oi.unionContrib || 0);
      otherEmployersPriorWithholding += Number(oi.withheldTax || 0);
    }
  }

  // Total Bruto Acumulado Gravado
  const totalGrossAccumulated =
    accumulatedGrossPrincipal + sacProjectedAccumulated + otherEmployersGross;

  // 3. Deducciones de Ley (Seguridad Social)
  const principalLegalDeductions = priorMonthsLegalDeductions + currentMonthLegalDeductions;
  // Prorrateo 1/12 de aportes sobre SAC proyectado para aparejar
  const sacProjectedLegalDeductions = !isSacMonth
    ? Math.round((currentMonthLegalDeductions / 12) * 100) / 100
    : 0;

  const totalLegalDeductions =
    principalLegalDeductions +
    sacProjectedLegalDeductions +
    otherEmployersLegalDeductions;

  // Ganancia Neta antes de Deducciones Generales y Art. 30
  const netIncomeBeforeDeductions = Math.max(0, totalGrossAccumulated - totalLegalDeductions);

  // 4. Deducciones Generales con Topes
  const mniAccumulated = Number(taxTable?.nonTaxableMinimum || 0);
  let totalGeneralDeductions = 0;
  const appliedGeneralDeductions = [];

  // Mapear límites
  const limitsMap = {};
  for (const lim of generalLimits) {
    limitsMap[lim.code] = lim;
  }

  for (const d of generalDeductions) {
    if (d.month && d.month > month) continue; // Si es de un mes posterior, no aplica aún

    const amount = Number(d.amount);
    const type = d.deductionType;
    let allowedAmount = amount;

    if (type === 'HONORARIOS_MEDICOS') {
      // Cómputo legal: 40% del monto facturado (Opción A) y tope global del 5% de la ganancia neta (Art. 111 Ley Ganancias)
      const baseComputable = Math.round(amount * 0.40 * 100) / 100;
      const cap = Math.round(netIncomeBeforeDeductions * 0.05 * 100) / 100;
      allowedAmount = Math.min(baseComputable, cap);
    } else if (type === 'PREPAGA' || type === 'DONACIONES') {
      // Tope 5% de la ganancia neta acumulada
      const cap = Math.round(netIncomeBeforeDeductions * 0.05 * 100) / 100;
      allowedAmount = Math.min(amount, cap);
    } else if (type === 'CAJA_PREVISIONAL') {
      // Aportes a Cajas Previsionales Provinciales / Profesionales / SGR: deducible al 100%
      allowedAmount = amount;
    } else if (type === 'INDUMENTARIA') {
      // Gastos de Indumentaria y Equipamiento Laboral: deducible al 100%
      allowedAmount = amount;
    } else if (type === 'VIATICOS') {
      // Gastos de Movilidad y Viáticos: hasta 40% del MNI acumulado
      const cap = Math.round(mniAccumulated * 0.40 * 100) / 100;
      allowedAmount = Math.min(amount, cap);
    } else if (type === 'ALQUILER_INQUILINO') {
      // 10% del monto hasta el 100% del MNI acumulado
      const tenPercent = Math.round(amount * 0.10 * 100) / 100;
      allowedAmount = Math.min(tenPercent, mniAccumulated);
    } else if (type === 'ALQUILER_DUENO') {
      // 10% sin tope de MNI (Ley 27.743)
      allowedAmount = Math.round(amount * 0.10 * 100) / 100;
    } else if (type === 'GASTOS_EDUCATIVOS') {
      // Hasta 40% del MNI
      const cap = Math.round(mniAccumulated * 0.40 * 100) / 100;
      allowedAmount = Math.min(amount, cap);
    } else if (type === 'DOMESTICO') {
      // Hasta 100% del MNI
      allowedAmount = Math.min(amount, mniAccumulated);
    } else if (type === 'SEGURO_VIDA' || type === 'SEGURO_RETIRO') {
      const annualCap = Number(limitsMap[type]?.limitValue || 198049.94);
      const monthlyCap = Math.round((annualCap * month / 12) * 100) / 100;
      allowedAmount = Math.min(amount, monthlyCap);
    } else if (type === 'HIPOTECARIO') {
      const annualCap = Number(limitsMap[type]?.limitValue || 20000.00);
      const monthlyCap = Math.round((annualCap * month / 12) * 100) / 100;
      allowedAmount = Math.min(amount, monthlyCap);
    } else if (type === 'SEPELIO') {
      const annualCap = Number(limitsMap[type]?.limitValue || 996.23);
      const monthlyCap = Math.round((annualCap * month / 12) * 100) / 100;
      allowedAmount = Math.min(amount, monthlyCap);
    }

    totalGeneralDeductions += allowedAmount;
    appliedGeneralDeductions.push({
      deductionType: type,
      declaredAmount: amount,
      allowedAmount,
      providerName: d.providerName,
      notes: d.notes,
    });
  }

  // 5. Cargas de Familia y Deducciones Personales del Art. 30
  let spouseDeductionAmount = 0;
  let childDeductionAmount = 0;
  let disabledChildDeductionAmount = 0;
  const familyDeductionDetails = [];

  const relatives = employee.relatives || [];
  for (const r of relatives) {
    if (r.deletedAt) continue;
    if (!r.appliesIncomeTax) continue;

    // Verificar vigencia mensual
    const fromM = r.validFromMonth || 1;
    const toM = r.validToMonth || 12;
    if (month < fromM || month > toM) continue;

    // Calcular edad
    const birthDate = new Date(r.birthDate);
    const now = new Date();
    let age = now.getFullYear() - birthDate.getFullYear();
    const m = now.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--;

    const pct = (Number(r.deductionPercentage) || 100) / 100;

    if (r.incomeTaxDeductionType === 'SPOUSE') {
      if (r.hasNoIncomeOrBelowMni !== false) {
        const val = Math.round(Number(taxTable?.spouseDeduction || 0) * pct * 100) / 100;
        spouseDeductionAmount += val;
        familyDeductionDetails.push({
          relativeId: r.id,
          name: `${r.lastName}, ${r.firstName}`,
          type: 'SPOUSE',
          amount: val,
        });
      }
    } else if (r.incomeTaxDeductionType === 'DISABLED_CHILD' || r.isDisability) {
      const val = Math.round(Number(taxTable?.disabledChildDeduction || 0) * pct * 100) / 100;
      disabledChildDeductionAmount += val;
      familyDeductionDetails.push({
        relativeId: r.id,
        name: `${r.lastName}, ${r.firstName}`,
        type: 'DISABLED_CHILD',
        amount: val,
      });
    } else if (r.incomeTaxDeductionType === 'CHILD') {
      if (age < 18) {
        const val = Math.round(Number(taxTable?.childDeduction || 0) * pct * 100) / 100;
        childDeductionAmount += val;
        familyDeductionDetails.push({
          relativeId: r.id,
          name: `${r.lastName}, ${r.firstName}`,
          type: 'CHILD',
          amount: val,
        });
      }
    }
  }

  const specialDeductionAmount = Number(taxTable?.specialDeduction || 0);
  const totalPersonalDeductions =
    mniAccumulated +
    specialDeductionAmount +
    spouseDeductionAmount +
    childDeductionAmount +
    disabledChildDeductionAmount;

  // 6. Base Imponible Acumulada
  const netTaxableIncomeAccumulated = Math.max(
    0,
    totalGrossAccumulated - totalLegalDeductions - totalGeneralDeductions - totalPersonalDeductions
  );

  // 7. Impuesto Determinado Acumulado (Escala Art. 94)
  let determinedTaxAccumulated = 0;
  let appliedStep = null;

  if (netTaxableIncomeAccumulated > 0 && taxScales.length > 0) {
    const scalesSorted = [...taxScales].sort((a, b) => a.step - b.step);

    for (const scale of scalesSorted) {
      const from = Number(scale.fromAmount);
      const to = scale.toAmount !== null ? Number(scale.toAmount) : Infinity;

      if (netTaxableIncomeAccumulated > from) {
        if (netTaxableIncomeAccumulated <= to || to === Infinity) {
          const excess = netTaxableIncomeAccumulated - from;
          const rate = Number(scale.ratePercentage) / 100;
          const fixed = Number(scale.fixedAmount);
          determinedTaxAccumulated = Math.round((fixed + excess * rate) * 100) / 100;
          appliedStep = scale.step;
          break;
        }
      }
    }
  }

  // 8. Pagos a Cuenta Acumulados
  let paymentsOnAccountAccumulated = 0;
  for (const p of paymentsOnAccount) {
    if (p.month <= month) {
      paymentsOnAccountAccumulated += Number(p.amount);
    }
  }

  const taxAfterPayments = Math.max(
    0,
    determinedTaxAccumulated - paymentsOnAccountAccumulated
  );

  // 9. Retenciones de meses previos
  const totalPriorWithheld = priorMonthsWithheldTax + otherEmployersPriorWithholding;

  // 10. Saldo a Retener o Reintegrar en el Mes
  const netMonthlyWithholding = Math.round((taxAfterPayments - totalPriorWithheld) * 100) / 100;

  return {
    employeeId: employee.id,
    fiscalYear,
    month,
    currentMonthGross,
    accumulatedGross: Math.round(accumulatedGrossPrincipal * 100) / 100,
    sacProjectedMonth,
    sacProjectedAccumulated: Math.round(sacProjectedAccumulated * 100) / 100,
    otherEmployersGross: Math.round(otherEmployersGross * 100) / 100,
    totalGrossAccumulated: Math.round(totalGrossAccumulated * 100) / 100,
    legalDeductionsAccumulated: Math.round(totalLegalDeductions * 100) / 100,
    generalDeductionsAccumulated: Math.round(totalGeneralDeductions * 100) / 100,
    appliedGeneralDeductions,
    personalDeductionsAccumulated: Math.round(totalPersonalDeductions * 100) / 100,
    familyDeductionDetails,
    netTaxableIncomeAccumulated: Math.round(netTaxableIncomeAccumulated * 100) / 100,
    appliedScaleStep: appliedStep,
    determinedTaxAccumulated,
    paymentsOnAccountAccumulated,
    priorMonthsWithheldTax: Math.round(totalPriorWithheld * 100) / 100,
    netMonthlyWithholding,
    isWithholding: netMonthlyWithholding > 0,
    isRefund: netMonthlyWithholding < 0,
    refundAmount: netMonthlyWithholding < 0 ? Math.abs(netMonthlyWithholding) : 0,
    withholdingAmount: netMonthlyWithholding > 0 ? netMonthlyWithholding : 0,
  };
}
