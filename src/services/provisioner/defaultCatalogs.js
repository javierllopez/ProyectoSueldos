import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(import.meta.dirname, '../../data');

/**
 * Parentescos predeterminados de acuerdo a la legislación laboral y seguridad social argentina.
 */
export const DEFAULT_KINSHIPS = [
  { code: 'CONYUGE', name: 'Cónyuge' },
  { code: 'CONVIVIENTE', name: 'Conviviente / Unión Convivencial' },
  { code: 'HIJO_MENOR_21', name: 'Hijo/a menor de 21 años' },
  { code: 'HIJO_ESTUDIANTE', name: 'Hijo/a de 21 a 25 años inclusive (Estudiante)' },
  { code: 'HIJO_INCAPACITADO', name: 'Hijo/a incapacitado/a para el trabajo' },
  { code: 'PADRE_MADRE', name: 'Padre / Madre' },
  { code: 'HERMANO', name: 'Hermano/a menor o incapacitado/a' },
  { code: 'TUTELA', name: 'Menor bajo tutela o guarda legal' },
];

const CATALOG_CACHE_TTL_MS = 60 * 1000;
const catalogCache = new Map();
const pendingCatalogReads = new Map();

/**
 * Carga un catálogo JSON de ARCA/Obras Sociales de forma asíncrona (no bloquea el event loop),
 * deduplica lecturas concurrentes y libera la memoria tras un TTL corto de inactividad.
 * @param {string} fileName
 * @returns {Promise<Array>}
 */
async function loadCatalogJson(fileName) {
  const cached = catalogCache.get(fileName);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  if (pendingCatalogReads.has(fileName)) {
    return pendingCatalogReads.get(fileName);
  }

  const filePath = path.join(DATA_DIR, fileName);
  const readPromise = (async () => {
    try {
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      if (cached?.timer) clearTimeout(cached.timer);
      const timer = setTimeout(() => {
        const entry = catalogCache.get(fileName);
        if (entry && entry.expiresAt <= Date.now()) {
          catalogCache.delete(fileName);
        }
      }, CATALOG_CACHE_TTL_MS);
      timer.unref?.();

      catalogCache.set(fileName, {
        data: parsed,
        expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
        timer,
      });

      return parsed;
    } catch (err) {
      console.warn(`Aviso: no se pudo leer ${fileName}:`, err.message);
      return [];
    } finally {
      pendingCatalogReads.delete(fileName);
    }
  })();

  pendingCatalogReads.set(fileName, readPromise);
  return readPromise;
}

export function getHealthInsurancesData() {
  return loadCatalogJson('healthInsurances.json');
}

/**
 * Funciones auxiliares para cargar catálogos oficiales de ARCA (Simplificación Registral).
 */
export function getArcaServiceTypesData() {
  return loadCatalogJson('arcaServiceTypes.json');
}

export function getArcaPositionsData() {
  return loadCatalogJson('arcaPositions.json');
}

export function getArcaActivitiesData() {
  return loadCatalogJson('arcaActivities.json');
}

export function getArcaCctsData() {
  return loadCatalogJson('arcaCcts.json');
}

export function getArcaCategoriesData() {
  return loadCatalogJson('arcaCategories.json');
}

export function getArcaCctCategoryPositionsData() {
  return loadCatalogJson('arcaCctCategoryPositions.json');
}

export function getArcaContractModalitiesData() {
  return loadCatalogJson('arcaContractModalities.json');
}

export const DEFAULT_PAYMENT_METHODS = [
  {
    name: 'Acreditación en Cuenta Sueldo (C.B.U.)',
    description: 'Transferencia electrónica bancaria a la Cuenta Sueldo declarada por el colaborador mediante clave bancaria uniforme (C.B.U.), sin costo para el trabajador conforme Art. 124 LCT.',
  },
  {
    name: 'Pago en Efectivo por Tesorería',
    description: 'Abono presencial en moneda de curso legal por caja o tesorería de la empresa contra firma de recibo de haberes (Art. 124 LCT).',
  },
  {
    name: 'Cheque / E-Cheq a la Orden',
    description: 'Emisión de cheque común o cheque electrónico (E-Cheq) no a la orden a nombre del trabajador para su cobro por ventanilla o depósito bancario.',
  },
  {
    name: 'Billetera Virtual / CVU Homologada',
    description: 'Transferencia electrónica inmediata a cuenta virtual uniforme (C.V.U.) o billetera digital habilitada por el titular del legajo.',
  },
];

