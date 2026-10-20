import { z } from 'zod';

export const createEmbargoSchema = z
  .object({
    employeeId: z.string().trim().min(1, 'El legajo del empleado es obligatorio'),
    caseTitle: z.string().trim().min(2, 'La carátula o autos del juicio es obligatoria').max(255),
    dossierNumber: z.string().trim().max(100).optional().nullable(),
    court: z.string().trim().max(150).optional().nullable(),
    secretary: z.string().trim().max(150).optional().nullable(),
    judicialDistrict: z.string().trim().max(150).optional().nullable(),
    embargoType: z.enum(['COMERCIAL', 'ALIMENTARIO', 'IMPOSITIVO', 'OTRO']).default('COMERCIAL'),
    hasCap: z.boolean().default(true),
    totalAmount: z.coerce.number().optional().nullable(),
    priorityOrder: z.coerce.number().int().min(1).default(1),
    status: z.enum(['ACTIVE', 'COMPLETED', 'SUSPENDED', 'CANCELLED']).default('ACTIVE'),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    conceptIds: z.array(z.string().trim()).min(1, 'Debe asignar al menos un concepto de retención al embargo'),
  })
  .superRefine((data, ctx) => {
    if (data.hasCap) {
      if (data.totalAmount === undefined || data.totalAmount === null || Number(data.totalAmount) <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El monto total a descontar (tope de deuda) es obligatorio y debe ser mayor a 0 para embargos con límite',
          path: ['totalAmount'],
        });
      }
    }
  });

export const updateEmbargoSchema = z
  .object({
    caseTitle: z.string().trim().min(2, 'La carátula o autos del juicio es obligatoria').max(255).optional(),
    dossierNumber: z.string().trim().max(100).optional().nullable(),
    court: z.string().trim().max(150).optional().nullable(),
    secretary: z.string().trim().max(150).optional().nullable(),
    judicialDistrict: z.string().trim().max(150).optional().nullable(),
    embargoType: z.enum(['COMERCIAL', 'ALIMENTARIO', 'IMPOSITIVO', 'OTRO']).optional(),
    hasCap: z.boolean().optional(),
    totalAmount: z.coerce.number().optional().nullable(),
    priorityOrder: z.coerce.number().int().min(1).optional(),
    status: z.enum(['ACTIVE', 'COMPLETED', 'SUSPENDED', 'CANCELLED']).optional(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    conceptIds: z.array(z.string().trim()).min(1, 'Debe asignar al menos un concepto de retención al embargo').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.hasCap === true) {
      if (data.totalAmount === undefined || data.totalAmount === null || Number(data.totalAmount) <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El monto total a descontar (tope de deuda) es obligatorio y debe ser mayor a 0 para embargos con límite',
          path: ['totalAmount'],
        });
      }
    }
  });
