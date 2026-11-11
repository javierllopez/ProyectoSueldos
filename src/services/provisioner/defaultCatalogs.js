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
  // --- DEDUCCIONES DE LEY DESAGREGADAS POR TIPO DE LIQUIDACIÓN (SU, QU, SA, VA, FI) ---
  ...['SU', 'QU', 'SA', 'VA', 'FI'].flatMap((prefix) => {
    let periodType = 'MONTHLY';
    if (prefix === 'QU') periodType = 'QUINCE';
    else if (prefix === 'SA') periodType = 'SAC';
    else if (prefix === 'VA') periodType = 'VACATIONS';
    else if (prefix === 'FI') periodType = 'FINAL';

    return [
      // Jubilación SIPA (11%)
      {
        code: `${prefix}6001`,
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
      // INSSJyP - Ley 19.032 (3%)
      {
        code: `${prefix}6002`,
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
      // Obra Social (3%)
      {
        code: `${prefix}6003`,
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
      // Obra Social - Adherentes (1.5% c/u - Ley 23.660)
      {
        code: `${prefix}6009`,
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
      // Cuota Sindical (2%) - Alcance INDIVIDUAL
      {
        code: `${prefix}6004`,
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
    ];
  }),
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
