import { verifyAccessToken } from '../utils/jwt.js';
import prisma from '../config/prisma.js';

/**
 * Middleware de autenticación JWT.
 * Valida el token del header Authorization, busca al usuario en la base MASTER y lo inyecta en req.user.
 */
export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const error = new Error('Acceso no autorizado: token no proporcionado o formato inválido');
    error.status = 401;
    return next(error);
  }

  const token = authHeader.split(' ')[1];

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    return next(err); // Capturado por errorHandler (JsonWebTokenError o TokenExpiredError)
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          status: true,
          maxCompanies: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!user || user.deletedAt) {
    const error = new Error('Usuario no encontrado o inactivo');
    error.status = 401;
    return next(error);
  }

  if (!user.isActive) {
    const error = new Error('La cuenta de usuario se encuentra deshabilitada');
    error.status = 403;
    return next(error);
  }

  if (user.account.status === 'SUSPENDED' || user.account.status === 'CANCELLED') {
    const error = new Error(`La cuenta del cliente se encuentra ${user.account.status.toLowerCase()}`);
    error.status = 403;
    return next(error);
  }

  // Eliminar el hash de la contraseña antes de inyectar en req
  const { passwordHash, ...safeUser } = user;
  req.user = safeUser;

  return next();
}
