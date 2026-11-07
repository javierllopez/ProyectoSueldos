import { apiRequest, showToast, storage } from '../api.js';

let reportsChartInstance = null;
let wizardPreviewChartInstance = null;
let currentReportExecutionData = null;
let availableMetadata = null;
let activeTemplateId = null;
let loadedCompanyId = null;

// Estado reactivo del Asistente Modal de 6 Pasos
let wizardStep = 1;
let wizardCatalogTab = 'totals'; // 'totals' | 'concepts'
let wizardEditingColIndex = null; // null = creando nueva, number = editando existente
let wizardState = {
  name: '',
  reportTitle: '',
  description: '',
  category: 'PAYROLL',
  hrFields: [],
  payrollColumns: [],
  draftPayCol: {
    title: '',
    format: 'CURRENCY',
    terms: [],
  },
  groupings: [],
  subtotalPosition: 'FOOTER',
  showGroupPercentOfTotal: true,
  chart: {
    enabled: false,
    type: 'bar',
    title: 'Resumen Gráfico por Sector',
    xAxisField: 'department.name',
    yAxisField: '',
    aggregation: 'SUM',
  },
};

const STEP_SUBTITLES = {
  1: 'Paso 1 de 6: Seleccioná las columnas con los datos del personal a incluir',
  2: 'Paso 2 de 6: Diseñá las columnas de liquidación sumando o restando conceptos y totales',
  3: 'Paso 3 de 6: Configurá la agrupación de datos, ubicación de subtotales y % sobre el total',
  4: 'Paso 4 de 6: Elegí si deseás incluir un gráfico ejecutivo de los datos listados',
  5: 'Paso 5 de 6: Asignale un nombre a la plantilla, descripción y título al informe',
  6: 'Paso 6 de 6: Verificá la vista previa del informe terminado y confirmá su guardado',
};

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let runnerTemplatesCache = [];
let runnerPeriodsCache = [];
let runnerLastParams = {
  templateId: '',
  periodFromId: '',
  periodToId: '',
  multiPeriodMode: 'SUM',
  groupFilterLevel1: 'ALL',
  groupFilterLevel2: 'ALL',
  employeeFrom: 'ALL',
  employeeTo: 'ALL',
};

const GROUP_FIELD_FRIENDLY_LABELS = {
  'department.name': 'Departamento / Sector',
  'jobPosition.name': 'Puesto / Cargo',
  'jobPosition.cct': 'Convenio Colectivo (CCT)',
  'employee.payrollGroup': 'Grupo de Pago',
  'employee.status': 'Estado (Activo/Inactivo)',
  'employee.fileNumber': 'Legajo',
  'payslip.paymentMethod': 'Forma de Pago',
  'payslip.bankName': 'Banco',
};

function ensureReportsTenantFreshness() {
  const currentCompanyId = storage.getActiveCompanyId() || null;
  if (loadedCompanyId !== currentCompanyId) {
    loadedCompanyId = currentCompanyId;
    availableMetadata = null;
    activeTemplateId = null;
    currentReportExecutionData = null;
    runnerTemplatesCache = [];
    runnerPeriodsCache = [];
    runnerLastParams = {
      templateId: '',
      periodFromId: '',
      periodToId: '',
      multiPeriodMode: 'SUM',
      groupFilterLevel1: 'ALL',
      groupFilterLevel2: 'ALL',
      employeeFrom: 'ALL',
      employeeTo: 'ALL',
    };
    if (reportsChartInstance) {
      reportsChartInstance.destroy();
      reportsChartInstance = null;
    }
    if (wizardPreviewChartInstance) {
      wizardPreviewChartInstance.destroy();
      wizardPreviewChartInstance = null;
    }
  }
}

