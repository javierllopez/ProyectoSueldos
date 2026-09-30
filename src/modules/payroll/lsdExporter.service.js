/**
 * Generador y Validador de Archivos Planos para el Libro de Sueldos Digital (LSD) - ARCA
 * Conforme a especificaciones de diseño de registro y longitudes fijas de 195 y 999 caracteres.
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
 * Genera el Archivo 2: Importación de Liquidaciones de Haberes (999 caracteres fijos por línea).
 */
export function generateLsdPayrollFile({ company, period, paySlips }) {
  const lines = [];
  const cuitClean = (company.cuit || '').replace(/\D/g, '');

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

  reg01 = reg01.padEnd(999, ' ');
  if (reg01.length !== 999) throw new Error(`Registro 01 longitud inválida: ${reg01.length} (esperado 999)`);
  lines.push(reg01);

  // --- BLOQUE POR CADA EMPLEADO ---
  for (const slip of paySlips) {
    const emp = slip.employee;
    const cuilClean = (emp.cuil || '').replace(/\D/g, '');
    const basis = slip.basis || {};

    // REGISTRO 02: DATOS REFERENCIALES DEL TRABAJADOR
    const formaPago = slip.paymentMethod === 'CBU' ? '3' : (slip.paymentMethod === 'CHEQUE' ? '2' : '1');
    const cbuClean = (emp.cbu || slip.cbu || '').replace(/\D/g, '');
    const paymentDateStr = formatDate(slip.paymentDate || period.paymentDate);
    const rubricDateStr = formatDate(period.rubricDate);

    let reg02 =
      '02' + // 1-2
      formatNumeric(cuilClean, 11) + // 3-13
      formatAlpha(emp.fileNumber, 10) + // 14-23
      formatAlpha(emp.department?.name || 'ADMINISTRACION', 50) + // 24-73
      formatAlpha(cbuClean, 22) + // 74-95
      formatNumeric(slip.workedDays || 30, 3) + // 96-98 Días tope
      paymentDateStr + // 99-106
      rubricDateStr + // 107-114
      formaPago; // 115

    reg02 = reg02.padEnd(999, ' ');
    if (reg02.length !== 999) throw new Error(`Registro 02 [Legajo ${emp.fileNumber}] longitud inválida: ${reg02.length}`);
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

      reg03 = reg03.padEnd(999, ' ');
      if (reg03.length !== 999) throw new Error(`Registro 03 [Concepto ${item.conceptCode}] longitud inválida: ${reg03.length}`);
      lines.push(reg03);
    }

    // REGISTRO 04: ATRIBUTOS LABORALES Y BASES IMPONIBLES (F.931)
    const osCode = emp.healthInsurance?.code ? emp.healthInsurance.code.replace(/\D/g, '') : '126205';

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
      '00' + // 34-35 Localidad
      formatAlpha(basis.situationCode || '01', 2) + // 36-37 Sit 1
      '01' + // 38-39 Día inicio 1
      '00' + // 40-41 Sit 2
      '00' + // 42-43 Día 2
      '00' + // 44-45 Sit 3
      '00' + // 46-47 Día 3
      formatNumeric(slip.workedDays || 30, 2) + // 48-49 Días trabajados
      formatNumeric(slip.workedHours || 160, 3) + // 50-52 Horas
      '00000' + // 53-57 Adicional SS
      '00000' + // 58-62 Contribución Dif
      formatAlpha(osCode, 6) + // 63-68 Código OS
      '00' + // 69-70 Adherentes OS
      formatMoney(0, 15) + // 71-85 Aporte Adic OS
      formatMoney(0, 15) + // 86-100 Contrib Adic OS
      formatMoney(0, 15) + // 101-115 Base Dif OS
      formatMoney(0, 15) + // 116-130 Base Dif Contrib OS
      formatMoney(0, 15) + // 131-145 Base Dif LRT
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
      formatMoney(basis.baseImponible10, 15) + // 341-355 BI 10 (SIPA con Detracción)
      formatMoney(basis.detractionAmount, 15); // 356-370 Detracción Ley 27.541

    reg04 = reg04.padEnd(999, ' ');
    if (reg04.length !== 999) throw new Error(`Registro 04 [Legajo ${emp.fileNumber}] longitud inválida: ${reg04.length}`);
    lines.push(reg04);
  }

  return lines.join('\r\n');
}

/**
 * Validador de consistencia matemática y técnica antes de exportar a ARCA.
 */
