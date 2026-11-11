import { ensureTenantPayrollSchema } from '../../../services/tenantProvisioner.service.js';
import { validateConceptFormula } from '../formulaValidator.js';
import { hoursToDecimal, decimalToHours } from '../../../utils/timeFormat.js';

// --- PARÁMETROS Y ALÍCUOTAS PATRONALES ---

export async function getPayrollSettings(tenantPrisma) {
  await ensureTenantPayrollSchema(tenantPrisma);

  let settings = await tenantPrisma.payrollSetting.findFirst();
  if (!settings) {
    settings = await tenantPrisma.payrollSetting.create({
      data: {
        employerType: 'SERVICIOS_COMERCIO',
        sipaRate: 10.77,
        inssjypRate: 1.58,
        osRate: 6.00,
        fneRate: 0.94,
        aaffRate: 4.70,
        artRate: 3.50,
        artFixedFee: 850.00,
        scvoFee: 650.00,
        detractionBase: 7003.68,
        ansesMinCap: 82287.12,
        ansesMaxCap: 2674292.72,
        standardWeeklyHours: 48.00,
        standardMonthlyHours: 200.00,
      },
    });
  }
  return {
    ...settings,
    standardWeeklyHoursFormatted: decimalToHours(settings.standardWeeklyHours, '48:00'),
    standardMonthlyHoursFormatted: decimalToHours(settings.standardMonthlyHours, '200:00'),
  };
}

export async function updatePayrollSettings(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const current = await getPayrollSettings(tenantPrisma);

  const artRate =
    data.artRate !== undefined
      ? Number(data.artRate)
      : data.contribArtRate !== undefined
      ? Number(data.contribArtRate)
      : current.artRate;
  const artFixedFee =
    data.artFixedFee !== undefined
      ? Number(data.artFixedFee)
      : data.contribArtFixed !== undefined
      ? Number(data.contribArtFixed)
      : current.artFixedFee;
  const ansesMaxCap =
    data.ansesMaxCap !== undefined
      ? Number(data.ansesMaxCap)
      : data.maxRemunerationAnses !== undefined
      ? Number(data.maxRemunerationAnses)
      : current.ansesMaxCap;

  const standardWeeklyHours =
    data.standardWeeklyHours !== undefined
      ? hoursToDecimal(data.standardWeeklyHours, current.standardWeeklyHours || 48.00)
      : current.standardWeeklyHours;
  const standardMonthlyHours =
    data.standardMonthlyHours !== undefined
      ? hoursToDecimal(data.standardMonthlyHours, current.standardMonthlyHours || 200.00)
      : current.standardMonthlyHours;

  const updated = await tenantPrisma.payrollSetting.update({
    where: { id: current.id },
    data: {
      employerType: data.employerType || current.employerType,
      sipaRate: data.sipaRate !== undefined ? Number(data.sipaRate) : current.sipaRate,
      inssjypRate: data.inssjypRate !== undefined ? Number(data.inssjypRate) : current.inssjypRate,
      osRate: data.osRate !== undefined ? Number(data.osRate) : current.osRate,
      fneRate: data.fneRate !== undefined ? Number(data.fneRate) : current.fneRate,
      aaffRate: data.aaffRate !== undefined ? Number(data.aaffRate) : current.aaffRate,
      artRate,
      artFixedFee,
      scvoFee: data.scvoFee !== undefined ? Number(data.scvoFee) : current.scvoFee,
      detractionBase: data.detractionBase !== undefined ? Number(data.detractionBase) : current.detractionBase,
      ansesMinCap: data.ansesMinCap !== undefined ? Number(data.ansesMinCap) : current.ansesMinCap,
      ansesMaxCap,
      standardWeeklyHours,
      standardMonthlyHours,
    },
  });

  return {
    ...updated,
    standardWeeklyHoursFormatted: decimalToHours(updated.standardWeeklyHours, '48:00'),
    standardMonthlyHoursFormatted: decimalToHours(updated.standardMonthlyHours, '200:00'),
  };
}

// --- CONCEPTOS ---

