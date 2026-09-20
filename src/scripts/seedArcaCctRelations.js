import prismaMaster from '../config/prisma.js';
import tenantConnectionManager from '../services/tenantConnectionManager.js';
import { ensureTenantPersonnelSchema } from '../services/tenantProvisioner.service.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const companies = await prismaMaster.companyRegistry.findMany({
    where: { status: 'ACTIVE', deletedAt: null }
  });
  console.log(`Found ${companies.length} active companies.`);
  
  const positionsRaw = fs.readFileSync(path.resolve('src/data/arcaPositions.json'), 'utf-8');
  const positions = JSON.parse(positionsRaw);

  const relationsRaw = fs.readFileSync(path.resolve('src/data/arcaCctCategoryPositions.json'), 'utf-8');
  const relations = JSON.parse(relationsRaw);

  console.log(`Positions to ensure: ${positions.length}`);
  console.log(`Relations to ensure: ${relations.length}`);

  for (const company of companies) {
    try {
      console.log(`\nProcessing tenant: ${company.name} (${company.dbName})...`);
      const tenantClient = await tenantConnectionManager.getTenantClient(company);
      await ensureTenantPersonnelSchema(tenantClient);

      // 1. Ensure table exists
      await tenantClient.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS \`arca_cct_category_positions\` (
          \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
          \`cct_code\` VARCHAR(50) NOT NULL,
          \`category_code\` VARCHAR(50) NOT NULL,
          \`position_code\` VARCHAR(50) NOT NULL,
          \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          UNIQUE KEY \`uniq_cct_cat_pos\` (\`cct_code\`, \`category_code\`, \`position_code\`),
          INDEX \`idx_cct_code\` (\`cct_code\`),
          INDEX \`idx_cat_code\` (\`category_code\`),
          INDEX \`idx_pos_code\` (\`position_code\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 2. Ensure positions
      const posCount = await tenantClient.arcaPosition.count();
      if (posCount < positions.length) {
        console.log(`Updating arca_positions (${posCount} -> ${positions.length})...`);
        for (let i = 0; i < positions.length; i += 200) {
          const batch = positions.slice(i, i + 200);
          const valuesSql = batch.map(p => {
            const esc = s => s ? `'${s.replace(/'/g, "''")}'` : 'NULL';
            return `(${esc(p.code)}, ${esc(p.name)}, ${esc(p.groupCode)}, ${esc(p.groupName)}, ${esc(p.description)}, NOW(3), NOW(3))`;
          }).join(',\n');
          await tenantClient.$executeRawUnsafe(`
            INSERT IGNORE INTO \`arca_positions\` (\`code\`, \`name\`, \`group_code\`, \`group_name\`, \`description\`, \`created_at\`, \`updated_at\`)
            VALUES ${valuesSql}
          `);
        }
        const newPosCount = await tenantClient.arcaPosition.count();
        console.log(`Now has ${newPosCount} positions.`);
      } else {
        console.log(`Positions up to date (${posCount}).`);
      }

      // 3. Ensure relations
      const relCount = await tenantClient.arcaCctCategoryPosition.count();
      if (relCount < relations.length) {
        console.log(`Inserting arca_cct_category_positions (${relCount} -> ${relations.length})...`);
        const BATCH_SIZE = 1500;
        for (let i = 0; i < relations.length; i += BATCH_SIZE) {
          const batch = relations.slice(i, i + BATCH_SIZE);
          const valuesSql = batch.map(r => {
            const id = `${r.cctCode}_${r.categoryCode}_${r.positionCode}`;
            const esc = s => `'${s.replace(/'/g, "''")}'`;
            return `(${esc(id)}, ${esc(r.cctCode)}, ${esc(r.categoryCode)}, ${esc(r.positionCode)}, NOW(3))`;
          }).join(',\n');
          await tenantClient.$executeRawUnsafe(`
            INSERT IGNORE INTO \`arca_cct_category_positions\` (\`id\`, \`cct_code\`, \`category_code\`, \`position_code\`, \`created_at\`)
            VALUES ${valuesSql}
          `);
        }
        const newRelCount = await tenantClient.arcaCctCategoryPosition.count();
        console.log(`Now has ${newRelCount} relations.`);
      } else {
        console.log(`Relations up to date (${relCount}).`);
      }
    } catch (err) {
      console.error(`Error processing tenant ${company.name}:`, err.message);
    }
  }

  console.log('\nAll tenants successfully updated!');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error seeding relations:', err);
  process.exit(1);
});
