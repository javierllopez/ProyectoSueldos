import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 10;

/**
 * Hashea una contraseña usando bcrypt.
 * @param {string} password - Contraseña en texto plano.
 * @returns {Promise<string>} Hash de la contraseña.
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compara una contraseña con su hash.
 * @param {string} password - Contraseña en texto plano.
 * @param {string} hash - Hash guardado en la base de datos.
 * @returns {Promise<boolean>} Verdadero si coincide.
 */
export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Genera un token criptográfico seguro en hexadecimal.
 * @param {number} bytes - Cantidad de bytes (por defecto 32).
 * @returns {string} Token aleatorio en hexadecimal.
 */
export function generateRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}
