import { resolveFormulaExpression, evaluateFormula } from './src/modules/payroll/formulaEvaluator.js';
import { calculateEmployeePayroll } from './src/modules/payroll/payroll.calculator.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
    throw new Error(msg);
  } else {
    console.log(`  ✓ ${msg}`);
    passed++;
  }
}

console.log('================================================================');
console.log('TEST SUITE: EVALUACIÓN DE FUNCIONES EN AUDITORÍA DE FÓRMULAS');
console.log('================================================================\n');

// 1. DIF_DIAS: FI1010 caso del usuario
{
  const context = {
    FI1001: 1790000,
    INICIO_SEMESTRE: '2026-07-01',
    FECHA_LIQUIDACION: '2026-09-18',
  };
  const formula = '[FI1001] * DIF_DIAS([INICIO_SEMESTRE], [FECHA_LIQUIDACION], true) / 360';
  const explanation = resolveFormulaExpression(formula, context);
  assert(explanation === '1790000 * 80 / 360', `DIF_DIAS debe resolverse a 80 en la explicación. Obtenido: ${explanation}`);
  
  const evaluated = evaluateFormula(formula, context);
  assert(Math.abs(evaluated - 397777.78) < 0.01, `Valor evaluado debe ser 397777.78. Obtenido: ${evaluated}`);
}

// 2. DIF_MESES
{
  const context = {
    BASICO: 1200000,
    FECHA_INGRESO: '2025-01-01',
    FECHA_LIQUIDACION: '2026-07-01',
  };
  const formula = '[BASICO] * DIF_MESES([FECHA_INGRESO], [FECHA_LIQUIDACION]) / 12';
  const explanation = resolveFormulaExpression(formula, context);
  assert(explanation === '1200000 * 18 / 12', `DIF_MESES debe resolverse a 18 en la explicación. Obtenido: ${explanation}`);
}

// 3. DIF_ANIOS
{
  const context = {
    BASICO: 1000000,
    FECHA_INGRESO: '2020-03-01',
    FECHA_LIQUIDACION: '2026-03-01',
  };
  const formula = '[BASICO] * DIF_ANIOS([FECHA_INGRESO], [FECHA_LIQUIDACION]) * 0.02';
  const explanation = resolveFormulaExpression(formula, context);
  assert(explanation === '1000000 * 6 * 0.02', `DIF_ANIOS debe resolverse a 6 en la explicación. Obtenido: ${explanation}`);
}

// 4. DIF_FECHA / DIFERENCIA_FECHAS
{
  const context = {
    BASICO: 500000,
    FECHA_INGRESO: '2026-01-01',
    FECHA_LIQUIDACION: '2026-01-20',
  };
  const formula = 'DIF_FECHA([FECHA_INGRESO], [FECHA_LIQUIDACION], "DIAS", true) * 1000';
  const explanation = resolveFormulaExpression(formula, context);
  assert(explanation === '20 * 1000', `DIF_FECHA debe resolverse a 20 en la explicación. Obtenido: ${explanation}`);
}

// 5. TOPE_MAX
{
  const context = {
    BASICO: 500000,
  };
  const formula = 'TOPE_MAX([BASICO] * 0.20, 80000) + 5000';
  const explanation = resolveFormulaExpression(formula, context);
  assert(explanation === '80000 + 5000', `TOPE_MAX debe evaluarse a 80000 en la explicación. Obtenido: ${explanation}`);
}

// 6. TOPE_MIN
{
  const context = {
    BASICO: 200000,
  };
  const formula = 'TOPE_MIN([BASICO] * 0.10, 30000) + 1000';
  const explanation = resolveFormulaExpression(formula, context);
  assert(explanation === '30000 + 1000', `TOPE_MIN debe evaluarse a 30000 en la explicación. Obtenido: ${explanation}`);
}

// 7. LIMITAR
{
  const context = {
    BASICO: 100000,
  };
  const formula = 'LIMITAR([BASICO] * 0.10, 15000, 50000)';
  const explanation = resolveFormulaExpression(formula, context);
  assert(explanation === '15000', `LIMITAR debe evaluarse a 15000 en la explicación. Obtenido: ${explanation}`);
}

