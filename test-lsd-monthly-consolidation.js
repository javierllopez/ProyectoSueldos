/**
 * Suite de Pruebas Automatizadas: Libro de Sueldos Digital Unificado Mensual y Auditoría ARCA
 * Valida la consolidación de múltiples liquidaciones en el mes, la fecha de pago de la última
 * liquidación en Reg 02, el tope y reporte de días trabajados > 30 en Reg 04, y el cuadre F.931.
 */

import { generateMonthlyLsdPayrollFile, validateMonthlyLsdConsistency } from './src/modules/payroll/lsdExporter.service.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FALLÓ: ${message}`);
    failed++;
  }
}

console.log('\n================================================================');
console.log('TEST SUITE: LIBRO DE SUELDOS DIGITAL (LSD) UNIFICADO MENSUAL');
console.log('================================================================\n');

// Mock Company y Parámetros
const mockCompany = {
  legalName: 'Empresa Test S.A.',
  cuit: '30-71234567-8',
};

const mockPayrollSettings = {
  employerType: 'SERVICIOS_COMERCIO',
  sipaRate: 10.77,
  inssjypRate: 1.58,
  osRate: 6.00,
  detractionBase: 7003.68,
  ansesMinCap: 82287.12,
  ansesMaxCap: 2674292.72,
};

const employee1 = {
  id: 'emp-001',
  fileNumber: 'L1001',
  cuil: '20-33445566-9',
  lastName: 'Gomez',
  firstName: 'Carlos',
  cbu: '0170099920000012345678',
  department: { name: 'OPERACIONES' },
  healthInsurance: { code: '126205', name: 'OSECAC' },
};

// --- CASO 1: Empleado con 2 Liquidaciones en el Mismo Mes (1ra Quincena + 2da Quincena) ---
console.log('--- 1. Consolidación de 2 Liquidaciones en el Mismo Mes (1ra y 2da Quincena) ---');

const periodQ1 = {
  id: 'per-2026-09-q1',
  year: 2026,
  month: 9,
  periodType: 'QUINCE_1',
  settlementNumber: 1,
  settlementType: 'Q',
  liquidationDate: new Date('2026-09-15T00:00:00.000Z'),
  paymentDate: new Date('2026-09-18T00:00:00.000Z'),
  rubricDate: new Date('2026-09-15T00:00:00.000Z'),
  status: 'CLOSED',
};

const periodQ2 = {
  id: 'per-2026-09-q2',
  year: 2026,
  month: 9,
  periodType: 'QUINCE_2',
  settlementNumber: 2,
  settlementType: 'Q',
  liquidationDate: new Date('2026-09-30T00:00:00.000Z'),
  paymentDate: new Date('2026-10-05T00:00:00.000Z'), // Fecha más reciente
  rubricDate: new Date('2026-09-30T00:00:00.000Z'),
  status: 'DRAFT', // Abierta (permitida en esta etapa)
};

// Recibo 1ra Quincena: Bruto $500.000 (Remun $500.000), 15 días trabajados
const slipQ1 = {
  id: 'slip-q1',
  payrollPeriodId: periodQ1.id,
  payrollPeriod: periodQ1,
  employeeId: employee1.id,
  employee: employee1,
  grossSalary: 500000.00,
  remunerativeSalary: 500000.00,
  nonRemunerative: 0.00,
  netSalary: 415000.00,
  paymentMethod: 'CBU',
  workedDays: 15,
  workedHours: 80,
  items: [
    { conceptCode: '1000', conceptName: 'Sueldo Básico Quincena 1', type: 'REMUNERATIVE', amount: 500000.00, units: 15, unitLabel: 'Días' },
    { conceptCode: '8000', conceptName: 'Aporte Jubilación SIPA', type: 'DEDUCTION', amount: 55000.00, rate: 11, arcaConceptCode: '810000' },
    { conceptCode: '8001', conceptName: 'Aporte INSSJyP / PAMI', type: 'DEDUCTION', amount: 15000.00, rate: 3, arcaConceptCode: '810001' },
    { conceptCode: '8002', conceptName: 'Aporte Obra Social', type: 'DEDUCTION', amount: 15000.00, rate: 3, arcaConceptCode: '810002' },
  ],
  basis: {
    situationCode: '01',
    conditionCode: '01',
    activityCode: '049',
    contractModality: '001',
    hasSpouse: false,
    childrenCount: 1,
    hasScvo: true,
    hasCct: true,
  },
};

