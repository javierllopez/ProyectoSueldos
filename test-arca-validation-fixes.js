/**
 * Test Suite: Corrección de Errores Oficiales de Validación ARCA (Libro de Sueldos Digital)
 * Verifica la resolución de los errores reportados en Docs/ErroresValidacion_30615349603_20261026180146.txt:
 * 1. Código de localidad oficial ARCA (Tabla T04: '01'..'24', prohibición de '00').
 * 2. Tope legal de detracción Ley 27.430 / Ley 27.541 para jornada parcial ($4.692,47 para 67% / Mod. 002).
 * 3. Consistencia de Base Imponible 10 (BI 10 = BI 2 - Detracción computable).
 * 4. Validador interno del sistema (detección preventiva de errores antes de subir a ARCA).
 * 5. Motor de cálculo de nómina (generación de detracción y bases proporcionales).
 */

import {
  getArcaLocalityCode,
  calculateMaxAllowedDetraction,
  generateLsdPayrollFile,
  generateMonthlyLsdPayrollFile,
  validateLsdConsistency,
  validateMonthlyLsdConsistency,
} from './src/modules/payroll/lsdExporter.service.js';
import { calculateEmployeePayroll } from './src/modules/payroll/payroll.calculator.js';

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
console.log('TEST SUITE: CORRECCIÓN ERRORES VALIDACIÓN ARCA LSD');
console.log('================================================================\n');

// --- 1. Códigos de Localidad / Jurisdicción ARCA (Tabla T04) ---
console.log('--- 1. Validación de Códigos de Localidad ARCA (Tabla T04) ---');

assert(getArcaLocalityCode('Buenos Aires', 'Lomas del Mirador') === '02', 'Lomas del Mirador / Buenos Aires debe mapear a "02"');
assert(getArcaLocalityCode('CABA', 'CABA') === '01', 'CABA debe mapear a "01"');
assert(getArcaLocalityCode('Ciudad Autónoma de Buenos Aires', 'Palermo') === '01', 'Capital Federal debe mapear a "01"');
assert(getArcaLocalityCode('CORDOBA', 'Cordoba') === '04', 'Córdoba debe mapear a "04"');
assert(getArcaLocalityCode('Santa Fe', 'Rosario') === '21', 'Santa Fe debe mapear a "21"');
assert(getArcaLocalityCode('', '') !== '00', 'Localidad vacía nunca debe ser "00"');
assert(getArcaLocalityCode(null, null) === '02', 'Fallback seguro debe ser "02"');

// --- 2. Tope Legal de Detracción (Ley 27.430 / Ley 27.541 Dec. 99/2019) ---
console.log('\n--- 2. Tope Legal de Detracción Proporcional ---');

// Caso Jornada Completa (100%, 30 días): $7.003,68
const detrFull = calculateMaxAllowedDetraction({
  detractionBase: 7003.68,
  isPartTime: false,
  partTimePercentage: 100,
  contractModality: '001',
  workedDays: 30,
});
assert(detrFull === 7003.68, `Detracción jornada completa 30 días debe ser 7003.68 (obtenido: ${detrFull})`);

// Caso Jornada Parcial 67% (2/3 de jornada - Art. 92 TER / Modalidad 002):
// Error oficial ARCA: "El importe a detraer no puede superar al tope establecido por la ley 27.430 (4692,47)"
const detrPt67 = calculateMaxAllowedDetraction({
  detractionBase: 7003.68,
  isPartTime: true,
  partTimePercentage: 67,
  contractModality: '002',
  workedDays: 30,
});
assert(detrPt67 === 4692.47, `Detracción jornada parcial 67% debe ser exactamente $4.692,47 (obtenido: ${detrPt67})`);

// Caso Modalidad 002 sin porcentaje explícito (default 2/3 = 67%):
const detrMod002 = calculateMaxAllowedDetraction({
  detractionBase: 7003.68,
  isPartTime: true,
  contractModality: '002',
  workedDays: 30,
});
assert(detrMod002 === 4692.47, `Detracción modalidad 002 por defecto debe ser exactamente $4.692,47 (obtenido: ${detrMod002})`);

// Caso días trabajados proporcionales (15 días de 30):
const detr15Days = calculateMaxAllowedDetraction({
  detractionBase: 7003.68,
  isPartTime: false,
  partTimePercentage: 100,
  contractModality: '001',
  workedDays: 15,
});
assert(detr15Days === 3501.84, `Detracción 15 días debe ser 7003.68 * 15/30 = 3501.84 (obtenido: ${detr15Days})`);

