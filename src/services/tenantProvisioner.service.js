import crypto from 'crypto';
import prismaMaster from '../config/prisma.js';
import tenantConnectionManager from './tenantConnectionManager.js';
import { ensureMasterArcaSeeded } from './arcaCatalog.service.js';
import { TENANT_TABLE_DEFINITIONS } from './provisioner/tenantDdl.js';
import {
  verifiedPayrollClients,
  verifiedPersonnelClients,
  verifiedProfileClients,
  verifiedIncomeTaxClients,
} from './provisioner/schemaMutex.js';
import {
  DEFAULT_KINSHIPS,
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_CONCEPTS,
  DEFAULT_INCIDENT_TYPES,
  DEFAULT_SANCTION_TYPES,
  getHealthInsurancesData,
  getArcaServiceTypesData,
  getArcaPositionsData,
  getArcaActivitiesData,
  getArcaCctsData,
  getArcaCategoriesData,
  getArcaCctCategoryPositionsData,
  getArcaContractModalitiesData,
} from './provisioner/defaultCatalogs.js';
import { ensureTenantProfileSchema, ensureTenantPersonnelSchema } from './provisioner/personnelAndProfile.ensurer.js';
import { ensureTenantPayrollSchema } from './provisioner/payroll.ensurer.js';
import { ensureTenantIncomeTaxSchema } from './provisioner/incomeTax.ensurer.js';
import { ensureTenantReportsSchema, ensureTenantDisciplinarySchema } from './provisioner/reportsAndDisciplinary.ensurer.js';

export {
  DEFAULT_KINSHIPS,
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_CONCEPTS,
  DEFAULT_INCIDENT_TYPES,
  DEFAULT_SANCTION_TYPES,
  getHealthInsurancesData,
  getArcaServiceTypesData,
  getArcaPositionsData,
  getArcaActivitiesData,
  getArcaCctsData,
  getArcaCategoriesData,
  getArcaCctCategoryPositionsData,
  getArcaContractModalitiesData,
  ensureTenantProfileSchema,
  ensureTenantPersonnelSchema,
  ensureTenantPayrollSchema,
  ensureTenantIncomeTaxSchema,
  ensureTenantReportsSchema,
  ensureTenantDisciplinarySchema,
};

/**
 * Aprovisiona automáticamente una base de datos física para una nueva empresa.
 * @param {object} companyData - Datos de la empresa { cuit, name, legalName }
 * @returns {Promise<{ dbName: string, dbHost: string, dbPort: number }>}
 */
export async function provisionTenantDatabase({ cuit, name, activityCode = null, activityDescription = null }) {
  const cleanCuit = cuit.replace(/\D/g, '');
  const randomSuffix = crypto.randomBytes(3).toString('hex');
  const dbName = `sueldos_emp_${cleanCuit}_${randomSuffix}`;
  const dbHost = 'localhost';
  const dbPort = 3306;

  // 1. Crear la base de datos física en MySQL usando la conexión Master
  await prismaMaster.$executeRawUnsafe(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  );

  // 2. Ejecutar aprovisionamiento garantizando liberación de referencia en el pool
  try {
    return await tenantConnectionManager.withTenantClient(
      { dbName, dbHost, dbPort },
      async (tenantClient) => {
        // 3. Crear las tablas operativas de la empresa
        for (const tableSql of TENANT_TABLE_DEFINITIONS) {
          await tenantClient.$executeRawUnsafe(tableSql);
        }

        // 4. Registrar datos iniciales de la empresa (CompanyProfile)
        await tenantClient.companyProfile.create({
          data: {
            id: crypto.randomUUID(),
            legalName: name,
            cuit: cleanCuit,
            activityCode: activityCode || null,
            activityDescription: activityDescription || null,
          },
        });

        // 5. Cargar conceptos básicos iniciales de sueldo
        for (const concept of DEFAULT_CONCEPTS) {
          await tenantClient.concept.create({
            data: {
              id: crypto.randomUUID(),
              ...concept,
            },
          });
        }

        // 6. Cargar Obras Sociales predeterminadas
        const healthInsurances = await getHealthInsurancesData();
        const hiBatch = healthInsurances.map((hi) => ({
          id: crypto.randomUUID(),
          code: hi.code,
          name: hi.name,
        }));
        if (hiBatch.length > 0) {
          await tenantClient.healthInsurance.createMany({ data: hiBatch });
        }

        // 7. Cargar Parentescos predeterminados
        for (const kin of DEFAULT_KINSHIPS) {
          await tenantClient.kinship.create({
            data: {
              id: crypto.randomUUID(),
              ...kin,
            },
          });
        }

        // 8. Garantizar catálogos globales ARCA en base MASTER (cero replicación masiva por empresa)
        await ensureMasterArcaSeeded();

        // 9. Cargar Parámetros Patronales por Defecto
        await tenantClient.payrollSetting.create({
          data: {
            id: crypto.randomUUID(),
            employerType: 'SERVICIOS_COMERCIO',
            sipaRate: 10.77,
            inssjypRate: 1.58,
            osRate: 6.00,
            fneRate: 0.94,
            aaffRate: 4.70,
            artRate: 3.50,
            artFixedFee: 850.00,
            scvoFee: 650.00,
            detractionBase: 7003.68,
            ansesMinCap: 82287.12,
            ansesMaxCap: 2674292.72,
            standardWeeklyHours: 48.00,
            standardMonthlyHours: 200.00,
          },
        });

        // 10. Crear Período Fiscal Inicial
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        await tenantClient.payrollFiscalPeriod.create({
          data: {
            id: crypto.randomUUID(),
            year: currentYear,
            month: currentMonth,
            status: 'OPEN',
            notes: `Período fiscal inicial ${currentMonth}/${currentYear}`,
          },
        });

        // 11. Precargar esquema y tablas oficiales de Impuesto a las Ganancias
        await ensureTenantIncomeTaxSchema(tenantClient);

        // Registrar clientes en caché de verificación para prevenir DDL en caliente
        verifiedPayrollClients.add(tenantClient);
        verifiedPersonnelClients.add(tenantClient);
        verifiedProfileClients.add(tenantClient);
        verifiedIncomeTaxClients.add(tenantClient);

        return { dbName, dbHost, dbPort };
      }
    );
  } catch (err) {
    console.error(`Error durante el aprovisionamiento de ${dbName}:`, err);
    await tenantConnectionManager.disposeClient(dbName);
    try {
      await prismaMaster.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${dbName}\`;`);
      console.log(`Base de datos huérfana eliminada: ${dbName}`);
    } catch (cleanupErr) {
      console.warn(`No se pudo eliminar la base de datos huérfana ${dbName}:`, cleanupErr.message);
    }
    throw err;
  }
}
