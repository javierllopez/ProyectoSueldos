import crypto from 'crypto';
import { evaluateFormula, evaluateSafeExpression } from './formulaEvaluator.js';
import { hoursToDecimal } from '../../utils/timeFormat.js';

export { evaluateSafeExpression } from './formulaEvaluator.js';

/**
 * Convierte un número a palabras en español (para el importe neto en letras).
 * Formato: "PESOS UN MILLÓN CUATROCIENTOS TREINTA Y SIETE MIL VEINTIDÓS CON 00/100"
 */
export function numberToSpanishWords(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return 'PESOS CERO CON 00/100';

  const num = Math.abs(Number(amount));
  const integerPart = Math.floor(num);
  const cents = Math.round((num - integerPart) * 100);
  const centsStr = String(cents).padStart(2, '0');

  if (integerPart === 0) {
    return `PESOS CERO CON ${centsStr}/100`;
  }

  const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const ESPECIALES = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function convertGroup(n) {
    let output = '';
    if (n === 100) return 'CIEN';

    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;

    if (c > 0) output += CENTENAS[c] + ' ';

    if (d === 1) {
      output += ESPECIALES[u];
    } else if (d === 2) {
      if (u === 0) output += 'VEINTE';
      else output += 'VEINTI' + UNIDADES[u];
    } else if (d > 2) {
      output += DECENAS[d];
      if (u > 0) output += ' Y ' + UNIDADES[u];
    } else if (u > 0) {
      output += UNIDADES[u];
    }

    return output.trim();
  }

  let words = '';
  const millones = Math.floor(integerPart / 1000000);
  const miles = Math.floor((integerPart % 1000000) / 1000);
  const resto = integerPart % 1000;

  if (millones > 0) {
    if (millones === 1) words += 'UN MILLÓN ';
    else words += convertGroup(millones) + ' MILLONES ';
  }

  if (miles > 0) {
    if (miles === 1) words += 'MIL ';
    else words += convertGroup(miles) + ' MIL ';
  }

  if (resto > 0) {
    words += convertGroup(resto);
  }

  words = words.trim();
  return `PESOS ${words} CON ${centsStr}/100`;
}

// evaluateSafeExpression is re-exported from ./formulaEvaluator.js with LRU compilation caching

/**
 * Resuelve una matriz de lookup para un concepto.
 * matrixObjOrData: Puede ser un modelo PayrollMatrix (con inputConceptCode, matchType, defaultValue, rows)
 * o una estructura JSON de matriz.
 */
export function evaluateMatrix(matrixObjOrData, contextValues = {}) {
  const createMatrixResult = (val, type = 'AMOUNT') => {
    const num = Number(val !== undefined && val !== null ? val : 0);
    const safeNum = isNaN(num) ? 0 : num;
    const res = Object.assign(Object(safeNum), {
      value: safeNum,
      valueType: String(type || 'AMOUNT').toUpperCase(),
      isPercentage: String(type || 'AMOUNT').toUpperCase() === 'PERCENTAGE',
    });
    return res;
  };

  if (!matrixObjOrData) return createMatrixResult(0, 'AMOUNT');

  let matrix = matrixObjOrData;
  if (typeof matrix === 'string') {
    try {
      matrix = JSON.parse(matrix);
    } catch {
      return createMatrixResult(0, 'AMOUNT');
    }
  }

  // Identificar la variable de entrada asignada a la matriz
  const inputVar = matrix.inputConceptCode || matrix.keyVariable;
  const matchType = String(matrix.matchType || matrix.type || 'RANGE').toUpperCase();
  const defaultValue = Number(matrix.defaultValue !== undefined ? matrix.defaultValue : 0);
  let matrixResultType = String(matrix.resultType || matrix.valueType || 'AMOUNT').toUpperCase();

  if (!inputVar) return createMatrixResult(defaultValue, matrixResultType);

  // Obtener el valor actual del concepto de entrada asignado en el contexto
  let rawKeyVal = 0;
  if (contextValues[inputVar] !== undefined) {
    rawKeyVal = contextValues[inputVar];
  } else if (contextValues.inputsMap && contextValues.inputsMap.has(inputVar)) {
    const nov = contextValues.inputsMap.get(inputVar);
    rawKeyVal = nov.amount !== undefined && nov.amount !== null ? nov.amount : (nov.units || 0);
  }

  let rows = matrix.rows || matrix.rules || [];
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows);
    } catch {
      rows = [];
    }
  }

  // Si rows es un objeto contenedor { resultType, rules }
  if (rows && !Array.isArray(rows) && typeof rows === 'object') {
    if (rows.resultType) matrixResultType = String(rows.resultType).toUpperCase();
    rows = rows.rules || rows.rows || [];
  }

  // Soporte para formato de diccionario directo { map: { 'A': 100 } }
  if (matrix.map && typeof matrix.map === 'object') {
    const directMatch = matrix.map[String(rawKeyVal).trim()];
    const val = directMatch !== undefined ? Number(directMatch) : defaultValue;
    return createMatrixResult(val, matrixResultType);
  }

  if (Array.isArray(rows)) {
    if (matchType === 'EXACT') {
      for (const row of rows) {
        const rowInput = row.inputValue !== undefined ? row.inputValue : (row.input !== undefined ? row.input : row.key);
        if (
          String(rowInput).trim().toLowerCase() === String(rawKeyVal).trim().toLowerCase() ||
          Number(rowInput) === Number(rawKeyVal)
        ) {
          const rowType = row.valueType || matrixResultType;
          return createMatrixResult(row.value, rowType);
        }
      }
    } else {
      // RANGE (Por defecto para escalas y tramos)
      const numVal = Number(rawKeyVal);
      for (const row of rows) {
        const min = row.from !== undefined && row.from !== null && String(row.from).trim() !== '' ? Number(row.from) : -Infinity;
        const max = row.to !== undefined && row.to !== null && String(row.to).trim() !== '' ? Number(row.to) : Infinity;
        if (numVal >= min && numVal <= max) {
          const rowType = row.valueType || matrixResultType;
          return createMatrixResult(row.value, rowType);
        }
      }
    }
  }

  return createMatrixResult(defaultValue, matrixResultType);
}


/**
 * Calcula la antigüedad en años enteros y meses entre dos fechas.
 */
export function calculateSeniority(hireDate, periodDate) {
  if (!hireDate) return { years: 0, months: 0 };
  const start = new Date(hireDate);
  const end = periodDate ? new Date(periodDate) : new Date();

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();

  if (months < 0 || (months === 0 && end.getDate() < start.getDate())) {
    years--;
    months += 12;
  }

  return { years: Math.max(0, years), months: Math.max(0, months) };
}

/**
 * Busca de forma dinámica e inteligente el concepto de Sueldo Básico
 * en el catálogo activo de la empresa (soporta códigos 100, 1000, 001, BASICO, código ARCA 110000 o nombre).
 */
export function findBasicSalaryConcept(allConcepts) {
  if (!Array.isArray(allConcepts)) return null;
  return (
    allConcepts.find((c) => c.type === 'REMUNERATIVE' && (c.code === 'SU1000' || c.code === '1000' || c.code === '100' || c.code === '001' || c.code === 'BASICO')) ||
    allConcepts.find((c) => c.type === 'REMUNERATIVE' && /b[aá]sico/i.test(c.name)) ||
    allConcepts.find((c) => c.type === 'REMUNERATIVE' && c.arcaConceptCode === '110000') ||
    allConcepts.find((c) => c.type === 'REMUNERATIVE') ||
    null
  );
}

/**
 * Busca de forma dinámica el concepto de Asignación Estímulo para pasantes (Ley 26.427).
 */
