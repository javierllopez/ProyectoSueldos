import crypto from 'crypto';
import { ensureTenantPayrollSchema } from '../../../services/tenantProvisioner.service.js';
import {
  calculateEmployeePayroll,
  findBasicSalaryConcept,
  buildPayrollIndices,
  resolveSalaryScaleAmountForPeriod,
} from '../payroll.calculator.js';
import {
  getPayrollSettings,
  getSettlementTypes,
  resolveSettlementTypeConfig,
} from './conceptsAndRules.service.js';
import { checkNoveltyConceptCompatibility } from './noveltiesAndLsd.service.js';

const RUBRIC_KEYS = ['BASIC', 'ADDITIONALS', 'OVERTIME', 'VACATIONS', 'SAC', 'NON_REMUNERATIVE'];

const RUBRIC_METADATA = {
  BASIC: { label: 'Dif. Retroactiva Básico', suffix: '1090', arcaConceptCode: '110000', type: 'REMUNERATIVE' },
  ADDITIONALS: { label: 'Dif. Retroactiva Adicionales', suffix: '1091', arcaConceptCode: '160000', type: 'REMUNERATIVE' },
  OVERTIME: { label: 'Dif. Retroactiva Horas Extras', suffix: '1092', arcaConceptCode: '130000', type: 'REMUNERATIVE' },
  VACATIONS: { label: 'Dif. Retroactiva Vacaciones', suffix: '1093', arcaConceptCode: '150000', type: 'REMUNERATIVE' },
  SAC: { label: 'Dif. Retroactiva SAC', suffix: '1094', arcaConceptCode: '120000', type: 'REMUNERATIVE' },
  NON_REMUNERATIVE: { label: 'Ajuste Retroactivo No Remunerativo', suffix: '5090', arcaConceptCode: '540000', type: 'NON_REMUNERATIVE' },
};

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function toYm(year, month) {
  return Number(year) * 100 + Number(month);
}

function formatYyyymm(year, month) {
  return `${year}${String(month).padStart(2, '0')}`;
}

function getSemesterKey(year, month) {
  return `${year}-S${Number(month) <= 6 ? 1 : 2}`;
}

function applyRoundingRule(val, rounding = 'DECIMAL_2') {
  const num = Number(val) || 0;
  if (rounding === 'INTEGER') return Math.round(num);
  if (rounding === 'DECIMAL_2') return round2(num);
  return num;
}

function computeIncreasedAmount(baseAmount, rule) {
  const prev = Number(baseAmount) || 0;
  if (!rule) return prev;
  const val = Number(rule.value || 0);
  const next = rule.increaseType === 'FIXED_AMOUNT' ? prev + val : prev + prev * (val / 100);
  return applyRoundingRule(next, rule.rounding || 'DECIMAL_2');
}

function resolveCanonicalFamily(periodType) {
  const upper = String(periodType || 'MONTHLY').trim().toUpperCase();
  if (upper === 'ALL') return 'ALL';
  if (upper === 'MONTHLY' || upper === 'MENSUAL') return 'MONTHLY';
  if (upper === 'QUINCE' || upper === 'QUINCENA' || upper === 'QUINCE_1' || upper === 'QUINCE_2') return 'QUINCE';
  if (upper === 'SAC' || upper === 'AGUINALDO' || upper === 'SAC_1' || upper === 'SAC_2') return 'SAC';
  if (upper === 'VACATIONS' || upper === 'VACACIONES') return 'VACATIONS';
  if (upper === 'FINAL' || upper === 'LIQUIDACION_FINAL') return 'FINAL';
  if (upper === 'RETROACTIVE' || upper === 'RETROACTIVO') return 'RETROACTIVE';
  return upper;
}

function classifyConceptRubric(item, basicCode) {
  if (!item) return 'ADDITIONALS';
  if (item.type === 'NON_REMUNERATIVE') return 'NON_REMUNERATIVE';
  const code = String(item.conceptCode || item.code || '').trim().toUpperCase();
  const arca = String(item.arcaConceptCode || '').trim();
  const name = String(item.conceptName || item.name || '');

  if (code === String(basicCode || '').toUpperCase() || arca === '110000' || /^([A-Z]{2})?1000$/i.test(code)) {
    return 'BASIC';
  }
  if (arca.startsWith('13') || /extra|horas?\s*(50|100|200)|nocturn/i.test(name)) {
    return 'OVERTIME';
  }
  if (arca === '150000' || /vacac/i.test(name)) {
    return 'VACATIONS';
  }
  if (arca.startsWith('12') || /\bsac\b|aguinaldo/i.test(name)) {
    return 'SAC';
  }
  return 'ADDITIONALS';
}

function buildCompatibleTargetConceptsAndMapping(allConcepts, targetPeriod, targetTypeConfig) {
  const pFamily = targetPeriod ? resolveCanonicalFamily(targetPeriod.periodType || 'MONTHLY') : 'RETROACTIVE';
  const targetPrefix = String(targetTypeConfig?.conceptPrefix || 'RT').trim().toUpperCase();

  const compatible = (allConcepts || []).filter((c) => {
    if (!c || c.deletedAt || c.isActive === false) return false;
    if (String(c.scope || '').toUpperCase() !== 'INDIVIDUAL') return false;
    if (c.isPersistent) return false;
    if (String(c.noveltyDataType || '').toUpperCase() === 'CALCULADO') return false;
    if (c.type === 'AUXILIARY' || c.type === 'DEDUCTION') return false;
    const cFamily = resolveCanonicalFamily(c.periodType || 'MONTHLY');
    return cFamily === 'ALL' || cFamily === pFamily;
  });

  const suggested = {};
  for (const rubric of RUBRIC_KEYS) {
    const meta = RUBRIC_METADATA[rubric];
    const preferredByTargetPrefix = compatible.find((c) => c.code.toUpperCase() === `${targetPrefix}${meta.suffix}`);
    const preferredByRtPrefix = compatible.find((c) => c.code.toUpperCase() === `RT${meta.suffix}`);
    const byArca = compatible.find(
      (c) => String(c.arcaConceptCode || '').trim() === meta.arcaConceptCode && c.type === meta.type
    );
    const byType = compatible.find((c) => c.type === meta.type);
    const match = preferredByTargetPrefix || preferredByRtPrefix || byArca || byType || null;
    suggested[rubric] = match ? match.id : null;
  }

  return {
    compatibleTargetConcepts: compatible.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      type: c.type,
      periodType: c.periodType,
      arcaConceptCode: c.arcaConceptCode || null,
    })),
    suggestedConceptMapping: suggested,
  };
}

