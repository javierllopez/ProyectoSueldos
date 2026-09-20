import { z } from 'zod';
import { isValidCuit } from '../companies/company.validation.js';

export const createEmployeeSchema = z.object({
  fileNumber: z.string({ required_error: 'El número de legajo es obligatorio' })
    .trim()
    .min(1, 'El legajo debe tener al menos 1 carácter')
    .max(50, 'El legajo no puede superar los 50 caracteres'),

  lastName: z.string({ required_error: 'El apellido es obligatorio' })
    .trim()
    .min(2, 'El apellido debe tener al menos 2 caracteres')
    .max(191),

  firstName: z.string({ required_error: 'El nombre es obligatorio' })
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(191),

  photo: z.string().nullable().optional().or(z.literal('')),

  documentType: z.string().trim().default('DNI'),

  documentNumber: z.string({ required_error: 'El número de documento es obligatorio' })
    .trim()
    .min(1, 'El número de documento es obligatorio')
    .max(20),

  cuil: z.string({ required_error: 'El CUIL es obligatorio' })
    .trim()
    .refine((val) => isValidCuit(val), {
      message: 'El CUIL no es válido según el algoritmo oficial de AFIP/ARCA (Módulo 11)',
    }),

  gender: z.string().trim().default('M'),

  birthDate: z.coerce.date({ required_error: 'La fecha de nacimiento es obligatoria', invalid_type_error: 'Fecha de nacimiento inválida' }),

  hireDate: z.coerce.date({ required_error: 'La fecha de ingreso es obligatoria', invalid_type_error: 'Fecha de ingreso inválida' }),

  // Domicilio (opcional / flexible)
  street: z.string().trim().nullable().optional().or(z.literal('')),
  streetNumber: z.string().trim().nullable().optional().or(z.literal('')),
  floor: z.string().trim().nullable().optional().or(z.literal('')),
  apartment: z.string().trim().nullable().optional().or(z.literal('')),
  city: z.string().trim().nullable().optional().or(z.literal('')),
  postalCode: z.string().trim().nullable().optional().or(z.literal('')),
  province: z.string().trim().nullable().optional().or(z.literal('')),

  // Contacto & Estado
  email: z.string().trim().email('Formato de correo electrónico inválido').nullable().optional().or(z.literal('')),
  phone: z.string().trim().nullable().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE']).default('ACTIVE'),

  // Relaciones Obligatorias
  departmentId: z.string({ required_error: 'El sector es obligatorio' }).min(1, 'Debes seleccionar un sector'),
  jobPositionId: z.string({ required_error: 'El puesto de trabajo es obligatorio' }).min(1, 'Debes seleccionar un puesto de trabajo'),
  healthInsuranceId: z.string({ required_error: 'La obra social es obligatoria' }).min(1, 'Debes seleccionar una obra social'),

  // Relaciones Opcionales
  unionId: z.string().trim().nullable().optional().or(z.literal('')),
  mutualId: z.string().trim().nullable().optional().or(z.literal('')),
  contractModalityCode: z.string().trim().nullable().optional().or(z.literal('')),

  // Parámetros de Liquidación y Jornada
  payrollGroup: z.string().trim().default('MENSUAL'),
  isPartTime: z.boolean().default(false),
  weeklyWorkingHours: z.union([z.string().regex(/^\d{1,3}:[0-5]\d$/, 'Formato de horas semanales inválido (HH:MM)'), z.number().nonnegative()]).nullable().optional(),
  monthlyWorkingHours: z.union([z.string().regex(/^\d{1,3}:[0-5]\d$/, 'Formato de horas mensuales inválido (HH:MM)'), z.number().nonnegative()]).nullable().optional(),
  partTimePercentage: z.coerce.number().min(0).max(100).nullable().optional(),
  basicSalary: z.coerce.number().min(0, 'El sueldo básico debe ser mayor o igual a 0').nullable().optional(),
  hourlyRate: z.coerce.number().min(0, 'El valor hora debe ser mayor o igual a 0').nullable().optional(),

  // Familiares opcionales
  relatives: z.array(
    z.object({
      kinshipId: z.string({ required_error: 'El parentesco es obligatorio' }).min(1, 'Debes seleccionar un parentesco'),
      lastName: z.string({ required_error: 'El apellido del familiar es obligatorio' }).trim().min(2, 'El apellido debe tener al menos 2 caracteres'),
      firstName: z.string({ required_error: 'El nombre del familiar es obligatorio' }).trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
      documentType: z.string().trim().default('DNI'),
      documentNumber: z.string({ required_error: 'El número de documento es obligatorio' }).trim().min(1, 'El documento es obligatorio'),
      cuil: z.string().trim().nullable().optional().or(z.literal('')).refine(
        (val) => !val || isValidCuit(val.replace(/\D/g, '')),
        { message: 'El CUIL del familiar no es válido' }
      ),
      birthDate: z.coerce.date({ required_error: 'La fecha de nacimiento es obligatoria', invalid_type_error: 'Fecha de nacimiento inválida' }),
    })
  ).optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export const assignEmployeeConceptSchema = z.object({
  conceptId: z.string({ required_error: 'El concepto es obligatorio' }).min(1, 'Debes seleccionar un concepto'),
  amount: z.coerce.number().nullable().optional(),
  units: z.coerce.number().nullable().optional(),
  notes: z.string().trim().max(255).nullable().optional().or(z.literal('')),
  validFrom: z.coerce.date().nullable().optional(),
  validTo: z.coerce.date().nullable().optional(),
  isActive: z.boolean().default(true),
});

export const updateEmployeeConceptSchema = assignEmployeeConceptSchema.partial();

export const massWageIncreaseSchema = z.object({
  increaseType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT'], {
    required_error: 'El tipo de aumento es obligatorio (PERCENTAGE o FIXED_AMOUNT)',
  }),
  value: z.coerce.number().positive('El aumento debe ser mayor a 0').optional(),
  increaseValue: z.coerce.number().positive('El aumento debe ser mayor a 0').optional(),
  targetFields: z.array(z.enum(['BASIC_SALARY', 'HOURLY_RATE', 'FIXED_CONCEPTS'])).optional(),
  applyToBasic: z.boolean().optional(),
  applyToHourlyRate: z.boolean().optional(),
  applyToConcepts: z.boolean().optional(),
  conceptId: z.string().optional().nullable(),
  rounding: z.enum(['NONE', 'INTEGER', 'DECIMAL_2']).default('DECIMAL_2'),
  filters: z.object({
    departmentId: z.string().optional().nullable(),
    payrollGroup: z.string().optional().nullable(),
    status: z.string().default('ACTIVE'),
  }).optional(),
  filterDepartmentId: z.string().optional().nullable(),
  filterPayrollGroup: z.string().optional().nullable(),
  filterStatus: z.string().optional().nullable(),
  effectiveDate: z.coerce.date().optional().nullable(),
}).refine(
  (data) => data.value !== undefined || data.increaseValue !== undefined,
  { message: 'El valor del aumento es obligatorio y debe ser mayor a 0', path: ['value'] }
).refine(
  (data) => (data.targetFields && data.targetFields.length > 0) || data.applyToBasic || data.applyToHourlyRate || data.applyToConcepts,
  { message: 'Debe seleccionar al menos un campo a incrementar', path: ['targetFields'] }
);

