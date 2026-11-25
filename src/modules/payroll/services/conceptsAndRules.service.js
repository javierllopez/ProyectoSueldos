import crypto from 'crypto';
import { ensureTenantPayrollSchema } from '../../../services/tenantProvisioner.service.js';
import {
  buildRetroactiveConceptsForType,
  buildStatutoryDeductionConceptsForType,
} from '../../../services/provisioner/defaultCatalogs.js';
import { validateConceptFormula } from '../formulaValidator.js';
import { hoursToDecimal, decimalToHours } from '../../../utils/timeFormat.js';

// --- TIPOS DE LIQUIDACIÓN (ABM) ---

const LEGACY_TYPE_ALIASES = {
  MENSUAL: 'MONTHLY',
  QUINCE: 'QUINCE_1',
  QUINCENA: 'QUINCE_1',
  SAC: 'SAC_1',
  AGUINALDO: 'SAC_1',
  VACACIONES: 'VACATIONS',
  LIQUIDACION_FINAL: 'FINAL',
  RETROACTIVO: 'RETROACTIVE',
};

export function resolveSettlementTypeLookupCode(periodType) {
  const upper = String(periodType || 'MONTHLY').trim().toUpperCase();
  return LEGACY_TYPE_ALIASES[upper] || upper;
}

export async function resolveSettlementTypeConfig(tenantPrisma, periodType) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const lookupCode = resolveSettlementTypeLookupCode(periodType);
  let st = await tenantPrisma.payrollSettlementType.findUnique({
    where: { code: lookupCode },
  });
  if (!st && lookupCode !== 'MONTHLY') {
    st = await tenantPrisma.payrollSettlementType.findUnique({
      where: { code: String(periodType || '').trim().toUpperCase() },
    });
  }
  return st;
}

export async function getSettlementTypeMap(tenantPrisma) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const types = await tenantPrisma.payrollSettlementType.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  const map = new Map();
  for (const t of types) {
    map.set(t.code, t);
  }
  for (const [alias, canonical] of Object.entries(LEGACY_TYPE_ALIASES)) {
    if (map.has(canonical) && !map.has(alias)) {
      map.set(alias, map.get(canonical));
    }
  }
  return map;
}

async function generateUniqueSettlementTypeCode(tenantPrisma, name, prefix) {
  const normalizedBase = String(name || prefix || 'CUSTOM')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || String(prefix || 'CUSTOM').toUpperCase();

  let candidate = normalizedBase;
  let counter = 2;
  while (await tenantPrisma.payrollSettlementType.findUnique({ where: { code: candidate }, select: { id: true } })) {
    candidate = `${normalizedBase.slice(0, 26)}_${counter}`;
    counter += 1;
  }
  return candidate;
}

export async function getSettlementTypes(tenantPrisma, { activeOnly = false } = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const where = {};
  if (activeOnly === true || activeOnly === 'true') {
    where.isActive = true;
  }

  const [types, conceptsByType, periodsByType] = await Promise.all([
    tenantPrisma.payrollSettlementType.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    tenantPrisma.concept.findMany({
      where: { deletedAt: null },
      select: { id: true, periodType: true, type: true, arcaConceptCode: true },
    }),
    tenantPrisma.payrollPeriod.groupBy({
      by: ['periodType'],
      _count: { id: true },
    }),
  ]);

  const periodCountMap = new Map(periodsByType.map((p) => [String(p.periodType).toUpperCase(), p._count.id]));
  const conceptStatsMap = new Map();

  for (const c of conceptsByType) {
    const key = resolveSettlementTypeLookupCode(c.periodType);
    const stat = conceptStatsMap.get(key) || { conceptsCount: 0, conceptsWithoutArcaCount: 0 };
    stat.conceptsCount += 1;
    const hasValidArca = Boolean(c.arcaConceptCode && String(c.arcaConceptCode).trim().length > 0);
    if (c.type !== 'AUXILIARY' && !hasValidArca) {
      stat.conceptsWithoutArcaCount += 1;
    }
    conceptStatsMap.set(key, stat);
  }

  return types.map((t) => {
    const stat = conceptStatsMap.get(t.code) || { conceptsCount: 0, conceptsWithoutArcaCount: 0 };
    return {
      ...t,
      conceptsCount: stat.conceptsCount,
      conceptsWithoutArcaCount: stat.conceptsWithoutArcaCount,
      periodsCount: periodCountMap.get(t.code) || 0,
    };
  });
}

async function seedRetroactiveCatalogForSettlementType(tenantPrisma, settlementType, { includeStatutory = true } = {}) {
  if (!settlementType?.code || !settlementType?.conceptPrefix) return { seededCodes: [] };
  const retroDefs = buildRetroactiveConceptsForType(settlementType.conceptPrefix, settlementType.code);
  const statutoryDefs =
    includeStatutory && settlementType.appliesStatutoryDeductions !== false
      ? buildStatutoryDeductionConceptsForType(settlementType.conceptPrefix, settlementType.code)
      : [];

  const candidateDefs = [...retroDefs, ...statutoryDefs];
  const existingConcepts = await tenantPrisma.concept.findMany({
    where: {
      OR: [
        { code: { in: candidateDefs.map((d) => d.code) } },
        { periodType: settlementType.code, type: 'DEDUCTION', deletedAt: null },
      ],
    },
    select: { code: true, type: true, periodType: true, deletedAt: true },
  });

  const existingCodes = new Set(existingConcepts.map((c) => String(c.code || '').toUpperCase()));
  const hasExistingDeductions = existingConcepts.some(
    (c) => c.deletedAt === null && c.periodType === settlementType.code && c.type === 'DEDUCTION'
  );

  const toCreate = candidateDefs.filter((d) => {
    if (existingCodes.has(d.code.toUpperCase())) return false;
    if (d.type === 'DEDUCTION' && hasExistingDeductions) return false;
    return true;
  });

  if (toCreate.length > 0 && tenantPrisma.concept?.createMany) {
    await tenantPrisma.concept.createMany({
      data: toCreate.map((d) => ({
        id: crypto.randomUUID(),
        ...d,
      })),
      skipDuplicates: true,
    });
  } else {
    for (const d of toCreate) {
      await tenantPrisma.concept.create({
        data: { id: crypto.randomUUID(), ...d },
      });
    }
  }

  return { seededCodes: toCreate.map((d) => d.code) };
}

