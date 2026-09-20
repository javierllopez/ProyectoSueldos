import prismaMaster from '../config/prisma.js';
import tenantConnectionManager from '../services/tenantConnectionManager.js';

/**
 * Middleware para resolver la empresa activa (Tenant), validar permisos y suministrar la conexión a su base de datos.
 * Busca el ID de empresa en el header `x-company-id` o en el parámetro de ruta `req.params.companyId`.
 */
export async function resolveTenant(req, res, next) {
  const companyId = req.headers['x-company-id'] || req.params.companyId;

  if (!companyId) {
    const error = new Error('Se requiere especificar la empresa activa (header x-company-id)');
    error.status = 400;
    return next(error);
  }

  // 1. Buscar la empresa en el registro central
  const company = await prismaMaster.companyRegistry.findUnique({
    where: { id: String(companyId) },
  });

  if (!company || company.deletedAt) {
    const error = new Error('Empresa no encontrada');
    error.status = 404;
    return next(error);
  }

  // 2. Validar que la empresa pertenezca a la cuenta del usuario autenticado
  if (company.accountId !== req.user.accountId) {
    const error = new Error('Acceso denegado: la empresa no pertenece a tu cuenta');
    error.status = 403;
    return next(error);
  }

  // 3. Validar estado de la empresa
  if (company.status !== 'ACTIVE') {
    const error = new Error(`La empresa no se encuentra activa (estado: ${company.status})`);
    error.status = 403;
    return next(error);
  }

  // 4. Validar permisos del usuario en la empresa
  let roleInCompany = 'VIEWER';

  if (req.user.role === 'OWNER') {
    roleInCompany = 'ADMIN';
  } else {
    const access = await prismaMaster.userCompanyAccess.findUnique({
      where: {
        userId_companyId: {
          userId: req.user.id,
          companyId: company.id,
        },
      },
    });

    if (!access) {
      const error = new Error('No tienes asignado acceso a esta empresa');
      error.status = 403;
      return next(error);
    }

    roleInCompany = access.role;
  }

  // 5. Obtener conexión a la base de datos física del tenant
  const tenantPrisma = await tenantConnectionManager.getTenantClient(company);

  // Inyectar en el contexto de la request
  req.company = company;
  req.companyRole = roleInCompany;
  req.tenantPrisma = tenantPrisma;

  return next();
}