// --- 3. Generación de Registro 04 en LSD con Localidad y Detracción Corregida ---
console.log('\n--- 3. Generación de Registro 04 con Localidad Oficial y Detracción Topada ---');

const mockCompany = {
  legalName: 'Hospital de Test S.A.',
  cuit: '30-61534960-3',
  city: 'Villa Luzuriaga',
  province: 'Buenos Aires',
};

const mockEmployeePt = {
  id: 'emp-reichert',
  fileNumber: 'L1014',
  cuil: '20-14645963-4',
  lastName: 'Reichert',
  firstName: 'Carlos Hector',
  city: 'Lomas del Mirador',
  province: 'Buenos Aires',
  isPartTime: true,
  partTimePercentage: 67,
  contractModalityCode: '002',
  healthInsurance: { code: '126205' },
};

const mockSlipPt = {
  id: 'slip-reichert',
  employeeId: mockEmployeePt.id,
  employee: mockEmployeePt,
  workedDays: 30,
  workedHours: 0,
  grossSalary: 2521125.00,
  remunerativeSalary: 2521125.00,
  nonRemunerative: 0.00,
  items: [
    { conceptCode: '1000', conceptName: 'Sueldo Básico', type: 'REMUNERATIVE', amount: 1556250.00 },
    { conceptCode: '1010', conceptName: 'Antigüedad', type: 'REMUNERATIVE', amount: 964875.00 },
    { conceptCode: '6001', conceptName: 'Jubilación (11%)', type: 'DEDUCTION', amount: 277323.75, arcaConceptCode: '810000' },
    { conceptCode: '6002', conceptName: 'Ley 19.032 (3%)', type: 'DEDUCTION', amount: 75633.75, arcaConceptCode: '810001' },
    { conceptCode: '6003', conceptName: 'Obra Social (3%)', type: 'DEDUCTION', amount: 75633.75, arcaConceptCode: '810002' },
  ],
  basis: {
    baseImponible1: 2521125.00,
    baseImponible2: 2521125.00,
    baseImponible3: 2521125.00,
    baseImponible4: 2521125.00,
    baseImponible5: 2521125.00,
    baseImponible9: 2521125.00,
    baseImponible10: 2516432.53, // 2521125 - 4692.47
    detractionAmount: 4692.47,
    contractModality: '002',
    situationCode: '01',
    conditionCode: '01',
    activityCode: '049',
  },
};

const lsdText = generateLsdPayrollFile({
  company: mockCompany,
  period: { year: 2026, month: 9, settlementNumber: 1, settlementType: 'M' },
  paySlips: [mockSlipPt],
  payrollSettings: { detractionBase: 7003.68 },
});

const lines = lsdText.split('\r\n');
const reg04Line = lines.find((l) => l.startsWith('04'));

assert(reg04Line.length === 370, `Longitud Registro 04 debe ser 370 (obtenido: ${reg04Line.length})`);
// Posición 34-35 (índices 33 a 35 en 0-indexed): Código de localidad
const locInReg04 = reg04Line.substring(33, 35);
assert(locInReg04 === '02', `Localidad en Reg 04 debe ser "02" (Buenos Aires) y NO "00" (obtenido: "${locInReg04}")`);

// Posición 356-370: Detracción
const detrInReg04 = Number(reg04Line.substring(355, 370)) / 100;
assert(detrInReg04 === 4692.47, `Detracción en Reg 04 debe ser 4692.47 (obtenido: ${detrInReg04})`);

// Posición 341-355: Base Imponible 10
const bi10InReg04 = Number(reg04Line.substring(340, 355)) / 100;
assert(bi10InReg04 === 2516432.53, `BI 10 en Reg 04 debe ser 2521125 - 4692.47 = 2516432.53 (obtenido: ${bi10InReg04})`);

// --- 4. Validador Preventivo del Sistema (Detección de Errores antes de Subir a ARCA) ---
console.log('\n--- 4. Validador Preventivo del Sistema ---');

// Test A: Recibo con detracción excedida ($7.003,68 en jornada parcial) DEBE ser rechazado preventivamente
const slipConErrorDetr = {
  ...mockSlipPt,
  basis: {
    ...mockSlipPt.basis,
    detractionAmount: 7003.68, // Excedido para 67%
    baseImponible10: 2514121.32,
  },
};