export async function createSettlementType(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const name = String(data.name || '').trim();
  const conceptPrefix = String(data.conceptPrefix || '').trim().toUpperCase();
  let code = data.code ? String(data.code).trim().toUpperCase() : '';
  if (!code) {
    code = await generateUniqueSettlementTypeCode(tenantPrisma, name, conceptPrefix);
  } else {
    const dupCode = await tenantPrisma.payrollSettlementType.findUnique({ where: { code } });
    if (dupCode) {
      const err = new Error(`Ya existe un tipo de liquidación con el código "${code}".`);
      err.status = 409;
      throw err;
    }
  }

  const dupName = await tenantPrisma.payrollSettlementType.findFirst({
    where: { name },
  });
  if (dupName) {
    const err = new Error(`Ya existe un tipo de liquidación con la denominación "${name}".`);
    err.status = 409;
    throw err;
  }

  const includeInLsd = data.includeInLsd !== undefined ? Boolean(data.includeInLsd) : true;
  const arcaLsdType = data.arcaLsdType || 'M';
  if (includeInLsd && !['M', 'Q', 'D', 'H'].includes(arcaLsdType)) {
    const err = new Error('Debe especificar un Tipo ARCA Registro 01 válido (M, Q, D o H) cuando el tipo se incluye en el Libro de Sueldos Digital.');
    err.status = 400;
    throw err;
  }

  const allowsRetroactives = Boolean(data.allowsRetroactives);

  const created = await tenantPrisma.payrollSettlementType.create({
    data: {
      id: crypto.randomUUID(),
      code,
      name,
      description: data.description ? String(data.description).trim() : null,
      conceptPrefix,
      includeInLsd,
      arcaLsdType,
      defaultWorkedDays: data.defaultWorkedDays !== undefined ? Number(data.defaultWorkedDays) : 30,
      appliesStatutoryDeductions: data.appliesStatutoryDeductions !== undefined ? Boolean(data.appliesStatutoryDeductions) : true,
      triggersEmployeeTermination: Boolean(data.triggersEmployeeTermination),
      allowsRetroactives,
      isSystem: false,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
      sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : 100,
    },
  });

  if (allowsRetroactives && data.seedRetroactiveConcepts === true) {
    const seedRes = await seedRetroactiveCatalogForSettlementType(tenantPrisma, created);
    return { ...created, seededRetroactiveCodes: seedRes.seededCodes };
  }

  return created;
}

export async function updateSettlementType(tenantPrisma, id, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const existing = await tenantPrisma.payrollSettlementType.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Tipo de liquidación no encontrado.');
    err.status = 404;
    throw err;
  }

  const nextName = data.name !== undefined ? String(data.name).trim() : existing.name;
  if (nextName !== existing.name) {
    const dupName = await tenantPrisma.payrollSettlementType.findFirst({
      where: { name: nextName, id: { not: id } },
    });
    if (dupName) {
      const err = new Error(`Ya existe otro tipo de liquidación con la denominación "${nextName}".`);
      err.status = 409;
      throw err;
    }
  }

  const nextPrefix = data.conceptPrefix !== undefined
    ? String(data.conceptPrefix).trim().toUpperCase()
    : existing.conceptPrefix;

  if (nextPrefix !== existing.conceptPrefix) {
    const conceptsCount = await tenantPrisma.concept.count({
      where: { deletedAt: null, periodType: existing.code },
    });
    if (conceptsCount > 0) {
      const err = new Error(
        `No se puede modificar el prefijo de conceptos de "${existing.conceptPrefix}" a "${nextPrefix}" porque ya existen ${conceptsCount} concepto(s) creado(s) para "${existing.name}".`
      );
      err.status = 400;
      throw err;
    }
  }

  const nextIncludeInLsd = data.includeInLsd !== undefined ? Boolean(data.includeInLsd) : existing.includeInLsd;
  const nextArcaLsdType = data.arcaLsdType !== undefined ? data.arcaLsdType : existing.arcaLsdType;
  if (nextIncludeInLsd && !['M', 'Q', 'D', 'H'].includes(nextArcaLsdType)) {
    const err = new Error('Debe indicar un Tipo ARCA Registro 01 válido (M, Q, D o H) para liquidaciones incluidas en el Libro de Sueldos Digital.');
    err.status = 400;
    throw err;
  }

  // Decisión 3 Opción A: bloquear activación de LSD si existen conceptos liquidables sin código ARCA
  if (!existing.includeInLsd && nextIncludeInLsd) {
    const unlinkedConcepts = await tenantPrisma.concept.findMany({
      where: {
        deletedAt: null,
        periodType: existing.code,
        type: { not: 'AUXILIARY' },
        OR: [{ arcaConceptCode: null }, { arcaConceptCode: '' }],
      },
      select: { code: true, name: true },
      take: 10,
    });
    if (unlinkedConcepts.length > 0) {
      const sample = unlinkedConcepts.map((c) => `${c.code} (${c.name})`).join(', ');
      const err = new Error(
        `No se puede activar "Incluye en Libro de Sueldos Digital" porque hay conceptos liquidables sin código ARCA vinculado: ${sample}. Asígneles un código ARCA primero o marque los cálculos internos como Auxiliares.`
      );
      err.status = 400;
      throw err;
    }
  }

  const nextIsActive = data.isActive !== undefined ? Boolean(data.isActive) : existing.isActive;
  if (existing.isActive && !nextIsActive) {
    const openPeriodsCount = await tenantPrisma.payrollPeriod.count({
      where: {
        periodType: existing.code,
        status: { in: ['OPEN', 'CALCULATED'] },
      },
    });
    if (openPeriodsCount > 0) {
      const err = new Error(
        `No se puede desactivar "${existing.name}" porque tiene ${openPeriodsCount} liquidación(es) abierta(s) o en curso.`
      );
      err.status = 400;
      throw err;
    }
  }

  const nextAllowsRetroactives = data.allowsRetroactives !== undefined
    ? Boolean(data.allowsRetroactives)
    : Boolean(existing.allowsRetroactives);

  const updated = await tenantPrisma.payrollSettlementType.update({
    where: { id },
    data: {
      name: nextName,
      description: data.description !== undefined ? (data.description ? String(data.description).trim() : null) : existing.description,
      conceptPrefix: nextPrefix,
      includeInLsd: nextIncludeInLsd,
      arcaLsdType: nextArcaLsdType,
      defaultWorkedDays: data.defaultWorkedDays !== undefined ? Number(data.defaultWorkedDays) : existing.defaultWorkedDays,
      appliesStatutoryDeductions: data.appliesStatutoryDeductions !== undefined
        ? Boolean(data.appliesStatutoryDeductions)
        : existing.appliesStatutoryDeductions,
      triggersEmployeeTermination: data.triggersEmployeeTermination !== undefined
        ? Boolean(data.triggersEmployeeTermination)
        : existing.triggersEmployeeTermination,
      allowsRetroactives: nextAllowsRetroactives,
      isActive: nextIsActive,
      sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : existing.sortOrder,
    },
  });

  if (nextAllowsRetroactives && data.seedRetroactiveConcepts === true) {
    const seedRes = await seedRetroactiveCatalogForSettlementType(tenantPrisma, updated);
    return { ...updated, seededRetroactiveCodes: seedRes.seededCodes };
  }

  return updated;
}

