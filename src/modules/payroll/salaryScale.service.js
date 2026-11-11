import crypto from 'crypto';
import { ensureTenantPersonnelSchema } from '../../services/tenantProvisioner.service.js';
import {
  assertMasterArcaCctExists,
  hydrateSalaryScale,
  hydrateSalaryScales,
} from '../../services/arcaCatalog.service.js';

/**
 * Valida y normaliza el código de Convenio Colectivo (CCT) contra el catálogo MASTER de ARCA.
 */
async function resolveValidCctCode(rawCctCode) {
  return assertMasterArcaCctExists(rawCctCode);
}

/**
 * Construye el filtro Prisma compartido para consultas y actualizaciones masivas de nóminas.
 */
function buildSalaryScaleWhere({ search, cctCode, isInternOnly, isDirectorOnly, scaleIds } = {}) {
  const where = { deletedAt: null };
  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { name: { contains: term } },
      { code: { contains: term } },
      { cctCode: { contains: term } },
      { description: { contains: term } },
    ];
  }
  if (cctCode && String(cctCode).trim() !== '' && cctCode !== 'ALL') {
    const cleanCct = String(cctCode).trim();
    where.cctCode = cleanCct === 'NO_CCT' ? null : cleanCct;
  }
  if (isInternOnly !== undefined && isInternOnly !== null && isInternOnly !== '') {
    where.isInternOnly = isInternOnly === 'true' || isInternOnly === true;
  }
  if (isDirectorOnly !== undefined && isDirectorOnly !== null && isDirectorOnly !== '') {
    where.isDirectorOnly = isDirectorOnly === 'true' || isDirectorOnly === true;
  }
  if (Array.isArray(scaleIds)) {
    where.id = { in: scaleIds };
  }
  return where;
}

/**
 * Lista las nóminas / escalas salariales activas con conteo de colaboradores asignados.
 */
export async function listSalaryScales(tenantPrisma, { search, cctCode, isInternOnly, isDirectorOnly } = {}) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const where = buildSalaryScaleWhere({ search, cctCode, isInternOnly, isDirectorOnly });

  const rawScales = await tenantPrisma.salaryScale.findMany({
    where,
    include: {
      periods: {
        orderBy: { validFrom: 'asc' },
      },
      _count: {
        select: {
          employees: {
            where: { deletedAt: null, status: 'ACTIVE' },
          },
        },
      },
    },
    orderBy: [{ cctCode: 'asc' }, { amount: 'asc' }, { name: 'asc' }],
  });

  const scales = await hydrateSalaryScales(rawScales);

  return scales.map((scale) => ({
    id: scale.id,
    name: scale.name,
    code: scale.code,
    cctCode: scale.cctCode || null,
    cct: scale.cct || null,
    description: scale.description,
    amount: Number(scale.amount),
    isInternOnly: Boolean(scale.isInternOnly),
    isDirectorOnly: Boolean(scale.isDirectorOnly),
    assignedEmployeesCount: scale._count?.employees || 0,
    employeesCount: scale._count?.employees || 0,
    _count: scale._count,
    periods: (scale.periods || []).map((p) => ({
      id: p.id,
      validFrom: p.validFrom,
      validTo: p.validTo,
      amount: Number(p.amount),
      increaseType: p.increaseType,
      increaseValue: p.increaseValue !== null && p.increaseValue !== undefined ? Number(p.increaseValue) : null,
      rounding: p.rounding,
    })),
    createdAt: scale.createdAt,
    updatedAt: scale.updatedAt,
  }));
}

/**
 * Obtiene el detalle de una nómina por ID.
 */
