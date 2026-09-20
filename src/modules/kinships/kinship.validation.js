import { z } from 'zod';

export const createKinshipSchema = z.object({
  name: z.string({ required_error: 'La denominación del parentesco es obligatoria' })
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(191, 'El nombre no puede superar los 191 caracteres'),

  code: z.string()
    .trim()
    .max(50, 'El código no puede superar los 50 caracteres')
    .nullable()
    .optional()
    .or(z.literal('')),
});

export const updateKinshipSchema = createKinshipSchema.partial();
