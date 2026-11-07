/**
 * Evaluador de fórmulas seguras para columnas calculadas personalizadas.
 * Permite sumar/restar conceptos o campos numéricos por cada empleado/liquidación.
 */

/**
 * Resuelve el valor numérico de un término dentro de los items de la liquidación o perfil.
 * @param {Object} row Datos del empleado y su liquidación
 * @param {string} conceptCode Código del concepto (ej. "001", "005", "SU8200")
 * @returns {number} Monto del concepto o 0.00 si no existe
 */
export function getConceptAmount(row, conceptCode) {
  if (!row || !conceptCode) return 0.0;

  const cleanCode = String(conceptCode).replace(/^concept\./, '');

  // 1. Verificar si es un campo totalizador de la liquidación o del empleado
  switch (conceptCode) {
    case 'employee.basicSalary':
      return Number(row.employee?.basicSalary || 0);
    case 'payslip.grossSalary':
      return Number(row.payslip?.grossSalary || 0);
    case 'payslip.remunerativeSalary':
      return Number(row.payslip?.remunerativeSalary || 0);
    case 'payslip.nonRemunerative':
      return Number(row.payslip?.nonRemunerative || 0);
    case 'payslip.totalDeductions':
      return Number(row.payslip?.totalDeductions || 0);
    case 'payslip.netSalary':
      return Number(row.payslip?.netSalary || 0);
    case 'payslip.workedDays':
      return Number(row.payslip?.workedDays || 30);
    case 'payslip.costEmployer': {
      const gross = Number(row.payslip?.grossSalary || 0);
      const contrib =
        Number(row.payslip?.sipaContrib || 0) +
        Number(row.payslip?.inssjypContrib || 0) +
        Number(row.payslip?.osContrib || 0) +
        Number(row.payslip?.fneContrib || 0) +
        Number(row.payslip?.aaffContrib || 0) +
        Number(row.payslip?.artContrib || 0) +
        Number(row.payslip?.scvoContrib || 0) +
        Number(row.payslip?.unionContrib || 0);
      return Math.round((gross + contrib) * 100) / 100;
    }
    default:
      break;
  }

  // 2. Buscar en el mapa indexado de conceptos de la fila
  if (row.conceptsMap) {
    if (row.conceptsMap[cleanCode] !== undefined) {
      const val = Number(row.conceptsMap[cleanCode]);
      return isNaN(val) ? 0.0 : val;
    }
    if (row.conceptsMap[conceptCode] !== undefined) {
      const val = Number(row.conceptsMap[conceptCode]);
      return isNaN(val) ? 0.0 : val;
    }
  }

  // 3. Buscar en la lista de items de la liquidación
  if (Array.isArray(row.items)) {
    const item = row.items.find(
      (it) =>
        it.conceptCode === cleanCode ||
        it.conceptCode === conceptCode ||
        (it.concept && (it.concept.code === cleanCode || it.concept.code === conceptCode))
    );
    if (item && item.amount !== undefined && item.amount !== null) {
      const val = Number(item.amount);
      return isNaN(val) ? 0.0 : val;
    }
  }

  // 4. Buscar si es un campo directo de la fila
  if (row[conceptCode] !== undefined) {
    const val = Number(row[conceptCode]);
    return isNaN(val) ? 0.0 : val;
  }

  return 0.0;
}

const TOKEN_REGEX = /\{([a-zA-Z0-9_.:-]+)\}|(\b(?:emp|employee|slip|payslip|concept)\.[a-zA-Z0-9_.:-]+)/g;
const SAFE_MATH_REGEX = /^[0-9+\-*/().\s]+$/;

/**
 * Evalúa una fórmula de columna calculada compuesta por términos con signo (+ / -) y factor,
 * o una expresión aritmética segura (customFormula) usando expresiones regulares precompiladas.
 * Ej: Sueldo Conformado = (+ 1.0 * Básico) + (+ 1.0 * Antigüedad)
 * @param {Object} formula Definición de la fórmula: { terms: [ { conceptCode, sign, factor } ], customFormula?: string }
 * @param {Object} row Datos de la fila actual
 * @returns {number} Resultado numérico redondeado a 2 decimales
 */
export function evaluateCalculatedColumn(formula, row) {
  if (!formula) return 0.0;

  if (formula.customFormula && typeof formula.customFormula === 'string' && formula.customFormula.trim() !== '') {
    const expr = formula.customFormula.replace(TOKEN_REGEX, (match, bracedKey, bareKey) => {
      const key = (bracedKey || bareKey).replace(/^concept\./, '');
      const val = getConceptAmount(row, key);
      return `(${val})`;
    });

    if (SAFE_MATH_REGEX.test(expr)) {
      try {
        const evaluated = Function(`"use strict"; return (${expr});`)();
        if (Number.isFinite(evaluated)) {
          return Math.round((evaluated + Number.EPSILON) * 100) / 100;
        }
      } catch {
        // Fallback a evaluación por términos
      }
    }
  }

  if (!Array.isArray(formula.terms) || formula.terms.length === 0) {
    return 0.0;
  }

  let total = 0.0;

  for (const term of formula.terms) {
    const amount = getConceptAmount(row, term.conceptCode);
    const factor = typeof term.factor === 'number' && !isNaN(term.factor) ? term.factor : 1.0;
    const termValue = amount * factor;

    if (term.sign === '-') {
      total -= termValue;
    } else {
      total += termValue;
    }
  }

  // Redondeo exacto a 2 decimales
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

