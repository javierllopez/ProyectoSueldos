import crypto from 'crypto';
import { ensureTenantPersonnelSchema, getArcaActivitiesData } from '../../services/tenantProvisioner.service.js';

// --- SECTORES (DEPARTMENTS) ---

export async function listDepartments(tenantPrisma) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const departments = await tenantPrisma.department.findMany({
    where: { deletedAt: null },
    include: {
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  return departments.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    employeeCount: d._count.employees,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
}

export async function getDepartmentById(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const department = await tenantPrisma.department.findFirst({
    where: { id, deletedAt: null },
    include: {
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
    },
  });

  if (!department) {
    const error = new Error('Sector no encontrado');
    error.status = 404;
    throw error;
  }

  return {
    ...department,
    employeeCount: department._count.employees,
  };
}

export async function createDepartment(tenantPrisma, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  return tenantPrisma.department.create({
    data: {
      id: crypto.randomUUID(),
      name: data.name,
      code: data.code || null,
    },
  });
}

/**
 * Importa sectores masivamente desde un listado (ej. Excel).
 * Agrega sectores nuevos y omite los que ya existen en la base de datos o en el lote.
 */
export async function importDepartments(tenantPrisma, departments) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  if (!Array.isArray(departments) || departments.length === 0) {
    const error = new Error('No se enviaron sectores para importar');
    error.status = 400;
    throw error;
  }

  // 1. Obtener todos los sectores existentes activos
  const existingDepartments = await tenantPrisma.department.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, code: true },
  });

  const existingNamesSet = new Set(
    existingDepartments.map((d) => (d.name || '').trim().toLowerCase())
  );
  const existingCodesSet = new Set(
    existingDepartments
      .filter((d) => d.code && d.code.trim())
      .map((d) => d.code.trim().toLowerCase())
  );

  const toCreate = [];
  const skipped = [];
  const batchNamesSet = new Set();
  const batchCodesSet = new Set();

  for (const item of departments) {
    const name = (item.name || '').trim();
    const code = (item.code || '').trim() || null;

    if (!name || name.length < 2) {
      skipped.push({
        name: name || '(Sin descripción)',
        code: code || '-',
        reason: 'Nombre o descripción inválida (debe tener al menos 2 caracteres)',
      });
      continue;
    }

    const nameLower = name.toLowerCase();
    const codeLower = code ? code.toLowerCase() : null;

    // Verificar si ya existe en base de datos
    if (existingNamesSet.has(nameLower)) {
      skipped.push({
        name,
        code: code || '-',
        reason: 'Ya se encuentra registrado en el sistema con este nombre',
      });
      continue;
    }

    if (codeLower && existingCodesSet.has(codeLower)) {
      skipped.push({
        name,
        code,
        reason: `Ya se encuentra registrado en el sistema con el código "${code}"`,
      });
      continue;
    }

    // Verificar duplicados dentro del mismo lote del archivo
    if (batchNamesSet.has(nameLower)) {
      skipped.push({
        name,
        code: code || '-',
        reason: 'Repetido dentro del mismo archivo Excel',
      });
      continue;
    }

    if (codeLower && batchCodesSet.has(codeLower)) {
      skipped.push({
        name,
        code,
        reason: `Código "${code}" repetido dentro del mismo archivo Excel`,
      });
      continue;
    }

    batchNamesSet.add(nameLower);
    if (codeLower) batchCodesSet.add(codeLower);

    toCreate.push({
      id: crypto.randomUUID(),
      name,
      code,
    });
  }

  // 2. Insertar los nuevos sectores en una transacción
  if (toCreate.length > 0) {
    await tenantPrisma.$transaction(
      toCreate.map((d) =>
        tenantPrisma.department.create({
          data: {
            id: d.id,
            name: d.name,
            code: d.code,
          },
        })
      )
    );
  }

  return {
    totalProcessed: departments.length,
    createdCount: toCreate.length,
    skippedCount: skipped.length,
    created: toCreate,
    skipped,
  };
}

export async function updateDepartment(tenantPrisma, id, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getDepartmentById(tenantPrisma, id);

  return tenantPrisma.department.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.code !== undefined ? { code: data.code } : {}),
    },
  });
}

