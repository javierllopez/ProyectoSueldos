import {
  verifiedReportsClients,
  pendingReportsClients,
  verifiedDisciplinaryClients,
  pendingDisciplinaryClients,
  ensureSchemaWithMutex,
} from './schemaMutex.js';
import { DEFAULT_INCIDENT_TYPES, DEFAULT_SANCTION_TYPES } from './defaultCatalogs.js';

export async function ensureTenantReportsSchema(tenantClient, { force = false } = {}) {
  return ensureSchemaWithMutex(verifiedReportsClients, pendingReportsClients, tenantClient, force, async () => {
    try {
      await tenantClient.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS \`report_templates\` (
          \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
          \`name\` VARCHAR(191) NOT NULL,
          \`description\` TEXT NULL,
          \`category\` VARCHAR(50) NOT NULL DEFAULT 'PAYROLL',
          \`is_system\` BOOLEAN NOT NULL DEFAULT FALSE,
          \`config\` JSON NOT NULL,
          \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      return true;
    } catch (err) {
      console.warn('Aviso al verificar esquema de Reportes:', err.message);
      return false;
    }
  });
}

export async function ensureTenantDisciplinarySchema(tenantClient, { force = false } = {}) {
  return ensureSchemaWithMutex(verifiedDisciplinaryClients, pendingDisciplinaryClients, tenantClient, force, async () => {
    try {
    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`incident_types\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`code\` VARCHAR(50) NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`severity\` VARCHAR(30) NOT NULL DEFAULT 'MEDIUM',
        \`description\` TEXT NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`sanction_types\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`code\` VARCHAR(50) NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`requires_suspension_days\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`description\` TEXT NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`employee_incidents\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`employee_id\` VARCHAR(191) NOT NULL,
        \`incident_type_id\` VARCHAR(191) NOT NULL,
        \`incident_date\` DATETIME(3) NOT NULL,
        \`observations\` TEXT NULL,
        \`attachments\` LONGTEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL,
        INDEX \`employee_incidents_employee_id_idx\` (\`employee_id\`),
        INDEX \`employee_incidents_incident_type_id_idx\` (\`incident_type_id\`),
        INDEX \`employee_incidents_incident_date_idx\` (\`incident_date\`),
        CONSTRAINT \`employee_incidents_employee_id_fkey\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`employee_incidents_incident_type_id_fkey\` FOREIGN KEY (\`incident_type_id\`) REFERENCES \`incident_types\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`employee_sanctions\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`employee_id\` VARCHAR(191) NOT NULL,
        \`sanction_type_id\` VARCHAR(191) NOT NULL,
        \`sanction_date\` DATETIME(3) NOT NULL,
        \`suspension_days\` INT NULL,
        \`observations\` TEXT NULL,
        \`attachments\` LONGTEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL,
        INDEX \`employee_sanctions_employee_id_idx\` (\`employee_id\`),
        INDEX \`employee_sanctions_sanction_type_id_idx\` (\`sanction_type_id\`),
        INDEX \`employee_sanctions_sanction_date_idx\` (\`sanction_date\`),
        CONSTRAINT \`employee_sanctions_employee_id_fkey\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`employee_sanctions_sanction_type_id_fkey\` FOREIGN KEY (\`sanction_type_id\`) REFERENCES \`sanction_types\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`sanction_incident_links\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`sanction_id\` VARCHAR(191) NOT NULL,
        \`incident_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`uniq_sanction_incident\` (\`sanction_id\`, \`incident_id\`),
        INDEX \`sanction_incident_links_sanction_id_idx\` (\`sanction_id\`),
        INDEX \`sanction_incident_links_incident_id_idx\` (\`incident_id\`),
        CONSTRAINT \`sanction_incident_links_sanction_id_fkey\` FOREIGN KEY (\`sanction_id\`) REFERENCES \`employee_sanctions\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`sanction_incident_links_incident_id_fkey\` FOREIGN KEY (\`incident_id\`) REFERENCES \`employee_incidents\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Seed inicial de tipos de incidentes y sanciones si las tablas están vacías
    const incCount = await tenantClient.incidentType.count();
    if (incCount === 0) {
      await tenantClient.incidentType.createMany({
        data: DEFAULT_INCIDENT_TYPES,
      });
    }

    const sanCount = await tenantClient.sanctionType.count();
    if (sanCount === 0) {
      await tenantClient.sanctionType.createMany({
        data: DEFAULT_SANCTION_TYPES,
      });
    }

    return true;
  } catch (err) {
    console.warn('Aviso al verificar esquema de Régimen Disciplinario:', err.message);
    return false;
  }
  });
}
