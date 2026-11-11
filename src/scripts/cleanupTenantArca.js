import prisma from '../config/prisma.js';
import tenantConnectionManager from '../services/tenantConnectionManager.js';
import { ensureTenantPersonnelSchema } from '../services/tenantProvisioner.service.js';

const LEGACY_ARCA_TABLES = [
  'arca_cct_category_positions',
  'arca_ccts',
  'arca_categories',
  'arca_positions',
  'arca_service_types',
  'arca_contract_modalities',
];

/**
 * Limpieza manual opcional de tablas legacy `arca_*` en las bases de datos de empresas existentes.
 * Primero ejecuta `ensureTenantPersonnelSchema` para garantizar la eliminación segura de FKs locales.
 */
async function cleanupLegacyTenantArcaTables() {
  const companies = await prisma.companyRegistry.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, dbName: true, dbHost: true, dbPort: true },
  });

  console.log(`Procesando limpieza legacy ARCA en ${companies.length} empresa(s)...`);

  for (const company of companies) {
    try {
      await tenantConnectionManager.withTenantClient(company, async (tenantClient) => {
        await ensureTenantPersonnelSchema(tenantClient, { force: true });
        for (const tableName of LEGACY_ARCA_TABLES) {
          await tenantClient.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${tableName}\`;`);
        }
      });
      console.log(`  [OK] ${company.name} (${company.dbName})`);
    } catch (err) {
      console.error(`  [ERROR] ${company.name} (${company.dbName}): ${err.message}`);
    }
  }
}

cleanupLegacyTenantArcaTables()
  .catch((err) => {
    console.error('Error en limpieza de tablas ARCA legacy:', err);
    process.exit(1);
  })
  .finally(async () => {
    await tenantConnectionManager.disconnectAll();
    await prisma.$disconnect();
  });