export const createRelativeSchema = z.object({
  kinshipId: z.string({ required_error: 'El parentesco es obligatorio' }).min(1, 'Debes seleccionar un parentesco'),
  lastName: z.string({ required_error: 'El apellido del familiar es obligatorio' }).trim().min(2, 'El apellido debe tener al menos 2 caracteres'),
  firstName: z.string({ required_error: 'El nombre del familiar es obligatorio' }).trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  documentType: z.string().trim().default('DNI'),
  documentNumber: z.string({ required_error: 'El número de documento es obligatorio' }).trim().min(1, 'El documento es obligatorio'),
  cuil: z.string().trim().nullable().optional().or(z.literal('')).refine(
    (val) => !val || isValidCuit(val.replace(/\D/g, '')),
    { message: 'El CUIL del familiar no es válido' }
  ),
  birthDate: z.coerce.date({ required_error: 'La fecha de nacimiento es obligatoria', invalid_type_error: 'Fecha de nacimiento inválida' }),
});

export const updateRelativeSchema = createRelativeSchema.partial();

export const importEmployeesSchema = z.object({
  employees: z
    .array(
      z.object({
        fileNumber: z.any().optional(),
        lastName: z.any().optional(),
        firstName: z.any().optional(),
        documentType: z.any().optional(),
        documentNumber: z.any().optional(),
        cuil: z.any().optional(),
        gender: z.any().optional(),
        birthDate: z.any().optional(),
        hireDate: z.any().optional(),
        department: z.any().optional(),
        jobPosition: z.any().optional(),
        healthInsurance: z.any().optional(),
        union: z.any().optional(),
        mutual: z.any().optional(),
        contractModality: z.any().optional(),
        street: z.any().optional(),
        streetNumber: z.any().optional(),
        floor: z.any().optional(),
        apartment: z.any().optional(),
        city: z.any().optional(),
        postalCode: z.any().optional(),
        province: z.any().optional(),
        email: z.any().optional(),
        phone: z.any().optional(),
        terminationDate: z.any().optional(),
        terminationReason: z.any().optional(),
      })
    )
    .min(1, 'Debe enviar al menos un empleado para importar'),
});

