import crypto from 'crypto';
import { ensureTenantPersonnelSchema } from '../../services/tenantProvisioner.service.js';
import { isValidCuit } from '../companies/company.validation.js';
import { hoursToDecimal, decimalToHours } from '../../utils/timeFormat.js';

/**
 * Lista empleados de la base de datos de la empresa activa con filtros y paginación.
 */
export async function listEmployees(tenantPrisma, { page = 1, limit = 50, search, departmentId, status } = {}) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const skip = (Number(page) - 1) * Number(limit);
  const where = {
    deletedAt: null,
  };

  if (status && status !== 'ALL') {
    where.status = status;
  }

  if (departmentId && departmentId !== 'ALL') {
    where.departmentId = departmentId;
  }

  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { lastName: { contains: q } },
      { firstName: { contains: q } },
      { cuil: { contains: q } },
      { fileNumber: { contains: q } },
      { documentNumber: { contains: q } },
    ];
  }

  const [employees, total] = await Promise.all([
    tenantPrisma.employee.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: {
        department: { select: { id: true, name: true, code: true } },
        jobPosition: {
          select: {
            id: true,
            name: true,
            code: true,
            cctCode: true,
            categoryCode: true,
            positionCode: true,
            cct: true,
            category: true,
            arcaPosition: true,
          },
        },
        healthInsurance: { select: { id: true, name: true, code: true } },
        union: { select: { id: true, name: true, code: true } },
        mutual: { select: { id: true, name: true, code: true } },
        contractModality: true,
        salaryScale: { select: { id: true, name: true, code: true, amount: true } },
      },
    }),
    tenantPrisma.employee.count({ where }),
  ]);

  return {
    data: employees,
    meta: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)) || 1,
    },
  };
}

/**
 * Obtiene el detalle de un empleado por ID en la base del tenant.
 */