function buildHistoricalInputItems(slipItems, allConceptsMap, basicCode) {
  const inputs = [];
  for (const it of slipItems || []) {
    if (!it || it.type === 'DEDUCTION' || it.type === 'AUXILIARY' || it.type === 'EMPLOYER_CONTRIBUTION') continue;
    const cCode = String(it.conceptCode || '').trim();
    if (!cCode || cCode === basicCode || /^([A-Z]{2})?1000$/i.test(cCode)) continue;

    const conceptDef = allConceptsMap.get(cCode);
    const calcType = String(conceptDef?.calculationType || '').toUpperCase();
    const noveltyType = String(conceptDef?.noveltyDataType || '').toUpperCase();

    const entry = { conceptCode: cCode, notes: it.notes || null };
    if (noveltyType === 'IMPORTE' && calcType !== 'FORMULA' && calcType !== 'PERCENTAGE' && calcType !== 'MATRIX') {
      entry.amount = Number(it.amount || 0);
      if (it.units !== null && it.units !== undefined) entry.units = Number(it.units);
    } else if (it.units !== null && it.units !== undefined) {
      entry.units = Number(it.units);
    }
    inputs.push(entry);
  }
  return inputs;
}

function buildScalePatchedContext(emp, empScale, overrideAmount, allSalaryScales, closedPeriod) {
  const clonedScale = empScale
    ? { ...empScale, amount: overrideAmount, periods: [] }
    : { id: '__retro_hist_scale__', name: 'Histórica', amount: overrideAmount, periods: [] };
  const clonedEmp = {
    ...emp,
    basicSalary: overrideAmount,
    salaryScale: clonedScale,
    assignedConcepts: (emp.assignedConcepts || []).map((ac) => ({ ...ac })),
  };
  const patchedScales = (allSalaryScales || []).map((s) =>
    empScale && s.id === empScale.id ? { ...s, amount: overrideAmount, periods: [] } : s
  );
  if (!empScale) patchedScales.push(clonedScale);
  return { clonedEmp, patchedScales };
}

function inferBasicItemFromResult(calcResult, basicCode) {
  const items = calcResult?.items || [];
  return (
    items.find((it) => it.conceptCode === basicCode) ||
    items.find((it) => /^([A-Z]{2})?1000$/i.test(String(it.conceptCode || ''))) ||
    items.find((it) => it.type === 'REMUNERATIVE' && String(it.arcaConceptCode || '') === '110000') ||
    null
  );
}

function inferBasicItemFromSlip(slipItems, basicCode) {
  return (
    (slipItems || []).find((it) => it.conceptCode === basicCode) ||
    (slipItems || []).find((it) => /^([A-Z]{2})?1000$/i.test(String(it.conceptCode || ''))) ||
    (slipItems || []).find((it) => it.type === 'REMUNERATIVE' && String(it.arcaConceptCode || '') === '110000') ||
    null
  );
}

