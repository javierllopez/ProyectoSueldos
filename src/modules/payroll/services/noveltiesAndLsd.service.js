import crypto from 'crypto';
import { ensureTenantPayrollSchema } from '../../../services/tenantProvisioner.service.js';
import {
  generateLsdConceptsFile,
  generateLsdPayrollFile,
  validateLsdConsistency,
  generateMonthlyLsdPayrollFile,
  validateMonthlyLsdConsistency,
} from '../lsdExporter.service.js';
import { getPayrollSettings } from './conceptsAndRules.service.js';
import { getPeriodById } from './periodsAndCalculation.service.js';

// --- EXPORTACIÓN LIBRO DE SUELDOS DIGITAL (ARCA) ---

export async function exportLsdConcepts(tenantPrisma) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const concepts = await tenantPrisma.concept.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { code: 'asc' },
  });

  return generateLsdConceptsFile(concepts);
}

export async function exportLsdPayroll(tenantPrisma, periodId, company) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const period = await getPeriodById(tenantPrisma, periodId);

  let companyProfile = company;
  if (!companyProfile?.cuit) {
    companyProfile = (await tenantPrisma.companyProfile.findFirst({ where: { deletedAt: null } })) || company || {};
  }

  const paySlips = await tenantPrisma.paySlip.findMany({
    where: { payrollPeriodId: periodId, deletedAt: null },
    include: {
      employee: {
        include: {
          department: true,
          jobPosition: true,
          healthInsurance: true,
          salaryScale: true,
          relatives: { where: { deletedAt: null }, include: { kinship: true } },
        },
      },
      items: { orderBy: { conceptCode: 'asc' } },
      basis: true,
    },
    orderBy: { employee: { fileNumber: 'asc' } },
  });

  if (paySlips.length === 0) {
    const err = new Error('La liquidación no tiene recibos calculados para exportar a ARCA');
    err.status = 400;
    throw err;
  }

  const payrollSettings = await getPayrollSettings(tenantPrisma);

  return generateLsdPayrollFile({
    company: companyProfile,
    period,
    paySlips,
    payrollSettings,
  });
}

export async function validateLsd(tenantPrisma, periodId) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const period = await getPeriodById(tenantPrisma, periodId);

  const paySlips = await tenantPrisma.paySlip.findMany({
    where: { payrollPeriodId: periodId, deletedAt: null },
    include: {
      employee: {
        include: {
          department: true,
          jobPosition: true,
          healthInsurance: true,
          salaryScale: true,
          relatives: { where: { deletedAt: null }, include: { kinship: true } },
        },
      },
      items: true,
      basis: true,
    },
    orderBy: { employee: { fileNumber: 'asc' } },
  });

  const payrollSettings = await getPayrollSettings(tenantPrisma);
  const companyProfile = await tenantPrisma.companyProfile.findFirst({ where: { deletedAt: null } });

  const settlements = await tenantPrisma.payrollPeriod.findMany({
    where: { year: period.year, month: period.month },
  });

  return validateLsdConsistency({
    paySlips,
    payrollSettings,
    company: companyProfile || {},
    settlements,
  });
}

