/**
 * migrateEliminateGeneralConcepts.js
 * Script de migración y normalización para eliminar el tipo de liquidación "GENERAL" (prefijo GE)
 * y desagregar los conceptos en SU (Mensual), QU (Quincenal), SA (SAC), VA (Vacaciones) y FI (Final).
 *
 * Acciones:
 * 1. Renombra conceptos activos GE* -> SU* (periodType: 'MONTHLY'), preservando IDs y relaciones principales.
 * 2. Clona e inserta los conceptos faltantes para QU (QUINCE), SA (SAC), VA (VACATIONS) y FI (FINAL).
 * 3. Replica asignaciones de empleados (employee_concepts) hacia todos los prefijos (ej: Cuota Sindical 6004).
 * 4. Actualiza los renglones de recibos históricos (pay_slip_items) asignando el prefijo del período correspondiente.
 */

import prisma from '../config/prisma.js';
import tenantConnectionManager from '../services/tenantConnectionManager.js';

const PREFIX_PERIOD_MAP = [
  { prefix: 'SU', periodType: 'MONTHLY' },
  { prefix: 'QU', periodType: 'QUINCE' },
  { prefix: 'SA', periodType: 'SAC' },
  { prefix: 'VA', periodType: 'VACATIONS' },
  { prefix: 'FI', periodType: 'FINAL' },
];

/**
 * Resuelve el prefijo de concepto adecuado según el periodType de una liquidación histórica.
 */
function resolvePrefixForPeriodType(periodType) {
  const p = String(periodType || '').toUpperCase();
  if (p === 'MONTHLY') return 'SU';
  if (p === 'QUINCE_1' || p === 'QUINCE_2' || p === 'QUINCE') return 'QU';
  if (p === 'SAC_1' || p === 'SAC_2' || p === 'SAC') return 'SA';
  if (p === 'VACATIONS') return 'VA';
  if (p === 'FINAL') return 'FI';
  return 'SU'; // Fallback
}

