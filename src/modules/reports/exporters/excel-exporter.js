import ExcelJS from 'exceljs';

/**
 * Neutraliza cadenas que comiencen con caracteres disparadores de fórmula en Excel (=, +, -, @).
 */
export function sanitizeExcelText(value) {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (/^[=+\-@]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Exporta el informe a formato Microsoft Excel (.xlsx) con soporte de gráficos embebidos.
 * @param {Object} reportData Datos procesados por executeReportData
 * @param {string} chartImageBase64 Imagen del gráfico renderizado en Base64 (opcional)
 * @returns {Promise<Buffer>} Buffer del archivo Excel generado
 */
export async function exportReportToExcel(reportData, chartImageBase64 = null) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ProyectoSueldos SaaS';
  workbook.lastModifiedBy = 'Report Engine';
  workbook.created = new Date();

  const { meta, columns, flatRows, groupedData, totals } = reportData;
  const isLandscape = (columns?.length || 0) >= 6;

  const worksheet = workbook.addWorksheet('Informe', {
    pageSetup: {
      orientation: isLandscape ? 'landscape' : 'portrait',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
    headerFooter: {
      oddHeader: `&L&B${meta.companyName || 'Empresa'} (CUIT: ${meta.cuit || 'S/D'})&C&B${meta.reportTitle || 'Informe'}&RPeríodo: ${meta.periodName || '-'}`,
      oddFooter: `&L${meta.reportTitle || 'Informe'}&CEmitido: ${new Date(meta.generatedAt || Date.now()).toLocaleDateString('es-AR')}&RPágina &P de &N`,
    },
  });

  let currentRow = 1;

  // 1. Cabecera Institucional
  worksheet.mergeCells(currentRow, 1, currentRow, Math.max(columns.length, 6));
  const titleCell = worksheet.getCell(currentRow, 1);
  titleCell.value = `${meta.companyName.toUpperCase()} - CUIT: ${meta.cuit}`;
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1F2937' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  currentRow++;

  worksheet.mergeCells(currentRow, 1, currentRow, Math.max(columns.length, 6));
  const subCell = worksheet.getCell(currentRow, 1);
  subCell.value = `${meta.reportTitle || 'Informe de Liquidación de Haberes'} | Período: ${meta.periodName} | Emisión: ${new Date(meta.generatedAt).toLocaleString('es-AR')}`;
  subCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF4B5563' } };
  currentRow += 2;

  // 2. Insertar Gráfico si fue provisto
  if (chartImageBase64) {
    try {
      const cleanBase64 = chartImageBase64.replace(/^data:image\/\w+;base64,/, '');
      const imageId = workbook.addImage({
        base64: cleanBase64,
        extension: 'png',
      });

      // Posicionar el gráfico ocupando 14 filas
      const startRow = currentRow;
      const endRow = currentRow + 14;
      worksheet.addImage(imageId, {
        tl: { col: 0.5, row: startRow },
        br: { col: Math.min(columns.length, 7) + 0.5, row: endRow },
      });
      currentRow = endRow + 2;
    } catch (err) {
      console.warn('No se pudo insertar el gráfico en el Excel:', err.message);
    }
  }

  // 3. Fila de Encabezados de Columna
  const headerRowIndex = currentRow;
  worksheet.pageSetup.printTitlesRow = `${headerRowIndex}:${headerRowIndex}`;
  columns.forEach((col, idx) => {
    const cell = worksheet.getCell(headerRowIndex, idx + 1);
    cell.value = col.title;
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' }, // Navy / Azul corporativo
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: col.align || 'left',
    };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'medium' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
  currentRow++;

  // Función auxiliar para formatear celdas según tipo
  function styleDataCell(cell, value, format, align) {
    cell.font = { name: 'Arial', size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: align || 'left' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };

    if (format === 'CURRENCY') {
      cell.value = typeof value === 'number' ? value : Number(value) || 0;
      cell.numFmt = '"$"#,##0.00;[Red]"-$"#,##0.00;"$0.00"';
    } else if (format === 'NUMBER') {
      cell.value = typeof value === 'number' ? value : Number(value) || 0;
      cell.numFmt = '#,##0.00';
    } else if (format === 'PERCENT' || format === 'PERCENT_GROUP' || format === 'PERCENT_TOTAL') {
      cell.value = (Number(value) || 0) / 100;
      cell.numFmt = '0.00%';
    } else {
      cell.value = sanitizeExcelText(value);
    }
  }

  function formatSubtotalText(val, fmt, pct, showPct) {
    let base = '';
    const n = Number(val) || 0;
    if (fmt === 'CURRENCY') {
      base = `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else if (fmt === 'PERCENT' || fmt === 'PERCENT_GROUP' || fmt === 'PERCENT_TOTAL') {
      base = `${n.toFixed(2)}%`;
    } else {
      base = n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (showPct && pct !== undefined && fmt !== 'PERCENT_GROUP') {
      return `${base} (${Number(pct).toFixed(1)}%)`;
    }
    return base;
  }

  // 4. Renderizar Filas (con o sin agrupación)
  if (groupedData && groupedData.groups && groupedData.groups.length > 0) {
    const subtotalPos = meta.subtotalPosition || 'FOOTER';
    const showPct = meta.showGroupPercentOfTotal !== false;

    function renderSubtotalRow(group) {
      if (!group.subtotals || Object.keys(group.subtotals).length === 0) return;
      columns.forEach((col, idx) => {
        const cell = worksheet.getCell(currentRow, idx + 1);
        if (idx === 0) {
          cell.value = `Subtotal ${group.groupKey}:`;
          cell.font = { name: 'Arial', size: 10, bold: true, italic: true };
        } else if ((col.totalize || col.format === 'PERCENT_GROUP' || col.format === 'PERCENT_TOTAL') && group.subtotals[col.id] !== undefined) {
          const pct = group.groupPercentages ? group.groupPercentages[col.id] : undefined;
          cell.value = formatSubtotalText(group.subtotals[col.id], col.format, pct, showPct);
          cell.alignment = { vertical: 'middle', horizontal: col.align || 'right' };
          cell.font = { name: 'Arial', size: 10, bold: true };
        }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF3F4F6' },
        };
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
        };
      });
      currentRow++;
    }

    function renderGroup(group, depth = 0) {
      // Fila de Encabezado de Grupo
      worksheet.mergeCells(currentRow, 1, currentRow, columns.length);
      const groupCell = worksheet.getCell(currentRow, 1);
      const label = group.groupFieldLabel || group.groupField;
      groupCell.value = `${'  '.repeat(depth)}▶ ${label}: ${group.groupKey} (${group.count} empleados)`;
      groupCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E40AF' } };
      groupCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEFF6FF' }, // Azul suave
      };
      currentRow++;

      if (subtotalPos === 'HEADER') {
        renderSubtotalRow(group);
      }

      if (group.isLeaf && group.rows) {
        for (const row of group.rows) {
          columns.forEach((col, idx) => {
            const cell = worksheet.getCell(currentRow, idx + 1);
            styleDataCell(cell, row[col.id], col.format, col.align);
          });
          currentRow++;
        }
      } else if (group.groups) {
        for (const childGroup of group.groups) {
          renderGroup(childGroup, depth + 1);
        }
      }

      if (subtotalPos !== 'HEADER') {
        renderSubtotalRow(group);
      }
    }

    for (const g of groupedData.groups) {
      renderGroup(g);
    }
  } else {
    // Renderizado plano
    for (const row of flatRows) {
      columns.forEach((col, idx) => {
        const cell = worksheet.getCell(currentRow, idx + 1);
        styleDataCell(cell, row[col.id], col.format, col.align);
      });
      currentRow++;
    }
  }

  // 5. Fila de Total General
  if (totals && Object.keys(totals).length > 0) {
    currentRow++;
    columns.forEach((col, idx) => {
      const cell = worksheet.getCell(currentRow, idx + 1);
      if (idx === 0) {
        cell.value = `TOTAL GENERAL (${meta.totalRows ?? 0} legajos):`;
        cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF111827' } };
      } else if ((col.totalize || col.format === 'PERCENT_GROUP' || col.format === 'PERCENT_TOTAL') && totals[col.id] !== undefined) {
        styleDataCell(cell, totals[col.id], col.format, col.align);
        cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF111827' } };
      }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'double', color: { argb: 'FF000000' } },
      };
    });
    currentRow++;
  }

  // 6. Auto-ajuste de ancho de columnas
  columns.forEach((col, idx) => {
    const column = worksheet.getColumn(idx + 1);
    let maxLen = col.title.length + 4;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const cellLen = cell.value ? String(cell.value).length : 0;
      if (cellLen > maxLen && cellLen < 50) {
        maxLen = cellLen + 2;
      }
    });
    column.width = Math.max(maxLen, 12);
  });

  return await workbook.xlsx.writeBuffer();
}