/**
 * Genera los conceptos de deducciones legales estándar (6001..6004 y 6009) para un prefijo y tipo de liquidación dado.
 */
export function buildStatutoryDeductionConceptsForType(prefix, periodType) {
  const cleanPrefix = String(prefix || 'SU').trim().toUpperCase().slice(0, 2);
  const baseSubsystems = {
    appliesSipaAporte: false,
    appliesSipaContrib: false,
    appliesInssjypAporte: false,
    appliesInssjypContrib: false,
    appliesOsAporte: false,
    appliesOsContrib: false,
    appliesFsrAporte: false,
    appliesFsrContrib: false,
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: false,
    appliesFneContrib: false,
    appliesLrtContrib: false,
    isRepeatable: false,
  };

  return [
    {
      code: `${cleanPrefix}6001`,
      name: 'Jubilación SIPA (11%)',
      type: 'DEDUCTION',
      calculationType: 'PERCENTAGE',
      periodType,
      scope: 'GENERAL',
      noveltyDataType: 'PORCENTAJE',
      calculationOrder: 6001,
      defaultValue: 11.00,
      formula: null,
      matrixData: null,
      isPersistent: true,
      isActive: true,
      arcaConceptCode: '810000',
      ...baseSubsystems,
    },
    {
      code: `${cleanPrefix}6002`,
      name: 'INSSJyP - Ley 19.032 (3%)',
      type: 'DEDUCTION',
      calculationType: 'PERCENTAGE',
      periodType,
      scope: 'GENERAL',
      noveltyDataType: 'PORCENTAJE',
      calculationOrder: 6002,
      defaultValue: 3.00,
      formula: null,
      matrixData: null,
      isPersistent: true,
      isActive: true,
      arcaConceptCode: '810001',
      ...baseSubsystems,
    },
    {
      code: `${cleanPrefix}6003`,
      name: 'Obra Social (3%)',
      type: 'DEDUCTION',
      calculationType: 'PERCENTAGE',
      periodType,
      scope: 'GENERAL',
      noveltyDataType: 'PORCENTAJE',
      calculationOrder: 6003,
      defaultValue: 3.00,
      formula: null,
      matrixData: null,
      isPersistent: true,
      isActive: true,
      arcaConceptCode: '810002',
      ...baseSubsystems,
    },
    {
      code: `${cleanPrefix}6009`,
      name: 'Obra Social - Adherentes (1.5% c/u)',
      type: 'DEDUCTION',
      calculationType: 'FORMULA',
      periodType,
      scope: 'INDIVIDUAL',
      noveltyDataType: 'IMPORTE',
      calculationOrder: 6009,
      defaultValue: 1.50,
      formula: '[BASE_OBRA_SOCIAL_COMPLETA] * 0.015 * [CANTIDAD_ADHERENTES]',
      matrixData: null,
      isPersistent: true,
      isActive: true,
      arcaConceptCode: '810009',
      ...baseSubsystems,
    },
    {
      code: `${cleanPrefix}6004`,
      name: 'Cuota Sindical (2%)',
      type: 'DEDUCTION',
      calculationType: 'PERCENTAGE',
      periodType,
      scope: 'INDIVIDUAL',
      noveltyDataType: 'PORCENTAJE',
      calculationOrder: 6004,
      defaultValue: 2.00,
      formula: null,
      matrixData: null,
      isPersistent: true,
      isActive: true,
      arcaConceptCode: '810004',
      ...baseSubsystems,
    },
  ];
}

/**
 * Genera los 6 conceptos específicos de ajuste retroactivo paritario para un prefijo y tipo de liquidación dado.
 * Cada concepto pertenece estrictamente al periodType indicado (nunca 'ALL').
 */
