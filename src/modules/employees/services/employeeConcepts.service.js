import crypto from 'crypto';
import { ensureTenantPersonnelSchema, ensureTenantPayrollSchema } from '../../../services/tenantProvisioner.service.js';

/**
 * Lista los conceptos fijos/recurrentes asignados a un empleado.
 */
export async function listEmployeeConcepts(tenantPrisma, employeeId) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const employee = await tenantPrisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
  });
  if (!employee) {
    const error = new Error('Empleado no encontrado');
    error.status = 404;
    throw error;
  }

  const assignments = await tenantPrisma.employeeConcept.findMany({
    where: { employeeId },
    include: {
      concept: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // Identificar conceptos de embargos judiciales activos vinculados al colaborador
  const embargoConceptIds = new Set();
  try {
    const embargos = await tenantPrisma.employeeEmbargo.findMany({
      where: { employeeId, status: 'ACTIVE' },
      include: { concepts: true },
    });
    embargos.forEach((emb) => {
      (emb.concepts || []).forEach((c) => embargoConceptIds.add(c.conceptId));
    });
  } catch (err) {
    // Fallback seguro si la tabla aún no fue consultada
  }

  return assignments.map((asg) => ({
    ...asg,
    isEmbargo: Boolean(asg.concept?.isEmbargo) || embargoConceptIds.has(asg.conceptId),
  }));
}

/**
 * Asigna un concepto fijo o recurrente a un empleado.
 */
export async function assignEmployeeConcept(tenantPrisma, employeeId, conceptData) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const employee = await tenantPrisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
  });
  if (!employee) {
    const error = new Error('Empleado no encontrado');
    error.status = 404;
    throw error;
  }

  const concept = await tenantPrisma.concept.findFirst({
    where: { id: conceptData.conceptId, deletedAt: null },
  });
  if (!concept) {
    const error = new Error('El concepto seleccionado no existe');
    error.status = 400;
    throw error;
  }
  if (String(concept.scope || '').toUpperCase() !== 'INDIVIDUAL') {
    const error = new Error(`Solo pueden asignarse conceptos con alcance INDIVIDUAL. El concepto ${concept.code} es GENERAL.`);
    error.status = 400;
    throw error;
  }
  if (!concept.isPersistent) {
    const error = new Error(`El concepto ${concept.code} (${concept.name}) es no persistente. Debe gestionarse en Novedades No Persistentes.`);
    error.status = 400;
    throw error;
  }

  const existing = await tenantPrisma.employeeConcept.findUnique({
    where: {
      employeeId_conceptId: {
        employeeId,
        conceptId: conceptData.conceptId,
      },
    },
  });

  const payload = {
    amount: conceptData.amount !== undefined && conceptData.amount !== null && conceptData.amount !== '' ? Number(conceptData.amount) : null,
    units: conceptData.units !== undefined && conceptData.units !== null && conceptData.units !== '' ? Number(conceptData.units) : null,
    notes: conceptData.notes ? conceptData.notes.trim() : null,
    validFrom: conceptData.validFrom ? new Date(conceptData.validFrom) : null,
    validTo: conceptData.validTo ? new Date(conceptData.validTo) : null,
    isActive: conceptData.isActive ?? true,
  };

  if (existing) {
    return tenantPrisma.employeeConcept.update({
      where: { id: existing.id },
      data: payload,
      include: {
        concept: true,
      },
    });
  }

  return tenantPrisma.employeeConcept.create({
    data: {
      id: crypto.randomUUID(),
      employeeId,
      conceptId: conceptData.conceptId,
      ...payload,
    },
    include: {
      concept: true,
    },
  });
}

/**
 * Lista los empleados asignados a un concepto persistente específico.
 */