export async function deleteSettlementType(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const existing = await tenantPrisma.payrollSettlementType.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Tipo de liquidación no encontrado.');
    err.status = 404;
    throw err;
  }

  if (existing.isSystem) {
    const err = new Error(`No se puede eliminar "${existing.name}" porque es un tipo de liquidación nativo del sistema.`);
    err.status = 400;
    throw err;
  }

  const [periodsCount, conceptsCount] = await Promise.all([
    tenantPrisma.payrollPeriod.count({
      where: { periodType: existing.code },
    }),
    tenantPrisma.concept.count({
      where: { deletedAt: null, periodType: existing.code },
    }),
  ]);

  if (periodsCount > 0) {
    const err = new Error(
      `No se puede eliminar "${existing.name}" porque ya existen ${periodsCount} liquidación(es) asociada(s). Puede desactivarlo en su lugar.`
    );
    err.status = 409;
    throw err;
  }

  if (conceptsCount > 0) {
    const err = new Error(
      `No se puede eliminar "${existing.name}" porque existen ${conceptsCount} concepto(s) configurado(s) para este tipo. Elimine o reasigne esos conceptos primero.`
    );
    err.status = 409;
    throw err;
  }

  await tenantPrisma.payrollSettlementType.delete({ where: { id } });
  return { deleted: true, id };
}

// --- PARÁMETROS Y ALÍCUOTAS PATRONALES ---

export async function getPayrollSettings(tenantPrisma) {
  await ensureTenantPayrollSchema(tenantPrisma);

  let settings = await tenantPrisma.payrollSetting.findFirst();
  if (!settings) {
    settings = await tenantPrisma.payrollSetting.create({
      data: {
        employerType: 'SERVICIOS_COMERCIO',
        sipaRate: 10.77,
        inssjypRate: 1.58,
        osRate: 6.00,
        fneRate: 0.94,
        aaffRate: 4.70,
        artRate: 3.50,
        artFixedFee: 850.00,
        scvoFee: 650.00,
        detractionBase: 7003.68,
        ansesMinCap: 82287.12,
        ansesMaxCap: 2674292.72,
        standardWeeklyHours: 48.00,
        standardMonthlyHours: 200.00,
      },
    });
  }
  return {
    ...settings,
    standardWeeklyHoursFormatted: decimalToHours(settings.standardWeeklyHours, '48:00'),
    standardMonthlyHoursFormatted: decimalToHours(settings.standardMonthlyHours, '200:00'),
  };
}

export async function updatePayrollSettings(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const current = await getPayrollSettings(tenantPrisma);

  const artRate =
    data.artRate !== undefined
      ? Number(data.artRate)
      : data.contribArtRate !== undefined
      ? Number(data.contribArtRate)
      : current.artRate;
  const artFixedFee =
    data.artFixedFee !== undefined
      ? Number(data.artFixedFee)
      : data.contribArtFixed !== undefined
      ? Number(data.contribArtFixed)
      : current.artFixedFee;
  const ansesMaxCap =
    data.ansesMaxCap !== undefined
      ? Number(data.ansesMaxCap)
      : data.maxRemunerationAnses !== undefined
      ? Number(data.maxRemunerationAnses)
      : current.ansesMaxCap;

  const standardWeeklyHours =
    data.standardWeeklyHours !== undefined
      ? hoursToDecimal(data.standardWeeklyHours, current.standardWeeklyHours || 48.00)
      : current.standardWeeklyHours;
  const standardMonthlyHours =
    data.standardMonthlyHours !== undefined
      ? hoursToDecimal(data.standardMonthlyHours, current.standardMonthlyHours || 200.00)
      : current.standardMonthlyHours;

  const updated = await tenantPrisma.payrollSetting.update({
    where: { id: current.id },
    data: {
      employerType: data.employerType || current.employerType,
      sipaRate: data.sipaRate !== undefined ? Number(data.sipaRate) : current.sipaRate,
      inssjypRate: data.inssjypRate !== undefined ? Number(data.inssjypRate) : current.inssjypRate,
      osRate: data.osRate !== undefined ? Number(data.osRate) : current.osRate,
      fneRate: data.fneRate !== undefined ? Number(data.fneRate) : current.fneRate,
      aaffRate: data.aaffRate !== undefined ? Number(data.aaffRate) : current.aaffRate,
      artRate,
      artFixedFee,
      scvoFee: data.scvoFee !== undefined ? Number(data.scvoFee) : current.scvoFee,
      detractionBase: data.detractionBase !== undefined ? Number(data.detractionBase) : current.detractionBase,
      ansesMinCap: data.ansesMinCap !== undefined ? Number(data.ansesMinCap) : current.ansesMinCap,
      ansesMaxCap,
      standardWeeklyHours,
      standardMonthlyHours,
    },
  });

  return {
    ...updated,
    standardWeeklyHoursFormatted: decimalToHours(updated.standardWeeklyHours, '48:00'),
    standardMonthlyHoursFormatted: decimalToHours(updated.standardMonthlyHours, '200:00'),
  };
}

