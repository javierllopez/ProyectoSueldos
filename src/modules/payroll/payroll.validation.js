import { z } from 'zod';

export const createFiscalPeriodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  notes: z.string().trim().max(255).optional().nullable(),
});

const periodTypeCodeSchema = z
  .string()
  .trim()
  .min(2, 'El tipo de liquidación es obligatorio')
  .max(40, 'El código del tipo de liquidación no puede superar 40 caracteres')
  .regex(/^[A-Z0-9_]+$/i, 'El tipo de liquidación solo admite letras, números y guion bajo')
  .transform((val) => val.toUpperCase());

const settlementTypeFieldsShape = {
  code: periodTypeCodeSchema.optional(),
  name: z.string().trim().min(2, 'La denominación debe tener al menos 2 caracteres').max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  conceptPrefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'El prefijo de conceptos debe tener exactamente 2 letras mayúsculas (ej: AN, BO, RE)')
    .transform((val) => val.toUpperCase()),
  includeInLsd: z.boolean(),
  arcaLsdType: z.enum(['M', 'Q', 'D', 'H']),
  defaultWorkedDays: z.coerce.number().int().min(0, 'Los días base deben estar entre 0 y 31').max(31, 'Los días base deben estar entre 0 y 31'),
  appliesStatutoryDeductions: z.boolean(),
  triggersEmployeeTermination: z.boolean(),
  allowsRetroactives: z.boolean(),
  seedRetroactiveConcepts: z.boolean().optional(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
};

export const settlementTypeBaseSchema = z.object({
  ...settlementTypeFieldsShape,
  includeInLsd: settlementTypeFieldsShape.includeInLsd.default(true),
  arcaLsdType: settlementTypeFieldsShape.arcaLsdType.default('M'),
  defaultWorkedDays: settlementTypeFieldsShape.defaultWorkedDays.default(30),
  appliesStatutoryDeductions: settlementTypeFieldsShape.appliesStatutoryDeductions.default(true),
  triggersEmployeeTermination: settlementTypeFieldsShape.triggersEmployeeTermination.default(false),
  allowsRetroactives: settlementTypeFieldsShape.allowsRetroactives.default(false),
  seedRetroactiveConcepts: settlementTypeFieldsShape.seedRetroactiveConcepts.default(false),
  isActive: settlementTypeFieldsShape.isActive.default(true),
  sortOrder: settlementTypeFieldsShape.sortOrder.default(100),
});

export const createSettlementTypeSchema = settlementTypeBaseSchema.superRefine((data, ctx) => {
  if (data.includeInLsd && !['M', 'Q', 'D', 'H'].includes(data.arcaLsdType)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Debe indicar el Tipo ARCA Registro 01 (M, Q, D o H) cuando la liquidación se incluye en el Libro de Sueldos Digital',
      path: ['arcaLsdType'],
    });
  }
});

export const updateSettlementTypeSchema = z
  .object(settlementTypeFieldsShape)
  .omit({ code: true })
  .partial();

export const createPeriodSchema = z.object({
  fiscalPeriodId: z.string().optional().nullable(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  periodType: periodTypeCodeSchema.optional(),
  type: periodTypeCodeSchema.optional(),
  settlementName: z.string().trim().max(191).optional().nullable(),
  name: z.string().trim().max(191).optional().nullable(),
  settlementType: z.enum(['M', 'Q', 'D', 'H']).optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  liquidationDate: z.coerce.date().optional().nullable(),
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

export const VALID_CONCEPT_PREFIXES = new Set(['SU', 'QU', 'SA', 'VA', 'FI', 'AJ', 'GR']);

export const conceptBaseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'El código es obligatorio')
    .max(20)
    .regex(/^[A-Z]{2}[0-9]{4}$/, 'El código debe tener formato de 2 letras mayúsculas seguidas de 4 dígitos (ej: SU1000, SU6001, SA1000)'),
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(191),
  type: z.enum(['REMUNERATIVE', 'NON_REMUNERATIVE', 'DEDUCTION', 'AUXILIARY']),
  calculationType: z.enum(['FIXED', 'PERCENTAGE', 'FORMULA', 'MATRIX']).default('FIXED'),
  periodType: z
    .string()
    .trim()
    .max(50)
    .refine((val) => val !== 'ALL', 'El tipo de liquidación ALL o GENERAL ya no es válido')
    .optional()
    .default('MONTHLY'),
  settlementType: z.string().trim().max(50).optional(),
  scope: z.enum(['GENERAL', 'INDIVIDUAL']).default('GENERAL'),
  defaultValue: z.coerce.number().default(0.0),
  noveltyDataType: z.enum(['CANTIDAD', 'HORAS', 'PORCENTAJE', 'SOLO_ASIGNACION', 'IMPORTE', 'CALCULADO', 'SIN_NOVEDAD']).default('CANTIDAD'),
  quantitySource: z.string().trim().max(255).optional().nullable(),
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
  appliesRegDifAporte: z.boolean().default(false),
  appliesRegEspAporte: z.boolean().default(false),
  appliesDetraccion: z.boolean().default(false),
  isRepeatable: z.boolean().default(false),
  isPersistent: z.boolean().default(true),
  isEmbargo: z.boolean().default(false),
});

