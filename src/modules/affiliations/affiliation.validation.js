import { z } from 'zod';

export const createHealthInsuranceSchema = z.object({
  name: z.string({ required_error: 'El nombre de la obra social es obligatorio' })
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(191, 'El nombre no puede exceder los 191 caracteres')
    .trim(),
  code: z.string().max(50, 'El código no puede exceder los 50 caracteres').trim().nullable().optional(),
});

export const updateHealthInsuranceSchema = createHealthInsuranceSchema.partial();

export const createUnionSchema = z.object({
  name: z.string({ required_error: 'El nombre del sindicato es obligatorio' })
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(191, 'El nombre no puede exceder los 191 caracteres')
    .trim(),
  code: z.string().max(50, 'El código no puede exceder los 50 caracteres').trim().nullable().optional(),
});

export const updateUnionSchema = createUnionSchema.partial();

export const createMutualSchema = z.object({
  name: z.string({ required_error: 'El nombre de la mutual es obligatorio' })
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(191, 'El nombre no puede exceder los 191 caracteres')
    .trim(),
  code: z.string().max(50, 'El código no puede exceder los 50 caracteres').trim().nullable().optional(),
});

export const updateMutualSchema = createMutualSchema.partial();