export async function deleteDepartment(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const dept = await getDepartmentById(tenantPrisma, id);
  if (dept.employeeCount > 0) {
    const error = new Error(`No es posible eliminar el sector "${dept.name}" porque tiene ${dept.employeeCount} empleado(s) asignado(s). Por favor reasigna los empleados antes de darlo de baja.`);
    error.status = 400;
    throw error;
  }

  return tenantPrisma.department.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// --- PUESTOS DE TRABAJO (JOB POSITIONS) ---

export async function listJobPositions(tenantPrisma) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const positions = await tenantPrisma.jobPosition.findMany({
    where: { deletedAt: null },
    include: {
      cct: true,
      category: true,
      arcaPosition: true,
      serviceType: true,
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  return positions.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    cctCode: p.cctCode,
    cct: p.cct ? { code: p.cct.code, name: p.cct.name, sector: p.cct.sector } : null,
    categoryCode: p.categoryCode,
    category: p.category ? { code: p.category.code, name: p.category.name, cct: p.category.cct } : null,
    positionCode: p.positionCode,
    arcaPosition: p.arcaPosition ? { code: p.arcaPosition.code, name: p.arcaPosition.name, groupName: p.arcaPosition.groupName } : null,
    serviceTypeCode: p.serviceTypeCode,
    serviceType: p.serviceType ? { code: p.serviceType.code, name: p.serviceType.name, regime: p.serviceType.regime } : null,
    activityCode: p.activityCode || '049',
    employeeCount: p._count.employees,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
}

export async function getJobPositionById(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const position = await tenantPrisma.jobPosition.findFirst({
    where: { id, deletedAt: null },
    include: {
      cct: true,
      category: true,
      arcaPosition: true,
      serviceType: true,
      _count: {
        select: { employees: { where: { deletedAt: null } } },
      },
    },
  });

  if (!position) {
    const error = new Error('Puesto de trabajo no encontrado');
    error.status = 404;
    throw error;
  }

  return {
    ...position,
    activityCode: position.activityCode || '049',
    cct: position.cct ? { code: position.cct.code, name: position.cct.name, sector: position.cct.sector } : null,
    category: position.category ? { code: position.category.code, name: position.category.name, cct: position.category.cct } : null,
    arcaPosition: position.arcaPosition ? { code: position.arcaPosition.code, name: position.arcaPosition.name, groupName: position.arcaPosition.groupName } : null,
    serviceType: position.serviceType ? { code: position.serviceType.code, name: position.serviceType.name, regime: position.serviceType.regime } : null,
    employeeCount: position._count.employees,
  };
}

export async function createJobPosition(tenantPrisma, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  return tenantPrisma.jobPosition.create({
    data: {
      id: crypto.randomUUID(),
      name: data.name,
      code: data.code || null,
      cctCode: data.cctCode || null,
      categoryCode: data.categoryCode || null,
      positionCode: data.positionCode || null,
      serviceTypeCode: data.serviceTypeCode || null,
      activityCode: data.activityCode || '049',
    },
    include: {
      cct: true,
      category: true,
      arcaPosition: true,
      serviceType: true,
    },
  });
}

/**
 * Importa puestos de trabajo masivamente desde un listado (ej. Excel).
 * Obligatorio: código y nombre del puesto.
 * Opcionales: cctCode, categoryCode, positionCode, serviceTypeCode.
 * Agrega puestos nuevos y omite los que ya existen en la base de datos o en el lote.
 */
export async function importJobPositions(tenantPrisma, jobPositions) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  if (!Array.isArray(jobPositions) || jobPositions.length === 0) {
    const error = new Error('No se enviaron puestos de trabajo para importar');
    error.status = 400;
    throw error;
  }

  // 1. Obtener todos los puestos existentes activos
  const existingPositions = await tenantPrisma.jobPosition.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, code: true },
  });

  const existingNamesSet = new Set(
    existingPositions.map((p) => (p.name || '').trim().toLowerCase())
  );
  const existingCodesSet = new Set(
    existingPositions
      .filter((p) => p.code && p.code.trim())
      .map((p) => p.code.trim().toLowerCase())
  );

  // 2. Pre-cargar catálogos ARCA para validación referencial en caso de que vengan códigos opcionales
  const [ccts, categories, arcaPositions, serviceTypes] = await Promise.all([
    tenantPrisma.arcaCct.findMany({ select: { code: true } }),
    tenantPrisma.arcaCategory.findMany({ select: { code: true } }),
    tenantPrisma.arcaPosition.findMany({ select: { code: true } }),
    tenantPrisma.arcaServiceType.findMany({ select: { code: true } }),
  ]);

  const validCctCodes = new Set(ccts.map((c) => c.code.toLowerCase()));
  const validCategoryCodes = new Set(categories.map((c) => c.code.toLowerCase()));
  const validArcaPosCodes = new Set(arcaPositions.map((p) => p.code.toLowerCase()));
  const validServiceTypeCodes = new Set(serviceTypes.map((s) => s.code.toLowerCase()));

  const cctOriginalMap = new Map(ccts.map((c) => [c.code.toLowerCase(), c.code]));
  const categoryOriginalMap = new Map(categories.map((c) => [c.code.toLowerCase(), c.code]));
  const posOriginalMap = new Map(arcaPositions.map((p) => [p.code.toLowerCase(), p.code]));
  const servOriginalMap = new Map(serviceTypes.map((s) => [s.code.toLowerCase(), s.code]));

  const toCreate = [];
  const skipped = [];
  const batchNamesSet = new Set();
  const batchCodesSet = new Set();

  for (const item of jobPositions) {
    const code = (item.code || '').trim();
    const name = (item.name || '').trim();
    const rawCct = (item.cctCode || '').trim() || null;
    const rawCat = (item.categoryCode || '').trim() || null;
    const rawPos = (item.positionCode || '').trim() || null;
    const rawServ = (item.serviceTypeCode || '').trim() || null;

    // Validación: Código obligatorio
    if (!code) {
      skipped.push({
        code: '-',
        name: name || '(Sin denominación)',
        reason: 'El código del puesto es obligatorio',
      });
      continue;
    }

    // Validación: Nombre obligatorio (mínimo 2 caracteres)
    if (!name || name.length < 2) {
      skipped.push({
        code: code || '-',
        name: name || '(Sin denominación)',
        reason: 'El nombre del puesto es obligatorio y debe tener al menos 2 caracteres',
      });
      continue;
    }

    const nameLower = name.toLowerCase();
    const codeLower = code.toLowerCase();

    // Verificar si ya existe en base de datos por código
    if (existingCodesSet.has(codeLower)) {
      skipped.push({
        code,
        name,
        reason: `Ya se encuentra registrado en el sistema con el código "${code}"`,
      });
      continue;
    }

    // Verificar si ya existe en base de datos por nombre
    if (existingNamesSet.has(nameLower)) {
      skipped.push({
        code,
        name,
        reason: `Ya se encuentra registrado en el sistema con el nombre "${name}"`,
      });
      continue;
    }

    // Verificar duplicados dentro del mismo lote del archivo
    if (batchCodesSet.has(codeLower)) {
      skipped.push({
        code,
        name,
        reason: `Código "${code}" repetido dentro del mismo archivo Excel`,
      });
      continue;
    }

    if (batchNamesSet.has(nameLower)) {
      skipped.push({
        code,
        name,
        reason: `Nombre "${name}" repetido dentro del mismo archivo Excel`,
      });
      continue;
    }

    // Validar claves foráneas opcionales si vienen informadas
    let finalCct = null;
    if (rawCct) {
      if (!validCctCodes.has(rawCct.toLowerCase())) {
        skipped.push({
          code,
          name,
          reason: `El código de convenio CCT "${rawCct}" no existe en el catálogo oficial ARCA`,
        });
        continue;
      }
      finalCct = cctOriginalMap.get(rawCct.toLowerCase());
    }

    let finalCat = null;
    if (rawCat) {
      if (!validCategoryCodes.has(rawCat.toLowerCase())) {
        skipped.push({
          code,
          name,
          reason: `El código de categoría "${rawCat}" no existe en el catálogo oficial ARCA`,
        });
        continue;
      }
      finalCat = categoryOriginalMap.get(rawCat.toLowerCase());
    }

    let finalPos = null;
    if (rawPos) {
      if (!validArcaPosCodes.has(rawPos.toLowerCase())) {
        skipped.push({
          code,
          name,
          reason: `El código de puesto ARCA "${rawPos}" no existe en el catálogo oficial`,
        });
        continue;
      }
      finalPos = posOriginalMap.get(rawPos.toLowerCase());
    }

    let finalServ = null;
    if (rawServ) {
      if (!validServiceTypeCodes.has(rawServ.toLowerCase())) {
        skipped.push({
          code,
          name,
          reason: `El código de tipo de servicio ARCA "${rawServ}" no existe en el catálogo oficial`,
        });
        continue;
      }
      finalServ = servOriginalMap.get(rawServ.toLowerCase());
    }

    batchCodesSet.add(codeLower);
    batchNamesSet.add(nameLower);

    toCreate.push({
      id: crypto.randomUUID(),
      code: code.toUpperCase(),
      name,
      cctCode: finalCct,
      categoryCode: finalCat,
      positionCode: finalPos,
      serviceTypeCode: finalServ,
      activityCode: item.activityCode ? item.activityCode.trim() : '049',
    });
  }

  // 3. Insertar los nuevos puestos en una transacción
  if (toCreate.length > 0) {
    await tenantPrisma.$transaction(
      toCreate.map((p) =>
        tenantPrisma.jobPosition.create({
          data: {
            id: p.id,
            code: p.code,
            name: p.name,
            cctCode: p.cctCode,
            categoryCode: p.categoryCode,
            positionCode: p.positionCode,
            serviceTypeCode: p.serviceTypeCode,
            activityCode: p.activityCode || '049',
          },
        })
      )
    );
  }

  return {
    totalProcessed: jobPositions.length,
    createdCount: toCreate.length,
    skippedCount: skipped.length,
    created: toCreate,
    skipped,
  };
}


