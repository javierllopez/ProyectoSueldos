import crypto from 'crypto';
import { ensureTenantPayrollSchema } from '../../../services/tenantProvisioner.service.js';
import { DEFAULT_CONCEPTS } from '../../../services/provisioner/defaultCatalogs.js';
import { normalizeUtcNoonDate } from '../../../utils/dateFormat.js';
import { resolveSalaryScaleAmountForPeriod } from '../payroll.calculator.js';
import {
  getPayrollSettings,
  resolveSettlementTypeConfig,
} from './conceptsAndRules.service.js';
import { calculatePeriod } from './periodsAndCalculation.service.js';

export const FINAL_SETTLEMENT_CAUSES = [
  {
    code: 'DESPIDO_SIN_CAUSA',
    label: '1. Despido sin justa causa (Art. 245 LCT)',
    shortLabel: 'Despido sin causa (Art. 245 LCT)',
    description: 'Extinción incausada dispuesta por el empleador fuera del período de prueba.',
  },
  {
    code: 'PERIODO_PRUEBA',
    label: '2. Extinción en período de prueba (Art. 92 bis LCT / Art. 48 Ley 27.802)',
    shortLabel: 'Extinción en período de prueba (Art. 92 bis LCT)',
    description: 'Extinción sin expresión de causa dentro del período de prueba; sin Art. 245 ni preaviso (Art. 48 Ley 27.802).',
  },
  {
    code: 'RENUNCIA',
    label: '3. Renuncia del trabajador (Art. 240 LCT)',
    shortLabel: 'Renuncia (Art. 240 LCT)',
    description: 'Extinción voluntaria del trabajador; liquida días trabajados, SAC proporcional y VNG + SAC.',
  },
  {
    code: 'DESPIDO_CON_CAUSA',
    label: '4. Despido con justa causa (Art. 242 LCT)',
    shortLabel: 'Despido con justa causa (Art. 242 LCT)',
    description: 'Extinción por injuria grave acreditada; sin derecho a indemnizaciones ni preaviso.',
  },
  {
    code: 'MUTUO_ACUERDO',
    label: '5. Mutuo acuerdo / Voluntad concurrente (Art. 241 LCT)',
    shortLabel: 'Mutuo acuerdo (Art. 241 LCT)',
    description: 'Extinción bilateral instrumentada ante escribano o autoridad laboral, con gratificación por cese opcional.',
  },
  {
    code: 'JUBILACION',
    label: '6. Extinción por jubilación (Art. 252 LCT)',
    shortLabel: 'Extinción por jubilación (Art. 252 LCT)',
    description: 'Cese por obtención de beneficio previsional o vencimiento de plazo Art. 252 LCT.',
  },
  {
    code: 'FALLECIMIENTO',
    label: '7. Fallecimiento del trabajador (Art. 248 LCT)',
    shortLabel: 'Fallecimiento del trabajador (Art. 248 LCT)',
    description: 'Corresponde indemnización equivalente al 50% del Art. 245 (Art. 247 LCT) a derechohabientes.',
  },
  {
    code: 'FUERZA_MAYOR',
    label: '8. Fuerza mayor o falta de trabajo no imputable (Art. 247 LCT)',
    shortLabel: 'Fuerza mayor / Falta de trabajo (Art. 247 LCT)',
    description: 'Indemnización reducida al 50% del Art. 245 LCT por fuerza mayor o falta de trabajo fehaciente.',
  },
  {
    code: 'FIN_CONTRATO_EVENTUAL',
    label: '9. Fin contrato eventual (Arts. 99/100 LCT y Arts. 73/74 Ley 24.013)',
    shortLabel: 'Fin contrato eventual (Arts. 73/74 Ley 24.013)',
    description: 'Finalización de obra o tarea eventual; sin preaviso (Art. 73) ni indemnización (Art. 74 Ley 24.013).',
  },
];

export const FINAL_SETTLEMENT_CAUSE_MAP = new Map(
  FINAL_SETTLEMENT_CAUSES.map((c) => [c.code, c])
);

export const FINAL_RUBRO_CONCEPT_CODES = [
  'FI1000',
  'FI1200',
  'FI5012',
  'FI5018',
  'FI5014',
  'FI5011',
  'FI5015',
  'FI5017',
  'FI5016',
  'FI5019',
  'FI5010',
];

function round2(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}

function getDaysInUtcMonth(year, month1Based) {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

function getDaysInUtcYear(year) {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeap ? 366 : 365;
}

function addCalendarMonthsUtcNoon(dateObj, monthsToAdd) {
  const y = dateObj.getUTCFullYear();
  const m = dateObj.getUTCMonth();
  const d = dateObj.getUTCDate();
  const totalMonths = y * 12 + m + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths % 12;
  const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(d, maxDay), 12, 0, 0, 0));
}

function diffUtcCalendarDaysInclusive(startUtcNoon, endUtcNoon) {
  const s = Date.UTC(startUtcNoon.getUTCFullYear(), startUtcNoon.getUTCMonth(), startUtcNoon.getUTCDate());
  const e = Date.UTC(endUtcNoon.getUTCFullYear(), endUtcNoon.getUTCMonth(), endUtcNoon.getUTCDate());
  if (e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

function diffUtcDays(startUtcNoon, endUtcNoon) {
  const s = Date.UTC(startUtcNoon.getUTCFullYear(), startUtcNoon.getUTCMonth(), startUtcNoon.getUTCDate());
  const e = Date.UTC(endUtcNoon.getUTCFullYear(), endUtcNoon.getUTCMonth(), endUtcNoon.getUTCDate());
  return Math.round((e - s) / 86400000);
}

/**
 * Calcula antigüedad calendario exacta (años, meses, días), verificación de período de prueba
 * (Art. 92 bis LCT modif. Ley 27.742) y cantidad de períodos indemnizatorios Art. 245 LCT.
 */
export function computeExactSeniority(hireDateInput, terminationDateInput, probationMonthsLimit = 6) {
  const start = normalizeUtcNoonDate(hireDateInput);
  const end = normalizeUtcNoonDate(terminationDateInput);
  if (!start || !end) {
    const err = new Error('Las fechas de ingreso y egreso son obligatorias para calcular la liquidación final.');
    err.status = 400;
    throw err;
  }
  if (end < start) {
    const err = new Error('La fecha de egreso no puede ser anterior a la fecha de ingreso del colaborador.');
    err.status = 400;
    throw err;
  }

  let totalMonths =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());

  let anchor = addCalendarMonthsUtcNoon(start, totalMonths);
  if (anchor > end) {
    totalMonths -= 1;
    anchor = addCalendarMonthsUtcNoon(start, totalMonths);
  }

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const days = Math.max(0, diffUtcDays(anchor, end));
  const totalCalendarDays = diffUtcCalendarDaysInclusive(start, end);

  const safeProbMonths = Math.max(0, Math.min(12, Number(probationMonthsLimit) || 6));
  const probationEndDate = safeProbMonths > 0 ? addCalendarMonthsUtcNoon(start, safeProbMonths) : start;
  const inProbationPeriod = safeProbMonths > 0 && end <= probationEndDate;

  // Art. 245 LCT: 1 período por año o fracción mayor a 3 meses (> 3 meses estricto: 3m 0d no suma, 3m 1d sí).
  let indemnityPeriods = 0;
  if (!inProbationPeriod) {
    const hasFractionOver3Months = months > 3 || (months === 3 && days > 0);
    indemnityPeriods = Math.max(1, years + (hasFractionOver3Months ? 1 : 0));
  }

  return {
    hireDate: start.toISOString().slice(0, 10),
    terminationDate: end.toISOString().slice(0, 10),
    years,
    months,
    days,
    totalCalendarDays,
    inProbationPeriod,
    probationMonthsLimit: safeProbMonths,
    probationEndDate: probationEndDate.toISOString().slice(0, 10),
    indemnityPeriods,
  };
}

/**
 * Calcula la fecha límite legal de pago de la liquidación final (Arts. 128 y 255 bis LCT: 4 días hábiles).
 */
export function computeLegalPaymentDeadline(terminationDateInput, businessDays = 4) {
  const start = normalizeUtcNoonDate(terminationDateInput);
  if (!start) return null;

  const cursor = new Date(start.getTime());
  let remaining = Math.max(1, Number(businessDays) || 4);
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      remaining -= 1;
    }
  }
  return cursor.toISOString().slice(0, 10);
}

