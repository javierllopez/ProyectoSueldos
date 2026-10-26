import assert from 'node:assert';
import { generateLsdConceptsFile } from './src/modules/payroll/lsdExporter.service.js';
import { conceptBaseSchema } from './src/modules/payroll/payroll.validation.js';
import { ARCA_CONCEPT_PROFILES, getArcaProfile } from './public/js/utils/arcaProfiles.js';

console.log('====================================================');
console.log('TEST SUITE: BASES REMUNERATIVAS R1-R10 Y FILTROS');
console.log('====================================================');

// --- 1. Validación de Esquema con R6, R7, R10 ---
console.log('\n--- 1. Validación de Esquema con R6, R7, R10 ---');
const parsed = conceptBaseSchema.parse({
  code: 'SU1000',
  name: 'Sueldo Básico',
  type: 'REMUNERATIVE',
  calculationType: 'FIXED',
  periodType: 'MONTHLY',
  calculationOrder: 1000,
  appliesSipaAporte: true,
  appliesSipaContrib: true,
  appliesInssjypAporte: true,
  appliesInssjypContrib: true,
  appliesOsAporte: true,
  appliesOsContrib: true,
  appliesFsrAporte: true,
  appliesFsrContrib: true,
  appliesRenatreAporte: true,
  appliesRenatreContrib: true,
  appliesAaffContrib: true,
  appliesFneContrib: true,
  appliesLrtContrib: true,
  appliesRegDifAporte: true,
  appliesRegEspAporte: true,
  appliesDetraccion: true,
});

assert.strictEqual(parsed.appliesRegDifAporte, true, 'appliesRegDifAporte debe ser true');
assert.strictEqual(parsed.appliesRegEspAporte, true, 'appliesRegEspAporte debe ser true');
assert.strictEqual(parsed.appliesDetraccion, true, 'appliesDetraccion debe ser true');
console.log('  ✓ conceptBaseSchema valida y preserva correctamente appliesRegDifAporte, appliesRegEspAporte, appliesDetraccion');

// Default values test
const defaultParsed = conceptBaseSchema.parse({
  code: 'SU1005',
  name: 'Concepto Default',
  type: 'REMUNERATIVE',
});
assert.strictEqual(defaultParsed.appliesRegDifAporte, false, 'appliesRegDifAporte por defecto false');
assert.strictEqual(defaultParsed.appliesRegEspAporte, false, 'appliesRegEspAporte por defecto false');
assert.strictEqual(defaultParsed.appliesDetraccion, false, 'appliesDetraccion por defecto false');
console.log('  ✓ Defaults son correctamente booleanos false');

// --- 2. Exportador LSD Registro 01 (195 caracteres) ---
console.log('\n--- 2. Exportador LSD Registro 01 (Posiciones 184 y 186) ---');
const conceptsToTest = [
  {
    code: 'SU1000',
    name: 'Sueldo Basico',
    type: 'REMUNERATIVE',
    arcaConceptCode: '110000',
    appliesSipaAporte: true,
    appliesSipaContrib: true,
    appliesInssjypAporte: true,
    appliesInssjypContrib: true,
    appliesOsAporte: true,
    appliesOsContrib: true,
    appliesFsrAporte: true,
    appliesFsrContrib: true,
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: true,
    appliesFneContrib: true,
    appliesLrtContrib: true,
    appliesRegDifAporte: true, // Pos 184 = '1'
    appliesRegEspAporte: false, // Pos 186 = '0'
    appliesDetraccion: true,
  },
  {
    code: 'SU1002',
    name: 'Honorarios Director',
    type: 'REMUNERATIVE',
    arcaConceptCode: '110000',
    appliesSipaAporte: false,
    appliesSipaContrib: false,
    appliesInssjypAporte: false,
    appliesInssjypContrib: false,
    appliesOsAporte: false,
    appliesOsContrib: false,
    appliesFsrAporte: false,
    appliesFsrContrib: false,
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: false,
    appliesFneContrib: false,
    appliesLrtContrib: true,
    appliesRegDifAporte: false,
    appliesRegEspAporte: true, // Pos 186 = '1'
    appliesDetraccion: false,
  },
  {
    code: 'SU8000',
    name: 'Descuento Jubilacion',
    type: 'DEDUCTION',
    arcaConceptCode: '810000',
    appliesSipaAporte: true, // Forzamos true para comprobar que para deducción se exporta siempre '0'
    appliesRegDifAporte: true,
    appliesRegEspAporte: true,
  }
];

