import { ensureTenantPersonnelSchema } from '../../services/tenantProvisioner.service.js';

/**
 * Lista las nóminas / escalas salariales activas con conteo de colaboradores asignados.
 */
export async function listSalaryScales(tenantPrisma, { search } = {}) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const where = { deletedAt: null };
  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { name: { contains: term } },
      { code: { contains: term } },
      { description: { contains: term } },
    ];
  }

  const scales = await tenantPrisma.salaryScale.findMany({
    where,
    include: {
      _count: {
        select: {
          employees: {
            where: { deletedAt: null, status: 'ACTIVE' },
          },
        },
      },
    },
    orderBy: [{ amount: 'asc' }, { name: 'asc' }],
  });

  return scales.map((scale) => ({
    id: scale.id,
    name: scale.name,
    code: scale.code,
    description: scale.description,
    amount: Number(scale.amount),
    assignedEmployeesCount: scale._count?.employees || 0,
    employeesCount: scale._count?.employees || 0,
    _count: scale._count,
    createdAt: scale.createdAt,
    updatedAt: scale.updatedAt,
  }));
}

/**
 * Obtiene el detalle de una nómina por ID.
 */
export async function getSalaryScaleById(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const scale = await tenantPrisma.salaryScale.findFirst({
    where: { id, deletedAt: null },
    include: {
      employees: {
        where: { deletedAt: null },
        select: {
          id: true,
          fileNumber: true,
          lastName: true,
          firstName: true,
          status: true,
          basicSalary: true,
        },
      },
    },
  });

  if (!scale) {
    const err = new Error('Nómina no encontrada');
    err.status = 404;
    throw err;
  }

  return {
    ...scale,
    amount: Number(scale.amount),
    employees: scale.employees.map((e) => ({
      ...e,
      basicSalary: Number(e.basicSalary),
    })),
  };
}

/**
 * Crea un nuevo registro de nómina.
 */
export async function createSalaryScale(tenantPrisma, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const scale = await tenantPrisma.salaryScale.create({
    data: {
      name: data.name.trim(),
      code: data.code?.trim() || null,
      description: data.description?.trim() || null,
      amount: Number(data.amount),
    },
  });

  return {
    ...scale,
    amount: Number(scale.amount),
  };
}

/**
 * Actualiza una nómina y sincroniza en cascada el sueldo básico de los colaboradores asociados.
 */
export async function updateSalaryScale(tenantPrisma, id, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const existing = await tenantPrisma.salaryScale.findFirst({
    where: { id, deletedAt: null },
  });

  if (!existing) {
    const err = new Error('Nómina no encontrada');
    err.status = 404;
    throw err;
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.code !== undefined) updateData.code = data.code ? data.code.trim() : null;
  if (data.description !== undefined) updateData.description = data.description ? data.description.trim() : null;
  if (data.amount !== undefined) updateData.amount = Number(data.amount);

  const updated = await tenantPrisma.salaryScale.update({
    where: { id },
    data: updateData,
  });

  // Si se modificó el monto, sincronizar los básicos de todos los colaboradores asignados
  let affectedEmployeesCount = 0;
  if (data.amount !== undefined) {
    const updateResult = await tenantPrisma.employee.updateMany({
      where: { salaryScaleId: id, deletedAt: null },
      data: { basicSalary: Number(data.amount) },
    });
    affectedEmployeesCount = updateResult.count;
  }

  return {
    ...updated,
    amount: Number(updated.amount),
    affectedEmployeesCount,
  };
}

/**
 * Elimina (soft-delete) una nómina verificando que no tenga colaboradores activos asignados.
 */
export async function deleteSalaryScale(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const scale = await tenantPrisma.salaryScale.findFirst({
    where: { id, deletedAt: null },
    include: {
      employees: {
        where: { deletedAt: null },
      },
    },
  });

  if (!scale) {
    const err = new Error('Nómina no encontrada');
    err.status = 404;
    throw err;
  }

  if (scale.employees.length > 0) {
    const err = new Error(
      `No se puede eliminar la nómina "${scale.name}" porque tiene ${scale.employees.length} colaborador(es) asignado(s). Reasigne o desvincule los colaboradores primero.`
    );
    err.status = 400;
    throw err;
  }

  await tenantPrisma.salaryScale.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return { message: 'Nómina eliminada correctamente' };
}