export async function getMonthlyLsdPeriods(tenantPrisma) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const periods = await tenantPrisma.payrollPeriod.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { settlementNumber: 'asc' }],
    include: {
      _count: {
        select: { paySlips: { where: { deletedAt: null } } },
      },
    },
  });

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  const typeLabels = {
    MONTHLY: 'Mensual',
    QUINCE_1: '1ra Quincena',
    QUINCE_2: '2da Quincena',
    SAC_1: '1er SAC',
    SAC_2: '2do SAC',
    VACATIONS: 'Vacaciones',
    FINAL: 'Final',
  };

  const groups = new Map();
  for (const p of periods) {
    const key = `${p.year}-${String(p.month).padStart(2, '0')}`;
    if (!groups.has(key)) {
      groups.set(key, {
        periodKey: key,
        year: p.year,
        month: p.month,
        monthName: monthNames[p.month - 1] || `Mes ${p.month}`,
        settlements: [],
        totalSlips: 0,
        hasOpen: false,
        allClosed: true,
      });
    }

    const grp = groups.get(key);
    const slipsCount = p._count?.paySlips || 0;
    grp.totalSlips += slipsCount;

    const isOpen = p.status !== 'CLOSED';
    if (isOpen) {
      grp.hasOpen = true;
      grp.allClosed = false;
    }

    grp.settlements.push({
      id: p.id,
      settlementName: p.settlementName,
      periodType: p.periodType,
      periodTypeLabel: typeLabels[p.periodType] || p.periodType,
      settlementNumber: p.settlementNumber,
      settlementType: p.settlementType,
      status: p.status,
      liquidationDate: p.liquidationDate,
      paymentDate: p.paymentDate,
      slipsCount,
      totalGross: Number(p.totalGross || 0),
    });
  }

  return Array.from(groups.values()).map((grp) => {
    const typeNames = Array.from(new Set(grp.settlements.map((s) => s.periodTypeLabel || s.periodType))).join(', ');
    const count = grp.settlements.length;
    const openWarning = grp.hasOpen ? ' [Liquidación abierta]' : '';
    return {
      ...grp,
      label: `${grp.periodKey} | ${grp.monthName} ${grp.year} (${count} liq.: ${typeNames} - ${grp.totalSlips} recibos)${openWarning}`,
    };
  });
}

export async function getMonthlyLsdPreview(tenantPrisma, year, month) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const numYear = Number(year);
  const numMonth = Number(month);

  const settlements = await tenantPrisma.payrollPeriod.findMany({
    where: {
      year: numYear,
      month: numMonth,
    },
    orderBy: { settlementNumber: 'asc' },
    include: {
      _count: {
        select: { paySlips: { where: { deletedAt: null } } },
      },
    },
  });

  if (settlements.length === 0) {
    const err = new Error(`No se registraron liquidaciones para el período ${String(numMonth).padStart(2, '0')}/${numYear}`);
    err.status = 404;
    throw err;
  }

  const distinctEmployees = await tenantPrisma.paySlip.findMany({
    where: {
      payrollPeriodId: { in: settlements.map((s) => s.id) },
      deletedAt: null,
    },
    select: { employeeId: true },
    distinct: ['employeeId'],
  });

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  const typeLabels = {
    MONTHLY: 'Mensual',
    QUINCE_1: '1ra Quincena',
    QUINCE_2: '2da Quincena',
    SAC_1: '1er SAC (Junio)',
    SAC_2: '2do SAC (Diciembre)',
    VACATIONS: 'Vacaciones',
    FINAL: 'Liquidación Final',
  };

  const totalSlips = settlements.reduce((sum, s) => sum + (s._count?.paySlips || 0), 0);
  const totalGross = settlements.reduce((sum, s) => sum + Number(s.totalGross || 0), 0);
  const totalNet = settlements.reduce((sum, s) => sum + Number(s.totalNet || 0), 0);
  const hasOpen = settlements.some((s) => s.status !== 'CLOSED');

  let latestPaymentDate = null;
  for (const s of settlements) {
    const d = s.paymentDate || s.liquidationDate;
    if (d) {
      if (!latestPaymentDate || new Date(d) > new Date(latestPaymentDate)) {
        latestPaymentDate = d;
      }
    }
  }

  return {
    year: numYear,
    month: numMonth,
    periodKey: `${numYear}-${String(numMonth).padStart(2, '0')}`,
    monthName: monthNames[numMonth - 1] || `Mes ${numMonth}`,
    totalSettlements: settlements.length,
    totalSlips,
    uniqueEmployeesCount: distinctEmployees.length,
    totalGross: Math.round(totalGross * 100) / 100,
    totalNet: Math.round(totalNet * 100) / 100,
    hasOpen,
    latestPaymentDate,
    settlements: settlements.map((s) => ({
      id: s.id,
      settlementName: s.settlementName,
      periodType: s.periodType,
      periodTypeLabel: typeLabels[s.periodType] || s.periodType,
      settlementNumber: s.settlementNumber,
      settlementType: s.settlementType,
      status: s.status,
      liquidationDate: s.liquidationDate,
      paymentDate: s.paymentDate,
      slipsCount: s._count?.paySlips || 0,
      totalGross: Number(s.totalGross || 0),
      totalNet: Number(s.totalNet || 0),
    })),
  };
}