function validateConceptCodeRange(code, type, ctx) {
  if (!code || !type) return;
  const cleanCode = String(code).trim().toUpperCase();
  const match = cleanCode.match(/^([A-Z]{2})([0-9]{4})$/);
  if (!match) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'El código de concepto debe estar compuesto por 2 letras de prefijo y 4 dígitos (ej: SU1000, SU6001)',
      path: ['code'],
    });
    return;
  }

  const prefix = match[1];
  const codeNum = parseInt(match[2], 10);

  if (!/^[A-Z]{2}$/.test(prefix)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `El prefijo "${prefix}" debe estar compuesto por exactamente 2 letras mayúsculas`,
      path: ['code'],
    });
    return;
  }

  if (type === 'REMUNERATIVE') {
    if (codeNum < 1000 || codeNum > 3999) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Los conceptos remunerativos deben tener un número de 4 dígitos entre 1000 y 3999 (ej: SU1000, SA1000, VA1000)',
        path: ['code'],
      });
    }
  } else if (type === 'NON_REMUNERATIVE') {
    if (codeNum < 4000 || codeNum > 5999) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Los conceptos no remunerativos deben tener un número de 4 dígitos entre 4000 y 5999 (ej: SU4001, QU4001)',
        path: ['code'],
      });
    }
  } else if (type === 'DEDUCTION') {
    if (codeNum < 6000 || codeNum > 8999) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Las deducciones deben tener un número de 4 dígitos entre 6000 y 8999 (ej: SU6001, SA6001)',
        path: ['code'],
      });
    }
  } else if (type === 'AUXILIARY') {
    // Los conceptos auxiliares permiten cualquier código numérico de 4 dígitos (0001 a 9999)
    // para poder ubicarse en cualquier orden del cálculo y ser consumidos por otros conceptos.
    if (codeNum < 1 || codeNum > 9999) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Los conceptos auxiliares deben tener un número de 4 dígitos entre 0001 y 9999',
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
  units: z.coerce.number().min(0, 'Las unidades no pueden ser negativas').optional().nullable(),
  amount: z.coerce.number().min(0, 'El importe no puede ser negativo').optional().nullable(),
  notes: z.string().trim().max(255).optional().nullable(),
});

export const updatePeriodNoveltySchema = z.object({
  units: z.coerce.number().min(0, 'Las unidades no pueden ser negativas').optional().nullable(),
  amount: z.coerce.number().min(0, 'El importe no puede ser negativo').optional().nullable(),
  notes: z.string().trim().max(255).optional().nullable(),
});

const batchNoveltyRemovalSchema = z.object({
  employeeId: z.string().trim().min(1, 'El ID de empleado es obligatorio'),
  conceptId: z.string().trim().min(1, 'El ID de concepto es obligatorio'),
});

export const batchPeriodNoveltiesSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const normalized = { ...raw };
    if (normalized.items === undefined && Array.isArray(normalized.novelties)) {
      normalized.items = normalized.novelties;
    }
    if (
      normalized.items === undefined &&
      ((Array.isArray(normalized.removeEmployeeIds) && normalized.removeEmployeeIds.length > 0) ||
        (Array.isArray(normalized.removals) && normalized.removals.length > 0))
    ) {
      normalized.items = [];
    }
    return normalized;
  },
  z
    .object({
      items: z.array(createPeriodNoveltySchema),
      conceptId: z.string().trim().min(1).optional().nullable(),
      removeEmployeeIds: z.array(z.string().trim().min(1)).optional().default([]),
      removals: z.array(batchNoveltyRemovalSchema).optional().default([]),
      returnData: z.boolean().optional().default(true),
      requireActiveEmployees: z.boolean().optional().default(false),
    })
    .superRefine((val, ctx) => {
      const hasItems = Array.isArray(val.items) && val.items.length > 0;
      const hasLegacyRemovals = Array.isArray(val.removeEmployeeIds) && val.removeEmployeeIds.length > 0;
      const hasMatrixRemovals = Array.isArray(val.removals) && val.removals.length > 0;
      if (!hasItems && !hasLegacyRemovals && !hasMatrixRemovals) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items'],
          message: 'Debe enviar al menos una novedad o eliminación',
        });
      }
      if (hasLegacyRemovals && !val.conceptId && (!hasItems || !val.items[0]?.conceptId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conceptId'],
          message: 'El ID de concepto es obligatorio para depurar novedades vaciadas',
        });
      }
      const totalOps =
        (val.items?.length || 0) + (val.removeEmployeeIds?.length || 0) + (val.removals?.length || 0);
      if (totalOps > 10000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items'],
          message: 'El lote supera el límite máximo permitido de 10.000 operaciones por envío',
        });
      }
    })
);

