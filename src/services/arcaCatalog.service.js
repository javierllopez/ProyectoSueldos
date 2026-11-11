import prisma from '../config/prisma.js';
import { seedArcaMaster } from '../scripts/seedArca.js';

let masterArcaSeedVerified = false;
let pendingMasterArcaSeed = null;

/**
 * Garantiza que los catálogos oficiales de ARCA en la base MASTER tengan datos cargados.
 * Usa un mutex de promesa en memoria para evitar carreras en arranque en frío.
 */
export async function ensureMasterArcaSeeded() {
  if (masterArcaSeedVerified) return;
  if (pendingMasterArcaSeed) return pendingMasterArcaSeed;

  pendingMasterArcaSeed = (async () => {
    try {
      const count = await prisma.arcaCct.count();
      if (count === 0) {
        await seedArcaMaster({ verbose: false });
      }
      masterArcaSeedVerified = true;
    } finally {
      pendingMasterArcaSeed = null;
    }
  })();

  return pendingMasterArcaSeed;
}

/**
 * Resuelve en lote (sin queries N+1) mapas de códigos ARCA desde la base MASTER.
 */
export async function fetchArcaLookups({
  cctCodes = [],
  categoryCodes = [],
  positionCodes = [],
  serviceTypeCodes = [],
  contractModalityCodes = [],
} = {}) {
  await ensureMasterArcaSeeded();

  const uniq = (arr) => Array.from(new Set(arr.filter((v) => v !== null && v !== undefined && String(v).trim() !== '').map((v) => String(v).trim())));

  const uCcts = uniq(cctCodes);
  const uCats = uniq(categoryCodes);
  const uPos = uniq(positionCodes);
  const uServ = uniq(serviceTypeCodes);
  const uMods = uniq(contractModalityCodes);

  const [ccts, categories, positions, serviceTypes, modalities] = await Promise.all([
    uCcts.length > 0
      ? prisma.arcaCct.findMany({
          where: { code: { in: uCcts } },
          select: { code: true, name: true, sector: true },
        })
      : Promise.resolve([]),
    uCats.length > 0
      ? prisma.arcaCategory.findMany({
          where: { code: { in: uCats } },
          select: { code: true, name: true, cct: true },
        })
      : Promise.resolve([]),
    uPos.length > 0
      ? prisma.arcaPosition.findMany({
          where: { code: { in: uPos } },
          select: { code: true, name: true, groupName: true },
        })
      : Promise.resolve([]),
    uServ.length > 0
      ? prisma.arcaServiceType.findMany({
          where: { code: { in: uServ } },
          select: { code: true, name: true, regime: true },
        })
      : Promise.resolve([]),
    uMods.length > 0
      ? prisma.arcaContractModality.findMany({
          where: { code: { in: uMods } },
        })
      : Promise.resolve([]),
  ]);

  return {
    cctMap: new Map(ccts.map((c) => [c.code, c])),
    categoryMap: new Map(categories.map((c) => [c.code, c])),
    positionMap: new Map(positions.map((p) => [p.code, p])),
    serviceTypeMap: new Map(serviceTypes.map((s) => [s.code, s])),
    modalityMap: new Map(modalities.map((m) => [m.code, m])),
  };
}

function attachJobPositionLookups(pos, lookups) {
  if (!pos) return null;
  const cct = pos.cctCode ? lookups.cctMap.get(pos.cctCode) || null : null;
  const category = pos.categoryCode ? lookups.categoryMap.get(pos.categoryCode) || null : null;
  const arcaPosition = pos.positionCode ? lookups.positionMap.get(pos.positionCode) || null : null;
  const serviceType = pos.serviceTypeCode ? lookups.serviceTypeMap.get(pos.serviceTypeCode) || null : null;

  return {
    ...pos,
    cct: cct ? { code: cct.code, name: cct.name, sector: cct.sector || null } : null,
    category: category ? { code: category.code, name: category.name, cct: category.cct || null } : null,
    arcaPosition: arcaPosition ? { code: arcaPosition.code, name: arcaPosition.name, groupName: arcaPosition.groupName || null } : null,
    serviceType: serviceType ? { code: serviceType.code, name: serviceType.name, regime: serviceType.regime || null } : null,
  };
}