export async function getConcepts(tenantPrisma, { search = '', page = 1, limit = 5, type, periodType, isPersistent, scope, excludeCalculated } = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const take = Math.max(1, Math.min(Number(limit) || 5, 1000));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = { deletedAt: null };
  if (type && type !== 'ALL') where.type = type;
  if (periodType && periodType !== 'ALL') where.periodType = periodType;
  if (isPersistent !== undefined && isPersistent !== null && isPersistent !== 'ALL' && isPersistent !== '') {
    where.isPersistent = isPersistent === true || isPersistent === 'true';
  }
  if (scope && scope !== 'ALL') {
    where.scope = scope;
  }
  if (excludeCalculated === true || excludeCalculated === 'true') {
    where.noveltyDataType = { not: 'CALCULADO' };
  }
  if (search) {
    where.OR = [
      { code: { contains: search } },
      { name: { contains: search } },
      { arcaConceptCode: { contains: search } },
    ];
  }

  const [total, concepts] = await Promise.all([
    tenantPrisma.concept.count({ where }),
    tenantPrisma.concept.findMany({
      where,
      skip,
      take,
      include: { matrix: true },
      orderBy: [{ code: 'asc' }],
    }),
  ]);

  return {
    data: concepts,
    meta: {
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}

export async function createConcept(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const existing = await tenantPrisma.concept.findUnique({
    where: { code: data.code.trim() },
  });
  if (existing) {
    const err = new Error(`Ya existe un concepto con el código "${data.code}"`);
    err.status = 409;
    throw err;
  }

  // Cargar conceptos, valores fijos, matrices y escalas salariales en paralelo para auditoría y validación
  const [allOtherConcepts, fixedValues, matrices, salaryScales] = await Promise.all([
    tenantPrisma.concept.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, calculationOrder: true },
    }),
    tenantPrisma.payrollFixedValue.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, value: true },
    }),
    tenantPrisma.payrollMatrix.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
    tenantPrisma.salaryScale.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, amount: true },
    }),
  ]);

  let calculationOrder = data.calculationOrder !== undefined && data.calculationOrder !== null
    ? Number(data.calculationOrder)
    : null;
  const noveltyDataType = data.noveltyDataType || 'CANTIDAD';

  // Si no se proveyó orden numérico explícito, determinar orden inteligente
  if (calculationOrder === null || isNaN(calculationOrder)) {
    const codeNum = parseInt(String(data.code).replace(/\D/g, '').slice(-4), 10);
    if (data.calculationType === 'FORMULA' && data.formula) {
      const matches = data.formula.match(/\[([A-Za-z0-9_]+)\]/g) || [];
      const refCodes = new Set(matches.map((m) => m.replace(/\[|\]/g, '').toUpperCase()));
      const maxRefOrder = allOtherConcepts
        .filter((c) => refCodes.has(String(c.code).toUpperCase()))
        .reduce((max, c) => Math.max(max, Number(c.calculationOrder) || 0), 0);
      calculationOrder = Math.max(maxRefOrder + 10, (!isNaN(codeNum) && codeNum > 0) ? codeNum : (data.type === 'DEDUCTION' ? 120 : (data.type === 'AUXILIARY' ? 25 : 50)));
    } else {
      calculationOrder = (!isNaN(codeNum) && codeNum > 0) ? codeNum : (data.type === 'DEDUCTION' ? 120 : (data.type === 'AUXILIARY' ? 25 : 50));
    }
  }

  // Validar consistencia y dependencias de la fórmula si aplica
  if (data.calculationType === 'FORMULA' && data.formula) {
    const validation = validateConceptFormula({
      formula: data.formula,
      conceptCode: data.code.trim(),
      type: data.type,
      calculationOrder,
      allConcepts: allOtherConcepts,
      fixedValues,
      matrices,
      salaryScales,
    });
    if (!validation.isValid) {
      const err = new Error(`Fórmula inválida: ${validation.errors.join('; ')}`);
      err.status = 400;
      throw err;
    }
  }

  return tenantPrisma.concept.create({
    data: {
      code: data.code.trim(),
      name: data.name.trim(),
      type: data.type,
      scope: data.scope || 'GENERAL',
      calculationType: data.calculationType || 'FIXED',
      calculationOrder,
      noveltyDataType,
      quantitySource: data.quantitySource || 'AUTO',
      periodType: data.periodType || data.settlementType || 'ALL',
      isPersistent: data.isPersistent !== undefined ? Boolean(data.isPersistent) : true,
      defaultValue: data.defaultValue !== undefined ? Number(data.defaultValue) : 0.00,
      formula: data.formula || null,
      matrixData: data.matrixData || null,
      matrixId: data.matrixId || null,
      arcaConceptCode: data.arcaConceptCode || (data.type === 'DEDUCTION' ? '810000' : '110000'),
      appliesSipaAporte: Boolean(data.appliesSipaAporte),
      appliesSipaContrib: Boolean(data.appliesSipaContrib),
      appliesInssjypAporte: Boolean(data.appliesInssjypAporte),
      appliesInssjypContrib: Boolean(data.appliesInssjypContrib),
      appliesOsAporte: Boolean(data.appliesOsAporte),
      appliesOsContrib: Boolean(data.appliesOsContrib),
      appliesFsrAporte: Boolean(data.appliesFsrAporte),
      appliesFsrContrib: Boolean(data.appliesFsrContrib),
      appliesRenatreAporte: Boolean(data.appliesRenatreAporte),
      appliesRenatreContrib: Boolean(data.appliesRenatreContrib),
      appliesAaffContrib: Boolean(data.appliesAaffContrib),
      appliesFneContrib: Boolean(data.appliesFneContrib),
      appliesLrtContrib: Boolean(data.appliesLrtContrib),
      appliesRegDifAporte: Boolean(data.appliesRegDifAporte),
      appliesRegEspAporte: Boolean(data.appliesRegEspAporte),
      appliesDetraccion: Boolean(data.appliesDetraccion),
      isRepeatable: Boolean(data.isRepeatable),
      isEmbargo: Boolean(data.isEmbargo),
    },
  });
}

