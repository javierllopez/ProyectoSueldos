import PDFDocument from 'pdfkit';

const CHART_PALETTE = [
  '#0d9488',
  '#2563eb',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#4f46e5',
  '#ea580c',
];

function formatDateAr(val) {
  if (!val) return '-';
  const s = String(val).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(val);
  if (isNaN(dt.getTime())) return String(val);
  return dt.toLocaleDateString('es-AR', { timeZone: 'UTC' });
}

function formatCuitAr(cuit) {
  const digits = String(cuit || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
  }
  return cuit || '-';
}

/**
 * Dibuja un sector circular vectorial (slice de gráfico de torta) usando aproximación poligonal suave.
 */
function drawPieSlice(doc, cx, cy, r, startAngle, endAngle, colorHex) {
  const steps = Math.max(12, Math.ceil(((endAngle - startAngle) / (Math.PI * 2)) * 72));
  doc.save();
  doc.fillColor(colorHex);
  doc.moveTo(cx, cy);
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + ((endAngle - startAngle) * i) / steps;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    doc.lineTo(x, y);
  }
  doc.closePath().fill();
  doc.restore();
}

/**
 * Dibuja un gráfico circular (Donut/Pie) vectorial con leyenda lateral en PDFKit.
 */
function drawVectorPieChart(doc, { x, y, width, height, title, items }) {
  doc.save();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(title, x, y, {
    width,
    align: 'left',
  });

  const chartTop = y + 18;
  const radius = Math.min(48, (height - 28) / 2);
  const cx = x + radius + 8;
  const cy = chartTop + radius + 4;

  const total = items.reduce((acc, it) => acc + (Number(it.value) || 0), 0);

  if (total <= 0) {
    doc.circle(cx, cy, radius).lineWidth(1).strokeColor('#cbd5e1').stroke();
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748b')
      .text('Sin datos en el período', cx - radius, cy - 4, {
        width: radius * 2,
        align: 'center',
      });
    doc.restore();
    return;
  }

  let currentAngle = -Math.PI / 2;
  items.forEach((it, idx) => {
    const val = Number(it.value) || 0;
    if (val <= 0) return;
    const sliceAngle = (val / total) * Math.PI * 2;
    const color = it.color || CHART_PALETTE[idx % CHART_PALETTE.length];
    drawPieSlice(doc, cx, cy, radius, currentAngle, currentAngle + sliceAngle, color);
    currentAngle += sliceAngle;
  });

  // Centro blanco para estilo Donut limpio
  doc.circle(cx, cy, radius * 0.48).fillColor('#ffffff').fill();
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#0f172a')
    .text(String(total), cx - 22, cy - 5, { width: 44, align: 'center' });

  // Leyenda a la derecha
  const legendX = cx + radius + 16;
  const legendWidth = Math.max(80, width - (legendX - x));
  let legendY = chartTop + 2;

  items.slice(0, 7).forEach((it, idx) => {
    const color = it.color || CHART_PALETTE[idx % CHART_PALETTE.length];
    const pct = total > 0 ? ((Number(it.value) / total) * 100).toFixed(1) : '0.0';
    doc.rect(legendX, legendY + 2, 7, 7).fillColor(color).fill();
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor('#1e293b')
      .text(`${it.label}: ${it.value} (${pct}%)`, legendX + 11, legendY, {
        width: legendWidth - 12,
        lineBreak: false,
        ellipsis: true,
      });
    legendY += 13;
  });

  doc.restore();
}

/**
 * Dibuja un gráfico de líneas vectorial (Evolución por período) en PDFKit.
 */
