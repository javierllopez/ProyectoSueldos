/**
 * formulaEvaluator.js
 * Motor de evaluación matemática seguro para fórmulas de liquidación de haberes en ProyectoSueldos.
 * Soporta funciones de topes (TOPE_MAX, TOPE_MIN, LIMITAR), condicionales (SI, IF),
 * resolución de tokens de conceptos, totales de grupo, variables de novedad y acumulados históricos.
 */

/**
 * Divide una cadena de argumentos separados por coma respetando el anidamiento de paréntesis.
 * @param {string} argsStr 
 * @returns {string[]}
 */
/**
 * Resuelve una fecha a partir de una variable de contexto, token o cadena literal (YYYY-MM-DD o DD/MM/YYYY).
 * @param {string|Date} argStr 
 * @param {object} context 
 * @returns {Date|null}
 */
export function resolveDateValue(argStr, context = {}) {
  if (!argStr) return null;
  if (argStr instanceof Date && !isNaN(argStr.getTime())) {
    return new Date(argStr.getFullYear(), argStr.getMonth(), argStr.getDate(), 12, 0, 0);
  }

  let clean = String(argStr).trim();
  // Quitar corchetes si vienen en el argumento
  if (clean.startsWith('[') && clean.endsWith(']')) {
    clean = clean.slice(1, -1).trim();
  }
  // Quitar comillas si vienen en el argumento
  if ((clean.startsWith("'") && clean.endsWith("'")) || (clean.startsWith('"') && clean.endsWith('"'))) {
    clean = clean.slice(1, -1).trim();
  }

  const upper = clean.toUpperCase();

  // 1. Si es un token en context (o alias conocido)
  if (context[clean] !== undefined && context[clean] !== clean) {
    return resolveDateValue(context[clean], context);
  }
  if (context[upper] !== undefined && context[upper] !== upper) {
    return resolveDateValue(context[upper], context);
  }

  // 2. Resolver alias dinámicos de período según fecha de liquidación / contexto
  const period = context.CURRENT_PERIOD || context.currentPeriod || context.period || {};
  const liqDateStr = context.FECHA_LIQUIDACION || period.liquidationDate || period.paymentDate;
  const refDateObj = liqDateStr ? new Date(liqDateStr) : (period.year ? new Date(period.year, (period.month || 1) - 1, 1) : new Date());
  const refYear = Number(!isNaN(refDateObj.getTime()) ? refDateObj.getFullYear() : (period.year || new Date().getFullYear()));
  const refMonth = Number(!isNaN(refDateObj.getTime()) ? refDateObj.getMonth() + 1 : (period.month || 1));

  if (upper === 'INICIO_SEMESTRE_1' || upper === 'INICIO_PRIMER_SEMESTRE') return new Date(refYear, 0, 1, 12, 0, 0);
  if (upper === 'INICIO_SEMESTRE_2' || upper === 'INICIO_SEGUNDO_SEMESTRE') return new Date(refYear, 6, 1, 12, 0, 0);
  if (upper === 'INICIO_SEMESTRE') {
    return refMonth > 6 ? new Date(refYear, 6, 1, 12, 0, 0) : new Date(refYear, 0, 1, 12, 0, 0);
  }
  if (upper === 'FIN_SEMESTRE_1') return new Date(refYear, 5, 30, 12, 0, 0);
  if (upper === 'FIN_SEMESTRE_2') return new Date(refYear, 11, 31, 12, 0, 0);
  if (upper === 'FIN_SEMESTRE') {
    return refMonth > 6 ? new Date(refYear, 11, 31, 12, 0, 0) : new Date(refYear, 5, 30, 12, 0, 0);
  }
  if (upper === 'INICIO_MES') return new Date(refYear, refMonth - 1, 1, 12, 0, 0);
  if (upper === 'FIN_MES') return new Date(refYear, refMonth, 0, 12, 0, 0);
  if (upper === 'INICIO_ANIO') return new Date(refYear, 0, 1, 12, 0, 0);
  if (upper === 'FIN_ANIO') return new Date(refYear, 11, 31, 12, 0, 0);

  // 3. Formato YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    const dateObj = new Date(y, m, d, 12, 0, 0);
    return isNaN(dateObj.getTime()) ? null : dateObj;
  }

  // 4. Formato DD/MM/YYYY
  const esMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (esMatch) {
    const d = parseInt(esMatch[1], 10);
    const m = parseInt(esMatch[2], 10) - 1;
    const y = parseInt(esMatch[3], 10);
    const dateObj = new Date(y, m, d, 12, 0, 0);
    return isNaN(dateObj.getTime()) ? null : dateObj;
  }

  // 5. Fallback Date.parse
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0);
  }

  return null;
}

