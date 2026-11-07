import { z } from 'zod';

export const reportFieldSchema = z.object({
  id: z.coerce.string(),
  title: z.coerce.string().min(1, 'El título de la columna es obligatorio'),
  type: z.enum(['FIELD', 'CALCULATED']).default('FIELD'),
  source: z.string().optional().nullable(), // 'employee.fileNumber', 'payslip.grossSalary', 'concept.001'
  conceptCode: z.coerce.string().optional().nullable(), // Código de concepto si es directo
  formula: z
    .object({
      terms: z
        .array(
          z.object({
            conceptCode: z.coerce.string(),
            conceptName: z.coerce.string().optional().nullable(),
            sign: z.enum(['+', '-']).default('+'),
            factor: z.coerce.number().default(1),
          })
        )
        .default([]),
    })
    .optional()
    .nullable(),
  format: z
    .enum(['TEXT', 'CURRENCY', 'NUMBER', 'DATE', 'PERCENT', 'PERCENT_GROUP', 'PERCENT_TOTAL'])
    .default('TEXT'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  totalize: z.boolean().default(false),
  aggregation: z.enum(['SUM', 'AVG', 'COUNT', 'MIN', 'MAX']).default('SUM'),
});

export const reportFilterSchema = z.object({
  field: z.string(),
  operator: z.enum(['EQUALS', 'CONTAINS', 'IN', 'BETWEEN', 'GT', 'GTE', 'LT', 'LTE']),
  value: z.any(),
});

export const reportChartConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    title: z.string().optional().nullable(),
    type: z.enum(['bar', 'donut', 'pie', 'line', 'area']).default('bar'),
    xAxisField: z.string().optional().nullable(), // Campo agrupador para el eje X
    yAxisField: z.string().optional().nullable(), // Campo numérico/calculado a acumular
    aggregation: z.enum(['SUM', 'AVG', 'COUNT']).default('SUM'),
  })
  .optional()
  .nullable();

export const reportConfigSchema = z.object({
  reportTitle: z.string().max(250).optional().nullable(),
  fields: z.array(reportFieldSchema).min(1, 'Debe incluir al menos una columna'),
  groupings: z.array(z.string()).default([]), // ['department.name', 'jobPosition.name']
  subtotalPosition: z.enum(['HEADER', 'FOOTER']).default('FOOTER'),
  showGroupPercentOfTotal: z.boolean().default(true),
  filters: z.array(reportFilterSchema).default([]),
  chart: reportChartConfigSchema,
});

export const createTemplateSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al min. 2 caracteres').max(150),
  description: z.string().max(500).optional().nullable(),
  category: z.enum(['PAYROLL', 'COSTS', 'HR', 'LEGAL', 'TAX']).default('PAYROLL'),
  isSystem: z.boolean().default(false),
  config: reportConfigSchema,
});

export const updateTemplateSchema = createTemplateSchema.partial();

const optionalIdSchema = z.preprocess(
  (val) => (val === '' || val === 'null' || val === 'undefined' ? undefined : val),
  z.string().optional().nullable()
);

export const executeReportSchema = z.object({
  templateId: optionalIdSchema,
  config: reportConfigSchema.optional().nullable(), // Permite ejecución ad-hoc sin guardar plantilla previa
  periodId: optionalIdSchema,
  periodFromId: optionalIdSchema,
  periodToId: optionalIdSchema,
  multiPeriodMode: z.enum(['SUM', 'GROUP_BY_PERIOD']).default('SUM').optional().nullable(),
  groupFilterLevel1: z.string().optional().nullable(),
  groupFilterLevel2: z.string().optional().nullable(),
  employeeFrom: z.string().optional().nullable(),
  employeeTo: z.string().optional().nullable(),
  filtersOverride: z.array(reportFilterSchema).optional().nullable(),
});

export const exportReportSchema = executeReportSchema.extend({
  format: z.enum(['excel', 'pdf']),
  chartImageBase64: z.string().optional().nullable(), // Cadena data:image/png;base64,... opcional o null
});

