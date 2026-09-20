import { ZodError } from 'zod';
import env from '../config/env.js';

/**
 * Middleware central de manejo de errores para Express 5.
 */
export default function errorHandler(err, req, res, next) {
  // Errores de validación de Zod
  if (err instanceof ZodError) {
    const formattedErrors = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    return res.status(400).json({
      error: {
        message: 'Error de validación en los datos enviados',
        status: 400,
        details: formattedErrors,
      },
    });
  }

  // Errores de Prisma
  if (err.code === 'P2002') {
    return res.status(409).json({
      error: {
        message: 'Ya existe un registro con los datos únicos proporcionados (Legajo o CUIL duplicado)',
        status: 409,
      },
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      error: {
        message: 'El registro solicitado no fue encontrado',
        status: 404,
      },
    });
  }

  if (err.code === 'P2003') {
    return res.status(400).json({
      error: {
        message: 'Error de relación de datos: el Sector, Puesto de Trabajo u Obra Social seleccionada no es válida',
        status: 400,
      },
    });
  }

  // Errores de autenticación JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: {
        message: 'Token de autenticación inválido o malformado',
        status: 401,
      },
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: {
        message: 'El token de autenticación ha expirado',
        status: 401,
      },
    });
  }

  // Error de payload excesivo (413)
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      error: {
        message: 'El tamaño de los datos enviados excede el límite permitido por el servidor.',
        status: 413,
      },
    });
  }

  // Errores de negocio personalizados (con status explícito)
  const status = err.status || (res.statusCode >= 400 ? res.statusCode : 500);
  const message = err.status ? err.message : (status === 500 ? (err.message || 'Error interno del servidor') : err.message);

  if (status >= 500 && env.NODE_ENV !== 'test') {
    console.error('💥 Error no manejado:', err);
  }

  return res.status(status).json({
    error: {
      message,
      status,
      ...(env.NODE_ENV === 'development' && status >= 500 ? { stack: err.stack } : {}),
    },
  });
}
