/**
 * formulaValidator.js
 * Validador de consistencia y dependencias para fórmulas de liquidación en ProyectoSueldos.
 * Chequea paréntesis, operadores, argumentos de funciones, existencia de conceptos,
 * orden de cálculo (prohibición de referencias hacia adelante) y detección de ciclos.
 */

import { splitArguments } from './formulaEvaluator.js';

export const SYSTEM_VARIABLES = new Set([
  'ANTIGUEDAD_ANOS',
  'ANTIGUEDAD_MESES',
  'DIAS_TRABAJADOS',
  'HORAS_TRABAJADAS',
  'SUELDO_BASICO_EMPLEADO',
  'SUELDO_BASICO',
  'BASICO',
  'ES_JORNADA_PARCIAL',
  'PORCENTAJE_JORNADA',
  'HORAS_SEMANALES',
  'HORAS_CONTRATO',
  'HORAS_MENSUALES',
  'HORAS_DIARIAS',
  'DIAS_MENSUALES',
  'JORNADA_HORAS_DIARIAS',
  'JORNADA_HORAS_SEMANALES',
  'JORNADA_HORAS_MENSUALES',
  'JORNADA_DIAS_MENSUALES',
  'GRUPO_NOMINA',
  'MEJOR_REMUN',
  'BASE_OBRA_SOCIAL',
  'CANTIDAD',
  'HORAS',
  'PORCENTAJE',
  'PORCENTAJE_ENTERO',
  'PROPIO_VALOR',
  'UNIDADES',
  'VALOR_BASE',
  'VALOR_DEFECTO',
  'DEFECTO',
  'IMPORTE',
  'MONTO',
  'VALOR_NOVEDAD',
  'TOTAL_REMUNERATIVO',
  'TOTAL_NO_REMUNERATIVO',
  'TOTAL_DEDUCCIONES',
  'TOTAL_BRUTO',
]);

export const GROUP_TOTALS = new Set([
  'TOTAL_REMUNERATIVO',
  'TOTAL_NO_REMUNERATIVO',
  'TOTAL_DEDUCCIONES',
  'TOTAL_BRUTO',
]);

/**
 * Valida la consistencia sintáctica y lógica de una fórmula antes de guardarla.
 * @param {object} params
 * @param {string} params.formula - Cadena de la fórmula a auditar
 * @param {string} params.conceptCode - Código del concepto que se está creando o editando
 * @param {number} params.calculationOrder - Orden numérico de cálculo del concepto (ej: 100)
 * @param {Array} params.allConcepts - Lista de todos los conceptos disponibles en la empresa
 * @param {Array} params.fixedValues - Constantes salariales globales (opcional)
 * @param {Array} params.matrices - Matrices de liquidación (opcional)
 * @returns {{ isValid: boolean, errors: string[], warnings: string[], referencedConcepts: string[] }}
 */
