import { evaluateFormula, resolveHistoricalMetric } from './src/modules/payroll/formulaEvaluator.js';
import { validateConceptFormula, auditFormulaCatalogConsistency } from './src/modules/payroll/formulaValidator.js';
import { calculateEmployeePayroll, resolveItemBaseAmount } from './src/modules/payroll/payroll.calculator.js';
import { generateLsdConceptsFile, generateLsdPayrollFile, validateLsdConsistency } from './src/modules/payroll/lsdExporter.service.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function assertClose(actual, expected, message, tolerance = 0.001) {
  const diff = Math.abs(Number(actual) - Number(expected));
  assert(diff <= tolerance, `${message} (Expected: ${expected}, Got: ${actual})`);
}

console.log('====================================================');
console.log('SUITE DE PRUEBAS: MOTOR DE FÓRMULAS & CONCEPTOS v2.0');
console.log('====================================================\n');

// ----------------------------------------------------
// 1. EVALUADOR DE FÓRMULAS: TOPES Y CONDICIONALES
// ----------------------------------------------------
console.log('--- 1. Funciones de Topes y Condicionales ---');

{
  // TOPE_MAX: no puede superar el máximo
  const res1 = evaluateFormula('TOPE_MAX(1000 + 500, 1200)');
  assert(res1 === 1200, 'TOPE_MAX(1500, 1200) debe retornar 1200');

  const res2 = evaluateFormula('TOPE_MAX(800, 1200)');
  assert(res2 === 800, 'TOPE_MAX(800, 1200) debe retornar 800');

  // TOPE_MIN: no puede ser inferior al mínimo
  const res3 = evaluateFormula('TOPE_MIN(500, 1000)');
  assert(res3 === 1000, 'TOPE_MIN(500, 1000) debe retornar 1000');

  const res4 = evaluateFormula('TOPE_MIN(1500, 1000)');
  assert(res4 === 1500, 'TOPE_MIN(1500, 1000) debe retornar 1500');

  // LIMITAR(expr, min, max)
  const res5 = evaluateFormula('LIMITAR(400, 500, 2000)');
  assert(res5 === 500, 'LIMITAR(400, 500, 2000) debe recortar a 500');

  const res6 = evaluateFormula('LIMITAR(2500, 500, 2000)');
  assert(res6 === 2000, 'LIMITAR(2500, 500, 2000) debe recortar a 2000');

  const res7 = evaluateFormula('LIMITAR(1200, 500, 2000)');
  assert(res7 === 1200, 'LIMITAR(1200, 500, 2000) debe mantener 1200');

  // SI / IF
  const res8 = evaluateFormula('SI(10 > 5, 100, 200)');
  assert(res8 === 100, 'SI(10 > 5, 100, 200) debe retornar 100');

  const res9 = evaluateFormula('SI(3 >= 5, 100, 200)');
  assert(res9 === 200, 'SI(3 >= 5, 100, 200) debe retornar 200');

  // Funciones anidadas
  const res10 = evaluateFormula('REDONDEAR(TOPE_MAX(100.555, 200), 2)');
  assert(res10 === 100.56, 'REDONDEAR(TOPE_MAX(100.555, 200), 2) debe ser 100.56');
}

// ----------------------------------------------------
// 2. MÉTRICAS HISTÓRICAS DUALES (6M, 12M, ANUAL)
// ----------------------------------------------------
console.log('\n--- 2. Métricas Históricas Duales ---');

{
  // Simular recibos de los últimos meses para el empleado
  // Período actual: Mes 6 del año 2026
  // Recibos históricos: Meses 1 a 5 de 2026, y Mes 12 de 2025
  const currentPeriod = { year: 2026, month: 6, periodType: 'MONTHLY' };
  const slips = [
    {
      payrollPeriod: { year: 2026, month: 5, periodType: 'MONTHLY' },
      items: [
        { conceptCode: '1000', type: 'REMUNERATIVE', amount: 500000 },
        { conceptCode: '1050', type: 'AUXILIARY', amount: 50000 },
      ],
      grossSalary: 500000,
      remunerativeSalary: 500000,
      nonRemunerative: 0,
      totalDeductions: 85000,
    },
    {
      payrollPeriod: { year: 2026, month: 4, periodType: 'MONTHLY' },
      items: [
        { conceptCode: '1000', type: 'REMUNERATIVE', amount: 480000 },
        { conceptCode: '1050', type: 'AUXILIARY', amount: 48000 },
      ],
      grossSalary: 480000,
      remunerativeSalary: 480000,
      nonRemunerative: 0,
      totalDeductions: 81600,
    },
    {
      payrollPeriod: { year: 2026, month: 3, periodType: 'MONTHLY' },
      items: [
        { conceptCode: '1000', type: 'REMUNERATIVE', amount: 450000 },
        { conceptCode: '1050', type: 'AUXILIARY', amount: 45000 },
      ],
      grossSalary: 450000,
      remunerativeSalary: 450000,
      nonRemunerative: 0,
      totalDeductions: 76500,
    },
    {
      payrollPeriod: { year: 2026, month: 2, periodType: 'MONTHLY' },
      items: [
        { conceptCode: '1000', type: 'REMUNERATIVE', amount: 450000 },
        { conceptCode: '1050', type: 'AUXILIARY', amount: 45000 },
      ],
      grossSalary: 450000,
      remunerativeSalary: 450000,
      nonRemunerative: 0,
      totalDeductions: 76500,
    },
    {
      payrollPeriod: { year: 2026, month: 1, periodType: 'MONTHLY' },
      items: [
        { conceptCode: '1000', type: 'REMUNERATIVE', amount: 400000 },
        { conceptCode: '1050', type: 'AUXILIARY', amount: 40000 },
      ],
      grossSalary: 400000,
      remunerativeSalary: 400000,
      nonRemunerative: 0,
      totalDeductions: 68000,
    },
    {
      payrollPeriod: { year: 2025, month: 12, periodType: 'MONTHLY' },
      items: [
        { conceptCode: '1000', type: 'REMUNERATIVE', amount: 350000 },
        { conceptCode: '1050', type: 'AUXILIARY', amount: 35000 },
      ],
      grossSalary: 350000,
      remunerativeSalary: 350000,
      nonRemunerative: 0,
      totalDeductions: 59500,
    },
  ];

  const historicalData = { slips };
  // En el mes actual 6/2026, el básico '1000' ya se calculó en 600.000
  const context = {
    evaluatedConcepts: new Map([
      ['1000', 600000],
      ['1050', 60000],
    ]),
    totalRemunerativo: 600000,
    totalNoRemunerativo: 0,
    totalDeducciones: 102000,
    totalBruto: 600000,
    historicalData,
    currentPeriod,
  };

  // 1) ACUM_6M (mes en curso + 5 anteriores): 600k + 500k + 480k + 450k + 450k + 400k = 2.880.000
  const acum6m = resolveHistoricalMetric('ACUM_6M', '1000', context);
  assert(acum6m === 2880000, `ACUM_6M debe sumar 6 meses incluyendo actual: 2.880.000 (obtenido ${acum6m})`);

  // 2) ACUM_6M_ANT (6 meses anteriores cerrados): 500k + 480k + 450k + 450k + 400k + 350k = 2.630.000
  const acum6mAnt = resolveHistoricalMetric('ACUM_6M_ANT', '1000', context);
  assert(acum6mAnt === 2630000, `ACUM_6M_ANT debe sumar 6 meses anteriores cerrados: 2.630.000 (obtenido ${acum6mAnt})`);

  // 3) PROM_6M (divisor liquidaciones reales = 6): 2.880.000 / 6 = 480.000
  const prom6m = resolveHistoricalMetric('PROM_6M', '1000', context);
  assertClose(prom6m, 480000, 'PROM_6M');

  // 4) MEJOR_6M (mayor valor últimos 6 meses): 600.000 (mes actual)
  const mejor6m = resolveHistoricalMetric('MEJOR_6M', '1000', context);
  assert(mejor6m === 600000, `MEJOR_6M debe ser 600.000 (obtenido ${mejor6m})`);

  // 5) MEJOR_6M_ANT (mayor valor 6 meses anteriores): 500.000 (mes 5)
  const mejor6mAnt = resolveHistoricalMetric('MEJOR_6M_ANT', '1000', context);
  assert(mejor6mAnt === 500000, `MEJOR_6M_ANT debe ser 500.000 (obtenido ${mejor6mAnt})`);

  // 6) ACUM_ANUAL (Año Calendario: Enero a Junio 2026):
  // Meses 1 a 6 de 2026: 400k + 450k + 450k + 480k + 500k + 600k = 2.880.000 (no incluye Dic 2025)
  const acumAnual = resolveHistoricalMetric('ACUM_ANUAL', '1000', context);
  assert(acumAnual === 2880000, `ACUM_ANUAL debe delimitarse a 2026: 2.880.000 (obtenido ${acumAnual})`);

  // 7) Concepto Auxiliar Histórico: ACUM_6M:1050
  const acumAux = resolveHistoricalMetric('ACUM_6M', '1050', context);
  assert(acumAux === 288000, `ACUM_6M sobre concepto auxiliar 1050 debe ser 288.000 (obtenido ${acumAux})`);

  // 8) Métrica sobre Total de Grupo: ACUM_6M:TOTAL_REMUNERATIVO
  const acumTotRem = resolveHistoricalMetric('ACUM_6M', 'TOTAL_REMUNERATIVO', context);
  assert(acumTotRem === 2880000, `ACUM_6M sobre TOTAL_REMUNERATIVO debe ser 2.880.000 (obtenido ${acumTotRem})`);
}

// ----------------------------------------------------
// 3. REGLA ESPECIAL SAC (AGUINALDO)
// ----------------------------------------------------
console.log('\n--- 3. Delimitación Semestral en Liquidaciones SAC ---');