function drawVectorLineChart(doc, { x, y, width, height, title, categories = [], series = [] }) {
  doc.save();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(title, x, y, {
    width,
    align: 'left',
  });

  const padLeft = 28;
  const padRight = 14;
  const padTop = 22;
  const padBottom = 38;
  const plotX = x + padLeft;
  const plotY = y + padTop;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  let maxVal = 0;
  series.forEach((s) => {
    (s.data || []).forEach((v) => {
      if (Number(v) > maxVal) maxVal = Number(v);
    });
  });
  const yMax = Math.max(4, Math.ceil(maxVal * 1.15));
  const yTicks = 4;

  // Líneas horizontales de grilla y escala Y
  for (let i = 0; i <= yTicks; i++) {
    const ratio = i / yTicks;
    const gy = plotY + plotH - ratio * plotH;
    const labelVal = Math.round(ratio * yMax);
    doc
      .moveTo(plotX, gy)
      .lineTo(plotX + plotW, gy)
      .lineWidth(i === 0 ? 0.8 : 0.4)
      .strokeColor(i === 0 ? '#475569' : '#cbd5e1')
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#64748b')
      .text(String(labelVal), x, gy - 4, { width: padLeft - 4, align: 'right' });
  }

  // Etiquetas del eje X
  const nCats = categories.length;
  if (nCats > 0) {
    const step = Math.max(1, Math.ceil(nCats / 10));
    categories.forEach((cat, idx) => {
      if (idx % step !== 0 && idx !== nCats - 1) return;
      const px = nCats === 1 ? plotX + plotW / 2 : plotX + (idx / (nCats - 1)) * plotW;
      doc
        .font('Helvetica')
        .fontSize(6.8)
        .fillColor('#475569')
        .text(String(cat), px - 24, plotY + plotH + 4, { width: 48, align: 'center' });
    });
  }

  // Series de líneas
  series.slice(0, 6).forEach((s, sIdx) => {
    const color = CHART_PALETTE[sIdx % CHART_PALETTE.length];
    const pts = (s.data || []).map((val, idx) => {
      const px = nCats <= 1 ? plotX + plotW / 2 : plotX + (idx / (nCats - 1)) * plotW;
      const py = plotY + plotH - ((Number(val) || 0) / yMax) * plotH;
      return { px, py };
    });

    if (pts.length > 0) {
      doc.save();
      doc.lineWidth(1.5).strokeColor(color);
      pts.forEach((pt, idx) => {
        if (idx === 0) doc.moveTo(pt.px, pt.py);
        else doc.lineTo(pt.px, pt.py);
      });
      if (pts.length > 1) doc.stroke();
      pts.forEach((pt) => {
        doc.circle(pt.px, pt.py, 2.2).fillColor(color).fill();
      });
      doc.restore();
    }
  });

  // Leyenda inferior de series
  let lx = plotX;
  const ly = plotY + plotH + 20;
  series.slice(0, 6).forEach((s, sIdx) => {
    const color = CHART_PALETTE[sIdx % CHART_PALETTE.length];
    const labelText = String(s.name || 'Serie');
    doc.rect(lx, ly + 2, 8, 3).fillColor(color).fill();
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#1e293b')
      .text(labelText, lx + 11, ly - 1, { width: 95, lineBreak: false, ellipsis: true });
    lx += 108;
    if (lx > plotX + plotW - 80) {
      lx = plotX;
    }
  });

  doc.restore();
}