export const calculateBatchSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1, 'Debe seleccionar al menos un colaborador'),
});

export const updatePaySlipWorkedDaysSchema = z.object({
  workedDays: z.coerce.number().int().min(0, 'Los días no pueden ser negativos').max(30, 'Los días no pueden superar 30'),
});

const terminationReasonItemSchema = z.object({
  employeeId: z.string().trim().min(1, 'El ID de empleado es obligatorio').max(64),
  terminationReason: z
    .string()
    .trim()
    .max(255, 'El motivo de baja no puede superar los 255 caracteres')
    .optional()
    .nullable(),
});

export const closePeriodSchema = z
  .object({
    confirmWarnings: z.boolean().optional(),
    notes: z.string().trim().max(500).optional().nullable(),
    deactivateExpiredConcepts: z.boolean().optional(),
    suspendTerminatedEmbargoes: z.boolean().optional(),
    defaultTerminationReason: z
      .string()
      .trim()
      .max(255, 'El motivo de baja general no puede superar los 255 caracteres')
      .optional()
      .nullable(),
    terminationReasons: z.array(terminationReasonItemSchema).max(500).optional(),
  })
  .optional()
  .default({});

const FINAL_CAUSES_ENUM = z.enum([
  'DESPIDO_SIN_CAUSA',
  'PERIODO_PRUEBA',
  'RENUNCIA',
  'DESPIDO_CON_CAUSA',
  'MUTUO_ACUERDO',
  'JUBILACION',
  'FALLECIMIENTO',
  'FUERZA_MAYOR',
  'FIN_CONTRATO_EVENTUAL',
]);

export const finalSettlementPreviewSchema = z.object({
  employeeId: z.string().trim().min(1, 'El colaborador es obligatorio'),
  terminationDate: z.coerce.date({ invalid_type_error: 'La fecha de egreso debe ser válida' }).optional().nullable(),
  terminationCause: FINAL_CAUSES_ENUM.optional(),
  includeWorkedDays: z.boolean().optional(),
  daysDivisorMode: z.enum(['CALENDAR', 'FIXED_30']).optional(),
  preavisoGiven: z.boolean().optional(),
  probationMonthsLimit: z.coerce.number().int().min(0).max(12).optional(),
  vacationDaysTaken: z.coerce.number().int().min(0).max(60).optional(),
  applyVizzoti: z.boolean().optional(),
  cctCapAmount: z.coerce.number().min(0).optional().nullable(),
  isExecutive: z.boolean().optional(),
  customMrmnh: z.coerce.number().min(0).optional().nullable(),
  customBestSemesterRemun: z.coerce.number().min(0).optional().nullable(),
  gratificationAmount: z.coerce.number().min(0).optional(),
});

export const finalSettlementApplySchema = z.object({
  employeeId: z.string().trim().min(1, 'El colaborador es obligatorio'),
  terminationDate: z.coerce.date({ invalid_type_error: 'La fecha de egreso es obligatoria y debe ser válida' }),
  terminationCause: FINAL_CAUSES_ENUM,
  terminationReasonLabel: z.string().trim().max(255).optional().nullable(),
  includeWorkedDays: z.boolean().default(true),
  daysDivisorMode: z.enum(['CALENDAR', 'FIXED_30']).default('CALENDAR'),
  preavisoGiven: z.boolean().default(false),
  probationMonthsLimit: z.coerce.number().int().min(0).max(12).default(6),
  vacationDaysTaken: z.coerce.number().int().min(0).max(60).default(0),
  applyVizzoti: z.boolean().default(true),
  cctCapAmount: z.coerce.number().min(0).optional().nullable(),
  isExecutive: z.boolean().default(false),
  customMrmnh: z.coerce.number().min(0).optional().nullable(),
  customBestSemesterRemun: z.coerce.number().min(0).optional().nullable(),
  gratificationAmount: z.coerce.number().min(0).default(0),
  workedDaysForLsd: z.coerce.number().int().min(0).max(30).default(0),
  items: z
    .array(
      z.object({
        conceptCode: z.string().trim().min(1),
        included: z.boolean().default(true),
        amount: z.coerce.number().min(0),
        units: z.coerce.number().min(0).optional().nullable(),
      })
    )
    .max(30)
    .default([]),
});

