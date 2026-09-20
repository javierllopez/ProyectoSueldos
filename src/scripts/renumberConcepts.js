/**
 * renumberConcepts.js
 * Script de migración y normalización de conceptos salariales.
 * Renumera conceptos legacy (ej: 100, 101, 102, 201, 301, 302, 303, 304)
 * a los rangos normados oficiales del sistema:
 *   - Remunerativos: 1000..3999 (ej: 100 -> 1000, 101 -> 1010, 102 -> 1020)
 *   - No Remunerativos: 4000..5999 (ej: 201 -> 4001)
 *   - Deducciones: 6000..8999 (ej: 301 -> 6001, 302 -> 6002, 303 -> 6003, 304 -> 6004)
 *   - Auxiliares: > 0
 *
 * Además:
 *   1. Actualiza los tokens de conceptos en todas las fórmulas (ej: [100] -> [1000]).
 *   2. Actualiza el inputConceptCode en matrices si apuntaba a un concepto renombrado.
 *   3. Actualiza conceptCode en los ítems de recibos históricos (pay_slip_items).
 *   4. Ajusta calculationOrder (1 para Sueldo Básico 1000, o el código numérico para los demás).
 *   5. Valida la consistencia de todas las fórmulas tras la reenumeración.
 */

import prisma from '../config/prisma.js';
import tenantConnectionManager from '../services/tenantConnectionManager.js';
import { validateConceptFormula } from '../modules/payroll/formulaValidator.js';

const KNOWN_LEGACY_MAP = {
  // Remunerativos (1000..3999)
  '100': '1000', // Sueldo Básico
  '101': '1010', // Antigüedad
  '102': '1020', // Presentismo
  // No Remunerativos (4000..5999)
  '201': '4001', // Bono no remunerativo
  // Deducciones (6000..8999)
  '301': '6001', // Jubilación SIPA (11%)
  '302': '6002', // INSSJyP - Ley 19.032 (3%)
  '303': '6003', // Obra Social (3%)
  '304': '6004', // Cuota Sindical (2%)
};

/**
 * Determina el nuevo código normado para un concepto si no cumple con el rango de su tipo.
 */
function resolveNewConceptCode(concept, currentCodesSet, assignedNewCodesSet) {
  const code = String(concept.code || '').trim();
  const num = parseInt(code, 10);
  const type = String(concept.type || '').toUpperCase();

  // Si ya tiene un código legacy conocido:
  if (KNOWN_LEGACY_MAP[code]) {
    const candidate = KNOWN_LEGACY_MAP[code];
    if (!currentCodesSet.has(candidate) || currentCodesSet.has(code)) {
      return candidate;
    }
  }

  // Verificar si ya cumple con su rango normado
  if (!isNaN(num)) {
    if (type === 'REMUNERATIVE' && num >= 1000 && num <= 3999) return null;
    if (type === 'NON_REMUNERATIVE' && num >= 4000 && num <= 5999) return null;
    if (type === 'DEDUCTION' && num >= 6000 && num <= 8999) return null;
    if (type === 'AUXILIARY' && num > 0) return null;
  }

  // Si requiere reenumeración genérica:
  const isTaken = (cand) => currentCodesSet.has(cand) || assignedNewCodesSet.has(cand);

  if (type === 'REMUNERATIVE') {
    if (!isNaN(num) && num >= 100 && num <= 399) {
      const cand = String(num * 10);
      if (!isTaken(cand)) return cand;
    }
    for (let c = 1000; c <= 3999; c += 10) {
      const cand = String(c);
      if (!isTaken(cand)) return cand;
    }
  } else if (type === 'NON_REMUNERATIVE') {
    if (!isNaN(num) && num >= 200 && num <= 299) {
      const cand = String(4000 + (num - 200));
      if (!isTaken(cand)) return cand;
    }
    for (let c = 4001; c <= 5999; c++) {
      const cand = String(c);
      if (!isTaken(cand)) return cand;
    }
  } else if (type === 'DEDUCTION') {
    if (!isNaN(num) && num >= 300 && num <= 399) {
      const cand = String(6000 + (num - 300));
      if (!isTaken(cand)) return cand;
    }
    for (let c = 6001; c <= 8999; c++) {
      const cand = String(c);
      if (!isTaken(cand)) return cand;
    }
  } else if (type === 'AUXILIARY') {
    for (let c = 9001; c <= 9999; c++) {
      const cand = String(c);
      if (!isTaken(cand)) return cand;
    }
  }

  return null;
}