function stampHeadersAndFooters(doc, { company, title, subtitle, metaRight }) {
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  const nowStr = new Date().toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  for (let i = range.start; i < range.start + totalPages; i++) {
    doc.switchToPage(i);
    const prevTop = doc.page.margins.top;
    const prevBottom = doc.page.margins.bottom;
    doc.page.margins.top = 0;
    doc.page.margins.bottom = 0;

    const pageNum = i - range.start + 1;
    const left = 28;
    const width = 595.28 - 56;
    const leftColW = width * 0.62;
    const rightColW = width * 0.36;
    const rightColX = left + width - rightColW;

    // Header (Columna Izquierda: Título + Subtítulo dinámico sin superposición)
    const titleStr = String(title || 'INFORME DISCIPLINARIO').toUpperCase();
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a');
    const titleH = doc.heightOfString(titleStr, { width: leftColW });
    doc.text(titleStr, left, 18, {
      width: leftColW,
      lineBreak: true,
    });

    const subY = 18 + titleH + 2;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#334155')
      .text(subtitle || '', left, subY, {
        width: leftColW,
        lineBreak: false,
      });

    // Header (Columna Derecha: Razón Social + CUIT / Emisión)
    const compNameStr = String(company?.legalName || company?.name || 'EMPRESA');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a');
    const compH = doc.heightOfString(compNameStr, { width: rightColW });
    doc.text(compNameStr, rightColX, 18, {
      width: rightColW,
      align: 'right',
      lineBreak: true,
    });

    const metaY = 18 + compH + 2;
    const rightMetaText = metaRight
      ? `CUIT: ${formatCuitAr(company?.cuit)} | ${metaRight}`
      : `CUIT: ${formatCuitAr(company?.cuit)} | Emisión: ${nowStr}`;
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor('#475569')
      .text(rightMetaText, rightColX, metaY, {
        width: rightColW,
        align: 'right',
        lineBreak: false,
      });

    const headerLineY = Math.max(50, subY + 12, metaY + 12);
    doc
      .moveTo(left, headerLineY)
      .lineTo(left + width, headerLineY)
      .lineWidth(1.1)
      .strokeColor('#0f172a')
      .stroke();

    // Footer fijo en la parte inferior de la hoja A4 sin provocar salto de página
    const footerY = 841.89 - 28;
    doc
      .moveTo(left, footerY - 5)
      .lineTo(left + width, footerY - 5)
      .lineWidth(0.7)
      .strokeColor('#94a3b8')
      .stroke();

    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor('#475569')
      .text(
        `${compNameStr} • Módulo de Personal (Régimen Disciplinario) • Emitido: ${nowStr}`,
        left,
        footerY,
        { width: width * 0.75, lineBreak: false }
      );
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor('#0f172a')
      .text(`Página ${pageNum} de ${totalPages}`, left + width * 0.75, footerY, {
        width: width * 0.25,
        align: 'right',
        lineBreak: false,
      });

    doc.page.margins.top = prevTop;
    doc.page.margins.bottom = prevBottom;
  }
}

/**
 * Genera el PDF A4 de cualquiera de los 4 informes disciplinarios.
 */
export async function exportDisciplinaryReportToPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margins: { top: 64, bottom: 20, left: 28, right: 28 },
      bufferPages: true,
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 28;
    const usableWidth = 595.28 - 56; // 539.28 pt
    const maxY = 841.89 - 52;
    const periodText = `Período: ${formatDateAr(report.dateFrom)} al ${formatDateAr(report.dateTo)}`;

    const ensureSpace = (neededPt) => {
      if (doc.y + neededPt > maxY) {
        doc.addPage();
        doc.y = 64;
      }
    };

    if (report.reportType === 'INCIDENTS_DETAIL') {
      const cols = [
        { label: 'Fecha', width: 52, align: 'left' },
        { label: 'Legajo', width: 48, align: 'left' },
        { label: 'Colaborador', width: 118, align: 'left' },
        { label: 'Sector', width: 78, align: 'left' },
        { label: 'Observaciones del Incidente', width: 155, align: 'left' },
        { label: 'Estado / Sanción', width: 88, align: 'left' },
      ];

      const drawTableHeader = () => {
        ensureSpace(22);
        const y = doc.y;
        let cx = left;
        cols.forEach((c) => {
          doc
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .fillColor('#0f172a')
            .text(c.label.toUpperCase(), cx + 2, y, { width: c.width - 4, align: c.align });
          cx += c.width;
        });
        doc
          .moveTo(left, y + 12)
          .lineTo(left + usableWidth, y + 12)
          .lineWidth(0.9)
          .strokeColor('#0f172a')
          .stroke();
        doc.y = y + 16;
      };

      const groups = report.groups || [];
      if (groups.length === 0) {
        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor('#475569')
          .text('No se registraron incidentes en el rango de fechas seleccionado.', left, 80);
      } else {
        groups.forEach((g) => {
          ensureSpace(42);
          doc.y += 4;
          const gy = doc.y;
          doc
            .font('Helvetica-Bold')
            .fontSize(9.5)
            .fillColor('#0f172a')
            .text(
              `Tipo de Incidente: ${g.code ? `[${g.code}] ` : ''}${g.name} (${g.totalCount} reg. | Sancionados: ${g.sanctionedCount} | Sin sanción: ${g.unsanctionedCount})`,
              left,
              gy,
              { width: usableWidth }
            );
          doc.y = gy + 15;
          drawTableHeader();

          (g.items || []).forEach((inc) => {
            const empName = `${inc.employee?.lastName || ''}, ${inc.employee?.firstName || ''}`.replace(
              /^,\s*/,
              ''
            );
            const deptName = inc.employee?.department?.name || '-';
            const obsText =
              (inc.observations || '-') +
              (inc.attachmentsCount > 0 ? ` [${inc.attachmentsCount} adj.]` : '');
            const statusText = inc.isSanctioned
              ? `Sancionado (${inc.linkedSanctions.map((s) => s.sanctionTypeName).join(', ')})`
              : 'Sin sanción';

            const hName = doc.heightOfString(empName, { width: cols[2].width - 4 });
            const hDept = doc.heightOfString(deptName, { width: cols[3].width - 4 });
            const hObs = doc.heightOfString(obsText, { width: cols[4].width - 4 });
            const hStat = doc.heightOfString(statusText, { width: cols[5].width - 4 });
            const rowH = Math.max(13, hName, hDept, hObs, hStat) + 5;

            if (doc.y + rowH > maxY) {
              doc.addPage();
              doc.y = 64;
              drawTableHeader();
            }

            const ry = doc.y;
            const cells = [
              formatDateAr(inc.incidentDate),
              inc.employee?.fileNumber || '-',
              empName,
              deptName,
              obsText,
              statusText,
            ];
            let cx = left;
            cells.forEach((val, idx) => {
              doc
                .font(idx === 1 ? 'Helvetica-Bold' : 'Helvetica')
                .fontSize(8)
                .fillColor('#1e293b')
                .text(String(val), cx + 2, ry, {
                  width: cols[idx].width - 4,
                  align: cols[idx].align,
                  lineBreak: idx >= 2,
                });
              cx += cols[idx].width;
            });

            doc
              .moveTo(left, ry + rowH - 2)
              .lineTo(left + usableWidth, ry + rowH - 2)
              .lineWidth(0.35)
              .strokeColor('#cbd5e1')
              .stroke();
            doc.y = ry + rowH;
          });

          doc.y += 6;
        });

        ensureSpace(26);
        doc
          .moveTo(left, doc.y)
          .lineTo(left + usableWidth, doc.y)
          .lineWidth(1.1)
          .strokeColor('#0f172a')
          .stroke();
        doc.y += 5;
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#0f172a')
          .text(
            `TOTAL GENERAL DEL PERÍODO: ${report.totals?.totalIncidents || 0} incidente(s)  |  Sancionados: ${report.totals?.sanctionedCount || 0}  |  Sin sanción: ${report.totals?.unsanctionedCount || 0}`,
            left,
            doc.y,
            { width: usableWidth }
          );
      }
    } else if (report.reportType === 'INCIDENTS_STATS') {
      // Tabla de totales por tipo
      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor('#0f172a')
        .text('1. CANTIDADES TOTALES POR TIPO DE INCIDENTE', left, 66);
      doc.y = 82;

      const cols = [
        { label: 'Código', width: 70, align: 'left' },
        { label: 'Tipo de Incidente', width: 220, align: 'left' },
        { label: 'Cantidad', width: 65, align: 'right' },
        { label: '% s/ Total', width: 65, align: 'right' },
        { label: 'Sancionados', width: 60, align: 'right' },
        { label: 'Sin Sanción', width: 59, align: 'right' },
      ];

      let cx = left;
      const hy = doc.y;
      cols.forEach((c) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor('#0f172a')
          .text(c.label.toUpperCase(), cx + 2, hy, { width: c.width - 4, align: c.align });
        cx += c.width;
      });
      doc
        .moveTo(left, hy + 12)
        .lineTo(left + usableWidth, hy + 12)
        .lineWidth(0.9)
        .strokeColor('#0f172a')
        .stroke();
      doc.y = hy + 16;

      (report.byType || []).forEach((row) => {
        ensureSpace(16);
        const ry = doc.y;
        const vals = [
          row.code || '-',
          row.name,
          String(row.count),
          `${Number(row.percentage).toFixed(2)}%`,
          String(row.sanctionedCount),
          String(row.unsanctionedCount),
        ];
        let xPos = left;
        vals.forEach((v, idx) => {
          doc
            .font(idx === 2 ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8)
            .fillColor('#1e293b')
            .text(v, xPos + 2, ry, { width: cols[idx].width - 4, align: cols[idx].align });
          xPos += cols[idx].width;
        });
        doc
          .moveTo(left, ry + 13)
          .lineTo(left + usableWidth, ry + 13)
          .lineWidth(0.35)
          .strokeColor('#cbd5e1')
          .stroke();
        doc.y = ry + 15;
      });

      // Fila total
      const ty = doc.y + 2;
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor('#0f172a')
        .text('TOTAL GENERAL', left + 2, ty, { width: 280 })
        .text(String(report.totals?.totalIncidents || 0), left + 290, ty, {
          width: 63,
          align: 'right',
        })
        .text('100.00%', left + 355, ty, { width: 63, align: 'right' })
        .text(String(report.totals?.sanctionedCount || 0), left + 420, ty, {
          width: 58,
          align: 'right',
        })
        .text(String(report.totals?.unsanctionedCount || 0), left + 480, ty, {
          width: 57,
          align: 'right',
        });
      doc.y = ty + 24;

      // Gráficos Circulares lado a lado
      ensureSpace(150);
      const chartsY = doc.y;
      drawVectorPieChart(doc, {
        x: left,
        y: chartsY,
        width: usableWidth * 0.52,
        height: 135,
        title: '2. % por Tipo de Incidente sobre el Total',
        items: (report.byType || []).map((t, idx) => ({
          label: t.name,
          value: t.count,
          color: CHART_PALETTE[idx % CHART_PALETTE.length],
        })),
      });

      drawVectorPieChart(doc, {
        x: left + usableWidth * 0.54,
        y: chartsY,
        width: usableWidth * 0.46,
        height: 135,
        title: '3. Incidentes Sancionados vs. No Sancionados',
        items: [
          {
            label: 'Sancionados',
            value: report.totals?.sanctionedCount || 0,
            color: '#dc2626',
          },
          {
            label: 'No Sancionados',
            value: report.totals?.unsanctionedCount || 0,
            color: '#0d9488',
          },
        ],
      });

      doc.y = chartsY + 148;
      ensureSpace(190);
      drawVectorLineChart(doc, {
        x: left,
        y: doc.y,
        width: usableWidth,
        height: 175,
        title: '4. Evolución de los Totales por Tipo de Incidente en el Período Listado',
        categories: report.timeline?.categories || [],
        series: report.timeline?.series || [],
      });
    } else if (report.reportType === 'SANCTIONS_DETAIL') {
      const cols = [
        { label: 'Fecha', width: 52, align: 'left' },
        { label: 'Legajo', width: 48, align: 'left' },
        { label: 'Colaborador', width: 118, align: 'left' },
        { label: 'Sector', width: 74, align: 'left' },
        { label: 'Observaciones / Fundamento', width: 135, align: 'left' },
        { label: 'Incidentes Asociados', width: 112, align: 'left' },
      ];

      const drawTableHeader = () => {
        ensureSpace(22);
        const y = doc.y;
        let cx = left;
        cols.forEach((c) => {
          doc
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .fillColor('#0f172a')
            .text(c.label.toUpperCase(), cx + 2, y, { width: c.width - 4, align: c.align });
          cx += c.width;
        });
        doc
          .moveTo(left, y + 12)
          .lineTo(left + usableWidth, y + 12)
          .lineWidth(0.9)
          .strokeColor('#0f172a')
          .stroke();
        doc.y = y + 16;
      };

      const groups = report.groups || [];
      if (groups.length === 0) {
        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor('#475569')
          .text('No se registraron sanciones en el rango de fechas seleccionado.', left, 80);
      } else {
        groups.forEach((g) => {
          ensureSpace(42);
          doc.y += 4;
          const gy = doc.y;
          doc
            .font('Helvetica-Bold')
            .fontSize(9.5)
            .fillColor('#0f172a')
            .text(
              `Tipo de Sanción: ${g.code ? `[${g.code}] ` : ''}${g.name} (${g.totalCount} sanción/es${g.totalSuspensionDays > 0 ? ` | ${g.totalSuspensionDays} día(s) susp.` : ''})`,
              left,
              gy,
              { width: usableWidth }
            );
          doc.y = gy + 15;
          drawTableHeader();

          (g.items || []).forEach((san) => {
            const empName = `${san.employee?.lastName || ''}, ${san.employee?.firstName || ''}`.replace(
              /^,\s*/,
              ''
            );
            const deptName = san.employee?.department?.name || '-';
            const suspTag = san.suspensionDays ? `[${san.suspensionDays} día(s) susp.] ` : '';
            const obsText =
              suspTag +
              (san.observations || '-') +
              (san.attachmentsCount > 0 ? ` [${san.attachmentsCount} adj.]` : '');
            const incText =
              san.linkedIncidents && san.linkedIncidents.length > 0
                ? san.linkedIncidents
                    .map((i) => `${formatDateAr(i.incidentDate)}: ${i.incidentTypeName}`)
                    .join('; ')
                : 'Sin incidente asociado';

            const hName = doc.heightOfString(empName, { width: cols[2].width - 4 });
            const hDept = doc.heightOfString(deptName, { width: cols[3].width - 4 });
            const hObs = doc.heightOfString(obsText, { width: cols[4].width - 4 });
            const hInc = doc.heightOfString(incText, { width: cols[5].width - 4 });
            const rowH = Math.max(13, hName, hDept, hObs, hInc) + 5;

            if (doc.y + rowH > maxY) {
              doc.addPage();
              doc.y = 64;
              drawTableHeader();
            }

            const ry = doc.y;
            const cells = [
              formatDateAr(san.sanctionDate),
              san.employee?.fileNumber || '-',
              empName,
              deptName,
              obsText,
              incText,
            ];
            let cx = left;
            cells.forEach((val, idx) => {
              doc
                .font(idx === 1 ? 'Helvetica-Bold' : 'Helvetica')
                .fontSize(8)
                .fillColor('#1e293b')
                .text(String(val), cx + 2, ry, {
                  width: cols[idx].width - 4,
                  align: cols[idx].align,
                  lineBreak: idx >= 2,
                });
              cx += cols[idx].width;
            });

            doc
              .moveTo(left, ry + rowH - 2)
              .lineTo(left + usableWidth, ry + rowH - 2)
              .lineWidth(0.35)
              .strokeColor('#cbd5e1')
              .stroke();
            doc.y = ry + rowH;
          });

          doc.y += 6;
        });

        ensureSpace(26);
        doc
          .moveTo(left, doc.y)
          .lineTo(left + usableWidth, doc.y)
          .lineWidth(1.1)
          .strokeColor('#0f172a')
          .stroke();
        doc.y += 5;
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#0f172a')
          .text(
            `TOTAL GENERAL DEL PERÍODO: ${report.totals?.totalSanctions || 0} sanción(es)  |  Total Días de Suspensión: ${report.totals?.totalSuspensionDays || 0}`,
            left,
            doc.y,
            { width: usableWidth }
          );
      }
    } else if (report.reportType === 'SANCTIONS_STATS') {
      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor('#0f172a')
        .text('1. CANTIDADES TOTALES POR TIPO DE SANCIÓN', left, 66);
      doc.y = 82;

      const cols = [
        { label: 'Código', width: 70, align: 'left' },
        { label: 'Tipo de Sanción', width: 220, align: 'left' },
        { label: 'Cantidad', width: 65, align: 'right' },
        { label: '% s/ Total', width: 65, align: 'right' },
        { label: 'Días Susp.', width: 60, align: 'right' },
        { label: 'C/ Incidente', width: 59, align: 'right' },
      ];

      let cx = left;
      const hy = doc.y;
      cols.forEach((c) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor('#0f172a')
          .text(c.label.toUpperCase(), cx + 2, hy, { width: c.width - 4, align: c.align });
        cx += c.width;
      });
      doc
        .moveTo(left, hy + 12)
        .lineTo(left + usableWidth, hy + 12)
        .lineWidth(0.9)
        .strokeColor('#0f172a')
        .stroke();
      doc.y = hy + 16;

      (report.byType || []).forEach((row) => {
        ensureSpace(16);
        const ry = doc.y;
        const vals = [
          row.code || '-',
          row.name,
          String(row.count),
          `${Number(row.percentage).toFixed(2)}%`,
          String(row.totalSuspensionDays || 0),
          String(row.withIncidentsCount || 0),
        ];
        let xPos = left;
        vals.forEach((v, idx) => {
          doc
            .font(idx === 2 ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8)
            .fillColor('#1e293b')
            .text(v, xPos + 2, ry, { width: cols[idx].width - 4, align: cols[idx].align });
          xPos += cols[idx].width;
        });
        doc
          .moveTo(left, ry + 13)
          .lineTo(left + usableWidth, ry + 13)
          .lineWidth(0.35)
          .strokeColor('#cbd5e1')
          .stroke();
        doc.y = ry + 15;
      });

      const ty = doc.y + 2;
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor('#0f172a')
        .text('TOTAL GENERAL', left + 2, ty, { width: 280 })
        .text(String(report.totals?.totalSanctions || 0), left + 290, ty, {
          width: 63,
          align: 'right',
        })
        .text('100.00%', left + 355, ty, { width: 63, align: 'right' })
        .text(String(report.totals?.totalSuspensionDays || 0), left + 420, ty, {
          width: 58,
          align: 'right',
        })
        .text(String(report.totals?.withIncidentsCount || 0), left + 480, ty, {
          width: 57,
          align: 'right',
        });
      doc.y = ty + 24;

      ensureSpace(150);
      const chartsY = doc.y;
      drawVectorPieChart(doc, {
        x: left,
        y: chartsY,
        width: usableWidth * 0.65,
        height: 135,
        title: '2. Porcentaje por Tipo de Sanción sobre el Total',
        items: (report.byType || []).map((t, idx) => ({
          label: t.name,
          value: t.count,
          color: CHART_PALETTE[idx % CHART_PALETTE.length],
        })),
      });

      doc.y = chartsY + 148;
      ensureSpace(190);
      drawVectorLineChart(doc, {
        x: left,
        y: doc.y,
        width: usableWidth,
        height: 175,
        title: '3. Evolución de los Totales por Tipo de Sanción en el Período Listado',
        categories: report.timeline?.categories || [],
        series: report.timeline?.series || [],
      });
    }

    stampHeadersAndFooters(doc, {
      company: report.company,
      title: report.title,
      subtitle: periodText,
      metaRight: null,
    });

    doc.end();
  });
}

