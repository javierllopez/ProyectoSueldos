import crypto from 'crypto';
import { ensureTenantIncomeTaxSchema } from '../../services/tenantProvisioner.service.js';

/**
 * Obtiene la ficha tributaria integral 360° de un colaborador para un año fiscal.
 */
export async function getEmployeeTaxProfile(tenantPrisma, employeeId, fiscalYear) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);
  const year = fiscalYear ? parseInt(fiscalYear, 10) : new Date().getFullYear();

  // 1. Datos básicos del empleado
  const employee = await tenantPrisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    include: {
      jobPosition: true,
      salaryScale: true,
      relatives: {
        where: { deletedAt: null },
        include: { kinship: true },
      },
    },
  });

  if (!employee) {
    const error = new Error('Colaborador no encontrado');
    error.status = 404;
    throw error;
  }

  // 2. Cargas de familia (clasificadas según deducibilidad)
  const familyDeductions = employee.relatives.map((r) => {
    const birthDate = new Date(r.birthDate);
    const now = new Date();
    let age = now.getFullYear() - birthDate.getFullYear();
    const m = now.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--;

    const isTaxEligible = r.appliesIncomeTax && (
      r.incomeTaxDeductionType === 'SPOUSE' ||
      r.incomeTaxDeductionType === 'DISABLED_CHILD' ||
      (r.incomeTaxDeductionType === 'CHILD' && (age < 18 || r.isDisability))
    );

    return {
      id: r.id,
      kinshipName: r.kinship.name,
      kinshipCode: r.kinship.code,
      fullName: `${r.lastName}, ${r.firstName}`,
      documentNumber: r.documentNumber,
      birthDate: r.birthDate,
      age,
      appliesIncomeTax: r.appliesIncomeTax,
      incomeTaxDeductionType: r.incomeTaxDeductionType,
      deductionPercentage: Number(r.deductionPercentage),
      isDisability: r.isDisability,
      hasNoIncomeOrBelowMni: r.hasNoIncomeOrBelowMni,
      validFromMonth: r.validFromMonth,
      validToMonth: r.validToMonth,
      isTaxEligible,
    };
  });

  // 3. Deducciones Generales del año
  const allDeductions = await tenantPrisma.employeeIncomeTaxDeduction.findMany({
    where: {
      employeeId,
      fiscalYear: year,
    },
    orderBy: [{ month: 'asc' }, { createdAt: 'desc' }],
  });

  const generalDeductions = [];

  for (const d of allDeductions) {
    if (d.deductionType && d.deductionType.startsWith('CARGA_FAMILIA_')) {
      let meta = {};
      try {
        meta = JSON.parse(d.notes || '{}');
      } catch (e) {}

      const rawType = d.deductionType.replace('CARGA_FAMILIA_', '');
      const bDate = meta.birthDate ? new Date(meta.birthDate) : new Date(year - 5, 0, 1);
      const now = new Date();
      let age = now.getFullYear() - bDate.getFullYear();
      const m = now.getMonth() - bDate.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < bDate.getDate())) age--;

      familyDeductions.push({
        id: d.id,
        kinshipName: rawType === 'SPOUSE' ? 'Cónyuge (SiRADIG)' : rawType === 'DISABLED_CHILD' ? 'Hijo Incapacitado (SiRADIG)' : 'Hijo/a (SiRADIG)',
        kinshipCode: rawType,
        fullName: `${meta.lastName || d.providerName || 'Familiar'} ${meta.firstName || ''}`.trim(),
        documentNumber: d.voucherNumber || meta.documentNumber || '-',
        birthDate: bDate,
        age,
        appliesIncomeTax: true,
        incomeTaxDeductionType: rawType,
        deductionPercentage: Number(meta.deductionPercentage || 100),
        isDisability: Boolean(meta.isDisability),
        hasNoIncomeOrBelowMni: true,
        validFromMonth: meta.fromMonth || 1,
        validToMonth: meta.toMonth || 12,
        isTaxEligible: true,
        isFiscalOnly: true,
        fiscalYear: year,
      });
    } else {
      generalDeductions.push(d);
    }
  }

  // 4. Otros Empleos (Pluriempleo)
  const otherIncomes = await tenantPrisma.employeeOtherIncome.findMany({
    where: {
      employeeId,
      fiscalYear: year,
    },
    orderBy: { month: 'asc' },
  });

  // 5. Pagos a Cuenta
  const paymentsOnAccount = await tenantPrisma.employeeIncomeTaxPaymentOnAccount.findMany({
    where: {
      employeeId,
      fiscalYear: year,
    },
    orderBy: { month: 'asc' },
  });

  // 6. Historial de Retenciones Mensuales en Liquidaciones de Ganancias
  const settlementDetails = await tenantPrisma.incomeTaxSettlementDetail.findMany({
    where: {
      employeeId,
      settlement: {
        fiscalYear: year,
      },
    },
    include: {
      settlement: true,
    },
    orderBy: {
      settlement: {
        month: 'asc',
      },
    },
  });

  // Calcular totales acumulados
  const totalGeneralDeductions = generalDeductions.reduce((sum, d) => sum + Number(d.amount), 0);
  const totalOtherGross = otherIncomes.reduce((sum, oi) => sum + Number(oi.grossIncome), 0);
  const totalPaymentsOnAccount = paymentsOnAccount.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalWithheldTax = settlementDetails.reduce((sum, s) => sum + Number(s.netMonthlyWithholding), 0);

  return {
    employee: {
      id: employee.id,
      fileNumber: employee.fileNumber,
      fullName: `${employee.lastName}, ${employee.firstName}`,
      cuil: employee.cuil,
      jobPosition: employee.jobPosition?.name || 'General',
      salaryScale: employee.salaryScale?.name || 'Sueldo Básico',
      basicSalary: Number(employee.basicSalary || employee.salaryScale?.amount || 0),
    },
    fiscalYear: year,
    familyDeductions,
    generalDeductions,
    otherIncomes,
    paymentsOnAccount,
    settlementDetails,
    summary: {
      totalFamilyChargesCount: familyDeductions.filter((f) => f.isTaxEligible).length,
      totalGeneralDeductions,
      totalOtherGross,
      totalPaymentsOnAccount,
      totalWithheldTax,
    },
  };
}

