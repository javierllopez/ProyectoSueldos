import crypto from 'crypto';
import {
  verifiedPayrollClients,
  pendingPayrollClients,
  ensureSchemaWithMutex,
} from './schemaMutex.js';
import { DEFAULT_CONCEPTS } from './defaultCatalogs.js';
import { ensureTenantIncomeTaxSchema } from './incomeTax.ensurer.js';

/**
 * Asegura la existencia de tablas, columnas y configuraciones del módulo de liquidación de sueldos.
 */
export async function ensureTenantPayrollSchema(tenantClient, { force = false } = {}) {
  return ensureSchemaWithMutex(verifiedPayrollClients, pendingPayrollClients, tenantClient, force, async () => {
    try {
    // 1. Crear tablas si no existen
    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`pay_slip_bases\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`pay_slip_id\` VARCHAR(191) NOT NULL UNIQUE,
        \`base_imponible_1\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`base_imponible_2\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`base_imponible_3\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`base_imponible_4\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`base_imponible_5\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`base_imponible_6\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`base_imponible_7\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`base_imponible_8\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`base_imponible_9\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`base_imponible_10\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`detraction_amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`situation_code\` VARCHAR(5) NOT NULL DEFAULT '01',
        \`condition_code\` VARCHAR(5) NOT NULL DEFAULT '01',
        \`activity_code\` VARCHAR(10) NOT NULL DEFAULT '000',
        \`contract_modality\` VARCHAR(10) NOT NULL DEFAULT '001',
        \`has_spouse\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`children_count\` INT NOT NULL DEFAULT 0,
        \`has_scvo\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`has_cct\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT \`pay_slip_bases_pay_slip_id_fkey\` FOREIGN KEY (\`pay_slip_id\`) REFERENCES \`pay_slips\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`payroll_settings\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`employer_type\` VARCHAR(50) NOT NULL DEFAULT 'SERVICIOS_COMERCIO',
        \`sipa_rate\` DECIMAL(6, 2) NOT NULL DEFAULT 10.77,
        \`inssjyp_rate\` DECIMAL(6, 2) NOT NULL DEFAULT 1.58,
        \`os_rate\` DECIMAL(6, 2) NOT NULL DEFAULT 6.00,
        \`fne_rate\` DECIMAL(6, 2) NOT NULL DEFAULT 0.94,
        \`aaff_rate\` DECIMAL(6, 2) NOT NULL DEFAULT 4.70,
        \`art_rate\` DECIMAL(6, 2) NOT NULL DEFAULT 3.50,
        \`art_fixed_fee\` DECIMAL(10, 2) NOT NULL DEFAULT 850.00,
        \`scvo_fee\` DECIMAL(10, 2) NOT NULL DEFAULT 650.00,
        \`detraction_base\` DECIMAL(10, 2) NOT NULL DEFAULT 7003.68,
        \`anses_min_cap\` DECIMAL(12, 2) NOT NULL DEFAULT 82287.12,
        \`anses_max_cap\` DECIMAL(12, 2) NOT NULL DEFAULT 2674292.72,
        \`standard_weekly_hours\` DECIMAL(6, 2) NOT NULL DEFAULT 48.00,
        \`standard_monthly_hours\` DECIMAL(6, 2) NOT NULL DEFAULT 200.00,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`employee_concepts\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`employee_id\` VARCHAR(191) NOT NULL,
        \`concept_id\` VARCHAR(191) NOT NULL,
        \`amount\` DECIMAL(12, 2) NULL,
        \`units\` DECIMAL(8, 2) NULL,
        \`notes\` VARCHAR(255) NULL,
        \`valid_from\` DATETIME(3) NULL,
        \`valid_to\` DATETIME(3) NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`employee_concepts_employee_id_idx\` (\`employee_id\`),
        INDEX \`employee_concepts_concept_id_idx\` (\`concept_id\`),
        CONSTRAINT \`employee_concepts_employee_id_fkey\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`employee_concepts_concept_id_fkey\` FOREIGN KEY (\`concept_id\`) REFERENCES \`concepts\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`period_novelties\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`payroll_period_id\` VARCHAR(191) NOT NULL,
        \`employee_id\` VARCHAR(191) NOT NULL,
        \`concept_id\` VARCHAR(191) NOT NULL,
        \`units\` DECIMAL(12, 2) NULL,
        \`amount\` DECIMAL(12, 2) NULL,
        \`notes\` VARCHAR(255) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`uniq_period_emp_concept\` (\`payroll_period_id\`, \`employee_id\`, \`concept_id\`),
        INDEX \`period_novelties_period_id_idx\` (\`payroll_period_id\`),
        INDEX \`period_novelties_employee_id_idx\` (\`employee_id\`),
        INDEX \`period_novelties_concept_id_idx\` (\`concept_id\`),
        CONSTRAINT \`period_novelties_payroll_period_id_fkey\` FOREIGN KEY (\`payroll_period_id\`) REFERENCES \`payroll_periods\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`period_novelties_employee_id_fkey\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`period_novelties_concept_id_fkey\` FOREIGN KEY (\`concept_id\`) REFERENCES \`concepts\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 1.1 Tabla payroll_matrices
    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`payroll_matrices\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`code\` VARCHAR(50) NOT NULL UNIQUE,
        \`name\` VARCHAR(150) NOT NULL,
        \`description\` VARCHAR(255) NULL,
        \`input_concept_code\` VARCHAR(50) NOT NULL,
        \`match_type\` VARCHAR(20) NOT NULL DEFAULT 'RANGE',
        \`default_value\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`rows\` LONGTEXT NOT NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 1.2 Tabla payroll_fixed_values (Valores Globales Fijos / Constantes)
    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`payroll_fixed_values\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`code\` VARCHAR(50) NOT NULL UNIQUE,
        \`name\` VARCHAR(150) NOT NULL,
        \`description\` VARCHAR(255) NULL,
        \`value\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`unit\` VARCHAR(20) NOT NULL DEFAULT '$',
        \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 1.2b Tabla salary_scale_periods (Vigencias por período de escalas salariales)
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

    // 1.3 Tablas de Embargos Judiciales Multi-Concepto
    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`employee_embargoes\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`employee_id\` VARCHAR(191) NOT NULL,
        \`case_title\` VARCHAR(255) NOT NULL,
        \`dossier_number\` VARCHAR(100) NULL,
        \`court\` VARCHAR(150) NULL,
        \`secretary\` VARCHAR(150) NULL,
        \`judicial_district\` VARCHAR(150) NULL,
        \`embargo_type\` VARCHAR(50) NOT NULL DEFAULT 'COMERCIAL',
        \`has_cap\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`total_amount\` DECIMAL(12, 2) NULL,
        \`priority_order\` INT NOT NULL DEFAULT 1,
        \`status\` VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
        \`start_date\` DATETIME(3) NULL,
        \`end_date\` DATETIME(3) NULL,
        \`notes\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`employee_embargoes_employee_id_idx\` (\`employee_id\`),
        INDEX \`employee_embargoes_status_idx\` (\`status\`),
        CONSTRAINT \`employee_embargoes_employee_id_fkey\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`employee_embargo_concepts\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`embargo_id\` VARCHAR(191) NOT NULL,
        \`concept_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`uniq_embargo_concept\` (\`embargo_id\`, \`concept_id\`),
        INDEX \`employee_embargo_concepts_embargo_id_idx\` (\`embargo_id\`),
        INDEX \`employee_embargo_concepts_concept_id_idx\` (\`concept_id\`),
        CONSTRAINT \`employee_embargo_concepts_embargo_id_fkey\` FOREIGN KEY (\`embargo_id\`) REFERENCES \`employee_embargoes\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`employee_embargo_concepts_concept_id_fkey\` FOREIGN KEY (\`concept_id\`) REFERENCES \`concepts\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 1.4 Tabla payroll_fiscal_periods (Períodos Fiscales Mensuales)
    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`payroll_fiscal_periods\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`year\` INT NOT NULL,
        \`month\` INT NOT NULL,
        \`status\` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
        \`closed_at\` DATETIME(3) NULL,
        \`closed_by\` VARCHAR(191) NULL,
        \`notes\` VARCHAR(255) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`uniq_fiscal_period_year_month\` (\`year\`, \`month\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 1.5 Columna fiscal_period_id en payroll_periods
    const initialPeriodCols = await tenantClient.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_periods'`
    );
    const initialPeriodSet = new Set(initialPeriodCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));
    if (!initialPeriodSet.has('fiscal_period_id')) {
      await tenantClient.$executeRawUnsafe(`ALTER TABLE \`payroll_periods\` ADD COLUMN \`fiscal_period_id\` VARCHAR(191) NULL;`);
    }

    // 1.6 Backfill no destructivo: vincular únicamente liquidaciones existentes sin fiscal_period_id
    try {
      const orphanPeriods = await tenantClient.payrollPeriod.findMany({
        where: { fiscalPeriodId: null },
        select: { id: true, year: true, month: true, status: true },
      });

      if (orphanPeriods.length > 0) {
        const hasOpenFiscal =
          (await tenantClient.payrollFiscalPeriod.count({ where: { status: 'OPEN' } })) > 0;
        const groupedYm = new Map();
        for (const p of orphanPeriods) {
          const key = `${p.year}-${p.month}`;
          if (!groupedYm.has(key)) groupedYm.set(key, { year: p.year, month: p.month, allClosed: true });
          if (p.status !== 'CLOSED') groupedYm.get(key).allClosed = false;
        }

        let assignedOpenDuringBackfill = false;
        for (const { year, month, allClosed } of groupedYm.values()) {
          let fp = await tenantClient.payrollFiscalPeriod.findUnique({
            where: { year_month: { year, month } },
          });
          if (!fp) {
            const shouldBeOpen = !allClosed && !hasOpenFiscal && !assignedOpenDuringBackfill;
            fp = await tenantClient.payrollFiscalPeriod.create({
              data: {
                id: crypto.randomUUID(),
                year,
                month,
                status: shouldBeOpen ? 'OPEN' : 'CLOSED',
                closedAt: shouldBeOpen ? null : new Date(),
                notes: `Período migrado automáticamente ${String(month).padStart(2, '0')}/${year}`,
              },
            });
            if (shouldBeOpen) assignedOpenDuringBackfill = true;
          }
          await tenantClient.payrollPeriod.updateMany({
            where: { year, month, fiscalPeriodId: null },
            data: { fiscalPeriodId: fp.id },
          });
        }
      }
    } catch (e) {
      console.warn('Aviso al vincular fiscal_periods huérfanos:', e.message);
    }

    // 2. Columnas en concepts
    const conceptCols = [
      { name: 'period_type', def: "VARCHAR(50) NOT NULL DEFAULT 'ALL'" },
      { name: 'scope', def: "VARCHAR(20) NOT NULL DEFAULT 'GENERAL'" },
      { name: 'is_persistent', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'novelty_data_type', def: "VARCHAR(20) NOT NULL DEFAULT 'CANTIDAD'" },
      { name: 'quantity_source', def: "VARCHAR(255) NULL DEFAULT 'AUTO'" },
      { name: 'calculation_order', def: 'INT NOT NULL DEFAULT 100' },
      { name: 'formula', def: 'TEXT NULL' },
      { name: 'matrix_data', def: 'LONGTEXT NULL' },
      { name: 'matrix_id', def: 'VARCHAR(191) NULL' },
      { name: 'arca_concept_code', def: 'VARCHAR(10) NULL' },
      { name: 'applies_sipa_aporte', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'applies_sipa_contrib', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'applies_inssjyp_aporte', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'applies_inssjyp_contrib', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'applies_os_aporte', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'applies_os_contrib', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'applies_fsr_aporte', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'applies_fsr_contrib', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'applies_renatre_aporte', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'applies_renatre_contrib', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'applies_aaff_contrib', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'applies_fne_contrib', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'applies_lrt_contrib', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'applies_reg_dif_aporte', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'applies_reg_esp_aporte', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'applies_detraccion', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'is_repeatable', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'is_embargo', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
    ];
    const existingConceptCols = await tenantClient.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'concepts'`
    );
    const existingConceptSet = new Set(existingConceptCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));
    for (const col of conceptCols) {
      if (!existingConceptSet.has(col.name.toLowerCase())) {
        await tenantClient.$executeRawUnsafe(`ALTER TABLE \`concepts\` ADD COLUMN \`${col.name}\` ${col.def};`);
      }
    }
    // Asegurar que quantity_source tenga capacidad de hasta 255 caracteres para fórmulas
    try {
      await tenantClient.$executeRawUnsafe(
        "ALTER TABLE `concepts` MODIFY COLUMN `quantity_source` VARCHAR(255) NULL DEFAULT 'AUTO'"
      );
    } catch (_) {}

    // 3. Columnas en payroll_periods
    const periodCols = [
      { name: 'settlement_number', def: 'INT NOT NULL DEFAULT 1' },
      { name: 'settlement_name', def: 'VARCHAR(191) NULL' },
      { name: 'settlement_type', def: "VARCHAR(5) NOT NULL DEFAULT 'M'" },
      { name: 'liquidation_date', def: 'DATETIME(3) NULL' },
      { name: 'payment_date', def: 'DATETIME(3) NULL' },
      { name: 'payment_place', def: 'VARCHAR(100) NULL' },
      { name: 'deposit_date', def: 'DATETIME(3) NULL' },
      { name: 'deposit_bank', def: 'VARCHAR(100) NULL' },
      { name: 'rubric_date', def: 'DATETIME(3) NULL' },
      { name: 'total_gross', def: 'DECIMAL(14, 2) NOT NULL DEFAULT 0.00' },
      { name: 'total_net', def: 'DECIMAL(14, 2) NOT NULL DEFAULT 0.00' },
      { name: 'total_employer_cost', def: 'DECIMAL(14, 2) NOT NULL DEFAULT 0.00' },
      { name: 'closed_at', def: 'DATETIME(3) NULL' },
      { name: 'closed_by', def: 'VARCHAR(191) NULL' },
    ];
    const existingPeriodCols = await tenantClient.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_periods'`
    );
    const existingPeriodSet = new Set(existingPeriodCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));
    for (const col of periodCols) {
      if (!existingPeriodSet.has(col.name.toLowerCase())) {
        await tenantClient.$executeRawUnsafe(`ALTER TABLE \`payroll_periods\` ADD COLUMN \`${col.name}\` ${col.def};`);
      }
    }

    // 3.1 Saneamiento de índices únicos heredados en payroll_periods (permitir múltiples liquidaciones del mismo tipo por período)
    try {
      const periodIndexes = await tenantClient.$queryRawUnsafe(
        `SHOW INDEX FROM \`payroll_periods\` WHERE Non_unique = 0 AND Key_name != 'PRIMARY'`
      );
      const indexColsMap = new Map();
      for (const row of periodIndexes) {
        const keyName = row.Key_name || row.key_name || row.KEY_NAME;
        const colName = String(row.Column_name || row.column_name || row.COLUMN_NAME || '').toLowerCase();
        if (!keyName) continue;
        if (!indexColsMap.has(keyName)) {
          indexColsMap.set(keyName, new Set());
        }
        indexColsMap.get(keyName).add(colName);
      }

      let hasValidSettlementUniqueIndex = false;
      for (const [keyName, colsSet] of indexColsMap.entries()) {
        if (!colsSet.has('settlement_number')) {
          await tenantClient.$executeRawUnsafe(`ALTER TABLE \`payroll_periods\` DROP INDEX \`${keyName}\`;`);
        } else if (
          colsSet.has('year') &&
          colsSet.has('month') &&
          colsSet.has('period_type') &&
          colsSet.has('settlement_number')
        ) {
          hasValidSettlementUniqueIndex = true;
        }
      }

      // Normalizar settlement_number correlativo por (year, month) si existen duplicados heredados (ej. todos en 1)
      const allPeriods = await tenantClient.$queryRawUnsafe(
        `SELECT \`id\`, \`year\`, \`month\`, \`settlement_number\` FROM \`payroll_periods\` ORDER BY \`year\` ASC, \`month\` ASC, \`created_at\` ASC, \`id\` ASC`
      );
      const byYearMonth = new Map();
      for (const p of allPeriods) {
        const ymKey = `${p.year}-${p.month}`;
        if (!byYearMonth.has(ymKey)) byYearMonth.set(ymKey, []);
        byYearMonth.get(ymKey).push(p);
      }
      for (const [, list] of byYearMonth.entries()) {
        const seenNums = new Set();
        let hasCollision = false;
        for (const item of list) {
          const num = Number(item.settlement_number) || 0;
          if (num <= 0 || seenNums.has(num)) {
            hasCollision = true;
            break;
          }
          seenNums.add(num);
        }
        if (hasCollision) {
          let seq = 1;
          for (const item of list) {
            await tenantClient.$executeRawUnsafe(
              `UPDATE \`payroll_periods\` SET \`settlement_number\` = ? WHERE \`id\` = ?`,
              seq,
              item.id
            );
            seq += 1;
          }
        }
      }

      if (!hasValidSettlementUniqueIndex) {
        await tenantClient.$executeRawUnsafe(
          `ALTER TABLE \`payroll_periods\` ADD UNIQUE INDEX \`payroll_periods_unique_settlement\` (\`year\`, \`month\`, \`period_type\`, \`settlement_number\`);`
        );
      }
    } catch (idxErr) {
      console.warn('Aviso al sanear índices de payroll_periods:', idxErr.message);
    }

    // 4. Columnas en pay_slips
    const slipCols = [
      { name: 'remunerative_salary', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'net_salary_words', def: 'VARCHAR(500) NULL' },
      { name: 'payment_method', def: "VARCHAR(20) NOT NULL DEFAULT 'CBU'" },
      { name: 'bank_name', def: 'VARCHAR(100) NULL' },
      { name: 'cbu', def: 'VARCHAR(30) NULL' },
      { name: 'worked_days', def: 'INT NOT NULL DEFAULT 30' },
      { name: 'worked_hours', def: 'DECIMAL(8, 2) NULL' },
      { name: 'sipa_contrib', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'inssjyp_contrib', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'os_contrib', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'fne_contrib', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'aaff_contrib', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'art_contrib', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'scvo_contrib', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'union_contrib', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'total_employer_contrib', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'total_labor_cost', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'pct_net_salary', def: 'DECIMAL(6, 2) NOT NULL DEFAULT 0.00' },
      { name: 'pct_employee_deductions', def: 'DECIMAL(6, 2) NOT NULL DEFAULT 0.00' },
      { name: 'pct_social_security_contrib', def: 'DECIMAL(6, 2) NOT NULL DEFAULT 0.00' },
      { name: 'pct_health_contrib', def: 'DECIMAL(6, 2) NOT NULL DEFAULT 0.00' },
      { name: 'pct_art_and_insurance', def: 'DECIMAL(6, 2) NOT NULL DEFAULT 0.00' },
      { name: 'pct_union_and_chambers', def: 'DECIMAL(6, 2) NOT NULL DEFAULT 0.00' },
      { name: 'signature_hash', def: 'VARCHAR(64) NULL' },
      { name: 'signed_at', def: 'DATETIME(3) NULL' },
      { name: 'status', def: "VARCHAR(50) NOT NULL DEFAULT 'DRAFT'" },
      { name: 'closed_at', def: 'DATETIME(3) NULL' },
      { name: 'closed_by', def: 'VARCHAR(191) NULL' },
    ];
    const existingSlipCols = await tenantClient.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pay_slips'`
    );
    const existingSlipSet = new Set(existingSlipCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));
    for (const col of slipCols) {
      if (!existingSlipSet.has(col.name.toLowerCase())) {
        await tenantClient.$executeRawUnsafe(`ALTER TABLE \`pay_slips\` ADD COLUMN \`${col.name}\` ${col.def};`);
      }
    }

    // 5. Columnas en pay_slip_items
    const itemCols = [
      { name: 'concept_id', def: 'VARCHAR(191) NULL' },
      { name: 'unit_label', def: 'VARCHAR(20) NULL' },
      { name: 'base_amount', def: 'DECIMAL(12, 2) NULL' },
      { name: 'arca_concept_code', def: 'VARCHAR(10) NULL' },
      { name: 'formula_explanation', def: 'TEXT NULL' },
      { name: 'notes', def: 'VARCHAR(255) NULL' },
    ];
    const existingItemCols = await tenantClient.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pay_slip_items'`
    );
    const existingItemSet = new Set(existingItemCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));
    for (const col of itemCols) {
      if (!existingItemSet.has(col.name.toLowerCase())) {
        await tenantClient.$executeRawUnsafe(`ALTER TABLE \`pay_slip_items\` ADD COLUMN \`${col.name}\` ${col.def};`);
      }
    }

    // 5b. Columnas en pay_slip_bases (Bases diferenciales LSD Art. 92 TER)
    const basisCols = [
      { name: 'base_dif_aporte_os', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'base_dif_contrib_os', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'base_dif_lrt', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'adherents_count', def: 'INT NOT NULL DEFAULT 0' },
    ];
    const existingBasisCols = await tenantClient.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pay_slip_bases'`
    );
    const existingBasisSet = new Set(existingBasisCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));
    for (const col of basisCols) {
      if (!existingBasisSet.has(col.name.toLowerCase())) {
        await tenantClient.$executeRawUnsafe(`ALTER TABLE \`pay_slip_bases\` ADD COLUMN \`${col.name}\` ${col.def};`);
      }
    }

    // 6. Verificar columnas de empleados para jornada y haberes fijos
    const empCols = [
      { name: 'payroll_group', def: "VARCHAR(50) NOT NULL DEFAULT 'MENSUAL'" },
      { name: 'is_part_time', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'weekly_working_hours', def: 'DECIMAL(6, 2) NOT NULL DEFAULT 48.00' },
      { name: 'monthly_working_hours', def: 'DECIMAL(6, 2) NOT NULL DEFAULT 200.00' },
      { name: 'part_time_percentage', def: 'DECIMAL(5, 2) NOT NULL DEFAULT 100.00' },
      { name: 'basic_salary', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
      { name: 'hourly_rate', def: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00' },
    ];
    const existingEmpCols = await tenantClient.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees'`
    );
    const existingEmpSet = new Set(existingEmpCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));
    for (const col of empCols) {
      if (!existingEmpSet.has(col.name.toLowerCase())) {
        await tenantClient.$executeRawUnsafe(`ALTER TABLE \`employees\` ADD COLUMN \`${col.name}\` ${col.def};`);
      }
    }

    // 7. Verificar columnas de horas estándar en payroll_settings
    const settingCols = [
      { name: 'standard_weekly_hours', def: 'DECIMAL(6, 2) NOT NULL DEFAULT 48.00' },
      { name: 'standard_monthly_hours', def: 'DECIMAL(6, 2) NOT NULL DEFAULT 200.00' },
    ];
    const existingSettingCols = await tenantClient.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_settings'`
    );
    const existingSettingSet = new Set(existingSettingCols.map((c) => (c.COLUMN_NAME || c.column_name || '').toLowerCase()));
    for (const col of settingCols) {
      if (!existingSettingSet.has(col.name.toLowerCase())) {
        await tenantClient.$executeRawUnsafe(`ALTER TABLE \`payroll_settings\` ADD COLUMN \`${col.name}\` ${col.def};`);
      }
    }

    // 8. Precargar Parámetros Patronales por Defecto si la tabla está vacía
    const countSettings = await tenantClient.payrollSetting.count();
    if (countSettings === 0) {
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
    }

    // 9. Precargar o asegurar Conceptos Estándar si faltan en el tenant
    for (const concept of DEFAULT_CONCEPTS) {
      const existing = await tenantClient.concept.findUnique({
        where: { code: concept.code },
      });
      if (!existing) {
        await tenantClient.concept.create({
          data: {
            id: crypto.randomUUID(),
            ...concept,
          },
        });
      } else if (existing.deletedAt !== null && concept.code === '1001' && existing.name !== concept.name) {
        // Si el concepto 1001 preexistente estaba eliminado y era un concepto previo ajeno,
        // actualizar el código del concepto legacy para que no colisione y dar de alta el concepto oficial de pasantías
        await tenantClient.concept.update({
          where: { id: existing.id },
          data: { code: `1001_LEGACY_${existing.id.substring(0, 8)}` },
        });
        await tenantClient.concept.create({
          data: {
            id: crypto.randomUUID(),
            ...concept,
          },
        });
      }
    }
    // 10. Asegurar Esquema y Conceptos de Impuesto a las Ganancias
    await ensureTenantIncomeTaxSchema(tenantClient, { force });

    // 11. Tabla de Auditoría de Cierres de Período, Índices Compuestos y Backfill de Recibos Cerrados
    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`payroll_closing_audits\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`scope\` VARCHAR(30) NOT NULL,
        \`fiscal_period_id\` VARCHAR(191) NULL,
        \`payroll_period_id\` VARCHAR(191) NULL,
        \`year\` INT NOT NULL,
        \`month\` INT NOT NULL,
        \`closed_period_ids\` JSON NOT NULL,
        \`total_slips_closed\` INT NOT NULL DEFAULT 0,
        \`total_gross\` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
        \`total_net\` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
        \`total_employer_cost\` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
        \`purged_novelties_count\` INT NOT NULL DEFAULT 0,
        \`purged_novelties_summary\` JSON NULL,
        \`terminated_employees_count\` INT NOT NULL DEFAULT 0,
        \`terminated_employees\` JSON NULL,
        \`additional_actions\` JSON NULL,
        \`warnings_accepted\` JSON NULL,
        \`checksum_hash\` VARCHAR(64) NOT NULL,
        \`closed_by\` VARCHAR(191) NULL,
        \`closed_by_name\` VARCHAR(191) NULL,
        \`notes\` VARCHAR(500) NULL,
        \`closed_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX \`payroll_closing_audits_year_month_idx\` (\`year\`, \`month\`),
        INDEX \`payroll_closing_audits_fiscal_period_id_idx\` (\`fiscal_period_id\`),
        INDEX \`payroll_closing_audits_payroll_period_id_idx\` (\`payroll_period_id\`),
        INDEX \`payroll_closing_audits_closed_at_idx\` (\`closed_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      const idxStats = await tenantClient.$queryRawUnsafe(
        `SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('payroll_periods', 'pay_slips')`
      );
      const existingIdx = new Set(
        (idxStats || []).map((r) => `${String(r.TABLE_NAME || r.table_name || '').toLowerCase()}::${String(r.INDEX_NAME || r.index_name || '').toLowerCase()}`)
      );
      if (!existingIdx.has('payroll_periods::payroll_periods_status_year_month_idx')) {
        await tenantClient.$executeRawUnsafe(
          'CREATE INDEX `payroll_periods_status_year_month_idx` ON `payroll_periods` (`status`, `year`, `month`);'
        );
      }
      if (!existingIdx.has('pay_slips::pay_slips_period_status_deleted_idx')) {
        await tenantClient.$executeRawUnsafe(
          'CREATE INDEX `pay_slips_period_status_deleted_idx` ON `pay_slips` (`payroll_period_id`, `status`, `deleted_at`);'
        );
      }
      if (!existingIdx.has('pay_slips::pay_slips_emp_status_deleted_idx')) {
        await tenantClient.$executeRawUnsafe(
          'CREATE INDEX `pay_slips_emp_status_deleted_idx` ON `pay_slips` (`employee_id`, `status`, `deleted_at`);'
        );
      }
    } catch (_) {}

    // Backfill idempotente: normalizar recibos vigentes pertenecientes a liquidaciones heredadas CLOSED
    try {
      await tenantClient.$executeRawUnsafe(`
        UPDATE \`pay_slips\` ps
        INNER JOIN \`payroll_periods\` pp ON pp.\`id\` = ps.\`payroll_period_id\`
        SET ps.\`status\` = 'CLOSED',
            ps.\`closed_at\` = COALESCE(ps.\`closed_at\`, pp.\`closed_at\`, ps.\`updated_at\`)
        WHERE pp.\`status\` = 'CLOSED'
          AND ps.\`deleted_at\` IS NULL
          AND ps.\`status\` != 'CLOSED';
      `);
    } catch (_) {}

    // 12. Saneamiento idempotente de períodos fiscales cerrados en falso por migraciones heredadas
    // Solo actúa sobre períodos CLOSED con closedBy=null, 0 liquidaciones y 0 actas de cierre.
    try {
      const [allFiscalPeriods, closingAudits] = await Promise.all([
        tenantClient.payrollFiscalPeriod.findMany({
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
          include: {
            _count: { select: { settlements: true } },
          },
        }),
        tenantClient.payrollClosingAudit.findMany({
          where: { scope: 'FISCAL_PERIOD' },
          select: { fiscalPeriodId: true, year: true, month: true },
        }),
      ]);

      const auditedKeys = new Set();
      for (const a of closingAudits || []) {
        if (a.fiscalPeriodId) auditedKeys.add(a.fiscalPeriodId);
        if (a.year && a.month) auditedKeys.add(`${a.year}-${a.month}`);
      }

      const isOrphanClosed = (fp) =>
        fp.status === 'CLOSED' &&
        !fp.closedBy &&
        (fp._count?.settlements || 0) === 0 &&
        !auditedKeys.has(fp.id) &&
        !auditedKeys.has(`${fp.year}-${fp.month}`);

      const orphanClosedFps = allFiscalPeriods.filter(isOrphanClosed);
      if (orphanClosedFps.length > 0) {
        const hasOpenFp = allFiscalPeriods.some((fp) => fp.status === 'OPEN');
        let restoredId = null;

        if (!hasOpenFp) {
          const formalClosedFps = allFiscalPeriods.filter((fp) => fp.status === 'CLOSED' && !isOrphanClosed(fp));
          const maxFormalYm = formalClosedFps.reduce((max, fp) => Math.max(max, fp.year * 12 + fp.month), 0);
          const candidate = orphanClosedFps.find((fp) => fp.year * 12 + fp.month > maxFormalYm);
          if (candidate) {
            await tenantClient.payrollFiscalPeriod.update({
              where: { id: candidate.id },
              data: { status: 'OPEN', closedAt: null, closedBy: null },
            });
            restoredId = candidate.id;
          }
        }

        const staleOrphanIds = orphanClosedFps.filter((fp) => fp.id !== restoredId).map((fp) => fp.id);
        if (staleOrphanIds.length > 0) {
          await tenantClient.payrollFiscalPeriod.deleteMany({
            where: { id: { in: staleOrphanIds }, status: 'CLOSED', closedBy: null },
          });
        }
      }
    } catch (repairErr) {
      console.warn('Aviso al sanear períodos fiscales huérfanos:', repairErr.message);
    }

    return true;
  } catch (err) {
    console.warn('Aviso al verificar esquema de liquidación de sueldos:', err.message);
    return false;
  }
  });
}
