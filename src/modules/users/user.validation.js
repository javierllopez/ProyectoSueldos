import { z } from 'zod';
import { isValidCuit } from '../companies/company.validation.js';

const companyAccessItemSchema = z.object({
  companyId: z.string().uuid('ID de empresa inválido'),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER'], {
    message: 'Rol de empresa inválido (debe ser ADMIN, OPERATOR o VIEWER)',
  }),
});

export const createUserSchema = z.object({
  email: z.string().trim().email('Formato de correo electrónico inválido').toLowerCase(),
  password: z.string().min(8, 'La contraseña debe contener al menos 8 caracteres'),
  firstName: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  lastName: z.string().trim().min(2, 'El apellido debe tener al menos 2 caracteres'),
  cuil: z
    .string()
    .trim()
    .transform((val) => val.replace(/\D/g, ''))
    .refine((val) => val === '' || isValidCuit(val), {
      message: 'El CUIL ingresado no es válido según el algoritmo oficial (Módulo 11)',
    })
    .optional()
    .nullable(),
  phone: z.string().trim().optional().nullable(),
  position: z.string().trim().optional().nullable(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
  companyAccesses: z.array(companyAccessItemSchema).optional().default([]),
});

export const updateUserSchema = z.object({
  firstName: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').optional(),
  lastName: z.string().trim().min(2, 'El apellido debe tener al menos 2 caracteres').optional(),
  email: z.string().trim().email('Formato de correo electrónico inválido').toLowerCase().optional(),
  password: z
    .string()
    .min(8, 'La contraseña debe contener al menos 8 caracteres')
    .optional()
    .or(z.literal(''))
    .nullable(),
  cuil: z
    .string()
    .trim()
    .transform((val) => val.replace(/\D/g, ''))
    .refine((val) => val === '' || isValidCuit(val), {
      message: 'El CUIL ingresado no es válido según el algoritmo oficial (Módulo 11)',
    })
    .optional()
    .nullable(),
  phone: z.string().trim().optional().nullable(),
  position: z.string().trim().optional().nullable(),
  role: z.enum(['ADMIN', 'MEMBER']).optional(),
  isActive: z.boolean().optional(),
  companyAccesses: z.array(companyAccessItemSchema).optional(),
});