export function validateLsdConsistency({ paySlips }) {
  const issues = [];

  for (const slip of paySlips) {
    const legajo = slip.employee?.fileNumber || '-';
    const cuil = slip.employee?.cuil || '-';

    // 1. Remunerativos sumados vs Remuneración Bruta declarada en Registro 04
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

    // 2. Comprobar alícuotas de aportes de ley (11% SIPA, 3% PAMI, 3% OS)
    const sipaItem = items.find((i) => i.conceptCode === '8000' || i.arcaConceptCode === '810000');
    if (sipaItem && slip.basis?.baseImponible1) {
      const expectedSipa = Math.round(Number(slip.basis.baseImponible1) * 0.11 * 100) / 100;
      const actualSipa = Math.round(Number(sipaItem.amount) * 100) / 100;
      if (Math.abs(expectedSipa - actualSipa) > 0.05) {
        issues.push({
          legajo,
          cuil,
          type: 'ERROR_ALICUOTA_SIPA',
          message: `Aporte SIPA ($${actualSipa}) no concuerda con 11% de BI 1 ($${expectedSipa})`,
        });
      }
    }
  }

  return {
    isValid: issues.length === 0,
    errors: issues,
    issues,
  };
}

/**
 * Genera el Archivo Unificado Mensual del Libro de Sueldos Digital (999 caracteres fijos).
 * Consolida todas las liquidaciones del mes calendario (Mensual, Quincenas, SAC, Vacaciones, etc.):
 * - 1 solo Registro 01 para todo el mes (Tipo 'M', Número '00001', Días base 30, conteo exacto de 04s).
 * - 1 Registro 02 por trabajador (con la fecha de pago de la liquidación más reciente).
 * - Múltiples Registros 03 concatenando todos los conceptos de todas las liquidaciones del mes.
 * - 1 solo Registro 04 por trabajador con las Bases Imponibles 1 a 10 consolidadas y topadas a nivel mensual.
 */
export function generateMonthlyLsdPayrollFile({ company, year, month, settlements = [], paySlips = [], payrollSettings = {} }) {
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

  const uniqueEmployeesCount = slipsByEmp.size;
  const periodoAaaamm = `${year}${String(month).padStart(2, '0')}`;

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

  reg01 = reg01.padEnd(999, ' ');
  if (reg01.length !== 999) throw new Error(`Registro 01 longitud inválida: ${reg01.length} (esperado 999)`);
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
      formatDate(latestRubricDate) + // 107-114
      formaPago; // 115

    reg02 = reg02.padEnd(999, ' ');
    if (reg02.length !== 999) throw new Error(`Registro 02 [Legajo ${emp.fileNumber}] longitud inválida: ${reg02.length}`);
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

        reg03 = reg03.padEnd(999, ' ');
        if (reg03.length !== 999) throw new Error(`Registro 03 [Concepto ${item.conceptCode}] longitud inválida: ${reg03.length}`);
        lines.push(reg03);
      }
    }

    // REGISTRO 04: ATRIBUTOS LABORALES Y BASES IMPONIBLES UNIFICADAS (F.931)
    const monthlyGross = Math.round(empSlips.reduce((sum, s) => sum + Number(s.grossSalary || 0), 0) * 100) / 100;
    const monthlyRemunerative = Math.round(empSlips.reduce((sum, s) => sum + Number(s.remunerativeSalary || 0), 0) * 100) / 100;

    const isIntern = Boolean(emp.salaryScale?.isInternOnly || emp.contractModalityCode === '027');
    const isDirector = Boolean(emp.salaryScale?.isDirectorOnly || emp.contractModalityCode === '099');

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
      bi4 = Math.min(Math.max(monthlyRemunerative, minCap), maxCap);
      bi8 = bi4;
      bi9 = monthlyGross;
    } else if (isDirector) {
      bi9 = monthlyGross;
    } else {
      if (monthlyRemunerative > 0) {
        bi1 = Math.min(Math.max(monthlyRemunerative, minCap), maxCap);
        bi2 = Math.max(monthlyRemunerative, minCap);
        bi3 = bi2;
        bi4 = Math.min(Math.max(monthlyRemunerative, minCap), maxCap);
        bi5 = bi1;
        bi8 = bi4;
        bi9 = monthlyGross;
        bi10 = Math.max(bi2 - detractionBase, minCap);
        detractionAmount = detractionBase;
      } else {
        bi9 = monthlyGross;
      }
    }

    const latestBasis = empSlips[empSlips.length - 1].basis || {};
    const osCode = emp.healthInsurance?.code ? emp.healthInsurance.code.replace(/\D/g, '') : '126205';

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
      '00' + // 34-35 Localidad
      formatAlpha(latestBasis.situationCode || '01', 2) + // 36-37 Sit 1
      '01' + // 38-39 Día inicio 1
      '00' + // 40-41 Sit 2
      '00' + // 42-43 Día 2
      '00' + // 44-45 Sit 3
      '00' + // 46-47 Día 3
      formatNumeric(Math.min(cumulativeWorkedDays, 30), 2) + // 48-49 Días trabajados (máx 30)
      formatNumeric(cumulativeWorkedHours || 160, 3) + // 50-52 Horas
      '00000' + // 53-57 Adicional SS
      '00000' + // 58-62 Contribución Dif
      formatAlpha(osCode, 6) + // 63-68 Código OS
      '00' + // 69-70 Adherentes OS
      formatMoney(0, 15) + // 71-85 Aporte Adic OS
      formatMoney(0, 15) + // 86-100 Contrib Adic OS
      formatMoney(0, 15) + // 101-115 Base Dif OS
      formatMoney(0, 15) + // 116-130 Base Dif Contrib OS
      formatMoney(0, 15) + // 131-145 Base Dif LRT
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

    reg04 = reg04.padEnd(999, ' ');
    if (reg04.length !== 999) throw new Error(`Registro 04 [Legajo ${emp.fileNumber}] longitud inválida: ${reg04.length}`);
    lines.push(reg04);
  }

  return lines.join('\r\n');
}