export function validateConceptFormula({
  formula,
  conceptCode = '',
  currentConceptCode = '',
  conceptType = '',
  type = '',
  calculationOrder = 100,
  currentCalculationOrder,
  allConcepts = [],
  fixedValues = [],
  matrices = [],
  salaryScales = [],
}) {
  const errors = [];
  const warnings = [];
  const referencedConcepts = [];

  if (!formula || typeof formula !== 'string' || !formula.trim()) {
    return { isValid: true, errors: [], warnings: [], referencedConcepts: [] };
  }

  const cleanFormula = formula.trim();
  const currentCode = String(conceptCode || currentConceptCode || '').trim().toUpperCase();

  const extractCodeNumber = (c) => {
    if (!c) return NaN;
    const str = String(c).trim().toUpperCase();
    const match = str.match(/^[A-Z]{2}(\d{4})$/);
    if (match) return parseInt(match[1], 10);
    const pureNum = parseInt(str, 10);
    return isNaN(pureNum) ? NaN : pureNum;
  };

  const extractCodePrefix = (c) => {
    if (!c) return '';
    const str = String(c).trim().toUpperCase();
    const match = str.match(/^([A-Z]{2})\d{4}$/);
    return match ? match[1] : '';
  };

  const currentNum = extractCodeNumber(currentCode);
  const currentPrefix = extractCodePrefix(currentCode);
  const effectiveType = String(type || conceptType || '').trim().toUpperCase();
  const rawOrder = currentCalculationOrder !== undefined ? currentCalculationOrder : calculationOrder;
  const currentOrder = Number(rawOrder !== undefined && rawOrder !== null ? rawOrder : 100);

  // Mapeo rápido de conceptos existentes por código normalizado
  const conceptsMap = new Map();
  for (const c of allConcepts) {
    if (c.code) conceptsMap.set(String(c.code).trim().toUpperCase(), c);
  }

  // Mapeo de matrices y valores fijos por código y por nombre
  const matrixCodes = new Set(matrices.map((m) => String(m.code || '').trim().toUpperCase()));
  const matrixNames = new Set(matrices.map((m) => String(m.name || '').trim().toUpperCase()));
  const fixedCodes = new Set(fixedValues.map((f) => String(f.code || '').trim().toUpperCase()));
  const fixedNames = new Set(fixedValues.map((f) => String(f.name || '').trim().toUpperCase()));
  const salaryScaleCodes = new Set(salaryScales.map((s) => String(s.code || '').trim().toUpperCase()).filter(Boolean));
  const salaryScaleIds = new Set(salaryScales.map((s) => String(s.id || '').trim().toUpperCase()).filter(Boolean));
  const salaryScaleNames = new Set(salaryScales.map((s) => String(s.name || '').trim().toUpperCase()).filter(Boolean));

  // --- 1. Control de Paréntesis ---
  let parenDepth = 0;
  for (let i = 0; i < cleanFormula.length; i++) {
    const ch = cleanFormula[i];
    if (ch === '(') parenDepth++;
    else if (ch === ')') {
      parenDepth--;
      if (parenDepth < 0) {
        errors.push(`Cierre de paréntesis ')' inesperado en la posición ${i + 1}. No hay paréntesis de apertura correspondiente.`);
        break;
      }
    }
  }

  if (parenDepth > 0) {
    errors.push(`Faltan cerrar ${parenDepth} paréntesis ')' en la fórmula.`);
  }

  if (/\(\s*\)/.test(cleanFormula)) {
    errors.push('La fórmula contiene paréntesis vacíos "()" sin expresión interna.');
  }

  // --- 2. Control de Operadores Aritméticos ---
  if (/[+\-*/]{2,}/.test(cleanFormula.replace(/\s+/g, ''))) {
    // Permitir combinación como *- o /- para signos negativos si fuera necesario, pero alertar secuencias inválidas
    const invalidSequence = cleanFormula.match(/[+*/]{2,}|[-]{3,}|[+*/]-{2,}/);
    if (invalidSequence) {
      errors.push(`Operadores aritméticos consecutivos inválidos: "${invalidSequence[0]}".`);
    }
  }

  if (/[+\-*/]\s*$/.test(cleanFormula)) {
    errors.push('La fórmula no puede terminar en un operador aritmético (+, -, *, /).');
  }

  if (/^\s*[*\/]/.test(cleanFormula)) {
    errors.push('La fórmula no puede comenzar con un operador de multiplicación o división (*, /).');
  }

  // Detección estática de división por cero literal
  if (/\/\s*0(?![0-9.])|\/\s*\(\s*0(?:\.0+)?\s*\)/.test(cleanFormula)) {
    errors.push('División por cero literal detectada (/ 0).');
  }

  // --- 3. Control de Funciones Específicas (SI, TOPE_MAX, TOPE_MIN, LIMITAR) ---
  const funcCallRegex = /(TOPE_MAX|TOPE_MIN|LIMITAR|SI|IF)\s*\(/gi;
  let match;
  while ((match = funcCallRegex.exec(cleanFormula)) !== null) {
    const funcName = match[1].toUpperCase();
    const startIdx = match.index + match[0].length - 1;

    let depth = 1;
    let endIdx = -1;
    for (let j = startIdx + 1; j < cleanFormula.length; j++) {
      if (cleanFormula[j] === '(') depth++;
      else if (cleanFormula[j] === ')') {
        depth--;
        if (depth === 0) {
          endIdx = j;
          break;
        }
      }
    }

    if (endIdx !== -1) {
      const argsStr = cleanFormula.substring(startIdx + 1, endIdx);
      const args = splitArguments(argsStr);

      if ((funcName === 'TOPE_MAX' || funcName === 'TOPE_MIN') && args.length !== 2) {
        errors.push(`La función ${funcName} requiere exactamente 2 argumentos: ${funcName}(expresion, limite). Se recibieron ${args.length}.`);
      } else if (funcName === 'LIMITAR' && args.length !== 3) {
        errors.push(`La función LIMITAR requiere exactamente 3 argumentos: LIMITAR(expresion, minimo, maximo). Se recibieron ${args.length}.`);
      } else if ((funcName === 'SI' || funcName === 'IF') && (args.length < 2 || args.length > 3)) {
        errors.push(`La función ${funcName} requiere 3 argumentos: ${funcName}(condicion, valor_verdadero, valor_falso).`);
      } else if (funcName === 'SI' || funcName === 'IF') {
        // Verificar que la condición tenga un comparador
        const cond = args[0];
        const hasRelational = /[><!=]=?|<>/i.test(cond);
        if (!hasRelational) {
          warnings.push(`La condición en ${funcName}("${cond}") no parece contener un operador relacional (>, <, >=, <=, ==, !=).`);
        }
      }
    }
  }

  // --- 4. Control de Tokens entre Corchetes ---
  const tokenRegex = /\[([^\]]+)\]/g;
  let tokenMatch;

  while ((tokenMatch = tokenRegex.exec(cleanFormula)) !== null) {
    const rawToken = tokenMatch[1].trim();
    const upperToken = rawToken.toUpperCase();

    // 4.1. Token de Matriz: [MATRIZ:CODIGO] o [MATRIZ:NOMBRE]
    if (/^MATRIZ:/i.test(upperToken)) {
      const matKey = rawToken.substring(7).trim().toUpperCase();
      if (!matrixCodes.has(matKey) && !matrixNames.has(matKey) && matrices.length > 0) {
        warnings.push(`La matriz [MATRIZ:${matKey}] no se encuentra en el catálogo activo de matrices.`);
      }
      continue;
    }

    // 4.2. Token de Valor Fijo: [VALOR:COD] o [FIJO:COD] o [CONST:COD]
    if (/^(?:VALOR|FIJO|CONST):/i.test(upperToken)) {
      const fixedKey = rawToken.split(':')[1].trim().toUpperCase();
      if (!fixedCodes.has(fixedKey) && !fixedNames.has(fixedKey) && fixedValues.length > 0) {
        warnings.push(`La constante salarial [VALOR:${fixedKey}] no se encuentra en el catálogo de valores fijos.`);
      }
      continue;
    }

    // 4.2b. Token de Nómina / Escala: [NOMINA:COD] o [ESCALA:COD] o [SUELDO_NOMINA:COD]
    if (/^(?:NOMINA|ESCALA|SUELDO_NOMINA):/i.test(upperToken)) {
      const scaleKey = rawToken.split(':')[1].trim().toUpperCase();
      if (salaryScales.length > 0 && !salaryScaleCodes.has(scaleKey) && !salaryScaleIds.has(scaleKey) && !salaryScaleNames.has(scaleKey)) {
        warnings.push(`La nómina / escala salarial [NOMINA:${scaleKey}] no se encuentra en el catálogo de nóminas registradas.`);
      }
      continue;
    }

    // 4.3. Token de Métrica Histórica: [METRICA:CODIGO] o [METRICA]
    const histMatch = upperToken.match(/^((?:ACUM|PROM(?:_FIJO)?|MEJOR|MAYOR)_(?:6M|12M|ANUAL)(?:_ANT)?)(?::([^\]]+))?$/i);
    if (histMatch) {
      const metricName = histMatch[1];
      const targetCode = histMatch[2] ? histMatch[2].trim().toUpperCase() : null;

      if (targetCode) {
        // Si especifica target, validar que exista el concepto o sea un grupo
        if (!GROUP_TOTALS.has(targetCode) && !conceptsMap.has(targetCode)) {
          errors.push(`La métrica histórica [${metricName}:${targetCode}] hace referencia al concepto inexistente "${targetCode}".`);
        }
      }
      // Las métricas históricas del propio concepto son legales
      continue;
    }

    // 4.4. Total de Grupo en el período actual
    if (GROUP_TOTALS.has(upperToken)) {
      if (effectiveType === 'REMUNERATIVE' && (upperToken === 'TOTAL_REMUNERATIVO' || upperToken === 'TOTAL_BRUTO')) {
        errors.push(`Un concepto remunerativo no puede depender de [${rawToken}] en el período actual porque generaría dependencia circular.`);
      } else if (effectiveType === 'NON_REMUNERATIVE' && (upperToken === 'TOTAL_NO_REMUNERATIVO' || upperToken === 'TOTAL_BRUTO')) {
        errors.push(`Un concepto no remunerativo no puede depender de [${rawToken}] en el período actual porque generaría dependencia circular.`);
      } else if (effectiveType === 'DEDUCTION' && upperToken === 'TOTAL_DEDUCCIONES') {
        errors.push(`Un concepto de deducción no puede depender de [${rawToken}] en el período actual porque generaría dependencia circular.`);
      }
      continue;
    }

    // 4.5. Variable de Sistema (ej: [SUELDO_BASICO_EMPLEADO], [DIAS_TRABAJADOS], etc.)
    if (SYSTEM_VARIABLES.has(upperToken)) {
      continue;
    }

    // 4.6. Constante Fija Directa (ej: [SMVM])
    if (fixedCodes.has(upperToken) || fixedNames.has(upperToken)) {
      continue;
    }

    // 4.7. Concepto Específico (ej: [1000])
    const referencedConcept = conceptsMap.get(upperToken);

    if (!referencedConcept) {
      errors.push(`El token [${rawToken}] no corresponde a ningún concepto registrado, variable del sistema ni constante válida.`);
      continue;
    }

    referencedConcepts.push(referencedConcept.code);

    // Regla de autorreferencia en el período actual
    if (upperToken === currentCode) {
      errors.push(`El concepto [${rawToken}] no puede referenciarse a sí mismo en el período actual (referencia circular). Para valores históricos del propio concepto utilice [ACUM_6M], [PROM_6M] o [MEJOR_6M].`);
      continue;
    }

    // Regla de secuencia de ejecución: el concepto referenciado DEBE ejecutarse antes
    const targetNum = extractCodeNumber(referencedConcept.code);
    const targetPrefix = extractCodePrefix(referencedConcept.code);
    const isTargetBaseSalary = referencedConcept.code === 'SU1000' || referencedConcept.code === '1000' || /sueldo\s*b[aá]sico/i.test(referencedConcept.name);

    const targetExplicitOrder = referencedConcept.calculationOrder !== undefined && referencedConcept.calculationOrder !== null ? Number(referencedConcept.calculationOrder) : null;
    const currentExplicitOrder = calculationOrder !== undefined && calculationOrder !== null ? Number(calculationOrder) : null;

    if (currentExplicitOrder !== null && targetExplicitOrder !== null && currentExplicitOrder !== targetExplicitOrder) {
      if (targetExplicitOrder >= currentExplicitOrder) {
        errors.push(
          `El concepto [${rawToken}] ("${referencedConcept.name}") tiene orden de cálculo ${targetExplicitOrder}, que es posterior o igual al concepto actual (${currentExplicitOrder}). Para poder referenciarlo dentro de la misma liquidación, debe tener un orden estrictamente menor.`
        );
      }
    } else if (currentPrefix && targetPrefix && currentPrefix === targetPrefix && !isNaN(currentNum) && !isNaN(targetNum)) {
      if (targetNum >= currentNum) {
        errors.push(
          `El concepto [${rawToken}] ("${referencedConcept.name}") tiene código ${referencedConcept.code}, que es posterior o igual al concepto actual (${currentCode}). Para poder referenciarlo dentro de la misma liquidación, debe tener un número estrictamente menor.`
        );
      }
    } else if (!currentPrefix && !targetPrefix && !isNaN(currentNum) && !isNaN(targetNum)) {
      if (targetNum >= currentNum) {
        errors.push(
          `El concepto [${rawToken}] ("${referencedConcept.name}") tiene código ${targetNum}, que es posterior o igual al concepto actual (${currentNum}). Para poder referenciarlo, debe tener un código numérico estrictamente menor.`
        );
      }
    } else {
      // Diferente prefijo (ej. VA1000 referenciando SU1000, o una deducción GE referenciando un haber SU)
      // Si el target es el sueldo básico, siempre está disponible como valor pactado del legajo
      if (!isTargetBaseSalary) {
        const targetOrder = Number(referencedConcept.calculationOrder !== undefined ? referencedConcept.calculationOrder : 100);
        if (targetOrder >= currentOrder) {
          errors.push(
            `El concepto [${rawToken}] ("${referencedConcept.name}") tiene orden de cálculo ${targetOrder}, que es posterior o igual al concepto actual (orden ${currentOrder}). Para poder referenciarlo, debe calcularse antes (tener un orden numérico estrictamente menor).`
          );
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    referencedConcepts,
  };
}