// Recibo 2da Quincena: Bruto $600.000 (Remun $550.000, No Remun $50.000), 15 días trabajados
const slipQ2 = {
  id: 'slip-q2',
  payrollPeriodId: periodQ2.id,
  payrollPeriod: periodQ2,
  employeeId: employee1.id,
  employee: employee1,
  grossSalary: 600000.00,
  remunerativeSalary: 550000.00,
  nonRemunerative: 50000.00,
  netSalary: 506500.00,
  paymentMethod: 'CBU',
  workedDays: 15,
  workedHours: 80,
  items: [
    { conceptCode: '1000', conceptName: 'Sueldo Básico Quincena 2', type: 'REMUNERATIVE', amount: 550000.00, units: 15, unitLabel: 'Días' },
    { conceptCode: '2001', conceptName: 'Bono no remunerativo', type: 'NON_REMUNERATIVE', amount: 50000.00 },
    { conceptCode: '8000', conceptName: 'Aporte Jubilación SIPA', type: 'DEDUCTION', amount: 60500.00, rate: 11, arcaConceptCode: '810000' },
    { conceptCode: '8001', conceptName: 'Aporte INSSJyP / PAMI', type: 'DEDUCTION', amount: 16500.00, rate: 3, arcaConceptCode: '810001' },
    { conceptCode: '8002', conceptName: 'Aporte Obra Social', type: 'DEDUCTION', amount: 16500.00, rate: 3, arcaConceptCode: '810002' },
  ],
  basis: {
    situationCode: '01',
    conditionCode: '01',
    activityCode: '049',
    contractModality: '001',
    hasSpouse: false,
    childrenCount: 1,
    hasScvo: true,
    hasCct: true,
  },
};

const paySlipsCase1 = [slipQ1, slipQ2];
const settlementsCase1 = [periodQ1, periodQ2];

const fileContent1 = generateMonthlyLsdPayrollFile({
  company: mockCompany,
  year: 2026,
  month: 9,
  settlements: settlementsCase1,
  paySlips: paySlipsCase1,
  payrollSettings: mockPayrollSettings,
});

const lines1 = fileContent1.split('\r\n');

assert(!fileContent1.endsWith('\r\n'), 'El archivo generado NO debe terminar con salto de línea sobrante');
assert(lines1.every((l) => l.length === 999), 'Cada una de las líneas del archivo debe tener exactamente 999 caracteres');

// Verificar Registro 01
const reg01_1 = lines1[0];
assert(reg01_1.startsWith('01'), 'La primera línea debe ser Registro 01');
assert(reg01_1.substring(13, 15) === 'SJ', 'Posición 14-15 debe ser SJ');
assert(reg01_1.substring(15, 21) === '202609', 'Posición 16-21 debe ser 202609');
assert(reg01_1.substring(21, 22) === 'M', 'Posición 22 debe ser tipo mensual "M"');
assert(reg01_1.substring(22, 27) === '00001', 'Posición 23-27 debe ser liquidación 00001');
assert(reg01_1.substring(27, 29) === '30', 'Posición 28-29 debe ser 30 días base');
assert(reg01_1.substring(29, 35) === '000001', 'Posición 30-35 debe ser 1 único Registro 04');

// Verificar Registro 02
const reg02_1 = lines1[1];
assert(reg02_1.startsWith('02'), 'La segunda línea debe ser Registro 02');
// Fecha de pago en pos 99-106 (index 98 a 106): La fecha de la 2da quincena es 2026-10-05 -> '20261005'
const paymentDateReg02 = reg02_1.substring(98, 106);
assert(paymentDateReg02 === '20261005', `Registro 02 debe tomar la fecha de pago más reciente (20261005, obtenido ${paymentDateReg02})`);
const daysReg02 = reg02_1.substring(95, 98);
assert(daysReg02 === '030', `Días en Registro 02 consolidados deben ser 30 (obtenido ${daysReg02})`);

// Verificar Registros 03 (4 items de Q1 + 5 items de Q2 = 9 items en total)
const reg03Lines = lines1.filter((l) => l.startsWith('03'));
assert(reg03Lines.length === 9, `Deben generarse 9 Registros 03 concatenando ambas liquidaciones (obtenido ${reg03Lines.length})`);

// Verificar Registro 04
const reg04Lines = lines1.filter((l) => l.startsWith('04'));
assert(reg04Lines.length === 1, `Debe generarse exactamente 1 Registro 04 consolidado para el mes (obtenido ${reg04Lines.length})`);
const reg04_1 = reg04Lines[0];

// Bruto Total en pos 161-175: 500.000 + 600.000 = 1.100.000 -> 000000110000000 (con 2 decimales)
const brutoStr = reg04_1.substring(160, 175);
const expectedBrutoCents = '000000110000000';
assert(brutoStr === expectedBrutoCents, `Registro 04 Bruto debe ser $1.100.000 (esperado ${expectedBrutoCents}, obtenido ${brutoStr})`);

