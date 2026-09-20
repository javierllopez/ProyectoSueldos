import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string({ required_error: 'El nombre del sector es obligatorio' })
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(191, 'El nombre no puede exceder los 191 caracteres')
    .trim(),
  code: z.string().max(50, 'El código no puede exceder los 50 caracteres').trim().nullable().optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export const importDepartmentsSchema = z.object({
  departments: z
    .array(
      z.object({
        name: z.string().trim().optional().nullable(),
        code: z.string().trim().optional().nullable(),
      })
    )
    .min(1, 'Debe enviar al menos un sector para importar'),
});

export const createJobPositionSchema = z.object({
  name: z.string({ required_error: 'El nombre del puesto es obligatorio' })
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(191, 'El nombre no puede exceder los 191 caracteres')
    .trim(),
  code: z.string().max(50, 'El código no puede exceder los 50 caracteres').trim().nullable().optional(),
  cctCode: z.string().max(50, 'El código de convenio no puede exceder los 50 caracteres').trim().nullable().optional(),
  categoryCode: z.string().max(50, 'El código de categoría no puede exceder los 50 caracteres').trim().nullable().optional(),
  positionCode: z.string().max(50, 'El código de puesto ARCA no puede exceder los 50 caracteres').trim().nullable().optional(),
  serviceTypeCode: z.string().max(50, 'El código de tipo de servicio no puede exceder los 50 caracteres').trim().nullable().optional(),
});

export const updateJobPositionSchema = createJobPositionSchema.partial();

export const importJobPositionsSchema = z.object({
  jobPositions: z
    .array(
      z.object({
        code: z.string().trim().optional().nullable(),
        name: z.string().trim().optional().nullable(),
        cctCode: z.string().trim().optional().nullable(),
        categoryCode: z.string().trim().optional().nullable(),
        positionCode: z.string().trim().optional().nullable(),
        serviceTypeCode: z.string().trim().optional().nullable(),
      })
    )
    .min(1, 'Debe enviar al menos un puesto de trabajo para importar'),
});