export async function validateMonthlyLsd(tenantPrisma, year, month) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const numYear = Number(year);
  const numMonth = Number(month);

  const settlements = await tenantPrisma.payrollPeriod.findMany({
    where: { year: numYear, month: numMonth },
    orderBy: { settlementNumber: 'asc' },
  });

  if (settlements.length === 0) {
    const err = new Error(`No hay liquidaciones para auditar en el período ${String(numMonth).padStart(2, '0')}/${numYear}`);
    err.status = 400;
    throw err;
  }

  const periodIds = settlements.map((s) => s.id);
  const paySlips = await tenantPrisma.paySlip.findMany({
    where: {
      payrollPeriodId: { in: periodIds },
      deletedAt: null,
    },
    include: {
      payrollPeriod: true,
      employee: {
        include: {
          department: true,
          jobPosition: true,
          healthInsurance: true,
          salaryScale: true,
          relatives: { where: { deletedAt: null }, include: { kinship: true } },
        },
      },
      items: true,
      basis: true,
    },
    orderBy: { employee: { fileNumber: 'asc' } },
  });

  const payrollSettings = await getPayrollSettings(tenantPrisma);
  const companyProfile = await tenantPrisma.companyProfile.findFirst({ where: { deletedAt: null } });

  return validateMonthlyLsdConsistency({
    year: numYear,
    month: numMonth,
    settlements,
    paySlips,
    payrollSettings,
    company: companyProfile || {},
  });
}

export async function exportMonthlyLsdPayroll(tenantPrisma, year, month, company) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const numYear = Number(year);
  const numMonth = Number(month);

  let companyProfile = company;
  if (!companyProfile?.cuit) {
    companyProfile = (await tenantPrisma.companyProfile.findFirst({ where: { deletedAt: null } })) || company || {};
  }

  const settlements = await tenantPrisma.payrollPeriod.findMany({
    where: { year: numYear, month: numMonth },
    orderBy: { settlementNumber: 'asc' },
  });

  if (settlements.length === 0) {
    const err = new Error(`No hay liquidaciones registradas para el período ${String(numMonth).padStart(2, '0')}/${numYear}`);
    err.status = 400;
    throw err;
  }

  const periodIds = settlements.map((s) => s.id);
  const paySlips = await tenantPrisma.paySlip.findMany({
    where: {
      payrollPeriodId: { in: periodIds },
      deletedAt: null,
    },
    include: {
      payrollPeriod: true,
      employee: {
        include: {
          department: true,
          jobPosition: true,
          healthInsurance: true,
          salaryScale: true,
          relatives: { where: { deletedAt: null }, include: { kinship: true } },
        },
      },
      items: { orderBy: { conceptCode: 'asc' } },
      basis: true,
    },
    orderBy: [
      { employee: { fileNumber: 'asc' } },
      { payrollPeriod: { settlementNumber: 'asc' } },
    ],
  });

  if (paySlips.length === 0) {
    const err = new Error(`El período ${String(numMonth).padStart(2, '0')}/${numYear} no tiene recibos calculados para exportar a ARCA`);
    err.status = 400;
    throw err;
  }

  const payrollSettings = await getPayrollSettings(tenantPrisma);

  return generateMonthlyLsdPayrollFile({
    company: companyProfile,
    year: numYear,
    month: numMonth,
    settlements,
    paySlips,
    payrollSettings,
  });
}


// =====================================================================

export async function listPeriodNovelties(tenantPrisma, periodId, { employeeId, conceptId } = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const where = { payrollPeriodId: periodId };
  if (employeeId) where.employeeId = employeeId;
  if (conceptId) where.conceptId = conceptId;

  return tenantPrisma.periodNovelty.findMany({
    where,
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
      { concept: { code: 'asc' } },
    ],
  });
}