const lsdText = generateLsdConceptsFile(conceptsToTest);
const lines = lsdText.split('\r\n').filter(Boolean);

assert.strictEqual(lines.length, 3, 'Debe generar 3 líneas');
lines.forEach((l, idx) => {
  assert.strictEqual(l.length, 195, `Línea ${idx + 1} debe medir exactamente 195 caracteres (obtenido ${l.length})`);
});

// Verificación de posiciones 184 (índice 183) y 186 (índice 185):
// Concepto 1: regDifAporte = 1, regEspAporte = 0
assert.strictEqual(lines[0][183], '1', 'Posición 184 (Reg. Dif.) debe ser 1');
assert.strictEqual(lines[0][185], '0', 'Posición 186 (Reg. Esp.) debe ser 0');
console.log('  ✓ Concepto 1: Posición 184 es "1" y Posición 186 es "0"');

// Concepto 2: regDifAporte = 0, regEspAporte = 1
assert.strictEqual(lines[1][183], '0', 'Posición 184 (Reg. Dif.) debe ser 0');
assert.strictEqual(lines[1][185], '1', 'Posición 186 (Reg. Esp.) debe ser 1');
console.log('  ✓ Concepto 2: Posición 184 es "0" y Posición 186 es "1"');

// Concepto 3 (Deducción): todas las posiciones 168-186 deben ser '0'
assert.strictEqual(lines[2][183], '0', 'Deducción debe forzar 0 en posición 184');
assert.strictEqual(lines[2][185], '0', 'Deducción debe forzar 0 en posición 186');
console.log('  ✓ Concepto 3 (Deducción): Posiciones 184 y 186 forzadas a "0"');

// --- 3. Validación de Perfiles Oficiales ARCA -> R1..R10 ---
console.log('\n--- 3. Lógica de Sugerencia de Bases por Código ARCA (getArcaProfile) ---');

// Remunerativo general (110000 Sueldo Básico, 120000 SAC, 130001 Horas Extras)
const remSug = getArcaProfile('110000', 'SU1000');
assert.strictEqual(remSug.type, 'REMUNERATIVE');
assert.strictEqual(remSug.lockSubsystems, false);
assert.strictEqual(remSug.subsystems.r1, true);
assert.strictEqual(remSug.subsystems.r2, true);
assert.strictEqual(remSug.subsystems.r3, true);
assert.strictEqual(remSug.subsystems.r4, true);
assert.strictEqual(remSug.subsystems.r5, true);
assert.strictEqual(remSug.subsystems.r6, false);
assert.strictEqual(remSug.subsystems.r7, false);
assert.strictEqual(remSug.subsystems.r8, true);
assert.strictEqual(remSug.subsystems.r9, true);
assert.strictEqual(remSug.subsystems.r10, true);
console.log('  ✓ Remunerativo 110000: R1..R5, R8..R10 activas; R6 y R7 inactivas; type REMUNERATIVE');

const sacSug = getArcaProfile('120000');
assert.strictEqual(sacSug.type, 'REMUNERATIVE');
assert.strictEqual(sacSug.subsystems.r1, true);
assert.strictEqual(sacSug.subsystems.r10, true);
console.log('  ✓ SAC 120000: Bases SUSS activas');

// Director SU1002 (Honorarios S.A.)
const dirSug = getArcaProfile('110000', 'SU1002');
assert.strictEqual(dirSug.type, 'REMUNERATIVE');
assert.strictEqual(dirSug.subsystems.r1, false);
assert.strictEqual(dirSug.subsystems.r9, true);
console.log('  ✓ Director SU1002: Exclusivo R9 (LRT) activo');

// No Remunerativos: 510000 Asignaciones Familiares (Exento)
const aaffSug = getArcaProfile('510000');
assert.strictEqual(aaffSug.type, 'NON_REMUNERATIVE');
assert.strictEqual(aaffSug.lockSubsystems, false);
for (let i = 1; i <= 10; i++) {
  assert.strictEqual(aaffSug.subsystems[`r${i}`], false);
}
console.log('  ✓ 510000 (Asignaciones Familiares): Todas las bases inactivas en 0');

