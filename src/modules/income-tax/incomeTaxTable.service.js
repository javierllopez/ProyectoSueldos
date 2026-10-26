import crypto from 'crypto';
import { ensureTenantIncomeTaxSchema } from '../../services/tenantProvisioner.service.js';

// Base oficial Art. 30 Ley 27.743 para Semestre 2 2024 (valores mensuales)
const BASE_2024_S2 = {
  nonTaxableMinimum: 302232.00,
  specialDeduction: 1450713.60,
  spouseDeduction: 284646.72,
  childDeduction: 143548.00,
  disabledChildDeduction: 287096.00,
  specialDeductionNewProf: 1740856.32,
};

// Base anual oficial Art. 94 Ley 27.743
const BASE_SCALES_ANNUAL = [
  { step: 1, fromAmount: 0.00, toAmount: 1440000.00, fixedAmount: 0.00, ratePercentage: 5.00 },
  { step: 2, fromAmount: 1440000.00, toAmount: 2880000.00, fixedAmount: 72000.00, ratePercentage: 9.00 },
  { step: 3, fromAmount: 2880000.00, toAmount: 4320000.00, fixedAmount: 201600.00, ratePercentage: 12.00 },
  { step: 4, fromAmount: 4320000.00, toAmount: 6480000.00, fixedAmount: 374400.00, ratePercentage: 15.00 },
  { step: 5, fromAmount: 6480000.00, toAmount: 9720000.00, fixedAmount: 698400.00, ratePercentage: 19.00 },
  { step: 6, fromAmount: 9720000.00, toAmount: 14580000.00, fixedAmount: 1314000.00, ratePercentage: 23.00 },
  { step: 7, fromAmount: 14580000.00, toAmount: 21870000.00, fixedAmount: 2431800.00, ratePercentage: 27.00 },
  { step: 8, fromAmount: 21870000.00, toAmount: 32805000.00, fixedAmount: 4399500.00, ratePercentage: 31.00 },
  { step: 9, fromAmount: 32805000.00, toAmount: null, fixedAmount: 7789350.00, ratePercentage: 35.00 },
];

const DEFAULT_LIMITS = [
  { code: 'ALQUILER_INQUILINO', name: 'Alquiler Casa Habitación (Inquilino)', limitType: 'PERCENTAGE_VOUCHER_MNI_CAP', limitValue: 10.00, description: '10% del importe pagado hasta el 100% del MNI acumulado' },
  { code: 'ALQUILER_DUENO', name: 'Alquiler Casa Habitación (Propietario / Locador)', limitType: 'PERCENTAGE_VOUCHER_NO_CAP', limitValue: 10.00, description: 'Deducción del 10% del monto facturado sin tope de MNI (Ley 27.743)' },
  { code: 'GASTOS_EDUCATIVOS', name: 'Gastos y Herramientas de Educación', limitType: 'MNI_PERCENTAGE', limitValue: 40.00, description: 'Hasta el 40% del MNI anual acumulado por hijo escolarizado hasta 24 años' },
  { code: 'PREPAGA', name: 'Cuota Médico Asistencial (Medicina Prepaga)', limitType: 'PERCENTAGE_NET_INCOME', limitValue: 5.00, description: 'Hasta el 5% de la ganancia neta acumulada antes de esta deducción' },
  { code: 'DONACIONES', name: 'Donaciones a Fiscos y Entidades Exentas', limitType: 'PERCENTAGE_NET_INCOME', limitValue: 5.00, description: 'Hasta el 5% de la ganancia neta acumulada' },
  { code: 'DOMESTICO', name: 'Personal de Casas Particulares (Ley 26.844)', limitType: 'MNI_PERCENTAGE', limitValue: 100.00, description: 'Sueldos y aportes patronales hasta el 100% del MNI anual acumulado' },
  { code: 'SEGURO_VIDA', name: 'Seguros de Vida', limitType: 'ANNUAL_FIXED', limitValue: 198049.94, description: 'Tope fijo anual prorrateable mensualmente' },
  { code: 'SEGURO_RETIRO', name: 'Seguros de Retiro Privados', limitType: 'ANNUAL_FIXED', limitValue: 198049.94, description: 'Tope fijo anual prorrateable mensualmente' },
  { code: 'HIPOTECARIO', name: 'Intereses Créditos Hipotecarios Casa Habitación', limitType: 'ANNUAL_FIXED', limitValue: 20000.00, description: 'Tope de $20.000 anuales fijado por el Art. 85 LIG' },
  { code: 'SEPELIO', name: 'Gastos de Sepelio Titular y Cargas de Familia', limitType: 'ANNUAL_FIXED', limitValue: 996.23, description: 'Tope de $996,23 fijado por el Art. 28 LIG' },
  { code: 'VIATICOS', name: 'Gastos de Movilidad y Viáticos', limitType: 'MNI_PERCENTAGE', limitValue: 40.00, description: 'Hasta el 40% del MNI acumulado' },
];

