import prismaMaster from '../config/prisma.js';
import tenantConnectionManager from '../services/tenantConnectionManager.js';
import { ensureTenantPersonnelSchema, getArcaContractModalitiesData } from '../services/tenantProvisioner.service.js';

async function main() {
  const companies = await prismaMaster.companyRegistry.findMany({
    where: { status: 'ACTIVE', deletedAt: null }
  });
  console.log(`Found ${companies.length} active companies.`);

  const modalities = getArcaContractModalitiesData();
  console.log(`Contract modalities to ensure: ${modalities.length}`);

  let successCount = 0;
  for (const company of companies) {
    try {
      console.log(`\nProcessing tenant: ${company.name} (${company.dbName})...`);
      const tenantClient = await tenantConnectionManager.getTenantClient(company);
      
      // Runs complete schema sync (creates arca_contract_modalities, adds contract_modality_code to employees, seeds modalities)
      await ensureTenantPersonnelSchema(tenantClient);

      const count = await tenantClient.arcaContractModality.count();
      console.log(`Tenant ${company.name} has ${count} contract modalities.`);

      // Verify employee column exists
      const empCols = await tenantClient.$queryRawUnsafe(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'contract_modality_code'`
      );
      if (empCols.length > 0) {
        console.log(`Column employees.contract_modality_code verified.`);
      } else {
        console.warn(`Column employees.contract_modality_code NOT found, adding now...`);
        await tenantClient.$executeRawUnsafe(
          `ALTER TABLE \`employees\` ADD COLUMN \`contract_modality_code\` VARCHAR(50) NULL;`
        );
      }

      successCount++;
    } catch (err) {
      console.error(`Error processing tenant ${company.name} (${company.dbName}):`, err.message);
    }
  }

  console.log(`\nSeeding completed successfully for ${successCount}/${companies.length} tenants!`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error seeding contract modalities:', err);
  process.exit(1);
});