/**
 * Calcula días anuales de vacaciones según Art. 150 LCT con antigüedad proyectada al 31/12 del año de baja.
 */
export function resolveAnnualVacationDays(hireDateInput, terminationYear) {
  const start = normalizeUtcNoonDate(hireDateInput);
  if (!start) return 14;
  const yearEnd = new Date(Date.UTC(terminationYear, 11, 31, 12, 0, 0, 0));
  if (start > yearEnd) return 14;

  let totalMonths =
    (yearEnd.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (yearEnd.getUTCMonth() - start.getUTCMonth());
  let anchor = addCalendarMonthsUtcNoon(start, totalMonths);
  if (anchor > yearEnd) {
    totalMonths -= 1;
  }
  const yearsAtYearEnd = Math.floor(totalMonths / 12);

  if (yearsAtYearEnd >= 20) return 35;
  if (yearsAtYearEnd >= 10) return 28;
  if (yearsAtYearEnd >= 5) return 21;
  return 14;
}

/**
 * Motor puro y determinístico de cálculo para el Asistente de Liquidación Final (PROP-03).
 */
export function computeFinalSettlementCalculation({
  hireDate,
  terminationDate,
  terminationCause = 'DESPIDO_SIN_CAUSA',
  includeWorkedDays = true,
  daysDivisorMode = 'CALENDAR',
  preavisoGiven = false,
  probationMonthsLimit = 6,
  vacationDaysTaken = 0,
  applyVizzoti = true,
  cctCapAmount = null,
  isExecutive = false,
  mrmnh = 0,
  bestSemesterRemun = 0,
  currentMonthBaseSalary = 0,
  gratificationAmount = 0,
  existingMonthWorkedDays = 0,
}) {
  const causeMeta = FINAL_SETTLEMENT_CAUSE_MAP.get(String(terminationCause || '').toUpperCase().trim());
  if (!causeMeta) {
    const err = new Error(`Causal de egreso inválida: ${terminationCause}`);
    err.status = 400;
    throw err;
  }

  const start = normalizeUtcNoonDate(hireDate);
  const end = normalizeUtcNoonDate(terminationDate);
  const seniority = computeExactSeniority(start, end, probationMonthsLimit);
  const legalDueDate = computeLegalPaymentDeadline(end, 4);

  const termYear = end.getUTCFullYear();
  const termMonth = end.getUTCMonth() + 1;
  const termDay = end.getUTCDate();
  const calendarDaysInMonth = getDaysInUtcMonth(termYear, termMonth);

  const normMrmnh = Math.max(0, round2(mrmnh));
  const normMonthSalary = Math.max(0, round2(currentMonthBaseSalary || normMrmnh));
  const normSemesterBest = Math.max(0, round2(bestSemesterRemun || Math.max(normMrmnh, normMonthSalary)));
  const normVacTaken = Math.max(0, Math.round(Number(vacationDaysTaken) || 0));
  const normGratification = Math.max(0, round2(gratificationAmount));
  const normCctCap = cctCapAmount !== null && cctCapAmount !== undefined && String(cctCapAmount).trim() !== '' && Number(cctCapAmount) > 0
    ? round2(cctCapAmount)
    : null;

  const warnings = [];
  const divisorModeNorm = String(daysDivisorMode || 'CALENDAR').toUpperCase() === 'FIXED_30' ? 'FIXED_30' : 'CALENDAR';

  // 1. Días trabajados en el mes de baja (Art. 103 LCT)
  const monthStart = new Date(Date.UTC(termYear, termMonth - 1, 1, 12, 0, 0, 0));
  const effectiveMonthStart = start > monthStart ? start : monthStart;
  const rawMonthDaysWorked =
    effectiveMonthStart.getUTCFullYear() === termYear && effectiveMonthStart.getUTCMonth() + 1 === termMonth
      ? diffUtcCalendarDaysInclusive(effectiveMonthStart, end)
      : termDay;

  const monthDivisor = divisorModeNorm === 'FIXED_30' ? 30 : calendarDaysInMonth;
  const workedDaysMonthUnits =
    divisorModeNorm === 'FIXED_30' && rawMonthDaysWorked === calendarDaysInMonth
      ? 30
      : Math.min(monthDivisor, Math.max(0, rawMonthDaysWorked));

  const workedDaysAmount = includeWorkedDays
    ? round2((normMonthSalary / monthDivisor) * workedDaysMonthUnits)
    : 0;

  // Días a informar en ARCA LSD Registro 02/04 (evitando superar el tope mensual acumulado de 30 días)
  const maxRemainingLsdDays = Math.max(0, 30 - (Number(existingMonthWorkedDays) || 0));
  const proposedWorkedDaysForLsd = includeWorkedDays
    ? Math.min(maxRemainingLsdDays, Math.min(30, workedDaysMonthUnits))
    : 0;

  if (includeWorkedDays && Number(existingMonthWorkedDays) > 0) {
    warnings.push({
      code: 'MONTH_ALREADY_HAS_DAYS',
      severity: 'warning',
      message: `El colaborador ya registra ${existingMonthWorkedDays} día(s) trabajado(s) en otra liquidación de ${String(termMonth).padStart(2, '0')}/${termYear}. Verifique los días a declarar en ARCA LSD (máximo restante sugerido: ${maxRemainingLsdDays} días) o desactive "Incluir días trabajados" si ya fueron abonados.`,
    });
  }

  // 2. SAC Proporcional (Art. 123 LCT + ARCA 120003)
  const isSecondSemester = termMonth > 6;
  const semStart = isSecondSemester
    ? new Date(Date.UTC(termYear, 6, 1, 12, 0, 0, 0))
    : new Date(Date.UTC(termYear, 0, 1, 12, 0, 0, 0));
  const semEnd = isSecondSemester
    ? new Date(Date.UTC(termYear, 11, 31, 12, 0, 0, 0))
    : new Date(Date.UTC(termYear, 5, 30, 12, 0, 0, 0));
  const semesterTotalDays = diffUtcCalendarDaysInclusive(semStart, semEnd);
  const effectiveSemStart = start > semStart ? start : semStart;
  const semesterDaysWorked = diffUtcCalendarDaysInclusive(effectiveSemStart, end);
  const sacPropAmount = round2((normSemesterBest / 2) * (semesterDaysWorked / semesterTotalDays));

  // 3. Vacaciones No Gozadas + SAC s/ VNG (Arts. 150, 153, 155 y 156 LCT)
  const yearStart = new Date(Date.UTC(termYear, 0, 1, 12, 0, 0, 0));
  const daysInYear = getDaysInUtcYear(termYear);
  const effectiveYearStart = start > yearStart ? start : yearStart;
  const yearDaysWorked = diffUtcCalendarDaysInclusive(effectiveYearStart, end);
  const hiredSameYear = start.getUTCFullYear() === termYear;

  let annualScaleDays = resolveAnnualVacationDays(start, termYear);
  let rawVacDays = 0;
  let vacRuleExplanation = '';

  // Art. 153 LCT: cuando no llega a prestar servicios al menos la mitad de los días hábiles del año (~180 días corridos en mismo año de ingreso), 1 día cada 20 trabajados.
  if (hiredSameYear && yearDaysWorked < 180) {
    rawVacDays = Math.floor(yearDaysWorked / 20);
    vacRuleExplanation = `Art. 153 LCT (ingreso en el año < 180 días): floor(${yearDaysWorked} / 20) = ${rawVacDays} día(s)`;
  } else {
    rawVacDays = round2((annualScaleDays * yearDaysWorked) / daysInYear);
    vacRuleExplanation = `Art. 150/156 LCT (escala ${annualScaleDays}d × ${yearDaysWorked}/${daysInYear} días) = ${rawVacDays} día(s)`;
  }

  const netVacDays = Math.max(0, round2(rawVacDays - normVacTaken));
  const vacDailyValue = round2(normMonthSalary / 25);
  const vngAmount = round2(vacDailyValue * netVacDays);
  const sacVngAmount = round2(vngAmount / 12);

  // 4. Evaluar derechos indemnizatorios según causal
  const cause = causeMeta.code;
  const isDismissalWithoutCause = cause === 'DESPIDO_SIN_CAUSA';
  const isReducedIndemnity = cause === 'FALLECIMIENTO' || cause === 'FUERZA_MAYOR';

  if (isDismissalWithoutCause && seniority.inProbationPeriod) {
    warnings.push({
      code: 'DISMISSAL_DURING_PROBATION',
      severity: 'info',
      message: `Según la fecha de ingreso (${seniority.hireDate}) y egreso (${seniority.terminationDate}), el colaborador se encuentra dentro del período de prueba (${seniority.probationMonthsLimit} meses, Art. 92 bis LCT). Si corresponde extinción en período de prueba (sin Art. 245 ni preaviso según Art. 48 Ley 27.802), seleccione la causal "2. Extinción en período de prueba".`,
    });
  }
  if (cause === 'PERIODO_PRUEBA' && !seniority.inProbationPeriod) {
    warnings.push({
      code: 'PROBATION_EXCEEDED_WARNING',
      severity: 'warning',
      message: `Atención: el colaborador supera el límite configurado de ${seniority.probationMonthsLimit} meses de período de prueba (antigüedad ${seniority.years}a ${seniority.months}m ${seniority.days}d). Verifique si corresponde "1. Despido sin justa causa".`,
    });
  }

  // 4A. Indemnización por Antigüedad (Art. 245 / 247 / 248 LCT + Art. 51 Ley 27.802 + Vizzoti)
  let indemnityBaseUsed = normMrmnh;
  let vizzotiApplied = false;
  let minFloorApplied = false;
  let indemnity245FullAmount = 0;

  const effPeriods =
    seniority.indemnityPeriods > 0
      ? seniority.indemnityPeriods
      : (isDismissalWithoutCause || isReducedIndemnity ? 1 : 0);

  if (isDismissalWithoutCause || isReducedIndemnity) {
    if (normCctCap && normCctCap > 0 && normCctCap < normMrmnh) {
      if (applyVizzoti) {
        const vizzotiFloor = round2(normMrmnh * 0.67);
        indemnityBaseUsed = Math.max(normCctCap, vizzotiFloor);
        vizzotiApplied = indemnityBaseUsed > normCctCap;
      } else {
        indemnityBaseUsed = normCctCap;
      }
    }
    const rawIndemnity = round2(indemnityBaseUsed * effPeriods);
    // Art. 245 último párrafo LCT: piso mínimo 1 mes de MRMNH real sin tope
    if (rawIndemnity < normMrmnh && normMrmnh > 0) {
      indemnity245FullAmount = round2(normMrmnh);
      minFloorApplied = true;
    } else {
      indemnity245FullAmount = rawIndemnity;
    }
  }

  const includeArt245 = isDismissalWithoutCause && (!seniority.inProbationPeriod || effPeriods > 0);
  const amountArt245 = isDismissalWithoutCause ? indemnity245FullAmount : 0;
  const amountArt247_248 = isReducedIndemnity ? round2(indemnity245FullAmount * 0.5) : 0;

  // 4B. Indemnización Sustitutiva de Preaviso (Arts. 231 y 232 LCT; excluida en Período de Prueba por Art. 48 Ley 27.802 y en Eventual por Art. 73 Ley 24.013)
  let preavisoMonths = 0;
  let preavisoAmount = 0;
  let sacPreavisoAmount = 0;
  const strictlyOver5Years =
    seniority.years > 5 || (seniority.years === 5 && (seniority.months > 0 || seniority.days > 0));

  if ((isDismissalWithoutCause || cause === 'FUERZA_MAYOR') && !preavisoGiven) {
    preavisoMonths = strictlyOver5Years ? 2 : 1;
    preavisoAmount = round2(normMonthSalary * preavisoMonths);
    sacPreavisoAmount = round2(preavisoAmount / 12);
  }

  // 4C. Integración del Mes de Despido (Art. 233 LCT)
  let integrationDays = 0;
  let integrationAmount = 0;
  let sacIntegrationAmount = 0;

  if (isDismissalWithoutCause && !preavisoGiven && termDay < calendarDaysInMonth) {
    integrationDays = calendarDaysInMonth - termDay;
    integrationAmount = round2((normMonthSalary / calendarDaysInMonth) * integrationDays);
    sacIntegrationAmount = round2(integrationAmount / 12);
  }

  // 4D. Gratificación por Cese (Art. 241 LCT / Mutuo acuerdo o voluntaria)
  const includeGratification = cause === 'MUTUO_ACUERDO' || normGratification > 0;

  const rubros = [
    {
      key: 'WORKED_DAYS',
      conceptCode: 'FI1000',
      label: 'Días Trabajados Mes de Baja',
      legalRef: 'Art. 103 LCT',
      arcaConceptCode: '110000',
      type: 'REMUNERATIVE',
      isRemunerative: true,
      incomeTaxTreatment: 'GRAVADO',
      included: Boolean(includeWorkedDays && workedDaysAmount > 0),
      units: workedDaysMonthUnits,
      unitLabel: 'Días',
      amount: workedDaysAmount,
      formulaExplanation: includeWorkedDays
        ? `(${normMonthSalary.toFixed(2)} / ${monthDivisor}d ${divisorModeNorm === 'FIXED_30' ? 'base 30' : 'reales'}) × ${workedDaysMonthUnits}d = ${workedDaysAmount.toFixed(2)}`
        : 'Excluido manualmente (días liquidados por separado)',
    },
    {
      key: 'SAC_PROPORTIONAL',
      conceptCode: 'FI1200',
      label: 'SAC Proporcional',
      legalRef: 'Art. 123 LCT',
      arcaConceptCode: '120003',
      type: 'REMUNERATIVE',
      isRemunerative: true,
      incomeTaxTreatment: 'GRAVADO',
      included: sacPropAmount > 0,
      units: semesterDaysWorked,
      unitLabel: 'Días',
      amount: sacPropAmount,
      formulaExplanation: `(${normSemesterBest.toFixed(2)} / 2) × (${semesterDaysWorked} / ${semesterTotalDays} días sem.) = ${sacPropAmount.toFixed(2)} [ARCA 120003 Cant: ${semesterDaysWorked}]`,
    },
    {
      key: 'VNG',
      conceptCode: 'FI5012',
      label: 'Vacaciones No Gozadas (Indemniz.)',
      legalRef: 'Arts. 150, 153, 155 y 156 LCT',
      arcaConceptCode: '520012',
      type: 'NON_REMUNERATIVE',
      isRemunerative: false,
      incomeTaxTreatment: 'GRAVADO',
      included: vngAmount > 0,
      units: netVacDays,
      unitLabel: 'Días',
      amount: vngAmount,
      formulaExplanation: `${vacRuleExplanation}; descontados ${normVacTaken}d gozados → ${netVacDays}d × (${normMonthSalary.toFixed(2)} / 25) = ${vngAmount.toFixed(2)}`,
    },
    {
      key: 'SAC_VNG',
      conceptCode: 'FI5018',
      label: 'SAC s/ Vacaciones No Gozadas',
      legalRef: 'Art. 156 + Art. 123 LCT',
      arcaConceptCode: '520018',
      type: 'NON_REMUNERATIVE',
      isRemunerative: false,
      incomeTaxTreatment: 'GRAVADO',
      included: sacVngAmount > 0,
      units: 1,
      unitLabel: '$',
      amount: sacVngAmount,
      formulaExplanation: `VNG (${vngAmount.toFixed(2)}) / 12 = ${sacVngAmount.toFixed(2)}`,
    },
    {
      key: 'INDEMNITY_245',
      conceptCode: 'FI5014',
      label: 'Indemnización por Antigüedad (Art. 245 LCT)',
      legalRef: 'Art. 245 LCT + Art. 51 Ley 27.802 + Vizzoti',
      arcaConceptCode: '520014',
      type: 'NON_REMUNERATIVE',
      isRemunerative: false,
      incomeTaxTreatment: isExecutive ? 'EXENTO_HASTA_TOPE' : 'EXENTO',
      included: Boolean(includeArt245 && amountArt245 > 0),
      units: effPeriods,
      unitLabel: 'Años',
      amount: amountArt245,
      formulaExplanation: isDismissalWithoutCause
        ? `${effPeriods} período(s) × $${indemnityBaseUsed.toFixed(2)}${vizzotiApplied ? ' (Piso 67% Vizzoti aplicado)' : ''}${minFloorApplied ? ' (Piso mínimo 1 mes sin tope Art. 245)' : ''} = ${amountArt245.toFixed(2)}`
        : `No aplica para la causal "${causeMeta.shortLabel}"`,
    },
    {
      key: 'INDEMNITY_REDUCED',
      conceptCode: 'FI5011',
      label:
        cause === 'FALLECIMIENTO'
          ? 'Indemnización por Fallecimiento (50% Art. 248 LCT)'
          : 'Indemnización Fuerza Mayor (50% Art. 247 LCT)',
      legalRef: cause === 'FALLECIMIENTO' ? 'Art. 248 / 247 LCT' : 'Art. 247 LCT',
      arcaConceptCode: '520011',
      type: 'NON_REMUNERATIVE',
      isRemunerative: false,
      incomeTaxTreatment: 'EXENTO',
      included: isReducedIndemnity && amountArt247_248 > 0,
      units: effPeriods,
      unitLabel: 'Años',
      amount: amountArt247_248,
      formulaExplanation: isReducedIndemnity
        ? `50% × Art. 245 ($${indemnity245FullAmount.toFixed(2)}) = ${amountArt247_248.toFixed(2)}`
        : 'No aplica para esta causal',
    },
    {
      key: 'PREAVISO',
      conceptCode: 'FI5015',
      label: 'Indemnización Sustitutiva de Preaviso',
      legalRef:
        cause === 'PERIODO_PRUEBA'
          ? 'Art. 231 inc. b LCT (modif. Art. 48 Ley 27.802)'
          : cause === 'FIN_CONTRATO_EVENTUAL'
            ? 'Art. 73 Ley 24.013'
            : 'Arts. 231 y 232 LCT',
      arcaConceptCode: '520015',
      type: 'NON_REMUNERATIVE',
      isRemunerative: false,
      incomeTaxTreatment: 'GRAVADO',
      included: preavisoAmount > 0,
      units: preavisoMonths,
      unitLabel: 'Meses',
      amount: preavisoAmount,
      formulaExplanation:
        preavisoAmount > 0
          ? `${preavisoMonths} mes(es) (${strictlyOver5Years ? 'antigüedad > 5 años' : 'antigüedad ≤ 5 años'}) × ${normMonthSalary.toFixed(2)} = ${preavisoAmount.toFixed(2)}`
          : cause === 'PERIODO_PRUEBA'
            ? 'Exento en Período de Prueba según Art. 48 Ley 27.802 (sin obligación de preaviso).'
            : cause === 'FIN_CONTRATO_EVENTUAL'
              ? 'Exento en Contrato Eventual según Art. 73 Ley 24.013.'
              : preavisoGiven
                ? 'Preaviso otorgado/trabajado (sin indemnización sustitutiva).'
                : 'No aplica para esta causal.',
    },
    {
      key: 'SAC_PREAVISO',
      conceptCode: 'FI5017',
      label: 'SAC s/ Preaviso Omitido',
      legalRef: 'Arts. 232 + 123 LCT',
      arcaConceptCode: '520017',
      type: 'NON_REMUNERATIVE',
      isRemunerative: false,
      incomeTaxTreatment: 'GRAVADO',
      included: sacPreavisoAmount > 0,
      units: 1,
      unitLabel: '$',
      amount: sacPreavisoAmount,
      formulaExplanation:
        sacPreavisoAmount > 0
          ? `Preaviso (${preavisoAmount.toFixed(2)}) / 12 = ${sacPreavisoAmount.toFixed(2)}`
          : 'Sin base de preaviso omitido.',
    },
    {
      key: 'INTEGRACION',
      conceptCode: 'FI5016',
      label: 'Integración Mes de Despido',
      legalRef: 'Art. 233 LCT',
      arcaConceptCode: '520016',
      type: 'NON_REMUNERATIVE',
      isRemunerative: false,
      incomeTaxTreatment: 'GRAVADO',
      included: integrationAmount > 0,
      units: integrationDays,
      unitLabel: 'Días',
      amount: integrationAmount,
      formulaExplanation:
        integrationAmount > 0
          ? `(${normMonthSalary.toFixed(2)} / ${calendarDaysInMonth}d) × ${integrationDays} días restantes = ${integrationAmount.toFixed(2)}`
          : termDay === calendarDaysInMonth && isDismissalWithoutCause && !preavisoGiven
            ? 'Baja coincidente con último día del mes calendario (Art. 233 LCT: $0).'
            : 'No aplica para esta causal o condición de preaviso.',
    },
    {
      key: 'SAC_INTEGRACION',
      conceptCode: 'FI5019',
      label: 'SAC s/ Integración Mes de Despido',
      legalRef: 'Arts. 233 + 123 LCT',
      arcaConceptCode: '520017',
      type: 'NON_REMUNERATIVE',
      isRemunerative: false,
      incomeTaxTreatment: 'GRAVADO',
      included: sacIntegrationAmount > 0,
      units: 1,
      unitLabel: '$',
      amount: sacIntegrationAmount,
      formulaExplanation:
        sacIntegrationAmount > 0
          ? `Integración (${integrationAmount.toFixed(2)}) / 12 = ${sacIntegrationAmount.toFixed(2)}`
          : 'Sin base de integración.',
    },
    {
      key: 'GRATIFICATION',
      conceptCode: 'FI5010',
      label: 'Gratificación por Cese Laboral (Art. 241 LCT)',
      legalRef: 'Art. 241 LCT / Art. 7 Ley 24.241',
      arcaConceptCode: '520010',
      type: 'NON_REMUNERATIVE',
      isRemunerative: false,
      incomeTaxTreatment: isExecutive ? 'GRAVADO' : 'EVALUAR_REGIMEN',
      included: Boolean(includeGratification && normGratification > 0),
      units: 1,
      unitLabel: '$',
      amount: normGratification,
      formulaExplanation:
        normGratification > 0
          ? `Importe acordado = ${normGratification.toFixed(2)}`
          : cause === 'MUTUO_ACUERDO'
            ? 'Ingrese el monto de gratificación pactado si corresponde al acuerdo Art. 241.'
            : 'Opcional.',
    },
  ];

  const summary = summarizeFinalRubros(rubros);

  return {
    cause: causeMeta,
    seniority,
    legalDueDate,
    workedDaysForLsd: proposedWorkedDaysForLsd,
    parametersUsed: {
      mrmnh: normMrmnh,
      indemnityBaseUsed,
      vizzotiApplied,
      minFloorApplied,
      cctCapAmount: normCctCap,
      bestSemesterRemun: normSemesterBest,
      currentMonthBaseSalary: normMonthSalary,
      daysDivisorMode: divisorModeNorm,
      monthDivisor,
      workedDaysMonthUnits,
      semesterDaysWorked,
      semesterTotalDays,
      annualScaleDays,
      yearDaysWorked,
      daysInYear,
      netVacDays,
      vacationDaysTaken: normVacTaken,
      preavisoMonths,
      integrationDays,
    },
    rubros,
    summary,
    warnings,
  };
}

function summarizeFinalRubros(rubros = []) {
  let totalRemunerative = 0;
  let totalNonRemunerative = 0;
  let totalTaxableIncomeTax = 0;
  let totalExemptIncomeTax = 0;

  for (const r of rubros) {
    if (!r.included) continue;
    const amt = round2(r.amount);
    if (amt <= 0) continue;
    if (r.type === 'REMUNERATIVE') {
      totalRemunerative += amt;
    } else {
      totalNonRemunerative += amt;
    }
    if (r.incomeTaxTreatment === 'EXENTO') {
      totalExemptIncomeTax += amt;
    } else {
      totalTaxableIncomeTax += amt;
    }
  }

  return {
    totalRemunerative: round2(totalRemunerative),
    totalNonRemunerative: round2(totalNonRemunerative),
    totalGross: round2(totalRemunerative + totalNonRemunerative),
    totalTaxableIncomeTax: round2(totalTaxableIncomeTax),
    totalExemptIncomeTax: round2(totalExemptIncomeTax),
  };
}

function isExcludedHistoryPeriodType(periodType) {
  const p = String(periodType || '').toUpperCase().trim();
  return (
    p === 'SAC' ||
    p === 'SAC_1' ||
    p === 'SAC_2' ||
    p === 'AGUINALDO' ||
    p === 'VACATIONS' ||
    p === 'VACACIONES' ||
    p === 'FINAL' ||
    p === 'LIQUIDACION_FINAL'
  );
}

/**
 * Construye el resumen de los últimos 12 meses calendario ordinarios devengados
 * (Art. 245 LCT + Art. 51 Ley 27.802) y detecta la MRMNH y la mejor remuneración del semestre.
 */
export function buildEmployee12MonthSalaryAudit(slips = [], employee = {}, terminationDateInput, periodYear, periodMonth) {
  const end = normalizeUtcNoonDate(terminationDateInput) || new Date();
  const termYm = end.getUTCFullYear() * 100 + (end.getUTCMonth() + 1);
  const semStartYm = (end.getUTCMonth() + 1 > 6)
    ? end.getUTCFullYear() * 100 + 7
    : end.getUTCFullYear() * 100 + 1;

  const byYm = new Map();
  for (const slip of slips) {
    const pp = slip.payrollPeriod;
    if (!pp) continue;
    if (isExcludedHistoryPeriodType(pp.periodType)) continue;
    const ym = Number(pp.year) * 100 + Number(pp.month);
    if (ym > termYm) continue;

    const items = Array.isArray(slip.items) ? slip.items : [];
    let ordinaryRem = 0;
    if (items.length > 0) {
      ordinaryRem = items
        .filter(
          (it) =>
            it.type === 'REMUNERATIVE' &&
            !String(it.arcaConceptCode || '').trim().startsWith('120')
        )
        .reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
    } else {
      ordinaryRem = Number(slip.remunerativeSalary || 0);
    }
    ordinaryRem = round2(ordinaryRem);

    if (!byYm.has(ym)) {
      byYm.set(ym, {
        ym,
        year: Number(pp.year),
        month: Number(pp.month),
        periodLabel: `${String(pp.month).padStart(2, '0')}/${pp.year}`,
        settlementNames: [],
        remunerativeTotal: 0,
        workedDays: 0,
        isCurrentSemester: ym >= semStartYm && ym <= termYm,
      });
    }
    const row = byYm.get(ym);
    row.remunerativeTotal = round2(row.remunerativeTotal + ordinaryRem);
    row.workedDays += Number(slip.workedDays || 0);
    if (pp.settlementName) row.settlementNames.push(pp.settlementName);
  }

  const orderedMonths = Array.from(byYm.values())
    .sort((a, b) => b.ym - a.ym)
    .slice(0, 12);

  let detectedMrmnh = 0;
  let detectedMrmnhLabel = '';
  let detectedBestSemesterRemun = 0;
  let detectedBestSemesterLabel = '';

  for (const m of orderedMonths) {
    if (m.remunerativeTotal > detectedMrmnh) {
      detectedMrmnh = m.remunerativeTotal;
      detectedMrmnhLabel = m.periodLabel;
    }
    if (m.isCurrentSemester && m.remunerativeTotal > detectedBestSemesterRemun) {
      detectedBestSemesterRemun = m.remunerativeTotal;
      detectedBestSemesterLabel = m.periodLabel;
    }
  }

  // Fallback al básico vigente del legajo/escala si no existen recibos previos aún
  const scaleAmount = employee.salaryScale
    ? resolveSalaryScaleAmountForPeriod(employee.salaryScale, periodYear || end.getUTCFullYear(), periodMonth || end.getUTCMonth() + 1)
    : 0;
  const fallbackMonthly = round2(
    scaleAmount > 0
      ? scaleAmount
      : Number(employee.basicSalary || 0) > 0
        ? Number(employee.basicSalary)
        : Number(employee.hourlyRate || 0) * Number(employee.workShift?.monthlyHours || employee.monthlyWorkingHours || 200)
  );

  if (detectedMrmnh <= 0 && fallbackMonthly > 0) {
    detectedMrmnh = fallbackMonthly;
    detectedMrmnhLabel = 'Básico Vigente / Escala (sin recibos previos)';
  }
  if (detectedBestSemesterRemun <= 0) {
    detectedBestSemesterRemun = detectedMrmnh > 0 ? detectedMrmnh : fallbackMonthly;
    detectedBestSemesterLabel = detectedMrmnhLabel;
  }

  return {
    history12Months: orderedMonths.map((m) => ({
      ...m,
      settlementNames: m.settlementNames.join(' + '),
      isMrmnh: detectedMrmnh > 0 && m.remunerativeTotal === detectedMrmnh && m.periodLabel === detectedMrmnhLabel,
    })),
    detectedMrmnh,
    detectedMrmnhLabel,
    detectedBestSemesterRemun,
    detectedBestSemesterLabel,
    currentMonthBaseSalary: fallbackMonthly > 0 ? fallbackMonthly : detectedMrmnh,
  };
}

async function assertTerminalOpenPeriod(tenantPrisma, periodId, { requireOpen = true } = {}) {
  const period = await tenantPrisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: { fiscalPeriod: true },
  });
  if (!period) {
    const err = new Error('La liquidación solicitada no existe.');
    err.status = 404;
    throw err;
  }

  const settlementType = await resolveSettlementTypeConfig(tenantPrisma, period.periodType);
  const pNorm = String(period.periodType || '').toUpperCase().trim();
  const isTerminal =
    pNorm === 'FINAL' ||
    pNorm === 'LIQUIDACION_FINAL' ||
    Boolean(settlementType?.triggersEmployeeTermination);

  if (!isTerminal) {
    const err = new Error(
      `La liquidación "${period.settlementName || period.periodType}" no es una Liquidación Final ni genera baja de legajo.`
    );
    err.status = 400;
    throw err;
  }

  if (requireOpen && (period.status === 'CLOSED' || period.fiscalPeriod?.status === 'CLOSED')) {
    const err = new Error('No es posible modificar una Liquidación Final o Período Fiscal ya cerrado.');
    err.status = 400;
    throw err;
  }

  return { period, settlementType };
}

