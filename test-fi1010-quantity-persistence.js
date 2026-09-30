import assert from 'node:assert';
import tenantConnectionManager from './src/services/tenantConnectionManager.js';
import prisma from './src/config/prisma.js';
import * as payrollService from './src/modules/payroll/payroll.service.js';
import { ensureTenantPayrollSchema } from './src/services/tenantProvisioner.service.js';

console.log('====================================================');
console.log('TEST: PERSISTENCIA DE FÓRMULA DE CANTIDAD EN FI1010');
console.log('====================================================\n');

async function run() {
  const company = await prisma.companyRegistry.findFirst();
  if (!company) {
    throw new Error('No se encontró ninguna empresa en la base de datos');
  }
  console.log(`Empresa de prueba: ${company.name} (${company.dbName})`);

  const tenantPrisma = await tenantConnectionManager.getTenantClient(company);

  // 1. Ejecutar ensureTenantPayrollSchema forzado para ampliar column quantity_source si fuera necesario
  await ensureTenantPayrollSchema(tenantPrisma, { force: true });

  // 2. Verificar tipo y longitud de columna quantity_source
  const colInfo = await tenantPrisma.$queryRawUnsafe(
    "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'concepts' AND COLUMN_NAME = 'quantity_source'"
  );
  console.log('  Información de columna quantity_source:', colInfo[0]);
  assert.strictEqual(Number(colInfo[0].CHARACTER_MAXIMUM_LENGTH), 255, 'La columna quantity_source debe ser de 255 caracteres');
  console.log('  ✓ Columna quantity_source es VARCHAR(255)');

  // 3. Buscar concepto FI1010
  const fi1010 = await tenantPrisma.concept.findUnique({ where: { code: 'FI1010' } });
  assert(fi1010, 'El concepto FI1010 debe existir en la base de datos');
  console.log(`  ✓ Concepto FI1010 encontrado (ID: ${fi1010.id}, quantitySource actual: "${fi1010.quantitySource}")`);

  // 4. Guardar fórmula para Cantidad en FI1010 mediante payrollService.updateConcept
  const formulaParaCantidad = 'FORMULA:DIF_DIAS([INICIO_SEMESTRE], [FECHA_LIQUIDACION], true)';
  const updated1 = await payrollService.updateConcept(tenantPrisma, fi1010.id, {
    quantitySource: formulaParaCantidad,
  });

  assert.strictEqual(updated1.quantitySource, formulaParaCantidad, 'El valor devuelto por updateConcept debe coincidir');
  console.log(`  ✓ updateConcept guardó correctamente: ${updated1.quantitySource}`);

  // 5. Cargar nuevamente desde la base de datos (simulando reapertura de modal o recarga de conceptos)
  const reloaded1 = await tenantPrisma.concept.findUnique({ where: { id: fi1010.id } });
  assert.strictEqual(reloaded1.quantitySource, formulaParaCantidad, 'El valor recargado de la BD debe persistir la fórmula');
  console.log(`  ✓ Recarga de BD confirma persistencia: "${reloaded1.quantitySource}"`);

  // 6. Probar otra fórmula (ej. referencia a cantidad de otro concepto)
  const formulaReferencia = 'FORMULA:[CANTIDAD:FI1001]';
  const updated2 = await payrollService.updateConcept(tenantPrisma, fi1010.id, {
    quantitySource: formulaReferencia,
  });
  const reloaded2 = await tenantPrisma.concept.findUnique({ where: { id: fi1010.id } });
  assert.strictEqual(reloaded2.quantitySource, formulaReferencia, 'Debe persistir fórmulas con tokens de cantidad');
  console.log(`  ✓ Actualización y recarga con token [CANTIDAD:FI1001]: "${reloaded2.quantitySource}"`);

  // 7. Probar volver a AUTO
  const updatedAuto = await payrollService.updateConcept(tenantPrisma, fi1010.id, {
    quantitySource: 'AUTO',
  });
  const reloadedAuto = await tenantPrisma.concept.findUnique({ where: { id: fi1010.id } });
  assert.strictEqual(reloadedAuto.quantitySource, 'AUTO', 'Debe persistir retorno a AUTO');
  console.log(`  ✓ Retorno a AUTO persistido correctamente: "${reloadedAuto.quantitySource}"`);

  // Restaurar la fórmula que el usuario desea para FI1010 (DIF_DIAS)
  await payrollService.updateConcept(tenantPrisma, fi1010.id, {
    quantitySource: formulaParaCantidad,
  });
  console.log(`  ✓ FI1010 configurado con fórmula de días para SAC Proporcional: "${formulaParaCantidad}"`);

  console.log('\n====================================================');
  console.log('TODAS LAS PRUEBAS DE FI1010 PASARON EXITOSAMENTE (6/6)');
  console.log('====================================================\n');

  process.exit(0);
}

run().catch((err) => {
  console.error('\n✗ Error en pruebas:', err);
  process.exit(1);
});
