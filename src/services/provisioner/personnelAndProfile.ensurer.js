import crypto from 'crypto';
import {
  verifiedProfileClients,
  pendingProfileClients,
  verifiedPersonnelClients,
  pendingPersonnelClients,
  ensureSchemaWithMutex,
} from './schemaMutex.js';
import {
  DEFAULT_KINSHIPS,
  DEFAULT_PAYMENT_METHODS,
  getHealthInsurancesData,
} from './defaultCatalogs.js';
import { ensureTenantPayrollSchema } from './payroll.ensurer.js';

/**
 * Asegura de forma segura y no destructiva que la tabla company_profile de un tenant existente contenga todas las columnas.
 * @param {object} tenantClient - Cliente de Prisma del tenant.
 */
export async function ensureTenantProfileSchema(tenantClient, { force = false } = {}) {
  return ensureSchemaWithMutex(verifiedProfileClients, pendingProfileClients, tenantClient, force, async () => {
    const columnsToAdd = [
      { name: 'trade_name', def: 'VARCHAR(191) NULL' },
      { name: 'tax_condition', def: "VARCHAR(191) NULL DEFAULT 'RESPONSABLE_INSCRIPTO'" },
      { name: 'gross_income_number', def: 'VARCHAR(191) NULL' },
      { name: 'address', def: 'VARCHAR(191) NULL' },
      { name: 'city', def: 'VARCHAR(191) NULL' },
      { name: 'province', def: 'VARCHAR(191) NULL' },
      { name: 'postal_code', def: 'VARCHAR(191) NULL' },
      { name: 'phone', def: 'VARCHAR(191) NULL' },
      { name: 'email', def: 'VARCHAR(191) NULL' },
      { name: 'activity_start', def: 'DATETIME(3) NULL' },
      { name: 'activity_code', def: 'VARCHAR(10) NULL' },
      { name: 'activity_description', def: 'VARCHAR(500) NULL' },
      { name: 'art_name', def: 'VARCHAR(191) NULL' },
      { name: 'bank_name', def: 'VARCHAR(191) NULL' },
      { name: 'bank_cbu', def: 'VARCHAR(22) NULL' },
    ];

    try {
      const existingCols = await tenantClient.$queryRawUnsafe(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_profile'`
      );
      const existingColSet = new Set(existingCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));

      for (const col of columnsToAdd) {
        if (!existingColSet.has(col.name.toLowerCase())) {
          await tenantClient.$executeRawUnsafe(
            `ALTER TABLE \`company_profile\` ADD COLUMN \`${col.name}\` ${col.def};`
          );
        }
      }
      return true;
    } catch (err) {
      console.warn('Aviso al verificar esquema de company_profile:', err.message);
      return false;
    }
  });
}

/**
 * Asegura que las tablas de Estructura, Afiliaciones y Personal existan con todas sus columnas en el tenant.
 * @param {object} tenantClient - Cliente de Prisma del tenant.
 */
