import crypto from 'crypto';
import { ensureTenantPersonnelSchema } from '../../services/tenantProvisioner.service.js';

/**
 * Lista las jornadas de trabajo registradas en la empresa con soporte de búsqueda y conteo de empleados asignados.
 */
export async function listWorkShifts(tenantPrisma, query = {}) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const { page = 1, limit = 50, search = '', cycleType = 'ALL', isActive } = query;
  const skip = (Number(page) - 1) * Number(limit);

  const where = {
    deletedAt: null,
  };

  if (search && search.trim() !== '') {
    const s = search.trim();
    where.OR = [
      { name: { contains: s } },
      { code: { contains: s } },
      { description: { contains: s } },
    ];
  }

  if (cycleType && cycleType !== 'ALL') {
    where.cycleType = cycleType;
  }

  if (isActive !== undefined && isActive !== 'ALL') {
    where.isActive = String(isActive) === 'true' || isActive === true;
  }

  const [shifts, total] = await Promise.all([
    tenantPrisma.workShift.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: [{ name: 'asc' }],
      include: {
        _count: {
          select: {
            employees: {
              where: { deletedAt: null },
            },
          },
        },
      },
    }),
    tenantPrisma.workShift.count({ where }),
  ]);

  const formattedShifts = shifts.map((s) => ({
    ...s,
    dailyHours: Number(s.dailyHours || 0),
    weeklyHours: Number(s.weeklyHours || 0),
    monthlyHours: Number(s.monthlyHours || 0),
    monthlyDays: Number(s.monthlyDays || 0),
    percentage: Number(s.percentage !== undefined && s.percentage !== null ? s.percentage : 100.00),
    employeeCount: s._count?.employees || 0,
    assignedEmployeesCount: s._count?.employees || 0,
  }));

  return {
    data: formattedShifts,
    meta: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)) || 1,
    },
  };
}

/**
 * Obtiene el detalle completo de una jornada de trabajo con su diagrama de horarios.
 */
export async function getWorkShiftById(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const shift = await tenantPrisma.workShift.findFirst({
    where: { id, deletedAt: null },
    include: {
      details: {
        orderBy: [
          { dayOfWeek: 'asc' },
          { cycleDayNumber: 'asc' },
        ],
      },
      _count: {
        select: {
          employees: {
            where: { deletedAt: null },
          },
        },
      },
    },
  });

  if (!shift) {
    const err = new Error('Jornada de trabajo no encontrada');
    err.status = 404;
    throw err;
  }

  return {
    ...shift,
    dailyHours: Number(shift.dailyHours || 0),
    weeklyHours: Number(shift.weeklyHours || 0),
    monthlyHours: Number(shift.monthlyHours || 0),
    monthlyDays: Number(shift.monthlyDays || 0),
    percentage: Number(shift.percentage !== undefined && shift.percentage !== null ? shift.percentage : 100.00),
    employeeCount: shift._count?.employees || 0,
    assignedEmployeesCount: shift._count?.employees || 0,
    details: (shift.details || []).map((d) => ({
      ...d,
      netHours: Number(d.netHours || 0),
    })),
  };
}

/**
 * Crea una nueva jornada de trabajo junto con su diagrama de horarios en una transacción atómica.
 */
export async function createWorkShift(tenantPrisma, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const { details = [], ...headerData } = data;

  const newShift = await tenantPrisma.$transaction(async (tx) => {
    const shift = await tx.workShift.create({
      data: {
        name: headerData.name.trim(),
        code: headerData.code ? headerData.code.trim() : null,
        description: headerData.description ? headerData.description.trim() : null,
        cycleType: headerData.cycleType || 'SEMANAL',
        dailyHours: Number(headerData.dailyHours || 8.00),
        weeklyHours: Number(headerData.weeklyHours || 48.00),
        monthlyHours: Number(headerData.monthlyHours || 200.00),
        monthlyDays: Number(headerData.monthlyDays || 30.00),
        percentage: Number(headerData.percentage !== undefined && headerData.percentage !== null ? headerData.percentage : 100.00),
        isActive: headerData.isActive !== false,
      },
    });

    if (Array.isArray(details) && details.length > 0) {
      const detailsData = details.map((d) => ({
        id: crypto.randomUUID(),
        workShiftId: shift.id,
        dayOfWeek: d.dayOfWeek !== undefined && d.dayOfWeek !== null ? Number(d.dayOfWeek) : null,
        cycleDayNumber: d.cycleDayNumber !== undefined && d.cycleDayNumber !== null ? Number(d.cycleDayNumber) : null,
        dayName: d.dayName ? String(d.dayName).trim() : null,
        isWorkDay: d.isWorkDay !== false,
        startTime: d.startTime ? String(d.startTime).trim() : null,
        endTime: d.endTime ? String(d.endTime).trim() : null,
        crossesMidnight: d.crossesMidnight === true,
        breakMinutes: Number(d.breakMinutes || 0),
        netHours: Number(d.netHours || 0),
        notes: d.notes ? String(d.notes).trim() : null,
      }));

      await tx.workShiftDetail.createMany({
        data: detailsData,
      });
    }

    return shift;
  });

  return getWorkShiftById(tenantPrisma, newShift.id);
}

