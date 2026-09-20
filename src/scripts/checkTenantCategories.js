import prisma from '../config/prisma.js';
import tenantConnectionManager from '../services/tenantConnectionManager.js';

async function checkCompanies() {
  const companies = await prisma.companyRegistry.findMany();
  console.log('Companies count:', companies.length);
  for (const c of companies) {
    console.log(`Company: ${c.name}, DB: ${c.dbName}`);
    try {
      const tenantPrisma = await tenantConnectionManager.getTenantClient({
        dbName: c.dbName,
        dbHost: c.dbHost,
        dbPort: c.dbPort,
      });
      const count = await tenantPrisma.arcaCategory.count();
      console.log(`  arcaCategory count: ${count}`);
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }
}

checkCompanies()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