export async function listConceptAssignedEmployees(tenantPrisma, conceptId) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const assignments = await tenantPrisma.employeeConcept.findMany({
    where: { conceptId },
    include: {
      employee: {
        select: {
          id: true,
          fileNumber: true,
          firstName: true,
          lastName: true,
          cuil: true,
          status: true,
          basicSalary: true,
          department: { select: { id: true, name: true } },
          jobPosition: { select: { id: true, name: true, categoryCode: true } },
        },
      },
      concept: true,
    },
    orderBy: [
      { employee: { lastName: 'asc' } },
    ],
  });

  // Identificar colaboradores que tienen un embargo activo con este concepto
  const embargoEmpIds = new Set();
  try {
    const activeEmbargoConcepts = await tenantPrisma.employeeEmbargoConcept.findMany({
      where: {
        conceptId,
        embargo: { status: 'ACTIVE' },
      },
      select: { embargo: { select: { employeeId: true } } },
    });
    activeEmbargoConcepts.forEach((item) => {
      if (item.embargo?.employeeId) embargoEmpIds.add(item.embargo.employeeId);
    });
  } catch (err) {
    // Fallback seguro
  }

  return assignments.map((asg) => ({
    ...asg,
    isEmbargo: Boolean(asg.concept?.isEmbargo) || embargoEmpIds.has(asg.employee?.id || asg.employeeId),
  }));
}

/**
 * Asigna uno o más empleados a un concepto persistente.
 */
export async function assignConceptToEmployees(tenantPrisma, conceptId, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const concept = await tenantPrisma.concept.findUnique({ where: { id: conceptId } });
  if (!concept || concept.deletedAt) {
    const error = new Error('El concepto especificado no existe');
    error.status = 400;
    throw error;
  }
  if (String(concept.scope || '').toUpperCase() !== 'INDIVIDUAL') {
    const error = new Error(`Solo pueden asignarse conceptos con alcance INDIVIDUAL. El concepto ${concept.code} es GENERAL.`);
    error.status = 400;
    throw error;
  }
  if (!concept.isPersistent) {
    const error = new Error(`El concepto ${concept.code} (${concept.name}) es no persistente. Debe gestionarse en Novedades No Persistentes.`);
    error.status = 400;
    throw error;
  }

  const employeeIds = Array.isArray(data.employeeIds) ? data.employeeIds : (data.employeeId ? [data.employeeId] : []);
  if (employeeIds.length === 0) {
    const error = new Error('Debe seleccionar al menos un empleado');
    error.status = 400;
    throw error;
  }

  const payload = {
    amount: data.amount !== undefined && data.amount !== null && data.amount !== '' ? Number(data.amount) : null,
    units: data.units !== undefined && data.units !== null && data.units !== '' ? Number(data.units) : null,
    notes: data.notes ? data.notes.trim() : null,
    validFrom: data.validFrom ? new Date(data.validFrom) : null,
    validTo: data.validTo ? new Date(data.validTo) : null,
    isActive: data.isActive ?? true,
  };

  const results = [];
  for (const empId of employeeIds) {
    const existing = await tenantPrisma.employeeConcept.findUnique({
      where: {
        employeeId_conceptId: {
          employeeId: empId,
          conceptId,
        },
      },
    });

    if (existing) {
      const updated = await tenantPrisma.employeeConcept.update({
        where: { id: existing.id },
        data: payload,
      });
      results.push(updated);
    } else {
      const created = await tenantPrisma.employeeConcept.create({
        data: {
          id: crypto.randomUUID(),
          employeeId: empId,
          conceptId,
          ...payload,
        },
      });
      results.push(created);
    }
  }

  return { assignedCount: results.length, data: results };
}

/**
 * Resumen de convenios colectivos asignados al personal activo para selector.
 */
