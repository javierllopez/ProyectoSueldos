import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import prismaMaster from '../config/prisma.js';
import tenantConnectionManager from './tenantConnectionManager.js';

const TENANT_TABLE_DEFINITIONS = [
  `CREATE TABLE IF NOT EXISTS \`company_profile\` (
    \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`legal_name\` VARCHAR(191) NOT NULL,
    \`trade_name\` VARCHAR(191) NULL,
    \`cuit\` VARCHAR(11) NOT NULL,
    \`tax_condition\` VARCHAR(191) NULL DEFAULT 'RESPONSABLE_INSCRIPTO',
    \`gross_income_number\` VARCHAR(191) NULL,
    \`address\` VARCHAR(191) NULL,
    \`city\` VARCHAR(191) NULL,
    \`province\` VARCHAR(191) NULL,
    \`postal_code\` VARCHAR(191) NULL,
    \`phone\` VARCHAR(191) NULL,
    \`email\` VARCHAR(191) NULL,
    \`activity_start\` DATETIME(3) NULL,
    \`activity_code\` VARCHAR(10) NULL,
    \`activity_description\` VARCHAR(500) NULL,
    \`art_name\` VARCHAR(191) NULL,
    \`bank_name\` VARCHAR(191) NULL,
    \`bank_cbu\` VARCHAR(22) NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    \`deleted_at\` DATETIME(3) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`departments\` (
    \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`name\` VARCHAR(191) NOT NULL,
    \`code\` VARCHAR(191) NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    \`deleted_at\` DATETIME(3) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`arca_ccts\` (
    \`code\` VARCHAR(50) NOT NULL PRIMARY KEY,
    \`name\` VARCHAR(191) NOT NULL,
    \`sector\` VARCHAR(191) NULL,
    \`description\` TEXT NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`arca_categories\` (
    \`code\` VARCHAR(50) NOT NULL PRIMARY KEY,
    \`name\` VARCHAR(191) NOT NULL,
    \`cct\` VARCHAR(191) NULL,
    \`description\` TEXT NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`arca_positions\` (
    \`code\` VARCHAR(50) NOT NULL PRIMARY KEY,
    \`name\` VARCHAR(191) NOT NULL,
    \`group_code\` VARCHAR(50) NULL,
    \`group_name\` VARCHAR(191) NULL,
    \`description\` TEXT NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`arca_service_types\` (
    \`code\` VARCHAR(50) NOT NULL PRIMARY KEY,
    \`name\` VARCHAR(191) NOT NULL,
    \`regime\` VARCHAR(191) NULL,
    \`description\` TEXT NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`arca_cct_category_positions\` (
    \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`cct_code\` VARCHAR(50) NOT NULL,
    \`category_code\` VARCHAR(50) NOT NULL,
    \`position_code\` VARCHAR(50) NOT NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY \`uniq_cct_cat_pos\` (\`cct_code\`, \`category_code\`, \`position_code\`),
    INDEX \`idx_cct_code\` (\`cct_code\`),
    INDEX \`idx_cat_code\` (\`category_code\`),
    INDEX \`idx_pos_code\` (\`position_code\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`arca_contract_modalities\` (
    \`code\` VARCHAR(50) NOT NULL PRIMARY KEY,
    \`name\` VARCHAR(255) NOT NULL,
    \`period_from\` VARCHAR(10) NULL,
    \`period_to\` VARCHAR(10) NULL,
    \`description\` TEXT NULL,
    \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`job_positions\` (
    \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`name\` VARCHAR(191) NOT NULL,
    \`code\` VARCHAR(191) NULL,
    \`cct_code\` VARCHAR(50) NULL,
    \`category_code\` VARCHAR(50) NULL,
    \`position_code\` VARCHAR(50) NULL,
    \`service_type_code\` VARCHAR(50) NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    \`deleted_at\` DATETIME(3) NULL,
    INDEX \`job_positions_cct_code_idx\` (\`cct_code\`),
    INDEX \`job_positions_category_code_idx\` (\`category_code\`),
    INDEX \`job_positions_position_code_idx\` (\`position_code\`),
    INDEX \`job_positions_service_type_code_idx\` (\`service_type_code\`),
    CONSTRAINT \`job_positions_cct_code_fkey\` FOREIGN KEY (\`cct_code\`) REFERENCES \`arca_ccts\`(\`code\`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT \`job_positions_category_code_fkey\` FOREIGN KEY (\`category_code\`) REFERENCES \`arca_categories\`(\`code\`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT \`job_positions_position_code_fkey\` FOREIGN KEY (\`position_code\`) REFERENCES \`arca_positions\`(\`code\`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT \`job_positions_service_type_code_fkey\` FOREIGN KEY (\`service_type_code\`) REFERENCES \`arca_service_types\`(\`code\`) ON DELETE SET NULL ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`health_insurances\` (
    \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`name\` VARCHAR(191) NOT NULL,
    \`code\` VARCHAR(191) NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    \`deleted_at\` DATETIME(3) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`unions\` (
    \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`name\` VARCHAR(191) NOT NULL,
    \`code\` VARCHAR(191) NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    \`deleted_at\` DATETIME(3) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`mutuals\` (
    \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`name\` VARCHAR(191) NOT NULL,
    \`code\` VARCHAR(191) NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    \`deleted_at\` DATETIME(3) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`salary_scales\` (
    \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`name\` VARCHAR(191) NOT NULL,
    \`code\` VARCHAR(50) NULL,
    \`description\` TEXT NULL,
    \`amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`is_intern_only\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    \`deleted_at\` DATETIME(3) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`employees\` (
    \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`file_number\` VARCHAR(191) NOT NULL UNIQUE,
    \`cuil\` VARCHAR(11) NOT NULL UNIQUE,
    \`first_name\` VARCHAR(191) NOT NULL,
    \`last_name\` VARCHAR(191) NOT NULL,
    \`photo\` LONGTEXT NULL,
    \`document_type\` VARCHAR(20) NOT NULL DEFAULT 'DNI',
    \`document_number\` VARCHAR(20) NOT NULL,
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
    \`contract_modality_code\` VARCHAR(50) NULL,
    \`salary_scale_id\` VARCHAR(191) NULL,
    \`payroll_group\` VARCHAR(50) NOT NULL DEFAULT 'MENSUAL',
    \`is_part_time\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`weekly_working_hours\` DECIMAL(5, 2) NOT NULL DEFAULT 48.00,
    \`monthly_working_hours\` DECIMAL(6, 2) NOT NULL DEFAULT 200.00,
    \`part_time_percentage\` DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
    \`basic_salary\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`hourly_rate\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`cbu\` VARCHAR(22) NULL,
    \`bank_account_type\` VARCHAR(30) NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    \`deleted_at\` DATETIME(3) NULL,
    INDEX \`employees_department_id_idx\` (\`department_id\`),
    INDEX \`employees_job_position_id_idx\` (\`job_position_id\`),
    INDEX \`employees_health_insurance_id_idx\` (\`health_insurance_id\`),
    INDEX \`employees_union_id_idx\` (\`union_id\`),
    INDEX \`employees_mutual_id_idx\` (\`mutual_id\`),
    INDEX \`employees_contract_modality_code_idx\` (\`contract_modality_code\`),
    INDEX \`employees_salary_scale_id_idx\` (\`salary_scale_id\`),
    CONSTRAINT \`employees_department_id_fkey\` FOREIGN KEY (\`department_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT \`employees_job_position_id_fkey\` FOREIGN KEY (\`job_position_id\`) REFERENCES \`job_positions\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT \`employees_health_insurance_id_fkey\` FOREIGN KEY (\`health_insurance_id\`) REFERENCES \`health_insurances\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT \`employees_union_id_fkey\` FOREIGN KEY (\`union_id\`) REFERENCES \`unions\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT \`employees_mutual_id_fkey\` FOREIGN KEY (\`mutual_id\`) REFERENCES \`mutuals\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT \`employees_contract_modality_code_fkey\` FOREIGN KEY (\`contract_modality_code\`) REFERENCES \`arca_contract_modalities\`(\`code\`) ON DELETE SET NULL ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`payroll_matrices\` (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`concepts\` (
    \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`code\` VARCHAR(191) NOT NULL UNIQUE,
    \`name\` VARCHAR(191) NOT NULL,
    \`type\` VARCHAR(191) NOT NULL,
    \`calculation_type\` VARCHAR(191) NOT NULL DEFAULT 'FIXED',
    \`period_type\` VARCHAR(50) NOT NULL DEFAULT 'ALL',
    \`scope\` VARCHAR(20) NOT NULL DEFAULT 'GENERAL',
    \`default_value\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`novelty_data_type\` VARCHAR(20) NOT NULL DEFAULT 'CANTIDAD',
    \`calculation_order\` INT NOT NULL DEFAULT 100,
    \`formula\` TEXT NULL,
    \`matrix_data\` LONGTEXT NULL,
    \`matrix_id\` VARCHAR(191) NULL,
    \`is_system\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`is_persistent\` BOOLEAN NOT NULL DEFAULT TRUE,
    \`arca_concept_code\` VARCHAR(10) NULL,
    \`applies_sipa_aporte\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`applies_sipa_contrib\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`applies_inssjyp_aporte\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`applies_inssjyp_contrib\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`applies_os_aporte\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`applies_os_contrib\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`applies_fsr_aporte\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`applies_fsr_contrib\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`applies_renatre_aporte\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`applies_renatre_contrib\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`applies_aaff_contrib\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`applies_fne_contrib\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`applies_lrt_contrib\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`is_repeatable\` BOOLEAN NOT NULL DEFAULT FALSE,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    \`deleted_at\` DATETIME(3) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`payroll_periods\` (
    \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`year\` INT NOT NULL,
    \`month\` INT NOT NULL,
    \`period_type\` VARCHAR(191) NOT NULL DEFAULT 'MONTHLY',
    \`settlement_number\` INT NOT NULL DEFAULT 1,
    \`settlement_name\` VARCHAR(191) NULL,
    \`settlement_type\` VARCHAR(5) NOT NULL DEFAULT 'M',
    \`payment_date\` DATETIME(3) NULL,
    \`payment_place\` VARCHAR(100) NULL,
    \`deposit_date\` DATETIME(3) NULL,
    \`deposit_bank\` VARCHAR(100) NULL,
    \`rubric_date\` DATETIME(3) NULL,
    \`status\` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    \`total_gross\` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    \`total_net\` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    \`total_employer_cost\` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    \`closed_at\` DATETIME(3) NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY \`payroll_periods_unique_settlement\` (\`year\`, \`month\`, \`period_type\`, \`settlement_number\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`pay_slips\` (
    \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`payroll_period_id\` VARCHAR(191) NOT NULL,
    \`employee_id\` VARCHAR(191) NOT NULL,
    \`gross_salary\` DECIMAL(12, 2) NOT NULL,
    \`remunerative_salary\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`non_remunerative\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`total_deductions\` DECIMAL(12, 2) NOT NULL,
    \`net_salary\` DECIMAL(12, 2) NOT NULL,
    \`net_salary_words\` VARCHAR(500) NULL,
    \`payment_date\` DATETIME(3) NULL,
    \`payment_method\` VARCHAR(20) NOT NULL DEFAULT 'CBU',
    \`bank_name\` VARCHAR(100) NULL,
    \`cbu\` VARCHAR(30) NULL,
    \`worked_days\` INT NOT NULL DEFAULT 30,
    \`worked_hours\` DECIMAL(8, 2) NULL,
    \`sipa_contrib\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`inssjyp_contrib\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`os_contrib\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`fne_contrib\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`aaff_contrib\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`art_contrib\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`scvo_contrib\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`union_contrib\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`total_employer_contrib\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`total_labor_cost\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`pct_net_salary\` DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
    \`pct_employee_deductions\` DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
    \`pct_social_security_contrib\` DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
    \`pct_health_contrib\` DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
    \`pct_art_and_insurance\` DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
    \`pct_union_and_chambers\` DECIMAL(6, 2) NOT NULL DEFAULT 0.00,
    \`signature_hash\` VARCHAR(64) NULL,
    \`signed_at\` DATETIME(3) NULL,
    \`status\` VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    \`deleted_at\` DATETIME(3) NULL,
    INDEX \`pay_slips_payroll_period_id_idx\` (\`payroll_period_id\`),
    INDEX \`pay_slips_employee_id_idx\` (\`employee_id\`),
    UNIQUE KEY \`pay_slips_period_employee_key\` (\`payroll_period_id\`, \`employee_id\`),
    CONSTRAINT \`pay_slips_payroll_period_id_fkey\` FOREIGN KEY (\`payroll_period_id\`) REFERENCES \`payroll_periods\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT \`pay_slips_employee_id_fkey\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`pay_slip_items\` (
    \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`pay_slip_id\` VARCHAR(191) NOT NULL,
    \`concept_id\` VARCHAR(191) NULL,
    \`concept_code\` VARCHAR(191) NOT NULL,
    \`concept_name\` VARCHAR(191) NOT NULL,
    \`type\` VARCHAR(191) NOT NULL,
    \`units\` DECIMAL(12, 2) NULL,
    \`unit_label\` VARCHAR(20) NULL,
    \`rate\` DECIMAL(12, 2) NULL,
    \`base_amount\` DECIMAL(12, 2) NULL,
    \`amount\` DECIMAL(12, 2) NOT NULL,
    \`arca_concept_code\` VARCHAR(10) NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX \`pay_slip_items_pay_slip_id_idx\` (\`pay_slip_id\`),
    CONSTRAINT \`pay_slip_items_pay_slip_id_fkey\` FOREIGN KEY (\`pay_slip_id\`) REFERENCES \`pay_slips\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`pay_slip_bases\` (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`payroll_settings\` (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`employee_concepts\` (
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
    UNIQUE KEY \`uniq_emp_concept\` (\`employee_id\`, \`concept_id\`),
    INDEX \`employee_concepts_employee_id_idx\` (\`employee_id\`),
    INDEX \`employee_concepts_concept_id_idx\` (\`concept_id\`),
    CONSTRAINT \`employee_concepts_employee_id_fkey\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT \`employee_concepts_concept_id_fkey\` FOREIGN KEY (\`concept_id\`) REFERENCES \`concepts\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`period_novelties\` (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`kinships\` (
    \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`name\` VARCHAR(191) NOT NULL,
    \`code\` VARCHAR(191) NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    \`deleted_at\` DATETIME(3) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  `CREATE TABLE IF NOT EXISTS \`employee_relatives\` (
    \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
    \`employee_id\` VARCHAR(191) NOT NULL,
    \`kinship_id\` VARCHAR(191) NOT NULL,
    \`last_name\` VARCHAR(191) NOT NULL,
    \`first_name\` VARCHAR(191) NOT NULL,
    \`document_type\` VARCHAR(20) NOT NULL DEFAULT 'DNI',
    \`document_number\` VARCHAR(20) NOT NULL,
    \`cuil\` VARCHAR(11) NULL,
    \`birth_date\` DATETIME(3) NOT NULL,
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    \`deleted_at\` DATETIME(3) NULL,
    INDEX \`employee_relatives_employee_id_idx\` (\`employee_id\`),
    INDEX \`employee_relatives_kinship_id_idx\` (\`kinship_id\`),
    CONSTRAINT \`employee_relatives_employee_id_fkey\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT \`employee_relatives_kinship_id_fkey\` FOREIGN KEY (\`kinship_id\`) REFERENCES \`kinships\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
];

/**
 * Parentescos predeterminados de acuerdo a la legislación laboral y seguridad social argentina.
 */
export const DEFAULT_KINSHIPS = [
  { code: 'CONYUGE', name: 'Cónyuge' },
  { code: 'CONVIVIENTE', name: 'Conviviente / Unión Convivencial' },
  { code: 'HIJO_MENOR_21', name: 'Hijo/a menor de 21 años' },
  { code: 'HIJO_ESTUDIANTE', name: 'Hijo/a de 21 a 25 años inclusive (Estudiante)' },
  { code: 'HIJO_INCAPACITADO', name: 'Hijo/a incapacitado/a para el trabajo' },
  { code: 'PADRE_MADRE', name: 'Padre / Madre' },
  { code: 'HERMANO', name: 'Hermano/a menor o incapacitado/a' },
  { code: 'TUTELA', name: 'Menor bajo tutela o guarda legal' },
];

export function getHealthInsurancesData() {
  try {
    const raw = fs.readFileSync(path.resolve('src/data/healthInsurances.json'), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Aviso: no se pudo leer healthInsurances.json:', err.message);
    return [];
  }
}

/**
 * Obras Sociales predeterminadas (SSSalud y prepagas) para empresas en Argentina.
 */
export const DEFAULT_HEALTH_INSURANCES = getHealthInsurancesData();

// DEFAULT_CONCEPTS se encuentra declarado y exportado más abajo con el mapeo completo de ARCA, subsistemas y fórmulas.

/**
 * Funciones auxiliares para cargar catálogos oficiales de ARCA (Simplificación Registral).
 */
export function getArcaServiceTypesData() {
  try {
    const raw = fs.readFileSync(path.resolve('src/data/arcaServiceTypes.json'), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Aviso: no se pudo leer arcaServiceTypes.json:', err.message);
    return [];
  }
}

export function getArcaPositionsData() {
  try {
    const raw = fs.readFileSync(path.resolve('src/data/arcaPositions.json'), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Aviso: no se pudo leer arcaPositions.json:', err.message);
    return [];
  }
}

export function getArcaCctsData() {
  try {
    const raw = fs.readFileSync(path.resolve('src/data/arcaCcts.json'), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Aviso: no se pudo leer arcaCcts.json:', err.message);
    return [];
  }
}

export function getArcaCategoriesData() {
  try {
    const raw = fs.readFileSync(path.resolve('src/data/arcaCategories.json'), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Aviso: no se pudo leer arcaCategories.json:', err.message);
    return [];
  }
}

export function getArcaCctCategoryPositionsData() {
  try {
    const raw = fs.readFileSync(path.resolve('src/data/arcaCctCategoryPositions.json'), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Aviso: no se pudo leer arcaCctCategoryPositions.json:', err.message);
    return [];
  }
}

export function getArcaContractModalitiesData() {
  try {
    const raw = fs.readFileSync(path.resolve('src/data/arcaContractModalities.json'), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Aviso: no se pudo leer arcaContractModalities.json:', err.message);
    return [];
  }
}

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

  // 2. Obtener un cliente Prisma conectado a la nueva base de datos del tenant
  const tenantClient = await tenantConnectionManager.getTenantClient({
    dbName,
    dbHost,
    dbPort,
  });

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
  const healthInsurances = getHealthInsurancesData();
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

  // 8. Cargar catálogos iniciales de ARCA (Simplificación Registral)
  const ccts = getArcaCctsData();
  if (ccts.length > 0) {
    await tenantClient.arcaCct.createMany({ data: ccts, skipDuplicates: true });
  }

  const categories = getArcaCategoriesData();
  if (categories.length > 0) {
    for (let i = 0; i < categories.length; i += 1000) {
      const chunk = categories.slice(i, i + 1000);
      await tenantClient.arcaCategory.createMany({ data: chunk, skipDuplicates: true });
    }
  }

  const positions = getArcaPositionsData();
  if (positions.length > 0) {
    await tenantClient.arcaPosition.createMany({ data: positions, skipDuplicates: true });
  }

  const serviceTypes = getArcaServiceTypesData();
  if (serviceTypes.length > 0) {
    await tenantClient.arcaServiceType.createMany({ data: serviceTypes, skipDuplicates: true });
  }

  const cctCategoryPositions = getArcaCctCategoryPositionsData();
  if (cctCategoryPositions.length > 0) {
    for (let i = 0; i < cctCategoryPositions.length; i += 1000) {
      const chunk = cctCategoryPositions.slice(i, i + 1000).map(r => ({
        id: crypto.randomUUID(),
        ...r
      }));
      await tenantClient.arcaCctCategoryPosition.createMany({ data: chunk, skipDuplicates: true });
    }
  }

  const contractModalities = getArcaContractModalitiesData();
  if (contractModalities.length > 0) {
    await tenantClient.arcaContractModality.createMany({ data: contractModalities, skipDuplicates: true });
  }

  return { dbName, dbHost, dbPort };
}

/**
 * Asegura de forma segura y no destructiva que la tabla company_profile de un tenant existente contenga todas las columnas.
 * @param {object} tenantClient - Cliente de Prisma del tenant.
 */
export async function ensureTenantProfileSchema(tenantClient) {
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
  } catch (err) {
    console.warn('Aviso al verificar esquema de company_profile:', err.message);
  }
}

/**
 * Asegura que las tablas de Estructura, Afiliaciones y Personal existan con todas sus columnas en el tenant.
 * @param {object} tenantClient - Cliente de Prisma del tenant.
 */
export async function ensureTenantPersonnelSchema(tenantClient) {
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
      CREATE TABLE IF NOT EXISTS \`arca_ccts\` (
        \`code\` VARCHAR(50) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`sector\` VARCHAR(191) NULL,
        \`description\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`arca_categories\` (
        \`code\` VARCHAR(50) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`cct\` VARCHAR(191) NULL,
        \`description\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`arca_positions\` (
        \`code\` VARCHAR(50) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`group_code\` VARCHAR(50) NULL,
        \`group_name\` VARCHAR(191) NULL,
        \`description\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`arca_service_types\` (
        \`code\` VARCHAR(50) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`regime\` VARCHAR(191) NULL,
        \`description\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

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

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`arca_contract_modalities\` (
        \`code\` VARCHAR(50) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(255) NOT NULL,
        \`period_from\` VARCHAR(10) NULL,
        \`period_to\` VARCHAR(10) NULL,
        \`description\` TEXT NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
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
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await tenantClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`mutuals\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

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
        \`description\` TEXT NULL,
        \`amount\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        \`is_intern_only\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Comprobar columnas clave en salary_scales para migraciones no destructivas
    const salaryScaleCols = [
      { name: 'is_intern_only', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
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
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL,
        INDEX \`employees_department_id_idx\` (\`department_id\`),
        INDEX \`employees_job_position_id_idx\` (\`job_position_id\`),
        INDEX \`employees_health_insurance_id_idx\` (\`health_insurance_id\`),
        INDEX \`employees_union_id_idx\` (\`union_id\`),
        INDEX \`employees_mutual_id_idx\` (\`mutual_id\`)
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

          let scale = await tenantClient.salaryScale.findFirst({
            where: {
              name: scaleName,
              amount: basic,
              deletedAt: null,
            },
          });

          if (!scale) {
            const existingWithName = await tenantClient.salaryScale.findFirst({
              where: { name: scaleName, deletedAt: null },
            });
            const finalName = existingWithName ? `${scaleName} ($${basic.toLocaleString('es-AR')})` : scaleName;

            scale = await tenantClient.salaryScale.create({
              data: {
                name: finalName,
                code: emp.jobPosition?.code ? `${emp.jobPosition.code}-BAS` : null,
                description: `Nómina inicial asignada a ${puestoName}`,
                amount: basic,
              },
            });
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
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`deleted_at\` DATETIME(3) NULL,
        INDEX \`employee_relatives_employee_id_idx\` (\`employee_id\`),
        INDEX \`employee_relatives_kinship_id_idx\` (\`kinship_id\`),
        CONSTRAINT \`employee_relatives_employee_id_fkey\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`employee_relatives_kinship_id_fkey\` FOREIGN KEY (\`kinship_id\`) REFERENCES \`kinships\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Precargar o actualizar Obras Sociales
    const hiCatalog = getHealthInsurancesData();
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

    // 8. Precargar o actualizar Convenios Colectivos ARCA (insertar faltantes)
    const ccts = getArcaCctsData();
    const countArcaCct = await tenantClient.arcaCct.count();
    if (countArcaCct < ccts.length && ccts.length > 0) {
      await tenantClient.arcaCct.createMany({ data: ccts, skipDuplicates: true });
    }

    // 9. Precargar o actualizar Categorías ARCA (insertar faltantes)
    const categories = getArcaCategoriesData();
    const countArcaCat = await tenantClient.arcaCategory.count();
    if (countArcaCat < categories.length && categories.length > 0) {
      for (let i = 0; i < categories.length; i += 1000) {
        const chunk = categories.slice(i, i + 1000);
        await tenantClient.arcaCategory.createMany({ data: chunk, skipDuplicates: true });
      }
    }

    // 9. Precargar Puestos ARCA si faltan
    const positions = getArcaPositionsData();
    const countArcaPos = await tenantClient.arcaPosition.count();
    if (countArcaPos < positions.length && positions.length > 0) {
      await tenantClient.arcaPosition.createMany({ data: positions, skipDuplicates: true });
    }

    // 10. Precargar Tipos de Servicio ARCA si la tabla está vacía
    const countArcaServ = await tenantClient.arcaServiceType.count();
    if (countArcaServ === 0) {
      const serviceTypes = getArcaServiceTypesData();
      if (serviceTypes.length > 0) {
        await tenantClient.arcaServiceType.createMany({ data: serviceTypes, skipDuplicates: true });
      }
    }

    // 11. Precargar Relaciones CCT - Categorías - Puestos ARCA si faltan
    const cctCategoryPositions = getArcaCctCategoryPositionsData();
    const countRelations = await tenantClient.arcaCctCategoryPosition.count();
    if (countRelations < cctCategoryPositions.length && cctCategoryPositions.length > 0) {
      for (let i = 0; i < cctCategoryPositions.length; i += 1000) {
        const chunk = cctCategoryPositions.slice(i, i + 1000).map(r => ({
          id: crypto.randomUUID(),
          ...r
        }));
        await tenantClient.arcaCctCategoryPosition.createMany({ data: chunk, skipDuplicates: true });
      }
    }

    // 13. Sincronizar y asegurar esquema del módulo de liquidación de sueldos
    await ensureTenantPayrollSchema(tenantClient);
  } catch (err) {
    console.warn('Aviso al verificar esquema de personal y afiliaciones:', err.message);
  }
}

/**
 * Conceptos predeterminados del sistema con parametrización ARCA y fórmulas base.
 */
export const DEFAULT_CONCEPTS = [
  // 1. Sueldo Básico (Remunerativo - Rango 1000..3999)
  {
    code: '1000',
    name: 'Sueldo Básico',
    type: 'REMUNERATIVE',
    calculationType: 'FIXED',
    scope: 'GENERAL',
    noveltyDataType: 'CANTIDAD',
    defaultValue: 0.00,
    formula: null,
    matrixData: null,
    isPersistent: true,
    isActive: true,
    arcaConceptCode: '110000',
    appliesSipaAporte: true,
    appliesSipaContrib: true,
    appliesInssjypAporte: true,
    appliesInssjypContrib: true,
    appliesOsAporte: true,
    appliesOsContrib: true,
    appliesFsrAporte: true,
    appliesFsrContrib: true,
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: true,
    appliesFneContrib: true,
    appliesLrtContrib: true,
    isRepeatable: false,
  },
  // 1.b Asignación Estímulo Ley 26.427 (No Remunerativo - Pasantías Educativas)
  {
    code: '1001',
    name: 'Asignación Estímulo Ley 26.427',
    type: 'NON_REMUNERATIVE',
    calculationType: 'FIXED',
    scope: 'GENERAL',
    noveltyDataType: 'CANTIDAD',
    defaultValue: 0.00,
    formula: null,
    matrixData: null,
    isPersistent: true,
    isActive: true,
    arcaConceptCode: '550000',
    appliesSipaAporte: false,
    appliesSipaContrib: false,
    appliesInssjypAporte: false,
    appliesInssjypContrib: false,
    appliesOsAporte: false,
    appliesOsContrib: true,   // Obra Social 6% patronal (Art. 14 Ley 26.427)
    appliesFsrAporte: false,
    appliesFsrContrib: true,  // Fondo Solidario de Redistribución
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: false,
    appliesFneContrib: false,
    appliesLrtContrib: true,  // Cobertura ART Ley 24.557
    isRepeatable: false,
  },
  // 2. Sueldo Anual Complementario (SAC) (Remunerativo - Rango 1000..3999)
  {
    code: '1200',
    name: 'Sueldo Anual Complementario (SAC)',
    type: 'REMUNERATIVE',
    calculationType: 'FORMULA',
    scope: 'GENERAL',
    noveltyDataType: 'CANTIDAD',
    defaultValue: 0.00,
    formula: '[MEJOR_6M] / 2',
    matrixData: null,
    isPersistent: true,
    isActive: true,
    arcaConceptCode: '120000',
    appliesSipaAporte: true,
    appliesSipaContrib: true,
    appliesInssjypAporte: true,
    appliesInssjypContrib: true,
    appliesOsAporte: true,
    appliesOsContrib: true,
    appliesFsrAporte: true,
    appliesFsrContrib: true,
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: true,
    appliesFneContrib: true,
    appliesLrtContrib: true,
    isRepeatable: false,
  },
  // 3. Adelanto Vacacional (Remunerativo - Rango 1000..3999)
  {
    code: '1500',
    name: 'Adelanto Vacacional',
    type: 'REMUNERATIVE',
    calculationType: 'FORMULA',
    scope: 'INDIVIDUAL',
    noveltyDataType: 'CANTIDAD',
    defaultValue: 0.00,
    formula: '([1000] / 25) * [CANTIDAD]',
    matrixData: null,
    isPersistent: false,
    isActive: true,
    arcaConceptCode: '150000',
    appliesSipaAporte: true,
    appliesSipaContrib: true,
    appliesInssjypAporte: true,
    appliesInssjypContrib: true,
    appliesOsAporte: true,
    appliesOsContrib: true,
    appliesFsrAporte: true,
    appliesFsrContrib: true,
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: true,
    appliesFneContrib: true,
    appliesLrtContrib: true,
    isRepeatable: false,
  },
];

/**
 * Asegura la existencia de tablas, columnas y configuraciones del módulo de liquidación de sueldos.
 */
export async function ensureTenantPayrollSchema(tenantClient) {
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

    // 2. Columnas en concepts
    const conceptCols = [
      { name: 'period_type', def: "VARCHAR(50) NOT NULL DEFAULT 'ALL'" },
      { name: 'scope', def: "VARCHAR(20) NOT NULL DEFAULT 'GENERAL'" },
      { name: 'is_persistent', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'novelty_data_type', def: "VARCHAR(20) NOT NULL DEFAULT 'CANTIDAD'" },
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
      { name: 'is_repeatable', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
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

    // 3. Columnas en payroll_periods
    const periodCols = [
      { name: 'settlement_number', def: 'INT NOT NULL DEFAULT 1' },
      { name: 'settlement_name', def: 'VARCHAR(191) NULL' },
      { name: 'settlement_type', def: "VARCHAR(5) NOT NULL DEFAULT 'M'" },
      { name: 'payment_date', def: 'DATETIME(3) NULL' },
      { name: 'payment_place', def: 'VARCHAR(100) NULL' },
      { name: 'deposit_date', def: 'DATETIME(3) NULL' },
      { name: 'deposit_bank', def: 'VARCHAR(100) NULL' },
      { name: 'rubric_date', def: 'DATETIME(3) NULL' },
      { name: 'total_gross', def: 'DECIMAL(14, 2) NOT NULL DEFAULT 0.00' },
      { name: 'total_net', def: 'DECIMAL(14, 2) NOT NULL DEFAULT 0.00' },
      { name: 'total_employer_cost', def: 'DECIMAL(14, 2) NOT NULL DEFAULT 0.00' },
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
  } catch (err) {
    console.warn('Aviso al verificar esquema de liquidación de sueldos:', err.message);
  }
}
