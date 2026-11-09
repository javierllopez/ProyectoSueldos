import crypto from 'node:crypto';
import { ensureTenantDisciplinarySchema } from '../../services/tenantProvisioner.service.js';

function parseAttachments(raw) {
  if (!raw) return [];
  let arr = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      arr = Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      arr = [];
    }
  }
  return arr.map((att) => {
    const resolvedName = String(att.fileName || att.name || 'documento').trim();
    const resolvedSize = Number(att.sizeBytes ?? att.size) || 0;
    return {
      ...att,
      name: resolvedName,
      fileName: resolvedName,
      size: resolvedSize,
      sizeBytes: resolvedSize,
    };
  });
}

function normalizeAttachments(attachments = []) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((att) => {
    const resolvedName = String(att.fileName || att.name || 'documento').trim();
    const resolvedSize = Number(att.sizeBytes ?? att.size) || 0;
    return {
      id: att.id || crypto.randomUUID(),
      name: resolvedName,
      fileName: resolvedName,
      mimeType: String(att.mimeType || 'application/octet-stream').trim(),
      size: resolvedSize,
      sizeBytes: resolvedSize,
      dataUrl: String(att.dataUrl || ''),
      uploadedAt: att.uploadedAt || new Date().toISOString(),
    };
  });
}

function parseDateStart(dateStr) {
  const clean = String(dateStr).slice(0, 10);
  return new Date(`${clean}T00:00:00.000Z`);
}

function parseDateEnd(dateStr) {
  const clean = String(dateStr).slice(0, 10);
  return new Date(`${clean}T23:59:59.999Z`);
}

function parseEventDate(dateStr) {
  const clean = String(dateStr).slice(0, 10);
  return new Date(`${clean}T12:00:00.000Z`);
}

function buildTimeBuckets(dateFrom, dateTo) {
  const start = parseDateStart(dateFrom);
  const end = parseDateEnd(dateTo);
  const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const granularity = diffDays <= 45 ? 'DAY' : 'MONTH';
  const buckets = [];

  if (granularity === 'DAY') {
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const limit = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    while (cursor <= limit) {
      const yyyy = cursor.getUTCFullYear();
      const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(cursor.getUTCDate()).padStart(2, '0');
      buckets.push({
        key: `${yyyy}-${mm}-${dd}`,
        label: `${dd}/${mm}/${yyyy}`,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  } else {
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const limit = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    while (cursor <= limit) {
      const yyyy = cursor.getUTCFullYear();
      const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0');
      buckets.push({
        key: `${yyyy}-${mm}`,
        label: `${mm}/${yyyy}`,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  return { granularity, buckets };
}

function getBucketKey(dateVal, granularity) {
  const d = new Date(dateVal);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  if (granularity === 'DAY') {
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return `${yyyy}-${mm}`;
}

// ============================================================================
// 1. ABM DE TIPOS DE INCIDENTES
// ============================================================================

export async function listIncidentTypes(tenantPrisma, { search = '', includeInactive = true } = {}) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const where = { deletedAt: null };
  if (!includeInactive) {
    where.isActive = true;
  }
  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { name: { contains: q } },
      { code: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const items = await tenantPrisma.incidentType.findMany({
    where,
    include: {
      _count: {
        select: {
          incidents: { where: { deletedAt: null } },
        },
      },
    },
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
  });

  return items.map((it) => ({
    ...it,
    incidentsCount: it._count?.incidents || 0,
  }));
}

export async function createIncidentType(tenantPrisma, data) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  return tenantPrisma.incidentType.create({
    data: {
      code: data.code || null,
      name: data.name,
      severity: data.severity || 'MEDIUM',
      description: data.description || null,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    },
  });
}

export async function updateIncidentType(tenantPrisma, id, data) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const existing = await tenantPrisma.incidentType.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    const err = new Error('Tipo de incidente no encontrado');
    err.status = 404;
    throw err;
  }

  return tenantPrisma.incidentType.update({
    where: { id },
    data: {
      ...(data.code !== undefined ? { code: data.code || null } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.severity !== undefined ? { severity: data.severity } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.isActive !== undefined ? { isActive: Boolean(data.isActive) } : {}),
    },
  });
}

export async function deleteIncidentType(tenantPrisma, id) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const existing = await tenantPrisma.incidentType.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    const err = new Error('Tipo de incidente no encontrado');
    err.status = 404;
    throw err;
  }

  return tenantPrisma.incidentType.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

// ============================================================================
// 2. ABM DE TIPOS DE SANCIONES
// ============================================================================

export async function listSanctionTypes(tenantPrisma, { search = '', includeInactive = true } = {}) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const where = { deletedAt: null };
  if (!includeInactive) {
    where.isActive = true;
  }
  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { name: { contains: q } },
      { code: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const items = await tenantPrisma.sanctionType.findMany({
    where,
    include: {
      _count: {
        select: {
          sanctions: { where: { deletedAt: null } },
        },
      },
    },
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
  });

  return items.map((st) => ({
    ...st,
    sanctionsCount: st._count?.sanctions || 0,
  }));
}

export async function createSanctionType(tenantPrisma, data) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  return tenantPrisma.sanctionType.create({
    data: {
      code: data.code || null,
      name: data.name,
      requiresSuspensionDays: Boolean(data.requiresSuspensionDays),
      description: data.description || null,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    },
  });
}

export async function updateSanctionType(tenantPrisma, id, data) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const existing = await tenantPrisma.sanctionType.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    const err = new Error('Tipo de sanción no encontrado');
    err.status = 404;
    throw err;
  }

  return tenantPrisma.sanctionType.update({
    where: { id },
    data: {
      ...(data.code !== undefined ? { code: data.code || null } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.requiresSuspensionDays !== undefined
        ? { requiresSuspensionDays: Boolean(data.requiresSuspensionDays) }
        : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.isActive !== undefined ? { isActive: Boolean(data.isActive) } : {}),
    },
  });
}

export async function deleteSanctionType(tenantPrisma, id) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const existing = await tenantPrisma.sanctionType.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    const err = new Error('Tipo de sanción no encontrado');
    err.status = 404;
    throw err;
  }

  return tenantPrisma.sanctionType.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