// --- CONCEPTOS ---

export async function getConcepts(tenantPrisma, { search = '', page = 1, limit = 5, type, periodType, isPersistent, scope, excludeCalculated } = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const take = Math.max(1, Math.min(Number(limit) || 5, 1000));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = { deletedAt: null };
  if (type && type !== 'ALL') where.type = type;
  if (periodType && periodType !== 'ALL') where.periodType = periodType;
  if (isPersistent !== undefined && isPersistent !== null && isPersistent !== 'ALL' && isPersistent !== '') {
    where.isPersistent = isPersistent === true || isPersistent === 'true';
  }
  if (scope && scope !== 'ALL') {
    where.scope = scope;
  }
  if (excludeCalculated === true || excludeCalculated === 'true') {
    where.noveltyDataType = { not: 'CALCULADO' };
  }
  if (search) {
    where.OR = [
      { code: { contains: search } },
      { name: { contains: search } },
      { arcaConceptCode: { contains: search } },
    ];
  }

  const [total, concepts] = await Promise.all([
    tenantPrisma.concept.count({ where }),
    tenantPrisma.concept.findMany({
      where,
      skip,
      take,
      include: { matrix: true },
      orderBy: [{ code: 'asc' }],
    }),
  ]);

  return {
    data: concepts,
    meta: {
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}

async function validateConceptAgainstSettlementType(
  tenantPrisma,
  { code, type, periodType, arcaConceptCode, isUpdate = false, enforceArcaFormat = true }
) {
  const rawPeriodType = String(periodType || 'MONTHLY').trim().toUpperCase();
  const stType = await resolveSettlementTypeConfig(tenantPrisma, rawPeriodType);
  if (!stType) {
    const err = new Error(`El tipo de liquidación "${rawPeriodType}" no existe en la configuración del sistema.`);
    err.status = 400;
    throw err;
  }

  if (!isUpdate && !stType.isActive) {
    const err = new Error(`No se pueden crear conceptos para el tipo de liquidación "${stType.name}" porque está inactivo.`);
    err.status = 400;
    throw err;
  }

  const cleanCode = String(code || '').trim().toUpperCase();
  const prefix = cleanCode.slice(0, 2);
  const isLegacyUnchangedPrefix = isUpdate && (prefix === 'AJ' || prefix === 'GR');

  if (!isLegacyUnchangedPrefix && prefix !== stType.conceptPrefix) {
    const err = new Error(
      `El código de concepto "${cleanCode}" debe comenzar con el prefijo "${stType.conceptPrefix}" asignado al tipo de liquidación "${stType.name}".`
    );
    err.status = 400;
    throw err;
  }

  const cleanArca = arcaConceptCode !== undefined && arcaConceptCode !== null
    ? String(arcaConceptCode).trim()
    : '';
  const normalizedArca = cleanArca.length > 0 ? cleanArca : null;

  // Decisión 3 Opción A: vinculación obligatoria a ARCA cuando includeInLsd === true (salvo AUXILIARY)
  if (stType.includeInLsd && type !== 'AUXILIARY') {
    if (!normalizedArca) {
      const err = new Error(
        `Debe seleccionar un Concepto ARCA porque el tipo de liquidación "${stType.name}" se incluye en el Libro de Sueldos Digital (excepto conceptos Auxiliares de Cálculo).`
      );
      err.status = 400;
      throw err;
    }
    if (enforceArcaFormat && !/^[0-9]{6}$/.test(normalizedArca)) {
      const err = new Error(`El código de Concepto ARCA "${normalizedArca}" debe tener exactamente 6 dígitos numéricos.`);
      err.status = 400;
      throw err;
    }
  } else if (normalizedArca && enforceArcaFormat && !/^[0-9]{6}$/.test(normalizedArca)) {
    const err = new Error(`El código de Concepto ARCA "${normalizedArca}" debe tener exactamente 6 dígitos numéricos.`);
    err.status = 400;
    throw err;
  }

  return { stType, normalizedArca };
}

export async function createConcept(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const cleanCode = String(data.code || '').trim().toUpperCase();
  const existing = await tenantPrisma.concept.findUnique({
    where: { code: cleanCode },
  });
  if (existing) {
    const err = new Error(`Ya existe un concepto con el código "${cleanCode}"`);
    err.status = 409;
    throw err;
  }

  const targetPeriodType = String(data.periodType || data.settlementType || 'MONTHLY').trim().toUpperCase();
  const { stType, normalizedArca } = await validateConceptAgainstSettlementType(tenantPrisma, {
    code: cleanCode,
    type: data.type,
    periodType: targetPeriodType,
    arcaConceptCode: data.arcaConceptCode,
    isUpdate: false,
    enforceArcaFormat: true,
  });

  // Cargar conceptos, valores fijos, matrices y escalas salariales en paralelo para auditoría y validación
  const [allOtherConcepts, fixedValues, matrices, salaryScales] = await Promise.all([
    tenantPrisma.concept.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, calculationOrder: true },
    }),
    tenantPrisma.payrollFixedValue.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, value: true },
    }),
    tenantPrisma.payrollMatrix.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
    tenantPrisma.salaryScale.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, amount: true },
    }),
  ]);

  let calculationOrder = data.calculationOrder !== undefined && data.calculationOrder !== null
    ? Number(data.calculationOrder)
    : null;
  const noveltyDataType = data.noveltyDataType || 'CANTIDAD';

  // Si no se proveyó orden numérico explícito, determinar orden inteligente
  if (calculationOrder === null || isNaN(calculationOrder)) {
    const codeNum = parseInt(String(data.code).replace(/\D/g, '').slice(-4), 10);
    if (data.calculationType === 'FORMULA' && data.formula) {
      const matches = data.formula.match(/\[([A-Za-z0-9_]+)\]/g) || [];
      const refCodes = new Set(matches.map((m) => m.replace(/\[|\]/g, '').toUpperCase()));
      const maxRefOrder = allOtherConcepts
        .filter((c) => refCodes.has(String(c.code).toUpperCase()))
        .reduce((max, c) => Math.max(max, Number(c.calculationOrder) || 0), 0);
      calculationOrder = Math.max(maxRefOrder + 10, (!isNaN(codeNum) && codeNum > 0) ? codeNum : (data.type === 'DEDUCTION' ? 120 : (data.type === 'AUXILIARY' ? 25 : 50)));
    } else {
      calculationOrder = (!isNaN(codeNum) && codeNum > 0) ? codeNum : (data.type === 'DEDUCTION' ? 120 : (data.type === 'AUXILIARY' ? 25 : 50));
    }
  }

  // Validar consistencia y dependencias de la fórmula si aplica
  if (data.calculationType === 'FORMULA' && data.formula) {
    const validation = validateConceptFormula({
      formula: data.formula,
      conceptCode: data.code.trim(),
      type: data.type,
      calculationOrder,
      allConcepts: allOtherConcepts,
      fixedValues,
      matrices,
      salaryScales,
    });
    if (!validation.isValid) {
      const err = new Error(`Fórmula inválida: ${validation.errors.join('; ')}`);
      err.status = 400;
      throw err;
    }
  }

  // Regla estricta ARCA LSD: Deducciones y conceptos vinculados a códigos 8xxxxx (ej. 820000 Crédito/Débito)
  // deben registrar todos los subsistemas F.931 en false (0)
  const forceZeroSubsystems = data.type === 'DEDUCTION' || String(normalizedArca || '').trim().startsWith('8');

  return tenantPrisma.concept.create({
    data: {
      code: cleanCode,
      name: data.name.trim(),
      type: data.type,
      scope: data.scope || 'GENERAL',
      calculationType: data.calculationType || 'FIXED',
      calculationOrder,
      noveltyDataType,
      quantitySource: data.quantitySource || 'AUTO',
      periodType: stType.code,
      isPersistent: data.isPersistent !== undefined ? Boolean(data.isPersistent) : true,
      defaultValue: data.defaultValue !== undefined ? Number(data.defaultValue) : 0.00,
      formula: data.formula || null,
      matrixData: data.matrixData || null,
      matrixId: data.matrixId || null,
      arcaConceptCode: normalizedArca,
      appliesSipaAporte: forceZeroSubsystems ? false : Boolean(data.appliesSipaAporte),
      appliesSipaContrib: forceZeroSubsystems ? false : Boolean(data.appliesSipaContrib),
      appliesInssjypAporte: forceZeroSubsystems ? false : Boolean(data.appliesInssjypAporte),
      appliesInssjypContrib: forceZeroSubsystems ? false : Boolean(data.appliesInssjypContrib),
      appliesOsAporte: forceZeroSubsystems ? false : Boolean(data.appliesOsAporte),
      appliesOsContrib: forceZeroSubsystems ? false : Boolean(data.appliesOsContrib),
      appliesFsrAporte: forceZeroSubsystems ? false : Boolean(data.appliesFsrAporte),
      appliesFsrContrib: forceZeroSubsystems ? false : Boolean(data.appliesFsrContrib),
      appliesRenatreAporte: forceZeroSubsystems ? false : Boolean(data.appliesRenatreAporte),
      appliesRenatreContrib: forceZeroSubsystems ? false : Boolean(data.appliesRenatreContrib),
      appliesAaffContrib: forceZeroSubsystems ? false : Boolean(data.appliesAaffContrib),
      appliesFneContrib: forceZeroSubsystems ? false : Boolean(data.appliesFneContrib),
      appliesLrtContrib: forceZeroSubsystems ? false : Boolean(data.appliesLrtContrib),
      appliesRegDifAporte: forceZeroSubsystems ? false : Boolean(data.appliesRegDifAporte),
      appliesRegEspAporte: forceZeroSubsystems ? false : Boolean(data.appliesRegEspAporte),
      appliesDetraccion: forceZeroSubsystems ? false : Boolean(data.appliesDetraccion),
      isRepeatable: Boolean(data.isRepeatable),
      isEmbargo: Boolean(data.isEmbargo),
    },
  });
}