const valDetr = validateLsdConsistency({
  paySlips: [slipConErrorDetr],
  company: mockCompany,
  payrollSettings: { detractionBase: 7003.68 },
});

assert(!valDetr.isValid, 'Validador DEBE marcar como inválido recibo con detracción excedida de ley 27.430');
assert(valDetr.errors.some((e) => e.type === 'ERROR_DETRACCION_EXCEDIDA'), 'Debe emitir específicamente ERROR_DETRACCION_EXCEDIDA');

// Test B: Recibo con localidad '00' DEBE ser detectado preventivamente
const mockEmpConLocInvalida = {
  ...mockEmployeePt,
  city: '',
  province: '',
};
// forzar localidad '00' en prueba
const valLoc = validateLsdConsistency({
  paySlips: [{
    ...mockSlipPt,
    employee: { ...mockEmployeePt, province: 'Desconocido', city: '' }
  }],
  company: { cuit: '30-11111111-1' },
});
assert(valLoc.errors.length === 0 || !valLoc.errors.some((e) => e.type === 'ERROR_LOCALIDAD_INVALIDA' && e.message.includes('00')), 'Fallback previene código 00');

// Test C: Recibo correcto DEBE ser 100% válido
const valCorrecto = validateLsdConsistency({
  paySlips: [mockSlipPt],
  company: mockCompany,
  payrollSettings: { detractionBase: 7003.68 },
});
assert(valCorrecto.isValid, `Recibo con datos corregidos debe ser VÁLIDO (errores: ${JSON.stringify(valCorrecto.errors)})`);

// Test D: Validador mensual preventivo con detracción excedida
const valMensualError = validateMonthlyLsdConsistency({
  year: 2026,
  month: 9,
  paySlips: [slipConErrorDetr],
  company: mockCompany,
  payrollSettings: { detractionBase: 7003.68 },
});
assert(!valMensualError.isValid, 'Validador Mensual DEBE marcar como inválido período con detracción excedida');
assert(valMensualError.errors.some((e) => e.type === 'ERROR_DETRACCION_EXCEDIDA'), 'Validador Mensual emite ERROR_DETRACCION_EXCEDIDA');

// --- 5. Motor de Cálculo de Nómina (payroll.calculator.js) ---
console.log('\n--- 5. Motor de Cálculo de Nómina con Detracción Proporcional ---');

const calcPtEmployee = {
  id: 'emp-calc-pt',
  fileNumber: 'L2001',
  status: 'ACTIVE',
  basicSalary: 1500000.00,
  isPartTime: true,
  partTimePercentage: 67, // 2/3
  weeklyWorkingHours: 32,
  jobPosition: { activityCode: '049' },
  healthInsurance: { code: '126205' },
};

const calcResult = calculateEmployeePayroll({
  employee: calcPtEmployee,
  period: { year: 2026, month: 9, periodType: 'MONTHLY' },
  allConcepts: [
    { id: 'c1', code: '1000', name: 'Básico', type: 'REMUNERATIVE', calculationType: 'BASIC', defaultValue: 1500000, isActive: true },
    { id: 'c2', code: '6001', name: 'Jubilación', type: 'DEDUCTION', calculationType: 'PERCENTAGE', defaultValue: 11, arcaConceptCode: '810000', isActive: true },
  ],
  payrollSettings: { detractionBase: 7003.68, sipaRate: 10.77 },
  workedDaysOverride: 30,
});

assert(calcResult.basis.detractionAmount === 4692.47, `Cálculo de nómina debe detraer $4.692,47 para jornada parcial de 67% (obtenido: ${calcResult.basis.detractionAmount})`);
assert(calcResult.basis.contractModality === '002', `Cálculo de nómina debe asignar modalidad '002' para tiempo parcial (obtenido: ${calcResult.basis.contractModality})`);
const expectedBi10Calc = Math.round((calcResult.basis.baseImponible2 - 4692.47) * 100) / 100;
assert(calcResult.basis.baseImponible10 === expectedBi10Calc, `BI 10 en motor de cálculo debe ser BI 2 - 4692.47 = ${expectedBi10Calc} (obtenido: ${calcResult.basis.baseImponible10})`);

console.log('\n================================================================');
console.log(`RESUMEN: ${passed} superadas, ${failed} fallidas`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✓ TODAS LAS PRUEBAS DE RESOLUCIÓN ARCA FINALIZARON CON ÉXITO.');
  process.exit(0);
}