/**
 * Validador de consistencia ARCA a nivel de período mensual consolidado.
 * Audita cuadre matemático 03 vs 04, alícuotas previsionales (11%, 3%, 3%),
 * control de tope de 30 días acumulados y formato del archivo plano.
 */
export function validateMonthlyLsdConsistency({ year, month, settlements = [], paySlips = [], payrollSettings = {} }) {
  const issues = [];
  const validSlips = paySlips.filter((s) => !s.deletedAt);

  const slipsByEmp = new Map();
  for (const s of validSlips) {
    if (!slipsByEmp.has(s.employeeId)) {
      slipsByEmp.set(s.employeeId, []);
    }
    slipsByEmp.get(s.employeeId).push(s);
  }

  const minCap = Number(payrollSettings.ansesMinCap || 82287.12);
  const maxCap = Number(payrollSettings.ansesMaxCap || 2674292.72);

  let totalGrossAll = 0;
  let totalRemunAll = 0;

  for (const [empId, empSlips] of slipsByEmp.entries()) {
    const emp = empSlips[0].employee || {};
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

    // 2. Control de Días Trabajados Acumulados (Definición del Usuario)
    const cumulativeWorkedDays = empSlips.reduce((sum, s) => sum + (Number(s.workedDays) || 0), 0);
    if (cumulativeWorkedDays > 30) {
      issues.push({
        legajo,
        cuil,
        type: 'ERROR_DIAS_BASE_EXCEDIDOS',
        message: `Días trabajados acumulados (${cumulativeWorkedDays} días) superan el tope máximo legal de 30 días base para el mes ${month}/${year}.`,
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
    let totalOsDeduction = 0;

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
          const arcaCode = String(item.arcaConceptCode || '');
          const name = String(item.conceptName || '').toLowerCase();

          // SIPA (11%)
          if (code === '8000' || arcaCode === '810000' || name.includes('jubilac') || name.includes('sipa')) {
            totalSipaDeduction += amt;
          }
          // INSSJyP / PAMI (3%)
          else if (code === '8001' || arcaCode === '810001' || name.includes('inssjyp') || name.includes('pami') || name.includes('ley 19.032')) {
            totalInssjypDeduction += amt;
          }
          // Obra Social (3%)
          else if (code === '8002' || arcaCode === '810002' || (name.includes('obra social') && !name.includes('adic'))) {
            totalOsDeduction += amt;
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

    // 4. Control de Aportes de Ley sobre Bases Imponibles Unificadas
    const isIntern = Boolean(emp.salaryScale?.isInternOnly || emp.contractModalityCode === '027');
    const isDirector = Boolean(emp.salaryScale?.isDirectorOnly || emp.contractModalityCode === '099');

    if (!isIntern && !isDirector && monthlyRemunerative > 0) {
      const bi1 = Math.min(Math.max(monthlyRemunerative, minCap), maxCap);
      const expectedSipa = Math.round(bi1 * 0.11 * 100) / 100;
      const expectedInssjyp = Math.round(bi1 * 0.03 * 100) / 100;
      const expectedOs = Math.round(bi1 * 0.03 * 100) / 100;

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

      if (totalOsDeduction > 0 && Math.abs(totalOsDeduction - expectedOs) > 0.10) {
        issues.push({
          legajo,
          cuil,
          type: 'ERROR_ALICUOTA_OBRA_SOCIAL',
          message: `Retención acumulada Obra Social ($${totalOsDeduction.toFixed(2)}) difiere del 3% sobre Base Imponible 4 ($${expectedOs.toFixed(2)}).`,
        });
      }
    }
  }

  return {
    isValid: issues.length === 0,
    period: `${year}-${String(month).padStart(2, '0')}`,
    totalSettlements: settlements.length,
    totalEmployees: slipsByEmp.size,
    totalIssues: issues.length,
    errors: issues,
    issues,
    summary: {
      totalGross: Math.round(totalGrossAll * 100) / 100,
      totalRemunerative: Math.round(totalRemunAll * 100) / 100,
      uniqueEmployeesCount: slipsByEmp.size,
      settlementsCount: settlements.length,
    },
  };
}
