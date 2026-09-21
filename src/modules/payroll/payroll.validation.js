import { z } from 'zod';

export const createPeriodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  periodType: z.enum(['MONTHLY', 'QUINCE_1', 'QUINCE_2', 'SAC_1', 'SAC_2', 'VACATIONS', 'FINAL']).optional(),
  type: z.enum(['MONTHLY', 'QUINCE_1', 'QUINCE_2', 'SAC_1', 'SAC_2', 'VACATIONS', 'FINAL']).optional(),
  settlementName: z.string().trim().max(191).optional().nullable(),
  name: z.string().trim().max(191).optional().nullable(),
  settlementType: z.enum(['M', 'Q']).optional().default('M'),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  paymentDate: z.coerce.date().optional().nullable(),
  paymentPlace: z.string().trim().max(100).optional().nullable(),
  rubricDate: z.coerce.date().optional().nullable(),
  depositDate: z.coerce.date().optional().nullable(),
  depositBank: z.string().trim().max(100).optional().nullable(),
});

export const calculatePeriodSchema = z.object({
  employeeIds: z.array(z.string()).optional(),
  novedades: z
    .array(
      z.object({
        employeeId: z.string(),
        workedDays: z.coerce.number().optional().nullable(),
        overtime50Hours: z.coerce.number().optional().nullable(),
        overtime100Hours: z.coerce.number().optional().nullable(),
        unjustifiedAbsences: z.coerce.number().optional().nullable(),
        sickLeaveDays: z.coerce.number().optional().nullable(),
        items: z
          .array(
            z.object({
              conceptCode: z.string().trim(),
              units: z.coerce.number().optional().nullable(),
              amount: z.coerce.number().optional().nullable(),
              notes: z.string().optional().nullable(),
            })
          )
          .optional()
          .default([]),
        customItems: z
          .array(
            z.object({
              conceptCode: z.string().trim(),
              units: z.coerce.number().optional().nullable(),
              amount: z.coerce.number().optional().nullable(),
              notes: z.string().optional().nullable(),
            })
          )
          .optional(),
      })
    )
    .optional(),
});

export const updateSettingsSchema = z
  .object({
    employerType: z.string().trim().max(50).default('SERVICIOS_COMERCIO'),
    sipaRate: z.coerce.number().min(0).max(100),
    inssjypRate: z.coerce.number().min(0).max(100),
    osRate: z.coerce.number().min(0).max(100),
    fneRate: z.coerce.number().min(0).max(100),
    aaffRate: z.coerce.number().min(0).max(100),
    artRate: z.coerce.number().min(0).max(100),
    artFixedFee: z.coerce.number().min(0),
    scvoFee: z.coerce.number().min(0),
    detractionBase: z.coerce.number().min(0),
    ansesMinCap: z.coerce.number().min(0),
    ansesMaxCap: z.coerce.number().min(0),
    standardWeeklyHours: z.union([z.string().regex(/^\d{1,3}:[0-5]\d$/, 'Formato de horas semanales inválido (HH:MM)'), z.coerce.number().min(0)]).optional(),
    standardMonthlyHours: z.union([z.string().regex(/^\d{1,3}:[0-5]\d$/, 'Formato de horas mensuales inválido (HH:MM)'), z.coerce.number().min(0)]).optional(),
    // Aliases
    contribArtRate: z.coerce.number().min(0).max(100).optional(),
    contribArtFixed: z.coerce.number().min(0).optional(),
    maxRemunerationAnses: z.coerce.number().min(0).optional(),
  })
  .partial();

export const conceptBaseSchema = z.object({
  code: z.string().trim().min(1, 'El código es obligatorio').max(20),
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(191),
  type: z.enum(['REMUNERATIVE', 'NON_REMUNERATIVE', 'DEDUCTION', 'AUXILIARY']),
  calculationType: z.enum(['FIXED', 'PERCENTAGE', 'FORMULA', 'MATRIX']).default('FIXED'),
  periodType: z.string().trim().max(50).optional().default('ALL'),
  settlementType: z.string().trim().max(50).optional(),
  scope: z.enum(['GENERAL', 'INDIVIDUAL']).default('GENERAL'),
  defaultValue: z.coerce.number().default(0.0),
  noveltyDataType: z.enum(['CANTIDAD', 'HORAS', 'PORCENTAJE', 'SOLO_ASIGNACION']).default('CANTIDAD'),
  calculationOrder: z.coerce.number().int().optional(),
  formula: z.string().trim().optional().nullable(),
  matrixData: z.string().trim().optional().nullable(),
  matrixId: z.string().trim().optional().nullable(),
  arcaConceptCode: z.string().trim().max(10).optional().nullable(),
  appliesSipaAporte: z.boolean().default(false),
  appliesSipaContrib: z.boolean().default(false),
  appliesInssjypAporte: z.boolean().default(false),
  appliesInssjypContrib: z.boolean().default(false),
  appliesOsAporte: z.boolean().default(false),
  appliesOsContrib: z.boolean().default(false),
  appliesFsrAporte: z.boolean().default(false),
  appliesFsrContrib: z.boolean().default(false),
  appliesRenatreAporte: z.boolean().default(false),
  appliesRenatreContrib: z.boolean().default(false),
  appliesAaffContrib: z.boolean().default(false),
  appliesFneContrib: z.boolean().default(false),
  appliesLrtContrib: z.boolean().default(false),
  isRepeatable: z.boolean().default(false),
  isPersistent: z.boolean().default(true),
});