/**
 * CRUD de Deducciones Generales individuales
 */
export async function createEmployeeDeduction(tenantPrisma, employeeId, data) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);

  return tenantPrisma.employeeIncomeTaxDeduction.create({
    data: {
      id: crypto.randomUUID(),
      employeeId,
      fiscalYear: parseInt(data.fiscalYear, 10),
      deductionType: data.deductionType,
      providerCuit: data.providerCuit ? data.providerCuit.replace(/\D/g, '') : null,
      providerName: data.providerName ? data.providerName.trim() : null,
      voucherType: data.voucherType ? data.voucherType.trim() : null,
      voucherNumber: data.voucherNumber ? data.voucherNumber.trim() : null,
      month: data.month ? parseInt(data.month, 10) : null,
      amount: parseFloat(data.amount),
      source: data.source || 'MANUAL',
      notes: data.notes ? data.notes.trim() : null,
    },
  });
}

export async function deleteEmployeeDeduction(tenantPrisma, deductionId) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);
  return tenantPrisma.employeeIncomeTaxDeduction.delete({
    where: { id: deductionId },
  });
}

/**
 * CRUD de Otros Ingresos (Pluriempleo)
 */
export async function createEmployeeOtherIncome(tenantPrisma, employeeId, data) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);

  return tenantPrisma.employeeOtherIncome.create({
    data: {
      id: crypto.randomUUID(),
      employeeId,
      fiscalYear: parseInt(data.fiscalYear, 10),
      month: parseInt(data.month, 10),
      employerCuit: data.employerCuit.replace(/\D/g, ''),
      employerName: data.employerName.trim(),
      grossIncome: parseFloat(data.grossIncome),
      nonTaxableIncome: data.nonTaxableIncome ? parseFloat(data.nonTaxableIncome) : 0.0,
      exemptIncome: data.exemptIncome ? parseFloat(data.exemptIncome) : 0.0,
      pensionContrib: data.pensionContrib ? parseFloat(data.pensionContrib) : 0.0,
      healthInsuranceContrib: data.healthInsuranceContrib ? parseFloat(data.healthInsuranceContrib) : 0.0,
      unionContrib: data.unionContrib ? parseFloat(data.unionContrib) : 0.0,
      withheldTax: data.withheldTax ? parseFloat(data.withheldTax) : 0.0,
      source: data.source || 'MANUAL',
    },
  });
}

export async function deleteEmployeeOtherIncome(tenantPrisma, otherIncomeId) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);
  return tenantPrisma.employeeOtherIncome.delete({
    where: { id: otherIncomeId },
  });
}

/**
 * CRUD de Pagos a Cuenta
 */
export async function createEmployeePaymentOnAccount(tenantPrisma, employeeId, data) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);

  return tenantPrisma.employeeIncomeTaxPaymentOnAccount.create({
    data: {
      id: crypto.randomUUID(),
      employeeId,
      fiscalYear: parseInt(data.fiscalYear, 10),
      paymentType: data.paymentType,
      cuitAgent: data.cuitAgent ? data.cuitAgent.replace(/\D/g, '') : null,
      agentName: data.agentName ? data.agentName.trim() : null,
      month: parseInt(data.month, 10),
      amount: parseFloat(data.amount),
      source: data.source || 'MANUAL',
    },
  });
}

export async function deleteEmployeePaymentOnAccount(tenantPrisma, paymentId) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);
  return tenantPrisma.employeeIncomeTaxPaymentOnAccount.delete({
    where: { id: paymentId },
  });
}
