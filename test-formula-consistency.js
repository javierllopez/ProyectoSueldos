/**
 * test-formula-consistency.js
 * Suite integral de pruebas para consistencia y aislamiento de fórmulas de liquidación.
 * Verifica que SU1010 use estrictamente SU1000 como base, evitando contaminación cruzada
 * con SU1002 (Director) o SU1001 (Pasante), y valida el comportamiento frente a diacríticos y auditoría de catálogo.
 */

import { calculateEmployeePayroll, resolveItemBaseAmount } from './src/modules/payroll/payroll.calculator.js';
import { validateConceptFormula, auditFormulaCatalogConsistency } from './src/modules/payroll/formulaValidator.js';
import { evaluateFormula } from './src/modules/payroll/formulaEvaluator.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ FALLÓ: ${message}`);
    failed++;
    throw new Error(message);
  } else {
    console.log(`  ✓ ${message}`);
    passed++;
  }
}

function assertClose(actual, expected, message, tolerance = 0.05) {
  const diff = Math.abs(Number(actual) - Number(expected));
  if (diff > tolerance) {
    console.error(`  ✗ FALLÓ: ${message} (Esperado: ${expected}, Obtenido: ${actual})`);
    failed++;
    throw new Error(message);
  } else {
    console.log(`  ✓ ${message}`);
    passed++;
  }
}

console.log('====================================================');
console.log('SUITE DE CONSISTENCIA Y AISLAMIENTO DE FÓRMULAS');
console.log('====================================================\n');

// ----------------------------------------------------
// 1. Configuración de Modelos y Catálogos Salariales
// ----------------------------------------------------
const payrollSettings = {
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
  standardWeeklyHours: 48,
  standardMonthlyHours: 200,
};

const period = {
  id: 'period-2026-10',
  year: 2026,
  month: 10,
  periodType: 'MONTHLY',
  settlementNumber: 1,
};

// Matriz de Antigüedad: 1 a 4 años = 5%, 5 a 9 años = 10%, 10 a 14 años = 20%, 15+ años = 30%
const matrizAntig = {
  id: 'mat-antig-1',
  code: 'ANTIG',
  name: 'Escala Antigüedad CCT',
  inputConceptCode: 'ANTIGUEDAD_ANOS',
  matchType: 'RANGE',
  defaultValue: 0,
  rows: JSON.stringify([
    { from: 0, to: 0.99, value: 0 },
    { from: 1, to: 4.99, value: 5 },
    { from: 5, to: 9.99, value: 10 },
    { from: 10, to: 14.99, value: 20 },
    { from: 15, to: 99, value: 30 },
  ]),
};