// ============================================================================
// 3. NOVEDADES: REGISTRO DE INCIDENTES DEL PERSONAL
// ============================================================================

export async function listIncidents(
  tenantPrisma,
  { employeeId, incidentTypeId, dateFrom, dateTo, sanctionedStatus = 'ALL', search = '' } = {}
) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const where = { deletedAt: null };
  if (employeeId && employeeId !== 'ALL') {
    where.employeeId = employeeId;
  }
  if (incidentTypeId && incidentTypeId !== 'ALL') {
    where.incidentTypeId = incidentTypeId;
  }
  if (dateFrom || dateTo) {
    where.incidentDate = {};
    if (dateFrom) where.incidentDate.gte = parseDateStart(dateFrom);
    if (dateTo) where.incidentDate.lte = parseDateEnd(dateTo);
  }
  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { observations: { contains: q } },
      { incidentType: { name: { contains: q } } },
      { employee: { lastName: { contains: q } } },
      { employee: { firstName: { contains: q } } },
      { employee: { fileNumber: { contains: q } } },
    ];
  }

  const rows = await tenantPrisma.employeeIncident.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          fileNumber: true,
          lastName: true,
          firstName: true,
          cuil: true,
          department: { select: { id: true, name: true } },
          jobPosition: { select: { id: true, name: true } },
        },
      },
      incidentType: true,
      sanctionLinks: {
        where: { sanction: { deletedAt: null } },
        include: {
          sanction: {
            include: {
              sanctionType: true,
            },
          },
        },
      },
    },
    orderBy: [{ incidentDate: 'desc' }, { createdAt: 'desc' }],
  });

  const mapped = rows.map((row) => {
    const activeSanctions = (row.sanctionLinks || [])
      .map((l) => l.sanction)
      .filter((s) => s && !s.deletedAt);
    const attachments = parseAttachments(row.attachments);
    return {
      id: row.id,
      employeeId: row.employeeId,
      incidentTypeId: row.incidentTypeId,
      incidentDate: row.incidentDate,
      observations: row.observations || '',
      attachments,
      attachmentsCount: attachments.length,
      employee: row.employee,
      incidentType: row.incidentType,
      isSanctioned: activeSanctions.length > 0,
      sanctions: activeSanctions.map((s) => ({
        id: s.id,
        sanctionDate: s.sanctionDate,
        sanctionTypeName: s.sanctionType?.name || 'Sanción',
        sanctionTypeCode: s.sanctionType?.code || '',
      })),
      linkedSanctions: activeSanctions.map((s) => ({
        id: s.id,
        sanctionDate: s.sanctionDate,
        sanctionTypeName: s.sanctionType?.name || 'Sanción',
        sanctionTypeCode: s.sanctionType?.code || '',
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  if (sanctionedStatus === 'SANCTIONED') {
    return mapped.filter((m) => m.isSanctioned);
  }
  if (sanctionedStatus === 'UNSANCTIONED') {
    return mapped.filter((m) => !m.isSanctioned);
  }
  return mapped;
}

export async function createIncident(tenantPrisma, data) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const [emp, incType] = await Promise.all([
    tenantPrisma.employee.findFirst({ where: { id: data.employeeId, deletedAt: null } }),
    tenantPrisma.incidentType.findFirst({ where: { id: data.incidentTypeId, deletedAt: null } }),
  ]);

  if (!emp) {
    const err = new Error('El colaborador seleccionado no existe');
    err.status = 404;
    throw err;
  }
  if (!incType) {
    const err = new Error('El tipo de incidente seleccionado no existe');
    err.status = 404;
    throw err;
  }

  const created = await tenantPrisma.employeeIncident.create({
    data: {
      employeeId: data.employeeId,
      incidentTypeId: data.incidentTypeId,
      incidentDate: parseEventDate(data.incidentDate),
      observations: data.observations || null,
      attachments: normalizeAttachments(data.attachments),
    },
    include: {
      employee: {
        select: { id: true, fileNumber: true, lastName: true, firstName: true, cuil: true },
      },
      incidentType: true,
    },
  });

  return {
    ...created,
    attachments: parseAttachments(created.attachments),
  };
}

export async function updateIncident(tenantPrisma, id, data) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const existing = await tenantPrisma.employeeIncident.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    const err = new Error('Incidente no encontrado');
    err.status = 404;
    throw err;
  }

  const updated = await tenantPrisma.employeeIncident.update({
    where: { id },
    data: {
      ...(data.employeeId ? { employeeId: data.employeeId } : {}),
      ...(data.incidentTypeId ? { incidentTypeId: data.incidentTypeId } : {}),
      ...(data.incidentDate ? { incidentDate: parseEventDate(data.incidentDate) } : {}),
      ...(data.observations !== undefined ? { observations: data.observations || null } : {}),
      ...(data.attachments !== undefined
        ? { attachments: normalizeAttachments(data.attachments) }
        : {}),
    },
    include: {
      employee: {
        select: { id: true, fileNumber: true, lastName: true, firstName: true, cuil: true },
      },
      incidentType: true,
    },
  });

  return {
    ...updated,
    attachments: parseAttachments(updated.attachments),
  };
}

export async function deleteIncident(tenantPrisma, id) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const existing = await tenantPrisma.employeeIncident.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    const err = new Error('Incidente no encontrado');
    err.status = 404;
    throw err;
  }

  await tenantPrisma.$transaction([
    tenantPrisma.sanctionIncidentLink.deleteMany({ where: { incidentId: id } }),
    tenantPrisma.employeeIncident.update({
      where: { id },
      data: { deletedAt: new Date() },
    }),
  ]);

  return { id, deleted: true };
}