function validateConceptCodeRange(code, type, ctx) {
  if (!code || !type) return;
  const codeNum = parseInt(code, 10);
  if (isNaN(codeNum)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'El código del concepto debe ser un número entero',
      path: ['code'],
    });
    return;
  }

  if (type === 'REMUNERATIVE') {
    if (codeNum < 1000 || codeNum > 3999) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Los conceptos remunerativos deben tener un código numérico entre 1000 y 3999',
        path: ['code'],
      });
    }
  } else if (type === 'NON_REMUNERATIVE') {
    if (codeNum < 4000 || codeNum > 5999) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Los conceptos no remunerativos deben tener un código numérico entre 4000 y 5999',
        path: ['code'],
      });
    }
  } else if (type === 'DEDUCTION') {
    if (codeNum < 6000 || codeNum > 8999) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Las deducciones deben tener un código numérico entre 6000 y 8999',
        path: ['code'],
      });
    }
  } else if (type === 'AUXILIARY') {
    if (codeNum <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Los conceptos auxiliares deben tener un código numérico entero mayor a 0',
        path: ['code'],
      });
    }
  }
}

export const createConceptSchema = conceptBaseSchema.superRefine((data, ctx) => {
  validateConceptCodeRange(data.code, data.type, ctx);
});

export const updateConceptSchema = conceptBaseSchema.partial().superRefine((data, ctx) => {
  if (data.code && data.type) {
    validateConceptCodeRange(data.code, data.type, ctx);
  }
});

export const createPayrollMatrixSchema = z.object({
  code: z.string().trim().min(1, 'El código es obligatorio').max(50),
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(150),
  description: z.string().trim().max(255).optional().nullable(),
  inputConceptCode: z.string().trim().min(1, 'Debe asignar un concepto de entrada'),
  matchType: z.enum(['RANGE', 'EXACT']).default('RANGE'),
  defaultValue: z.coerce.number().default(0.0),
  rows: z.union([
    z.array(
      z.object({
        from: z.coerce.number().optional().nullable(),
        to: z.coerce.number().optional().nullable(),
        inputValue: z.union([z.string(), z.number()]).optional().nullable(),
        value: z.coerce.number(),
        valueType: z.string().optional().nullable(),
      })
    ),
    z.object({
      resultType: z.string().optional().nullable(),
      rules: z.array(z.any()).optional().nullable(),
      rows: z.array(z.any()).optional().nullable(),
    }).passthrough(),
    z.string().trim(),
  ]),
  isActive: z.boolean().default(true),
});

export const updatePayrollMatrixSchema = createPayrollMatrixSchema.partial();

export const createPayrollFixedValueSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'El código es obligatorio')
    .max(50, 'El código no puede superar los 50 caracteres')
    .transform((val) => val.toUpperCase().replace(/\s+/g, '_')),
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(150),
  description: z.string().trim().max(255).optional().nullable(),
  value: z.coerce.number().default(0.0),
  unit: z.string().trim().max(20).default('$'),
  isActive: z.boolean().default(true),
});

export const updatePayrollFixedValueSchema = createPayrollFixedValueSchema.partial();

export const createPeriodNoveltySchema = z.object({
  employeeId: z.string().min(1, 'El ID de empleado es obligatorio'),
  conceptId: z.string().min(1, 'El ID de concepto es obligatorio'),
  units: z.coerce.number().optional().nullable(),
  amount: z.coerce.number().optional().nullable(),
  notes: z.string().trim().max(255).optional().nullable(),
});

export const updatePeriodNoveltySchema = z.object({
  units: z.coerce.number().optional().nullable(),
  amount: z.coerce.number().optional().nullable(),
  notes: z.string().trim().max(255).optional().nullable(),
});

export const batchPeriodNoveltiesSchema = z.object({
  items: z.array(createPeriodNoveltySchema).min(1, 'Debe enviar al menos una novedad'),
});

export const calculateBatchSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1, 'Debe seleccionar al menos un colaborador'),
});
