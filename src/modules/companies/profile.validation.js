import { z } from 'zod';

export const updateCompanyProfileSchema = z.object({
  legalName: z.string().trim().min(2, 'La razón social debe tener al menos 2 caracteres').optional(),
  tradeName: z.string().trim().optional().nullable(),
  taxCondition: z
    .enum(['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO'], {
      message: 'Condición de IVA inválida',
    })
    .default('RESPONSABLE_INSCRIPTO')
    .optional(),
  grossIncomeNumber: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  province: z.string().trim().optional().nullable(),
  postalCode: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z
    .string()
    .trim()
    .email('Formato de correo electrónico inválido')
    .optional()
    .or(z.literal(''))
    .nullable(),
  activityStart: z.coerce.date().optional().nullable(),
  activityCode: z.string().trim().optional().nullable(),
  activityDescription: z.string().trim().optional().nullable(),
  artName: z.string().trim().optional().nullable(),
  bankName: z.string().trim().optional().nullable(),
  bankCbu: z
    .string()
    .trim()
    .length(22, 'El CBU bancario debe tener exactamente 22 dígitos')
    .optional()
    .or(z.literal(''))
    .nullable(),
});
