import crypto from 'crypto';
import { ensureTenantPersonnelSchema } from '../../services/tenantProvisioner.service.js';
import {
  assertMasterArcaCctExists,
  hydrateSalaryScale,
  hydrateSalaryScales,
} from '../../services/arcaCatalog.service.js';
import {
  extractScalePeriodYearMonth,
  resolveSalaryScaleAmountForPeriod,
} from './payroll.calculator.js';

/**
 * Determina el período de referencia vigente:
 * - Si se pasa year/month explícitos, usa ese período.
 * - Caso contrario, usa el período fiscal OPEN más reciente.
 * - Si no hay ningún período OPEN, usa la fecha actual del servidor.
 */
export async function resolveEffectiveScaleReferencePeriod(tenantPrisma, { year, month } = {}) {
  if (year && month) {
    const y = Number(year);
    const m = Number(month);
    return {
      year: y,
      month: m,
      ym: y * 100 + m,
      source: 'EXPLICIT_PERIOD',
      fiscalPeriodId: null,
    };
  }

  const activeFiscal = tenantPrisma.payrollFiscalPeriod?.findFirst
    ? await tenantPrisma.payrollFiscalPeriod.findFirst({
        where: { status: 'OPEN' },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      })
    : null;

  if (activeFiscal) {
    const y = Number(activeFiscal.year);
    const m = Number(activeFiscal.month);
    return {
      year: y,
      month: m,
      ym: y * 100 + m,
      source: 'OPEN_FISCAL_PERIOD',
      fiscalPeriodId: activeFiscal.id,
    };
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return {
    year: y,
    month: m,
    ym: y * 100 + m,
    source: 'CURRENT_DATE',
    fiscalPeriodId: null,
  };
}

/**
 * Obtiene el conjunto de períodos Año-Mes (YYYYMM) cerrados formalmente en la empresa.
 */
async function getClosedYearMonthSet(tenantPrisma) {
  const closedYMSet = new Set();

  const [closedFiscalPeriods, closingAudits, closedPayrollPeriods, openFiscalPeriods] = await Promise.all([
    tenantPrisma.payrollFiscalPeriod?.findMany
      ? tenantPrisma.payrollFiscalPeriod.findMany({
          where: { status: 'CLOSED' },
          include: {
            settlements: { select: { id: true } },
          },
        })
      : Promise.resolve([]),
    tenantPrisma.payrollClosingAudit?.findMany
      ? tenantPrisma.payrollClosingAudit.findMany({
          where: { scope: 'FISCAL_PERIOD' },
          select: { fiscalPeriodId: true, year: true, month: true },
        })
      : Promise.resolve([]),
    tenantPrisma.payrollPeriod?.findMany
      ? tenantPrisma.payrollPeriod.findMany({
          where: { status: 'CLOSED' },
          select: { year: true, month: true },
        })
      : Promise.resolve([]),
    tenantPrisma.payrollFiscalPeriod?.findMany
      ? tenantPrisma.payrollFiscalPeriod.findMany({
          where: { status: 'OPEN' },
          select: { year: true, month: true },
        })
      : Promise.resolve([]),
  ]);

  const openYMSet = new Set(openFiscalPeriods.map((fp) => Number(fp.year) * 100 + Number(fp.month)));
  const auditedKeys = new Set();
  for (const audit of closingAudits || []) {
    if (audit.fiscalPeriodId) auditedKeys.add(audit.fiscalPeriodId);
    if (audit.year && audit.month) auditedKeys.add(`${audit.year}-${audit.month}`);
  }

  for (const fp of closedFiscalPeriods || []) {
    const hasAudit = auditedKeys.has(fp.id) || auditedKeys.has(`${fp.year}-${fp.month}`);
    const hasSettlements = (fp.settlements?.length || 0) > 0;
    // Ignorar registros CLOSED huérfanos sin liquidaciones, sin closedBy y sin acta
    if (hasSettlements || fp.closedBy || hasAudit) {
      closedYMSet.add(Number(fp.year) * 100 + Number(fp.month));
    }
  }

  for (const pp of closedPayrollPeriods || []) {
    const ym = Number(pp.year) * 100 + Number(pp.month);
    if (!openYMSet.has(ym)) {
      closedYMSet.add(ym);
    }
  }

  return closedYMSet;
}

function isRangeFullyClosed(fromYM, toYM, closedYMSet) {
  if (!fromYM || !toYM || fromYM > toYM || closedYMSet.size === 0) return false;
  let y = Math.floor(fromYM / 100);
  let m = fromYM % 100;
  const endY = Math.floor(toYM / 100);
  const endM = toYM % 100;
  let guard = 0;

  while ((y < endY || (y === endY && m <= endM)) && guard < 120) {
    if (!closedYMSet.has(y * 100 + m)) {
      return false;
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return guard > 0;
}

function enrichScalePeriodStatus(period, refYM, closedYMSet) {
  const fromInfo = extractScalePeriodYearMonth(period.validFrom);
  const toInfo = extractScalePeriodYearMonth(period.validTo);
  const fromYM = fromInfo?.ym || 0;
  const toYM = toInfo?.ym || 0;

  const isClosedPeriod = Boolean(
    fromYM &&
      toYM &&
      ((toYM < refYM && !(fromYM <= refYM && refYM <= toYM)) || isRangeFullyClosed(fromYM, toYM, closedYMSet))
  );
  const isCurrentPeriod = !isClosedPeriod && Boolean(fromYM && toYM && fromYM <= refYM && refYM <= toYM);
  const isFuturePeriod = !isClosedPeriod && Boolean(fromYM && fromYM > refYM);

  return {
    id: period.id,
    validFrom: period.validFrom,
    validTo: period.validTo,
    fromYM,
    toYM,
    amount: Number(period.amount),
    increaseType: period.increaseType,
    increaseValue: period.increaseValue !== null && period.increaseValue !== undefined ? Number(period.increaseValue) : null,
    rounding: period.rounding,
    isClosedPeriod,
    isCurrentPeriod,
    isFuturePeriod,
    periodStatus: isClosedPeriod ? 'CLOSED' : (isCurrentPeriod ? 'CURRENT' : 'FUTURE'),
  };
}

/**
 * Valida opcionalmente que los colaboradores activos cuenten con una nómina asignada y con vigencia
 * cargada para el período indicado, y sincroniza `salary_scales.amount` y `employees.basic_salary`
 * con el básico vigente del período de referencia (período fiscal OPEN o fecha actual).
 */
export async function validateAndSyncSalaryScalesForPeriod(
  tenantPrisma,
  { year, month, requireExplicitPeriodMatch = false } = {}
) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  if (!tenantPrisma.salaryScale?.findMany || !tenantPrisma.employee?.findMany) {
    return { syncedScales: 0, syncedEmployees: 0, skipped: true };
  }

  const refPeriod = await resolveEffectiveScaleReferencePeriod(tenantPrisma, { year, month });
  const targetYM = refPeriod.ym;
  const mm = String(refPeriod.month).padStart(2, '0');

  const [scales, activeEmployees] = await Promise.all([
    tenantPrisma.salaryScale.findMany({
      where: { deletedAt: null },
      include: {
        periods: {
          orderBy: { validFrom: 'asc' },
        },
      },
      orderBy: [{ name: 'asc' }],
    }),
    tenantPrisma.employee.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: {
        id: true,
        fileNumber: true,
        firstName: true,
        lastName: true,
        salaryScaleId: true,
        basicSalary: true,
      },
    }),
  ]);

  const validScaleIds = new Set(scales.map((s) => s.id));
  const activeCountByScaleId = new Map();
  for (const emp of activeEmployees) {
    if (emp.salaryScaleId && validScaleIds.has(emp.salaryScaleId)) {
      activeCountByScaleId.set(emp.salaryScaleId, (activeCountByScaleId.get(emp.salaryScaleId) || 0) + 1);
    }
  }

  if (requireExplicitPeriodMatch) {
    if (scales.length === 0) {
      const err = new Error(
        `No se puede habilitar el período ${mm}/${refPeriod.year} porque no existen nóminas de sueldo básico configuradas en la empresa. Registre al menos una nómina en Sueldos → Nómina (Sueldos Básicos).`
      );
      err.status = 400;
      throw err;
    }

    const employeesWithoutScale = activeEmployees.filter(
      (e) => !e.salaryScaleId || !validScaleIds.has(e.salaryScaleId)
    );
    if (employeesWithoutScale.length > 0) {
      const sample = employeesWithoutScale
        .slice(0, 5)
        .map((e) => `Leg. ${e.fileNumber || '-'} (${e.lastName || ''}, ${e.firstName || ''})`)
        .join(', ');
      const extra = employeesWithoutScale.length > 5 ? ` y ${employeesWithoutScale.length - 5} más` : '';
      const err = new Error(
        `No se puede habilitar el período ${mm}/${refPeriod.year} porque ${employeesWithoutScale.length} colaborador(es) activo(s) no tienen una nómina asignada para el período de la liquidación (${sample}${extra}). Asigne una nómina en Personal antes de abrir el período.`
      );
      err.status = 400;
      throw err;
    }

    // Validar que las nóminas activas que utilizan tramos por vigencia tengan asignado un tramo para el período que se abre
    const scalesWithPeriodsMissingTarget = scales.filter((scale) => {
      const hasPeriods = Array.isArray(scale.periods) && scale.periods.length > 0;
      const activeAssigned = activeCountByScaleId.get(scale.id) || 0;
      if (!hasPeriods || activeAssigned === 0) return false;
      return !scale.periods.some((p) => {
        const f = extractScalePeriodYearMonth(p.validFrom);
        const t = extractScalePeriodYearMonth(p.validTo);
        return f && t && f.ym <= targetYM && targetYM <= t.ym;
      });
    });

    if (scalesWithPeriodsMissingTarget.length > 0) {
      const sample = scalesWithPeriodsMissingTarget
        .slice(0, 5)
        .map((s) => `${s.name}${s.cctCode ? ` [CCT ${s.cctCode}]` : ''}`)
        .join(', ');
      const extra =
        scalesWithPeriodsMissingTarget.length > 5
          ? ` y ${scalesWithPeriodsMissingTarget.length - 5} más`
          : '';
      const err = new Error(
        `No se puede habilitar el período ${mm}/${refPeriod.year} porque ${scalesWithPeriodsMissingTarget.length} nómina(s) con escalas por período no tienen vigencia salarial cargada para ${mm}/${refPeriod.year} (${sample}${extra}). Cargue el tramo correspondiente en Sueldos → Nómina (Sueldos Básicos) → Actualización Masiva.`
      );
      err.status = 400;
      throw err;
    }
  }

  let syncedScales = 0;
  let syncedEmployees = 0;
  const syncOps = [];

  for (const scale of scales) {
    const effectiveAmount = resolveSalaryScaleAmountForPeriod(scale, refPeriod.year, refPeriod.month);
    const nominalAmount = Number(scale.amount || 0);
    const scaleNeedsUpdate = Math.abs(nominalAmount - effectiveAmount) > 0.009;
    const hasOutdatedEmployees = activeEmployees.some(
      (e) => e.salaryScaleId === scale.id && Math.abs(Number(e.basicSalary || 0) - effectiveAmount) > 0.009
    );

    if (scaleNeedsUpdate) {
      syncedScales += 1;
      syncOps.push(
        tenantPrisma.salaryScale.update({
          where: { id: scale.id },
          data: { amount: effectiveAmount },
        })
      );
    }

    if (scaleNeedsUpdate || hasOutdatedEmployees) {
      syncedEmployees += activeEmployees.filter(
        (e) => e.salaryScaleId === scale.id && Math.abs(Number(e.basicSalary || 0) - effectiveAmount) > 0.009
      ).length;
      syncOps.push(
        tenantPrisma.employee.updateMany({
          where: { salaryScaleId: scale.id, deletedAt: null },
          data: { basicSalary: effectiveAmount },
        })
      );
    }
  }

  if (syncOps.length > 0) {
    await Promise.all(syncOps);
  }

  return {
    referencePeriod: refPeriod,
    syncedScales,
    syncedEmployees,
  };
}

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

  // Sincronizar en BD cualquier desfasaje respecto al período fiscal abierto (o fecha actual)
  await validateAndSyncSalaryScalesForPeriod(tenantPrisma, { requireExplicitPeriodMatch: false });

  const where = buildSalaryScaleWhere({ search, cctCode, isInternOnly, isDirectorOnly });

  const [rawScales, refPeriod, closedYMSet] = await Promise.all([
    tenantPrisma.salaryScale.findMany({
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
    }),
    resolveEffectiveScaleReferencePeriod(tenantPrisma),
    getClosedYearMonthSet(tenantPrisma),
  ]);

  const scales = await hydrateSalaryScales(rawScales);

  return scales.map((scale) => {
    const effectiveAmount = resolveSalaryScaleAmountForPeriod(scale, refPeriod.year, refPeriod.month);
    const nominalAmount = Number(scale.amount);
    const enrichedPeriods = (scale.periods || []).map((p) => enrichScalePeriodStatus(p, refPeriod.ym, closedYMSet));
    const visiblePeriods = enrichedPeriods.filter((p) => !p.isClosedPeriod);

    return {
      id: scale.id,
      name: scale.name,
      code: scale.code,
      cctCode: scale.cctCode || null,
      cct: scale.cct || null,
      description: scale.description,
      amount: effectiveAmount,
      nominalAmount,
      referencePeriod: refPeriod,
      isInternOnly: Boolean(scale.isInternOnly),
      isDirectorOnly: Boolean(scale.isDirectorOnly),
      assignedEmployeesCount: scale._count?.employees || 0,
      employeesCount: scale._count?.employees || 0,
      _count: scale._count,
      periods: enrichedPeriods,
      visiblePeriods,
      createdAt: scale.createdAt,
      updatedAt: scale.updatedAt,
    };
  });
}