async function resolveFinalConceptCatalogMap(tenantPrisma, prefix = 'FI') {
  const concepts = await tenantPrisma.concept.findMany({
    where: { deletedAt: null, isActive: true },
  });
  const byCode = new Map(concepts.map((c) => [String(c.code || '').toUpperCase(), c]));
  const result = new Map();
  const normPrefix = String(prefix || 'FI').toUpperCase().trim();

  for (const baseCode of FINAL_RUBRO_CONCEPT_CODES) {
    const numSuffix = baseCode.replace(/^[A-Z]{2}/, '');
    const customCode = `${normPrefix}${numSuffix}`;
    let found = byCode.get(customCode) || byCode.get(baseCode) || null;
    if (!found) {
      const def = DEFAULT_CONCEPTS.find((d) => d.code === baseCode);
      if (def) {
        found = await tenantPrisma.concept.create({
          data: {
            id: crypto.randomUUID(),
            ...def,
          },
        });
        byCode.set(found.code.toUpperCase(), found);
      }
    }
    if (found) {
      result.set(baseCode, found);
    }
  }

  return result;
}

/**
 * Genera la previsualización completa del Asistente de Liquidación Final para un colaborador.
 */
export async function previewFinalSettlement(tenantPrisma, periodId, params = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const { period, settlementType } = await assertTerminalOpenPeriod(tenantPrisma, periodId, { requireOpen: false });
  const employeeId = params.employeeId;

  const [employee, savedWorksheet, historicalSlips, sameMonthSlips, payrollSettings] = await Promise.all([
    tenantPrisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      include: {
        department: true,
        jobPosition: true,
        workShift: true,
        salaryScale: {
          include: {
            periods: { orderBy: { validFrom: 'asc' } },
          },
        },
      },
    }),
    tenantPrisma.finalSettlementWorksheet.findUnique({
      where: {
        payrollPeriodId_employeeId: {
          payrollPeriodId: periodId,
          employeeId,
        },
      },
    }),
    tenantPrisma.paySlip.findMany({
      where: {
        employeeId,
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
      orderBy: [{ payrollPeriod: { year: 'desc' } }, { payrollPeriod: { month: 'desc' } }],
    }),
    tenantPrisma.paySlip.findMany({
      where: {
        employeeId,
        payrollPeriodId: { not: periodId },
        deletedAt: null,
        payrollPeriod: {
          year: period.year,
          month: period.month,
        },
      },
      include: {
        payrollPeriod: {
          select: {
            id: true,
            settlementName: true,
            periodType: true,
            settlementNumber: true,
          },
        },
      },
    }),
    getPayrollSettings(tenantPrisma),
  ]);

  if (!employee) {
    const err = new Error('El colaborador seleccionado no existe.');
    err.status = 404;
    throw err;
  }

  const defaultTermDate =
    params.terminationDate ||
    savedWorksheet?.terminationDate ||
    employee.terminationDate ||
    period.liquidationDate ||
    new Date(Date.UTC(period.year, period.month, 0, 12, 0, 0, 0));

  const normTermDate = normalizeUtcNoonDate(defaultTermDate);
  const salaryAudit = buildEmployee12MonthSalaryAudit(
    historicalSlips,
    employee,
    normTermDate,
    period.year,
    period.month
  );

  const existingMonthWorkedDays = sameMonthSlips.reduce(
    (acc, s) => acc + (Number(s.workedDays) || 0),
    0
  );

  // Determinar causal por defecto: si no se indicó explícitamente y está en período de prueba, sugerir PERIODO_PRUEBA
  const initialProbMonths =
    params.probationMonthsLimit !== undefined && params.probationMonthsLimit !== null
      ? Number(params.probationMonthsLimit)
      : 6;
  const initialSeniority = computeExactSeniority(employee.hireDate, normTermDate, initialProbMonths);

  const resolvedCause =
    params.terminationCause ||
    savedWorksheet?.terminationCause ||
    (initialSeniority.inProbationPeriod ? 'PERIODO_PRUEBA' : 'DESPIDO_SIN_CAUSA');

  const resolvedIncludeWorkedDays =
    params.includeWorkedDays !== undefined && params.includeWorkedDays !== null
      ? Boolean(params.includeWorkedDays)
      : savedWorksheet
        ? Boolean(savedWorksheet.includeWorkedDays)
        : existingMonthWorkedDays === 0;

  const resolvedMrmnh =
    params.customMrmnh !== undefined && params.customMrmnh !== null && Number(params.customMrmnh) > 0
      ? Number(params.customMrmnh)
      : salaryAudit.detectedMrmnh;

  const resolvedBestSem =
    params.customBestSemesterRemun !== undefined && params.customBestSemesterRemun !== null && Number(params.customBestSemesterRemun) > 0
      ? Number(params.customBestSemesterRemun)
      : salaryAudit.detectedBestSemesterRemun;

  const calc = computeFinalSettlementCalculation({
    hireDate: employee.hireDate,
    terminationDate: normTermDate,
    terminationCause: resolvedCause,
    includeWorkedDays: resolvedIncludeWorkedDays,
    daysDivisorMode: params.daysDivisorMode || savedWorksheet?.daysDivisorMode || 'CALENDAR',
    preavisoGiven:
      params.preavisoGiven !== undefined && params.preavisoGiven !== null
        ? Boolean(params.preavisoGiven)
        : Boolean(savedWorksheet?.preavisoGiven ?? false),
    probationMonthsLimit: initialProbMonths,
    vacationDaysTaken:
      params.vacationDaysTaken !== undefined && params.vacationDaysTaken !== null
        ? Number(params.vacationDaysTaken)
        : Number(savedWorksheet?.vacationDaysTaken ?? 0),
    applyVizzoti:
      params.applyVizzoti !== undefined && params.applyVizzoti !== null
        ? Boolean(params.applyVizzoti)
        : Boolean(savedWorksheet?.applyVizzoti ?? true),
    cctCapAmount:
      params.cctCapAmount !== undefined
        ? params.cctCapAmount
        : savedWorksheet?.cctCapAmount ?? null,
    isExecutive:
      params.isExecutive !== undefined && params.isExecutive !== null
        ? Boolean(params.isExecutive)
        : Boolean(savedWorksheet?.isExecutive ?? false),
    mrmnh: resolvedMrmnh,
    bestSemesterRemun: resolvedBestSem,
    currentMonthBaseSalary: salaryAudit.currentMonthBaseSalary,
    gratificationAmount: params.gratificationAmount !== undefined ? Number(params.gratificationAmount) : 0,
    existingMonthWorkedDays,
  });

  const conceptMap = await resolveFinalConceptCatalogMap(tenantPrisma, settlementType?.conceptPrefix || 'FI');
  const rubrosWithConcept = calc.rubros.map((r) => {
    const matched = conceptMap.get(r.conceptCode);
    return {
      ...r,
      conceptId: matched?.id || null,
      targetConceptCode: matched?.code || r.conceptCode,
      targetConceptName: matched?.name || r.label,
    };
  });

  return {
    period: {
      id: period.id,
      year: period.year,
      month: period.month,
      status: period.status,
      settlementName: period.settlementName,
      periodType: period.periodType,
      conceptPrefix: settlementType?.conceptPrefix || 'FI',
    },
    employee: {
      id: employee.id,
      fileNumber: employee.fileNumber,
      firstName: employee.firstName,
      lastName: employee.lastName,
      cuil: employee.cuil,
      status: employee.status,
      hireDate: employee.hireDate,
      categoryName: employee.jobPosition?.name || '-',
      cctCode: employee.jobPosition?.cctCode || null,
      basicSalary: Number(employee.basicSalary || 0),
    },
    savedWorksheet: savedWorksheet
      ? {
          id: savedWorksheet.id,
          terminationDate: savedWorksheet.terminationDate,
          terminationCause: savedWorksheet.terminationCause,
          terminationReasonLabel: savedWorksheet.terminationReasonLabel,
          workedDaysForLsd: savedWorksheet.workedDaysForLsd,
          appliedAt: savedWorksheet.appliedAt,
        }
      : null,
    existingMonthSettlements: sameMonthSlips.map((s) => ({
      paySlipId: s.id,
      periodId: s.payrollPeriod?.id,
      settlementName: s.payrollPeriod?.settlementName || s.payrollPeriod?.periodType,
      workedDays: Number(s.workedDays || 0),
      netSalary: Number(s.netSalary || 0),
    })),
    existingMonthWorkedDays,
    salaryAudit,
    causesCatalog: FINAL_SETTLEMENT_CAUSES,
    payrollSettingsSnapshot: {
      ansesMinCap: Number(payrollSettings?.ansesMinCap || 0),
      ansesMaxCap: Number(payrollSettings?.ansesMaxCap || 0),
    },
    ...calc,
    rubros: rubrosWithConcept,
  };
}