export async function updateConcept(tenantPrisma, conceptId, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const concept = await tenantPrisma.concept.findUnique({
    where: { id: conceptId },
  });
  if (!concept) {
    const err = new Error('El concepto solicitado no existe');
    err.status = 404;
    throw err;
  }

  const newPeriodType = data.periodType !== undefined ? data.periodType : data.settlementType;
  const calcOrder = data.calculationOrder !== undefined && data.calculationOrder !== null
    ? Number(data.calculationOrder)
    : (concept.calculationOrder || 100);
  const formula = data.formula !== undefined ? data.formula : concept.formula;
  const calcType = data.calculationType !== undefined ? data.calculationType : concept.calculationType;

  // Validar fórmula si aplica
  if (calcType === 'FORMULA' && formula) {
    const [allOtherConcepts, fixedValues, matrices, salaryScales] = await Promise.all([
      tenantPrisma.concept.findMany({
        where: { deletedAt: null, id: { not: conceptId } },
        select: { id: true, code: true, name: true, calculationOrder: true },
      }),
      tenantPrisma.payrollFixedValue.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true, name: true, value: true },
      }),
      tenantPrisma.payrollMatrix.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true, name: true },
      }),
      tenantPrisma.salaryScale.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true, name: true, amount: true },
      }),
    ]);
    const validation = validateConceptFormula({
      formula,
      conceptCode: concept.code,
      type: data.type !== undefined ? data.type : concept.type,
      calculationOrder: calcOrder,
      allConcepts: allOtherConcepts,
      fixedValues,
      matrices,
      salaryScales,
    });
    if (!validation.isValid) {
      const err = new Error(`Fórmula inválida: ${validation.errors.join('; ')}`);
      err.status = 400;
      throw err;
    }
  }

  return tenantPrisma.concept.update({
    where: { id: conceptId },
    data: {
      name: data.name !== undefined ? data.name.trim() : concept.name,
      type: data.type !== undefined ? data.type : concept.type,
      scope: data.scope !== undefined ? data.scope : concept.scope,
      calculationType: data.calculationType !== undefined ? data.calculationType : concept.calculationType,
      calculationOrder: calcOrder,
      noveltyDataType: data.noveltyDataType !== undefined ? data.noveltyDataType : (concept.noveltyDataType || 'CANTIDAD'),
      quantitySource: data.quantitySource !== undefined ? (data.quantitySource || 'AUTO') : (concept.quantitySource || 'AUTO'),
      periodType: newPeriodType !== undefined ? newPeriodType : concept.periodType,
      isPersistent: data.isPersistent !== undefined ? Boolean(data.isPersistent) : concept.isPersistent,
      defaultValue: data.defaultValue !== undefined ? Number(data.defaultValue) : concept.defaultValue,
      formula: data.formula !== undefined ? data.formula : concept.formula,
      matrixData: data.matrixData !== undefined ? data.matrixData : concept.matrixData,
      matrixId: data.matrixId !== undefined ? (data.matrixId || null) : concept.matrixId,
      arcaConceptCode: data.arcaConceptCode !== undefined ? data.arcaConceptCode : concept.arcaConceptCode,
      appliesSipaAporte: data.appliesSipaAporte !== undefined ? Boolean(data.appliesSipaAporte) : concept.appliesSipaAporte,
      appliesSipaContrib: data.appliesSipaContrib !== undefined ? Boolean(data.appliesSipaContrib) : concept.appliesSipaContrib,
      appliesInssjypAporte: data.appliesInssjypAporte !== undefined ? Boolean(data.appliesInssjypAporte) : concept.appliesInssjypAporte,
      appliesInssjypContrib: data.appliesInssjypContrib !== undefined ? Boolean(data.appliesInssjypContrib) : concept.appliesInssjypContrib,
      appliesOsAporte: data.appliesOsAporte !== undefined ? Boolean(data.appliesOsAporte) : concept.appliesOsAporte,
      appliesOsContrib: data.appliesOsContrib !== undefined ? Boolean(data.appliesOsContrib) : concept.appliesOsContrib,
      appliesFsrAporte: data.appliesFsrAporte !== undefined ? Boolean(data.appliesFsrAporte) : concept.appliesFsrAporte,
      appliesFsrContrib: data.appliesFsrContrib !== undefined ? Boolean(data.appliesFsrContrib) : concept.appliesFsrContrib,
      appliesRenatreAporte: data.appliesRenatreAporte !== undefined ? Boolean(data.appliesRenatreAporte) : concept.appliesRenatreAporte,
      appliesRenatreContrib: data.appliesRenatreContrib !== undefined ? Boolean(data.appliesRenatreContrib) : concept.appliesRenatreContrib,
      appliesAaffContrib: data.appliesAaffContrib !== undefined ? Boolean(data.appliesAaffContrib) : concept.appliesAaffContrib,
      appliesFneContrib: data.appliesFneContrib !== undefined ? Boolean(data.appliesFneContrib) : concept.appliesFneContrib,
      appliesLrtContrib: data.appliesLrtContrib !== undefined ? Boolean(data.appliesLrtContrib) : concept.appliesLrtContrib,
      appliesRegDifAporte: data.appliesRegDifAporte !== undefined ? Boolean(data.appliesRegDifAporte) : concept.appliesRegDifAporte,
      appliesRegEspAporte: data.appliesRegEspAporte !== undefined ? Boolean(data.appliesRegEspAporte) : concept.appliesRegEspAporte,
      appliesDetraccion: data.appliesDetraccion !== undefined ? Boolean(data.appliesDetraccion) : concept.appliesDetraccion,
      isRepeatable: data.isRepeatable !== undefined ? Boolean(data.isRepeatable) : concept.isRepeatable,
      isEmbargo: data.isEmbargo !== undefined ? Boolean(data.isEmbargo) : concept.isEmbargo,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : concept.isActive,
    },
  });
}