const retroactiveIncreaseRuleSchema = z
  .object({
    increaseType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).default('PERCENTAGE'),
    value: z.coerce.number().min(0, 'El valor del incremento retroactivo no puede ser negativo'),
    rounding: z.enum(['DECIMAL_2', 'INTEGER', 'NONE']).default('DECIMAL_2'),
    treatment: z.enum(['REMUNERATIVE', 'NON_REMUNERATIVE']).default('REMUNERATIVE'),
  })
  .optional()
  .nullable();

const retroactivePreviewBaseShape = {
  cctCode: z.string().trim().max(50).optional().default('ALL'),
  scaleIds: z.array(z.string().trim().min(1)).max(500).optional(),
  fromYear: z.coerce.number().int().min(2000).max(2100),
  fromMonth: z.coerce.number().int().min(1).max(12),
  toYear: z.coerce.number().int().min(2000).max(2100),
  toMonth: z.coerce.number().int().min(1).max(12),
  periodTypes: z.array(z.string().trim().min(1)).max(20).optional(),
  scaleSourceMode: z.enum(['EXISTING_SCALE_PERIODS', 'SIMULATE_INCREASE']).default('EXISTING_SCALE_PERIODS'),
  increaseRule: retroactiveIncreaseRuleSchema,
  includeSacRecalculation: z.boolean().optional().default(true),
  targetPeriodId: z.string().trim().min(1).optional().nullable(),
};

export const retroactivePreviewSchema = z.object(retroactivePreviewBaseShape).superRefine((val, ctx) => {
  const fromYm = val.fromYear * 100 + val.fromMonth;
  const toYm = val.toYear * 100 + val.toMonth;
  if (fromYm > toYm) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fromMonth'],
      message: 'El período "Desde" no puede ser posterior al período "Hasta".',
    });
  }
  const monthSpan = (val.toYear - val.fromYear) * 12 + (val.toMonth - val.fromMonth) + 1;
  if (monthSpan > 24) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['toMonth'],
      message: 'El rango retroactivo no puede superar 24 meses por corrida.',
    });
  }
  if (val.scaleSourceMode === 'SIMULATE_INCREASE' && (!val.increaseRule || Number(val.increaseRule.value) <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['increaseRule'],
      message: 'Debe indicar un incremento paritario mayor a 0 en modo simulación.',
    });
  }
});

export const retroactiveApplySchema = z
  .object({
    ...retroactivePreviewBaseShape,
    targetPeriodId: z.string().trim().min(1, 'Debe seleccionar una liquidación abierta destino'),
    selectedEmployeeIds: z.array(z.string().trim().min(1)).max(5000).optional(),
    ignoreInactiveEmployees: z.boolean().optional().default(true),
    ignoredInactiveConfirmed: z.boolean().optional().default(false),
    includeSacRecalculation: z.boolean().optional().default(true),
    conceptMapping: z
      .object({
        BASIC: z.string().trim().optional().nullable(),
        ADDITIONALS: z.string().trim().optional().nullable(),
        OVERTIME: z.string().trim().optional().nullable(),
        VACATIONS: z.string().trim().optional().nullable(),
        SAC: z.string().trim().optional().nullable(),
        NON_REMUNERATIVE: z.string().trim().optional().nullable(),
      })
      .optional()
      .default({}),
    agreementLabel: z.string().trim().max(255).optional().nullable(),
    updateSalaryScales: z.boolean().optional().default(false),
    allowDuplicateOverride: z.boolean().optional().default(false),
    duplicateStrategy: z.enum(['ADD', 'REPLACE']).optional().default('ADD'),
  })
  .superRefine((val, ctx) => {
    const fromYm = val.fromYear * 100 + val.fromMonth;
    const toYm = val.toYear * 100 + val.toMonth;
    if (fromYm > toYm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fromMonth'],
        message: 'El período "Desde" no puede ser posterior al período "Hasta".',
      });
    }
    if (val.scaleSourceMode === 'SIMULATE_INCREASE' && (!val.increaseRule || Number(val.increaseRule.value) <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['increaseRule'],
        message: 'Debe indicar un incremento paritario mayor a 0 en modo simulación.',
      });
    }
  });
