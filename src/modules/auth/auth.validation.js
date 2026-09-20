import { z } from 'zod';

export const registerSchema = z.object({
  accountName: z.string().trim().min(2, 'El nombre de la cuenta o razón social debe tener al menos 2 caracteres'),
  email: z.string().trim().email('Formato de correo electrónico inválido').toLowerCase(),
  password: z.string().min(8, 'La contraseña debe contener al menos 8 caracteres'),
  firstName: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  lastName: z.string().trim().min(2, 'El apellido debe tener al menos 2 caracteres'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Formato de correo electrónico inválido').toLowerCase(),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'El refreshToken es obligatorio'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'La contraseña actual es requerida'),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
});