export async function validateFormula(tenantPrisma, { formula, conceptCode, conceptType, type, calculationOrder = 100 }) {
  await ensureTenantPayrollSchema(tenantPrisma);
  const [allConcepts, fixedValues, matrices, salaryScales] = await Promise.all([
    tenantPrisma.concept.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, calculationOrder: true },
    }),
    tenantPrisma.payrollFixedValue.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, value: true },
    }),
    tenantPrisma.payrollMatrix.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
    }),
    tenantPrisma.salaryScale.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, amount: true },
    }),
  ]);
  return validateConceptFormula({
    formula,
    conceptCode,
    type: type || conceptType,
    calculationOrder: Number(calculationOrder) || 100,
    allConcepts,
    fixedValues,
    matrices,
    salaryScales,
  });
}

export async function deleteConcept(tenantPrisma, conceptId) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const concept = await tenantPrisma.concept.findUnique({
    where: { id: conceptId },
  });
  if (!concept) {
    const err = new Error('El concepto solicitado no existe');
    err.status = 404;
    throw err;
  }

  return tenantPrisma.concept.update({
    where: { id: conceptId },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  });
}


// --- MATRICES DE LIQUIDACIÓN (LOOKUP MATRICES) ---

export async function getPayrollMatrices(tenantPrisma, { search = '', page = 1, limit = 5, matchType, isActive } = {}) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const take = Math.max(1, Math.min(Number(limit) || 5, 100));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = { deletedAt: null };
  if (matchType) where.matchType = matchType;
  if (isActive !== undefined) where.isActive = String(isActive) === 'true' || isActive === true;
  if (search) {
    where.OR = [
      { code: { contains: search } },
      { name: { contains: search } },
      { inputConceptCode: { contains: search } },
    ];
  }

  const [total, matrices] = await Promise.all([
    tenantPrisma.payrollMatrix.count({ where }),
    tenantPrisma.payrollMatrix.findMany({
      where,
      skip,
      take,
      include: {
        _count: {
          select: { concepts: true },
        },
      },
      orderBy: { code: 'asc' },
    }),
  ]);

  return {
    data: matrices.map((m) => {
      let parsedRows = [];
      try {
        parsedRows = typeof m.rows === 'string' ? JSON.parse(m.rows) : (m.rows || []);
      } catch {
        parsedRows = [];
      }
      return {
        ...m,
        rowsCount: parsedRows.length,
        conceptsCount: m._count?.concepts || 0,
      };
    }),
    meta: {
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}

export async function getPayrollMatrixById(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const matrix = await tenantPrisma.payrollMatrix.findUnique({
    where: { id },
    include: {
      concepts: {
        where: { deletedAt: null },
        select: { id: true, code: true, name: true, type: true },
      },
    },
  });

  if (!matrix || matrix.deletedAt) {
    const err = new Error('La matriz solicitada no existe');
    err.status = 404;
    throw err;
  }

  let parsedRows = [];
  try {
    parsedRows = typeof matrix.rows === 'string' ? JSON.parse(matrix.rows) : (matrix.rows || []);
  } catch {
    parsedRows = [];
  }

  return {
    ...matrix,
    parsedRows,
  };
}

export async function createPayrollMatrix(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const code = data.code.trim().toUpperCase();
  const existing = await tenantPrisma.payrollMatrix.findUnique({
    where: { code },
  });

  if (existing && !existing.deletedAt) {
    const err = new Error(`Ya existe una matriz con el código "${code}"`);
    err.status = 409;
    throw err;
  }

  const rowsJson = typeof data.rows === 'string' ? data.rows : JSON.stringify(data.rows || []);

  return tenantPrisma.payrollMatrix.create({
    data: {
      code,
      name: data.name.trim(),
      description: data.description ? data.description.trim() : null,
      inputConceptCode: data.inputConceptCode.trim(),
      matchType: data.matchType || 'RANGE',
      defaultValue: data.defaultValue !== undefined ? Number(data.defaultValue) : 0.00,
      rows: rowsJson,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    },
  });
}

export async function updatePayrollMatrix(tenantPrisma, id, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const matrix = await tenantPrisma.payrollMatrix.findUnique({
    where: { id },
  });
  if (!matrix || matrix.deletedAt) {
    const err = new Error('La matriz solicitada no existe');
    err.status = 404;
    throw err;
  }

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description ? data.description.trim() : null;
  if (data.inputConceptCode !== undefined) updateData.inputConceptCode = data.inputConceptCode.trim();
  if (data.matchType !== undefined) updateData.matchType = data.matchType;
  if (data.defaultValue !== undefined) updateData.defaultValue = Number(data.defaultValue);
  if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);
  if (data.rows !== undefined) {
    updateData.rows = typeof data.rows === 'string' ? data.rows : JSON.stringify(data.rows || []);
  }

  return tenantPrisma.payrollMatrix.update({
    where: { id },
    data: updateData,
  });
}

