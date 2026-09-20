import crypto from 'crypto';
import { ensureTenantPersonnelSchema } from '../../services/tenantProvisioner.service.js';

export async function listKinships(tenantPrisma) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const kinships = await tenantPrisma.kinship.findMany({
    where: { deletedAt: null },
    include: {
      _count: {
        select: { relatives: { where: { deletedAt: null } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  return kinships.map((k) => ({
    id: k.id,
    name: k.name,
    code: k.code,
    relativeCount: k._count.relatives,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  }));
}

export async function getKinshipById(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const kinship = await tenantPrisma.kinship.findFirst({
    where: { id, deletedAt: null },
    include: {
      _count: {
        select: { relatives: { where: { deletedAt: null } } },
      },
    },
  });

  if (!kinship) {
    const error = new Error('Parentesco no encontrado');
    error.status = 404;
    throw error;
  }

  return {
    id: kinship.id,
    name: kinship.name,
    code: kinship.code,
    relativeCount: kinship._count.relatives,
    createdAt: kinship.createdAt,
    updatedAt: kinship.updatedAt,
  };
}

export async function createKinship(tenantPrisma, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  return tenantPrisma.kinship.create({
    data: {
      id: crypto.randomUUID(),
      name: data.name.trim(),
      code: data.code ? data.code.trim().toUpperCase() : null,
    },
  });
}

export async function updateKinship(tenantPrisma, id, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getKinshipById(tenantPrisma, id);

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.code !== undefined) updateData.code = data.code ? data.code.trim().toUpperCase() : null;

  return tenantPrisma.kinship.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteKinship(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const kinship = await getKinshipById(tenantPrisma, id);

  if (kinship.relativeCount > 0) {
    const error = new Error(
      `No se puede eliminar el parentesco porque está asignado a ${kinship.relativeCount} familiar(es).`
    );
    error.status = 409;
    throw error;
  }

  return tenantPrisma.kinship.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