/**
 * Persiste la hoja de trabajo de Liquidación Final, sincroniza novedades del período
 * y ejecuta el cálculo inmediato del recibo del colaborador.
 */
export async function applyFinalSettlement(tenantPrisma, periodId, params = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const { period, settlementType } = await assertTerminalOpenPeriod(tenantPrisma, periodId, { requireOpen: true });

  // Recalcular preview autoritativo con los parámetros elegidos antes de persistir
  const preview = await previewFinalSettlement(tenantPrisma, periodId, params);

  const normTermDate = normalizeUtcNoonDate(params.terminationDate);
  const causeMeta = FINAL_SETTLEMENT_CAUSE_MAP.get(String(params.terminationCause || '').toUpperCase());
  const terminationReasonLabel = String(
    (params.terminationReasonLabel && String(params.terminationReasonLabel).trim()) ||
      causeMeta?.shortLabel ||
      'Liquidación Final'
  ).slice(0, 255);

  // Combinar rubros calculados con los overrides explícitos enviados desde el asistente
  const overrideMap = new Map();
  for (const item of params.items || []) {
    if (item && item.conceptCode) {
      overrideMap.set(String(item.conceptCode).trim().toUpperCase(), item);
    }
  }

  const finalRubros = preview.rubros.map((r) => {
    const ov = overrideMap.get(r.conceptCode) || overrideMap.get(r.targetConceptCode);
    if (!ov) return r;
    return {
      ...r,
      included: ov.included !== undefined ? Boolean(ov.included) : r.included,
      amount: ov.amount !== undefined && ov.amount !== null ? round2(ov.amount) : r.amount,
      units: ov.units !== undefined && ov.units !== null ? Number(ov.units) : r.units,
    };
  });

  const finalSummary = summarizeFinalRubros(finalRubros);
  const workedDaysForLsd = Math.max(
    0,
    Math.min(
      30,
      Math.round(
        params.workedDaysForLsd !== undefined && params.workedDaysForLsd !== null
          ? Number(params.workedDaysForLsd)
          : preview.workedDaysForLsd
      )
    )
  );

  const conceptMap = await resolveFinalConceptCatalogMap(tenantPrisma, settlementType?.conceptPrefix || 'FI');
  const managedConceptIds = Array.from(conceptMap.values()).map((c) => c.id);

  // Persistir worksheet y novedades en transacción atómica (luego calculatePayroll corre fuera de esta tx)
  const worksheet = await tenantPrisma.$transaction(async (tx) => {
    const wsData = {
      terminationDate: normTermDate,
      terminationCause: causeMeta.code,
      terminationReasonLabel,
      includeWorkedDays: Boolean(params.includeWorkedDays ?? true),
      daysDivisorMode: params.daysDivisorMode || 'CALENDAR',
      preavisoGiven: Boolean(params.preavisoGiven ?? false),
      vacationDaysTaken: Number(params.vacationDaysTaken || 0),
      applyVizzoti: Boolean(params.applyVizzoti ?? true),
      cctCapAmount: params.cctCapAmount !== null && params.cctCapAmount !== undefined && Number(params.cctCapAmount) > 0
        ? round2(params.cctCapAmount)
        : null,
      isExecutive: Boolean(params.isExecutive ?? false),
      seniorityYears: preview.seniority.years,
      seniorityMonths: preview.seniority.months,
      seniorityDays: preview.seniority.days,
      indemnityPeriods: preview.seniority.indemnityPeriods,
      inProbationPeriod: Boolean(preview.seniority.inProbationPeriod),
      mrmnhAmount: round2(preview.parametersUsed.mrmnh),
      mrmnhSourcePeriodLabel: preview.salaryAudit.detectedMrmnhLabel || null,
      bestSemesterRemun: round2(preview.parametersUsed.bestSemesterRemun),
      workedDaysForLsd,
      legalDueDate: preview.legalDueDate ? normalizeUtcNoonDate(preview.legalDueDate) : null,
      worksheetPayload: {
        cause: causeMeta,
        seniority: preview.seniority,
        parametersUsed: preview.parametersUsed,
        rubros: finalRubros,
        summary: finalSummary,
      },
      appliedAt: new Date(),
    };

    const saved = await tx.finalSettlementWorksheet.upsert({
      where: {
        payrollPeriodId_employeeId: {
          payrollPeriodId: periodId,
          employeeId: params.employeeId,
        },
      },
      create: {
        id: crypto.randomUUID(),
        payrollPeriodId: periodId,
        employeeId: params.employeeId,
        ...wsData,
      },
      update: wsData,
    });

    // Depurar novedades FI* previas para evitar arrastre de rubros desactivados
    if (managedConceptIds.length > 0) {
      await tx.periodNovelty.deleteMany({
        where: {
          payrollPeriodId: periodId,
          employeeId: params.employeeId,
          conceptId: { in: managedConceptIds },
        },
      });
    }

    for (const r of finalRubros) {
      if (!r.included || round2(r.amount) <= 0) continue;
      const targetConcept = conceptMap.get(r.conceptCode);
      if (!targetConcept) continue;

      await tx.periodNovelty.upsert({
        where: {
          payrollPeriodId_employeeId_conceptId: {
            payrollPeriodId: periodId,
            employeeId: params.employeeId,
            conceptId: targetConcept.id,
          },
        },
        create: {
          id: crypto.randomUUID(),
          payrollPeriodId: periodId,
          employeeId: params.employeeId,
          conceptId: targetConcept.id,
          amount: round2(r.amount),
          units: r.units !== undefined && r.units !== null ? Number(r.units) : 1,
          notes: `Asistente Final: ${causeMeta.shortLabel}`,
        },
        update: {
          amount: round2(r.amount),
          units: r.units !== undefined && r.units !== null ? Number(r.units) : 1,
          notes: `Asistente Final: ${causeMeta.shortLabel}`,
        },
      });
    }

    return saved;
  });

  // Ejecutar cálculo individual del recibo del colaborador respetando workedDaysForLsd
  const calculationResult = await calculatePeriod(tenantPrisma, periodId, {
    employeeIds: [params.employeeId],
    novedades: [
      {
        employeeId: params.employeeId,
        workedDays: workedDaysForLsd,
      },
    ],
  });

  const slip = await tenantPrisma.paySlip.findFirst({
    where: {
      payrollPeriodId: periodId,
      employeeId: params.employeeId,
      deletedAt: null,
    },
    include: {
      items: { orderBy: [{ type: 'asc' }, { conceptCode: 'asc' }] },
      basis: true,
    },
  });

  return {
    worksheet,
    paySlip: slip,
    summary: finalSummary,
    calculationResult,
  };
}