{
  const sacPeriod = { year: 2026, month: 6, periodType: 'SAC_1' };
  const slipsWithPastYear = [
    {
      payrollPeriod: { year: 2026, month: 5, periodType: 'MONTHLY' },
      items: [{ conceptCode: '1000', amount: 500000, type: 'REMUNERATIVE' }],
    },
    {
      payrollPeriod: { year: 2025, month: 12, periodType: 'MONTHLY' },
      items: [{ conceptCode: '1000', amount: 800000, type: 'REMUNERATIVE' }], // No debe entrar al 1er semestre 2026
    },
  ];

  const sacContext = {
    evaluatedConcepts: new Map(),
    historicalData: { slips: slipsWithPastYear },
    currentPeriod: sacPeriod,
  };

  const mejorSemestre = resolveHistoricalMetric('MEJOR_6M', '1000', sacContext);
  assert(mejorSemestre === 500000, `En SAC_1, MEJOR_6M no debe incluir meses del año anterior (800k descartado, esperado 500k, obtenido ${mejorSemestre})`);
}

// ----------------------------------------------------
// 4. VALIDADOR DE FÓRMULAS & ORDEN DE CÁLCULO
// ----------------------------------------------------
console.log('\n--- 4. Validador de Fórmulas y Orden de Cálculo ---');

{
  const existingConcepts = [
    { code: '1000', calculationOrder: 10 },
    { code: '1010', calculationOrder: 20 },
    { code: '1050', calculationOrder: 30 }, // Auxiliar
    { code: '5000', calculationOrder: 100 }, // Retención
  ];

  // Caso Válido: Referencia hacia atrás por código numérico
  const v1 = validateConceptFormula({
    formula: '[1000] * 0.20 + [1010]',
    currentConceptCode: '1050',
    type: 'AUXILIARY',
    allConcepts: existingConcepts,
  });
  assert(v1.isValid === true, 'Fórmula que referencia conceptos anteriores (1000 y 1010 desde código 1050) debe ser VÁLIDA');

  // Caso Inválido: Referencia hacia adelante por código numérico
  const v2 = validateConceptFormula({
    formula: '[5000] * 0.10',
    currentConceptCode: '1050',
    type: 'AUXILIARY',
    allConcepts: existingConcepts,
  });
  assert(v2.isValid === false, 'Fórmula que referencia un concepto con código posterior (código 5000 desde 1050) debe ser INVÁLIDA');

  // Caso Inválido: Autoreferencia
  const v3 = validateConceptFormula({
    formula: '[1050] * 2',
    currentConceptCode: '1050',
    type: 'AUXILIARY',
    allConcepts: existingConcepts,
  });
  assert(v3.isValid === false, 'Autoreferencia directa debe ser rechazada');

  // Caso Inválido: Paréntesis desbalanceados
  const v4 = validateConceptFormula({
    formula: '([1000] * 0.2',
    currentConceptCode: '1050',
    type: 'AUXILIARY',
    allConcepts: existingConcepts,
  });
  assert(v4.isValid === false, 'Paréntesis desbalanceados deben ser rechazados');

  // Caso Inválido: Argumentos insuficientes en TOPE_MAX
  const v5 = validateConceptFormula({
    formula: 'TOPE_MAX([1000])',
    currentConceptCode: '1050',
    type: 'AUXILIARY',
    allConcepts: existingConcepts,
  });
  assert(v5.isValid === false, 'TOPE_MAX con 1 solo argumento debe ser rechazado');

  // Caso Inválido: Remunerativo dependiente de TOTAL_REMUNERATIVO
  const v6 = validateConceptFormula({
    formula: '[TOTAL_REMUNERATIVO] * 0.10',
    conceptCode: '1080',
    type: 'REMUNERATIVE',
    allConcepts: existingConcepts,
  });
  assert(v6.isValid === false, 'Concepto REMUNERATIVE que referencia [TOTAL_REMUNERATIVO] en el período actual debe ser RECHAZADO');

  // Caso Inválido: No Remunerativo dependiente de TOTAL_BRUTO
  const v7 = validateConceptFormula({
    formula: '[TOTAL_BRUTO] * 0.05',
    conceptCode: '4010',
    type: 'NON_REMUNERATIVE',
    allConcepts: existingConcepts,
  });
  assert(v7.isValid === false, 'Concepto NON_REMUNERATIVE que referencia [TOTAL_BRUTO] en el período actual debe ser RECHAZADO');

  // Caso Inválido: Deducción dependiente de TOTAL_DEDUCCIONES
  const v8 = validateConceptFormula({
    formula: '[TOTAL_DEDUCCIONES] * 0.10',
    conceptCode: '6010',
    type: 'DEDUCTION',
    allConcepts: existingConcepts,
  });
  assert(v8.isValid === false, 'Concepto DEDUCTION que referencia [TOTAL_DEDUCCIONES] en el período actual debe ser RECHAZADO');

  // Caso Válido: Deducción dependiente de TOTAL_REMUNERATIVO
  const v9 = validateConceptFormula({
    formula: '[TOTAL_REMUNERATIVO] * 0.11',
    conceptCode: '6001',
    type: 'DEDUCTION',
    allConcepts: existingConcepts,
  });
  assert(v9.isValid === true, 'Concepto DEDUCTION que referencia [TOTAL_REMUNERATIVO] debe ser VÁLIDO');
}

// ----------------------------------------------------
// 5. CÁLCULO INTEGRAL CON CONCEPTOS AUXILIARES, ALCANCE Y BÁSICO COMPLETO
// ----------------------------------------------------
console.log('\n--- 5. Pipeline de Liquidación con Conceptos Auxiliares y Alcance ---');

