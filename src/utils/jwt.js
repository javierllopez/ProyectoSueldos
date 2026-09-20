import jwt from 'jsonwebtoken';
import env from '../config/env.js';

/**
 * Genera un Access Token JWT de corta duración.
 * @param {object} payload - Información básica del usuario (userId, accountId, role).
 * @returns {string} Token JWT firmado.
 */
export function generateAccessToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

/**
 * Verifica y decodifica un Access Token JWT.
 * @param {string} token - Token JWT.
 * @returns {object} Payload decodificado.
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}