// Base Imponible 1 (Remunerativo $1.050.000): pos 176-190
const bi1Str = reg04_1.substring(175, 190);
const expectedBi1Cents = '000000105000000';
assert(bi1Str === expectedBi1Cents, `Registro 04 BI 1 debe ser $1.050.000 (esperado ${expectedBi1Cents}, obtenido ${bi1Str})`);

// Detracción Ley 27.541: pos 356-370 -> $7.003,68 (una sola vez en el mes)
const detrStr = reg04_1.substring(355, 370);
const expectedDetrCents = '000000000700368';
assert(detrStr === expectedDetrCents, `Detracción debe aplicarse una sola vez en el mes por $7.003,68 (esperado ${expectedDetrCents}, obtenido ${detrStr})`);

// Validar consistencia técnica del Caso 1
const auditResult1 = validateMonthlyLsdConsistency({
  year: 2026,
  month: 9,
  settlements: settlementsCase1,
  paySlips: paySlipsCase1,
  payrollSettings: mockPayrollSettings,
});

assert(auditResult1.isValid === true, `La auditoría consolidada del Caso 1 debe ser 100% VÁLIDA (errores: ${JSON.stringify(auditResult1.errors)})`);
assert(auditResult1.errors.length === 0, 'No deben existir inconsistencias en el Caso 1');

// --- CASO 2: Empleado con Días Trabajados Acumulados > 30 (Directiva del Usuario) ---
console.log('\n--- 2. Directiva del Usuario: Días Trabajados Acumulados > 30 en el Mes ---');

// Modificamos slipQ1 para que tenga 17 días y slipQ2 16 días -> total 33 días
const slipQ1ExcessDays = { ...slipQ1, workedDays: 17 };
const slipQ2ExcessDays = { ...slipQ2, workedDays: 16 };

const auditResultDaysExceeded = validateMonthlyLsdConsistency({
  year: 2026,
  month: 9,
  settlements: settlementsCase1,
  paySlips: [slipQ1ExcessDays, slipQ2ExcessDays],
  payrollSettings: mockPayrollSettings,
});

assert(auditResultDaysExceeded.isValid === false, 'Auditoría debe reportar inválido si los días trabajados acumulados superan 30');
const dayError = auditResultDaysExceeded.errors.find((e) => e.type === 'ERROR_DIAS_BASE_EXCEDIDOS');
assert(Boolean(dayError), 'Debe emitir específicamente el error ERROR_DIAS_BASE_EXCEDIDOS');
assert(dayError.legajo === 'L1001', 'El error debe indicar el legajo L1001');
assert(dayError.message.includes('33 días'), `El mensaje de error debe indicar los días acumulados (33 días, mensaje: "${dayError?.message}")`);

// Verificar que al generar el archivo .txt, los días en las posiciones fijas se topen en 30 para no romper longitud posicional
const fileContentExceeded = generateMonthlyLsdPayrollFile({
  company: mockCompany,
  year: 2026,
  month: 9,
  settlements: settlementsCase1,
  paySlips: [slipQ1ExcessDays, slipQ2ExcessDays],
  payrollSettings: mockPayrollSettings,
});

const linesExceeded = fileContentExceeded.split('\r\n');
const reg02Exceeded = linesExceeded[1];
const reg04Exceeded = linesExceeded.find((l) => l.startsWith('04'));
assert(reg02Exceeded.substring(95, 98) === '030', 'En el archivo plano, Reg 02 días debe toparse en 030');
assert(reg04Exceeded.substring(47, 49) === '30', 'En el archivo plano, Reg 04 días debe toparse en 30');
assert(linesExceeded.every((l) => l.length === 999), 'Todas las líneas siguen manteniendo 999 bytes sin deformación');

// --- CASO 3: Detección de Discrepancia en Bruto (Reg 03 vs Reg 04) ---
console.log('\n--- 3. Control de Discrepancia entre Conceptos 03 y Bruto 04 ---');

const slipQ1Corrupted = {
  ...slipQ1,
  grossSalary: 550000.00, // Alterado: no cuadra con la suma de items que es 500.000
};

const auditResultCorruptedGross = validateMonthlyLsdConsistency({
  year: 2026,
  month: 9,
  settlements: settlementsCase1,
  paySlips: [slipQ1Corrupted, slipQ2],
  payrollSettings: mockPayrollSettings,
});

assert(auditResultCorruptedGross.isValid === false, 'Debe detectar discrepancia cuando el bruto no cuadra con los conceptos 03');
const grossError = auditResultCorruptedGross.errors.find((e) => e.type === 'ERROR_BRUTO_CONSOLIDADO');
assert(Boolean(grossError), 'Debe emitir específicamente el error ERROR_BRUTO_CONSOLIDADO');

// --- CASO 4: Detección de Descuento SIPA Distinto al 11% ---
console.log('\n--- 4. Control de Alícuota SIPA (11% sobre BI 1) ---');

