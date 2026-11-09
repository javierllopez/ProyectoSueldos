import { z } from 'zod';

const attachmentItemSchema = z.object({
  id: z.string().optional(),
  fileName: z.string().max(255).optional(),
  name: z.string().max(255).optional(),
  mimeType: z.string().min(1, 'El tipo MIME es obligatorio').max(120),
  sizeBytes: z.coerce.number().int().nonnegative().optional(),
  size: z.coerce.number().int().nonnegative().optional(),
  dataUrl: z.string().min(1, 'El contenido del archivo es obligatorio'),
  uploadedAt: z.string().optional(),
});

export const incidentTypeSchema = z.object({
  code: z.string().trim().max(50).optional().nullable(),
  name: z.string().trim().min(2, 'La denominación del tipo de incidente es obligatoria').max(190),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().default('MEDIUM'),
  description: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const updateIncidentTypeSchema = incidentTypeSchema.partial();

export const sanctionTypeSchema = z.object({
  code: z.string().trim().max(50).optional().nullable(),
  name: z.string().trim().min(2, 'La denominación del tipo de sanción es obligatoria').max(190),
  requiresSuspensionDays: z.boolean().optional().default(false),
  description: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const updateSanctionTypeSchema = sanctionTypeSchema.partial();

export const employeeIncidentSchema = z.object({
  employeeId: z.string().uuid('Debe seleccionar un colaborador válido'),
  incidentTypeId: z.string().uuid('Debe seleccionar un tipo de incidente válido'),
  incidentDate: z.string().min(8, 'La fecha del incidente es obligatoria'),
  observations: z.string().trim().max(5000).optional().nullable(),
  attachments: z.array(attachmentItemSchema).optional().default([]),
});

export const updateEmployeeIncidentSchema = employeeIncidentSchema.partial();

export const employeeSanctionSchema = z.object({
  employeeId: z.string().uuid('Debe seleccionar un colaborador válido'),
  sanctionTypeId: z.string().uuid('Debe seleccionar un tipo de sanción válido'),
  sanctionDate: z.string().min(8, 'La fecha de la sanción es obligatoria'),
  suspensionDays: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(0).max(365).nullable().optional()
  ),
  observations: z.string().trim().max(5000).optional().nullable(),
  incidentIds: z.array(z.string().uuid()).optional().default([]),
  attachments: z.array(attachmentItemSchema).optional().default([]),
});

export const updateEmployeeSanctionSchema = employeeSanctionSchema.partial();

export const disciplinaryReportParamsSchema = z.object({
  reportType: z.enum([
    'INCIDENTS_DETAIL',
    'INCIDENTS_STATS',
    'SANCTIONS_DETAIL',
    'SANCTIONS_STATS',
  ]),
  dateFrom: z.string().min(8, 'La fecha desde es obligatoria'),
  dateTo: z.string().min(8, 'La fecha hasta es obligatoria'),
  employeeId: z.string().optional().nullable(),
  typeId: z.string().optional().nullable(),
});
