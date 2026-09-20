import crypto from 'crypto';
import { ensureTenantPersonnelSchema } from '../../services/tenantProvisioner.service.js';

// --- OBRAS SOCIALES (HEALTH INSURANCES) ---

export async function listHealthInsurances(tenantPrisma) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const list = await tenantPrisma.healthInsurance.findMany({
    where: { deletedAt: null },
    include: {
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  return list.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    employeeCount: item._count.employees,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
}

export async function getHealthInsuranceById(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const item = await tenantPrisma.healthInsurance.findFirst({
    where: { id, deletedAt: null },
    include: {
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
    },
  });

  if (!item) {
    const error = new Error('Obra Social no encontrada');
    error.status = 404;
    throw error;
  }

  return {
    ...item,
    employeeCount: item._count.employees,
  };
}

export async function createHealthInsurance(tenantPrisma, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  return tenantPrisma.healthInsurance.create({
    data: {
      id: crypto.randomUUID(),
      name: data.name,
      code: data.code || null,
    },
  });
}

export async function updateHealthInsurance(tenantPrisma, id, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getHealthInsuranceById(tenantPrisma, id);

  return tenantPrisma.healthInsurance.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.code !== undefined ? { code: data.code } : {}),
    },
  });
}

export async function deleteHealthInsurance(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getHealthInsuranceById(tenantPrisma, id);

  return tenantPrisma.healthInsurance.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// --- SINDICATOS (UNIONS) ---

export async function listUnions(tenantPrisma) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const list = await tenantPrisma.union.findMany({
    where: { deletedAt: null },
    include: {
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  return list.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    employeeCount: item._count.employees,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
}

export async function getUnionById(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const item = await tenantPrisma.union.findFirst({
    where: { id, deletedAt: null },
    include: {
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
    },
  });

  if (!item) {
    const error = new Error('Sindicato no encontrado');
    error.status = 404;
    throw error;
  }

  return {
    ...item,
    employeeCount: item._count.employees,
  };
}

export async function createUnion(tenantPrisma, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  return tenantPrisma.union.create({
    data: {
      id: crypto.randomUUID(),
      name: data.name,
      code: data.code || null,
    },
  });
}

export async function updateUnion(tenantPrisma, id, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getUnionById(tenantPrisma, id);

  return tenantPrisma.union.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.code !== undefined ? { code: data.code } : {}),
    },
  });
}

export async function deleteUnion(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getUnionById(tenantPrisma, id);

  return tenantPrisma.union.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// --- MUTUALES (MUTUALS) ---

export async function listMutuals(tenantPrisma) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const list = await tenantPrisma.mutual.findMany({
    where: { deletedAt: null },
    include: {
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  return list.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    employeeCount: item._count.employees,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
}

export async function getMutualById(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const item = await tenantPrisma.mutual.findFirst({
    where: { id, deletedAt: null },
    include: {
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
    },
  });

  if (!item) {
    const error = new Error('Mutual no encontrada');
    error.status = 404;
    throw error;
  }

  return {
    ...item,
    employeeCount: item._count.employees,
  };
}

export async function createMutual(tenantPrisma, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  return tenantPrisma.mutual.create({
    data: {
      id: crypto.randomUUID(),
      name: data.name,
      code: data.code || null,
    },
  });
}

export async function updateMutual(tenantPrisma, id, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getMutualById(tenantPrisma, id);

  return tenantPrisma.mutual.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.code !== undefined ? { code: data.code } : {}),
    },
  });
}

export async function deleteMutual(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getMutualById(tenantPrisma, id);

  return tenantPrisma.mutual.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