export async function ensureTenantPersonnelSchema(tenantClient, { force = false } = {}) {
  return ensureSchemaWithMutex(verifiedPersonnelClients, pendingPersonnelClients, tenantClient, force, async () => {
    try {
    // 1. Crear tablas auxiliares si no existen
    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`departments\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`job_positions\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(191) NULL,
        \`cct_code\` VARCHAR(50) NULL,
        \`category_code\` VARCHAR(50) NULL,
        \`position_code\` VARCHAR(50) NULL,
        \`service_type_code\` VARCHAR(50) NULL,
        \`activity_code\` VARCHAR(10) NULL DEFAULT '049',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Comprobar columnas clave en job_positions para migraciones no destructivas
    const jobPositionCols = [
      { name: 'cct_code', def: 'VARCHAR(50) NULL' },
      { name: 'category_code', def: 'VARCHAR(50) NULL' },
      { name: 'position_code', def: 'VARCHAR(50) NULL' },
      { name: 'service_type_code', def: 'VARCHAR(50) NULL' },
      { name: 'activity_code', def: "VARCHAR(10) NULL DEFAULT '049'" },
    ];
    const existingJobCols = await tenantClient.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_positions'`
    );
    const existingJobColSet = new Set(existingJobCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));
    for (const col of jobPositionCols) {
      if (!existingJobColSet.has(col.name.toLowerCase())) {
        await tenantClient.$executeRawUnsafe(
          `ALTER TABLE \`job_positions\` ADD COLUMN \`${col.name}\` ${col.def};`
        );
      }
    }

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`health_insurances\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`unions\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(191) NULL,
        \`concept_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Comprobar columna concept_id en unions
    try {
      const existingUnionCols = await tenantClient.$queryRawUnsafe(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'unions'`
      );
      const existingUnionColSet = new Set(existingUnionCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));
      if (!existingUnionColSet.has('concept_id')) {
        await tenantClient.$executeRawUnsafe(
          `ALTER TABLE \`unions\` ADD COLUMN \`concept_id\` VARCHAR(191) NULL;`
        );
      }
    } catch (colErr) {
      if (!colErr.message.includes('Duplicate column')) {
        console.warn('Aviso al verificar concept_id en unions:', colErr.message);
      }
    }

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`mutuals\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(191) NULL,
        \`concept_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Comprobar columna concept_id en mutuals
    try {
      const existingMutualCols = await tenantClient.$queryRawUnsafe(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'mutuals'`
      );
      const existingMutualColSet = new Set(existingMutualCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));
      if (!existingMutualColSet.has('concept_id')) {
        await tenantClient.$executeRawUnsafe(
          `ALTER TABLE \`mutuals\` ADD COLUMN \`concept_id\` VARCHAR(191) NULL;`
        );
      }
    } catch (colErr) {
      if (!colErr.message.includes('Duplicate column')) {
        console.warn('Aviso al verificar concept_id en mutuals:', colErr.message);
      }
    }

    // Tablas intermedias N:M para conceptos múltiples en sindicatos y mutuales
    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`union_concepts\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`union_id\` VARCHAR(191) NOT NULL,
        \`concept_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`uniq_union_concept\` (\`union_id\`, \`concept_id\`),
        INDEX \`union_concepts_union_id_idx\` (\`union_id\`),
        INDEX \`union_concepts_concept_id_idx\` (\`concept_id\`),
        CONSTRAINT \`union_concepts_union_id_fkey\` FOREIGN KEY (\`union_id\`) REFERENCES \`unions\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`union_concepts_concept_id_fkey\` FOREIGN KEY (\`concept_id\`) REFERENCES \`concepts\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`mutual_concepts\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`mutual_id\` VARCHAR(191) NOT NULL,
        \`concept_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`uniq_mutual_concept\` (\`mutual_id\`, \`concept_id\`),
        INDEX \`mutual_concepts_mutual_id_idx\` (\`mutual_id\`),
        INDEX \`mutual_concepts_concept_id_idx\` (\`concept_id\`),
        CONSTRAINT \`mutual_concepts_mutual_id_fkey\` FOREIGN KEY (\`mutual_id\`) REFERENCES \`mutuals\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`mutual_concepts_concept_id_fkey\` FOREIGN KEY (\`concept_id\`) REFERENCES \`concepts\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Migración idempotente: copiar concept_id histórico hacia tablas N:M si no están cargados
    try {
      await tenantClient.$executeRawUnsafe(`
        INSERT IGNORE INTO \`union_concepts\` (\`id\`, \`union_id\`, \`concept_id\`, \`created_at\`)
        SELECT UUID(), \`id\`, \`concept_id\`, NOW(3)
        FROM \`unions\`
        WHERE \`concept_id\` IS NOT NULL AND \`concept_id\` != ''
          AND \`id\` NOT IN (SELECT \`union_id\` FROM \`union_concepts\`);
      `);
    } catch (_) {}

    try {
      await tenantClient.$executeRawUnsafe(`
        INSERT IGNORE INTO \`mutual_concepts\` (\`id\`, \`mutual_id\`, \`concept_id\`, \`created_at\`)
        SELECT UUID(), \`id\`, \`concept_id\`, NOW(3)
        FROM \`mutuals\`
        WHERE \`concept_id\` IS NOT NULL AND \`concept_id\` != ''
          AND \`id\` NOT IN (SELECT \`mutual_id\` FROM \`mutual_concepts\`);
      `);
    } catch (_) {}

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`kinships\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`salary_scales\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(50) NULL,
        \`cct_code\` VARCHAR(50) NULL,
        \`description\` TEXT NULL,
        \`amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`is_intern_only\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`is_director_only\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL,
        INDEX \`salary_scales_cct_code_idx\` (\`cct_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Comprobar columnas clave en salary_scales para migraciones no destructivas
    const salaryScaleCols = [
      { name: 'cct_code', def: 'VARCHAR(50) NULL' },
      { name: 'is_intern_only', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'is_director_only', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
    ];
    const existingScaleCols = await tenantClient.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'salary_scales'`
    );
    const existingScaleColSet = new Set(existingScaleCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));
    for (const col of salaryScaleCols) {
      if (!existingScaleColSet.has(col.name.toLowerCase())) {
        await tenantClient.$executeRawUnsafe(
          `ALTER TABLE \`salary_scales\` ADD COLUMN \`${col.name}\` ${col.def};`
        );
      }
    }
    const existingScaleIdx = await tenantClient.$queryRawUnsafe(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'salary_scales' AND INDEX_NAME = 'salary_scales_cct_code_idx'`
    );
    if (!Array.isArray(existingScaleIdx) || existingScaleIdx.length === 0) {
      try {
        await tenantClient.$executeRawUnsafe(
          `CREATE INDEX \`salary_scales_cct_code_idx\` ON \`salary_scales\` (\`cct_code\`);`
        );
      } catch (idxErr) {
        // Ignorar si ya existe con otro estado concurrente
      }
    }

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`salary_scale_periods\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`salary_scale_id\` VARCHAR(191) NOT NULL,
        \`valid_from\` DATETIME(3) NOT NULL,
        \`valid_to\` DATETIME(3) NOT NULL,
        \`amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`increase_type\` VARCHAR(30) NULL,
        \`increase_value\` DECIMAL(12, 2) NULL,
        \`rounding\` VARCHAR(30) NULL,
        \`batch_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`salary_scale_periods_salary_scale_id_idx\` (\`salary_scale_id\`),
        INDEX \`salary_scale_periods_valid_from_valid_to_idx\` (\`valid_from\`, \`valid_to\`),
        CONSTRAINT \`salary_scale_periods_salary_scale_id_fkey\` FOREIGN KEY (\`salary_scale_id\`) REFERENCES \`salary_scales\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`work_shifts\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(50) NULL,
        \`description\` TEXT NULL,
        \`cycle_type\` VARCHAR(30) NOT NULL DEFAULT 'SEMANAL',
        \`daily_hours\` DECIMAL(5, 2) NOT NULL DEFAULT 8.00,
        \`weekly_hours\` DECIMAL(5, 2) NOT NULL DEFAULT 48.00,
        \`monthly_hours\` DECIMAL(6, 2) NOT NULL DEFAULT 200.00,
        \`monthly_days\` DECIMAL(5, 2) NOT NULL DEFAULT 30.00,
        \`percentage\` DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
        \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`work_shift_details\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`work_shift_id\` VARCHAR(191) NOT NULL,
        \`day_of_week\` INT NULL,
        \`cycle_day_number\` INT NULL,
        \`day_name\` VARCHAR(50) NULL,
        \`is_work_day\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`start_time\` VARCHAR(5) NULL,
        \`end_time\` VARCHAR(5) NULL,
        \`crosses_midnight\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`break_minutes\` INT NOT NULL DEFAULT 0,
        \`net_hours\` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
        \`notes\` VARCHAR(255) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`idx_wsd_shift_id\` (\`work_shift_id\`),
        CONSTRAINT \`fk_wsd_work_shift\` FOREIGN KEY (\`work_shift_id\`) REFERENCES \`work_shifts\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);


    // Comprobar columna percentage en work_shifts para migraciones no destructivas
    const workShiftCols = [
      { name: 'percentage', def: 'DECIMAL(5, 2) NOT NULL DEFAULT 100.00' },
    ];
    const existingWorkShiftCols = await tenantClient.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_shifts'`
    );
    const existingWorkShiftColSet = new Set(existingWorkShiftCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));
    for (const col of workShiftCols) {
      if (!existingWorkShiftColSet.has(col.name.toLowerCase())) {
        await tenantClient.$executeRawUnsafe(
          `ALTER TABLE \`work_shifts\` ADD COLUMN \`${col.name}\` ${col.def};`
        );
      }
    }

    // Tabla payment_methods (Formas de Pago - futuro Módulo de Pagos)
    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`payment_methods\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`description\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Crear tabla principal employees si no existe
    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`employees\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`file_number\` VARCHAR(191) NOT NULL UNIQUE,
        \`cuil\` VARCHAR(11) NOT NULL UNIQUE,
        \`first_name\` VARCHAR(191) NOT NULL,
        \`last_name\` VARCHAR(191) NOT NULL,
        \`photo\` LONGTEXT NULL,
        \`document_type\` VARCHAR(20) NOT NULL DEFAULT 'DNI',
        \`document_number\` VARCHAR(20) NOT NULL DEFAULT '',
        \`gender\` VARCHAR(20) NOT NULL DEFAULT 'M',
        \`birth_date\` DATETIME(3) NOT NULL,
        \`hire_date\` DATETIME(3) NOT NULL,
        \`termination_date\` DATETIME(3) NULL,
        \`termination_reason\` VARCHAR(255) NULL,
        \`status\` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
        \`street\` VARCHAR(191) NULL,
        \`street_number\` VARCHAR(50) NULL,
        \`floor\` VARCHAR(20) NULL,
        \`apartment\` VARCHAR(20) NULL,
        \`city\` VARCHAR(191) NULL,
        \`postal_code\` VARCHAR(20) NULL,
        \`province\` VARCHAR(100) NULL,
        \`email\` VARCHAR(191) NULL,
        \`phone\` VARCHAR(191) NULL,
        \`department_id\` VARCHAR(191) NULL,
        \`job_position_id\` VARCHAR(191) NULL,
        \`health_insurance_id\` VARCHAR(191) NULL,
        \`union_id\` VARCHAR(191) NULL,
        \`mutual_id\` VARCHAR(191) NULL,
        \`work_shift_id\` VARCHAR(191) NULL,
        \`payment_method_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL,
        INDEX \`employees_department_id_idx\` (\`department_id\`),
        INDEX \`employees_job_position_id_idx\` (\`job_position_id\`),
        INDEX \`employees_health_insurance_id_idx\` (\`health_insurance_id\`),
        INDEX \`employees_union_id_idx\` (\`union_id\`),
        INDEX \`employees_mutual_id_idx\` (\`mutual_id\`),
        INDEX \`employees_work_shift_id_idx\` (\`work_shift_id\`),
        INDEX \`employees_payment_method_id_idx\` (\`payment_method_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Verificar columnas en employees para migraciones incrementales
    const employeeCols = [
      { name: 'photo', def: 'LONGTEXT NULL' },
      { name: 'document_type', def: "VARCHAR(20) NOT NULL DEFAULT 'DNI'" },
      { name: 'document_number', def: "VARCHAR(20) NOT NULL DEFAULT ''" },
      { name: 'gender', def: "VARCHAR(20) NOT NULL DEFAULT 'M'" },
      { name: 'street', def: 'VARCHAR(191) NULL' },
      { name: 'street_number', def: 'VARCHAR(50) NULL' },
      { name: 'floor', def: 'VARCHAR(20) NULL' },
      { name: 'apartment', def: 'VARCHAR(20) NULL' },
      { name: 'city', def: 'VARCHAR(191) NULL' },
      { name: 'postal_code', def: 'VARCHAR(20) NULL' },
      { name: 'province', def: 'VARCHAR(100) NULL' },
      { name: 'department_id', def: 'VARCHAR(191) NULL' },
      { name: 'job_position_id', def: 'VARCHAR(191) NULL' },
      { name: 'health_insurance_id', def: 'VARCHAR(191) NULL' },
      { name: 'union_id', def: 'VARCHAR(191) NULL' },
      { name: 'mutual_id', def: 'VARCHAR(191) NULL' },
      { name: 'contract_modality_code', def: 'VARCHAR(50) NULL' },
      { name: 'salary_scale_id', def: 'VARCHAR(191) NULL' },
      { name: 'work_shift_id', def: 'VARCHAR(191) NULL' },
      { name: 'payment_method_id', def: 'VARCHAR(191) NULL' },
      { name: 'termination_date', def: 'DATETIME(3) NULL' },
      { name: 'termination_reason', def: 'VARCHAR(255) NULL' },
      { name: 'payroll_group', def: "VARCHAR(50) NOT NULL DEFAULT 'MENSUAL'" },
      { name: 'is_part_time', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'weekly_working_hours', def: 'DECIMAL(6, 2) NOT NULL DEFAULT 48.00' },
      { name: 'monthly_working_hours', def: 'DECIMAL(6, 2) NOT NULL DEFAULT 200.00' },
      { name: 'part_time_percentage', def: 'DECIMAL(5, 2) NOT NULL DEFAULT 100.00' },
      { name: 'basic_salary', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'hourly_rate', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'cbu', def: 'VARCHAR(22) NULL' },
      { name: 'bank_account_type', def: 'VARCHAR(30) NULL' },
    ];

    const existingEmpCols = await tenantClient.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees'`
    );
    const existingEmpSet = new Set(existingEmpCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));

    for (const col of employeeCols) {
      if (!existingEmpSet.has(col.name.toLowerCase())) {
        await tenantClient.$executeRawUnsafe(
          `ALTER TABLE \`employees\` ADD COLUMN \`${col.name}\` ${col.def};`
        );
      }
    }

    // 4. Relajar cualquier columna legacy que pudiera tener restricción NOT NULL en bases antiguas
    const legacyNullableCols = [
      { name: 'base_salary', def: 'DECIMAL(12, 2) NULL DEFAULT 0.00' },
      { name: 'gross_salary', def: 'DECIMAL(12, 2) NULL DEFAULT 0.00' },
      { name: 'net_salary', def: 'DECIMAL(12, 2) NULL DEFAULT 0.00' },
    ];

    for (const legacyCol of legacyNullableCols) {
      if (existingEmpSet.has(legacyCol.name.toLowerCase())) {
        try {
          await tenantClient.$executeRawUnsafe(
            `ALTER TABLE \`employees\` MODIFY COLUMN \`${legacyCol.name}\` ${legacyCol.def};`
          );
        } catch (e) {
          console.warn(`Aviso al modificar columna legacy ${legacyCol.name}:`, e.message);
        }
      }
    }

    // 4b. Migración automática: agrupar básicos existentes y asignar a nóminas según puesto de trabajo
    try {
      const unassignedEmps = await tenantClient.employee.findMany({
        where: { salaryScaleId: null, deletedAt: null },
        include: { jobPosition: true },
      });

      if (unassignedEmps.length > 0) {
        for (const emp of unassignedEmps) {
          const basic = Number(emp.basicSalary) || 0;
          const puestoName = emp.jobPosition?.name?.trim() || 'General';
          const scaleName = puestoName;
          const suffixedName = `${scaleName} ($${basic.toLocaleString('es-AR')})`;

          // 1. Buscar si ya existe una nómina con ese puesto y monto, o con el nombre sufijado
          let scale = await tenantClient.salaryScale.findFirst({
            where: {
              OR: [
                { name: scaleName, amount: basic },
                { name: suffixedName, amount: basic },
                { name: suffixedName },
              ],
              deletedAt: null,
            },
          });

          if (!scale) {
            const existingWithName = await tenantClient.salaryScale.findFirst({
              where: { name: scaleName, deletedAt: null },
            });
            const finalName = existingWithName ? suffixedName : scaleName;

            scale = await tenantClient.salaryScale.findFirst({
              where: { name: finalName, deletedAt: null },
            });

            if (!scale) {
              const isDirector = emp.contractModalityCode === '99' || /director/i.test(puestoName);
              const isIntern = emp.contractModalityCode === '27' || emp.contractModalityCode === '51';

              scale = await tenantClient.salaryScale.create({
                data: {
                  name: finalName,
                  code: emp.jobPosition?.code ? `${emp.jobPosition.code}-BAS` : null,
                  description: `Nómina inicial asignada a ${puestoName}`,
                  amount: basic,
                  isDirectorOnly: isDirector,
                  isInternOnly: isIntern,
                },
              });
            }
          }

          await tenantClient.employee.update({
            where: { id: emp.id },
            data: { salaryScaleId: scale.id },
          });
        }
      }
    } catch (migErr) {
      console.warn('Aviso en migración inicial de nóminas:', migErr.message);
    }

    // 5. Crear tabla employee_relatives si no existe
    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`employee_relatives\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`employee_id\` VARCHAR(191) NOT NULL,
        \`kinship_id\` VARCHAR(191) NOT NULL,
        \`last_name\` VARCHAR(191) NOT NULL,
        \`first_name\` VARCHAR(191) NOT NULL,
        \`document_type\` VARCHAR(20) NOT NULL DEFAULT 'DNI',
        \`document_number\` VARCHAR(20) NOT NULL,
        \`cuil\` VARCHAR(11) NULL,
        \`birth_date\` DATETIME(3) NOT NULL,
        \`is_adherent\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL,
        INDEX \`employee_relatives_employee_id_idx\` (\`employee_id\`),
        INDEX \`employee_relatives_kinship_id_idx\` (\`kinship_id\`),
        CONSTRAINT \`employee_relatives_employee_id_fkey\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`employee_relatives_kinship_id_fkey\` FOREIGN KEY (\`kinship_id\`) REFERENCES \`kinships\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      const existingRelativeCols = await tenantClient.$queryRawUnsafe(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_relatives'`
      );
      const existingRelativeSet = new Set(
        existingRelativeCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase())
      );
      const relativeColsToAdd = [
        { name: 'is_adherent', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
        { name: 'applies_income_tax', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
        { name: 'income_tax_deduction_type', def: 'VARCHAR(50) NULL' },
        { name: 'deduction_percentage', def: 'DECIMAL(5, 2) NOT NULL DEFAULT 100.00' },
        { name: 'is_disability', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
        { name: 'has_no_income_or_below_mni', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
        { name: 'valid_from_month', def: 'INT NULL DEFAULT 1' },
        { name: 'valid_to_month', def: 'INT NULL DEFAULT 12' },
      ];
      for (const col of relativeColsToAdd) {
        if (!existingRelativeSet.has(col.name.toLowerCase())) {
          await tenantClient.$executeRawUnsafe(
            `ALTER TABLE \`employee_relatives\` ADD COLUMN \`${col.name}\` ${col.def};`
          );
        }
      }
    } catch (_) {
      // Manejo silencioso defensivo
    }

    // 6. Precargar o actualizar Obras Sociales
    const hiCatalog = await getHealthInsurancesData();
    const countHi = await tenantClient.healthInsurance.count();
    if (countHi < hiCatalog.length && hiCatalog.length > 0) {
      const existingHis = await tenantClient.healthInsurance.findMany({
        select: { id: true, code: true, name: true },
      });

      const oldCodeMap = {
        '1-2620-4': '126205',
        '1-1200-5': '125707',
        '1-0540-8': '105408',
        '1-2100-3': '115300',
      };

      const existingCodes = new Set();
      for (const h of existingHis) {
        if (oldCodeMap[h.code]) {
          const targetCode = oldCodeMap[h.code];
          const match = hiCatalog.find((c) => c.code === targetCode);
          if (match) {
            await tenantClient.healthInsurance.update({
              where: { id: h.id },
              data: { code: match.code, name: match.name },
            });
            existingCodes.add(targetCode);
            continue;
          }
        }
        if (h.code) existingCodes.add(h.code);
      }

      const missingHis = hiCatalog.filter((hi) => !existingCodes.has(hi.code));
      if (missingHis.length > 0) {
        const recordsToInsert = missingHis.map((hi) => ({
          id: crypto.randomUUID(),
          code: hi.code,
          name: hi.name,
        }));
        await tenantClient.healthInsurance.createMany({
          data: recordsToInsert,
        });
      }
    }

    // 7. Precargar Parentescos si la tabla está vacía
    const countKin = await tenantClient.kinship.count();
    if (countKin === 0) {
      for (const kin of DEFAULT_KINSHIPS) {
        await tenantClient.kinship.create({
          data: {
            id: crypto.randomUUID(),
            ...kin,
          },
        });
      }
    }

    // 7b. Precargar Formas de Pago de prueba si la tabla está vacía
    try {
      const countPm = await tenantClient.paymentMethod.count();
      if (countPm === 0) {
        for (const pm of DEFAULT_PAYMENT_METHODS) {
          await tenantClient.paymentMethod.create({
            data: {
              id: crypto.randomUUID(),
              name: pm.name,
              description: pm.description,
            },
          });
        }
      }
    } catch (pmErr) {
      console.warn('Aviso al precargar payment_methods:', pmErr.message);
    }

    // 8. Soltar FKs legacy en tablas Tenant que apuntaban a tablas ARCA locales (hoy centralizadas en MASTER)
    try {
      const legacyFks = await tenantClient.$queryRawUnsafe(`
        SELECT TABLE_NAME, CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND REFERENCED_TABLE_NAME IN (
            'arca_ccts',
            'arca_categories',
            'arca_positions',
            'arca_service_types',
            'arca_contract_modalities'
          )
      `);
      for (const fk of legacyFks || []) {
        const tbl = fk.TABLE_NAME || fk.table_name;
        const cname = fk.CONSTRAINT_NAME || fk.constraint_name;
        if (tbl && cname) {
          await tenantClient.$executeRawUnsafe(`ALTER TABLE \`${tbl}\` DROP FOREIGN KEY \`${cname}\`;`);
        }
      }
    } catch (fkErr) {
      console.warn('Aviso al soltar claves foráneas ARCA legacy:', fkErr.message);
    }

    // 9. Sincronizar y asegurar esquema del módulo de liquidación de sueldos
    await ensureTenantPayrollSchema(tenantClient);
    return true;
  } catch (err) {
    console.warn('Aviso al verificar esquema de personal y afiliaciones:', err.message);
    return false;
  }
  });
}