export async function getCctSummary(tenantPrisma) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const activeEmployees = await tenantPrisma.employee.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
    },
    select: {
      id: true,
      jobPositionId: true,
      jobPosition: {
        select: {
          id: true,
          name: true,
          cctCode: true,
          cct: {
            select: {
              code: true,
              name: true,
              description: true,
            },
          },
        },
      },
    },
  });

  const cctMap = new Map();
  let sinConvenioCount = 0;
  let fueraConvenioCount = 0;

  for (const emp of activeEmployees) {
    const jp = emp.jobPosition;
    if (!jp || !jp.cctCode) {
      sinConvenioCount++;
      continue;
    }

    const cctCodeNorm = String(jp.cctCode).trim().toUpperCase();
    const jpNameNorm = String(jp.name || '').trim().toLowerCase();
    const cctNameNorm = String(jp.cct?.name || '').trim().toLowerCase();

    if (
      cctCodeNorm === 'FUERA' ||
      cctCodeNorm === 'FUERA_CONVENIO' ||
      jpNameNorm.includes('fuera de convenio') ||
      jpNameNorm.includes('fuera convenio') ||
      cctNameNorm.includes('fuera de convenio')
    ) {
      fueraConvenioCount++;
      continue;
    }

    if (!cctMap.has(jp.cctCode)) {
      const displayName = jp.cct
        ? `[${jp.cct.code}] ${jp.cct.description || jp.cct.name}`
        : `[${jp.cctCode}] Convenio ${jp.cctCode}`;
      cctMap.set(jp.cctCode, {
        code: jp.cctCode,
        name: displayName,
        count: 0,
      });
    }
    cctMap.get(jp.cctCode).count++;
  }

  const result = Array.from(cctMap.values()).sort((a, b) => a.code.localeCompare(b.code));

  result.push({
    code: 'FUERA_CONVENIO',
    name: 'Personal Fuera de Convenio',
    count: fueraConvenioCount,
  });

  result.push({
    code: 'SIN_CONVENIO',
    name: 'Sin Convenio Asignado',
    count: sinConvenioCount,
  });

  return result;
}

/**
 * Asigna un concepto persistente a todos los empleados activos de un CCT,
 * o a los empleados fuera de convenio / sin convenio asignado.
 */
