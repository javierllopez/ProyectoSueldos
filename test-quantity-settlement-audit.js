import assert from 'node:assert';
import { calculateEmployeePayroll } from './src/modules/payroll/payroll.calculator.js';
import { validateConceptFormula } from './src/modules/payroll/formulaValidator.js';
import { evaluateFormula } from './src/modules/payroll/formulaEvaluator.js';

console.log('====================================================');
console.log('TESTS: CANTIDAD DINÁMICA, AUDITORÍA Y FÓRMULAS CON CANTIDAD');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    failed++;
  }
}

// Empleado con 5 años de antigüedad (ingreso: 2021-03-01, período: 2026-03)
const employee = {
  id: 'emp-test-1',
  fileNumber: 'LEG-100',
  firstName: 'Juan',
  lastName: 'Pérez',
  cuil: '20301234567',
  hireDate: new Date('2021-03-01T12:00:00Z'),
  basicSalary: 1000000,
  payrollGroup: 'MENSUAL',
};

const period = {
  id: 'period-2026-03',
  year: 2026,
  month: 3,
  periodType: 'MONTHLY',
  liquidationDate: '2026-03-31',
};

const payrollSettings = {
  ansesMinCap: 82287.12,
  ansesMaxCap: 2674292.72,
};

// --- TEST 1: SU1010 Antigüedad asigna automáticamente Años cumplidos ---
test('SU1010 asigna automáticamente units = 5 y unitLabel = "Años" (antigüedad cumplida)', () => {
  const concepts = [
    {
      id: 'c-1000',
      code: 'SU1000',
      name: 'Sueldo Básico',
      type: 'REMUNERATIVE',
      calculationType: 'FIXED',
      defaultValue: 1000000,
      noveltyDataType: 'CANTIDAD',
      calculationOrder: 1000,
    },
    {
      id: 'c-1010',
      code: 'SU1010',
      name: 'Antigüedad (2% por año)',
      type: 'REMUNERATIVE',
      calculationType: 'FORMULA',
      formula: '[SU1000] * [ANTIGUEDAD_ANOS] * 2 / 100',
      noveltyDataType: 'CALCULADO',
      calculationOrder: 1010,
    },
  ];

  const result = calculateEmployeePayroll({
    employee,
    period,
    allConcepts: concepts,
    payrollSettings,
  });

  const item1010 = result.items.find((i) => i.conceptCode === 'SU1010');
  assert(Boolean(item1010), 'SU1010 debe liquidarse');
  assert.strictEqual(item1010.units, 5, `SU1010 debe tener 5 años en units (Obtenido: ${item1010.units})`);
  assert.strictEqual(item1010.unitLabel, 'Años', `SU1010 debe tener label "Años" (Obtenido: ${item1010.unitLabel})`);
  assert.strictEqual(item1010.amount, 100000, `Importe debe ser 100.000 (Obtenido: ${item1010.amount})`);
});

// --- TEST 2: Concepto con quantitySource explícito ---
test('Concepto con quantitySource = "ANTIGUEDAD_ANOS" o "DIAS_TRABAJADOS" asigna cantidad correcta', () => {
  const concepts = [
    {
      id: 'c-1000',
      code: 'SU1000',
      name: 'Sueldo Básico',
      type: 'REMUNERATIVE',
      calculationType: 'FIXED',
      defaultValue: 1000000,
      calculationOrder: 1000,
    },
    {
      id: 'c-1015',
      code: 'SU1015',
      name: 'Plus Especial por Servicio',
      type: 'REMUNERATIVE',
      calculationType: 'FORMULA',
      formula: '50000',
      quantitySource: 'ANTIGUEDAD_ANOS',
      calculationOrder: 1015,
    },
    {
      id: 'c-1030',
      code: 'SU1030',
      name: 'Viático por Día Trabajado',
      type: 'NON_REMUNERATIVE',
      calculationType: 'FORMULA',
      formula: '1000 * [DIAS_TRABAJADOS]',
      quantitySource: 'DIAS_TRABAJADOS',
      calculationOrder: 1030,
    },
  ];

  const result = calculateEmployeePayroll({
    employee,
    period,
    allConcepts: concepts,
    payrollSettings,
  });

  const item1015 = result.items.find((i) => i.conceptCode === 'SU1015');
  assert(Boolean(item1015), 'SU1015 debe liquidarse');
  assert.strictEqual(item1015.units, 5, `SU1015 debe tener 5 años en units (Obtenido: ${item1015.units})`);
  assert.strictEqual(item1015.unitLabel, 'Años', `SU1015 debe tener unitLabel "Años" (Obtenido: ${item1015.unitLabel})`);

  const item1030 = result.items.find((i) => i.conceptCode === 'SU1030');
  assert(Boolean(item1030), 'SU1030 debe liquidarse');
  assert.strictEqual(item1030.units, 30, `SU1030 debe tener 30 días en units (Obtenido: ${item1030.units})`);
  assert.strictEqual(item1030.unitLabel, 'Días', `SU1030 debe tener unitLabel "Días" (Obtenido: ${item1030.unitLabel})`);
});