export function buildRetroactiveConceptsForType(prefix = 'RT', periodType = 'RETROACTIVE') {
  const cleanPrefix = String(prefix || 'RT').trim().toUpperCase().slice(0, 2);
  const defs = [
    {
      suffix: '1090',
      name: 'Dif. Retroactiva Sueldo Básico',
      type: 'REMUNERATIVE',
      calculationOrder: 1090,
      arcaConceptCode: '110000',
      tributesSuss: true,
      tributesOsOnly: false,
      tributesLrt: true,
    },
    {
      suffix: '1091',
      name: 'Dif. Retroactiva Adicionales Convencionales',
      type: 'REMUNERATIVE',
      calculationOrder: 1091,
      arcaConceptCode: '160000',
      tributesSuss: true,
      tributesOsOnly: false,
      tributesLrt: true,
    },
    {
      suffix: '1092',
      name: 'Dif. Retroactiva Horas Extras',
      type: 'REMUNERATIVE',
      calculationOrder: 1092,
      arcaConceptCode: '130000',
      tributesSuss: true,
      tributesOsOnly: false,
      tributesLrt: true,
    },
    {
      suffix: '1093',
      name: 'Dif. Retroactiva Vacaciones',
      type: 'REMUNERATIVE',
      calculationOrder: 1093,
      arcaConceptCode: '150000',
      tributesSuss: true,
      tributesOsOnly: false,
      tributesLrt: true,
    },
    {
      suffix: '1094',
      name: 'Dif. Retroactiva SAC',
      type: 'REMUNERATIVE',
      calculationOrder: 1094,
      arcaConceptCode: '120000',
      tributesSuss: true,
      tributesOsOnly: false,
      tributesLrt: true,
    },
    {
      suffix: '5090',
      name: 'Ajuste Retroactivo No Remunerativo Paritario',
      type: 'NON_REMUNERATIVE',
      calculationOrder: 5090,
      arcaConceptCode: '540000',
      tributesSuss: false,
      tributesOsOnly: true,
      tributesLrt: true,
    },
  ];

  return defs.map((d) => ({
    code: `${cleanPrefix}${d.suffix}`,
    name: d.name,
    type: d.type,
    calculationType: 'FIXED',
    periodType,
    scope: 'INDIVIDUAL',
    noveltyDataType: 'IMPORTE',
    calculationOrder: d.calculationOrder,
    defaultValue: 0.00,
    formula: null,
    matrixData: null,
    isPersistent: false,
    isActive: true,
    arcaConceptCode: d.arcaConceptCode,
    appliesSipaAporte: d.tributesSuss,
    appliesSipaContrib: d.tributesSuss,
    appliesInssjypAporte: d.tributesSuss,
    appliesInssjypContrib: d.tributesSuss,
    appliesOsAporte: d.tributesSuss || d.tributesOsOnly,
    appliesOsContrib: d.tributesSuss || d.tributesOsOnly,
    appliesFsrAporte: d.tributesSuss || d.tributesOsOnly,
    appliesFsrContrib: d.tributesSuss || d.tributesOsOnly,
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: d.tributesSuss,
    appliesFneContrib: d.tributesSuss,
    appliesLrtContrib: d.tributesLrt,
    appliesDetraccion: d.tributesSuss,
    isRepeatable: false,
  }));
}

/**
 * Conceptos predeterminados del sistema con parametrización ARCA y fórmulas base.
 */