function parseYmRangeMonths(fromYear, fromMonth, toYear, toMonth) {
  const list = [];
  let y = Number(fromYear);
  let m = Number(fromMonth);
  const endYm = toYm(toYear, toMonth);
  let guard = 0;
  while (toYm(y, m) <= endYm && guard < 36) {
    list.push({ year: y, month: m, ym: toYm(y, m), semesterKey: getSemesterKey(y, m) });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return list;
}

/**
 * Previsualiza en memoria (sin mutar BD) las diferencias retroactivas paritarias por colaborador, período y concepto.
 */
export async function previewRetroactiveSettlement(tenantPrisma, params = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const fromYear = Number(params.fromYear);
  const fromMonth = Number(params.fromMonth);
  const toYear = Number(params.toYear);
  const toMonth = Number(params.toMonth);
  const fromYm = toYm(fromYear, fromMonth);
  const toYmVal = toYm(toYear, toMonth);
  if (!fromYear || !fromMonth || !toYear || !toMonth || fromYm > toYmVal) {
    const err = new Error('El rango de períodos retroactivos es inválido.');
    err.status = 400;
    throw err;
  }

  const cctFilter = params.cctCode && String(params.cctCode).trim() !== '' ? String(params.cctCode).trim() : 'ALL';
  const scaleIdsFilter = Array.isArray(params.scaleIds) && params.scaleIds.length > 0 ? new Set(params.scaleIds) : null;
  const requestedPeriodTypes = Array.isArray(params.periodTypes) && params.periodTypes.length > 0
    ? params.periodTypes.map((t) => String(t).trim().toUpperCase())
    : ['MONTHLY', 'QUINCE_1', 'QUINCE_2', 'VACATIONS'];
  const scaleSourceMode = params.scaleSourceMode || 'EXISTING_SCALE_PERIODS';
  const increaseRule = params.increaseRule || null;
  const includeSacRecalculation = params.includeSacRecalculation !== false;

  const rangeMonths = parseYmRangeMonths(fromYear, fromMonth, toYear, toMonth);
  const monthOrFilters = rangeMonths.map((rm) => ({ year: rm.year, month: rm.month }));
  const semesterFilterList = [...new Set(rangeMonths.map((rm) => rm.semesterKey))].flatMap((sk) => {
    const [yr, sem] = sk.split('-S');
    const yearNum = Number(yr);
    return sem === '1'
      ? [{ year: yearNum, month: { in: [1, 2, 3, 4, 5, 6] } }]
      : [{ year: yearNum, month: { in: [7, 8, 9, 10, 11, 12] } }];
  });

  const [
    payrollSettings,
    settlementTypesList,
    allConcepts,
    allMatrices,
    allFixedValues,
    allSalaryScales,
    closedPeriods,
    openPeriodsRaw,
    closedSacPeriods,
    semesterClosedPeriods,
    priorRuns,
  ] = await Promise.all([
    getPayrollSettings(tenantPrisma),
    getSettlementTypes(tenantPrisma, { activeOnly: false }),
    tenantPrisma.concept.findMany({ where: { deletedAt: null }, include: { matrix: true } }),
    tenantPrisma.payrollMatrix.findMany({ where: { isActive: true, deletedAt: null } }),
    tenantPrisma.payrollFixedValue.findMany({ where: { isActive: true, deletedAt: null } }),
    tenantPrisma.salaryScale.findMany({
      where: { deletedAt: null },
      include: { periods: { orderBy: { validFrom: 'asc' } } },
    }),
    tenantPrisma.payrollPeriod.findMany({
      where: {
        status: 'CLOSED',
        OR: monthOrFilters,
        periodType: { in: requestedPeriodTypes },
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }, { settlementNumber: 'asc' }],
    }),
    tenantPrisma.payrollPeriod.findMany({
      where: {
        status: { in: ['DRAFT', 'CALCULATED'] },
        fiscalPeriod: { status: 'OPEN' },
      },
      include: { fiscalPeriod: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { settlementNumber: 'asc' }],
    }),
    includeSacRecalculation
      ? tenantPrisma.payrollPeriod.findMany({
          where: {
            status: 'CLOSED',
            periodType: { in: ['SAC_1', 'SAC_2'] },
            OR: semesterFilterList,
          },
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
        })
      : Promise.resolve([]),
    includeSacRecalculation
      ? tenantPrisma.payrollPeriod.findMany({
          where: {
            status: 'CLOSED',
            periodType: { in: ['MONTHLY', 'QUINCE_1', 'QUINCE_2', 'VACATIONS'] },
            OR: semesterFilterList,
          },
        })
      : Promise.resolve([]),
    tenantPrisma.retroactiveAdjustmentRun?.findMany
      ? tenantPrisma.retroactiveAdjustmentRun.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      : Promise.resolve([]),
  ]);

  const stByCode = new Map(settlementTypesList.map((st) => [String(st.code || '').toUpperCase(), st]));
  const eligibleTargetPeriods = (openPeriodsRaw || [])
    .filter((p) => {
      const st = stByCode.get(String(p.periodType || '').toUpperCase());
      return Boolean(st && st.allowsRetroactives === true);
    })
    .map((p) => {
      const st = stByCode.get(String(p.periodType || '').toUpperCase());
      return {
        id: p.id,
        year: p.year,
        month: p.month,
        periodType: p.periodType,
        periodTypeName: st?.name || p.periodType,
        conceptPrefix: st?.conceptPrefix || 'RT',
        defaultWorkedDays: Number(st?.defaultWorkedDays ?? 0),
        appliesStatutoryDeductions: st?.appliesStatutoryDeductions !== false,
        settlementNumber: p.settlementNumber,
        settlementName: p.settlementName,
        status: p.status,
      };
    });

  let selectedTargetPeriod = null;
  let selectedTargetTypeConfig = null;
  if (params.targetPeriodId) {
    const targetPeriodDb = await tenantPrisma.payrollPeriod.findUnique({
      where: { id: params.targetPeriodId },
      include: { fiscalPeriod: true },
    });
    if (!targetPeriodDb) {
      const err = new Error('La liquidación destino seleccionada no existe.');
      err.status = 404;
      throw err;
    }
    if (targetPeriodDb.status === 'CLOSED' || targetPeriodDb.fiscalPeriod?.status === 'CLOSED') {
      const err = new Error('La liquidación destino seleccionada se encuentra CERRADA. Debe elegir una liquidación abierta.');
      err.status = 400;
      throw err;
    }
    selectedTargetTypeConfig = await resolveSettlementTypeConfig(tenantPrisma, targetPeriodDb.periodType);
    if (!selectedTargetTypeConfig || selectedTargetTypeConfig.allowsRetroactives !== true) {
      const err = new Error(
        `El tipo de liquidación "${selectedTargetTypeConfig?.name || targetPeriodDb.periodType}" no está habilitado para liquidar retroactivos paritarios. Habilítelo en Configuración → Tipos de Liquidación.`
      );
      err.status = 400;
      throw err;
    }
    selectedTargetPeriod = targetPeriodDb;
  } else if (eligibleTargetPeriods.length > 0) {
    const first = eligibleTargetPeriods[0];
    selectedTargetPeriod = openPeriodsRaw.find((p) => p.id === first.id) || first;
    selectedTargetTypeConfig = stByCode.get(String(selectedTargetPeriod.periodType || '').toUpperCase()) || null;
  }

  const { compatibleTargetConcepts, suggestedConceptMapping } = buildCompatibleTargetConceptsAndMapping(
    allConcepts,
    selectedTargetPeriod,
    selectedTargetTypeConfig
  );

  const activeConcepts = (allConcepts || []).filter((c) => c.deletedAt === null && c.isActive !== false);
  const conceptsByCode = new Map(activeConcepts.map((c) => [String(c.code).trim(), c]));
  const salaryScalesById = new Map((allSalaryScales || []).map((s) => [s.id, s]));
  const basicConcept = findBasicSalaryConcept(activeConcepts);
  const basicCode = basicConcept ? basicConcept.code : 'SU1000';

  const priorCoveredKeys = new Set();
  for (const run of priorRuns || []) {
    const keys = run.runPayload?.coveredKeys;
    if (Array.isArray(keys)) {
      for (const k of keys) priorCoveredKeys.add(k);
    }
  }

  // Cargar todos los recibos cerrados del rango en 1 consulta
  const closedPeriodIds = closedPeriods.map((p) => p.id);
  const sacPeriodIds = closedSacPeriods.map((p) => p.id);
  const semClosedPeriodIds = semesterClosedPeriods.map((p) => p.id);
  const allRelevantSlipPeriodIds = [...new Set([...closedPeriodIds, ...sacPeriodIds, ...semClosedPeriodIds])];

  const allRelevantSlips = allRelevantSlipPeriodIds.length > 0
    ? await tenantPrisma.paySlip.findMany({
        where: {
          payrollPeriodId: { in: allRelevantSlipPeriodIds },
          deletedAt: null,
        },
        include: {
          items: true,
          employee: {
            include: {
              department: true,
              jobPosition: true,
              healthInsurance: true,
              union: true,
              mutual: true,
              salaryScale: { include: { periods: { orderBy: { validFrom: 'asc' } } } },
              workShift: true,
              relatives: { where: { deletedAt: null }, include: { kinship: true } },
              assignedConcepts: {
                where: { isActive: true, concept: { deletedAt: null, isActive: true } },
                include: { concept: true },
              },
            },
          },
        },
      })
    : [];

  const slipsByPeriodId = new Map();
  for (const s of allRelevantSlips) {
    if (!slipsByPeriodId.has(s.payrollPeriodId)) slipsByPeriodId.set(s.payrollPeriodId, []);
    slipsByPeriodId.get(s.payrollPeriodId).push(s);
  }

  // Filtrado de escalas según parámetros CCT / scaleIds
  const employeeMatchesFilter = (emp) => {
    const empScale = salaryScalesById.get(emp.salaryScaleId) || emp.salaryScale;
    if (scaleIdsFilter && (!empScale || !scaleIdsFilter.has(empScale.id))) {
      return false;
    }
    if (cctFilter === 'NO_CCT') {
      return Boolean(!empScale?.cctCode);
    }
    if (cctFilter !== 'ALL') {
      return String(empScale?.cctCode || '') === cctFilter;
    }
    return true;
  };

  const employeeBuckets = new Map();
  const periodBreakdown = [];
  const negativeClampWarnings = [];
  let baselineWarningsCount = 0;

  const ensureEmployeeBucket = (emp, empScale) => {
    if (!employeeBuckets.has(emp.id)) {
      employeeBuckets.set(emp.id, {
        employeeId: emp.id,
        fileNumber: emp.fileNumber || '-',
        cuil: emp.cuil || '',
        fullName: `${emp.lastName || ''}, ${emp.firstName || ''}`.trim().replace(/^,|,$/g, ''),
        status: emp.status || 'ACTIVE',
        terminationDate: emp.terminationDate || null,
        scaleId: empScale?.id || null,
        scaleName: empScale?.name || 'Sin escala asignada',
        cctCode: empScale?.cctCode || null,
        totalRemunerative: 0,
        totalNonRemunerative: 0,
        sacDelta: 0,
        totalDelta: 0,
        hasPriorRunOverlap: false,
        baselineDriftMax: 0,
        sourcePeriodIds: new Set(),
        coveredKeys: [],
        lines: [],
      });
    }
    return employeeBuckets.get(emp.id);
  };

  // --- Loop por cada período cerrado en el rango ---
  for (const closedPeriod of closedPeriods) {
    const pSlips = slipsByPeriodId.get(closedPeriod.id) || [];
    const stConf = stByCode.get(String(closedPeriod.periodType || '').toUpperCase()) || null;
    let periodDeltaSum = 0;
    let periodSlipsMatched = 0;

    for (const slip of pSlips) {
      const emp = slip.employee;
      if (!emp || emp.deletedAt) continue;
      if (!employeeMatchesFilter(emp)) continue;

      const empScale = salaryScalesById.get(emp.salaryScaleId) || emp.salaryScale || null;
      const isIntern = emp.contractModalityCode === '27' || emp.contractModalityCode === '027' || empScale?.isInternOnly === true;
      const isDirector = emp.contractModalityCode === '99' || emp.contractModalityCode === '099' || empScale?.isDirectorOnly === true;
      if ((isIntern || isDirector) && scaleSourceMode === 'EXISTING_SCALE_PERIODS' && !empScale) {
        continue;
      }

      const slipItems = slip.items || [];
      const slipBasicItem = inferBasicItemFromSlip(slipItems, basicCode);
      if (!slipBasicItem && scaleSourceMode === 'EXISTING_SCALE_PERIODS') continue;
      if ((isIntern || isDirector) && !slipBasicItem && scaleSourceMode === 'SIMULATE_INCREASE' && increaseRule?.treatment !== 'NON_REMUNERATIVE') {
        continue;
      }

      // Acotar conceptos a los liquidados en el recibo original (+ auxiliares) para cero ruido histórico
      const slipConceptCodes = new Set(slipItems.map((it) => String(it.conceptCode || '').trim()));
      const simConcepts = activeConcepts.filter((c) => slipConceptCodes.has(String(c.code).trim()) || c.type === 'AUXILIARY');
      if (simConcepts.length === 0) continue;

      const historicalInputs = buildHistoricalInputItems(slipItems, conceptsByCode, basicCode);
      const scaleNominalInCatalog = empScale
        ? resolveSalaryScaleAmountForPeriod(empScale, closedPeriod.year, closedPeriod.month)
        : Number(emp.basicSalary || 0);

      // Corrida prueba para obtener factor efectivo (jornada parcial, días trabajados, etc.)
      const trialCtx = buildScalePatchedContext(emp, empScale, scaleNominalInCatalog || 100000, allSalaryScales, closedPeriod);
      const trialIndices = buildPayrollIndices({
        allConcepts: simConcepts,
        allMatrices,
        allFixedValues,
        allSalaryScales: trialCtx.patchedScales,
        period: closedPeriod,
      });
      const trialSim = calculateEmployeePayroll({
        employee: trialCtx.clonedEmp,
        period: closedPeriod,
        settlementTypeConfig: stConf,
        payrollSettings,
        inputItems: historicalInputs,
        allConcepts: simConcepts,
        allMatrices,
        allFixedValues,
        allSalaryScales: trialCtx.patchedScales,
        indices: trialIndices,
        historicalData: { slips: [] },
        activeEmbargoes: [],
        workedDaysOverride: slip.workedDays,
      });
      const trialBasic = inferBasicItemFromResult(trialSim, basicCode);

      let oldScaleNominal = scaleNominalInCatalog;
      if (slipBasicItem && trialBasic && Number(trialBasic.amount) > 0 && (scaleNominalInCatalog || 100000) > 0) {
        oldScaleNominal = round2(Number(slipBasicItem.amount) * ((scaleNominalInCatalog || 100000) / Number(trialBasic.amount)));
      }

      // Caso A: Suma No Remunerativa fija o % en modo simulación
      if (scaleSourceMode === 'SIMULATE_INCREASE' && increaseRule?.treatment === 'NON_REMUNERATIVE') {
        const workedDaysRatio = Math.max(0, Math.min(30, Number(slip.workedDays ?? 30))) / 30;
        let nrDelta = 0;
        if (increaseRule.increaseType === 'FIXED_AMOUNT') {
          nrDelta = applyRoundingRule(Number(increaseRule.value || 0) * (workedDaysRatio || 1), increaseRule.rounding);
        } else {
          const baseRef = Number(slipBasicItem?.amount ?? slip.remunerativeSalary ?? 0);
          nrDelta = applyRoundingRule(baseRef * (Number(increaseRule.value || 0) / 100), increaseRule.rounding);
        }
        if (nrDelta > 0) {
          const bucket = ensureEmployeeBucket(emp, empScale);
          const covKey = `${closedPeriod.id}::${emp.id}::${empScale?.id || 'NONE'}`;
          bucket.coveredKeys.push(covKey);
          if (priorCoveredKeys.has(covKey)) bucket.hasPriorRunOverlap = true;
          bucket.sourcePeriodIds.add(closedPeriod.id);
          bucket.totalNonRemunerative = round2(bucket.totalNonRemunerative + nrDelta);
          bucket.totalDelta = round2(bucket.totalDelta + nrDelta);
          periodDeltaSum = round2(periodDeltaSum + nrDelta);
          periodSlipsMatched += 1;
          bucket.lines.push({
            periodId: closedPeriod.id,
            year: closedPeriod.year,
            month: closedPeriod.month,
            adjustmentPeriod: formatYyyymm(closedPeriod.year, closedPeriod.month),
            periodLabel: `${String(closedPeriod.month).padStart(2, '0')}/${closedPeriod.year}`,
            periodType: closedPeriod.periodType,
            rubricCategory: 'NON_REMUNERATIVE',
            sourceConceptCode: slipBasicItem?.conceptCode || basicCode,
            sourceConceptName: 'Acuerdo No Remunerativo Paritario',
            type: 'NON_REMUNERATIVE',
            originalAmount: 0,
            recalculatedAmount: nrDelta,
            deltaAmount: nrDelta,
            formulaHint: `${increaseRule.increaseType === 'FIXED_AMOUNT' ? 'Suma fija' : `${increaseRule.value}%`} proporcional (${slip.workedDays ?? 30}/30 días)`,
          });
        }
        continue;
      }

      // Caso B: Actualización de escala remunerativa (cascada completa)
      const newScaleNominal =
        scaleSourceMode === 'SIMULATE_INCREASE'
          ? computeIncreasedAmount(oldScaleNominal, increaseRule)
          : scaleNominalInCatalog;

      if (newScaleNominal <= oldScaleNominal + 0.009) {
        continue;
      }

      const baseCtx = buildScalePatchedContext(emp, empScale, oldScaleNominal, allSalaryScales, closedPeriod);
      const baseIndices = buildPayrollIndices({
        allConcepts: simConcepts,
        allMatrices,
        allFixedValues,
        allSalaryScales: baseCtx.patchedScales,
        period: closedPeriod,
      });
      const baseSim = calculateEmployeePayroll({
        employee: baseCtx.clonedEmp,
        period: closedPeriod,
        settlementTypeConfig: stConf,
        payrollSettings,
        inputItems: historicalInputs,
        allConcepts: simConcepts,
        allMatrices,
        allFixedValues,
        allSalaryScales: baseCtx.patchedScales,
        indices: baseIndices,
        historicalData: { slips: [] },
        activeEmbargoes: [],
        workedDaysOverride: slip.workedDays,
      });

      const newCtx = buildScalePatchedContext(emp, empScale, newScaleNominal, allSalaryScales, closedPeriod);
      const newIndices = buildPayrollIndices({
        allConcepts: simConcepts,
        allMatrices,
        allFixedValues,
        allSalaryScales: newCtx.patchedScales,
        period: closedPeriod,
      });
      const newSim = calculateEmployeePayroll({
        employee: newCtx.clonedEmp,
        period: closedPeriod,
        settlementTypeConfig: stConf,
        payrollSettings,
        inputItems: historicalInputs,
        allConcepts: simConcepts,
        allMatrices,
        allFixedValues,
        allSalaryScales: newCtx.patchedScales,
        indices: newIndices,
        historicalData: { slips: [] },
        activeEmbargoes: [],
        workedDaysOverride: slip.workedDays,
      });

      const baselineDrift = round2(Math.abs((baseSim.totals?.totalRemunerative || 0) - Number(slip.remunerativeSalary || 0)));
      const baseItemMap = new Map(
        (baseSim.items || [])
          .filter((i) => i.type !== 'DEDUCTION' && i.type !== 'AUXILIARY')
          .map((i) => [String(i.conceptCode), i])
      );

      const empLinesThisSlip = [];
      for (const newIt of newSim.items || []) {
        if (newIt.type === 'DEDUCTION' || newIt.type === 'AUXILIARY') continue;
        const baseIt = baseItemMap.get(String(newIt.conceptCode));
        const baseAmt = Number(baseIt?.amount || 0);
        const newAmt = Number(newIt.amount || 0);
        const rawDelta = round2(newAmt - baseAmt);
        if (rawDelta < -0.009) {
          negativeClampWarnings.push({
            fileNumber: emp.fileNumber,
            conceptCode: newIt.conceptCode,
            period: `${String(closedPeriod.month).padStart(2, '0')}/${closedPeriod.year}`,
            rawDelta,
          });
          continue;
        }
        if (rawDelta <= 0.009) continue;

        const rubric = classifyConceptRubric(newIt, basicCode);
        empLinesThisSlip.push({
          periodId: closedPeriod.id,
          year: closedPeriod.year,
          month: closedPeriod.month,
          adjustmentPeriod: formatYyyymm(closedPeriod.year, closedPeriod.month),
          periodLabel: `${String(closedPeriod.month).padStart(2, '0')}/${closedPeriod.year}`,
          periodType: closedPeriod.periodType,
          rubricCategory: rubric,
          sourceConceptCode: newIt.conceptCode,
          sourceConceptName: newIt.conceptName,
          type: newIt.type,
          originalAmount: baseAmt,
          recalculatedAmount: newAmt,
          deltaAmount: rawDelta,
          formulaHint: `Escala $${oldScaleNominal.toLocaleString('es-AR')} -> $${newScaleNominal.toLocaleString('es-AR')} (${slip.workedDays ?? 30}d)`,
        });
      }

      if (empLinesThisSlip.length > 0) {
        const bucket = ensureEmployeeBucket(emp, empScale);
        const covKey = `${closedPeriod.id}::${emp.id}::${empScale?.id || 'NONE'}`;
        bucket.coveredKeys.push(covKey);
        if (priorCoveredKeys.has(covKey)) bucket.hasPriorRunOverlap = true;
        bucket.sourcePeriodIds.add(closedPeriod.id);
        if (baselineDrift > 1) {
          bucket.baselineDriftMax = Math.max(bucket.baselineDriftMax, baselineDrift);
          baselineWarningsCount += 1;
        }
        for (const ln of empLinesThisSlip) {
          bucket.lines.push(ln);
          if (ln.type === 'NON_REMUNERATIVE') {
            bucket.totalNonRemunerative = round2(bucket.totalNonRemunerative + ln.deltaAmount);
          } else {
            bucket.totalRemunerative = round2(bucket.totalRemunerative + ln.deltaAmount);
          }
          bucket.totalDelta = round2(bucket.totalDelta + ln.deltaAmount);
          periodDeltaSum = round2(periodDeltaSum + ln.deltaAmount);
        }
        periodSlipsMatched += 1;
      }
    }

    periodBreakdown.push({
      periodId: closedPeriod.id,
      year: closedPeriod.year,
      month: closedPeriod.month,
      periodType: closedPeriod.periodType,
      settlementName: closedPeriod.settlementName,
      label: `${String(closedPeriod.month).padStart(2, '0')}/${closedPeriod.year} — ${closedPeriod.settlementName || closedPeriod.periodType}`,
      slipsMatched: periodSlipsMatched,
      deltaTotal: periodDeltaSum,
    });
  }

  // --- Recálculo de Diferencia de SAC si existe SAC_1 / SAC_2 CERRADO en el semestre ---
  let hasClosedSacInSemesters = false;
  if (includeSacRecalculation && closedSacPeriods.length > 0) {
    hasClosedSacInSemesters = true;
    const semPeriodById = new Map(semesterClosedPeriods.map((p) => [p.id, p]));
    const semMaxRemByEmpSem = new Map();
    for (const s of allRelevantSlips) {
      const pMeta = semPeriodById.get(s.payrollPeriodId);
      if (!pMeta) continue;
      const semKey = getSemesterKey(pMeta.year, pMeta.month);
      const mapKey = `${s.employeeId}::${semKey}`;
      if (!semMaxRemByEmpSem.has(mapKey)) semMaxRemByEmpSem.set(mapKey, new Map());
      const monthMap = semMaxRemByEmpSem.get(mapKey);
      const ymKey = toYm(pMeta.year, pMeta.month);
      monthMap.set(ymKey, round2((monthMap.get(ymKey) || 0) + Number(s.remunerativeSalary || 0)));
    }

    for (const sacPeriod of closedSacPeriods) {
      const sacSemKey = getSemesterKey(sacPeriod.year, sacPeriod.month);
      const sacSlips = slipsByPeriodId.get(sacPeriod.id) || [];
      for (const sacSlip of sacSlips) {
        const bucket = employeeBuckets.get(sacSlip.employeeId);
        if (!bucket || bucket.totalRemunerative <= 0) continue;

        const mapKey = `${sacSlip.employeeId}::${sacSemKey}`;
        const monthOrigMap = semMaxRemByEmpSem.get(mapKey);
        if (!monthOrigMap || monthOrigMap.size === 0) continue;

        let oldBest = 0;
        let newBest = 0;
        const deltaByYm = new Map();
        for (const ln of bucket.lines) {
          if (ln.type === 'REMUNERATIVE' && getSemesterKey(ln.year, ln.month) === sacSemKey) {
            const k = toYm(ln.year, ln.month);
            deltaByYm.set(k, round2((deltaByYm.get(k) || 0) + ln.deltaAmount));
          }
        }
        if (deltaByYm.size === 0) continue;

        for (const [ymK, origRem] of monthOrigMap.entries()) {
          if (origRem > oldBest) oldBest = origRem;
          const augmented = round2(origRem + (deltaByYm.get(ymK) || 0));
          if (augmented > newBest) newBest = augmented;
        }

        if (newBest > oldBest + 0.01) {
          const closedSacAmt = Number(sacSlip.remunerativeSalary || sacSlip.grossSalary || 0);
          const ratio = oldBest > 0 && closedSacAmt > 0 ? Math.min(0.5, closedSacAmt / oldBest) : 0.5;
          const sacDelta = round2((newBest - oldBest) * ratio);
          if (sacDelta > 0) {
            const covKey = `${sacPeriod.id}::${sacSlip.employeeId}::${bucket.scaleId || 'NONE'}`;
            bucket.coveredKeys.push(covKey);
            if (priorCoveredKeys.has(covKey)) bucket.hasPriorRunOverlap = true;
            bucket.sourcePeriodIds.add(sacPeriod.id);
            bucket.sacDelta = round2(bucket.sacDelta + sacDelta);
            bucket.totalRemunerative = round2(bucket.totalRemunerative + sacDelta);
            bucket.totalDelta = round2(bucket.totalDelta + sacDelta);
            bucket.lines.push({
              periodId: sacPeriod.id,
              year: sacPeriod.year,
              month: sacPeriod.month,
              adjustmentPeriod: formatYyyymm(sacPeriod.year, sacPeriod.month),
              periodLabel: `${String(sacPeriod.month).padStart(2, '0')}/${sacPeriod.year} (SAC)`,
              periodType: sacPeriod.periodType,
              rubricCategory: 'SAC',
              sourceConceptCode: sacPeriod.periodType,
              sourceConceptName: `Dif. Retroactiva ${sacPeriod.settlementName || sacPeriod.periodType}`,
              type: 'REMUNERATIVE',
              originalAmount: closedSacAmt,
              recalculatedAmount: round2(closedSacAmt + sacDelta),
              deltaAmount: sacDelta,
              formulaHint: `MMNyH $${oldBest.toLocaleString('es-AR')} -> $${newBest.toLocaleString('es-AR')} (factor ${(ratio * 100).toFixed(1)}%)`,
            });
          }
        }
      }
    }
  }

  const allEmployeesRows = Array.from(employeeBuckets.values())
    .map((b) => ({
      ...b,
      sourcePeriodIds: [...b.sourcePeriodIds],
    }))
    .sort((a, b) => a.fileNumber.localeCompare(b.fileNumber, undefined, { numeric: true }));

  const activeEmployees = allEmployeesRows.filter((e) => e.status === 'ACTIVE');
  const inactiveEmployees = allEmployeesRows.filter((e) => e.status !== 'ACTIVE');

  const targetRefYear = selectedTargetPeriod?.year || new Date().getFullYear();
  const priorFiscalYears = [...new Set(rangeMonths.map((rm) => rm.year).filter((y) => y < targetRefYear))];

  const missingTargetDeductions = Boolean(
    selectedTargetPeriod &&
      selectedTargetTypeConfig?.appliesStatutoryDeductions !== false &&
      !activeConcepts.some(
        (c) =>
          c.type === 'DEDUCTION' &&
          resolveCanonicalFamily(c.periodType) === resolveCanonicalFamily(selectedTargetPeriod.periodType)
      )
  );

  let workedDaysOverlapWarning = null;
  if (selectedTargetPeriod && Number(selectedTargetTypeConfig?.defaultWorkedDays ?? 0) > 0) {
    const sameMonthOtherWithDays = openPeriodsRaw.some(
      (p) =>
        p.id !== selectedTargetPeriod.id &&
        p.year === selectedTargetPeriod.year &&
        p.month === selectedTargetPeriod.month &&
        Number(stByCode.get(String(p.periodType || '').toUpperCase())?.defaultWorkedDays ?? 0) > 0
    );
    if (sameMonthOtherWithDays) {
      workedDaysOverlapWarning =
        `La liquidación destino "${selectedTargetPeriod.settlementName}" declara ${selectedTargetTypeConfig.defaultWorkedDays} días base y coexiste con otra liquidación del mismo mes fiscal. Verifique no exceder 30 días en el LSD Mensual.`;
    }
  }

  const summary = {
    closedPeriodsCount: closedPeriods.length,
    employeesActiveCount: activeEmployees.length,
    employeesInactiveCount: inactiveEmployees.length,
    totalRemunerativeActive: round2(activeEmployees.reduce((s, e) => s + e.totalRemunerative, 0)),
    totalNonRemunerativeActive: round2(activeEmployees.reduce((s, e) => s + e.totalNonRemunerative, 0)),
    totalSacActive: round2(activeEmployees.reduce((s, e) => s + e.sacDelta, 0)),
    grandTotalActive: round2(activeEmployees.reduce((s, e) => s + e.totalDelta, 0)),
    grandTotalInactive: round2(inactiveEmployees.reduce((s, e) => s + e.totalDelta, 0)),
    baselineWarningsCount,
  };

  return {
    params: { fromYear, fromMonth, toYear, toMonth, cctCode: cctFilter, scaleSourceMode },
    eligibleTargetPeriods,
    selectedTargetPeriod: selectedTargetPeriod
      ? {
          id: selectedTargetPeriod.id,
          year: selectedTargetPeriod.year,
          month: selectedTargetPeriod.month,
          periodType: selectedTargetPeriod.periodType,
          periodTypeName: selectedTargetTypeConfig?.name || selectedTargetPeriod.periodType,
          settlementName: selectedTargetPeriod.settlementName,
          defaultWorkedDays: Number(selectedTargetTypeConfig?.defaultWorkedDays ?? 0),
          appliesStatutoryDeductions: selectedTargetTypeConfig?.appliesStatutoryDeductions !== false,
        }
      : null,
    compatibleTargetConcepts,
    suggestedConceptMapping,
    summary,
    legalAlerts: {
      hasPriorFiscalYear: priorFiscalYears.length > 0,
      priorFiscalYears,
      hasInactiveEmployeesWithSlips: inactiveEmployees.length > 0,
      hasClosedSacInSemesters,
      priorRunsOverlap: allEmployeesRows.some((e) => e.hasPriorRunOverlap),
      missingTargetDeductions,
      workedDaysOverlapWarning,
      negativeClampCount: negativeClampWarnings.length,
    },
    periodBreakdown,
    activeEmployees,
    inactiveEmployees,
  };
}