const allConcepts = [
  {
    id: 'c-1000',
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
    id: 'c-1001',
    code: 'SU1001',
    name: 'Asignación Estímulo Ley 26.427',
    type: 'NON_REMUNERATIVE',
    scope: 'GENERAL',
    calculationType: 'FIXED',
    defaultValue: 400000,
    calculationOrder: 100,
    isPersistent: true,
    arcaConceptCode: '550000',
  },
  {
    id: 'c-1002',
    code: 'SU1002',
    name: 'Honorarios / Retribución Director S.A.',
    type: 'REMUNERATIVE',
    scope: 'GENERAL',
    calculationType: 'FIXED',
    defaultValue: 3500000,
    calculationOrder: 100,
    isPersistent: true,
    arcaConceptCode: '110000',
  },
  {
    id: 'c-1010',
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
  {
    id: 'c-1020',
    code: 'SU1020',
    name: 'Presentismo CCT',
    type: 'REMUNERATIVE',
    scope: 'GENERAL',
    calculationType: 'FORMULA',
    formula: '([SU1000] + [SU1010]) * 8.33 / 100',
    calculationOrder: 120,
    isPersistent: true,
    arcaConceptCode: '130000',
  },
  {
    id: 'c-1095',
    code: 'SU1095',
    name: 'Plus de Director por Resultados',
    type: 'REMUNERATIVE',
    scope: 'INDIVIDUAL',
    calculationType: 'FORMULA',
    formula: '[SU1002] * 0.10',
    calculationOrder: 130,
    isPersistent: false,
    arcaConceptCode: '110000',
  },
  {
    id: 'c-6001',
    code: 'GE6001',
    name: 'Jubilación SIPA Ley 24.241',
    type: 'DEDUCTION',
    scope: 'GENERAL',
    calculationType: 'FORMULA',
    formula: '[TOTAL_REMUNERATIVO] * 0.11',
    calculationOrder: 200,
    isPersistent: true,
    arcaConceptCode: '810001',
  },
];

// Empleado Regular: 5 años de antigüedad, básico 1.000.000
const regularEmployee = {
  id: 'emp-reg-1',
  fileNumber: 'L-100',
  cuil: '20301112223',
  firstName: 'Juan',
  lastName: 'Pérez',
  contractModalityCode: '001',
  hireDate: new Date('2021-10-01'), // ~5 años de antigüedad
  basicSalary: 1000000,
  isPartTime: false,
  partTimePercentage: 100,
  status: 'ACTIVE',
  jobPosition: {
    id: 'job-1',
    name: 'Administrativo A',
    cctCode: '130/75',
    activityCode: '049',
  },
  assignedConcepts: [],
};

// Director S.A.: 15 años en la empresa, honorarios 3.500.000 (Mod. 099)
const directorEmployee = {
  id: 'emp-dir-1',
  fileNumber: '569',
  cuil: '27289998881',
  firstName: 'Paula',
  lastName: 'Abalos',
  contractModalityCode: '99',
  hireDate: new Date('2011-10-01'), // 15 años
  basicSalary: 3500000,
  isPartTime: false,
  partTimePercentage: 100,
  status: 'ACTIVE',
  jobPosition: {
    id: 'job-dir',
    name: 'Directora Titular S.A.',
    activityCode: '015',
  },
  assignedConcepts: [],
};

// Pasante: 6 meses en la empresa, estímulo 400.000 (Mod. 027)
const internEmployee = {
  id: 'emp-int-1',
  fileNumber: 'PAS-01',
  cuil: '20456667778',
  firstName: 'Martín',
  lastName: 'Estudiante',
  contractModalityCode: '27',
  hireDate: new Date('2026-04-01'),
  basicSalary: 400000,
  isPartTime: true,
  partTimePercentage: 50,
  status: 'ACTIVE',
  jobPosition: {
    id: 'job-int',
    name: 'Pasante Universitario',
    activityCode: '049',
  },
  assignedConcepts: [],
};

// ====================================================
// TEST 1: Liquidación de Empleado Estándar y uso de SU1000 como base
// ====================================================
console.log('--- 1. Empleado Estándar (Mod. 001) y Uso Exclusivo de SU1000 ---');

const regularResult = calculateEmployeePayroll({
  employee: regularEmployee,
  period,
  payrollSettings,
  allConcepts,
  allMatrices: [matrizAntig],
  allFixedValues: [],
});

const regItem1000 = regularResult.items.find((i) => i.conceptCode === 'SU1000');
const regItem1010 = regularResult.items.find((i) => i.conceptCode === 'SU1010');
const regItem1001 = regularResult.items.find((i) => i.conceptCode === 'SU1001');
const regItem1002 = regularResult.items.find((i) => i.conceptCode === 'SU1002');

assert(regItem1000 !== undefined, 'Empleado estándar debe liquidar SU1000 (Sueldo Básico)');
assert(regItem1000.amount === 1000000, 'Monto de SU1000 debe ser 1.000.000');
assert(regItem1000.baseAmount === null, 'baseAmount de concepto básico debe ser null');

assert(!regItem1001, 'Empleado estándar NO debe liquidar SU1001 (Estímulo Pasante)');
assert(!regItem1002, 'Empleado estándar NO debe liquidar SU1002 (Honorarios Director)');

assert(regItem1010 !== undefined, 'Empleado estándar debe liquidar SU1010 (Antigüedad)');
// Con 5 años, matriz devuelve 10% -> 1.000.000 * 10 / 100 = 100.000
assertClose(regItem1010.amount, 100000, 'Antigüedad con SU1000 debe ser exactamente 100.000 (10%)');
assert(regItem1010.baseAmount === 1000000, `baseAmount de SU1010 debe ser exactamente 1.000.000 (obtenido ${regItem1010.baseAmount})`);

// ====================================================
// TEST 2: Director S.A. (Mod. 099) no liquida conceptos CCT (SU1010)
// ====================================================
console.log('\n--- 2. Director S.A. (Mod. 099) Exclusión Total de CCT y Aislamiento de Base ---');

const directorResult = calculateEmployeePayroll({
  employee: directorEmployee,
  period,
  payrollSettings,
  allConcepts,
  allMatrices: [matrizAntig],
  allFixedValues: [],
});

const dirItem1000 = directorResult.items.find((i) => i.conceptCode === 'SU1000');
const dirItem1002 = directorResult.items.find((i) => i.conceptCode === 'SU1002');
const dirItem1010 = directorResult.items.find((i) => i.conceptCode === 'SU1010');
const dirItem1020 = directorResult.items.find((i) => i.conceptCode === 'SU1020');

assert(!dirItem1000, 'Director NO debe liquidar SU1000 (Sueldo Básico)');
assert(dirItem1002 !== undefined, 'Director DEBE liquidar SU1002 (Honorarios Director)');
assert(dirItem1002.amount === 3500000, 'Honorarios de Director deben ser 3.500.000');
assert(!dirItem1010, 'Director NO debe liquidar SU1010 (Antigüedad CCT) en su recibo');
assert(!dirItem1020, 'Director NO debe liquidar SU1020 (Presentismo CCT) en su recibo');
assert(directorResult.items.length === 1, `Director solo debe tener 1 item (SU1002), obtenidos: ${directorResult.items.length}`);

// ====================================================
// TEST 3: Evaluación de la fórmula [SU1000] * [MATRIZ:ANTIG] / 100 en contexto de Director
// ====================================================
console.log('\n--- 3. Aislamiento Estricto: [SU1000] evalúa a 0 en contexto de Director ---');

// Si forzáramos la evaluación de SU1010 con el contexto de un Director,
// [SU1000] DEBE ser 0, y NUNCA tomar los 3.500.000 de SU1002.
const directorContext = {
  SU1002: 3500000,
  HONORARIOS_DIRECTOR: 3500000,
  SU1000: 0,
  BASICO: 0,
  SUELDO_BASICO: 0,
  ANTIGUEDAD_ANOS: 15,
};

const evalDirectorAntig = evaluateFormula(
  '[SU1000] * 30 / 100',
  directorContext,
  {},
  () => 30
);

assert(evalDirectorAntig === 0, `Fórmula que referencia [SU1000] en contexto de Director debe ser 0 (obtenido ${evalDirectorAntig})`);

// ====================================================
// TEST 4: Verificación de Helper resolveItemBaseAmount
// ====================================================
console.log('\n--- 4. Helper resolveItemBaseAmount ---');

const dummySu1010Concept = {
  code: 'SU1010',
  name: 'Antigüedad',
  calculationType: 'FORMULA',
  formula: '[SU1000] * [MATRIZ:ANTIG] / 100',
};

const dummyDirectorFormulaConcept = {
  code: 'SU1095',
  name: 'Plus Director',
  calculationType: 'FORMULA',
  formula: '[SU1002] * 0.10',
};

// En contexto regular
const regContext = { SU1000: 1000000, SU1002: 0, BASICO: 1000000 };
const baseRegular = resolveItemBaseAmount(dummySu1010Concept, regContext, false, false, false);
assert(baseRegular === 1000000, `resolveItemBaseAmount para SU1010 en contexto regular debe ser 1000000 (obtenido ${baseRegular})`);

// En contexto director
const dirContext = { SU1000: 0, SU1002: 3500000, BASICO: 0 };
const baseDirector = resolveItemBaseAmount(dummySu1010Concept, dirContext, false, false, false);
assert(baseDirector === null, `resolveItemBaseAmount para SU1010 en contexto director debe ser null (obtenido ${baseDirector})`);

const baseDirPlus = resolveItemBaseAmount(dummyDirectorFormulaConcept, dirContext, false, false, false);
assert(baseDirPlus === 3500000, `resolveItemBaseAmount para fórmula con [SU1002] debe ser 3500000 (obtenido ${baseDirPlus})`);

// ====================================================
// TEST 5: Resistencia a Diacríticos y Acentos en Supresión CCT
// ====================================================
console.log('\n--- 5. Normalización y Resistencia a Diacríticos en Nombres CCT ---');

const conceptsWithVariedDiacritics = [
  { ...allConcepts[0] }, // SU1000
  { ...allConcepts[2] }, // SU1002
  {
    id: 'c-test-dia-1',
    code: '1011',
    name: 'Antigüedad (2% por año)', // Con ü y é
    type: 'REMUNERATIVE',
    calculationType: 'FORMULA',
    formula: '[SU1000] * 0.02',
    calculationOrder: 110,
    isPersistent: true,
  },
  {
    id: 'c-test-dia-2',
    code: '1012',
    name: 'Adicional Convenio Colectivo CCT',
    type: 'REMUNERATIVE',
    calculationType: 'FIXED',
    defaultValue: 50000,
    calculationOrder: 115,
    isPersistent: true,
  },
  {
    id: 'c-test-dia-3',
    code: '1013',
    name: 'Premio Presentismo Mensual',
    type: 'REMUNERATIVE',
    calculationType: 'FIXED',
    defaultValue: 30000,
    calculationOrder: 120,
    isPersistent: true,
  },
];

const resultDiacriticsDirector = calculateEmployeePayroll({
  employee: directorEmployee,
  period,
  payrollSettings,
  allConcepts: conceptsWithVariedDiacritics,
});

const itemsDir = resultDiacriticsDirector.items.map((i) => i.conceptCode);
assert(!itemsDir.includes('1011'), 'Concepto "Antigüedad (2% por año)" con diacríticos debe ser suprimido para el director');
assert(!itemsDir.includes('1012'), 'Concepto "Adicional Convenio Colectivo CCT" debe ser suprimido para el director');
assert(!itemsDir.includes('1013'), 'Concepto "Premio Presentismo Mensual" debe ser suprimido para el director');
assert(itemsDir.includes('SU1002'), 'SU1002 debe ser el único concepto remunerativo liquidado');

// ====================================================
// TEST 6: Auditoría de Catálogo y Validador de Fórmulas
// ====================================================
console.log('\n--- 6. Auditoría Estática de Consistencia en Fórmulas ---');

// Validar que SU1010 sea válida
const valSu1010 = validateConceptFormula({
  formula: '[SU1000] * [MATRIZ:ANTIG] / 100',
  conceptCode: 'SU1010',
  calculationOrder: 110,
  allConcepts,
  matrices: [matrizAntig],
});
assert(valSu1010.isValid, 'Fórmula SU1010 [SU1000] * [MATRIZ:ANTIG] / 100 debe ser VÁLIDA');
assert(valSu1010.errors.length === 0, 'SU1010 no debe registrar errores sintácticos ni de orden');

// Validar que una fórmula que mezcle erróneamente [SU1000] y [SU1002] genere advertencia
const valMixed = validateConceptFormula({
  formula: '[SU1000] + [SU1002]',
  conceptCode: '9999',
  calculationOrder: 999,
  allConcepts,
});
assert(valMixed.warnings.length > 0, 'Fórmula que mezcla [SU1000] y [SU1002] debe registrar advertencia de incompatibilidad');
assert(valMixed.warnings[0].includes('mutuamente excluyentes'), 'Advertencia debe indicar que los regímenes son mutuamente excluyentes');

// Auditoría completa del catálogo
const auditReport = auditFormulaCatalogConsistency({
  allConcepts,
  matrices: [matrizAntig],
});
assert(auditReport.isValid, 'Auditoría del catálogo de conceptos debe ser VÁLIDA sin errores bloqueantes');
assert(auditReport.totalAudited >= 3, `Debe auditar al menos 3 conceptos con fórmula (auditados: ${auditReport.totalAudited})`);

console.log('\n====================================================');
console.log(`TOTAL PRUEBAS CONSISTENCIA: ${passed} superadas, ${failed} fallidas`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✓ TODAS LAS PRUEBAS DE CONSISTENCIA DE FÓRMULAS FINALIZARON CON ÉXITO.');
}
