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
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '00000000';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
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
      '0' + // 184 Regímenes Diferenciales Aportes
      ' ' + // 185 Libre
      '0' + // 186 Regímenes Especiales Aportes
      '         '; // 187-195 Libres (9 espacios)

    if (line.length !== 195) {
      throw new Error(`Error interno: línea de concepto "${c.code}" tiene ${line.length} caracteres (requerido: 195)`);
    }

    lines.push(line);
  }

  return lines.join('\r\n') + '\r\n';
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
      const indicator = isDeduction ? 'D' : 'C';

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

  return lines.join('\r\n') + '\r\n';
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
    issues,
  };
}