export async function migrateTenantEliminateGeneralConcepts(company) {
  console.log(`\n======================================================`);
  console.log(`Procesando empresa: ${company.name} (${company.dbName})`);
  console.log(`======================================================`);

  const tenantPrisma = await tenantConnectionManager.getTenantClient(company);

  // 1. Buscar conceptos activos con prefijo GE
  const geConcepts = await tenantPrisma.concept.findMany({
    where: {
      deletedAt: null,
      code: { startsWith: 'GE' },
    },
    orderBy: { code: 'asc' },
  });

  console.log(`Conceptos con prefijo GE encontrados: ${geConcepts.length}`);

  const conceptByCodeMap = new Map();
  // Cargar todos los conceptos vigentes para búsqueda rápida
  const allCurrent = await tenantPrisma.concept.findMany({ where: { deletedAt: null } });
  for (const c of allCurrent) {
    conceptByCodeMap.set(c.code, c);
  }

  // 2. Procesar cada concepto GE
  for (const ge of geConcepts) {
    const numPart = ge.code.slice(2); // ej: "6001"
    console.log(`\n-> Desagregando concepto [${ge.code}] "${ge.name}":`);

    // 2.A: Renombrar GE* a SU* si no existe ya SU*
    const suCode = `SU${numPart}`;
    let suConcept = conceptByCodeMap.get(suCode);

    if (!suConcept) {
      suConcept = await tenantPrisma.concept.update({
        where: { id: ge.id },
        data: {
          code: suCode,
          periodType: 'MONTHLY',
        },
      });
      conceptByCodeMap.set(suCode, suConcept);
      console.log(`   ✓ Renombrado [${ge.code}] -> [${suCode}] (ID preservado: ${suConcept.id})`);
    } else {
      console.log(`   ℹ Concepto [${suCode}] ya existía. Soft-delete para código viejo [${ge.code}]`);
      await tenantPrisma.concept.update({
        where: { id: ge.id },
        data: {
          code: `${ge.code}_MIGRATED_${ge.id.substring(0, 8)}`,
          deletedAt: new Date(),
        },
      });
    }

    // 2.B: Crear los conceptos clonados para QU, SA, VA y FI si no existen
    const otherPrefixes = PREFIX_PERIOD_MAP.filter((p) => p.prefix !== 'SU');
    const createdVariants = {};

    for (const { prefix, periodType } of otherPrefixes) {
      const targetCode = `${prefix}${numPart}`;
      let variant = conceptByCodeMap.get(targetCode);

      if (!variant) {
        variant = await tenantPrisma.concept.create({
          data: {
            code: targetCode,
            name: ge.name,
            type: ge.type,
            calculationType: ge.calculationType,
            periodType,
            scope: ge.scope,
            defaultValue: ge.defaultValue,
            noveltyDataType: ge.noveltyDataType,
            calculationOrder: ge.calculationOrder,
            formula: ge.formula,
            matrixData: ge.matrixData,
            matrixId: ge.matrixId,
            isActive: ge.isActive,
            isPersistent: ge.isPersistent,
            arcaConceptCode: ge.arcaConceptCode,
            appliesSipaAporte: ge.appliesSipaAporte,
            appliesSipaContrib: ge.appliesSipaContrib,
            appliesInssjypAporte: ge.appliesInssjypAporte,
            appliesInssjypContrib: ge.appliesInssjypContrib,
            appliesOsAporte: ge.appliesOsAporte,
            appliesOsContrib: ge.appliesOsContrib,
            appliesFsrAporte: ge.appliesFsrAporte,
            appliesFsrContrib: ge.appliesFsrContrib,
            appliesRenatreAporte: ge.appliesRenatreAporte,
            appliesRenatreContrib: ge.appliesRenatreContrib,
            appliesAaffContrib: ge.appliesAaffContrib,
            appliesFneContrib: ge.appliesFneContrib,
            appliesLrtContrib: ge.appliesLrtContrib,
            isRepeatable: ge.isRepeatable,
          },
        });
        conceptByCodeMap.set(targetCode, variant);
        console.log(`   ✓ Creado [${targetCode}] (${periodType}) - Scope: ${ge.scope}`);
      } else {
        console.log(`   ℹ Concepto [${targetCode}] ya existía.`);
      }

      createdVariants[prefix] = variant;
    }

    // 2.C: Replicar asignaciones individuales (employee_concepts)
    // El concepto base SU* ya conserva la asignación previa del ge.id.
    // Replicamos a QU*, SA*, VA*, FI*.
    const suAssignments = await tenantPrisma.employeeConcept.findMany({
      where: { conceptId: suConcept.id },
    });

    if (suAssignments.length > 0) {
      console.log(`   -> Replicando ${suAssignments.length} asignación(es) individual(es) a las demás liquidaciones...`);
      for (const assign of suAssignments) {
        for (const [prefix, variant] of Object.entries(createdVariants)) {
          const existingAssign = await tenantPrisma.employeeConcept.findUnique({
            where: {
              employeeId_conceptId: {
                employeeId: assign.employeeId,
                conceptId: variant.id,
              },
            },
          });

          if (!existingAssign) {
            await tenantPrisma.employeeConcept.create({
              data: {
                employeeId: assign.employeeId,
                conceptId: variant.id,
                amount: assign.amount,
                units: assign.units,
                notes: assign.notes,
                validFrom: assign.validFrom,
                validTo: assign.validTo,
                isActive: assign.isActive,
              },
            });
            console.log(`      ✓ Asignado [${variant.code}] al empleado ${assign.employeeId}`);
          }
        }
      }
    }
  }

  // 3. Actualizar renglones históricos de recibos (pay_slip_items)
  console.log(`\n-> Auditando ítems de recibos históricos con códigos GE...`);
  const historicalGeItems = await tenantPrisma.paySlipItem.findMany({
    where: {
      conceptCode: { startsWith: 'GE' },
    },
    include: {
      paySlip: {
        include: {
          payrollPeriod: true,
        },
      },
    },
  });

  console.log(`   Renglones con prefijo GE a actualizar: ${historicalGeItems.length}`);

  let updatedItemsCount = 0;
  // Recargar catálogo actualizado
  const freshConcepts = await tenantPrisma.concept.findMany({ where: { deletedAt: null } });
  const freshConceptMap = new Map(freshConcepts.map((c) => [c.code, c]));

  for (const item of historicalGeItems) {
    const periodType = item.paySlip?.payrollPeriod?.periodType || 'MONTHLY';
    const targetPrefix = resolvePrefixForPeriodType(periodType);
    const numPart = item.conceptCode.slice(2);
    const targetCode = `${targetPrefix}${numPart}`;
    const targetConcept = freshConceptMap.get(targetCode);

    await tenantPrisma.paySlipItem.update({
      where: { id: item.id },
      data: {
        conceptCode: targetCode,
        conceptId: targetConcept ? targetConcept.id : item.conceptId,
      },
    });
    updatedItemsCount++;
  }

  console.log(`✓ Renglones históricos actualizados con su prefijo correspondiente: ${updatedItemsCount}`);

  // 4. Liberar códigos de conceptos soft-deleted que contengan GE
  const oldDeleted = await tenantPrisma.concept.findMany({
    where: {
      deletedAt: { not: null },
      code: { startsWith: 'GE' },
    },
  });
  for (const dc of oldDeleted) {
    if (!dc.code.includes('_MIGRATED_') && !dc.code.includes('_DELETED_')) {
      await tenantPrisma.concept.update({
        where: { id: dc.id },
        data: { code: `${dc.code}_DELETED_${dc.id.substring(0, 8)}` },
      });
    }
  }

  return {
    success: true,
    geConceptsMigrated: geConcepts.length,
    slipItemsUpdated: updatedItemsCount,
  };
}

async function main() {
  console.log('======================================================');
  console.log('INICIANDO MIGRACIÓN: ELIMINACIÓN DE CONCEPTOS GENERAL (GE)');
  console.log('======================================================');

  try {
    const companies = await prisma.companyRegistry.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
    });

    console.log(`Empresas activas encontradas: ${companies.length}`);

    let totalGeMigrated = 0;
    let totalItemsUpdated = 0;

    for (const company of companies) {
      try {
        const res = await migrateTenantEliminateGeneralConcepts(company);
        totalGeMigrated += res.geConceptsMigrated;
        totalItemsUpdated += res.slipItemsUpdated;
      } catch (err) {
        console.error(`Error procesando empresa ${company.name}:`, err);
      }
    }

    console.log('\n======================================================');
    console.log(`MIGRACIÓN FINALIZADA CON ÉXITO.`);
    console.log(`Total conceptos GE desagregados: ${totalGeMigrated}`);
    console.log(`Total ítems históricos actualizados: ${totalItemsUpdated}`);
    console.log('======================================================');
  } catch (err) {
    console.error('Error general durante la migración:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

if (process.argv[1]?.endsWith('migrateEliminateGeneralConcepts.js')) {
  main();
}