{
  const employee = {
    id: 'emp-test-1',
    fileNumber: '101',
    firstName: 'Juan',
    lastName: 'Pérez',
    cuil: '20301234567',
    hireDate: new Date('2020-01-01'),
    basicSalary: 1000000,
    jobPosition: { name: 'Administrativo A' },
  };

  const period = {
    id: 'period-2026-06',
    year: 2026,
    month: 6,
    periodType: 'MONTHLY',
  };

  const payrollSettings = {
    ansesMinCap: 82287.12,
    ansesMaxCap: 2674292.72,
    standardWeeklyHours: 48,
    standardMonthlyHours: 200,
    sipaRate: 10.77,
    inssjypRate: 1.58,
    osRate: 6.00,
    fneRate: 0.94,
    aaffRate: 4.70,
    artRate: 3.50,
    artFixedFee: 850,
    scvoFee: 650,
    detractionBase: 7003.68,
  };

  // Definir catálogo de conceptos:
  // 1000: Básico ($1.000.000) - GENERAL (Remunerativo)
  // 1015: Auxiliar de Horas Extras y Plus (AUXILIARY) = [1000] * 0.10 ($100.000)
  // 1020: Presentismo legal calculado con base en el auxiliar: ([1000] + [1015]) * 0.0833 ($91.630) (Remunerativo)
  // 1500: Adelanto Vacacional - INDIVIDUAL (no debe entrar porque no viene en novedades ni asignado)
  // 6001: Jubilación 11% sobre Remunerativo (DEDUCTION)
  const allConcepts = [
    {
      id: 'c-1000',
      code: '1000',
      name: 'Sueldo Básico',
      type: 'REMUNERATIVE',
      scope: 'GENERAL',
      calculationType: 'FIXED',
      defaultValue: 1000000,
      isPersistent: true,
      periodType: 'ALL',
      noveltyDataType: 'CANTIDAD',
      arcaConceptCode: '110000',
      appliesSipaAporte: true,
      appliesSipaContrib: true,
      appliesInssjypAporte: true,
      appliesInssjypContrib: true,
      appliesOsAporte: true,
      appliesOsContrib: true,
    },
    {
      id: 'c-1015',
      code: '1015',
      name: 'Base Ponderada Auxiliar',
      type: 'AUXILIARY',
      scope: 'GENERAL',
      calculationType: 'FORMULA',
      formula: '[1000] * 0.10',
      isPersistent: true,
      periodType: 'ALL',
      noveltyDataType: 'CANTIDAD',
      arcaConceptCode: null,
    },
    {
      id: 'c-1020',
      code: '1020',
      name: 'Presentismo Asistencia Perfecta',
      type: 'REMUNERATIVE',
      scope: 'GENERAL',
      calculationType: 'FORMULA',
      formula: '([1000] + [1015]) * 0.0833',
      isPersistent: true,
      periodType: 'ALL',
      noveltyDataType: 'CANTIDAD',
      arcaConceptCode: '120000',
      appliesSipaAporte: true,
      appliesSipaContrib: true,
    },
    {
      id: 'c-1500',
      code: '1500',
      name: 'Adelanto Vacacional',
      type: 'REMUNERATIVE',
      scope: 'INDIVIDUAL',
      calculationType: 'FORMULA',
      formula: '([1000] / 25) * [CANTIDAD]',
      isPersistent: true,
      periodType: 'ALL',
      noveltyDataType: 'CANTIDAD',
      arcaConceptCode: '130000',
    },
    {
      id: 'c-6001',
      code: '6001',
      name: 'Jubilación SIPA Ley 24.241',
      type: 'DEDUCTION',
      scope: 'GENERAL',
      calculationType: 'FORMULA',
      formula: '[TOTAL_REMUNERATIVO] * 0.11',
      isPersistent: true,
      periodType: 'ALL',
      noveltyDataType: 'CANTIDAD',
      arcaConceptCode: '810000',
    },
  ];

  // Simular liquidación con 15 días trabajados para confirmar que el básico NO se prorratea
  const calcResult = calculateEmployeePayroll({
    employee,
    period,
    payrollSettings,
    inputItems: [{ conceptCode: '1000', units: 15 }], // 15 días en la novedad del básico
    allConcepts,
    allMatrices: [],
    allFixedValues: [],
  });

  // Verificar que el sueldo básico liquidó el valor nominal completo pactado: $1.000.000 (sin prorrateo)
  const basicItem = calcResult.items.find((i) => i.conceptCode === '1000');
  assert(basicItem.amount === 1000000, `Sueldo básico 1000 debe liquidar el valor mensual completo ($1.000.000) aún con 15 días: obtenido ${basicItem.amount}`);

  // Verificar que el concepto INDIVIDUAL 1500 NO fue liquidado porque no fue asignado
  const indItem = calcResult.items.find((i) => i.conceptCode === '1500');
  assert(indItem === undefined, 'El concepto con scope INDIVIDUAL 1500 NO debe liquidarse si no fue asignado al empleado');

  // Verificar que el auxiliar se calculó correctamente: $1.000.000 * 0.10 = $100.000
  const auxItem = calcResult.items.find((i) => i.conceptCode === '1015');
  assert(auxItem !== undefined, 'El concepto auxiliar 1015 debe existir en calculation.items');
  assert(auxItem.type === 'AUXILIARY', 'El tipo del concepto 1015 debe ser AUXILIARY');
  assert(auxItem.amount === 100000, `El monto del auxiliar 1015 debe ser 100.000 (obtenido ${auxItem.amount})`);

  // Verificar presentismo: (1.000.000 + 100.000) * 0.0833 = 1.100.000 * 0.0833 = 91.630
  const presItem = calcResult.items.find((i) => i.conceptCode === '1020');
  assert(presItem.amount === 91630, `Presentismo debe calcularse con el auxiliar: esperado 91.630 (obtenido ${presItem.amount})`);

  // Verificar que el concepto auxiliar NO sumó al total remunerativo (solo 1000 y 1020 deben sumar)
  const totalRemunerativoEsperado = 1000000 + 91630; // 1.091.630
  assert(calcResult.totals.totalRemunerative === totalRemunerativoEsperado, `Total Remunerativo no debe incluir el concepto auxiliar: esperado ${totalRemunerativoEsperado} (obtenido ${calcResult.totals.totalRemunerative})`);

  // ----------------------------------------------------
  // 6. EXPORTACIÓN A LIBRO DE SUELDOS DIGITAL (ARCA)
  // ----------------------------------------------------
  console.log('\n--- 6. Filtrado de Auxiliares en Exportadores ARCA LSD ---');

  // Catálogo de Conceptos
  const lsdConceptsFile = generateLsdConceptsFile(allConcepts);
  assert(!lsdConceptsFile.includes('1015'), 'El archivo de conceptos de LSD NO debe incluir el concepto AUXILIARY 1015');
  assert(lsdConceptsFile.includes('1000'), 'El archivo de conceptos de LSD debe incluir el concepto legal 1000');
  assert(lsdConceptsFile.includes('1020'), 'El archivo de conceptos de LSD debe incluir el concepto legal 1020');

  // Liquidación Período (Registro 03)
  const paySlipMock = {
    id: 'slip-1',
    grossSalary: calcResult.totals.grossSalary,
    netSalary: calcResult.totals.netSalary,
    paymentDate: new Date('2026-07-05'),
    workedDays: 30,
    employee,
    basis: calcResult.basis,
    items: calcResult.items,
  };

  const lsdPayrollFile = generateLsdPayrollFile({ paySlips: [paySlipMock], period, company: { cuit: '30712345678' } });
  assert(!lsdPayrollFile.includes('031015'), 'El archivo de liquidación LSD NO debe contener registros 03 para el concepto auxiliar 1015');
  assert(lsdPayrollFile.includes('1000'), 'El archivo de liquidación LSD debe contener el concepto 1000');
  // ----------------------------------------------------
  // 7. RÉGIMEN DE PASANTÍAS EDUCATIVAS (LEY 26.427 - MODALIDAD 27 / 51)
  // ----------------------------------------------------
  console.log('\n--- 7. Régimen de Pasantías Educativas (Ley 26.427) ---');

  const internEmployee = {
    id: 'emp-intern-1',
    fileNumber: 'PAS-001',
    firstName: 'Martín',
    lastName: 'Pasante',
    cuil: '20421234567',
    status: 'ACTIVE',
    hireDate: new Date('2026-03-01'),
    contractModalityCode: '27', // Pasantías Ley 26427
    weeklyWorkingHours: 20.00,
    monthlyWorkingHours: 80.00,
    isPartTime: true,
    basicSalary: 400000.00,
    salaryScale: {
      id: 'scale-intern-1',
      name: 'Pasantía Universitaria Sistemas',
      amount: 400000.00,
      isInternOnly: true,
    },
  };

  const internPayrollSettings = {
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
  };

  // Test 7.1: Liquidación Estándar de Pasante
  const internResult = calculateEmployeePayroll({
    employee: internEmployee,
    period,
    payrollSettings: internPayrollSettings,
    allConcepts,
    allMatrices: [],
    allFixedValues: [],
  });

  const item1000 = internResult.items.find((i) => i.conceptCode === 'SU1000' || i.conceptCode === '1000');
  const item1001 = internResult.items.find((i) => i.conceptCode === 'SU1001' || i.conceptCode === '1001');

  assert(!item1000, 'Pasante NO debe liquidar concepto 1000 / SU1000 (Sueldo Básico)');
  assert(item1001 !== undefined, 'Pasante DEBE liquidar concepto SU1001 (Asignación Estímulo Ley 26.427)');
  assert(item1001 && item1001.amount === 400000, `Concepto SU1001 debe liquidarse completo por 400.000 (obtenido ${item1001?.amount})`);
  assert(item1001 && item1001.type === 'NON_REMUNERATIVE', 'Concepto SU1001 debe ser de tipo NON_REMUNERATIVE');
  assert(internResult.totals.totalRemunerative === 0, `Total remunerativo de pasante debe ser 0 (obtenido ${internResult.totals.totalRemunerative})`);
  assert(internResult.totals.totalNonRemunerative === 400000, `Total no remunerativo de pasante debe ser 400.000 (obtenido ${internResult.totals.totalNonRemunerative})`);
  assert(internResult.totals.totalDeductions === 0, `Aportes del pasante deben ser 0.00 (obtenido ${internResult.totals.totalDeductions})`);
  assert(internResult.totals.netSalary === 400000, `Sueldo neto del pasante debe ser 400.000 (obtenido ${internResult.totals.netSalary})`);

  // Contribuciones patronales del pasante (solo Obra Social 6% y ART)
  assert(internResult.totals.sipaContrib === 0, `SIPA patronal pasante debe ser 0 (obtenido ${internResult.totals.sipaContrib})`);
  assert(internResult.totals.inssjypContrib === 0, `INSSJyP patronal pasante debe ser 0 (obtenido ${internResult.totals.inssjypContrib})`);
  assert(internResult.totals.fneContrib === 0, `FNE patronal pasante debe ser 0 (obtenido ${internResult.totals.fneContrib})`);
  assert(internResult.totals.aaffContrib === 0, `AAFF patronal pasante debe ser 0 (obtenido ${internResult.totals.aaffContrib})`);
  assert(internResult.totals.osContrib === 24000, `Obra Social patronal (6% de 400.000) debe ser 24.000 (obtenido ${internResult.totals.osContrib})`);
  const expectedArt = Math.round((400000 * 0.035 + 850) * 100) / 100; // 14.850
  assert(internResult.totals.artContrib === expectedArt, `ART patronal pasante debe ser ${expectedArt} (obtenido ${internResult.totals.artContrib})`);

  // Bases imponibles F.931
  assert(internResult.basis.baseImponible1 === 0, `BI 1 SIPA Aportes debe ser 0 (obtenido ${internResult.basis.baseImponible1})`);
  assert(internResult.basis.baseImponible2 === 0, `BI 2 SIPA Contribuciones debe ser 0 (obtenido ${internResult.basis.baseImponible2})`);
  assert(internResult.basis.baseImponible4 === 400000, `BI 4 Obra Social debe ser 400.000 (obtenido ${internResult.basis.baseImponible4})`);
  assert(internResult.basis.baseImponible8 === 400000, `BI 8 FSR debe ser 400.000 (obtenido ${internResult.basis.baseImponible8})`);
  assert(internResult.basis.baseImponible9 === 400000, `BI 9 LRT debe ser 400.000 (obtenido ${internResult.basis.baseImponible9})`);
  assert(internResult.basis.contractModality === '027', `Modalidad contractual en F.931 debe ser '027' (obtenido ${internResult.basis.contractModality})`);

  // Test 7.2: Novedad de Inasistencia cargada mediante concepto creado por el usuario
  const conceptoDescuentoAusencia = {
    id: 'c-desc-aus-1',
    code: '4005',
    name: 'Descuento Inasistencia Pasante',
    type: 'DEDUCTION',
    calculationType: 'FORMULA',
    scope: 'INDIVIDUAL',
    noveltyDataType: 'CANTIDAD',
    formula: '([SU1001] / 30) * [CANTIDAD]',
    calculationOrder: 200,
    arcaConceptCode: '810000',
  };

  const conceptsWithCustomDeduction = [...allConcepts, conceptoDescuentoAusencia];
  const internWithNoveltyResult = calculateEmployeePayroll({
    employee: internEmployee,
    period,
    payrollSettings: internPayrollSettings,
    allConcepts: conceptsWithCustomDeduction,
    inputItems: [
      { conceptCode: '4005', units: 5, notes: '5 inasistencias injustificadas' },
    ],
    allMatrices: [],
    allFixedValues: [],
  });

  const itemDesc = internWithNoveltyResult.items.find((i) => i.conceptCode === '4005');
  const item1001Novelty = internWithNoveltyResult.items.find((i) => i.conceptCode === 'SU1001' || i.conceptCode === '1001');

  assert(item1001Novelty && item1001Novelty.amount === 400000, 'Concepto SU1001 permanece completo por 400.000 aún con novedades');
  assert(itemDesc !== undefined, 'Concepto de descuento 4005 debe liquidarse en el recibo');
  const expectedDesc = Math.round(((400000 / 30) * 5) * 100) / 100; // 66.666,67
  assertClose(itemDesc?.amount, expectedDesc, `Descuento por inasistencia de 5 días debe ser ${expectedDesc}`);
  const expectedNetoConDesc = Math.round((400000 - expectedDesc) * 100) / 100;
  assertClose(internWithNoveltyResult.totals.netSalary, expectedNetoConDesc, `Neto con descuento de inasistencia debe ser ${expectedNetoConDesc}`);

  // Test 7.3: Exclusión de Período SAC para Pasantes
  const sacPeriod = { year: 2026, month: 6, periodType: 'SAC_1', settlementNumber: 1 };
  const sacResult = calculateEmployeePayroll({
    employee: internEmployee,
    period: sacPeriod,
    payrollSettings: internPayrollSettings,
    allConcepts,
  });
  assert(sacResult.items.length === 0, 'Pasante no debe generar items en liquidación de período SAC');
  assert(sacResult.totals.netSalary === 0, 'Sueldo neto de pasante en período SAC debe ser 0');

  // Test 7.4: Exportación LSD Registro 03 y Registro 04 de Pasante
  const internSlipMock = {
    id: 'slip-intern-1',
    grossSalary: internResult.totals.grossSalary,
    netSalary: internResult.totals.netSalary,
    paymentDate: new Date('2026-07-05'),
    workedDays: 30,
    employee: internEmployee,
    basis: internResult.basis,
    items: internResult.items,
  };

  const lsdInternPayroll = generateLsdPayrollFile({
    paySlips: [internSlipMock],
    period,
    company: { cuit: '30712345678' },
  });

  assert(lsdInternPayroll.includes('0320421234567SU1001') || lsdInternPayroll.includes('03204212345671001'), 'LSD debe generar Registro 03 con el concepto SU1001 para el pasante');
  assert(lsdInternPayroll.includes('0420421234567'), 'LSD debe generar Registro 04 para el pasante');
  assert(lsdInternPayroll.includes('027'), 'LSD Registro 04 debe contener modalidad 027');

  // Test 7.5: Inmunidad frente a conceptos asignados residuales de código 1001 o remunerativos
  const internWithResidualAssigned = {
    ...internEmployee,
    assignedConcepts: [
      {
        id: 'ac-residual-1',
        amount: 85000,
        concept: {
          id: 'old-1001',
          code: '1001',
          name: 'Adicional fijo antiguo',
          type: 'REMUNERATIVE',
          deletedAt: new Date(),
          isActive: false,
        },
      },
    ],
  };

  const residualResult = calculateEmployeePayroll({
    employee: internWithResidualAssigned,
    period,
    payrollSettings: internPayrollSettings,
    allConcepts,
    allMatrices: [],
    allFixedValues: [],
  });

  const res1001 = residualResult.items.find((i) => i.conceptCode === 'SU1001' || i.conceptCode === '1001');
  assert(res1001 && res1001.amount === 400000, `Pasante debe ignorar residuo asignado de 85.000 y liquidar 400.000 (obtenido ${res1001?.amount})`);
  assert(residualResult.totals.totalRemunerative === 0, 'Pasante no debe computar concepto remunerativo residual');
  assert(residualResult.totals.totalRemunerative === 0, 'Pasante no debe computar concepto remunerativo residual');

  // ====================================================
  // 8. Módulo de Jornadas de Trabajo y Variables en Fórmulas
  // ====================================================
  console.log('\n--- 8. Módulo de Jornadas de Trabajo y Variables en Fórmulas ---');

  // Test 8.1: Validación de fórmulas con variables de jornada
  const valResult1 = validateConceptFormula({
    formula: 'REDONDEAR([SUELDO_BASICO_EMPLEADO] / [JORNADA_HORAS_MENSUALES], 2)',
    conceptCode: '1020',
    calculationOrder: 150,
  });
  assert(valResult1.isValid, 'Fórmula con [JORNADA_HORAS_MENSUALES] debe ser VÁLIDA');

  const valResult2 = validateConceptFormula({
    formula: 'REDONDEAR([SUELDO_BASICO_EMPLEADO] / [JORNADA_DIAS_MENSUALES], 2)',
    conceptCode: '1025',
    calculationOrder: 160,
  });
  assert(valResult2.isValid, 'Fórmula con [JORNADA_DIAS_MENSUALES] debe ser VÁLIDA');

  // Test 8.2: Liquidación de empleado con Jornada Nocturna 7hs asignada
  const nightShiftEmployee = {
    id: 'emp-night-1',
    fileNumber: 'N-001',
    cuil: '20334455667',
    lastName: 'Nocturno',
    firstName: 'Juan',
    basicSalary: 1000000,
    salaryScale: { amount: 1000000 },
    hireDate: new Date(2023, 0, 1),
    isPartTime: false,
    weeklyWorkingHours: 35,
    monthlyWorkingHours: 150,
    partTimePercentage: 100,
    workShift: {
      id: 'ws-noct-1',
      name: 'Jornada Nocturna 7hs',
      code: 'NOCT_7H',
      dailyHours: 7.00,
      weeklyHours: 35.00,
      monthlyHours: 150.00,
      monthlyDays: 21.00,
      cycleType: 'SEMANAL',
    },
    assignedConcepts: [],
  };

  const nightShiftConcepts = [
    {
      id: 'c-1000',
      code: '1000',
      name: 'Sueldo Básico',
      type: 'REMUNERATIVE',
      calculationType: 'FIXED',
      calculationOrder: 100,
      isPersistent: true,
      defaultValue: 1000000,
    },
    {
      id: 'c-1020',
      code: '1020',
      name: 'Valor Hora Nocturna (10hs extras)',
      type: 'REMUNERATIVE',
      calculationType: 'FORMULA',
      formula: 'REDONDEAR(([SUELDO_BASICO_EMPLEADO] / [JORNADA_HORAS_MENSUALES]) * 10 * 1.5, 2)',
      calculationOrder: 150,
      isPersistent: true,
    },
    {
      id: 'c-1025',
      code: '1025',
      name: 'Plus por Día Alterno Franco',
      type: 'NON_REMUNERATIVE',
      calculationType: 'FORMULA',
      formula: 'REDONDEAR([SUELDO_BASICO_EMPLEADO] / [JORNADA_DIAS_MENSUALES], 2)',
      calculationOrder: 160,
      isPersistent: true,
    },
  ];

  const nightResult = calculateEmployeePayroll({
    employee: nightShiftEmployee,
    period,
    payrollSettings: internPayrollSettings,
    allConcepts: nightShiftConcepts,
    allMatrices: [],
    allFixedValues: [],
  });

  const hourItem = nightResult.items.find((i) => i.conceptCode === '1020');
  // Valor hora = 1.000.000 / 150 = 6666.67. Con 10 hs al 50%: 6666.666... * 15 = 100000
  assert(hourItem && hourItem.amount === 100000, `Valor hora nocturna con [JORNADA_HORAS_MENSUALES] debe ser 100.000 (obtenido ${hourItem?.amount})`);

  const dayItem = nightResult.items.find((i) => i.conceptCode === '1025');
  // Valor día = 1.000.000 / 21 = 47619.05
  assert(dayItem && dayItem.amount === 47619.05, `Valor día con [JORNADA_DIAS_MENSUALES] debe ser 47.619,05 (obtenido ${dayItem?.amount})`);

  // Test 8.3: Fallback seguro para empleado sin jornada asignada
  const legacyEmployee = {
    id: 'emp-legacy-1',
    fileNumber: 'L-001',
    cuil: '20223344556',
    lastName: 'Tradicional',
    firstName: 'Pedro',
    basicSalary: 1200000,
    salaryScale: { amount: 1200000 },
    hireDate: new Date(2022, 0, 1),
    isPartTime: false,
    weeklyWorkingHours: 48,
    monthlyWorkingHours: 200,
    partTimePercentage: 100,
    workShift: null, // Sin jornada asignada
    assignedConcepts: [],
  };

  const legacyConcepts = [
    {
      id: 'c-legacy-basic',
      code: '1000',
      name: 'Sueldo Básico',
      type: 'REMUNERATIVE',
      calculationType: 'FIXED',
      calculationOrder: 100,
      isPersistent: true,
      defaultValue: 1200000,
    },
    {
      id: 'c-legacy-1',
      code: '1020',
      name: 'Valor Hora Estándar',
      type: 'REMUNERATIVE',
      calculationType: 'FORMULA',
      formula: 'REDONDEAR([SUELDO_BASICO_EMPLEADO] / [JORNADA_HORAS_MENSUALES], 2)',
      calculationOrder: 150,
      isPersistent: true,
    },
    {
      id: 'c-legacy-2',
      code: '1025',
      name: 'Valor Día Estándar',
      type: 'REMUNERATIVE',
      calculationType: 'FORMULA',
      formula: 'REDONDEAR([SUELDO_BASICO_EMPLEADO] / [JORNADA_DIAS_MENSUALES], 2)',
      calculationOrder: 160,
      isPersistent: true,
    },
  ];

  const legacyResult = calculateEmployeePayroll({
    employee: legacyEmployee,
    period,
    payrollSettings: internPayrollSettings,
    allConcepts: legacyConcepts,
    allMatrices: [],
    allFixedValues: [],
  });

  const legHour = legacyResult.items.find((i) => i.conceptCode === '1020');
  // Fallback mensual = 200 hs -> 1.200.000 / 200 = 6000
  assert(legHour && legHour.amount === 6000, `Fallback mensual sin jornada asignada debe ser 6000 (obtenido ${legHour?.amount})`);

  const legDay = legacyResult.items.find((i) => i.conceptCode === '1025');
  // Fallback días = 30 días -> 1.200.000 / 30 = 40000
  assert(legDay && legDay.amount === 40000, `Fallback días sin jornada asignada debe ser 40000 (obtenido ${legDay?.amount})`);
}

