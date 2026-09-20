import prisma from '../../config/prisma.js';
import { hashPassword } from '../../utils/crypto.js';

const USER_SELECT_FIELDS = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  cuil: true,
  phone: true,
  position: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  companyAccesses: {
    select: {
      companyId: true,
      role: true,
      company: {
        select: { id: true, name: true, cuit: true, tradeName: true },
      },
    },
  },
};

/**
 * Lista los usuarios pertenecientes a la cuenta con sus datos y empresas asignadas.
 */
export async function listUsers(accountId, { page = 1, limit = 50 } = {}) {
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: { accountId, deletedAt: null },
      skip,
      take: limit,
      orderBy: { createdAt: 'asc' },
      select: USER_SELECT_FIELDS,
    }),
    prisma.user.count({
      where: { accountId, deletedAt: null },
    }),
  ]);

  return {
    data: users,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Obtiene un usuario específico por ID dentro de la cuenta.
 */
export async function getUserById(accountId, userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, accountId, deletedAt: null },
    select: USER_SELECT_FIELDS,
  });

  if (!user) {
    const error = new Error('Usuario no encontrado');
    error.status = 404;
    throw error;
  }

  return user;
}

/**
 * Registra un nuevo colaborador dentro de la cuenta y opcionalmente asigna empresas.
 */
export async function createUser({
  accountId,
  email,
  password,
  firstName,
  lastName,
  cuil,
  phone,
  position,
  role = 'MEMBER',
  companyAccesses = [],
}) {
  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    const error = new Error('El correo electrónico ya se encuentra registrado');
    error.status = 409;
    throw error;
  }

  // Si se pasaron empresas asignadas, validar que pertenezcan a la cuenta
  if (companyAccesses.length > 0) {
    const companyIds = companyAccesses.map((a) => a.companyId);
    const validCount = await prisma.companyRegistry.count({
      where: {
        id: { in: companyIds },
        accountId,
        deletedAt: null,
      },
    });

    if (validCount !== companyIds.length) {
      const error = new Error('Una o más empresas seleccionadas no pertenecen a tu cuenta');
      error.status = 400;
      throw error;
    }
  }

  const passwordHash = await hashPassword(password);

  // Crear usuario y sus accesos
  const newUser = await prisma.user.create({
    data: {
      accountId,
      email,
      passwordHash,
      firstName,
      lastName,
      cuil: cuil || null,
      phone: phone || null,
      position: position || null,
      role: role || 'MEMBER',
      isActive: true,
      ...(companyAccesses.length > 0 && role === 'MEMBER'
        ? {
            companyAccesses: {
              create: companyAccesses.map((a) => ({
                companyId: a.companyId,
                role: a.role,
              })),
            },
          }
        : {}),
    },
    select: USER_SELECT_FIELDS,
  });

  return newUser;
}

/**
 * Actualiza los datos de un usuario de la cuenta (personales, clave, rol y empresas).
 */
export async function updateUser(accountId, targetUserId, data) {
  const user = await prisma.user.findFirst({
    where: { id: targetUserId, accountId, deletedAt: null },
  });

  if (!user) {
    const error = new Error('Usuario no encontrado');
    error.status = 404;
    throw error;
  }

  // Prevenir cambiar el rol del OWNER principal por este endpoint
  if (user.role === 'OWNER' && data.role && data.role !== 'OWNER') {
    const error = new Error('No es posible modificar el rol del Propietario de la cuenta');
    error.status = 400;
    throw error;
  }

  // Si se modifica el email, verificar disponibilidad
  if (data.email && data.email !== user.email) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      const error = new Error('El correo electrónico ya está en uso por otro usuario');
      error.status = 409;
      throw error;
    }
  }

  const updatePayload = {};
  if (data.firstName !== undefined) updatePayload.firstName = data.firstName;
  if (data.lastName !== undefined) updatePayload.lastName = data.lastName;
  if (data.email !== undefined) updatePayload.email = data.email;
  if (data.cuil !== undefined) updatePayload.cuil = data.cuil || null;
  if (data.phone !== undefined) updatePayload.phone = data.phone || null;
  if (data.position !== undefined) updatePayload.position = data.position || null;
  if (data.role !== undefined) updatePayload.role = data.role;
  if (data.isActive !== undefined) updatePayload.isActive = data.isActive;

  // Si se suministró una nueva contraseña
  if (data.password && data.password.trim().length >= 8) {
    updatePayload.passwordHash = await hashPassword(data.password.trim());
  }

  // Manejo atómico de asignación de empresas si se incluye en la solicitud
  if (Array.isArray(data.companyAccesses)) {
    const companyIds = data.companyAccesses.map((a) => a.companyId);
    if (companyIds.length > 0) {
      const validCount = await prisma.companyRegistry.count({
        where: {
          id: { in: companyIds },
          accountId,
          deletedAt: null,
        },
      });

      if (validCount !== companyIds.length) {
        const error = new Error('Una o más empresas seleccionadas no pertenecen a tu cuenta');
        error.status = 400;
        throw error;
      }
    }

    // Reemplazar asignaciones existentes
    await prisma.userCompanyAccess.deleteMany({
      where: { userId: targetUserId },
    });

    if (data.companyAccesses.length > 0) {
      await prisma.userCompanyAccess.createMany({
        data: data.companyAccesses.map((a) => ({
          userId: targetUserId,
          companyId: a.companyId,
          role: a.role,
        })),
      });
    }
  }

  return prisma.user.update({
    where: { id: targetUserId },
    data: updatePayload,
    select: USER_SELECT_FIELDS,
  });
}

/**
 * Deshabilita y borra lógicamente a un usuario.
 */
export async function deleteUser(accountId, targetUserId, currentUserId) {
  if (targetUserId === currentUserId) {
    const error = new Error('No puedes eliminar tu propia cuenta de usuario');
    error.status = 400;
    throw error;
  }

  const user = await prisma.user.findFirst({
    where: { id: targetUserId, accountId, deletedAt: null },
  });

  if (!user) {
    const error = new Error('Usuario no encontrado');
    error.status = 404;
    throw error;
  }

  if (user.role === 'OWNER') {
    const error = new Error('No es posible eliminar al Propietario de la cuenta');
    error.status = 400;
    throw error;
  }

  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  });
}