export async function getSalaryScaleById(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const rawScale = await tenantPrisma.salaryScale.findFirst({
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

  if (!rawScale) {
    const err = new Error('Nómina no encontrada');
    err.status = 404;
    throw err;
  }

  const scale = await hydrateSalaryScale(rawScale);

  return {
    ...scale,
    cctCode: scale.cctCode || null,
    cct: scale.cct || null,
    amount: Number(scale.amount),
    isInternOnly: Boolean(scale.isInternOnly),
    isDirectorOnly: Boolean(scale.isDirectorOnly),
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

  const cctCode = await resolveValidCctCode(data.cctCode);

  const rawScale = await tenantPrisma.salaryScale.create({
    data: {
      name: data.name.trim(),
      code: data.code?.trim() || null,
      cctCode: cctCode ?? null,
      description: data.description?.trim() || null,
      amount: Number(data.amount),
      isInternOnly: Boolean(data.isInternOnly),
      isDirectorOnly: Boolean(data.isDirectorOnly),
    },
  });

  const scale = await hydrateSalaryScale(rawScale);

  return {
    ...scale,
    cctCode: scale.cctCode || null,
    cct: scale.cct || null,
    amount: Number(scale.amount),
    isInternOnly: Boolean(scale.isInternOnly),
    isDirectorOnly: Boolean(scale.isDirectorOnly),
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

  const cctCode = await resolveValidCctCode(data.cctCode);

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.code !== undefined) updateData.code = data.code ? data.code.trim() : null;
  if (cctCode !== undefined) updateData.cctCode = cctCode;
  if (data.description !== undefined) updateData.description = data.description ? data.description.trim() : null;
  if (data.amount !== undefined) updateData.amount = Number(data.amount);
  if (data.isInternOnly !== undefined) updateData.isInternOnly = Boolean(data.isInternOnly);
  if (data.isDirectorOnly !== undefined) updateData.isDirectorOnly = Boolean(data.isDirectorOnly);

  const rawUpdated = await tenantPrisma.salaryScale.update({
    where: { id },
    data: updateData,
  });

  const updated = await hydrateSalaryScale(rawUpdated);

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
    cctCode: updated.cctCode || null,
    cct: updated.cct || null,
    amount: Number(updated.amount),
    isInternOnly: Boolean(updated.isInternOnly),
    isDirectorOnly: Boolean(updated.isDirectorOnly),
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
 * @param {number} previousAmount - Básico acumulado hasta el tramo anterior
 * @param {string} increaseType - 'PERCENTAGE' | 'FIXED_AMOUNT'
 * @param {number} value - Porcentaje o monto fijo
 * @param {string} rounding - 'DECIMAL_2' | 'INTEGER' | 'NONE'
 * @param {number} referenceBaseAmount - Base sobre la cual se calcula el porcentaje (período actual inicial o período anterior)
 */
function calculateIncrease(previousAmount, increaseType, value, rounding, referenceBaseAmount = previousAmount) {
  const prev = Number(previousAmount) || 0;
  const refBase = Number(referenceBaseAmount !== undefined && referenceBaseAmount !== null ? referenceBaseAmount : prev) || 0;
  const numVal = Number(value);
  let newAmount = 0;

  if (increaseType === 'PERCENTAGE') {
    const delta = refBase * (numVal / 100);
    newAmount = prev + delta;
  } else {
    newAmount = prev + numVal;
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
 * Normaliza los lotes/períodos de aumento masivo y los ordena cronológicamente por Fecha desde.
 */
function normalizeMassIncreasePeriods(options = {}) {
  const rawList = Array.isArray(options.periods) && options.periods.length > 0
    ? options.periods
    : [
        {
          validFrom: options.validFrom || new Date().toISOString().slice(0, 10),
          validTo: options.validTo || new Date().toISOString().slice(0, 10),
          increaseType: options.increaseType || 'PERCENTAGE',
          calculationBase: options.calculationBase || 'CURRENT_BASE',
          value: Number(options.value || 0),
          rounding: options.rounding || 'DECIMAL_2',
        },
      ];

  return rawList
    .map((p) => ({
      validFrom: String(p.validFrom).slice(0, 10),
      validTo: String(p.validTo).slice(0, 10),
      increaseType: p.increaseType || 'PERCENTAGE',
      calculationBase: p.calculationBase === 'PREVIOUS_PERIOD' ? 'PREVIOUS_PERIOD' : 'CURRENT_BASE',
      value: Number(p.value),
      rounding: p.rounding || 'DECIMAL_2',
    }))
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
}

function parseLocalDateNoon(isoDateStr) {
  const [y, m, d] = String(isoDateStr).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

/**
 * Previsualiza el aumento masivo de nóminas (soportando múltiples períodos/tramos) sin guardar cambios.
 */
export async function previewMassScaleIncrease(tenantPrisma, options) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const normalizedPeriods = normalizeMassIncreasePeriods(options);
  const { scaleIds, cctCode } = options;

  const where = buildSalaryScaleWhere({ cctCode, scaleIds });

  const rawScales = await tenantPrisma.salaryScale.findMany({
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
    orderBy: [{ cctCode: 'asc' }, { amount: 'asc' }, { name: 'asc' }],
  });

  const scales = await hydrateSalaryScales(rawScales);

  let totalEmployeesAffected = 0;

  const preview = scales.map((scale) => {
    const currentAmount = Number(scale.amount);
    let runningAmount = currentAmount;
    const periodValues = normalizedPeriods.map((periodDef, idx) => {
      const previousPeriodAmount = runningAmount;
      const effectiveCalcBase = idx === 0 ? 'CURRENT_BASE' : (periodDef.calculationBase || 'CURRENT_BASE');
      const referenceBaseAmount = effectiveCalcBase === 'PREVIOUS_PERIOD' ? previousPeriodAmount : currentAmount;
      const newAmount = calculateIncrease(
        previousPeriodAmount,
        periodDef.increaseType,
        periodDef.value,
        periodDef.rounding,
        referenceBaseAmount
      );
      const difference = Math.round((newAmount - previousPeriodAmount) * 100) / 100;
      const cumulativeDifference = Math.round((newAmount - currentAmount) * 100) / 100;
      runningAmount = newAmount;

      return {
        periodIndex: idx + 1,
        validFrom: periodDef.validFrom,
        validTo: periodDef.validTo,
        increaseType: periodDef.increaseType,
        calculationBase: effectiveCalcBase,
        value: periodDef.value,
        rounding: periodDef.rounding,
        baseAmount: referenceBaseAmount,
        previousPeriodAmount,
        newAmount,
        difference,
        cumulativeDifference,
      };
    });

    const lastPeriod = periodValues[periodValues.length - 1] || {
      newAmount: currentAmount,
      difference: 0,
    };

    const assignedCount = scale._count?.employees || 0;
    totalEmployeesAffected += assignedCount;

    return {
      id: scale.id,
      name: scale.name,
      code: scale.code,
      cctCode: scale.cctCode || null,
      cct: scale.cct ? { code: scale.cct.code, name: scale.cct.name, sector: scale.cct.sector || null } : null,
      currentAmount,
      newAmount: lastPeriod.newAmount,
      difference: lastPeriod.difference,
      periodValues,
      assignedEmployeesCount: assignedCount,
    };
  });

  const firstPeriod = normalizedPeriods[0] || {};

  return {
    cctCode: cctCode || 'ALL',
    increaseType: firstPeriod.increaseType,
    value: firstPeriod.value,
    rounding: firstPeriod.rounding,
    periods: normalizedPeriods,
    totalScales: scales.length,
    totalEmployeesAffected,
    preview,
  };
}

/**
 * Aplica en transacción el aumento masivo multi-período a las nóminas, guarda las vigencias en salary_scale_periods
 * y sincroniza el sueldo básico nominal de las nóminas y empleados según el período fiscal abierto.
 */
export async function applyMassScaleIncrease(tenantPrisma, options) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const normalizedPeriods = normalizeMassIncreasePeriods(options);
  const { scaleIds, cctCode } = options;

  const where = buildSalaryScaleWhere({ cctCode, scaleIds });

  const [scales, activeFiscal] = await Promise.all([
    tenantPrisma.salaryScale.findMany({
      where,
      include: {
        periods: true,
        _count: {
          select: {
            employees: {
              where: { deletedAt: null, status: 'ACTIVE' },
            },
          },
        },
      },
    }),
    tenantPrisma.payrollFiscalPeriod.findFirst({
      where: { status: 'OPEN' },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    }),
  ]);

  if (scales.length === 0) {
    const err = new Error('No se encontraron nóminas que coincidan con el convenio laboral o selección indicada.');
    err.status = 400;
    throw err;
  }

  const now = new Date();
  const refYear = activeFiscal ? Number(activeFiscal.year) : now.getFullYear();
  const refMonth = activeFiscal ? Number(activeFiscal.month) : now.getMonth() + 1;
  const refYM = refYear * 100 + refMonth;
  const batchId = crypto.randomUUID();

  const operations = [];
  const changes = [];
  let totalEmployeesUpdated = 0;

  for (const scale of scales) {
    const currentAmount = Number(scale.amount);
    let runningAmount = currentAmount;
    const assignedCount = scale._count?.employees || 0;
    totalEmployeesUpdated += assignedCount;

    const periodValues = normalizedPeriods.map((periodDef, idx) => {
      const previousPeriodAmount = runningAmount;
      const effectiveCalcBase = idx === 0 ? 'CURRENT_BASE' : (periodDef.calculationBase || 'CURRENT_BASE');
      const referenceBaseAmount = effectiveCalcBase === 'PREVIOUS_PERIOD' ? previousPeriodAmount : currentAmount;
      const newAmount = calculateIncrease(
        previousPeriodAmount,
        periodDef.increaseType,
        periodDef.value,
        periodDef.rounding,
        referenceBaseAmount
      );
      const difference = Math.round((newAmount - previousPeriodAmount) * 100) / 100;
      runningAmount = newAmount;

      return {
        periodIndex: idx + 1,
        validFrom: periodDef.validFrom,
        validTo: periodDef.validTo,
        increaseType: periodDef.increaseType,
        calculationBase: effectiveCalcBase,
        value: periodDef.value,
        rounding: periodDef.rounding,
        baseAmount: referenceBaseAmount,
        previousPeriodAmount,
        newAmount,
        difference,
      };
    });

    // Determinar cuál de los períodos informados aplica como básico nominal vigente del período fiscal abierto
    let nominalTargetAmount = periodValues[0]?.newAmount ?? currentAmount;
    for (const pv of periodValues) {
      const [fy, fm] = pv.validFrom.split('-').map(Number);
      const [ty, tm] = pv.validTo.split('-').map(Number);
      const fromYM = fy * 100 + fm;
      const toYM = ty * 100 + tm;
      if (fromYM <= refYM && refYM <= toYM) {
        nominalTargetAmount = pv.newAmount;
        break;
      }
    }

    changes.push({
      id: scale.id,
      name: scale.name,
      cctCode: scale.cctCode || null,
      oldAmount: currentAmount,
      newAmount: nominalTargetAmount,
      periodValues,
      assignedEmployeesCount: assignedCount,
    });

    // 1. Guardar vigencias en salary_scale_periods (reemplazando solapamientos previos para la misma nómina)
    for (const pv of periodValues) {
      const fromDate = parseLocalDateNoon(pv.validFrom);
      const toDate = parseLocalDateNoon(pv.validTo);
      const startWindow = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 0, 0, 0, 0);
      const endWindow = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999);

      operations.push(
        tenantPrisma.salaryScalePeriod.deleteMany({
          where: {
            salaryScaleId: scale.id,
            validFrom: { lte: endWindow },
            validTo: { gte: startWindow },
          },
        })
      );

      operations.push(
        tenantPrisma.salaryScalePeriod.create({
          data: {
            id: crypto.randomUUID(),
            salaryScaleId: scale.id,
            validFrom: fromDate,
            validTo: toDate,
            amount: pv.newAmount,
            increaseType: pv.increaseType,
            increaseValue: pv.value,
            rounding: pv.rounding,
            batchId,
          },
        })
      );
    }

    // 2. Actualizar básico nominal de referencia en la nómina
    operations.push(
      tenantPrisma.salaryScale.update({
        where: { id: scale.id },
        data: { amount: nominalTargetAmount },
      })
    );

    // 3. Sincronizar empleados vinculados a esta nómina con el básico vigente del período abierto
    operations.push(
      tenantPrisma.employee.updateMany({
        where: { salaryScaleId: scale.id, deletedAt: null },
        data: { basicSalary: nominalTargetAmount },
      })
    );
  }

  await tenantPrisma.$transaction(operations);

  const firstPeriod = normalizedPeriods[0] || {};

  return {
    cctCode: cctCode || 'ALL',
    increaseType: firstPeriod.increaseType,
    value: firstPeriod.value,
    periods: normalizedPeriods,
    periodsCount: normalizedPeriods.length,
    updatedScalesCount: scales.length,
    totalScalesUpdated: scales.length,
    totalEmployeesUpdated,
    changes,
  };
}