const slipQ1CorruptedSipa = {
  ...slipQ1,
  items: [
    { conceptCode: '1000', conceptName: 'Sueldo Básico Quincena 1', type: 'REMUNERATIVE', amount: 500000.00, units: 15 },
    { conceptCode: '8000', conceptName: 'Aporte Jubilación SIPA', type: 'DEDUCTION', amount: 20000.00, rate: 11, arcaConceptCode: '810000' }, // Debería ser 55.000
    { conceptCode: '8001', conceptName: 'Aporte INSSJyP', type: 'DEDUCTION', amount: 15000.00, rate: 3, arcaConceptCode: '810001' },
    { conceptCode: '8002', conceptName: 'Aporte OS', type: 'DEDUCTION', amount: 15000.00, rate: 3, arcaConceptCode: '810002' },
  ],
};

const auditResultCorruptedSipa = validateMonthlyLsdConsistency({
  year: 2026,
  month: 9,
  settlements: settlementsCase1,
  paySlips: [slipQ1CorruptedSipa, slipQ2],
  payrollSettings: mockPayrollSettings,
});

assert(auditResultCorruptedSipa.isValid === false, 'Debe detectar error de alícuota previsional SIPA');
const sipaError = auditResultCorruptedSipa.errors.find((e) => e.type === 'ERROR_ALICUOTA_SIPA');
assert(Boolean(sipaError), 'Debe emitir específicamente el error ERROR_ALICUOTA_SIPA');

// --- CASO 5: Múltiples Empleados en el Mes ---
console.log('\n--- 5. Consolidación de Múltiples Trabajadores Únicos en el Mes ---');

const employee2 = {
  id: 'emp-002',
  fileNumber: 'L1002',
  cuil: '27-44556677-3',
  lastName: 'Alvarez',
  firstName: 'Mariana',
  cbu: '0170099920000099887766',
  department: { name: 'ADMINISTRACION' },
  healthInsurance: { code: '126205', name: 'OSECAC' },
};

const slipEmp2 = {
  id: 'slip-emp2',
  payrollPeriodId: periodQ2.id,
  payrollPeriod: periodQ2,
  employeeId: employee2.id,
  employee: employee2,
  grossSalary: 800000.00,
  remunerativeSalary: 800000.00,
  nonRemunerative: 0.00,
  netSalary: 664000.00,
  paymentMethod: 'CBU',
  workedDays: 30,
  workedHours: 160,
  items: [
    { conceptCode: '1000', conceptName: 'Sueldo Básico Mensual', type: 'REMUNERATIVE', amount: 800000.00, units: 30 },
    { conceptCode: '8000', conceptName: 'Aporte Jubilación SIPA', type: 'DEDUCTION', amount: 88000.00, arcaConceptCode: '810000' },
    { conceptCode: '8001', conceptName: 'Aporte INSSJyP', type: 'DEDUCTION', amount: 24000.00, arcaConceptCode: '810001' },
    { conceptCode: '8002', conceptName: 'Aporte Obra Social', type: 'DEDUCTION', amount: 24000.00, arcaConceptCode: '810002' },
  ],
  basis: {
    situationCode: '01',
    conditionCode: '01',
    activityCode: '049',
    contractModality: '001',
    hasSpouse: true,
    childrenCount: 2,
    hasScvo: true,
    hasCct: true,
  },
};

const multiEmpFile = generateMonthlyLsdPayrollFile({
  company: mockCompany,
  year: 2026,
  month: 9,
  settlements: settlementsCase1,
  paySlips: [slipQ1, slipQ2, slipEmp2],
  payrollSettings: mockPayrollSettings,
});

const multiEmpLines = multiEmpFile.split('\r\n');
const multiReg01 = multiEmpLines[0];
// En Reg 01 cantidad de 04s debe ser 2 (emp1 y emp2)
assert(multiReg01.substring(29, 35) === '000002', `Registro 01 debe declarar 2 trabajadores únicos (obtenido ${multiReg01.substring(29, 35)})`);
const multiReg02 = multiEmpLines.filter((l) => l.startsWith('02'));
assert(multiReg02.length === 2, `Deben existir 2 Registros 02 (obtenido ${multiReg02.length})`);
const multiReg04 = multiEmpLines.filter((l) => l.startsWith('04'));
assert(multiReg04.length === 2, `Deben existir 2 Registros 04 (obtenido ${multiReg04.length})`);

console.log('\n================================================================');
console.log(`RESUMEN: ${passed} superadas, ${failed} fallidas`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✓ TODAS LAS PRUEBAS DE CONSOLIDACIÓN MENSUAL LSD FINALIZARON CON ÉXITO.\n');
}
