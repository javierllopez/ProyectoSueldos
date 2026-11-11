import crypto from 'crypto';
import {
  verifiedIncomeTaxClients,
  pendingIncomeTaxClients,
  ensureSchemaWithMutex,
} from './schemaMutex.js';

/**
 * Asegura la existencia de tablas, columnas y conceptos de Impuesto a las Ganancias Cuarta Categoría.
 */
export async function ensureTenantIncomeTaxSchema(tenantClient, { force = false } = {}) {
  return ensureSchemaWithMutex(verifiedIncomeTaxClients, pendingIncomeTaxClients, tenantClient, force, async () => {
    try {
    // 1. Tablas Oficiales de Ganancias
    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`income_tax_tables\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`year\` INT NOT NULL,
        \`semester\` INT NULL DEFAULT 1,
        \`month\` INT NOT NULL,
        \`description\` VARCHAR(191) NULL,
        \`non_taxable_minimum\` DECIMAL(14, 2) NOT NULL,
        \`special_deduction\` DECIMAL(14, 2) NOT NULL,
        \`spouse_deduction\` DECIMAL(14, 2) NOT NULL,
        \`child_deduction\` DECIMAL(14, 2) NOT NULL,
        \`disabled_child_deduction\` DECIMAL(14, 2) NOT NULL,
        \`special_deduction_new_prof\` DECIMAL(14, 2) NULL DEFAULT 0.00,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`uniq_income_tax_table_year_month\` (\`year\`, \`month\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`income_tax_scales\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`year\` INT NOT NULL,
        \`month\` INT NOT NULL,
        \`step\` INT NOT NULL,
        \`from_amount\` DECIMAL(14, 2) NOT NULL,
        \`to_amount\` DECIMAL(14, 2) NULL,
        \`fixed_amount\` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
        \`rate_percentage\` DECIMAL(5, 2) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`uniq_income_tax_scale_year_month_step\` (\`year\`, \`month\`, \`step\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`income_tax_general_deduction_limits\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`year\` INT NOT NULL,
        \`code\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`limit_type\` VARCHAR(50) NOT NULL,
        \`limit_value\` DECIMAL(14, 2) NOT NULL,
        \`description\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`uniq_it_gen_limit_year_code\` (\`year\`, \`code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`employee_income_tax_deductions\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`employee_id\` VARCHAR(191) NOT NULL,
        \`fiscal_year\` INT NOT NULL,
        \`deduction_type\` VARCHAR(191) NOT NULL,
        \`provider_cuit\` VARCHAR(11) NULL,
        \`provider_name\` VARCHAR(191) NULL,
        \`voucher_type\` VARCHAR(50) NULL,
        \`voucher_number\` VARCHAR(100) NULL,
        \`month\` INT NULL,
        \`amount\` DECIMAL(12, 2) NOT NULL,
        \`source\` VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
        \`siradig_presentation_id\` VARCHAR(191) NULL,
        \`notes\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`employee_income_tax_deductions_employee_id_fiscal_year_idx\` (\`employee_id\`, \`fiscal_year\`),
        CONSTRAINT \`employee_income_tax_deductions_employee_id_fkey\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`employee_other_incomes\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`employee_id\` VARCHAR(191) NOT NULL,
        \`fiscal_year\` INT NOT NULL,
        \`month\` INT NOT NULL,
        \`employer_cuit\` VARCHAR(11) NOT NULL,
        \`employer_name\` VARCHAR(191) NOT NULL,
        \`gross_income\` DECIMAL(12, 2) NOT NULL,
        \`non_taxable_income\` DECIMAL(12, 2) NULL DEFAULT 0.00,
        \`exempt_income\` DECIMAL(12, 2) NULL DEFAULT 0.00,
        \`pension_contrib\` DECIMAL(12, 2) NULL DEFAULT 0.00,
        \`health_insurance_contrib\` DECIMAL(12, 2) NULL DEFAULT 0.00,
        \`union_contrib\` DECIMAL(12, 2) NULL DEFAULT 0.00,
        \`withheld_tax\` DECIMAL(12, 2) NULL DEFAULT 0.00,
        \`source\` VARCHAR(20) NOT NULL DEFAULT 'SIRADIG',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`employee_other_incomes_employee_id_fiscal_year_idx\` (\`employee_id\`, \`fiscal_year\`),
        CONSTRAINT \`employee_other_incomes_employee_id_fkey\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`employee_income_tax_payments_on_account\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`employee_id\` VARCHAR(191) NOT NULL,
        \`fiscal_year\` INT NOT NULL,
        \`payment_type\` VARCHAR(100) NOT NULL,
        \`cuit_agent\` VARCHAR(11) NULL,
        \`agent_name\` VARCHAR(191) NULL,
        \`month\` INT NOT NULL,
        \`amount\` DECIMAL(12, 2) NOT NULL,
        \`source\` VARCHAR(20) NOT NULL DEFAULT 'SIRADIG',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX \`idx_it_pay_on_acc_emp_year\` (\`employee_id\`, \`fiscal_year\`),
        CONSTRAINT \`employee_income_tax_payments_on_account_employee_id_fkey\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`siradig_imports\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`fiscal_year\` INT NOT NULL,
        \`filename\` VARCHAR(191) NOT NULL,
        \`xml_version\` VARCHAR(50) NULL,
        \`presentation_date\` DATETIME(3) NULL,
        \`total_records\` INT NOT NULL DEFAULT 0,
        \`processed_employees\` INT NOT NULL DEFAULT 0,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'PROCESSED',
        \`summary\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`income_tax_settlements\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`fiscal_year\` INT NOT NULL,
        \`month\` INT NOT NULL,
        \`settlement_type\` VARCHAR(50) NOT NULL DEFAULT 'MONTHLY',
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'CALCULATED',
        \`description\` VARCHAR(191) NULL,
        \`total_employees_evaluated\` INT NOT NULL DEFAULT 0,
        \`total_employees_withheld\` INT NOT NULL DEFAULT 0,
        \`total_withheld_amount\` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
        \`total_refund_amount\` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
        \`withholding_concept_id\` VARCHAR(191) NULL,
        \`refund_concept_id\` VARCHAR(191) NULL,
        \`exported_payroll_period_id\` VARCHAR(191) NULL,
        \`exported_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`uniq_it_settlement_period\` (\`fiscal_year\`, \`month\`, \`settlement_type\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`income_tax_settlement_details\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`settlement_id\` VARCHAR(191) NOT NULL,
        \`employee_id\` VARCHAR(191) NOT NULL,
        \`current_month_gross\` DECIMAL(12, 2) NOT NULL,
        \`accumulated_gross\` DECIMAL(14, 2) NOT NULL,
        \`sac_projected_month\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`sac_projected_accumulated\` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
        \`other_employers_gross\` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
        \`legal_deductions_accumulated\` DECIMAL(14, 2) NOT NULL,
        \`general_deductions_accumulated\` DECIMAL(14, 2) NOT NULL,
        \`personal_deductions_accumulated\` DECIMAL(14, 2) NOT NULL,
        \`family_deduction_details\` JSON NULL,
        \`net_taxable_income_accumulated\` DECIMAL(14, 2) NOT NULL,
        \`determined_tax_accumulated\` DECIMAL(14, 2) NOT NULL,
        \`payments_on_account_accumulated\` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
        \`prior_months_withheld_tax\` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
        \`net_monthly_withholding\` DECIMAL(12, 2) NOT NULL,
        \`is_exported_to_payroll\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`notes\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`uniq_it_settlement_emp\` (\`settlement_id\`, \`employee_id\`),
        INDEX \`income_tax_settlement_details_employee_id_idx\` (\`employee_id\`),
        CONSTRAINT \`income_tax_settlement_details_settlement_id_fkey\` FOREIGN KEY (\`settlement_id\`) REFERENCES \`income_tax_settlements\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`income_tax_settlement_details_employee_id_fkey\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Asegurar conceptos de Ganancias SU8200 y SU5200 en la base de datos
    const incomeTaxConcepts = [
      {
        code: 'SU8200',
        name: 'Retención Impuesto a las Ganancias 4ta Cat.',
        type: 'DEDUCTION',
        calculationType: 'FIXED',
        periodType: 'MONTHLY',
        scope: 'INDIVIDUAL',
        noveltyDataType: 'IMPORTE',
        calculationOrder: 8200,
        defaultValue: 0.00,
        formula: null,
        matrixData: null,
        isPersistent: false,
        isActive: true,
        arcaConceptCode: '820000',
        appliesSipaAporte: false,
        appliesSipaContrib: false,
        appliesInssjypAporte: false,
        appliesInssjypContrib: false,
        appliesOsAporte: false,
        appliesOsContrib: false,
        appliesFsrAporte: false,
        appliesFsrContrib: false,
        appliesRenatreAporte: false,
        appliesRenatreContrib: false,
        appliesAaffContrib: false,
        appliesFneContrib: false,
        appliesLrtContrib: false,
        isRepeatable: false,
      },
      {
        code: 'SU5200',
        name: 'Devolución Impuesto a las Ganancias 4ta Cat.',
        type: 'NON_REMUNERATIVE',
        calculationType: 'FIXED',
        periodType: 'MONTHLY',
        scope: 'INDIVIDUAL',
        noveltyDataType: 'IMPORTE',
        calculationOrder: 5200,
        defaultValue: 0.00,
        formula: null,
        matrixData: null,
        isPersistent: false,
        isActive: true,
        arcaConceptCode: '520002',
        appliesSipaAporte: false,
        appliesSipaContrib: false,
        appliesInssjypAporte: false,
        appliesInssjypContrib: false,
        appliesOsAporte: false,
        appliesOsContrib: false,
        appliesFsrAporte: false,
        appliesFsrContrib: false,
        appliesRenatreAporte: false,
        appliesRenatreContrib: false,
        appliesAaffContrib: false,
        appliesFneContrib: false,
        appliesLrtContrib: false,
        isRepeatable: false,
      },
    ];

    for (const c of incomeTaxConcepts) {
      const existing = await tenantClient.concept.findUnique({
        where: { code: c.code },
      });
      if (!existing) {
        await tenantClient.concept.create({
          data: {
            id: crypto.randomUUID(),
            ...c,
          },
        });
      }
    }

    return true;
  } catch (err) {
    console.warn('Aviso al verificar esquema de Impuesto a las Ganancias:', err.message);
    return false;
  }
  });
}
