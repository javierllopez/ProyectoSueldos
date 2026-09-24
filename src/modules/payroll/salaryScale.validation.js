import { z } from 'zod';

export const createSalaryScaleSchema = z.object({
  name: z.string().min(1, 'El nombre de la nómina es obligatorio').max(191),
  code: z.string().max(50).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  amount: z.coerce.number().min(0, 'El sueldo básico debe ser mayor o igual a 0'),
  isInternOnly: z.boolean().optional(),
  isDirectorOnly: z.boolean().optional(),
}).refine((data) => !(data.isInternOnly && data.isDirectorOnly), {
  message: 'Una nómina no puede ser simultáneamente exclusiva para pasantes y directores',
});

export const updateSalaryScaleSchema = z.object({
  name: z.string().min(1, 'El nombre de la nómina es obligatorio').max(191).optional(),
  code: z.string().max(50).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  amount: z.coerce.number().min(0, 'El sueldo básico debe ser mayor o igual a 0').optional(),
  isInternOnly: z.boolean().optional(),
  isDirectorOnly: z.boolean().optional(),
}).refine((data) => !(data.isInternOnly && data.isDirectorOnly), {
  message: 'Una nómina no puede ser simultáneamente exclusiva para pasantes y directores',
});

export const massScaleIncreaseSchema = z.object({
  increaseType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT'], {
    errorMap: () => ({ message: 'Tipo de aumento inválido (PERCENTAGE o FIXED_AMOUNT)' }),
  }),
  value: z.coerce.number().positive('El valor de aumento debe ser un número positivo mayor a 0'),
  rounding: z.enum(['NONE', 'INTEGER', 'DECIMAL_2']).default('DECIMAL_2').optional(),
  scaleIds: z.array(z.string()).optional(),
});
