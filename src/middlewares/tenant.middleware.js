import prismaMaster from '../config/prisma.js';
import tenantConnectionManager from '../services/tenantConnectionManager.js';

const companyCache = new Map();
const accessCache = new Map();
const CACHE_TTL_MS = 30 * 1000;

function getCached(map, key) {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(map, key, data) {
  map.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateTenantCache(companyId = null) {
  if (companyId) {
    companyCache.delete(String(companyId));
    for (const key of accessCache.keys()) {
      if (key.endsWith(`:${companyId}`)) {
        accessCache.delete(key);
      }
    }
  } else {
    companyCache.clear();
    accessCache.clear();
  }
}

/**
 * Middleware para resolver la empresa activa (Tenant), validar permisos y suministrar la conexión a su base de datos.
 * Busca el ID de empresa en el header `x-company-id` o en el parámetro de ruta `req.params.companyId`.
 */
export async function resolveTenant(req, res, next) {
  try {
    const companyId = req.headers['x-company-id'] || req.params.companyId;

    if (!companyId) {
      const error = new Error('Se requiere especificar la empresa activa (header x-company-id)');
      error.status = 400;
      return next(error);
    }

    const companyKey = String(companyId);

    // 1. Buscar la empresa en caché de corto plazo o en el registro central
    let company = getCached(companyCache, companyKey);
    if (!company) {
      company = await prismaMaster.companyRegistry.findUnique({
        where: { id: companyKey },
      });
      if (company && !company.deletedAt && company.status === 'ACTIVE') {
        setCached(companyCache, companyKey, company);
      }
    }

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
      const accessKey = `${req.user.id}:${company.id}`;
      let access = getCached(accessCache, accessKey);
      if (!access) {
        access = await prismaMaster.userCompanyAccess.findUnique({
          where: {
            userId_companyId: {
              userId: req.user.id,
              companyId: company.id,
            },
          },
        });
        if (access) {
          setCached(accessCache, accessKey, access);
        }
      }

      if (!access) {
        const error = new Error('No tienes asignado acceso a esta empresa');
        error.status = 403;
        return next(error);
      }

      roleInCompany = access.role;
    }

    // 5. Obtener conexión a la base de datos física del tenant
    const tenantPrisma = await tenantConnectionManager.getTenantClient(company);

    // Liberar referencia de uso al finalizar la respuesta para permitir evicción segura
    let released = false;
    const onDone = () => {
      if (!released) {
        released = true;
        tenantConnectionManager.releaseClient(company.dbName);
      }
    };
    res.once('finish', onDone);
    res.once('close', onDone);

    // Inyectar en el contexto de la request
    req.company = company;
    req.companyRole = roleInCompany;
    req.tenantPrisma = tenantPrisma;

    return next();
  } catch (err) {
    return next(err);
  }
}