export async function assignConceptByCct(tenantPrisma, conceptId, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const concept = await tenantPrisma.concept.findUnique({ where: { id: conceptId } });
  if (!concept || concept.deletedAt) {
    const error = new Error('El concepto especificado no existe');
    error.status = 400;
    throw error;
  }
  if (String(concept.scope || '').toUpperCase() !== 'INDIVIDUAL') {
    const error = new Error(`Solo pueden asignarse conceptos con alcance INDIVIDUAL. El concepto ${concept.code} es GENERAL.`);
    error.status = 400;
    throw error;
  }
  if (!concept.isPersistent) {
    const error = new Error(`El concepto ${concept.code} (${concept.name}) es no persistente. Debe gestionarse en Novedades No Persistentes.`);
    error.status = 400;
    throw error;
  }

  const cctOption = String(data.cctOption || '').trim();
  if (!cctOption) {
    const error = new Error('Debe seleccionar un convenio colectivo o categoría de convenio');
    error.status = 400;
    throw error;
  }

  let matchingEmployees = [];
  if (cctOption === 'SIN_CONVENIO') {
    matchingEmployees = await tenantPrisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        OR: [
          { jobPositionId: null },
          { jobPosition: { cctCode: null } },
        ],
      },
      select: { id: true, fileNumber: true, lastName: true, firstName: true },
    });
  } else if (cctOption === 'FUERA_CONVENIO') {
    matchingEmployees = await tenantPrisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        jobPosition: {
          OR: [
            { cctCode: 'FUERA' },
            { cctCode: 'FUERA_CONVENIO' },
            { name: { contains: 'fuera' } },
          ],
        },
      },
      select: { id: true, fileNumber: true, lastName: true, firstName: true },
    });
  } else {
    matchingEmployees = await tenantPrisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        jobPosition: { cctCode: cctOption },
      },
      select: { id: true, fileNumber: true, lastName: true, firstName: true },
    });
  }

  if (matchingEmployees.length === 0) {
    return {
      totalEmployees: 0,
      createdCount: 0,
      updatedCount: 0,
      message: 'No se encontraron colaboradores activos en la condición de convenio seleccionada',
    };
  }

  let amountVal = null;
  let unitsVal = null;
  if (concept.noveltyDataType === 'IMPORTE') {
    amountVal = data.amount !== undefined && data.amount !== null && data.amount !== '' ? Number(data.amount) : (Number(data.value) || 0);
  } else {
    unitsVal = data.units !== undefined && data.units !== null && data.units !== '' ? Number(data.units) : (Number(data.value) || 0);
  }

  const payload = {
    amount: amountVal,
    units: unitsVal,
    notes: data.notes ? data.notes.trim() : null,
    validFrom: data.validFrom ? new Date(data.validFrom) : null,
    validTo: data.validTo ? new Date(data.validTo) : null,
    isActive: data.isActive ?? true,
  };

  let createdCount = 0;
  let updatedCount = 0;

  await tenantPrisma.$transaction(async (tx) => {
    for (const emp of matchingEmployees) {
      const existing = await tx.employeeConcept.findUnique({
        where: {
          employeeId_conceptId: {
            employeeId: emp.id,
            conceptId,
          },
        },
      });

      if (existing) {
        await tx.employeeConcept.update({
          where: { id: existing.id },
          data: payload,
        });
        updatedCount++;
      } else {
        await tx.employeeConcept.create({
          data: {
            id: crypto.randomUUID(),
            employeeId: emp.id,
            conceptId,
            ...payload,
          },
        });
        createdCount++;
      }
    }
  });

  return {
    totalEmployees: matchingEmployees.length,
    createdCount,
    updatedCount,
    message: `Concepto asignado exitosamente a ${matchingEmployees.length} colaborador(es) (${createdCount} nuevas asignaciones, ${updatedCount} actualizados)`,
  };
}

/**
 * Importación masiva de novedades persistentes desde archivo Excel.
 * Formato de columnas:
 * Col 1: Legajo
 * Col 2: Valor (Importe, Porcentaje, Cantidad u Horas según noveltyDataType)
 * Col 3 (opcional): Vigente Desde
 * Col 4 (opcional): Vigente Hasta
 */