// ----------------------------------------------------
// 9. TOKENS DE NÓMINA [NOMINA:CODIGO], [VALOR_BASE] Y NOVEDAD [IMPORTE]
// ----------------------------------------------------
console.log('\n--- 9. Tokens de Nómina [NOMINA:CODIGO], [VALOR_BASE] y Novedad [IMPORTE] ---');

{
  const testSalaryScales = [
    { id: 'scale-mucama', code: 'MUC', name: 'Mucamas y Maestranza', basicSalary: 850000, isActive: true },
    { id: 'scale-recep', code: 'REC', name: 'Recepcionista Turno A', basicSalary: 920000, isActive: true },
    { id: 'scale-nocode', code: null, name: 'Operario Especializado', basicSalary: 780000, isActive: true },
  ];

  const baseConcepts = [
    {
      id: 'c-1000',
      code: '1000',
      name: 'Sueldo Básico',
      type: 'REMUNERATIVE',
      scope: 'GENERAL',
      calculationType: 'FIXED',
      defaultValue: 1000000,
      calculationOrder: 100,
      isPersistent: true,
    },
  ];

  // 9.1 Validador de fórmulas
  const formulaValScaleCode = validateConceptFormula({
    formula: '[NOMINA:MUC] * 0.15 + [VALOR_BASE]',
    currentConceptCode: '1080',
    type: 'REMUNERATIVE',
    allConcepts: baseConcepts,
    salaryScales: testSalaryScales,
  });
  assert(formulaValScaleCode.isValid === true, 'Fórmula con [NOMINA:MUC] y [VALOR_BASE] debe ser VÁLIDA');

  const formulaValScaleName = validateConceptFormula({
    formula: '[NOMINA:MUCAMAS_Y_MAESTRANZA] * 0.10',
    currentConceptCode: '1081',
    type: 'REMUNERATIVE',
    allConcepts: baseConcepts,
    salaryScales: testSalaryScales,
  });
  assert(formulaValScaleName.isValid === true, 'Fórmula con [NOMINA:NOMBRE_SANITIZADO] debe ser VÁLIDA');

  const formulaValImporte = validateConceptFormula({
    formula: '[IMPORTE] + [VALOR_BASE]',
    currentConceptCode: '1082',
    type: 'REMUNERATIVE',
    allConcepts: baseConcepts,
    salaryScales: testSalaryScales,
  });
  assert(formulaValImporte.isValid === true, 'Fórmula con [IMPORTE] y [VALOR_BASE] debe ser VÁLIDA');

  const formulaValInvalidScale = validateConceptFormula({
    formula: '[NOMINA:INEXISTENTE] * 1.1',
    currentConceptCode: '1083',
    type: 'REMUNERATIVE',
    allConcepts: baseConcepts,
    salaryScales: testSalaryScales,
  });
  assert(formulaValInvalidScale.warnings.length > 0, 'Fórmula con [NOMINA:INEXISTENTE] debe registrar advertencia');

  // 9.2 Liquidación con evaluación de [NOMINA:CODIGO], [VALOR_BASE] e [IMPORTE]
  const testSettings = {
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
    standardWeeklyHours: 48,
    standardMonthlyHours: 200,
  };
  const testPeriod = { year: 2026, month: 10, periodType: 'MENSUAL', settlementNumber: 1 };

  const employeeWithSalaryScale = {
    id: 'emp-scale-test',
    fileNumber: 'L-500',
    lastName: 'González',
    firstName: 'Martín',
    hireDate: new Date('2020-01-01'),
    status: 'ACTIVE',
    contractModalityCode: '001',
    salaryScaleId: 'scale-recep',
    partTimePercentage: 100,
  };

  const conceptNominaBase = {
    id: 'c-nom-base',
    code: '1080',
    name: 'Plus de Función Mucama',
    type: 'REMUNERATIVE',
    calculationType: 'FORMULA',
    formula: '[NOMINA:MUC] * 0.15 + [VALOR_BASE]',
    calculationOrder: 180,
    defaultValue: 25000,
    isPersistent: true,
  };

  const conceptImporteNovelty = {
    id: 'c-imp-nov',
    code: '1090',
    name: 'Bono Especial por Desempeño',
    type: 'NON_REMUNERATIVE',
    calculationType: 'FORMULA',
    formula: 'SI([IMPORTE] > 0, [IMPORTE], [VALOR_BASE])',
    calculationOrder: 190,
    defaultValue: 30000,
    noveltyDataType: 'IMPORTE',
    isPersistent: true,
  };

  const salaryScalePayrollResult = calculateEmployeePayroll({
    employee: employeeWithSalaryScale,
    period: testPeriod,
    payrollSettings: testSettings,
    allConcepts: [
      ...baseConcepts,
      conceptNominaBase,
      conceptImporteNovelty,
    ],
    inputItems: [
      { conceptCode: '1090', amount: 75000, notes: 'Bono extraordinario cargado en período' },
    ],
    allMatrices: [],
    allFixedValues: [],
    allSalaryScales: testSalaryScales,
  });

  const itemPlusMucama = salaryScalePayrollResult.items.find((i) => i.conceptCode === '1080');
  // [NOMINA:MUC] = 850000 * 0.15 = 127500 + [VALOR_BASE] (25000) = 152500
  assert(itemPlusMucama && itemPlusMucama.amount === 152500, `Plus con [NOMINA:MUC] y [VALOR_BASE] debe ser 152500 (obtenido ${itemPlusMucama?.amount})`);

  const itemBonoCargado = salaryScalePayrollResult.items.find((i) => i.conceptCode === '1090');
  assert(itemBonoCargado && itemBonoCargado.amount === 75000, `Concepto con [IMPORTE] con novedad debe ser 75000 (obtenido ${itemBonoCargado?.amount})`);

  // 9.3 Liquidación de concepto con [IMPORTE] sin novedad cargada (debe tomar [VALOR_BASE])
  const salaryScalePayrollWithoutNovResult = calculateEmployeePayroll({
    employee: employeeWithSalaryScale,
    period: testPeriod,
    payrollSettings: testSettings,
    allConcepts: [
      ...baseConcepts,
      conceptNominaBase,
      conceptImporteNovelty,
    ],
    inputItems: [],
    allMatrices: [],
    allFixedValues: [],
    allSalaryScales: testSalaryScales,
  });

  const itemBonoSinNovedad = salaryScalePayrollWithoutNovResult.items.find((i) => i.conceptCode === '1090');
  assert(itemBonoSinNovedad && itemBonoSinNovedad.amount === 30000, `Concepto con [IMPORTE] sin novedad debe tomar [VALOR_BASE] = 30000 (obtenido ${itemBonoSinNovedad?.amount})`);
}