export async function hydrateJobPositions(positions) {
  if (!Array.isArray(positions) || positions.length === 0) return positions || [];
  const lookups = await fetchArcaLookups({
    cctCodes: positions.map((p) => p?.cctCode),
    categoryCodes: positions.map((p) => p?.categoryCode),
    positionCodes: positions.map((p) => p?.positionCode),
    serviceTypeCodes: positions.map((p) => p?.serviceTypeCode),
  });
  return positions.map((p) => attachJobPositionLookups(p, lookups));
}

export async function hydrateJobPosition(position) {
  if (!position) return null;
  const [hydrated] = await hydrateJobPositions([position]);
  return hydrated;
}

export async function hydrateSalaryScales(scales) {
  if (!Array.isArray(scales) || scales.length === 0) return scales || [];
  const lookups = await fetchArcaLookups({
    cctCodes: scales.map((s) => s?.cctCode),
  });
  return scales.map((s) => {
    const cct = s?.cctCode ? lookups.cctMap.get(s.cctCode) || null : null;
    return {
      ...s,
      cct: cct ? { code: cct.code, name: cct.name, sector: cct.sector || null } : null,
    };
  });
}

export async function hydrateSalaryScale(scale) {
  if (!scale) return null;
  const [hydrated] = await hydrateSalaryScales([scale]);
  return hydrated;
}

export async function hydrateEmployees(employees) {
  if (!Array.isArray(employees) || employees.length === 0) return employees || [];

  const cctCodes = [];
  const categoryCodes = [];
  const positionCodes = [];
  const serviceTypeCodes = [];
  const modalityCodes = [];

  for (const emp of employees) {
    if (!emp) continue;
    if (emp.contractModalityCode) modalityCodes.push(emp.contractModalityCode);
    if (emp.jobPosition) {
      if (emp.jobPosition.cctCode) cctCodes.push(emp.jobPosition.cctCode);
      if (emp.jobPosition.categoryCode) categoryCodes.push(emp.jobPosition.categoryCode);
      if (emp.jobPosition.positionCode) positionCodes.push(emp.jobPosition.positionCode);
      if (emp.jobPosition.serviceTypeCode) serviceTypeCodes.push(emp.jobPosition.serviceTypeCode);
    }
    if (emp.salaryScale?.cctCode) {
      cctCodes.push(emp.salaryScale.cctCode);
    }
  }

  const lookups = await fetchArcaLookups({
    cctCodes,
    categoryCodes,
    positionCodes,
    serviceTypeCodes,
    contractModalityCodes: modalityCodes,
  });

  return employees.map((emp) => {
    if (!emp) return emp;
    const contractModality = emp.contractModalityCode
      ? lookups.modalityMap.get(emp.contractModalityCode) || null
      : null;

    const jobPosition = emp.jobPosition ? attachJobPositionLookups(emp.jobPosition, lookups) : emp.jobPosition;

    let salaryScale = emp.salaryScale;
    if (salaryScale) {
      const scaleCct = salaryScale.cctCode ? lookups.cctMap.get(salaryScale.cctCode) || null : null;
      salaryScale = {
        ...salaryScale,
        cct: scaleCct ? { code: scaleCct.code, name: scaleCct.name, sector: scaleCct.sector || null } : null,
      };
    }

    return {
      ...emp,
      contractModality,
      jobPosition,
      salaryScale,
    };
  });
}

export async function hydrateEmployee(employee) {
  if (!employee) return null;
  const [hydrated] = await hydrateEmployees([employee]);
  return hydrated;
}