export async function batchImportConceptNovelties(tenantPrisma, conceptId, { rows = [], defaultNotes } = {}) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const concept = await tenantPrisma.concept.findUnique({ where: { id: conceptId } });
  if (!concept || concept.deletedAt) {
    const error = new Error('El concepto especificado no existe');
    error.status = 400;
    throw error;
  }
  if (String(concept.scope || '').toUpperCase() !== 'INDIVIDUAL') {
    const error = new Error(`Solo pueden asignarse conceptos con alcance INDIVIDUAL. El concepto ${concept.code} es GENERAL.`);
    error.status = 400;
    throw error;
  }
  if (!concept.isPersistent) {
    const error = new Error(`El concepto ${concept.code} (${concept.name}) es no persistente. Debe gestionarse en Novedades No Persistentes.`);
    error.status = 400;
    throw error;
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    const error = new Error('No se proporcionaron filas para importar');
    error.status = 400;
    throw error;
  }

  const activeEmployees = await tenantPrisma.employee.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    select: { id: true, fileNumber: true, lastName: true, firstName: true },
  });

  const empByFile = new Map();
  for (const emp of activeEmployees) {
    if (emp.fileNumber) {
      empByFile.set(String(emp.fileNumber).trim().toLowerCase(), emp);
    }
  }

  const omittedRows = [];
  let createdCount = 0;
  let updatedCount = 0;
  let processedCount = 0;

  await tenantPrisma.$transaction(async (tx) => {
    for (const row of rows) {
      const rawFile = String(row.fileNumber || '').trim();
      if (!rawFile) continue;

      const emp = empByFile.get(rawFile.toLowerCase());
      if (!emp) {
        omittedRows.push({
          fileNumber: rawFile,
          value: row.value,
          reason: 'Legajo inexistente o inactivo en la nómina',
        });
        continue;
      }

      processedCount++;

      let amountVal = null;
      let unitsVal = null;
      const numVal = Number(row.value) || 0;

      if (concept.noveltyDataType === 'IMPORTE') {
        amountVal = numVal;
      } else {
        unitsVal = numVal;
      }

      let validFrom = null;
      let validTo = null;
      if (row.validFrom) {
        const dFrom = new Date(row.validFrom);
        if (!isNaN(dFrom.getTime())) validFrom = dFrom;
      }
      if (row.validTo) {
        const dTo = new Date(row.validTo);
        if (!isNaN(dTo.getTime())) validTo = dTo;
      }

      const notes = row.notes ? String(row.notes).trim() : (defaultNotes ? String(defaultNotes).trim() : 'Importado por Excel');

      const payload = {
        amount: amountVal,
        units: unitsVal,
        validFrom,
        validTo,
        notes,
        isActive: true,
      };

      const existing = await tx.employeeConcept.findUnique({
        where: {
          employeeId_conceptId: {
            employeeId: emp.id,
            conceptId,
          },
        },
      });

      if (existing) {
        await tx.employeeConcept.update({
          where: { id: existing.id },
          data: payload,
        });
        updatedCount++;
      } else {
        await tx.employeeConcept.create({
          data: {
            id: crypto.randomUUID(),
            employeeId: emp.id,
            conceptId,
            ...payload,
          },
        });
        createdCount++;
      }
    }
  });

  return {
    totalRows: rows.length,
    processedCount,
    createdCount,
    updatedCount,
    omittedCount: omittedRows.length,
    omittedRows,
    message: `Importación completada: ${processedCount} asignaciones confirmadas (${createdCount} nuevas, ${updatedCount} actualizadas). ${omittedRows.length} legajos omitidos.`,
  };
}

/**
 * Elimina una asignación por ID de asignación.
 */
export async function deleteConceptAssignment(tenantPrisma, assignmentId) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const existing = await tenantPrisma.employeeConcept.findUnique({
    where: { id: assignmentId },
    include: { concept: true },
  });
  if (!existing) {
    const error = new Error('Asignación de concepto no encontrada');
    error.status = 404;
    throw error;
  }

  if (existing.concept?.scope === 'GENERAL') {
    const error = new Error('Los conceptos de ámbito general no pueden ser eliminados desde las novedades individuales del empleado');
    error.status = 400;
    throw error;
  }

  // Protección legal de embargos judiciales
  const isEmbargo = Boolean(existing.concept?.isEmbargo);
  let hasActiveEmbargo = false;
  try {
    const count = await tenantPrisma.employeeEmbargoConcept.count({
      where: {
        conceptId: existing.conceptId,
        embargo: { employeeId: existing.employeeId },
      },
    });
    hasActiveEmbargo = count > 0;
  } catch (e) {}

  if (isEmbargo || hasActiveEmbargo) {
    const error = new Error('Este concepto corresponde a un embargo judicial. Solo puede eliminarse desde la pantalla de Embargos de Sueldo.');
    error.status = 400;
    throw error;
  }

  await tenantPrisma.employeeConcept.delete({
    where: { id: assignmentId },
  });

  return { message: 'Asignación de concepto eliminada exitosamente' };
}

/**
 * Actualiza la asignación de un concepto a un empleado.
 */