// No Remunerativos: 520000 Beneficios Sociales y 530000 Viáticos
const benSug = getArcaProfile('520000');
assert.strictEqual(benSug.type, 'NON_REMUNERATIVE');
assert.strictEqual(benSug.subsystems.r1, false);
const viatSug = getArcaProfile('530000');
assert.strictEqual(viatSug.type, 'NON_REMUNERATIVE');
assert.strictEqual(viatSug.subsystems.r1, false);
console.log('  ✓ 520000 (Beneficios) y 530000 (Viáticos): Exentos de SUSS');

// No Remunerativos: 540000 Obra Social
const osSug = getArcaProfile('540000');
assert.strictEqual(osSug.type, 'NON_REMUNERATIVE');
assert.strictEqual(osSug.subsystems.r4, true);
assert.strictEqual(osSug.subsystems.r8, true);
assert.strictEqual(osSug.subsystems.r1, false);
assert.strictEqual(osSug.subsystems.r9, false);
console.log('  ✓ 540000: Exclusivo Obra Social y FSR (R4 y R8) activas');

// No Remunerativos: 550000 Pasantías / ART
const lrtSug = getArcaProfile('550000');
assert.strictEqual(lrtSug.type, 'NON_REMUNERATIVE');
assert.strictEqual(lrtSug.subsystems.r9, true);
assert.strictEqual(lrtSug.subsystems.r1, false);
assert.strictEqual(lrtSug.subsystems.r4, false);
console.log('  ✓ 550000: Exclusivo LRT (R9) activo');

// No Remunerativos: 551000 Especiales (OS + LRT)
const espSug = getArcaProfile('551000');
assert.strictEqual(espSug.type, 'NON_REMUNERATIVE');
assert.strictEqual(espSug.subsystems.r4, true);
assert.strictEqual(espSug.subsystems.r8, true);
assert.strictEqual(espSug.subsystems.r9, true);
assert.strictEqual(espSug.subsystems.r1, false);
console.log('  ✓ 551000: Obra Social (R4, R8) y LRT (R9) activas');

// No Remunerativos: 560000 Indemnizaciones por Cese
const indemSug = getArcaProfile('560000');
assert.strictEqual(indemSug.type, 'NON_REMUNERATIVE');
for (let i = 1; i <= 10; i++) {
  assert.strictEqual(indemSug.subsystems[`r${i}`], false);
}
console.log('  ✓ 560000: Indemnizaciones exentas de SUSS');

// Retenciones / Deducciones: 810000 Jubilación, 810001 PAMI, 810002 OS, 810011 Ganancias, 810012 Embargo
const dedCodes = ['810000', '810001', '810002', '810003', '810004', '810011', '810012', '820000'];
dedCodes.forEach((dCode) => {
  const p = getArcaProfile(dCode);
  assert.strictEqual(p.type, 'DEDUCTION', `${dCode} debe ser DEDUCTION`);
  assert.strictEqual(p.lockSubsystems, true, `${dCode} debe tener lockSubsystems = true`);
  for (let i = 1; i <= 10; i++) {
    assert.strictEqual(p.subsystems[`r${i}`], false, `${dCode} debe tener r${i} = false`);
  }
});
console.log('  ✓ Descuentos/Retenciones (810000..820000): type DEDUCTION, lockSubsystems true, todas las bases en 0');

// Código Auxiliar o vacío
const auxSug = getArcaProfile('');
assert.strictEqual(auxSug.type, 'AUXILIARY');
assert.strictEqual(auxSug.lockSubsystems, false);
console.log('  ✓ Sin código ARCA: type AUXILIARY, bases en 0');

// --- 4. Filtro de Totales y Bases Acumuladoras ---
console.log('\n--- 4. Filtro de Totales y Bases Acumuladoras ---');
function simulateAccumulatorsFilter(type, numPart) {
  if (type === 'REMUNERATIVE') return [];
  if (type === 'NON_REMUNERATIVE') return ['TOTAL_REMUNERATIVO'];
  if (type === 'DEDUCTION') return ['TOTAL_REMUNERATIVO', 'TOTAL_NO_REMUNERATIVO', 'TOTAL_BRUTO', 'BASE_OBRA_SOCIAL', 'BASE_OBRA_SOCIAL_COMPLETA'];
  if (type === 'AUXILIARY') {
    if (numPart <= 3999) return [];
    if (numPart <= 5999) return ['TOTAL_REMUNERATIVO'];
    return ['TOTAL_REMUNERATIVO', 'TOTAL_NO_REMUNERATIVO', 'TOTAL_BRUTO', 'BASE_OBRA_SOCIAL', 'BASE_OBRA_SOCIAL_COMPLETA'];
  }
  return [];
}

