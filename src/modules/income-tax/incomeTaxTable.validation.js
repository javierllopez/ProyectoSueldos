import { z } from 'zod';

export const updateIncomeTaxTableSchema = z.object({
  nonTaxableMinimum: z.coerce.number().min(0).optional(),
  specialDeduction: z.coerce.number().min(0).optional(),
  spouseDeduction: z.coerce.number().min(0).optional(),
  childDeduction: z.coerce.number().min(0).optional(),
  disabledChildDeduction: z.coerce.number().min(0).optional(),
  specialDeductionNewProf: z.coerce.number().min(0).optional(),
  description: z.string().trim().max(191).optional().nullable(),
});

export const updateIncomeTaxScaleSchema = z.object({
  fromAmount: z.coerce.number().min(0).optional(),
  toAmount: z.coerce.number().min(0).optional().nullable(),
  fixedAmount: z.coerce.number().min(0).optional(),
  ratePercentage: z.coerce.number().min(0).max(100).optional(),
});

export const updateGeneralDeductionLimitSchema = z.object({
  limitValue: z.coerce.number().min(0).optional(),
  description: z.string().trim().max(191).optional().nullable(),
});

export const cloneAndAdjustYearSchema = z.object({
  sourceYear: z.coerce.number().int().min(2020).max(2100),
  targetYear: z.coerce.number().int().min(2020).max(2100),
  ipcPercentage: z.coerce.number().min(-100).max(1000),
});