// --- TEST 3: SU1061 usando [SU1020:CANTIDAD] en su fórmula y quantitySource ---
test('SU1061 Descuento licencias puede referenciar [SU1020:CANTIDAD] en su cálculo y proyectar días en Cantidad', () => {
  const concepts = [
    {
      id: 'c-1000',
      code: 'SU1000',
      name: 'Sueldo Básico',
      type: 'REMUNERATIVE',
      calculationType: 'FIXED',
      defaultValue: 1200000,
      calculationOrder: 1000,
    },
    {
      id: 'c-1020',
      code: 'SU1020',
      name: 'Licencia Ordinaria / Vacaciones',
      type: 'REMUNERATIVE',
      calculationType: 'FORMULA',
      formula: '[SU1000] / 25 * [CANTIDAD]', // Plus vacacional
      noveltyDataType: 'CANTIDAD',
      calculationOrder: 1020,
    },
    {
      id: 'c-1061',
      code: 'SU1061',
      name: 'Descuento licencias pagas',
      type: 'REMUNERATIVE',
      calculationType: 'FORMULA',
      // Descuenta el sueldo ordinario de los días tomados: 0 - (14 * 1.200.000 / 30) = -560.000
      formula: '0 - ([SU1020:CANTIDAD] * [SU1000] / 30)',
      quantitySource: '[SU1020:CANTIDAD]',
      calculationOrder: 1061,
    },
  ];

  // Novedad: 14 días de vacaciones en SU1020
  const inputItems = [
    {
      conceptCode: 'SU1020',
      units: 14,
    },
  ];

  const result = calculateEmployeePayroll({
    employee: { ...employee, basicSalary: 1200000 },
    period,
    inputItems,
    allConcepts: concepts,
    payrollSettings,
  });

  const item1020 = result.items.find((i) => i.conceptCode === 'SU1020');
  assert(Boolean(item1020), 'SU1020 debe liquidarse');
  assert.strictEqual(item1020.units, 14, `SU1020 units debe ser 14 (Obtenido: ${item1020.units})`);

  const item1061 = result.items.find((i) => i.conceptCode === 'SU1061');
  assert(Boolean(item1061), 'SU1061 debe liquidarse');
  assert.strictEqual(item1061.units, 14, `SU1061 units debe heredar 14 días (Obtenido: ${item1061.units})`);
  assert.strictEqual(item1061.unitLabel, 'Días', `SU1061 unitLabel debe ser "Días" (Obtenido: ${item1061.unitLabel})`);
  assert.strictEqual(item1061.amount, -560000, `SU1061 amount debe ser -560.000 (Obtenido: ${item1061.amount})`);
});

// --- TEST 4: Validación estática de fórmulas con [CODIGO:CANTIDAD] ---
test('validateConceptFormula acepta [SU1020:CANTIDAD] y detecta referencias a conceptos inexistentes o posteriores', () => {
  const allConcepts = [
    { code: 'SU1000', name: 'Básico', calculationOrder: 1000 },
    { code: 'SU1020', name: 'Vacaciones', calculationOrder: 1020 },
    { code: 'SU1061', name: 'Descuento Licencias', calculationOrder: 1061 },
    { code: 'SU1070', name: 'Concepto Futuro', calculationOrder: 1070 },
  ];

  // Fórmula válida: SU1061 hace referencia a SU1020 que se calcula antes
  const valOk = validateConceptFormula({
    formula: '0 - ([SU1020:CANTIDAD] * [SU1000] / 30)',
    conceptCode: 'SU1061',
    calculationOrder: 1061,
    allConcepts,
  });
  assert(valOk.isValid, `Fórmula válida debe pasar (Errores: ${valOk.errors.join(', ')})`);
  assert(valOk.referencedConcepts.includes('SU1020'), 'Debe incluir SU1020 en referencedConcepts');

  // Fórmula inválida: hace referencia a un concepto inexistente
  const valMissing = validateConceptFormula({
    formula: '[SU9999:CANTIDAD] * 10',
    conceptCode: 'SU1061',
    calculationOrder: 1061,
    allConcepts,
  });
  assert(!valMissing.isValid, 'Debe fallar al referenciar concepto inexistente');
  assert(valMissing.errors.some((e) => e.includes('inexistente')), 'Debe alertar concepto inexistente');

  // Fórmula inválida: hace referencia a un concepto que se calcula después
  const valFuture = validateConceptFormula({
    formula: '[SU1070:CANTIDAD] * 10',
    conceptCode: 'SU1061',
    calculationOrder: 1061,
    allConcepts,
  });
  assert(!valFuture.isValid, 'Debe fallar al referenciar un concepto posterior en orden');
});

// --- TEST 5: Ordenamiento por código alfanumérico para la Auditoría ---
test('Ordenamiento de ítems en auditoría por código alfanumérico directo', () => {
  const items = [
    { conceptCode: 'SU6001', type: 'DEDUCTION', name: 'Jubilación' },
    { conceptCode: 'SU1061', type: 'REMUNERATIVE', name: 'Descuento Licencias' },
    { conceptCode: 'SU1000', type: 'REMUNERATIVE', name: 'Básico' },
    { conceptCode: 'SU4000', type: 'NON_REMUNERATIVE', name: 'Viático' },
    { conceptCode: 'SU1010', type: 'REMUNERATIVE', name: 'Antigüedad' },
    { conceptCode: 'SU1020', type: 'REMUNERATIVE', name: 'Presentismo' },
  ];

  const sorted = [...items].sort((a, b) => {
    return String(a.conceptCode || '').localeCompare(String(b.conceptCode || ''), undefined, { numeric: true });
  });

  const codes = sorted.map((i) => i.conceptCode);
  const expected = ['SU1000', 'SU1010', 'SU1020', 'SU1061', 'SU4000', 'SU6001'];
  assert.deepStrictEqual(codes, expected, `Los códigos deben quedar en orden natural: ${expected.join(', ')} (Obtenido: ${codes.join(', ')})`);
});

console.log('\n====================================================');
console.log(`TOTAL PRUEBAS: ${passed} superadas, ${failed} fallidas`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
}
