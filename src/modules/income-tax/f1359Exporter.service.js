import { ensureTenantIncomeTaxSchema } from '../../services/tenantProvisioner.service.js';
import { calculateMonthlyIncomeTax } from './incomeTax.service.js';

/**
 * Genera la liquidación anual consolidada de Impuesto a las Ganancias Cuarta Categoría (Mes 12).
 */
export async function calculateAnnualSettlement(tenantPrisma, { fiscalYear }) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);
  const year = parseInt(fiscalYear, 10);

  // Ejecuta la liquidación de diciembre (mes 12) con tipo ANNUAL
  return calculateMonthlyIncomeTax(tenantPrisma, {
    fiscalYear: year,
    month: 12,
    settlementType: 'ANNUAL',
    description: `Liquidación Anual Impuesto a las Ganancias F.1359 - Período Fiscal ${year}`,
  });
}

/**
 * Genera el archivo oficial de texto F. 1359 para presentación ante ARCA (ex-AFIP).
 * Formato oficial de registros:
 * 01: Cabecera Agente de Retención
 * 02: Datos del Trabajador
 * 03: Ganancias Brutas del Período
 * 04: Deducciones de Ley y Generales
 * 05: Cargas de Familia y Deducciones Art. 30
 * 06: Determinación del Impuesto y Saldos
 */
export async function generateF1359File(tenantPrisma, { fiscalYear, settlementType = '1' }) {
  await ensureTenantIncomeTaxSchema(tenantPrisma);
  const year = parseInt(fiscalYear, 10);

  // 1. Obtener perfil de la empresa (Agente de retención)
  const companyProfile = await tenantPrisma.companyProfile.findFirst();
  const agentCuit = (companyProfile?.cuit || '30000000007').replace(/\D/g, '').padStart(11, '0');
  const agentName = (companyProfile?.legalName || 'EMPRESA SA').padEnd(50, ' ').substring(0, 50);

  // 2. Buscar liquidación anual o mensual de diciembre
  let settlement = await tenantPrisma.incomeTaxSettlement.findFirst({
    where: {
      fiscalYear: year,
      month: 12,
    },
    include: {
      details: {
        include: {
          employee: {
            include: {
              jobPosition: true,
              relatives: { where: { deletedAt: null } },
            },
          },
        },
      },
    },
  });

  // Si no se calculó aún, ejecutarla automáticamente
  if (!settlement) {
    const annualRun = await calculateAnnualSettlement(tenantPrisma, { fiscalYear: year });
    settlement = await tenantPrisma.incomeTaxSettlement.findUnique({
      where: { id: annualRun.settlement.id },
      include: {
        details: {
          include: {
            employee: {
              include: {
                jobPosition: true,
                relatives: { where: { deletedAt: null } },
              },
            },
          },
        },
      },
    });
  }

  const lines = [];

  // REGISTRO 01: Cabecera
  // Formato: 01 + CUIT (11) + PERIODO (4) + TIPO_LIQ (1) + SECUENCIA (2) + VERSION (5) + RAZON_SOCIAL (50)
  const headerRecord = [
    '01',
    agentCuit,
    year.toString().padStart(4, '0'),
    settlementType.toString().substring(0, 1),
    '00',
    '02000', // Versión 2.0 F.1359
    agentName,
  ].join('');
  lines.push(headerRecord);

  // Helper para formatear importes numéricos a 12 enteros + 2 decimales sin punto ni coma
  const formatAmount = (num) => {
    const val = Math.round((Number(num) || 0) * 100);
    const sign = val < 0 ? '-' : '+';
    const absVal = Math.abs(val).toString().padStart(14, '0');
    return `${sign}${absVal}`;
  };

  // Recorrer cada empleado liquidado
  for (const detail of settlement.details) {
    const emp = detail.employee;
    const cleanCuil = (emp.cuil || '20000000001').replace(/\D/g, '').padStart(11, '0');
    const empName = `${emp.lastName} ${emp.firstName}`.padEnd(40, ' ').substring(0, 40);

    // REGISTRO 02: Datos del Empleado
    // Formato: 02 + CUIL (11) + APELLIDO_NOMBRE (40) + MESES_TRABAJADOS (2)
    const empRecord = [
      '02',
      cleanCuil,
      empName,
      '12',
    ].join('');
    lines.push(empRecord);

    // REGISTRO 03: Ganancias Brutas
    // 03 + CUIL (11) + BRUTO_HABITUAL (15) + SAC (15) + OTROS_EMPLEOS (15) + TOTAL_BRUTO (15)
    const grossRecord = [
      '03',
      cleanCuil,
      formatAmount(detail.accumulatedGross),
      formatAmount(detail.sacProjectedAccumulated),
      formatAmount(detail.otherEmployersGross),
      formatAmount(detail.currentMonthGross),
    ].join('');
    lines.push(grossRecord);

    // REGISTRO 04: Deducciones Generales y de Ley
    // 04 + CUIL (11) + DEDUC_LEY (15) + DEDUC_GENERALES (15)
    const deductionsRecord = [
      '04',
      cleanCuil,
      formatAmount(detail.legalDeductionsAccumulated),
      formatAmount(detail.generalDeductionsAccumulated),
    ].join('');
    lines.push(deductionsRecord);

    // REGISTRO 05: Deducciones Personales Art. 30
    // 05 + CUIL (11) + TOTAL_ART30 (15)
    const personalRecord = [
      '05',
      cleanCuil,
      formatAmount(detail.personalDeductionsAccumulated),
    ].join('');
    lines.push(personalRecord);

    // REGISTRO 06: Determinación del Impuesto y Saldos
    // 06 + CUIL (11) + BASE_IMPONIBLE (15) + IMPUESTO_DETERMINADO (15) + PAGOS_CUENTA (15) + RETENCIONES_PREVIAS (15) + SALDO_FINAL (15)
    const taxRecord = [
      '06',
      cleanCuil,
      formatAmount(detail.netTaxableIncomeAccumulated),
      formatAmount(detail.determinedTaxAccumulated),
      formatAmount(detail.paymentsOnAccountAccumulated),
      formatAmount(detail.priorMonthsWithheldTax),
      formatAmount(detail.netMonthlyWithholding),
    ].join('');
    lines.push(taxRecord);
  }

  const fileContent = lines.join('\r\n') + '\r\n';
  const filename = `F1359_${agentCuit}_${year}_${settlementType}.txt`;

  return {
    filename,
    fiscalYear: year,
    totalRecords: lines.length,
    employeesCount: settlement.details.length,
    totalWithheldAmount: settlement.totalWithheldAmount,
    totalRefundAmount: settlement.totalRefundAmount,
    fileContent,
  };
}