export async function getEmployeeById(tenantPrisma, employeeId) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const employee = await tenantPrisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    include: {
      department: true,
      jobPosition: {
        include: {
          cct: true,
          category: true,
          arcaPosition: true,
          serviceType: true,
        },
      },
      healthInsurance: true,
      union: true,
      mutual: true,
      contractModality: true,
      salaryScale: true,
      relatives: {
        where: { deletedAt: null },
        include: { kinship: true },
        orderBy: { createdAt: 'asc' },
      },
      assignedConcepts: {
        include: { concept: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!employee) {
    const error = new Error('Empleado no encontrado');
    error.status = 404;
    throw error;
  }

  return {
    ...employee,
    weeklyWorkingHoursFormatted: decimalToHours(employee.weeklyWorkingHours),
    monthlyWorkingHoursFormatted: decimalToHours(employee.monthlyWorkingHours),
  };
}

/**
 * Da de alta un nuevo empleado en la base de datos de la empresa activa.
 */
export async function createEmployee(tenantPrisma, employeeData) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const cleanCuil = employeeData.cuil.replace(/\D/g, '');
  const cleanDoc = employeeData.documentNumber ? employeeData.documentNumber.trim() : '';

  // Verificar unicidad de CUIL y Legajo
  const existing = await tenantPrisma.employee.findFirst({
    where: {
      OR: [
        { cuil: cleanCuil },
        { fileNumber: employeeData.fileNumber.trim() },
      ],
      deletedAt: null,
    },
  });

  if (existing) {
    const error = new Error(
      existing.cuil === cleanCuil
        ? 'Ya existe un empleado registrado con ese CUIL en esta empresa'
        : 'Ya existe un empleado registrado con ese número de legajo en esta empresa'
    );
    error.status = 409;
    throw error;
  }

  // Validar existencia de Sector
  const department = await tenantPrisma.department.findFirst({
    where: { id: employeeData.departmentId, deletedAt: null },
  });
  if (!department) {
    const error = new Error('El sector seleccionado no existe');
    error.status = 400;
    throw error;
  }

  // Validar existencia de Puesto
  const jobPosition = await tenantPrisma.jobPosition.findFirst({
    where: { id: employeeData.jobPositionId, deletedAt: null },
  });
  if (!jobPosition) {
    const error = new Error('El puesto de trabajo seleccionado no existe');
    error.status = 400;
    throw error;
  }

  // Validar existencia de Obra Social
  const healthInsurance = await tenantPrisma.healthInsurance.findFirst({
    where: { id: employeeData.healthInsuranceId, deletedAt: null },
  });
  if (!healthInsurance) {
    const error = new Error('La obra social seleccionada no existe');
    error.status = 400;
    throw error;
  }

  // Validar Sindicato si fue provisto
  if (employeeData.unionId && employeeData.unionId.trim() !== '') {
    const union = await tenantPrisma.union.findFirst({
      where: { id: employeeData.unionId.trim(), deletedAt: null },
    });
    if (!union) {
      const error = new Error('El sindicato seleccionado no existe');
      error.status = 400;
      throw error;
    }
  }

  // Validar Mutual si fue provista
  if (employeeData.mutualId && employeeData.mutualId.trim() !== '') {
    const mutual = await tenantPrisma.mutual.findFirst({
      where: { id: employeeData.mutualId.trim(), deletedAt: null },
    });
    if (!mutual) {
      const error = new Error('La mutual seleccionada no existe');
      error.status = 400;
      throw error;
    }
  }

  // Validar Modalidad de Contratación si fue provista
  if (employeeData.contractModalityCode && employeeData.contractModalityCode.trim() !== '') {
    const modality = await tenantPrisma.arcaContractModality.findFirst({
      where: { code: employeeData.contractModalityCode.trim() },
    });
    if (!modality) {
      const error = new Error('La modalidad de contratación seleccionada no existe');
      error.status = 400;
      throw error;
    }
  }

  const relativesData =
    employeeData.relatives && Array.isArray(employeeData.relatives) && employeeData.relatives.length > 0
      ? {
          create: employeeData.relatives.map((r) => ({
            id: crypto.randomUUID(),
            kinshipId: r.kinshipId,
            lastName: r.lastName.trim(),
            firstName: r.firstName.trim(),
            documentType: r.documentType || 'DNI',
            documentNumber: r.documentNumber.trim(),
            cuil: r.cuil ? r.cuil.replace(/\D/g, '') : null,
            birthDate: new Date(r.birthDate),
          })),
        }
      : undefined;

  const employee = await tenantPrisma.employee.create({
    data: {
      id: crypto.randomUUID(),
      fileNumber: employeeData.fileNumber.trim(),
      lastName: employeeData.lastName.trim(),
      firstName: employeeData.firstName.trim(),
      photo: employeeData.photo ? employeeData.photo.trim() : null,
      documentType: employeeData.documentType || 'DNI',
      documentNumber: cleanDoc,
      cuil: cleanCuil,
      gender: employeeData.gender || 'M',
      birthDate: new Date(employeeData.birthDate),
      hireDate: new Date(employeeData.hireDate),
      street: employeeData.street ? employeeData.street.trim() : null,
      streetNumber: employeeData.streetNumber ? employeeData.streetNumber.trim() : null,
      floor: employeeData.floor ? employeeData.floor.trim() : null,
      apartment: employeeData.apartment ? employeeData.apartment.trim() : null,
      city: employeeData.city ? employeeData.city.trim() : null,
      postalCode: employeeData.postalCode ? employeeData.postalCode.trim() : null,
      province: employeeData.province ? employeeData.province.trim() : null,
      email: employeeData.email ? employeeData.email.trim() : null,
      phone: employeeData.phone ? employeeData.phone.trim() : null,
      status: employeeData.status || 'ACTIVE',
      departmentId: employeeData.departmentId,
      jobPositionId: employeeData.jobPositionId,
      healthInsuranceId: employeeData.healthInsuranceId,
      unionId: employeeData.unionId ? employeeData.unionId.trim() : null,
      mutualId: employeeData.mutualId ? employeeData.mutualId.trim() : null,
      contractModalityCode: employeeData.contractModalityCode ? employeeData.contractModalityCode.trim() : null,
      salaryScaleId: employeeData.salaryScaleId ? employeeData.salaryScaleId.trim() : null,
      payrollGroup: employeeData.payrollGroup ? employeeData.payrollGroup.trim() : 'MENSUAL',
      isPartTime: employeeData.isPartTime ?? false,
      weeklyWorkingHours: hoursToDecimal(employeeData.weeklyWorkingHours, 48.00),
      monthlyWorkingHours: hoursToDecimal(employeeData.monthlyWorkingHours, 200.00),
      partTimePercentage: employeeData.partTimePercentage !== undefined && employeeData.partTimePercentage !== null ? Number(employeeData.partTimePercentage) : 100.00,
      basicSalary: employeeData.basicSalary !== undefined && employeeData.basicSalary !== null ? Number(employeeData.basicSalary) : 0.00,
      hourlyRate: employeeData.hourlyRate !== undefined && employeeData.hourlyRate !== null ? Number(employeeData.hourlyRate) : 0.00,
      cbu: employeeData.cbu ? employeeData.cbu.trim() : null,
      bankAccountType: employeeData.bankAccountType ? employeeData.bankAccountType.trim() : null,
      relatives: relativesData,
    },
    include: {
      department: true,
      jobPosition: {
        include: {
          cct: true,
          category: true,
          arcaPosition: true,
        },
      },
      healthInsurance: true,
      union: true,
      mutual: true,
      contractModality: true,
      salaryScale: true,
      relatives: {
        include: { kinship: true },
      },
      assignedConcepts: {
        include: { concept: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return {
    ...employee,
    weeklyWorkingHoursFormatted: decimalToHours(employee.weeklyWorkingHours),
    monthlyWorkingHoursFormatted: decimalToHours(employee.monthlyWorkingHours),
  };
}

/**
 * Actualiza un empleado en la base del tenant.
 */
export async function updateEmployee(tenantPrisma, employeeId, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  const current = await getEmployeeById(tenantPrisma, employeeId);

  const cleanCuil = data.cuil ? data.cuil.replace(/\D/g, '') : undefined;
  const cleanDoc = data.documentNumber ? data.documentNumber.trim() : undefined;
  const fileNum = data.fileNumber ? data.fileNumber.trim() : undefined;

  // Si se modificó el CUIL o el legajo, validar unicidad
  if ((cleanCuil && cleanCuil !== current.cuil) || (fileNum && fileNum !== current.fileNumber)) {
    const existing = await tenantPrisma.employee.findFirst({
      where: {
        OR: [
          ...(cleanCuil ? [{ cuil: cleanCuil }] : []),
          ...(fileNum ? [{ fileNumber: fileNum }] : []),
        ],
        NOT: { id: employeeId },
        deletedAt: null,
      },
    });

    if (existing) {
      const error = new Error(
        existing.cuil === cleanCuil
          ? 'Ya existe otro empleado registrado con ese CUIL en esta empresa'
          : 'Ya existe otro empleado con ese número de legajo en esta empresa'
      );
      error.status = 409;
      throw error;
    }
  }

  const updatePayload = {};
  if (fileNum !== undefined) updatePayload.fileNumber = fileNum;
  if (data.lastName !== undefined) updatePayload.lastName = data.lastName.trim();
  if (data.firstName !== undefined) updatePayload.firstName = data.firstName.trim();
  if (data.photo !== undefined) updatePayload.photo = data.photo ? data.photo.trim() : null;
  if (data.documentType !== undefined) updatePayload.documentType = data.documentType;
  if (cleanDoc !== undefined) updatePayload.documentNumber = cleanDoc;
  if (cleanCuil !== undefined) updatePayload.cuil = cleanCuil;
  if (data.gender !== undefined) updatePayload.gender = data.gender;
  if (data.birthDate !== undefined) updatePayload.birthDate = new Date(data.birthDate);
  if (data.hireDate !== undefined) updatePayload.hireDate = new Date(data.hireDate);
  if (data.street !== undefined) updatePayload.street = data.street ? data.street.trim() : null;
  if (data.streetNumber !== undefined) updatePayload.streetNumber = data.streetNumber ? data.streetNumber.trim() : null;
  if (data.floor !== undefined) updatePayload.floor = data.floor ? data.floor.trim() : null;
  if (data.apartment !== undefined) updatePayload.apartment = data.apartment ? data.apartment.trim() : null;
  if (data.city !== undefined) updatePayload.city = data.city ? data.city.trim() : null;
  if (data.postalCode !== undefined) updatePayload.postalCode = data.postalCode ? data.postalCode.trim() : null;
  if (data.province !== undefined) updatePayload.province = data.province ? data.province.trim() : null;
  if (data.email !== undefined) updatePayload.email = data.email ? data.email.trim() : null;
  if (data.phone !== undefined) updatePayload.phone = data.phone ? data.phone.trim() : null;
  if (data.status !== undefined) updatePayload.status = data.status;
  
  if (data.departmentId !== undefined) {
    const dept = await tenantPrisma.department.findFirst({ where: { id: data.departmentId, deletedAt: null } });
    if (!dept) {
      const error = new Error('El sector seleccionado no existe');
      error.status = 400;
      throw error;
    }
    updatePayload.departmentId = data.departmentId;
  }
  
  if (data.jobPositionId !== undefined) {
    const job = await tenantPrisma.jobPosition.findFirst({ where: { id: data.jobPositionId, deletedAt: null } });
    if (!job) {
      const error = new Error('El puesto de trabajo seleccionado no existe');
      error.status = 400;
      throw error;
    }
    updatePayload.jobPositionId = data.jobPositionId;
  }
  
  if (data.healthInsuranceId !== undefined) {
    const hi = await tenantPrisma.healthInsurance.findFirst({ where: { id: data.healthInsuranceId, deletedAt: null } });
    if (!hi) {
      const error = new Error('La obra social seleccionada no existe');
      error.status = 400;
      throw error;
    }
    updatePayload.healthInsuranceId = data.healthInsuranceId;
  }

  if (data.unionId !== undefined) {
    if (data.unionId && data.unionId.trim()) {
      const un = await tenantPrisma.union.findFirst({ where: { id: data.unionId.trim(), deletedAt: null } });
      if (!un) {
        const error = new Error('El sindicato seleccionado no existe');
        error.status = 400;
        throw error;
      }
      updatePayload.unionId = data.unionId.trim();
    } else {
      updatePayload.unionId = null;
    }
  }

  if (data.mutualId !== undefined) {
    if (data.mutualId && data.mutualId.trim()) {
      const mut = await tenantPrisma.mutual.findFirst({ where: { id: data.mutualId.trim(), deletedAt: null } });
      if (!mut) {
        const error = new Error('La mutual seleccionada no existe');
        error.status = 400;
        throw error;
      }
      updatePayload.mutualId = data.mutualId.trim();
    } else {
      updatePayload.mutualId = null;
    }
  }

  if (data.contractModalityCode !== undefined) {
    if (data.contractModalityCode && data.contractModalityCode.trim()) {
      const mod = await tenantPrisma.arcaContractModality.findFirst({
        where: { code: data.contractModalityCode.trim() },
      });
      if (!mod) {
        const error = new Error('La modalidad de contratación seleccionada no existe');
        error.status = 400;
        throw error;
      }
      updatePayload.contractModalityCode = data.contractModalityCode.trim();
    } else {
      updatePayload.contractModalityCode = null;
    }
  }

  if (data.salaryScaleId !== undefined) {
    updatePayload.salaryScaleId = data.salaryScaleId ? data.salaryScaleId.trim() : null;
    if (updatePayload.salaryScaleId) {
      const scale = await tenantPrisma.salaryScale.findFirst({
        where: { id: updatePayload.salaryScaleId, deletedAt: null },
      });
      if (scale) {
        updatePayload.basicSalary = Number(scale.amount);
      }
    }
  }
  if (data.payrollGroup !== undefined) updatePayload.payrollGroup = data.payrollGroup ? data.payrollGroup.trim() : 'MENSUAL';
  if (data.isPartTime !== undefined) updatePayload.isPartTime = Boolean(data.isPartTime);
  if (data.weeklyWorkingHours !== undefined) updatePayload.weeklyWorkingHours = hoursToDecimal(data.weeklyWorkingHours, 48.00);
  if (data.monthlyWorkingHours !== undefined) updatePayload.monthlyWorkingHours = hoursToDecimal(data.monthlyWorkingHours, 200.00);
  if (data.partTimePercentage !== undefined) updatePayload.partTimePercentage = Number(data.partTimePercentage);
  if (data.basicSalary !== undefined) updatePayload.basicSalary = Number(data.basicSalary);
  if (data.hourlyRate !== undefined) updatePayload.hourlyRate = Number(data.hourlyRate);
  if (data.cbu !== undefined) updatePayload.cbu = data.cbu ? data.cbu.trim() : null;
  if (data.bankAccountType !== undefined) updatePayload.bankAccountType = data.bankAccountType ? data.bankAccountType.trim() : null;

  const employee = await tenantPrisma.employee.update({
    where: { id: employeeId },
    data: updatePayload,
    include: {
      department: true,
      jobPosition: {
        include: {
          cct: true,
          category: true,
          arcaPosition: true,
        },
      },
      healthInsurance: true,
      union: true,
      mutual: true,
      contractModality: true,
      salaryScale: true,
      assignedConcepts: {
        include: { concept: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return {
    ...employee,
    weeklyWorkingHoursFormatted: decimalToHours(employee.weeklyWorkingHours),
    monthlyWorkingHoursFormatted: decimalToHours(employee.monthlyWorkingHours),
  };
}

/**
 * Da de baja lógica a un empleado.
 */
export async function deleteEmployee(tenantPrisma, employeeId) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getEmployeeById(tenantPrisma, employeeId);

  return tenantPrisma.employee.update({
    where: { id: employeeId },
    data: {
      status: 'INACTIVE',
      deletedAt: new Date(),
      terminationDate: new Date(),
    },
  });
}

/**
 * Importa empleados masivamente desde un listado (ej. Excel).
 * Columnas requeridas:
 * Legajo, Apellido, Nombres, Tipo de documento, Número de documento, CUIL, Género,
 * Fecha de nacimiento, Fecha de ingreso, Sector, Puesto de Trabajo, Obra Social,
 * Calle, Número, Localidad, Provincia, E-mail, Teléfono.
 * Columnas opcionales (pueden estar vacías):
 * Sindicato, Mutual, Modalidad de contratación, Piso, Departamento, Código Postal, Fecha de baja, Motivo de baja.
 * Claves foráneas: busca por código o por descripción/nombre.
 * Bajas: si viene Fecha de baja, se da de alta con status 'INACTIVE', fecha y motivo.
 */
export async function importEmployees(tenantPrisma, employees) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  if (!Array.isArray(employees) || employees.length === 0) {
    const error = new Error('No se enviaron empleados para importar');
    error.status = 400;
    throw error;
  }

  // 1. Pre-cargar entidades relacionadas para búsqueda inteligente por código o por nombre
  const [
    departments,
    jobPositions,
    healthInsurances,
    unions,
    mutuals,
    contractModalities,
    existingEmployees,
  ] = await Promise.all([
    tenantPrisma.department.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
    tenantPrisma.jobPosition.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
    tenantPrisma.healthInsurance.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
    tenantPrisma.union.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
    tenantPrisma.mutual.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
    tenantPrisma.arcaContractModality.findMany({
      select: { code: true, name: true },
    }),
    tenantPrisma.employee.findMany({
      where: { deletedAt: null },
      select: { id: true, fileNumber: true, cuil: true },
    }),
  ]);

  // Mapas normalizados en minúsculas (código y nombre)
  const deptMap = new Map();
  for (const d of departments) {
    if (d.code) deptMap.set(d.code.trim().toLowerCase(), d.id);
    if (d.name) deptMap.set(d.name.trim().toLowerCase(), d.id);
  }

  const jobMap = new Map();
  for (const j of jobPositions) {
    if (j.code) jobMap.set(j.code.trim().toLowerCase(), j.id);
    if (j.name) jobMap.set(j.name.trim().toLowerCase(), j.id);
  }

  const hiMap = new Map();
  for (const h of healthInsurances) {
    if (h.code) hiMap.set(h.code.trim().toLowerCase(), h.id);
    if (h.name) hiMap.set(h.name.trim().toLowerCase(), h.id);
  }

  const unionMap = new Map();
  for (const u of unions) {
    if (u.code) unionMap.set(u.code.trim().toLowerCase(), u.id);
    if (u.name) unionMap.set(u.name.trim().toLowerCase(), u.id);
  }

  const mutualMap = new Map();
  for (const m of mutuals) {
    if (m.code) mutualMap.set(m.code.trim().toLowerCase(), m.id);
    if (m.name) mutualMap.set(m.name.trim().toLowerCase(), m.id);
  }

  const modalityMap = new Map();
  for (const mod of contractModalities) {
    if (mod.code) modalityMap.set(mod.code.trim().toLowerCase(), mod.code);
    if (mod.name) modalityMap.set(mod.name.trim().toLowerCase(), mod.code);
  }

  // Conjuntos existentes en base de datos para unicidad
  const existingFilesSet = new Set(
    existingEmployees.map((e) => (e.fileNumber || '').trim().toLowerCase())
  );
  const existingCuilsSet = new Set(
    existingEmployees.map((e) => (e.cuil || '').trim())
  );

  const toCreate = [];
  const skipped = [];
  const batchFilesSet = new Set();
  const batchCuilsSet = new Set();

  const parseDate = (val) => {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === 'number') {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return isNaN(d.getTime()) ? null : d;
    }
    const str = String(val).trim();
    if (!str) return null;
    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  for (let idx = 0; idx < employees.length; idx++) {
    const item = employees[idx];
    const fileNumber = item.fileNumber !== undefined && item.fileNumber !== null ? String(item.fileNumber).trim() : '';
    const lastName = item.lastName !== undefined && item.lastName !== null ? String(item.lastName).trim() : '';
    const firstName = item.firstName !== undefined && item.firstName !== null ? String(item.firstName).trim() : '';
    const documentType = item.documentType !== undefined && item.documentType !== null ? String(item.documentType).trim().toUpperCase() : 'DNI';
    const documentNumber = item.documentNumber !== undefined && item.documentNumber !== null ? String(item.documentNumber).trim().replace(/\./g, '') : '';
    const rawCuil = item.cuil !== undefined && item.cuil !== null ? String(item.cuil).trim() : '';
    const cleanCuil = rawCuil.replace(/\D/g, '');
    const gender = item.gender !== undefined && item.gender !== null ? String(item.gender).trim().toUpperCase() : 'M';
    const street = item.street !== undefined && item.street !== null ? String(item.street).trim() : '';
    const streetNumber = item.streetNumber !== undefined && item.streetNumber !== null ? String(item.streetNumber).trim() : '';
    const floor = item.floor !== undefined && item.floor !== null ? String(item.floor).trim() : null;
    const apartment = item.apartment !== undefined && item.apartment !== null ? String(item.apartment).trim() : null;
    const city = item.city !== undefined && item.city !== null ? String(item.city).trim() : '';
    const postalCode = item.postalCode !== undefined && item.postalCode !== null ? String(item.postalCode).trim() : null;
    const province = item.province !== undefined && item.province !== null ? String(item.province).trim() : '';
    const email = item.email !== undefined && item.email !== null ? String(item.email).trim() : '';
    const phone = item.phone !== undefined && item.phone !== null ? String(item.phone).trim() : '';

    const rawDept = item.department !== undefined && item.department !== null ? String(item.department).trim() : '';
    const rawJob = item.jobPosition !== undefined && item.jobPosition !== null ? String(item.jobPosition).trim() : '';
    const rawHi = item.healthInsurance !== undefined && item.healthInsurance !== null ? String(item.healthInsurance).trim() : '';
    const rawUnion = item.union !== undefined && item.union !== null ? String(item.union).trim() : '';
    const rawMutual = item.mutual !== undefined && item.mutual !== null ? String(item.mutual).trim() : '';
    const rawModality = item.contractModality !== undefined && item.contractModality !== null ? String(item.contractModality).trim() : '';

    const labelName = lastName || firstName ? `${lastName}, ${firstName}`.trim() : '(Sin nombre)';

    // Validaciones de obligatoriedad de campos de texto
    if (!fileNumber) {
      skipped.push({ fileNumber: '-', name: labelName, reason: 'El número de legajo es obligatorio' });
      continue;
    }
    if (!lastName || lastName.length < 2) {
      skipped.push({ fileNumber, name: labelName, reason: 'El apellido es obligatorio (mínimo 2 caracteres)' });
      continue;
    }
    if (!firstName || firstName.length < 2) {
      skipped.push({ fileNumber, name: labelName, reason: 'El nombre es obligatorio (mínimo 2 caracteres)' });
      continue;
    }
    if (!documentNumber) {
      skipped.push({ fileNumber, name: labelName, reason: 'El número de documento es obligatorio' });
      continue;
    }
    if (!cleanCuil || cleanCuil.length !== 11 || !isValidCuit(cleanCuil)) {
      skipped.push({ fileNumber, name: labelName, reason: `CUIL inválido ("${rawCuil}"). Debe tener 11 dígitos y cumplir algoritmo AFIP/ARCA` });
      continue;
    }
    if (!gender) {
      skipped.push({ fileNumber, name: labelName, reason: 'El género es obligatorio' });
      continue;
    }

    const birthDate = parseDate(item.birthDate);
    if (!birthDate) {
      skipped.push({ fileNumber, name: labelName, reason: 'Fecha de nacimiento inválida u obligatoria' });
      continue;
    }

    const hireDate = parseDate(item.hireDate);
    if (!hireDate) {
      skipped.push({ fileNumber, name: labelName, reason: 'Fecha de ingreso inválida u obligatoria' });
      continue;
    }

    if (!street) {
      skipped.push({ fileNumber, name: labelName, reason: 'La calle del domicilio es obligatoria' });
      continue;
    }
    if (!streetNumber) {
      skipped.push({ fileNumber, name: labelName, reason: 'La altura / número de calle es obligatoria' });
      continue;
    }
    if (!city) {
      skipped.push({ fileNumber, name: labelName, reason: 'La localidad es obligatoria' });
      continue;
    }
    if (!province) {
      skipped.push({ fileNumber, name: labelName, reason: 'La provincia es obligatoria' });
      continue;
    }
    if (!email) {
      skipped.push({ fileNumber, name: labelName, reason: 'El e-mail es obligatorio' });
      continue;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      skipped.push({ fileNumber, name: labelName, reason: `Formato de e-mail inválido ("${email}")` });
      continue;
    }
    if (!phone) {
      skipped.push({ fileNumber, name: labelName, reason: 'El teléfono es obligatorio' });
      continue;
    }

    // Validación y resolución de Claves Foráneas Obligatorias
    if (!rawDept) {
      skipped.push({ fileNumber, name: labelName, reason: 'El sector es obligatorio' });
      continue;
    }
    const departmentId = deptMap.get(rawDept.toLowerCase());
    if (!departmentId) {
      skipped.push({ fileNumber, name: labelName, reason: `El sector "${rawDept}" no existe en el sistema (código o denominación)` });
      continue;
    }

    if (!rawJob) {
      skipped.push({ fileNumber, name: labelName, reason: 'El puesto de trabajo es obligatorio' });
      continue;
    }
    const jobPositionId = jobMap.get(rawJob.toLowerCase());
    if (!jobPositionId) {
      skipped.push({ fileNumber, name: labelName, reason: `El puesto de trabajo "${rawJob}" no existe en el sistema (código o denominación)` });
      continue;
    }

    if (!rawHi) {
      skipped.push({ fileNumber, name: labelName, reason: 'La obra social es obligatoria' });
      continue;
    }
    const healthInsuranceId = hiMap.get(rawHi.toLowerCase());
    if (!healthInsuranceId) {
      skipped.push({ fileNumber, name: labelName, reason: `La obra social "${rawHi}" no existe en el sistema (código o denominación)` });
      continue;
    }

    // Resolución de Claves Foráneas Opcionales
    let unionId = null;
    if (rawUnion) {
      unionId = unionMap.get(rawUnion.toLowerCase());
      if (!unionId) {
        skipped.push({ fileNumber, name: labelName, reason: `El sindicato "${rawUnion}" no existe en el sistema` });
        continue;
      }
    }

    let mutualId = null;
    if (rawMutual) {
      mutualId = mutualMap.get(rawMutual.toLowerCase());
      if (!mutualId) {
        skipped.push({ fileNumber, name: labelName, reason: `La mutual "${rawMutual}" no existe en el sistema` });
        continue;
      }
    }

    let contractModalityCode = null;
    if (rawModality) {
      contractModalityCode = modalityMap.get(rawModality.toLowerCase());
      if (!contractModalityCode) {
        skipped.push({ fileNumber, name: labelName, reason: `La modalidad de contratación "${rawModality}" no existe en el catálogo ARCA` });
        continue;
      }
    }

    // Control de Duplicados contra BD
    const fileLower = fileNumber.toLowerCase();
    if (existingFilesSet.has(fileLower)) {
      skipped.push({ fileNumber, name: labelName, reason: `Ya existe un empleado con el legajo "${fileNumber}" en esta empresa` });
      continue;
    }
    if (existingCuilsSet.has(cleanCuil)) {
      skipped.push({ fileNumber, name: labelName, reason: `Ya existe un empleado registrado con el CUIL "${rawCuil}" en esta empresa` });
      continue;
    }

    // Control de Duplicados dentro del Lote
    if (batchFilesSet.has(fileLower)) {
      skipped.push({ fileNumber, name: labelName, reason: `Legajo "${fileNumber}" repetido dentro del mismo archivo Excel` });
      continue;
    }
    if (batchCuilsSet.has(cleanCuil)) {
      skipped.push({ fileNumber, name: labelName, reason: `CUIL "${rawCuil}" repetido dentro del mismo archivo Excel` });
      continue;
    }

    // Manejo de Bajas
    let status = 'ACTIVE';
    let terminationDate = null;
    let terminationReason = null;
    if (item.terminationDate !== undefined && item.terminationDate !== null && String(item.terminationDate).trim()) {
      const parsedTerm = parseDate(item.terminationDate);
      if (!parsedTerm) {
        skipped.push({ fileNumber, name: labelName, reason: 'Fecha de baja inválida' });
        continue;
      }
      if (parsedTerm < hireDate) {
        skipped.push({ fileNumber, name: labelName, reason: 'La fecha de baja no puede ser anterior a la fecha de ingreso' });
        continue;
      }
      status = 'INACTIVE';
      terminationDate = parsedTerm;
      terminationReason = item.terminationReason !== undefined && item.terminationReason !== null && String(item.terminationReason).trim()
        ? String(item.terminationReason).trim()
        : 'Baja informada en importación';
    }

    batchFilesSet.add(fileLower);
    batchCuilsSet.add(cleanCuil);

    toCreate.push({
      id: crypto.randomUUID(),
      fileNumber,
      lastName,
      firstName,
      photo: null,
      documentType,
      documentNumber,
      cuil: cleanCuil,
      gender,
      birthDate,
      hireDate,
      street,
      streetNumber,
      floor: floor || null,
      apartment: apartment || null,
      city,
      postalCode: postalCode || null,
      province,
      email,
      phone,
      status,
      terminationDate,
      terminationReason,
      departmentId,
      jobPositionId,
      healthInsuranceId,
      unionId,
      mutualId,
      contractModalityCode,
    });
  }

  // Inserción en transacción
  if (toCreate.length > 0) {
    await tenantPrisma.$transaction(
      toCreate.map((emp) =>
        tenantPrisma.employee.create({
          data: emp,
        })
      )
    );
  }

  return {
    totalProcessed: employees.length,
    createdCount: toCreate.length,
    skippedCount: skipped.length,
    created: toCreate,
    skipped,
  };
}


// --- GESTIÓN DE FAMILIARES DEL EMPLEADO (RELATIVES) ---

/**
 * Lista todos los familiares activos de un empleado.
 */
export async function listRelatives(tenantPrisma, employeeId) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getEmployeeById(tenantPrisma, employeeId);

  return tenantPrisma.employeeRelative.findMany({
    where: {
      employeeId,
      deletedAt: null,
    },
    include: {
      kinship: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
}

/**
 * Agrega un familiar a un empleado.
 */
export async function createRelative(tenantPrisma, employeeId, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);
  await getEmployeeById(tenantPrisma, employeeId);

  // Validar parentesco
  const kinship = await tenantPrisma.kinship.findFirst({
    where: { id: data.kinshipId, deletedAt: null },
  });
  if (!kinship) {
    const error = new Error('El parentesco seleccionado no existe');
    error.status = 400;
    throw error;
  }

  const cleanCuil = data.cuil ? data.cuil.replace(/\D/g, '') : null;

  return tenantPrisma.employeeRelative.create({
    data: {
      id: crypto.randomUUID(),
      employeeId,
      kinshipId: data.kinshipId,
      lastName: data.lastName.trim(),
      firstName: data.firstName.trim(),
      documentType: data.documentType || 'DNI',
      documentNumber: data.documentNumber.trim(),
      cuil: cleanCuil || null,
      birthDate: new Date(data.birthDate),
    },
    include: {
      kinship: true,
    },
  });
}

/**
 * Modifica los datos de un familiar de empleado.
 */
export async function updateRelative(tenantPrisma, relativeId, data) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const existing = await tenantPrisma.employeeRelative.findFirst({
    where: { id: relativeId, deletedAt: null },
  });
  if (!existing) {
    const error = new Error('Familiar no encontrado');
    error.status = 404;
    throw error;
  }

  if (data.kinshipId) {
    const kinship = await tenantPrisma.kinship.findFirst({
      where: { id: data.kinshipId, deletedAt: null },
    });
    if (!kinship) {
      const error = new Error('El parentesco seleccionado no existe');
      error.status = 400;
      throw error;
    }
  }

  const updateData = {};
  if (data.kinshipId !== undefined) updateData.kinshipId = data.kinshipId;
  if (data.lastName !== undefined) updateData.lastName = data.lastName.trim();
  if (data.firstName !== undefined) updateData.firstName = data.firstName.trim();
  if (data.documentType !== undefined) updateData.documentType = data.documentType;
  if (data.documentNumber !== undefined) updateData.documentNumber = data.documentNumber.trim();
  if (data.cuil !== undefined) updateData.cuil = data.cuil ? data.cuil.replace(/\D/g, '') : null;
  if (data.birthDate !== undefined) updateData.birthDate = new Date(data.birthDate);

  return tenantPrisma.employeeRelative.update({
    where: { id: relativeId },
    data: updateData,
    include: {
      kinship: true,
    },
  });
}

/**
 * Da de baja lógica a un familiar de un empleado.
 */
export async function deleteRelative(tenantPrisma, relativeId) {
  await ensureTenantPersonnelSchema(tenantPrisma);

  const existing = await tenantPrisma.employeeRelative.findFirst({
    where: { id: relativeId, deletedAt: null },
  });
  if (!existing) {
    const error = new Error('Familiar no encontrado');
    error.status = 404;
    throw error;
  }

  return tenantPrisma.employeeRelative.update({
    where: { id: relativeId },
    data: { deletedAt: new Date() },
  });
}

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

  return tenantPrisma.employeeConcept.findMany({
    where: { employeeId },
    include: {
      concept: true,
    },
    orderBy: { createdAt: 'asc' },
  });
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
  return tenantPrisma.employeeConcept.findMany({
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

  const parsedAmount = amount !== undefined && amount !== null && amount !== '' ? Number(amount) : null;
  const parsedUnits = units !== undefined && units !== null && units !== '' ? Number(units) : null;
  const fromDate = (validFrom || startDate) ? new Date(validFrom || startDate) : null;
  const toDate = (validTo || endDate) ? new Date(validTo || endDate) : null;

  let assignedCount = 0;
  for (const empId of targets) {
    const existing = await tenantPrisma.employeeConcept.findFirst({
      where: { employeeId: empId, conceptId },
    });
    if (existing) {
      await tenantPrisma.employeeConcept.update({
        where: { id: existing.id },
        data: {
          amount: parsedAmount,
          units: parsedUnits,
          notes: notes ? notes.trim() : existing.notes,
          validFrom: fromDate,
          validTo: toDate,
          isActive: true,
        },
      });
    } else {
      await tenantPrisma.employeeConcept.create({
        data: {
          id: crypto.randomUUID(),
          employeeId: empId,
          conceptId,
          amount: parsedAmount,
          units: parsedUnits,
          notes: notes ? notes.trim() : null,
          validFrom: fromDate,
          validTo: toDate,
          isActive: true,
        },
      });
    }
    assignedCount++;
  }

  return { success: true, assignedCount };
}