/**
 * Función auxiliar para aplicar el cálculo de aumento y redondeo.
 */
function calculateIncrease(currentAmount, increaseType, value, rounding) {
  const current = Number(currentAmount) || 0;
  const numVal = Number(value);
  let newAmount = 0;

  if (increaseType === 'PERCENTAGE') {
    newAmount = current * (1 + numVal / 100);
  } else {
    newAmount = current + numVal;
  }

  if (rounding === 'INTEGER') {
    return Math.round(newAmount);
  }
  if (rounding === 'DECIMAL_2') {
    return Math.round(newAmount * 100) / 100;
  }
  return newAmount;
}

/**
 * Previsualiza el aumento masivo de nóminas sin guardar cambios.
 */
export async function previewMassScaleIncrease(tenantPrisma, options) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const { increaseType, value, rounding = 'DECIMAL_2', scaleIds } = options;

  const where = { deletedAt: null };
  if (Array.isArray(scaleIds) && scaleIds.length > 0) {
    where.id = { in: scaleIds };
  }

  const scales = await tenantPrisma.salaryScale.findMany({
    where,
    include: {
      _count: {
        select: {
          employees: {
            where: { deletedAt: null, status: 'ACTIVE' },
          },
        },
      },
    },
    orderBy: [{ amount: 'asc' }, { name: 'asc' }],
  });

  let totalEmployeesAffected = 0;

  const preview = scales.map((scale) => {
    const currentAmount = Number(scale.amount);
    const newAmount = calculateIncrease(currentAmount, increaseType, value, rounding);
    const difference = newAmount - currentAmount;
    const assignedCount = scale._count?.employees || 0;
    totalEmployeesAffected += assignedCount;

    return {
      id: scale.id,
      name: scale.name,
      code: scale.code,
      currentAmount,
      newAmount,
      difference: Math.round(difference * 100) / 100,
      assignedEmployeesCount: assignedCount,
    };
  });

  return {
    increaseType,
    value: Number(value),
    rounding,
    totalScales: scales.length,
    totalEmployeesAffected,
    preview,
  };
}

/**
 * Aplica en transacción el aumento masivo a las nóminas y sincroniza el sueldo básico de todos los empleados asignados.
 */
export async function applyMassScaleIncrease(tenantPrisma, options) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const { increaseType, value, rounding = 'DECIMAL_2', scaleIds } = options;

  const where = { deletedAt: null };
  if (Array.isArray(scaleIds) && scaleIds.length > 0) {
    where.id = { in: scaleIds };
  }

  const scales = await tenantPrisma.salaryScale.findMany({
    where,
    include: {
      _count: {
        select: {
          employees: {
            where: { deletedAt: null, status: 'ACTIVE' },
          },
        },
      },
    },
  });

  if (scales.length === 0) {
    const err = new Error('No se encontraron nóminas para actualizar');
    err.status = 400;
    throw err;
  }

  const operations = [];
  const changes = [];
  let totalEmployeesUpdated = 0;

  for (const scale of scales) {
    const currentAmount = Number(scale.amount);
    const newAmount = calculateIncrease(currentAmount, increaseType, value, rounding);
    const assignedCount = scale._count?.employees || 0;
    totalEmployeesUpdated += assignedCount;

    changes.push({
      id: scale.id,
      name: scale.name,
      oldAmount: currentAmount,
      newAmount,
      assignedEmployeesCount: assignedCount,
    });

    // 1. Actualizar nómina
    operations.push(
      tenantPrisma.salaryScale.update({
        where: { id: scale.id },
        data: { amount: newAmount },
      })
    );

    // 2. Sincronizar empleados vinculados a esta nómina
    operations.push(
      tenantPrisma.employee.updateMany({
        where: { salaryScaleId: scale.id, deletedAt: null },
        data: { basicSalary: newAmount },
      })
    );
  }

  await tenantPrisma.$transaction(operations);

  return {
    increaseType,
    value: Number(value),
    updatedScalesCount: scales.length,
    totalScalesUpdated: scales.length,
    totalEmployeesUpdated,
    changes,
  };
}
