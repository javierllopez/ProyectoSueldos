import tenantConnectionManager from '../src/services/tenantConnectionManager.js';
import { ensureTenantPayrollSchema } from '../src/services/tenantProvisioner.service.js';

async function main() {
  const companySlug = 'emp_30546259605_f4ed76';
  const tenantClient = await tenantConnectionManager.getTenantClient({
    companySlug,
    dbName: `sueldos_${companySlug}`,
  });

  console.log('Running ensureTenantPayrollSchema on tenant:', companySlug);
  await ensureTenantPayrollSchema(tenantClient);

  const tables = await tenantClient.$queryRawUnsafe(`SHOW TABLES LIKE 'period_novelties'`);
  console.log('period_novelties table check:', tables);

  const columns = await tenantClient.$queryRawUnsafe(`SHOW COLUMNS FROM period_novelties`);
  console.log('period_novelties columns:', columns);
  process.exit(0);
}

main().catch(err => {
  console.error('Error running migration:', err);
  process.exit(1);
});