/**
 * Reemplaza tokens de códigos viejos en una expresión o fórmula.
 */
function updateFormulaTokens(formula, codeMap) {
  if (!formula || typeof formula !== 'string') return formula;

  // Reemplazar tokens [CODE] o [METRICA:CODE]
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
 * Procesa la reenumeración de conceptos en un tenant específico.
 */
export async function renumberTenantConcepts(company) {
  console.log(`\n======================================================`);
  console.log(`Procesando empresa: ${company.name} (${company.dbName})`);
  console.log(`======================================================`);

  const tenantPrisma = await tenantConnectionManager.getTenantClient(company);

  // 1. Obtener todos los conceptos de la empresa
  const concepts = await tenantPrisma.concept.findMany({
    orderBy: { createdAt: 'asc' },
  });

  if (concepts.length === 0) {
    console.log('No se encontraron conceptos en esta empresa.');
    return { success: true, renumberedCount: 0 };
  }

  const currentCodesSet = new Set(concepts.map((c) => c.code));
  const assignedNewCodesSet = new Set();
  const codeMapping = {}; // { oldCode: newCode }
  const conceptsToUpdate = [];

  for (const c of concepts) {
    const newCode = resolveNewConceptCode(c, currentCodesSet, assignedNewCodesSet);
    if (newCode && newCode !== c.code) {
      codeMapping[c.code] = newCode;
      assignedNewCodesSet.add(newCode);
      conceptsToUpdate.push({
        id: c.id,
        oldCode: c.code,
        newCode,
        name: c.name,
        type: c.type,
      });
    }
  }

  if (conceptsToUpdate.length === 0) {
    console.log('✓ Todos los conceptos ya cumplen con los rangos normados del sistema.');
    return { success: true, renumberedCount: 0 };
  }

  console.log(`Se detectaron ${conceptsToUpdate.length} conceptos que requieren reenumeración:`);
  for (const item of conceptsToUpdate) {
    console.log(`  - [${item.oldCode}] -> [${item.newCode}] | ${item.name} (${item.type})`);
  }

  // 2. Ejecutar actualización en dos fases para respetar unicidad en DB
  // Fase A: Asignar código temporal para evitar colisiones UNIQUE
  for (const item of conceptsToUpdate) {
    const tempCode = `__TMP_${item.id.substring(0, 6)}_${item.newCode}`;
    await tenantPrisma.concept.update({
      where: { id: item.id },
      data: { code: tempCode },
    });
  }

  // Fase B: Asignar nuevo código final y orden de cálculo
  for (const item of conceptsToUpdate) {
    const isBasic = item.newCode === '1000' || /sueldo\s*b[aá]sico/i.test(item.name);
    const calcOrder = isBasic ? 1 : parseInt(item.newCode, 10) || 100;

    await tenantPrisma.concept.update({
      where: { id: item.id },
      data: {
        code: item.newCode,
        calculationOrder: calcOrder,
      },
    });
  }

  console.log(`✓ Códigos de conceptos actualizados correctamente en base de datos.`);

  // 3. Actualizar fórmulas de conceptos que hagan referencia a códigos antiguos
  const allUpdatedConcepts = await tenantPrisma.concept.findMany();
  let formulasUpdated = 0;

  for (const c of allUpdatedConcepts) {
    if (c.formula) {
      const newFormula = updateFormulaTokens(c.formula, codeMapping);
      if (newFormula !== c.formula) {
        await tenantPrisma.concept.update({
          where: { id: c.id },
          data: { formula: newFormula },
        });
        console.log(`  Fórmula actualizada en [${c.code}] ${c.name}: "${c.formula}" -> "${newFormula}"`);
        formulasUpdated++;
      }
    }
  }
  console.log(`✓ Fórmulas auditadas. Se actualizaron ${formulasUpdated} fórmulas con los nuevos códigos.`);

  // 4. Actualizar matrices cuyo inputConceptCode apunte a un código anterior
  const matrices = await tenantPrisma.payrollMatrix.findMany({ where: { deletedAt: null } });
  let matricesUpdated = 0;

  for (const m of matrices) {
    if (m.inputConceptCode && codeMapping[m.inputConceptCode]) {
      const newInputCode = codeMapping[m.inputConceptCode];
      await tenantPrisma.payrollMatrix.update({
        where: { id: m.id },
        data: { inputConceptCode: newInputCode },
      });
      console.log(`  Matriz [${m.code}] ${m.name}: inputConceptCode "${m.inputConceptCode}" -> "${newInputCode}"`);
      matricesUpdated++;
    }
  }
  if (matricesUpdated > 0) {
    console.log(`✓ Se actualizaron ${matricesUpdated} matrices con los nuevos conceptos de entrada.`);
  }

  // 5. Actualizar histórico de recibos (pay_slip_items) para mantener consistencia y acumuladores
  let slipItemsUpdated = 0;
  for (const [oldCode, newCode] of Object.entries(codeMapping)) {
    const updateRes = await tenantPrisma.paySlipItem.updateMany({
      where: { conceptCode: oldCode },
      data: { conceptCode: newCode },
    });
    if (updateRes.count > 0) {
      console.log(`  pay_slip_items: ${updateRes.count} registros migrados de código [${oldCode}] a [${newCode}]`);
      slipItemsUpdated += updateRes.count;
    }
  }
  console.log(`✓ Historial de liquidaciones sincronizado (${slipItemsUpdated} renglones de recibo actualizados).`);

  // 6. Validar consistencia de todas las fórmulas tras la migración
  const finalConcepts = await tenantPrisma.concept.findMany({ where: { deletedAt: null } });
  const finalMatrices = await tenantPrisma.payrollMatrix.findMany({ where: { deletedAt: null } });
  const finalFixedValues = await tenantPrisma.payrollFixedValue.findMany({ where: { deletedAt: null } });

  let formulaErrors = 0;
  for (const c of finalConcepts) {
    if (c.formula && c.calculationType === 'FORMULA') {
      const val = validateConceptFormula({
        formula: c.formula,
        conceptCode: c.code,
        type: c.type,
        calculationOrder: c.calculationOrder,
        allConcepts: finalConcepts.filter((x) => x.id !== c.id),
        fixedValues: finalFixedValues,
        matrices: finalMatrices,
      });

      if (!val.isValid) {
        console.error(`  [ALERTA] Fórmula inválida en [${c.code}] ${c.name}: ${val.errors.join('; ')}`);
        formulaErrors++;
      } else {
        console.log(`  ✓ Fórmula en [${c.code}] ${c.name}: "${c.formula}" validada correctamente.`);
      }
    }
  }

  if (formulaErrors === 0) {
    console.log(`✓ Todas las fórmulas de la empresa son 100% válidas y consistentes.`);
  } else {
    console.warn(`⚠ Se detectaron ${formulaErrors} fórmulas con observaciones tras la reenumeración.`);
  }

  return {
    success: true,
    renumberedCount: conceptsToUpdate.length,
    formulasUpdated,
    slipItemsUpdated,
    codeMapping,
  };
}

/**
 * Punto de entrada del script CLI.
 */
async function main() {
  console.log('Iniciando proceso de reenumeración de conceptos en todas las empresas...');
  const companies = await prisma.companyRegistry.findMany();
  console.log(`Empresas registradas a procesar: ${companies.length}`);

  let totalRenumbered = 0;
  for (const comp of companies) {
    try {
      const res = await renumberTenantConcepts(comp);
      totalRenumbered += res.renumberedCount;
    } catch (err) {
      console.error(`Error al procesar empresa ${comp.name} (${comp.dbName}):`, err);
    }
  }

  console.log(`\n======================================================`);
  console.log(`MIGRACIÓN COMPLETADA: ${totalRenumbered} conceptos reenumerados en total.`);
  console.log(`======================================================\n`);
}

if (process.argv[1] && process.argv[1].endsWith('renumberConcepts.js')) {
  main()
    .catch((err) => {
      console.error('Error fatal durante la reenumeración:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
