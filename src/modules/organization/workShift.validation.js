import { z } from 'zod';

export const workShiftDetailSchema = z.object({
  id: z.string().uuid().optional(),
  dayOfWeek: z.number().int().min(1).max(7).nullable().optional(),
  cycleDayNumber: z.number().int().min(1).nullable().optional(),
  dayName: z.string().max(50).nullable().optional(),
  isWorkDay: z.boolean().default(true),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato de hora inválido (HH:MM)').nullable().optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato de hora inválido (HH:MM)').nullable().optional(),
  crossesMidnight: z.boolean().default(false),
  breakMinutes: z.number().int().nonnegative().default(0),
  netHours: z.number().nonnegative().default(0),
  notes: z.string().max(255).nullable().optional(),
});

export const createWorkShiftSchema = z.object({
  name: z.string({ required_error: 'La denominación de la jornada es obligatoria' })
    .min(2, 'La denominación debe tener al menos 2 caracteres')
    .max(191, 'La denominación no puede exceder los 191 caracteres')
    .trim(),
  code: z.string().max(50, 'El código no puede exceder los 50 caracteres').trim().nullable().optional(),
  description: z.string().max(2000, 'La descripción no puede exceder los 2000 caracteres').trim().nullable().optional(),
  cycleType: z.enum(['SEMANAL', 'ROTATIVO_DIAS', 'FRANQUERO']).default('SEMANAL'),
  dailyHours: z.coerce.number().min(0, 'Las horas diarias no pueden ser negativas').max(24, 'Las horas diarias no pueden exceder 24 hs').default(8.00),
  weeklyHours: z.coerce.number().min(0, 'Las horas semanales no pueden ser negativas').max(168, 'Las horas semanales no pueden exceder 168 hs').default(48.00),
  monthlyHours: z.coerce.number().min(0, 'Las horas mensuales no pueden ser negativas').max(744, 'Las horas mensuales no pueden exceder 744 hs').default(200.00),
  monthlyDays: z.coerce.number().min(0, 'Los días mensuales no pueden ser negativos').max(31, 'Los días mensuales no pueden exceder 31 días').default(30.00),
  percentage: z.coerce.number().min(0, 'El porcentaje no puede ser negativo').max(100, 'El porcentaje no puede exceder 100%').default(100.00),
  isActive: z.boolean().default(true),
  details: z.array(workShiftDetailSchema).optional().default([]),
});

export const updateWorkShiftSchema = createWorkShiftSchema.partial();