export function splitArguments(argsStr) {
  if (!argsStr || typeof argsStr !== 'string') return [];
  const args = [];
  let current = '';
  let depth = 0;
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];

    if (ch === "'" || ch === '"') {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = ch;
      } else if (quoteChar === ch) {
        inQuotes = false;
        quoteChar = '';
      }
    }

    if (!inQuotes) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
    }

    // Separar por ';' o por ',' respetando comas decimales entre dígitos (ej: 0,25)
    const isDecimalComma =
      ch === ',' &&
      i > 0 &&
      /\d/.test(argsStr[i - 1]) &&
      i < argsStr.length - 1 &&
      /\d/.test(argsStr[i + 1]);

    if (!inQuotes && (ch === ';' || (ch === ',' && !isDecimalComma)) && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim().length > 0) {
    args.push(current.trim());
  }

  return args;
}

/**
 * Resuelve métricas históricas (acumulados, promedios, mejor remuneración).
 * @param {string} metricKey - Ej: 'ACUM_6M', 'PROM_12M_ANT', 'MEJOR_ANUAL'
 * @param {string} targetConceptCode - Código del concepto (ej: '1000') o total ('TOTAL_REMUNERATIVO')
 * @param {object} context - Contexto salarial actual del empleado
 * @param {object} historicalData - Historial de recibos e items previos del empleado
 * @returns {number}
 */
