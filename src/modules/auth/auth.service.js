import prisma from '../../config/prisma.js';
import { hashPassword, comparePassword, generateRandomToken } from '../../utils/crypto.js';
import { generateAccessToken } from '../../utils/jwt.js';

/**
 * Registra una nueva cuenta de cliente junto a su usuario Administrador / Propietario (OWNER).
 */
export async function register({ accountName, email, password, firstName, lastName }) {
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    const error = new Error('El correo electrónico ya se encuentra registrado');
    error.status = 409;
    throw error;
  }

  const passwordHash = await hashPassword(password);

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        name: accountName,
        status: 'TRIAL',
        maxCompanies: 1,
      },
    });

    const user = await tx.user.create({
      data: {
        accountId: account.id,
        email,
        passwordHash,
        firstName,
        lastName,
        role: 'OWNER',
        isActive: true,
      },
    });

    const refreshTokenString = generateRandomToken(40);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 días de validez

    await tx.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshTokenString,
        expiresAt,
      },
    });

    await tx.auditLog.create({
      data: {
        accountId: account.id,
        userId: user.id,
        action: 'ACCOUNT_REGISTERED',
        entity: 'Account',
        entityId: account.id,
        details: JSON.stringify({ email, accountName }),
      },
    });

    return { account, user, refreshTokenString };
  });

  const accessToken = generateAccessToken({
    userId: result.user.id,
    accountId: result.account.id,
    role: result.user.role,
  });

  const { passwordHash: _, ...safeUser } = result.user;

  return {
    account: result.account,
    user: safeUser,
    accessToken,
    refreshToken: result.refreshTokenString,
  };
}

/**
 * Autentica un usuario, valida credenciales y genera sesión de tokens.
 */
export async function login({ email, password, ipAddress, userAgent }) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      account: true,
      companyAccesses: {
        include: {
          company: {
            select: {
              id: true,
              name: true,
              tradeName: true,
              cuit: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!user || user.deletedAt) {
    const error = new Error('Credenciales inválidas');
    error.status = 401;
    throw error;
  }

  const isValidPassword = await comparePassword(password, user.passwordHash);
  if (!isValidPassword) {
    const error = new Error('Credenciales inválidas');
    error.status = 401;
    throw error;
  }

  if (!user.isActive) {
    const error = new Error('Tu usuario se encuentra deshabilitado. Contacta al administrador.');
    error.status = 403;
    throw error;
  }

  if (user.account.status === 'SUSPENDED' || user.account.status === 'CANCELLED') {
    const error = new Error(`La cuenta del cliente se encuentra ${user.account.status.toLowerCase()}`);
    error.status = 403;
    throw error;
  }

  // Generar tokens
  const accessToken = generateAccessToken({
    userId: user.id,
    accountId: user.accountId,
    role: user.role,
  });

  const refreshTokenString = generateRandomToken(40);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.$transaction([
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshTokenString,
        expiresAt,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        accountId: user.accountId,
        userId: user.id,
        action: 'USER_LOGIN',
        entity: 'User',
        entityId: user.id,
        ipAddress,
        userAgent,
      },
    }),
  ]);

  // Si el usuario es OWNER, puede ver todas las empresas de la cuenta
  let companies = [];
  if (user.role === 'OWNER') {
    const allAccountCompanies = await prisma.companyRegistry.findMany({
      where: { accountId: user.accountId, deletedAt: null },
      select: {
        id: true,
        name: true,
        tradeName: true,
        cuit: true,
        status: true,
      },
    });
    companies = allAccountCompanies.map((c) => ({
      ...c,
      roleInCompany: 'ADMIN',
    }));
  } else {
    companies = user.companyAccesses
      .filter((ca) => ca.company.status === 'ACTIVE')
      .map((ca) => ({
        ...ca.company,
        roleInCompany: ca.role,
      }));
  }

  const { passwordHash: _, companyAccesses, ...safeUser } = user;

  return {
    user: safeUser,
    account: user.account,
    companies,
    accessToken,
    refreshToken: refreshTokenString,
  };
}

/**
 * Renueva el token de acceso utilizando un Refresh Token válido.
 */
export async function refreshAccessToken({ refreshTokenString }) {
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { token: refreshTokenString },
    include: {
      user: {
        include: { account: true },
      },
    },
  });

  if (!tokenRecord || tokenRecord.revokedAt || tokenRecord.expiresAt < new Date()) {
    const error = new Error('Refresh token inválido o expirado');
    error.status = 401;
    throw error;
  }

  const { user } = tokenRecord;

  if (!user.isActive || user.deletedAt) {
    const error = new Error('Usuario inactivo');
    error.status = 401;
    throw error;
  }

  // Rotación del refresh token para mayor seguridad
  const newRefreshTokenString = generateRandomToken(40);
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + 7);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: newRefreshTokenString,
        expiresAt: newExpiresAt,
      },
    }),
  ]);

  const newAccessToken = generateAccessToken({
    userId: user.id,
    accountId: user.accountId,
    role: user.role,
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshTokenString,
  };
}

/**
 * Revoca un refresh token para cerrar sesión.
 */
export async function logout({ refreshTokenString }) {
  if (!refreshTokenString) return;

  await prisma.refreshToken.updateMany({
    where: { token: refreshTokenString, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