export async function hydratePaySlips(slips) {
  if (!Array.isArray(slips) || slips.length === 0) return slips || [];
  const jobPositions = slips.map((s) => s?.employee?.jobPosition).filter(Boolean);
  if (jobPositions.length === 0) return slips;

  const lookups = await fetchArcaLookups({
    cctCodes: jobPositions.map((jp) => jp.cctCode),
    categoryCodes: jobPositions.map((jp) => jp.categoryCode),
    positionCodes: jobPositions.map((jp) => jp.positionCode),
    serviceTypeCodes: jobPositions.map((jp) => jp.serviceTypeCode),
  });

  return slips.map((slip) => {
    if (!slip?.employee?.jobPosition) return slip;
    return {
      ...slip,
      employee: {
        ...slip.employee,
        jobPosition: attachJobPositionLookups(slip.employee.jobPosition, lookups),
      },
    };
  });
}

export async function listMasterArcaCcts({ search = '', limit } = {}) {
  await ensureMasterArcaSeeded();
  const where = {};
  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { code: { contains: q } },
      { name: { contains: q } },
      { sector: { contains: q } },
      { description: { contains: q } },
    ];
  }
  const queryOptions = {
    where,
    orderBy: [{ code: 'asc' }],
  };
  if (limit && Number(limit) > 0) {
    queryOptions.take = Number(limit);
  }
  return prisma.arcaCct.findMany(queryOptions);
}

export async function listMasterArcaCategories({ search = '', limit = 200, cctCode } = {}) {
  await ensureMasterArcaSeeded();
  const conditions = [];

  if (cctCode && cctCode.trim()) {
    const trimmedCct = cctCode.trim();
    if (trimmedCct.toUpperCase() === 'FC') {
      conditions.push({
        OR: [
          { code: { startsWith: 'FC' } },
          { name: { contains: 'Fuera de Convenio' } },
        ],
      });
    } else {
      const relations = await prisma.arcaCctCategoryPosition.findMany({
        where: { cctCode: trimmedCct },
        select: { categoryCode: true },
        distinct: ['categoryCode'],
      });
      const categoryCodes = relations.map((r) => r.categoryCode);
      if (categoryCodes.length > 0) {
        conditions.push({ code: { in: categoryCodes } });
      } else {
        conditions.push({
          OR: [
            { cct: { contains: trimmedCct } },
            { code: { in: [] } },
          ],
        });
      }
    }
  }

  if (search && search.trim()) {
    const q = search.trim();
    conditions.push({
      OR: [
        { code: { contains: q } },
        { name: { contains: q } },
        { cct: { contains: q } },
        { description: { contains: q } },
      ],
    });
  }

  const where = conditions.length === 1 ? conditions[0] : conditions.length > 1 ? { AND: conditions } : {};
  const queryOptions = { where, orderBy: [{ code: 'asc' }] };
  const effectiveLimit = cctCode && (!limit || limit === 200) ? 500 : limit;
  if (effectiveLimit && effectiveLimit !== 'all' && Number(effectiveLimit) > 0) {
    queryOptions.take = Number(effectiveLimit);
  }

  return prisma.arcaCategory.findMany(queryOptions);
}

export async function listMasterArcaPositions({ search = '', limit, cctCode } = {}) {
  await ensureMasterArcaSeeded();
  const conditions = [];

  if (cctCode && cctCode.trim()) {
    const trimmedCct = cctCode.trim();
    if (trimmedCct.toUpperCase() !== 'FC') {
      const relations = await prisma.arcaCctCategoryPosition.findMany({
        where: { cctCode: trimmedCct },
        select: { positionCode: true },
        distinct: ['positionCode'],
      });
      const positionCodes = relations.map((r) => r.positionCode);
      if (positionCodes.length > 0) {
        conditions.push({ code: { in: positionCodes } });
      }
    }
  }

  if (search && search.trim()) {
    const q = search.trim();
    conditions.push({
      OR: [
        { code: { contains: q } },
        { name: { contains: q } },
        { groupName: { contains: q } },
        { description: { contains: q } },
      ],
    });
  }

  const where = conditions.length === 1 ? conditions[0] : conditions.length > 1 ? { AND: conditions } : {};
  const queryOptions = {
    where,
    orderBy: [{ groupCode: 'asc' }, { name: 'asc' }],
  };
  if (limit && limit !== 'all' && Number(limit) > 0) {
    queryOptions.take = Number(limit);
  }

  return prisma.arcaPosition.findMany(queryOptions);
}

