import prisma from '../config/prisma.js';

async function cleanupTestDatabases() {
  console.log('🚀 Iniciando limpieza de bases de datos y cuentas residuales de pruebas...\n');

  const PROTECTED_DB = 'sueldos_emp_30546259605_f4ed76';
  const PROTECTED_ACCOUNT_ID = '56c9a247-0b47-4ad9-90d1-19c6596fcb43';

  // 1. Obtener todas las bases físicas en MySQL con prefijo sueldos_emp_
  const rawDbs = await prisma.$queryRawUnsafe("SHOW DATABASES LIKE 'sueldos_emp_%'");
  const physicalDbs = rawDbs.map((r) => Object.values(r)[0]);

  console.log(`📊 Bases físicas detectadas en MySQL: ${physicalDbs.length}`);

  // Filtrar exclusivamente las bases de test (CUIT 30708381256)
  const dbsToDrop = physicalDbs.filter((db) => {
    if (db === PROTECTED_DB) return false;
    // Solo borrar las que pertenecen al CUIT de prueba 30708381256
    return db.startsWith('sueldos_emp_30708381256_');
  });

  console.log(`🎯 Bases de prueba a eliminar: ${dbsToDrop.length}`);
  console.log(`🛡️  Base protegida garantizada: ${PROTECTED_DB} (NO será tocada)\n`);

  let droppedCount = 0;
  for (const dbName of dbsToDrop) {
    try {
      await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${dbName}\``);
      droppedCount++;
      process.stdout.write(`  [${droppedCount}/${dbsToDrop.length}] Eliminada base: ${dbName}\r`);
    } catch (err) {
      console.error(`\n❌ Error eliminando ${dbName}:`, err.message);
    }
  }
  console.log(`\n✅ Se eliminaron ${droppedCount} bases físicas de prueba en MySQL.\n`);

  // 2. Limpieza de cuentas y registros de prueba en sueldos_master
  console.log('🧹 Limpiando registros de prueba en la base de datos principal (sueldos_master)...');

  // Empresas registradas con CUIT de prueba
  const testCompanies = await prisma.companyRegistry.findMany({
    where: {
      cuit: '30708381256',
      accountId: { not: PROTECTED_ACCOUNT_ID },
    },
    select: { id: true, name: true, cuit: true, accountId: true },
  });
  console.log(`- Empresas de prueba registradas en master: ${testCompanies.length}`);

  // Cuentas de prueba (Estudio Contable Test)
  const testAccounts = await prisma.account.findMany({
    where: {
      id: { not: PROTECTED_ACCOUNT_ID },
      OR: [
        { name: 'Estudio Contable Test' },
        {
          users: {
            some: {
              email: { startsWith: 'test_' },
            },
          },
        },
      ],
    },
    select: { id: true, name: true },
  });
  console.log(`- Cuentas de prueba registradas en master: ${testAccounts.length}`);

  let deletedAccountsCount = 0;
  for (const acc of testAccounts) {
    if (acc.id === PROTECTED_ACCOUNT_ID) continue; // Protección redundante
    try {
      await prisma.account.delete({ where: { id: acc.id } });
      deletedAccountsCount++;
    } catch (err) {
      console.warn(`No se pudo eliminar cuenta ${acc.id}:`, err.message);
    }
  }
  console.log(`✅ Se eliminaron ${deletedAccountsCount} cuentas de prueba y sus accesos/empresas asociadas.\n`);

  // 3. Verificación final
  const remainingDbs = await prisma.$queryRawUnsafe("SHOW DATABASES LIKE 'sueldos_emp_%'");
  const finalDbs = remainingDbs.map((r) => Object.values(r)[0]);

  const remainingCompanies = await prisma.companyRegistry.findMany({
    select: { id: true, name: true, cuit: true, dbName: true },
  });

  console.log('==================================================');
  console.log('🎉 RESUMEN DE ESTADO FINAL:');
  console.log(`- Bases físicas 'sueldos_emp_*' activas en MySQL: ${finalDbs.length}`);
  finalDbs.forEach((db) => console.log(`  ✓ ${db}`));
  console.log(`- Empresas registradas en el sistema: ${remainingCompanies.length}`);
  remainingCompanies.forEach((c) => console.log(`  ✓ [${c.cuit}] ${c.name} -> Base: ${c.dbName}`));
  console.log('==================================================\n');
}

cleanupTestDatabases()
  .catch((err) => {
    console.error('❌ Error en el proceso de limpieza:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