export const DEFAULT_CONCEPTS = [
  // 1. Sueldo Básico (Remunerativo - Prefijo SU - Rango 1000..3999)
  {
    code: 'SU1000',
    name: 'Sueldo Básico',
    type: 'REMUNERATIVE',
    calculationType: 'FIXED',
    periodType: 'MONTHLY',
    scope: 'GENERAL',
    noveltyDataType: 'CANTIDAD',
    calculationOrder: 10,
    defaultValue: 0.00,
    formula: null,
    matrixData: null,
    isPersistent: true,
    isActive: true,
    arcaConceptCode: '110000',
    appliesSipaAporte: true,
    appliesSipaContrib: true,
    appliesInssjypAporte: true,
    appliesInssjypContrib: true,
    appliesOsAporte: true,
    appliesOsContrib: true,
    appliesFsrAporte: true,
    appliesFsrContrib: true,
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: true,
    appliesFneContrib: true,
    appliesLrtContrib: true,
    isRepeatable: false,
  },
  // 1.b Asignación Estímulo Ley 26.427 (No Remunerativo - Pasantías Educativas)
  {
    code: 'SU1001',
    name: 'Asignación Estímulo Ley 26.427',
    type: 'NON_REMUNERATIVE',
    calculationType: 'FIXED',
    periodType: 'MONTHLY',
    scope: 'GENERAL',
    noveltyDataType: 'CANTIDAD',
    calculationOrder: 20,
    defaultValue: 0.00,
    formula: null,
    matrixData: null,
    isPersistent: true,
    isActive: true,
    arcaConceptCode: '550000',
    appliesSipaAporte: false,
    appliesSipaContrib: false,
    appliesInssjypAporte: false,
    appliesInssjypContrib: false,
    appliesOsAporte: false,
    appliesOsContrib: true,   // Obra Social 6% patronal (Art. 14 Ley 26.427)
    appliesFsrAporte: false,
    appliesFsrContrib: true,  // Fondo Solidario de Redistribución
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: false,
    appliesFneContrib: false,
    appliesLrtContrib: true,  // Cobertura ART Ley 24.557
    isRepeatable: false,
  },
  // 1.c Honorarios / Retribución Director S.A. (Remunerativo - Directores y Socios Gerentes LRT Mod. 099)
  {
    code: 'SU1002',
    name: 'Honorarios / Retribución Director S.A. (LRT Mod. 099)',
    type: 'REMUNERATIVE',
    calculationType: 'FIXED',
    periodType: 'MONTHLY',
    scope: 'GENERAL',
    noveltyDataType: 'CANTIDAD',
    calculationOrder: 15,
    defaultValue: 0.00,
    formula: null,
    matrixData: null,
    isPersistent: true,
    isActive: true,
    arcaConceptCode: '110000',
    appliesSipaAporte: false,
    appliesSipaContrib: false,
    appliesInssjypAporte: false,
    appliesInssjypContrib: false,
    appliesOsAporte: false,
    appliesOsContrib: false,
    appliesFsrAporte: false,
    appliesFsrContrib: false,
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: false,
    appliesFneContrib: false,
    appliesLrtContrib: true,  // Cobertura ART Ley 24.557 (LRT Modalidad 099)
    isRepeatable: false,
  },
  // 2. Sueldo Anual Complementario (SAC) (Remunerativo - Prefijo SA - Reasigna 1200)
  {
    code: 'SA1000',
    name: 'Sueldo Anual Complementario (SAC)',
    type: 'REMUNERATIVE',
    calculationType: 'FORMULA',
    periodType: 'SAC',
    scope: 'GENERAL',
    noveltyDataType: 'CANTIDAD',
    calculationOrder: 10,
    defaultValue: 0.00,
    formula: '[MEJOR_6M] / 2',
    matrixData: null,
    isPersistent: true,
    isActive: true,
    arcaConceptCode: '120000',
    appliesSipaAporte: true,
    appliesSipaContrib: true,
    appliesInssjypAporte: true,
    appliesInssjypContrib: true,
    appliesOsAporte: true,
    appliesOsContrib: true,
    appliesFsrAporte: true,
    appliesFsrContrib: true,
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: true,
    appliesFneContrib: true,
    appliesLrtContrib: true,
    isRepeatable: false,
  },
  // 3. Adelanto Vacacional (Remunerativo - Prefijo VA - Reasigna 1500)
  {
    code: 'VA1000',
    name: 'Adelanto Vacacional',
    type: 'REMUNERATIVE',
    calculationType: 'FORMULA',
    periodType: 'VACATIONS',
    scope: 'INDIVIDUAL',
    noveltyDataType: 'CANTIDAD',
    calculationOrder: 10,
    defaultValue: 0.00,
    formula: '([SU1000] / 25) * [CANTIDAD]',
    matrixData: null,
    isPersistent: false,
    isActive: true,
    arcaConceptCode: '150000',
    appliesSipaAporte: true,
    appliesSipaContrib: true,
    appliesInssjypAporte: true,
    appliesInssjypContrib: true,
    appliesOsAporte: true,
    appliesOsContrib: true,
    appliesFsrAporte: true,
    appliesFsrContrib: true,
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: true,
    appliesFneContrib: true,
    appliesLrtContrib: true,
    isRepeatable: false,
  },
  // 4. Retención Impuesto a las Ganancias Cuarta Categoría (Deducción - Ley 27.743 / RG 4003)
  {
    code: 'SU8200',
    name: 'Retención Impuesto a las Ganancias 4ta Cat.',
    type: 'DEDUCTION',
    calculationType: 'FIXED',
    periodType: 'MONTHLY',
    scope: 'INDIVIDUAL',
    noveltyDataType: 'IMPORTE',
    calculationOrder: 8200,
    defaultValue: 0.00,
    formula: null,
    matrixData: null,
    isPersistent: false,
    isActive: true,
    arcaConceptCode: '820000',
    appliesSipaAporte: false,
    appliesSipaContrib: false,
    appliesInssjypAporte: false,
    appliesInssjypContrib: false,
    appliesOsAporte: false,
    appliesOsContrib: false,
    appliesFsrAporte: false,
    appliesFsrContrib: false,
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: false,
    appliesFneContrib: false,
    appliesLrtContrib: false,
    isRepeatable: false,
  },
  // 5. Devolución Impuesto a las Ganancias Cuarta Categoría (No Remunerativo - Ley 27.743 / RG 4003)
  {
    code: 'SU5200',
    name: 'Devolución Impuesto a las Ganancias 4ta Cat.',
    type: 'NON_REMUNERATIVE',
    calculationType: 'FIXED',
    periodType: 'MONTHLY',
    scope: 'INDIVIDUAL',
    noveltyDataType: 'IMPORTE',
    calculationOrder: 5200,
    defaultValue: 0.00,
    formula: null,
    matrixData: null,
    isPersistent: false,
    isActive: true,
    arcaConceptCode: '520002',
    appliesSipaAporte: false,
    appliesSipaContrib: false,
    appliesInssjypAporte: false,
    appliesInssjypContrib: false,
    appliesOsAporte: false,
    appliesOsContrib: false,
    appliesFsrAporte: false,
    appliesFsrContrib: false,
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: false,
    appliesFneContrib: false,
    appliesLrtContrib: false,
    isRepeatable: false,
  },
  // --- DEDUCCIONES DE LEY DESAGREGADAS POR TIPO DE LIQUIDACIÓN (SU, QU, SA, VA, FI, RT) ---
  ...['SU', 'QU', 'SA', 'VA', 'FI', 'RT'].flatMap((prefix) => {
    let periodType = 'MONTHLY';
    if (prefix === 'QU') periodType = 'QUINCE';
    else if (prefix === 'SA') periodType = 'SAC';
    else if (prefix === 'VA') periodType = 'VACATIONS';
    else if (prefix === 'FI') periodType = 'FINAL';
    else if (prefix === 'RT') periodType = 'RETROACTIVE';

    return buildStatutoryDeductionConceptsForType(prefix, periodType);
  }),
  // --- CONCEPTOS DE HABERES RETROACTIVOS PARITARIOS (TIPO RETROACTIVE - PREFIJO RT) ---
  ...buildRetroactiveConceptsForType('RT', 'RETROACTIVE'),
  // --- CONCEPTOS DE HABERES E INDEMNIZACIONES PARA LIQUIDACIÓN FINAL (PREFIJO FI - ALCANCE INDIVIDUAL) ---
  ...[
    {
      code: 'FI1000',
      name: 'Días Trabajados Mes de Baja',
      type: 'REMUNERATIVE',
      calculationOrder: 10,
      arcaConceptCode: '110000',
      tributesSuss: true,
    },
    {
      code: 'FI1200',
      name: 'SAC Proporcional (Art. 123 LCT)',
      type: 'REMUNERATIVE',
      calculationOrder: 20,
      arcaConceptCode: '120003',
      tributesSuss: true,
    },
    {
      code: 'FI5012',
      name: 'Vacaciones No Gozadas (Art. 156 LCT)',
      type: 'NON_REMUNERATIVE',
      calculationOrder: 5012,
      arcaConceptCode: '520012',
      tributesSuss: false,
    },
    {
      code: 'FI5018',
      name: 'SAC s/ Vacaciones No Gozadas (Art. 156 LCT)',
      type: 'NON_REMUNERATIVE',
      calculationOrder: 5018,
      arcaConceptCode: '520018',
      tributesSuss: false,
    },
    {
      code: 'FI5014',
      name: 'Indemnización por Antigüedad (Art. 245 LCT)',
      type: 'NON_REMUNERATIVE',
      calculationOrder: 5014,
      arcaConceptCode: '520014',
      tributesSuss: false,
    },
    {
      code: 'FI5011',
      name: 'Indemnización por Extinción (Arts. 247/248 LCT)',
      type: 'NON_REMUNERATIVE',
      calculationOrder: 5011,
      arcaConceptCode: '520011',
      tributesSuss: false,
    },
    {
      code: 'FI5015',
      name: 'Indemnización Sustitutiva de Preaviso (Art. 232 LCT)',
      type: 'NON_REMUNERATIVE',
      calculationOrder: 5015,
      arcaConceptCode: '520015',
      tributesSuss: false,
    },
    {
      code: 'FI5017',
      name: 'SAC s/ Preaviso Omitido (Arts. 232/123 LCT)',
      type: 'NON_REMUNERATIVE',
      calculationOrder: 5017,
      arcaConceptCode: '520017',
      tributesSuss: false,
    },
    {
      code: 'FI5016',
      name: 'Integración Mes de Despido (Art. 233 LCT)',
      type: 'NON_REMUNERATIVE',
      calculationOrder: 5016,
      arcaConceptCode: '520016',
      tributesSuss: false,
    },
    {
      code: 'FI5019',
      name: 'SAC s/ Integración Mes de Despido (Arts. 233/123 LCT)',
      type: 'NON_REMUNERATIVE',
      calculationOrder: 5019,
      arcaConceptCode: '520017',
      tributesSuss: false,
    },
    {
      code: 'FI5010',
      name: 'Gratificación por Cese Laboral (Art. 241 LCT)',
      type: 'NON_REMUNERATIVE',
      calculationOrder: 5010,
      arcaConceptCode: '520010',
      tributesSuss: false,
    },
  ].map((fc) => ({
    code: fc.code,
    name: fc.name,
    type: fc.type,
    calculationType: 'FIXED',
    periodType: 'FINAL',
    scope: 'INDIVIDUAL',
    noveltyDataType: 'IMPORTE',
    calculationOrder: fc.calculationOrder,
    defaultValue: 0.00,
    formula: null,
    matrixData: null,
    isPersistent: false,
    isActive: true,
    arcaConceptCode: fc.arcaConceptCode,
    appliesSipaAporte: fc.tributesSuss,
    appliesSipaContrib: fc.tributesSuss,
    appliesInssjypAporte: fc.tributesSuss,
    appliesInssjypContrib: fc.tributesSuss,
    appliesOsAporte: fc.tributesSuss,
    appliesOsContrib: fc.tributesSuss,
    appliesFsrAporte: fc.tributesSuss,
    appliesFsrContrib: fc.tributesSuss,
    appliesRenatreAporte: false,
    appliesRenatreContrib: false,
    appliesAaffContrib: fc.tributesSuss,
    appliesFneContrib: fc.tributesSuss,
    appliesLrtContrib: fc.tributesSuss,
    appliesDetraccion: fc.tributesSuss,
    isRepeatable: false,
  })),
];