export async function updateConcept(tenantPrisma, conceptId, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const concept = await tenantPrisma.concept.findUnique({
    where: { id: conceptId },
  });
  if (!concept) {
    const err = new Error('El concepto solicitado no existe');
    err.status = 404;
    throw err;
  }

  const newPeriodType = data.periodType !== undefined ? data.periodType : data.settlementType;
  const effectivePeriodType = newPeriodType !== undefined ? String(newPeriodType).trim().toUpperCase() : concept.periodType;
  const effectiveType = data.type !== undefined ? data.type : concept.type;
  const effectiveArcaInput = data.arcaConceptCode !== undefined ? data.arcaConceptCode : concept.arcaConceptCode;
  const shouldCheckFormat = data.arcaConceptCode !== undefined || newPeriodType !== undefined || data.type !== undefined;

  const { stType, normalizedArca } = await validateConceptAgainstSettlementType(tenantPrisma, {
    code: concept.code,
    type: effectiveType,
    periodType: effectivePeriodType,
    arcaConceptCode: effectiveArcaInput,
    isUpdate: true,
    enforceArcaFormat: shouldCheckFormat,
  });

  const calcOrder = data.calculationOrder !== undefined && data.calculationOrder !== null
    ? Number(data.calculationOrder)
    : (concept.calculationOrder || 100);
  const formula = data.formula !== undefined ? data.formula : concept.formula;
  const calcType = data.calculationType !== undefined ? data.calculationType : concept.calculationType;

  // Validar fórmula si aplica
  if (calcType === 'FORMULA' && formula) {
    const [allOtherConcepts, fixedValues, matrices, salaryScales] = await Promise.all([
      tenantPrisma.concept.findMany({
        where: { deletedAt: null, id: { not: conceptId } },
        select: { id: true, code: true, name: true, calculationOrder: true },
      }),
      tenantPrisma.payrollFixedValue.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true, name: true, value: true },
      }),
      tenantPrisma.payrollMatrix.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true, name: true },
      }),
      tenantPrisma.salaryScale.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true, name: true, amount: true },
      }),
    ]);
    const validation = validateConceptFormula({
      formula,
      conceptCode: concept.code,
      type: data.type !== undefined ? data.type : concept.type,
      calculationOrder: calcOrder,
      allConcepts: allOtherConcepts,
      fixedValues,
      matrices,
      salaryScales,
    });
    if (!validation.isValid) {
      const err = new Error(`Fórmula inválida: ${validation.errors.join('; ')}`);
      err.status = 400;
      throw err;
    }
  }

  const finalArcaCode = data.arcaConceptCode !== undefined ? normalizedArca : concept.arcaConceptCode;
  const forceZeroSubsystems = effectiveType === 'DEDUCTION' || String(finalArcaCode || '').trim().startsWith('8');

  return tenantPrisma.concept.update({
    where: { id: conceptId },
    data: {
      name: data.name !== undefined ? data.name.trim() : concept.name,
      type: data.type !== undefined ? data.type : concept.type,
      scope: data.scope !== undefined ? data.scope : concept.scope,
      calculationType: data.calculationType !== undefined ? data.calculationType : concept.calculationType,
      calculationOrder: calcOrder,
      noveltyDataType: data.noveltyDataType !== undefined ? data.noveltyDataType : (concept.noveltyDataType || 'CANTIDAD'),
      quantitySource: data.quantitySource !== undefined ? (data.quantitySource || 'AUTO') : (concept.quantitySource || 'AUTO'),
      periodType: newPeriodType !== undefined ? stType.code : concept.periodType,
      isPersistent: data.isPersistent !== undefined ? Boolean(data.isPersistent) : concept.isPersistent,
      defaultValue: data.defaultValue !== undefined ? Number(data.defaultValue) : concept.defaultValue,
      formula: data.formula !== undefined ? data.formula : concept.formula,
      matrixData: data.matrixData !== undefined ? data.matrixData : concept.matrixData,
      matrixId: data.matrixId !== undefined ? (data.matrixId || null) : concept.matrixId,
      arcaConceptCode: data.arcaConceptCode !== undefined ? normalizedArca : concept.arcaConceptCode,
      appliesSipaAporte: forceZeroSubsystems ? false : (data.appliesSipaAporte !== undefined ? Boolean(data.appliesSipaAporte) : concept.appliesSipaAporte),
      appliesSipaContrib: forceZeroSubsystems ? false : (data.appliesSipaContrib !== undefined ? Boolean(data.appliesSipaContrib) : concept.appliesSipaContrib),
      appliesInssjypAporte: forceZeroSubsystems ? false : (data.appliesInssjypAporte !== undefined ? Boolean(data.appliesInssjypAporte) : concept.appliesInssjypAporte),
      appliesInssjypContrib: forceZeroSubsystems ? false : (data.appliesInssjypContrib !== undefined ? Boolean(data.appliesInssjypContrib) : concept.appliesInssjypContrib),
      appliesOsAporte: forceZeroSubsystems ? false : (data.appliesOsAporte !== undefined ? Boolean(data.appliesOsAporte) : concept.appliesOsAporte),
      appliesOsContrib: forceZeroSubsystems ? false : (data.appliesOsContrib !== undefined ? Boolean(data.appliesOsContrib) : concept.appliesOsContrib),
      appliesFsrAporte: forceZeroSubsystems ? false : (data.appliesFsrAporte !== undefined ? Boolean(data.appliesFsrAporte) : concept.appliesFsrAporte),
      appliesFsrContrib: forceZeroSubsystems ? false : (data.appliesFsrContrib !== undefined ? Boolean(data.appliesFsrContrib) : concept.appliesFsrContrib),
      appliesRenatreAporte: forceZeroSubsystems ? false : (data.appliesRenatreAporte !== undefined ? Boolean(data.appliesRenatreAporte) : concept.appliesRenatreAporte),
      appliesRenatreContrib: forceZeroSubsystems ? false : (data.appliesRenatreContrib !== undefined ? Boolean(data.appliesRenatreContrib) : concept.appliesRenatreContrib),
      appliesAaffContrib: forceZeroSubsystems ? false : (data.appliesAaffContrib !== undefined ? Boolean(data.appliesAaffContrib) : concept.appliesAaffContrib),
      appliesFneContrib: forceZeroSubsystems ? false : (data.appliesFneContrib !== undefined ? Boolean(data.appliesFneContrib) : concept.appliesFneContrib),
      appliesLrtContrib: forceZeroSubsystems ? false : (data.appliesLrtContrib !== undefined ? Boolean(data.appliesLrtContrib) : concept.appliesLrtContrib),
      appliesRegDifAporte: forceZeroSubsystems ? false : (data.appliesRegDifAporte !== undefined ? Boolean(data.appliesRegDifAporte) : concept.appliesRegDifAporte),
      appliesRegEspAporte: forceZeroSubsystems ? false : (data.appliesRegEspAporte !== undefined ? Boolean(data.appliesRegEspAporte) : concept.appliesRegEspAporte),
      appliesDetraccion: forceZeroSubsystems ? false : (data.appliesDetraccion !== undefined ? Boolean(data.appliesDetraccion) : concept.appliesDetraccion),
      isRepeatable: data.isRepeatable !== undefined ? Boolean(data.isRepeatable) : concept.isRepeatable,
      isEmbargo: data.isEmbargo !== undefined ? Boolean(data.isEmbargo) : concept.isEmbargo,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : concept.isActive,
    },
  });
}