function assertNoveltyConceptCompatible(concept, period) {
  if (!concept || concept.deletedAt) {
    const err = new Error('El concepto especificado no existe');
    err.status = 400;
    throw err;
  }
  if (String(concept.scope || '').toUpperCase() !== 'INDIVIDUAL') {
    const err = new Error(`Solo pueden asignarse conceptos con alcance INDIVIDUAL. El concepto ${concept.code} es GENERAL.`);
    err.status = 400;
    throw err;
  }
  if (concept.isPersistent) {
    const err = new Error(`El concepto ${concept.code} (${concept.name}) es persistente. Debe gestionarse en Novedades Persistentes.`);
    err.status = 400;
    throw err;
  }

  const pType = (period.periodType || 'MONTHLY').toUpperCase();
  const cPeriodType = (concept.periodType || 'MONTHLY').toUpperCase();

  if (pType === 'MONTHLY' && cPeriodType === 'VACATIONS') {
    const err = new Error(`No se pueden cargar conceptos de tipo VACACIONES (${concept.code} - ${concept.name}) en una liquidación de tipo MENSUAL.`);
    err.status = 400;
    throw err;
  }
  if (pType === 'VACATIONS' && cPeriodType !== 'VACATIONS') {
    const err = new Error(`En una liquidación de VACACIONES solo pueden cargarse conceptos del tipo VACACIONES. El concepto ${concept.code} es ${cPeriodType}.`);
    err.status = 400;
    throw err;
  }
  if (pType !== 'VACATIONS' && cPeriodType === 'VACATIONS') {
    const err = new Error(`El concepto ${concept.code} (${concept.name}) es de tipo VACACIONES y solo puede cargarse en una liquidación de VACACIONES.`);
    err.status = 400;
    throw err;
  }
  if ((pType === 'SAC_1' || pType === 'SAC_2') && cPeriodType !== 'SAC' && cPeriodType !== 'SAC_1' && cPeriodType !== 'SAC_2' && cPeriodType !== 'MONTHLY') {
    const err = new Error(`En una liquidación de SAC solo pueden cargarse conceptos correspondientes a SAC.`);
    err.status = 400;
    throw err;
  }
  if (pType === 'FINAL' && cPeriodType !== 'FINAL' && cPeriodType !== 'MONTHLY') {
    const err = new Error(`El concepto ${concept.code} no corresponde a liquidaciones FINALES.`);
    err.status = 400;
    throw err;
  }
}

export async function upsertPeriodNovelty(tenantPrisma, periodId, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const period = await tenantPrisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: { fiscalPeriod: true },
  });
  if (!period) {
    const err = new Error('La liquidación / período solicitado no existe');
    err.status = 404;
    throw err;
  }
  if (period.status === 'CLOSED' || period.fiscalPeriod?.status === 'CLOSED') {
    const err = new Error('No se pueden modificar novedades en una liquidación o período cerrado');
    err.status = 400;
    throw err;
  }

  const concept = await tenantPrisma.concept.findUnique({ where: { id: data.conceptId } });
  assertNoveltyConceptCompatible(concept, period);

  const unitsVal = data.units !== undefined && data.units !== null && data.units !== '' ? Number(data.units) : null;
  const amountVal = data.amount !== undefined && data.amount !== null && data.amount !== '' ? Number(data.amount) : null;
  const notesVal = data.notes ? String(data.notes).trim() : null;

  const existing = await tenantPrisma.periodNovelty.findUnique({
    where: {
      payrollPeriodId_employeeId_conceptId: {
        payrollPeriodId: periodId,
        employeeId: data.employeeId,
        conceptId: data.conceptId,
      },
    },
  });

  if (existing) {
    return tenantPrisma.periodNovelty.update({
      where: { id: existing.id },
      data: {
        units: unitsVal,
        amount: amountVal,
        notes: notesVal,
      },
      include: {
        employee: true,
        concept: true,
      },
    });
  }

  return tenantPrisma.periodNovelty.create({
    data: {
      id: crypto.randomUUID(),
      payrollPeriodId: periodId,
      employeeId: data.employeeId,
      conceptId: data.conceptId,
      units: unitsVal,
      amount: amountVal,
      notes: notesVal,
    },
    include: {
      employee: true,
      concept: true,
    },
  });
}