export function resolveHistoricalMetric(metricKey, targetConceptCode, context = {}, historicalData = {}) {
  const normKey = String(metricKey || '').toUpperCase().trim();
  const isOrdinaryOnly = /(?:_ORD(?:_ANT)?|_ANT_ORD|^ORD_)/i.test(normKey);
  const isStrictlyPrevious = /_ANT(?:_ORD)?$/i.test(normKey) || normKey.endsWith('_ANT');
  const baseMetric = normKey
    .replace(/^ORD_/i, '')
    .replace(/_ORD_ANT$/i, '')
    .replace(/_ANT_ORD$/i, '')
    .replace(/_ORD$/i, '')
    .replace(/_ANT$/i, '');

  const defaultTarget = isOrdinaryOnly ? 'TOTAL_REMUNERATIVO' : (context.CURRENT_CONCEPT_CODE || '');
  const targetCode = String(targetConceptCode || defaultTarget).toUpperCase().trim();

  // Si no hay historial disponible, devolver 0 o el valor actual si aplica
  const effectiveHistoricalData = (historicalData && Array.isArray(historicalData.slips)) ? historicalData : (context.historicalData || {});
  const historyItems = Array.isArray(effectiveHistoricalData.slips) ? effectiveHistoricalData.slips : (Array.isArray(context.historicalSlips) ? context.historicalSlips : []);
  const currentPeriod = context.CURRENT_PERIOD || context.currentPeriod || context.period || {};

  // Determinar la ventana de meses (6, 12, año calendario o semestre)
  let windowMonths = 6;
  let isCalendarYear = false;
  let isSemester = false;

  if (baseMetric.includes('12M')) {
    windowMonths = 12;
  } else if (baseMetric.includes('ANUAL') || baseMetric.includes('YEAR')) {
    isCalendarYear = true;
  } else if (baseMetric.includes('SEMESTRE')) {
    isSemester = true;
  }

  // Filtrar recibos relevantes según la ventana
  const periodYear = Number(currentPeriod.year || new Date().getFullYear());
  const periodMonth = Number(currentPeriod.month || 1);
  const isSacPeriod = currentPeriod.periodType === 'SAC_1' || currentPeriod.periodType === 'SAC_2' || currentPeriod.periodType === 'SAC';

  // Usamos un mapa agrupado por 'YYYY-MM' para consolidar las remuneraciones devengadas del mes
  // (por ejemplo si hubo quincenas en el mismo mes, o si hubo una liquidación mensual ordinaria previa y luego una final)
  const monthlyMap = new Map();

  // Helper para verificar si un tipo de período corresponde a liquidaciones excluidas (SAC, Vacaciones, Final)
  const isExcludedPeriodType = (pType) => {
    const p = String(pType || '').toUpperCase().trim();
    return p === 'SAC' || p === 'SAC_1' || p === 'SAC_2' || p === 'VACATIONS' || p === 'VACACIONES' || p === 'FINAL' || p === 'LIQUIDACION_FINAL';
  };

  // 1. Si no es estrictamente anterior, inicializar con el valor devengado en la liquidación en curso
  if (!isStrictlyPrevious) {
    const curPType = currentPeriod.periodType;
    const isCurExcluded = isOrdinaryOnly && isExcludedPeriodType(curPType);

    if (!isCurExcluded) {
      let currentVal = 0;
      if (targetCode === 'TOTAL_REMUNERATIVO') {
        currentVal = Number(context.TOTAL_REMUNERATIVO ?? context.totalRemunerativo ?? 0);
        // Si es ordinario, deducir conceptos remunerativos de vacaciones o sac si estuvieran en calculatedItems o evaluatedConcepts
        if (isOrdinaryOnly) {
          if (Array.isArray(context.calculatedItems)) {
            for (const item of context.calculatedItems) {
              if (item.type === 'REMUNERATIVE') {
                const cCode = String(item.conceptCode || '').toUpperCase().trim();
                const arcaCode = String(item.arcaConceptCode || '').trim();
                if (cCode.startsWith('VA') || cCode.startsWith('SA') || cCode.startsWith('FI') ||
                    arcaCode === '120000' || arcaCode === '150000' || /vacacion|aguinaldo|sac|indemniz/i.test(item.conceptName || '')) {
                  currentVal -= Number(item.amount || 0);
                }
              }
            }
          } else if (context.evaluatedConcepts instanceof Map) {
            for (const [code, val] of context.evaluatedConcepts.entries()) {
              const upperC = String(code).toUpperCase().trim();
              if (upperC.startsWith('VA') || upperC.startsWith('SA') || upperC.startsWith('FI')) {
                currentVal -= Number(val || 0);
              }
            }
          }
          currentVal = Math.max(0, currentVal);
        }
      } else if (targetCode === 'TOTAL_NO_REMUNERATIVO') {
        currentVal = Number(context.TOTAL_NO_REMUNERATIVO ?? context.totalNoRemunerativo ?? 0);
      } else if (targetCode === 'TOTAL_DEDUCCIONES') {
        currentVal = Number(context.TOTAL_DEDUCCIONES ?? context.totalDeducciones ?? 0);
      } else if (targetCode === 'TOTAL_BRUTO') {
        currentVal = Number(
          (context.TOTAL_BRUTO ?? context.totalBruto) !== undefined
            ? (context.TOTAL_BRUTO ?? context.totalBruto)
            : (Number(context.TOTAL_REMUNERATIVO ?? context.totalRemunerativo ?? 0) + Number(context.TOTAL_NO_REMUNERATIVO ?? context.totalNoRemunerativo ?? 0))
        );
      } else if (context.evaluatedConcepts instanceof Map && context.evaluatedConcepts.has(targetCode)) {
        currentVal = Number(context.evaluatedConcepts.get(targetCode) || 0);
      } else if (context[targetCode] !== undefined) {
        currentVal = Number(context[targetCode] || 0);
      }
      const currentKey = `${periodYear}-${String(periodMonth).padStart(2, '0')}`;
      monthlyMap.set(currentKey, { year: periodYear, month: periodMonth, amount: currentVal, count: 1, isCurrent: true });
    }
  }

  // 2. Recorrer el historial de recibos pasados
  for (const slip of historyItems) {
    // Si por alguna razón viniera el mismo período actual, saltearlo
    if (slip.payrollPeriodId && currentPeriod.id && slip.payrollPeriodId === currentPeriod.id) continue;

    const slipPeriodType = slip.periodType || slip.payrollPeriod?.periodType;
    if (isOrdinaryOnly && isExcludedPeriodType(slipPeriodType)) {
      continue;
    }

    const slipYear = Number(slip.year || slip.payrollPeriod?.year || 0);
    const slipMonth = Number(slip.month || slip.payrollPeriod?.month || 0);

    // Si la métrica es estrictamente anterior (_ANT) y coincide con el año y mes en curso, omitir
    if (isStrictlyPrevious && slipYear === periodYear && slipMonth === periodMonth) continue;

    // Verificar si cae en la ventana temporal
    let isIncluded = false;
    if (isCalendarYear) {
      // Estrictamente dentro del mismo año calendario
      if (slipYear === periodYear) {
        if (!isStrictlyPrevious || slipMonth < periodMonth) {
          // Si es SAC_1, restringido a meses 1..6
          if (currentPeriod.periodType === 'SAC_1' && slipMonth > 6) continue;
          // Si es SAC_2, restringido a meses 7..12
          if (currentPeriod.periodType === 'SAC_2' && slipMonth < 7) continue;
          isIncluded = true;
        }
      }
    } else if (isSemester) {
      // Estrictamente dentro del mismo semestre del año
      if (slipYear === periodYear) {
        const isCurrentSecondHalf = periodMonth > 6;
        const isSlipSecondHalf = slipMonth > 6;
        if (isCurrentSecondHalf === isSlipSecondHalf) {
          if (!isStrictlyPrevious || slipMonth < periodMonth) {
            isIncluded = true;
          }
        }
      }
    } else {
      // Ventana de 6 o 12 meses móviles hacia atrás (incluyendo el mes en curso si hay recibos previos de ese mes)
      const monthsDiff = (periodYear - slipYear) * 12 + (periodMonth - slipMonth);
      const minDiff = isStrictlyPrevious ? 1 : 0;
      const maxDiff = isStrictlyPrevious ? windowMonths : windowMonths - 1;

      if (monthsDiff >= minDiff && monthsDiff <= maxDiff) {
        // Si es liquidación de SAC, restringir al semestre dentro del mismo año calendario
        if (isSacPeriod) {
          if (slipYear !== periodYear) continue;
          if (currentPeriod.periodType === 'SAC_1' && slipMonth > 6) continue;
          if (currentPeriod.periodType === 'SAC_2' && slipMonth < 7) continue;
        }
        isIncluded = true;
      }
    }

    if (!isIncluded) continue;

    // Extraer el importe según el target
    let amount = 0;
    if (targetCode === 'TOTAL_REMUNERATIVO') {
      amount = Number(slip.remunerativeSalary || 0);
      if (isOrdinaryOnly && Array.isArray(slip.items)) {
        for (const item of slip.items) {
          const itemType = String(item.type || '').toUpperCase();
          if (itemType === 'REMUNERATIVE') {
            const cCode = String(item.conceptCode || '').toUpperCase().trim();
            const arcaCode = String(item.arcaConceptCode || '').trim();
            if (cCode.startsWith('VA') || cCode.startsWith('SA') || cCode.startsWith('FI') ||
                arcaCode === '120000' || arcaCode === '150000' || /vacacion|aguinaldo|sac|indemniz/i.test(item.conceptName || '')) {
              amount -= Number(item.amount || 0);
            }
          }
        }
        amount = Math.max(0, amount);
      }
    } else if (targetCode === 'TOTAL_NO_REMUNERATIVO') {
      amount = Number(slip.nonRemunerative || 0);
    } else if (targetCode === 'TOTAL_DEDUCCIONES') {
      amount = Number(slip.totalDeductions || 0);
    } else if (targetCode === 'TOTAL_BRUTO') {
      amount = Number(slip.grossSalary || 0);
    } else if (Array.isArray(slip.items)) {
      const item = slip.items.find((it) => {
        const cCode = String(it.conceptCode).trim().toUpperCase();
        if (cCode === targetCode) return true;
        // Compatibilidad cruzada entre códigos legacy y nuevos prefijados
        if (targetCode === 'SU1000' && (cCode === '1000' || cCode === '100')) return true;
        if (targetCode === '1000' && cCode === 'SU1000') return true;
        if (targetCode === 'SU1001' && cCode === '1001') return true;
        if (targetCode === '1001' && cCode === 'SU1001') return true;
        if (targetCode === 'SA1000' && cCode === '1200') return true;
        if (targetCode === '1200' && cCode === 'SA1000') return true;
        if (targetCode === 'VA1000' && cCode === '1500') return true;
        if (targetCode === '1500' && cCode === 'VA1000') return true;
        return false;
      });
      if (item) amount = Number(item.amount || 0);
    }

    const key = `${slipYear}-${String(slipMonth).padStart(2, '0')}`;
    if (monthlyMap.has(key)) {
      const existing = monthlyMap.get(key);
      existing.amount += amount;
      existing.count += 1;
    } else {
      monthlyMap.set(key, { year: slipYear, month: slipMonth, amount, count: 1 });
    }
  }

  const monthlyValues = Array.from(monthlyMap.values());
  if (monthlyValues.length === 0) return 0;

  const amounts = monthlyValues.map((m) => m.amount);
  const sum = amounts.reduce((acc, curr) => acc + curr, 0);

  // 1. Acumulado
  if (baseMetric.startsWith('ACUM')) {
    return Math.round(sum * 100) / 100;
  }

  // 2. Mayor / Mejor valor
  if (baseMetric.startsWith('MEJOR') || baseMetric.startsWith('MAYOR') || baseMetric.startsWith('MAX')) {
    const maxVal = Math.max(...amounts, 0);
    return Math.round(maxVal * 100) / 100;
  }

  // 3. Promedio
  if (baseMetric.startsWith('PROM')) {
    // Si es promedio con divisor fijo (ej. PROM_FIJO_6M -> siempre divide por 6)
    if (baseMetric.includes('FIJO')) {
      const divisor = isSemester ? 6 : (isCalendarYear ? Math.max(1, periodMonth) : windowMonths);
      return Math.round((sum / divisor) * 100) / 100;
    }

    // Promedio con divisor dinámico (meses efectivamente liquidados)
    const effectiveCount = monthlyValues.filter((m) => m.amount > 0 || m.isCurrent).length;
    const divisor = effectiveCount > 0 ? effectiveCount : Math.max(1, monthlyValues.length);
    return Math.round((sum / divisor) * 100) / 100;
  }

  return 0;
}