export async function updateJobPosition(tenantPrisma, id, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getJobPositionById(tenantPrisma, id);

  return tenantPrisma.jobPosition.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.code !== undefined ? { code: data.code } : {}),
      ...(data.cctCode !== undefined ? { cctCode: data.cctCode || null } : {}),
      ...(data.categoryCode !== undefined ? { categoryCode: data.categoryCode || null } : {}),
      ...(data.positionCode !== undefined ? { positionCode: data.positionCode || null } : {}),
      ...(data.serviceTypeCode !== undefined ? { serviceTypeCode: data.serviceTypeCode || null } : {}),
      ...(data.activityCode !== undefined ? { activityCode: data.activityCode || '049' } : {}),
    },
    include: {
      cct: true,
      category: true,
      arcaPosition: true,
      serviceType: true,
    },
  });
}

export async function deleteJobPosition(tenantPrisma, id) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const pos = await getJobPositionById(tenantPrisma, id);
  if (pos.employeeCount > 0) {
    const error = new Error(`No es posible eliminar el puesto "${pos.name}" porque tiene ${pos.employeeCount} empleado(s) asignado(s). Por favor reasigna los empleados antes de darlo de baja.`);
    error.status = 400;
    throw error;
  }

  return tenantPrisma.jobPosition.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// --- CATÁLOGOS ARCA (SIMPLIFICACIÓN REGISTRAL) ---