export function findInternStimulusConcept(allConcepts) {
  if (!Array.isArray(allConcepts)) return null;
  return (
    allConcepts.find((c) => c.code === 'SU1001' || c.code === '1001') ||
    allConcepts.find((c) => c.type === 'NON_REMUNERATIVE' && /est[ií]mulo|pasant/i.test(c.name)) ||
    allConcepts.find((c) => c.arcaConceptCode === '550000') ||
    null
  );
}

/**
 * Normalizador de cadenas para matching flexible de códigos y nombres de matrices y nóminas.
 */
export const normalizePayrollKey = (str) => {
  if (!str) return '';
  return String(str)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_');
};

/**
 * Pre-indexa catálogos salariales para optimización O(1) en cálculos masivos de nómina.
 */
export function buildPayrollIndices({ allConcepts = [], allMatrices = [], allFixedValues = [], allSalaryScales = [] } = {}) {
  const conceptsMap = new Map();
  for (const c of allConcepts) {
    conceptsMap.set(String(c.code).trim(), c);
  }

  const matricesMap = new Map();
  for (const m of allMatrices) {
    if (m.id) matricesMap.set(m.id, m);
    if (m.code) {
      matricesMap.set(String(m.code).trim().toUpperCase(), m);
      matricesMap.set(normalizePayrollKey(m.code), m);
    }
    if (m.name) {
      matricesMap.set(String(m.name).trim().toUpperCase(), m);
      matricesMap.set(normalizePayrollKey(m.name), m);
    }
  }

  const findMatrix = (key) => {
    if (!key) return null;
    const clean = String(key).trim();
    if (matricesMap.has(clean)) return matricesMap.get(clean);
    if (matricesMap.has(clean.toUpperCase())) return matricesMap.get(clean.toUpperCase());
    const norm = normalizePayrollKey(clean);
    if (matricesMap.has(norm)) return matricesMap.get(norm);
    return null;
  };

  const fixedValuesMap = new Map();
  for (const fv of allFixedValues) {
    const numVal = Number(fv.value !== undefined && fv.value !== null ? fv.value : 0);
    if (fv.id) fixedValuesMap.set(fv.id, numVal);
    if (fv.code) {
      const codeClean = String(fv.code).trim().toUpperCase();
      fixedValuesMap.set(codeClean, numVal);
      fixedValuesMap.set(normalizePayrollKey(fv.code), numVal);
    }
    if (fv.name) {
      const nameClean = String(fv.name).trim().toUpperCase();
      fixedValuesMap.set(nameClean, numVal);
      fixedValuesMap.set(normalizePayrollKey(fv.name), numVal);
    }
  }

  const findFixedValue = (key) => {
    if (!key) return null;
    const clean = String(key).trim();
    if (fixedValuesMap.has(clean)) return fixedValuesMap.get(clean);
    if (fixedValuesMap.has(clean.toUpperCase())) return fixedValuesMap.get(clean.toUpperCase());
    const norm = normalizePayrollKey(clean);
    if (fixedValuesMap.has(norm)) return fixedValuesMap.get(norm);
    return null;
  };

  const salaryScalesMap = new Map();
  for (const s of allSalaryScales) {
    const numVal = Number(s.amount !== undefined && s.amount !== null ? s.amount : (s.basicSalary || 0));
    if (s.id) salaryScalesMap.set(s.id, numVal);
    if (s.code) {
      const codeClean = String(s.code).trim().toUpperCase();
      salaryScalesMap.set(codeClean, numVal);
      salaryScalesMap.set(normalizePayrollKey(s.code), numVal);
    }
    if (s.name) {
      const nameClean = String(s.name).trim().toUpperCase();
      salaryScalesMap.set(nameClean, numVal);
      salaryScalesMap.set(normalizePayrollKey(s.name), numVal);
    }
  }

  const findSalaryScale = (key) => {
    if (!key) return null;
    const clean = String(key).trim();
    if (salaryScalesMap.has(clean)) return salaryScalesMap.get(clean);
    if (salaryScalesMap.has(clean.toUpperCase())) return salaryScalesMap.get(clean.toUpperCase());
    const norm = normalizePayrollKey(clean);
    if (salaryScalesMap.has(norm)) return salaryScalesMap.get(norm);
    return null;
  };

  return {
    conceptsMap,
    matricesMap,
    fixedValuesMap,
    salaryScalesMap,
    findMatrix,
    findFixedValue,
    findSalaryScale,
  };
}

/**
 * Determina el valor base (baseAmount) que realmente utiliza un concepto en su cálculo
 * para su registro en el detalle del recibo de sueldo.
 * Garantiza aislamiento entre modalidades contractuales (SU1000 vs SU1002 vs SU1001).
 */
export function resolveItemBaseAmount(concept, context, isBasic, isDirectorSalary, isInternStimulus) {
  if (isBasic || isDirectorSalary || isInternStimulus) {
    return null;
  }

  if (concept.calculationType === 'FORMULA' && concept.formula) {
    const f = String(concept.formula).toUpperCase();
    // 1. Si la fórmula referencia explícitamente al Sueldo Básico CCT [SU1000] o [1000]
    if (f.includes('[SU1000]') || f.includes('[1000]')) {
      const val = context.SU1000 !== undefined && context.SU1000 !== null ? Number(context.SU1000) : 0;
      return val > 0 ? val : null;
    }
    // 2. Si la fórmula referencia explícitamente a Honorarios Director [SU1002] o [1002]
    if (f.includes('[SU1002]') || f.includes('[1002]') || f.includes('[HONORARIOS_DIRECTOR]')) {
      const val = context.SU1002 !== undefined && context.SU1002 !== null ? Number(context.SU1002) : 0;
      return val > 0 ? val : null;
    }
    // 3. Si la fórmula referencia explícitamente a Asignación Estímulo Pasante [SU1001] o [1001]
    if (f.includes('[SU1001]') || f.includes('[1001]') || f.includes('[ASIGNACION_ESTIMULO]')) {
      const val = context.SU1001 !== undefined && context.SU1001 !== null ? Number(context.SU1001) : 0;
      return val > 0 ? val : null;
    }
    // 4. Si referencia genéricamente [BASICO] o [SUELDO_BASICO]
    if (f.includes('[BASICO]') || f.includes('[SUELDO_BASICO]') || f.includes('[SUELDO_BASICO_EMPLEADO]')) {
      const val = context.BASICO !== undefined && context.BASICO !== null ? Number(context.BASICO) : 0;
      return val > 0 ? val : null;
    }
    // 5. Si referencia algún otro concepto único entre corchetes, ej: [SU9030] o [1050]
    const match = f.match(/\[([A-Z0-9_]{3,10})\]/);
    if (match && context[match[1]] !== undefined) {
      const val = Number(context[match[1]]);
      return val > 0 ? val : null;
    }
  }

  if (concept.calculationType === 'PERCENTAGE' || concept.calculationType === 'MATRIX') {
    return context.BASICO !== undefined && context.BASICO !== null && Number(context.BASICO) > 0 ? Number(context.BASICO) : null;
  }

  return null;
}

/**
 * Motor central de cálculo salarial para un legajo en una liquidación.
 * Retorna todos los conceptos liquidados, subtotales, totales, deducciones,
 * contribuciones patronales, bases imponibles ARCA F.931 y porcentajes del gráfico de torta.
 */