export async function updateEmployeeConcept(tenantPrisma, employeeId, assignmentId, updateData) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const existing = await tenantPrisma.employeeConcept.findFirst({
    where: {
      employeeId,
      OR: [
        { id: assignmentId },
        { conceptId: assignmentId },
      ],
    },
    include: { concept: true },
  });
  if (!existing) {
    const error = new Error('Asignación de concepto no encontrada');
    error.status = 404;
    throw error;
  }

  if (existing.concept?.scope === 'GENERAL') {
    const error = new Error('Los conceptos de ámbito general no pueden ser modificados desde las novedades individuales del empleado');
    error.status = 400;
    throw error;
  }

  const data = {};
  if (updateData.conceptId !== undefined) data.conceptId = updateData.conceptId;
  if (updateData.amount !== undefined) data.amount = updateData.amount !== null && updateData.amount !== '' ? Number(updateData.amount) : null;
  if (updateData.units !== undefined) data.units = updateData.units !== null && updateData.units !== '' ? Number(updateData.units) : null;
  if (updateData.notes !== undefined) data.notes = updateData.notes ? updateData.notes.trim() : null;
  if (updateData.validFrom !== undefined) data.validFrom = updateData.validFrom ? new Date(updateData.validFrom) : null;
  if (updateData.validTo !== undefined) data.validTo = updateData.validTo ? new Date(updateData.validTo) : null;
  if (updateData.isActive !== undefined) data.isActive = Boolean(updateData.isActive);

  return tenantPrisma.employeeConcept.update({
    where: { id: existing.id },
    data,
    include: {
      concept: true,
    },
  });
}

/**
 * Elimina la asignación de un concepto a un empleado.
 */
export async function deleteEmployeeConcept(tenantPrisma, employeeId, assignmentId) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const existing = await tenantPrisma.employeeConcept.findFirst({
    where: {
      employeeId,
      OR: [
        { id: assignmentId },
        { conceptId: assignmentId },
      ],
    },
    include: { concept: true },
  });
  if (!existing) {
    const error = new Error('Asignación de concepto no encontrada');
    error.status = 404;
    throw error;
  }

  if (existing.concept?.scope === 'GENERAL') {
    const error = new Error('Los conceptos de ámbito general no pueden ser eliminados desde las novedades individuales del empleado');
    error.status = 400;
    throw error;
  }

  // Protección legal de embargos judiciales
  const isEmbargo = Boolean(existing.concept?.isEmbargo);
  let hasActiveEmbargo = false;
  try {
    const count = await tenantPrisma.employeeEmbargoConcept.count({
      where: {
        conceptId: existing.conceptId,
        embargo: { employeeId: existing.employeeId },
      },
    });
    hasActiveEmbargo = count > 0;
  } catch (e) {}

  if (isEmbargo || hasActiveEmbargo) {
    const error = new Error('Este concepto corresponde a un embargo judicial. Solo puede eliminarse desde la pantalla de Embargos de Sueldo.');
    error.status = 400;
    throw error;
  }

  await tenantPrisma.employeeConcept.delete({
    where: { id: existing.id },
  });

  return { message: 'Asignación de concepto eliminada correctamente' };
}

/**
 * Aplica o previsualiza aumentos generalizados / masivos de haberes.
 */