/**
 * Precarga las tablas impositivas (Art. 30, Art. 94 y Límites) si no existen para un año dado.
 */
export async function seedIncomeTaxDefaultsForYear(tenantClient, year) {
  await ensureTenantIncomeTaxSchema(tenantClient);

  // 1. Tablas Art. 30
  const countTables = await tenantClient.incomeTaxTable.count({ where: { year } });
  if (countTables === 0) {
    // Factor de ajuste para años futuros (ej. 2025/2026 vs 2024 base)
    const factor = year === 2024 ? 1.0 : year === 2025 ? 1.35 : 1.55;

    for (let month = 1; month <= 12; month++) {
      const sem = month <= 6 ? 1 : 2;
      const mFactor = month; // Progresión acumulativa mensual 1..12

      await tenantClient.incomeTaxTable.create({
        data: {
          id: crypto.randomUUID(),
          year,
          semester: sem,
          month,
          description: `Tabla Art. 30 acumulada al mes ${month}/${year}`,
          nonTaxableMinimum: Math.round(BASE_2024_S2.nonTaxableMinimum * factor * mFactor * 100) / 100,
          specialDeduction: Math.round(BASE_2024_S2.specialDeduction * factor * mFactor * 100) / 100,
          spouseDeduction: Math.round(BASE_2024_S2.spouseDeduction * factor * mFactor * 100) / 100,
          childDeduction: Math.round(BASE_2024_S2.childDeduction * factor * mFactor * 100) / 100,
          disabledChildDeduction: Math.round(BASE_2024_S2.disabledChildDeduction * factor * mFactor * 100) / 100,
          specialDeductionNewProf: Math.round(BASE_2024_S2.specialDeductionNewProf * factor * mFactor * 100) / 100,
        },
      });
    }
  }

  // 2. Escalas Art. 94
  const countScales = await tenantClient.incomeTaxScale.count({ where: { year } });
  if (countScales === 0) {
    const factor = year === 2024 ? 1.0 : year === 2025 ? 1.35 : 1.55;

    for (let month = 1; month <= 12; month++) {
      const monthRatio = month / 12;

      for (const scale of BASE_SCALES_ANNUAL) {
        const fromAmount = Math.round(scale.fromAmount * factor * monthRatio * 100) / 100;
        const toAmount = scale.toAmount !== null
          ? Math.round(scale.toAmount * factor * monthRatio * 100) / 100
          : null;
        const fixedAmount = Math.round(scale.fixedAmount * factor * monthRatio * 100) / 100;

        await tenantClient.incomeTaxScale.create({
          data: {
            id: crypto.randomUUID(),
            year,
            month,
            step: scale.step,
            fromAmount,
            toAmount,
            fixedAmount,
            ratePercentage: scale.ratePercentage,
          },
        });
      }
    }
  }

  // 3. Límites Deducciones Generales
  const countLimits = await tenantClient.incomeTaxGeneralDeductionLimit.count({ where: { year } });
  if (countLimits === 0) {
    for (const lim of DEFAULT_LIMITS) {
      await tenantClient.incomeTaxGeneralDeductionLimit.create({
        data: {
          id: crypto.randomUUID(),
          year,
          code: lim.code,
          name: lim.name,
          limitType: lim.limitType,
          limitValue: lim.limitValue,
          description: lim.description,
        },
      });
    }
  }
}