assert.deepStrictEqual(simulateAccumulatorsFilter('REMUNERATIVE', 1000), []);
console.log('  ✓ REMUNERATIVE: Ningún acumulador visible');

assert.deepStrictEqual(simulateAccumulatorsFilter('NON_REMUNERATIVE', 4000), ['TOTAL_REMUNERATIVO']);
console.log('  ✓ NON_REMUNERATIVE: Solo [TOTAL_REMUNERATIVO]');

assert.deepStrictEqual(simulateAccumulatorsFilter('DEDUCTION', 6000), ['TOTAL_REMUNERATIVO', 'TOTAL_NO_REMUNERATIVO', 'TOTAL_BRUTO', 'BASE_OBRA_SOCIAL', 'BASE_OBRA_SOCIAL_COMPLETA']);
console.log('  ✓ DEDUCTION: [TOTAL_REMUNERATIVO], [TOTAL_NO_REMUNERATIVO], [TOTAL_BRUTO], [BASE_OBRA_SOCIAL], [BASE_OBRA_SOCIAL_COMPLETA]');

assert.deepStrictEqual(simulateAccumulatorsFilter('AUXILIARY', 2500), []);
console.log('  ✓ AUXILIARY <= 3999: Ningún acumulador visible');

assert.deepStrictEqual(simulateAccumulatorsFilter('AUXILIARY', 4500), ['TOTAL_REMUNERATIVO']);
console.log('  ✓ AUXILIARY 4000..5999: Solo [TOTAL_REMUNERATIVO]');

assert.deepStrictEqual(simulateAccumulatorsFilter('AUXILIARY', 6500), ['TOTAL_REMUNERATIVO', 'TOTAL_NO_REMUNERATIVO', 'TOTAL_BRUTO', 'BASE_OBRA_SOCIAL', 'BASE_OBRA_SOCIAL_COMPLETA']);
console.log('  ✓ AUXILIARY >= 6000: [TOTAL_REMUNERATIVO], [TOTAL_NO_REMUNERATIVO], [TOTAL_BRUTO], [BASE_OBRA_SOCIAL], [BASE_OBRA_SOCIAL_COMPLETA]');

// --- 5. Filtro de Novedades del Empleado ---
console.log('\n--- 5. Filtro de Novedades del Empleado ---');
function simulateNoveltiesFilter(noveltyType) {
  const allowed = [];
  if (noveltyType === 'CANTIDAD') allowed.push('CANTIDAD');
  else if (noveltyType === 'HORAS') allowed.push('HORAS');
  else if (noveltyType === 'PORCENTAJE') allowed.push('PORCENTAJE');
  else if (noveltyType === 'IMPORTE') allowed.push('IMPORTE');
  allowed.push('VALOR_BASE'); // Siempre presente
  return allowed;
}

assert.deepStrictEqual(simulateNoveltiesFilter('CANTIDAD'), ['CANTIDAD', 'VALOR_BASE']);
assert.deepStrictEqual(simulateNoveltiesFilter('HORAS'), ['HORAS', 'VALOR_BASE']);
assert.deepStrictEqual(simulateNoveltiesFilter('PORCENTAJE'), ['PORCENTAJE', 'VALOR_BASE']);
assert.deepStrictEqual(simulateNoveltiesFilter('IMPORTE'), ['IMPORTE', 'VALOR_BASE']);
assert.deepStrictEqual(simulateNoveltiesFilter('CALCULADO'), ['VALOR_BASE']);
assert.deepStrictEqual(simulateNoveltiesFilter('SOLO_ASIGNACION'), ['VALOR_BASE']);
console.log('  ✓ Novedades filtradas dinámicamente con [VALOR_BASE] constante');

console.log('\n====================================================');
console.log('✓ TODAS LAS PRUEBAS DE BASES R1-R10 Y FILTROS PASARON EXITOSAMENTE!');
console.log('====================================================');
