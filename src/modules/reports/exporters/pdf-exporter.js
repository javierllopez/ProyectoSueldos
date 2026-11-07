import PDFDocument from 'pdfkit';

/**
 * Calcula el peso relativo de cada columna para distribuir el ancho de la hoja A4 de forma proporcional.
 */
function getColumnWeight(col) {
  const id = String(col.source || col.id || '');
  const fmt = String(col.format || 'TEXT');

  if (id === 'employee.fileNumber' || id === 'payslip.workedDays' || id === 'employee.status') {
    return 0.72;
  }
  if (
    id === 'employee.cuil' ||
    id === 'employee.documentNumber' ||
    id === 'employee.hireDate' ||
    id === 'payslip.paymentMethod' ||
    fmt === 'DATE'
  ) {
    return 0.98;
  }
  if (fmt === 'PERCENT' || fmt === 'PERCENT_GROUP' || fmt === 'PERCENT_TOTAL') {
    return 1.05;
  }
  if (id === 'employee.fullName') {
    return 1.95;
  }
  if (fmt === 'CURRENCY' || fmt === 'NUMBER') {
    return 1.38;
  }
  return 1.3;
}

/**
 * Calcula el ancho en puntos (pt) y la coordenada X de cada columna dentro del ancho útil de la hoja A4.
 */
function computeColumnLayout(columns, startX, usableWidth) {
  if (!columns || columns.length === 0) return { widths: [], offsets: [] };
  const weights = columns.map(getColumnWeight);
  const totalWeight = weights.reduce((acc, w) => acc + w, 0) || 1;

  const widths = weights.map((w) => Math.floor((w / totalWeight) * usableWidth));
  const used = widths.reduce((acc, w) => acc + w, 0);
  const diff = usableWidth - used;

  // Asignar el remanente de redondeo a la columna descriptiva más ancha (ej. Apellido y Nombre)
  const widestIdx = widths.indexOf(Math.max(...widths));
  if (widestIdx >= 0) {
    widths[widestIdx] += diff;
  }

  const offsets = [];
  let accX = startX;
  for (const w of widths) {
    offsets.push(accX);
    accX += w;
  }

  return { widths, offsets };
}

/**
 * Exporta el informe a formato PDF tamaño A4 con orientación automática,
 * encabezado institucional en todas las hojas, columnas proporcionales y pie de página.
 * @param {Object} reportData Datos procesados por executeReportData
 * @param {string} chartImageBase64 Imagen del gráfico renderizado en Base64 (opcional)
 * @returns {Promise<Buffer>} Buffer del archivo PDF generado
 */