export async function validateFormula(tenantPrisma, { formula, conceptCode, conceptType, type, calculationOrder = 100 }) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const [allConcepts, fixedValues, matrices, salaryScales] = await Promise.all([
    tenantPrisma.concept.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, calculationOrder: true },
    }),
    tenantPrisma.payrollFixedValue.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, value: true },
    }),
    tenantPrisma.payrollMatrix.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
    tenantPrisma.salaryScale.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, amount: true },
    }),
  ]);
  return validateConceptFormula({
    formula,
    conceptCode,
    type: type || conceptType,
    calculationOrder: Number(calculationOrder) || 100,
    allConcepts,
    fixedValues,
    matrices,
    salaryScales,
  });
}

export async function deleteConcept(tenantPrisma, conceptId) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const concept = await tenantPrisma.concept.findUnique({
    where: { id: conceptId },
  });
  if (!concept) {
    const err = new Error('El concepto solicitado no existe');
    err.status = 404;
    throw err;
  }

  return tenantPrisma.concept.update({
    where: { id: conceptId },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  });
}


// --- MATRICES DE LIQUIDACIÓN (LOOKUP MATRICES) ---

export async function getPayrollMatrices(tenantPrisma, { search = '', page = 1, limit = 5, matchType, isActive } = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const take = Math.max(1, Math.min(Number(limit) || 5, 100));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = { deletedAt: null };
  if (matchType) where.matchType = matchType;
  if (isActive !== undefined) where.isActive = String(isActive) === 'true' || isActive === true;
  if (search) {
    where.OR = [
      { code: { contains: search } },
      { name: { contains: search } },
      { inputConceptCode: { contains: search } },
    ];
  }

  const [total, matrices] = await Promise.all([
    tenantPrisma.payrollMatrix.count({ where }),
    tenantPrisma.payrollMatrix.findMany({
      where,
      skip,
      take,
      include: {
        _count: {
          select: { concepts: true },
        },
      },
      orderBy: { code: 'asc' },
    }),
  ]);

  return {
    data: matrices.map((m) => {
      let parsedRows = [];
      try {
        parsedRows = typeof m.rows === 'string' ? JSON.parse(m.rows) : (m.rows || []);
      } catch {
        parsedRows = [];
      }
      return {
        ...m,
        rowsCount: parsedRows.length,
        conceptsCount: m._count?.concepts || 0,
      };
    }),
    meta: {
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}

export async function getPayrollMatrixById(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const matrix = await tenantPrisma.payrollMatrix.findUnique({
    where: { id },
    include: {
      concepts: {
        where: { deletedAt: null },
        select: { id: true, code: true, name: true, type: true },
      },
    },
  });

  if (!matrix || matrix.deletedAt) {
    const err = new Error('La matriz solicitada no existe');
    err.status = 404;
    throw err;
  }

  let parsedRows = [];
  try {
    parsedRows = typeof matrix.rows === 'string' ? JSON.parse(matrix.rows) : (matrix.rows || []);
  } catch {
    parsedRows = [];
  }

  return {
    ...matrix,
    parsedRows,
  };
}

export async function createPayrollMatrix(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const code = data.code.trim().toUpperCase();
  const existing = await tenantPrisma.payrollMatrix.findUnique({
    where: { code },
  });

  if (existing && !existing.deletedAt) {
    const err = new Error(`Ya existe una matriz con el código "${code}"`);
    err.status = 409;
    throw err;
  }

  const rowsJson = typeof data.rows === 'string' ? data.rows : JSON.stringify(data.rows || []);

  return tenantPrisma.payrollMatrix.create({
    data: {
      code,
      name: data.name.trim(),
      description: data.description ? data.description.trim() : null,
      inputConceptCode: data.inputConceptCode.trim(),
      matchType: data.matchType || 'RANGE',
      defaultValue: data.defaultValue !== undefined ? Number(data.defaultValue) : 0.00,
      rows: rowsJson,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    },
  });
}

export async function updatePayrollMatrix(tenantPrisma, id, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const matrix = await tenantPrisma.payrollMatrix.findUnique({
    where: { id },
  });
  if (!matrix || matrix.deletedAt) {
    const err = new Error('La matriz solicitada no existe');
    err.status = 404;
    throw err;
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description ? data.description.trim() : null;
  if (data.inputConceptCode !== undefined) updateData.inputConceptCode = data.inputConceptCode.trim();
  if (data.matchType !== undefined) updateData.matchType = data.matchType;
  if (data.defaultValue !== undefined) updateData.defaultValue = Number(data.defaultValue);
  if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);
  if (data.rows !== undefined) {
    updateData.rows = typeof data.rows === 'string' ? data.rows : JSON.stringify(data.rows || []);
  }

  return tenantPrisma.payrollMatrix.update({
    where: { id },
    data: updateData,
  });
}

export async function deletePayrollMatrix(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const matrix = await tenantPrisma.payrollMatrix.findUnique({
    where: { id },
    include: {
      concepts: { where: { deletedAt: null } },
    },
  });

  if (!matrix || matrix.deletedAt) {
    const err = new Error('La matriz solicitada no existe');
    err.status = 404;
    throw err;
  }

  if (matrix.concepts && matrix.concepts.length > 0) {
    const conceptCodes = matrix.concepts.map((c) => c.code).join(', ');
    const err = new Error(`No es posible eliminar la matriz porque está siendo utilizada por los conceptos: ${conceptCodes}`);
    err.status = 400;
    throw err;
  }

  return tenantPrisma.payrollMatrix.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

// --- VALORES GLOBALES FIJOS (CONSTANTES DE LIQUIDACIÓN) ---

export async function getPayrollFixedValues(tenantPrisma, { search = '', page = 1, limit = 5, isActive }) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const take = Math.max(1, Math.min(Number(limit) || 5, 100));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = { deletedAt: null };
  if (isActive !== undefined && isActive !== 'ALL' && isActive !== '') {
    where.isActive = String(isActive) === 'true' || isActive === true;
  }
  if (search && String(search).trim() !== '') {
    const q = String(search).trim();
    where.OR = [
      { code: { contains: q } },
      { name: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const [total, fixedValues] = await Promise.all([
    tenantPrisma.payrollFixedValue.count({ where }),
    tenantPrisma.payrollFixedValue.findMany({
      where,
      skip,
      take,
      orderBy: { code: 'asc' },
    }),
  ]);

  return {
    data: fixedValues,
    meta: {
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}

export async function getPayrollFixedValueById(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const fixedValue = await tenantPrisma.payrollFixedValue.findUnique({
    where: { id },
  });

  if (!fixedValue || fixedValue.deletedAt) {
    const err = new Error('El valor fijo solicitado no existe');
    err.status = 404;
    throw err;
  }

  return fixedValue;
}

export async function createPayrollFixedValue(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const code = String(data.code).trim().toUpperCase().replace(/\s+/g, '_');
  const existing = await tenantPrisma.payrollFixedValue.findUnique({
    where: { code },
  });

  if (existing && !existing.deletedAt) {
    const err = new Error(`Ya existe un valor fijo con el código "${code}"`);
    err.status = 409;
    throw err;
  }

  if (existing && existing.deletedAt) {
    // Si existía pero estaba borrado, reactivarlo con los nuevos datos
    return tenantPrisma.payrollFixedValue.update({
      where: { id: existing.id },
      data: {
        code,
        name: data.name.trim(),
        description: data.description ? data.description.trim() : null,
        value: Number(data.value || 0),
        unit: data.unit ? data.unit.trim() : '$',
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
        deletedAt: null,
      },
    });
  }

  return tenantPrisma.payrollFixedValue.create({
    data: {
      code,
      name: data.name.trim(),
      description: data.description ? data.description.trim() : null,
      value: Number(data.value || 0),
      unit: data.unit ? data.unit.trim() : '$',
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    },
  });
}

export async function updatePayrollFixedValue(tenantPrisma, id, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const fixedValue = await tenantPrisma.payrollFixedValue.findUnique({
    where: { id },
  });

  if (!fixedValue || fixedValue.deletedAt) {
    const err = new Error('El valor fijo solicitado no existe');
    err.status = 404;
    throw err;
  }

  const updateData = {};
  if (data.code !== undefined) {
    const newCode = String(data.code).trim().toUpperCase().replace(/\s+/g, '_');
    if (newCode !== fixedValue.code) {
      const codeConflict = await tenantPrisma.payrollFixedValue.findUnique({
        where: { code: newCode },
      });
      if (codeConflict && codeConflict.id !== id && !codeConflict.deletedAt) {
        const err = new Error(`Ya existe otro valor fijo con el código "${newCode}"`);
        err.status = 409;
        throw err;
      }
      updateData.code = newCode;
    }
  }

  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description ? data.description.trim() : null;
  if (data.value !== undefined) updateData.value = Number(data.value);
  if (data.unit !== undefined) updateData.unit = data.unit.trim();
  if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);

  return tenantPrisma.payrollFixedValue.update({
    where: { id },
    data: updateData,
  });
}

export async function deletePayrollFixedValue(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const fixedValue = await tenantPrisma.payrollFixedValue.findUnique({
    where: { id },
  });

  if (!fixedValue || fixedValue.deletedAt) {
    const err = new Error('El valor fijo solicitado no existe');
    err.status = 404;
    throw err;
  }

  // Verificar si algún concepto activo utiliza este valor fijo en su fórmula
  const concepts = await tenantPrisma.concept.findMany({
    where: { isActive: true, deletedAt: null, calculationType: 'FORMULA' },
    select: { code: true, name: true, formula: true },
  });

  const matchingConcepts = concepts.filter((c) => {
    if (!c.formula) return false;
    const fUpper = c.formula.toUpperCase();
    return (
      fUpper.includes(`[${fixedValue.code}]`) ||
      fUpper.includes(`[VALOR:${fixedValue.code}]`) ||
      fUpper.includes(`[FIJO:${fixedValue.code}]`) ||
      fUpper.includes(`[CONST:${fixedValue.code}]`) ||
      fUpper.includes(`[VALOR:${fixedValue.name.toUpperCase()}]`)
    );
  });

  if (matchingConcepts.length > 0) {
    const list = matchingConcepts.map((c) => `${c.code} (${c.name})`).join(', ');
    const err = new Error(`No es posible eliminar el valor fijo porque está siendo utilizado en las fórmulas de los conceptos: ${list}`);
    err.status = 400;
    throw err;
  }

  return tenantPrisma.payrollFixedValue.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

// =====================================================================
// NOVEDADES NO PERSISTENTES DE PERÍODO (period_novelties)