export function calculateEmployeePayroll({
  employee,
  period,
  payrollSettings,
  inputItems = [], // Novedades cargadas por el usuario: [{ conceptCode, units, amount, notes }]
  allConcepts = [], // Catálogo activo de conceptos
  allMatrices = [], // Catálogo de matrices de liquidación
  allFixedValues = [], // Catálogo de valores globales fijos (constantes)
  allSalaryScales = [], // Catálogo de escalas salariales / nóminas de CCT
  historicalData = {}, // Historial de recibos e items previos del empleado
  indices = null, // Pre-indexación opcional para cálculos masivos
}) {
  const isIntern = employee.contractModalityCode === '27' || employee.contractModalityCode === '027' || employee.contractModalityCode === '51' || employee.contractModalityCode === '051' || employee.salaryScale?.isInternOnly === true;
  const isDirector = employee.contractModalityCode === '99' || employee.contractModalityCode === '099' || employee.salaryScale?.isDirectorOnly === true;

  // Si es pasante o director bajo modalidad LRT y el período es de SAC (aguinaldo), no se liquida aguinaldo de LCT
  if ((isIntern || isDirector) && (period.periodType === 'SAC_1' || period.periodType === 'SAC_2')) {
    return {
      items: [],
      totals: {
        totalRemunerative: 0,
        totalNonRemunerative: 0,
        grossSalary: 0,
        totalDeductions: 0,
        netSalary: 0,
        netSalaryWords: numberToSpanishWords(0),
        sipaContrib: 0,
        inssjypContrib: 0,
        osContrib: 0,
        fneContrib: 0,
        aaffContrib: 0,
        artContrib: 0,
        scvoContrib: 0,
        unionContrib: 0,
        totalEmployerContrib: 0,
        totalLaborCost: 0,
      },
      distribution: {
        pctNetSalary: 0,
        pctEmployeeDeductions: 0,
        pctSocialSecurityContrib: 0,
        pctHealthContrib: 0,
        pctArtAndInsurance: 0,
        pctUnionAndChambers: 0,
      },
      basis: {
        baseImponible1: 0,
        baseImponible2: 0,
        baseImponible3: 0,
        baseImponible4: 0,
        baseImponible5: 0,
        baseImponible6: 0,
        baseImponible7: 0,
        baseImponible8: 0,
        baseImponible9: 0,
        baseImponible10: 0,
        detractionAmount: 0,
        situationCode: employee.status === 'ACTIVE' ? '01' : '13',
        conditionCode: '01',
        activityCode: employee.jobPosition?.activityCode || (isDirector ? '015' : '049'),
        contractModality: (employee.contractModalityCode || (isDirector ? '099' : (isIntern ? '027' : '001'))).padStart(3, '0'),
        hasSpouse: false,
        childrenCount: 0,
        hasScvo: false,
        hasCct: false,
      },
      signatureHash: '',
    };
  }

  // Asegurar concepto SU1001 en el catálogo si es pasante y no vino precargado
  if (isIntern && !allConcepts.some((c) => c.code === 'SU1001' || c.code === '1001')) {
    allConcepts = [
      ...allConcepts,
      {
        id: 'virtual-1001',
        code: 'SU1001',
        name: 'Asignación Estímulo Ley 26.427',
        type: 'NON_REMUNERATIVE',
        calculationType: 'FIXED',
        scope: 'GENERAL',
        defaultValue: 0,
        noveltyDataType: 'CANTIDAD',
        calculationOrder: 100,
        isPersistent: true,
        isActive: true,
        arcaConceptCode: '550000',
        appliesOsContrib: true,
        appliesFsrContrib: true,
        appliesLrtContrib: true,
      },
    ];
  }

  // Asegurar concepto SU1002 en el catálogo si es director y no vino precargado
  if (isDirector && !allConcepts.some((c) => c.code === 'SU1002' || c.code === '1002')) {
    allConcepts = [
      ...allConcepts,
      {
        id: 'virtual-1002',
        code: 'SU1002',
        name: 'Honorarios / Retribución Director S.A. (LRT Mod. 099)',
        type: 'REMUNERATIVE',
        calculationType: 'FIXED',
        periodType: 'MONTHLY',
        scope: 'GENERAL',
        defaultValue: 0,
        noveltyDataType: 'CANTIDAD',
        calculationOrder: 100,
        isPersistent: true,
        isActive: true,
        arcaConceptCode: '110000',
        appliesLrtContrib: true,
      },
    ];
  }

  const periodDate = period.paymentDate ? new Date(period.paymentDate) : new Date(period.year, period.month - 1, 28);
  const seniority = calculateSeniority(employee.hireDate, periodDate);

  // Pre-indexación de catálogos salariales O(1)
  let {
    conceptsMap,
    matricesMap,
    fixedValuesMap,
    salaryScalesMap,
    findMatrix,
    findFixedValue,
    findSalaryScale,
  } = indices || buildPayrollIndices({ allConcepts, allMatrices, allFixedValues, allSalaryScales });

  if (isIntern && !conceptsMap.has('SU1001') && !conceptsMap.has('1001')) {
    conceptsMap = new Map(conceptsMap);
    conceptsMap.set('SU1001', allConcepts.find((c) => c.code === 'SU1001') || {
      id: 'virtual-1001',
      code: 'SU1001',
      name: 'Asignación Estímulo Ley 26.427',
      type: 'NON_REMUNERATIVE',
      calculationType: 'FIXED',
      scope: 'GENERAL',
      defaultValue: 0,
      noveltyDataType: 'CANTIDAD',
      calculationOrder: 100,
      isPersistent: true,
      isActive: true,
      arcaConceptCode: '550000',
      appliesOsContrib: true,
      appliesFsrContrib: true,
      appliesLrtContrib: true,
    });
  }

  if (isDirector && !conceptsMap.has('SU1002') && !conceptsMap.has('1002')) {
    conceptsMap = new Map(conceptsMap);
    conceptsMap.set('SU1002', allConcepts.find((c) => c.code === 'SU1002') || {
      id: 'virtual-1002',
      code: 'SU1002',
      name: 'Honorarios / Retribución Director S.A. (LRT Mod. 099)',
      type: 'REMUNERATIVE',
      calculationType: 'FIXED',
      scope: 'GENERAL',
      defaultValue: 0,
      noveltyDataType: 'CANTIDAD',
      calculationOrder: 100,
      isPersistent: true,
      isActive: true,
      arcaConceptCode: '110000',
      appliesLrtContrib: true,
    });
  }

  // Diccionario de novedades ingresadas
  const inputsMap = new Map();
  for (const inp of inputItems) {
    if (inp.conceptCode) {
      inputsMap.set(String(inp.conceptCode).trim(), inp);
    }
  }

  const basicConcept = findBasicSalaryConcept(allConcepts);
  const basicCode = basicConcept ? basicConcept.code : '1000';

  // Diccionario de conceptos fijos asignados específicamente al empleado
  const assignedConceptsMap = new Map();
  if (Array.isArray(employee.assignedConcepts)) {
    for (const ac of employee.assignedConcepts) {
      if (ac.isActive !== false) {
        if (ac.concept && (ac.concept.deletedAt !== null || ac.concept.isActive === false)) continue;
        if (ac.validFrom && new Date(ac.validFrom) > periodDate) continue;
        if (ac.validTo && new Date(ac.validTo) < periodDate) continue;
        const code = ac.concept?.code || (allConcepts.find((c) => c.id === ac.conceptId)?.code);
        // Si es pasante, nunca asociar conceptos bajo el código 1001 (reservado para la asignación estímulo base) ni remunerativos de convenio
        if (isIntern && (code === '1001' || ac.concept?.type === 'REMUNERATIVE')) continue;
        if (code) {
          assignedConceptsMap.set(String(code).trim(), ac);
        }
      }
    }
  }

  // Días y horas liquidadas (por defecto 30 días base)
  let workedDays = 30;
  const defaultHours = isIntern ? 80 : (employee.isPartTime ? 80 : 160);
  let workedHours = employee.monthlyWorkingHours ? Number(employee.monthlyWorkingHours) : defaultHours;

  // Si se ingresó explícitamente en conceptos o novedades
  const basicInput = inputsMap.get(basicCode) || inputsMap.get('1000') || inputsMap.get('100');
  if (basicInput && basicInput.units !== undefined && basicInput.units !== null && Number(basicInput.units) > 0) {
    workedDays = Number(basicInput.units);
  }

  const baseSalaryNominal = Number(
    employee.salaryScale?.amount !== undefined && employee.salaryScale?.amount !== null
      ? employee.salaryScale.amount
      : (employee.basicSalary || 0)
  );

  // Parámetros de Jornada de Trabajo asignada o fallback seguro
  const shiftDaily = employee.workShift?.dailyHours
    ? Number(employee.workShift.dailyHours)
    : (isIntern ? 4.00 : (Number(employee.weeklyWorkingHours || 48) / 5));
  const shiftWeekly = employee.workShift?.weeklyHours
    ? Number(employee.workShift.weeklyHours)
    : (isIntern ? 20.00 : Number(employee.weeklyWorkingHours || 48));
  const shiftMonthly = employee.workShift?.monthlyHours
    ? Number(employee.workShift.monthlyHours)
    : (isIntern ? 80.00 : Number(employee.monthlyWorkingHours || 200));
  const shiftDays = employee.workShift?.monthlyDays
    ? Number(employee.workShift.monthlyDays)
    : (isIntern ? 20.00 : 30.00);

  // Contexto de valores para resolución de fórmulas
  const context = {
    ANTIGUEDAD_ANOS: seniority.years,
    ANTIGUEDAD_MESES: seniority.months,
    DIAS_TRABAJADOS: workedDays,
    HORAS_TRABAJADAS: workedHours,
    CATEGORIA: employee.jobPosition?.categoryCode || employee.jobPosition?.name || '',
    PUESTO: employee.jobPosition?.code || '',
    // Aislamiento estricto de conceptos base por modalidad contractual:
    // SU1000 (Sueldo Básico CCT): solo aplica a empleados en relación de dependencia bajo CCT/LCT
    // SU1001 (Asignación Estímulo Ley 26.427): solo aplica a pasantes educativos
    // SU1002 (Honorarios Director S.A. LRT Mod. 099): solo aplica a directores y socios gerentes
    SUELDO_BASICO_EMPLEADO: (!isIntern && !isDirector) ? baseSalaryNominal : 0,
    SUELDO_BASICO: (!isIntern && !isDirector) ? baseSalaryNominal : 0,
    BASICO: (!isIntern && !isDirector) ? baseSalaryNominal : 0,
    [basicCode]: (!isIntern && !isDirector) ? baseSalaryNominal : 0,
    SU1000: (!isIntern && !isDirector) ? baseSalaryNominal : 0,
    '1000': (!isIntern && !isDirector) ? baseSalaryNominal : 0,
    '100': (!isIntern && !isDirector) ? baseSalaryNominal : 0,
    '001': (!isIntern && !isDirector) ? baseSalaryNominal : 0,
    SU1001: isIntern ? baseSalaryNominal : 0,
    '1001': isIntern ? baseSalaryNominal : 0,
    ASIGNACION_ESTIMULO: isIntern ? baseSalaryNominal : 0,
    ESTIMULO: isIntern ? baseSalaryNominal : 0,
    SU1002: isDirector ? baseSalaryNominal : 0,
    '1002': isDirector ? baseSalaryNominal : 0,
    HONORARIOS_DIRECTOR: isDirector ? baseSalaryNominal : 0,
    HONORARIOS: isDirector ? baseSalaryNominal : 0,
    ES_JORNADA_PARCIAL: (isIntern || employee.isPartTime) ? 1 : 0,
    PORCENTAJE_JORNADA: isIntern ? 50.00 : Number(employee.partTimePercentage || 100),
    HORAS_SEMANALES: shiftWeekly,
    HORAS_CONTRATO: shiftMonthly,
    HORAS_MENSUALES: shiftMonthly,
    HORAS_DIARIAS: shiftDaily,
    DIAS_MENSUALES: shiftDays,
    JORNADA_HORAS_DIARIAS: shiftDaily,
    JORNADA_HORAS_SEMANALES: shiftWeekly,
    JORNADA_HORAS_MENSUALES: shiftMonthly,
    JORNADA_DIAS_MENSUALES: shiftDays,
    GRUPO_NOMINA: employee.payrollGroup || 'MENSUAL',
    TOTAL_REMUNERATIVO: 0,
    TOTAL_NO_REMUNERATIVO: 0,
    TOTAL_DEDUCCIONES: 0,
    TOTAL_BRUTO: 0,
    BASE_OBRA_SOCIAL: 0,
    MEJOR_REMUN: 0,
    CURRENT_PERIOD: period,
    inputsMap,
    assignedConceptsMap,
  };

  // Inyectar valores fijos globales en el contexto por código (ej. context.SMVM = 320000)
  for (const fv of allFixedValues) {
    if (fv.code) {
      const val = Number(fv.value !== undefined && fv.value !== null ? fv.value : 0);
      context[fv.code] = val;
      context[String(fv.code).toUpperCase()] = val;
    }
  }

  const calculatedItems = [];

  // Función interna para evaluar un concepto
  function resolveConceptValue(concept, inputOverride) {
    const calcType = concept.calculationType;

    // Para pasantes (Ley 26.427): la Asignación Estímulo es SIEMPRE el importe mensual total pactado en la nómina.
    // (Ausencias, licencias o eventualidades se liquidan exclusivamente mediante conceptos de novedad creados por el usuario).
    if (isIntern && (concept.code === 'SU1001' || concept.code === '1001' || concept.arcaConceptCode === '550000')) {
      return baseSalaryNominal > 0 ? baseSalaryNominal : Number(concept.defaultValue || 0);
    }

    // Para directores bajo modalidad 099 LRT: honorarios o sueldo asignado según nómina pactada
    if (isDirector && (concept.code === 'SU1002' || concept.code === '1002' || (concept.code === basicCode && !allConcepts.some((c) => c.code === 'SU1002')))) {
      return baseSalaryNominal > 0 ? baseSalaryNominal : Number(concept.defaultValue || 0);
    }

    // Si el usuario ingresó un importe fijo manual directo en la novedad o viene asignado
    // (Salvo que el concepto sea de tipo FORMULA y use la novedad como variable de cálculo, o sea de tipo CALCULADO)
    if (inputOverride && inputOverride.amount !== undefined && inputOverride.amount !== null && String(inputOverride.amount).trim() !== '') {
      if (concept.noveltyDataType !== 'CALCULADO' && (calcType !== 'FORMULA' || concept.noveltyDataType !== 'IMPORTE')) {
        return Number(inputOverride.amount);
      }
    }

    // Concepto básico estándar: siempre el valor mensual completo pactado.
    if (concept.code === basicCode || concept.code === 'SU1000' || concept.code === '1000' || concept.code === '100') {
      const baseMonthly = baseSalaryNominal > 0 ? baseSalaryNominal : Number(concept.defaultValue || 0);
      return baseMonthly;
    }

    if (calcType === 'FIXED') {
      return Number(concept.defaultValue || 0);
    }

    if (calcType === 'MATRIX') {
      let targetMatrix = null;
      if (concept.matrixId && matricesMap.has(concept.matrixId)) {
        targetMatrix = matricesMap.get(concept.matrixId);
      } else if (concept.matrix) {
        targetMatrix = concept.matrix;
      } else if (concept.matrixData) {
        targetMatrix = concept.matrixData;
      }
      if (targetMatrix) {
        const matRes = evaluateMatrix(targetMatrix, context);
        if (matRes && matRes.isPercentage) {
          const inputVar = targetMatrix.inputConceptCode || targetMatrix.keyVariable;
          const baseVal = Number(context[inputVar]) || context.BASICO || context[basicCode] || context.SU1000 || context['1000'] || context['100'] || 0;
          return baseVal * (Number(matRes.value) / 100);
        }
        return Number(matRes.value !== undefined ? matRes.value : matRes);
      }
      return Number(concept.defaultValue || 0);
    }

    if (calcType === 'PERCENTAGE') {
      const pct = Number(concept.defaultValue || 0) / 100;
      // Si es una deducción, por defecto aplica sobre el Total Remunerativo acumulado
      if (concept.type === 'DEDUCTION') {
        const isObraSocial = concept.code === 'GE6003' || concept.code === '8002' || concept.code === '6003' || concept.code === '303' || concept.arcaConceptCode === '810002' || /obra\s*social/i.test(concept.name);
        if (isObraSocial) {
          return context.BASE_OBRA_SOCIAL * pct;
        }
        return context.TOTAL_REMUNERATIVO * pct;
      }
      // Si es remunerativo o no remunerativo, aplica sobre el básico
      const baseVal = context.BASICO || context[basicCode] || context.SU1000 || context['1000'] || context['100'] || 0;
      return baseVal * pct;
    }

    if (calcType === 'FORMULA' && concept.formula) {
      context.CURRENT_CONCEPT_CODE = concept.code;
      context.CURRENT_PERIOD = period;
      context.defaultValue = Number(concept.defaultValue || 0);
      context.VALOR_BASE = Number(concept.defaultValue || 0);
      context.VALOR_DEFECTO = context.VALOR_BASE;
      context.DEFECTO = context.VALOR_BASE;
      return evaluateFormula(
        concept.formula,
        context,
        historicalData,
        (matrixKey, ctx) => {
          const mat = findMatrix(matrixKey);
          if (!mat) return 0;
          const matRes = evaluateMatrix(mat, ctx);
          return Number(matRes?.value !== undefined ? matRes.value : matRes) || 0;
        },
        (fixedKey) => findFixedValue(fixedKey),
        (scaleKey) => {
          const s = findSalaryScale(scaleKey);
          return s !== null && s !== undefined ? s : 0;
        }
      );
    }

    return Number(concept.defaultValue || 0);
  }

  // --- Helper: Verifica si un concepto aplica según el tipo de liquidación del período ---
  const isConceptApplicable = (c) => {
    const cType = c.periodType || 'ALL';
    if (cType === 'ALL' || !cType) return true;
    const pType = period?.periodType || 'MONTHLY';
    if (cType === pType) return true;
    if (cType === 'SAC' && (pType === 'SAC_1' || pType === 'SAC_2')) return true;
    return false;
  };

  // --- Helper: Verifica si un concepto es persistente o eventual ---
  // Los persistentes se liquidan automáticamente período tras período.
  // Los no persistentes (eventuales) solo se liquidan cuando se cargan explícitamente como novedad.
  const isConceptPersistent = (c) => {
    return c.isPersistent !== false && c.isPersistent !== 0;
  };

  // --- PROCESAMIENTO SECUENCIAL POR CÓDIGO NUMÉRICO / ORDEN DE CÁLCULO ---
  const applicableConcepts = allConcepts.filter((c) => isConceptApplicable(c));
  applicableConcepts.sort((a, b) => {
    // Sueldo básico siempre prioridad de cálculo 1
    const isBasicA = a.code === basicCode || a.code === 'SU1000' || a.code === '1000';
    const isBasicB = b.code === basicCode || b.code === 'SU1000' || b.code === '1000';
    if (isBasicA && !isBasicB) return -1;
    if (!isBasicA && isBasicB) return 1;

    // calculationOrder explícito si difieren
    const orderA = a.calculationOrder !== undefined && a.calculationOrder !== null ? Number(a.calculationOrder) : 100;
    const orderB = b.calculationOrder !== undefined && b.calculationOrder !== null ? Number(b.calculationOrder) : 100;
    if (orderA !== orderB) return orderA - orderB;

    // Secuencia por código numérico de 4 dígitos ascendente
    const numMatchA = String(a.code).match(/(\d{4})/);
    const numMatchB = String(b.code).match(/(\d{4})/);
    const numA = numMatchA ? parseInt(numMatchA[1], 10) : parseInt(a.code, 10);
    const numB = numMatchB ? parseInt(numMatchB[1], 10) : parseInt(b.code, 10);
    if (!isNaN(numA) && !isNaN(numB)) {
      if (numA !== numB) return numA - numB;
    }

    return String(a.code).localeCompare(String(b.code));
  });

  let totalDeductions = 0;

  for (const concept of applicableConcepts) {
    const manualOverride = inputsMap.get(concept.code);
    const assignedRecord = assignedConceptsMap.get(concept.code);
    const inputOverride = manualOverride || (assignedRecord ? {
      amount: assignedRecord.amount,
      units: assignedRecord.units,
      notes: assignedRecord.notes,
    } : null);

    // Conceptos con alcance INDIVIDUAL: solo aplican si fueron asignados explícitamente en novedades o conceptos fijos del legajo
    const isIndividualScope = String(concept.scope || '').toUpperCase() === 'INDIVIDUAL';
    if (isIndividualScope && !manualOverride && !assignedRecord) {
      continue;
    }

    const isBasic = concept.code === basicCode;
    const isInternStimulus = isIntern && (concept.code === 'SU1001' || concept.code === '1001' || concept.arcaConceptCode === '550000');
    const isDirectorSalary = isDirector && (concept.code === 'SU1002' || concept.code === '1002' || (isBasic && !allConcepts.some((c) => c.code === 'SU1002')));

    // En períodos de vacaciones, los directores no liquidan honorarios SU1002 ni sueldos básicos
    if (isDirector && period?.periodType === 'VACATIONS' && (concept.code === 'SU1002' || concept.code === '1002' || isBasic || isDirectorSalary)) {
      continue;
    }

    // Si es pasante, suprimir el sueldo básico tradicional SU1000/1000 y conceptos remunerativos/auxiliares generales de convenio
    if (isIntern && (isBasic || concept.code === 'SU1000' || concept.code === '1000' || concept.code === '100' || concept.code === '001')) {
      continue;
    }
    if (isIntern && (concept.type === 'REMUNERATIVE' || concept.type === 'AUXILIARY') && !manualOverride && !assignedRecord) {
      continue;
    }

    // Si es director, suprimir el sueldo básico tradicional SU1000/1000
    if (isDirector && (isBasic || concept.code === 'SU1000' || concept.code === '1000' || concept.code === '100' || concept.code === '001')) {
      continue;
    }

    // Para directores (fuera de convenio): conceptos remunerativos y auxiliares generales de CCT no aplican si no fueron asignados explícitamente
    if (isDirector && !isDirectorSalary && (concept.type === 'REMUNERATIVE' || concept.type === 'AUXILIARY') && !manualOverride && !assignedRecord) {
      continue;
    }

    // Si NO es director, no se liquida el concepto específico de honorarios de director (salvo novedad explícita cargada al legajo)
    if (!isDirector && (concept.code === 'SU1002' || concept.code === '1002') && !manualOverride && !assignedRecord) {
      continue;
    }

    // Si NO es pasante, no se liquida el concepto de pasantía (salvo novedad explícita cargada al legajo)
    if (!isIntern && (concept.code === 'SU1001' || concept.code === '1001' || concept.arcaConceptCode === '550000') && !manualOverride && !assignedRecord) {
      continue;
    }

    // Para directores y pasantes: las deducciones y retenciones legales (ARCA 810xxx: Jubilación, INSSJyP, Obra Social, Sindicato) no aplican
    if ((isDirector || isIntern) && concept.type === 'DEDUCTION' && !manualOverride && !assignedRecord) {
      const isStatutoryDeduction =
        concept.arcaConceptCode?.startsWith('810') ||
        concept.code === 'GE6001' ||
        concept.code === 'GE6002' ||
        concept.code === 'GE6003' ||
        concept.code === 'GE6004' ||
        /jubilaci|sipa|inssj?yp|pami|19\.?032|obra\s*social|sindic/i.test(concept.name);
      if (isStatutoryDeduction) continue;
    }

    const isUnionConcept = concept.arcaConceptCode === '810004' || /sindic/i.test(concept.name) || concept.code === 'GE6004' || concept.code === '8004' || concept.code === '6004' || concept.code === '6005' || concept.code === '304';
    if (concept.type === 'DEDUCTION' && isUnionConcept && (!employee.unionId || isIntern || isDirector) && !inputOverride && !assignedRecord) {
      continue;
    }

    // Para directores y pasantes: conceptos automáticos de convenio colectivo (Antigüedad, Presentismo, etc.) no aplican si no fueron asignados
    if ((isDirector || isIntern) && !manualOverride && !assignedRecord) {
      const normName = normalizePayrollKey(concept.name || '');
      const isCctConcept =
        normName.includes('ANTIGUEDAD') ||
        normName.includes('PRESENTISMO') ||
        normName.includes('CONVENIO') ||
        normName.includes('CCT') ||
        /presentismo|antig[uü]edad|adicional\s*convenio|cct/i.test(concept.name || '') ||
        concept.code === 'SU1010' ||
        concept.code === '1010' ||
        concept.code === 'SU1020' ||
        concept.code === '1020';

      if (isCctConcept && !isDirectorSalary && !isInternStimulus) {
        continue;
      }
    }

    const shouldLiquidate =
      Boolean(manualOverride) ||
      Boolean(assignedRecord) ||
      concept.type === 'AUXILIARY' ||
      concept.noveltyDataType === 'CALCULADO' ||
      (isConceptPersistent(concept) &&
        (isBasic ||
          isInternStimulus ||
          isDirectorSalary ||
          concept.calculationType === 'MATRIX' ||
          concept.calculationType === 'FORMULA' ||
          (concept.calculationType === 'PERCENTAGE' && Number(concept.defaultValue) > 0) ||
          (concept.calculationType === 'FIXED' && Number(concept.defaultValue) > 0)));

    if (!shouldLiquidate) continue;

    // Determinar unidades y poblar variables de novedad propia según noveltyDataType
    const noveltyType = concept.noveltyDataType || 'CANTIDAD';
    let units = 1;
    let unitLabel = 'Fijo';

    if (noveltyType === 'CALCULADO') {
      unitLabel = 'Auto';
      units = 1;
      context.HORAS = 0;
      context.CANTIDAD = 1;
      context.UNIDADES = 1;
      context.PORCENTAJE = 0;
      context.PORCENTAJE_ENTERO = 0;
      context.PROPIO_VALOR = 1;
    } else if (noveltyType === 'SOLO_ASIGNACION') {
      unitLabel = 'Fijo';
      units = 1;
      context.HORAS = 0;
      context.CANTIDAD = 1;
      context.UNIDADES = 1;
      context.PORCENTAJE = 0;
      context.PORCENTAJE_ENTERO = 0;
      context.PROPIO_VALOR = 1;
    } else if (noveltyType === 'HORAS') {
      unitLabel = 'Horas';
      if (inputOverride?.units !== undefined && inputOverride?.units !== null) {
        units = hoursToDecimal(inputOverride.units, 0);
      } else {
        units = 0;
      }
      context.HORAS = units;
      context.CANTIDAD = units;
      context.UNIDADES = units;
      context.PROPIO_VALOR = units;
    } else if (noveltyType === 'PORCENTAJE') {
      unitLabel = '%';
      const rawPct = inputOverride?.units !== undefined && inputOverride?.units !== null
        ? Number(inputOverride.units)
        : (concept.defaultValue ? Number(concept.defaultValue) : 0);
      units = rawPct;
      context.PORCENTAJE = rawPct / 100;
      context.PORCENTAJE_ENTERO = rawPct;
      context.CANTIDAD = rawPct;
      context.UNIDADES = rawPct;
      context.PROPIO_VALOR = rawPct / 100;
    } else if (noveltyType === 'IMPORTE') {
      unitLabel = '$';
      const rawAmount = (inputOverride?.amount !== undefined && inputOverride?.amount !== null && String(inputOverride.amount).trim() !== '')
        ? Number(inputOverride.amount)
        : (inputOverride?.units !== undefined && inputOverride?.units !== null && String(inputOverride.units).trim() !== '')
          ? Number(inputOverride.units)
          : Number(concept.defaultValue || 0);
      units = 1;
      context.IMPORTE = rawAmount;
      context.MONTO = rawAmount;
      context.VALOR_NOVEDAD = rawAmount;
      context.VALOR_BASE = Number(concept.defaultValue || 0);
      context.VALOR_DEFECTO = context.VALOR_BASE;
      context.DEFECTO = context.VALOR_BASE;
      context.CANTIDAD = 1;
      context.UNIDADES = 1;
      context.PROPIO_VALOR = rawAmount;
    } else {
      // CANTIDAD
      if (isBasic) {
        units = workedDays;
        unitLabel = 'Días';
      } else if (concept.code === '1010' || concept.code === '101') {
        units = seniority.years;
        unitLabel = 'Años';
      } else if (inputOverride?.units !== undefined && inputOverride?.units !== null) {
        units = Number(inputOverride.units);
        unitLabel = 'Días';
      } else {
        units = 1;
        unitLabel = 'Fijo';
      }
      context.CANTIDAD = units;
      context.UNIDADES = units;
      context.PROPIO_VALOR = units;
    }

    // Evaluar y registrar según el tipo de concepto
    if (concept.type === 'AUXILIARY') {
      const rawAmount = resolveConceptValue(concept, inputOverride);
      const finalAmount = Math.round(rawAmount * 100) / 100;
      context[concept.code] = finalAmount;
      const numOnly = String(concept.code).replace(/\D/g, '');
      if (numOnly) {
        context[numOnly] = finalAmount;
      }
      calculatedItems.push({
        conceptId: concept.id,
        conceptCode: concept.code,
        conceptName: concept.name,
        type: 'AUXILIARY',
        units: (noveltyType === 'IMPORTE' || noveltyType === 'CALCULADO') ? 1 : units,
        unitLabel: noveltyType === 'IMPORTE' ? '$' : (noveltyType === 'CALCULADO' ? 'Auto' : unitLabel),
        rate: null,
        baseAmount: null,
        amount: finalAmount,
        calculationOrder: concept.calculationOrder || 50,
        formula: concept.formula || null,
        arcaConceptCode: null,
      });
    } else if (concept.type === 'REMUNERATIVE') {
      const rawAmount = resolveConceptValue(concept, inputOverride);
      const finalAmount = Math.round(rawAmount * 100) / 100;

      if (finalAmount > 0 || inputOverride) {
        context[concept.code] = finalAmount;
        const numOnly = String(concept.code).replace(/\D/g, '');
        if (numOnly) {
          context[numOnly] = finalAmount;
        }
        if (isBasic) {
          context.BASICO = finalAmount;
          context.SUELDO_BASICO = finalAmount;
          context.SU1000 = finalAmount;
          context['1000'] = finalAmount;
          context['100'] = finalAmount;
        }
        if (isDirectorSalary) {
          context.HONORARIOS_DIRECTOR = finalAmount;
          context.SU1002 = finalAmount;
          context['1002'] = finalAmount;
          context.HONORARIOS = finalAmount;
        }

        context.TOTAL_REMUNERATIVO += finalAmount;
        if (!isDirector) {
          context.BASE_OBRA_SOCIAL += finalAmount;
        }
        context.TOTAL_BRUTO = Math.round((context.TOTAL_REMUNERATIVO + context.TOTAL_NO_REMUNERATIVO) * 100) / 100;
        if (finalAmount > context.MEJOR_REMUN) context.MEJOR_REMUN = finalAmount;

        calculatedItems.push({
          conceptId: concept.id,
          conceptCode: concept.code,
          conceptName: concept.name,
          type: 'REMUNERATIVE',
          units: (isBasic || isDirectorSalary) ? 30 : (noveltyType === 'IMPORTE' ? 1 : units),
          unitLabel: (isBasic || isDirectorSalary) ? 'Días' : ((concept.code === 'SU1010' || concept.code === '1010' || concept.code === '101') ? 'Años' : (noveltyType === 'PORCENTAJE' ? '%' : (noveltyType === 'IMPORTE' ? '$' : (noveltyType === 'CALCULADO' ? 'Auto' : unitLabel)))),
          rate: concept.calculationType === 'PERCENTAGE' ? Number(concept.defaultValue) : null,
          baseAmount: resolveItemBaseAmount(concept, context, isBasic, isDirectorSalary, false),
          amount: finalAmount,
          calculationOrder: concept.calculationOrder || 100,
          formula: concept.formula || null,
          arcaConceptCode: concept.arcaConceptCode || '110000',
        });
      }
    } else if (concept.type === 'NON_REMUNERATIVE') {
      const rawAmount = resolveConceptValue(concept, inputOverride);
      const finalAmount = Math.round(rawAmount * 100) / 100;

      if (finalAmount !== 0 || inputOverride) {
        context[concept.code] = finalAmount;
        const numOnly = String(concept.code).replace(/\D/g, '');
        if (numOnly) {
          context[numOnly] = finalAmount;
        }
        if (isInternStimulus) {
          context.ASIGNACION_ESTIMULO = finalAmount;
          context.ESTIMULO = finalAmount;
          context.SU1001 = finalAmount;
          context['1001'] = finalAmount;
        }

        context.TOTAL_NO_REMUNERATIVO += finalAmount;
        if (concept.appliesOsAporte || isInternStimulus || concept.appliesOsContrib) {
          context.BASE_OBRA_SOCIAL += finalAmount;
        }
        context.TOTAL_BRUTO = Math.round((context.TOTAL_REMUNERATIVO + context.TOTAL_NO_REMUNERATIVO) * 100) / 100;

        calculatedItems.push({
          conceptId: concept.id,
          conceptCode: concept.code,
          conceptName: concept.name,
          type: 'NON_REMUNERATIVE',
          units: isInternStimulus ? 30 : (noveltyType === 'IMPORTE' ? 1 : units),
          unitLabel: isInternStimulus ? 'Días' : (noveltyType === 'IMPORTE' ? '$' : (noveltyType === 'CALCULADO' ? 'Auto' : unitLabel)),
          rate: null,
          baseAmount: resolveItemBaseAmount(concept, context, false, false, isInternStimulus),
          amount: finalAmount,
          calculationOrder: concept.calculationOrder || 150,
          formula: concept.formula || null,
          arcaConceptCode: concept.arcaConceptCode || '550000',
        });
      }
    } else if (concept.type === 'DEDUCTION') {
      const isObraSocial = concept.code === 'GE6003' || concept.code === '8002' || concept.code === '6003' || concept.code === '6004' || concept.code === '303' || concept.arcaConceptCode === '810002' || /obra\s*social/i.test(concept.name);
      let baseForDeduction = isObraSocial ? context.BASE_OBRA_SOCIAL : context.TOTAL_REMUNERATIVO;

      const minCap = Number(payrollSettings.ansesMinCap || 82287.12);
      const maxCap = Number(payrollSettings.ansesMaxCap || 2674292.72);
      let cappedBase = 0;
      if (baseForDeduction > 0) {
        cappedBase = Math.min(Math.max(baseForDeduction, minCap), maxCap);
      }

      let rawAmount = 0;
      if (inputOverride?.amount !== undefined && inputOverride?.amount !== null && (concept.calculationType !== 'FORMULA' || concept.noveltyDataType !== 'IMPORTE')) {
        rawAmount = Number(inputOverride.amount);
      } else if (concept.calculationType === 'FORMULA' && concept.formula) {
        rawAmount = resolveConceptValue(concept, inputOverride);
      } else if (concept.calculationType === 'PERCENTAGE') {
        const pct = Number(concept.defaultValue || 0) / 100;
        rawAmount = (cappedBase > 0 ? cappedBase : baseForDeduction) * pct;
      } else {
        rawAmount = resolveConceptValue(concept, inputOverride);
      }

      const finalAmount = Math.round(rawAmount * 100) / 100;
      if (finalAmount > 0) {
        context[concept.code] = finalAmount;
        const numOnly = String(concept.code).replace(/\D/g, '');
        if (numOnly) {
          context[numOnly] = finalAmount;
        }
        totalDeductions += finalAmount;
        context.TOTAL_DEDUCCIONES = totalDeductions;

        calculatedItems.push({
          conceptId: concept.id,
          conceptCode: concept.code,
          conceptName: concept.name,
          type: 'DEDUCTION',
          units: noveltyType === 'IMPORTE' ? 1 : null,
          unitLabel: noveltyType === 'IMPORTE' ? '$' : (concept.calculationType === 'PERCENTAGE' ? '%' : unitLabel),
          rate: concept.defaultValue ? Number(concept.defaultValue) : null,
          baseAmount: cappedBase > 0 ? cappedBase : null,
          amount: finalAmount,
          calculationOrder: concept.calculationOrder || 200,
          formula: concept.formula || null,
          arcaConceptCode: concept.arcaConceptCode || '810000',
        });
      }
    }
  }

  // --- PASO 4: Totales Salariales ---
  const totalRemunerative = Math.round(context.TOTAL_REMUNERATIVO * 100) / 100;
  const totalNonRemunerative = Math.round(context.TOTAL_NO_REMUNERATIVO * 100) / 100;
  const grossSalary = Math.round((totalRemunerative + totalNonRemunerative) * 100) / 100;
  totalDeductions = Math.round(totalDeductions * 100) / 100;
  const netSalary = Math.round((grossSalary - totalDeductions) * 100) / 100;
  const netSalaryWords = numberToSpanishWords(netSalary);

  // --- PASO 5: Contribuciones Patronales (Bloque 2 Ley 27.802 & Dec. 407/2026) ---
  const minCap = Number(payrollSettings.ansesMinCap || 82287.12);
  const maxCap = Number(payrollSettings.ansesMaxCap || 2674292.72);
  const detraction = Number(payrollSettings.detractionBase || 7003.68);

  const hasRemuneration = totalRemunerative > 0 || grossSalary > 0;

  // Base Imponible SIPA Contribuciones (Sin tope máximo)
  let biSipaContrib = 0;
  let biSipaWithDetraction = 0;
  let biOsContrib = 0;
  let biLrt = 0;

  if (hasRemuneration) {
    if (isDirector) {
      biSipaContrib = 0.00;
      biSipaWithDetraction = 0.00;
      biOsContrib = 0.00;
      biLrt = grossSalary;
    } else if (isIntern) {
      biSipaContrib = 0.00;
      biSipaWithDetraction = 0.00;
      biOsContrib = Math.round(context.BASE_OBRA_SOCIAL * 100) / 100;
      biLrt = grossSalary;
    } else {
      biSipaContrib = Math.max(totalRemunerative, minCap);
      biSipaWithDetraction = Math.max(biSipaContrib - detraction, minCap);
      biOsContrib = Math.min(Math.max(context.BASE_OBRA_SOCIAL, minCap), maxCap);
      biLrt = grossSalary;
    }
  }

  const sipaRate = Number(payrollSettings.sipaRate || 10.77) / 100;
  const inssjypRate = Number(payrollSettings.inssjypRate || 1.58) / 100;
  const osRate = Number(payrollSettings.osRate || 6.00) / 100;
  const fneRate = Number(payrollSettings.fneRate || 0.94) / 100;
  const aaffRate = Number(payrollSettings.aaffRate || 4.70) / 100;
  const artRate = Number(payrollSettings.artRate || 3.50) / 100;
  const artFixed = Number(payrollSettings.artFixedFee || 850.00);
  const scvoFee = Number(payrollSettings.scvoFee || 650.00);

  const sipaContrib = (!isIntern && !isDirector && hasRemuneration) ? Math.round(biSipaWithDetraction * sipaRate * 100) / 100 : 0.00;
  const inssjypContrib = (!isIntern && !isDirector && hasRemuneration) ? Math.round(biSipaContrib * inssjypRate * 100) / 100 : 0.00;
  const osContrib = (!isDirector && hasRemuneration) ? Math.round(biOsContrib * osRate * 100) / 100 : 0.00;
  const fneContrib = (!isIntern && !isDirector && hasRemuneration) ? Math.round(biSipaContrib * fneRate * 100) / 100 : 0.00;
  const aaffContrib = (!isIntern && !isDirector && hasRemuneration) ? Math.round(biSipaContrib * aaffRate * 100) / 100 : 0.00;
  const artContrib = hasRemuneration ? Math.round((biLrt * artRate + artFixed) * 100) / 100 : 0.00;
  const scvoContrib = hasRemuneration ? scvoFee : 0.00;
  const unionContrib = (!isIntern && !isDirector && hasRemuneration && employee.unionId) ? Math.round(totalRemunerative * 0.005 * 100) / 100 : 0.00;

  const totalEmployerContrib = Math.round(
    (sipaContrib + inssjypContrib + osContrib + fneContrib + aaffContrib + artContrib + scvoContrib + unionContrib) * 100
  ) / 100;

  // Costo Laboral Total (CLT = Bruto + Contribuciones Patronales)
  const totalLaborCost = Math.round((grossSalary + totalEmployerContrib) * 100) / 100;

  // --- PASO 6: Distribución Porcentual del Costo Laboral Total (100%) (Bloque 5) ---
  const clt = totalLaborCost > 0 ? totalLaborCost : 1;
  const pctNetSalary = Math.round((netSalary / clt) * 10000) / 100;
  const pctEmployeeDeductions = Math.round((totalDeductions / clt) * 10000) / 100;
  const pctSocialSecurityContrib = Math.round(((sipaContrib + inssjypContrib + fneContrib + aaffContrib) / clt) * 10000) / 100;
  const pctHealthContrib = Math.round((osContrib / clt) * 10000) / 100;
  const pctArtAndInsurance = Math.round(((artContrib + scvoContrib) / clt) * 10000) / 100;

  // Ajuste de redondeo para que la suma sea exactamente 100.00%
  const currentSum = pctNetSalary + pctEmployeeDeductions + pctSocialSecurityContrib + pctHealthContrib + pctArtAndInsurance;
  const pctUnionAndChambers = Math.round((100.00 - currentSum) * 100) / 100;

  // --- PASO 7: Bases Imponibles F.931 (LSD Registro 04) ---
  const biSipaAporte = (!isIntern && !isDirector && hasRemuneration) ? Math.min(Math.max(totalRemunerative, minCap), maxCap) : 0.00;
  const biInssjypAporte = biSipaAporte;

  const relatives = employee.relatives || [];
  const hasSpouse = relatives.some((r) => r.kinship?.code === 'CONYUGE' || r.kinship?.code === 'CONVIVIENTE');
  const childrenCount = relatives.filter((r) => String(r.kinship?.code || '').startsWith('HIJO')).length;

  const basisData = {
    baseImponible1: biSipaAporte,
    baseImponible2: (isIntern || isDirector) ? 0.00 : biSipaContrib,
    baseImponible3: (isIntern || isDirector) ? 0.00 : biSipaContrib,
    baseImponible4: biOsContrib,
    baseImponible5: biInssjypAporte,
    baseImponible6: 0.00,
    baseImponible7: 0.00,
    baseImponible8: biOsContrib,
    baseImponible9: biLrt,
    baseImponible10: (isIntern || isDirector) ? 0.00 : biSipaWithDetraction,
    detractionAmount: (isIntern || isDirector) ? 0.00 : detraction,
    situationCode: employee.status === 'ACTIVE' ? '01' : '13',
    conditionCode: '01',
    activityCode: employee.jobPosition?.activityCode || (isDirector ? '015' : '049'),
    contractModality: (employee.contractModalityCode || (isDirector ? '099' : (isIntern ? '027' : '001'))).padStart(3, '0'),
    hasSpouse,
    childrenCount,
    hasScvo: true,
    hasCct: (isIntern || isDirector) ? false : Boolean(employee.jobPosition?.cctCode),
  };

  // --- PASO 8: Hash SHA-256 de Trazabilidad y Firma Electrónica ---
  const payloadToHash = JSON.stringify({
    cuil: employee.cuil,
    legajo: employee.fileNumber,
    period: `${period.year}-${String(period.month).padStart(2, '0')}`,
    settlementNumber: period.settlementNumber,
    grossSalary,
    netSalary,
    totalLaborCost,
    itemsCount: calculatedItems.length,
    timestamp: periodDate.toISOString(),
  });
  const signatureHash = crypto.createHash('sha256').update(payloadToHash).digest('hex');

  return {
    items: calculatedItems,
    totals: {
      totalRemunerative,
      totalNonRemunerative,
      grossSalary,
      totalDeductions,
      netSalary,
      netSalaryWords,
      sipaContrib,
      inssjypContrib,
      osContrib,
      fneContrib,
      aaffContrib,
      artContrib,
      scvoContrib,
      unionContrib,
      totalEmployerContrib,
      totalLaborCost,
    },
    employerContributions: {
      sipaContrib,
      inssjypContrib,
      osContrib,
      fneContrib,
      aaffContrib,
      artContrib,
      scvoContrib,
      unionContrib,
      totalEmployerContrib,
    },
    percentages: {
      pctNetSalary,
      pctEmployeeDeductions,
      pctSocialSecurityContrib,
      pctHealthContrib,
      pctArtAndInsurance,
      pctUnionAndChambers: Math.max(0, pctUnionAndChambers),
    },
    basis: basisData,
    workedDays,
    workedHours,
    signatureHash,
    paymentMethod: employee.cbu && String(employee.cbu).trim() ? 'CBU' : 'EFECTIVO',
    cbu: employee.cbu && String(employee.cbu).trim() ? String(employee.cbu).trim() : null,
    bankName: employee.cbu && String(employee.cbu).trim() ? (employee.bankName || 'Acreditación Bancaria') : null,
  };
}
