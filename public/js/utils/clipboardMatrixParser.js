/**
 * Utilidades puras para parseo de rangos copiados desde Excel / Google Sheets,
 * normalización numérica argentina/internacional, emparejamiento por Legajo/CUIL
 * y detecciones normativas (horas extras Dec. 484/2000 y deducciones Arts. 130-133 LCT).
 * Sin dependencias de DOM: importable tanto en navegador como en pruebas Node.
 */

export function hoursStringToDecimal(str) {
  const match = String(str || '').trim().match(/^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = match[3] ? parseInt(match[3], 10) : 0;
  return Math.round((h + m / 60 + s / 3600) * 100) / 100;
}

export function decimalToHoursString(val) {
  if (val === null || val === undefined || val === '') return '';
  const num = typeof val === 'number' ? val : Number(val);
  if (Number.isNaN(num) || num < 0) return '';
  const totalMinutes = Math.round(num * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours < 10 ? '0' : ''}${hours}:${minutes < 10 ? '0' : ''}${minutes}`;
}

export function parseClipboardGrid(rawText) {
  if (rawText === null || rawText === undefined) return [];
  const normalized = String(rawText).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.map((line) => line.split('\t'));
}

export function parseLocalizedNumber(rawValue, { inputType = 'UNITS' } = {}) {
  const original = String(rawValue ?? '').replace(/\u00A0/g, ' ').trim();
  if (!original) return { ok: false, error: 'Valor vacío' };

  const hadCurrencySymbol = /\$|ARS/i.test(original);
  let cleaned = original.replace(/(?:ARS|\$|%)/gi, '').replace(/\s+/g, '').trim();

  if (!cleaned) return { ok: false, error: 'Formato numérico inválido' };

  let sign = 1;
  if (cleaned.startsWith('-')) {
    sign = -1;
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  if (!cleaned || !/^[\d.,]+$/.test(cleaned)) {
    return { ok: false, error: `Valor numérico inválido: "${original}"` };
  }

  const dotMatches = cleaned.match(/\./g) || [];
  const commaMatches = cleaned.match(/,/g) || [];
  const dotCount = dotMatches.length;
  const commaCount = commaMatches.length;

  let normalizedStr = cleaned;

  if (dotCount > 0 && commaCount > 0) {
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastComma > lastDot) {
      // Formato AR/EU: 1.250,50 -> 1250.50
      normalizedStr = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato US: 1,250.50 -> 1250.50
      normalizedStr = cleaned.replace(/,/g, '');
    }
  } else if (commaCount > 0) {
    if (commaCount > 1) {
      // Separadores de miles US múltiples: 1,250,000
      if (!/^\d{1,3}(,\d{3})+$/.test(cleaned)) {
        return { ok: false, error: `Separadores de coma inválidos: "${original}"` };
      }
      normalizedStr = cleaned.replace(/,/g, '');
    } else {
      // Una sola coma: decimal argentino (ej. 12,5 / 1500,00)
      normalizedStr = cleaned.replace(',', '.');
    }
  } else if (dotCount > 0) {
    if (dotCount > 1) {
      // Múltiples puntos -> miles AR (1.250.000)
      if (!/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
        return { ok: false, error: `Separadores de punto inválidos: "${original}"` };
      }
      normalizedStr = cleaned.replace(/\./g, '');
    } else {
      // Un solo punto: si tiene exactamente 3 dígitos finales y contexto moneda/importe -> miles (1.500 -> 1500)
      if (/^\d{1,3}\.\d{3}$/.test(cleaned) && (hadCurrencySymbol || inputType === 'AMOUNT')) {
        normalizedStr = cleaned.replace('.', '');
      }
    }
  }

  if ((normalizedStr.match(/\./g) || []).length > 1 || !/^\d+(\.\d+)?$/.test(normalizedStr)) {
    return { ok: false, error: `Formato numérico no reconocido: "${original}"` };
  }

  const parsed = Number(normalizedStr) * sign;
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: `Número fuera de rango: "${original}"` };
  }

  return { ok: true, value: Math.round(parsed * 100) / 100 };
}

export function parseClipboardCellValue(rawValue, inputType = 'UNITS') {
  const raw = String(rawValue ?? '').replace(/\u00A0/g, ' ').trim();
  const normalizedUpper = raw.toUpperCase();

  if (
    raw === '' ||
    raw === '-' ||
    raw === '—' ||
    normalizedUpper === 'N/A' ||
    normalizedUpper === 'NA'
  ) {
    return { empty: true, value: null, invalid: false, error: null };
  }

  if (inputType === 'NONE') {
    const truthy = new Set(['1', 'SI', 'SÍ', 'X', 'TRUE', 'OK', '✔', 'YES']);
    const falsy = new Set(['0', 'NO', 'FALSE']);
    if (truthy.has(normalizedUpper)) {
      return { empty: false, value: 1, invalid: false, error: null };
    }
    if (falsy.has(normalizedUpper)) {
      return { empty: true, value: null, invalid: false, error: null };
    }
    return {
      empty: false,
      value: null,
      invalid: true,
      error: 'Para conceptos por asignación use 1, Sí, X o deje vacío',
    };
  }

  if (inputType === 'HOURS') {
    const hoursNoSuffix = raw.replace(/\s*(hs?|hrs?)\.?$/i, '').trim();
    if (hoursNoSuffix.includes(':')) {
      const dec = hoursStringToDecimal(hoursNoSuffix);
      if (dec === null) {
        return {
          empty: false,
          value: null,
          invalid: true,
          error: `Formato horario inválido ("${raw}"). Use HH:MM (ej. 08:30) o decimal.`,
        };
      }
      if (dec === 0) {
        return { empty: true, value: null, invalid: false, error: null };
      }
      return { empty: false, value: dec, invalid: false, error: null };
    }
    const numRes = parseLocalizedNumber(hoursNoSuffix, { inputType: 'HOURS' });
    if (!numRes.ok) {
      return { empty: false, value: null, invalid: true, error: numRes.error };
    }
    if (numRes.value < 0) {
      return { empty: false, value: null, invalid: true, error: 'Las horas no pueden ser negativas' };
    }
    if (numRes.value === 0) {
      return { empty: true, value: null, invalid: false, error: null };
    }
    return { empty: false, value: numRes.value, invalid: false, error: null };
  }

  const numRes = parseLocalizedNumber(raw, { inputType });
  if (!numRes.ok) {
    return { empty: false, value: null, invalid: true, error: numRes.error };
  }
  if (numRes.value < 0) {
    return { empty: false, value: null, invalid: true, error: 'No se admiten valores negativos' };
  }
  if (inputType === 'PERCENTAGE' && numRes.value > 100) {
    return {
      empty: false,
      value: null,
      invalid: true,
      error: 'El porcentaje no puede superar 100%',
    };
  }
  if (numRes.value === 0) {
    return { empty: true, value: null, invalid: false, error: null };
  }
  return { empty: false, value: numRes.value, invalid: false, error: null };
}

export function formatCellValueForInput(value, inputType = 'UNITS') {
  if (value === null || value === undefined || value === '' || Number(value) === 0) return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  if (inputType === 'NONE') return num > 0 ? '1' : '';
  const rounded = Math.round(num * 100) / 100;
  return rounded.toLocaleString('es-AR', {
    minimumFractionDigits: inputType === 'AMOUNT' ? 2 : (Number.isInteger(rounded) ? 0 : 2),
    maximumFractionDigits: 2,
  });
}

export function normalizeEmployeeLookupKey(rawKey) {
  const trimmed = String(rawKey ?? '').trim();
  const lower = trimmed.toLowerCase();
  const digits = trimmed.replace(/\D/g, '');
  const noLeadingZeros = trimmed.replace(/^0+/, '').toLowerCase();
  return { trimmed, lower, digits, noLeadingZeros };
}

export function matchClipboardRowsByEmployeeKey(grid, employees = []) {
  const safeGrid = Array.isArray(grid) ? grid : [];
  const safeEmployees = Array.isArray(employees) ? employees : [];

  const byFileExact = new Map();
  const byFileNoZeros = new Map();
  const ambiguousNoZeros = new Set();
  const byCuil = new Map();

  for (const emp of safeEmployees) {
    if (emp.fileNumber !== null && emp.fileNumber !== undefined && String(emp.fileNumber).trim() !== '') {
      const fTrim = String(emp.fileNumber).trim().toLowerCase();
      byFileExact.set(fTrim, emp);
      const stripped = fTrim.replace(/^0+/, '');
      if (stripped) {
        if (byFileNoZeros.has(stripped) && byFileNoZeros.get(stripped).id !== emp.id) {
          ambiguousNoZeros.add(stripped);
        } else {
          byFileNoZeros.set(stripped, emp);
        }
      }
    }
    if (emp.cuil) {
      const cleanCuil = String(emp.cuil).replace(/\D/g, '');
      if (cleanCuil) byCuil.set(cleanCuil, emp);
    }
  }

  for (const amb of ambiguousNoZeros) {
    byFileNoZeros.delete(amb);
  }

  const resolveEmp = (rawKey) => {
    const { lower, digits, noLeadingZeros } = normalizeEmployeeLookupKey(rawKey);
    if (!lower) return null;
    if (byFileExact.has(lower)) return byFileExact.get(lower);
    if (digits.length === 11 && byCuil.has(digits)) return byCuil.get(digits);
    if (noLeadingZeros && byFileNoZeros.has(noLeadingZeros)) return byFileNoZeros.get(noLeadingZeros);
    return null;
  };

  let startIndex = 0;
  let headerSkipped = false;
  if (safeGrid.length > 0) {
    const firstCell = String(safeGrid[0]?.[0] ?? '').trim();
    const looksLikeHeaderText = /^(legajo|leg\.?|nro\.?\s*legajo|cuil|cuit|dni|empleado|colaborador|apellido)/i.test(firstCell);
    const firstMatches = resolveEmp(firstCell);
    if (looksLikeHeaderText && !firstMatches) {
      startIndex = 1;
      headerSkipped = true;
    } else if (!firstMatches && safeGrid.length > 1 && resolveEmp(safeGrid[1]?.[0])) {
      startIndex = 1;
      headerSkipped = true;
    }
  }

  const matchedRows = [];
  const unmatchedKeys = [];

  for (let i = startIndex; i < safeGrid.length; i++) {
    const row = safeGrid[i] || [];
    const hasAnyContent = row.some((c) => String(c ?? '').trim() !== '');
    if (!hasAnyContent) continue;

    const rawKey = String(row[0] ?? '').trim();
    const matchedEmp = resolveEmp(rawKey);
    if (matchedEmp) {
      matchedRows.push({
        employee: matchedEmp,
        values: row.slice(1),
        rawKey,
        rowIndex: i,
      });
    } else {
      unmatchedKeys.push({
        key: rawKey || '(vacío)',
        rowIndex: i,
      });
    }
  }

  return { matchedRows, unmatchedKeys, headerSkipped };
}

export function isOvertimeHoursConcept(concept) {
  if (!concept) return false;
  const dt = String(concept.noveltyDataType || '').toUpperCase();
  const isHours = dt === 'HORAS' || dt === 'HOURS';
  if (!isHours) return false;
  const arca = String(concept.arcaConceptCode || '').trim();
  const name = String(concept.name || '');
  const code = String(concept.code || '');
  if (/^130\d{3}$/.test(arca)) return true;
  return /extra|suplement|hs\s*ex|hora.*ex/i.test(name) || /extra|supl/i.test(code);
}

export function isSensitiveDeductionOrAdvance(concept) {
  if (!concept) return false;
  if (String(concept.type || '').toUpperCase() === 'DEDUCTION') return true;
  const arca = String(concept.arcaConceptCode || '').trim();
  if (arca === '820000') return true;
  return /adelanto|anticipo|pr[ée]stamo|cuota/i.test(String(concept.name || ''));
}

export function resolveCanonicalPeriodFamily(periodType) {
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

export function isConceptCompatibleWithPeriodType(concept, targetPeriodType) {
  if (!concept) return false;
  if (!targetPeriodType) return true;
  const cFamily = resolveCanonicalPeriodFamily(concept.periodType || 'MONTHLY');
  const pFamily = resolveCanonicalPeriodFamily(targetPeriodType);
  return cFamily === 'ALL' || cFamily === pFamily;
}

function getPureConceptInputType(concept) {
  if (!concept) return 'UNITS';
  const dt = String(concept.noveltyDataType || '').toUpperCase();
  if (dt === 'CALCULADO') return 'CALCULADO';
  if (dt === 'SOLO_ASIGNACION' || dt === 'NONE' || dt === 'SIN_NOVEDAD') return 'NONE';
  if (dt === 'HORAS' || dt === 'HOURS') return 'HOURS';
  if (dt === 'PORCENTAJE' || dt === 'PERCENTAGE') return 'PERCENTAGE';
  if (dt === 'IMPORTE' || dt === 'AMOUNT') return 'AMOUNT';
  if (dt === 'CANTIDAD' || dt === 'UNITS') return 'UNITS';
  if (concept.calculationType === 'FIXED_AMOUNT') return 'AMOUNT';
  if (concept.calculationType === 'PERCENTAGE') return 'PERCENTAGE';
  return 'UNITS';
}

export function parseMultiConceptExcelMatrix(
  rawRows,
  { employees = [], allConcepts = [], targetPeriodType = 'MONTHLY' } = {}
) {
  const safeRows = Array.isArray(rawRows) ? rawRows : [];
  if (safeRows.length < 2) {
    return {
      fatalError: 'El archivo Excel debe incluir la fila de encabezados (fila 1) y al menos una fila de datos.',
      hasFatalHeaderErrors: true,
      validColumns: [],
      invalidColumns: [],
      rowsPreview: [],
      validItems: [],
      activeRowsCount: 0,
      inactiveRowsCount: 0,
      notFoundRowsCount: 0,
      duplicateRowsCount: 0,
      invalidCellsCount: 0,
      overtimeWarningsCount: 0,
      hasSensitiveDeductions: false,
    };
  }

  const headerRow = Array.isArray(safeRows[0]) ? safeRows[0] : [];
  let maxCol = headerRow.length;
  for (let r = 1; r < safeRows.length; r++) {
    if (Array.isArray(safeRows[r]) && safeRows[r].length > maxCol) {
      maxCol = safeRows[r].length;
    }
  }
  while (maxCol > 0) {
    const colIdx = maxCol - 1;
    const hasAnyVal = safeRows.some((row) => String(row?.[colIdx] ?? '').trim() !== '');
    if (hasAnyVal) break;
    maxCol -= 1;
  }

  if (maxCol < 2) {
    return {
      fatalError: 'La planilla debe contener al menos 2 columnas: Columna 1 (Legajo) y Columna 2+ (Códigos de conceptos).',
      hasFatalHeaderErrors: true,
      validColumns: [],
      invalidColumns: [],
      rowsPreview: [],
      validItems: [],
      activeRowsCount: 0,
      inactiveRowsCount: 0,
      notFoundRowsCount: 0,
      duplicateRowsCount: 0,
      invalidCellsCount: 0,
      overtimeWarningsCount: 0,
      hasSensitiveDeductions: false,
    };
  }

  const conceptByCode = new Map();
  for (const c of allConcepts || []) {
    if (!c?.code) continue;
    const key = String(c.code).trim().toUpperCase();
    if (!conceptByCode.has(key) || (!c.deletedAt && conceptByCode.get(key)?.deletedAt)) {
      conceptByCode.set(key, c);
    }
  }

  const validColumns = [];
  const invalidColumns = [];
  const seenCodes = new Set();

  for (let colIdx = 1; colIdx < maxCol; colIdx++) {
    const rawHeader = String(headerRow[colIdx] ?? '').trim();
    const codeUpper = rawHeader.toUpperCase();

    if (!rawHeader) {
      const hasDataInCol = safeRows.slice(1).some((row) => String(row?.[colIdx] ?? '').trim() !== '');
      if (hasDataInCol) {
        invalidColumns.push({
          colIdx,
          header: `(Columna ${colIdx + 1})`,
          reason: 'Encabezado vacío (debe indicar el código del concepto)',
        });
      }
      continue;
    }

    if (seenCodes.has(codeUpper)) {
      invalidColumns.push({
        colIdx,
        header: rawHeader,
        reason: `Código "${rawHeader}" duplicado en múltiples columnas`,
      });
      continue;
    }
    seenCodes.add(codeUpper);

    const concept = conceptByCode.get(codeUpper);
    if (!concept || concept.deletedAt) {
      invalidColumns.push({
        colIdx,
        header: rawHeader,
        reason: `El código "${rawHeader}" no existe en el catálogo de conceptos`,
      });
      continue;
    }
    if (String(concept.scope || '').toUpperCase() !== 'INDIVIDUAL') {
      invalidColumns.push({
        colIdx,
        header: rawHeader,
        reason: `[${concept.code}] ${concept.name} es de alcance GENERAL y no admite novedades individuales`,
      });
      continue;
    }
    if (concept.isPersistent) {
      invalidColumns.push({
        colIdx,
        header: rawHeader,
        reason: `[${concept.code}] ${concept.name} es PERSISTENTE (use Novedades Persistentes)`,
      });
      continue;
    }
    const inputType = getPureConceptInputType(concept);
    if (inputType === 'CALCULADO') {
      invalidColumns.push({
        colIdx,
        header: rawHeader,
        reason: `[${concept.code}] ${concept.name} es CALCULADO automáticamente`,
      });
      continue;
    }
    if (!isConceptCompatibleWithPeriodType(concept, targetPeriodType)) {
      invalidColumns.push({
        colIdx,
        header: rawHeader,
        reason: `[${concept.code}] ${concept.name} pertenece al tipo "${concept.periodType}" y no corresponde a la liquidación "${targetPeriodType}"`,
      });
      continue;
    }

    validColumns.push({
      colIdx,
      code: concept.code,
      concept,
      inputType,
    });
  }

  // Mapa completo de empleados (activos e inactivos) por Legajo exacto o sin ceros iniciales
  const byFileExact = new Map();
  const byFileNoZeros = new Map();
  const ambiguousNoZeros = new Set();

  for (const emp of employees || []) {
    if (emp.fileNumber === null || emp.fileNumber === undefined) continue;
    const fTrim = String(emp.fileNumber).trim().toLowerCase();
    if (!fTrim) continue;
    byFileExact.set(fTrim, emp);
    const stripped = fTrim.replace(/^0+/, '');
    if (stripped) {
      if (byFileNoZeros.has(stripped) && byFileNoZeros.get(stripped).id !== emp.id) {
        ambiguousNoZeros.add(stripped);
      } else {
        byFileNoZeros.set(stripped, emp);
      }
    }
  }
  for (const amb of ambiguousNoZeros) {
    byFileNoZeros.delete(amb);
  }

  const findEmpByFileNumber = (rawFile) => {
    const trimmed = String(rawFile ?? '').trim().toLowerCase();
    if (!trimmed) return null;
    if (byFileExact.has(trimmed)) return byFileExact.get(trimmed);
    const stripped = trimmed.replace(/^0+/, '');
    if (stripped && byFileNoZeros.has(stripped)) return byFileNoZeros.get(stripped);
    return null;
  };

  const rowsPreview = [];
  const validItems = [];
  const seenEmpIds = new Set();

  let activeRowsCount = 0;
  let inactiveRowsCount = 0;
  let notFoundRowsCount = 0;
  let duplicateRowsCount = 0;
  let invalidCellsCount = 0;
  let overtimeWarningsCount = 0;
  let hasSensitiveDeductions = validColumns.some((col) => isSensitiveDeductionOrAdvance(col.concept));

  for (let rowIdx = 1; rowIdx < safeRows.length; rowIdx++) {
    const row = Array.isArray(safeRows[rowIdx]) ? safeRows[rowIdx] : [];
    const hasAnyContent = row.slice(0, maxCol).some((cell) => String(cell ?? '').trim() !== '');
    if (!hasAnyContent) continue;

    const rawLegajo = String(row[0] ?? '').trim();
    const matchedEmp = findEmpByFileNumber(rawLegajo);

    if (!rawLegajo || !matchedEmp) {
      notFoundRowsCount++;
      rowsPreview.push({
        rowNumber: rowIdx + 1,
        rawLegajo: rawLegajo || '(vacío)',
        employee: null,
        status: 'NOT_FOUND',
        statusLabel: !rawLegajo ? 'Legajo vacío' : 'Legajo no encontrado',
        cells: validColumns.map((col) => ({
          conceptId: col.concept.id,
          code: col.code,
          raw: String(row[col.colIdx] ?? ''),
          empty: String(row[col.colIdx] ?? '').trim() === '',
          invalid: false,
          value: null,
        })),
      });
      continue;
    }

    const isEmpActive = !matchedEmp.deletedAt && String(matchedEmp.status || '').toUpperCase() === 'ACTIVE';
    if (!isEmpActive) {
      inactiveRowsCount++;
      rowsPreview.push({
        rowNumber: rowIdx + 1,
        rawLegajo,
        employee: matchedEmp,
        status: 'INACTIVE',
        statusLabel: `Relación laboral inactiva (${matchedEmp.status || 'BAJA'})`,
        cells: validColumns.map((col) => ({
          conceptId: col.concept.id,
          code: col.code,
          raw: String(row[col.colIdx] ?? ''),
          empty: String(row[col.colIdx] ?? '').trim() === '',
          invalid: false,
          value: null,
        })),
      });
      continue;
    }

    if (seenEmpIds.has(matchedEmp.id)) {
      duplicateRowsCount++;
      rowsPreview.push({
        rowNumber: rowIdx + 1,
        rawLegajo,
        employee: matchedEmp,
        status: 'DUPLICATE',
        statusLabel: 'Legajo duplicado en el archivo',
        cells: validColumns.map((col) => ({
          conceptId: col.concept.id,
          code: col.code,
          raw: String(row[col.colIdx] ?? ''),
          empty: String(row[col.colIdx] ?? '').trim() === '',
          invalid: false,
          value: null,
        })),
      });
      continue;
    }
    seenEmpIds.add(matchedEmp.id);
    activeRowsCount++;

    const rowCells = [];
    let rowHasCellError = false;

    for (const col of validColumns) {
      const rawCell = row[col.colIdx] ?? '';
      const parsed = parseClipboardCellValue(rawCell, col.inputType);
      const isOvertimeWarn =
        !parsed.invalid && !parsed.empty && parsed.value > 30 && isOvertimeHoursConcept(col.concept);

      if (parsed.invalid) {
        invalidCellsCount++;
        rowHasCellError = true;
      } else if (!parsed.empty && parsed.value > 0) {
        const isAmt = col.inputType === 'AMOUNT';
        validItems.push({
          employeeId: matchedEmp.id,
          conceptId: col.concept.id,
          units: isAmt ? 1 : parsed.value,
          amount: isAmt ? parsed.value : null,
          notes: null,
        });
        if (isOvertimeWarn) overtimeWarningsCount++;
      }

      rowCells.push({
        conceptId: col.concept.id,
        code: col.code,
        inputType: col.inputType,
        raw: String(rawCell ?? ''),
        empty: parsed.empty,
        invalid: parsed.invalid,
        error: parsed.error,
        value: parsed.value,
        overtimeWarn: isOvertimeWarn,
      });
    }

    rowsPreview.push({
      rowNumber: rowIdx + 1,
      rawLegajo,
      employee: matchedEmp,
      status: rowHasCellError ? 'CELL_ERROR' : 'OK',
      statusLabel: rowHasCellError ? 'Celda(s) con error de formato' : 'Válido',
      cells: rowCells,
    });
  }

  const hasFatalHeaderErrors = invalidColumns.length > 0 || validColumns.length === 0;

  return {
    fatalError: null,
    hasFatalHeaderErrors,
    validColumns,
    invalidColumns,
    rowsPreview,
    validItems,
    activeRowsCount,
    inactiveRowsCount,
    notFoundRowsCount,
    duplicateRowsCount,
    invalidCellsCount,
    overtimeWarningsCount,
    hasSensitiveDeductions,
  };
}
