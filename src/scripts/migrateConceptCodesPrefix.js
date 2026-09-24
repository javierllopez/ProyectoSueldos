/**
 * migrateConceptCodesPrefix.js
 * Script de migración y normalización de conceptos salariales al formato con prefijo AA0000.
 *
 * Mapeos prioritarios:
 *   - 1000 -> SU1000 (Sueldo Básico)
 *   - 1001 -> SU1001 (Asignación Estímulo Ley 26.427)
 *   - 1200 -> SA1000 (Sueldo Anual Complementario / SAC)
 *   - 1500 -> VA1000 (Adelanto Vacacional)
 *   - 6001 -> GE6001 (Jubilación SIPA)
 *   - 6002 -> GE6002 (INSSJyP Ley 19.032)
 *   - 6003 -> GE6003 (Obra Social)
 *   - 6004 -> GE6004 (Cuota Sindical)
 *
 * Para los demás conceptos numéricos existentes:
 *   - Determina el prefijo según el periodType del concepto (MONTHLY -> SU, SAC -> SA, VACATIONS -> VA, ALL -> GE, etc.)
 *   - Genera el código AA0000 con los 4 dígitos correspondientes.
 *
 * Además:
 *   1. Actualiza los tokens de conceptos en todas las fórmulas (ej: [1000] -> [SU1000], [1200] -> [SA1000], etc.).
 *   2. Actualiza el inputConceptCode en matrices si apuntaba a un concepto renombrado.
 *   3. Actualiza conceptCode en los ítems de recibos históricos (pay_slip_items).
 *   4. Valida la consistencia de todas las fórmulas tras la migración.
 */

import prisma from '../config/prisma.js';
import tenantConnectionManager from '../services/tenantConnectionManager.js';
import { validateConceptFormula } from '../modules/payroll/formulaValidator.js';
import { VALID_CONCEPT_PREFIXES } from '../modules/payroll/payroll.validation.js';

const EXPLICIT_CODE_MAP = {
  '1000': 'SU1000',
  '1001': 'SU1001',
  '1010': 'SU1010',
  '1020': 'SU1020',
  '1200': 'SA1000',
  '1500': 'VA1000',
  '6001': 'GE6001',
  '6002': 'GE6002',
  '6003': 'GE6003',
  '6004': 'GE6004',
  '301': 'GE6001',
  '302': 'GE6002',
  '303': 'GE6003',
  '304': 'GE6004',
};

/**
 * Resuelve el nuevo código normalizado AA0000 para un concepto.
 */
function resolvePrefixedConceptCode(concept, currentCodesSet, assignedNewCodesSet) {
  const code = String(concept.code || '').trim().toUpperCase();

  // Si el concepto está eliminado o es un código legacy anterior, no migrar
  if (concept.deletedAt !== null || code.includes('_LEGACY_')) {
    return null;
  }

  // Si ya tiene el formato válido AA0000:
  if (/^[A-Z]{2}[0-9]{4}$/.test(code)) {
    const prefix = code.slice(0, 2);
    if (VALID_CONCEPT_PREFIXES.has(prefix)) {
      return null; // Ya está migrado
    }
  }

  let candidate = null;

  // Si tiene mapeo explícito predeterminado:
  if (EXPLICIT_CODE_MAP[code]) {
    candidate = EXPLICIT_CODE_MAP[code];
  } else {
    // Determinar prefijo según tipo de liquidación y tipo de concepto
    const pType = String(concept.periodType || '').toUpperCase();
    const cType = String(concept.type || '').toUpperCase();

    let prefix = 'GE';
    if (pType === 'MONTHLY') prefix = 'SU';
    else if (pType === 'SAC' || pType === 'SAC_1' || pType === 'SAC_2') prefix = 'SA';
    else if (pType === 'VACATIONS') prefix = 'VA';
    else if (pType === 'FINAL') prefix = 'FI';
    else if (pType === 'QUINCE_1' || pType === 'QUINCE_2') prefix = 'QU';
    else {
      // pType === 'ALL' o no definido
      if (cType === 'DEDUCTION' || cType === 'AUXILIARY') prefix = 'GE';
      else prefix = 'SU';
    }

    // Extraer o generar los 4 dígitos
    const numMatch = code.match(/(\d{1,4})/);
    let numPart = numMatch ? parseInt(numMatch[1], 10) : null;

    if (numPart === null || isNaN(numPart) || numPart <= 0) {
      if (cType === 'REMUNERATIVE') numPart = 1100;
      else if (cType === 'NON_REMUNERATIVE') numPart = 4100;
      else if (cType === 'DEDUCTION') numPart = 6100;
      else numPart = 9100;
    } else {
      // Normalizar a los rangos de tipo si correspondía a un código antiguo corto
      if (cType === 'REMUNERATIVE' && numPart < 1000) numPart = numPart < 400 ? numPart * 10 : 1000 + numPart;
      else if (cType === 'NON_REMUNERATIVE' && numPart < 4000) numPart = 4000 + (numPart % 1000);
      else if (cType === 'DEDUCTION' && numPart < 6000) numPart = 6000 + (numPart % 1000);
      else if (cType === 'AUXILIARY' && numPart < 9000) numPart = 9000 + (numPart % 1000);
    }

    candidate = `${prefix}${String(numPart).padStart(4, '0')}`;
  }

  // Si ya está ocupado por otro concepto en esta misma corrida:
  let counter = 1;
  const basePrefix = candidate.slice(0, 2);
  const baseNum = parseInt(candidate.slice(2), 10);
  while (assignedNewCodesSet.has(candidate)) {
    candidate = `${basePrefix}${String(baseNum + counter).padStart(4, '0')}`;
    counter++;
  }

  return candidate;
}