export async function deletePeriodNovelty(tenantPrisma, periodId, noveltyId) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const period = await tenantPrisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: { fiscalPeriod: true },
  });
  if (!period) {
    const err = new Error('La liquidación / período solicitado no existe');
    err.status = 404;
    throw err;
  }
  if (period.status === 'CLOSED' || period.fiscalPeriod?.status === 'CLOSED') {
    const err = new Error('No se pueden modificar novedades en una liquidación o período cerrado');
    err.status = 400;
    throw err;
  }

  const novelty = await tenantPrisma.periodNovelty.findFirst({
    where: {
      id: noveltyId,
      payrollPeriodId: periodId,
    },
  });
  if (!novelty) {
    const err = new Error('Novedad de período no encontrada');
    err.status = 404;
    throw err;
  }

  await tenantPrisma.periodNovelty.delete({
    where: { id: novelty.id },
  });

  return { message: 'Novedad eliminada correctamente' };
}

export async function batchUpsertPeriodNovelties(tenantPrisma, periodId, items) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const period = await tenantPrisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: { fiscalPeriod: true },
  });
  if (!period) {
    const err = new Error('La liquidación / período solicitado no existe');
    err.status = 404;
    throw err;
  }
  if (period.status === 'CLOSED' || period.fiscalPeriod?.status === 'CLOSED') {
    const err = new Error('No se pueden modificar novedades en una liquidación o período cerrado');
    err.status = 400;
    throw err;
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { savedCount: 0, processedCount: 0, data: [] };
  }

  // Deduplicar pares (employeeId, conceptId) conservando la última entrada del lote
  const dedupedMap = new Map();
  for (const item of items) {
    dedupedMap.set(`${item.employeeId}::${item.conceptId}`, item);
  }
  const dedupedItems = Array.from(dedupedMap.values());
  const conceptIds = Array.from(new Set(dedupedItems.map((i) => i.conceptId)));
  const employeeIds = Array.from(new Set(dedupedItems.map((i) => i.employeeId)));

  const concepts = await tenantPrisma.concept.findMany({
    where: { id: { in: conceptIds } },
  });
  const conceptMap = new Map(concepts.map((c) => [c.id, c]));
  for (const cid of conceptIds) {
    assertNoveltyConceptCompatible(conceptMap.get(cid), period);
  }

  const savedIds = await tenantPrisma.$transaction(async (tx) => {
    const existingList = await tx.periodNovelty.findMany({
      where: {
        payrollPeriodId: periodId,
        employeeId: { in: employeeIds },
        conceptId: { in: conceptIds },
      },
      select: { id: true, employeeId: true, conceptId: true },
    });
    const existingMap = new Map(
      existingList.map((e) => [`${e.employeeId}::${e.conceptId}`, e.id])
    );

    const toCreate = [];
    const toUpdate = [];
    const resultIds = [];

    for (const item of dedupedItems) {
      const unitsVal = item.units !== undefined && item.units !== null && item.units !== '' ? Number(item.units) : null;
      const amountVal = item.amount !== undefined && item.amount !== null && item.amount !== '' ? Number(item.amount) : null;
      const notesVal = item.notes ? String(item.notes).trim() : null;
      const key = `${item.employeeId}::${item.conceptId}`;
      const existingId = existingMap.get(key);

      if (existingId) {
        toUpdate.push({ id: existingId, units: unitsVal, amount: amountVal, notes: notesVal });
        resultIds.push(existingId);
      } else {
        const newId = crypto.randomUUID();
        toCreate.push({
          id: newId,
          payrollPeriodId: periodId,
          employeeId: item.employeeId,
          conceptId: item.conceptId,
          units: unitsVal,
          amount: amountVal,
          notes: notesVal,
        });
        resultIds.push(newId);
      }
    }

    for (let i = 0; i < toCreate.length; i += 200) {
      await tx.periodNovelty.createMany({ data: toCreate.slice(i, i + 200) });
    }

    for (let i = 0; i < toUpdate.length; i += 20) {
      const chunk = toUpdate.slice(i, i + 20);
      await Promise.all(
        chunk.map((upd) =>
          tx.periodNovelty.update({
            where: { id: upd.id },
            data: {
              units: upd.units,
              amount: upd.amount,
              notes: upd.notes,
            },
          })
        )
      );
    }

    return resultIds;
  });

  const results = await tenantPrisma.periodNovelty.findMany({
    where: { id: { in: savedIds } },
    include: {
      employee: true,
      concept: true,
    },
  });

  return {
    savedCount: results.length,
    processedCount: results.length,
    data: results,
  };
}