/**
 * Actualiza una jornada de trabajo y su diagrama de horarios de forma atómica.
 */
export async function updateWorkShift(tenantPrisma, id, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const existing = await tenantPrisma.workShift.findFirst({
    where: { id, deletedAt: null },
  });

  if (!existing) {
    const err = new Error('Jornada de trabajo no encontrada');
    err.status = 404;
    throw err;
  }

  const { details, ...headerData } = data;

  await tenantPrisma.$transaction(async (tx) => {
    const updatePayload = {};
    if (headerData.name !== undefined) updatePayload.name = headerData.name.trim();
    if (headerData.code !== undefined) updatePayload.code = headerData.code ? headerData.code.trim() : null;
    if (headerData.description !== undefined) updatePayload.description = headerData.description ? headerData.description.trim() : null;
    if (headerData.cycleType !== undefined) updatePayload.cycleType = headerData.cycleType;
    if (headerData.dailyHours !== undefined) updatePayload.dailyHours = Number(headerData.dailyHours);
    if (headerData.weeklyHours !== undefined) updatePayload.weeklyHours = Number(headerData.weeklyHours);
    if (headerData.monthlyHours !== undefined) updatePayload.monthlyHours = Number(headerData.monthlyHours);
    if (headerData.monthlyDays !== undefined) updatePayload.monthlyDays = Number(headerData.monthlyDays);
    if (headerData.percentage !== undefined) updatePayload.percentage = Number(headerData.percentage);
    if (headerData.isActive !== undefined) updatePayload.isActive = Boolean(headerData.isActive);

    if (Object.keys(updatePayload).length > 0) {
      await tx.workShift.update({
        where: { id },
        data: updatePayload,
      });
    }

    // Si se enviaron detalles, reemplazar los anteriores con la nueva definición
    if (Array.isArray(details)) {
      await tx.workShiftDetail.deleteMany({
        where: { workShiftId: id },
      });

      if (details.length > 0) {
        const detailsData = details.map((d) => ({
          id: crypto.randomUUID(),
          workShiftId: id,
          dayOfWeek: d.dayOfWeek !== undefined && d.dayOfWeek !== null ? Number(d.dayOfWeek) : null,
          cycleDayNumber: d.cycleDayNumber !== undefined && d.cycleDayNumber !== null ? Number(d.cycleDayNumber) : null,
          dayName: d.dayName ? String(d.dayName).trim() : null,
          isWorkDay: d.isWorkDay !== false,
          startTime: d.startTime ? String(d.startTime).trim() : null,
          endTime: d.endTime ? String(d.endTime).trim() : null,
          crossesMidnight: d.crossesMidnight === true,
          breakMinutes: Number(d.breakMinutes || 0),
          netHours: Number(d.netHours || 0),
          notes: d.notes ? String(d.notes).trim() : null,
        }));

        await tx.workShiftDetail.createMany({
          data: detailsData,
        });
      }
    }
  });

  return getWorkShiftById(tenantPrisma, id);
}

/**
 * Elimina lógicamente una jornada de trabajo con verificación de integridad referencial.
 * Si tiene empleados activos asignados, bloquea la acción para preservar consistencia.
 */
export async function deleteWorkShift(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const existing = await tenantPrisma.workShift.findFirst({
    where: { id, deletedAt: null },
  });

  if (!existing) {
    const err = new Error('Jornada de trabajo no encontrada');
    err.status = 404;
    throw err;
  }

  // Verificar si hay empleados activos asociados a esta jornada
  const activeAssignedEmployees = await tenantPrisma.employee.count({
    where: {
      workShiftId: id,
      deletedAt: null,
      status: 'ACTIVE',
    },
  });

  if (activeAssignedEmployees > 0) {
    const err = new Error(
      `No es posible eliminar la jornada "${existing.name}" porque se encuentra asignada a ${activeAssignedEmployees} colaborador(es) activo(s). Por favor, reasigne a los colaboradores a otra jornada activa antes de eliminarla.`
    );
    err.status = 400;
    throw err;
  }

  await tenantPrisma.workShift.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  });

  return { message: `Jornada "${existing.name}" eliminada correctamente` };
}