// 8. MIN & MAX
{
  const context = {
    BASICO: 400000,
    MEJOR_REMUN: 600000,
  };
  const formula = 'MAX([BASICO], [MEJOR_REMUN]) + MIN(5000, 10000)';
  const explanation = resolveFormulaExpression(formula, context);
  assert(explanation === '600000 + 5000', `MAX y MIN deben resolverse a 600000 y 5000. Obtenido: ${explanation}`);
}

// 9. REDONDEAR & ROUND
{
  const context = {
    SU1000: 1790000,
    CANTIDAD: 15,
  };
  const formula = 'REDONDEAR([SU1000] / 30, 2) * [CANTIDAD]';
  const explanation = resolveFormulaExpression(formula, context);
  assert(explanation === '59666.67 * 15', `REDONDEAR debe resolverse a 59666.67. Obtenido: ${explanation}`);
}

// 10. ABS, CEIL, FLOOR
{
  const context = {
    VALOR: 10.4,
  };
  const formula = 'CEIL([VALOR]) + FLOOR([VALOR]) + ABS(-50)';
  const explanation = resolveFormulaExpression(formula, context);
  assert(explanation === '11 + 10 + 50', `CEIL, FLOOR, ABS deben evaluarse a números. Obtenido: ${explanation}`);
}

// 11. SI / IF
{
  const context = {
    ANTIGUEDAD: 8,
    BASICO: 1000000,
  };
  const formula = 'SI([ANTIGUEDAD] > 5, 100000, 50000)';
  const explanation = resolveFormulaExpression(formula, context);
  assert(explanation === '100000', `SI debe evaluar la rama correspondiente. Obtenido: ${explanation}`);
}

// 12. calculateEmployeePayroll de liquidación final con FI1001 y FI1010
{
  const employee = {
    id: 'emp-fi',
    fileNumber: '1002',
    firstName: 'Carlos',
    lastName: 'Gómez',
    cuil: '20309998881',
    basicSalary: 1790000,
    hireDate: new Date('2024-01-01'),
  };
  const period = {
    id: 'per-fi',
    year: 2026,
    month: 9,
    periodType: 'FINAL',
    liquidationDate: new Date('2026-09-18'),
  };
  const concepts = [
    {
      id: 'c-fi1001',
      code: 'FI1001',
      name: 'Mejor sueldo para S.A.C.',
      type: 'REMUNERATIVE',
      periodType: 'FINAL',
      scope: 'INDIVIDUAL',
      isPersistent: false,
      calculationType: 'FORMULA',
      formula: '[BASICO]',
      calculationOrder: 1001,
    },
    {
      id: 'c-fi1010',
      code: 'FI1010',
      name: 'S.A.C. Proporcional',
      type: 'REMUNERATIVE',
      periodType: 'FINAL',
      scope: 'INDIVIDUAL',
      isPersistent: false,
      calculationType: 'FORMULA',
      formula: '[FI1001] * DIF_DIAS([INICIO_SEMESTRE], [FECHA_LIQUIDACION], true) / 360',
      calculationOrder: 1010,
    },
  ];

  const result = calculateEmployeePayroll({
    employee,
    period,
    allConcepts: concepts,
    payrollSettings: { ansesMinCap: 80000, ansesMaxCap: 2000000 },
    inputItems: [
      { conceptCode: 'FI1001', amount: 1790000 },
      { conceptCode: 'FI1010' },
    ],
  });

  const fi1010Item = result.items.find(i => i.conceptCode === 'FI1010');
  assert(Boolean(fi1010Item), 'FI1010 debe existir en la liquidación');
  assert(fi1010Item.amount === 397777.78, `FI1010 debe calcular 397777.78. Obtenido: ${fi1010Item.amount}`);
  assert(
    fi1010Item.formulaExplanation === '1790000 * 80 / 360',
    `FI1010 formulaExplanation debe ser '1790000 * 80 / 360'. Obtenido: ${fi1010Item.formulaExplanation}`
  );
}

console.log('\n================================================================');
console.log(`TOTAL PRUEBAS: ${passed} superadas, ${failed} fallidas`);
console.log('================================================================');
