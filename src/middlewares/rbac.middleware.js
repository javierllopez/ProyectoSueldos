/**
 * Middleware para restringir endpoints según el rol del usuario a nivel de Cuenta (Master).
 * @param  {...string} allowedRoles - Roles permitidos ('OWNER', 'ADMIN', 'MEMBER').
 */
export function requireAccountRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      const error = new Error('No autenticado');
      error.status = 401;
      return next(error);
    }

    // El OWNER de la cuenta tiene acceso total
    if (req.user.role === 'OWNER' || allowedRoles.includes(req.user.role)) {
      return next();
    }

    const error = new Error('No posees los permisos necesarios para realizar esta acción');
    error.status = 403;
    return next(error);
  };
}

/**
 * Middleware para restringir endpoints según el rol del usuario dentro de una Empresa específica.
 * @param  {...string} allowedRoles - Roles permitidos ('ADMIN', 'OPERATOR', 'VIEWER').
 */
export function requireCompanyRole(...allowedRoles) {
  return (req, res, next) => {
    // Si el usuario es OWNER de la cuenta, tiene permisos totales sobre todas sus empresas
    if (req.user && req.user.role === 'OWNER') {
      return next();
    }

    if (!req.companyRole) {
      const error = new Error('No se ha verificado el rol en la empresa activa');
      error.status = 403;
      return next(error);
    }

    if (allowedRoles.includes(req.companyRole)) {
      return next();
    }

    const error = new Error('No posees los permisos requeridos para esta empresa');
    error.status = 403;
    return next(error);
  };
}
