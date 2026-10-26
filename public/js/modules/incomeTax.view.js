import { apiRequest, showToast } from '../api.js';
import { formatNumber, formatCuit, escapeHtml } from '../utils/helpers.js';

function formatCurrency(val) {
  const num = Number(val !== undefined && val !== null ? val : 0);
  if (isNaN(num)) return '$ 0,00';
  return '$ ' + formatNumber(num, 2);
}

const DEDUCTION_TYPE_NAMES = {
  PREPAGA: 'Cuota Médico Asistencial (Prepaga)',
  HONORARIOS_MEDICOS: 'Honorarios Médicos y Asist. Sanitaria (40% computable)',
  CAJA_PREVISIONAL: 'Aportes Cajas Previsionales Provinciales / SGR',
  GASTOS_EDUCATIVOS: 'Servicios y Herramientas Educativas',
  ALQUILER_INQUILINO: 'Alquiler Casa Habitación (Inquilino)',
  ALQUILER_DUENO: 'Alquiler Casa Habitación (Propietario / Dueño)',
  DOMESTICO: 'Personal Casas Particulares (Servicio Doméstico)',
  SEGURO_VIDA: 'Seguro de Vida',
  SEGURO_RETIRO: 'Seguro de Retiro Privado',
  HIPOTECARIO: 'Intereses Crédito Hipotecario',
  SEPELIO: 'Gastos de Sepelio',
  DONACIONES: 'Donaciones a Entidades Exentas',
  INDUMENTARIA: 'Gastos de Indumentaria y Equipamiento',
  VIATICOS: 'Gastos de Movilidad y Viáticos',
  CARGA_FAMILIA_SPOUSE: 'Carga de Familia: Cónyuge / Conviviente',
  CARGA_FAMILIA_CHILD: 'Carga de Familia: Hijo/a menor de 18',
  CARGA_FAMILIA_DISABLED_CHILD: 'Carga de Familia: Hijo/a Incapacitado/a',
  OTRO: 'Otras Deducciones Generales',
};

export function formatDeductionType(type) {
  return DEDUCTION_TYPE_NAMES[type] || type || 'Deducción General';
}