/**
 * Obtiene el detalle de una nómina por ID.
 */
export async function getSalaryScaleById(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const [rawScale, refPeriod, closedYMSet] = await Promise.all([
    tenantPrisma.salaryScale.findFirst({
      where: { id, deletedAt: null },
      include: {
        periods: {
          orderBy: { validFrom: 'asc' },
        },
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
    }),
    resolveEffectiveScaleReferencePeriod(tenantPrisma),
    getClosedYearMonthSet(tenantPrisma),
  ]);

  if (!rawScale) {
    const err = new Error('Nómina no encontrada');
    err.status = 404;
    throw err;
  }

  const scale = await hydrateSalaryScale(rawScale);
  const effectiveAmount = resolveSalaryScaleAmountForPeriod(scale, refPeriod.year, refPeriod.month);
  const enrichedPeriods = (scale.periods || []).map((p) => enrichScalePeriodStatus(p, refPeriod.ym, closedYMSet));

  return {
    ...scale,
    cctCode: scale.cctCode || null,
    cct: scale.cct || null,
    amount: effectiveAmount,
    nominalAmount: Number(scale.amount),
    referencePeriod: refPeriod,
    periods: enrichedPeriods,
    visiblePeriods: enrichedPeriods.filter((p) => !p.isClosedPeriod),
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

  const [rawScales, refPeriod] = await Promise.all([
    tenantPrisma.salaryScale.findMany({
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
    }),
    resolveEffectiveScaleReferencePeriod(tenantPrisma),
  ]);

  const scales = await hydrateSalaryScales(rawScales);

  let totalEmployeesAffected = 0;

  const preview = scales.map((scale) => {
    const currentAmount = resolveSalaryScaleAmountForPeriod(scale, refPeriod.year, refPeriod.month);
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
    referencePeriod: refPeriod,
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

  const [scales, refPeriod] = await Promise.all([
    tenantPrisma.salaryScale.findMany({
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
    }),
    resolveEffectiveScaleReferencePeriod(tenantPrisma),
  ]);

  if (scales.length === 0) {
    const err = new Error('No se encontraron nóminas que coincidan con el convenio laboral o selección indicada.');
    err.status = 400;
    throw err;
  }

  const refYM = refPeriod.ym;
  const batchId = crypto.randomUUID();

  const operations = [];
  const changes = [];
  let totalEmployeesUpdated = 0;

  for (const scale of scales) {
    const currentAmount = resolveSalaryScaleAmountForPeriod(scale, refPeriod.year, refPeriod.month);
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

    // Determinar cuál de los períodos informados aplica como básico nominal vigente del período fiscal abierto (o actual)
    let nominalTargetAmount = currentAmount;
    for (const pv of periodValues) {
      const f = extractScalePeriodYearMonth(pv.validFrom);
      const t = extractScalePeriodYearMonth(pv.validTo);
      if (f && t && f.ym <= refYM && refYM <= t.ym) {
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