/**
 * Obtiene las tablas del Art. 30 para un año (y mes opcional).
 */
export async function listIncomeTaxTables(tenantClient, { year, month } = {}) {
  await ensureTenantIncomeTaxSchema(tenantClient);
  const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();

  await seedIncomeTaxDefaultsForYear(tenantClient, targetYear);

  const where = { year: targetYear };
  if (month) where.month = parseInt(month, 10);

  return tenantClient.incomeTaxTable.findMany({
    where,
    orderBy: { month: 'asc' },
  });
}

/**
 * Obtiene la tabla Art. 30 para un período específico (año y mes).
 */
export async function getIncomeTaxTableByPeriod(tenantClient, year, month) {
  await ensureTenantIncomeTaxSchema(tenantClient);
  await seedIncomeTaxDefaultsForYear(tenantClient, year);

  return tenantClient.incomeTaxTable.findUnique({
    where: {
      year_month: {
        year: parseInt(year, 10),
        month: parseInt(month, 10),
      },
    },
  });
}

/**
 * Actualiza los montos de una tabla del Art. 30.
 */
export async function updateIncomeTaxTable(tenantClient, id, data) {
  await ensureTenantIncomeTaxSchema(tenantClient);

  const updateData = {};
  if (data.nonTaxableMinimum !== undefined) updateData.nonTaxableMinimum = data.nonTaxableMinimum;
  if (data.specialDeduction !== undefined) updateData.specialDeduction = data.specialDeduction;
  if (data.spouseDeduction !== undefined) updateData.spouseDeduction = data.spouseDeduction;
  if (data.childDeduction !== undefined) updateData.childDeduction = data.childDeduction;
  if (data.disabledChildDeduction !== undefined) updateData.disabledChildDeduction = data.disabledChildDeduction;
  if (data.specialDeductionNewProf !== undefined) updateData.specialDeductionNewProf = data.specialDeductionNewProf;
  if (data.description !== undefined) updateData.description = data.description;

  return tenantClient.incomeTaxTable.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Lista las escalas del Art. 94 para un año y mes.
 */
export async function listIncomeTaxScales(tenantClient, { year, month } = {}) {
  await ensureTenantIncomeTaxSchema(tenantClient);
  const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();
  await seedIncomeTaxDefaultsForYear(tenantClient, targetYear);

  const where = { year: targetYear };
  if (month) where.month = parseInt(month, 10);

  return tenantClient.incomeTaxScale.findMany({
    where,
    orderBy: [{ month: 'asc' }, { step: 'asc' }],
  });
}

/**
 * Actualiza un escalón de la escala del Art. 94.
 */
export async function updateIncomeTaxScale(tenantClient, id, data) {
  await ensureTenantIncomeTaxSchema(tenantClient);

  const updateData = {};
  if (data.fromAmount !== undefined) updateData.fromAmount = data.fromAmount;
  if (data.toAmount !== undefined) updateData.toAmount = data.toAmount;
  if (data.fixedAmount !== undefined) updateData.fixedAmount = data.fixedAmount;
  if (data.ratePercentage !== undefined) updateData.ratePercentage = data.ratePercentage;

  return tenantClient.incomeTaxScale.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Lista los límites de deducciones generales de un año fiscal.
 */
export async function listGeneralDeductionLimits(tenantClient, { year } = {}) {
  await ensureTenantIncomeTaxSchema(tenantClient);
  const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();
  await seedIncomeTaxDefaultsForYear(tenantClient, targetYear);

  return tenantClient.incomeTaxGeneralDeductionLimit.findMany({
    where: { year: targetYear },
    orderBy: { code: 'asc' },
  });
}

/**
 * Actualiza un límite de deducción general.
 */
export async function updateGeneralDeductionLimit(tenantClient, id, data) {
  await ensureTenantIncomeTaxSchema(tenantClient);

  const updateData = {};
  if (data.limitValue !== undefined) updateData.limitValue = data.limitValue;
  if (data.description !== undefined) updateData.description = data.description;

  return tenantClient.incomeTaxGeneralDeductionLimit.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Clona y/o ajusta tablas impositivas de un año hacia otro aplicando factor IPC.
 */
export async function cloneAndAdjustYear(tenantClient, { sourceYear, targetYear, ipcPercentage }) {
  await ensureTenantIncomeTaxSchema(tenantClient);
  const factor = 1 + (parseFloat(ipcPercentage) || 0) / 100;

  await seedIncomeTaxDefaultsForYear(tenantClient, sourceYear);

  // 1. Eliminar o sobreescribir año destino si ya existía
  await tenantClient.incomeTaxScale.deleteMany({ where: { year: targetYear } });
  await tenantClient.incomeTaxTable.deleteMany({ where: { year: targetYear } });

  // 2. Clonar Art. 30
  const sourceTables = await tenantClient.incomeTaxTable.findMany({
    where: { year: sourceYear },
    orderBy: { month: 'asc' },
  });

  for (const t of sourceTables) {
    await tenantClient.incomeTaxTable.create({
      data: {
        id: crypto.randomUUID(),
        year: targetYear,
        semester: t.semester,
        month: t.month,
        description: `Ajustado IPC (+${ipcPercentage}%) desde ${sourceYear}`,
        nonTaxableMinimum: Math.round(Number(t.nonTaxableMinimum) * factor * 100) / 100,
        specialDeduction: Math.round(Number(t.specialDeduction) * factor * 100) / 100,
        spouseDeduction: Math.round(Number(t.spouseDeduction) * factor * 100) / 100,
        childDeduction: Math.round(Number(t.childDeduction) * factor * 100) / 100,
        disabledChildDeduction: Math.round(Number(t.disabledChildDeduction) * factor * 100) / 100,
        specialDeductionNewProf: Math.round(Number(t.specialDeductionNewProf || 0) * factor * 100) / 100,
      },
    });
  }

  // 3. Clonar Escalas Art. 94
  const sourceScales = await tenantClient.incomeTaxScale.findMany({
    where: { year: sourceYear },
    orderBy: [{ month: 'asc' }, { step: 'asc' }],
  });

  for (const s of sourceScales) {
    await tenantClient.incomeTaxScale.create({
      data: {
        id: crypto.randomUUID(),
        year: targetYear,
        month: s.month,
        step: s.step,
        fromAmount: Math.round(Number(s.fromAmount) * factor * 100) / 100,
        toAmount: s.toAmount !== null ? Math.round(Number(s.toAmount) * factor * 100) / 100 : null,
        fixedAmount: Math.round(Number(s.fixedAmount) * factor * 100) / 100,
        ratePercentage: s.ratePercentage,
      },
    });
  }

  // 4. Clonar Límites Generales si no existen para targetYear
  const existingLimits = await tenantClient.incomeTaxGeneralDeductionLimit.count({ where: { year: targetYear } });
  if (existingLimits === 0) {
    const sourceLimits = await tenantClient.incomeTaxGeneralDeductionLimit.findMany({ where: { year: sourceYear } });
    for (const lim of sourceLimits) {
      await tenantClient.incomeTaxGeneralDeductionLimit.create({
        data: {
          id: crypto.randomUUID(),
          year: targetYear,
          code: lim.code,
          name: lim.name,
          limitType: lim.limitType,
          limitValue: lim.limitType === 'ANNUAL_FIXED' ? Math.round(Number(lim.limitValue) * factor * 100) / 100 : lim.limitValue,
          description: lim.description,
        },
      });
    }
  }

  return {
    sourceYear,
    targetYear,
    ipcPercentage,
    factor,
    message: `Tablas del año ${targetYear} generadas con éxito con un ajuste del ${ipcPercentage}%`,
  };
}
