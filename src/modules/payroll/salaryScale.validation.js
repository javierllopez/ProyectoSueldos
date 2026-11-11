import { z } from 'zod';

export const createSalaryScaleSchema = z.object({
  name: z.string().min(1, 'El nombre de la nómina es obligatorio').max(191),
  code: z.string().max(50).nullable().optional(),
  cctCode: z.string().max(50).nullable().optional(),
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
  cctCode: z.string().max(50).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  amount: z.coerce.number().min(0, 'El sueldo básico debe ser mayor o igual a 0').optional(),
  isInternOnly: z.boolean().optional(),
  isDirectorOnly: z.boolean().optional(),
}).refine((data) => !(data.isInternOnly && data.isDirectorOnly), {
  message: 'Una nómina no puede ser simultáneamente exclusiva para pasantes y directores',
});

const massScaleIncreasePeriodItemSchema = z.object({
  validFrom: z.string().min(1, 'La Fecha desde es obligatoria'),
  validTo: z.string().min(1, 'La Fecha hasta es obligatoria'),
  increaseType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT'], {
    errorMap: () => ({ message: 'Tipo de aumento inválido (PERCENTAGE o FIXED_AMOUNT)' }),
  }),
  calculationBase: z.enum(['CURRENT_BASE', 'PREVIOUS_PERIOD']).default('CURRENT_BASE').optional(),
  value: z.coerce.number().positive('El valor de aumento debe ser un número positivo mayor a 0'),
  rounding: z.enum(['NONE', 'INTEGER', 'DECIMAL_2']).default('DECIMAL_2').optional(),
});

export const massScaleIncreaseSchema = z
  .object({
    periods: z.array(massScaleIncreasePeriodItemSchema).min(1, 'Debe informar al menos un período de actualización').optional(),
    validFrom: z.string().optional(),
    validTo: z.string().optional(),
    increaseType: z
      .enum(['PERCENTAGE', 'FIXED_AMOUNT'], {
        errorMap: () => ({ message: 'Tipo de aumento inválido (PERCENTAGE o FIXED_AMOUNT)' }),
      })
      .optional(),
    value: z.coerce.number().positive('El valor de aumento debe ser un número positivo mayor a 0').optional(),
    rounding: z.enum(['NONE', 'INTEGER', 'DECIMAL_2']).default('DECIMAL_2').optional(),
    cctCode: z.string().max(50).nullable().optional(),
    scaleIds: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    const items = Array.isArray(data.periods) && data.periods.length > 0
      ? data.periods
      : (data.increaseType && data.value !== undefined
          ? [{
              validFrom: data.validFrom || new Date().toISOString().slice(0, 10),
              validTo: data.validTo || new Date().toISOString().slice(0, 10),
              increaseType: data.increaseType,
              value: data.value,
              rounding: data.rounding || 'DECIMAL_2',
            }]
          : []);

    if (items.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Debe informar al menos un período de actualización con su tipo y valor de aumento.',
        path: ['periods'],
      });
      return;
    }

    const parsedRanges = [];
    items.forEach((item, idx) => {
      const fromStr = String(item.validFrom || '').slice(0, 10);
      const toStr = String(item.validTo || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `El período #${idx + 1} debe tener Fecha desde y Fecha hasta válidas.`,
          path: ['periods', idx, 'validFrom'],
        });
        return;
      }
      if (fromStr > toStr) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `En el período #${idx + 1}, la Fecha desde (${fromStr}) no puede ser posterior a la Fecha hasta (${toStr}).`,
          path: ['periods', idx, 'validTo'],
        });
        return;
      }
      parsedRanges.push({ idx, fromStr, toStr });
    });

    for (let i = 0; i < parsedRanges.length; i++) {
      for (let j = i + 1; j < parsedRanges.length; j++) {
        const a = parsedRanges[i];
        const b = parsedRanges[j];
        if (a.fromStr <= b.toStr && b.fromStr <= a.toStr) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Los períodos #${a.idx + 1} (${a.fromStr} a ${a.toStr}) y #${b.idx + 1} (${b.fromStr} a ${b.toStr}) se superponen en fechas.`,
            path: ['periods', b.idx, 'validFrom'],
          });
        }
      }
    }
  });