// ====================================================
// 10. Régimen de Directores S.A. y Socios Gerentes (LRT Modalidad 099)
// ====================================================
console.log('\n--- 10. Régimen de Directores S.A. y Socios Gerentes (LRT Modalidad 099) ---');

{
  const period = {
    id: 'period-2026-06',
    year: 2026,
    month: 6,
    periodType: 'MONTHLY',
    settlementNumber: 1,
  };

  const allConcepts = [
    {
      id: 'c-1000',
      code: '1000',
      name: 'Sueldo Básico',
      type: 'REMUNERATIVE',
      scope: 'GENERAL',
      calculationType: 'FIXED',
      defaultValue: 1000000,
      isPersistent: true,
      periodType: 'ALL',
      arcaConceptCode: '110000',
      appliesSipaAporte: true,
      appliesSipaContrib: true,
    },
    {
      id: 'c-6001',
      code: '6001',
      name: 'Jubilación SIPA Ley 24.241',
      type: 'DEDUCTION',
      scope: 'GENERAL',
      calculationType: 'FORMULA',
      formula: '[TOTAL_REMUNERATIVO] * 0.11',
      isPersistent: true,
      periodType: 'ALL',
      arcaConceptCode: '810000',
    },
  ];

  const directorSalaryScale = {
    id: 'scale-dir-1',
    name: 'Directorio SA - Honorarios Base',
    amount: 1500000,
    isInternOnly: false,
    isDirectorOnly: true,
  };

  const directorEmployee = {
    id: 'emp-dir-1',
    fileNumber: 'DIR-001',
    cuil: '20223344556',
    lastName: 'Galperín',
    firstName: 'Marcos',
    contractModalityCode: '99',
    salaryScaleId: directorSalaryScale.id,
    salaryScale: directorSalaryScale,
    basicSalary: 1500000,
    hireDate: new Date(2020, 0, 1),
    isPartTime: false,
    weeklyWorkingHours: 40,
    monthlyWorkingHours: 160,
    partTimePercentage: 100,
    status: 'ACTIVE',
    jobPosition: {
      id: 'job-dir-1',
      name: 'Director Titular S.A.',
      code: 'DIR_TIT',
      activityCode: '015',
    },
    assignedConcepts: [],
  };

  const directorPayrollSettings = {
    sipaRate: 10.77,
    inssjypRate: 1.58,
    osRate: 6.00,
    fneRate: 0.94,
    aaffRate: 4.70,
    artRate: 3.50,
    artFixedFee: 850.00,
    scvoFee: 650.00,
    ansesMinCap: 82287.12,
    ansesMaxCap: 2674292.72,
    detractionBase: 7003.68,
  };

  const directorPayrollResult = calculateEmployeePayroll({
    employee: directorEmployee,
    period,
    payrollSettings: directorPayrollSettings,
    allConcepts,
    allMatrices: [],
    allFixedValues: [],
    allSalaryScales: [directorSalaryScale],
  });

  // Test 10.1: Conceptos liquidados
  const dirItem1000 = directorPayrollResult.items.find((i) => i.conceptCode === '1000' || i.conceptCode === 'SU1000');
  const dirItem1002 = directorPayrollResult.items.find((i) => i.conceptCode === 'SU1002' || i.conceptCode === '1002');
  assert(!dirItem1000, 'Director NO debe liquidar sueldo básico ordinario SU1000/1000');
  assert(dirItem1002, 'Director DEBE liquidar concepto SU1002 (Honorarios / Retribución Director S.A.)');
  assert(dirItem1002 && dirItem1002.amount === 1500000, `Honorarios SU1002 deben liquidarse por 1.500.000 (obtenido ${dirItem1002?.amount})`);

  // Test 10.2: Exención de deducciones personales (SIPA, INSSJyP, Obra Social, Sindicato)
  assert(directorPayrollResult.totals.totalDeductions === 0, `Deducciones de ley del director deben ser 0.00 (obtenido ${directorPayrollResult.totals.totalDeductions})`);
  assert(directorPayrollResult.totals.netSalary === 1500000, `Sueldo neto del director debe ser igual al bruto 1.500.000 (obtenido ${directorPayrollResult.totals.netSalary})`);

  // Test 10.3: Contribuciones patronales (SIPA, INSSJyP, Obra Social, FNE, AAFF = 0; ART = activa)
  assert(directorPayrollResult.totals.sipaContrib === 0, 'SIPA patronal del director debe ser 0');
  assert(directorPayrollResult.totals.inssjypContrib === 0, 'INSSJyP patronal del director debe ser 0');
  assert(directorPayrollResult.totals.osContrib === 0, 'Obra Social patronal del director debe ser 0 (a diferencia de pasantes)');
  assert(directorPayrollResult.totals.fneContrib === 0, 'FNE patronal del director debe ser 0');
  assert(directorPayrollResult.totals.aaffContrib === 0, 'AAFF patronal del director debe ser 0');
  // ART: 1.500.000 * 3.5% + 850 = 52.500 + 850 = 53.350
  assert(directorPayrollResult.totals.artContrib === 53350, `ART patronal del director debe ser 53.350 (obtenido ${directorPayrollResult.totals.artContrib})`);

  // Test 10.4: Bases Imponibles F.931 (LSD Registro 04)
  assert(directorPayrollResult.basis.baseImponible1 === 0, 'BI 1 SIPA Aportes debe ser 0');
  assert(directorPayrollResult.basis.baseImponible2 === 0, 'BI 2 SIPA Contribuciones debe ser 0');
  assert(directorPayrollResult.basis.baseImponible4 === 0, 'BI 4 Obra Social debe ser 0');
  assert(directorPayrollResult.basis.baseImponible8 === 0, 'BI 8 FSR debe ser 0');
  assert(directorPayrollResult.basis.baseImponible9 === 1500000, `BI 9 LRT debe ser 1.500.000 (obtenido ${directorPayrollResult.basis.baseImponible9})`);
  assert(directorPayrollResult.basis.baseImponible10 === 0, 'BI 10 SIPA con detracción debe ser 0');
  assert(directorPayrollResult.basis.contractModality === '099', `Modalidad contractual en F.931 debe ser '099' (obtenido ${directorPayrollResult.basis.contractModality})`);
  assert(directorPayrollResult.basis.activityCode === '015', `Actividad ARCA en F.931 debe ser '015' (obtenido ${directorPayrollResult.basis.activityCode})`);
  assert(directorPayrollResult.basis.hasCct === false, 'Director debe tener hasCct = false (fuera de convenio)');

  // Test 10.5: Exclusión de período SAC
  const sacPeriod = { year: 2026, month: 6, periodType: 'SAC_1', settlementNumber: 1 };
  const directorSacResult = calculateEmployeePayroll({
    employee: directorEmployee,
    period: sacPeriod,
    payrollSettings: directorPayrollSettings,
    allConcepts,
    allMatrices: [],
    allFixedValues: [],
  });
  assert(directorSacResult.items.length === 0, 'Director no debe generar items en liquidación de período SAC');
  assert(directorSacResult.totals.netSalary === 0, 'Sueldo neto de director en período SAC debe ser 0');

  // Test 10.6: Exportación a archivo plano Libro de Sueldos Digital (LSD)
  const directorSlipMock = {
    id: 'slip-dir-1',
    payrollPeriodId: 'period-monthly-1',
    employeeId: directorEmployee.id,
    grossSalary: directorPayrollResult.totals.grossSalary,
    netSalary: directorPayrollResult.totals.netSalary,
    totalDeductions: directorPayrollResult.totals.totalDeductions,
    workedDays: 30,
    workedHours: 160,
    employee: directorEmployee,
    items: directorPayrollResult.items,
    basis: directorPayrollResult.basis,
  };

  const lsdDirectorPayroll = generateLsdPayrollFile({
    paySlips: [directorSlipMock],
    period,
    company: { cuit: '30712345678' },
  });

  assert(lsdDirectorPayroll.includes('0320223344556SU1002') || lsdDirectorPayroll.includes('03202233445561002'), 'LSD debe generar Registro 03 con concepto SU1002 para el director');
  assert(lsdDirectorPayroll.includes('0420223344556'), 'LSD debe generar Registro 04 para el director');
  assert(lsdDirectorPayroll.includes('099'), 'LSD Registro 04 debe contener modalidad 099');
  assert(lsdDirectorPayroll.includes('015'), 'LSD Registro 04 debe contener actividad 015');

  // Test 10.7: Validador de consistencia LSD
  const lsdConsistencyResult = validateLsdConsistency({ paySlips: [directorSlipMock] });
  assert(lsdConsistencyResult.isValid, `Validación técnica LSD para Director debe ser válida (errores: ${JSON.stringify(lsdConsistencyResult.issues)})`);
}

