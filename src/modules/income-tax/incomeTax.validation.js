import { z } from 'zod';

export const calculateSettlementSchema = z.object({
  fiscalYear: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  settlementType: z.enum(['MONTHLY', 'ANNUAL', 'FINAL']).optional().default('MONTHLY'),
  employeeIds: z.array(z.string()).optional().nullable(),
  description: z.string().trim().max(191).optional().nullable(),
});

export const exportToPayrollSchema = z
  .object({
    payrollPeriodId: z.string().optional().nullable(),
    periodId: z.string().optional().nullable(),
    withholdingConceptId: z.string().optional().nullable(),
    refundConceptId: z.string().optional().nullable(),
  })
  .refine((data) => data.payrollPeriodId || data.periodId, {
    message: 'Debe seleccionar el período de sueldos destino',
    path: ['payrollPeriodId'],
  });

export const createEmployeeDeductionSchema = z.object({
  fiscalYear: z.coerce.number().int().min(2020).max(2100),
  deductionType: z.string().trim().min(1, 'El tipo de deducción es obligatorio'),
  providerCuit: z.string().trim().max(11).optional().nullable(),
  providerName: z.string().trim().max(191).optional().nullable(),
  voucherType: z.string().trim().max(50).optional().nullable(),
  voucherNumber: z.string().trim().max(100).optional().nullable(),
  month: z.coerce.number().int().min(1).max(12).optional().nullable(),
  amount: z.coerce.number().min(0.01, 'El importe debe ser mayor a 0'),
  notes: z.string().trim().max(500).optional().nullable(),
  source: z.string().optional().default('MANUAL'),
});

export const createEmployeeOtherIncomeSchema = z.object({
  fiscalYear: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  employerCuit: z.string().trim().min(11, 'CUIT de empleador inválido'),
  employerName: z.string().trim().min(2, 'La razón social es obligatoria'),
  grossIncome: z.coerce.number().min(0.01, 'El haber bruto debe ser mayor a 0'),
  nonTaxableIncome: z.coerce.number().min(0).optional().default(0),
  exemptIncome: z.coerce.number().min(0).optional().default(0),
  pensionContrib: z.coerce.number().min(0).optional().default(0),
  healthInsuranceContrib: z.coerce.number().min(0).optional().default(0),
  unionContrib: z.coerce.number().min(0).optional().default(0),
  withheldTax: z.coerce.number().min(0).optional().default(0),
});

export const createEmployeePaymentOnAccountSchema = z.object({
  fiscalYear: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  paymentType: z.string().trim().min(1, 'El tipo de percepción es obligatorio'),
  cuitAgent: z.string().trim().max(11).optional().nullable(),
  agentName: z.string().trim().max(191).optional().nullable(),
  amount: z.coerce.number().min(0.01, 'El importe debe ser mayor a 0'),
});

export const importSiradigSchema = z
  .object({
    filename: z.string().trim().optional(),
    xmlContent: z.string().min(10).optional(),
    fileContent: z.string().min(10).optional(),
    incorporateToPersonnel: z.boolean().optional().default(false),
  })
  .refine((data) => data.xmlContent || data.fileContent, {
    message: 'El contenido XML no puede estar vacío',
    path: ['xmlContent'],
  });

export const generateF1359Schema = z.object({
  fiscalYear: z.coerce.number().int().min(2020).max(2100),
  settlementType: z.enum(['1', '2', '3']).optional().default('1'),
});