export async function exportReportToPdf(reportData, chartImageBase64 = null) {
  return new Promise((resolve, reject) => {
    try {
      const { meta, columns = [], flatRows = [], groupedData, totals } = reportData;
      const isLandscape = columns.length >= 6;
      const margin = 28;

      const doc = new PDFDocument({
        layout: isLandscape ? 'landscape' : 'portrait',
        size: 'A4',
        margin,
        bufferPages: true,
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });

      const pageWidth = doc.page.width - margin * 2;
      const pageHeight = doc.page.height;
      const contentBottomLimit = pageHeight - 42; // Espacio reservado para el pie de página A4

      const { widths: colWidths, offsets: colOffsets } = computeColumnLayout(columns, margin, pageWidth);

      // Cantidad de columnas iniciales no totalizables para etiquetas de Subtotal y Total General
      let leadingLabelCols = 0;
      for (const col of columns) {
        if (!col.totalize && col.format !== 'PERCENT_GROUP' && col.format !== 'PERCENT_TOTAL') {
          leadingLabelCols++;
        } else {
          break;
        }
      }
      if (leadingLabelCols === 0) leadingLabelCols = 1;
      const leadingLabelWidth = colWidths.slice(0, leadingLabelCols).reduce((a, b) => a + b, 0);

      const emittedStr = new Date(meta.generatedAt || Date.now()).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const reportTitleUpper = String(meta.reportTitle || 'INFORME DE LIQUIDACIÓN DE HABERES').toUpperCase();
      const companyTitle = String(meta.companyName || 'EMPRESA').toUpperCase();

      function formatVal(value, format, pct = undefined, showPct = false) {
        if (value === undefined || value === null || value === '') return '-';
        let base = '';
        if (format === 'CURRENCY') {
          const n = Number(value) || 0;
          base = `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else if (format === 'NUMBER') {
          base = Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else if (format === 'PERCENT' || format === 'PERCENT_GROUP' || format === 'PERCENT_TOTAL') {
          base = `${Number(value).toFixed(2)}%`;
        } else {
          base = String(value);
        }
        if (showPct && pct !== undefined && format !== 'PERCENT_GROUP') {
          return `${base} (${Number(pct).toFixed(1)}%)`;
        }
        return base;
      }

      /**
       * Dibuja el encabezado institucional de la hoja (completo en Hoja 1, compacto en Hoja 2+)
       */
      function drawPageHeader(isFirstPage = false) {
        let y = margin;

        if (isFirstPage) {
          // Fila superior institucional: Empresa + CUIT a la izquierda | Período + Emisión a la derecha
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#0F172A');
          doc.text(`${companyTitle}   (CUIT: ${meta.cuit || 'S/D'})`, margin, y, {
            width: pageWidth * 0.55,
            lineBreak: false,
            ellipsis: true,
          });

          doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
          doc.text(
            `Período: ${meta.periodName || '-'}   |   Emisión: ${emittedStr}   |   Legajos: ${meta.totalRows ?? 0}`,
            margin + pageWidth * 0.45,
            y,
            {
              width: pageWidth * 0.55,
              align: 'right',
              lineBreak: false,
              ellipsis: true,
            }
          );

          y += 14;

          // Recuadro destacado para el Título del Informe
          doc.rect(margin, y, pageWidth, 24).fillAndStroke('#F8FAFC', '#CBD5E1');
          doc.rect(margin, y, 4, 24).fill('#1E3A8A');
          doc.font('Helvetica-Bold').fontSize(12).fillColor('#0F172A');
          doc.text(reportTitleUpper, margin + 12, y + 6, {
            width: pageWidth - 20,
            align: 'left',
            lineBreak: false,
            ellipsis: true,
          });

          y += 30;
        } else {
          // Encabezado de continuación para Hoja 2 en adelante
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0F172A');
          doc.text(`${reportTitleUpper} (Continuación)`, margin, y, {
            width: pageWidth * 0.55,
            lineBreak: false,
            ellipsis: true,
          });

          doc.font('Helvetica').fontSize(8).fillColor('#475569');
          doc.text(
            `${companyTitle} (CUIT: ${meta.cuit || 'S/D'})   •   Período: ${meta.periodName || '-'}`,
            margin + pageWidth * 0.45,
            y + 1,
            {
              width: pageWidth * 0.55,
              align: 'right',
              lineBreak: false,
              ellipsis: true,
            }
          );

          y += 13;
          doc.moveTo(margin, y).lineTo(margin + pageWidth, y).lineWidth(1).strokeColor('#1E3A8A').stroke();
          y += 5;
        }

        return y;
      }

      /**
       * Dibuja los encabezados de columna de la tabla
       */
      function drawTableHeader(y) {
        const headerHeight = 24;
        doc.rect(margin, y, pageWidth, headerHeight).fill('#1E3A8A');

        columns.forEach((col, idx) => {
          const x = colOffsets[idx];
          const w = colWidths[idx];

          // Separador vertical sutil entre columnas
          if (idx > 0) {
            doc
              .moveTo(x, y + 3)
              .lineTo(x, y + headerHeight - 3)
              .lineWidth(0.5)
              .strokeColor('#3B82F6')
              .stroke();
          }

          doc.font('Helvetica-Bold').fontSize(7.8).fillColor('#FFFFFF');
          const titleStr = String(col.title || '');
          const textY = titleStr.length > 22 ? y + 4 : y + 8;

          doc.text(titleStr, x + 4, textY, {
            width: w - 8,
            height: headerHeight - 4,
            align: col.align || 'left',
            ellipsis: true,
          });
        });

        return y + headerHeight;
      }

      // Dibujar encabezado de la Hoja 1
      let currentY = drawPageHeader(true);

      // Si hay gráfico embebido, insertarlo en la Hoja 1
      if (chartImageBase64) {
        try {
          const cleanBase64 = chartImageBase64.replace(/^data:image\/\w+;base64,/, '');
          const imgBuffer = Buffer.from(cleanBase64, 'base64');
          const chartBoxH = isLandscape ? 145 : 165;
          doc.image(imgBuffer, margin, currentY, {
            fit: [pageWidth, chartBoxH],
            align: 'center',
            valign: 'center',
          });
          currentY += chartBoxH + 8;
        } catch (err) {
          console.warn('No se pudo insertar el gráfico en el PDF:', err.message);
        }
      }

      currentY = drawTableHeader(currentY);

      function startNewPage() {
        doc.addPage();
        currentY = drawPageHeader(false);
        currentY = drawTableHeader(currentY);
      }

      function checkPageBreak(requiredHeight = 16) {
        if (currentY + requiredHeight > contentBottomLimit) {
          startNewPage();
        }
      }

      // Renderizado de Filas
      if (groupedData && groupedData.groups && groupedData.groups.length > 0) {
        const subtotalPos = meta.subtotalPosition || 'FOOTER';
        const showPct = meta.showGroupPercentOfTotal !== false;

        function renderPdfSubtotal(group) {
          if (!group.subtotals || Object.keys(group.subtotals).length === 0) return;
          const rowH = 16;
          checkPageBreak(rowH);

          doc.rect(margin, currentY, pageWidth, rowH).fillAndStroke('#EEF2FF', '#94A3B8');
          doc.font('Helvetica-Bold').fontSize(7.6).fillColor('#1E1B4B');

          // Etiqueta de subtotal ocupando el ancho combinado de las columnas descriptivas iniciales
          doc.text(`Subtotal ${group.groupKey}:`, margin + 4, currentY + 4, {
            width: leadingLabelWidth - 8,
            height: 11,
            align: 'left',
            ellipsis: true,
            lineBreak: false,
          });

          columns.forEach((col, cIdx) => {
            if (cIdx < leadingLabelCols) return;
            if (
              (col.totalize || col.format === 'PERCENT_GROUP' || col.format === 'PERCENT_TOTAL') &&
              group.subtotals[col.id] !== undefined
            ) {
              const pct = group.groupPercentages ? group.groupPercentages[col.id] : undefined;
              doc.text(
                formatVal(group.subtotals[col.id], col.format, pct, showPct),
                colOffsets[cIdx] + 3,
                currentY + 4,
                {
                  width: colWidths[cIdx] - 6,
                  height: 11,
                  align: col.align || 'right',
                  ellipsis: true,
                  lineBreak: false,
                }
              );
            }
          });

          currentY += rowH;
        }

        function renderPdfGroup(group, depth = 0) {
          // Evitar encabezado de grupo huérfano al final de la hoja
          const minNeededForGroupStart = subtotalPos === 'HEADER' ? 48 : 34;
          checkPageBreak(minNeededForGroupStart);

          const groupH = 16;
          doc.rect(margin, currentY, pageWidth, groupH).fillAndStroke('#DBEAFE', '#93C5FD');
          doc.font('Helvetica-Bold').fontSize(8.2).fillColor('#1E3A8A');
          const label = group.groupFieldLabel || group.groupField;
          doc.text(
            `${'   '.repeat(depth)}▶ ${label}: ${group.groupKey}   (${group.count} ${group.count === 1 ? 'legajo' : 'legajos'})`,
            margin + 6,
            currentY + 4,
            {
              width: pageWidth - 12,
              height: 11,
              ellipsis: true,
              lineBreak: false,
            }
          );
          currentY += groupH;

          if (subtotalPos === 'HEADER') {
            renderPdfSubtotal(group);
          }

          if (group.isLeaf && group.rows) {
            group.rows.forEach((row, rIdx) => {
              const rowH = 14;
              checkPageBreak(rowH);

              const bg = rIdx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
              doc.rect(margin, currentY, pageWidth, rowH).fill(bg);
              doc
                .moveTo(margin, currentY + rowH)
                .lineTo(margin + pageWidth, currentY + rowH)
                .lineWidth(0.3)
                .strokeColor('#E2E8F0')
                .stroke();

              doc.font('Helvetica').fontSize(7.6).fillColor('#0F172A');
              columns.forEach((col, cIdx) => {
                doc.text(formatVal(row[col.id], col.format), colOffsets[cIdx] + 3, currentY + 3, {
                  width: colWidths[cIdx] - 6,
                  height: 10,
                  align: col.align || 'left',
                  ellipsis: true,
                  lineBreak: false,
                });
              });
              currentY += rowH;
            });
          } else if (group.groups) {
            for (const child of group.groups) {
              renderPdfGroup(child, depth + 1);
            }
          }

          if (subtotalPos !== 'HEADER') {
            renderPdfSubtotal(group);
          }

          currentY += 3;
        }

        for (const g of groupedData.groups) {
          renderPdfGroup(g);
        }
      } else if (flatRows && flatRows.length > 0) {
        flatRows.forEach((row, rIdx) => {
          const rowH = 14;
          checkPageBreak(rowH);

          const bg = rIdx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
          doc.rect(margin, currentY, pageWidth, rowH).fill(bg);
          doc
            .moveTo(margin, currentY + rowH)
            .lineTo(margin + pageWidth, currentY + rowH)
            .lineWidth(0.3)
            .strokeColor('#E2E8F0')
            .stroke();

          doc.font('Helvetica').fontSize(7.6).fillColor('#0F172A');
          columns.forEach((col, cIdx) => {
            doc.text(formatVal(row[col.id], col.format), colOffsets[cIdx] + 3, currentY + 3, {
              width: colWidths[cIdx] - 6,
              height: 10,
              align: col.align || 'left',
              ellipsis: true,
              lineBreak: false,
            });
          });
          currentY += rowH;
        });
      } else {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#64748B');
        doc.text('No se encontraron registros para los criterios seleccionados.', margin, currentY + 10, {
          width: pageWidth,
          align: 'center',
          lineBreak: false,
        });
        currentY += 26;
      }

      // Fila de Total General
      if (totals && Object.keys(totals).length > 0) {
        const totalH = 20;
        checkPageBreak(totalH + 4);
        currentY += 2;

        doc.rect(margin, currentY, pageWidth, totalH).fill('#0F172A');
        doc.font('Helvetica-Bold').fontSize(8.2).fillColor('#FFFFFF');

        doc.text(`TOTAL GENERAL (${meta.totalRows ?? 0} legajos):`, margin + 5, currentY + 5, {
          width: leadingLabelWidth - 10,
          height: 12,
          align: 'left',
          ellipsis: true,
          lineBreak: false,
        });

        columns.forEach((col, cIdx) => {
          if (cIdx < leadingLabelCols) return;
          if (
            (col.totalize || col.format === 'PERCENT_GROUP' || col.format === 'PERCENT_TOTAL') &&
            totals[col.id] !== undefined
          ) {
            doc.text(formatVal(totals[col.id], col.format), colOffsets[cIdx] + 3, currentY + 5, {
              width: colWidths[cIdx] - 6,
              height: 12,
              align: col.align || 'right',
              ellipsis: true,
              lineBreak: false,
            });
          }
        });
        currentY += totalH;
      }

      // Pie de página en todas las hojas con datos relevantes y numeración exacta
      const range = doc.bufferedPageRange();
      const footerY = pageHeight - 26;
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const prevBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;

        doc
          .moveTo(margin, footerY - 4)
          .lineTo(margin + pageWidth, footerY - 4)
          .lineWidth(0.5)
          .strokeColor('#CBD5E1')
          .stroke();

        doc.font('Helvetica').fontSize(7.2).fillColor('#475569');
        doc.text(
          `${companyTitle} (CUIT: ${meta.cuit || 'S/D'}) — Período: ${meta.periodName || '-'}`,
          margin,
          footerY,
          { width: pageWidth * 0.45, align: 'left', lineBreak: false, ellipsis: true }
        );

        doc.text(`${reportTitleUpper} — Emitido: ${emittedStr}`, margin + pageWidth * 0.3, footerY, {
          width: pageWidth * 0.4,
          align: 'center',
          lineBreak: false,
          ellipsis: true,
        });

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0F172A');
        doc.text(`Página ${i + 1} de ${range.count}`, margin + pageWidth * 0.75, footerY, {
          width: pageWidth * 0.25,
          align: 'right',
          lineBreak: false,
        });

        doc.page.margins.bottom = prevBottom;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