// ====================================================
// 11. Aislamiento y Consistencia de Fórmulas Base (SU1000 vs SU1002 / SU1001)
// ====================================================
console.log('\n--- 11. Aislamiento y Consistencia de Fórmulas Base (SU1000 vs SU1002 / SU1001) ---');

{
  const consistencyPeriod = {
    id: 'period-2026-10-cons',
    year: 2026,
    month: 10,
    periodType: 'MONTHLY',
    settlementNumber: 1,
  };

  const matrizAntig = {
    id: 'mat-antig-test',
    code: 'ANTIG',
    name: 'Antigüedad 2%',
    inputConceptCode: 'ANTIGUEDAD_ANOS',
    matchType: 'RANGE',
    defaultValue: 0,
    rows: JSON.stringify([
      { from: 0, to: 0.99, value: 0 },
      { from: 1, to: 99, value: 10 },
    ]),
  };

  const consistencyConcepts = [
    {
      id: 'c-su1000',
      code: 'SU1000',
      name: 'Sueldo Básico',
      type: 'REMUNERATIVE',
      scope: 'GENERAL',
      calculationType: 'FIXED',
      defaultValue: 1000000,
      calculationOrder: 100,
      isPersistent: true,
      arcaConceptCode: '110000',
    },
    {
      id: 'c-su1002',
      code: 'SU1002',
      name: 'Honorarios Director S.A.',
      type: 'REMUNERATIVE',
      scope: 'GENERAL',
      calculationType: 'FIXED',
      defaultValue: 3500000,
      calculationOrder: 100,
      isPersistent: true,
      arcaConceptCode: '110000',
    },
    {
      id: 'c-su1010',
      code: 'SU1010',
      name: 'Antigüedad (2% por año)',
      type: 'REMUNERATIVE',
      scope: 'GENERAL',
      calculationType: 'FORMULA',
      formula: '[SU1000] * [MATRIZ:ANTIG] / 100',
      calculationOrder: 110,
      isPersistent: true,
      arcaConceptCode: '120000',
    },
  ];

  // 11.1 Empleado regular: SU1010 usa SU1000 y asigna baseAmount = 1000000
  const regularEmployee = {
    id: 'emp-reg-cons',
    fileNumber: 'L-100',
    contractModalityCode: '001',
    basicSalary: 1000000,
    hireDate: new Date('2020-01-01'),
    jobPosition: { categoryCode: 'A' },
  };

  const regRes = calculateEmployeePayroll({
    employee: regularEmployee,
    period: consistencyPeriod,
    payrollSettings: { ansesMinCap: 80000, ansesMaxCap: 2000000 },
    allConcepts: consistencyConcepts,
    allMatrices: [matrizAntig],
  });

  const regSu1010 = regRes.items.find((i) => i.conceptCode === 'SU1010');
  assert(regSu1010 !== undefined, 'Empleado estándar debe liquidar SU1010');
  assert(regSu1010 && regSu1010.amount === 100000, 'SU1010 debe liquidar 10% sobre 1.000.000 (100.000)');
  assert(regSu1010 && regSu1010.baseAmount === 1000000, `baseAmount de SU1010 debe ser 1.000.000 (obtenido ${regSu1010?.baseAmount})`);

  // 11.2 Director (Mod. 099): SU1010 NO se liquida y jamás usa honorarios como base
  const directorEmployee = {
    id: 'emp-dir-cons',
    fileNumber: '569',
    contractModalityCode: '99',
    basicSalary: 3500000,
    hireDate: new Date('2011-01-01'),
  };

  const dirRes = calculateEmployeePayroll({
    employee: directorEmployee,
    period: consistencyPeriod,
    payrollSettings: { ansesMinCap: 80000, ansesMaxCap: 2000000 },
    allConcepts: consistencyConcepts,
    allMatrices: [matrizAntig],
  });

  const dirSu1010 = dirRes.items.find((i) => i.conceptCode === 'SU1010');
  const dirSu1002 = dirRes.items.find((i) => i.conceptCode === 'SU1002');
  assert(!dirSu1010, 'Director NO debe liquidar SU1010 (Antigüedad CCT)');
  assert(dirSu1002 && dirSu1002.amount === 3500000, 'Director debe liquidar SU1002 por 3.500.000');

  // 11.3 Evaluación forzada de la fórmula con [SU1000] en contexto de Director evalúa a 0
  const evalForced = evaluateFormula('[SU1000] * 10 / 100', { SU1000: 0, SU1002: 3500000 });
  assert(evalForced === 0, `Fórmula que referencia [SU1000] en contexto de director debe evaluar a 0 (obtenido ${evalForced})`);

  // 11.4 Helper resolveItemBaseAmount aísla modalidades
  const baseReg = resolveItemBaseAmount(consistencyConcepts[2], { SU1000: 1000000, SU1002: 0 }, false, false, false);
  const baseDir = resolveItemBaseAmount(consistencyConcepts[2], { SU1000: 0, SU1002: 3500000 }, false, false, false);
  assert(baseReg === 1000000, `resolveItemBaseAmount debe retornar 1000000 para regular (obtenido ${baseReg})`);
  assert(baseDir === null, `resolveItemBaseAmount debe retornar null para director (obtenido ${baseDir})`);

  // 11.5 Auditoría de catálogo
  const audit = auditFormulaCatalogConsistency({ allConcepts: consistencyConcepts, matrices: [matrizAntig] });
  assert(audit.isValid, 'Auditoría de catálogo con SU1010 debe ser válida');
}

// ==========================================
// 12. PRUEBAS DE FUNCIONES Y VARIABLES DE FECHA
// ==========================================
console.log('\n--- 12. PRUEBAS DE FUNCIONES Y VARIABLES DE FECHA ---');

// 12.1 DIF_DIAS con fechas literales (formato ISO y es-AR)
const d1 = evaluateFormula("DIF_DIAS('2026-01-01', '2026-01-10')");
assert(d1 === 9, `DIF_DIAS('2026-01-01', '2026-01-10') debe ser 9 (obtenido ${d1})`);

const d1Inc = evaluateFormula("DIF_DIAS('2026-01-01', '2026-01-10', true)");
assert(d1Inc === 10, `DIF_DIAS inclusivo debe ser 10 (obtenido ${d1Inc})`);

const d1EsAr = evaluateFormula("DIF_DIAS('01/01/2026', '10/01/2026')");
assert(d1EsAr === 9, `DIF_DIAS con DD/MM/YYYY debe ser 9 (obtenido ${d1EsAr})`);