export async function listMasterArcaServiceTypes() {
  await ensureMasterArcaSeeded();
  return prisma.arcaServiceType.findMany({
    orderBy: { code: 'asc' },
  });
}

export async function listMasterArcaContractModalities({ search = '', onlyActive = false } = {}) {
  await ensureMasterArcaSeeded();
  const conditions = [];

  if (onlyActive) {
    conditions.push({ isActive: true });
  }

  if (search && search.trim()) {
    const q = search.trim();
    conditions.push({
      OR: [
        { code: { contains: q } },
        { name: { contains: q } },
        { description: { contains: q } },
      ],
    });
  }

  const where = conditions.length === 1 ? conditions[0] : conditions.length > 1 ? { AND: conditions } : {};
  return prisma.arcaContractModality.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
  });
}

export async function assertMasterArcaCctExists(rawCctCode) {
  if (rawCctCode === undefined) return undefined;
  const trimmed = rawCctCode !== null ? String(rawCctCode).trim() : '';
  if (!trimmed || trimmed === 'NO_CCT' || trimmed === 'ALL') return null;

  await ensureMasterArcaSeeded();
  const found = await prisma.arcaCct.findUnique({
    where: { code: trimmed },
    select: { code: true },
  });
  if (!found) {
    const err = new Error(`El Convenio Colectivo "${trimmed}" no existe en el catálogo ARCA.`);
    err.status = 400;
    throw err;
  }
  return found.code;
}

export async function assertMasterArcaContractModalityExists(rawCode) {
  if (!rawCode || !String(rawCode).trim()) return null;
  await ensureMasterArcaSeeded();
  const trimmed = String(rawCode).trim();
  const modality = await prisma.arcaContractModality.findFirst({
    where: { code: trimmed },
    select: { code: true },
  });
  if (!modality) {
    const error = new Error('La modalidad de contratación seleccionada no existe');
    error.status = 400;
    throw error;
  }
  return modality.code;
}

export async function getMasterArcaValidationSets() {
  await ensureMasterArcaSeeded();
  const [ccts, categories, arcaPositions, serviceTypes] = await Promise.all([
    prisma.arcaCct.findMany({ select: { code: true } }),
    prisma.arcaCategory.findMany({ select: { code: true } }),
    prisma.arcaPosition.findMany({ select: { code: true } }),
    prisma.arcaServiceType.findMany({ select: { code: true } }),
  ]);

  return {
    validCctCodes: new Set(ccts.map((c) => c.code.toLowerCase())),
    validCategoryCodes: new Set(categories.map((c) => c.code.toLowerCase())),
    validArcaPosCodes: new Set(arcaPositions.map((p) => p.code.toLowerCase())),
    validServiceTypeCodes: new Set(serviceTypes.map((s) => s.code.toLowerCase())),
    cctOriginalMap: new Map(ccts.map((c) => [c.code.toLowerCase(), c.code])),
    categoryOriginalMap: new Map(categories.map((c) => [c.code.toLowerCase(), c.code])),
    posOriginalMap: new Map(arcaPositions.map((p) => [p.code.toLowerCase(), p.code])),
    servOriginalMap: new Map(serviceTypes.map((s) => [s.code.toLowerCase(), s.code])),
  };
}