/**
 * Reemplaza tokens [TOKEN] por sus valores numéricos en el contexto.
 */
export function substituteTokens(expr, context = {}, historicalData = {}, matrixResolver = null, fixedValueResolver = null, salaryScaleResolver = null) {
  if (!expr || typeof expr !== 'string') return '';

  let res = expr;

  // 1. Reemplazar matrices: [MATRIZ:CODIGO]
  res = res.replace(/\[MATRIZ:([^\]]+)\]/gi, (match, matrixKey) => {
    if (matrixResolver) {
      const val = matrixResolver(matrixKey.trim(), context);
      return String(val !== undefined && val !== null ? val : 0);
    }
    return '0';
  });

  // 2. Reemplazar valores fijos / constantes: [VALOR:COD], [FIJO:COD], [CONST:COD]
  res = res.replace(/\[(?:VALOR|FIJO|CONST):([^\]]+)\]/gi, (match, fixedKey) => {
    if (fixedValueResolver) {
      const val = fixedValueResolver(fixedKey.trim());
      return String(val !== undefined && val !== null ? val : 0);
    }
    return '0';
  });

  // 2b. Reemplazar nóminas / escalas salariales: [NOMINA:COD], [ESCALA:COD], [SUELDO_NOMINA:COD]
  res = res.replace(/\[(?:NOMINA|ESCALA|SUELDO_NOMINA):([^\]]+)\]/gi, (match, scaleKey) => {
    if (salaryScaleResolver) {
      const val = salaryScaleResolver(scaleKey.trim());
      return String(val !== undefined && val !== null ? val : 0);
    }
    return '0';
  });

  // 3. Reemplazar métricas históricas: [METRICA:CODIGO] o [METRICA]
  res = res.replace(/\[((?:ORD_)?(?:ACUM|PROM(?:_FIJO)?|MEJOR|MAYOR)_(?:6M|12M|ANUAL|SEMESTRE)(?:_(?:ANT|ORD|ANT_ORD|ORD_ANT))?)(?::([^\]]+))?\]/gi, (match, metric, conceptCode) => {
    const val = resolveHistoricalMetric(metric, conceptCode, context, historicalData);
    return String(val);
  });

  // 3b. Reemplazar cantidad / unidades de conceptos: [CANTIDAD:CODIGO], [UNIDADES:CODIGO], [CODIGO:CANTIDAD], [CODIGO:UNIDADES]
  res = res.replace(/\[(?:(?:CANTIDAD|UNIDADES):([A-Z0-9_]+)|([A-Z0-9_]+):(CANTIDAD|UNIDADES))\]/gi, (match, code1, code2) => {
    const targetCode = (code1 || code2).trim().toUpperCase();
    if (context.conceptUnitsMap && context.conceptUnitsMap.has(targetCode)) {
      return String(context.conceptUnitsMap.get(targetCode));
    }
    if (context[`${targetCode}_CANTIDAD`] !== undefined) {
      return String(context[`${targetCode}_CANTIDAD`]);
    }
    if (context[`${targetCode}_UNIDADES`] !== undefined) {
      return String(context[`${targetCode}_UNIDADES`]);
    }
    const numOnly = targetCode.replace(/\D/g, '');
    if (numOnly) {
      if (context.conceptUnitsMap && context.conceptUnitsMap.has(numOnly)) {
        return String(context.conceptUnitsMap.get(numOnly));
      }
      if (context[`${numOnly}_CANTIDAD`] !== undefined) {
        return String(context[`${numOnly}_CANTIDAD`]);
      }
    }
    if (Array.isArray(context.calculatedItems)) {
      const it = context.calculatedItems.find((i) => String(i.conceptCode).toUpperCase() === targetCode || (numOnly && String(i.conceptCode).replace(/\D/g, '') === numOnly));
      if (it && it.units !== undefined && it.units !== null) {
        return String(it.units);
      }
    }
    return '0';
  });

  // 4. Reemplazar tokens simples [CODIGO] o [VARIABLE]
  res = res.replace(/\[([A-Z0-9_]+)\]/gi, (match, token) => {
    const cleanToken = token.trim();
    const upperToken = cleanToken.toUpperCase();

    // Variables de fechas relevantes para la liquidación
    const DATE_VARIABLES = new Set([
      'FECHA_LIQUIDACION', 'LIQUIDATION_DATE',
      'FECHA_INGRESO', 'FECHA_EGRESO', 'FECHA_BAJA', 'FECHA_PAGO',
      'INICIO_SEMESTRE', 'INICIO_SEMESTRE_1', 'INICIO_SEMESTRE_2',
      'FIN_SEMESTRE', 'FIN_SEMESTRE_1', 'FIN_SEMESTRE_2',
      'INICIO_MES', 'FIN_MES', 'INICIO_ANIO', 'FIN_ANIO'
    ]);
    if (DATE_VARIABLES.has(upperToken)) {
      const d = resolveDateValue(upperToken, context);
      if (d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `'${y}-${m}-${day}'`;
      }
      return "''";
    }

    // Variables de novedad del propio concepto
    if (upperToken === 'CANTIDAD' || upperToken === 'PROPIO_VALOR' || upperToken === 'UNIDADES') {
      return String(context.CANTIDAD !== undefined ? context.CANTIDAD : (context.UNIDADES || 0));
    }
    if (upperToken === 'HORAS') {
      return String(context.HORAS !== undefined ? context.HORAS : (context.CANTIDAD || 0));
    }
    if (upperToken === 'PORCENTAJE') {
      return String(context.PORCENTAJE !== undefined ? context.PORCENTAJE : ((context.CANTIDAD || 0) / 100));
    }
    if (upperToken === 'PORCENTAJE_ENTERO') {
      return String(context.PORCENTAJE_ENTERO !== undefined ? context.PORCENTAJE_ENTERO : (context.CANTIDAD || 0));
    }
    if (upperToken === 'VALOR_BASE' || upperToken === 'VALOR_DEFECTO' || upperToken === 'DEFECTO') {
      return String(context.VALOR_BASE !== undefined ? context.VALOR_BASE : (context.defaultValue || 0));
    }
    if (upperToken === 'IMPORTE' || upperToken === 'MONTO' || upperToken === 'VALOR_NOVEDAD') {
      return String(context.IMPORTE !== undefined ? context.IMPORTE : (context.VALOR_BASE !== undefined ? context.VALOR_BASE : (context.defaultValue || 0)));
    }

    // Totales de grupo
    if (upperToken === 'TOTAL_REMUNERATIVO') return String(Number(context.TOTAL_REMUNERATIVO || 0));
    if (upperToken === 'TOTAL_NO_REMUNERATIVO') return String(Number(context.TOTAL_NO_REMUNERATIVO || 0));
    if (upperToken === 'TOTAL_DEDUCCIONES') return String(Number(context.TOTAL_DEDUCCIONES || 0));
    if (upperToken === 'TOTAL_BRUTO') {
      return String(Number((context.TOTAL_REMUNERATIVO || 0) + (context.TOTAL_NO_REMUNERATIVO || 0)));
    }

    // Conceptos directos en el contexto
    if (context[cleanToken] !== undefined) return String(context[cleanToken]);
    if (context[upperToken] !== undefined) return String(context[upperToken]);

    // Consultar valor fijo global directo (ej: [SMVM])
    if (fixedValueResolver) {
      const fVal = fixedValueResolver(upperToken);
      if (fVal !== null && fVal !== undefined) return String(fVal);
    }

    // Consultar nómina directa si se utiliza por código directo (ej: [MUCAMA])
    if (salaryScaleResolver) {
      const sVal = salaryScaleResolver(upperToken);
      if (sVal !== null && sVal !== undefined) return String(sVal);
    }

    return '0';
  });

  return res;
}