// 12.2 Validación de fechas invertidas / negativas (retorna 0 por acuerdo normativo)
const dNeg = evaluateFormula("DIF_DIAS('2026-05-01', '2026-01-01')");
assert(dNeg === 0, `DIF_DIAS con fecha desde posterior a fecha hasta debe ser 0 (obtenido ${dNeg})`);

// 12.3 DIF_MESES y DIF_ANIOS
const dMeses = evaluateFormula("DIF_MESES('2026-01-01', '2026-07-01')");
assert(dMeses === 6, `DIF_MESES('2026-01-01', '2026-07-01') debe ser 6 (obtenido ${dMeses})`);

const dMesesFrac = evaluateFormula("DIF_MESES('2026-01-15', '2026-07-01')");
assert(dMesesFrac === 5, `DIF_MESES('2026-01-15', '2026-07-01') debe ser 5 (obtenido ${dMesesFrac})`);

const dAnios = evaluateFormula("DIF_ANIOS('2020-03-01', '2026-03-01')");
assert(dAnios === 6, `DIF_ANIOS('2020-03-01', '2026-03-01') debe ser 6 (obtenido ${dAnios})`);

const dAniosIncomp = evaluateFormula("DIF_ANIOS('2020-05-01', '2026-03-01')");
assert(dAniosIncomp === 5, `DIF_ANIOS('2020-05-01', '2026-03-01') debe ser 5 (obtenido ${dAniosIncomp})`);

// 12.4 DIF_FECHA función unificada
const dFechaDias = evaluateFormula("DIF_FECHA('2026-01-01', '2026-01-20', 'DIAS')");
assert(dFechaDias === 19, `DIF_FECHA DIAS debe ser 19 (obtenido ${dFechaDias})`);

const dFechaMeses = evaluateFormula("DIF_FECHA('2026-01-01', '2026-07-01', 'MESES')");
assert(dFechaMeses === 6, `DIF_FECHA MESES debe ser 6 (obtenido ${dFechaMeses})`);

const dFechaAnios = evaluateFormula("DIF_FECHA('2020-01-01', '2026-01-01', 'ANIOS')");
assert(dFechaAnios === 6, `DIF_FECHA ANIOS debe ser 6 (obtenido ${dFechaAnios})`);

// 12.5 Variables de contexto de liquidación y colaborador
const dateCtx = {
  FECHA_INGRESO: '2024-03-15',
  FECHA_LIQUIDACION: '2026-09-30',
  INICIO_SEMESTRE: '2026-07-01',
  INICIO_SEMESTRE_1: '2026-01-01',
  INICIO_SEMESTRE_2: '2026-07-01',
  FIN_SEMESTRE: '2026-12-31',
};

const dCtxDias = evaluateFormula("DIF_DIAS([INICIO_SEMESTRE], [FECHA_LIQUIDACION])", dateCtx);
assert(dCtxDias === 91, `DIF_DIAS de inicio de semestre (01/07) a liquidación (30/09) debe ser 91 (obtenido ${dCtxDias})`);

const dCtxAnios = evaluateFormula("DIF_ANIOS([FECHA_INGRESO], [FECHA_LIQUIDACION])", dateCtx);
assert(dCtxAnios === 2, `DIF_ANIOS de ingreso (15/03/2024) a liquidación (30/09/2026) debe ser 2 (obtenido ${dCtxAnios})`);

// 12.6 Condicional comparando fechas (Cálculo real de días para SAC Proporcional)
// Empleado que ingresó antes del semestre (antiguo): toma días desde el inicio del semestre
const sacAntiguo = evaluateFormula(
  "SI([FECHA_INGRESO] > [INICIO_SEMESTRE], DIF_DIAS([FECHA_INGRESO], [FECHA_LIQUIDACION], true), DIF_DIAS([INICIO_SEMESTRE], [FECHA_LIQUIDACION], true))",
  dateCtx
);
assert(sacAntiguo === 92, `SAC de empleado antiguo debe computar días desde INICIO_SEMESTRE inclusive (92 días, obtenido ${sacAntiguo})`);

// Empleado que ingresó durante el semestre (nuevo ingreso el 15/08/2026)
const dateCtxNuevo = {
  ...dateCtx,
  FECHA_INGRESO: '2026-08-15',
};
const sacNuevo = evaluateFormula(
  "SI([FECHA_INGRESO] > [INICIO_SEMESTRE], DIF_DIAS([FECHA_INGRESO], [FECHA_LIQUIDACION], true), DIF_DIAS([INICIO_SEMESTRE], [FECHA_LIQUIDACION], true))",
  dateCtxNuevo
);
assert(sacNuevo === 47, `SAC de nuevo ingreso (15/08 al 30/09) debe computar 47 días trabajados inclusive (obtenido ${sacNuevo})`);

// ----------------------------------------------------
// 13. PRUEBAS DE MÉTRICAS HISTÓRICAS CON RECIBOS DEL MISMO MES Y SEMESTRE
// ----------------------------------------------------
console.log('\n--- 13. Métricas Históricas en Mismo Mes y Semestre (Liquidaciones Finales / SAC) ---');

{
  const finalPeriod = { id: 'period-final-1', year: 2026, month: 9, periodType: 'FINAL' };
  const slipsHistory = [
    // Recibo mensual ordinario previo en el MISMO mes (Septiembre 2026)
    {
      payrollPeriodId: 'period-monthly-sept',
      payrollPeriod: { id: 'period-monthly-sept', year: 2026, month: 9, periodType: 'MONTHLY' },
      remunerativeSalary: 1790000,
      grossSalary: 1870000,
      items: [
        { conceptCode: 'SU1000', amount: 1500000, type: 'REMUNERATIVE' },
        { conceptCode: 'SU1010', amount: 120000, type: 'REMUNERATIVE' },
        { conceptCode: 'SU1020', amount: 85000, type: 'REMUNERATIVE' },
        { conceptCode: 'SU1001', amount: 85000, type: 'REMUNERATIVE' },
      ],
    },
    // Recibo de mes anterior (Agosto 2026)
    {
      payrollPeriodId: 'period-monthly-aug',
      payrollPeriod: { id: 'period-monthly-aug', year: 2026, month: 8, periodType: 'MONTHLY' },
      remunerativeSalary: 1600000,
      grossSalary: 1680000,
      items: [{ conceptCode: 'SU1000', amount: 1500000, type: 'REMUNERATIVE' }],
    },
    // Recibo de primer semestre (Mayo 2026 - No debe entrar a MEJOR_SEMESTRE del segundo semestre)
    {
      payrollPeriodId: 'period-monthly-may',
      payrollPeriod: { id: 'period-monthly-may', year: 2026, month: 5, periodType: 'MONTHLY' },
      remunerativeSalary: 2500000,
      grossSalary: 2500000,
      items: [{ conceptCode: 'SU1000', amount: 2500000, type: 'REMUNERATIVE' }],
    },
  ];

  // En la liquidación final actual, TOTAL_REMUNERATIVO aún es 0
  const finalContext = {
    CURRENT_PERIOD: finalPeriod,
    TOTAL_REMUNERATIVO: 0,
    historicalData: { slips: slipsHistory },
    FECHA_LIQUIDACION: '2026-09-18',
    INICIO_SEMESTRE: '2026-07-01',
  };

  // 13.1 MEJOR_6M debe incluir el recibo mensual del mismo mes (1.790.000)
  const mejor6m = resolveHistoricalMetric('MEJOR_6M', 'TOTAL_REMUNERATIVO', finalContext);
  assert(mejor6m === 2500000, `MEJOR_6M ventana móvil de 6 meses debe tomar 2.500.000 de mayo (obtenido ${mejor6m})`);

  // 13.2 MEJOR_SEMESTRE debe restringirse al segundo semestre (descartando mayo) y tomar septiembre (1.790.000)
  const mejorSemestre = resolveHistoricalMetric('MEJOR_SEMESTRE', 'TOTAL_REMUNERATIVO', finalContext);
  assert(mejorSemestre === 1790000, `MEJOR_SEMESTRE debe tomar 1.790.000 de septiembre descartando mayo (obtenido ${mejorSemestre})`);

  // 13.3 Fórmula FI1001 evaluada como expresión completa
  const fi1001Val = evaluateFormula('[MEJOR_SEMESTRE:TOTAL_REMUNERATIVO]', finalContext, { slips: slipsHistory });
  assert(fi1001Val === 1790000, `FI1001 con MEJOR_SEMESTRE debe evaluar a 1.790.000 (obtenido ${fi1001Val})`);

  // 13.4 Fórmula FI1010 S.A.C. Proporcional: [FI1001] * DIF_DIAS([FECHA_LIQUIDACION], [INICIO_SEMESTRE], true) / 180
  const fiContextWithBase = {
    ...finalContext,
    FI1001: 1790000,
  };
  const fi1010Val = evaluateFormula(
    '[FI1001] * DIF_DIAS([INICIO_SEMESTRE], [FECHA_LIQUIDACION], true) / 180',
    fiContextWithBase,
    { slips: slipsHistory }
  );
  // Días corridos del 01/07 al 18/09 inclusive = 80 días. 1.790.000 * 80 / 180 = 795555.555... -> 795555.56
  assert(Math.abs(fi1010Val - 795555.56) < 1, `FI1010 SAC Proporcional debe dar ~795555.56 (obtenido ${fi1010Val})`);
}

// ----------------------------------------------------
// 14. MÉTRICAS HISTÓRICAS ORDINARIAS / HABITUALES (_ORD)
// (Exclusión estricta de SAC, Vacaciones y Liquidaciones Finales)
// ----------------------------------------------------
console.log('\n--- 14. Métricas Históricas Ordinarias / Habituales (_ORD) ---');

