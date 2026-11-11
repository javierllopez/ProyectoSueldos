import crypto from 'crypto';
import { ensureTenantPersonnelSchema } from '../../../services/tenantProvisioner.service.js';
import { getEmployeeById } from './employeeCore.service.js';

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

export const PRIMARY_KINSHIP_CODES = new Set([
  'CONYUGE',
  'CONVIVIENTE',
  'HIJO_MENOR_21',
  'HIJO_ESTUDIANTE',
  'HIJO_INCAPACITADO',
  'TUTELA',
]);

export function isPrimaryFamilyKinship(kinship) {
  if (!kinship) return false;
  const code = String(kinship.code || '').toUpperCase().trim();
  if (PRIMARY_KINSHIP_CODES.has(code)) return true;
  if (code.startsWith('HIJO')) return true;
  const name = String(kinship.name || '').toLowerCase();
  if (name.includes('cónyuge') || name.includes('conyuge') || name.includes('conviviente') || name.includes('hijo') || name.includes('tutela') || name.includes('guarda')) {
    return true;
  }
  return false;
}

/**
 * Valida la admisibilidad fiscal de una carga de familia conforme al Art. 30 Ley 27.743 y RG 4003.
 */
export function validateRelativeTaxEligibility(data, birthDate, kinship) {
  if (!data.appliesIncomeTax) return;

  if (!data.incomeTaxDeductionType) {
    const error = new Error('Debe especificar el tipo de deducción de ganancias (Cónyuge, Hijo o Hijo Incapacitado)');
    error.status = 400;
    throw error;
  }

  // Calcular edad a la fecha
  const bDate = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - bDate.getFullYear();
  const m = now.getMonth() - bDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bDate.getDate())) {
    age--;
  }

  if (data.incomeTaxDeductionType === 'CHILD') {
    if (age >= 18 && !data.isDisability) {
      const error = new Error(`El familiar tiene ${age} años. Para ser deducible en Impuesto a las Ganancias como hijo común debe ser menor de 18 años (Ley 27.743). Si posee incapacidad para el trabajo, debe seleccionarse 'Hijo/a Incapacitado/a'.`);
      error.status = 400;
      throw error;
    }
  }

  if (data.incomeTaxDeductionType === 'SPOUSE') {
    const kinshipCode = (kinship?.code || '').toUpperCase();
    if (kinshipCode.includes('HIJO') || kinshipCode.includes('HERMANO') || kinshipCode.includes('PADRE')) {
      const error = new Error('El tipo de deducción CÓNYUGE sólo puede asignarse a cónyuge o conviviente.');
      error.status = 400;
      throw error;
    }
    if (data.hasNoIncomeOrBelowMni === false) {
      const error = new Error('El cónyuge sólo puede deducirse si sus ingresos anuales netos no superan el Mínimo No Imponible.');
      error.status = 400;
      throw error;
    }
  }

  const pct = Number(data.deductionPercentage);
  if (isNaN(pct) || pct <= 0 || pct > 100) {
    const error = new Error('El porcentaje de deducción debe ser entre 1% y 100% (habitualmente 100% o 50% compartido).');
    error.status = 400;
    throw error;
  }

  const fromMonth = data.validFromMonth !== undefined ? parseInt(data.validFromMonth, 10) : 1;
  const toMonth = data.validToMonth !== undefined ? parseInt(data.validToMonth, 10) : 12;
  if (fromMonth < 1 || fromMonth > 12 || toMonth < 1 || toMonth > 12 || fromMonth > toMonth) {
    const error = new Error('Los meses de vigencia de la deducción deben ser válidos (de 1 a 12, con mes desde menor o igual a mes hasta).');
    error.status = 400;
    throw error;
  }
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

  const isAdherent = Boolean(data.isAdherent);
  if (isAdherent && isPrimaryFamilyKinship(kinship)) {
    const error = new Error('Los familiares del grupo familiar primario (cónyuge, conviviente, hijos y tutelados) poseen cobertura automática de Obra Social conforme al Art. 9 Ley 23.660 y no pueden registrarse como adherentes adicionales.');
    error.status = 400;
    throw error;
  }

  // Validación fiscal para Impuesto a las Ganancias
  validateRelativeTaxEligibility(data, data.birthDate, kinship);

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
      isAdherent,
      appliesIncomeTax: Boolean(data.appliesIncomeTax),
      incomeTaxDeductionType: data.incomeTaxDeductionType || null,
      deductionPercentage: data.deductionPercentage !== undefined ? Number(data.deductionPercentage) : 100.00,
      isDisability: Boolean(data.isDisability),
      hasNoIncomeOrBelowMni: data.hasNoIncomeOrBelowMni !== undefined ? Boolean(data.hasNoIncomeOrBelowMni) : true,
      validFromMonth: data.validFromMonth !== undefined ? parseInt(data.validFromMonth, 10) : 1,
      validToMonth: data.validToMonth !== undefined ? parseInt(data.validToMonth, 10) : 12,
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
    include: { kinship: true },
  });
  if (!existing) {
    const error = new Error('Familiar no encontrado');
    error.status = 404;
    throw error;
  }

  let targetKinship = existing.kinship;
  if (data.kinshipId) {
    const kinship = await tenantPrisma.kinship.findFirst({
      where: { id: data.kinshipId, deletedAt: null },
    });
    if (!kinship) {
      const error = new Error('El parentesco seleccionado no existe');
      error.status = 400;
      throw error;
    }
    targetKinship = kinship;
  }

  const willBeAdherent = data.isAdherent !== undefined ? Boolean(data.isAdherent) : Boolean(existing.isAdherent);
  if (willBeAdherent && isPrimaryFamilyKinship(targetKinship)) {
    const error = new Error('Los familiares del grupo familiar primario (cónyuge, conviviente, hijos y tutelados) poseen cobertura automática de Obra Social conforme al Art. 9 Ley 23.660 y no pueden registrarse como adherentes adicionales.');
    error.status = 400;
    throw error;
  }

  const mergedTaxData = {
    appliesIncomeTax: data.appliesIncomeTax !== undefined ? Boolean(data.appliesIncomeTax) : Boolean(existing.appliesIncomeTax),
    incomeTaxDeductionType: data.incomeTaxDeductionType !== undefined ? data.incomeTaxDeductionType : existing.incomeTaxDeductionType,
    deductionPercentage: data.deductionPercentage !== undefined ? Number(data.deductionPercentage) : Number(existing.deductionPercentage),
    isDisability: data.isDisability !== undefined ? Boolean(data.isDisability) : Boolean(existing.isDisability),
    hasNoIncomeOrBelowMni: data.hasNoIncomeOrBelowMni !== undefined ? Boolean(data.hasNoIncomeOrBelowMni) : Boolean(existing.hasNoIncomeOrBelowMni),
    validFromMonth: data.validFromMonth !== undefined ? parseInt(data.validFromMonth, 10) : existing.validFromMonth,
    validToMonth: data.validToMonth !== undefined ? parseInt(data.validToMonth, 10) : existing.validToMonth,
  };
  const targetBirthDate = data.birthDate ? new Date(data.birthDate) : existing.birthDate;
  validateRelativeTaxEligibility(mergedTaxData, targetBirthDate, targetKinship);

  const updateData = {};
  if (data.kinshipId !== undefined) updateData.kinshipId = data.kinshipId;
  if (data.lastName !== undefined) updateData.lastName = data.lastName.trim();
  if (data.firstName !== undefined) updateData.firstName = data.firstName.trim();
  if (data.documentType !== undefined) updateData.documentType = data.documentType;
  if (data.documentNumber !== undefined) updateData.documentNumber = data.documentNumber.trim();
  if (data.cuil !== undefined) updateData.cuil = data.cuil ? data.cuil.replace(/\D/g, '') : null;
  if (data.birthDate !== undefined) updateData.birthDate = new Date(data.birthDate);
  if (data.isAdherent !== undefined) updateData.isAdherent = willBeAdherent;
  if (data.appliesIncomeTax !== undefined) updateData.appliesIncomeTax = Boolean(data.appliesIncomeTax);
  if (data.incomeTaxDeductionType !== undefined) updateData.incomeTaxDeductionType = data.incomeTaxDeductionType;
  if (data.deductionPercentage !== undefined) updateData.deductionPercentage = Number(data.deductionPercentage);
  if (data.isDisability !== undefined) updateData.isDisability = Boolean(data.isDisability);
  if (data.hasNoIncomeOrBelowMni !== undefined) updateData.hasNoIncomeOrBelowMni = Boolean(data.hasNoIncomeOrBelowMni);
  if (data.validFromMonth !== undefined) updateData.validFromMonth = parseInt(data.validFromMonth, 10);
  if (data.validToMonth !== undefined) updateData.validToMonth = parseInt(data.validToMonth, 10);

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