/**
 * Reemplaza tokens de códigos viejos en una expresión o fórmula.
 */
function updateFormulaTokens(formula, codeMap) {
  if (!formula || typeof formula !== 'string') return formula;

  return formula.replace(/\[([^\]]+)\]/g, (match, inner) => {
    const trimmed = inner.trim();
    const upper = trimmed.toUpperCase();

    // 1. Si es métrica histórica [METRICA:CODE]
    const colonIdx = upper.indexOf(':');
    if (colonIdx !== -1) {
      const prefix = trimmed.substring(0, colonIdx);
      const target = trimmed.substring(colonIdx + 1).trim();
      if (codeMap[target]) {
        return `[${prefix}:${codeMap[target]}]`;
      }
      return match;
    }

    // 2. Token de concepto simple [CODE]
    if (codeMap[trimmed]) {
      return `[${codeMap[trimmed]}]`;
    }

    return match;
  });
}

/**
 * Procesa la migración en un tenant específico.
 */
export async function migrateTenantConceptCodes(company) {
  console.log(`\n======================================================`);
  console.log(`Migrando empresa a códigos AA0000: ${company.name} (${company.dbName})`);
  console.log(`======================================================`);

  const tenantPrisma = await tenantConnectionManager.getTenantClient(company);

  const concepts = await tenantPrisma.concept.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  if (concepts.length === 0) {
    console.log('No se encontraron conceptos en esta empresa.');
    return { success: true, migratedCount: 0 };
  }

  const currentCodesSet = new Set(concepts.map((c) => c.code));
  const assignedNewCodesSet = new Set();
  const codeMapping = {}; // { oldCode: newCode }
  const conceptsToUpdate = [];

  for (const c of concepts) {
    const newCode = resolvePrefixedConceptCode(c, currentCodesSet, assignedNewCodesSet);
    if (newCode && newCode !== c.code) {
      codeMapping[c.code] = newCode;
      assignedNewCodesSet.add(newCode);

      // Determinar periodType adecuado según prefijo si estaba en ALL o desincronizado
      let updatedPeriodType = c.periodType;
      const prefix = newCode.slice(0, 2);
      if (prefix === 'SU') updatedPeriodType = 'MONTHLY';
      else if (prefix === 'SA') updatedPeriodType = 'SAC';
      else if (prefix === 'VA') updatedPeriodType = 'VACATIONS';
      else if (prefix === 'FI') updatedPeriodType = 'FINAL';
      else if (prefix === 'QU') updatedPeriodType = 'QUINCE_1';
      else if (prefix === 'GE') updatedPeriodType = 'ALL';

      conceptsToUpdate.push({
        id: c.id,
        oldCode: c.code,
        newCode,
        name: c.name,
        type: c.type,
        periodType: updatedPeriodType,
      });
    }
  }

  if (conceptsToUpdate.length > 0) {
    console.log(`Se detectaron ${conceptsToUpdate.length} conceptos para migrar:`);
    for (const item of conceptsToUpdate) {
      console.log(`  - [${item.oldCode}] -> [${item.newCode}] | ${item.name} (${item.periodType})`);
    }

    // 2. Ejecutar actualización en dos fases para respetar unicidad en DB
    // Fase A: Código temporal único
    for (const item of conceptsToUpdate) {
      const tempCode = `_T_${item.id.substring(0, 6)}_${item.newCode}`;
      await tenantPrisma.concept.update({
        where: { id: item.id },
        data: { code: tempCode },
      });
    }

    // Fase B: Asignar nuevo código final, periodType y orden de cálculo
    for (const item of conceptsToUpdate) {
      const isBasic = item.newCode === 'SU1000' || /sueldo\s*b[aá]sico/i.test(item.name);
      const numPart = parseInt(item.newCode.slice(2), 10);
      const calcOrder = isBasic ? 10 : (numPart || 100);

      await tenantPrisma.concept.update({
        where: { id: item.id },
        data: {
          code: item.newCode,
          periodType: item.periodType,
          calculationOrder: calcOrder,
        },
      });
    }
    console.log(`✓ Códigos de conceptos actualizados a formato AA0000.`);
  } else {
    console.log('✓ Todos los conceptos ya cumplen con el formato prefijado AA0000.');
  }

  // 3. Liberar códigos de conceptos soft-deleted para evitar colisiones
  const deletedConcepts = await tenantPrisma.concept.findMany({
    where: { deletedAt: { not: null } },
  });
  for (const dc of deletedConcepts) {
    if (!dc.code.includes('_DELETED_') && !dc.code.includes('_LEGACY_')) {
      const freedCode = `${dc.code}_DELETED_${dc.id.substring(0, 8)}`;
      await tenantPrisma.concept.update({
        where: { id: dc.id },
        data: { code: freedCode },
      });
      console.log(`  Liberado código de concepto eliminado [${dc.code}] -> [${freedCode}]`);
    }
  }

  // Normalización puntual de conceptos activos si quedaron desfasados por corridas previas
  const allUpdatedConcepts = await tenantPrisma.concept.findMany({ where: { deletedAt: null } });
  for (const c of allUpdatedConcepts) {
    if (c.code === 'SU4276' && /est[ií]mulo/i.test(c.name)) {
      await tenantPrisma.concept.update({ where: { id: c.id }, data: { code: 'SU1001', calculationOrder: 1001 } });
      c.code = 'SU1001';
      c.calculationOrder = 1001;
      console.log(`  Concepto Asignación Estímulo normalizado a [SU1001] (orden 1001)`);
    } else if (c.code === 'SU1001') {
      await tenantPrisma.concept.update({ where: { id: c.id }, data: { calculationOrder: 1001 } });
      c.calculationOrder = 1001;
    } else if (c.code === 'SU1570' && /ausente/i.test(c.name)) {
      await tenantPrisma.concept.update({ where: { id: c.id }, data: { code: 'SU1040', calculationOrder: 1040 } });
      c.code = 'SU1040';
      c.calculationOrder = 1040;
      console.log(`  Concepto Ausente normalizado a [SU1040] (orden 1040)`);
    } else if (c.code === 'SU1040') {
      await tenantPrisma.concept.update({ where: { id: c.id }, data: { calculationOrder: 1040 } });
      c.calculationOrder = 1040;
    } else if (c.code === 'SU2320' && /empresa/i.test(c.name)) {
      await tenantPrisma.concept.update({ where: { id: c.id }, data: { code: 'SU1022', calculationOrder: 1022 } });
      c.code = 'SU1022';
      c.calculationOrder = 1022;
      console.log(`  Concepto Adicional Empresa normalizado a [SU1022] (orden 1022)`);
    } else if (c.code === 'SU1022') {
      await tenantPrisma.concept.update({ where: { id: c.id }, data: { calculationOrder: 1022 } });
      c.calculationOrder = 1022;
    } else if (c.code === 'SU9098' && /conformado/i.test(c.name)) {
      await tenantPrisma.concept.update({ where: { id: c.id }, data: { code: 'SU9030', calculationOrder: 1030 } });
      c.code = 'SU9030';
      c.calculationOrder = 1030;
      console.log(`  Concepto Sueldo Básico Conformado normalizado a [SU9030] (orden 1030)`);
    } else if (c.code === 'SU9030') {
      await tenantPrisma.concept.update({ where: { id: c.id }, data: { calculationOrder: 1030 } });
      c.calculationOrder = 1030;
    }
  }

  const comprehensiveCodeMap = {
    '1000': 'SU1000',
    '1001': 'SU1001',
    '1002': 'SU9002',
    '1010': 'SU1010',
    '1020': 'SU1020',
    '1021': 'SU1021',
    '1022': 'SU1022',
    '1030': 'SU9030',
    '1040': 'SU1040',
    '1200': 'SA1000',
    '1500': 'VA1000',
    '2100': 'SU2100',
    '3100': 'SU3100',
    '4001': 'SU4001',
    '6001': 'GE6001',
    '6002': 'GE6002',
    '6003': 'GE6003',
    '6004': 'GE6004',
    ...codeMapping,
  };

  let formulasUpdated = 0;

  for (const c of allUpdatedConcepts) {
    if (c.formula) {
      let updatedFormula = updateFormulaTokens(c.formula, comprehensiveCodeMap);
      // Reemplazo especial para Vacaciones
      if (c.code === 'VA1000') {
        updatedFormula = updatedFormula.replace(/\[(?:1000|SU1000)\]/g, '[SU1000]');
      }
      // Reemplazo de coma decimal por punto (ej. 0,25 -> 0.25)
      updatedFormula = updatedFormula.replace(/(\d+),(\d+)/g, '$1.$2');

      if (updatedFormula !== c.formula) {
        await tenantPrisma.concept.update({
          where: { id: c.id },
          data: { formula: updatedFormula },
        });
        console.log(`  Fórmula actualizada en [${c.code}] ${c.name}: "${c.formula}" -> "${updatedFormula}"`);
        formulasUpdated++;
        c.formula = updatedFormula;
      }
    }
  }
  console.log(`✓ Fórmulas auditadas (${formulasUpdated} actualizadas).`);

  // 4. Actualizar matrices
  const matrices = await tenantPrisma.payrollMatrix.findMany({ where: { deletedAt: null } });
  let matricesUpdated = 0;
  for (const m of matrices) {
    if (m.inputConceptCode && codeMapping[m.inputConceptCode]) {
      const newInputCode = codeMapping[m.inputConceptCode];
      await tenantPrisma.payrollMatrix.update({
        where: { id: m.id },
        data: { inputConceptCode: newInputCode },
      });
      console.log(`  Matriz [${m.code}]: inputConceptCode "${m.inputConceptCode}" -> "${newInputCode}"`);
      matricesUpdated++;
    }
  }

  // 5. Actualizar items de recibos históricos (pay_slip_items)
  let slipItemsUpdated = 0;
  for (const [oldCode, newCode] of Object.entries(codeMapping)) {
    const updateRes = await tenantPrisma.paySlipItem.updateMany({
      where: { conceptCode: oldCode },
      data: { conceptCode: newCode },
    });
    if (updateRes.count > 0) {
      slipItemsUpdated += updateRes.count;
    }
  }
  console.log(`✓ Historial de liquidaciones sincronizado (${slipItemsUpdated} renglones de recibo actualizados).`);

  // 6. Validar fórmulas tras la migración
  const finalConcepts = await tenantPrisma.concept.findMany({ where: { deletedAt: null } });
  const finalMatrices = await tenantPrisma.payrollMatrix.findMany({ where: { deletedAt: null } });
  const finalFixedValues = await tenantPrisma.payrollFixedValue.findMany({ where: { deletedAt: null } });

  let formulaErrors = 0;
  for (const c of finalConcepts) {
    if (c.formula && c.calculationType === 'FORMULA') {
      const val = validateConceptFormula({
        formula: c.formula,
        conceptCode: c.code,
        calculationOrder: c.calculationOrder,
        allConcepts: finalConcepts,
        matrices: finalMatrices,
        fixedValues: finalFixedValues,
      });
      if (!val.isValid) {
        console.error(`  [ALERTA] Inconsistencia en fórmula de concepto [${c.code}]: ${val.errors.join(' | ')}`);
        formulaErrors++;
      }
    }
  }

  if (formulaErrors === 0) {
    console.log(`✓ 100% de las fórmulas verificadas y válidas.`);
  }

  return { success: true, migratedCount: conceptsToUpdate.length };
}

/**
 * Ejecutor principal para todos los tenants activos.
 */
async function main() {
  console.log('Iniciando migración de códigos de concepto a formato AA0000 en todos los tenants...');

  try {
    const companies = await prisma.companyRegistry.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
    });

    console.log(`Empresas activas encontradas: ${companies.length}`);

    let totalMigrated = 0;
    for (const company of companies) {
      try {
        const res = await migrateTenantConceptCodes(company);
        totalMigrated += res.migratedCount;
      } catch (err) {
        console.error(`Error procesando empresa ${company.name}:`, err.message);
      }
    }

    console.log(`\n======================================================`);
    console.log(`MIGRACIÓN FINALIZADA CON ÉXITO. Total de conceptos migrados: ${totalMigrated}`);
    console.log(`======================================================`);
  } catch (err) {
    console.error('Error general durante la migración:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

if (process.argv[1]?.endsWith('migrateConceptCodesPrefix.js')) {
  main();
}