export async function listArcaCcts(tenantPrisma, { search = '', limit } = {}) {
  await ensureTenantPersonnelSchema(tenantPrisma);
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
  return tenantPrisma.arcaCct.findMany(queryOptions);
}

export async function listArcaCategories(tenantPrisma, { search = '', limit = 200, cctCode } = {}) {
  await ensureTenantPersonnelSchema(tenantPrisma);
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
      const relations = await tenantPrisma.arcaCctCategoryPosition.findMany({
        where: { cctCode: trimmedCct },
        select: { categoryCode: true },
        distinct: ['categoryCode'],
      });
      const categoryCodes = relations.map((r) => r.categoryCode);
      if (categoryCodes.length > 0) {
        conditions.push({ code: { in: categoryCodes } });
      } else {
        // Fallback si no hay matriz explícita: buscar por campo cct
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

  const queryOptions = {
    where,
    orderBy: [{ code: 'asc' }],
  };

  const effectiveLimit = cctCode && (!limit || limit === 200) ? 500 : limit;
  if (effectiveLimit && effectiveLimit !== 'all' && Number(effectiveLimit) > 0) {
    queryOptions.take = Number(effectiveLimit);
  }

  return tenantPrisma.arcaCategory.findMany(queryOptions);
}

export async function listArcaPositions(tenantPrisma, { search = '', limit, cctCode } = {}) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const conditions = [];

  if (cctCode && cctCode.trim()) {
    const trimmedCct = cctCode.trim();
    if (trimmedCct.toUpperCase() !== 'FC') {
      const relations = await tenantPrisma.arcaCctCategoryPosition.findMany({
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

  return tenantPrisma.arcaPosition.findMany(queryOptions);
}

export async function listArcaServiceTypes(tenantPrisma) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  return tenantPrisma.arcaServiceType.findMany({
    orderBy: { code: 'asc' },
  });
}

export async function listArcaContractModalities(tenantPrisma, { search = '', onlyActive = false } = {}) {
  await ensureTenantPersonnelSchema(tenantPrisma);
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

  return tenantPrisma.arcaContractModality.findMany({
    where,
    orderBy: [
      { isActive: 'desc' },
      { code: 'asc' },
    ],
  });
}

export async function listArcaActivities() {
  return getArcaActivitiesData();
}