export const DEFAULT_INCIDENT_TYPES = [
  { code: 'INC-001', name: 'Llegada tarde / Impuntualidad', severity: 'LOW', description: 'Ingreso posterior al horario habitual de inicio de jornada sin aviso o justificación.' },
  { code: 'INC-002', name: 'Inasistencia injustificada', severity: 'MEDIUM', description: 'Ausencia a la jornada laboral sin preaviso ni certificado respaldatorio válido.' },
  { code: 'INC-003', name: 'Incumplimiento de normas de higiene y seguridad', severity: 'HIGH', description: 'Omisión de uso de EPP o incumplimiento de protocolos de prevención de riesgos.' },
  { code: 'INC-004', name: 'Falta de respeto / Inconducta laboral', severity: 'HIGH', description: 'Trato inapropiado hacia compañeros, superiores, clientes o terceros.' },
  { code: 'INC-005', name: 'Negligencia o daño a bienes de la empresa', severity: 'CRITICAL', description: 'Uso indebido o descuido grave de herramientas, vehículos, equipos o instalaciones.' },
];

export const DEFAULT_SANCTION_TYPES = [
  { code: 'SAN-001', name: 'Llamado de atención verbal asentado', requiresSuspensionDays: false, description: 'Advertencia formal preventiva registrada en el legajo del colaborador.' },
  { code: 'SAN-002', name: 'Apercibimiento por escrito', requiresSuspensionDays: false, description: 'Sanción disciplinaria escrita notificada fehacientemente (Art. 67 LCT).' },
  { code: 'SAN-003', name: 'Suspensión disciplinaria sin goce de haberes', requiresSuspensionDays: true, description: 'Suspensión por justa causa con plazo cierto y notificación escrita (Arts. 218 a 220 LCT).' },
  { code: 'SAN-004', name: 'Despido con justa causa (Injuria laboral)', requiresSuspensionDays: false, description: 'Extinción del contrato de trabajo por injuria grave (Art. 242 LCT).' },
];
