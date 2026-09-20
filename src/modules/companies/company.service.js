import prisma from '../../config/prisma.js';
import { provisionTenantDatabase, ensureTenantProfileSchema } from '../../services/tenantProvisioner.service.js';
import tenantConnectionManager from '../../services/tenantConnectionManager.js';
import crypto from 'crypto';

/**
 * Lista las empresas pertenecientes a la cuenta del usuario autenticado con paginación.
 */
export async function listCompanies(user, { page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;
  const where = {
    accountId: user.accountId,
    deletedAt: null,
    ...(user.role === 'MEMBER' ? { userAccesses: { some: { userId: user.id } } } : {}),
  };

  const [companies, total] = await Promise.all([
    prisma.companyRegistry.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        tradeName: true,
        cuit: true,
        activityCode: true,
        activity: {
          select: {
            code: true,
            description: true,
          },
        },
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { userAccesses: true },
        },
      },
    }),
    prisma.companyRegistry.count({
      where,
    }),
  ]);

  return {
    data: companies,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Obtiene los detalles de una empresa por ID verificando pertenencia a la cuenta.
 */
export async function getCompanyById(accountId, companyId) {
  const company = await prisma.companyRegistry.findFirst({
    where: { id: companyId, accountId, deletedAt: null },
    select: {
      id: true,
      name: true,
      tradeName: true,
      cuit: true,
      activityCode: true,
      activity: {
        select: {
          code: true,
          description: true,
          sectionDesc: true,
        },
      },
      status: true,
      dbName: true,
      createdAt: true,
      updatedAt: true,
      userAccesses: {
        select: {
          userId: true,
          role: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!company) {
    const error = new Error('Empresa no encontrada');
    error.status = 404;
    throw error;
  }

  return company;
}

/**
 * Registra una nueva empresa y aprovisiona automáticamente su base de datos física.
 */
export async function createCompany({ accountId, userId, name, tradeName, cuit, activityCode = null }) {
  const cleanCuit = cuit.replace(/\D/g, '');

  // 1. Validar límite de empresas según el plan de la cuenta
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!account || account.deletedAt) {
    const error = new Error('Cuenta no encontrada');
    error.status = 404;
    throw error;
  }

  const currentCount = await prisma.companyRegistry.count({
    where: { accountId, deletedAt: null },
  });

  if (currentCount >= account.maxCompanies) {
    const error = new Error(
      `Has alcanzado el límite de ${account.maxCompanies} empresa(s) permitido por tu plan actual. Contacta soporte para ampliar tu suscripción.`
    );
    error.status = 403;
    throw error;
  }

  // 2. Verificar que no exista otra empresa con el mismo CUIT en la cuenta
  const existing = await prisma.companyRegistry.findUnique({
    where: {
      accountId_cuit: {
        accountId,
        cuit: cleanCuit,
      },
    },
  });

  if (existing && !existing.deletedAt) {
    const error = new Error(`Ya existe una empresa registrada con el CUIT ${cleanCuit} en tu cuenta`);
    error.status = 409;
    throw error;
  }

  // Obtener descripción de la actividad si se especificó código CLAE
  let activityDescription = null;
  if (activityCode) {
    const clae = await prisma.claeActivity.findUnique({ where: { code: activityCode } });
    if (clae) activityDescription = clae.description;
  }

  // 3. Aprovisionar físicamente la base de datos de la empresa en MySQL
  const { dbName, dbHost, dbPort } = await provisionTenantDatabase({
    cuit: cleanCuit,
    name,
    activityCode: activityCode || null,
    activityDescription,
  });

  // 4. Registrar la empresa en la base MASTER y asignar permisos al creador
  const company = await prisma.$transaction(async (tx) => {
    const newCompany = await tx.companyRegistry.create({
      data: {
        accountId,
        name,
        tradeName: tradeName || null,
        cuit: cleanCuit,
        activityCode: activityCode || null,
        dbName,
        dbHost,
        dbPort,
        status: 'ACTIVE',
      },
    });

    await tx.userCompanyAccess.create({
      data: {
        userId,
        companyId: newCompany.id,
        role: 'ADMIN',
      },
    });

    await tx.auditLog.create({
      data: {
        accountId,
        userId,
        action: 'COMPANY_CREATED',
        entity: 'CompanyRegistry',
        entityId: newCompany.id,
        details: JSON.stringify({ name, cuit: cleanCuit, dbName, activityCode }),
      },
    });

    return newCompany;
  });

  return company;
}

/**
 * Actualiza la información básica de una empresa.
 */
export async function updateCompany(accountId, companyId, { name, tradeName, activityCode }) {
  const company = await prisma.companyRegistry.findFirst({
    where: { id: companyId, accountId, deletedAt: null },
  });

  if (!company) {
    const error = new Error('Empresa no encontrada');
    error.status = 404;
    throw error;
  }

  const updated = await prisma.companyRegistry.update({
    where: { id: companyId },
    data: {
      ...(name ? { name } : {}),
      ...(tradeName !== undefined ? { tradeName } : {}),
      ...(activityCode !== undefined ? { activityCode: activityCode || null } : {}),
    },
  });

  // Sincronizar en la base de datos física de la empresa
  try {
    const tenantClient = await tenantConnectionManager.getTenantClient(company);
    await ensureTenantProfileSchema(tenantClient);

    const updateData = {};
    if (name) updateData.legalName = name;
    if (tradeName !== undefined) updateData.tradeName = tradeName;

    if (activityCode !== undefined) {
      updateData.activityCode = activityCode || null;
      if (activityCode) {
        const clae = await prisma.claeActivity.findUnique({ where: { code: activityCode } });
        updateData.activityDescription = clae ? clae.description : null;
      } else {
        updateData.activityDescription = null;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await tenantClient.companyProfile.updateMany({
        data: updateData,
      });
    }
  } catch (err) {
    console.warn(`No se pudo sincronizar los datos en la base física de ${company.dbName}:`, err.message);
  }

  return updated;
}

/**
 * Realiza un borrado lógico de una empresa.
 */
export async function deleteCompany(accountId, companyId, userId) {
  const company = await prisma.companyRegistry.findFirst({
    where: { id: companyId, accountId, deletedAt: null },
  });

  if (!company) {
    const error = new Error('Empresa no encontrada');
    error.status = 404;
    throw error;
  }

  await prisma.$transaction([
    prisma.companyRegistry.update({
      where: { id: companyId },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
      },
    }),
    prisma.auditLog.create({
      data: {
        accountId,
        userId,
        action: 'COMPANY_DELETED',
        entity: 'CompanyRegistry',
        entityId: companyId,
      },
    }),
  ]);
}

/**
 * Asigna o actualiza el rol de un usuario en una empresa.
 */
export async function assignUserToCompany({ accountId, companyId, targetUserId, role }) {
  // Verificar que el usuario pertenezca a la misma cuenta
  const targetUser = await prisma.user.findFirst({
    where: { id: targetUserId, accountId, deletedAt: null },
  });

  if (!targetUser) {
    const error = new Error('El usuario no pertenece a tu cuenta');
    error.status = 404;
    throw error;
  }

  return prisma.userCompanyAccess.upsert({
    where: {
      userId_companyId: {
        userId: targetUserId,
        companyId,
      },
    },
    create: {
      userId: targetUserId,
      companyId,
      role,
    },
    update: {
      role,
    },
  });
}

/**
 * Quita el acceso de un usuario a una empresa.
 */
export async function removeUserFromCompany({ companyId, targetUserId }) {
  await prisma.userCompanyAccess.deleteMany({
    where: {
      userId: targetUserId,
      companyId,
    },
  });
}

/**
 * Obtiene la ficha de datos completa de la empresa activa desde su base de datos física.
 */
export async function getCompanyProfile(tenantPrisma, company) {
  // Asegurar que la tabla tenga las columnas necesarias
  await ensureTenantProfileSchema(tenantPrisma);

  let profile = await tenantPrisma.companyProfile.findFirst({
    where: { deletedAt: null },
  });

  if (!profile) {
    profile = await tenantPrisma.companyProfile.create({
      data: {
        id: crypto.randomUUID(),
        legalName: company.name,
        tradeName: company.tradeName || null,
        cuit: company.cuit,
      },
    });
  }

  return {
    ...profile,
    masterCompanyId: company.id,
    cuit: company.cuit,
  };
}

/**
 * Actualiza los datos fiscales, de domicilio y laborales de la empresa en su base de datos física.
 */
export async function updateCompanyProfile(tenantPrisma, accountId, company, data) {
  await ensureTenantProfileSchema(tenantPrisma);

  let profile = await tenantPrisma.companyProfile.findFirst({
    where: { deletedAt: null },
  });

  if (!profile) {
    profile = await tenantPrisma.companyProfile.create({
      data: {
        id: crypto.randomUUID(),
        legalName: company.name,
        tradeName: company.tradeName || null,
        cuit: company.cuit,
        activityCode: company.activityCode || null,
      },
    });
  }

  // Si se envió activityCode y no se envió activityDescription, buscarla en la base MASTER
  let activityDescription = data.activityDescription;
  if (data.activityCode && activityDescription === undefined) {
    const clae = await prisma.claeActivity.findUnique({ where: { code: data.activityCode } });
    if (clae) activityDescription = clae.description;
  } else if (data.activityCode === null || data.activityCode === '') {
    activityDescription = null;
  }

  const updatedProfile = await tenantPrisma.companyProfile.update({
    where: { id: profile.id },
    data: {
      ...data,
      cuit: company.cuit, // El CUIT no se modifica desde este endpoint
      ...(activityDescription !== undefined ? { activityDescription } : {}),
    },
  });

  // Sincronizar en la base MASTER si se modificó razón social, nombre de fantasía o código CLAE
  const masterUpdateData = {};
  if (data.legalName) masterUpdateData.name = data.legalName;
  if (data.tradeName !== undefined) masterUpdateData.tradeName = data.tradeName;
  if (data.activityCode !== undefined) masterUpdateData.activityCode = data.activityCode || null;

  if (Object.keys(masterUpdateData).length > 0) {
    await prisma.companyRegistry.update({
      where: { id: company.id },
      data: masterUpdateData,
    });
  }

  return updatedProfile;
}