const mathFunctionCache = new Map();
const MAX_MATH_CACHE = 1000;

/**
 * Evalúa una expresión matemática simple sin funciones complejas de forma segura con caché de compilación.
 */
export function evaluateSafeExpression(expr) {
  if (!expr || typeof expr !== 'string') return 0;

  // Normalizar comas decimales entre dígitos (ej: 0,25 -> 0.25)
  const normalized = expr.replace(/(\d+),(\d+)/g, '$1.$2');

  // Sanitizar caracteres permitidos
  const sanitized = normalized.replace(/[^0-9+\-*/().\s]/g, '').trim();
  if (!sanitized) return 0;

  try {
    let fn = mathFunctionCache.get(sanitized);
    if (!fn) {
      if (mathFunctionCache.size >= MAX_MATH_CACHE) {
        const keysToDelete = Array.from(mathFunctionCache.keys()).slice(0, 200);
        for (const k of keysToDelete) mathFunctionCache.delete(k);
      }
      fn = new Function(`'use strict'; return (${sanitized});`);
      mathFunctionCache.set(sanitized, fn);
    }
    const val = fn();
    return isNaN(val) || !isFinite(val) ? 0 : Number(val);
  } catch (err) {
    return 0;
  }
}

export const evaluateBasicMath = evaluateSafeExpression;

