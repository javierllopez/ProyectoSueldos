import { evaluateFormula, resolveHistoricalMetric } from './src/modules/payroll/formulaEvaluator.js';
import { validateConceptFormula } from './src/modules/payroll/formulaValidator.js';
import { calculateEmployeePayroll } from './src/modules/payroll/payroll.calculator.js';
import { generateLsdConceptsFile, generateLsdPayrollFile } from './src/modules/payroll/lsdExporter.service.js';

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

  const item1000 = internResult.items.find((i) => i.conceptCode === '1000');
  const item1001 = internResult.items.find((i) => i.conceptCode === '1001');

  assert(!item1000, 'Pasante NO debe liquidar concepto 1000 (Sueldo Básico)');
  assert(item1001 !== undefined, 'Pasante DEBE liquidar concepto 1001 (Asignación Estímulo Ley 26.427)');
  assert(item1001 && item1001.amount === 400000, `Concepto 1001 debe liquidarse completo por 400.000 (obtenido ${item1001?.amount})`);
  assert(item1001 && item1001.type === 'NON_REMUNERATIVE', 'Concepto 1001 debe ser de tipo NON_REMUNERATIVE');
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
    formula: '([1001] / 30) * [CANTIDAD]',
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
  const item1001Novelty = internWithNoveltyResult.items.find((i) => i.conceptCode === '1001');

  assert(item1001Novelty && item1001Novelty.amount === 400000, 'Concepto 1001 permanece completo por 400.000 aún con novedades');
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

  assert(lsdInternPayroll.includes('03204212345671001'), 'LSD debe generar Registro 03 con el concepto 1001 para el pasante');
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

  const res1001 = residualResult.items.find((i) => i.conceptCode === '1001');
  assert(res1001 && res1001.amount === 400000, `Pasante debe ignorar residuo asignado de 85.000 y liquidar 400.000 (obtenido ${res1001?.amount})`);
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

console.log('\n====================================================');
console.log(`RESULTADOS: ${passedTests} superadas, ${failedTests} fallidas`);
console.log('====================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('✓ TODAS LAS PRUEBAS DEL MOTOR DE FÓRMULAS FINALIZARON CON ÉXITO.');
}