// ============================================================================
// 4. NOVEDADES: REGISTRO DE SANCIONES EMITIDAS
// ============================================================================

export async function listSanctions(
  tenantPrisma,
  { employeeId, sanctionTypeId, dateFrom, dateTo, search = '' } = {}
) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const where = { deletedAt: null };
  if (employeeId && employeeId !== 'ALL') {
    where.employeeId = employeeId;
  }
  if (sanctionTypeId && sanctionTypeId !== 'ALL') {
    where.sanctionTypeId = sanctionTypeId;
  }
  if (dateFrom || dateTo) {
    where.sanctionDate = {};
    if (dateFrom) where.sanctionDate.gte = parseDateStart(dateFrom);
    if (dateTo) where.sanctionDate.lte = parseDateEnd(dateTo);
  }
  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { observations: { contains: q } },
      { sanctionType: { name: { contains: q } } },
      { employee: { lastName: { contains: q } } },
      { employee: { firstName: { contains: q } } },
      { employee: { fileNumber: { contains: q } } },
    ];
  }

  const rows = await tenantPrisma.employeeSanction.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          fileNumber: true,
          lastName: true,
          firstName: true,
          cuil: true,
          department: { select: { id: true, name: true } },
          jobPosition: { select: { id: true, name: true } },
        },
      },
      sanctionType: true,
      incidentLinks: {
        where: { incident: { deletedAt: null } },
        include: {
          incident: {
            include: {
              incidentType: true,
            },
          },
        },
      },
    },
    orderBy: [{ sanctionDate: 'desc' }, { createdAt: 'desc' }],
  });

  return rows.map((row) => {
    const linkedIncidents = (row.incidentLinks || [])
      .map((l) => l.incident)
      .filter((inc) => inc && !inc.deletedAt)
      .map((inc) => ({
        id: inc.id,
        incidentDate: inc.incidentDate,
        incidentTypeId: inc.incidentTypeId,
        incidentType: inc.incidentType,
        incidentTypeName: inc.incidentType?.name || 'Incidente',
        incidentTypeCode: inc.incidentType?.code || '',
        observations: inc.observations || '',
      }));

    const attachments = parseAttachments(row.attachments);
    return {
      id: row.id,
      employeeId: row.employeeId,
      sanctionTypeId: row.sanctionTypeId,
      sanctionDate: row.sanctionDate,
      suspensionDays: row.suspensionDays,
      observations: row.observations || '',
      attachments,
      attachmentsCount: attachments.length,
      employee: row.employee,
      sanctionType: row.sanctionType,
      linkedIncidents,
      incidentIds: linkedIncidents.map((i) => i.id),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
}

async function validateIncidentOwnership(tenantPrisma, employeeId, incidentIds = []) {
  const uniqueIds = [...new Set((incidentIds || []).filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const found = await tenantPrisma.employeeIncident.findMany({
    where: {
      id: { in: uniqueIds },
      employeeId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (found.length !== uniqueIds.length) {
    const err = new Error(
      'Uno o más incidentes seleccionados no existen o no pertenecen al colaborador indicado.'
    );
    err.status = 400;
    throw err;
  }

  return uniqueIds;
}

export async function createSanction(tenantPrisma, data) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const [emp, sanType] = await Promise.all([
    tenantPrisma.employee.findFirst({ where: { id: data.employeeId, deletedAt: null } }),
    tenantPrisma.sanctionType.findFirst({ where: { id: data.sanctionTypeId, deletedAt: null } }),
  ]);

  if (!emp) {
    const err = new Error('El colaborador seleccionado no existe');
    err.status = 404;
    throw err;
  }
  if (!sanType) {
    const err = new Error('El tipo de sanción seleccionado no existe');
    err.status = 404;
    throw err;
  }

  const validIncidentIds = await validateIncidentOwnership(
    tenantPrisma,
    data.employeeId,
    data.incidentIds
  );

  return tenantPrisma.$transaction(async (tx) => {
    const created = await tx.employeeSanction.create({
      data: {
        employeeId: data.employeeId,
        sanctionTypeId: data.sanctionTypeId,
        sanctionDate: parseEventDate(data.sanctionDate),
        suspensionDays:
          data.suspensionDays !== undefined && data.suspensionDays !== null
            ? Number(data.suspensionDays)
            : null,
        observations: data.observations || null,
        attachments: normalizeAttachments(data.attachments),
      },
    });

    if (validIncidentIds.length > 0) {
      await tx.sanctionIncidentLink.createMany({
        data: validIncidentIds.map((incidentId) => ({
          sanctionId: created.id,
          incidentId,
        })),
      });
    }

    return created;
  });
}

export async function updateSanction(tenantPrisma, id, data) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const existing = await tenantPrisma.employeeSanction.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    const err = new Error('Sanción no encontrada');
    err.status = 404;
    throw err;
  }

  const targetEmpId = data.employeeId || existing.employeeId;
  let validIncidentIds = null;
  if (data.incidentIds !== undefined) {
    validIncidentIds = await validateIncidentOwnership(
      tenantPrisma,
      targetEmpId,
      data.incidentIds
    );
  }

  return tenantPrisma.$transaction(async (tx) => {
    const updated = await tx.employeeSanction.update({
      where: { id },
      data: {
        ...(data.employeeId ? { employeeId: data.employeeId } : {}),
        ...(data.sanctionTypeId ? { sanctionTypeId: data.sanctionTypeId } : {}),
        ...(data.sanctionDate ? { sanctionDate: parseEventDate(data.sanctionDate) } : {}),
        ...(data.suspensionDays !== undefined
          ? {
              suspensionDays:
                data.suspensionDays !== null && data.suspensionDays !== ''
                  ? Number(data.suspensionDays)
                  : null,
            }
          : {}),
        ...(data.observations !== undefined ? { observations: data.observations || null } : {}),
        ...(data.attachments !== undefined
          ? { attachments: normalizeAttachments(data.attachments) }
          : {}),
      },
    });

    if (validIncidentIds !== null) {
      await tx.sanctionIncidentLink.deleteMany({ where: { sanctionId: id } });
      if (validIncidentIds.length > 0) {
        await tx.sanctionIncidentLink.createMany({
          data: validIncidentIds.map((incidentId) => ({
            sanctionId: id,
            incidentId,
          })),
        });
      }
    }

    return updated;
  });
}

export async function deleteSanction(tenantPrisma, id) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const existing = await tenantPrisma.employeeSanction.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    const err = new Error('Sanción no encontrada');
    err.status = 404;
    throw err;
  }

  await tenantPrisma.$transaction([
    tenantPrisma.sanctionIncidentLink.deleteMany({ where: { sanctionId: id } }),
    tenantPrisma.employeeSanction.update({
      where: { id },
      data: { deletedAt: new Date() },
    }),
  ]);

  return { id, deleted: true };
}

// ============================================================================
// 5. HISTORIAL DISCIPLINARIO UNIFICADO POR COLABORADOR (ORDEN INVERSO POR FECHA)
// ============================================================================

export async function getEmployeeDisciplinaryHistory(tenantPrisma, employeeId, companyContext = {}) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const [employee, companyProfile, incidents, sanctions] = await Promise.all([
    tenantPrisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      include: {
        department: true,
        jobPosition: true,
      },
    }),
    tenantPrisma.companyProfile.findFirst({ where: { deletedAt: null } }),
    listIncidents(tenantPrisma, { employeeId }),
    listSanctions(tenantPrisma, { employeeId }),
  ]);

  if (!employee) {
    const err = new Error('Colaborador no encontrado');
    err.status = 404;
    throw err;
  }

  const timeline = [];

  incidents.forEach((inc) => {
    timeline.push({
      id: inc.id,
      kind: 'INCIDENT',
      recordKind: 'INCIDENT',
      eventDate: inc.incidentDate,
      createdAt: inc.createdAt,
      typeCode: inc.incidentType?.code || '',
      typeName: inc.incidentType?.name || 'Incidente',
      severity: inc.incidentType?.severity || 'MEDIUM',
      isSanctioned: inc.isSanctioned,
      sanctions: (inc.linkedSanctions || []).map((s) => ({
        id: s.id,
        date: s.sanctionDate,
        typeCode: s.sanctionTypeCode,
        typeName: s.sanctionTypeName,
      })),
      suspensionDays: null,
      observations: inc.observations || '',
      attachments: inc.attachments || [],
      attachmentsCount: inc.attachmentsCount || 0,
      relatedSummary:
        inc.linkedSanctions && inc.linkedSanctions.length > 0
          ? inc.linkedSanctions
              .map(
                (s) =>
                  `Sanción: ${s.sanctionTypeName} (${new Date(s.sanctionDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })})`
              )
              .join(' | ')
          : 'Sin sanción aplicada',
    });
  });

  sanctions.forEach((san) => {
    timeline.push({
      id: san.id,
      kind: 'SANCTION',
      recordKind: 'SANCTION',
      eventDate: san.sanctionDate,
      createdAt: san.createdAt,
      typeCode: san.sanctionType?.code || '',
      typeName: san.sanctionType?.name || 'Sanción',
      severity: san.sanctionType?.severity || 'MEDIUM',
      isSanctioned: true,
      suspensionDays: san.suspensionDays,
      linkedIncidents: (san.linkedIncidents || []).map((i) => ({
        id: i.id,
        date: i.incidentDate,
        typeCode: i.incidentTypeCode,
        typeName: i.incidentTypeName,
      })),
      observations: san.observations || '',
      attachments: san.attachments || [],
      attachmentsCount: san.attachmentsCount || 0,
      relatedSummary:
        san.linkedIncidents && san.linkedIncidents.length > 0
          ? san.linkedIncidents
              .map(
                (i) =>
                  `Incidente: ${i.incidentTypeName} (${new Date(i.incidentDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })})`
              )
              .join(' | ')
          : 'Sanción directa (sin incidente vinculado)',
    });
  });

  timeline.sort((a, b) => {
    const diffDate = new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
    if (diffDate !== 0) return diffDate;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return {
    company: {
      name: companyProfile?.legalName || companyContext?.name || 'EMPRESA',
      legalName: companyProfile?.legalName || companyContext?.name || 'EMPRESA',
      cuit: companyProfile?.cuit || companyContext?.cuit || '',
      address: companyProfile?.address || '',
    },
    employee: {
      id: employee.id,
      fileNumber: employee.fileNumber,
      lastName: employee.lastName,
      firstName: employee.firstName,
      cuil: employee.cuil,
      hireDate: employee.hireDate,
      status: employee.status,
      department: employee.department?.name || 'Sin Sector',
      departmentName: employee.department?.name || 'Sin Sector',
      jobPosition: employee.jobPosition?.name || 'Sin Puesto',
      jobPositionName: employee.jobPosition?.name || 'Sin Puesto',
    },
    summary: {
      totalEvents: timeline.length,
      totalIncidents: incidents.length,
      sanctionedIncidents: incidents.filter((i) => i.isSanctioned).length,
      unsanctionedIncidents: incidents.filter((i) => !i.isSanctioned).length,
      totalSanctions: sanctions.length,
      totalSuspensionDays: sanctions.reduce((acc, s) => acc + (Number(s.suspensionDays) || 0), 0),
    },
    history: timeline,
    timeline,
  };
}

// ============================================================================
// 6. MOTOR DE LOS 4 INFORMES DE INCIDENTES Y SANCIONES
// ============================================================================

export async function executeDisciplinaryReport(tenantPrisma, params, companyContext = {}) {
  await ensureTenantDisciplinarySchema(tenantPrisma);

  const { reportType, dateFrom, dateTo, employeeId, typeId } = params;
  const companyProfile = await tenantPrisma.companyProfile.findFirst({ where: { deletedAt: null } });

  const companyInfo = {
    name: companyProfile?.legalName || companyContext?.name || 'EMPRESA',
    legalName: companyProfile?.legalName || companyContext?.name || 'EMPRESA',
    cuit: companyProfile?.cuit || companyContext?.cuit || '',
    address: companyProfile?.address || '',
  };

  let employeeFilter = null;
  if (employeeId && employeeId !== 'ALL') {
    employeeFilter = await tenantPrisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { id: true, fileNumber: true, lastName: true, firstName: true, cuil: true },
    });
  }

  if (reportType === 'INCIDENTS_DETAIL' || reportType === 'INCIDENTS_STATS') {
    const incidents = await listIncidents(tenantPrisma, {
      employeeId: employeeId || 'ALL',
      incidentTypeId: typeId || 'ALL',
      dateFrom,
      dateTo,
    });

    // Ordenar cronológicamente ascendente para detalles y series
    const chronological = [...incidents].sort(
      (a, b) => new Date(a.incidentDate).getTime() - new Date(b.incidentDate).getTime()
    );

    if (reportType === 'INCIDENTS_DETAIL') {
      const groupMap = new Map();
      chronological.forEach((inc) => {
        const key = inc.incidentTypeId;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            typeId: key,
            code: inc.incidentType?.code || '',
            incidentTypeCode: inc.incidentType?.code || '',
            name: inc.incidentType?.name || 'Sin Clasificar',
            incidentTypeName: inc.incidentType?.name || 'Sin Clasificar',
            severity: inc.incidentType?.severity || 'MEDIUM',
            items: [],
            count: 0,
            totalCount: 0,
            sanctionedCount: 0,
            unsanctionedCount: 0,
          });
        }
        const g = groupMap.get(key);
        g.items.push({
          ...inc,
          fileNumber: inc.employee?.fileNumber || '-',
          employeeName: `${inc.employee?.lastName || ''}, ${inc.employee?.firstName || ''}`,
          departmentName: inc.employee?.department?.name || '-',
          sanctionsText: (inc.linkedSanctions || []).map((s) => s.sanctionTypeName).join(', '),
        });
        g.count += 1;
        g.totalCount += 1;
        if (inc.isSanctioned) g.sanctionedCount += 1;
        else g.unsanctionedCount += 1;
      });

      const groups = Array.from(groupMap.values()).sort((a, b) =>
        String(a.name).localeCompare(String(b.name), 'es')
      );

      const totalIncidents = chronological.length;
      const sanctionedTotal = chronological.filter((i) => i.isSanctioned).length;

      return {
        reportType,
        title: 'Detalle de Incidentes Registrados por Tipo de Incidente',
        dateFrom: String(dateFrom).slice(0, 10),
        dateTo: String(dateTo).slice(0, 10),
        parameters: {
          dateFrom: String(dateFrom).slice(0, 10),
          dateTo: String(dateTo).slice(0, 10),
          employeeId: employeeId || 'ALL',
        },
        employeeFilter,
        company: companyInfo,
        totalCount: totalIncidents,
        totals: {
          totalIncidents,
          totalGroups: groups.length,
          sanctionedCount: sanctionedTotal,
          unsanctionedCount: totalIncidents - sanctionedTotal,
        },
        groups,
      };
    }

    // REPORT 2: INCIDENTS_STATS
    const allIncidentTypes = await listIncidentTypes(tenantPrisma, { includeInactive: true });
    const total = chronological.length;
    const sanctionedCount = chronological.filter((i) => i.isSanctioned).length;
    const unsanctionedCount = total - sanctionedCount;
    const sanctionedPct = total > 0 ? Number(((sanctionedCount / total) * 100).toFixed(2)) : 0;
    const unsanctionedPct = total > 0 ? Number(((unsanctionedCount / total) * 100).toFixed(2)) : 0;

    const countByType = new Map();
    chronological.forEach((inc) => {
      const key = inc.incidentTypeId;
      if (!countByType.has(key)) {
        countByType.set(key, {
          typeId: key,
          code: inc.incidentType?.code || '',
          name: inc.incidentType?.name || 'Sin Clasificar',
          severity: inc.incidentType?.severity || 'MEDIUM',
          count: 0,
          sanctionedCount: 0,
          unsanctionedCount: 0,
        });
      }
      const entry = countByType.get(key);
      entry.count += 1;
      if (inc.isSanctioned) entry.sanctionedCount += 1;
      else entry.unsanctionedCount += 1;
    });

    const byType = Array.from(countByType.values())
      .map((item) => ({
        ...item,
        percentage: total > 0 ? Number(((item.count / total) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));

    const { granularity, buckets } = buildTimeBuckets(dateFrom, dateTo);
    const activeTypesForSeries =
      byType.length > 0
        ? byType
        : allIncidentTypes.slice(0, 5).map((t) => ({
            typeId: t.id,
            code: t.code || '',
            name: t.name,
          }));

    const series = activeTypesForSeries.map((t) => {
      const bucketCounts = new Map(buckets.map((b) => [b.key, 0]));
      chronological
        .filter((inc) => inc.incidentTypeId === t.typeId)
        .forEach((inc) => {
          const bKey = getBucketKey(inc.incidentDate, granularity);
          if (bucketCounts.has(bKey)) {
            bucketCounts.set(bKey, bucketCounts.get(bKey) + 1);
          }
        });
      return {
        typeId: t.typeId,
        code: t.code,
        name: t.name,
        data: buckets.map((b) => bucketCounts.get(b.key) || 0),
      };
    });

    const categories = buckets.map((b) => b.label);

    return {
      reportType,
      title: 'Estadística, Distribución y Evolución de Incidentes en el Período',
      dateFrom: String(dateFrom).slice(0, 10),
      dateTo: String(dateTo).slice(0, 10),
      parameters: {
        dateFrom: String(dateFrom).slice(0, 10),
        dateTo: String(dateTo).slice(0, 10),
        employeeId: employeeId || 'ALL',
      },
      employeeFilter,
      company: companyInfo,
      totalCount: total,
      totals: {
        totalIncidents: total,
        sanctionedCount,
        sanctionedPct,
        unsanctionedCount,
        unsanctionedPct,
      },
      sanctionedDistribution: {
        sanctioned: sanctionedCount,
        unsanctioned: unsanctionedCount,
        sanctionedPct,
        unsanctionedPct,
      },
      byType,
      totalsByType: byType,
      evolution: {
        granularity,
        months: categories,
        series,
      },
      timeline: {
        granularity,
        categories,
        series,
      },
    };
  }

  // REPORT 3 & 4: SANCTIONS_DETAIL | SANCTIONS_STATS
  const sanctions = await listSanctions(tenantPrisma, {
    employeeId: employeeId || 'ALL',
    sanctionTypeId: typeId || 'ALL',
    dateFrom,
    dateTo,
  });

  const chronological = [...sanctions].sort(
    (a, b) => new Date(a.sanctionDate).getTime() - new Date(b.sanctionDate).getTime()
  );

  if (reportType === 'SANCTIONS_DETAIL') {
    const groupMap = new Map();
    chronological.forEach((san) => {
      const key = san.sanctionTypeId;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          typeId: key,
          code: san.sanctionType?.code || '',
          sanctionTypeCode: san.sanctionType?.code || '',
          name: san.sanctionType?.name || 'Sin Clasificar',
          sanctionTypeName: san.sanctionType?.name || 'Sin Clasificar',
          severity: san.sanctionType?.severity || 'MEDIUM',
          requiresSuspensionDays: Boolean(san.sanctionType?.requiresSuspensionDays),
          items: [],
          count: 0,
          totalCount: 0,
          totalSuspensionDays: 0,
        });
      }
      const g = groupMap.get(key);
      g.items.push({
        ...san,
        fileNumber: san.employee?.fileNumber || '-',
        employeeName: `${san.employee?.lastName || ''}, ${san.employee?.firstName || ''}`,
        departmentName: san.employee?.department?.name || '-',
        linkedIncidentsText: (san.linkedIncidents || [])
          .map(
            (i) =>
              `${new Date(i.incidentDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })} (${i.incidentTypeName})`
          )
          .join(', '),
      });
      g.count += 1;
      g.totalCount += 1;
      g.totalSuspensionDays += Number(san.suspensionDays) || 0;
    });

    const groups = Array.from(groupMap.values()).sort((a, b) =>
      String(a.name).localeCompare(String(b.name), 'es')
    );

    const totalSanctions = chronological.length;
    const totalSuspensionDays = chronological.reduce(
      (acc, s) => acc + (Number(s.suspensionDays) || 0),
      0
    );

    return {
      reportType,
      title: 'Detalle de Sanciones Disciplinarias Emitidas por Tipo de Sanción',
      dateFrom: String(dateFrom).slice(0, 10),
      dateTo: String(dateTo).slice(0, 10),
      parameters: {
        dateFrom: String(dateFrom).slice(0, 10),
        dateTo: String(dateTo).slice(0, 10),
        employeeId: employeeId || 'ALL',
      },
      employeeFilter,
      company: companyInfo,
      totalCount: totalSanctions,
      totals: {
        totalSanctions,
        totalGroups: groups.length,
        totalSuspensionDays,
      },
      groups,
    };
  }

  // REPORT 4: SANCTIONS_STATS
  const allSanctionTypes = await listSanctionTypes(tenantPrisma, { includeInactive: true });
  const total = chronological.length;
  const totalSuspensionDays = chronological.reduce(
    (acc, s) => acc + (Number(s.suspensionDays) || 0),
    0
  );

  const countByType = new Map();
  chronological.forEach((san) => {
    const key = san.sanctionTypeId;
    if (!countByType.has(key)) {
      countByType.set(key, {
        typeId: key,
        code: san.sanctionType?.code || '',
        name: san.sanctionType?.name || 'Sin Clasificar',
        count: 0,
        totalSuspensionDays: 0,
        withIncidentsCount: 0,
        withoutIncidentsCount: 0,
      });
    }
    const entry = countByType.get(key);
    entry.count += 1;
    entry.totalSuspensionDays += Number(san.suspensionDays) || 0;
    if (san.linkedIncidents && san.linkedIncidents.length > 0) {
      entry.withIncidentsCount += 1;
    } else {
      entry.withoutIncidentsCount += 1;
    }
  });

  const byType = Array.from(countByType.values())
    .map((item) => ({
      ...item,
      percentage: total > 0 ? Number(((item.count / total) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));

  const { granularity, buckets } = buildTimeBuckets(dateFrom, dateTo);
  const activeTypesForSeries =
    byType.length > 0
      ? byType
      : allSanctionTypes.slice(0, 5).map((t) => ({
          typeId: t.id,
          code: t.code || '',
          name: t.name,
        }));

  const series = activeTypesForSeries.map((t) => {
    const bucketCounts = new Map(buckets.map((b) => [b.key, 0]));
    chronological
      .filter((san) => san.sanctionTypeId === t.typeId)
      .forEach((san) => {
        const bKey = getBucketKey(san.sanctionDate, granularity);
        if (bucketCounts.has(bKey)) {
          bucketCounts.set(bKey, bucketCounts.get(bKey) + 1);
        }
      });
    return {
      typeId: t.typeId,
      code: t.code,
      name: t.name,
      data: buckets.map((b) => bucketCounts.get(b.key) || 0),
    };
  });

  const categories = buckets.map((b) => b.label);

  return {
    reportType,
    title: 'Estadística, Distribución y Evolución de Sanciones en el Período',
    dateFrom: String(dateFrom).slice(0, 10),
    dateTo: String(dateTo).slice(0, 10),
    parameters: {
      dateFrom: String(dateFrom).slice(0, 10),
      dateTo: String(dateTo).slice(0, 10),
      employeeId: employeeId || 'ALL',
    },
    employeeFilter,
    company: companyInfo,
    totalCount: total,
    totals: {
      totalSanctions: total,
      totalSuspensionDays,
      withIncidentsCount: chronological.filter((s) => s.linkedIncidents?.length > 0).length,
      withoutIncidentsCount: chronological.filter((s) => !s.linkedIncidents?.length).length,
    },
    byType,
    totalsByType: byType,
    evolution: {
      granularity,
      months: categories,
      series,
    },
    timeline: {
      granularity,
      categories,
      series,
    },
  };
}
