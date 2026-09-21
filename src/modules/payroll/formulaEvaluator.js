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
export function splitArguments(argsStr) {
  if (!argsStr || typeof argsStr !== 'string') return [];
  const args = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;

    // Separar por ';' o por ',' respetando comas decimales entre dígitos (ej: 0,25)
    const isDecimalComma =
      ch === ',' &&
      i > 0 &&
      /\d/.test(argsStr[i - 1]) &&
      i < argsStr.length - 1 &&
      /\d/.test(argsStr[i + 1]);

    if ((ch === ';' || (ch === ',' && !isDecimalComma)) && depth === 0) {
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
  const targetCode = String(targetConceptCode || context.CURRENT_CONCEPT_CODE || '').toUpperCase().trim();

  // Si no hay historial disponible, devolver 0 o el valor actual si aplica
  const effectiveHistoricalData = (historicalData && Array.isArray(historicalData.slips)) ? historicalData : (context.historicalData || {});
  const historyItems = Array.isArray(effectiveHistoricalData.slips) ? effectiveHistoricalData.slips : (Array.isArray(context.historicalSlips) ? context.historicalSlips : []);
  const currentPeriod = context.CURRENT_PERIOD || context.currentPeriod || context.period || {};

  // Determinar si la métrica incluye el período en curso
  const isStrictlyPrevious = normKey.endsWith('_ANT');
  const baseMetric = isStrictlyPrevious ? normKey.replace(/_ANT$/, '') : normKey;

  // Determinar la ventana de meses (6, 12 o año calendario)
  let windowMonths = 6;
  let isCalendarYear = false;

  if (baseMetric.includes('12M')) {
    windowMonths = 12;
  } else if (baseMetric.includes('ANUAL') || baseMetric.includes('YEAR')) {
    isCalendarYear = true;
  }

  // Filtrar recibos relevantes según la ventana
  const periodYear = Number(currentPeriod.year || new Date().getFullYear());
  const periodMonth = Number(currentPeriod.month || 1);
  const isSacPeriod = currentPeriod.periodType === 'SAC_1' || currentPeriod.periodType === 'SAC_2' || currentPeriod.periodType === 'SAC';

  // Obtener los valores por mes para el concepto o total requerido
  const monthlyValues = [];

  // Si incluye mes actual y el concepto ya se calculó en el período actual:
  if (!isStrictlyPrevious) {
    let currentVal = 0;
    if (targetCode === 'TOTAL_REMUNERATIVO') {
      currentVal = Number(context.TOTAL_REMUNERATIVO ?? context.totalRemunerativo ?? 0);
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
    monthlyValues.push({ year: periodYear, month: periodMonth, amount: currentVal, isCurrent: true });
  }

  // Recorrer el historial de recibos pasados
  for (const slip of historyItems) {
    const slipYear = Number(slip.year || slip.payrollPeriod?.year || 0);
    const slipMonth = Number(slip.month || slip.payrollPeriod?.month || 0);

    // No duplicar el mes actual si ya fue procesado
    if (slipYear === periodYear && slipMonth === periodMonth) continue;

    // Verificar si cae en la ventana temporal
    let isIncluded = false;
    if (isCalendarYear) {
      // Estrictamente dentro del mismo año calendario
      if (slipYear === periodYear && slipMonth < periodMonth) {
        // Si es SAC_1, restringido a meses 1..6
        if (currentPeriod.periodType === 'SAC_1' && slipMonth > 6) continue;
        // Si es SAC_2, restringido a meses 7..12
        if (currentPeriod.periodType === 'SAC_2' && slipMonth < 7) continue;
        isIncluded = true;
      }
    } else {
      // Ventana de 6 o 12 meses móviles hacia atrás
      const monthsDiff = (periodYear - slipYear) * 12 + (periodMonth - slipMonth);
      const maxDiff = isStrictlyPrevious ? windowMonths : windowMonths - 1;
      if (monthsDiff > 0 && monthsDiff <= maxDiff) {
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
    } else if (targetCode === 'TOTAL_NO_REMUNERATIVO') {
      amount = Number(slip.nonRemunerative || 0);
    } else if (targetCode === 'TOTAL_DEDUCCIONES') {
      amount = Number(slip.totalDeductions || 0);
    } else if (targetCode === 'TOTAL_BRUTO') {
      amount = Number(slip.grossSalary || 0);
    } else if (Array.isArray(slip.items)) {
      const item = slip.items.find((it) => String(it.conceptCode).trim().toUpperCase() === targetCode);
      if (item) amount = Number(item.amount || 0);
    }

    monthlyValues.push({ year: slipYear, month: slipMonth, amount });
  }

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
      const divisor = isCalendarYear ? Math.max(1, periodMonth) : windowMonths;
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
export function substituteTokens(expr, context = {}, historicalData = {}, matrixResolver = null, fixedValueResolver = null) {
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

  // 3. Reemplazar métricas históricas: [METRICA:CODIGO] o [METRICA]
  res = res.replace(/\[((?:ACUM|PROM|MEJOR|MAYOR)_(?:6M|12M|ANUAL)(?:_ANT)?)(?::([^\]]+))?\]/gi, (match, metric, conceptCode) => {
    const val = resolveHistoricalMetric(metric, conceptCode, context, historicalData);
    return String(val);
  });

  // 4. Reemplazar tokens simples [CODIGO] o [VARIABLE]
  res = res.replace(/\[([A-Z0-9_]+)\]/gi, (match, token) => {
    const cleanToken = token.trim();
    const upperToken = cleanToken.toUpperCase();

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

    return '0';
  });

  return res;
}

/**
 * Evalúa una expresión matemática simple sin funciones complejas de forma segura.
 */
export function evaluateBasicMath(expr) {
  if (!expr || typeof expr !== 'string') return 0;

  // Normalizar comas decimales entre dígitos (ej: 0,25 -> 0.25)
  const normalized = expr.replace(/(\d+),(\d+)/g, '$1.$2');

  // Sanitizar caracteres permitidos
  const sanitized = normalized.replace(/[^0-9+\-*/().\s]/g, '').trim();
  if (!sanitized) return 0;

  try {
    const fn = new Function(`'use strict'; return (${sanitized});`);
    const val = fn();
    return isNaN(val) || !isFinite(val) ? 0 : Number(val);
  } catch (err) {
    return 0;
  }
}

/**
 * Evalúa expresiones condicionales y comparaciones (>, <, >=, <=, ==, !=).
 */
export function evaluateCondition(condStr, context = {}, historicalData = {}, matrixResolver = null, fixedValueResolver = null) {
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
    const val = evaluateFormula(condStr, context, historicalData, matrixResolver, fixedValueResolver);
    return Boolean(val && val !== 0);
  }

  const leftStr = condStr.substring(0, opIndex).trim();
  const rightStr = condStr.substring(opIndex + opFound.length).trim();

  const leftVal = evaluateFormula(leftStr, context, historicalData, matrixResolver, fixedValueResolver);
  const rightVal = evaluateFormula(rightStr, context, historicalData, matrixResolver, fixedValueResolver);

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
 * Evalúa una fórmula de cálculo completa con soporte para funciones TOPE_MAX, TOPE_MIN, LIMITAR, SI/IF y tokens.
 * @param {string} formulaStr - Expresión de cálculo
 * @param {object} context - Variables del empleado y conceptos calculados
 * @param {object} historicalData - Recibos históricos para acumulados
 * @param {function} matrixResolver - Helper para evaluar matrices
 * @param {function} fixedValueResolver - Helper para constantes globales
 * @returns {number}
 */
export function evaluateFormula(formulaStr, context = {}, historicalData = {}, matrixResolver = null, fixedValueResolver = null) {
  if (!formulaStr || typeof formulaStr !== 'string') return 0;

  let expr = formulaStr.trim();
  if (!expr) return 0;

  // 1. Reemplazo preliminar de tokens directos
  expr = substituteTokens(expr, context, historicalData, matrixResolver, fixedValueResolver);

  // 2. Soporte para operador infijo de topes |<= (techo) y |>= (piso) si el usuario los utilizara
  if (expr.includes('|<=') || expr.includes('|>=') || expr.includes('<|') || expr.includes('|>')) {
    expr = expr.replace(/(.+?)\s*(?:\|<=|<\|)\s*(.+)/g, 'TOPE_MAX($1, $2)');
    expr = expr.replace(/(.+?)\s*(?:\|>=|\|>)\s*(.+)/g, 'TOPE_MIN($1, $2)');
  }

  // 3. Procesar llamadas a funciones de forma iterativa desde las más anidadas
  const functionRegex = /(TOPE_MAX|TOPE_MIN|LIMITAR|SI|IF|MIN|MAX|REDONDEAR|ROUND|ABS|CEIL|FLOOR)\s*\(/i;

  let safetyLimit = 50;
  while (functionRegex.test(expr) && safetyLimit > 0) {
    safetyLimit--;

    // Buscar el último nombre de función antes de un '('
    const matches = [...expr.matchAll(/(TOPE_MAX|TOPE_MIN|LIMITAR|SI|IF|MIN|MAX|REDONDEAR|ROUND|ABS|CEIL|FLOOR)\s*\(/gi)];
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
        const isTrue = evaluateCondition(args[0], context, historicalData, matrixResolver, fixedValueResolver);
        const branchExpr = isTrue ? args[1] : (args[2] !== undefined ? args[2] : '0');
        resolvedVal = evaluateFormula(branchExpr, context, historicalData, matrixResolver, fixedValueResolver);
      }
    } else if (innermostName === 'TOPE_MAX') {
      const val = evaluateFormula(args[0] || '0', context, historicalData, matrixResolver, fixedValueResolver);
      const maxVal = evaluateFormula(args[1] || '0', context, historicalData, matrixResolver, fixedValueResolver);
      resolvedVal = Math.min(val, maxVal);
    } else if (innermostName === 'TOPE_MIN') {
      const val = evaluateFormula(args[0] || '0', context, historicalData, matrixResolver, fixedValueResolver);
      const minVal = evaluateFormula(args[1] || '0', context, historicalData, matrixResolver, fixedValueResolver);
      resolvedVal = Math.max(val, minVal);
    } else if (innermostName === 'LIMITAR') {
      const val = evaluateFormula(args[0] || '0', context, historicalData, matrixResolver, fixedValueResolver);
      const minVal = evaluateFormula(args[1] || '0', context, historicalData, matrixResolver, fixedValueResolver);
      const maxVal = evaluateFormula(args[2] || '0', context, historicalData, matrixResolver, fixedValueResolver);
      resolvedVal = Math.min(Math.max(val, minVal), maxVal);
    } else if (innermostName === 'MIN') {
      const evaluatedArgs = args.map((a) => evaluateFormula(a, context, historicalData, matrixResolver, fixedValueResolver));
      resolvedVal = Math.min(...evaluatedArgs);
    } else if (innermostName === 'MAX') {
      const evaluatedArgs = args.map((a) => evaluateFormula(a, context, historicalData, matrixResolver, fixedValueResolver));
      resolvedVal = Math.max(...evaluatedArgs);
    } else if (innermostName === 'REDONDEAR' || innermostName === 'ROUND') {
      const val = evaluateFormula(args[0] || '0', context, historicalData, matrixResolver, fixedValueResolver);
      const decimals = Math.max(0, Math.floor(evaluateFormula(args[1] || '2', context, historicalData, matrixResolver, fixedValueResolver)));
      const factor = Math.pow(10, decimals);
      resolvedVal = Math.round(val * factor) / factor;
    } else if (innermostName === 'ABS') {
      const val = evaluateFormula(args[0] || '0', context, historicalData, matrixResolver, fixedValueResolver);
      resolvedVal = Math.abs(val);
    } else if (innermostName === 'CEIL') {
      const val = evaluateFormula(args[0] || '0', context, historicalData, matrixResolver, fixedValueResolver);
      resolvedVal = Math.ceil(val);
    } else if (innermostName === 'FLOOR') {
      const val = evaluateFormula(args[0] || '0', context, historicalData, matrixResolver, fixedValueResolver);
      resolvedVal = Math.floor(val);
    }

    // Reemplazar la llamada por el valor numérico
    expr = expr.substring(0, innermostStart) + String(resolvedVal) + expr.substring(closeParenIdx + 1);
  }

  // 4. Evaluar la aritmética básica resultante
  const finalVal = evaluateBasicMath(expr);
  return Math.round(finalVal * 100) / 100;
}