export async function applyMassWageIncrease(tenantPrisma, options, isPreview = false) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const increaseType = options.increaseType;
  const value = options.value !== undefined ? options.value : options.increaseValue;

  let targetFields = options.targetFields || [];
  if (targetFields.length === 0) {
    if (options.applyToBasic) targetFields.push('BASIC_SALARY');
    if (options.applyToHourlyRate) targetFields.push('HOURLY_RATE');
    if (options.applyToConcepts) targetFields.push('FIXED_CONCEPTS');
  }
  if (targetFields.length === 0) targetFields = ['BASIC_SALARY'];

  const conceptId = options.conceptId || null;
  const rounding = options.rounding || 'DECIMAL_2';

  const filters = {
    departmentId: options.filters?.departmentId || options.filterDepartmentId || null,
    payrollGroup: options.filters?.payrollGroup || options.filterPayrollGroup || null,
    cctCode: options.filters?.cctCode || options.filterCctCode || null,
    status: options.filters?.status || options.filterStatus || 'ACTIVE',
  };

  const numVal = Number(value);
  if (isNaN(numVal) || numVal <= 0) {
    const error = new Error('El valor de aumento debe ser un número mayor a cero');
    error.status = 400;
    throw error;
  }

  const where = { deletedAt: null };
  if (filters.departmentId && filters.departmentId !== 'ALL') {
    where.departmentId = filters.departmentId;
  }
  if (filters.payrollGroup && filters.payrollGroup !== 'ALL') {
    where.payrollGroup = filters.payrollGroup;
  }
  if (filters.cctCode && filters.cctCode !== 'ALL') {
    where.jobPosition = filters.cctCode === 'NO_CCT'
      ? { cctCode: null }
      : { cctCode: String(filters.cctCode).trim() };
  }
  if (filters.status && filters.status !== 'ALL') {
    where.status = filters.status;
  } else {
    where.status = 'ACTIVE';
  }

  const employees = await tenantPrisma.employee.findMany({
    where,
    include: {
      department: true,
      assignedConcepts: {
        where: conceptId ? { conceptId, isActive: true } : { isActive: true },
        include: { concept: true },
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  const applyCalc = (oldVal) => {
    const v = Number(oldVal) || 0;
    let res = 0;
    if (increaseType === 'PERCENTAGE') {
      res = v * (1 + numVal / 100);
    } else {
      res = v + numVal;
    }
    if (rounding === 'INTEGER') return Math.round(res);
    if (rounding === 'DECIMAL_2') return Math.round(res * 100) / 100;
    return res;
  };

  const changes = [];
  const updates = [];

  for (const emp of employees) {
    const changeItem = {
      employeeId: emp.id,
      fileNumber: emp.fileNumber,
      employeeName: `${emp.lastName}, ${emp.firstName}`,
      departmentName: emp.department?.name || '-',
      payrollGroup: emp.payrollGroup || 'MENSUAL',
      basicSalary: {
        old: Number(emp.basicSalary) || 0,
        new: Number(emp.basicSalary) || 0,
      },
      hourlyRate: {
        old: Number(emp.hourlyRate) || 0,
        new: Number(emp.hourlyRate) || 0,
      },
      assignedConcepts: [],
    };

    const empUpdateData = {};

    if (targetFields.includes('BASIC_SALARY')) {
      const newBasic = applyCalc(emp.basicSalary);
      changeItem.basicSalary.new = newBasic;
      empUpdateData.basicSalary = newBasic;
    }

    if (targetFields.includes('HOURLY_RATE')) {
      const newHourly = applyCalc(emp.hourlyRate);
      changeItem.hourlyRate.new = newHourly;
      empUpdateData.hourlyRate = newHourly;
    }

    if (Object.keys(empUpdateData).length > 0) {
      updates.push(tenantPrisma.employee.update({
        where: { id: emp.id },
        data: empUpdateData,
      }));
    }

    if (targetFields.includes('FIXED_CONCEPTS') && emp.assignedConcepts?.length > 0) {
      for (const ac of emp.assignedConcepts) {
        if (ac.amount !== null && ac.amount !== undefined) {
          const newAmount = applyCalc(ac.amount);
          changeItem.assignedConcepts.push({
            assignmentId: ac.id,
            conceptCode: ac.concept.code,
            conceptName: ac.concept.name,
            oldAmount: Number(ac.amount),
            newAmount,
          });

          updates.push(tenantPrisma.employeeConcept.update({
            where: { id: ac.id },
            data: { amount: newAmount },
          }));
        }
      }
    }

    changes.push(changeItem);
  }

  if (!isPreview && updates.length > 0) {
    await tenantPrisma.$transaction(updates);
  }

  return {
    isPreview,
    increaseType,
    value: numVal,
    targetFields,
    affectedCount: employees.length,
    updatedCount: isPreview ? 0 : employees.length,
    count: employees.length,
    preview: changes.map((c) => ({
      id: c.employeeId,
      fileNumber: c.fileNumber,
      name: c.employeeName,
      department: c.departmentName,
      payrollGroup: c.payrollGroup,
      currentBasicSalary: c.basicSalary.old,
      newBasicSalary: c.basicSalary.new,
      currentHourlyRate: c.hourlyRate.old,
      newHourlyRate: c.hourlyRate.new,
      assignedConcepts: c.assignedConcepts,
    })),
    changes,
  };
}

/**
 * Asigna un concepto a múltiples empleados simultáneamente.
 */
export async function massAssignConcept(
  tenantPrisma,
  { conceptId, employeeIds, filterDepartmentId, filterPayrollGroup, amount, units, notes, validFrom, validTo, startDate, endDate }
) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const concept = await tenantPrisma.concept.findFirst({ where: { id: conceptId, deletedAt: null } });
  if (!concept) {
    const error = new Error('Concepto no encontrado');
    error.status = 404;
    throw error;
  }

  let targets = employeeIds;
  if (!targets || targets.length === 0) {
    const where = { deletedAt: null, status: 'ACTIVE' };
    if (filterDepartmentId && filterDepartmentId !== 'ALL') where.departmentId = filterDepartmentId;
    if (filterPayrollGroup && filterPayrollGroup !== 'ALL') where.payrollGroup = filterPayrollGroup;
    const emps = await tenantPrisma.employee.findMany({ where, select: { id: true } });
    targets = emps.map((e) => e.id);
  }

  const uniqueTargets = Array.from(new Set(targets));
  if (uniqueTargets.length === 0) {
    return { success: true, assignedCount: 0 };
  }

  const parsedAmount = amount !== undefined && amount !== null && amount !== '' ? Number(amount) : null;
  const parsedUnits = units !== undefined && units !== null && units !== '' ? Number(units) : null;
  const trimmedNotes = notes ? notes.trim() : null;
  const fromDate = (validFrom || startDate) ? new Date(validFrom || startDate) : null;
  const toDate = (validTo || endDate) ? new Date(validTo || endDate) : null;

  const assignedCount = await tenantPrisma.$transaction(async (tx) => {
    const existingList = await tx.employeeConcept.findMany({
      where: {
        conceptId,
        employeeId: { in: uniqueTargets },
      },
      select: { id: true, employeeId: true },
    });

    const existingByEmp = new Map();
    for (const rec of existingList) {
      if (!existingByEmp.has(rec.employeeId)) {
        existingByEmp.set(rec.employeeId, rec.id);
      }
    }

    const toCreate = [];
    const idsToUpdate = [];

    for (const empId of uniqueTargets) {
      const existingId = existingByEmp.get(empId);
      if (existingId) {
        idsToUpdate.push(existingId);
      } else {
        toCreate.push({
          id: crypto.randomUUID(),
          employeeId: empId,
          conceptId,
          amount: parsedAmount,
          units: parsedUnits,
          notes: trimmedNotes,
          validFrom: fromDate,
          validTo: toDate,
          isActive: true,
        });
      }
    }

    if (idsToUpdate.length > 0) {
      const updateData = {
        amount: parsedAmount,
        units: parsedUnits,
        validFrom: fromDate,
        validTo: toDate,
        isActive: true,
      };
      if (trimmedNotes) {
        updateData.notes = trimmedNotes;
      }
      await tx.employeeConcept.updateMany({
        where: { id: { in: idsToUpdate } },
        data: updateData,
      });
    }

    for (let i = 0; i < toCreate.length; i += 500) {
      await tx.employeeConcept.createMany({ data: toCreate.slice(i, i + 500) });
    }

    return uniqueTargets.length;
  });

  return { success: true, assignedCount };
}