function formatCellValue(val, fmt) {
  if (val === undefined || val === null || val === '') return '-';
  if (fmt === 'CURRENCY') {
    const n = Number(val) || 0;
    return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (fmt === 'NUMBER') {
    return Number(val).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (fmt === 'PERCENT' || fmt === 'PERCENT_GROUP' || fmt === 'PERCENT_TOTAL') {
    return `${Number(val).toFixed(2)}%`;
  }
  return escapeHtml(val);
}

function formatSubtotalWithPct(val, fmt, pct, showPct) {
  const base = formatCellValue(val, fmt);
  if (showPct && pct !== undefined && fmt !== 'PERCENT_GROUP') {
    return `${base} <span class="badge bg-indigo-lt ms-1 fw-bold" style="font-size: 0.7rem;">(${Number(pct).toFixed(1)}%)</span>`;
  }
  return base;
}

const FORMAT_BADGE_LABELS = {
  CURRENCY: 'Moneda ($)',
  NUMBER: 'Número',
  PERCENT_GROUP: '% s/ Grupo',
  PERCENT_TOTAL: '% s/ Total',
  PERCENT: 'Porcentaje %',
  TEXT: 'Texto',
  DATE: 'Fecha',
};

export function registerReportsMethods(proto) {
  /**
   * Inicializa la vista del emisor de informes (Report Runner) y lanza el modal de emisión
   */
  proto.renderReportsRunnerView = async function (options = { openModal: true }) {
    try {
      ensureReportsTenantFreshness();
      this.setupReportsEvents();

      const loadMetaPromise = (async () => {
        if (!availableMetadata || !availableMetadata.employeesCatalog) {
          try {
            const metaRes = await apiRequest('/reports/metadata/fields');
            availableMetadata = metaRes.data;
          } catch (metaErr) {
            console.error('Error al cargar metadatos de informes:', metaErr);
          }
        }
      })();

      await Promise.all([
        loadMetaPromise,
        this.loadReportsTemplatesList(),
        this.loadReportsPeriodsDropdown(),
      ]);

      this.populateRunnerModalEmployees();
      this.syncRunnerModalGroupFilters();
      this.syncRunnerModalPeriodBadge();

      if (options?.openModal !== false) {
        this.openReportRunnerModal();
      } else if (runnerLastParams.templateId) {
        this.executeCurrentReport();
      }
    } catch (err) {
      console.error('Error al inicializar emisor de informes:', err);
    }
  };

  /**
   * Abre el formulario modal de parámetros de emisión de informes
   */
  proto.openReportRunnerModal = async function () {
    const modalEl = document.getElementById('modal-report-runner-params');
    if (!modalEl || !window.bootstrap) return;

    const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    if (runnerTemplatesCache.length === 0) {
      await this.loadReportsTemplatesList();
    }
    if (runnerPeriodsCache.length === 0) {
      await this.loadReportsPeriodsDropdown();
    }
    if (!availableMetadata || !availableMetadata.employeesCatalog) {
      try {
        const metaRes = await apiRequest('/reports/metadata/fields');
        availableMetadata = metaRes.data;
      } catch (err) {
        console.error('Error al cargar metadatos en modal de emisión:', err);
      }
    }

    this.populateRunnerModalEmployees();
    this.syncRunnerModalGroupFilters(true);
    this.syncRunnerModalPeriodBadge();
  };

  /**
   * Carga las plantillas en el selector del modal y sincroniza el selector oculto
   */
  proto.loadReportsTemplatesList = async function () {
    const selectHidden = document.getElementById('reports-runner-template-select');
    const selectModal = document.getElementById('rr-modal-template-select');

    try {
      const res = await apiRequest('/reports/templates');
      const templates = res.data || [];
      runnerTemplatesCache = templates;

      const buildOptionsHtml = () => {
        if (templates.length === 0) {
          return '<option value="">(No hay plantillas guardadas - Diseñá una nueva)</option>';
        }
        return templates
          .map(
            (t) =>
              `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)} ${t.isSystem ? '★ (Predeterminada)' : ''}</option>`
          )
          .join('');
      };

      const html = buildOptionsHtml();
      if (selectHidden) selectHidden.innerHTML = html;
      if (selectModal) selectModal.innerHTML = html;

      const chosenId =
        (activeTemplateId && templates.some((t) => t.id === activeTemplateId) && activeTemplateId) ||
        (runnerLastParams.templateId && templates.some((t) => t.id === runnerLastParams.templateId) && runnerLastParams.templateId) ||
        templates[0]?.id ||
        '';

      activeTemplateId = chosenId;
      runnerLastParams.templateId = chosenId;
      if (selectHidden) selectHidden.value = chosenId;
      if (selectModal) selectModal.value = chosenId;
    } catch (err) {
      console.error('Error al cargar lista de plantillas:', err);
      showToast('Error al cargar plantillas de informe', 'danger');
    }
  };

  /**
   * Carga los períodos en los selectores Desde / Hasta del modal (por defecto ambos en el último período liquidado)
   */
  proto.loadReportsPeriodsDropdown = async function () {
    const selectHidden = document.getElementById('reports-runner-period-select');
    const selectFrom = document.getElementById('rr-modal-period-from');
    const selectTo = document.getElementById('rr-modal-period-to');

    try {
      const res = await apiRequest('/payroll/periods?limit=50');
      const rawPeriods = res.data?.periods || res.data || [];
      runnerPeriodsCache = rawPeriods;

      // Determinar el último período con liquidación activa (preferir MONTHLY más reciente)
      let defaultPeriodId = rawPeriods[0]?.id || '';
      const monthlyPeriods = rawPeriods.filter((p) => (p.periodType || p.type) === 'MONTHLY');
      if (monthlyPeriods.length > 0) {
        defaultPeriodId = monthlyPeriods[0].id;
      }

      const optionsHtml =
        rawPeriods.length === 0
          ? '<option value="">(Sin períodos registrados)</option>'
          : rawPeriods
              .map((p) => {
                const mm = String(p.month || 1).padStart(2, '0');
                const label = `${mm}/${p.year} - ${p.settlementName || p.name || p.periodType || p.type}`;
                return `<option value="${escapeHtml(p.id)}">${escapeHtml(label)}</option>`;
              })
              .join('');

      if (selectHidden) selectHidden.innerHTML = optionsHtml;
      if (selectFrom) selectFrom.innerHTML = optionsHtml;
      if (selectTo) selectTo.innerHTML = optionsHtml;

      const fromId =
        runnerLastParams.periodFromId && rawPeriods.some((p) => p.id === runnerLastParams.periodFromId)
          ? runnerLastParams.periodFromId
          : defaultPeriodId;
      const toId =
        runnerLastParams.periodToId && rawPeriods.some((p) => p.id === runnerLastParams.periodToId)
          ? runnerLastParams.periodToId
          : defaultPeriodId;

      runnerLastParams.periodFromId = fromId;
      runnerLastParams.periodToId = toId;

      if (selectHidden) selectHidden.value = fromId;
      if (selectFrom) selectFrom.value = fromId;
      if (selectTo) selectTo.value = toId;
    } catch (err) {
      console.error('Error al cargar períodos:', err);
    }
  };

  /**
   * Puebla los selectores de Legajo Desde y Legajo Hasta con la opción "Todos" y el padrón ordenado
   */
  proto.populateRunnerModalEmployees = function () {
    const selFrom = document.getElementById('rr-modal-emp-from');
    const selTo = document.getElementById('rr-modal-emp-to');
    if (!selFrom || !selTo) return;

    const employees = availableMetadata?.employeesCatalog || [];
    const empOpts = employees
      .map(
        (e) =>
          `<option value="${escapeHtml(e.fileNumber)}">Legajo ${escapeHtml(e.fileNumber)} — ${escapeHtml(e.fullName)}</option>`
      )
      .join('');

    selFrom.innerHTML = `<option value="ALL">Todos (Desde el primer legajo)</option>` + empOpts;
    selTo.innerHTML = `<option value="ALL">Todos (Hasta el último legajo)</option>` + empOpts;

    selFrom.value = runnerLastParams.employeeFrom || 'ALL';
    selTo.value = runnerLastParams.employeeTo || 'ALL';
  };

  /**
   * Sincroniza dinámicamente los selectores de Filtro por Grupo (Nivel 1 y Nivel 2) según la plantilla elegida
   */
  proto.syncRunnerModalGroupFilters = function (preserveSelection = false) {
    const selectModal = document.getElementById('rr-modal-template-select');
    const infoBadge = document.getElementById('rr-modal-template-info-badge');
    const groupStatusBadge = document.getElementById('rr-modal-group-status-badge');
    const noGroupBox = document.getElementById('rr-modal-no-group-box');
    const groupsRow = document.getElementById('rr-modal-groups-row');
    const g1Col = document.getElementById('rr-modal-group1-col');
    const g2Col = document.getElementById('rr-modal-group2-col');
    const g1Label = document.getElementById('rr-modal-group1-label');
    const g2Label = document.getElementById('rr-modal-group2-label');
    const g1Select = document.getElementById('rr-modal-group1-select');
    const g2Select = document.getElementById('rr-modal-group2-select');

    const tplId = selectModal?.value || runnerLastParams.templateId;
    const tpl = runnerTemplatesCache.find((t) => t.id === tplId);
    const cfg = tpl
      ? typeof tpl.config === 'string'
        ? JSON.parse(tpl.config)
        : tpl.config
      : null;

    const colsCount = (cfg?.fields || []).length;
    const groupings = (cfg?.groupings || []).filter(Boolean);

    if (infoBadge) {
      infoBadge.textContent = tpl
        ? `${colsCount} columnas • ${groupings.length > 0 ? `${groupings.length} nivel(es) de grupo` : 'Sin agrupación'}`
        : '-';
    }

    if (!cfg || groupings.length === 0) {
      if (groupStatusBadge) groupStatusBadge.textContent = 'Sin agrupación (Todos)';
      if (noGroupBox) noGroupBox.classList.remove('d-none');
      if (groupsRow) groupsRow.classList.add('d-none');
      if (g1Select) g1Select.value = 'ALL';
      if (g2Select) g2Select.value = 'ALL';
      return;
    }

    if (noGroupBox) noGroupBox.classList.add('d-none');
    if (groupsRow) groupsRow.classList.remove('d-none');

    const g1Field = groupings[0];
    const g2Field = groupings[1] || null;
    const g1Friendly =
      availableMetadata?.groupFieldLabels?.[g1Field] ||
      GROUP_FIELD_FRIENDLY_LABELS[g1Field] ||
      g1Field;

    if (groupStatusBadge) {
      groupStatusBadge.textContent = g2Field
        ? '2 niveles de agrupación activos'
        : `Agrupado por ${g1Friendly}`;
    }

    if (g1Label) {
      g1Label.textContent = `${g1Friendly} (Nivel 1):`;
    }

    const prevG1 = preserveSelection ? g1Select?.value || 'ALL' : 'ALL';
    const g1Options = availableMetadata?.groupOptionsByField?.[g1Field] || [];
    if (g1Select) {
      g1Select.innerHTML =
        `<option value="ALL">Todos (${g1Options.length})</option>` +
        g1Options.map((val) => `<option value="${escapeHtml(val)}">${escapeHtml(val)}</option>`).join('');
      g1Select.value = g1Options.includes(prevG1) ? prevG1 : 'ALL';
    }

    if (g2Field) {
      if (g1Col) g1Col.className = 'col-md-6';
      if (g2Col) g2Col.className = 'col-md-6';
      const g2Friendly =
        availableMetadata?.groupFieldLabels?.[g2Field] ||
        GROUP_FIELD_FRIENDLY_LABELS[g2Field] ||
        g2Field;
      if (g2Label) {
        g2Label.textContent = `${g2Friendly} (Nivel 2):`;
      }

      const prevG2 = preserveSelection ? g2Select?.value || 'ALL' : 'ALL';
      const selectedG1 = g1Select?.value || 'ALL';

      // Si hay un grupo Nivel 1 seleccionado, mostrar los subgrupos disponibles dentro de ese Nivel 1
      let g2Options = availableMetadata?.groupOptionsByField?.[g2Field] || [];
      if (selectedG1 !== 'ALL' && Array.isArray(availableMetadata?.employeesCatalog)) {
        const filteredSet = new Set();
        for (const emp of availableMetadata.employeesCatalog) {
          if (emp.groupValues?.[g1Field] === selectedG1 && emp.groupValues?.[g2Field]) {
            filteredSet.add(emp.groupValues[g2Field]);
          }
        }
        if (filteredSet.size > 0) {
          g2Options = Array.from(filteredSet).sort((a, b) =>
            String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
          );
        }
      }

      if (g2Select) {
        g2Select.innerHTML =
          `<option value="ALL">Todos (${g2Options.length})</option>` +
          g2Options.map((val) => `<option value="${escapeHtml(val)}">${escapeHtml(val)}</option>`).join('');
        g2Select.value = g2Options.includes(prevG2) ? prevG2 : 'ALL';
      }
    } else {
      if (g1Col) g1Col.className = 'col-md-12';
      if (g2Col) g2Col.className = 'col-md-6 d-none';
      if (g2Select) g2Select.value = 'ALL';
    }
  };

  /**
   * Actualiza la insignia que muestra cuántos períodos están incluidos entre Desde y Hasta
   */
  proto.syncRunnerModalPeriodBadge = function () {
    const fromId = document.getElementById('rr-modal-period-from')?.value;
    const toId = document.getElementById('rr-modal-period-to')?.value;
    const badge = document.getElementById('rr-modal-period-range-badge');
    if (!badge) return;

    if (!fromId || !toId || runnerPeriodsCache.length === 0) {
      badge.textContent = '1 período';
      return;
    }

    const i1 = runnerPeriodsCache.findIndex((p) => p.id === fromId);
    const i2 = runnerPeriodsCache.findIndex((p) => p.id === toId);
    if (i1 === -1 || i2 === -1) {
      badge.textContent = '1 período';
      return;
    }

    const count = Math.abs(i1 - i2) + 1;
    badge.textContent = count === 1 ? '1 período seleccionado' : `${count} períodos incluidos en el rango`;
  };

  /**
   * Lee los filtros del modal, actualiza el resumen en la barra principal y ejecuta el informe
   */
  proto.applyRunnerModalAndExecute = async function () {
    const templateId = document.getElementById('rr-modal-template-select')?.value || '';
    const periodFromId = document.getElementById('rr-modal-period-from')?.value || '';
    const periodToId = document.getElementById('rr-modal-period-to')?.value || periodFromId;
    const multiPeriodMode =
      document.querySelector('input[name="rr-modal-multiperiod-mode"]:checked')?.value || 'SUM';
    const groupFilterLevel1 = document.getElementById('rr-modal-group1-select')?.value || 'ALL';
    const groupFilterLevel2 = document.getElementById('rr-modal-group2-select')?.value || 'ALL';
    const employeeFrom = document.getElementById('rr-modal-emp-from')?.value || 'ALL';
    const employeeTo = document.getElementById('rr-modal-emp-to')?.value || 'ALL';

    if (!templateId) {
      showToast('Seleccioná una plantilla de informe para emitir', 'warning');
      return;
    }

    activeTemplateId = templateId;
    runnerLastParams = {
      templateId,
      periodFromId,
      periodToId,
      multiPeriodMode,
      groupFilterLevel1,
      groupFilterLevel2,
      employeeFrom,
      employeeTo,
    };

    const selectHiddenTpl = document.getElementById('reports-runner-template-select');
    if (selectHiddenTpl) selectHiddenTpl.value = templateId;
    const selectHiddenPer = document.getElementById('reports-runner-period-select');
    if (selectHiddenPer) selectHiddenPer.value = periodFromId;

    const modalEl = document.getElementById('modal-report-runner-params');
    if (modalEl && window.bootstrap) {
      const modal = window.bootstrap.Modal.getInstance(modalEl);
      modal?.hide();
    }

    await this.executeCurrentReport();
  };

  /**
   * Ejecuta el informe actual en base a los parámetros seleccionados en el modal
   */
  proto.executeCurrentReport = async function () {
    const templateId =
      runnerLastParams.templateId || document.getElementById('reports-runner-template-select')?.value;
    const container = document.getElementById('reports-runner-results-container');
    const loadingEl = document.getElementById('reports-runner-loading');

    if (!templateId) {
      showToast('Seleccioná una plantilla para emitir', 'warning');
      return;
    }

    if (loadingEl) loadingEl.classList.remove('d-none');
    if (container) container.classList.add('d-none');

    try {
      const payload = {
        templateId,
        periodId: runnerLastParams.periodFromId || undefined,
        periodFromId: runnerLastParams.periodFromId || undefined,
        periodToId: runnerLastParams.periodToId || runnerLastParams.periodFromId || undefined,
        multiPeriodMode: runnerLastParams.multiPeriodMode || 'SUM',
        groupFilterLevel1: runnerLastParams.groupFilterLevel1 || 'ALL',
        groupFilterLevel2: runnerLastParams.groupFilterLevel2 || 'ALL',
        employeeFrom: runnerLastParams.employeeFrom || 'ALL',
        employeeTo: runnerLastParams.employeeTo || 'ALL',
      };

      const res = await apiRequest('/reports/execute', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      currentReportExecutionData = res.data;
      this.updateActiveFiltersSummaryBanner(res.data);
      this.renderReportExecutionResults(res.data);
    } catch (err) {
      console.error('Error al ejecutar informe:', err);
      showToast(err.message || 'Error al procesar el informe', 'danger');
    } finally {
      if (loadingEl) loadingEl.classList.add('d-none');
      if (container) container.classList.remove('d-none');
    }
  };

  /**
   * Actualiza la barra superior de resumen de filtros activos en #pane-reports-runner
   */
  proto.updateActiveFiltersSummaryBanner = function (reportData) {
    const summaryEl = document.getElementById('reports-runner-active-filters-summary');
    if (!summaryEl) return;

    const tpl = runnerTemplatesCache.find((t) => t.id === runnerLastParams.templateId);
    const tplName = tpl?.name || reportData?.meta?.reportTitle || 'Informe';
    const periodLabel = reportData?.meta?.periodName || '-';

    const groupParts = [];
    if (runnerLastParams.groupFilterLevel1 && runnerLastParams.groupFilterLevel1 !== 'ALL') {
      groupParts.push(runnerLastParams.groupFilterLevel1);
    }
    if (runnerLastParams.groupFilterLevel2 && runnerLastParams.groupFilterLevel2 !== 'ALL') {
      groupParts.push(runnerLastParams.groupFilterLevel2);
    }
    const groupText = groupParts.length > 0 ? groupParts.join(' / ') : 'Todos';

    let empText = 'Todos';
    const eFrom = runnerLastParams.employeeFrom;
    const eTo = runnerLastParams.employeeTo;
    if ((eFrom && eFrom !== 'ALL') || (eTo && eTo !== 'ALL')) {
      empText = `Desde ${eFrom !== 'ALL' ? eFrom : 'Inicio'} hasta ${eTo !== 'ALL' ? eTo : 'Fin'}`;
    }

    summaryEl.innerHTML = `
      <span class="badge bg-primary-lt text-primary me-1"><i class="ti ti-template me-1"></i>${escapeHtml(tplName)}</span>
      <span class="badge bg-indigo-lt text-indigo me-1"><i class="ti ti-calendar me-1"></i>${escapeHtml(periodLabel)}</span>
      <span class="badge bg-teal-lt text-teal me-1"><i class="ti ti-layers-linked me-1"></i>Grupo: ${escapeHtml(groupText)}</span>
      <span class="badge bg-secondary-lt text-secondary"><i class="ti ti-users me-1"></i>Legajos: ${escapeHtml(empText)}</span>
    `;
  };

  /**
   * Renderiza el resultado del informe en pantalla: cabecera, gráfico y tabla interactiva
   */
  proto.renderReportExecutionResults = function (data) {
    const { meta, columns, flatRows, groupedData, totals, chartData } = data;

    // 1. Meta información + Título del Informe
    const titleEl = document.getElementById('reports-result-company-title');
    const subEl = document.getElementById('reports-result-subtitle');
    const countBadge = document.getElementById('reports-result-count-badge');

    if (titleEl) {
      const repTitle = meta.reportTitle || 'Informe de Liquidación de Haberes';
      titleEl.textContent = `${repTitle} — ${meta.companyName} (CUIT: ${meta.cuit || 'S/D'})`;
    }
    if (subEl) {
      subEl.textContent = `Período: ${meta.periodName} | Emisión: ${new Date(meta.generatedAt).toLocaleString('es-AR')}`;
    }
    if (countBadge) countBadge.textContent = `${meta.totalRows} registros`;

    // 2. Gráfico con ApexCharts
    const chartCard = document.getElementById('reports-result-chart-card');
    const chartContainer = document.getElementById('reports-result-chart-container');

    if (chartData && chartData.categories && chartData.categories.length > 0 && window.ApexCharts) {
      if (chartCard) chartCard.classList.remove('d-none');
      if (reportsChartInstance) {
        reportsChartInstance.destroy();
      }

      const isCircular = chartData.type === 'donut' || chartData.type === 'pie';
      const options = {
        chart: {
          type: chartData.type || 'bar',
          height: 290,
          fontFamily: 'inherit',
          toolbar: { show: false },
        },
        title: {
          text: chartData.title || 'Distribución de Conceptos / Sueldos',
          align: 'left',
          style: { fontSize: '13px', fontWeight: 700, color: '#1F2937' },
        },
        colors: ['#4338ca', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6'],
      };

      if (isCircular) {
        options.series = chartData.series[0]?.data || [];
        options.labels = chartData.categories;
      } else {
        options.series = chartData.series;
        options.xaxis = { categories: chartData.categories };
      }

      reportsChartInstance = new window.ApexCharts(chartContainer, options);
      reportsChartInstance.render();
    } else {
      if (chartCard) chartCard.classList.add('d-none');
      if (reportsChartInstance) {
        reportsChartInstance.destroy();
        reportsChartInstance = null;
      }
    }

    // 3. Tabla Interactiva
    const tableHeader = document.getElementById('reports-result-table-header');
    const tableBody = document.getElementById('reports-result-table-body');
    const tableFoot = document.getElementById('reports-result-table-foot');

    if (!tableHeader || !tableBody) return;

    tableHeader.innerHTML = `
      <tr>
        ${columns
          .map(
            (c) => `
          <th class="text-${escapeHtml(c.align || 'left')} text-nowrap py-2" style="font-size: 0.8rem;">
            ${escapeHtml(c.title)}
          </th>
        `
          )
          .join('')}
      </tr>
    `;

    tableBody.innerHTML = '';

    const subtotalPos = meta.subtotalPosition || 'FOOTER';
    const showPct = meta.showGroupPercentOfTotal !== false;

    let leadingLabelCols = 0;
    for (const c of columns) {
      if (!c.totalize && c.format !== 'PERCENT_GROUP' && c.format !== 'PERCENT_TOTAL') {
        leadingLabelCols++;
      } else {
        break;
      }
    }
    if (leadingLabelCols === 0) leadingLabelCols = 1;

    if (groupedData && groupedData.groups && groupedData.groups.length > 0) {
      let groupIdx = 0;

      function createSubtotalTr(group, gid) {
        if (!group.subtotals || Object.keys(group.subtotals).length === 0) return null;
        const subTr = document.createElement('tr');
        subTr.className = `table-light fw-bold group-item-${gid}`;
        subTr.style.borderTop = '1px solid #cbd5e1';
        subTr.style.borderBottom = '2px solid #94a3b8';
        subTr.innerHTML = columns
          .map((c, i) => {
            if (i === 0) {
              return `<td colspan="${leadingLabelCols}" class="text-start py-2 fst-italic text-indigo">Subtotal ${escapeHtml(group.groupKey)}:</td>`;
            }
            if (i < leadingLabelCols) return '';
            if ((c.totalize || c.format === 'PERCENT_GROUP' || c.format === 'PERCENT_TOTAL') && group.subtotals[c.id] !== undefined) {
              const pct = group.groupPercentages ? group.groupPercentages[c.id] : undefined;
              return `<td class="text-${escapeHtml(c.align || 'right')} py-2 text-nowrap">${formatSubtotalWithPct(group.subtotals[c.id], c.format, pct, showPct)}</td>`;
            }
            return '<td></td>';
          })
          .join('');
        return subTr;
      }

      function renderGroupRows(group, depth = 0) {
        groupIdx++;
        const gid = `rep-group-${groupIdx}`;
        const label = group.groupFieldLabel || group.groupField;

        const groupRow = document.createElement('tr');
        groupRow.className = 'table-primary fw-bold cursor-pointer';
        groupRow.style.cursor = 'pointer';
        groupRow.setAttribute('data-group-target', gid);
        groupRow.innerHTML = `
          <td colspan="${columns.length}" class="py-2">
            <span class="d-inline-flex align-items-center gap-2" style="padding-left: ${depth * 1.5}rem;">
              <i class="ti ti-chevron-down toggle-caret" style="transition: transform 0.2s;"></i>
              <span class="badge bg-primary text-white">${escapeHtml(label)}</span>
              <strong class="text-primary">${escapeHtml(group.groupKey)}</strong>
              <span class="text-muted fw-normal">(${Number(group.count) || 0} empleados)</span>
            </span>
          </td>
        `;

        tableBody.appendChild(groupRow);

        const rowsFragment = document.createDocumentFragment();

        // Si el subtotal se configuró en el ENCABEZADO del grupo
        if (subtotalPos === 'HEADER') {
          const headerSubTr = createSubtotalTr(group, gid);
          if (headerSubTr) rowsFragment.appendChild(headerSubTr);
        }

        if (group.isLeaf && group.rows) {
          group.rows.forEach((r) => {
            const tr = document.createElement('tr');
            tr.className = `group-item-${gid}`;
            tr.innerHTML = columns
              .map(
                (c) => `
              <td class="text-${escapeHtml(c.align || 'left')} text-nowrap py-1" style="font-size: 0.82rem;">
                ${formatCellValue(r[c.id], c.format)}
              </td>
            `
              )
              .join('');
            rowsFragment.appendChild(tr);
          });
        } else if (group.groups) {
          tableBody.appendChild(rowsFragment);
          group.groups.forEach((cg) => renderGroupRows(cg, depth + 1));
        }

        // Si el subtotal se configuró al PIE del grupo
        if (subtotalPos !== 'HEADER') {
          const footerSubTr = createSubtotalTr(group, gid);
          if (footerSubTr) rowsFragment.appendChild(footerSubTr);
        }

        if (rowsFragment.childNodes.length > 0) {
          tableBody.appendChild(rowsFragment);
        }

        groupRow.addEventListener('click', () => {
          const items = tableBody.querySelectorAll(`.group-item-${gid}`);
          const caret = groupRow.querySelector('.toggle-caret');
          const isCollapsed = items[0]?.classList.contains('d-none');

          items.forEach((it) => it.classList.toggle('d-none'));
          if (caret) {
            caret.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
          }
        });
      }

      groupedData.groups.forEach((g) => renderGroupRows(g));
    } else if (flatRows && flatRows.length > 0) {
      flatRows.forEach((r) => {
        const tr = document.createElement('tr');
        tr.innerHTML = columns
          .map(
            (c) => `
          <td class="text-${escapeHtml(c.align || 'left')} text-nowrap py-1" style="font-size: 0.82rem;">
            ${formatCellValue(r[c.id], c.format)}
          </td>
        `
          )
          .join('');
        tableBody.appendChild(tr);
      });
    } else {
      const emptyTr = document.createElement('tr');
      emptyTr.innerHTML = `
        <td colspan="${columns.length}" class="text-center text-muted py-4">
          No se encontraron registros para el período y filtros seleccionados.
        </td>
      `;
      tableBody.appendChild(emptyTr);
    }

    // Pie de tabla con Total General
    if (tableFoot) {
      if (totals && Object.keys(totals).length > 0) {
        tableFoot.innerHTML = `
          <tr class="table-dark fw-bold" style="border-top: 2px solid #1e293b; font-size: 0.85rem;">
            ${columns
              .map((c, i) => {
                if (i === 0) {
                  return `<td colspan="${leadingLabelCols}" class="text-start py-2">TOTAL GENERAL (${meta.totalRows ?? 0} legajos):</td>`;
                }
                if (i < leadingLabelCols) return '';
                if ((c.totalize || c.format === 'PERCENT_GROUP' || c.format === 'PERCENT_TOTAL') && totals[c.id] !== undefined) {
                  return `<td class="text-${escapeHtml(c.align || 'right')} py-2 text-nowrap">${formatCellValue(totals[c.id], c.format)}</td>`;
                }
                return '<td></td>';
              })
              .join('')}
          </tr>
        `;
      } else {
        tableFoot.innerHTML = '';
      }
    }
  };

  /**
   * Exporta el informe actual a Excel o PDF respetando los filtros aplicados en el modal
   */
  proto.exportCurrentReport = async function (format) {
    const templateId =
      runnerLastParams.templateId || document.getElementById('reports-runner-template-select')?.value;

    if (!templateId) {
      showToast('Seleccioná una plantilla para exportar', 'warning');
      return;
    }

    showToast(`Generando archivo ${format.toUpperCase()}...`, 'info');

    try {
      let chartImageBase64 = undefined;
      const chartCard = document.getElementById('reports-result-chart-card');
      if (reportsChartInstance && reportsChartInstance.dataURI && chartCard && !chartCard.classList.contains('d-none')) {
        const chartUri = await reportsChartInstance.dataURI();
        chartImageBase64 = chartUri?.imgURI || undefined;
      }

      const token = storage.getToken();
      const companyId = storage.getActiveCompanyId();

      const exportPayload = {
        templateId,
        format,
        periodId: runnerLastParams.periodFromId || undefined,
        periodFromId: runnerLastParams.periodFromId || undefined,
        periodToId: runnerLastParams.periodToId || runnerLastParams.periodFromId || undefined,
        multiPeriodMode: runnerLastParams.multiPeriodMode || 'SUM',
        groupFilterLevel1: runnerLastParams.groupFilterLevel1 || 'ALL',
        groupFilterLevel2: runnerLastParams.groupFilterLevel2 || 'ALL',
        employeeFrom: runnerLastParams.employeeFrom || 'ALL',
        employeeTo: runnerLastParams.employeeTo || 'ALL',
      };
      if (chartImageBase64) exportPayload.chartImageBase64 = chartImageBase64;

      const response = await fetch('/api/v1/reports/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
        body: JSON.stringify(exportPayload),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Error al exportar ${format}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `informe-${Date.now()}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      showToast(`Archivo ${format.toUpperCase()} descargado con éxito`, 'success');
    } catch (err) {
      console.error(`Error al exportar informe a ${format}:`, err);
      showToast(err.message || 'Error al exportar archivo', 'danger');
    }
  };

  /**
   * Genera un documento de impresión editorial tamaño A4 (con orientación automática,
   * anchos proporcionales de columna, encabezado institucional en todas las hojas,
   * encabezados de columna repetidos, supresión de columnas agrupadas en el detalle
   * y pie de página con numeración exacta Página X de Y).
   */
  proto.printCurrentReportA4 = async function () {
    if (!currentReportExecutionData) {
      await this.executeCurrentReport();
    }
    if (!currentReportExecutionData) {
      showToast('No hay datos de informe para imprimir', 'warning');
      return;
    }

    const { meta, columns = [], flatRows = [], groupedData, totals } = currentReportExecutionData;
    const isLandscape = columns.length >= 6;
    const subtotalPos = meta.subtotalPosition || 'FOOTER';
    const showPct = meta.showGroupPercentOfTotal !== false;

    // Obtener imagen del gráfico si está visible
    let chartImgUri = null;
    const chartCard = document.getElementById('reports-result-chart-card');
    if (reportsChartInstance && reportsChartInstance.dataURI && chartCard && !chartCard.classList.contains('d-none')) {
      try {
        const uriObj = await reportsChartInstance.dataURI();
        chartImgUri = uriObj?.imgURI || null;
      } catch {
        chartImgUri = null;
      }
    }

    // Calcular pesos proporcionales para el <colgroup> A4
    function getColWeight(col) {
      const id = String(col.source || col.id || '');
      const fmt = String(col.format || 'TEXT');
      if (id === 'employee.fileNumber' || id === 'payslip.workedDays' || id === 'employee.status') return 0.72;
      if (
        id === 'employee.cuil' ||
        id === 'employee.documentNumber' ||
        id === 'employee.hireDate' ||
        id === 'payslip.paymentMethod' ||
        fmt === 'DATE'
      ) {
        return 0.98;
      }
      if (fmt === 'PERCENT' || fmt === 'PERCENT_GROUP' || fmt === 'PERCENT_TOTAL') return 1.05;
      if (id === 'employee.fullName') return 1.95;
      if (fmt === 'CURRENCY' || fmt === 'NUMBER') return 1.38;
      return 1.3;
    }

    const weights = columns.map(getColWeight);
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    const colPercentages = weights.map((w) => ((w / totalWeight) * 100).toFixed(2));
    const colgroupHtml = `<colgroup>${colPercentages.map((pct) => `<col style="width: ${pct}%;" />`).join('')}</colgroup>`;

    // Cantidad de columnas iniciales no totalizables para etiquetas de Subtotal y Total General
    let leadingLabelCols = 0;
    for (const c of columns) {
      if (!c.totalize && c.format !== 'PERCENT_GROUP' && c.format !== 'PERCENT_TOTAL') {
        leadingLabelCols++;
      } else {
        break;
      }
    }
    if (leadingLabelCols === 0) leadingLabelCols = 1;

    function formatPrintSubtotal(val, fmt, pct) {
      const base = formatCellValue(val, fmt);
      if (showPct && pct !== undefined && fmt !== 'PERCENT_GROUP') {
        return `${base} <span class="pct-inline">(${Number(pct).toFixed(1)}%)</span>`;
      }
      return base;
    }

    // Construir secuencia plana de bloques de fila con su costo en unidades de renglón para paginación A4 exacta
    const printBlocks = [];

    function buildSubtotalTrHtml(group) {
      if (!group.subtotals || Object.keys(group.subtotals).length === 0) return '';
      return `
        <tr class="row-subtotal">
          ${columns
            .map((c, idx) => {
              if (idx === 0) {
                return `<td colspan="${leadingLabelCols}" class="text-left subtotal-label">Subtotal ${escapeHtml(group.groupKey)}:</td>`;
              }
              if (idx < leadingLabelCols) return '';
              if (
                (c.totalize || c.format === 'PERCENT_GROUP' || c.format === 'PERCENT_TOTAL') &&
                group.subtotals[c.id] !== undefined
              ) {
                const pct = group.groupPercentages ? group.groupPercentages[c.id] : undefined;
                return `<td class="text-${escapeHtml(c.align || 'right')} num-cell">${formatPrintSubtotal(group.subtotals[c.id], c.format, pct)}</td>`;
              }
              return '<td></td>';
            })
            .join('')}
        </tr>
      `;
    }

    function buildDetailTrHtml(row, isOdd) {
      return `
        <tr class="row-detail ${isOdd ? 'row-odd' : ''}">
          ${columns
            .map((c) => {
              const isNum =
                c.format === 'CURRENCY' ||
                c.format === 'NUMBER' ||
                c.format === 'PERCENT' ||
                c.format === 'PERCENT_GROUP' ||
                c.format === 'PERCENT_TOTAL';
              return `<td class="text-${escapeHtml(c.align || 'left')} ${isNum ? 'num-cell' : 'text-cell'}">${formatCellValue(row[c.id], c.format)}</td>`;
            })
            .join('')}
        </tr>
      `;
    }

    if (groupedData && groupedData.groups && groupedData.groups.length > 0) {
      function flattenGroup(group, depth = 0) {
        const label = group.groupFieldLabel || group.groupField;
        const padLeft = depth * 12;
        const groupHeaderHtml = `
          <tr class="row-group-header">
            <td colspan="${columns.length}" style="padding-left: ${6 + padLeft}px;">
              <span class="group-arrow">▶</span>
              <span class="group-field-name">${escapeHtml(label)}:</span>
              <strong class="group-key-val">${escapeHtml(group.groupKey)}</strong>
              <span class="group-count">(${Number(group.count) || 0} ${Number(group.count) === 1 ? 'legajo' : 'legajos'})</span>
            </td>
          </tr>
        `;
        printBlocks.push({ type: 'GROUP_HEADER', units: 1.35, html: groupHeaderHtml });

        if (subtotalPos === 'HEADER') {
          const subHtml = buildSubtotalTrHtml(group);
          if (subHtml) {
            printBlocks.push({ type: 'SUBTOTAL_HEADER', units: 1.25, html: subHtml });
          }
        }

        if (group.isLeaf && group.rows) {
          group.rows.forEach((r, idx) => {
            printBlocks.push({ type: 'DETAIL', units: 1.0, html: buildDetailTrHtml(r, idx % 2 === 1) });
          });
        } else if (group.groups) {
          group.groups.forEach((child) => flattenGroup(child, depth + 1));
        }

        if (subtotalPos !== 'HEADER') {
          const subHtml = buildSubtotalTrHtml(group);
          if (subHtml) {
            printBlocks.push({ type: 'SUBTOTAL_FOOTER', units: 1.25, html: subHtml });
          }
        }
      }

      groupedData.groups.forEach((g) => flattenGroup(g, 0));
    } else if (flatRows.length > 0) {
      flatRows.forEach((r, idx) => {
        printBlocks.push({ type: 'DETAIL', units: 1.0, html: buildDetailTrHtml(r, idx % 2 === 1) });
      });
    } else {
      printBlocks.push({
        type: 'EMPTY',
        units: 2.0,
        html: `<tr><td colspan="${columns.length}" class="text-center" style="padding: 14px; color: #64748b;">No se encontraron registros para el período seleccionado.</td></tr>`,
      });
    }

    // Agregar fila de Total General como bloque final
    if (totals && Object.keys(totals).length > 0) {
      const grandTotalHtml = `
        <tr class="row-grand-total">
          ${columns
            .map((c, i) => {
              if (i === 0) {
                return `<td colspan="${leadingLabelCols}" class="text-left">TOTAL GENERAL (${meta.totalRows ?? 0} legajos):</td>`;
              }
              if (i < leadingLabelCols) return '';
              if (
                (c.totalize || c.format === 'PERCENT_GROUP' || c.format === 'PERCENT_TOTAL') &&
                totals[c.id] !== undefined
              ) {
                return `<td class="text-${escapeHtml(c.align || 'right')} num-cell">${formatCellValue(totals[c.id], c.format)}</td>`;
              }
              return '<td></td>';
            })
            .join('')}
        </tr>
      `;
      printBlocks.push({ type: 'GRAND_TOTAL', units: 1.6, html: grandTotalHtml });
    }

    // Capacidades de renglones por hoja A4 según orientación y presencia de gráfico
    const page1MaxUnits = isLandscape ? (chartImgUri ? 16 : 26) : chartImgUri ? 28 : 41;
    const nextPagesMaxUnits = isLandscape ? 29 : 44;

    const pages = [];
    let currentPageBlocks = [];
    let currentUnits = 0;
    let currentMax = page1MaxUnits;

    for (let i = 0; i < printBlocks.length; i++) {
      const blk = printBlocks[i];

      // Evitar que un encabezado de grupo quede huérfano al final de la hoja
      const minExtraNeeded = blk.type === 'GROUP_HEADER' ? (subtotalPos === 'HEADER' ? 2.6 : 1.4) : 0;

      if (currentPageBlocks.length > 0 && currentUnits + blk.units + minExtraNeeded > currentMax) {
        pages.push(currentPageBlocks);
        currentPageBlocks = [];
        currentUnits = 0;
        currentMax = nextPagesMaxUnits;
      }

      currentPageBlocks.push(blk);
      currentUnits += blk.units;
    }
    if (currentPageBlocks.length > 0 || pages.length === 0) {
      pages.push(currentPageBlocks);
    }

    const totalPages = pages.length;
    const emittedStr = new Date(meta.generatedAt || Date.now()).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const reportTitleUpper = String(meta.reportTitle || 'INFORME DE LIQUIDACIÓN DE HABERES').toUpperCase();
    const companyUpper = String(meta.companyName || 'EMPRESA').toUpperCase();

    const tableHeaderHtml = `
      <thead>
        <tr>
          ${columns
            .map(
              (c) => `<th class="text-${escapeHtml(c.align || 'left')}">${escapeHtml(c.title)}</th>`
            )
            .join('')}
        </tr>
      </thead>
    `;

    const pagesHtml = pages
      .map((pageBlocks, pIdx) => {
        const isFirst = pIdx === 0;
        const headerHtml = isFirst
          ? `
          <header class="a4-header-first">
            <div class="a4-inst-row">
              <div class="a4-inst-left">
                <span class="a4-company-name">${escapeHtml(companyUpper)}</span>
                <span class="a4-cuit">CUIT: ${escapeHtml(meta.cuit || 'S/D')}</span>
              </div>
              <div class="a4-inst-right">
                <span><strong>Período:</strong> ${escapeHtml(meta.periodName || '-')}</span>
                <span class="sep">|</span>
                <span><strong>Emisión:</strong> ${escapeHtml(emittedStr)}</span>
                <span class="sep">|</span>
                <span><strong>Total Nómina:</strong> ${escapeHtml(meta.totalRows ?? 0)} legajos</span>
              </div>
            </div>
            <div class="a4-report-title-banner">
              <h1>${escapeHtml(reportTitleUpper)}</h1>
            </div>
            ${
              chartImgUri
                ? `<div class="a4-chart-box"><img src="${chartImgUri}" alt="Gráfico del Informe" /></div>`
                : ''
            }
          </header>
        `
          : `
          <header class="a4-header-cont">
            <div class="a4-cont-left">${escapeHtml(reportTitleUpper)} <span class="cont-tag">(Continuación)</span></div>
            <div class="a4-cont-right">${escapeHtml(companyUpper)} (CUIT: ${escapeHtml(meta.cuit || 'S/D')}) • Período: ${escapeHtml(meta.periodName || '-')}</div>
          </header>
        `;

        const rowsHtml = pageBlocks.map((b) => b.html).join('');

        return `
          <section class="a4-sheet">
            <div class="a4-sheet-top">
              ${headerHtml}
              <table class="a4-table">
                ${colgroupHtml}
                ${tableHeaderHtml}
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
            <footer class="a4-footer">
              <div class="a4-footer-left">${escapeHtml(companyUpper)} (CUIT: ${escapeHtml(meta.cuit || 'S/D')}) — Período: ${escapeHtml(meta.periodName || '-')}</div>
              <div class="a4-footer-center">${escapeHtml(reportTitleUpper)} — Emitido: ${escapeHtml(emittedStr)}</div>
              <div class="a4-footer-right">Página ${pIdx + 1} de ${totalPages}</div>
            </footer>
          </section>
        `;
      })
      .join('');

    const printWin = window.open('', '_blank', 'width=1150,height=820');
    if (!printWin) {
      showToast('Habilitá las ventanas emergentes para imprimir el informe en formato A4', 'warning');
      return;
    }

    const printDocHtml = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(reportTitleUpper)} - ${escapeHtml(companyUpper)}</title>
        <style>
          @page {
            size: A4 ${isLandscape ? 'landscape' : 'portrait'};
            margin: 8mm 10mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            color: #0f172a;
            background: #e2e8f0;
            font-size: 8pt;
            line-height: 1.25;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .a4-sheet {
            width: ${isLandscape ? '277mm' : '190mm'};
            min-height: ${isLandscape ? '192mm' : '279mm'};
            margin: 8mm auto;
            padding: 6mm 8mm;
            background: #ffffff;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            page-break-after: always;
            break-after: page;
          }
          .a4-sheet:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          @media print {
            body {
              background: #ffffff;
            }
            .a4-sheet {
              width: 100%;
              min-height: ${isLandscape ? '192mm' : '279mm'};
              height: ${isLandscape ? '192mm' : '279mm'};
              margin: 0;
              padding: 0;
              box-shadow: none;
            }
          }
          .a4-sheet-top {
            flex: 1 1 auto;
          }
          /* Encabezado Hoja 1 */
          .a4-header-first {
            margin-bottom: 6px;
          }
          .a4-inst-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin-bottom: 4px;
            font-size: 8pt;
          }
          .a4-company-name {
            font-weight: 800;
            font-size: 9pt;
            color: #0f172a;
            margin-right: 8px;
          }
          .a4-cuit {
            color: #334155;
            font-weight: 600;
          }
          .a4-inst-right {
            color: #334155;
            font-size: 7.8pt;
          }
          .a4-inst-right .sep {
            margin: 0 5px;
            color: #94a3b8;
          }
          .a4-report-title-banner {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-left: 4px solid #1e3a8a;
            padding: 5px 10px;
          }
          .a4-report-title-banner h1 {
            font-size: 11.5pt;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: 0.02em;
          }
          .a4-chart-box {
            text-align: center;
            margin: 6px 0;
            padding: 4px;
            border: 1px solid #e2e8f0;
          }
          .a4-chart-box img {
            max-width: 100%;
            max-height: ${isLandscape ? '135px' : '165px'};
            object-fit: contain;
          }
          /* Encabezado Hoja 2+ */
          .a4-header-cont {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            border-bottom: 1.5px solid #1e3a8a;
            padding-bottom: 4px;
            margin-bottom: 6px;
          }
          .a4-cont-left {
            font-size: 9.2pt;
            font-weight: 800;
            color: #0f172a;
          }
          .a4-cont-left .cont-tag {
            font-weight: 600;
            font-size: 7.8pt;
            color: #475569;
          }
          .a4-cont-right {
            font-size: 7.8pt;
            color: #334155;
          }
          /* Tabla A4 */
          .a4-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          .a4-table thead th {
            background-color: #1e3a8a !important;
            color: #ffffff !important;
            font-weight: 700;
            font-size: 7.6pt;
            padding: 5px 5px;
            border: 1px solid #1e3a8a;
            line-height: 1.15;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          .a4-table tbody td {
            padding: 3px 5px;
            font-size: 7.6pt;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: middle;
          }
          .a4-table .text-cell {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .a4-table .num-cell {
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
          }
          .text-left { text-align: left !important; }
          .text-center { text-align: center !important; }
          .text-right { text-align: right !important; }
          .row-odd td {
            background-color: #f8fafc;
          }
          .row-group-header td {
            background-color: #dbeafe !important;
            border-top: 1px solid #93c5fd !important;
            border-bottom: 1px solid #93c5fd !important;
            color: #1e3a8a !important;
            font-size: 8pt !important;
            padding: 4px 6px !important;
          }
          .group-arrow {
            font-size: 7pt;
            margin-right: 4px;
          }
          .group-field-name {
            font-weight: 600;
            margin-right: 3px;
          }
          .group-key-val {
            font-weight: 800;
            margin-right: 6px;
          }
          .group-count {
            font-size: 7.4pt;
            color: #334155;
          }
          .row-subtotal td {
            background-color: #eef2ff !important;
            border-top: 1px solid #94a3b8 !important;
            border-bottom: 1.5px solid #64748b !important;
            font-weight: 700 !important;
            color: #1e1b4b !important;
            padding: 4px 5px !important;
          }
          .subtotal-label {
            font-style: italic;
          }
          .pct-inline {
            font-size: 7pt;
            font-weight: 700;
            color: #312e81;
            margin-left: 2px;
          }
          .row-grand-total td {
            background-color: #0f172a !important;
            color: #ffffff !important;
            font-weight: 800 !important;
            font-size: 8.2pt !important;
            padding: 5px 5px !important;
            border-top: 2px solid #0f172a !important;
            border-bottom: 2px solid #0f172a !important;
          }
          /* Pie de Página A4 en cada hoja */
          .a4-footer {
            flex: 0 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid #cbd5e1;
            padding-top: 4px;
            margin-top: 6px;
            font-size: 7.2pt;
            color: #475569;
          }
          .a4-footer-left {
            width: 38%;
            text-align: left;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .a4-footer-center {
            width: 42%;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .a4-footer-right {
            width: 20%;
            text-align: right;
            font-weight: 700;
            color: #0f172a;
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
        <script>
          window.onload = function () {
            setTimeout(function () {
              window.print();
            }, 250);
          };
        </script>
      </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(printDocHtml);
    printWin.document.close();
  };

  /* ==========================================================================
     ASISTENTE MODAL POR PASOS (6 PASOS CERO-SCROLL)
     ========================================================================== */

  /**
   * Abre el Asistente Modal por Pasos para crear o editar una plantilla de informe
   */
  proto.renderReportsBuilderView = async function (templateIdToEdit = null) {
    ensureReportsTenantFreshness();
    activeTemplateId = templateIdToEdit;
    wizardEditingColIndex = null;

    try {
      if (!availableMetadata) {
        const metaRes = await apiRequest('/reports/metadata/fields');
        availableMetadata = metaRes.data;
      }

      if (templateIdToEdit) {
        const res = await apiRequest(`/reports/templates/${templateIdToEdit}`);
        const tpl = res.data;
        const cfg = typeof tpl.config === 'string' ? JSON.parse(tpl.config) : tpl.config || {};
        this.hydrateWizardStateFromTemplate(tpl, cfg);
      } else {
        this.resetWizardStateToDefault();
      }

      const modalEl = document.getElementById('modal-report-wizard');
      if (modalEl && window.bootstrap) {
        const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
      }

      this.goToWizardStep(1);
    } catch (err) {
      console.error('Error al abrir asistente de informes:', err);
      showToast('Error al inicializar el asistente de informes: ' + err.message, 'danger');
    }
  };

  /**
   * Inicializa el estado por defecto para una plantilla nueva
   */
  proto.resetWizardStateToDefault = function () {
    wizardState = {
      name: '',
      reportTitle: 'INFORME DE LIQUIDACIÓN DE HABERES',
      description: '',
      category: 'PAYROLL',
      hrFields: [
        { id: 'employee.fileNumber', title: 'Legajo', type: 'FIELD', source: 'employee.fileNumber', format: 'TEXT', align: 'left', totalize: false },
        { id: 'employee.fullName', title: 'Apellido y Nombre', type: 'FIELD', source: 'employee.fullName', format: 'TEXT', align: 'left', totalize: false },
        { id: 'department.name', title: 'Departamento / Sector', type: 'FIELD', source: 'department.name', format: 'TEXT', align: 'left', totalize: false },
      ],
      payrollColumns: [
        {
          id: 'col_gross',
          title: 'Sueldo Bruto Total',
          type: 'CALCULATED',
          format: 'CURRENCY',
          align: 'right',
          totalize: true,
          aggregation: 'SUM',
          formula: {
            terms: [{ conceptCode: 'payslip.grossSalary', conceptName: 'Sueldo Bruto Total', sign: '+', factor: 1 }],
          },
        },
        {
          id: 'col_deductions',
          title: 'Total Descuentos',
          type: 'CALCULATED',
          format: 'CURRENCY',
          align: 'right',
          totalize: true,
          aggregation: 'SUM',
          formula: {
            terms: [{ conceptCode: 'payslip.totalDeductions', conceptName: 'Total Descuentos / Retenciones', sign: '+', factor: 1 }],
          },
        },
        {
          id: 'col_net',
          title: 'Sueldo Neto a Cobrar',
          type: 'CALCULATED',
          format: 'CURRENCY',
          align: 'right',
          totalize: true,
          aggregation: 'SUM',
          formula: {
            terms: [{ conceptCode: 'payslip.netSalary', conceptName: 'Sueldo Neto a Cobrar', sign: '+', factor: 1 }],
          },
        },
      ],
      draftPayCol: {
        title: '',
        format: 'CURRENCY',
        terms: [],
      },
      groupings: ['department.name'],
      subtotalPosition: 'FOOTER',
      showGroupPercentOfTotal: true,
      chart: {
        enabled: false,
        type: 'bar',
        title: 'Sueldo Neto por Departamento',
        xAxisField: 'department.name',
        yAxisField: 'col_net',
        aggregation: 'SUM',
      },
    };
  };

  /**
   * Carga en el estado del asistente una plantilla existente para su edición
   */
  proto.hydrateWizardStateFromTemplate = function (tpl, cfg) {
    const hrCatalogIds = new Set(
      (availableMetadata?.categories?.find((c) => c.id === 'employee')?.fields || []).map((f) => f.id)
    );
    // Excluir Sueldo Básico Pactado de HR si fue usado como columna monetaria, salvo que sea de personal
    const allFields = cfg.fields || [];
    const hrFields = [];
    const payrollColumns = [];

    allFields.forEach((f) => {
      const isHr =
        f.type === 'FIELD' &&
        (hrCatalogIds.has(f.id) || hrCatalogIds.has(f.source)) &&
        f.format !== 'CURRENCY' &&
        f.format !== 'PERCENT_GROUP' &&
        f.format !== 'PERCENT_TOTAL';

      if (isHr) {
        hrFields.push({
          id: f.id,
          title: f.title,
          type: 'FIELD',
          source: f.source || f.id,
          format: f.format || 'TEXT',
          align: f.align || 'left',
          totalize: false,
        });
      } else {
        // Convertir campo directo de liquidación a estructura unificada con terms si aún no los tiene
        const terms =
          f.formula?.terms && f.formula.terms.length > 0
            ? f.formula.terms.map((t) => ({
                conceptCode: t.conceptCode,
                conceptName: t.conceptName || this.getCatalogItemLabel(t.conceptCode),
                sign: t.sign || '+',
                factor: t.factor || 1,
              }))
            : [
                {
                  conceptCode: f.source || f.id,
                  conceptName: f.title || this.getCatalogItemLabel(f.source || f.id),
                  sign: '+',
                  factor: 1,
                },
              ];

        payrollColumns.push({
          id: f.id,
          title: f.title,
          type: 'CALCULATED',
          format: f.format || 'CURRENCY',
          align: 'right',
          totalize: true,
          aggregation: f.aggregation || 'SUM',
          formula: { terms },
        });
      }
    });

    wizardState = {
      name: tpl.name || '',
      reportTitle: cfg.reportTitle || tpl.name?.toUpperCase() || 'INFORME DE LIQUIDACIÓN DE HABERES',
      description: tpl.description || '',
      category: tpl.category || 'PAYROLL',
      hrFields,
      payrollColumns,
      draftPayCol: {
        title: '',
        format: 'CURRENCY',
        terms: [],
      },
      groupings: Array.isArray(cfg.groupings) ? [...cfg.groupings] : [],
      subtotalPosition: cfg.subtotalPosition || 'FOOTER',
      showGroupPercentOfTotal: cfg.showGroupPercentOfTotal !== false,
      chart: {
        enabled: !!cfg.chart?.enabled,
        type: cfg.chart?.type || 'bar',
        title: cfg.chart?.title || 'Resumen Gráfico',
        xAxisField: cfg.chart?.xAxisField || cfg.groupings?.[0] || 'department.name',
        yAxisField: cfg.chart?.yAxisField || payrollColumns[0]?.id || '',
        aggregation: cfg.chart?.aggregation || 'SUM',
      },
    };
  };

  /**
   * Obtiene el nombre legible de un concepto o totalizador por su código
   */
  proto.getCatalogItemLabel = function (code) {
    if (!availableMetadata) return code;
    for (const cat of availableMetadata.categories || []) {
      for (const f of cat.fields || []) {
        if (f.id === code || f.conceptCode === code) {
          return f.title;
        }
      }
    }
    return code;
  };

  /**
   * Construye el objeto config consolidado listo para enviar al backend
   */
  proto.buildConsolidatedReportConfig = function () {
    const validFormats = ['TEXT', 'CURRENCY', 'NUMBER', 'DATE', 'PERCENT', 'PERCENT_GROUP', 'PERCENT_TOTAL'];
    const validAligns = ['left', 'center', 'right'];
    const validAggs = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'];

    const fields = [
      ...wizardState.hrFields.map((f, idx) => ({
        id: String(f.id || `hr_${idx}`),
        title: String(f.title || f.id || `Campo ${idx + 1}`).trim() || `Campo ${idx + 1}`,
        type: 'FIELD',
        source: String(f.source || f.id || 'employee.fileNumber'),
        format: validFormats.includes(f.format) ? f.format : 'TEXT',
        align: validAligns.includes(f.align) ? f.align : 'left',
        totalize: false,
        aggregation: 'SUM',
      })),
      ...wizardState.payrollColumns.map((c, idx) => ({
        id: String(c.id || `col_${idx}`),
        title: String(c.title || `Columna ${idx + 1}`).trim() || `Columna ${idx + 1}`,
        type: 'CALCULATED',
        format: validFormats.includes(c.format) ? c.format : 'CURRENCY',
        align: 'right',
        totalize: true,
        aggregation: validAggs.includes(c.aggregation) ? c.aggregation : 'SUM',
        formula: {
          terms: (c.formula?.terms || []).map((t) => ({
            conceptCode: String(t.conceptCode || ''),
            conceptName: String(t.conceptName || t.conceptCode || ''),
            sign: t.sign === '-' ? '-' : '+',
            factor: Number(t.factor) || 1,
          })),
        },
      })),
    ];

    const rawReportTitle = (wizardState.reportTitle || wizardState.name || 'INFORME DE LIQUIDACIÓN DE HABERES')
      .trim()
      .slice(0, 240);

    return {
      reportTitle: rawReportTitle || 'INFORME DE LIQUIDACIÓN DE HABERES',
      fields,
      groupings: (wizardState.groupings || []).filter(Boolean).map(String),
      subtotalPosition: wizardState.subtotalPosition === 'HEADER' ? 'HEADER' : 'FOOTER',
      showGroupPercentOfTotal: wizardState.showGroupPercentOfTotal !== false,
      filters: [],
      chart: {
        enabled: !!wizardState.chart?.enabled,
        type: ['bar', 'donut', 'pie', 'line', 'area'].includes(wizardState.chart?.type)
          ? wizardState.chart.type
          : 'bar',
        title: String(wizardState.chart?.title || 'Resumen Gráfico').trim() || 'Resumen Gráfico',
        xAxisField: String(wizardState.chart?.xAxisField || wizardState.groupings?.[0] || 'department.name'),
        yAxisField: String(wizardState.chart?.yAxisField || wizardState.payrollColumns?.[0]?.id || ''),
        aggregation: 'SUM',
      },
    };
  };

  /**
   * Navega hacia un paso específico (1 a 6) validando los requisitos previos
   */
  proto.goToWizardStep = function (targetStep) {
    if (targetStep > 1 && wizardState.hrFields.length === 0) {
      showToast('Seleccioná al menos un campo de personal en el Paso 1', 'warning');
      return;
    }

    // Si el usuario sale del Paso 2 teniendo términos armados en el compositor sin haber presionado "Guardar Columna", guardarla automáticamente
    if (wizardStep === 2 && targetStep > 2 && wizardState.draftPayCol?.terms?.length > 0) {
      const titleInput = document.getElementById('rw-paycol-title');
      if (titleInput && !titleInput.value.trim()) {
        const firstTermName = (wizardState.draftPayCol.terms[0]?.conceptName || 'Columna Liquidación').replace(
          /^\[[^\]]+\]\s*/,
          ''
        );
        titleInput.value = firstTermName || 'Columna Liquidación';
      }
      this.saveDraftPayrollColumn();
    }

    if (targetStep > 2 && wizardState.payrollColumns.length === 0) {
      showToast('Agregá al menos una columna de liquidación en el Paso 2', 'warning');
      return;
    }

    wizardStep = Math.max(1, Math.min(6, Number(targetStep)));

    // Actualizar subtítulo y píldoras del Stepper
    const subEl = document.getElementById('rw-modal-step-subtitle');
    if (subEl) subEl.textContent = STEP_SUBTITLES[wizardStep] || '';

    const mainTitleEl = document.getElementById('rw-modal-main-title');
    if (mainTitleEl) {
      mainTitleEl.textContent = activeTemplateId
        ? 'Editar Plantilla de Informe Personalizado'
        : 'Diseñador de Plantilla de Informe';
    }

    document.querySelectorAll('#rw-stepper-bar .rw-step-pill').forEach((pill) => {
      const s = Number(pill.getAttribute('data-step'));
      pill.classList.toggle('active', s === wizardStep);
      pill.classList.toggle('completed', s < wizardStep);
    });

    // Mostrar solo el panel del paso activo
    for (let i = 1; i <= 6; i++) {
      const pane = document.getElementById(`rw-step-${i}`);
      if (pane) {
        pane.classList.toggle('d-none', i !== wizardStep);
        pane.classList.toggle('active', i === wizardStep);
      }
    }

    // Actualizar botones del pie
    const ind = document.getElementById('rw-footer-step-indicator');
    if (ind) ind.textContent = `Paso ${wizardStep} de 6`;

    const btnPrev = document.getElementById('btn-rw-prev');
    const btnNext = document.getElementById('btn-rw-next');
    const btnSave = document.getElementById('btn-rw-save-confirm');

    if (btnPrev) btnPrev.disabled = wizardStep === 1;
    if (btnNext) btnNext.classList.toggle('d-none', wizardStep === 6);
    if (btnSave) btnSave.classList.toggle('d-none', wizardStep !== 6);

    // Renderizar contenido específico del paso
    if (wizardStep === 1) this.renderWizardStep1HrFields();
    if (wizardStep === 2) this.renderWizardStep2PayrollColumns();
    if (wizardStep === 3) this.renderWizardStep3Groupings();
    if (wizardStep === 4) this.renderWizardStep4Chart();
    if (wizardStep === 5) this.renderWizardStep5Identity();
    if (wizardStep === 6) this.renderWizardStep6Preview();
  };

  /* --------------------------------------------------------------------------
     PASO 1: SELECCIÓN DE COLUMNAS DE DATOS DE PERSONAL
     -------------------------------------------------------------------------- */
  proto.renderWizardStep1HrFields = function () {
    const availList = document.getElementById('rw-hr-available-list');
    const selList = document.getElementById('rw-hr-selected-list');
    const availBadge = document.getElementById('rw-hr-avail-count');
    const selBadge = document.getElementById('rw-hr-sel-count');
    if (!availList || !selList || !availableMetadata) return;

    const hrCategory = availableMetadata.categories.find((c) => c.id === 'employee');
    const allHrFields = (hrCategory?.fields || []).filter((f) => f.id !== 'employee.basicSalary');
    const selectedIds = new Set(wizardState.hrFields.map((f) => f.id));
    const availableFields = allHrFields.filter((f) => !selectedIds.has(f.id));

    if (availBadge) availBadge.textContent = `${availableFields.length} disponibles`;
    if (selBadge) selBadge.textContent = `${wizardState.hrFields.length} elegidos`;

    // Renderizar disponibles (Izquierda)
    if (availableFields.length === 0) {
      availList.innerHTML = `<div class="text-center text-muted small py-4">Todos los campos de personal ya fueron incluidos.</div>`;
    } else {
      availList.innerHTML = availableFields
        .map(
          (f) => `
        <div class="rw-transfer-item d-flex align-items-center justify-content-between px-2 py-1 mb-1 border rounded bg-white" data-hr-add="${escapeHtml(f.id)}">
          <div class="d-flex align-items-center gap-2 text-truncate">
            <i class="ti ti-id-badge-2 text-primary"></i>
            <span class="small fw-medium">${escapeHtml(f.title)}</span>
          </div>
          <button type="button" class="btn btn-xs btn-outline-primary py-0 px-2">
            Incluir <i class="ti ti-arrow-right ms-1"></i>
          </button>
        </div>
      `
        )
        .join('');
    }

    // Renderizar elegidos (Derecha)
    if (wizardState.hrFields.length === 0) {
      selList.innerHTML = `<div class="text-center text-muted small py-4">Hacé clic en los campos de la izquierda para incluirlos en el informe.</div>`;
    } else {
      selList.innerHTML = wizardState.hrFields
        .map(
          (f, idx) => `
        <div class="rw-transfer-item selected d-flex align-items-center justify-content-between px-2 py-1 mb-1 border rounded bg-white">
          <div class="d-flex align-items-center gap-2 text-truncate">
            <span class="badge bg-primary text-white">${idx + 1}</span>
            <span class="small fw-bold text-dark">${escapeHtml(f.title)}</span>
          </div>
          <div class="d-flex align-items-center gap-1">
            <button type="button" class="btn btn-xs btn-ghost-secondary py-0 px-1" data-hr-up="${idx}" ${idx === 0 ? 'disabled' : ''} title="Subir">
              <i class="ti ti-chevron-up"></i>
            </button>
            <button type="button" class="btn btn-xs btn-ghost-secondary py-0 px-1" data-hr-down="${idx}" ${idx === wizardState.hrFields.length - 1 ? 'disabled' : ''} title="Bajar">
              <i class="ti ti-chevron-down"></i>
            </button>
            <button type="button" class="btn btn-xs btn-outline-danger py-0 px-1" data-hr-remove="${idx}" title="Quitar">
              <i class="ti ti-x"></i>
            </button>
          </div>
        </div>
      `
        )
        .join('');
    }

    // Eventos Izquierda -> Derecha
    availList.querySelectorAll('[data-hr-add]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-hr-add');
        const found = allHrFields.find((f) => f.id === id);
        if (found) {
          wizardState.hrFields.push({
            id: found.id,
            title: found.title,
            type: 'FIELD',
            source: found.id,
            format: found.format || 'TEXT',
            align: found.align || 'left',
            totalize: false,
          });
          this.renderWizardStep1HrFields();
        }
      });
    });

    // Eventos Derecha (Subir / Bajar / Quitar)
    selList.querySelectorAll('[data-hr-up]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-hr-up'));
        if (idx > 0) {
          const tmp = wizardState.hrFields[idx - 1];
          wizardState.hrFields[idx - 1] = wizardState.hrFields[idx];
          wizardState.hrFields[idx] = tmp;
          this.renderWizardStep1HrFields();
        }
      });
    });

    selList.querySelectorAll('[data-hr-down]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-hr-down'));
        if (idx < wizardState.hrFields.length - 1) {
          const tmp = wizardState.hrFields[idx + 1];
          wizardState.hrFields[idx + 1] = wizardState.hrFields[idx];
          wizardState.hrFields[idx] = tmp;
          this.renderWizardStep1HrFields();
        }
      });
    });

    selList.querySelectorAll('[data-hr-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-hr-remove'));
        const removed = wizardState.hrFields[idx];
        wizardState.hrFields.splice(idx, 1);
        // Si estaba en groupings, limpiarlo para mantener consistencia con el Paso 3
        if (removed) {
          wizardState.groupings = wizardState.groupings.filter((g) => g !== removed.id);
        }
        this.renderWizardStep1HrFields();
      });
    });
  };

  /* --------------------------------------------------------------------------
     PASO 2: COLUMNAS DE LIQUIDACIÓN (CONCEPTOS Y TOTALIZADORES +/-)
     -------------------------------------------------------------------------- */
  proto.renderWizardStep2PayrollColumns = function () {
    const titleInput = document.getElementById('rw-paycol-title');
    const formatSelect = document.getElementById('rw-paycol-format');
    const headingEl = document.getElementById('rw-paycol-editor-heading');
    const btnCancelEdit = document.getElementById('btn-rw-cancel-edit-col');
    const btnSaveCol = document.getElementById('btn-rw-save-paycol');

    if (titleInput) titleInput.value = wizardState.draftPayCol.title || '';
    if (formatSelect) formatSelect.value = wizardState.draftPayCol.format || 'CURRENCY';

    if (headingEl) {
      headingEl.innerHTML =
        wizardEditingColIndex !== null
          ? `<i class="ti ti-edit me-1 text-warning"></i> Editando Columna #${wizardEditingColIndex + 1}`
          : `<i class="ti ti-calculator me-1 text-indigo"></i> Diseñar Columna de Liquidación`;
    }
    if (btnCancelEdit) {
      btnCancelEdit.classList.toggle('d-none', wizardEditingColIndex === null);
    }
    if (btnSaveCol) {
      btnSaveCol.innerHTML =
        wizardEditingColIndex !== null
          ? `<i class="ti ti-check me-1"></i> Actualizar Columna`
          : `<i class="ti ti-plus me-1"></i> Guardar Columna en el Informe`;
    }

    this.renderWizardStep2Catalog();
    this.renderWizardStep2DraftTerms();
    this.renderWizardStep2SelectedColumns();
  };

  proto.renderWizardStep2Catalog = function () {
    const listEl = document.getElementById('rw-payroll-catalog-list');
    const searchInput = document.getElementById('rw-concept-search');
    const tabTotals = document.getElementById('rw-tab-totals');
    const tabConcepts = document.getElementById('rw-tab-concepts');
    if (!listEl || !availableMetadata) return;

    if (tabTotals) tabTotals.classList.toggle('active', wizardCatalogTab === 'totals');
    if (tabConcepts) tabConcepts.classList.toggle('active', wizardCatalogTab === 'concepts');

    const query = (searchInput?.value || '').trim().toLowerCase();

    let items = [];
    if (wizardCatalogTab === 'totals') {
      const payCat = availableMetadata.categories.find((c) => c.id === 'payroll');
      const empBasic = availableMetadata.categories
        .find((c) => c.id === 'employee')
        ?.fields?.find((f) => f.id === 'employee.basicSalary');
      items = [
        ...(empBasic ? [{ code: empBasic.id, title: empBasic.title, badge: 'Básico' }] : []),
        ...(payCat?.fields || [])
          .filter((f) => f.format === 'CURRENCY' || f.format === 'NUMBER')
          .map((f) => ({ code: f.id, title: f.title, badge: 'Totalizador' })),
      ];
    } else {
      const conceptsCat = availableMetadata.categories.find((c) => c.id === 'concepts');
      items = (conceptsCat?.fields || []).map((f) => ({
        code: f.conceptCode || f.id,
        title: f.title,
        badge: f.conceptType || 'Concepto',
      }));
    }

    if (query) {
      items = items.filter(
        (it) => it.title.toLowerCase().includes(query) || String(it.code).toLowerCase().includes(query)
      );
    }

    if (items.length === 0) {
      listEl.innerHTML = `<div class="text-center text-muted small py-3">No se encontraron conceptos con ese filtro.</div>`;
      return;
    }

    listEl.innerHTML = items
      .map(
        (it) => `
      <div class="d-flex align-items-center justify-content-between px-2 py-1 border-bottom bg-white rw-catalog-row">
        <div class="text-truncate pe-2" style="max-width: 56%;">
          <span class="small fw-medium text-dark" title="${escapeHtml(it.title)}">${escapeHtml(it.title)}</span>
        </div>
        <div class="d-flex align-items-center gap-1 flex-shrink-0">
          <button type="button" class="btn btn-xs btn-outline-success py-0 px-2" data-term-add="+" data-code="${escapeHtml(it.code)}" data-label="${escapeHtml(it.title)}" title="Sumar a la columna actual">
            + Sumar
          </button>
          <button type="button" class="btn btn-xs btn-outline-danger py-0 px-2" data-term-add="-" data-code="${escapeHtml(it.code)}" data-label="${escapeHtml(it.title)}" title="Restar en la columna actual">
            - Restar
          </button>
          <button type="button" class="btn btn-xs btn-indigo py-0 px-2" data-term-direct="${escapeHtml(it.code)}" data-label="${escapeHtml(it.title)}" title="Añadir directamente como columna lista">
            ⚡ Directo
          </button>
        </div>
      </div>
    `
      )
      .join('');

    // Eventos + Sumar / - Restar
    listEl.querySelectorAll('[data-term-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sign = btn.getAttribute('data-term-add');
        const conceptCode = btn.getAttribute('data-code');
        const conceptName = btn.getAttribute('data-label');

        const titleInput = document.getElementById('rw-paycol-title');
        if (titleInput && !titleInput.value.trim() && wizardState.draftPayCol.terms.length === 0) {
          const cleanName = conceptName.replace(/^\[\d+\]\s*/, '');
          titleInput.value = cleanName;
          wizardState.draftPayCol.title = cleanName;
        }

        wizardState.draftPayCol.terms.push({
          conceptCode,
          conceptName,
          sign,
          factor: 1,
        });
        this.renderWizardStep2DraftTerms();
        const chipsBox = document.getElementById('rw-paycol-terms-chips');
        if (chipsBox) {
          chipsBox.scrollTop = chipsBox.scrollHeight;
        }
      });
    });

    // Evento ⚡ Directo (edición rápida de 1 clic aprobada por el Director)
    listEl.querySelectorAll('[data-term-direct]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const conceptCode = btn.getAttribute('data-code') || '';
        const conceptName = btn.getAttribute('data-label') || conceptCode || 'Concepto';
        const cleanTitle = conceptName.replace(/^\[[^\]]+\]\s*/, '').trim() || conceptName;
        const format = document.getElementById('rw-paycol-format')?.value || 'CURRENCY';

        wizardState.payrollColumns.push({
          id: `col_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          title: cleanTitle,
          type: 'CALCULATED',
          format,
          align: 'right',
          totalize: true,
          aggregation: 'SUM',
          formula: {
            terms: [{ conceptCode, conceptName, sign: '+', factor: 1 }],
          },
        });

        this.renderWizardStep2SelectedColumns();
        showToast(`Columna '${cleanTitle}' añadida al informe`, 'success');
      });
    });
  };

  proto.renderWizardStep2DraftTerms = function () {
    const chipsBox = document.getElementById('rw-paycol-terms-chips');
    const countBadge = document.getElementById('rw-paycol-terms-count');
    const btnClear = document.getElementById('btn-rw-clear-terms');
    if (!chipsBox) return;

    const terms = wizardState.draftPayCol.terms || [];
    if (countBadge) {
      countBadge.textContent = `${terms.length} ${terms.length === 1 ? 'concepto' : 'conceptos'}`;
    }
    if (btnClear) {
      btnClear.classList.toggle('d-none', terms.length === 0);
    }

    if (terms.length === 0) {
      chipsBox.innerHTML = `<div class="h-100 d-flex align-items-center justify-content-center text-center text-muted small fst-italic px-2">Usá "+ Sumar" o "- Restar" en el listado superior para componer la columna, o "⚡ Directo" para agregarla en 1 clic.</div>`;
      return;
    }

    chipsBox.innerHTML = terms
      .map(
        (t, idx) => `
      <div class="rw-composition-item">
        <div class="d-flex align-items-center gap-2 text-truncate pe-2" style="min-width: 0; flex: 1 1 0;">
          <span class="badge bg-secondary-lt text-secondary flex-shrink-0" style="font-size: 0.65rem;">#${idx + 1}</span>
          <button
            type="button"
            class="btn btn-xs ${t.sign === '-' ? 'btn-outline-danger' : 'btn-outline-success'} py-0 px-2 fw-bold flex-shrink-0"
            data-term-toggle="${idx}"
            title="Clic para alternar entre Sumar (+) y Restar (-)"
          >
            ${t.sign === '-' ? '- Restar' : '+ Sumar'}
          </button>
          <span class="small text-dark fw-medium text-truncate" title="${escapeHtml(t.conceptName || t.conceptCode)}">
            ${escapeHtml(t.conceptName || t.conceptCode)}
          </span>
        </div>
        <button
          type="button"
          class="btn btn-xs btn-outline-danger py-0 px-2 flex-shrink-0"
          data-term-del="${idx}"
          title="Eliminar este concepto de la composición de la columna"
        >
          <i class="ti ti-trash me-1"></i>Quitar
        </button>
      </div>
    `
      )
      .join('');

    chipsBox.querySelectorAll('[data-term-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.getAttribute('data-term-toggle'));
        if (wizardState.draftPayCol.terms[i]) {
          wizardState.draftPayCol.terms[i].sign =
            wizardState.draftPayCol.terms[i].sign === '+' ? '-' : '+';
          this.renderWizardStep2DraftTerms();
        }
      });
    });

    chipsBox.querySelectorAll('[data-term-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.getAttribute('data-term-del'));
        wizardState.draftPayCol.terms.splice(i, 1);
        this.renderWizardStep2DraftTerms();
      });
    });
  };

  proto.saveDraftPayrollColumn = function () {
    const titleInput = document.getElementById('rw-paycol-title');
    const formatSelect = document.getElementById('rw-paycol-format');
    const title = (titleInput?.value || '').trim();
    const format = formatSelect?.value || 'CURRENCY';
    const terms = wizardState.draftPayCol.terms || [];

    if (!title) {
      showToast('Ingresá un título para la columna de liquidación', 'warning');
      titleInput?.focus();
      return;
    }
    if (terms.length === 0) {
      showToast('Seleccioná al menos un concepto o totalizador con "+ Sumar" o "- Restar"', 'warning');
      return;
    }

    const colObj = {
      id:
        wizardEditingColIndex !== null && wizardState.payrollColumns[wizardEditingColIndex]
          ? wizardState.payrollColumns[wizardEditingColIndex].id
          : `col_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      title,
      type: 'CALCULATED',
      format,
      align: 'right',
      totalize: true,
      aggregation: 'SUM',
      formula: {
        terms: terms.map((t) => ({ ...t })),
      },
    };

    if (wizardEditingColIndex !== null) {
      wizardState.payrollColumns[wizardEditingColIndex] = colObj;
      wizardEditingColIndex = null;
      showToast(`Columna '${title}' actualizada`, 'success');
    } else {
      wizardState.payrollColumns.push(colObj);
      showToast(`Columna '${title}' agregada al informe`, 'success');
    }

    wizardState.draftPayCol = { title: '', format: 'CURRENCY', terms: [] };
    this.renderWizardStep2PayrollColumns();
  };

  proto.renderWizardStep2SelectedColumns = function () {
    const listEl = document.getElementById('rw-paycols-selected-list');
    const countBadge = document.getElementById('rw-paycol-count');
    if (!listEl) return;

    const cols = wizardState.payrollColumns || [];
    if (countBadge) countBadge.textContent = `${cols.length} ${cols.length === 1 ? 'columna' : 'columnas'}`;

    if (cols.length === 0) {
      listEl.innerHTML = `<div class="text-center text-muted small py-4 px-2">Aún no hay columnas de liquidación. Crealas desde el panel izquierdo o usá "⚡ Directo".</div>`;
      return;
    }

    listEl.innerHTML = cols
      .map((c, idx) => {
        const termsList = c.formula?.terms || [];
        const formulaDesc = termsList
          .map((t, i) => `${i === 0 && t.sign === '+' ? '' : t.sign + ' '}${t.conceptName || t.conceptCode}`)
          .join(' ');
        const fmtLabel = FORMAT_BADGE_LABELS[c.format] || c.format;
        const isEditing = wizardEditingColIndex === idx;

        return `
        <div class="rw-paycol-card ${isEditing ? 'is-editing' : ''}">
          <div class="d-flex align-items-center justify-content-between gap-2">
            <div class="d-flex align-items-center gap-1 text-truncate" style="min-width: 0; flex: 1 1 0;">
              <span class="badge ${isEditing ? 'bg-warning text-white' : 'bg-indigo text-white'} flex-shrink-0">${idx + 1}</span>
              <strong class="small text-dark text-truncate" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</strong>
              <span class="badge bg-indigo-lt flex-shrink-0" style="font-size: 0.65rem;">${escapeHtml(fmtLabel)}</span>
            </div>
            <div class="d-flex align-items-center gap-1 flex-shrink-0">
              <button type="button" class="btn btn-xs btn-outline-primary py-0 px-1" data-pcol-edit="${idx}" title="Editar columna">
                <i class="ti ti-pencil"></i>
              </button>
              <button type="button" class="btn btn-xs btn-ghost-secondary py-0 px-1" data-pcol-up="${idx}" ${idx === 0 ? 'disabled' : ''} title="Subir orden">
                <i class="ti ti-chevron-up"></i>
              </button>
              <button type="button" class="btn btn-xs btn-ghost-secondary py-0 px-1" data-pcol-down="${idx}" ${idx === cols.length - 1 ? 'disabled' : ''} title="Bajar orden">
                <i class="ti ti-chevron-down"></i>
              </button>
              <button type="button" class="btn btn-xs btn-outline-danger py-0 px-2" data-pcol-del="${idx}" title="Eliminar columna del informe">
                <i class="ti ti-trash me-1"></i>Eliminar
              </button>
            </div>
          </div>
          <div class="d-flex align-items-center justify-content-between mt-1 pt-1 border-top border-light">
            <small class="text-muted text-truncate w-100" style="font-size: 0.72rem;" title="${escapeHtml(formulaDesc)}">
              <span class="fw-semibold text-secondary">${termsList.length} ${termsList.length === 1 ? 'ítem' : 'ítems'}:</span> ${escapeHtml(formulaDesc)}
            </small>
          </div>
        </div>
      `;
      })
      .join('');

    listEl.querySelectorAll('[data-pcol-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-pcol-edit'));
        const col = wizardState.payrollColumns[idx];
        if (col) {
          wizardEditingColIndex = idx;
          wizardState.draftPayCol = {
            title: col.title,
            format: col.format || 'CURRENCY',
            terms: (col.formula?.terms || []).map((t) => ({ ...t })),
          };
          this.renderWizardStep2PayrollColumns();
        }
      });
    });

    listEl.querySelectorAll('[data-pcol-up]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-pcol-up'));
        if (idx > 0) {
          const tmp = wizardState.payrollColumns[idx - 1];
          wizardState.payrollColumns[idx - 1] = wizardState.payrollColumns[idx];
          wizardState.payrollColumns[idx] = tmp;
          if (wizardEditingColIndex === idx) {
            wizardEditingColIndex = idx - 1;
          } else if (wizardEditingColIndex === idx - 1) {
            wizardEditingColIndex = idx;
          }
          this.renderWizardStep2PayrollColumns();
        }
      });
    });

    listEl.querySelectorAll('[data-pcol-down]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-pcol-down'));
        if (idx < wizardState.payrollColumns.length - 1) {
          const tmp = wizardState.payrollColumns[idx + 1];
          wizardState.payrollColumns[idx + 1] = wizardState.payrollColumns[idx];
          wizardState.payrollColumns[idx] = tmp;
          if (wizardEditingColIndex === idx) {
            wizardEditingColIndex = idx + 1;
          } else if (wizardEditingColIndex === idx + 1) {
            wizardEditingColIndex = idx;
          }
          this.renderWizardStep2PayrollColumns();
        }
      });
    });

    listEl.querySelectorAll('[data-pcol-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-pcol-del'));
        const removed = wizardState.payrollColumns[idx];
        wizardState.payrollColumns.splice(idx, 1);

        if (wizardEditingColIndex === idx) {
          wizardEditingColIndex = null;
          wizardState.draftPayCol = { title: '', format: 'CURRENCY', terms: [] };
        } else if (wizardEditingColIndex !== null && wizardEditingColIndex > idx) {
          wizardEditingColIndex -= 1;
        }

        if (removed && wizardState.chart?.yAxisField === removed.id) {
          wizardState.chart.yAxisField = wizardState.payrollColumns[0]?.id || '';
        }

        this.renderWizardStep2PayrollColumns();
        if (removed?.title) {
          showToast(`Columna '${removed.title}' eliminada del informe`, 'info');
        }
      });
    });
  };

  /* --------------------------------------------------------------------------
     PASO 3: AGRUPACIÓN DE DATOS Y UBICACIÓN DE SUBTOTALES
     -------------------------------------------------------------------------- */
  proto.renderWizardStep3Groupings = function () {
    const sel1 = document.getElementById('rw-group-level-1');
    const sel2 = document.getElementById('rw-group-level-2');
    const alertNoFields = document.getElementById('rw-group-no-fields-alert');
    const showPctSwitch = document.getElementById('rw-group-show-pct');
    const demoPctBadge = document.getElementById('rw-subtotal-demo-pct');

    if (!sel1 || !sel2) return;

    // Agrupar exclusivamente por los campos seleccionados previamente en el Paso 1
    const selectedHrFields = wizardState.hrFields || [];
    const groupableSelected = selectedHrFields.filter(
      (f) => f.id !== 'employee.fullName' && f.id !== 'employee.cuil' && f.id !== 'employee.documentNumber'
    );

    if (alertNoFields) {
      const hasAnyCategoryField = selectedHrFields.some((f) =>
        ['department.name', 'jobPosition.cct', 'jobPosition.name', 'employee.payrollGroup', 'employee.status'].includes(f.id)
      );
      alertNoFields.classList.toggle('d-none', hasAnyCategoryField);
    }

    const currentG1 = wizardState.groupings[0] || '';
    const currentG2 = wizardState.groupings[1] || '';

    sel1.innerHTML =
      `<option value="">(Sin agrupación — Listado general continuo)</option>` +
      groupableSelected
        .map(
          (f) => `<option value="${escapeHtml(f.id)}" ${currentG1 === f.id ? 'selected' : ''}>${escapeHtml(f.title)}</option>`
        )
        .join('');

    sel2.innerHTML =
      `<option value="">(Ninguno)</option>` +
      groupableSelected
        .filter((f) => f.id !== sel1.value)
        .map(
          (f) => `<option value="${escapeHtml(f.id)}" ${currentG2 === f.id ? 'selected' : ''}>${escapeHtml(f.title)}</option>`
        )
        .join('');

    // Posición del subtotal (HEADER / FOOTER)
    document.querySelectorAll('input[name="rw-subtotal-pos"]').forEach((radio) => {
      radio.checked = radio.value === (wizardState.subtotalPosition || 'FOOTER');
    });

    if (showPctSwitch) {
      showPctSwitch.checked = wizardState.showGroupPercentOfTotal !== false;
    }
    if (demoPctBadge) {
      demoPctBadge.classList.toggle('d-none', !showPctSwitch?.checked);
    }
  };

  /* --------------------------------------------------------------------------
     PASO 4: CONFIGURACIÓN DE GRÁFICO EJECUTIVO
     -------------------------------------------------------------------------- */
  proto.renderWizardStep4Chart = function () {
    const enabledSw = document.getElementById('rw-chart-enabled');
    const disabledMsg = document.getElementById('rw-chart-disabled-msg');
    const configBox = document.getElementById('rw-chart-config-box');
    const titleInput = document.getElementById('rw-chart-title');
    const xSelect = document.getElementById('rw-chart-x');
    const ySelect = document.getElementById('rw-chart-y');

    if (!enabledSw || !xSelect || !ySelect) return;

    const isEnabled = !!wizardState.chart.enabled;
    enabledSw.checked = isEnabled;
    if (disabledMsg) disabledMsg.classList.toggle('d-none', isEnabled);
    if (configBox) configBox.classList.toggle('d-none', !isEnabled);

    document.querySelectorAll('input[name="rw-chart-type-radio"]').forEach((r) => {
      r.checked = r.value === (wizardState.chart.type || 'bar');
    });

    if (titleInput) {
      titleInput.value = wizardState.chart.title || 'Resumen Gráfico';
    }

    // Opciones de eje X basadas en los campos elegidos en Paso 1
    const xCandidates = wizardState.hrFields.length > 0
      ? wizardState.hrFields
      : [{ id: 'department.name', title: 'Departamento / Sector' }];

    if (!wizardState.chart.xAxisField || !xCandidates.some((x) => x.id === wizardState.chart.xAxisField)) {
      wizardState.chart.xAxisField = wizardState.groupings[0] || xCandidates[0]?.id || 'department.name';
    }

    xSelect.innerHTML = xCandidates
      .map(
        (f) => `<option value="${escapeHtml(f.id)}" ${wizardState.chart.xAxisField === f.id ? 'selected' : ''}>${escapeHtml(f.title)}</option>`
      )
      .join('');

    // Opciones de eje Y basadas en las columnas de liquidación del Paso 2
    const yCandidates = wizardState.payrollColumns;
    if (!wizardState.chart.yAxisField || !yCandidates.some((y) => y.id === wizardState.chart.yAxisField)) {
      wizardState.chart.yAxisField = yCandidates[0]?.id || '';
    }

    ySelect.innerHTML = yCandidates
      .map(
        (c) => `<option value="${escapeHtml(c.id)}" ${wizardState.chart.yAxisField === c.id ? 'selected' : ''}>${escapeHtml(c.title)}</option>`
      )
      .join('');
  };

  /* --------------------------------------------------------------------------
     PASO 5: IDENTIFICACIÓN Y TÍTULOS DEL INFORME
     -------------------------------------------------------------------------- */
  proto.renderWizardStep5Identity = function () {
    const nameInput = document.getElementById('rw-tpl-name');
    const titleInput = document.getElementById('rw-tpl-report-title');
    const catSelect = document.getElementById('rw-tpl-category');
    const descInput = document.getElementById('rw-tpl-desc');
    const summaryList = document.getElementById('rw-step5-summary-list');

    if (nameInput) nameInput.value = wizardState.name || '';
    if (titleInput) titleInput.value = wizardState.reportTitle || '';
    if (catSelect) catSelect.value = wizardState.category || 'PAYROLL';
    if (descInput) descInput.value = wizardState.description || '';

    if (summaryList) {
      const gLabels = wizardState.groupings
        .filter(Boolean)
        .map((gid) => wizardState.hrFields.find((f) => f.id === gid)?.title || gid);

      summaryList.innerHTML = `
        <div class="p-2 bg-white rounded border">
          <div class="text-muted" style="font-size: 0.7rem;">COLUMNAS DE PERSONAL (${wizardState.hrFields.length}):</div>
          <div class="fw-bold text-dark text-truncate">${escapeHtml(wizardState.hrFields.map((f) => f.title).join(', '))}</div>
        </div>
        <div class="p-2 bg-white rounded border">
          <div class="text-muted" style="font-size: 0.7rem;">COLUMNAS DE LIQUIDACIÓN (${wizardState.payrollColumns.length}):</div>
          <div class="fw-bold text-indigo text-truncate">${escapeHtml(wizardState.payrollColumns.map((c) => c.title).join(', '))}</div>
        </div>
        <div class="p-2 bg-white rounded border">
          <div class="text-muted" style="font-size: 0.7rem;">AGRUPACIÓN Y SUBTOTALES:</div>
          <div class="fw-bold text-dark">
            ${gLabels.length > 0 ? escapeHtml(gLabels.join(' → ')) : 'Sin agrupación (Listado continuo)'}
            ${gLabels.length > 0 ? `<span class="badge bg-blue-lt ms-1">${wizardState.subtotalPosition === 'HEADER' ? 'En Encabezado' : 'Al Pie'} ${wizardState.showGroupPercentOfTotal ? '+ % s/ Total' : ''}</span>` : ''}
          </div>
        </div>
        <div class="p-2 bg-white rounded border">
          <div class="text-muted" style="font-size: 0.7rem;">GRÁFICO EJECUTIVO:</div>
          <div class="fw-bold ${wizardState.chart.enabled ? 'text-success' : 'text-secondary'}">
            ${wizardState.chart.enabled ? `Activado (${wizardState.chart.type.toUpperCase()} — ${escapeHtml(wizardState.chart.title)})` : 'Desactivado (Solo tabla)'}
          </div>
        </div>
      `;
    }
  };

  /* --------------------------------------------------------------------------
     PASO 6: VISTA PREVIA EN VIVO Y CONFIRMACIÓN
     -------------------------------------------------------------------------- */
  proto.renderWizardStep6Preview = async function () {
    const container = document.getElementById('rw-preview-container');
    if (!container) return;

    // Sincronizar campos del Paso 5 por si el usuario saltó directo al Paso 6
    const nameEl = document.getElementById('rw-tpl-name');
    const repTitleEl = document.getElementById('rw-tpl-report-title');
    const catEl = document.getElementById('rw-tpl-category');
    const descEl = document.getElementById('rw-tpl-desc');
    if (nameEl && nameEl.value.trim()) wizardState.name = nameEl.value.trim();
    if (repTitleEl && repTitleEl.value.trim()) wizardState.reportTitle = repTitleEl.value.trim();
    if (catEl) wizardState.category = catEl.value;
    if (descEl) wizardState.description = descEl.value.trim();

    container.innerHTML = `
      <div class="text-center my-auto py-4">
        <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
        <span class="ms-2 small text-muted">Generando vista previa del informe terminado...</span>
      </div>
    `;

    try {
      const config = this.buildConsolidatedReportConfig();
      const periodId = document.getElementById('reports-runner-period-select')?.value || undefined;
      const res = await apiRequest('/reports/execute', {
        method: 'POST',
        body: JSON.stringify({ config, periodId }),
      });

      const data = res.data;
      const { meta, columns, flatRows, groupedData, totals } = data;
      const subtotalPos = meta.subtotalPosition || 'FOOTER';
      const showPct = meta.showGroupPercentOfTotal !== false;

      let leadingLabelCols = 0;
      for (const c of columns) {
        if (!c.totalize && c.format !== 'PERCENT_GROUP' && c.format !== 'PERCENT_TOTAL') {
          leadingLabelCols++;
        } else {
          break;
        }
      }
      if (leadingLabelCols === 0) leadingLabelCols = 1;

      let sampleBodyHtml = '';

      if (groupedData && groupedData.groups && groupedData.groups.length > 0) {
        const sampleGroups = groupedData.groups.slice(0, 2);
        sampleGroups.forEach((g) => {
          const label = g.groupFieldLabel || g.groupField;
          sampleBodyHtml += `
            <tr class="table-primary fw-bold">
              <td colspan="${columns.length}" class="py-1 px-2" style="font-size: 0.72rem;">
                ▶ ${escapeHtml(label)}: <strong>${escapeHtml(g.groupKey)}</strong> (${g.count} empleados)
              </td>
            </tr>
          `;

          const buildSubRow = () => {
            if (!g.subtotals) return '';
            return `
              <tr class="table-light fw-bold" style="font-size: 0.72rem; border-bottom: 1px solid #94a3b8;">
                ${columns
                  .map((c, idx) => {
                    if (idx === 0) return `<td colspan="${leadingLabelCols}" class="py-1 px-2 fst-italic text-indigo">Subtotal ${escapeHtml(g.groupKey)}:</td>`;
                    if (idx < leadingLabelCols) return '';
                    if ((c.totalize || c.format === 'PERCENT_GROUP' || c.format === 'PERCENT_TOTAL') && g.subtotals[c.id] !== undefined) {
                      const pct = g.groupPercentages ? g.groupPercentages[c.id] : undefined;
                      return `<td class="py-1 px-2 text-${escapeHtml(c.align || 'right')} text-nowrap">${formatSubtotalWithPct(g.subtotals[c.id], c.format, pct, showPct)}</td>`;
                    }
                    return '<td></td>';
                  })
                  .join('')}
              </tr>
            `;
          };

          if (subtotalPos === 'HEADER') sampleBodyHtml += buildSubRow();

          const leafRows = g.rows ? g.rows.slice(0, 2) : g.groups?.[0]?.rows?.slice(0, 2) || [];
          leafRows.forEach((r) => {
            sampleBodyHtml += `
              <tr style="font-size: 0.72rem;">
                ${columns
                  .map(
                    (c) => `<td class="py-1 px-2 text-${escapeHtml(c.align || 'left')} text-nowrap">${formatCellValue(r[c.id], c.format)}</td>`
                  )
                  .join('')}
              </tr>
            `;
          });

          if (subtotalPos !== 'HEADER') sampleBodyHtml += buildSubRow();
        });
      } else {
        (flatRows || []).slice(0, 4).forEach((r) => {
          sampleBodyHtml += `
            <tr style="font-size: 0.72rem;">
              ${columns
                .map(
                  (c) => `<td class="py-1 px-2 text-${escapeHtml(c.align || 'left')} text-nowrap">${formatCellValue(r[c.id], c.format)}</td>`
                )
                .join('')}
            </tr>
          `;
        });
      }

      const totalRowHtml =
        totals && Object.keys(totals).length > 0
          ? `
          <tfoot class="table-dark fw-bold" style="font-size: 0.74rem;">
            <tr>
              ${columns
                .map((c, i) => {
                  if (i === 0) return `<td colspan="${leadingLabelCols}" class="py-1 px-2 text-start">TOTAL GENERAL (${meta.totalRows} reg.):</td>`;
                  if (i < leadingLabelCols) return '';
                  if ((c.totalize || c.format === 'PERCENT_GROUP' || c.format === 'PERCENT_TOTAL') && totals[c.id] !== undefined) {
                    return `<td class="py-1 px-2 text-${escapeHtml(c.align || 'right')} text-nowrap">${formatCellValue(totals[c.id], c.format)}</td>`;
                  }
                  return '<td></td>';
                })
                .join('')}
            </tr>
          </tfoot>
        `
          : '';

      container.innerHTML = `
        <div class="border rounded p-2 bg-light-subtle mb-2 flex-shrink-0">
          <div class="d-flex align-items-center justify-content-between">
            <div>
              <div class="fw-bold text-dark" style="font-size: 0.88rem;">${escapeHtml(meta.reportTitle)}</div>
              <div class="text-muted" style="font-size: 0.72rem;">${escapeHtml(meta.companyName)} (CUIT: ${escapeHtml(meta.cuit)}) — Período: ${escapeHtml(meta.periodName)}</div>
            </div>
            <div class="text-end">
              <span class="badge bg-primary-lt">${escapeHtml(wizardState.name || '(Sin nombre aún)')}</span>
              ${wizardState.chart.enabled ? `<span class="badge bg-teal-lt ms-1"><i class="ti ti-chart-bar me-1"></i>Gráfico ${escapeHtml(wizardState.chart.type.toUpperCase())}</span>` : ''}
            </div>
          </div>
        </div>

        <div class="table-responsive border rounded flex-grow-1" style="overflow-x: auto; overflow-y: hidden;">
          <table class="table table-sm table-bordered table-vcenter mb-0">
            <thead>
              <tr style="background-color: #1e1b4b; color: #ffffff; font-size: 0.72rem;">
                ${columns
                  .map(
                    (c) => `<th class="py-1 px-2 text-${escapeHtml(c.align || 'left')} text-nowrap text-white" style="background-color: #312e81 !important; color: #fff !important;">${escapeHtml(c.title)}</th>`
                  )
                  .join('')}
              </tr>
            </thead>
            <tbody>
              ${sampleBodyHtml || `<tr><td colspan="${columns.length}" class="text-center text-muted py-3">Sin registros de muestra</td></tr>`}
            </tbody>
            ${totalRowHtml}
          </table>
        </div>

        <div class="d-flex align-items-center justify-content-between text-muted small mt-1 flex-shrink-0" style="font-size: 0.72rem;">
          <span><i class="ti ti-circle-check text-success me-1"></i> Muestra generada con datos reales de la empresa (${meta.totalRows} empleados en el período).</span>
          <span>Hacé clic en <strong>"Confirmar y Guardar Plantilla"</strong> para finalizar.</span>
        </div>
      `;
    } catch (err) {
      console.error('Error generando vista previa:', err);
      container.innerHTML = `<div class="alert alert-danger m-2 small">No se pudo generar la vista previa: ${escapeHtml(err.message)}</div>`;
    }
  };

  /**
   * Guarda la plantilla confirmada en el Paso 6 del Asistente Modal
   */
  proto.saveCurrentReportTemplate = async function () {
    const nameInput = document.getElementById('rw-tpl-name');
    const repTitleInput = document.getElementById('rw-tpl-report-title');
    const catSelect = document.getElementById('rw-tpl-category');
    const descInput = document.getElementById('rw-tpl-desc');

    if (nameInput && nameInput.value.trim()) wizardState.name = nameInput.value.trim();
    if (repTitleInput && repTitleInput.value.trim()) wizardState.reportTitle = repTitleInput.value.trim();
    if (catSelect) wizardState.category = catSelect.value;
    if (descInput) wizardState.description = descInput.value.trim();

    if (!wizardState.name || wizardState.name.length < 2) {
      this.goToWizardStep(5);
      showToast('Ingresá el nombre de la plantilla en el Paso 5 (mínimo 2 caracteres)', 'warning');
      document.getElementById('rw-tpl-name')?.focus();
      return;
    }

    if (!wizardState.reportTitle) {
      wizardState.reportTitle = wizardState.name.toUpperCase();
    }

    const config = this.buildConsolidatedReportConfig();

    const payload = {
      name: wizardState.name,
      description: wizardState.description || null,
      category: wizardState.category || 'PAYROLL',
      config,
    };

    try {
      if (activeTemplateId) {
        await apiRequest(`/reports/templates/${activeTemplateId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Plantilla de informe actualizada con éxito', 'success');
      } else {
        const res = await apiRequest('/reports/templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        activeTemplateId = res.data?.id;
        showToast('Plantilla de informe creada con éxito', 'success');
      }

      const modalEl = document.getElementById('modal-report-wizard');
      if (modalEl && window.bootstrap) {
        const modal = window.bootstrap.Modal.getInstance(modalEl);
        modal?.hide();
      }

      await this.loadReportsTemplatesList();
      this.switchPayrollPane('#pane-reports-runner');
      await this.executeCurrentReport();
    } catch (err) {
      console.error('Error al guardar plantilla:', err);
      showToast(err.message || 'Error al guardar la plantilla', 'danger');
    }
  };

  /**
   * Configura los eventos de botones tanto del Emisor Modal como del Asistente Modal de 6 Pasos
   */
  proto.setupReportsEvents = function () {
    const btnOpenRunnerModal = document.getElementById('btn-open-report-runner-modal');
    if (btnOpenRunnerModal && !btnOpenRunnerModal._bound) {
      btnOpenRunnerModal._bound = true;
      btnOpenRunnerModal.addEventListener('click', () => this.openReportRunnerModal());
    }

    const rrTplSelect = document.getElementById('rr-modal-template-select');
    if (rrTplSelect && !rrTplSelect._bound) {
      rrTplSelect._bound = true;
      rrTplSelect.addEventListener('change', () => {
        runnerLastParams.templateId = rrTplSelect.value;
        activeTemplateId = rrTplSelect.value;
        const hiddenSel = document.getElementById('reports-runner-template-select');
        if (hiddenSel) hiddenSel.value = rrTplSelect.value;
        this.syncRunnerModalGroupFilters(false);
      });
    }

    const rrGroup1Select = document.getElementById('rr-modal-group1-select');
    if (rrGroup1Select && !rrGroup1Select._bound) {
      rrGroup1Select._bound = true;
      rrGroup1Select.addEventListener('change', () => {
        this.syncRunnerModalGroupFilters(true);
      });
    }

    const rrPeriodFrom = document.getElementById('rr-modal-period-from');
    const rrPeriodTo = document.getElementById('rr-modal-period-to');
    if (rrPeriodFrom && !rrPeriodFrom._bound) {
      rrPeriodFrom._bound = true;
      rrPeriodFrom.addEventListener('change', () => this.syncRunnerModalPeriodBadge());
    }
    if (rrPeriodTo && !rrPeriodTo._bound) {
      rrPeriodTo._bound = true;
      rrPeriodTo.addEventListener('change', () => this.syncRunnerModalPeriodBadge());
    }

    const btnResetEmpAll = document.getElementById('btn-rr-modal-emp-reset-all');
    if (btnResetEmpAll && !btnResetEmpAll._bound) {
      btnResetEmpAll._bound = true;
      btnResetEmpAll.addEventListener('click', () => {
        const ef = document.getElementById('rr-modal-emp-from');
        const et = document.getElementById('rr-modal-emp-to');
        if (ef) ef.value = 'ALL';
        if (et) et.value = 'ALL';
      });
    }

    const btnModalExecute = document.getElementById('btn-rr-modal-execute');
    if (btnModalExecute && !btnModalExecute._bound) {
      btnModalExecute._bound = true;
      btnModalExecute.addEventListener('click', () => this.applyRunnerModalAndExecute());
    }

    const btnExecute = document.getElementById('btn-reports-runner-execute');
    if (btnExecute && !btnExecute._bound) {
      btnExecute._bound = true;
      btnExecute.addEventListener('click', () => this.executeCurrentReport());
    }

    const btnExcel = document.getElementById('btn-reports-runner-export-excel');
    if (btnExcel && !btnExcel._bound) {
      btnExcel._bound = true;
      btnExcel.addEventListener('click', () => this.exportCurrentReport('excel'));
    }

    const btnPdf = document.getElementById('btn-reports-runner-export-pdf');
    if (btnPdf && !btnPdf._bound) {
      btnPdf._bound = true;
      btnPdf.addEventListener('click', () => this.exportCurrentReport('pdf'));
    }

    const btnPrint = document.getElementById('btn-reports-runner-print');
    if (btnPrint && !btnPrint._bound) {
      btnPrint._bound = true;
      btnPrint.addEventListener('click', () => {
        this.printCurrentReportA4();
      });
    }

    const btnNewTpl = document.getElementById('btn-reports-runner-new-template');
    if (btnNewTpl && !btnNewTpl._bound) {
      btnNewTpl._bound = true;
      btnNewTpl.addEventListener('click', () => {
        this.renderReportsBuilderView(null);
      });
    }

    const btnLaunchFromPane = document.getElementById('btn-launch-wizard-from-pane');
    if (btnLaunchFromPane && !btnLaunchFromPane._bound) {
      btnLaunchFromPane._bound = true;
      btnLaunchFromPane.addEventListener('click', () => {
        this.renderReportsBuilderView(null);
      });
    }

    const btnEditTpl = document.getElementById('btn-reports-runner-edit-template');
    if (btnEditTpl && !btnEditTpl._bound) {
      btnEditTpl._bound = true;
      btnEditTpl.addEventListener('click', () => {
        const tid = document.getElementById('reports-runner-template-select')?.value;
        if (tid) {
          this.renderReportsBuilderView(tid);
        } else {
          showToast('Seleccioná una plantilla para editar', 'warning');
        }
      });
    }

    const selectTpl = document.getElementById('reports-runner-template-select');
    if (selectTpl && !selectTpl._bound) {
      selectTpl._bound = true;
      selectTpl.addEventListener('change', () => this.executeCurrentReport());
    }

    const selectPeriod = document.getElementById('reports-runner-period-select');
    if (selectPeriod && !selectPeriod._bound) {
      selectPeriod._bound = true;
      selectPeriod.addEventListener('change', () => this.executeCurrentReport());
    }

    const btnCancelBuilder = document.getElementById('btn-cancel-report-builder');
    if (btnCancelBuilder && !btnCancelBuilder._bound) {
      btnCancelBuilder._bound = true;
      btnCancelBuilder.addEventListener('click', () => {
        this.switchPayrollPane('#pane-reports-runner');
      });
    }

    // --- EVENTOS DEL MODAL WIZARD DE 6 PASOS ---
    document.querySelectorAll('#rw-stepper-bar .rw-step-pill').forEach((pill) => {
      if (!pill._bound) {
        pill._bound = true;
        pill.addEventListener('click', () => {
          const step = Number(pill.getAttribute('data-step'));
          this.goToWizardStep(step);
        });
      }
    });

    const btnPrev = document.getElementById('btn-rw-prev');
    if (btnPrev && !btnPrev._bound) {
      btnPrev._bound = true;
      btnPrev.addEventListener('click', () => {
        if (wizardStep > 1) this.goToWizardStep(wizardStep - 1);
      });
    }

    const btnNext = document.getElementById('btn-rw-next');
    if (btnNext && !btnNext._bound) {
      btnNext._bound = true;
      btnNext.addEventListener('click', () => {
        if (wizardStep === 5) {
          const nameVal = document.getElementById('rw-tpl-name')?.value.trim() || '';
          const titleVal = document.getElementById('rw-tpl-report-title')?.value.trim() || '';
          if (!nameVal) {
            showToast('Asignale un nombre a la plantilla antes de pasar a la Vista Previa', 'warning');
            document.getElementById('rw-tpl-name')?.focus();
            return;
          }
          wizardState.name = nameVal;
          wizardState.reportTitle = titleVal || nameVal.toUpperCase();
        }
        if (wizardStep < 6) this.goToWizardStep(wizardStep + 1);
      });
    }

    const btnSaveConfirm = document.getElementById('btn-rw-save-confirm');
    if (btnSaveConfirm && !btnSaveConfirm._bound) {
      btnSaveConfirm._bound = true;
      btnSaveConfirm.addEventListener('click', () => this.saveCurrentReportTemplate());
    }

    // Paso 2: Tabs de catálogo, buscador y botón guardar columna
    const tabTotals = document.getElementById('rw-tab-totals');
    if (tabTotals && !tabTotals._bound) {
      tabTotals._bound = true;
      tabTotals.addEventListener('click', () => {
        wizardCatalogTab = 'totals';
        this.renderWizardStep2Catalog();
      });
    }

    const tabConcepts = document.getElementById('rw-tab-concepts');
    if (tabConcepts && !tabConcepts._bound) {
      tabConcepts._bound = true;
      tabConcepts.addEventListener('click', () => {
        wizardCatalogTab = 'concepts';
        this.renderWizardStep2Catalog();
      });
    }

    const searchInput = document.getElementById('rw-concept-search');
    if (searchInput && !searchInput._bound) {
      searchInput._bound = true;
      searchInput.addEventListener('input', () => this.renderWizardStep2Catalog());
    }

    const paycolTitle = document.getElementById('rw-paycol-title');
    if (paycolTitle && !paycolTitle._bound) {
      paycolTitle._bound = true;
      paycolTitle.addEventListener('input', (e) => {
        wizardState.draftPayCol.title = e.target.value;
      });
    }

    const paycolFormat = document.getElementById('rw-paycol-format');
    if (paycolFormat && !paycolFormat._bound) {
      paycolFormat._bound = true;
      paycolFormat.addEventListener('change', (e) => {
        wizardState.draftPayCol.format = e.target.value;
      });
    }

    const btnSavePaycol = document.getElementById('btn-rw-save-paycol');
    if (btnSavePaycol && !btnSavePaycol._bound) {
      btnSavePaycol._bound = true;
      btnSavePaycol.addEventListener('click', () => this.saveDraftPayrollColumn());
    }

    const btnCancelEditCol = document.getElementById('btn-rw-cancel-edit-col');
    if (btnCancelEditCol && !btnCancelEditCol._bound) {
      btnCancelEditCol._bound = true;
      btnCancelEditCol.addEventListener('click', () => {
        wizardEditingColIndex = null;
        wizardState.draftPayCol = { title: '', format: 'CURRENCY', terms: [] };
        this.renderWizardStep2PayrollColumns();
      });
    }

    const btnClearTerms = document.getElementById('btn-rw-clear-terms');
    if (btnClearTerms && !btnClearTerms._bound) {
      btnClearTerms._bound = true;
      btnClearTerms.addEventListener('click', () => {
        wizardState.draftPayCol.terms = [];
        this.renderWizardStep2DraftTerms();
      });
    }

    // Paso 3: Selectores de agrupación, posición de subtotales y %
    const selG1 = document.getElementById('rw-group-level-1');
    const selG2 = document.getElementById('rw-group-level-2');
    const syncGroupings = () => {
      const arr = [];
      if (selG1?.value) arr.push(selG1.value);
      if (selG2?.value && selG2.value !== selG1?.value) arr.push(selG2.value);
      wizardState.groupings = arr;
      this.renderWizardStep3Groupings();
    };
    if (selG1 && !selG1._bound) {
      selG1._bound = true;
      selG1.addEventListener('change', syncGroupings);
    }
    if (selG2 && !selG2._bound) {
      selG2._bound = true;
      selG2.addEventListener('change', syncGroupings);
    }

    document.querySelectorAll('.rw-quick-add-group').forEach((btn) => {
      if (!btn._bound) {
        btn._bound = true;
        btn.addEventListener('click', () => {
          const fieldId = btn.getAttribute('data-field');
          const hrCat = availableMetadata?.categories?.find((c) => c.id === 'employee');
          const found = hrCat?.fields?.find((f) => f.id === fieldId);
          if (found && !wizardState.hrFields.some((f) => f.id === fieldId)) {
            wizardState.hrFields.push({
              id: found.id,
              title: found.title,
              type: 'FIELD',
              source: found.id,
              format: 'TEXT',
              align: 'left',
              totalize: false,
            });
          }
          wizardState.groupings = [fieldId];
          this.renderWizardStep3Groupings();
          showToast(`Campo '${found?.title || fieldId}' añadido y seleccionado para agrupar`, 'info');
        });
      }
    });

    document.querySelectorAll('input[name="rw-subtotal-pos"]').forEach((radio) => {
      if (!radio._bound) {
        radio._bound = true;
        radio.addEventListener('change', (e) => {
          wizardState.subtotalPosition = e.target.value;
        });
      }
    });

    const swPct = document.getElementById('rw-group-show-pct');
    if (swPct && !swPct._bound) {
      swPct._bound = true;
      swPct.addEventListener('change', () => {
        wizardState.showGroupPercentOfTotal = swPct.checked;
        const badge = document.getElementById('rw-subtotal-demo-pct');
        if (badge) badge.classList.toggle('d-none', !swPct.checked);
      });
    }

    // Paso 4: Gráfico
    const swChart = document.getElementById('rw-chart-enabled');
    if (swChart && !swChart._bound) {
      swChart._bound = true;
      swChart.addEventListener('change', () => {
        wizardState.chart.enabled = swChart.checked;
        this.renderWizardStep4Chart();
      });
    }

    document.querySelectorAll('input[name="rw-chart-type-radio"]').forEach((radio) => {
      if (!radio._bound) {
        radio._bound = true;
        radio.addEventListener('change', (e) => {
          wizardState.chart.type = e.target.value;
        });
      }
    });

    const chartTitle = document.getElementById('rw-chart-title');
    if (chartTitle && !chartTitle._bound) {
      chartTitle._bound = true;
      chartTitle.addEventListener('input', (e) => {
        wizardState.chart.title = e.target.value;
      });
    }

    const chartX = document.getElementById('rw-chart-x');
    if (chartX && !chartX._bound) {
      chartX._bound = true;
      chartX.addEventListener('change', (e) => {
        wizardState.chart.xAxisField = e.target.value;
      });
    }

    const chartY = document.getElementById('rw-chart-y');
    if (chartY && !chartY._bound) {
      chartY._bound = true;
      chartY.addEventListener('change', (e) => {
        wizardState.chart.yAxisField = e.target.value;
      });
    }

    // Paso 5: Inputs de Nombre y Título
    const tplName = document.getElementById('rw-tpl-name');
    const tplRepTitle = document.getElementById('rw-tpl-report-title');
    if (tplName && !tplName._bound) {
      tplName._bound = true;
      tplName.addEventListener('input', (e) => {
        wizardState.name = e.target.value;
        if (tplRepTitle && (!tplRepTitle.value || tplRepTitle.dataset.autoSync !== 'false')) {
          tplRepTitle.value = e.target.value.toUpperCase();
          wizardState.reportTitle = tplRepTitle.value;
        }
      });
    }
    if (tplRepTitle && !tplRepTitle._bound) {
      tplRepTitle._bound = true;
      tplRepTitle.addEventListener('input', (e) => {
        tplRepTitle.dataset.autoSync = 'false';
        wizardState.reportTitle = e.target.value;
      });
    }
  };
}
