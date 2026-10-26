/**
 * Generador y Validador de Archivos Planos para el Libro de Sueldos Digital (LSD) - ARCA
 * Conforme a especificaciones de diseño de registro y longitudes fijas oficiales de ARCA:
 * - Archivo 1: Parametrización de Conceptos (195 caracteres por línea)
 * - Archivo 2: Liquidación de Haberes:
 *     * Registro 01: 35 caracteres (Cabecera de liquidación / envío)
 *     * Registro 02: 115 caracteres (Datos generales del trabajador)
 *     * Registro 03: 51 caracteres (Detalle de conceptos liquidados)
 *     * Registro 04: 370 caracteres (Atributos laborales y Bases Imponibles F.931)
 */

// Utilidades de formateo de campos fijos
function formatAlpha(str, length) {
  const clean = (str || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Sin tildes para ANSI
  if (clean.length >= length) {
    return clean.substring(0, length);
  }
  return clean.padEnd(length, ' ');
}

function formatNumeric(val, length) {
  const num = Math.round(Number(val) || 0);
  const clean = String(Math.abs(num));
  if (clean.length >= length) {
    return clean.substring(0, length);
  }
  return clean.padStart(length, '0');
}

function formatMoney(val, length) {
  // Importe sin separador decimal, 2 últimos dígitos representan centavos
  const num = Number(val) || 0;
  const centsTotal = Math.round(num * 100);
  const clean = String(Math.abs(centsTotal));
  if (clean.length >= length) {
    return clean.substring(0, length);
  }
  return clean.padStart(length, '0');
}

function formatBoolNum(val) {
  return val ? '1' : '0';
}

function formatDate(dateVal) {
  if (!dateVal) return '00000000';
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateVal)) {
    return dateVal.substring(0, 10).replace(/-/g, '');
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '00000000';
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Formatea la fecha de rúbrica para el Registro 02 del LSD según especificación ARCA:
 * - Es un dato optativo (8 caracteres).
 * - Si se informa: formato numérico AAAAMMDD.
 * - Si NO se informa (null, vacío o no definida): debe completarse estrictamente con 8 espacios en blanco ('        ') y NO con ceros ('00000000'), para evitar el error 'Fecha de rúbrica inválida'.
 */
function formatRubricDate(dateVal) {
  if (!dateVal) return '        ';
  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    if (!trimmed || trimmed === '00000000') return '        ';
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.substring(0, 10).replace(/-/g, '');
    }
    if (/^\d{8}$/.test(trimmed)) {
      return trimmed;
    }
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '        ';
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Obtiene el código oficial de localidad / jurisdicción de ARCA (Tabla T04) de 2 caracteres numéricos ('01' a '24').
 * Prohíbe terminantemente el uso de '00' para evitar el rechazo oficial 'codigo de localidad invalido'.
 */
export function getArcaLocalityCode(province, city) {
  const norm = (str) =>
    (str || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();

  const prov = norm(province);
  const cty = norm(city);

  if (prov.includes('CIUDAD AUTONOMA') || prov.includes('CABA') || prov.includes('CAPITAL FEDERAL') || cty === 'CABA') {
    return '01';
  }
  if (
    prov.includes('BUENOS AIRES') ||
    prov === 'BS AS' ||
    prov === 'PBA' ||
    prov.includes('BSAS') ||
    cty.includes('LOMAS DEL MIRADOR') ||
    cty.includes('LA MATANZA') ||
    cty.includes('SAN JUSTO') ||
    cty.includes('VILLA LUZURIAGA') ||
    cty.includes('RAMOS MEJIA') ||
    cty.includes('MORON') ||
    cty.includes('QUILMES') ||
    cty.includes('LA PLATA')
  ) {
    return '02';
  }
  if (prov.includes('CATAMARCA')) return '03';
  if (prov.includes('CORDOBA')) return '04';
  if (prov.includes('CORRIENTES')) return '05';
  if (prov.includes('CHACO')) return '06';
  if (prov.includes('CHUBUT')) return '07';
  if (prov.includes('ENTRE RIOS')) return '08';
  if (prov.includes('FORMOSA')) return '09';
  if (prov.includes('JUJUY')) return '10';
  if (prov.includes('LA PAMPA')) return '11';
  if (prov.includes('LA RIOJA')) return '12';
  if (prov.includes('MENDOZA')) return '13';
  if (prov.includes('MISIONES')) return '14';
  if (prov.includes('NEUQUEN')) return '15';
  if (prov.includes('RIO NEGRO')) return '16';
  if (prov.includes('SALTA')) return '17';
  if (prov.includes('SAN JUAN')) return '18';
  if (prov.includes('SAN LUIS')) return '19';
  if (prov.includes('SANTA CRUZ')) return '20';
  if (prov.includes('SANTA FE')) return '21';
  if (prov.includes('SANTIAGO DEL ESTERO')) return '22';
  if (prov.includes('TUCUMAN')) return '23';
  if (prov.includes('TIERRA DEL FUEGO') || prov.includes('ANTARTIDA')) return '24';

  // Fallback seguro: '02' (Provincia de Buenos Aires) o '01' si CABA, nunca '00'
  return '02';
}

/**
 * Calcula el importe máximo permitido a detraer conforme a la Ley 27.430, sustituida por Ley 27.541
 * y reglamentada por el Art. 4 del Decreto 99/2019:
 * - Para contratos a tiempo completo: hasta $7.003,68 mensuales (o detractionBase configurada).
 * - Para contratos a tiempo parcial (Art. 92 TER LCT, Modalidad 002, jornada reducida < 100%):
 *   la detracción se proporciona estrictamente en función de las horas pactadas.
 *   Para una jornada de 2/3 (67% = 32 hs semanales), el tope legal es exactamente $4.692,47 ($7.003,68 * 0.67).
 * - Para períodos con días trabajados inferiores a 30 (en liquidaciones ordinarias proporcionales):
 *   se proporciona en función de (días_trabajados / 30).
 * - No puede exceder la Base Imponible 2 (SIPA Contribuciones).
 */
export function calculateMaxAllowedDetraction({
  detractionBase = 7003.68,
  isPartTime = false,
  partTimePercentage = 100,
  contractModality = '001',
  workedDays = 30,
  isVacationPeriod = false,
  bi2 = Infinity,
} = {}) {
  const base = Number(detractionBase) || 7003.68;
  const modStr = String(contractModality || '').trim();
  const isPartTimeModality = modStr === '002' || modStr === '2';
  const rawPct = partTimePercentage !== undefined && partTimePercentage !== null && String(partTimePercentage).trim() !== ''
    ? Number(partTimePercentage)
    : 100;
  const isPt = Boolean(isPartTime || isPartTimeModality || (rawPct > 0 && rawPct < 100));

  let ptRatio = 1.0;
  if (isPt) {
    if (rawPct > 0 && rawPct < 100) {
      ptRatio = rawPct / 100;
    } else if (isPartTimeModality) {
      ptRatio = 0.67; // 2/3 de jornada máxima LCT Art. 92 TER -> 4.692,47
    }
  }

  // 1. Proporcional a la jornada reducida
  let detraction = Math.round(base * ptRatio * 100) / 100;

  // 2. Proporcional a días trabajados si son menos de 30 y no es período exclusivo de vacaciones
  const days = Number(workedDays) || 0;
  if (days > 0 && days < 30 && !isVacationPeriod) {
    detraction = Math.round(detraction * (days / 30) * 100) / 100;
  }

  // 3. No puede superar Base 2 ni ser negativa
  if (bi2 !== undefined && bi2 !== null && bi2 !== Infinity) {
    detraction = Math.min(detraction, Math.max(0, Number(bi2)));
  }

  return Math.max(0, Math.round(detraction * 100) / 100);
}

/**
 * Genera el Archivo 1: Parametrización de Conceptos (195 caracteres fijos por línea).
 */
export function generateLsdConceptsFile(concepts) {
  const lines = [];
  const exportableConcepts = concepts.filter((c) => c.type !== 'AUXILIARY');

  for (const c of exportableConcepts) {
    const isDeduction = c.type === 'DEDUCTION';

    // Regla de negocio ARCA:
    // Descuentos (810000 a 829999): subsistemas pos. 168-186 deben ser estrictamente '0'
    const sipaAporte = isDeduction ? '0' : formatBoolNum(c.appliesSipaAporte);
    const sipaContrib = isDeduction ? '0' : formatBoolNum(c.appliesSipaContrib);
    const inssjypAporte = isDeduction ? '0' : formatBoolNum(c.appliesInssjypAporte);
    const inssjypContrib = isDeduction ? '0' : formatBoolNum(c.appliesInssjypContrib);
    const osAporte = isDeduction ? '0' : formatBoolNum(c.appliesOsAporte);
    const osContrib = isDeduction ? '0' : formatBoolNum(c.appliesOsContrib);
    const fsrAporte = isDeduction ? '0' : formatBoolNum(c.appliesFsrAporte);
    const fsrContrib = isDeduction ? '0' : formatBoolNum(c.appliesFsrContrib);
    const renatreAporte = isDeduction ? '0' : formatBoolNum(c.appliesRenatreAporte);
    const renatreContrib = isDeduction ? '0' : formatBoolNum(c.appliesRenatreContrib);
    const aaffContrib = isDeduction ? '0' : formatBoolNum(c.appliesAaffContrib);
    const fneContrib = isDeduction ? '0' : formatBoolNum(c.appliesFneContrib);
    const lrtContrib = isDeduction ? '0' : formatBoolNum(c.appliesLrtContrib);
    const regDifAporte = isDeduction ? '0' : formatBoolNum(c.appliesRegDifAporte);
    const regEspAporte = isDeduction ? '0' : formatBoolNum(c.appliesRegEspAporte);

    const line =
      formatAlpha(c.arcaConceptCode || (isDeduction ? '810000' : '110000'), 6) + // 1-6
      formatAlpha(c.code, 10) + // 7-16
      formatAlpha(c.name, 150) + // 17-166
      formatBoolNum(c.isRepeatable) + // 167
      sipaAporte + // 168
      sipaContrib + // 169
      inssjypAporte + // 170
      inssjypContrib + // 171
      osAporte + // 172
      osContrib + // 173
      fsrAporte + // 174
      fsrContrib + // 175
      renatreAporte + // 176
      renatreContrib + // 177
      ' ' + // 178 Libre
      aaffContrib + // 179
      ' ' + // 180 Libre
      fneContrib + // 181
      ' ' + // 182 Libre
      lrtContrib + // 183
      regDifAporte + // 184 Regímenes Diferenciales Aportes
      ' ' + // 185 Libre
      regEspAporte + // 186 Regímenes Especiales Aportes
      '         '; // 187-195 Libres (9 espacios)

    if (line.length !== 195) {
      throw new Error(`Error interno: línea de concepto "${c.code}" tiene ${line.length} caracteres (requerido: 195)`);
    }

    lines.push(line);
  }

  return lines.join('\r\n');
}

/**
 * Genera el Archivo 2: Importación de Liquidaciones de Haberes (longitudes fijas ARCA: 01=35, 02=115, 03=51, 04=370).
 */
export function generateLsdPayrollFile({ company, period, paySlips, payrollSettings = {} }) {
  const lines = [];
  const cuitClean = (company?.cuit || '').replace(/\D/g, '');

  const count04 = paySlips.length;
  const periodoAaaamm = `${period.year}${String(period.month).padStart(2, '0')}`;
  const settlementNum = formatNumeric(period.settlementNumber || 1, 5);
  const settlementType = (period.settlementType || 'M').toUpperCase();

  // --- REGISTRO 01: CABECERA DEL ENVÍO ---
  let reg01 =
    '01' + // 1-2
    formatNumeric(cuitClean, 11) + // 3-13
    'SJ' + // 14-15 (Liquidación + F.931)
    periodoAaaamm + // 16-21
    settlementType + // 22 (M / Q)
    settlementNum + // 23-27
    '30' + // 28-29 Días Base fijo 30
    formatNumeric(count04, 6); // 30-35 Cantidad de Registros 04

  if (reg01.length !== 35) throw new Error(`Registro 01 longitud inválida: ${reg01.length} (esperado 35)`);
  lines.push(reg01);

  // --- BLOQUE POR CADA EMPLEADO ---
  for (const slip of paySlips) {
    const emp = slip.employee;
    const cuilClean = (emp.cuil || '').replace(/\D/g, '');
    const basis = slip.basis || {};

    // REGISTRO 02: DATOS REFERENCIALES DEL TRABAJADOR
    const formaPago = slip.paymentMethod === 'CBU' ? '3' : (slip.paymentMethod === 'CHEQUE' ? '2' : '1');
    const cbuClean = (emp.cbu || slip.cbu || '').replace(/\D/g, '');
    const fallbackPaymentDate = slip.paymentDate || period.paymentDate || period.liquidationDate || (period.year && period.month ? new Date(period.year, period.month, 0) : new Date());
    const paymentDateStr = formatDate(fallbackPaymentDate);
    const rubricDateStr = formatRubricDate(period.rubricDate);

    const isVacationPeriod = period?.periodType === 'VACATIONS' || period?.periodType === 'VACACIONES';
    const reg02Days = isVacationPeriod ? 0 : (slip.workedDays !== undefined && slip.workedDays !== null ? slip.workedDays : 30);

    let reg02 =
      '02' + // 1-2
      formatNumeric(cuilClean, 11) + // 3-13
      formatAlpha(emp.fileNumber, 10) + // 14-23
      formatAlpha(emp.department?.name || 'ADMINISTRACION', 50) + // 24-73
      formatAlpha(cbuClean, 22) + // 74-95
      formatNumeric(reg02Days, 3) + // 96-98 Días tope (000 en vacaciones)
      paymentDateStr + // 99-106
      rubricDateStr + // 107-114
      formaPago; // 115

    if (reg02.length !== 115) throw new Error(`Registro 02 [Legajo ${emp.fileNumber}] longitud inválida: ${reg02.length} (esperado 115)`);
    lines.push(reg02);

    // REGISTROS 03: DETALLE DE CONCEPTOS LIQUIDADOS
    const items = slip.items || [];
    for (const item of items) {
      if (item.type === 'EMPLOYER_CONTRIBUTION' || item.type === 'AUXILIARY') continue; // Las contribuciones patronales van en 04, y los auxiliares son de cálculo interno

      const isDeduction = item.type === 'DEDUCTION';
      const numAmount = Number(item.amount) || 0;
      let indicator = isDeduction ? 'D' : 'C';
      if (!isDeduction && numAmount < 0) {
        indicator = 'D'; // Haberes negativos debitan
      } else if (isDeduction && numAmount < 0) {
        indicator = 'C'; // Deducciones negativas acreditan
      }

      // Unidades: si es SAC proporcional 120003, en cantidad van los días; por defecto cantidad formateada
      let cantidadStr = '00000';
      if (item.units !== undefined && item.units !== null) {
        // 3 enteros + 2 decimales implícitos (ej. 30 -> 03000)
        cantidadStr = formatMoney(item.units, 5);
      }

      let reg03 =
        '03' + // 1-2
        formatNumeric(cuilClean, 11) + // 3-13
        formatAlpha(item.conceptCode, 10) + // 14-23
        cantidadStr + // 24-28
        (item.unitLabel === '%' ? '%' : '$') + // 29
        formatMoney(item.amount, 15) + // 30-44 Importe
        indicator + // 45 Indicador Débito / Crédito
        '000000'; // 46-51 Período ajuste retroactivo

      if (reg03.length !== 51) throw new Error(`Registro 03 [Concepto ${item.conceptCode}] longitud inválida: ${reg03.length} (esperado 51)`);
      lines.push(reg03);
    }

    // REGISTRO 04: ATRIBUTOS LABORALES Y BASES IMPONIBLES (F.931)
    const osCode = emp.healthInsurance?.code ? emp.healthInsurance.code.replace(/\D/g, '') : '126205';

    // Días y Horas trabajadas (excluyentes según especificación ARCA LSD Registro 04):
    // No se puede informar cantidad de días (> 0) y cantidad de horas (> 0) simultáneamente.
    const isHourly = ['HORAS', 'POR_HORA', 'HORARIO'].includes(String(emp.payrollGroup || '').toUpperCase().trim());
    const rawDays = slip.workedDays !== undefined && slip.workedDays !== null ? Number(slip.workedDays) : 30;
    const rawHours = Number(slip.workedHours || 0);

    let reg04Days = 0;
    let reg04Hours = 0;

    if (isHourly) {
      reg04Days = 0;
      reg04Hours = Math.max(0, Math.round(rawHours));
    } else {
      reg04Days = Math.min(Math.max(0, Math.round(rawDays)), 30);
      reg04Hours = 0;
    }

    const locCode = getArcaLocalityCode(emp.province || company?.province, emp.city || company?.city);

    const detractionBase = Number(payrollSettings?.detractionBase || 7003.68);
    const maxAllowedDetr = calculateMaxAllowedDetraction({
      detractionBase,
      isPartTime: emp.isPartTime,
      partTimePercentage: emp.partTimePercentage,
      contractModality: basis.contractModality,
      workedDays: reg04Days,
      isVacationPeriod: period?.periodType === 'VACATIONS',
      bi2: basis.baseImponible2,
    });
    const actualDetraction = Math.min(
      basis.detractionAmount !== undefined && basis.detractionAmount !== null ? Number(basis.detractionAmount) : maxAllowedDetr,
      maxAllowedDetr
    );
    const actualBi10 = Math.max(0, Math.round(((Number(basis.baseImponible2) || 0) - actualDetraction) * 100) / 100);

    let reg04 =
      '04' + // 1-2
      formatNumeric(cuilClean, 11) + // 3-13
      formatBoolNum(basis.hasSpouse) + // 14 Cónyuge
      formatNumeric(basis.childrenCount || 0, 2) + // 15-16 Hijos
      formatBoolNum(basis.hasCct) + // 17 CCT
      formatBoolNum(basis.hasScvo) + // 18 SCVO
      '0' + // 19 Reducción
      '1' + // 20 Tipo Empleador (1 = Privado / Ley 27.541)
      '0' + // 21 Tipo Operación
      formatAlpha(basis.situationCode || '01', 2) + // 22-23
      formatAlpha(basis.conditionCode || '01', 2) + // 24-25
      formatAlpha(basis.activityCode || '049', 3) + // 26-28
      formatAlpha(basis.contractModality ? String(basis.contractModality).padStart(3, '0') : '001', 3) + // 29-31
      '00' + // 32-33 Siniestrado
      formatAlpha(locCode, 2) + // 34-35 Localidad (Tabla T04: 01 a 24, nunca 00)
      formatAlpha(basis.situationCode || '01', 2) + // 36-37 Sit 1
      '01' + // 38-39 Día inicio 1
      '00' + // 40-41 Sit 2
      '00' + // 42-43 Día 2
      '00' + // 44-45 Sit 3
      '00' + // 46-47 Día 3
      formatNumeric(reg04Days, 2) + // 48-49 Días trabajados (excluyente con horas)
      formatNumeric(reg04Hours, 3) + // 50-52 Horas (excluyente con días)
      '00000' + // 53-57 Adicional SS
      '00000' + // 58-62 Contribución Dif
      formatAlpha(osCode, 6) + // 63-68 Código OS
      formatNumeric(basis.adherentsCount || emp.adherentsCount || 0, 2) + // 69-70 Adherentes OS
      formatMoney(0, 15) + // 71-85 Aporte Adic OS
      formatMoney(0, 15) + // 86-100 Contrib Adic OS
      formatMoney(basis.baseDifAporteOs || 0, 15) + // 101-115 Base Dif OS
      formatMoney(basis.baseDifContribOs || 0, 15) + // 116-130 Base Dif Contrib OS
      formatMoney(basis.baseDifLrt || 0, 15) + // 131-145 Base Dif LRT
      formatMoney(0, 15) + // 146-160 Maternidad
      formatMoney(slip.grossSalary, 15) + // 161-175 Remuneración Bruta Total
      formatMoney(basis.baseImponible1, 15) + // 176-190 BI 1 (SIPA Aportes)
      formatMoney(basis.baseImponible2, 15) + // 191-205 BI 2 (SIPA Contribuciones)
      formatMoney(basis.baseImponible3, 15) + // 206-220 BI 3 (INSSJyP Contribuciones)
      formatMoney(basis.baseImponible4, 15) + // 221-235 BI 4 (OS Aportes/Contrib)
      formatMoney(basis.baseImponible5, 15) + // 236-250 BI 5 (INSSJyP Aportes)
      formatMoney(basis.baseImponible6 || 0, 15) + // 251-265 BI 6
      formatMoney(basis.baseImponible7 || 0, 15) + // 266-280 BI 7
      formatMoney(basis.baseImponible8 || basis.baseImponible4, 15) + // 281-295 BI 8 (FSR)
      formatMoney(basis.baseImponible9, 15) + // 296-310 BI 9 (LRT)
      formatMoney(0, 15) + // 311-325 Base Dif SS
      formatMoney(0, 15) + // 326-340 Base Dif Contrib SS
      formatMoney(actualBi10, 15) + // 341-355 BI 10 (SIPA con Detracción)
      formatMoney(actualDetraction, 15); // 356-370 Detracción Ley 27.541

    if (reg04.length !== 370) throw new Error(`Registro 04 [Legajo ${emp.fileNumber}] longitud inválida: ${reg04.length} (esperado 370)`);
    lines.push(reg04);
  }

  return lines.join('\r\n');
}

/**
 * Validador de consistencia matemática y técnica antes de exportar a ARCA.
 */
export function validateLsdConsistency({ paySlips, payrollSettings = {}, company = {}, settlements = [] }) {
  const issues = [];
  const detractionBase = Number(payrollSettings?.detractionBase || 7003.68);

  for (const slip of paySlips) {
    const emp = slip.employee || {};
    const basis = slip.basis || {};
    const legajo = emp.fileNumber || '-';
    const cuil = emp.cuil || '-';
    const cuilClean = cuil.replace(/\D/g, '');

    // 0. Control de formato de CUIL (11 dígitos numéricos sin guiones)
    if (!cuilClean || cuilClean.length !== 11) {
      issues.push({
        legajo,
        cuil,
        type: 'ERROR_CUIL_INVALIDO',
        message: `El CUIL "${cuil}" no cumple con el formato requerido por ARCA (11 dígitos numéricos sin guiones).`,
      });
    }

    // 1. Control de Localidad / Jurisdicción oficial ARCA (Tabla T04)
    const locCode = getArcaLocalityCode(emp.province || company?.province, emp.city || company?.city);
    if (!locCode || locCode === '00' || !/^(0[1-9]|1[0-9]|2[0-4])$/.test(locCode)) {
      issues.push({
        legajo,
        cuil,
        type: 'ERROR_LOCALIDAD_INVALIDA',
        message: `Código de localidad "${locCode}" inválido. ARCA requiere código numérico de 2 dígitos entre '01' y '24' (Tabla T04).`,
      });
    }

    // 2. Remunerativos sumados vs Remuneración Bruta declarada en Registro 04
    const items = slip.items || [];
    const sumRemun = items
      .filter((i) => i.type === 'REMUNERATIVE')
      .reduce((acc, i) => acc + Number(i.amount || 0), 0);

    const sumNoRemun = items
      .filter((i) => i.type === 'NON_REMUNERATIVE')
      .reduce((acc, i) => acc + Number(i.amount || 0), 0);

    const calcBruto = Math.round((sumRemun + sumNoRemun) * 100) / 100;
    const slipBruto = Math.round(Number(slip.grossSalary || 0) * 100) / 100;

    if (Math.abs(calcBruto - slipBruto) > 0.01) {
      issues.push({
        legajo,
        cuil,
        type: 'ERROR_BRUTO',
        message: `Discrepancia en Bruto: Suma de conceptos ($${calcBruto}) != Bruto declarado en recibo ($${slipBruto})`,
      });
    }

    // 3. Control de Tope de Detracción (Ley 27.430 / Ley 27.541 / Dec. 99/2019)
    const workedDaysVal = Number(slip.workedDays !== undefined && slip.workedDays !== null ? slip.workedDays : 30);
    const maxAllowedDetr = calculateMaxAllowedDetraction({
      detractionBase,
      isPartTime: emp.isPartTime,
      partTimePercentage: emp.partTimePercentage,
      contractModality: basis.contractModality,
      workedDays: workedDaysVal,
      isVacationPeriod: slip.payrollPeriod?.periodType === 'VACATIONS',
      bi2: basis.baseImponible2,
    });

    if (basis.detractionAmount !== undefined && basis.detractionAmount !== null) {
      const reportedDetraction = Math.round(Number(basis.detractionAmount) * 100) / 100;
      if (reportedDetraction > maxAllowedDetr + 0.05) {
        issues.push({
          legajo,
          cuil,
          type: 'ERROR_DETRACCION_EXCEDIDA',
          message: `El importe a detraer ($${reportedDetraction.toFixed(2)}) supera el tope máximo legal permitido ($${maxAllowedDetr.toFixed(2)}) establecido por la Ley 27.430 / Ley 27.541 para su modalidad contractual y jornada reducida.`,
        });
      }
    }

    // 4. Control de Consistencia de Base Imponible 10 (BI 10 = BI 2 - Detracción)
    if (basis.baseImponible2 !== undefined && basis.baseImponible2 !== null) {
      const bi2Val = Number(basis.baseImponible2 || 0);
      const detrVal = Number(basis.detractionAmount || 0);
      const expectedBi10 = Math.max(0, Math.round((bi2Val - detrVal) * 100) / 100);
      const actualBi10 = Math.round(Number(basis.baseImponible10 || 0) * 100) / 100;

      if (Math.abs(expectedBi10 - actualBi10) > 0.05) {
        issues.push({
          legajo,
          cuil,
          type: 'ERROR_BASE_IMPONIBLE_10',
          message: `Discrepancia en Base Imponible 10: La BI 10 declarada ($${actualBi10.toFixed(2)}) difiere de la calculada ($${expectedBi10.toFixed(2)}) a partir de Base Imponible 2 ($${bi2Val.toFixed(2)}) menos la detracción ($${detrVal.toFixed(2)}).`,
        });
      }
    }

    // 5. Comprobar alícuotas de aportes de ley (11% SIPA, 3% PAMI, 3% OS)
    const sipaItem = items.find((i) => i.conceptCode === '8000' || i.conceptCode === '6001' || i.conceptCode === 'SU6001' || i.arcaConceptCode === '810000' || /jubilac|sipa/i.test(i.conceptName || ''));
    if (sipaItem && basis.baseImponible1) {
      const expectedSipa = Math.round(Number(basis.baseImponible1) * 0.11 * 100) / 100;
      const actualSipa = Math.round(Number(sipaItem.amount) * 100) / 100;
      if (Math.abs(expectedSipa - actualSipa) > 0.05) {
        issues.push({
          legajo,
          cuil,
          type: 'ERROR_ALICUOTA_SIPA',
          message: `Aporte SIPA ($${actualSipa.toFixed(2)}) no concuerda con 11% de BI 1 ($${expectedSipa.toFixed(2)})`,
        });
      }
    }

    // INSSJyP / PAMI (3% sobre BI 5)
    const inssjypItem = items.find((i) => i.conceptCode === '8001' || i.conceptCode === '6002' || i.conceptCode === 'SU6002' || i.arcaConceptCode === '810001' || /inssjyp|pami|ley 19\.032/i.test(i.conceptName || ''));
    if (inssjypItem && (basis.baseImponible5 || basis.baseImponible1)) {
      const bi5Val = Number(basis.baseImponible5 || basis.baseImponible1);
      const expectedInssjyp = Math.round(bi5Val * 0.03 * 100) / 100;
      const actualInssjyp = Math.round(Number(inssjypItem.amount) * 100) / 100;
      if (Math.abs(expectedInssjyp - actualInssjyp) > 0.05) {
        issues.push({
          legajo,
          cuil,
          type: 'ERROR_ALICUOTA_INSSJYP',
          message: `Aporte INSSJyP/PAMI ($${actualInssjyp.toFixed(2)}) no concuerda con 3% de BI 5 ($${expectedInssjyp.toFixed(2)})`,
        });
      }
    }

    // Obra Social Titular (ARCA 810002) y Adherentes (ARCA 810009)
    if (basis.baseImponible4) {
      const baseOsTotal = Number(basis.baseImponible4) + Number(basis.baseDifAporteOs || 0);

      // Obra Social Titular (3%)
      const osTitularItems = items.filter((i) => String(i.arcaConceptCode || '').trim() === '810002');
      if (osTitularItems.length > 0) {
        const expectedOsTitular = Math.round(baseOsTotal * 0.03 * 100) / 100;
        const actualOsTitular = Math.round(osTitularItems.reduce((acc, i) => acc + Number(i.amount || 0), 0) * 100) / 100;
        if (Math.abs(expectedOsTitular - actualOsTitular) > 0.05) {
          issues.push({
            legajo,
            cuil,
            type: 'ERROR_DISCREPANCIA_OBRA_SOCIAL_TITULAR',
            message: `Discrepancia en retención Obra Social Titular (ARCA 810002): Descontado ($${actualOsTitular.toFixed(2)}) difiere del 3% legal ($${expectedOsTitular.toFixed(2)}) sobre Base Imponible 4 + Base Dif ($${baseOsTotal.toFixed(2)}).`,
          });
        }
      }

      // Obra Social Adherentes (1.5% por cada adherente registrado s/Ley 23.660)
      const osAdherenteItems = items.filter((i) => String(i.arcaConceptCode || '').trim() === '810009');
      if (osAdherenteItems.length > 0) {
        const actualOsAdherentes = Math.round(osAdherenteItems.reduce((acc, i) => acc + Number(i.amount || 0), 0) * 100) / 100;
        const adherentsCount = Number(
          basis.adherentsCount !== undefined
            ? basis.adherentsCount
            : (emp.relatives?.filter((r) => r.isAdherent && !r.deletedAt).length || 0)
        );

        if (adherentsCount === 0) {
          issues.push({
            legajo,
            cuil,
            type: 'ERROR_ADHERENTES_SIN_REGISTRAR',
            message: `Se liquidó retención por Adherente OS (código ARCA 810009) por $${actualOsAdherentes.toFixed(2)} pero el legajo tiene 0 familiares adherentes registrados conforme a Ley 23.660.`,
          });
        } else {
          const expectedOsAdherentes = Math.round(baseOsTotal * 0.015 * adherentsCount * 100) / 100;
          if (Math.abs(expectedOsAdherentes - actualOsAdherentes) > 0.05) {
            issues.push({
              legajo,
              cuil,
              type: 'ERROR_DISCREPANCIA_OBRA_SOCIAL_ADHERENTES',
              message: `Discrepancia en retención Obra Social Adherentes (ARCA 810009): Descontado ($${actualOsAdherentes.toFixed(2)}) difiere del 1.5% legal por adherente ($${expectedOsAdherentes.toFixed(2)} para ${adherentsCount} adherente/s) sobre Base Imponible 4 + Base Dif ($${baseOsTotal.toFixed(2)}).`,
            });
          }
        }
      }
    }
  }

  // 6. Advertencia de Multi-Liquidación / Liquidaciones intermedias
  if (settlements && settlements.length > 1) {
    issues.push({
      legajo: 'TODOS',
      cuil: 'TODOS',
      type: 'ADVERTENCIA_MULTI_LIQUIDACION',
      message: `El mes posee ${settlements.length} liquidaciones registradas. ARCA acumula automáticamente los conceptos de todas las liquidaciones del mes. Se recomienda validar y exportar la "Liquidación Mensual Unificada" para garantizar el cuadre de topes y bases imponibles del F.931.`,
    });
  }

  const errors = issues.filter((i) => i.type.startsWith('ERROR'));
  const warnings = issues.filter((i) => i.type.startsWith('ADVERTENCIA') || i.type.startsWith('WARN'));

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    issues,
  };
}

/**
 * Genera el Archivo Unificado Mensual del Libro de Sueldos Digital (longitudes fijas ARCA: 01=35, 02=115, 03=51, 04=370).
 * Consolida todas las liquidaciones del mes calendario (Mensual, Quincenas, SAC, Vacaciones, etc.):
 * - 1 solo Registro 01 para todo el mes (35 chars: Tipo 'M', Número '00001', Días base 30, conteo exacto de 04s).
 * - 1 Registro 02 por trabajador (115 chars: con la fecha de pago de la liquidación más reciente).
 * - Múltiples Registros 03 concatenando todos los conceptos de todas las liquidaciones del mes (51 chars c/u).
 * - 1 solo Registro 04 por trabajador con las Bases Imponibles 1 a 10 consolidadas y topadas (370 chars).
 */
export function generateMonthlyLsdPayrollFile({ company, year, month, period, settlements = [], paySlips = [], payrollSettings = {} }) {
  const lines = [];
  const cuitClean = (company.cuit || '').replace(/\D/g, '');

  const validSlips = paySlips.filter((s) => !s.deletedAt);

  // Agrupar recibos del mes por empleado
  const slipsByEmp = new Map();
  for (const s of validSlips) {
    if (!slipsByEmp.has(s.employeeId)) {
      slipsByEmp.set(s.employeeId, []);
    }
    slipsByEmp.get(s.employeeId).push(s);
  }

  const actualYear = year || period?.year || validSlips[0]?.payrollPeriod?.year || new Date().getFullYear();
  const actualMonth = month || period?.month || validSlips[0]?.payrollPeriod?.month || 1;

  const uniqueEmployeesCount = slipsByEmp.size;
  const periodoAaaamm = `${actualYear}${String(actualMonth).padStart(2, '0')}`;

  // --- REGISTRO 01: CABECERA UNIFICADA MENSUAL ---
  let reg01 =
    '01' + // 1-2
    formatNumeric(cuitClean, 11) + // 3-13
    'SJ' + // 14-15 (Liquidación + F.931)
    periodoAaaamm + // 16-21
    'M' + // 22 Fijo 'M' para unificado mensual
    '00001' + // 23-27 Liquidación número 00001
    '30' + // 28-29 Días Base fijo 30
    formatNumeric(uniqueEmployeesCount, 6); // 30-35 Cantidad de Registros 04

  if (reg01.length !== 35) throw new Error(`Registro 01 longitud inválida: ${reg01.length} (esperado 35)`);
  lines.push(reg01);

  const minCap = Number(payrollSettings.ansesMinCap || 82287.12);
  const maxCap = Number(payrollSettings.ansesMaxCap || 2674292.72);
  const detractionBase = Number(payrollSettings.detractionBase || 7003.68);

  // --- BLOQUE POR CADA EMPLEADO CONSOLIDADO ---
  for (const [empId, empSlips] of slipsByEmp.entries()) {
    const emp = empSlips[0].employee || {};
    const cuilClean = (emp.cuil || '').replace(/\D/g, '');

    // Días trabajados y horas acumuladas en el mes
    const cumulativeWorkedDays = empSlips.reduce((sum, s) => sum + (Number(s.workedDays) || 0), 0);
    const cumulativeWorkedHours = empSlips.reduce((sum, s) => sum + (Number(s.workedHours) || 0), 0);

    // Fecha de Pago en Registro 02: Por directiva, la fecha de la liquidación más reciente
    const paymentDates = empSlips
      .map((s) => s.paymentDate || s.payrollPeriod?.paymentDate || s.payrollPeriod?.liquidationDate)
      .filter(Boolean)
      .map((d) => new Date(d).getTime())
      .filter((t) => !isNaN(t));

    const latestPaymentDate = paymentDates.length > 0
      ? new Date(Math.max(...paymentDates))
      : new Date(year, month, 0);

    // Fecha de rúbrica más reciente
    const rubricDates = empSlips
      .map((s) => s.payrollPeriod?.rubricDate)
      .filter(Boolean)
      .map((d) => new Date(d).getTime())
      .filter((t) => !isNaN(t));

    const latestRubricDate = rubricDates.length > 0 ? new Date(Math.max(...rubricDates)) : null;

    // Forma de pago y CBU del empleado
    const latestSlip = empSlips[empSlips.length - 1];
    const cbuClean = (emp.cbu || latestSlip.cbu || '').replace(/\D/g, '');
    const formaPago = (latestSlip.paymentMethod === 'CBU' || cbuClean.length >= 22) ? '3' : (latestSlip.paymentMethod === 'CHEQUE' ? '2' : '1');

    // REGISTRO 02: DATOS REFERENCIALES DEL TRABAJADOR
    let reg02 =
      '02' + // 1-2
      formatNumeric(cuilClean, 11) + // 3-13
      formatAlpha(emp.fileNumber, 10) + // 14-23
      formatAlpha(emp.department?.name || 'ADMINISTRACION', 50) + // 24-73
      formatAlpha(cbuClean, 22) + // 74-95
      formatNumeric(Math.min(cumulativeWorkedDays, 30), 3) + // 96-98 Días tope legal 30
      formatDate(latestPaymentDate) + // 99-106 Fecha de pago de la liquidación más reciente
      formatRubricDate(latestRubricDate) + // 107-114 Fecha de rúbrica (8 espacios si es nula/vacía)
      formaPago; // 115

    if (reg02.length !== 115) throw new Error(`Registro 02 [Legajo ${emp.fileNumber}] longitud inválida: ${reg02.length} (esperado 115)`);
    lines.push(reg02);

    // REGISTROS 03: DETALLE CONSOLIDADO DE TODOS LOS CONCEPTOS DEL MES
    for (const slip of empSlips) {
      const items = slip.items || [];
      for (const item of items) {
        if (item.type === 'EMPLOYER_CONTRIBUTION' || item.type === 'AUXILIARY') continue;

        const isDeduction = item.type === 'DEDUCTION';
        const numAmount = Number(item.amount) || 0;
        let indicator = isDeduction ? 'D' : 'C';
        if (!isDeduction && numAmount < 0) {
          indicator = 'D'; // Haberes negativos debitan
        } else if (isDeduction && numAmount < 0) {
          indicator = 'C'; // Descuentos negativos acreditan
        }

        let cantidadStr = '00000';
        if (item.units !== undefined && item.units !== null) {
          cantidadStr = formatMoney(item.units, 5);
        }

        let reg03 =
          '03' + // 1-2
          formatNumeric(cuilClean, 11) + // 3-13
          formatAlpha(item.conceptCode, 10) + // 14-23
          cantidadStr + // 24-28
          (item.unitLabel === '%' ? '%' : '$') + // 29
          formatMoney(item.amount, 15) + // 30-44 Importe
          indicator + // 45 Indicador Débito / Crédito
          '000000'; // 46-51 Período ajuste retroactivo

        if (reg03.length !== 51) throw new Error(`Registro 03 [Concepto ${item.conceptCode}] longitud inválida: ${reg03.length} (esperado 51)`);
        lines.push(reg03);
      }
    }

    // REGISTRO 04: ATRIBUTOS LABORALES Y BASES IMPONIBLES UNIFICADAS (F.931)
    const monthlyGross = Math.round(empSlips.reduce((sum, s) => sum + Number(s.grossSalary || 0), 0) * 100) / 100;
    const monthlyRemunerative = Math.round(empSlips.reduce((sum, s) => sum + Number(s.remunerativeSalary || 0), 0) * 100) / 100;

    const isIntern = Boolean(emp.salaryScale?.isInternOnly || emp.contractModalityCode === '027');
    const isDirector = Boolean(emp.salaryScale?.isDirectorOnly || emp.contractModalityCode === '099');

    // Tratamiento de tope vacacional independiente (ARCA LSD 4.2 C):
    const vacationDays = empSlips
      .filter((s) => s.payrollPeriod?.periodType === 'VACATIONS' || s.payrollPeriod?.settlementName?.toLowerCase().includes('vacac'))
      .reduce((sum, s) => sum + (Number(s.workedDays) || 0), 0);
    const vacationCap = vacationDays > 0 ? Math.round(((maxCap / 30) * vacationDays) * 100) / 100 : 0;
    const effectiveMaxCap = maxCap + vacationCap;

    let bi1 = 0.00;
    let bi2 = 0.00;
    let bi3 = 0.00;
    let bi4 = 0.00;
    let bi5 = 0.00;
    let bi6 = 0.00;
    let bi7 = 0.00;
    let bi8 = 0.00;
    let bi9 = 0.00;
    let bi10 = 0.00;
    let detractionAmount = 0.00;

    if (isIntern) {
      bi4 = Math.min(Math.max(monthlyRemunerative, minCap), effectiveMaxCap);
      bi8 = bi4;
      bi9 = monthlyGross;
    } else if (isDirector) {
      bi9 = monthlyGross;
    } else {
      if (monthlyRemunerative > 0) {
        bi1 = Math.min(Math.max(monthlyRemunerative, minCap), effectiveMaxCap);
        bi2 = Math.max(monthlyRemunerative, minCap);
        bi3 = bi2;
        bi4 = Math.min(Math.max(monthlyRemunerative, minCap), effectiveMaxCap);
        bi5 = bi1;
        bi8 = bi4;
        bi9 = monthlyGross;

        const latestBasisRef = empSlips[empSlips.length - 1].basis || {};
        const maxAllowedDetr = calculateMaxAllowedDetraction({
          detractionBase,
          isPartTime: emp.isPartTime,
          partTimePercentage: emp.partTimePercentage,
          contractModality: latestBasisRef.contractModality,
          workedDays: Math.min(Math.max(0, Math.round(cumulativeWorkedDays)), 30),
          bi2,
        });
        detractionAmount = maxAllowedDetr;
        bi10 = Math.max(0, Math.round((bi2 - detractionAmount) * 100) / 100);
      } else {
        bi9 = monthlyGross;
      }
    }

    const latestBasis = empSlips[empSlips.length - 1].basis || {};
    const osCode = emp.healthInsurance?.code ? emp.healthInsurance.code.replace(/\D/g, '') : '126205';

    let monthlyDifAporteOs = 0.00;
    let monthlyDifContribOs = 0.00;
    let monthlyDifLrt = 0.00;

    if (!isIntern && !isDirector) {
      monthlyDifAporteOs = Math.round(empSlips.reduce((sum, s) => sum + Number(s.basis?.baseDifAporteOs || 0), 0) * 100) / 100;
      monthlyDifContribOs = Math.round(empSlips.reduce((sum, s) => sum + Number(s.basis?.baseDifContribOs || 0), 0) * 100) / 100;
      monthlyDifLrt = Math.round(empSlips.reduce((sum, s) => sum + Number(s.basis?.baseDifLrt || 0), 0) * 100) / 100;

      // Fallback si no vinieron en basis pero el empleado es de jornada parcial
      if (monthlyDifAporteOs === 0 && (emp.isPartTime || (emp.partTimePercentage && Number(emp.partTimePercentage) < 100))) {
        const pct = Number(emp.partTimePercentage || emp.workShift?.percentage || 100);
        const coef = Math.round((pct / 100) * 10000) / 10000;
        if (coef > 0 && coef < 1 && bi4 > 0) {
          const fullTimeOs = Math.round((bi4 / coef) * 100) / 100;
          const diff = Math.max(0, Math.round((fullTimeOs - bi4) * 100) / 100);
          monthlyDifAporteOs = diff;
          monthlyDifContribOs = diff;
        }
      }
    }

    // Días y Horas trabajadas consolidadas (excluyentes según diseño oficial ARCA LSD Registro 04):
    // No se puede informar cantidad de días (> 0) y cantidad de horas (> 0) de manera simultánea.
    const isHourly = ['HORAS', 'POR_HORA', 'HORARIO'].includes(String(emp.payrollGroup || '').toUpperCase().trim());

    let reg04Days = 0;
    let reg04Hours = 0;

    if (isHourly) {
      reg04Days = 0;
      reg04Hours = Math.max(0, Math.round(cumulativeWorkedHours));
    } else {
      reg04Days = Math.min(Math.max(0, Math.round(cumulativeWorkedDays)), 30);
      reg04Hours = 0;
    }

    const locCode = getArcaLocalityCode(emp.province || company?.province, emp.city || company?.city);

    let reg04 =
      '04' + // 1-2
      formatNumeric(cuilClean, 11) + // 3-13
      formatBoolNum(latestBasis.hasSpouse) + // 14 Cónyuge
      formatNumeric(latestBasis.childrenCount || 0, 2) + // 15-16 Hijos
      formatBoolNum(latestBasis.hasCct) + // 17 CCT
      formatBoolNum(latestBasis.hasScvo !== false) + // 18 SCVO
      '0' + // 19 Reducción
      '1' + // 20 Tipo Empleador (1 = Privado / Ley 27.541)
      '0' + // 21 Tipo Operación
      formatAlpha(latestBasis.situationCode || '01', 2) + // 22-23
      formatAlpha(latestBasis.conditionCode || '01', 2) + // 24-25
      formatAlpha(latestBasis.activityCode || (isDirector ? '015' : '049'), 3) + // 26-28
      formatAlpha(latestBasis.contractModality ? String(latestBasis.contractModality).padStart(3, '0') : (isDirector ? '099' : (isIntern ? '027' : '001')), 3) + // 29-31
      '00' + // 32-33 Siniestrado
      formatAlpha(locCode, 2) + // 34-35 Localidad (Tabla T04: 01 a 24, nunca 00)
      formatAlpha(latestBasis.situationCode || '01', 2) + // 36-37 Sit 1
      '01' + // 38-39 Día inicio 1
      '00' + // 40-41 Sit 2
      '00' + // 42-43 Día 2
      '00' + // 44-45 Sit 3
      '00' + // 46-47 Día 3
      formatNumeric(reg04Days, 2) + // 48-49 Días trabajados (máx 30) (excluyente con horas)
      formatNumeric(reg04Hours, 3) + // 50-52 Horas (excluyente con días)
      '00000' + // 53-57 Adicional SS
      '00000' + // 58-62 Contribución Dif
      formatAlpha(osCode, 6) + // 63-68 Código OS
      formatNumeric(
        latestBasis.adherentsCount !== undefined
          ? latestBasis.adherentsCount
          : (emp.relatives?.filter((r) => r.isAdherent && !r.deletedAt).length || 0),
        2
      ) + // 69-70 Adherentes OS
      formatMoney(0, 15) + // 71-85 Aporte Adic OS
      formatMoney(0, 15) + // 86-100 Contrib Adic OS
      formatMoney(monthlyDifAporteOs, 15) + // 101-115 Base Dif OS
      formatMoney(monthlyDifContribOs, 15) + // 116-130 Base Dif Contrib OS
      formatMoney(monthlyDifLrt, 15) + // 131-145 Base Dif LRT
      formatMoney(0, 15) + // 146-160 Maternidad
      formatMoney(monthlyGross, 15) + // 161-175 Remuneración Bruta Total Consolidada
      formatMoney(bi1, 15) + // 176-190 BI 1 (SIPA Aportes)
      formatMoney(bi2, 15) + // 191-205 BI 2 (SIPA Contribuciones)
      formatMoney(bi3, 15) + // 206-220 BI 3 (INSSJyP Contribuciones)
      formatMoney(bi4, 15) + // 221-235 BI 4 (OS Aportes/Contrib)
      formatMoney(bi5, 15) + // 236-250 BI 5 (INSSJyP Aportes)
      formatMoney(bi6, 15) + // 251-265 BI 6
      formatMoney(bi7, 15) + // 266-280 BI 7
      formatMoney(bi8, 15) + // 281-295 BI 8 (FSR)
      formatMoney(bi9, 15) + // 296-310 BI 9 (LRT)
      formatMoney(0, 15) + // 311-325 Base Dif SS
      formatMoney(0, 15) + // 326-340 Base Dif Contrib SS
      formatMoney(bi10, 15) + // 341-355 BI 10 (SIPA con Detracción)
      formatMoney(detractionAmount, 15); // 356-370 Detracción Ley 27.541

    if (reg04.length !== 370) throw new Error(`Registro 04 [Legajo ${emp.fileNumber}] longitud inválida: ${reg04.length} (esperado 370)`);
    lines.push(reg04);
  }

  return lines.join('\r\n');
}

/**
 * Validador de consistencia ARCA a nivel de período mensual consolidado.
 * Audita cuadre matemático 03 vs 04, alícuotas previsionales (11%, 3%, 3%),
 * control de tope de 30 días acumulados, códigos de localidad ARCA y formato del archivo plano.
 */
export function validateMonthlyLsdConsistency({ year, month, period, settlements = [], paySlips = [], payrollSettings = {}, company = {} }) {
  const issues = [];
  const validSlips = paySlips.filter((s) => !s.deletedAt);

  const actualYear = year || period?.year || validSlips[0]?.payrollPeriod?.year || new Date().getFullYear();
  const actualMonth = month || period?.month || validSlips[0]?.payrollPeriod?.month || 1;

  const slipsByEmp = new Map();
  for (const s of validSlips) {
    if (!slipsByEmp.has(s.employeeId)) {
      slipsByEmp.set(s.employeeId, []);
    }
    slipsByEmp.get(s.employeeId).push(s);
  }

  const minCap = Number(payrollSettings.ansesMinCap || 82287.12);
  const maxCap = Number(payrollSettings.ansesMaxCap || 2674292.72);
  const detractionBase = Number(payrollSettings.detractionBase || 7003.68);

  let totalGrossAll = 0;
  let totalRemunAll = 0;

  for (const [empId, empSlips] of slipsByEmp.entries()) {
    const emp = empSlips[0].employee || {};
    const latestBasis = empSlips[empSlips.length - 1]?.basis || {};
    const legajo = emp.fileNumber || '-';
    const cuil = emp.cuil || '-';
    const cuilClean = cuil.replace(/\D/g, '');

    // 1. Control de CUIL
    if (!cuilClean || cuilClean.length !== 11) {
      issues.push({
        legajo,
        cuil,
        type: 'ERROR_CUIL_INVALIDO',
        message: `El CUIL "${cuil}" no cumple con el formato requerido por ARCA (11 dígitos numéricos sin guiones).`,
      });
    }

    // 1b. Control de Localidad / Jurisdicción oficial ARCA (Tabla T04)
    const locCode = getArcaLocalityCode(emp.province || company?.province, emp.city || company?.city);
    if (!locCode || locCode === '00' || !/^(0[1-9]|1[0-9]|2[0-4])$/.test(locCode)) {
      issues.push({
        legajo,
        cuil,
        type: 'ERROR_LOCALIDAD_INVALIDA',
        message: `Código de localidad "${locCode}" inválido. ARCA requiere código numérico de 2 dígitos entre '01' y '24' (Tabla T04).`,
      });
    }

    // 2. Control de Días Trabajados Acumulados (Definición del Usuario)
    const cumulativeWorkedDays = empSlips.reduce((sum, s) => sum + (Number(s.workedDays) || 0), 0);
    if (cumulativeWorkedDays > 30) {
      const breakdown = empSlips
        .map((s) => `${s.payrollPeriod?.settlementName || s.payrollPeriod?.periodType || 'Liq'}: ${s.workedDays ?? 0} días`)
        .join(', ');
      issues.push({
        legajo,
        cuil,
        type: 'ERROR_DIAS_BASE_EXCEDIDOS',
        message: `Días trabajados acumulados (${cumulativeWorkedDays} días) superan el tope máximo legal de 30 días base para el mes ${month}/${year}. Desglose: [${breakdown}]. Verifique que liquidaciones complementarias (como Liquidación Final o Vacaciones) tengan 0 días a proporcionar tope.`,
      });
    }

    // 3. Remuneración Bruta Total Consolidada vs Suma de Conceptos de todos los 03
    const monthlyGross = Math.round(empSlips.reduce((sum, s) => sum + Number(s.grossSalary || 0), 0) * 100) / 100;
    const monthlyRemunerative = Math.round(empSlips.reduce((sum, s) => sum + Number(s.remunerativeSalary || 0), 0) * 100) / 100;

    totalGrossAll += monthlyGross;
    totalRemunAll += monthlyRemunerative;

    let sumConceptsRemun = 0;
    let sumConceptsNoRemun = 0;
    let totalSipaDeduction = 0;
    let totalInssjypDeduction = 0;
    let totalOsTitularDeduction = 0;
    let totalOsAdherentesDeduction = 0;

    for (const slip of empSlips) {
      for (const item of (slip.items || [])) {
        if (item.type === 'EMPLOYER_CONTRIBUTION' || item.type === 'AUXILIARY') continue;
        const amt = Number(item.amount) || 0;

        if (item.type === 'REMUNERATIVE') {
          sumConceptsRemun += amt;
        } else if (item.type === 'NON_REMUNERATIVE') {
          sumConceptsNoRemun += amt;
        } else if (item.type === 'DEDUCTION') {
          const code = String(item.conceptCode || '');
          const arcaCode = String(item.arcaConceptCode || '').trim();
          const name = String(item.conceptName || '').toLowerCase();

          // SIPA (11%)
          if (code === '8000' || code === '6001' || code === 'SU6001' || arcaCode === '810000' || name.includes('jubilac') || name.includes('sipa')) {
            totalSipaDeduction += amt;
          }
          // INSSJyP / PAMI (3%)
          else if (code === '8001' || code === '6002' || code === 'SU6002' || arcaCode === '810001' || name.includes('inssjyp') || name.includes('pami') || name.includes('ley 19.032')) {
            totalInssjypDeduction += amt;
          }
          // Obra Social Titular (ARCA 810002)
          else if (arcaCode === '810002') {
            totalOsTitularDeduction += amt;
          }
          // Obra Social Adherentes (ARCA 810009)
          else if (arcaCode === '810009') {
            totalOsAdherentesDeduction += amt;
          }
        }
      }
    }

    const calcMonthlyGross = Math.round((sumConceptsRemun + sumConceptsNoRemun) * 100) / 100;
    if (Math.abs(calcMonthlyGross - monthlyGross) > 0.05) {
      issues.push({
        legajo,
        cuil,
        type: 'ERROR_BRUTO_CONSOLIDADO',
        message: `Discrepancia en Bruto Consolidado: Suma de conceptos en Registro 03 ($${calcMonthlyGross.toFixed(2)}) no coincide con el Bruto total del Registro 04 ($${monthlyGross.toFixed(2)}).`,
      });
    }

    // 3b. Control de Tope de Detracción (Ley 27.430 / Ley 27.541)
    const consolidatedDays = Math.min(Math.max(0, Math.round(cumulativeWorkedDays)), 30);
    const maxAllowedDetr = calculateMaxAllowedDetraction({
      detractionBase,
      isPartTime: emp.isPartTime,
      partTimePercentage: emp.partTimePercentage,
      contractModality: latestBasis.contractModality,
      workedDays: consolidatedDays,
      bi2: Math.max(monthlyRemunerative, minCap),
    });

    if (latestBasis.detractionAmount !== undefined && latestBasis.detractionAmount !== null) {
      const repDetr = Math.round(Number(latestBasis.detractionAmount) * 100) / 100;
      if (repDetr > maxAllowedDetr + 0.05) {
        issues.push({
          legajo,
          cuil,
          type: 'ERROR_DETRACCION_EXCEDIDA',
          message: `El importe a detraer ($${repDetr.toFixed(2)}) supera el tope máximo legal permitido ($${maxAllowedDetr.toFixed(2)}) establecido por la Ley 27.430 / Ley 27.541 para su jornada reducida y modalidad contractual.`,
        });
      }
    }

    // 3c. Control de Base Imponible 10
    if (latestBasis.baseImponible2 !== undefined && latestBasis.baseImponible2 !== null && latestBasis.detractionAmount !== undefined && latestBasis.detractionAmount !== null) {
      const bi2Val = Number(latestBasis.baseImponible2 || 0);
      const detrVal = Number(latestBasis.detractionAmount || 0);
      const expectedBi10 = Math.max(0, Math.round((bi2Val - detrVal) * 100) / 100);
      const actualBi10 = Math.round(Number(latestBasis.baseImponible10 || 0) * 100) / 100;
      if (Math.abs(expectedBi10 - actualBi10) > 0.05) {
        issues.push({
          legajo,
          cuil,
          type: 'ERROR_BASE_IMPONIBLE_10',
          message: `Discrepancia en Base Imponible 10: La BI 10 declarada ($${actualBi10.toFixed(2)}) difiere de la calculada ($${expectedBi10.toFixed(2)}) a partir de Base Imponible 2 ($${bi2Val.toFixed(2)}) menos la detracción ($${detrVal.toFixed(2)}).`,
        });
      }
    }

    // 4. Control de Aportes de Ley sobre Bases Imponibles Unificadas
    const isIntern = Boolean(emp.salaryScale?.isInternOnly || emp.contractModalityCode === '027');
    const isDirector = Boolean(emp.salaryScale?.isDirectorOnly || emp.contractModalityCode === '099');

    if (!isIntern && !isDirector && monthlyRemunerative > 0) {
      // Considerar tope vacacional si aplica
      const vacationDaysEmp = empSlips
        .filter((s) => s.payrollPeriod?.periodType === 'VACATIONS' || s.payrollPeriod?.settlementName?.toLowerCase().includes('vacac'))
        .reduce((sum, s) => sum + (Number(s.workedDays) || 0), 0);
      const vacationCapEmp = vacationDaysEmp > 0 ? Math.round(((maxCap / 30) * vacationDaysEmp) * 100) / 100 : 0;
      const effectiveMaxCapEmp = maxCap + vacationCapEmp;

      const bi1 = Math.min(Math.max(monthlyRemunerative, minCap), effectiveMaxCapEmp);
      const expectedSipa = Math.round(bi1 * 0.11 * 100) / 100;
      const expectedInssjyp = Math.round(bi1 * 0.03 * 100) / 100;

      // Para Obra Social: considerar Base Diferencial en jornada parcial (Art. 92 TER)
      let empDifAporteOs = Math.round(empSlips.reduce((sum, s) => sum + Number(s.basis?.baseDifAporteOs || 0), 0) * 100) / 100;
      if (empDifAporteOs === 0 && (emp.isPartTime || (emp.partTimePercentage && Number(emp.partTimePercentage) < 100))) {
        const pct = Number(emp.partTimePercentage || emp.workShift?.percentage || 100);
        const coef = Math.round((pct / 100) * 10000) / 10000;
        if (coef > 0 && coef < 1) {
          const fullTime = Math.round((bi1 / coef) * 100) / 100;
          empDifAporteOs = Math.max(0, Math.round((fullTime - bi1) * 100) / 100);
        }
      }
      const bi4Total = Math.min(Math.max(bi1 + empDifAporteOs, minCap), effectiveMaxCapEmp);
      const expectedOs = Math.round(bi4Total * 0.03 * 100) / 100;

      if (totalSipaDeduction > 0 && Math.abs(totalSipaDeduction - expectedSipa) > 0.10) {
        issues.push({
          legajo,
          cuil,
          type: 'ERROR_ALICUOTA_SIPA',
          message: `Retención acumulada SIPA ($${totalSipaDeduction.toFixed(2)}) difiere del 11% sobre Base Imponible 1 ($${expectedSipa.toFixed(2)}).`,
        });
      }

      if (totalInssjypDeduction > 0 && Math.abs(totalInssjypDeduction - expectedInssjyp) > 0.10) {
        issues.push({
          legajo,
          cuil,
          type: 'ERROR_ALICUOTA_INSSJYP',
          message: `Retención acumulada INSSJyP/PAMI ($${totalInssjypDeduction.toFixed(2)}) difiere del 3% sobre Base Imponible 5 ($${expectedInssjyp.toFixed(2)}).`,
        });
      }

      if (totalOsTitularDeduction > 0 && Math.abs(totalOsTitularDeduction - expectedOs) > 0.10) {
        issues.push({
          legajo,
          cuil,
          type: 'ERROR_DISCREPANCIA_OBRA_SOCIAL_TITULAR',
          message: `Retención acumulada Obra Social Titular (ARCA 810002) ($${totalOsTitularDeduction.toFixed(2)}) difiere del 3% legal ($${expectedOs.toFixed(2)}) sobre Base Imponible 4 + Base Dif ($${bi4Total.toFixed(2)}).`,
        });
      }

      // Control Adherentes OS (ARCA 810009)
      const empAdherentsCount = Number(
        latestBasis.adherentsCount !== undefined
          ? latestBasis.adherentsCount
          : (emp.relatives?.filter((r) => r.isAdherent && !r.deletedAt).length || 0)
      );

      if (totalOsAdherentesDeduction > 0) {
        if (empAdherentsCount === 0) {
          issues.push({
            legajo,
            cuil,
            type: 'ERROR_ADHERENTES_SIN_REGISTRAR',
            message: `Se liquidó retención por Adherente OS (ARCA 810009) por $${totalOsAdherentesDeduction.toFixed(2)} pero el legajo tiene 0 familiares adherentes registrados conforme a Ley 23.660.`,
          });
        } else {
          const expectedOsAdherentes = Math.round(bi4Total * 0.015 * empAdherentsCount * 100) / 100;
          if (Math.abs(totalOsAdherentesDeduction - expectedOsAdherentes) > 0.10) {
            issues.push({
              legajo,
              cuil,
              type: 'ERROR_DISCREPANCIA_OBRA_SOCIAL_ADHERENTES',
              message: `Retención acumulada Obra Social Adherentes (ARCA 810009) ($${totalOsAdherentesDeduction.toFixed(2)}) difiere del 1.5% legal por adherente ($${expectedOsAdherentes.toFixed(2)} para ${empAdherentsCount} adherente/s) sobre Base Imponible 4 + Base Dif ($${bi4Total.toFixed(2)}).`,
            });
          }
        }
      }
    }
  }

  const errors = issues.filter((i) => i.type.startsWith('ERROR'));
  const warnings = issues.filter((i) => i.type.startsWith('ADVERTENCIA') || i.type.startsWith('WARN'));

  return {
    isValid: errors.length === 0,
    period: `${year}-${String(month).padStart(2, '0')}`,
    totalSettlements: settlements.length,
    totalEmployees: slipsByEmp.size,
    totalIssues: issues.length,
    errors,
    warnings,
    issues,
    summary: {
      totalGross: Math.round(totalGrossAll * 100) / 100,
      totalRemunerative: Math.round(totalRemunAll * 100) / 100,
      uniqueEmployeesCount: slipsByEmp.size,
      settlementsCount: settlements.length,
    },
  };
}