/**
 * Genera el PDF A4 del Historial Disciplinario de un Colaborador (ordenado de manera inversa por fecha).
 */
export async function exportEmployeeHistoryToPdf(historyData) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margins: { top: 64, bottom: 20, left: 28, right: 28 },
      bufferPages: true,
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 28;
    const usableWidth = 595.28 - 56;
    const maxY = 841.89 - 52;
    const emp = historyData.employee || {};
    const summary = historyData.summary || {};

    // Ficha superior del colaborador
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor('#0f172a')
      .text(
        `Colaborador: ${emp.lastName || ''}, ${emp.firstName || ''}  |  Legajo: ${emp.fileNumber || '-'}  |  CUIL: ${formatCuitAr(emp.cuil)}`,
        left,
        66,
        { width: usableWidth }
      );
    doc
      .font('Helvetica')
      .fontSize(8.2)
      .fillColor('#334155')
      .text(
        `Sector: ${emp.departmentName || '-'}  |  Puesto: ${emp.jobPositionName || '-'}  |  Fecha Ingreso: ${formatDateAr(emp.hireDate)}`,
        left,
        80,
        { width: usableWidth }
      );
    doc
      .font('Helvetica-Bold')
      .fontSize(8.2)
      .fillColor('#0f172a')
      .text(
        `Resumen del Legajo: ${summary.totalEvents || 0} registro(s)  •  Incidentes: ${summary.totalIncidents || 0} (Sancionados: ${summary.sanctionedIncidents || 0})  •  Sanciones: ${summary.totalSanctions || 0}  •  Días Suspensión: ${summary.totalSuspensionDays || 0}`,
        left,
        94,
        { width: usableWidth }
      );

    doc
      .moveTo(left, 109)
      .lineTo(left + usableWidth, 109)
      .lineWidth(0.8)
      .strokeColor('#64748b')
      .stroke();

    doc.y = 116;

    const cols = [
      { label: 'Fecha', width: 54, align: 'left' },
      { label: 'Evento', width: 58, align: 'left' },
      { label: 'Tipo / Clasificación', width: 118, align: 'left' },
      { label: 'Observaciones y Detalle', width: 165, align: 'left' },
      { label: 'Trazabilidad / Vínculo', width: 104, align: 'left' },
      { label: 'Adj.', width: 40, align: 'center' },
    ];

    const drawHeader = () => {
      const y = doc.y;
      let cx = left;
      cols.forEach((c) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor('#0f172a')
          .text(c.label.toUpperCase(), cx + 2, y, { width: c.width - 4, align: c.align });
        cx += c.width;
      });
      doc
        .moveTo(left, y + 12)
        .lineTo(left + usableWidth, y + 12)
        .lineWidth(0.9)
        .strokeColor('#0f172a')
        .stroke();
      doc.y = y + 16;
    };

    const timeline = historyData.timeline || [];
    if (timeline.length === 0) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#475569')
        .text('El colaborador no registra incidentes ni sanciones disciplinarias.', left, doc.y + 8);
    } else {
      drawHeader();
      timeline.forEach((ev) => {
        const kindLabel = ev.recordKind === 'SANCTION' ? 'SANCIÓN' : 'INCIDENTE';
        const typeStr = `${ev.typeCode ? `[${ev.typeCode}] ` : ''}${ev.typeName}${ev.suspensionDays ? ` (${ev.suspensionDays}d susp.)` : ''}`;
        const obsStr = ev.observations || '-';
        const relStr = ev.relatedSummary || '-';
        const attStr = ev.attachmentsCount > 0 ? `${ev.attachmentsCount}` : '-';

        const hType = doc.heightOfString(typeStr, { width: cols[2].width - 4 });
        const hObs = doc.heightOfString(obsStr, { width: cols[3].width - 4 });
        const hRel = doc.heightOfString(relStr, { width: cols[4].width - 4 });
        const rowH = Math.max(13, hType, hObs, hRel) + 5;

        if (doc.y + rowH > maxY) {
          doc.addPage();
          doc.y = 64;
          drawHeader();
        }

        const ry = doc.y;
        const cells = [formatDateAr(ev.eventDate), kindLabel, typeStr, obsStr, relStr, attStr];
        let cx = left;
        cells.forEach((val, idx) => {
          doc
            .font(idx === 1 ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(7.8)
            .fillColor(
              idx === 1 && ev.recordKind === 'SANCTION'
                ? '#b91c1c'
                : idx === 1
                  ? '#0f766e'
                  : '#1e293b'
            )
            .text(String(val), cx + 2, ry, {
              width: cols[idx].width - 4,
              align: cols[idx].align,
              lineBreak: idx >= 2 && idx <= 4,
            });
          cx += cols[idx].width;
        });

        doc
          .moveTo(left, ry + rowH - 2)
          .lineTo(left + usableWidth, ry + rowH - 2)
          .lineWidth(0.35)
          .strokeColor('#cbd5e1')
          .stroke();
        doc.y = ry + rowH;
      });
    }

    stampHeadersAndFooters(doc, {
      company: historyData.company,
      title: 'HISTORIAL DISCIPLINARIO DE PERSONAL (INCIDENTES Y SANCIONES)',
      subtitle: `Legajo ${emp.fileNumber || '-'} — ${emp.lastName || ''}, ${emp.firstName || ''} (Orden cronológico inverso)`,
      metaRight: `Legajo: ${emp.fileNumber || '-'}`,
    });

    doc.end();
  });
}