/**
 * Aplica en una única transacción atómica las diferencias retroactivas en la liquidación abierta destino.
 */
export async function applyRetroactiveSettlement(tenantPrisma, params = {}, user = null) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const preview = await previewRetroactiveSettlement(tenantPrisma, params);
  if (!preview.selectedTargetPeriod || preview.selectedTargetPeriod.id !== params.targetPeriodId) {
    const err = new Error('Debe seleccionar una liquidación abierta habilitada para liquidar retroactivos.');
    err.status = 400;
    throw err;
  }

  const targetPeriod = await tenantPrisma.payrollPeriod.findUnique({
    where: { id: params.targetPeriodId },
    include: { fiscalPeriod: true },
  });
  if (!targetPeriod || targetPeriod.status === 'CLOSED' || targetPeriod.fiscalPeriod?.status === 'CLOSED') {
    const err = new Error('La liquidación destino se encuentra cerrada.');
    err.status = 400;
    throw err;
  }

  const targetTypeConfig = await resolveSettlementTypeConfig(tenantPrisma, targetPeriod.periodType);
  if (!targetTypeConfig || targetTypeConfig.allowsRetroactives !== true) {
    const err = new Error('El tipo de liquidación destino no admite retroactivos paritarios.');
    err.status = 400;
    throw err;
  }

  const selectedIdsSet =
    Array.isArray(params.selectedEmployeeIds) && params.selectedEmployeeIds.length > 0
      ? new Set(params.selectedEmployeeIds)
      : null;

  const ignoreInactive = params.ignoreInactiveEmployees !== false;
  const activeToApply = preview.activeEmployees.filter((e) => !selectedIdsSet || selectedIdsSet.has(e.employeeId));
  const inactiveToApply = ignoreInactive
    ? []
    : preview.inactiveEmployees.filter((e) => !selectedIdsSet || selectedIdsSet.has(e.employeeId));

  const appliedIdsSet = new Set([...activeToApply, ...inactiveToApply].map((e) => e.employeeId));
  const omittedInactives = preview.inactiveEmployees.filter((e) => !appliedIdsSet.has(e.employeeId));

  if (omittedInactives.length > 0 && params.ignoredInactiveConfirmed !== true) {
    const err = new Error(
      `Existen ${omittedInactives.length} colaborador(es) inactivo(s)/egresado(s) con diferencias retroactivas ($ ${round2(
        omittedInactives.reduce((s, e) => s + e.totalDelta, 0)
      ).toLocaleString('es-AR', { minimumFractionDigits: 2 })}). Debe confirmar expresamente la advertencia legal para omitirlos.`
    );
    err.status = 400;
    throw err;
  }

  const employeesToApply = [...activeToApply, ...inactiveToApply];
  if (employeesToApply.length === 0) {
    const err = new Error('No hay colaboradores con diferencias retroactivas positivas para aplicar.');
    err.status = 400;
    throw err;
  }

  // Control anti-duplicación (HTTP 409 salvo override consciente)
  const overlapped = employeesToApply.filter((e) => e.hasPriorRunOverlap);
  if (overlapped.length > 0 && params.allowDuplicateOverride !== true) {
    const sample = overlapped.slice(0, 5).map((e) => `Leg. ${e.fileNumber}`).join(', ');
    const err = new Error(
      `Se detectaron ajustes retroactivos ya aplicados previamente sobre los mismos períodos y escalas para ${overlapped.length} colaborador(es) (${sample}). Active "Permitir reaplicación" si desea continuar.`
    );
    err.status = 409;
    throw err;
  }

  // Resolver y validar conceptos destino contra el tipo de liquidación destino
  const effectiveMapping = { ...preview.suggestedConceptMapping, ...(params.conceptMapping || {}) };
  const mappedConceptIds = [...new Set(Object.values(effectiveMapping).filter(Boolean))];
  const targetConcepts = mappedConceptIds.length > 0
    ? await tenantPrisma.concept.findMany({ where: { id: { in: mappedConceptIds }, deletedAt: null } })
    : [];
  const conceptById = new Map(targetConcepts.map((c) => [c.id, c]));

  for (const rubric of RUBRIC_KEYS) {
    const cid = effectiveMapping[rubric];
    if (!cid) continue;
    const concept = conceptById.get(cid);
    const compat = checkNoveltyConceptCompatibility(concept, targetPeriod);
    if (!compat.ok) {
      const err = new Error(compat.message);
      err.status = 400;
      throw err;
    }
  }

  // Consolidar importes por (employeeId, conceptId) y determinar adjustmentPeriod (AAAAMM si único período origen)
  const noveltiesMap = new Map();
  const coveredKeysApplied = [];
  for (const empRow of employeesToApply) {
    coveredKeysApplied.push(...(empRow.coveredKeys || []));
    for (const ln of empRow.lines || []) {
      const cid = effectiveMapping[ln.rubricCategory];
      if (!cid || !conceptById.has(cid)) {
        const err = new Error(
          `No hay concepto destino compatible asignado para el rubro "${RUBRIC_METADATA[ln.rubricCategory]?.label || ln.rubricCategory}" en la liquidación "${targetPeriod.settlementName}".`
        );
        err.status = 400;
        throw err;
      }
      const key = `${empRow.employeeId}::${cid}`;
      if (!noveltiesMap.has(key)) {
        noveltiesMap.set(key, {
          employeeId: empRow.employeeId,
          conceptId: cid,
          amount: 0,
          sourceAdjustmentPeriods: new Set(),
        });
      }
      const item = noveltiesMap.get(key);
      item.amount = round2(item.amount + ln.deltaAmount);
      if (ln.adjustmentPeriod) item.sourceAdjustmentPeriods.add(ln.adjustmentPeriod);
    }
  }

  const labelStr = params.agreementLabel
    ? String(params.agreementLabel).trim()
    : `Retroactivo ${String(preview.params.fromMonth).padStart(2, '0')}/${preview.params.fromYear}-${String(preview.params.toMonth).padStart(2, '0')}/${preview.params.toYear}`;
  const rangeTag = `[PROP-07: ${labelStr}]`.slice(0, 250);

  const duplicateStrategy = params.duplicateStrategy === 'REPLACE' ? 'REPLACE' : 'ADD';
  const existingNovelties = await tenantPrisma.periodNovelty.findMany({
    where: {
      payrollPeriodId: targetPeriod.id,
      employeeId: { in: employeesToApply.map((e) => e.employeeId) },
      conceptId: { in: mappedConceptIds },
    },
  });
  const existingNoveltyMap = new Map(existingNovelties.map((n) => [`${n.employeeId}::${n.conceptId}`, n]));

  const runId = crypto.randomUUID();
  const totalRemApplied = round2(employeesToApply.reduce((s, e) => s + e.totalRemunerative, 0));
  const totalNonRemApplied = round2(employeesToApply.reduce((s, e) => s + e.totalNonRemunerative, 0));
  const totalSacApplied = round2(employeesToApply.reduce((s, e) => s + e.sacDelta, 0));
  const grandTotalApplied = round2(employeesToApply.reduce((s, e) => s + e.totalDelta, 0));

  await tenantPrisma.$transaction(async (tx) => {
    for (const entry of noveltiesMap.values()) {
      const existingNov = existingNoveltyMap.get(`${entry.employeeId}::${entry.conceptId}`);
      const nextAmount =
        duplicateStrategy === 'ADD' && existingNov
          ? round2(Number(existingNov.amount || 0) + entry.amount)
          : entry.amount;
      const singleAdjPeriod = entry.sourceAdjustmentPeriods.size === 1
        ? [...entry.sourceAdjustmentPeriods][0]
        : null;

      await tx.periodNovelty.upsert({
        where: {
          payrollPeriodId_employeeId_conceptId: {
            payrollPeriodId: targetPeriod.id,
            employeeId: entry.employeeId,
            conceptId: entry.conceptId,
          },
        },
        update: {
          amount: nextAmount,
          units: 1,
          adjustmentPeriod: singleAdjPeriod,
          notes: rangeTag,
        },
        create: {
          id: crypto.randomUUID(),
          payrollPeriodId: targetPeriod.id,
          employeeId: entry.employeeId,
          conceptId: entry.conceptId,
          amount: nextAmount,
          units: 1,
          adjustmentPeriod: singleAdjPeriod,
          notes: rangeTag,
        },
      });
    }

    if (
      params.scaleSourceMode === 'SIMULATE_INCREASE' &&
      params.updateSalaryScales === true &&
      params.increaseRule?.treatment !== 'NON_REMUNERATIVE'
    ) {
      const targetScaleIds = [...new Set(employeesToApply.map((e) => e.scaleId).filter(Boolean))];
      if (targetScaleIds.length > 0) {
        const scales = await tx.salaryScale.findMany({
          where: { id: { in: targetScaleIds }, deletedAt: null },
          include: { periods: true },
        });
        const fromDate = new Date(preview.params.fromYear, preview.params.fromMonth - 1, 1, 12, 0, 0);
        const toDate = new Date(preview.params.toYear, preview.params.toMonth, 0, 12, 0, 0);
        for (const sc of scales) {
          const refAmt = resolveSalaryScaleAmountForPeriod(sc, preview.params.toYear, preview.params.toMonth);
          const newAmt = computeIncreasedAmount(refAmt, params.increaseRule);
          await tx.salaryScalePeriod.deleteMany({
            where: {
              salaryScaleId: sc.id,
              validFrom: { lte: toDate },
              validTo: { gte: fromDate },
            },
          });
          await tx.salaryScalePeriod.create({
            data: {
              id: crypto.randomUUID(),
              salaryScaleId: sc.id,
              validFrom: fromDate,
              validTo: toDate,
              amount: newAmt,
              increaseType: params.increaseRule?.increaseType || 'PERCENTAGE',
              increaseValue: Number(params.increaseRule?.value || 0),
              rounding: params.increaseRule?.rounding || 'DECIMAL_2',
              batchId: runId,
            },
          });
        }
      }
    }

    if (tx.retroactiveAdjustmentRun?.create) {
      await tx.retroactiveAdjustmentRun.create({
        data: {
          id: runId,
          targetPeriodId: targetPeriod.id,
          targetPeriodName: targetPeriod.settlementName || targetPeriod.periodType,
          cctCode: preview.params.cctCode || 'ALL',
          scaleIdsJson: Array.isArray(params.scaleIds) ? params.scaleIds : null,
          fromYear: preview.params.fromYear,
          fromMonth: preview.params.fromMonth,
          toYear: preview.params.toYear,
          toMonth: preview.params.toMonth,
          scaleSourceMode: preview.params.scaleSourceMode,
          agreementLabel: labelStr,
          employeesAppliedCount: employeesToApply.length,
          activeAppliedCount: activeToApply.length,
          inactiveAppliedCount: inactiveToApply.length,
          ignoredInactiveConfirmed: omittedInactives.length > 0 && params.ignoredInactiveConfirmed === true,
          ignoredInactiveCount: omittedInactives.length,
          ignoredInactiveSummary: omittedInactives.map((e) => ({
            employeeId: e.employeeId,
            fileNumber: e.fileNumber,
            fullName: e.fullName,
            terminationDate: e.terminationDate,
            omittedAmount: e.totalDelta,
          })),
          totalRemunerative: totalRemApplied,
          totalNonRemunerative: totalNonRemApplied,
          totalSacDelta: totalSacApplied,
          grandTotal: grandTotalApplied,
          runPayload: {
            coveredKeys: [...new Set(coveredKeysApplied)],
            conceptMapping: effectiveMapping,
            duplicateStrategy,
          },
          createdBy: user?.id || null,
          createdByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || null : null,
        },
      });
    }
  }, { maxWait: 10000, timeout: 30000 });

  return {
    runId,
    targetPeriodId: targetPeriod.id,
    targetPeriodName: targetPeriod.settlementName,
    noveltiesUpsertedCount: noveltiesMap.size,
    employeesAppliedCount: employeesToApply.length,
    activeAppliedCount: activeToApply.length,
    inactiveAppliedCount: inactiveToApply.length,
    ignoredInactiveCount: omittedInactives.length,
    totalRemunerative: totalRemApplied,
    totalNonRemunerative: totalNonRemApplied,
    totalSacDelta: totalSacApplied,
    grandTotal: grandTotalApplied,
  };
}

export async function listRetroactiveRuns(tenantPrisma, { limit = 50 } = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);
  if (!tenantPrisma.retroactiveAdjustmentRun?.findMany) return [];
  const take = Math.max(1, Math.min(Number(limit) || 50, 200));
  const rows = await tenantPrisma.retroactiveAdjustmentRun.findMany({
    orderBy: { createdAt: 'desc' },
    take,
  });
  return rows.map((r) => ({
    ...r,
    totalRemunerative: Number(r.totalRemunerative || 0),
    totalNonRemunerative: Number(r.totalNonRemunerative || 0),
    totalSacDelta: Number(r.totalSacDelta || 0),
    grandTotal: Number(r.grandTotal || 0),
  }));
}
