import { evaluateMatrix, calculateEmployeePayroll } from './src/modules/payroll/payroll.calculator.js';
import { evaluateFormula } from './src/modules/payroll/formulaEvaluator.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error(`  ✗ FALLÓ: ${msg}`);
    failed++;
    throw new Error(msg);
  } else {
    console.log(`  ✓ ${msg}`);
    passed++;
  }
}

console.log('====================================================');
console.log('TESTS: MATRICES QUANTITY Y AUDITORÍA DE FÓRMULAS');
console.log('====================================================\n');

// 1. Matriz de tipo QUANTITY
const matrixVacaciones = {
  code: 'MAT_VACACIONES',
  name: 'Días de vacaciones según antigüedad',
  inputConceptCode: 'ANTIGUEDAD_ANOS',
  matchType: 'RANGE',
  defaultValue: 14,
  resultType: 'QUANTITY',
  rows: [
    { from: 0, to: 5, value: 14.2, valueType: 'QUANTITY' },
    { from: 6, to: 10, value: 21, valueType: 'QUANTITY' },
    { from: 11, to: 20, value: 28, valueType: 'QUANTITY' },
    { from: 21, to: 99, value: 35, valueType: 'QUANTITY' },
  ],
};

const res0 = evaluateMatrix(matrixVacaciones, { ANTIGUEDAD_ANOS: 3 });
assert(res0.value === 14, 'Matriz con 3 años debe devolver 14 días (redondeado a entero desde 14.2)');
assert(res0.isQuantity === true, 'isQuantity debe ser true');
assert(res0.isPercentage === false, 'isPercentage debe ser false');

const res1 = evaluateMatrix(matrixVacaciones, { ANTIGUEDAD_ANOS: 8 });
assert(res1.value === 21, 'Matriz con 8 años debe devolver 21');
assert(Number.isInteger(res1.value), 'El valor devuelto debe ser un entero exacto');

// 2. Uso de matriz QUANTITY dentro de evaluateFormula
const formulaContext = {
  BASICO: 1500000,
  ANTIGUEDAD_ANOS: 8,
};
const resFormula = evaluateFormula(
  '([BASICO] / 25) * [MATRIZ:MAT_VACACIONES]',
  formulaContext,
  {},
  (matKey, ctx) => {
    if (matKey === 'MAT_VACACIONES') return evaluateMatrix(matrixVacaciones, ctx);
    return 0;
  }
);
// (1500000 / 25) * 21 = 60000 * 21 = 1260000
assert(resFormula === 1260000, `Fórmula de plus vacacional debe dar 1.260.000 (Obtenido: ${resFormula})`);

// 3. Test de calculateEmployeePayroll con formulaExplanation
const employee = {
  id: 'emp-1',
  fileNumber: '1001',
  firstName: 'Juan',
  lastName: 'Pérez',
  cuil: '20301234567',
  basicSalary: 1500000,
  hireDate: new Date('2020-03-01'),
};

const period = {
  id: 'per-1',
  year: 2026,
  month: 9,
  periodType: 'MONTHLY',
  liquidationDate: new Date('2026-09-30'),
};

const concepts = [
  {
    id: 'c-1000',
    code: 'SU1000',
    name: 'Sueldo Básico',
    type: 'REMUNERATIVE',
    scope: 'GENERAL',
    periodType: 'MONTHLY',
    isPersistent: true,
    calculationType: 'FIXED',
    defaultValue: 1500000,
    noveltyDataType: 'CANTIDAD',
    calculationOrder: 1,
  },
  {
    id: 'c-1010',
    code: 'SU1010',
    name: 'Adicional Antigüedad',
    type: 'REMUNERATIVE',
    scope: 'GENERAL',
    periodType: 'MONTHLY',
    isPersistent: true,
    calculationType: 'FORMULA',
    formula: '[SU1000] * 8 / 100',
    calculationOrder: 10,
  },
  {
    id: 'c-6001',
    code: 'SU6001',
    name: 'Jubilación SIPA (11%)',
    type: 'DEDUCTION',
    scope: 'GENERAL',
    periodType: 'MONTHLY',
    isPersistent: true,
    calculationType: 'PERCENTAGE',
    defaultValue: 11,
    calculationOrder: 200,
  },
];

const result = calculateEmployeePayroll({
  employee,
  period,
  allConcepts: concepts,
  payrollSettings: {
    ansesMinCap: 82287.12,
    ansesMaxCap: 2674292.72,
  },
});

assert(result.items.length >= 3, `Debe generar al menos 3 items (Generados: ${result.items.length})`);

const item1010 = result.items.find((i) => i.conceptCode === 'SU1010');
assert(Boolean(item1010), 'El item SU1010 debe existir');
assert(item1010.amount === 120000, `SU1010 debe calcular 120.000 (Obtenido: ${item1010.amount})`);
assert(Boolean(item1010.formulaExplanation), 'SU1010 debe tener formulaExplanation');
assert(
  item1010.formulaExplanation.includes('1500000'),
  `formulaExplanation de SU1010 debe contener el importe resuelto 1500000 (Obtenido: ${item1010.formulaExplanation})`
);

const item6001 = result.items.find((i) => i.conceptCode === 'SU6001');
assert(Boolean(item6001), 'El item SU6001 debe existir');
assert(Boolean(item6001.formulaExplanation), 'SU6001 debe tener formulaExplanation');
assert(
  item6001.formulaExplanation.includes('11%'),
  `formulaExplanation de SU6001 debe contener la alícuota 11% (Obtenido: ${item6001.formulaExplanation})`
);

console.log('\n====================================================');
console.log(`RESULTADOS: ${passed} superadas, ${failed} fallidas`);
console.log('====================================================');