export function registerIncomeTaxMethods(proto) {
  // Estado interno del módulo de Ganancias
  proto.incomeTaxState = {
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth() + 1,
    currentSettlement: null,
    currentDetail: null,
    currentProfile: null,
    selectedProfileEmployeeId: null,
    monthlyFilters: {
      searchTerm: '',
      withholdingOnly: false,
      page: 1,
      pageSize: 10,
    },
    cachedTables: [],
    cachedScales: [],
    cachedLimits: [],
  };

  /**
   * Inicializa y carga la vista principal de Ganancias 4ta Categoría.
   */
  proto.renderIncomeTaxView = async function () {
    const yearSelect = document.getElementById('it-global-year-select');
    if (yearSelect && !yearSelect.value) {
      const currentYear = new Date().getFullYear();
      yearSelect.value = currentYear.toString();
      this.incomeTaxState.selectedYear = currentYear;
    }

    // Configurar listeners de tabs internas si aún no se configuraron
    this.setupIncomeTaxTabs();

    // Cargar la pestaña activa (por defecto liquidación mensual)
    await this.loadMonthlyIncomeTaxView();
  };

  /**
   * Configura listeners de eventos para las pestañas de Ganancias.
   */
  proto.setupIncomeTaxTabs = function () {
    if (this._incomeTaxTabsConfigured) return;
    this._incomeTaxTabsConfigured = true;

    // Selector de año global
    const yearSelect = document.getElementById('it-global-year-select');
    if (yearSelect) {
      yearSelect.addEventListener('change', async (e) => {
        this.incomeTaxState.selectedYear = parseInt(e.target.value, 10);
        await this.refreshActiveIncomeTaxTab();
      });
    }

    // Tabs internas
    const tabButtons = document.querySelectorAll('#income-tax-subtabs .nav-link');
    tabButtons.forEach((btn) => {
      btn.addEventListener('shown.bs.tab', async (e) => {
        const targetId = e.target.getAttribute('data-bs-target');
        if (targetId === '#it-pane-monthly') {
          await this.loadMonthlyIncomeTaxView();
        } else if (targetId === '#it-pane-profile') {
          await this.loadTaxProfileView();
        } else if (targetId === '#it-pane-siradig') {
          await this.loadSiradigHistory();
        } else if (targetId === '#it-pane-tables') {
          await this.loadTaxTablesView();
        } else if (targetId === '#it-pane-annual') {
          await this.loadAnnualTaxView();
        }
      });
    });

    // Selector de mes de liquidación
    const monthSelect = document.getElementById('it-monthly-month-select');
    if (monthSelect) {
      monthSelect.addEventListener('change', async (e) => {
        this.incomeTaxState.selectedMonth = parseInt(e.target.value, 10);
        this.incomeTaxState.monthlyFilters.page = 1;
        await this.loadMonthlyIncomeTaxView();
      });
    }

    // Filtro por colaborador (Buscador)
    const searchEmp = document.getElementById('it-monthly-search-employee');
    if (searchEmp) {
      searchEmp.addEventListener('input', (e) => {
        this.incomeTaxState.monthlyFilters.searchTerm = (e.target.value || '').trim().toLowerCase();
        this.incomeTaxState.monthlyFilters.page = 1;
        this.renderMonthlyTable();
      });
    }

    // Filtro para mostrar solo colaboradores con saldo
    const filterWithholding = document.getElementById('it-monthly-filter-withholding-only');
    if (filterWithholding) {
      filterWithholding.addEventListener('change', (e) => {
        this.incomeTaxState.monthlyFilters.withholdingOnly = e.target.checked;
        this.incomeTaxState.monthlyFilters.page = 1;
        this.renderMonthlyTable();
      });
    }

    // Selector de tamaño de página en Browse
    const pageSizeSel = document.getElementById('it-monthly-page-size');
    if (pageSizeSel) {
      pageSizeSel.addEventListener('change', (e) => {
        this.incomeTaxState.monthlyFilters.pageSize = parseInt(e.target.value, 10) || 10;
        this.incomeTaxState.monthlyFilters.page = 1;
        this.renderMonthlyTable();
      });
    }

    // Botones de paginación anterior / siguiente
    const btnPrev = document.getElementById('btn-it-monthly-prev');
    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        if (this.incomeTaxState.monthlyFilters.page > 1) {
          this.incomeTaxState.monthlyFilters.page--;
          this.renderMonthlyTable();
        }
      });
    }
    const btnNext = document.getElementById('btn-it-monthly-next');
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        this.incomeTaxState.monthlyFilters.page++;
        this.renderMonthlyTable();
      });
    }

    // Botón de cálculo mensual
    const btnCalc = document.getElementById('btn-it-calculate-monthly');
    if (btnCalc) {
      btnCalc.addEventListener('click', async () => {
        await this.runMonthlyIncomeTaxCalculation();
      });
    }

    // Botón de exportar a nómina
    const btnOpenExport = document.getElementById('btn-it-open-export-modal');
    if (btnOpenExport) {
      btnOpenExport.addEventListener('click', () => {
        this.openExportToPayrollModal();
      });
    }

    // Botón para imprimir PDF A4 del modal Desglose Impositivo
    const btnPrintDetail = document.getElementById('btn-it-detail-print-pdf');
    if (btnPrintDetail) {
      btnPrintDetail.addEventListener('click', () => this.printSettlementDetailPdf());
    }
    const btnPrintDetailFooter = document.getElementById('btn-it-detail-print-pdf-footer');
    if (btnPrintDetailFooter) {
      btnPrintDetailFooter.addEventListener('click', () => this.printSettlementDetailPdf());
    }

    // Botón "Ver Detalle" en Legajo Fiscal 360°
    const btnProfileOpenDetail = document.getElementById('btn-it-profile-open-detail');
    if (btnProfileOpenDetail) {
      btnProfileOpenDetail.addEventListener('click', () => this.showEmployeeTaxProfileDetailModal());
    }

    // Botón para imprimir PDF A4 del Legajo Fiscal 360°
    const btnPrintProfile = document.getElementById('btn-it-profile-print-pdf');
    if (btnPrintProfile) {
      btnPrintProfile.addEventListener('click', () => this.printEmployeeTaxProfilePdf());
    }
    const btnPrintProfileFooter = document.getElementById('btn-it-profile-print-pdf-footer');
    if (btnPrintProfileFooter) {
      btnPrintProfileFooter.addEventListener('click', () => this.printEmployeeTaxProfilePdf());
    }

    // Formulario de confirmación de exportación a nómina
    const formExport = document.getElementById('form-income-tax-export-payroll');
    if (formExport) {
      formExport.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.confirmExportToPayroll();
      });
    }

    // Selectores de conceptos en el modal de exportación (validación en tiempo real de ARCA)
    const selWithholding = document.getElementById('it-export-withholding-concept');
    if (selWithholding) {
      selWithholding.addEventListener('change', () => this.validateExportConceptsUi());
    }
    const selRefund = document.getElementById('it-export-refund-concept');
    if (selRefund) {
      selRefund.addEventListener('change', () => this.validateExportConceptsUi());
    }

    // Selector de empleado en Legajo Fiscal
    const selEmpProfile = document.getElementById('it-profile-employee-select');
    if (selEmpProfile) {
      selEmpProfile.addEventListener('change', async (e) => {
        const empId = e.target.value;
        if (empId) {
          this.incomeTaxState.selectedProfileEmployeeId = empId;
          await this.loadEmployeeTaxProfile(empId);
        }
      });
    }

    // Procesar archivo SiRADIG
    const btnProcessSiradig = document.getElementById('btn-siradig-process');
    if (btnProcessSiradig) {
      btnProcessSiradig.addEventListener('click', async () => {
        await this.processSiradigXml();
      });
    }

    // Modal de confirmación de cargas de familia SiRADIG no empadronadas
    const btnSiradigAddAll = document.getElementById('btn-siradig-relatives-add-all');
    if (btnSiradigAddAll) {
      btnSiradigAddAll.addEventListener('click', async () => {
        const modalEl = document.getElementById('modal-siradig-unregistered-relatives');
        if (modalEl && window.bootstrap) {
          const modal = window.bootstrap.Modal.getInstance(modalEl);
          if (modal) modal.hide();
        }
        if (this.pendingSiradigImport) {
          await this.executeSiradigImport({
            ...this.pendingSiradigImport,
            incorporateToPersonnel: true,
          });
          this.pendingSiradigImport = null;
        }
      });
    }

    const btnSiradigOnlyTax = document.getElementById('btn-siradig-relatives-only-tax');
    if (btnSiradigOnlyTax) {
      btnSiradigOnlyTax.addEventListener('click', async () => {
        const modalEl = document.getElementById('modal-siradig-unregistered-relatives');
        if (modalEl && window.bootstrap) {
          const modal = window.bootstrap.Modal.getInstance(modalEl);
          if (modal) modal.hide();
        }
        if (this.pendingSiradigImport) {
          await this.executeSiradigImport({
            ...this.pendingSiradigImport,
            incorporateToPersonnel: false,
          });
          this.pendingSiradigImport = null;
        }
      });
    }

    // Selector de mes para escala Art. 94 en Tablas Impositivas
    const selArt94Month = document.getElementById('it-tables-art94-month-select');
    if (selArt94Month) {
      selArt94Month.addEventListener('change', async () => {
        await this.loadArt94Scale();
      });
    }

    // Sub-pestañas tipo píldoras de Tablas Impositivas
    const pillButtons = document.querySelectorAll('#it-tax-tables-pills .nav-link');
    pillButtons.forEach((btn) => {
      btn.addEventListener('shown.bs.tab', async (e) => {
        const target = e.target.getAttribute('data-bs-target');
        if (target === '#pill-tax-art94') {
          await this.loadArt94Scale();
        } else if (target === '#pill-tax-art30') {
          if (!this.incomeTaxState.cachedTables || this.incomeTaxState.cachedTables.length === 0) {
            await this.loadTaxTablesView();
          }
        }
      });
    });

    // Botón para clonar/ajustar tablas por IPC
    const formAdjustIpc = document.getElementById('form-income-tax-adjust-ipc');
    if (formAdjustIpc) {
      formAdjustIpc.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.applyIpcAdjustment();
      });
    }

    // Botón calcular liquidación anual F.1359
    const btnCalcAnnual = document.getElementById('btn-it-calc-annual');
    if (btnCalcAnnual) {
      btnCalcAnnual.addEventListener('click', async () => {
        await this.runAnnualTaxCalculation();
      });
    }

    // Botón descargar archivo oficial ARCA F.1359
    const btnDownloadF1359 = document.getElementById('btn-it-download-f1359');
    if (btnDownloadF1359) {
      btnDownloadF1359.addEventListener('click', async () => {
        await this.downloadF1359();
      });
    }
  };

  /**
   * Refresca la subpestaña actualmente visible.
   */
  proto.refreshActiveIncomeTaxTab = async function () {
    const activeTab = document.querySelector('#income-tax-subtabs .nav-link.active');
    const targetId = activeTab ? activeTab.getAttribute('data-bs-target') : '#it-pane-monthly';
    if (targetId === '#it-pane-monthly') {
      await this.loadMonthlyIncomeTaxView();
    } else if (targetId === '#it-pane-profile') {
      await this.loadTaxProfileView();
    } else if (targetId === '#it-pane-siradig') {
      await this.loadSiradigHistory();
    } else if (targetId === '#it-pane-tables') {
      await this.loadTaxTablesView();
    } else if (targetId === '#it-pane-annual') {
      await this.loadAnnualTaxView();
    }
  };

  // ==========================================================================
  // 1. LIQUIDACIÓN MENSUAL ACUMULATIVA
  // ==========================================================================

  proto.loadMonthlyIncomeTaxView = async function () {
    const year = this.incomeTaxState.selectedYear;
    const monthSelect = document.getElementById('it-monthly-month-select');
    const month = monthSelect ? parseInt(monthSelect.value || '1', 10) : this.incomeTaxState.selectedMonth;

    try {
      // Buscar liquidaciones existentes para este año
      const res = await apiRequest(`/income-tax/settlements?fiscalYear=${year}`);
      const settlements = res.data || [];

      // Buscar liquidación específica del mes
      const current = settlements.find((s) => s.month === month && s.settlementType === 'MONTHLY');
      if (current) {
        const detailRes = await apiRequest(`/income-tax/settlements/${current.id}`);
        this.incomeTaxState.currentSettlement = detailRes.data;
        this.renderSettlementDetails(detailRes.data);
      } else {
        this.incomeTaxState.currentSettlement = null;
        this.renderEmptySettlement(year, month);
      }
    } catch (err) {
      console.warn('Aviso al cargar liquidación de ganancias:', err.message);
      this.renderEmptySettlement(year, month);
    }
  };

  proto.renderSettlementDetails = function (settlement) {
    // Totales integrados en la barra superior
    const elEvaluated = document.getElementById('it-kpi-evaluated');
    const elWithheld = document.getElementById('it-kpi-withheld-amount');
    const elRefund = document.getElementById('it-kpi-refund-amount');
    const elCount = document.getElementById('it-kpi-withheld-count');

    if (elEvaluated) elEvaluated.textContent = settlement.totalEmployeesEvaluated || 0;
    if (elWithheld) elWithheld.textContent = formatCurrency(settlement.totalWithheldAmount || 0);
    if (elRefund) elRefund.textContent = formatCurrency(settlement.totalRefundAmount || 0);
    if (elCount) elCount.textContent = settlement.totalEmployeesWithheld || 0;

    // Habilitar botón de exportación
    const btnExport = document.getElementById('btn-it-open-export-modal');
    if (btnExport) {
      btnExport.disabled = false;
      if (settlement.status === 'EXPORTED_TO_PAYROLL') {
        btnExport.className = 'btn btn-outline-success btn-sm py-1 px-2 text-nowrap';
        btnExport.innerHTML = '<i class="ti ti-check me-1"></i> Exportado (Reexportar)';
      } else {
        btnExport.className = 'btn btn-primary btn-sm py-1 px-2 text-nowrap';
        btnExport.innerHTML = '<i class="ti ti-file-upload me-1"></i> Exportar';
      }
    }

    // Renderizar tabla con filtros reactivos y paginación
    this.renderMonthlyTable();
  };

  /**
   * Renderiza el browse de liquidación mensual aplicando filtros de búsqueda,
   * filtro de solo colaboradores con saldo y paginación en el cliente.
   */
  proto.renderMonthlyTable = function () {
    const tbody = document.getElementById('it-monthly-table-body');
    if (!tbody) return;

    const settlement = this.incomeTaxState.currentSettlement;
    const allDetails = (settlement && settlement.details) ? settlement.details : [];

    const { searchTerm, withholdingOnly, page, pageSize } = this.incomeTaxState.monthlyFilters;

    // 1. Filtrar registros
    let filtered = allDetails;
    if (searchTerm) {
      filtered = filtered.filter((d) => {
        const emp = d.employee || {};
        const fullName = `${emp.lastName || ''} ${emp.firstName || ''}`.toLowerCase();
        const fileNo = String(emp.fileNumber || '').toLowerCase();
        const cuilClean = String(emp.cuil || '').replace(/\D/g, '');
        const searchClean = searchTerm.replace(/\D/g, '');
        return (
          fullName.includes(searchTerm) ||
          fileNo.includes(searchTerm) ||
          (searchClean && cuilClean.includes(searchClean))
        );
      });
    }

    if (withholdingOnly) {
      filtered = filtered.filter((d) => Number(d.netMonthlyWithholding || 0) !== 0);
    }

    // 2. Calcular paginación
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    if (this.incomeTaxState.monthlyFilters.page > totalPages) {
      this.incomeTaxState.monthlyFilters.page = totalPages;
    }
    const currentPage = this.incomeTaxState.monthlyFilters.page;
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, totalItems);
    const pageItems = filtered.slice(startIdx, endIdx);

    // 3. Actualizar controles de paginación
    const elInfo = document.getElementById('it-monthly-pagination-info');
    const elPages = document.getElementById('it-monthly-pagination-pages');
    const btnPrev = document.getElementById('btn-it-monthly-prev');
    const btnNext = document.getElementById('btn-it-monthly-next');

    if (elInfo) {
      if (totalItems === 0) {
        elInfo.textContent = 'Mostrando 0 a 0 de 0 colaboradores';
      } else {
        const filterSuffix = totalItems !== allDetails.length ? ` (filtrados de ${allDetails.length})` : '';
        elInfo.textContent = `Mostrando ${startIdx + 1} a ${endIdx} de ${totalItems} colaboradores${filterSuffix}`;
      }
    }

    if (elPages) {
      elPages.textContent = `Pág. ${currentPage} / ${totalPages}`;
    }

    if (btnPrev) btnPrev.disabled = (currentPage <= 1);
    if (btnNext) btnNext.disabled = (currentPage >= totalPages);

    // 4. Renderizar registros o estados vacíos
    if (allDetails.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted"><i class="ti ti-calculator fs-2 text-muted mb-2 d-block"></i>No hay registros calculados para este mes.</td></tr>';
      return;
    }

    if (pageItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted"><i class="ti ti-search fs-2 text-muted mb-2 d-block"></i>No se encontraron colaboradores que coincidan con los filtros aplicados.</td></tr>';
      return;
    }

    tbody.innerHTML = pageItems
      .map((d) => {
        const emp = d.employee || {};
        const net = Number(d.netMonthlyWithholding);
        let statusBadge = '<span class="badge bg-secondary-lt font-monospace">$ 0,00</span>';
        if (net > 0) {
          statusBadge = `<span class="badge bg-danger-lt fw-bold font-monospace" title="Saldo a Retener en Recibo">+ ${formatCurrency(net)}</span>`;
        } else if (net < 0) {
          statusBadge = `<span class="badge bg-teal-lt fw-bold font-monospace" title="Saldo a Reintegrar al Colaborador">- ${formatCurrency(Math.abs(net))}</span>`;
        }

        const fullName = `${emp.lastName || ''}, ${emp.firstName || ''}`;

        return `
          <tr>
            <td>
              <div class="fw-bold text-dark text-truncate" style="max-width: 220px;" title="${fullName}">
                ${fullName}
              </div>
              <div class="text-muted font-monospace small" style="font-size: 0.72rem;">
                Leg. ${emp.fileNumber || '-'} · ${formatCuit(emp.cuil || '')}
              </div>
            </td>
            <td class="text-end">
              <div class="font-monospace fw-semibold text-dark text-nowrap">${formatCurrency(d.accumulatedGross)}</div>
              <div class="text-muted font-monospace small text-nowrap" style="font-size: 0.70rem;" title="SAC Proyectado Acumulado">
                + SAC: ${formatCurrency(d.sacProjectedAccumulated)}
              </div>
            </td>
            <td class="text-end">
              <div class="font-monospace text-muted text-nowrap" title="Aportes de Ley Acumulados (17%)">
                Ley: ${formatCurrency(d.legalDeductionsAccumulated)}
              </div>
              <div class="font-monospace text-muted small text-nowrap" style="font-size: 0.70rem;" title="Deducciones Generales SiRADIG">
                Gral: ${formatCurrency(d.generalDeductionsAccumulated)}
              </div>
            </td>
            <td class="text-end">
              <div class="font-monospace text-muted text-nowrap" title="MNI + Deducción Especial + Cargas de Familia">
                ${formatCurrency(d.personalDeductionsAccumulated)}
              </div>
              <div class="text-muted small text-nowrap" style="font-size: 0.70rem;">MNI + Esp + Fam</div>
            </td>
            <td class="text-end">
              <div class="font-monospace fw-bold text-nowrap ${Number(d.netTaxableIncomeAccumulated) > 0 ? 'text-primary' : 'text-muted'}">
                ${formatCurrency(d.netTaxableIncomeAccumulated)}
              </div>
              <div class="text-muted small text-nowrap" style="font-size: 0.70rem;">Ganancia Neta</div>
            </td>
            <td class="text-end">
              <div class="font-monospace text-dark text-nowrap" title="Impuesto Determinado Acumulado">${formatCurrency(d.determinedTaxAccumulated)}</div>
              <div class="font-monospace text-muted small text-nowrap" style="font-size: 0.70rem;" title="Retenciones practicadas en meses anteriores">
                Prev: ${formatCurrency(d.priorMonthsWithheldTax)}
              </div>
            </td>
            <td class="text-end">
              <div class="d-flex align-items-center justify-content-end gap-1">
                <div>${statusBadge}</div>
                <button type="button" class="btn btn-sm btn-ghost-primary btn-icon rounded-circle p-0" data-detail-id="${d.id}" title="Ver desglose analítico completo" style="width: 28px; height: 28px;">
                  <i class="ti ti-file-analytics fs-3"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    // Listener delegado para abrir modal de desglose
    tbody.onclick = (e) => {
      const btn = e.target.closest('[data-detail-id]');
      if (btn) {
        const detailId = btn.getAttribute('data-detail-id');
        this.showSettlementDetailModal(detailId);
      }
    };
  };

  proto.renderEmptySettlement = function (year, month) {
    const elEvaluated = document.getElementById('it-kpi-evaluated');
    const elWithheld = document.getElementById('it-kpi-withheld-amount');
    const elRefund = document.getElementById('it-kpi-refund-amount');
    const elCount = document.getElementById('it-kpi-withheld-count');

    if (elEvaluated) elEvaluated.textContent = '0';
    if (elWithheld) elWithheld.textContent = '$ 0,00';
    if (elRefund) elRefund.textContent = '$ 0,00';
    if (elCount) elCount.textContent = '0';

    const btnExport = document.getElementById('btn-it-open-export-modal');
    if (btnExport) btnExport.disabled = true;

    const tbody = document.getElementById('it-monthly-table-body');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-4 text-muted">
            <i class="ti ti-calculator fs-2 text-muted mb-2 d-block"></i>
            No se ha liquidado el período ${month}/${year}. Haga click en <strong>"Calcular"</strong> para procesar la nómina.
          </td>
        </tr>
      `;
    }

    const elInfo = document.getElementById('it-monthly-pagination-info');
    const elPages = document.getElementById('it-monthly-pagination-pages');
    const btnPrev = document.getElementById('btn-it-monthly-prev');
    const btnNext = document.getElementById('btn-it-monthly-next');
    if (elInfo) elInfo.textContent = 'Mostrando 0 a 0 de 0 colaboradores';
    if (elPages) elPages.textContent = 'Pág. 1 / 1';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
  };

  proto.runMonthlyIncomeTaxCalculation = async function () {
    const year = this.incomeTaxState.selectedYear;
    const monthSelect = document.getElementById('it-monthly-month-select');
    const month = monthSelect ? parseInt(monthSelect.value, 10) : 1;

    try {
      showToast('Calculando liquidación de Ganancias 4ta Categoría...', 'info');
      const res = await apiRequest('/income-tax/settlements/calculate', {
        method: 'POST',
        body: JSON.stringify({
          fiscalYear: year,
          month,
          settlementType: 'MONTHLY',
        }),
      });

      showToast(res.message || 'Cálculo finalizado exitosamente', 'success');
      await this.loadMonthlyIncomeTaxView();
    } catch (err) {
      console.error('Error al calcular liquidación de Ganancias:', err);
      showToast(err.message || 'Error al calcular Ganancias', 'danger');
    }
  };

  /**
   * Muestra modal analítico con el desglose de los 12 conceptos para el colaborador seleccionado.
   */
  proto.showSettlementDetailModal = function (detailId) {
    const settlement = this.incomeTaxState.currentSettlement;
    if (!settlement || !settlement.details) return;

    const d = settlement.details.find((x) => x.id === detailId);
    if (!d) return;

    this.incomeTaxState.currentDetail = d;

    const emp = d.employee || {};
    const titleEl = document.getElementById('it-modal-detail-title');
    const subEl = document.getElementById('it-modal-detail-subtitle');
    const bodyEl = document.getElementById('it-modal-detail-body');

    if (titleEl) titleEl.textContent = `Desglose Impositivo: ${emp.lastName || ''}, ${emp.firstName || ''}`;
    if (subEl) subEl.textContent = `CUIL: ${formatCuit(emp.cuil || '')} | Legajo: ${emp.fileNumber || '-'} | Período: ${settlement.month}/${settlement.fiscalYear}`;

    const net = Number(d.netMonthlyWithholding);
    let resultAlert = '';
    if (net > 0) {
      resultAlert = `
        <div class="alert alert-danger d-flex align-items-center justify-content-between p-2 mb-3">
          <div><i class="ti ti-arrow-down-right fs-2 me-2"></i><strong>Retención del Mes a Practicar en Recibo:</strong></div>
          <span class="fs-2 fw-bold font-monospace">+ ${formatCurrency(net)}</span>
        </div>
      `;
    } else if (net < 0) {
      resultAlert = `
        <div class="alert alert-success d-flex align-items-center justify-content-between p-2 mb-3">
          <div><i class="ti ti-arrow-up-right fs-2 me-2"></i><strong>Saldo a Favor / Reintegro al Colaborador:</strong></div>
          <span class="fs-2 fw-bold font-monospace text-teal">- ${formatCurrency(Math.abs(net))}</span>
        </div>
      `;
    } else {
      resultAlert = `
        <div class="alert alert-secondary d-flex align-items-center justify-content-between p-2 mb-3">
          <div><i class="ti ti-check fs-2 me-2"></i><strong>Sin Retención ni Saldo a Favor:</strong></div>
          <span class="fs-2 fw-bold font-monospace">$ 0,00</span>
        </div>
      `;
    }

    if (bodyEl) {
      bodyEl.innerHTML = `
        ${resultAlert}
        <div class="table-responsive border rounded mb-3">
          <table class="table table-sm table-striped mb-0">
            <thead class="table-light">
              <tr>
                <th>Concepto Impositivo Acumulativo</th>
                <th class="text-end">Importe Acumulado</th>
                <th>Observaciones / Base Legal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="fw-bold"><i class="ti ti-coin me-1 text-primary"></i> Remuneración Bruta Acumulada</td>
                <td class="text-end font-monospace fw-bold">${formatCurrency(d.accumulatedGross)}</td>
                <td class="small text-muted">Haberes computables devengados meses 1 a ${settlement.month}</td>
              </tr>
              <tr>
                <td><i class="ti ti-calendar-event me-1 text-muted"></i> SAC Proyectado Acumulado (1/12)</td>
                <td class="text-end font-monospace">${formatCurrency(d.sacProjectedAccumulated)}</td>
                <td class="small text-muted">Art. 30 RG 4003/2017 (Prorrateo doceava parte)</td>
              </tr>
              <tr>
                <td><i class="ti ti-receipt-refund me-1 text-danger"></i> Deducciones de Ley Acumuladas</td>
                <td class="text-end font-monospace text-danger">- ${formatCurrency(d.legalDeductionsAccumulated)}</td>
                <td class="small text-muted">Aportes jubilación (11%), ley 19.032 (3%) y obra social (3%)</td>
              </tr>
              <tr>
                <td><i class="ti ti-receipt me-1 text-teal"></i> Deducciones Generales Acumuladas</td>
                <td class="text-end font-monospace text-teal">- ${formatCurrency(d.generalDeductionsAccumulated)}</td>
                <td class="small text-muted">Alquileres, prepaga, donaciones declaradas en SiRADIG</td>
              </tr>
              <tr>
                <td><i class="ti ti-users me-1 text-indigo"></i> Deducciones Personales Art. 30</td>
                <td class="text-end font-monospace text-indigo">- ${formatCurrency(d.personalDeductionsAccumulated)}</td>
                <td class="small text-muted">MNI, Deducción Especial y Cargas de Familia computables</td>
              </tr>
              <tr class="table-primary fw-bold">
                <td><i class="ti ti-calculator me-1"></i> Ganancia Neta Sujeta a Impuesto (Base)</td>
                <td class="text-end font-monospace">${formatCurrency(d.netTaxableIncomeAccumulated)}</td>
                <td class="small">Base imponible acumulada para escala Art. 94</td>
              </tr>
              <tr>
                <td><i class="ti ti-scale me-1 text-warning"></i> Impuesto Determinado Acumulado</td>
                <td class="text-end font-monospace fw-bold text-dark">${formatCurrency(d.determinedTaxAccumulated)}</td>
                <td class="small text-muted">Cálculo acumulativo sobre escala progresiva Art. 94</td>
              </tr>
              <tr>
                <td><i class="ti ti-history me-1 text-muted"></i> Retenciones Practicadas en Meses Previos</td>
                <td class="text-end font-monospace text-muted">- ${formatCurrency(d.priorMonthsWithheldTax)}</td>
                <td class="small text-muted">Pagos y retenciones acumuladas hasta mes ${settlement.month - 1}</td>
              </tr>
              <tr class="table-light fw-bold fs-4">
                <td>Resultado Neto a Liquidar en Nómina</td>
                <td class="text-end font-monospace ${net > 0 ? 'text-danger' : net < 0 ? 'text-teal' : 'text-dark'}">${net >= 0 ? '+ ' : '- '}${formatCurrency(Math.abs(net))}</td>
                <td class="small">${net > 0 ? 'Concepto Retención (820000)' : net < 0 ? 'Concepto Reintegro (520002)' : 'Sin impacto en recibo'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }

    const modalEl = document.getElementById('modal-income-tax-row-detail');
    if (modalEl && window.bootstrap) {
      const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  };

  /**
   * Imprime en hoja A4 el Desglose Impositivo del colaborador seleccionado.
   */
  proto.printSettlementDetailPdf = function () {
    const settlement = this.incomeTaxState.currentSettlement;
    const d = this.incomeTaxState.currentDetail;
    if (!settlement || !d) {
      showToast('No hay datos de liquidación seleccionados para imprimir', 'warning');
      return;
    }

    const emp = d.employee || {};
    const company = this.activeCompany || (window.app && window.app.activeCompany) || {};
    const companyName = escapeHtml(company.name || company.businessName || 'Empresa');
    const companyCuit = formatCuit(company.cuit || company.taxId || '');
    const companyAddress = escapeHtml(company.address || company.domicilio || '-');

    const empFullName = escapeHtml(`${emp.lastName || ''}, ${emp.firstName || ''}`);
    const empCuil = formatCuit(emp.cuil || '');
    const empFile = escapeHtml(emp.fileNumber || '-');
    const empPosition = escapeHtml(emp.jobPosition || emp.category || '-');
    const net = Number(d.netMonthlyWithholding);

    const monthNames = [
      '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const monthName = monthNames[settlement.month] || `Mes ${settlement.month}`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('El navegador bloqueó la ventana emergente. Por favor habilite las ventanas emergentes.', 'danger');
      return;
    }

    let statusBox = '';
    if (net > 0) {
      statusBox = `
        <div style="background-color: #fef2f2; border: 1.5px solid #dc2626; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="color: #991b1b; font-size: 8.5pt; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Resultado de la Liquidación Mensual</div>
            <div style="color: #111; font-size: 11pt; font-weight: bold;">Retención del Mes a Practicar en Recibo de Haberes</div>
            <div style="color: #666; font-size: 8pt;">Código ARCA oficial: <strong>820000</strong> (Retención Impuesto a las Ganancias 4ta Categoría)</div>
          </div>
          <div style="font-size: 16pt; font-weight: 800; font-family: monospace; color: #dc2626;">+ ${formatCurrency(net)}</div>
        </div>
      `;
    } else if (net < 0) {
      statusBox = `
        <div style="background-color: #f0fdf4; border: 1.5px solid #16a34a; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="color: #166534; font-size: 8.5pt; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Resultado de la Liquidación Mensual</div>
            <div style="color: #111; font-size: 11pt; font-weight: bold;">Saldo a Favor / Reintegro al Trabajador</div>
            <div style="color: #666; font-size: 8pt;">Código ARCA oficial: <strong>520002</strong> (Devolución Impuesto a las Ganancias 4ta Categoría)</div>
          </div>
          <div style="font-size: 16pt; font-weight: 800; font-family: monospace; color: #16a34a;">- ${formatCurrency(Math.abs(net))}</div>
        </div>
      `;
    } else {
      statusBox = `
        <div style="background-color: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="color: #475569; font-size: 8.5pt; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Resultado de la Liquidación Mensual</div>
            <div style="color: #111; font-size: 11pt; font-weight: bold;">Sin Retención ni Reintegro para el Período</div>
            <div style="color: #666; font-size: 8pt;">La ganancia neta no supera el mínimo computable acumulado o el impuesto determinado se compensa íntegramente.</div>
          </div>
          <div style="font-size: 16pt; font-weight: 800; font-family: monospace; color: #475569;">$ 0,00</div>
        </div>
      `;
    }

    const printHtml = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Desglose Impositivo — ${empFullName} — ${monthName} ${settlement.fiscalYear}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            background: #fff;
            margin: 0;
            padding: 0;
            font-size: 9pt;
            line-height: 1.35;
          }
          .header-box {
            border-bottom: 2px solid #0054a6;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .company-title {
            font-size: 13pt;
            font-weight: 800;
            color: #0054a6;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .doc-title {
            font-size: 12pt;
            font-weight: 700;
            color: #0f172a;
            margin-top: 4px;
          }
          .doc-sub {
            font-size: 8pt;
            color: #64748b;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 8px 12px;
            margin-bottom: 12px;
            font-size: 8.5pt;
          }
          .info-item strong {
            color: #334155;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8.5pt;
            margin-bottom: 14px;
          }
          th {
            background-color: #0054a6;
            color: #fff;
            padding: 6px 8px;
            text-align: left;
            font-size: 7.5pt;
            font-weight: 700;
            text-transform: uppercase;
            border: 1px solid #0054a6;
          }
          td {
            padding: 5px 8px;
            border: 1px solid #e2e8f0;
            vertical-align: middle;
          }
          tr:nth-child(even) td {
            background-color: #f8fafc;
          }
          .row-highlight td {
            background-color: #eff6ff !important;
            font-weight: bold;
          }
          .row-total td {
            background-color: #f1f5f9 !important;
            border-top: 2px solid #0054a6 !important;
            font-weight: bold;
            font-size: 9.5pt;
          }
          .text-end { text-align: right; }
          .font-mono { font-family: monospace; }
          .signatures {
            margin-top: 35px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            page-break-inside: avoid;
          }
          .signature-box {
            border-top: 1px solid #94a3b8;
            padding-top: 6px;
            text-align: center;
            font-size: 8pt;
            color: #475569;
          }
          .legal-footer {
            margin-top: 15px;
            font-size: 7pt;
            color: #94a3b8;
            text-align: center;
            border-top: 1px dashed #cbd5e1;
            padding-top: 6px;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div class="company-title">${companyName}</div>
              <div class="doc-sub">CUIT: ${companyCuit || '-'} · Domicilio: ${companyAddress}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: bold; color: #0054a6; font-size: 9pt;">AGENTE DE RETENCIÓN ARCA</div>
              <div class="doc-sub">Emisión: ${new Date().toLocaleDateString('es-AR')}</div>
            </div>
          </div>
          <div class="doc-title">DESGLOSE ANALÍTICO DE IMPUESTO A LAS GANANCIAS (4ta CATEGORÍA)</div>
          <div class="doc-sub">Régimen de Retención Acumulativo de Empleados en Relación de Dependencia — Ley 27.743 y RG (AFIP) 4003/2017</div>
        </div>

        <div class="info-grid">
          <div class="info-item"><strong>Colaborador:</strong> ${empFullName}</div>
          <div class="info-item"><strong>Período Fiscal:</strong> ${monthName} ${settlement.fiscalYear} (Mes ${settlement.month})</div>
          <div class="info-item"><strong>CUIL:</strong> <span class="font-mono">${empCuil}</span> · <strong>Legajo:</strong> ${empFile}</div>
          <div class="info-item"><strong>Cargo / Puesto:</strong> ${empPosition}</div>
        </div>

        ${statusBox}

        <table>
          <thead>
            <tr>
              <th style="width: 50%;">Concepto Impositivo Acumulativo</th>
              <th class="text-end" style="width: 20%;">Importe Acumulado</th>
              <th style="width: 30%;">Fundamento Técnico / Base Legal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>1. Remuneraciones Brutas Computables Acumuladas</strong></td>
              <td class="text-end font-mono"><strong>${formatCurrency(d.accumulatedGross)}</strong></td>
              <td style="color: #64748b;">Haberes remunerativos y no remunerativos gravados devengados acumulados</td>
            </tr>
            <tr>
              <td>2. SAC Proyectado Acumulado (1/12 parte)</td>
              <td class="text-end font-mono">${formatCurrency(d.sacProjectedAccumulated)}</td>
              <td style="color: #64748b;">Art. 30 RG 4003/2017 (Adición mensual de la doceava parte del SAC)</td>
            </tr>
            <tr class="row-highlight">
              <td><strong>Total Haberes Computables Acumulados</strong></td>
              <td class="text-end font-mono"><strong>${formatCurrency(Number(d.accumulatedGross || 0) + Number(d.sacProjectedAccumulated || 0))}</strong></td>
              <td style="color: #64748b;">Base bruta total previa a deducciones</td>
            </tr>
            <tr>
              <td>3. Deducciones Obligatorias de Ley Acumuladas (17%)</td>
              <td class="text-end font-mono" style="color: #dc2626;">- ${formatCurrency(d.legalDeductionsAccumulated)}</td>
              <td style="color: #64748b;">Jubilación (11%), Ley 19.032 (3%) y Obra Social (3%) acumuladas</td>
            </tr>
            <tr>
              <td>4. Deducciones Generales SiRADIG Acumuladas (Art. 85)</td>
              <td class="text-end font-mono" style="color: #0d9488;">- ${formatCurrency(d.generalDeductionsAccumulated)}</td>
              <td style="color: #64748b;">Alquileres, medicina prepaga, donaciones y conceptos F. 572 Web</td>
            </tr>
            <tr>
              <td>5. Deducciones Personales Art. 30 (MNI + Esp + Fam)</td>
              <td class="text-end font-mono" style="color: #4f46e5;">- ${formatCurrency(d.personalDeductionsAccumulated)}</td>
              <td style="color: #64748b;">Ganancia No Imponible, Deducción Especial y Cargas de Familia computables</td>
            </tr>
            <tr class="row-highlight">
              <td><strong>6. Ganancia Neta Sujeta a Impuesto Acumulada (Base)</strong></td>
              <td class="text-end font-mono" style="color: #0054a6;"><strong>${formatCurrency(d.netTaxableIncomeAccumulated)}</strong></td>
              <td style="color: #64748b;">Base imponible acumulada aplicada sobre la Escala Progresiva del Art. 94</td>
            </tr>
            <tr>
              <td>7. Impuesto Determinado Acumulado s/Escala Art. 94</td>
              <td class="text-end font-mono"><strong>${formatCurrency(d.determinedTaxAccumulated)}</strong></td>
              <td style="color: #64748b;">Obligación tributaria total acumulada correspondiente al período</td>
            </tr>
            <tr>
              <td>8. Retenciones Practicadas en Meses Anteriores del Período</td>
              <td class="text-end font-mono" style="color: #64748b;">- ${formatCurrency(d.priorMonthsWithheldTax)}</td>
              <td style="color: #64748b;">Suma de retenciones practicadas y compensadas en meses 1 a ${settlement.month - 1}</td>
            </tr>
            <tr class="row-total">
              <td><strong>9. Resultado Neto de Ganancias a Liquidar en Nómina</strong></td>
              <td class="text-end font-mono" style="color: ${net > 0 ? '#dc2626' : net < 0 ? '#0d9488' : '#0f172a'};">
                <strong>${net >= 0 ? '+ ' : '- '}${formatCurrency(Math.abs(net))}</strong>
              </td>
              <td><strong>${net > 0 ? 'Retención en Recibo (Código 820000)' : net < 0 ? 'Reintegro al Trabajador (Código 520002)' : 'Sin impacto en haberes'}</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="signatures">
          <div class="signature-box">
            <strong>${companyName}</strong><br>
            Firma y Sello del Agente de Retención (Empleador)
          </div>
          <div class="signature-box">
            <strong>${empFullName}</strong><br>
            Firma y Aclaración del Colaborador (CUIL: ${empCuil})
          </div>
        </div>

        <div class="legal-footer">
          Documento generado por el Sistema de Liquidación de Haberes conforme a la normativa de la Agencia de Recaudación y Control Aduanero (ARCA). Hoja A4.
        </div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  };

  // ==========================================================================
  // 2. EXPORTACIÓN A NÓMINA CON SELECCIÓN Y VALIDACIÓN ARCA (820000 / 520002)
  // ==========================================================================

  proto.openExportToPayrollModal = async function () {
    const settlement = this.incomeTaxState.currentSettlement;
    if (!settlement) {
      showToast('Debe calcular o seleccionar una liquidación de ganancias para exportar', 'warning');
      return;
    }

    // 1. Cargar períodos de sueldos abiertos
    const periodSelect = document.getElementById('it-export-period-select');
    if (periodSelect) {
      periodSelect.innerHTML = '<option value="">Cargando períodos...</option>';
      try {
        const pRes = await apiRequest('/payroll/periods');
        const periods = (pRes.data || []).filter((p) => p.status !== 'CLOSED');
        if (periods.length === 0) {
          periodSelect.innerHTML = '<option value="">No hay períodos de sueldos abiertos</option>';
        } else {
          periodSelect.innerHTML = periods
            .map(
              (p) => `
              <option value="${p.id}" ${p.month === settlement.month && p.year === settlement.fiscalYear ? 'selected' : ''}>
                ${p.settlementName || `Período ${p.month}/${p.year} (${p.periodType})`} - Estado: ${p.status}
              </option>
            `
            )
            .join('');
        }
      } catch (e) {
        periodSelect.innerHTML = '<option value="">Error al cargar períodos</option>';
      }
    }

    // 2. Cargar conceptos disponibles para retención y reintegro
    const withholdingSelect = document.getElementById('it-export-withholding-concept');
    const refundSelect = document.getElementById('it-export-refund-concept');

    try {
      const cRes = await apiRequest('/payroll/concepts?limit=500');
      const concepts = cRes.data || [];

      if (withholdingSelect) {
        withholdingSelect.innerHTML = concepts
          .map((c) => {
            const isArcaMatch = c.arcaConceptCode === '820000';
            const isDefault = c.code === 'SU8200' || isArcaMatch;
            return `
              <option value="${c.id}" data-arca="${c.arcaConceptCode || ''}" ${isDefault ? 'selected' : ''}>
                ${c.code} - ${c.name} [ARCA: ${c.arcaConceptCode || 'S/D'}] ${isArcaMatch ? '✅ (Válido ARCA)' : '⚠️ (No oficial)'}
              </option>
            `;
          })
          .join('');
      }

      if (refundSelect) {
        refundSelect.innerHTML = concepts
          .map((c) => {
            const isArcaMatch = c.arcaConceptCode === '520002';
            const isDefault = c.code === 'SU5200' || isArcaMatch;
            return `
              <option value="${c.id}" data-arca="${c.arcaConceptCode || ''}" ${isDefault ? 'selected' : ''}>
                ${c.code} - ${c.name} [ARCA: ${c.arcaConceptCode || 'S/D'}] ${isArcaMatch ? '✅ (Válido ARCA)' : '⚠️ (No oficial)'}
              </option>
            `;
          })
          .join('');
      }
    } catch (e) {
      console.warn('Error al cargar conceptos para exportación:', e.message);
    }

    // 3. Validar visualmente los conceptos preseleccionados
    this.validateExportConceptsUi();

    // 4. Actualizar contadores del modal
    const countWithheld = settlement.details.filter((d) => Number(d.netMonthlyWithholding) > 0).length;
    const countRefund = settlement.details.filter((d) => Number(d.netMonthlyWithholding) < 0).length;
    const elSummary = document.getElementById('it-export-modal-summary');
    if (elSummary) {
      elSummary.innerHTML = `
        <div class="d-flex align-items-center justify-content-between p-2 rounded bg-light border">
          <div><i class="ti ti-arrow-down-right text-danger me-1"></i> Retenciones a generar: <strong>${countWithheld}</strong> ($${formatCurrency(settlement.totalWithheldAmount)})</div>
          <div><i class="ti ti-arrow-up-right text-teal me-1"></i> Reintegros a generar: <strong>${countRefund}</strong> ($${formatCurrency(settlement.totalRefundAmount)})</div>
        </div>
      `;
    }

    const modalEl = document.getElementById('modal-income-tax-export-payroll');
    if (modalEl && window.bootstrap) {
      const modal = new window.bootstrap.Modal(modalEl);
      modal.show();
    }
  };

  proto.validateExportConceptsUi = function () {
    const selWithholding = document.getElementById('it-export-withholding-concept');
    const badgeWithholding = document.getElementById('it-export-withholding-arca-status');
    if (selWithholding && badgeWithholding) {
      const opt = selWithholding.options[selWithholding.selectedIndex];
      const arcaCode = opt ? opt.getAttribute('data-arca') : '';
      if (arcaCode === '820000') {
        badgeWithholding.className = 'badge bg-success-lt';
        badgeWithholding.innerHTML = '<i class="ti ti-check me-1"></i> Código ARCA 820000 Válido';
      } else {
        badgeWithholding.className = 'badge bg-danger-lt';
        badgeWithholding.innerHTML = `<i class="ti ti-alert-triangle me-1"></i> Código ARCA "${arcaCode || 'S/D'}" (Inválido: debe ser 820000)`;
      }
    }

    const selRefund = document.getElementById('it-export-refund-concept');
    const badgeRefund = document.getElementById('it-export-refund-arca-status');
    if (selRefund && badgeRefund) {
      const opt = selRefund.options[selRefund.selectedIndex];
      const arcaCode = opt ? opt.getAttribute('data-arca') : '';
      if (arcaCode === '520002') {
        badgeRefund.className = 'badge bg-success-lt';
        badgeRefund.innerHTML = '<i class="ti ti-check me-1"></i> Código ARCA 520002 Válido';
      } else {
        badgeRefund.className = 'badge bg-danger-lt';
        badgeRefund.innerHTML = `<i class="ti ti-alert-triangle me-1"></i> Código ARCA "${arcaCode || 'S/D'}" (Inválido: debe ser 520002)`;
      }
    }
  };

  proto.confirmExportToPayroll = async function () {
    const settlement = this.incomeTaxState.currentSettlement;
    if (!settlement) return;

    const periodId = document.getElementById('it-export-period-select')?.value;
    const withholdingId = document.getElementById('it-export-withholding-concept')?.value;
    const refundId = document.getElementById('it-export-refund-concept')?.value;

    if (!periodId) {
      showToast('Debe seleccionar un período de nómina destino', 'warning');
      return;
    }

    try {
      const res = await apiRequest(`/income-tax/settlements/${settlement.id}/export-to-payroll`, {
        method: 'POST',
        body: JSON.stringify({
          payrollPeriodId: periodId,
          withholdingConceptId: withholdingId,
          refundConceptId: refundId,
        }),
      });

      showToast(res.message || 'Saldos exportados a la nómina con éxito', 'success');

      // Cerrar modal
      const modalEl = document.getElementById('modal-income-tax-export-payroll');
      if (modalEl && window.bootstrap) {
        const modal = window.bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }

      // Si requiere recálculo, alertar al usuario y ofrecer redirigir
      if (res.data?.requiresRecalculation) {
        if (confirm(`${res.message}\n\n¿Desea ir a la pantalla de Liquidación ahora para recalcular el período y ver los recibos actualizados?`)) {
          const sideSettlementBtn = document.getElementById('side-payroll-settlement');
          if (sideSettlementBtn) sideSettlementBtn.click();
        }
      }

      await this.loadMonthlyIncomeTaxView();
    } catch (err) {
      console.error('Error al exportar saldos a nómina:', err);
      showToast(err.message || 'Error al exportar novedades', 'danger');
    }
  };

  // ==========================================================================
  // 3. LEGAJO FISCAL 360° POR COLABORADOR
  // ==========================================================================

  proto.loadTaxProfileView = async function () {
    const select = document.getElementById('it-profile-employee-select');
    if (!select) return;

    try {
      const res = await apiRequest('/employees?limit=500');
      const employees = res.data || [];

      select.innerHTML = '<option value="">Seleccione un colaborador...</option>' +
        employees
          .map((e) => `<option value="${e.id}">${e.lastName}, ${e.firstName} (${formatCuit(e.cuil || '')})</option>`)
          .join('');

      if (this.incomeTaxState.selectedProfileEmployeeId) {
        select.value = this.incomeTaxState.selectedProfileEmployeeId;
        await this.loadEmployeeTaxProfile(this.incomeTaxState.selectedProfileEmployeeId);
      } else if (employees.length > 0) {
        select.value = employees[0].id;
        this.incomeTaxState.selectedProfileEmployeeId = employees[0].id;
        await this.loadEmployeeTaxProfile(employees[0].id);
      }
    } catch (e) {
      console.warn('Error al cargar lista de colaboradores:', e.message);
    }
  };

  proto.loadEmployeeTaxProfile = async function (employeeId) {
    const year = this.incomeTaxState.selectedYear;
    try {
      const res = await apiRequest(`/income-tax/employees/${employeeId}/tax-profile?year=${year}`);
      const profile = res.data;
      this.incomeTaxState.currentProfile = profile;

      // Habilitar botón de Ver Detalle
      const btnDetail = document.getElementById('btn-it-profile-open-detail');
      if (btnDetail) btnDetail.disabled = false;

      this.renderEmployeeTaxProfileCard(profile);
    } catch (err) {
      console.error('Error al cargar legajo fiscal:', err);
      showToast(err.message || 'Error al cargar legajo fiscal', 'danger');
    }
  };

  proto.renderEmployeeTaxProfileCard = function (profile) {
    const emp = profile.employee || {};
    const summary = profile.summary || {};
    const families = profile.familyDeductions || [];
    const deductions = profile.generalDeductions || [];
    const otherIncomes = profile.otherIncomes || [];
    const payments = profile.paymentsOnAccount || [];

    // 1. Actualizar encabezado superior que se encuentra al lado del combo de selección
    const elName = document.getElementById('it-profile-emp-name');
    const elMeta = document.getElementById('it-profile-emp-meta');
    const elYear = document.getElementById('it-profile-fiscal-year-badge');

    if (elName) {
      const fullName = emp.fullName || `${emp.lastName || ''}, ${emp.firstName || ''}`;
      elName.textContent = fullName;
      elName.title = fullName;
    }
    if (elMeta) {
      elMeta.textContent = `CUIL: ${formatCuit(emp.cuil || '')} | Legajo: ${emp.fileNumber || '-'} | Puesto: ${emp.jobPosition || '-'}`;
    }
    if (elYear) {
      elYear.textContent = `Período Fiscal ${profile.fiscalYear || this.incomeTaxState.selectedYear}`;
    }

    // 2. Renderizar contenido dinámico (KPIs compactos + layout 2 columnas sin scroll horizontal)
    const container = document.getElementById('it-profile-details-container');
    if (!container) return;

    container.innerHTML = `
      <!-- KPIs Compactos de Resumen Fiscal -->
      <div class="row g-2 mb-3">
        <div class="col-6 col-md-3">
          <div class="border rounded p-2 text-center bg-light-subtle">
            <small class="text-muted d-block" style="font-size: 0.72rem;">Cargas Deducibles</small>
            <strong class="fs-3 text-primary">${summary.totalFamilyChargesCount || 0}</strong>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="border rounded p-2 text-center bg-light-subtle">
            <small class="text-muted d-block" style="font-size: 0.72rem;">Deduc. Generales Declaradas</small>
            <strong class="fs-3 text-teal font-monospace text-nowrap">${formatCurrency(summary.totalGeneralDeductions)}</strong>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="border rounded p-2 text-center bg-light-subtle">
            <small class="text-muted d-block" style="font-size: 0.72rem;">Otros Ingresos Declarados</small>
            <strong class="fs-3 text-indigo font-monospace text-nowrap">${formatCurrency(summary.totalOtherGross)}</strong>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="border rounded p-2 text-center bg-light-subtle">
            <small class="text-muted d-block" style="font-size: 0.72rem;">Retenciones Sufridas en el Año</small>
            <strong class="fs-3 text-danger font-monospace text-nowrap">${formatCurrency(summary.totalWithheldTax)}</strong>
          </div>
        </div>
      </div>

      <!-- Grid de 2 Columnas para Cargas de Familia y Deducciones Generales (Ambas visibles simultáneamente) -->
      <div class="row g-3 mb-3">
        <!-- COL 1: CARGAS DE FAMILIA (ART. 30) -->
        <div class="col-12 col-xl-6">
          <div class="card shadow-xs h-100 it-profile-table-card border">
            <div class="card-header py-2 bg-light d-flex align-items-center justify-content-between">
              <h5 class="fw-bold mb-0 text-truncate" style="font-size: 0.85rem;">
                <i class="ti ti-users me-1 text-primary"></i> Cargas de Familia (Art. 30)
              </h5>
              <span class="badge bg-primary-lt">${families.length} declarada(s)</span>
            </div>
            <div class="table-responsive border-top" style="max-height: 240px; overflow-y: auto; overflow-x: hidden;">
              <table class="table table-sm table-vcenter mb-0" style="table-layout: fixed; width: 100%;">
                <thead class="table-light sticky-top" style="font-size: 0.72rem;">
                  <tr>
                    <th style="width: 36%;">Familiar y Vínculo</th>
                    <th style="width: 24%;">Deducción</th>
                    <th style="width: 22%;">Vigencia</th>
                    <th class="text-end" style="width: 18%;">Estado</th>
                  </tr>
                </thead>
                <tbody style="font-size: 0.75rem;">
                  ${
                    families.length === 0
                      ? '<tr><td colspan="4" class="text-center py-3 text-muted">No posee familiares declarados en el legajo.</td></tr>'
                      : families
                          .map(
                            (f) => `
                        <tr>
                          <td>
                            <div class="fw-bold text-dark text-truncate" title="${f.fullName}">${f.fullName}</div>
                            <div class="text-muted small">
                              ${f.kinshipName || 'Familiar'} · ${f.age} años
                              ${f.isFiscalOnly ? `<span class="badge bg-warning-lt ms-1 text-warning" style="font-size: 0.65rem;" title="Carga transitoria declarada en SiRADIG para Ganancias ${f.fiscalYear} (No empadronada en Personal)"><i class="ti ti-file-certificate me-1"></i>Solo Ganancias ${f.fiscalYear}</span>` : ''}
                            </div>
                          </td>
                          <td>
                            ${f.appliesIncomeTax ? `<span class="badge bg-azure-lt">${f.incomeTaxDeductionType || 'Asignado'} (${f.deductionPercentage}%)</span>` : '<span class="text-muted small">No aplica</span>'}
                          </td>
                          <td class="small text-muted text-truncate">
                            ${f.appliesIncomeTax ? `Mes ${f.validFromMonth || 1} a ${f.validToMonth || 12}` : '-'}
                          </td>
                          <td class="text-end">
                            ${
                              f.isTaxEligible
                                ? '<span class="badge bg-success-lt"><i class="ti ti-check me-1"></i>Deducible</span>'
                                : '<span class="badge bg-secondary-lt">No computable</span>'
                            }
                          </td>
                        </tr>
                      `
                          )
                          .join('')
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- COL 2: DEDUCCIONES GENERALES (SIRADIG) -->
        <div class="col-12 col-xl-6">
          <div class="card shadow-xs h-100 it-profile-table-card border">
            <div class="card-header py-2 bg-light d-flex align-items-center justify-content-between">
              <h5 class="fw-bold mb-0 text-truncate" style="font-size: 0.85rem;">
                <i class="ti ti-receipt me-1 text-teal"></i> Deducciones Generales (SiRADIG)
              </h5>
              <span class="badge bg-teal-lt">${deductions.length} declarada(s)</span>
            </div>
            <div class="table-responsive border-top" style="max-height: 240px; overflow-y: auto; overflow-x: hidden;">
              <table class="table table-sm table-vcenter mb-0" style="table-layout: fixed; width: 100%;">
                <thead class="table-light sticky-top" style="font-size: 0.72rem;">
                  <tr>
                    <th style="width: 44%;">Tipo y Proveedor</th>
                    <th style="width: 18%;">Período</th>
                    <th class="text-end" style="width: 24%;">Monto</th>
                    <th class="text-end" style="width: 14%;">Origen</th>
                  </tr>
                </thead>
                <tbody style="font-size: 0.75rem;">
                  ${
                    deductions.length === 0
                      ? '<tr><td colspan="4" class="text-center py-3 text-muted">No posee deducciones generales registradas.</td></tr>'
                      : deductions
                          .map(
                            (d) => `
                        <tr>
                          <td>
                            <div class="fw-bold text-dark text-truncate" title="${formatDeductionType(d.deductionType)}">${formatDeductionType(d.deductionType)}</div>
                            <div class="text-muted small text-truncate" title="${d.providerName || '-'} · ${d.providerCuit ? formatCuit(d.providerCuit) : ''}">
                              ${d.providerName || 'S/D'} ${d.providerCuit ? `(${formatCuit(d.providerCuit)})` : ''}
                            </div>
                            ${d.notes ? `<div class="text-muted small font-italic" style="font-size: 0.68rem;" title="${escapeHtml(d.notes)}">${escapeHtml(d.notes)}</div>` : ''}
                          </td>
                          <td class="small text-muted">${d.month ? `Mes ${d.month}` : 'Anual'}</td>
                          <td class="text-end font-monospace fw-bold text-dark text-nowrap">${formatCurrency(d.amount)}</td>
                          <td class="text-end"><span class="badge ${d.source === 'SIRADIG' ? 'bg-primary-lt' : 'bg-secondary-lt'}">${d.source}</span></td>
                        </tr>
                      `
                          )
                          .join('')
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- FILA COMPLETA INFERIOR: PLURIEMPLEO -->
        <div class="col-12">
          <div class="card shadow-xs it-profile-table-card border">
            <div class="card-header py-2 bg-light d-flex align-items-center justify-content-between">
              <h5 class="fw-bold mb-0 text-truncate" style="font-size: 0.85rem;">
                <i class="ti ti-building me-1 text-indigo"></i> Pluriempleo (Otros Empleadores Declarados)
              </h5>
              <span class="badge bg-indigo-lt">${otherIncomes.length} declarado(s)</span>
            </div>
            <div class="table-responsive border-top" style="max-height: 200px; overflow-y: auto; overflow-x: hidden;">
              <table class="table table-sm table-vcenter mb-0" style="table-layout: fixed; width: 100%;">
                <thead class="table-light sticky-top" style="font-size: 0.72rem;">
                  <tr>
                    <th style="width: 35%;">Razón Social Empleador</th>
                    <th style="width: 18%;">CUIT Empleador</th>
                    <th style="width: 11%;">Mes</th>
                    <th class="text-end" style="width: 12%;">Haber Bruto</th>
                    <th class="text-end" style="width: 12%;">Aportes Ley</th>
                    <th class="text-end" style="width: 12%;">Retención</th>
                  </tr>
                </thead>
                <tbody style="font-size: 0.75rem;">
                  ${
                    otherIncomes.length === 0
                      ? '<tr><td colspan="6" class="text-center py-3 text-muted">No posee pluriempleo declarado en este período.</td></tr>'
                      : otherIncomes
                          .map(
                            (oi) => `
                        <tr>
                          <td class="fw-bold text-dark text-truncate" title="${oi.employerName}">${oi.employerName}</td>
                          <td class="font-monospace small">${formatCuit(oi.employerCuit)}</td>
                          <td>Mes ${oi.month}</td>
                          <td class="text-end font-monospace text-nowrap">${formatCurrency(oi.grossIncome)}</td>
                          <td class="text-end font-monospace text-muted text-nowrap">${formatCurrency(Number(oi.pensionContrib || 0) + Number(oi.healthInsuranceContrib || 0))}</td>
                          <td class="text-end font-monospace text-danger text-nowrap">${formatCurrency(oi.withheldTax)}</td>
                        </tr>
                      `
                          )
                          .join('')
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        ${
          payments.length > 0
            ? `
        <!-- PAGOS A CUENTA / PERCEPCIONES -->
        <div class="col-12">
          <div class="card shadow-xs it-profile-table-card border">
            <div class="card-header py-2 bg-light d-flex align-items-center justify-content-between">
              <h5 class="fw-bold mb-0 text-truncate" style="font-size: 0.85rem;">
                <i class="ti ti-receipt-2 me-1 text-warning"></i> Pagos a Cuenta y Percepciones (RG 4815 / Otras)
              </h5>
              <span class="badge bg-warning-lt">${payments.length} registro(s)</span>
            </div>
            <div class="table-responsive border-top" style="max-height: 180px; overflow-y: auto; overflow-x: hidden;">
              <table class="table table-sm table-vcenter mb-0" style="table-layout: fixed; width: 100%;">
                <thead class="table-light sticky-top" style="font-size: 0.72rem;">
                  <tr>
                    <th style="width: 40%;">Régimen / Percepción</th>
                    <th style="width: 25%;">Entidad / CUIT</th>
                    <th style="width: 15%;">Mes</th>
                    <th class="text-end" style="width: 20%;">Monto</th>
                  </tr>
                </thead>
                <tbody style="font-size: 0.75rem;">
                  ${payments
                    .map(
                      (p) => `
                    <tr>
                      <td class="fw-bold text-dark text-truncate" title="${p.paymentType}">${p.paymentType}</td>
                      <td class="small text-muted">${p.agencyName || '-'}</td>
                      <td>Mes ${p.month || '-'}</td>
                      <td class="text-end font-monospace fw-bold text-warning text-nowrap">${formatCurrency(p.amount)}</td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        `
            : ''
        }
      </div>
    `;
  };

  /**
   * Muestra el formulario modal estructurado con todo el detalle de conceptos del Legajo Fiscal 360°.
   */
  proto.showEmployeeTaxProfileDetailModal = function () {
    const profile = this.incomeTaxState.currentProfile;
    if (!profile) {
      showToast('Debe seleccionar un colaborador primero para ver su detalle', 'warning');
      return;
    }

    const emp = profile.employee || {};
    const summary = profile.summary || {};
    const families = profile.familyDeductions || [];
    const deductions = profile.generalDeductions || [];
    const otherIncomes = profile.otherIncomes || [];
    const payments = profile.paymentsOnAccount || [];

    const fullName = emp.fullName || `${emp.lastName || ''}, ${emp.firstName || ''}`;
    const cuil = formatCuit(emp.cuil || '');
    const fileNo = emp.fileNumber || '-';

    const titleEl = document.getElementById('it-modal-profile-title');
    const subEl = document.getElementById('it-modal-profile-subtitle');
    const bodyEl = document.getElementById('it-modal-profile-body');

    if (titleEl) titleEl.textContent = `Legajo Fiscal 360°: ${fullName}`;
    if (subEl) subEl.textContent = `CUIL: ${cuil} | Legajo: ${fileNo} | Período Fiscal: ${profile.fiscalYear || this.incomeTaxState.selectedYear}`;

    if (bodyEl) {
      bodyEl.innerHTML = `
        <!-- Resumen de Identificación y Totales -->
        <div class="card bg-light-subtle border mb-3">
          <div class="card-body p-3">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
              <div class="d-flex align-items-center gap-2">
                <span class="avatar avatar-md bg-teal text-white rounded-circle"><i class="ti ti-user-check fs-2"></i></span>
                <div>
                  <h4 class="mb-0 fw-bold text-dark">${fullName}</h4>
                  <div class="text-muted small">CUIL: <strong>${cuil}</strong> · Legajo: <strong>${fileNo}</strong> · Puesto: <strong>${emp.jobPosition || '-'}</strong></div>
                </div>
              </div>
              <span class="badge bg-teal-lt fs-4 px-3 py-1">Período Fiscal ${profile.fiscalYear || this.incomeTaxState.selectedYear}</span>
            </div>

            <div class="row g-2">
              <div class="col-6 col-md-3">
                <div class="bg-white border rounded p-2 text-center shadow-2xs">
                  <small class="text-muted d-block" style="font-size: 0.72rem;">Cargas de Familia</small>
                  <strong class="fs-3 text-primary">${summary.totalFamilyChargesCount || families.length}</strong>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="bg-white border rounded p-2 text-center shadow-2xs">
                  <small class="text-muted d-block" style="font-size: 0.72rem;">Deduc. Generales Declaradas</small>
                  <strong class="fs-3 text-teal font-monospace">${formatCurrency(summary.totalGeneralDeductions)}</strong>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="bg-white border rounded p-2 text-center shadow-2xs">
                  <small class="text-muted d-block" style="font-size: 0.72rem;">Otros Empleos (Bruto)</small>
                  <strong class="fs-3 text-indigo font-monospace">${formatCurrency(summary.totalOtherGross)}</strong>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="bg-white border rounded p-2 text-center shadow-2xs">
                  <small class="text-muted d-block" style="font-size: 0.72rem;">Retenciones Sufridas</small>
                  <strong class="fs-3 text-danger font-monospace">${formatCurrency(summary.totalWithheldTax)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- SECCIÓN 1: CARGAS DE FAMILIA -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-light d-flex align-items-center justify-content-between">
            <h5 class="fw-bold mb-0 text-primary">
              <i class="ti ti-users me-1"></i> 1. Cargas de Familia Declaradas (Art. 30 Inciso b - Ley 27.743)
            </h5>
            <span class="badge bg-primary-lt">${families.length} familiar(es)</span>
          </div>
          <div class="table-responsive">
            <table class="table table-sm table-striped table-hover mb-0">
              <thead class="table-light">
                <tr style="font-size: 0.75rem;">
                  <th>Familiar / Parentesco</th>
                  <th>DNI / CUIL</th>
                  <th>Edad / Condición</th>
                  <th>% Cómputo</th>
                  <th>Vigencia en el Año</th>
                  <th class="text-end">Estado en Liquidación</th>
                </tr>
              </thead>
              <tbody style="font-size: 0.80rem;">
                ${
                  families.length === 0
                    ? '<tr><td colspan="6" class="text-center py-3 text-muted">No posee familiares declarados en el legajo para deducción de ganancias.</td></tr>'
                    : families.map((f) => `
                      <tr>
                        <td>
                          <strong>${escapeHtml(f.fullName)}</strong>
                          <div class="text-muted small">${escapeHtml(f.kinshipName || 'Familiar')}${f.isFiscalOnly ? ` · <span class="badge bg-warning-lt text-warning">Solo Ganancias ${f.fiscalYear}</span>` : ''}</div>
                        </td>
                        <td class="font-monospace">${formatCuit(f.cuil || f.documentNumber || '')}</td>
                        <td>${f.age ? `${f.age} años` : '-'} ${f.isHandicapped ? '<span class="badge bg-warning-lt ms-1">Incapacitado</span>' : ''}</td>
                        <td><span class="badge bg-azure-lt font-monospace">${f.deductionPercentage || 100}%</span></td>
                        <td>Mes ${f.validFromMonth || 1} a ${f.validToMonth || 12}</td>
                        <td class="text-end">
                          ${f.isTaxEligible
                            ? '<span class="badge bg-success-lt"><i class="ti ti-check me-1"></i>Deducible computable</span>'
                            : '<span class="badge bg-secondary-lt">No computable</span>'}
                        </td>
                      </tr>
                    `).join('')
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- SECCIÓN 2: DEDUCCIONES GENERALES SIRADIG -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-light d-flex align-items-center justify-content-between">
            <h5 class="fw-bold mb-0 text-teal">
              <i class="ti ti-receipt me-1"></i> 2. Deducciones Generales Declaradas (SiRADIG F. 572 Web)
            </h5>
            <span class="badge bg-teal-lt">${deductions.length} concepto(s)</span>
          </div>
          <div class="table-responsive">
            <table class="table table-sm table-striped table-hover mb-0">
              <thead class="table-light">
                <tr style="font-size: 0.75rem;">
                  <th>Concepto / Rubro</th>
                  <th>Entidad / Proveedor</th>
                  <th>CUIT Entidad</th>
                  <th>Período</th>
                  <th class="text-end">Monto Declarado</th>
                  <th class="text-end">Origen</th>
                </tr>
              </thead>
              <tbody style="font-size: 0.80rem;">
                ${
                  deductions.length === 0
                    ? '<tr><td colspan="6" class="text-center py-3 text-muted">No posee deducciones generales registradas para el período fiscal.</td></tr>'
                    : deductions.map((d) => `
                      <tr>
                        <td>
                          <strong>${escapeHtml(formatDeductionType(d.deductionType))}</strong>
                          ${d.notes ? `<div class="text-muted small" style="font-size: 0.72rem;">${escapeHtml(d.notes)}</div>` : ''}
                        </td>
                        <td>${escapeHtml(d.providerName || 'S/D')}</td>
                        <td class="font-monospace">${d.providerCuit ? formatCuit(d.providerCuit) : '-'}</td>
                        <td>${d.month ? `Mes ${d.month}` : 'Anual'}</td>
                        <td class="text-end font-monospace fw-bold text-teal">${formatCurrency(d.amount)}</td>
                        <td class="text-end"><span class="badge ${d.source === 'SIRADIG' ? 'bg-primary-lt' : 'bg-secondary-lt'}">${d.source || 'MANUAL'}</span></td>
                      </tr>
                    `).join('')
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- SECCIÓN 3: PLURIEMPLEO -->
        <div class="card border mb-3">
          <div class="card-header py-2 bg-light d-flex align-items-center justify-content-between">
            <h5 class="fw-bold mb-0 text-indigo">
              <i class="ti ti-building me-1"></i> 3. Pluriempleo (Otros Empleadores Informados en SiRADIG)
            </h5>
            <span class="badge bg-indigo-lt">${otherIncomes.length} registro(s)</span>
          </div>
          <div class="table-responsive">
            <table class="table table-sm table-striped table-hover mb-0">
              <thead class="table-light">
                <tr style="font-size: 0.75rem;">
                  <th>Empleador</th>
                  <th>CUIT Empleador</th>
                  <th>Mes Devengado</th>
                  <th class="text-end">Haber Bruto</th>
                  <th class="text-end">Aportes Seg. Social (17%)</th>
                  <th class="text-end">Retenciones Sufridas</th>
                </tr>
              </thead>
              <tbody style="font-size: 0.80rem;">
                ${
                  otherIncomes.length === 0
                    ? '<tr><td colspan="6" class="text-center py-3 text-muted">No posee pluriempleo declarado en el período fiscal.</td></tr>'
                    : otherIncomes.map((oi) => `
                      <tr>
                        <td><strong>${escapeHtml(oi.employerName || '-')}</strong></td>
                        <td class="font-monospace">${formatCuit(oi.employerCuit)}</td>
                        <td>Mes ${oi.month || '-'}</td>
                        <td class="text-end font-monospace fw-bold">${formatCurrency(oi.grossIncome)}</td>
                        <td class="text-end font-monospace text-muted">${formatCurrency(Number(oi.pensionContrib || 0) + Number(oi.healthInsuranceContrib || 0))}</td>
                        <td class="text-end font-monospace text-danger">${formatCurrency(oi.withheldTax)}</td>
                      </tr>
                    `).join('')
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- SECCIÓN 4: PAGOS A CUENTA / PERCEPCIONES -->
        ${
          payments.length > 0
            ? `
        <div class="card border mb-3">
          <div class="card-header py-2 bg-light d-flex align-items-center justify-content-between">
            <h5 class="fw-bold mb-0 text-warning">
              <i class="ti ti-receipt-2 me-1"></i> 4. Pagos a Cuenta y Percepciones (RG 4815 / Otras)
            </h5>
            <span class="badge bg-warning-lt">${payments.length} percepción(es)</span>
          </div>
          <div class="table-responsive">
            <table class="table table-sm table-striped table-hover mb-0">
              <thead class="table-light">
                <tr style="font-size: 0.75rem;">
                  <th>Régimen / Percepción</th>
                  <th>Agente / Entidad</th>
                  <th>Mes Informado</th>
                  <th class="text-end">Importe Computable</th>
                </tr>
              </thead>
              <tbody style="font-size: 0.80rem;">
                ${payments.map((p) => `
                  <tr>
                    <td><strong>${escapeHtml(p.paymentType || '-')}</strong></td>
                    <td>${escapeHtml(p.agencyName || '-')}</td>
                    <td>Mes ${p.month || '-'}</td>
                    <td class="text-end font-monospace fw-bold text-warning">${formatCurrency(p.amount)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        `
            : ''
        }
      `;
    }

    const modalEl = document.getElementById('modal-income-tax-profile-detail');
    if (modalEl && window.bootstrap) {
      const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  };

  /**
   * Genera el informe del Legajo Fiscal 360° en formato imprimible A4.
   */
  proto.printEmployeeTaxProfilePdf = function () {
    const profile = this.incomeTaxState.currentProfile;
    if (!profile) {
      showToast('No hay perfil impositivo seleccionado para imprimir', 'warning');
      return;
    }

    const emp = profile.employee || {};
    const families = profile.familyDeductions || [];
    const deductions = profile.generalDeductions || [];
    const otherIncomes = profile.otherIncomes || [];
    const payments = profile.paymentsOnAccount || [];

    const company = this.activeCompany || (window.app && window.app.activeCompany) || {};
    const companyName = escapeHtml(company.name || company.businessName || 'Empresa');
    const companyCuit = formatCuit(company.cuit || company.taxId || '');
    const companyAddress = escapeHtml(company.address || company.domicilio || '-');

    const empFullName = escapeHtml(emp.fullName || `${emp.lastName || ''}, ${emp.firstName || ''}`);
    const empCuil = formatCuit(emp.cuil || '');
    const empFile = escapeHtml(emp.fileNumber || '-');
    const empPosition = escapeHtml(emp.jobPosition || emp.category || '-');
    const fiscalYear = profile.fiscalYear || this.incomeTaxState.selectedYear;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('El navegador bloqueó la ventana emergente. Por favor habilite las ventanas emergentes.', 'danger');
      return;
    }

    const familiesHtml = families.length > 0
      ? families.map((f) => `
          <tr>
            <td><strong>${escapeHtml(f.fullName)}</strong> (${escapeHtml(f.kinshipName || 'Familiar')})</td>
            <td style="font-family: monospace;">${formatCuit(f.cuil || f.documentNumber || '')}</td>
            <td style="text-align: center;">${f.age || '-'}</td>
            <td style="text-align: center; font-family: monospace;">${f.deductionPercentage || 100}%</td>
            <td style="text-align: center;">Mes ${f.validFromMonth || 1} a ${f.validToMonth || 12}</td>
            <td style="text-align: right; font-weight: bold; color: ${f.isTaxEligible ? '#16a34a' : '#64748b'};">
              ${f.isTaxEligible ? 'Computable' : 'No Computable'}
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 10px;">Sin cargas de familia declaradas en el ejercicio.</td></tr>';

    const deductionsHtml = deductions.length > 0
      ? deductions.map((d) => `
          <tr>
            <td>
              <strong>${escapeHtml(formatDeductionType(d.deductionType))}</strong>
              ${d.notes ? `<br><span style="font-size: 7pt; color: #64748b;">${escapeHtml(d.notes)}</span>` : ''}
            </td>
            <td>${escapeHtml(d.providerName || 'S/D')}</td>
            <td style="font-family: monospace;">${d.providerCuit ? formatCuit(d.providerCuit) : '-'}</td>
            <td style="text-align: center;">${d.month ? `Mes ${d.month}` : 'Anual'}</td>
            <td style="text-align: right; font-family: monospace; font-weight: bold; color: #0d9488;">${formatCurrency(d.amount)}</td>
            <td style="text-align: center;">${d.source || 'SIRADIG'}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 10px;">Sin deducciones generales declaradas en el ejercicio.</td></tr>';

    const otherIncomesHtml = otherIncomes.length > 0
      ? otherIncomes.map((oi) => `
          <tr>
            <td><strong>${escapeHtml(oi.employerName || '-')}</strong></td>
            <td style="font-family: monospace;">${formatCuit(oi.employerCuit)}</td>
            <td style="text-align: center;">Mes ${oi.month || '-'}</td>
            <td style="text-align: right; font-family: monospace; font-weight: bold;">${formatCurrency(oi.grossIncome)}</td>
            <td style="text-align: right; font-family: monospace; color: #64748b;">${formatCurrency(Number(oi.pensionContrib || 0) + Number(oi.healthInsuranceContrib || 0))}</td>
            <td style="text-align: right; font-family: monospace; color: #dc2626;">${formatCurrency(oi.withheldTax)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 10px;">Sin pluriempleo declarado en el ejercicio fiscal.</td></tr>';

    const paymentsHtml = payments.length > 0
      ? payments.map((p) => `
          <tr>
            <td><strong>${escapeHtml(p.paymentType || '-')}</strong></td>
            <td>${escapeHtml(p.agencyName || '-')}</td>
            <td style="text-align: center;">Mes ${p.month || '-'}</td>
            <td style="text-align: right; font-family: monospace; font-weight: bold; color: #d97706;">${formatCurrency(p.amount)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" style="text-align: center; color: #64748b; padding: 10px;">Sin percepciones ni pagos a cuenta declarados.</td></tr>';

    const printHtml = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Legajo Fiscal 360° — ${empFullName} — Período Fiscal ${fiscalYear}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            background: #fff;
            margin: 0;
            padding: 0;
            font-size: 8.5pt;
            line-height: 1.35;
          }
          .header-box {
            border-bottom: 2px solid #0d9488;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .company-title {
            font-size: 13pt;
            font-weight: 800;
            color: #0d9488;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .doc-title {
            font-size: 11.5pt;
            font-weight: 700;
            color: #0f172a;
            margin-top: 4px;
          }
          .doc-sub {
            font-size: 8pt;
            color: #64748b;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 8px 12px;
            margin-bottom: 12px;
            font-size: 8.5pt;
          }
          .section-title {
            font-size: 9.5pt;
            font-weight: 800;
            color: #0f172a;
            margin-top: 14px;
            margin-bottom: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-left: 3px solid #0d9488;
            padding-left: 6px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8pt;
            margin-bottom: 10px;
          }
          th {
            background-color: #f1f5f9;
            color: #334155;
            padding: 5px 6px;
            text-align: left;
            font-size: 7.5pt;
            font-weight: 700;
            text-transform: uppercase;
            border: 1px solid #cbd5e1;
          }
          td {
            padding: 4.5px 6px;
            border: 1px solid #e2e8f0;
            vertical-align: middle;
          }
          tr:nth-child(even) td {
            background-color: #f8fafc;
          }
          .signatures {
            margin-top: 30px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            page-break-inside: avoid;
          }
          .signature-box {
            border-top: 1px solid #94a3b8;
            padding-top: 6px;
            text-align: center;
            font-size: 8pt;
            color: #475569;
          }
          .declaration-text {
            font-size: 7.5pt;
            color: #475569;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 8px;
            margin-top: 15px;
            text-align: justify;
            page-break-inside: avoid;
          }
          .legal-footer {
            margin-top: 12px;
            font-size: 7pt;
            color: #94a3b8;
            text-align: center;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div class="company-title">${companyName}</div>
              <div class="doc-sub">CUIT: ${companyCuit || '-'} · Domicilio: ${companyAddress}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: bold; color: #0d9488; font-size: 9pt;">AGENTE DE RETENCIÓN ARCA</div>
              <div class="doc-sub">Fecha Emisión: ${new Date().toLocaleDateString('es-AR')}</div>
            </div>
          </div>
          <div class="doc-title">LEGAJO FISCAL DEL TRABAJADOR — IMPUESTO A LAS GANANCIAS (4ta CATEGORÍA)</div>
          <div class="doc-sub">Constancia Oficial de Cargas de Familia, Deducciones Generales y Pluriempleo — Ejercicio Fiscal ${fiscalYear}</div>
        </div>

        <div class="info-grid">
          <div><strong>Colaborador:</strong> ${empFullName}</div>
          <div><strong>Ejercicio Fiscal:</strong> Período ${fiscalYear}</div>
          <div><strong>CUIL:</strong> <span style="font-family: monospace;">${empCuil}</span> · <strong>Legajo:</strong> ${empFile}</div>
          <div><strong>Puesto / Cargo:</strong> ${empPosition}</div>
        </div>

        <div class="section-title">
          <span>1. CARGAS DE FAMILIA DECLARADAS (ART. 30 INC. B - LEY 27.743)</span>
          <span style="font-size: 7.5pt; font-weight: normal; color: #64748b;">${families.length} registro(s)</span>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 32%;">Familiar / Parentesco</th>
              <th style="width: 20%;">DNI / CUIL</th>
              <th style="width: 10%; text-align: center;">Edad</th>
              <th style="width: 12%; text-align: center;">% Cómputo</th>
              <th style="width: 14%; text-align: center;">Vigencia</th>
              <th style="width: 12%; text-align: right;">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${familiesHtml}
          </tbody>
        </table>

        <div class="section-title">
          <span>2. DEDUCCIONES GENERALES COMPUTABLES (SIRADIG F. 572 WEB)</span>
          <span style="font-size: 7.5pt; font-weight: normal; color: #64748b;">${deductions.length} registro(s)</span>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 30%;">Tipo de Deducción</th>
              <th style="width: 25%;">Entidad / Proveedor</th>
              <th style="width: 18%;">CUIT Entidad</th>
              <th style="width: 10%; text-align: center;">Período</th>
              <th style="width: 17%; text-align: right;">Monto Declarado</th>
              <th style="width: 10%; text-align: center;">Origen</th>
            </tr>
          </thead>
          <tbody>
            ${deductionsHtml}
          </tbody>
        </table>

        <div class="section-title">
          <span>3. OTROS EMPLEADORES (PLURIEMPLEO INFORMADO EN F. 572 WEB)</span>
          <span style="font-size: 7.5pt; font-weight: normal; color: #64748b;">${otherIncomes.length} registro(s)</span>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 32%;">Razón Social Empleador</th>
              <th style="width: 18%;">CUIT</th>
              <th style="width: 10%; text-align: center;">Mes</th>
              <th style="width: 14%; text-align: right;">Haber Bruto</th>
              <th style="width: 13%; text-align: right;">Aportes Ley</th>
              <th style="width: 13%; text-align: right;">Retención</th>
            </tr>
          </thead>
          <tbody>
            ${otherIncomesHtml}
          </tbody>
        </table>

        ${
          payments.length > 0
            ? `
        <div class="section-title">
          <span>4. PAGOS A CUENTA Y PERCEPCIONES (RG 4815 / OTRAS)</span>
          <span style="font-size: 7.5pt; font-weight: normal; color: #64748b;">${payments.length} registro(s)</span>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 40%;">Régimen / Percepción</th>
              <th style="width: 30%;">Agente de Percepción</th>
              <th style="width: 12%; text-align: center;">Mes</th>
              <th style="width: 18%; text-align: right;">Importe</th>
            </tr>
          </thead>
          <tbody>
            ${paymentsHtml}
          </tbody>
        </table>
        `
            : ''
        }

        <div class="declaration-text">
          <strong>Declaración de Responsabilidad y Veracidad:</strong> El trabajador declara bajo juramento que los datos consignados en el presente legajo y en el Formulario 572 Web (SiRADIG Trabajador) ante la Agencia de Recaudación y Control Aduanero (ARCA) son correctos y completos, sin omitir ni falsear dato alguno que deba contener, de conformidad con lo previsto por la RG (AFIP) 4003/2017 y modificatorias. El empleador actúa en carácter de Agente de Retención según la normativa vigente.
        </div>

        <div class="signatures">
          <div class="signature-box">
            <strong>${companyName}</strong><br>
            Firma y Sello del Agente de Retención
          </div>
          <div class="signature-box">
            <strong>${empFullName}</strong><br>
            Firma y Aclaración del Colaborador (CUIL: ${empCuil})
          </div>
        </div>

        <div class="legal-footer">
          Formulario Legajo Fiscal 360° — Hoja A4 Imprimible — Sistema de Liquidación de Haberes
        </div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  };

  proto.processSiradigXml = async function () {
    const fileInput = document.getElementById('siradig-file-input');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      showToast('Por favor seleccione un archivo XML de SiRADIG', 'warning');
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      const xmlContent = e.target.result;
      try {
        showToast('Validando archivo SiRADIG F. 572...', 'info');

        // Paso 1: Pre-análisis para verificar familiares no empadronados
        const previewRes = await apiRequest('/income-tax/siradig/preview', {
          method: 'POST',
          body: JSON.stringify({
            filename: file.name,
            xmlContent,
          }),
        });

        const previewData = previewRes.data || {};
        const unregistered = previewData.unregisteredRelatives || [];

        if (unregistered.length > 0) {
          // Guardar estado temporal para ejecutar tras la confirmación del usuario
          this.pendingSiradigImport = {
            filename: file.name,
            xmlContent,
          };

          // Renderizar tabla en el modal
          const tbody = document.getElementById('siradig-unregistered-relatives-tbody');
          if (tbody) {
            tbody.innerHTML = unregistered
              .map(
                (item) => `
                <tr>
                  <td>
                    <strong>${escapeHtml(item.employeeName)}</strong>
                    <div class="small text-muted font-monospace">${item.employeeCuil ? formatCuit(item.employeeCuil) : '-'}</div>
                  </td>
                  <td class="fw-bold">${escapeHtml(item.relative.fullName)}</td>
                  <td class="font-monospace">${item.relative.documentNumber || '-'}</td>
                  <td><span class="badge bg-indigo-lt">${escapeHtml(item.relative.deductionType || 'Carga')}</span></td>
                  <td class="text-center fw-bold text-primary font-monospace">${item.relative.deductionPercentage}%</td>
                  <td class="text-center small text-muted">Meses ${item.relative.fromMonth} a ${item.relative.toMonth}</td>
                </tr>
              `
              )
              .join('');
          }

          // Mostrar modal interactivo
          const modalEl = document.getElementById('modal-siradig-unregistered-relatives');
          if (modalEl && window.bootstrap) {
            const modal = new window.bootstrap.Modal(modalEl);
            modal.show();
          }
          return;
        }

        // Si no hay parientes no empadronados, procesar directamente
        await this.executeSiradigImport({
          filename: file.name,
          xmlContent,
          incorporateToPersonnel: false,
        });
      } catch (err) {
        console.error('Error al procesar SiRADIG:', err);
        showToast(err.message || 'Error al procesar archivo SiRADIG', 'danger');
      }
    };

    reader.readAsText(file);
  };

  proto.executeSiradigImport = async function ({ filename, xmlContent, incorporateToPersonnel = false }) {
    try {
      showToast('Importando presentaciones SiRADIG F. 572...', 'info');
      const res = await apiRequest('/income-tax/siradig/import', {
        method: 'POST',
        body: JSON.stringify({
          filename,
          xmlContent,
          incorporateToPersonnel,
        }),
      });

      showToast(res.message || 'SiRADIG importado exitosamente', 'success');

      const fileInput = document.getElementById('siradig-file-input');
      if (fileInput) fileInput.value = '';

      // Mostrar caja de resultados
      const resultBox = document.getElementById('siradig-result-box');
      if (resultBox) {
        resultBox.classList.remove('d-none');
        resultBox.innerHTML = `
          <div class="alert alert-success d-flex align-items-center justify-content-between mb-3">
            <div>
              <h4 class="alert-heading mb-1"><i class="ti ti-check me-1"></i> ${res.message}</h4>
              <div class="small">
                Presentaciones: <strong>${res.data.totalPresentations}</strong> | 
                Colaboradores impactados: <strong>${res.data.processedEmployees}</strong> | 
                Deducciones generales: <strong>${res.data.deductionsCount}</strong> | 
                Cargas de familia: <strong>${res.data.familyChargesCount || 0}</strong> ${
                  incorporateToPersonnel
                    ? `(<strong>${res.data.incorporatedRelativesCount || 0}</strong> incorporadas a Personal)`
                    : `(<strong>${res.data.fiscalOnlyRelativesCount || 0}</strong> computadas solo en Ganancias)`
                } | 
                Otros empleadores: <strong>${res.data.otherIncomesCount}</strong>
              </div>
              ${
                res.data.notFoundCuils && res.data.notFoundCuils.length > 0
                  ? `<div class="mt-2 text-danger small">CUILs no encontrados en el sistema: ${res.data.notFoundCuils.join(', ')}</div>`
                  : ''
              }
            </div>
          </div>
        `;
      }

      await this.loadSiradigHistory();
      if (this.incomeTaxState.selectedProfileEmployeeId) {
        await this.loadEmployeeTaxProfile(this.incomeTaxState.selectedProfileEmployeeId);
      }
    } catch (err) {
      console.error('Error al importar SiRADIG:', err);
      showToast(err.message || 'Error al procesar archivo SiRADIG', 'danger');
    }
  };

  proto.loadSiradigHistory = async function () {
    const year = this.incomeTaxState.selectedYear;
    const tbody = document.getElementById('siradig-history-table-body');
    if (!tbody) return;

    try {
      const res = await apiRequest(`/income-tax/siradig/imports?year=${year}`);
      const imports = res.data || [];

      if (imports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-muted">No hay importaciones registradas para este año fiscal.</td></tr>';
        return;
      }

      tbody.innerHTML = imports
        .map(
          (imp) => `
          <tr>
            <td class="fw-bold">${escapeHtml(imp.filename)}</td>
            <td>Período ${imp.fiscalYear}</td>
            <td>${new Date(imp.createdAt).toLocaleString('es-AR')}</td>
            <td><span class="badge bg-primary-lt">${imp.processedEmployees} colaboradores</span></td>
            <td><span class="badge bg-success-lt">${imp.status}</span></td>
          </tr>
        `
        )
        .join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-muted">Error al cargar historial.</td></tr>';
    }
  };

  // ==========================================================================
  // 5. TABLAS IMPOSITIVAS OFICIALES (ART. 30, ART. 94 Y LÍMITES)
  // ==========================================================================

  proto.loadArt94Scale = async function (monthOverride) {
    const year = this.incomeTaxState.selectedYear;
    const selectEl = document.getElementById('it-tables-art94-month-select');
    const month = monthOverride || (selectEl ? parseInt(selectEl.value || '12', 10) : 12);
    const tbody94 = document.getElementById('it-tables-art94-tbody');
    if (!tbody94) return;

    try {
      tbody94.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-muted"><span class="spinner-border spinner-border-sm me-1"></span> Cargando escala Art. 94 para Mes ${month}...</td></tr>`;
      const res = await apiRequest(`/income-tax/scales?year=${year}&month=${month}`);
      const scales = res.data || [];

      if (scales.length === 0) {
        tbody94.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-muted">No se encontraron escalas para el período.</td></tr>';
        return;
      }

      tbody94.innerHTML = scales
        .map((s) => {
          const toStr = s.toAmount !== null ? formatCurrency(s.toAmount) : 'En adelante';
          const formula = s.fixedAmount > 0
            ? `${formatCurrency(s.fixedAmount)} + ${s.ratePercentage}% s/ excedente`
            : `${s.ratePercentage}% s/ ganancia neta`;

          return `
            <tr>
              <td class="fw-bold text-center"><span class="badge bg-light text-dark border">#${s.step}</span></td>
              <td class="text-end font-monospace">${formatCurrency(s.fromAmount)}</td>
              <td class="text-end font-monospace">${toStr}</td>
              <td class="text-end font-monospace">${formatCurrency(s.fixedAmount)}</td>
              <td class="text-end font-monospace fw-bold text-primary">${s.ratePercentage}%</td>
              <td class="small text-muted font-monospace">${formula}</td>
            </tr>
          `;
        })
        .join('');
    } catch (e) {
      tbody94.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-muted">Error al cargar Art. 94.</td></tr>';
    }
  };

  proto.loadTaxTablesView = async function () {
    const year = this.incomeTaxState.selectedYear;

    // A. Art. 30 Deducciones Personales
    const tbody30 = document.getElementById('it-tables-art30-tbody');
    if (tbody30) {
      try {
        const res = await apiRequest(`/income-tax/tables?year=${year}`);
        const tables = res.data || [];
        this.incomeTaxState.cachedTables = tables;

        tbody30.innerHTML = tables
          .map(
            (t) => `
            <tr>
              <td class="fw-bold">Mes ${t.month}</td>
              <td class="text-end font-monospace">${formatCurrency(t.nonTaxableMinimum)}</td>
              <td class="text-end font-monospace">${formatCurrency(t.specialDeduction)}</td>
              <td class="text-end font-monospace">${formatCurrency(t.spouseDeduction)}</td>
              <td class="text-end font-monospace">${formatCurrency(t.childDeduction)}</td>
              <td class="text-end font-monospace">${formatCurrency(t.disabledChildDeduction)}</td>
            </tr>
          `
          )
          .join('');
      } catch (e) {
        tbody30.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-muted">Error al cargar Art. 30.</td></tr>';
      }
    }

    // B. Art. 94 Escala Progresiva (con selector de mes dinámico)
    await this.loadArt94Scale();

    // C. Límites de Deducciones Generales
    const tbodyLimits = document.getElementById('it-tables-limits-tbody');
    if (tbodyLimits) {
      try {
        const res = await apiRequest(`/income-tax/limits?year=${year}`);
        const limits = res.data || [];

        tbodyLimits.innerHTML = limits
          .map(
            (l) => `
            <tr>
              <td class="fw-bold">${escapeHtml(l.name)}</td>
              <td><code>${escapeHtml(l.code)}</code></td>
              <td><span class="badge bg-light text-dark border">${escapeHtml(l.limitType)}</span></td>
              <td class="text-end font-monospace fw-bold">${l.limitType.includes('PERCENTAGE') ? `${l.limitValue}%` : formatCurrency(l.limitValue)}</td>
              <td class="small text-muted">${escapeHtml(l.description || '-')}</td>
            </tr>
          `
          )
          .join('');
      } catch (e) {
        tbodyLimits.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-muted">Error al cargar límites.</td></tr>';
      }
    }
  };

  proto.applyIpcAdjustment = async function () {
    const sourceYear = parseInt(document.getElementById('it-ipc-source-year')?.value || '2024', 10);
    const targetYear = parseInt(document.getElementById('it-ipc-target-year')?.value || '2025', 10);
    const ipcPercentage = parseFloat(document.getElementById('it-ipc-percentage')?.value || '0');

    try {
      showToast(`Proyectando tablas impositivas con ajuste IPC (+${ipcPercentage}%)...`, 'info');
      const res = await apiRequest('/income-tax/clone-adjust', {
        method: 'POST',
        body: JSON.stringify({ sourceYear, targetYear, ipcPercentage }),
      });

      showToast(res.message || 'Tablas actualizadas con éxito', 'success');

      // Cerrar modal
      const modalEl = document.getElementById('modal-income-tax-adjust-ipc');
      if (modalEl && window.bootstrap) {
        const modal = window.bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }

      this.incomeTaxState.selectedYear = targetYear;
      const globalYearSel = document.getElementById('it-global-year-select');
      if (globalYearSel) globalYearSel.value = targetYear.toString();

      await this.loadTaxTablesView();
    } catch (err) {
      console.error('Error al ajustar tablas por IPC:', err);
      showToast(err.message || 'Error al ajustar tablas', 'danger');
    }
  };

  // ==========================================================================
  // 6. LIQUIDACIÓN ANUAL Y EXPORTACIÓN F. 1359 (ARCA)
  // ==========================================================================

  proto.loadAnnualTaxView = async function () {
    const year = this.incomeTaxState.selectedYear;
    const yearLabel = document.getElementById('it-annual-period-label');
    if (yearLabel) yearLabel.textContent = year.toString();
  };

  proto.runAnnualTaxCalculation = async function () {
    const year = this.incomeTaxState.selectedYear;
    try {
      showToast('Calculando Liquidación Anual F.1359...', 'info');
      const res = await apiRequest('/income-tax/annual/calculate', {
        method: 'POST',
        body: JSON.stringify({ fiscalYear: year }),
      });

      showToast(res.message || 'Liquidación Anual finalizada con éxito', 'success');
      const btnDownload = document.getElementById('btn-it-download-f1359');
      if (btnDownload) btnDownload.disabled = false;
    } catch (err) {
      console.error('Error al calcular liquidación anual:', err);
      showToast(err.message || 'Error en liquidación anual', 'danger');
    }
  };

  proto.downloadF1359 = async function () {
    const year = this.incomeTaxState.selectedYear;
    try {
      showToast('Generando archivo oficial ARCA F.1359...', 'info');
      const res = await apiRequest('/income-tax/f1359/export', {
        method: 'POST',
        body: JSON.stringify({ fiscalYear: year, settlementType: '1' }),
      });

      const data = res.data;
      if (!data || !data.fileContent) {
        showToast('No se generó contenido para el archivo F.1359', 'warning');
        return;
      }

      // Descargar como archivo .txt
      const blob = new Blob([data.fileContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || `F1359_${year}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(res.message || 'Archivo F.1359 descargado con éxito', 'success');

      // Mostrar visor previo
      const previewBox = document.getElementById('it-f1359-preview-box');
      if (previewBox) {
        previewBox.classList.remove('d-none');
        const pre = previewBox.querySelector('pre');
        if (pre) pre.textContent = data.fileContent;
      }
    } catch (err) {
      console.error('Error al descargar F.1359:', err);
      showToast(err.message || 'Error al exportar F.1359', 'danger');
    }
  };
}