{
  // Historial con liquidaciones mixtas en el primer semestre 2026:
  // Mes 1 (01/2026): Mensual ordinario 1.000.000
  // Mes 2 (02/2026): Mensual ordinario 1.000.000 + Período de Vacaciones 400.000
  // Mes 3 (03/2026): Mensual ordinario con plus vacacional incluido: Total 1.050.000 (1.000.000 ordinario + 50.000 plus VA1000)
  // Mes 4 (04/2026): Mensual ordinario 1.100.000 + horas extras 1050 por 100.000
  // Mes 5 (05/2026): Mensual ordinario 1.200.000
  // Mes 6 (06/2026): Mensual ordinario 1.300.000 + Período SAC_1 por 650.000
  const slipsHistoryOrd = [
    // 06/2026 SAC (Debe excluirse en _ORD)
    {
      payrollPeriodId: 'p-sac-2026-06',
      payrollPeriod: { year: 2026, month: 6, periodType: 'SAC_1' },
      remunerativeSalary: 650000,
      grossSalary: 650000,
      items: [{ conceptCode: 'SA1000', amount: 650000, type: 'REMUNERATIVE' }],
    },
    // 06/2026 Mensual Ordinario (Debe incluirse en _ORD)
    {
      payrollPeriodId: 'p-m-2026-06',
      payrollPeriod: { year: 2026, month: 6, periodType: 'MONTHLY' },
      remunerativeSalary: 1300000,
      grossSalary: 1300000,
      items: [{ conceptCode: 'SU1000', amount: 1300000, type: 'REMUNERATIVE' }],
    },
    // 05/2026 Mensual Ordinario
    {
      payrollPeriodId: 'p-m-2026-05',
      payrollPeriod: { year: 2026, month: 5, periodType: 'MONTHLY' },
      remunerativeSalary: 1200000,
      grossSalary: 1200000,
      items: [{ conceptCode: 'SU1000', amount: 1200000, type: 'REMUNERATIVE' }],
    },
    // 04/2026 Mensual Ordinario con horas extras
    {
      payrollPeriodId: 'p-m-2026-04',
      payrollPeriod: { year: 2026, month: 4, periodType: 'MONTHLY' },
      remunerativeSalary: 1200000,
      grossSalary: 1200000,
      items: [
        { conceptCode: 'SU1000', amount: 1100000, type: 'REMUNERATIVE' },
        { conceptCode: '1050', amount: 100000, type: 'REMUNERATIVE' },
      ],
    },
    // 03/2026 Mensual Ordinario con ítem de vacaciones VA1000 dentro del mismo recibo
    {
      payrollPeriodId: 'p-m-2026-03',
      payrollPeriod: { year: 2026, month: 3, periodType: 'MONTHLY' },
      remunerativeSalary: 1050000, // 1.000.000 sueldo + 50.000 plus vacacional
      grossSalary: 1050000,
      items: [
        { conceptCode: 'SU1000', amount: 1000000, type: 'REMUNERATIVE' },
        { conceptCode: 'VA1000', amount: 50000, type: 'REMUNERATIVE' },
      ],
    },
    // 02/2026 Vacaciones separadas (Debe excluirse en _ORD)
    {
      payrollPeriodId: 'p-vac-2026-02',
      payrollPeriod: { year: 2026, month: 2, periodType: 'VACATIONS' },
      remunerativeSalary: 400000,
      grossSalary: 400000,
      items: [{ conceptCode: 'VA1000', amount: 400000, type: 'REMUNERATIVE' }],
    },
    // 02/2026 Mensual Ordinario
    {
      payrollPeriodId: 'p-m-2026-02',
      payrollPeriod: { year: 2026, month: 2, periodType: 'MONTHLY' },
      remunerativeSalary: 1000000,
      grossSalary: 1000000,
      items: [{ conceptCode: 'SU1000', amount: 1000000, type: 'REMUNERATIVE' }],
    },
    // 01/2026 Mensual Ordinario
    {
      payrollPeriodId: 'p-m-2026-01',
      payrollPeriod: { year: 2026, month: 1, periodType: 'MONTHLY' },
      remunerativeSalary: 1000000,
      grossSalary: 1000000,
      items: [{ conceptCode: 'SU1000', amount: 1000000, type: 'REMUNERATIVE' }],
    },
  ];

  // Supongamos que estamos liquidando el mes 7/2026 (Mensual Ordinario) con básico 1.400.000
  const currentPeriodM7 = { id: 'p-m-2026-07', year: 2026, month: 7, periodType: 'MONTHLY' };
  const contextM7 = {
    CURRENT_PERIOD: currentPeriodM7,
    TOTAL_REMUNERATIVO: 1400000,
    historicalData: { slips: slipsHistoryOrd },
  };

  // 14.1 ACUM_6M estándar vs ACUM_6M_ORD
  // Meses anteriores ventana 6M (01 a 06 de 2026):
  // Sin _ORD: suma todo incluyendo SAC (650k) y Vacaciones separadas (400k) y plus VA1000 (50k) + actual (1400k)
  // Con _ORD: descarta SAC (650k), descarta Vacaciones separadas (400k) y descuenta plus vacacional (50k).
  // Meses ordinarios:
  // 07/2026 (actual): 1.400.000
  // 06/2026: 1.300.000 (descarta 650k SAC)
  // 05/2026: 1.200.000
  // 04/2026: 1.200.000
  // 03/2026: 1.000.000 (1050k - 50k VA1000)
  // 02/2026: 1.000.000 (descarta 400k Vacaciones)
  // Suma 6M ordinaria (con actual: meses 2, 3, 4, 5, 6, 7):
  // 1.000.000 + 1.000.000 + 1.200.000 + 1.200.000 + 1.300.000 + 1.400.000 = 7.100.000
  const acum6mOrd = resolveHistoricalMetric('ACUM_6M_ORD', 'TOTAL_REMUNERATIVO', contextM7);
  assert(acum6mOrd === 7100000, `ACUM_6M_ORD debe ser 7.100.000 excluyendo SAC y Vacaciones (obtenido ${acum6mOrd})`);

  // 14.2 ACUM_6M_ANT_ORD (6 meses anteriores cerrados: meses 1, 2, 3, 4, 5, 6):
  // 1.000.000 + 1.000.000 + 1.000.000 + 1.200.000 + 1.200.000 + 1.300.000 = 6.700.000
  const acum6mAntOrd = resolveHistoricalMetric('ACUM_6M_ANT_ORD', 'TOTAL_REMUNERATIVO', contextM7);
  assert(acum6mAntOrd === 6700000, `ACUM_6M_ANT_ORD debe ser 6.700.000 (obtenido ${acum6mAntOrd})`);

  // 14.3 MEJOR_12M_ORD (Base Art. 245 LCT / MMNyH)
  // En los meses previos el mayor mensual fue 1.300.000 (en 06/2026 el bruto fue 1.300k + 650k = 1.950k, pero MMNyH es 1.300k, y con actual es 1.400k)
  const mejor12mOrd = resolveHistoricalMetric('MEJOR_12M_ORD', 'TOTAL_REMUNERATIVO', contextM7);
  assert(mejor12mOrd === 1400000, `MEJOR_12M_ORD con mes actual debe ser 1.400.000 (obtenido ${mejor12mOrd})`);

  const mejor12mAntOrd = resolveHistoricalMetric('MEJOR_12M_ANT_ORD', 'TOTAL_REMUNERATIVO', contextM7);
  assert(mejor12mAntOrd === 1300000, `MEJOR_12M_ANT_ORD sin mes actual debe ser 1.300.000 descartando los 1.950.000 con SAC (obtenido ${mejor12mAntOrd})`);

  // 14.4 PROM_6M_ORD (Promedio 6 meses ordinarios con actual): 7.100.000 / 6 = 1.183.333,33
  const prom6mOrd = resolveHistoricalMetric('PROM_6M_ORD', 'TOTAL_REMUNERATIVO', contextM7);
  assert(Math.abs(prom6mOrd - 1183333.33) < 1, `PROM_6M_ORD debe ser 1.183.333,33 (obtenido ${prom6mOrd})`);

  // 14.5 Fallback por defecto a TOTAL_REMUNERATIVO si no se especifica segundo argumento
  const acumSinTarget = resolveHistoricalMetric('ACUM_6M_ORD', null, contextM7);
  assert(acumSinTarget === 7100000, `ACUM_6M_ORD sin target debe inferir TOTAL_REMUNERATIVO y dar 7.100.000 (obtenido ${acumSinTarget})`);

  // 14.6 Sustitución y evaluación en formulaEvaluator
  const formulaExpr1 = '[MEJOR_12M_ORD:TOTAL_REMUNERATIVO] * 0.5';
  const valFormula1 = evaluateFormula(formulaExpr1, contextM7, { slips: slipsHistoryOrd });
  assert(valFormula1 === 700000, `Fórmula con [MEJOR_12M_ORD:TOTAL_REMUNERATIVO] debe ser 700.000 (obtenido ${valFormula1})`);

  const formulaExpr2 = '[ACUM_6M_ORD] / 2';
  const valFormula2 = evaluateFormula(formulaExpr2, contextM7, { slips: slipsHistoryOrd });
  assert(valFormula2 === 3550000, `Fórmula con [ACUM_6M_ORD] directo debe ser 3.550.000 (obtenido ${valFormula2})`);

  // 14.7 Validación sintáctica de fórmulas con nuevos tokens
  const sampleConcepts = [
    { code: 'SU1000', calculationOrder: 10, type: 'REMUNERATIVE' },
    { code: 'SU1050', calculationOrder: 20, type: 'REMUNERATIVE' },
    { code: 'FI1001', calculationOrder: 10, type: 'REMUNERATIVE' },
  ];

  const valRes1 = validateConceptFormula({
    formula: '[MEJOR_12M_ORD:TOTAL_REMUNERATIVO]',
    currentConceptCode: 'FI1001',
    type: 'REMUNERATIVE',
    allConcepts: sampleConcepts,
  });
  assert(valRes1.isValid === true, `Fórmula con [MEJOR_12M_ORD:TOTAL_REMUNERATIVO] debe ser válida (errores: ${valRes1.errors.join(', ')})`);

  const valRes2 = validateConceptFormula({
    formula: '[PROM_6M_ORD:SU1050] + [ACUM_6M_ORD]',
    currentConceptCode: 'SU1000',
    type: 'REMUNERATIVE',
    allConcepts: sampleConcepts,
  });
  assert(valRes2.isValid === true, `Fórmula con [PROM_6M_ORD:SU1050] + [ACUM_6M_ORD] debe ser válida (errores: ${valRes2.errors.join(', ')})`);
}

console.log('\n====================================================');
console.log(`RESULTADOS: ${passedTests} superadas, ${failedTests} fallidas`);
console.log('====================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('✓ TODAS LAS PRUEBAS DEL MOTOR DE FÓRMULAS FINALIZARON CON ÉXITO.');
}
