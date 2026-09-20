import { z } from 'zod';

/**
 * Valida un CUIT/CUIL argentino mediante el algoritmo Módulo 11.
 * @param {string} cuit - CUIT a validar (con o sin guiones).
 * @returns {boolean}
 */
export function isValidCuit(cuit) {
  if (typeof cuit !== 'string') return false;
  const clean = cuit.replace(/\D/g, '');
  if (clean.length !== 11) return false;

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;

  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i], 10) * multipliers[i];
  }

  const mod = sum % 11;
  let verifier = 11 - mod;
  if (verifier === 11) verifier = 0;
  if (verifier === 10) verifier = 9;

  return verifier === parseInt(clean[10], 10);
}

export const createCompanySchema = z.object({
  name: z.string().trim().min(2, 'La razón social debe tener al menos 2 caracteres'),
  tradeName: z.string().trim().optional().nullable(),
  cuit: z
    .string()
    .trim()
    .refine((val) => isValidCuit(val), {
      message: 'El CUIT ingresado no es válido según el algoritmo de AFIP/ARCA',
    }),
  activityCode: z.string().trim().optional().nullable(),
});

export const updateCompanySchema = z.object({
  name: z.string().trim().min(2, 'La razón social debe tener al menos 2 caracteres').optional(),
  tradeName: z.string().trim().optional().nullable(),
  activityCode: z.string().trim().optional().nullable(),
});

export const assignUserSchema = z.object({
  userId: z.string().min(1, 'El ID de usuario es obligatorio'),
  role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER'], {
    message: 'El rol debe ser ADMIN, OPERATOR o VIEWER',
  }),
});