export async function deletePayrollMatrix(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const matrix = await tenantPrisma.payrollMatrix.findUnique({
    where: { id },
    include: {
      concepts: { where: { deletedAt: null } },
    },
  });

  if (!matrix || matrix.deletedAt) {
    const err = new Error('La matriz solicitada no existe');
    err.status = 404;
    throw err;
  }

  if (matrix.concepts && matrix.concepts.length > 0) {
    const conceptCodes = matrix.concepts.map((c) => c.code).join(', ');
    const err = new Error(`No es posible eliminar la matriz porque está siendo utilizada por los conceptos: ${conceptCodes}`);
    err.status = 400;
    throw err;
  }

  return tenantPrisma.payrollMatrix.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

// --- VALORES GLOBALES FIJOS (CONSTANTES DE LIQUIDACIÓN) ---

export async function getPayrollFixedValues(tenantPrisma, { search = '', page = 1, limit = 5, isActive }) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const take = Math.max(1, Math.min(Number(limit) || 5, 100));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = { deletedAt: null };
  if (isActive !== undefined && isActive !== 'ALL' && isActive !== '') {
    where.isActive = String(isActive) === 'true' || isActive === true;
  }
  if (search && String(search).trim() !== '') {
    const q = String(search).trim();
    where.OR = [
      { code: { contains: q } },
      { name: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const [total, fixedValues] = await Promise.all([
    tenantPrisma.payrollFixedValue.count({ where }),
    tenantPrisma.payrollFixedValue.findMany({
      where,
      skip,
      take,
      orderBy: { code: 'asc' },
    }),
  ]);

  return {
    data: fixedValues,
    meta: {
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}

export async function getPayrollFixedValueById(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const fixedValue = await tenantPrisma.payrollFixedValue.findUnique({
    where: { id },
  });

  if (!fixedValue || fixedValue.deletedAt) {
    const err = new Error('El valor fijo solicitado no existe');
    err.status = 404;
    throw err;
  }

  return fixedValue;
}

export async function createPayrollFixedValue(tenantPrisma, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const code = String(data.code).trim().toUpperCase().replace(/\s+/g, '_');
  const existing = await tenantPrisma.payrollFixedValue.findUnique({
    where: { code },
  });

  if (existing && !existing.deletedAt) {
    const err = new Error(`Ya existe un valor fijo con el código "${code}"`);
    err.status = 409;
    throw err;
  }

  if (existing && existing.deletedAt) {
    // Si existía pero estaba borrado, reactivarlo con los nuevos datos
    return tenantPrisma.payrollFixedValue.update({
      where: { id: existing.id },
      data: {
        code,
        name: data.name.trim(),
        description: data.description ? data.description.trim() : null,
        value: Number(data.value || 0),
        unit: data.unit ? data.unit.trim() : '$',
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
        deletedAt: null,
      },
    });
  }

  return tenantPrisma.payrollFixedValue.create({
    data: {
      code,
      name: data.name.trim(),
      description: data.description ? data.description.trim() : null,
      value: Number(data.value || 0),
      unit: data.unit ? data.unit.trim() : '$',
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    },
  });
}

export async function updatePayrollFixedValue(tenantPrisma, id, data) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const fixedValue = await tenantPrisma.payrollFixedValue.findUnique({
    where: { id },
  });

  if (!fixedValue || fixedValue.deletedAt) {
    const err = new Error('El valor fijo solicitado no existe');
    err.status = 404;
    throw err;
  }

  const updateData = {};
  if (data.code !== undefined) {
    const newCode = String(data.code).trim().toUpperCase().replace(/\s+/g, '_');
    if (newCode !== fixedValue.code) {
      const codeConflict = await tenantPrisma.payrollFixedValue.findUnique({
        where: { code: newCode },
      });
      if (codeConflict && codeConflict.id !== id && !codeConflict.deletedAt) {
        const err = new Error(`Ya existe otro valor fijo con el código "${newCode}"`);
        err.status = 409;
        throw err;
      }
      updateData.code = newCode;
    }
  }

  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description ? data.description.trim() : null;
  if (data.value !== undefined) updateData.value = Number(data.value);
  if (data.unit !== undefined) updateData.unit = data.unit.trim();
  if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);

  return tenantPrisma.payrollFixedValue.update({
    where: { id },
    data: updateData,
  });
}

export async function deletePayrollFixedValue(tenantPrisma, id) {
  await ensureTenantPayrollSchema(tenantPrisma);

  const fixedValue = await tenantPrisma.payrollFixedValue.findUnique({
    where: { id },
  });

  if (!fixedValue || fixedValue.deletedAt) {
    const err = new Error('El valor fijo solicitado no existe');
    err.status = 404;
    throw err;
  }

  // Verificar si algún concepto activo utiliza este valor fijo en su fórmula
  const concepts = await tenantPrisma.concept.findMany({
    where: { isActive: true, deletedAt: null, calculationType: 'FORMULA' },
    select: { code: true, name: true, formula: true },
  });

  const matchingConcepts = concepts.filter((c) => {
    if (!c.formula) return false;
    const fUpper = c.formula.toUpperCase();
    return (
      fUpper.includes(`[${fixedValue.code}]`) ||
      fUpper.includes(`[VALOR:${fixedValue.code}]`) ||
      fUpper.includes(`[FIJO:${fixedValue.code}]`) ||
      fUpper.includes(`[CONST:${fixedValue.code}]`) ||
      fUpper.includes(`[VALOR:${fixedValue.name.toUpperCase()}]`)
    );
  });

  if (matchingConcepts.length > 0) {
    const list = matchingConcepts.map((c) => `${c.code} (${c.name})`).join(', ');
    const err = new Error(`No es posible eliminar el valor fijo porque está siendo utilizado en las fórmulas de los conceptos: ${list}`);
    err.status = 400;
    throw err;
  }

  return tenantPrisma.payrollFixedValue.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

// =====================================================================
// NOVEDADES NO PERSISTENTES DE PERÍODO (period_novelties)