/**
 * Evalúa expresiones condicionales y comparaciones (>, <, >=, <=, ==, !=).
 */
export function evaluateCondition(condStr, context = {}, historicalData = {}, matrixResolver = null, fixedValueResolver = null, salaryScaleResolver = null) {
  if (!condStr || typeof condStr !== 'string') return false;

  const operators = ['>=', '<=', '!=', '<>', '==', '=', '>', '<'];
  let opFound = null;
  let opIndex = -1;

  for (const op of operators) {
    const idx = condStr.indexOf(op);
    if (idx !== -1) {
      opFound = op;
      opIndex = idx;
      break;
    }
  }

  if (!opFound) {
    // Si no tiene comparador, se evalúa como verdad si el valor numérico es distinto de 0
    const val = evaluateFormula(condStr, context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
    return Boolean(val && val !== 0);
  }

  const leftStr = condStr.substring(0, opIndex).trim();
  const rightStr = condStr.substring(opIndex + opFound.length).trim();

  // Si ambos lados representan fechas válidas (literales o variables)
  const dLeft = resolveDateValue(leftStr, context);
  const dRight = resolveDateValue(rightStr, context);
  if (dLeft && dRight) {
    const tLeft = dLeft.getTime();
    const tRight = dRight.getTime();
    switch (opFound) {
      case '>=': return tLeft >= tRight;
      case '<=': return tLeft <= tRight;
      case '!=':
      case '<>': return tLeft !== tRight;
      case '==':
      case '=': return tLeft === tRight;
      case '>': return tLeft > tRight;
      case '<': return tLeft < tRight;
      default: return false;
    }
  }

  const leftVal = evaluateFormula(leftStr, context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
  const rightVal = evaluateFormula(rightStr, context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);

  switch (opFound) {
    case '>=': return leftVal >= rightVal;
    case '<=': return leftVal <= rightVal;
    case '!=':
    case '<>': return leftVal !== rightVal;
    case '==':
    case '=': return leftVal === rightVal;
    case '>': return leftVal > rightVal;
    case '<': return leftVal < rightVal;
    default: return false;
  }
}

/**
 * Resuelve una fórmula textual sustituyendo todos los tokens de conceptos/variables
 * y evaluando las llamadas a funciones (DIF_DIAS, DIF_MESES, DIF_ANIOS, DIF_FECHA,
 * TOPE_MAX, TOPE_MIN, LIMITAR, SI/IF, MIN, MAX, REDONDEAR/ROUND, ABS, CEIL, FLOOR)
 * por sus valores numéricos resultantes, manteniendo los operadores aritméticos básicos
 * para su clara auditoría (ej: "1790000 * 80 / 360").
 * 
 * @param {string} formulaStr - Expresión de cálculo
 * @param {object} context - Variables del empleado y conceptos calculados
 * @param {object} historicalData - Recibos históricos para acumulados
 * @param {function} matrixResolver - Helper para evaluar matrices
 * @param {function} fixedValueResolver - Helper para constantes globales
 * @param {function} salaryScaleResolver - Helper para escalas salariales / nóminas
 * @returns {string} Expresión matemática con funciones y tokens evaluados
 */
export function resolveFormulaExpression(formulaStr, context = {}, historicalData = {}, matrixResolver = null, fixedValueResolver = null, salaryScaleResolver = null) {
  if (!formulaStr || typeof formulaStr !== 'string') return '';

  let expr = formulaStr.trim();
  if (!expr) return '';

  // 1. Reemplazo preliminar de tokens directos
  expr = substituteTokens(expr, context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);

  // 2. Soporte para operador infijo de topes |<= (techo) y |>= (piso) si el usuario los utilizara
  if (expr.includes('|<=') || expr.includes('|>=') || expr.includes('<|') || expr.includes('|>')) {
    expr = expr.replace(/(.+?)\s*(?:\|<=|<\|)\s*(.+)/g, 'TOPE_MAX($1, $2)');
    expr = expr.replace(/(.+?)\s*(?:\|>=|\|>)\s*(.+)/g, 'TOPE_MIN($1, $2)');
  }

  // 3. Procesar llamadas a funciones de forma iterativa desde las más anidadas
  const functionRegex = /(TOPE_MAX|TOPE_MIN|LIMITAR|SI|IF|MIN|MAX|REDONDEAR|ROUND|ABS|CEIL|FLOOR|DIF_DIAS|DIF_MESES|DIF_ANIOS|DIF_FECHA|DIFERENCIA_FECHAS)\s*\(/i;

  let safetyLimit = 50;
  while (functionRegex.test(expr) && safetyLimit > 0) {
    safetyLimit--;

    // Buscar el último nombre de función antes de un '('
    const matches = [...expr.matchAll(/(TOPE_MAX|TOPE_MIN|LIMITAR|SI|IF|MIN|MAX|REDONDEAR|ROUND|ABS|CEIL|FLOOR|DIF_DIAS|DIF_MESES|DIF_ANIOS|DIF_FECHA|DIFERENCIA_FECHAS)\s*\(/gi)];
    if (matches.length === 0) break;

    // Tomar la última función encontrada para resolver de adentro hacia afuera
    const lastMatch = matches[matches.length - 1];
    const innermostName = lastMatch[1].toUpperCase();
    const innermostStart = lastMatch.index;
    const openParenIdx = innermostStart + lastMatch[0].length - 1;

    // Encontrar su paréntesis de cierre correspondiente
    let depth = 1;
    let closeParenIdx = -1;
    for (let i = openParenIdx + 1; i < expr.length; i++) {
      if (expr[i] === '(') depth++;
      else if (expr[i] === ')') {
        depth--;
        if (depth === 0) {
          closeParenIdx = i;
          break;
        }
      }
    }

    if (closeParenIdx === -1) {
      // Paréntesis desbalanceado
      break;
    }

    const innerArgsStr = expr.substring(openParenIdx + 1, closeParenIdx);
    const args = splitArguments(innerArgsStr);
    let resolvedVal = 0;

    if (innermostName === 'SI' || innermostName === 'IF') {
      if (args.length >= 2) {
        const isTrue = evaluateCondition(args[0], context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
        const branchExpr = isTrue ? args[1] : (args[2] !== undefined ? args[2] : '0');
        resolvedVal = evaluateFormula(branchExpr, context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
      }
    } else if (innermostName === 'TOPE_MAX') {
      const val = evaluateFormula(args[0] || '0', context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
      const maxVal = evaluateFormula(args[1] || '0', context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
      resolvedVal = Math.min(val, maxVal);
    } else if (innermostName === 'TOPE_MIN') {
      const val = evaluateFormula(args[0] || '0', context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
      const minVal = evaluateFormula(args[1] || '0', context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
      resolvedVal = Math.max(val, minVal);
    } else if (innermostName === 'LIMITAR') {
      const val = evaluateFormula(args[0] || '0', context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
      const minVal = evaluateFormula(args[1] || '0', context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
      const maxVal = evaluateFormula(args[2] || '0', context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
      resolvedVal = Math.min(Math.max(val, minVal), maxVal);
    } else if (innermostName === 'MIN') {
      const evaluatedArgs = args.map((a) => evaluateFormula(a, context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver));
      resolvedVal = Math.min(...evaluatedArgs);
    } else if (innermostName === 'MAX') {
      const evaluatedArgs = args.map((a) => evaluateFormula(a, context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver));
      resolvedVal = Math.max(...evaluatedArgs);
    } else if (innermostName === 'REDONDEAR' || innermostName === 'ROUND') {
      const val = evaluateFormula(args[0] || '0', context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
      const decimals = Math.max(0, Math.floor(evaluateFormula(args[1] || '2', context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver)));
      const factor = Math.pow(10, decimals);
      resolvedVal = Math.round(val * factor) / factor;
    } else if (innermostName === 'ABS') {
      const val = evaluateFormula(args[0] || '0', context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
      resolvedVal = Math.abs(val);
    } else if (innermostName === 'CEIL') {
      const val = evaluateFormula(args[0] || '0', context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
      resolvedVal = Math.ceil(val);
    } else if (innermostName === 'FLOOR') {
      const val = evaluateFormula(args[0] || '0', context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
      resolvedVal = Math.floor(val);
    } else if (innermostName === 'DIF_DIAS') {
      const d1 = resolveDateValue(args[0], context);
      const d2 = resolveDateValue(args[1], context);
      const inclusive = args[2] ? (String(args[2]).replace(/['"]/g, '').trim().toLowerCase() === 'true' || String(args[2]).trim() === '1' || String(args[2]).replace(/['"]/g, '').trim().toUpperCase() === 'INCLUSIVO') : false;
      if (!d1 || !d2 || d1.getTime() > d2.getTime()) {
        resolvedVal = 0;
      } else {
        const diffMs = d2.getTime() - d1.getTime();
        const diffDays = Math.round(diffMs / 86400000);
        resolvedVal = inclusive ? diffDays + 1 : diffDays;
      }
    } else if (innermostName === 'DIF_MESES') {
      const d1 = resolveDateValue(args[0], context);
      const d2 = resolveDateValue(args[1], context);
      if (!d1 || !d2 || d1.getTime() > d2.getTime()) {
        resolvedVal = 0;
      } else {
        let months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
        if (d2.getDate() < d1.getDate()) {
          months--;
        }
        resolvedVal = Math.max(0, months);
      }
    } else if (innermostName === 'DIF_ANIOS') {
      const d1 = resolveDateValue(args[0], context);
      const d2 = resolveDateValue(args[1], context);
      if (!d1 || !d2 || d1.getTime() > d2.getTime()) {
        resolvedVal = 0;
      } else {
        let years = d2.getFullYear() - d1.getFullYear();
        const mDiff = d2.getMonth() - d1.getMonth();
        if (mDiff < 0 || (mDiff === 0 && d2.getDate() < d1.getDate())) {
          years--;
        }
        resolvedVal = Math.max(0, years);
      }
    } else if (innermostName === 'DIF_FECHA' || innermostName === 'DIFERENCIA_FECHAS') {
      const d1 = resolveDateValue(args[0], context);
      const d2 = resolveDateValue(args[1], context);
      const unit = String(args[2] || 'DIAS').replace(/['"]/g, '').trim().toUpperCase();
      const inclusive = args[3] ? (String(args[3]).replace(/['"]/g, '').trim().toLowerCase() === 'true' || String(args[3]).trim() === '1' || String(args[3]).replace(/['"]/g, '').trim().toUpperCase() === 'INCLUSIVO') : false;
      if (!d1 || !d2 || d1.getTime() > d2.getTime()) {
        resolvedVal = 0;
      } else if (unit.startsWith('DIA') || unit === 'D') {
        const diffMs = d2.getTime() - d1.getTime();
        const diffDays = Math.round(diffMs / 86400000);
        resolvedVal = inclusive ? diffDays + 1 : diffDays;
      } else if (unit.startsWith('MES') || unit === 'M') {
        let months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
        if (d2.getDate() < d1.getDate()) months--;
        resolvedVal = Math.max(0, months);
      } else if (unit.startsWith('AN') || unit.startsWith('AÑ') || unit === 'Y' || unit === 'A') {
        let years = d2.getFullYear() - d1.getFullYear();
        const mDiff = d2.getMonth() - d1.getMonth();
        if (mDiff < 0 || (mDiff === 0 && d2.getDate() < d1.getDate())) years--;
        resolvedVal = Math.max(0, years);
      } else {
        resolvedVal = 0;
      }
    }

    // Reemplazar la llamada por el valor numérico
    expr = expr.substring(0, innermostStart) + String(resolvedVal) + expr.substring(closeParenIdx + 1);
  }

  return expr;
}

export function evaluateFormula(formulaStr, context = {}, historicalData = {}, matrixResolver = null, fixedValueResolver = null, salaryScaleResolver = null) {
  if (!formulaStr || typeof formulaStr !== 'string') return 0;

  const resolvedExpr = resolveFormulaExpression(formulaStr, context, historicalData, matrixResolver, fixedValueResolver, salaryScaleResolver);
  if (!resolvedExpr) return 0;

  // 4. Evaluar la aritmética básica resultante
  const finalVal = evaluateBasicMath(resolvedExpr);
  return Math.round(finalVal * 100) / 100;
}
