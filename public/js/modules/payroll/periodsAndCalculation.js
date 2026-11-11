import { apiRequest, storage, showToast } from '../../api.js?v=2.0';
import {
  isValidCuit,
  formatCuit,
  BCRA_BANK_CODES,
  getCbuBankName,
  isValidCbu,
  formatNumber,
  escapeHtml,
  getBootstrapModal,
  isValidTimeFormat,
  hoursToDecimal,
  decimalToHours,
  getConceptInputType,
  formatNoveltyValue,
  initSearchableSelect,
  updateSearchableSelect,
  setSearchableSelectValue,
  hideSelect,
  showSelect,
  renderDynamicNoveltyControl,
  getDynamicNoveltyControlValue,
  ARCA_T03_ACTIVITIES,
  getArcaActivityInfo,
} from '../../utils/helpers.js';

class MixinMethods {
  switchPayrollPane(targetPaneId) {
    if (!targetPaneId) return;
    const cleanId = targetPaneId.startsWith('#') ? targetPaneId : `#${targetPaneId}`;

    // 1. Limpiar estados activos de todos los ítems y sub-ítems
    const allNavLinks = document.querySelectorAll(
      '#payroll-sidebar-nav .payroll-nav-item, #payroll-sidebar-nav .payroll-nav-subitem'
    );
    allNavLinks.forEach((i) => i.classList.remove('active'));

    // 2. Activar el ítem seleccionado (o mantener Períodos y Liquidaciones activo en sub-vistas contextuales)
    const navLookupId =
      cleanId === '#pane-payroll-settlement' || cleanId === '#pane-payroll-slips'
        ? '#pane-payroll-periods'
        : cleanId;
    const activeItem = document.querySelector(
      `#payroll-sidebar-nav a[href="${navLookupId}"], #payroll-sidebar-nav a[data-bs-target="${navLookupId}"]`
    );
    if (activeItem) {
      activeItem.classList.add('active');

      // Si es un sub-ítem, mantener activo visualmente el menú padre y abrir su acordeón si está cerrado
      const parentDropdown = activeItem.closest('.payroll-nav-dropdown');
      if (parentDropdown) {
        const parentBtn = parentDropdown.querySelector('.payroll-nav-item');
        if (parentBtn) {
          parentBtn.classList.add('active');
          parentBtn.setAttribute('aria-expanded', 'true');
        }

        const collapseSubmenu = parentDropdown.querySelector('.collapse, .payroll-submenu');
        if (collapseSubmenu && !collapseSubmenu.classList.contains('show')) {
          collapseSubmenu.classList.add('show');
        }
        const caret = parentBtn?.querySelector('.submenu-caret');
        if (caret) {
          caret.style.transform = 'rotate(180deg)';
        }
      }
    }

    // 3. Conmutar visualmente los paneles en #payroll-tab-content
    const tabPanes = document.querySelectorAll('#payroll-tab-content > .tab-pane');
    tabPanes.forEach((p) => {
      p.classList.remove('show', 'active');
    });
    const targetPane = document.querySelector(cleanId);
    if (targetPane) {
      targetPane.classList.add('show', 'active');
    }

    // 4. Cargar datos específicos del panel activado
    if (cleanId === '#pane-payroll-periods') {
      this.loadPayrollPeriods();
    } else if (cleanId === '#pane-nov-pers-emp') {
      this.loadNovPersEmp();
    } else if (cleanId === '#pane-nov-pers-con') {
      this.loadNovPersCon();
    } else if (cleanId === '#pane-payroll-embargoes') {
      this.loadEmbargoes();
    } else if (cleanId === '#pane-nov-nopers-emp') {
      this.syncPayrollPeriodSelectors();
      this.loadNovNoPersEmp();
    } else if (cleanId === '#pane-nov-nopers-con') {
      this.syncPayrollPeriodSelectors();
      this.loadNovNoPersCon();
    } else if (cleanId === '#pane-payroll-settlement') {
      this.syncPayrollPeriodSelectors();
      this.loadSettlementView();
    } else if (cleanId === '#pane-payroll-slips') {
      this.syncPayrollPeriodSelectors();
      const periodSelect = document.getElementById('slips-period-select');
      if (periodSelect && periodSelect.value) {
        this.loadPayrollSlips(periodSelect.value);
      }
    } else if (cleanId === '#pane-payroll-lsd') {
      this.loadLsdMonthlyPeriods();
    } else if (cleanId === '#pane-payroll-concepts') {
      this.loadPayrollConcepts();
    } else if (cleanId === '#pane-payroll-matrices') {
      this.loadPayrollMatrices();
    } else if (cleanId === '#pane-payroll-fixed-values') {
      this.loadPayrollFixedValues();
    } else if (cleanId === '#pane-payroll-salary-scales') {
      this.loadPayrollSalaryScales();
    } else if (cleanId === '#pane-payroll-settings') {
      this.loadPayrollSettings();
    } else if (cleanId === '#pane-payroll-income-tax') {
      this.renderIncomeTaxView();
    } else if (cleanId === '#pane-reports-runner') {
      this.renderReportsRunnerView();
    } else if (cleanId === '#pane-reports-builder') {
      const builderPane = document.querySelector('#pane-reports-builder');
      const runnerPane = document.querySelector('#pane-reports-runner');
      if (builderPane) builderPane.classList.remove('show', 'active');
      if (runnerPane) runnerPane.classList.add('show', 'active');
      this.renderReportsRunnerView();
      this.renderReportsBuilderView(null);
    }
  }

  setupPayrollNavigation() {
    const navLinks = document.querySelectorAll(
      '#payroll-sidebar-nav .payroll-nav-item:not([data-bs-toggle="collapse"]), #payroll-sidebar-nav .payroll-nav-subitem'
    );
    navLinks.forEach((item) => {
      item.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const targetPaneId = item.getAttribute('href') || item.getAttribute('data-bs-target');
        if (targetPaneId) {
          this.switchPayrollPane(targetPaneId);
        }
      };
    });

    // Soporte para desplegar y colapsar acordeones de submenús de forma robusta
    const dropdownToggles = document.querySelectorAll('#payroll-sidebar-nav .payroll-nav-item[data-bs-toggle="collapse"]');
    dropdownToggles.forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const targetId = btn.getAttribute('data-bs-target') || btn.getAttribute('href');
        if (targetId) {
          const collapseEl = document.querySelector(targetId);
          if (collapseEl) {
            collapseEl.classList.toggle('show');
            const isShown = collapseEl.classList.contains('show');
            btn.setAttribute('aria-expanded', isShown ? 'true' : 'false');
            const caret = btn.querySelector('.submenu-caret');
            if (caret) {
              caret.style.transform = isShown ? 'rotate(180deg)' : 'rotate(0deg)';
            }
            if (isShown) {
              setTimeout(() => {
                collapseEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }, 30);
            }
          }
        }
      };
    });
  }

  async renderPayrollView() {
    if (!this.activeCompany) {
      showToast('Por favor selecciona una empresa activa para liquidar sueldos', 'warning');
      this.showView('companies');
      return;
    }

    const payrollTenantName = document.getElementById('payroll-header-company-name');
    if (payrollTenantName) payrollTenantName.textContent = this.activeCompany.name;
    document.querySelectorAll('.payroll-active-company-name-sync').forEach((el) => {
      el.textContent = this.activeCompany.name;
    });

    this.setupPayrollNavigation();

    // Asegurar que haya un panel activo visible si ninguno lo está
    const activePane = document.querySelector('#payroll-tab-content > .tab-pane.active');
    if (!activePane) {
      this.switchPayrollPane('#pane-payroll-periods');
    }

    await this.loadPayrollPeriods();
    await this.loadPayrollSalaryScales();
    await this.loadPayrollConcepts();
    await this.loadPayrollMatrices();
    await this.loadPayrollFixedValues();
    await this.loadPayrollSettings();
  }

  setupPayrollModals() {
    this.setupEmbargoModals?.();
    this.setupReportsEvents?.();

    // --- Fiscal Period Modal & Cierre ---
    const newFiscalPeriodBtn = document.getElementById('btn-new-fiscal-period');
    if (newFiscalPeriodBtn) newFiscalPeriodBtn.addEventListener('click', () => this.openNewFiscalPeriodModal());

    const closeFiscalPeriodBtn = document.getElementById('btn-close-fiscal-period');
    if (closeFiscalPeriodBtn) {
      closeFiscalPeriodBtn.addEventListener('click', () => {
        if (!this.activeFiscalPeriod) return;
        const monthNames = [
          'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
        ];
        const label = `${monthNames[this.activeFiscalPeriod.month - 1] || this.activeFiscalPeriod.month} ${this.activeFiscalPeriod.year}`;
        this.openPayrollCloseModal({
          scope: 'FISCAL_PERIOD',
          id: this.activeFiscalPeriod.id,
          name: `Período ${label}`,
        });
      });
    }

    const openAuditsBtn = document.getElementById('btn-open-closing-audits');
    if (openAuditsBtn) {
      openAuditsBtn.addEventListener('click', () => this.openClosingAuditsModal());
    }

    const formCloseConfirm = document.getElementById('form-payroll-close-confirm');
    if (formCloseConfirm) {
      formCloseConfirm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.executePayrollClose();
      });
    }

    const formFiscalPeriod = document.getElementById('form-fiscal-period');
    if (formFiscalPeriod) {
      formFiscalPeriod.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.saveFiscalPeriod();
      });
    }

    // --- Period Modal ---
    const newPeriodBtnHeader = document.getElementById('btn-new-period-header');
    const newPeriodBtn = document.getElementById('btn-open-new-period-modal');
    if (newPeriodBtnHeader) newPeriodBtnHeader.addEventListener('click', () => this.openNewPeriodModal());
    if (newPeriodBtn) newPeriodBtn.addEventListener('click', () => this.openNewPeriodModal());

    const formPeriod = document.getElementById('form-payroll-period');
    if (formPeriod) {
      formPeriod.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.savePayrollPeriod();
      });
    }

    // --- Search & Filters for Periods ---
    const periodSearch = document.getElementById('payroll-period-search');
    if (periodSearch) {
      let searchDebounce = null;
      periodSearch.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          this.payrollPeriodsPage = 1;
          this.loadPayrollPeriods();
        }, 250);
      });
    }
    const periodTypeFilter = document.getElementById('payroll-period-type-filter');
    if (periodTypeFilter) {
      periodTypeFilter.addEventListener('change', () => {
        this.payrollPeriodsPage = 1;
        this.loadPayrollPeriods();
      });
    }
    const periodStatusFilter = document.getElementById('payroll-period-status-filter');
    if (periodStatusFilter) {
      periodStatusFilter.addEventListener('change', () => {
        this.payrollPeriodsPage = 1;
        this.loadPayrollPeriods();
      });
    }
    const periodPageSize = document.getElementById('payroll-periods-page-size-select');
    if (periodPageSize) {
      periodPageSize.addEventListener('change', () => {
        this.payrollPeriodsPageSize = Number(periodPageSize.value) || 5;
        this.payrollPeriodsPage = 1;
        this.loadPayrollPeriods();
      });
    }

    // --- Setup de Novedades y Liquidación ---
    this.setupNoveltyPersistentHandlers();
    this.setupNoveltyNoPersistentHandlers();
    this.setupSettlementHandlers();
    this.setupBatchSheetHandlers();
    this.setupExcelImportHandlers();
    this.setupSimulatePayslipHandlers();

    // --- Slips & Settlement Back Navigation Handlers ---
    const btnBackFromSettlement = document.getElementById('btn-back-from-settlement');
    if (btnBackFromSettlement) {
      btnBackFromSettlement.addEventListener('click', () => {
        this.switchPayrollPane('#pane-payroll-periods');
      });
    }
    const btnBackFromSlips = document.getElementById('btn-back-from-slips');
    if (btnBackFromSlips) {
      btnBackFromSlips.addEventListener('click', () => {
        this.switchPayrollPane('#pane-payroll-periods');
      });
    }
    const slipsPeriodSelect = document.getElementById('slips-period-select');
    const slipsDeptFilter = document.getElementById('slips-department-filter');
    if (slipsDeptFilter) {
      slipsDeptFilter.addEventListener('change', () => {
        this.payrollSlipsPage = 1;
        this.loadPayrollSlips(slipsPeriodSelect?.value || this.activePayrollPeriodId);
      });
    }
    const slipsSearch = document.getElementById('slips-search-input');
    if (slipsSearch) {
      slipsSearch.addEventListener('input', () => {
        this.payrollSlipsPage = 1;
        this.loadPayrollSlips(slipsPeriodSelect?.value || this.activePayrollPeriodId);
      });
    }
    const slipsPageSize = document.getElementById('slips-page-size-select');
    if (slipsPageSize) {
      slipsPageSize.addEventListener('change', () => {
        this.payrollSlipsPageSize = Number(slipsPageSize.value) || 5;
        this.payrollSlipsPage = 1;
        this.loadPayrollSlips(slipsPeriodSelect?.value || this.activePayrollPeriodId);
      });
    }
    const btnBatchPrint = document.getElementById('btn-export-slips-batch');
    if (btnBatchPrint) {
      btnBatchPrint.addEventListener('click', () => this.printBatchSlips());
    }

    // --- Print Modal Button & Print Lifecycle ---
    const btnPrintPayslip = document.getElementById('btn-print-payslip');
    if (btnPrintPayslip) {
      btnPrintPayslip.addEventListener('click', () => {
        const isAuditActive = document.getElementById('tab-payslip-audit')?.classList.contains('active');
        if (isAuditActive) {
          this.printPayslipAuditReport();
        } else {
          document.body.classList.remove('audit-printing');
          window.print();
        }
      });
    }

    if (!this._auditPrintListenersBound) {
      this._auditPrintListenersBound = true;
      window.addEventListener('beforeprint', () => {
        const modalOpen = document.getElementById('modal-view-payslip')?.classList.contains('show');
        const isAuditActive = document.getElementById('tab-payslip-audit')?.classList.contains('active');
        if (modalOpen && isAuditActive) {
          document.body.classList.add('audit-printing');
        }
      });
      window.addEventListener('afterprint', () => {
        document.body.classList.remove('audit-printing');
      });
    }

    // --- LSD Handlers ---
    const btnValidateLsd = document.getElementById('btn-validate-lsd');
    if (btnValidateLsd) {
      btnValidateLsd.addEventListener('click', () => this.openLsdAuditConfirmModal());
    }
    const btnConfirmExecuteLsdAudit = document.getElementById('btn-confirm-execute-lsd-audit');
    if (btnConfirmExecuteLsdAudit) {
      btnConfirmExecuteLsdAudit.addEventListener('click', () => this.auditLsdConsistency());
    }
    const lsdPeriodSelect = document.getElementById('lsd-period-select');
    if (lsdPeriodSelect) {
      lsdPeriodSelect.addEventListener('change', () => {
        const val = lsdPeriodSelect.value;
        const currentP = (this.lsdMonthlyPeriods || []).find((p) => p.periodKey === val);
        const helperText = document.getElementById('lsd-period-helper-text');
        if (helperText && currentP) {
          const openNotice = currentP.hasOpen ? ' <span class="badge bg-warning-lt text-warning ms-1">Contiene liquidaciones abiertas</span>' : '';
          helperText.innerHTML = `<i class="ti ti-info-circle me-1"></i> Se consolidarán automáticamente <strong>${currentP.settlements.length} liquidaciones</strong> (${currentP.totalSlips} recibos).${openNotice}`;
        }
        this.resetLsdStatusCard();
      });
    }
    const btnDownloadLsdConcepts = document.getElementById('btn-download-lsd-concepts');
    if (btnDownloadLsdConcepts) {
      btnDownloadLsdConcepts.addEventListener('click', () => this.downloadLsdConceptsFile());
    }
    const btnDownloadLsdPayroll = document.getElementById('btn-download-lsd-payroll');
    if (btnDownloadLsdPayroll) {
      btnDownloadLsdPayroll.addEventListener('click', () => this.downloadLsdPayrollFile());
    }
    const btnOpenLsdErrorsModal = document.getElementById('btn-open-lsd-errors-modal');
    if (btnOpenLsdErrorsModal) {
      btnOpenLsdErrorsModal.addEventListener('click', () => {
        if (this.currentLsdAuditErrors && this.currentLsdAuditErrors.length > 0) {
          this.showLsdAuditErrorsModal(this.currentLsdAuditErrors, this.currentLsdAuditPeriodId);
        }
      });
    }
    const btnExportLsdErrorsExcel = document.getElementById('btn-export-lsd-errors-excel');
    if (btnExportLsdErrorsExcel) {
      btnExportLsdErrorsExcel.addEventListener('click', () => this.exportLsdErrorsToExcel());
    }
    const searchLsdAudit = document.getElementById('modal-lsd-audit-search');
    if (searchLsdAudit) {
      searchLsdAudit.addEventListener('input', () => this.renderLsdAuditErrorsTable());
    }
    const filterTypeLsdAudit = document.getElementById('modal-lsd-audit-filter-type');
    if (filterTypeLsdAudit) {
      filterTypeLsdAudit.addEventListener('change', () => this.renderLsdAuditErrorsTable());
    }

    // --- Period Summary Modal Handlers ---
    const btnExportPeriodSummaryExcel = document.getElementById('btn-export-period-summary-excel');
    if (btnExportPeriodSummaryExcel) {
      btnExportPeriodSummaryExcel.addEventListener('click', () => this.exportPeriodSummaryExcel());
    }
    const btnPrintPeriodSummaryPdf = document.getElementById('btn-print-period-summary-pdf');
    if (btnPrintPeriodSummaryPdf) {
      btnPrintPeriodSummaryPdf.addEventListener('click', () => this.printPeriodSummaryPdf());
    }

    // --- Concepts Handlers ---
    const btnNewConcept = document.getElementById('btn-open-new-concept-modal');
    if (btnNewConcept) {
      btnNewConcept.addEventListener('click', () => this.openNewConceptModal());
    }
    const conceptsSearch = document.getElementById('concepts-search-input');
    if (conceptsSearch) {
      conceptsSearch.addEventListener('input', () => {
        this.payrollConceptsPage = 1;
        this.loadPayrollConcepts();
      });
    }
    const conceptsTypeFilter = document.getElementById('concepts-type-filter');
    if (conceptsTypeFilter) {
      conceptsTypeFilter.addEventListener('change', () => {
        this.payrollConceptsPage = 1;
        this.loadPayrollConcepts();
      });
    }

    const conceptsPeriodTypeFilter = document.getElementById('concepts-period-type-filter');
    if (conceptsPeriodTypeFilter) {
      conceptsPeriodTypeFilter.addEventListener('change', () => {
        this.payrollConceptsPage = 1;
        this.loadPayrollConcepts();
      });
    }
    const conceptsPersistentFilter = document.getElementById('concepts-persistent-filter');
    if (conceptsPersistentFilter) {
      conceptsPersistentFilter.addEventListener('change', () => {
        this.payrollConceptsPage = 1;
        this.loadPayrollConcepts();
      });
    }
    const conceptsPageSize = document.getElementById('concepts-page-size-select');
    if (conceptsPageSize) {
      conceptsPageSize.addEventListener('change', () => {
        this.payrollConceptsPageSize = Number(conceptsPageSize.value) || 5;
        this.payrollConceptsPage = 1;
        this.loadPayrollConcepts();
      });
    }

    const calcTypeSelect = document.getElementById('concept-input-calc-type');
    if (calcTypeSelect) {
      calcTypeSelect.addEventListener('change', () => {
        const val = calcTypeSelect.value;
        const formulaBox = document.getElementById('concept-formula-box');
        const matrixBox = document.getElementById('concept-matrix-box');
        if (val === 'FORMULA') {
          formulaBox?.classList.remove('d-none');
          matrixBox?.classList.add('d-none');
        } else if (val === 'MATRIX') {
          formulaBox?.classList.add('d-none');
          matrixBox?.classList.remove('d-none');
        } else {
          formulaBox?.classList.add('d-none');
          matrixBox?.classList.add('d-none');
        }
      });
    }

    const periodTypeSelect = document.getElementById('concept-input-period-type');
    if (periodTypeSelect) {
      periodTypeSelect.addEventListener('change', () => {
        this.updateConceptNormalizedCode();
      });
    }

    const conceptNumInput = document.getElementById('concept-input-number');
    if (conceptNumInput) {
      conceptNumInput.addEventListener('input', () => {
        this.updateConceptNormalizedCode();
        this.updateFormulaAccumulatorsFilter();
      });
      conceptNumInput.addEventListener('blur', () => {
        this.updateConceptNormalizedCode(true);
        this.updateFormulaAccumulatorsFilter();
      });
    }

    const conceptTypeSelect = document.getElementById('concept-input-type');
    if (conceptTypeSelect) {
      conceptTypeSelect.addEventListener('change', () => {
        const arcaSelect = document.getElementById('concept-input-arca-code');
        const formId = document.getElementById('concept-form-id')?.value;
        if (arcaSelect) {
          const t = conceptTypeSelect.value;
          const currentArca = arcaSelect.value;
          const isCurrentRem = currentArca && (currentArca.startsWith('1') || (parseInt(currentArca, 10) >= 110000 && parseInt(currentArca, 10) <= 499999));
          const isCurrentNonRem = currentArca && (currentArca.startsWith('5') || (parseInt(currentArca, 10) >= 510000 && parseInt(currentArca, 10) <= 799999));
          const isCurrentDed = currentArca && (currentArca.startsWith('8') || (parseInt(currentArca, 10) >= 810000 && parseInt(currentArca, 10) <= 899999));

          let shouldChangeArca = !formId;
          if (formId) {
            if (t === 'REMUNERATIVE' && !isCurrentRem) shouldChangeArca = true;
            else if (t === 'NON_REMUNERATIVE' && !isCurrentNonRem) shouldChangeArca = true;
            else if (t === 'DEDUCTION' && !isCurrentDed) shouldChangeArca = true;
            else if (t === 'AUXILIARY' && currentArca) shouldChangeArca = true;
          }

          if (shouldChangeArca) {
            if (t === 'REMUNERATIVE') arcaSelect.value = '110000';
            else if (t === 'NON_REMUNERATIVE') arcaSelect.value = '550000';
            else if (t === 'DEDUCTION') arcaSelect.value = '810000';
            else if (t === 'AUXILIARY') arcaSelect.value = '';
            arcaSelect.dataset.prevValue = arcaSelect.value;
            this.applyArcaSubsystemsSuggestion(arcaSelect.value, { syncType: false });
          }
        }
        this.updateFormulaAccumulatorsFilter();
      });
    }

    const noveltySelect = document.getElementById('concept-input-novelty-type');
    if (noveltySelect) {
      noveltySelect.addEventListener('change', () => {
        this.updateFormulaNoveltiesFilter();
      });
    }

    const arcaSelect = document.getElementById('concept-input-arca-code');
    if (arcaSelect) {
      arcaSelect.addEventListener('change', () => {
        this.handleArcaCodeChange(arcaSelect);
      });
    }

    // Inicializar diseñador visual de fórmulas con ComboBox y validación en vivo
    this.setupFormulaDesigner();

    const formConcept = document.getElementById('form-payroll-concept');
    if (formConcept) {
      formConcept.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.savePayrollConcept();
      });
    }

    const conceptMatrixSelect = document.getElementById('concept-select-matrix');
    if (conceptMatrixSelect) {
      conceptMatrixSelect.addEventListener('change', () => {
        this.updateConceptMatrixInfoBanner();
      });
    }

    const qtySourceSelect = document.getElementById('concept-input-quantity-source');
    if (qtySourceSelect) {
      qtySourceSelect.addEventListener('change', () => {
        const formulaBox = document.getElementById('concept-quantity-formula-box');
        if (qtySourceSelect.value === 'FORMULA') {
          formulaBox?.classList.remove('d-none');
        } else {
          formulaBox?.classList.add('d-none');
        }
      });
    }

    const btnQuickCreateMatrix = document.getElementById('btn-quick-create-matrix');
    if (btnQuickCreateMatrix) {
      btnQuickCreateMatrix.addEventListener('click', () => {
        this.openNewMatrixModal();
      });
    }

    // --- Matrices View & Modal Handlers ---
    const btnNewMatrix = document.getElementById('btn-open-new-matrix-modal');
    if (btnNewMatrix) {
      btnNewMatrix.addEventListener('click', () => this.openNewMatrixModal());
    }

    const matricesSearch = document.getElementById('matrices-search-input');
    if (matricesSearch) {
      matricesSearch.addEventListener('input', () => {
        this.payrollMatricesPage = 1;
        this.loadPayrollMatrices();
      });
    }

    const matricesTypeFilter = document.getElementById('matrices-type-filter');
    if (matricesTypeFilter) {
      matricesTypeFilter.addEventListener('change', () => {
        this.payrollMatricesPage = 1;
        this.loadPayrollMatrices();
      });
    }

    const matricesPageSize = document.getElementById('matrices-page-size-select');
    if (matricesPageSize) {
      matricesPageSize.addEventListener('change', () => {
        this.payrollMatricesPageSize = Number(matricesPageSize.value) || 5;
        this.payrollMatricesPage = 1;
        this.loadPayrollMatrices();
      });
    }

    const btnMatrixAddRow = document.getElementById('btn-matrix-add-row');
    if (btnMatrixAddRow) {
      btnMatrixAddRow.addEventListener('click', () => this.addMatrixFormRow());
    }

    const matrixMatchTypeSelect = document.getElementById('matrix-input-match-type');
    if (matrixMatchTypeSelect) {
      matrixMatchTypeSelect.addEventListener('change', () => {
        this.syncMatrixFormRowsFromDOM();
        this.renderMatrixFormRows();
      });
    }

    const matrixReturnTypeSelect = document.getElementById('matrix-input-return-type');
    if (matrixReturnTypeSelect) {
      matrixReturnTypeSelect.addEventListener('change', () => {
        this.syncMatrixFormRowsFromDOM();
        this.renderMatrixFormRows();
      });
    }

    const formMatrix = document.getElementById('form-payroll-matrix');
    if (formMatrix) {
      formMatrix.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.savePayrollMatrix();
      });
    }

    // --- Valores Globales Fijos View & Modal Handlers ---
    const btnNewFixedValue = document.getElementById('btn-open-new-fixed-value-modal');
    if (btnNewFixedValue) {
      btnNewFixedValue.addEventListener('click', () => this.openNewFixedValueModal());
    }

    const fixedValuesSearch = document.getElementById('fixed-values-search-input');
    if (fixedValuesSearch) {
      fixedValuesSearch.addEventListener('input', () => {
        this.payrollFixedValuesPage = 1;
        this.loadPayrollFixedValues();
      });
    }

    const fixedValuesStatusFilter = document.getElementById('fixed-values-status-filter');
    if (fixedValuesStatusFilter) {
      fixedValuesStatusFilter.addEventListener('change', () => {
        this.payrollFixedValuesPage = 1;
        this.loadPayrollFixedValues();
      });
    }

    const fixedValuesPageSize = document.getElementById('fixed-values-page-size-select');
    if (fixedValuesPageSize) {
      fixedValuesPageSize.addEventListener('change', () => {
        this.payrollFixedValuesPageSize = Number(fixedValuesPageSize.value) || 5;
        this.payrollFixedValuesPage = 1;
        this.loadPayrollFixedValues();
      });
    }

    const fixedValueCodeInput = document.getElementById('fixed-value-input-code');
    if (fixedValueCodeInput) {
      fixedValueCodeInput.addEventListener('input', () => {
        fixedValueCodeInput.value = fixedValueCodeInput.value.toUpperCase().replace(/\s+/g, '_');
      });
    }

    const fixedValueUnitSelect = document.getElementById('fixed-value-input-unit');
    if (fixedValueUnitSelect) {
      fixedValueUnitSelect.addEventListener('change', () => {
        const addon = document.getElementById('fixed-value-unit-addon');
        if (addon) addon.textContent = fixedValueUnitSelect.value;
      });
    }

    const formFixedValue = document.getElementById('form-payroll-fixed-value');
    if (formFixedValue) {
      formFixedValue.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.saveFixedValue();
      });
    }

    // --- Settings Form ---
    const formSettings = document.getElementById('form-payroll-settings');
    if (formSettings) {
      formSettings.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.savePayrollSettings();
      });
    }

    // --- Aumentos Generalizados y Asignación Masiva ---
    document.getElementById('btn-open-mass-wage-increase')?.addEventListener('click', () => {
      this.openMassWageIncreaseModal();
    });

    document.getElementById('btn-open-mass-assign-concept')?.addEventListener('click', () => {
      this.openMassAssignConceptModal();
    });

    const massIncreaseTypeSelect = document.getElementById('mass-increase-type');
    if (massIncreaseTypeSelect) {
      massIncreaseTypeSelect.addEventListener('change', () => {
        const isPct = massIncreaseTypeSelect.value === 'PERCENTAGE';
        const symbol = document.getElementById('mass-increase-symbol');
        const addon = document.getElementById('mass-increase-unit-addon');
        if (symbol) symbol.textContent = isPct ? '(%)' : '($)';
        if (addon) addon.textContent = isPct ? '%' : '$';
      });
    }

    document.getElementById('btn-preview-mass-increase')?.addEventListener('click', () => {
      this.previewMassWageIncrease();
    });

    document.getElementById('btn-apply-mass-increase')?.addEventListener('click', () => {
      this.applyMassWageIncrease();
    });

    document.getElementById('form-mass-assign-concept')?.addEventListener('submit', (e) => {
      this.submitMassAssignConcept(e);
    });

    // --- Nóminas (Sueldos Básicos) y Actualización Masiva de Escalas ---
    document.getElementById('btn-open-new-scale-modal')?.addEventListener('click', () => {
      this.openNewSalaryScaleModal();
    });

    document.getElementById('form-salary-scale')?.addEventListener('submit', (e) => {
      this.saveSalaryScale(e);
    });

    document.getElementById('payroll-scale-search')?.addEventListener('input', () => {
      this.payrollSalaryScalesPage = 1;
      this.renderPayrollSalaryScalesTable();
    });

    document.getElementById('payroll-scale-cct-filter')?.addEventListener('change', () => {
      this.payrollSalaryScalesPage = 1;
      this.renderPayrollSalaryScalesTable();
    });

    document.getElementById('payroll-scale-group-by-cct')?.addEventListener('change', () => {
      this.payrollSalaryScalesPage = 1;
      this.renderPayrollSalaryScalesTable();
    });

    document.getElementById('payroll-scales-page-size-select')?.addEventListener('change', (e) => {
      this.payrollSalaryScalesPageSize = parseInt(e.target.value, 10) || 5;
      this.payrollSalaryScalesPage = 1;
      this.renderPayrollSalaryScalesTable();
    });

    document.getElementById('btn-open-mass-scale-increase')?.addEventListener('click', () => {
      this.openMassScaleIncreaseModal();
    });

    document.getElementById('mass-scale-cct-filter')?.addEventListener('change', () => {
      this.handleMassScaleCctFilterChange?.();
    });

    document.getElementById('btn-toggle-mass-scale-items')?.addEventListener('click', () => {
      this.toggleMassScaleItemsChecklist?.();
    });

    document.getElementById('btn-mass-scale-select-all')?.addEventListener('click', () => {
      this.setMassScaleChecklistAll?.(true);
    });

    document.getElementById('btn-mass-scale-select-none')?.addEventListener('click', () => {
      this.setMassScaleChecklistAll?.(false);
    });

    document.getElementById('btn-add-mass-scale-period')?.addEventListener('click', () => {
      this.addMassScalePeriodRow?.();
    });

    document.getElementById('btn-preview-mass-scale-increase')?.addEventListener('click', () => {
      this.previewMassScaleIncrease();
    });

    document.getElementById('form-mass-scale-increase')?.addEventListener('submit', (e) => {
      this.applyMassScaleIncrease(e);
    });
  }

  renderPayrollPeriodsTable(periods) {
    const tbody = document.getElementById('payroll-periods-table-body');
    if (!tbody) return;

    if (periods.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-4 text-muted">
            <i class="ti ti-calendar-off fs-1 d-block mb-2 text-secondary"></i>
            No se registraron liquidaciones aún. Hacé click en "Nueva Liquidación" para comenzar.
          </td>
        </tr>
      `;
      return;
    }

    const typeLabels = {
      MONTHLY: 'Mensual',
      QUINCE_1: '1ra Quincena',
      QUINCE_2: '2da Quincena',
      SAC_1: '1er SAC',
      SAC_2: '2do SAC',
      VACATIONS: 'Vacaciones',
      FINAL: 'Final',
    };

    const statusBadges = {
      DRAFT: '<span class="badge bg-secondary-lt"><i class="ti ti-pencil me-1"></i> Borrador</span>',
      CALCULATED: '<span class="badge bg-azure-lt"><i class="ti ti-calculator me-1"></i> Calculada</span>',
      CLOSED: '<span class="badge bg-success"><i class="ti ti-lock me-1"></i> Cerrada</span>',
    };

    tbody.innerHTML = periods
      .map((p) => {
        const monthStr = String(p.month).padStart(2, '0');
        const count = p.paySlipsCount !== undefined ? p.paySlipsCount : p._count?.paySlips || 0;
        const gross = Number(p.totalGross || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
        const net = Number(p.totalNet || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
        const isClosed = p.status === 'CLOSED';

        return `
          <tr>
            <td><strong class="font-monospace">${monthStr}/${p.year}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(p.settlementName || 'Liquidación')}</div>
              <small class="text-muted">Liq. #${p.settlementNumber || 1}${p.liquidationDate ? ` • F. Liq: ${new Date(String(p.liquidationDate).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR')}` : ''}</small>
            </td>
            <td><span class="badge bg-blue-lt">${typeLabels[p.periodType] || p.periodType}</span></td>
            <td class="text-center"><span class="badge bg-purple-lt">${count}</span></td>
            <td class="text-end font-monospace">$${gross}</td>
            <td class="text-end font-monospace fw-bold text-success">$${net}</td>
            <td class="text-center">${statusBadges[p.status] || p.status}</td>
            <td class="text-end">
              <div class="btn-group btn-group-sm">
                <button type="button" class="btn btn-outline-primary btn-calc-period" data-id="${p.id}" title="Cargar novedades y calcular">
                  <i class="ti ti-calculator"></i>
                </button>
                <button type="button" class="btn btn-outline-success btn-view-period-slips" data-id="${p.id}" title="Ver recibos generados">
                  <i class="ti ti-receipt-2"></i>
                </button>
                <button type="button" class="btn btn-outline-info btn-summary-period" data-id="${p.id}" title="Informe Resumen de Liquidación">
                  <i class="ti ti-file-analytics"></i>
                </button>
                ${
                  !isClosed && this.canClosePayrollPeriods()
                    ? `
                  <button type="button" class="btn btn-outline-warning btn-close-period" data-id="${p.id}" data-name="${escapeHtml(p.settlementName)}" title="Cerrar liquidación (inmutabilidad, depura novedades y aplica bajas si es Final)">
                    <i class="ti ti-lock-check"></i>
                  </button>
                `
                    : ''
                }
                ${
                  !isClosed
                    ? `
                  <button type="button" class="btn btn-outline-danger btn-del-period" data-id="${p.id}" data-name="${escapeHtml(p.settlementName)}" title="Eliminar liquidación">
                    <i class="ti ti-trash"></i>
                  </button>
                `
                    : ''
                }
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    // Listeners
    tbody.querySelectorAll('.btn-calc-period').forEach((btn) => {
      btn.addEventListener('click', () => {
        const periodId = btn.dataset.id;
        this.activePayrollPeriodId = periodId;
        this.syncPayrollPeriodSelectors(periodId);
        this.showOmittedAlert(0, 0, []);
        this.switchPayrollPane('#pane-payroll-settlement');
      });
    });

    tbody.querySelectorAll('.btn-view-period-slips').forEach((btn) => {
      btn.addEventListener('click', () => {
        const periodId = btn.dataset.id;
        this.activePayrollPeriodId = periodId;
        this.payrollSlipsPage = 1;
        this.syncPayrollPeriodSelectors(periodId);
        this.switchPayrollPane('#pane-payroll-slips');
      });
    });

    tbody.querySelectorAll('.btn-summary-period').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openPeriodSummaryModal(btn.dataset.id);
      });
    });

    tbody.querySelectorAll('.btn-close-period').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openPayrollCloseModal({
          scope: 'PAYROLL_PERIOD',
          id: btn.dataset.id,
          name: btn.dataset.name,
        });
      });
    });

    tbody.querySelectorAll('.btn-del-period').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.confirmDeletePeriod(btn.dataset.id, btn.dataset.name);
      });
    });
  }

  renderPayrollPeriodsPagination(meta) {
    const list = document.getElementById('payroll-periods-pagination-list');
    const info = document.getElementById('payroll-periods-pagination-info');
    if (!list) return;

    if (info) {
      info.textContent = `Mostrando ${this.payrollPeriods.length} de ${meta.total} liquidaciones`;
    }

    const { page, totalPages } = meta;
    this.renderPaginationControls(list, page, totalPages, (newPage) => {
      this.payrollPeriodsPage = newPage;
      this.loadPayrollPeriods();
    });
  }

  syncPayrollPeriodSelectors(preferredPeriodId = null) {
    if (preferredPeriodId) {
      this.activePayrollPeriodId = preferredPeriodId;
    }
    const targetVal =
      this.activePayrollPeriodId || (this.payrollPeriods.length > 0 ? this.payrollPeriods[0].id : '');

    const dropdownSelectors = [
      'nov-nopers-emp-period-select',
      'nov-nopers-con-period-select',
      'novedades-period-select',
    ];
    dropdownSelectors.forEach((selId) => {
      const el = document.getElementById(selId);
      if (!el) return;
      if (this.payrollPeriods.length === 0) {
        updateSearchableSelect(el, '<option value="">No hay liquidaciones registradas</option>', '');
        return;
      }
      const selTarget = this.activePayrollPeriodId || el.value || targetVal;
      const optsHtml = this.payrollPeriods
        .map(
          (p) => `<option value="${p.id}" ${p.id === selTarget ? 'selected' : ''}>${String(p.month).padStart(2, '0')}/${p.year} - ${escapeHtml(p.settlementName)} (${p.status})</option>`
        )
        .join('');
      updateSearchableSelect(el, optsHtml, selTarget);
    });

    const hiddenSelectors = ['settlement-period-select', 'slips-period-select'];
    hiddenSelectors.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = targetVal || '';
    });

    this.renderPeriodContextBanners(targetVal);
  }

  renderPeriodContextBanners(periodId) {
    const p = (this.payrollPeriods || []).find((item) => item.id === periodId);
    const typeLabels = {
      MONTHLY: 'Mensual',
      QUINCE_1: '1ra Quincena',
      QUINCE_2: '2da Quincena',
      SAC_1: '1er SAC',
      SAC_2: '2do SAC',
      VACATIONS: 'Vacaciones',
      FINAL: 'Liquidación Final',
    };
    const statusLabels = {
      DRAFT: 'Borrador',
      CALCULATED: 'Calculada',
      CLOSED: 'Cerrada',
    };
    const statusClasses = {
      DRAFT: 'badge bg-secondary-lt',
      CALCULATED: 'badge bg-azure-lt',
      CLOSED: 'badge bg-success text-white',
    };

    ['settlement-period-context', 'slips-period-context'].forEach((prefix) => {
      const titleEl = document.getElementById(`${prefix}-title`);
      const subtitleEl = document.getElementById(`${prefix}-subtitle`);
      const badgeEl = document.getElementById(`${prefix}-badge`);
      const statusEl = document.getElementById(`${prefix}-status`);

      if (!p) {
        if (titleEl) titleEl.textContent = 'Sin liquidación seleccionada';
        if (subtitleEl) subtitleEl.textContent = 'Seleccione una liquidación desde Períodos y Liquidaciones';
        if (badgeEl) badgeEl.textContent = '-';
        if (statusEl) {
          statusEl.className = 'badge bg-secondary-lt';
          statusEl.textContent = '-';
        }
        return;
      }

      const monthStr = String(p.month).padStart(2, '0');
      const liqDateStr = p.liquidationDate
        ? ` • Fecha de Liquidación: ${new Date(String(p.liquidationDate).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR')}`
        : '';

      if (titleEl) {
        titleEl.textContent = `${monthStr}/${p.year} — ${p.settlementName || 'Liquidación'}`;
      }
      if (subtitleEl) {
        subtitleEl.textContent = `Liquidación #${p.settlementNumber || 1}${liqDateStr}`;
      }
      if (badgeEl) {
        badgeEl.textContent = typeLabels[p.periodType] || p.periodType;
      }
      if (statusEl) {
        statusEl.className = statusClasses[p.status] || 'badge bg-secondary-lt';
        statusEl.textContent = statusLabels[p.status] || p.status;
      }
    });
  }

  async loadActiveFiscalPeriod() {
    try {
      const res = await apiRequest('/payroll/fiscal-periods/active');
      const active = res.data;
      this.activeFiscalPeriod = active;

      const titleEl = document.getElementById('active-fiscal-period-title');
      const subtitleEl = document.getElementById('active-fiscal-period-subtitle');
      const countBadge = document.getElementById('payroll-active-settlements-badge');
      const closeFiscalBtn = document.getElementById('btn-close-fiscal-period');
      if (closeFiscalBtn) {
        closeFiscalBtn.classList.toggle('d-none', !active || !this.canClosePayrollPeriods());
      }

      const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
      ];

      if (active) {
        const monthName = monthNames[active.month - 1] || `Mes ${active.month}`;
        if (titleEl) titleEl.textContent = `${monthName} ${active.year}`;
        const settsCount = active.settlements?.length || 0;
        if (subtitleEl) {
          subtitleEl.innerHTML = `<i class="ti ti-info-circle me-1"></i> Período abierto para modificaciones y altas. <strong>${settsCount} liquidación(es)</strong> registradas.`;
        }
        if (countBadge) countBadge.textContent = `${settsCount} liquidación(es)`;
      } else {
        if (titleEl) titleEl.textContent = 'Sin período abierto';
        if (subtitleEl) {
          subtitleEl.innerHTML = `<span class="text-danger"><i class="ti ti-alert-triangle me-1"></i> No hay ningún período abierto. Haga clic en "+ Nuevo Período" para habilitar uno.</span>`;
        }
        if (countBadge) countBadge.textContent = '0 liquidaciones';
      }
    } catch (err) {
      console.warn('Error al cargar período fiscal activo:', err);
    }
  }

  openNewFiscalPeriodModal() {
    const form = document.getElementById('form-fiscal-period');
    form?.reset();
    const alertBox = document.getElementById('fiscal-period-form-alert');
    if (alertBox) alertBox.classList.add('d-none');

    if (this.activeFiscalPeriod) {
      const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
      ];
      const activeName = `${monthNames[this.activeFiscalPeriod.month - 1]} ${this.activeFiscalPeriod.year}`;
      if (alertBox) {
        alertBox.innerHTML = `
          <div class="d-flex align-items-start gap-2 text-start">
            <i class="ti ti-lock fs-3 flex-shrink-0 mt-1"></i>
            <div>
              <strong>Atención:</strong> Ya existe un período abierto (<strong>${activeName}</strong>). Solamente puede haber un período abierto a la vez. No podrá habilitar un nuevo período hasta que el actual sea cerrado.
            </div>
          </div>`;
        alertBox.classList.remove('d-none');
      }
      const submitBtn = document.getElementById('btn-save-fiscal-period');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.title = 'Ya existe un período abierto activo';
      }
    } else {
      const submitBtn = document.getElementById('btn-save-fiscal-period');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.title = '';
      }
    }

    getBootstrapModal(document.getElementById('modal-fiscal-period-form'))?.show();
  }

  async saveFiscalPeriod() {
    const submitBtn = document.getElementById('btn-save-fiscal-period');
    const alertBox = document.getElementById('fiscal-period-form-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const year = Number(document.getElementById('fiscal-period-input-year')?.value);
    const month = Number(document.getElementById('fiscal-period-input-month')?.value);
    const notes = document.getElementById('fiscal-period-input-notes')?.value?.trim() || null;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Habilitando...';

    try {
      await apiRequest('/payroll/fiscal-periods', {
        method: 'POST',
        body: JSON.stringify({ year, month, notes }),
      });

      showToast('Período fiscal habilitado exitosamente');
      getBootstrapModal(document.getElementById('modal-fiscal-period-form'))?.hide();
      await this.loadActiveFiscalPeriod();
      await this.loadPayrollPeriods();
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al habilitar el período fiscal';
        alertBox.classList.remove('d-none');
      }
      showToast(err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="ti ti-check me-1"></i> Habilitar Período';
    }
  }

  openNewPeriodModal() {
    const form = document.getElementById('form-payroll-period');
    form?.reset();
    document.getElementById('payroll-period-form-id').value = '';
    document.getElementById('modal-payroll-period-title').textContent = 'Nueva Liquidación de Sueldos';
    document.getElementById('payroll-period-form-alert')?.classList.add('d-none');

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    if (!this.activeFiscalPeriod) {
      showToast('No existe ningún período abierto para dar de alta liquidaciones. Debe habilitar un período primero.', 'warning');
      this.openNewFiscalPeriodModal();
      return;
    }

    const active = this.activeFiscalPeriod;
    const fiscalIdInput = document.getElementById('period-input-fiscal-id');
    if (fiscalIdInput) fiscalIdInput.value = active.id;

    const yearInput = document.getElementById('period-input-year');
    const monthInput = document.getElementById('period-input-month');
    if (yearInput) {
      yearInput.value = active.year;
      yearInput.readOnly = true;
    }
    if (monthInput) {
      monthInput.value = active.month;
      monthInput.disabled = true;
    }

    const fiscalLabel = document.getElementById('period-form-fiscal-label');
    if (fiscalLabel) fiscalLabel.textContent = `${monthNames[active.month - 1]} ${active.year}`;

    document.getElementById('period-input-type').value = 'MONTHLY';
    document.getElementById('period-input-payment-place').value = 'Casa Central';

    // Sugerir fecha de liquidación: última fecha del mes o de la quincena dentro del período abierto
    const updateDefaultLiquidationDate = () => {
      const type = document.getElementById('period-input-type')?.value || 'MONTHLY';
      let liqDate;
      if (type === 'QUINCE_1') {
        liqDate = new Date(active.year, active.month - 1, 15);
      } else {
        liqDate = new Date(active.year, active.month, 0); // Último día del mes
      }
      const yyyy = liqDate.getFullYear();
      const mm = String(liqDate.getMonth() + 1).padStart(2, '0');
      const dd = String(liqDate.getDate()).padStart(2, '0');
      const liqInput = document.getElementById('period-input-liquidation-date');
      if (liqInput) liqInput.value = `${yyyy}-${mm}-${dd}`;
    };

    updateDefaultLiquidationDate();

    const typeInput = document.getElementById('period-input-type');
    if (typeInput && !typeInput.dataset.liqBound) {
      typeInput.dataset.liqBound = 'true';
      typeInput.addEventListener('change', updateDefaultLiquidationDate);
    }

    // Sugerir fecha de pago: 4to día hábil del mes siguiente al del período activo
    const nextPayDate = new Date(active.year, active.month, 5);
    const yyyyPay = nextPayDate.getFullYear();
    const mmPay = String(nextPayDate.getMonth() + 1).padStart(2, '0');
    const ddPay = String(nextPayDate.getDate()).padStart(2, '0');
    document.getElementById('period-input-payment-date').value = `${yyyyPay}-${mmPay}-${ddPay}`;

    const rubricInput = document.getElementById('period-input-rubric-date');
    if (rubricInput) rubricInput.value = '';

    getBootstrapModal(document.getElementById('modal-payroll-period-form'))?.show();
  }

  async savePayrollPeriod() {
    const submitBtn = document.getElementById('btn-save-payroll-period');
    const alertBox = document.getElementById('payroll-period-form-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const fiscalPeriodId = document.getElementById('period-input-fiscal-id')?.value || this.activeFiscalPeriod?.id || null;
    const year = Number(document.getElementById('period-input-year').value) || this.activeFiscalPeriod?.year;
    const month = Number(document.getElementById('period-input-month').value) || this.activeFiscalPeriod?.month;

    const payload = {
      fiscalPeriodId,
      year,
      month,
      periodType: document.getElementById('period-input-type').value,
      settlementName: document.getElementById('period-input-name').value.trim() || undefined,
      liquidationDate: document.getElementById('period-input-liquidation-date')?.value || null,
      paymentDate: document.getElementById('period-input-payment-date').value || null,
      paymentPlace: document.getElementById('period-input-payment-place').value.trim() || null,
      depositDate: document.getElementById('period-input-deposit-date').value || null,
      depositBank: document.getElementById('period-input-deposit-bank').value.trim() || null,
      rubricDate: document.getElementById('period-input-rubric-date')?.value || null,
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Creando...';

    try {
      const res = await apiRequest('/payroll/periods', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const newPeriodId = res?.data?.id || res?.id;
      if (newPeriodId) {
        this.activePayrollPeriodId = newPeriodId;
      }

      showToast('Liquidación creada exitosamente');
      getBootstrapModal(document.getElementById('modal-payroll-period-form'))?.hide();
      await this.loadActiveFiscalPeriod();
      await this.loadPayrollPeriods();
      this.syncPayrollPeriodSelectors(this.activePayrollPeriodId);
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al crear la liquidación';
        alertBox.classList.remove('d-none');
      }
      showToast(err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="ti ti-check me-1"></i> Crear Liquidación';
    }
  }

  confirmClosePeriod(id, name) {
    this.openPayrollCloseModal({
      scope: 'PAYROLL_PERIOD',
      id,
      name,
    });
  }

  confirmDeletePeriod(id, name) {
    this.confirmDeleteAction({
      title: 'Eliminar Liquidación',
      message: `¿Estás seguro de que deseas eliminar la liquidación <strong>"${escapeHtml(name)}"</strong> y todos sus recibos asociados?`,
      onConfirm: async () => {
        await apiRequest(`/payroll/periods/${id}`, { method: 'DELETE' });
        showToast('Liquidación eliminada correctamente');
        await this.loadPayrollPeriods();
      },
    });
  }

  // --- Carga de Novedades Interactiva ---

  // =========================================================================
  // SISTEMA DE NOVEDADES (PERSISTENTES Y NO PERSISTENTES) Y LIQUIDACIÓN
  // =========================================================================


  async loadSettlementView() {
    const periodSelect = document.getElementById('settlement-period-select');
    const periodId = periodSelect?.value || this.activePayrollPeriodId;
    if (!periodId) {
      this.clearSettlementView();
      return;
    }
    if (periodSelect && periodSelect.value !== periodId) {
      periodSelect.value = periodId;
    }
    this.renderPeriodContextBanners(periodId);

    const isClosed = this.isPeriodClosed(periodId);
    const roAlert = document.getElementById('settlement-readonly-alert');
    if (roAlert) roAlert.classList.toggle('d-none', !isClosed);

    document.getElementById('btn-settlement-calc-single').disabled = isClosed;
    document.getElementById('btn-settlement-calc-batch').disabled = isClosed;
    document.getElementById('btn-settlement-calc-all').disabled = isClosed;

    // Asegurar que la sub-pestaña de liquidación individual esté activa y visible si ninguna está seleccionada
    const activeSubTab = document.querySelector('#pane-payroll-settlement .tab-content > .tab-pane.active');
    if (!activeSubTab) {
      document.querySelectorAll('#pane-payroll-settlement .nav-tabs .nav-link').forEach((l) => l.classList.remove('active'));
      document.querySelectorAll('#pane-payroll-settlement .tab-content > .tab-pane').forEach((p) => p.classList.remove('show', 'active'));
      document.querySelector('#pane-payroll-settlement a[href="#tab-settlement-single"]')?.classList.add('active');
      document.getElementById('tab-settlement-single')?.classList.add('show', 'active');
    } else if (!activeSubTab.classList.contains('show')) {
      activeSubTab.classList.add('show');
    }

    try {
      const [employees, slipsRes, deptsRes] = await Promise.all([
        this.fetchActiveEmployees(),
        apiRequest(`/payroll/periods/${periodId}/slips?limit=5000`),
        apiRequest('/departments?limit=500'),
      ]);

      let allSlips = slipsRes.data || [];
      if (slipsRes.meta && slipsRes.meta.totalPages > 1) {
        for (let p = 2; p <= slipsRes.meta.totalPages; p++) {
          const nextSlips = await apiRequest(`/payroll/periods/${periodId}/slips?limit=5000&page=${p}`);
          if (nextSlips.data) allSlips.push(...nextSlips.data);
        }
      }

      this.settlementEmployees = employees;
      this.settlementSlips = allSlips;
      const depts = deptsRes.data || [];

      // Actualizar Métricas Superiores
      const slipMap = new Map();
      let totalNet = 0;
      this.settlementSlips.forEach((s) => {
        slipMap.set(s.employeeId, s);
        totalNet += Number(s.netSalary) || 0;
      });

      const totalNomina = employees.length;
      let liquidatedCount = 0;
      employees.forEach((e) => {
        if (slipMap.has(e.id)) liquidatedCount++;
      });
      const pendingCount = Math.max(0, totalNomina - liquidatedCount);

      document.getElementById('settlement-stat-total').textContent = totalNomina;
      document.getElementById('settlement-stat-liquidated').textContent = liquidatedCount;
      document.getElementById('settlement-stat-pending').textContent = pendingCount;
      document.getElementById('settlement-stat-net').textContent = `$${formatNumber(totalNet)}`;

      // Pestaña 1: Selector Individual
      const singleSelect = document.getElementById('settlement-single-emp-select');
      if (singleSelect) {
        const curSingle = singleSelect.value;
        const singleOpts = '<option value="">Seleccionar colaborador...</option>' +
          employees.map((e) => `<option value="${e.id}" ${e.id === curSingle ? 'selected' : ''}>${escapeHtml(e.fileNumber)} - ${escapeHtml(e.lastName)}, ${escapeHtml(e.firstName)}</option>`).join('');

        updateSearchableSelect(singleSelect, singleOpts, curSingle);

        if (curSingle) {
          this.onSettlementSingleSelected(curSingle, slipMap.get(curSingle));
        } else {
          document.getElementById('settlement-single-emp-info')?.classList.add('d-none');
          document.getElementById('settlement-single-result')?.classList.add('d-none');
          document.getElementById('settlement-single-result-placeholder')?.classList.remove('d-none');
          document.getElementById('btn-settlement-calc-single').disabled = true;
        }
      }

      // Pestaña 2: Filtros y Tabla Lote
      const deptFilter = document.getElementById('settlement-batch-dept-filter');
      if (deptFilter) {
        const curDept = deptFilter.value;
        const deptOpts = '<option value="ALL">Todos los Sectores</option>' +
          depts.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
        updateSearchableSelect(deptFilter, deptOpts, curDept || 'ALL');
      }

      this.renderSettlementBatchTable(employees, slipMap);
    } catch (err) {
      showToast(err.message || 'Error al cargar módulo de liquidación', 'danger');
    }
  }

  clearSettlementView() {
    document.getElementById('settlement-stat-total').textContent = '0';
    document.getElementById('settlement-stat-liquidated').textContent = '0';
    document.getElementById('settlement-stat-pending').textContent = '0';
    document.getElementById('settlement-stat-net').textContent = '$0,00';
    document.getElementById('settlement-single-emp-info')?.classList.add('d-none');
    document.getElementById('settlement-single-result')?.classList.add('d-none');
    document.getElementById('settlement-single-result-placeholder')?.classList.remove('d-none');
    const tbody = document.getElementById('settlement-batch-table-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Seleccione una liquidación activa.</td></tr>';
  }

  onSettlementSingleSelected(employeeId, existingSlip = null) {
    const emp = this.settlementEmployees.find((e) => e.id === employeeId);
    if (!emp) return;

    document.getElementById('settlement-single-name').textContent = `${emp.lastName}, ${emp.firstName}`;
    document.getElementById('settlement-single-file').textContent = emp.fileNumber;
    document.getElementById('settlement-single-cuil').textContent = formatCuit(emp.cuil);
    document.getElementById('settlement-single-dept').textContent = emp.department?.name || 'Sin Sector';
    const basicVal = Number(emp.baseSalary) || 0;
    document.getElementById('settlement-single-basic').textContent = basicVal > 0 ? `$${formatNumber(basicVal)}` : 'Según CCT';
    document.getElementById('settlement-single-emp-info')?.classList.remove('d-none');

    const periodId = document.getElementById('settlement-period-select')?.value;
    const isClosed = this.isPeriodClosed(periodId);
    document.getElementById('btn-settlement-calc-single').disabled = isClosed;

    const slip = existingSlip || this.settlementSlips.find((s) => s.employeeId === employeeId);
    if (slip) {
      document.getElementById('settlement-single-result-placeholder')?.classList.add('d-none');
      document.getElementById('settlement-single-result')?.classList.remove('d-none');
      document.getElementById('res-single-rem').textContent = `$${formatNumber(slip.grossSalary)}`;
      document.getElementById('res-single-nonrem').textContent = `$${formatNumber(slip.nonRemunerativeSalary || 0)}`;
      document.getElementById('res-single-ded').textContent = `$${formatNumber(slip.deductionsTotal)}`;
      document.getElementById('res-single-net').textContent = `$${formatNumber(slip.netSalary)}`;
      document.getElementById('res-single-cost').textContent = `$${formatNumber(slip.totalLaborCost || 0)}`;

      const viewSlipBtn = document.getElementById('btn-settlement-single-view-slip');
      if (viewSlipBtn) {
        viewSlipBtn.onclick = () => this.openPayslipModal(slip.id);
      }
    } else {
      document.getElementById('settlement-single-result')?.classList.add('d-none');
      document.getElementById('settlement-single-result-placeholder')?.classList.remove('d-none');
      document.getElementById('settlement-single-result-placeholder').textContent = 'Colaborador pendiente de liquidar en este período. Presione el botón para liquidar.';
    }
  }

  async calculateSingleEmployee() {
    const periodId = document.getElementById('settlement-period-select')?.value;
    const empId = document.getElementById('settlement-single-emp-select')?.value;
    if (!periodId || !empId) {
      showToast('Seleccione un colaborador para liquidar', 'warning');
      return;
    }

    const btn = document.getElementById('btn-settlement-calc-single');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Calculando...';

    try {
      const res = await apiRequest(`/payroll/periods/${periodId}/calculate-single/${empId}`, {
        method: 'POST',
      });

      if (res.data.omittedEmployeesCount > 0) {
        this.showOmittedAlert(res.data.omittedEmployeesCount || 0, res.data.processedEmployees || 0, res.data.omittedEmployees || []);
        this.showOmittedEmployeesModal();
        showToast('El colaborador no originó ningún concepto en este período. No se generó liquidación vacía.', 'warning');
      } else {
        this.showOmittedAlert(0, res.data.processedEmployees || 0, []);
        showToast(`¡Liquidación completada para el colaborador! Neto: $${formatNumber(res.data.totalNet)}`);
      }
      await this.loadPayrollPeriods();
      await this.loadSettlementView();
      const singleSelect = document.getElementById('settlement-single-emp-select');
      if (singleSelect) singleSelect.value = empId;
      this.onSettlementSingleSelected(empId);
    } catch (err) {
      showToast(err.message || 'Error al liquidar colaborador', 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-calculator me-1"></i> Liquidar / Reliquidar Colaborador';
    }
  }

  renderSettlementBatchTable(employees, slipMap) {
    const tbody = document.getElementById('settlement-batch-table-body');
    if (!tbody) return;

    if (employees.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No hay colaboradores activos en la nómina.</td></tr>';
      return;
    }

    tbody.innerHTML = employees
      .map((emp) => {
        const slip = slipMap.get(emp.id);
        const isLiquidated = Boolean(slip);
        const netStr = isLiquidated ? `$${formatNumber(slip.netSalary)}` : '-';
        const deptId = emp.departmentId || '';

        return `
          <tr data-emp-id="${emp.id}" data-dept-id="${deptId}" data-status="${isLiquidated ? 'LIQUIDATED' : 'PENDING'}">
            <td class="text-center">
              <input type="checkbox" class="form-check-input settlement-batch-check" data-emp-id="${emp.id}" />
            </td>
            <td><strong class="font-monospace text-primary">${escapeHtml(emp.fileNumber)}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}</div>
            </td>
            <td>${formatCuit(emp.cuil)}</td>
            <td>${escapeHtml(emp.department?.name || 'Sin Sector')}</td>
            <td class="text-center">
              ${isLiquidated ? '<span class="badge bg-success-lt">Liquidado</span>' : '<span class="badge bg-warning-lt">Pendiente</span>'}
            </td>
            <td class="text-end font-monospace fw-bold">${netStr}</td>
          </tr>
        `;
      })
      .join('');

    this.updateSettlementBatchSelectedCount();

    // Checkbox listeners
    tbody.querySelectorAll('.settlement-batch-check').forEach((cb) => {
      cb.addEventListener('change', () => this.updateSettlementBatchSelectedCount());
    });
  }

  updateSettlementBatchSelectedCount() {
    const checked = document.querySelectorAll('.settlement-batch-check:checked');
    const countEl = document.getElementById('settlement-batch-selected-count');
    if (countEl) countEl.textContent = checked.length;

    const periodId = document.getElementById('settlement-period-select')?.value;
    const isClosed = this.isPeriodClosed(periodId);
    const calcBatchBtn = document.getElementById('btn-settlement-calc-batch');
    if (calcBatchBtn) calcBatchBtn.disabled = isClosed || checked.length === 0;
  }

  filterSettlementBatchTable() {
    const deptVal = document.getElementById('settlement-batch-dept-filter')?.value || 'ALL';
    const statusVal = document.getElementById('settlement-batch-status-filter')?.value || 'ALL';
    const searchVal = document.getElementById('settlement-batch-search')?.value.trim().toLowerCase() || '';

    const rows = document.querySelectorAll('#settlement-batch-table-body tr[data-emp-id]');
    rows.forEach((row) => {
      const rowDept = row.dataset.deptId;
      const rowStatus = row.dataset.status;
      const rowText = row.textContent.toLowerCase();

      const matchDept = deptVal === 'ALL' || rowDept === deptVal;
      const matchStatus = statusVal === 'ALL' || rowStatus === statusVal;
      const matchSearch = !searchVal || rowText.includes(searchVal);

      row.style.display = matchDept && matchStatus && matchSearch ? '' : 'none';
    });
  }

  async calculateBatchEmployees() {
    const periodId = document.getElementById('settlement-period-select')?.value;
    const checked = document.querySelectorAll('.settlement-batch-check:checked');
    const employeeIds = Array.from(checked).map((cb) => cb.dataset.empId);

    if (!periodId || employeeIds.length === 0) {
      showToast('Seleccione al menos un colaborador para liquidar en lote', 'warning');
      return;
    }

    const btn = document.getElementById('btn-settlement-calc-batch');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Liquidando lote...';

    try {
      const res = await apiRequest(`/payroll/periods/${periodId}/calculate-batch`, {
        method: 'POST',
        body: JSON.stringify({ employeeIds }),
      });

      this.showOmittedAlert(res.data.omittedEmployeesCount || 0, res.data.processedEmployees || 0, res.data.omittedEmployees || []);
      if (res.data.omittedEmployeesCount > 0) {
        this.showOmittedEmployeesModal();
        showToast(
          `Liquidación en lote: ${res.data.processedEmployees} recibo(s) generados. Se omitieron ${res.data.omittedEmployeesCount} legajo(s) por no registrar conceptos a liquidar.`,
          'info'
        );
      } else {
        showToast(`¡Liquidación en lote completada para ${res.data.processedEmployees} empleado(s)! Total Neto: $${formatNumber(res.data.totalNet)}`);
      }
      await this.loadPayrollPeriods();
      await this.loadSettlementView();
    } catch (err) {
      showToast(err.message || 'Error al liquidar lote de empleados', 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-calculator me-1"></i> Liquidar Selección';
    }
  }

  confirmGeneralSettlement(period) {
    return new Promise((resolve) => {
      const modalEl = document.getElementById('modal-confirm-general-settlement');
      if (!modalEl) {
        resolve(confirm(`¿Iniciar Liquidación General de toda la nómina para "${period?.settlementName || ''}"? Este proceso calculará o actualizará los recibos de todos los empleados activos.`));
        return;
      }

      const periodNameEl = document.getElementById('modal-confirm-settlement-period-name');
      if (periodNameEl) {
        periodNameEl.textContent = `Liquidación: "${period?.settlementName || 'Período seleccionado'}"`;
      }

      const confirmBtn = document.getElementById('btn-confirm-general-settlement-action');
      const bsModal = getBootstrapModal(modalEl);

      let resolved = false;

      const handleConfirm = () => {
        resolved = true;
        bsModal?.hide();
        resolve(true);
      };

      const handleHidden = () => {
        modalEl.removeEventListener('hidden.bs.modal', handleHidden);
        confirmBtn?.removeEventListener('click', handleConfirm);
        if (!resolved) resolve(false);
      };

      confirmBtn?.addEventListener('click', handleConfirm, { once: true });
      modalEl.addEventListener('hidden.bs.modal', handleHidden, { once: true });

      bsModal?.show();
    });
  }

  async calculateAllEmployees() {
    const periodId = document.getElementById('settlement-period-select')?.value;
    if (!periodId) {
      showToast('Seleccione una liquidación para procesar', 'warning');
      return;
    }

    const period = this.payrollPeriods.find((p) => p.id === periodId);
    const confirmed = await this.confirmGeneralSettlement(period);
    if (!confirmed) {
      return;
    }

    const btn = document.getElementById('btn-settlement-calc-all');
    const progressBar = document.getElementById('settlement-all-progress');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Procesando Nómina Completa...';
    progressBar?.classList.remove('d-none');

    try {
      const res = await apiRequest(`/payroll/periods/${periodId}/calculate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      this.showOmittedAlert(res.data.omittedEmployeesCount || 0, res.data.processedEmployees || 0, res.data.omittedEmployees || []);
      if (res.data.omittedEmployeesCount > 0) {
        this.showOmittedEmployeesModal();
        showToast(
          `Liquidación completada: ${res.data.processedEmployees} recibo(s) generados. Se omitieron ${res.data.omittedEmployeesCount} legajo(s) por no registrar conceptos a liquidar en este período.`,
          'info'
        );
      } else {
        showToast(`¡Liquidación general exitosa! ${res.data.processedEmployees} colaboradores procesados. Total Neto: $${formatNumber(res.data.totalNet)}`);
      }
      await this.loadSettlementView();
      await this.loadPayrollPeriods();
    } catch (err) {
      showToast(err.message || 'Error al ejecutar liquidación general', 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-calculator me-2"></i> Iniciar Liquidación General';
      progressBar?.classList.add('d-none');
    }
  }

  async printBatchSlips() {
    const periodId = document.getElementById('slips-period-select')?.value;
    if (!periodId) {
      showToast('Seleccione una liquidación para imprimir', 'warning');
      return;
    }

    const deptFilter = document.getElementById('slips-department-filter')?.value;
    const searchVal = document.getElementById('slips-search-input')?.value;

    const btn = document.getElementById('btn-export-slips-batch');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Preparando lote...';
    }

    const printContainer = document.getElementById('batch-payslip-print-container');

    try {
      const params = new URLSearchParams();
      if (deptFilter && deptFilter !== 'ALL') params.append('departmentId', deptFilter);
      if (searchVal && String(searchVal).trim()) params.append('search', searchVal.trim());

      const res = await apiRequest(`/payroll/periods/${periodId}/slips-batch-print?${params.toString()}`);
      const { company, period, slips } = res.data || {};

      if (!slips || slips.length === 0) {
        showToast('No hay recibos disponibles para imprimir con los filtros seleccionados', 'warning');
        return;
      }

      if (printContainer) {
        printContainer.innerHTML = slips.map((slip) => `
          <div class="payslip-sheet-print">
            ${this.generatePayslipHtml({ slip, company, period })}
          </div>
        `).join('');
      }

      document.body.classList.add('batch-printing');

      setTimeout(() => {
        window.print();
        setTimeout(() => {
          document.body.classList.remove('batch-printing');
          if (printContainer) printContainer.innerHTML = '';
        }, 500);
      }, 250);

    } catch (err) {
      showToast(err.message || 'Error al preparar la impresión del lote de recibos', 'danger');
      document.body.classList.remove('batch-printing');
      if (printContainer) printContainer.innerHTML = '';
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  }

  // -------------------------------------------------------------------------
  // LISTENERS Y CONEXIÓN DE EVENTOS DE NOVEDADES & LIQUIDACIÓN
  // -------------------------------------------------------------------------

  setupNoveltyPersistentHandlers() {
    // 1. Conceptos por Empleado
    const empSelect = document.getElementById('nov-pers-emp-select');
    if (empSelect) {
      empSelect.addEventListener('change', () => this.onNovPersEmpSelected(empSelect.value));
    }
    const btnAddEmp = document.getElementById('btn-nov-pers-emp-add');
    if (btnAddEmp) {
      btnAddEmp.addEventListener('click', () => {
        if (this.novPersEmpSelectedEmp) {
          this.openPersistentConceptModal({ employee: this.novPersEmpSelectedEmp });
        }
      });
    }

    // 2. Empleados por Concepto
    const conSelect = document.getElementById('nov-pers-con-select');
    if (conSelect) {
      conSelect.addEventListener('change', () => this.onNovPersConSelected(conSelect.value));
    }
    const btnAddCon = document.getElementById('btn-nov-pers-con-add');
    if (btnAddCon) {
      btnAddCon.addEventListener('click', () => {
        if (this.novPersConSelectedConcept) {
          this.openPersistentConceptModal({ concept: this.novPersConSelectedConcept });
        }
      });
    }

    // Botones Excel y CCT para Concepto Persistente
    const btnExcelCon = document.getElementById('btn-nov-pers-con-excel');
    if (btnExcelCon) {
      btnExcelCon.addEventListener('click', () => this.openPersConceptExcelModal());
    }
    const btnCctCon = document.getElementById('btn-nov-pers-con-cct');
    if (btnCctCon) {
      btnCctCon.addEventListener('click', () => this.openPersConceptCctModal());
    }

    // Modal Excel: Descarga de plantilla y subida de archivo
    const btnDownloadTemplate = document.getElementById('btn-pers-excel-download-template');
    if (btnDownloadTemplate) {
      btnDownloadTemplate.addEventListener('click', () => this.downloadPersConceptExcelTemplate());
    }
    const fileExcelInput = document.getElementById('pers-concept-excel-file');
    if (fileExcelInput) {
      fileExcelInput.addEventListener('change', (e) => this.handlePersConceptExcelFileSelect(e));
    }
    const btnSubmitExcel = document.getElementById('btn-pers-excel-submit');
    if (btnSubmitExcel) {
      btnSubmitExcel.addEventListener('click', () => this.submitPersConceptExcel());
    }

    // Modal CCT: Cambio en select y submit
    const cctSelect = document.getElementById('pers-cct-select');
    if (cctSelect) {
      cctSelect.addEventListener('change', () => {
        const selectedOpt = cctSelect.options[cctSelect.selectedIndex];
        const count = selectedOpt ? selectedOpt.dataset.count || 0 : 0;
        const countBadge = document.getElementById('pers-cct-count-badge');
        if (countBadge) countBadge.textContent = `${count} colaborador(es) alcanzado(s)`;
      });
    }
    const formCct = document.getElementById('form-assign-pers-concept-cct');
    if (formCct) {
      formCct.addEventListener('submit', (e) => this.submitPersConceptCct(e));
    }

    // Concept select change inside modal
    const modalConSelect = document.getElementById('pers-concept-select');
    if (modalConSelect) {
      modalConSelect.addEventListener('change', async () => {
        const concepts = await this.fetchIndividualConcepts(true);
        const c = concepts.find((x) => x.id === modalConSelect.value);
        if (c) {
          this.updatePersistentConceptModalHint(c);
        } else {
          document.getElementById('pers-concept-hint')?.classList.add('d-none');
          renderDynamicNoveltyControl('pers-concept-dynamic-container', null, {});
        }
      });
    }

    // Guardar asignación persistente
    const formPers = document.getElementById('form-assign-persistent-concept');
    if (formPers) {
      formPers.addEventListener('submit', async (e) => {
        e.preventDefault();
        const alertBox = document.getElementById('pers-concept-alert');
        if (alertBox) alertBox.classList.add('d-none');

        const empId = document.getElementById('pers-concept-employee-static').dataset.empId || document.getElementById('pers-concept-employee-select').value;
        const conId = document.getElementById('pers-concept-static').dataset.conceptId || document.getElementById('pers-concept-select').value;
        const validFrom = document.getElementById('pers-concept-valid-from').value || null;
        const validTo = document.getElementById('pers-concept-valid-to').value || null;
        const notes = document.getElementById('pers-concept-notes').value.trim() || null;
        const isActive = document.getElementById('pers-concept-is-active').checked;

        if (!empId || !conId) {
          if (alertBox) {
            alertBox.textContent = 'Debe seleccionar un colaborador y un concepto.';
            alertBox.classList.remove('d-none');
          }
          return;
        }

        const valResult = getDynamicNoveltyControlValue('pers-concept-dynamic-container');
        if (valResult.error) {
          if (alertBox) {
            alertBox.textContent = valResult.error;
            alertBox.classList.remove('d-none');
          }
          return;
        }

        const saveBtn = document.getElementById('btn-save-persistent-concept');
        if (saveBtn) saveBtn.disabled = true;

        try {
          await apiRequest(`/employees/${empId}/concepts`, {
            method: 'POST',
            body: JSON.stringify({
              conceptId: conId,
              units: valResult.inputType === 'AMOUNT' ? null : valResult.units,
              fixedAmount: valResult.inputType === 'AMOUNT' ? valResult.fixedAmount : null,
              validFrom,
              validTo,
              notes,
              isActive,
            }),
          });

          showToast('Concepto persistente asignado con éxito');
          getBootstrapModal(document.getElementById('modal-assign-persistent-concept'))?.hide();

          // Refrescar según pantalla activa
          if (document.getElementById('pane-nov-pers-emp')?.classList.contains('active')) {
            await this.onNovPersEmpSelected(empId);
          } else if (document.getElementById('pane-nov-pers-con')?.classList.contains('active')) {
            await this.onNovPersConSelected(conId);
          }
        } catch (err) {
          if (alertBox) {
            alertBox.textContent = err.message || 'Error al guardar asignación';
            alertBox.classList.remove('d-none');
          }
        } finally {
          if (saveBtn) saveBtn.disabled = false;
        }
      });
    }
  }

  setupNoveltyNoPersistentHandlers() {
    // 1. Conceptos por Empleado
    const perSelectEmp = document.getElementById('nov-nopers-emp-period-select');
    const empSelect = document.getElementById('nov-nopers-emp-select');
    if (perSelectEmp) {
      perSelectEmp.addEventListener('change', () => {
        this.activePayrollPeriodId = perSelectEmp.value;
        this.refreshNovNoPersEmpTable(perSelectEmp.value, empSelect?.value);
      });
    }
    if (empSelect) {
      empSelect.addEventListener('change', () => this.refreshNovNoPersEmpTable(perSelectEmp?.value, empSelect.value));
    }
    const btnAddEmp = document.getElementById('btn-nov-nopers-emp-add');
    if (btnAddEmp) {
      btnAddEmp.addEventListener('click', () => {
        this.openPeriodNoveltyModal({
          employeeId: empSelect?.value,
          periodId: perSelectEmp?.value || this.activePayrollPeriodId,
        });
      });
    }

    // 2. Empleados por Concepto
    const perSelectCon = document.getElementById('nov-nopers-con-period-select');
    const conSelect = document.getElementById('nov-nopers-con-select');
    if (perSelectCon) {
      perSelectCon.addEventListener('change', async () => {
        this.activePayrollPeriodId = perSelectCon.value;
        await this.loadNovNoPersCon();
      });
    }
    if (conSelect) {
      conSelect.addEventListener('change', () => this.refreshNovNoPersConTable(perSelectCon?.value, conSelect.value));
    }
    const btnAddCon = document.getElementById('btn-nov-nopers-con-add');
    if (btnAddCon) {
      btnAddCon.addEventListener('click', () => {
        this.openPeriodNoveltyModal({
          conceptId: conSelect?.value,
          periodId: perSelectCon?.value || this.activePayrollPeriodId,
        });
      });
    }

    // Concept select change inside modal
    const modalConSelect = document.getElementById('period-novelty-concept-select');
    if (modalConSelect) {
      modalConSelect.addEventListener('change', async () => {
        const periodId = document.getElementById('period-novelty-period-id')?.value;
        const periodObj = (this.payrollPeriods || []).find((p) => p.id === periodId);
        const concepts = await this.fetchIndividualConcepts(false, periodObj?.periodType);
        const c = concepts.find((x) => x.id === modalConSelect.value);
        if (c) {
          this.updatePeriodNoveltyModalHint(c);
        } else {
          document.getElementById('period-novelty-concept-hint')?.classList.add('d-none');
          renderDynamicNoveltyControl('period-novelty-dynamic-container', null, {});
        }
      });
    }

    // Formulario de novedad submit
    const formNovelty = document.getElementById('form-period-novelty');
    if (formNovelty) {
      formNovelty.addEventListener('submit', async (e) => {
        e.preventDefault();
        const alertBox = document.getElementById('period-novelty-alert');
        if (alertBox) alertBox.classList.add('d-none');

        const periodId = document.getElementById('period-novelty-period-id').value;
        const empId = document.getElementById('period-novelty-employee-static').dataset.empId || document.getElementById('period-novelty-employee-select').value;
        const conId = document.getElementById('period-novelty-concept-static').dataset.conceptId || document.getElementById('period-novelty-concept-select').value;
        const notes = document.getElementById('period-novelty-notes').value.trim() || null;

        if (!periodId || !empId || !conId) {
          if (alertBox) {
            alertBox.textContent = 'Debe indicar período, colaborador y concepto.';
            alertBox.classList.remove('d-none');
          }
          return;
        }

        const valResult = getDynamicNoveltyControlValue('period-novelty-dynamic-container');
        if (valResult.error) {
          if (alertBox) {
            alertBox.textContent = valResult.error;
            alertBox.classList.remove('d-none');
          }
          return;
        }

        const saveBtn = document.getElementById('btn-save-period-novelty');
        if (saveBtn) saveBtn.disabled = true;

        try {
          await apiRequest(`/payroll/periods/${periodId}/novelties`, {
            method: 'POST',
            body: JSON.stringify({
              employeeId: empId,
              conceptId: conId,
              units: valResult.inputType === 'AMOUNT' ? 1 : valResult.units,
              amount: valResult.inputType === 'AMOUNT' ? valResult.amount : null,
              notes,
            }),
          });

          showToast('Novedad registrada exitosamente');
          getBootstrapModal(document.getElementById('modal-period-novelty-form'))?.hide();

          if (document.getElementById('pane-nov-nopers-emp')?.classList.contains('active')) {
            await this.refreshNovNoPersEmpTable(periodId, empId);
          } else if (document.getElementById('pane-nov-nopers-con')?.classList.contains('active')) {
            await this.refreshNovNoPersConTable(periodId, conId);
          }
        } catch (err) {
          if (alertBox) {
            alertBox.textContent = err.message || 'Error al guardar novedad';
            alertBox.classList.remove('d-none');
          }
        } finally {
          if (saveBtn) saveBtn.disabled = false;
        }
      });
    }
  }

  setupBatchSheetHandlers() {
    const btnOpen = document.getElementById('btn-nov-nopers-con-batch-sheet');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => this.openBatchSheetModal());
    }

    const btnClear = document.getElementById('btn-batch-sheet-clear-zeros');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        document.querySelectorAll('.batch-sheet-val').forEach((inp) => {
          if (Number(inp.value) === 0) inp.value = '';
        });
        this.updateBatchSheetStats();
      });
    }

    const filterInput = document.getElementById('batch-sheet-filter-input');
    if (filterInput) {
      filterInput.addEventListener('input', () => {
        const q = filterInput.value.trim().toLowerCase();
        document.querySelectorAll('#batch-sheet-tbody tr').forEach((row) => {
          const t = row.textContent.toLowerCase();
          row.style.display = !q || t.includes(q) ? '' : 'none';
        });
      });
    }

    const btnSave = document.getElementById('btn-save-batch-sheet');
    if (btnSave) {
      btnSave.addEventListener('click', () => this.saveBatchSheet());
    }
  }

  setupExcelImportHandlers() {
    const btnOpen = document.getElementById('btn-nov-nopers-con-import-excel');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => this.openExcelImportModal());
    }

    const btnDownload = document.getElementById('btn-download-novelty-template');
    if (btnDownload) {
      btnDownload.addEventListener('click', () => this.downloadNoveltyTemplateCsv());
    }

    const fileInput = document.getElementById('novelties-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.handleNoveltiesFileSelect(e));
    }

    const btnConfirm = document.getElementById('btn-confirm-import-novelties');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => this.confirmImportNovelties());
    }
  }

  setupSimulatePayslipHandlers() {
    const btnSimulate = document.getElementById('btn-nov-nopers-emp-simulate');
    if (btnSimulate) {
      btnSimulate.addEventListener('click', () => {
        const periodId = document.getElementById('nov-nopers-emp-period-select')?.value;
        const empId = document.getElementById('nov-nopers-emp-select')?.value;
        this.openSimulatePayslipModal(empId, periodId);
      });
    }

    const btnGoSettle = document.getElementById('btn-sim-go-settle');
    if (btnGoSettle) {
      btnGoSettle.addEventListener('click', () => {
        getBootstrapModal(document.getElementById('modal-simulate-payslip'))?.hide();
        const periodId = document.getElementById('nov-nopers-emp-period-select')?.value;
        const empId = document.getElementById('nov-nopers-emp-select')?.value;
        if (periodId) {
          this.activePayrollPeriodId = periodId;
          this.syncPayrollPeriodSelectors(periodId);
        }
        this.switchPayrollPane('#pane-payroll-settlement');
        this.loadSettlementView().then(() => {
          const singleSelect = document.getElementById('settlement-single-emp-select');
          if (singleSelect && empId) {
            singleSelect.value = empId;
            this.onSettlementSingleSelected(empId);
          }
        });
      });
    }
  }

  setupSettlementHandlers() {
    // Modalidad 1: Individual
    const singleSelect = document.getElementById('settlement-single-emp-select');
    if (singleSelect) {
      singleSelect.addEventListener('change', () => this.onSettlementSingleSelected(singleSelect.value));
    }
    const btnCalcSingle = document.getElementById('btn-settlement-calc-single');
    if (btnCalcSingle) {
      btnCalcSingle.addEventListener('click', () => this.calculateSingleEmployee());
    }

    // Modalidad 2: Lote Checkboxes & Filtros
    const deptFilter = document.getElementById('settlement-batch-dept-filter');
    const statusFilter = document.getElementById('settlement-batch-status-filter');
    const searchInput = document.getElementById('settlement-batch-search');
    if (deptFilter) deptFilter.addEventListener('change', () => this.filterSettlementBatchTable());
    if (statusFilter) statusFilter.addEventListener('change', () => this.filterSettlementBatchTable());
    if (searchInput) searchInput.addEventListener('input', () => this.filterSettlementBatchTable());

    const masterCheck = document.getElementById('settlement-batch-master-check');
    if (masterCheck) {
      masterCheck.addEventListener('change', () => {
        const visibleChecks = document.querySelectorAll('#settlement-batch-table-body tr:not([style*="display: none"]) .settlement-batch-check');
        visibleChecks.forEach((cb) => (cb.checked = masterCheck.checked));
        this.updateSettlementBatchSelectedCount();
      });
    }

    const btnSelectAll = document.getElementById('btn-settlement-batch-select-all');
    if (btnSelectAll) {
      btnSelectAll.addEventListener('click', () => {
        document.querySelectorAll('#settlement-batch-table-body tr:not([style*="display: none"]) .settlement-batch-check').forEach((cb) => (cb.checked = true));
        this.updateSettlementBatchSelectedCount();
      });
    }

    const btnDeselectAll = document.getElementById('btn-settlement-batch-deselect-all');
    if (btnDeselectAll) {
      btnDeselectAll.addEventListener('click', () => {
        document.querySelectorAll('.settlement-batch-check').forEach((cb) => (cb.checked = false));
        if (masterCheck) masterCheck.checked = false;
        this.updateSettlementBatchSelectedCount();
      });
    }

    const btnCalcBatch = document.getElementById('btn-settlement-calc-batch');
    if (btnCalcBatch) {
      btnCalcBatch.addEventListener('click', () => this.calculateBatchEmployees());
    }

    // Modalidad 3: General
    const btnCalcAll = document.getElementById('btn-settlement-calc-all');
    if (btnCalcAll) {
      btnCalcAll.addEventListener('click', () => this.calculateAllEmployees());
    }

    // Botón para ver nómina de omitidos
    const btnViewOmitted = document.getElementById('btn-view-omitted-employees');
    if (btnViewOmitted) {
      btnViewOmitted.addEventListener('click', () => this.showOmittedEmployeesModal());
    }
  }

  showOmittedAlert(omittedCount, processedCount, omittedEmployees = []) {
    this.lastOmittedEmployees = omittedEmployees || [];
    const alertEl = document.getElementById('settlement-omitted-alert');
    const textEl = document.getElementById('settlement-omitted-alert-text');
    const badgeEl = document.getElementById('settlement-omitted-badge-count');
    if (!alertEl || !textEl || !badgeEl) return;

    if (omittedCount > 0) {
      badgeEl.textContent = String(omittedCount);
      textEl.innerHTML = `Se generaron los recibos de <strong>${processedCount}</strong> colaboradores. Se omitieron <strong>${omittedCount}</strong> colaboradores que no registraron conceptos a liquidar en este período.`;
      alertEl.classList.remove('d-none');
    } else {
      alertEl.classList.add('d-none');
    }
  }

  showOmittedEmployeesModal() {
    const tbody = document.getElementById('omitted-employees-table-body');
    if (!tbody) return;

    if (!this.lastOmittedEmployees || this.lastOmittedEmployees.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3 text-muted">No se registran colaboradores omitidos.</td></tr>';
    } else {
      tbody.innerHTML = this.lastOmittedEmployees.map((o) => `
        <tr>
          <td><strong class="font-monospace text-primary">${escapeHtml(o.fileNumber || '-')}</strong></td>
          <td><span class="fw-bold text-dark">${escapeHtml(o.fullName || o.name || '-')}</span></td>
          <td><span class="badge bg-secondary-lt text-secondary">${escapeHtml(o.department || '-')}</span></td>
          <td class="text-end text-muted small">${escapeHtml(o.reason || 'Sin conceptos liquidados')}</td>
        </tr>
      `).join('');
    }

    getBootstrapModal(document.getElementById('modal-omitted-employees'))?.show();
  }

  // --- Recibos de Sueldo ---


  async loadPayrollConcepts() {
    const spinner = document.getElementById('concepts-spinner');
    if (spinner) spinner.classList.remove('d-none');

    const searchInput = document.getElementById('concepts-search-input');
    const typeFilter = document.getElementById('concepts-type-filter');
    const periodTypeFilter = document.getElementById('concepts-period-type-filter');
    const persistentFilter = document.getElementById('concepts-persistent-filter');

    const query = new URLSearchParams({
      page: String(this.payrollConceptsPage),
      limit: String(this.payrollConceptsPageSize),
    });
    if (searchInput?.value?.trim()) query.append('search', searchInput.value.trim());
    if (typeFilter?.value && typeFilter.value !== 'ALL') query.append('type', typeFilter.value);
    if (periodTypeFilter?.value && periodTypeFilter.value !== 'ALL') query.append('periodType', periodTypeFilter.value);
    if (persistentFilter?.value && persistentFilter.value !== 'ALL') query.append('isPersistent', persistentFilter.value);

    try {
      const [res] = await Promise.all([
        apiRequest(`/payroll/concepts?${query.toString()}`),
        this.fetchAllPayrollConcepts(),
      ]);
      this.payrollConcepts = res.data || [];
      const badge = document.getElementById('payroll-badge-concepts-count');
      if (badge) badge.textContent = res.meta?.total || this.payrollConcepts.length;

      this.renderPayrollConceptsTable(this.payrollConcepts);
      this.renderPayrollConceptsPagination(res.meta || { total: this.payrollConcepts.length, page: 1, totalPages: 1 });
    } catch (err) {
      showToast(err.message || 'Error al cargar conceptos', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  // ==========================================================================
  // INFORME RESUMEN DE LIQUIDACIÓN (TOTALES POR CONCEPTO Y CONTROL CONTABLE)
  // ==========================================================================

  async openPeriodSummaryModal(periodId) {
    const modalEl = document.getElementById('modal-payroll-period-summary');
    const tableBody = document.getElementById('period-summary-table-body');
    if (!modalEl) return;

    if (tableBody) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Cargando resumen de liquidación...</td></tr>';
    }

    const modal = window.bootstrap?.Modal ? window.bootstrap.Modal.getOrCreateInstance(modalEl) : null;
    if (modal) modal.show();

    try {
      const res = await apiRequest(`/payroll/periods/${periodId}/summary`);
      const summaryData = res.data || res;
      this.activePeriodSummaryData = summaryData;

      const { period, totals, concepts } = summaryData;

      // Actualizar cabecera
      const titleEl = document.getElementById('modal-period-summary-title');
      if (titleEl) {
        titleEl.textContent = `Resumen: ${period.settlementName || 'Liquidación'}`;
      }
      const subtitleEl = document.getElementById('modal-period-summary-subtitle');
      if (subtitleEl) {
        const typeLabels = {
          MONTHLY: 'Mensual Normal',
          FIRST_FORTNIGHT: '1ra Quincena',
          SECOND_FORTNIGHT: '2da Quincena',
          SAC: 'S.A.C. (Aguinaldo)',
          VACATIONS: 'Vacaciones Adelantadas',
          FINAL: 'Liquidación Final',
          SPECIAL: 'Liquidación Especial / Ajuste',
        };
        const pType = typeLabels[period.periodType] || period.periodType;
        const pDate = period.liquidationDate ? ` • F. Liq: ${new Date(String(period.liquidationDate).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR')}` : '';
        subtitleEl.textContent = `Período ${period.month}/${period.year} • Liq. #${period.settlementNumber || 1} • Tipo: ${pType}${pDate}`;
      }

      // Tarjetas de totales
      const remEl = document.getElementById('summary-total-remunerative');
      if (remEl) remEl.textContent = `$ ${formatNumber(totals.totalRemunerative)}`;

      const nremEl = document.getElementById('summary-total-non-remunerative');
      if (nremEl) nremEl.textContent = `$ ${formatNumber(totals.totalNonRemunerative)}`;

      const dedEl = document.getElementById('summary-total-deductions');
      if (dedEl) dedEl.textContent = `$ ${formatNumber(totals.totalDeductions)}`;

      const netEl = document.getElementById('summary-total-net');
      if (netEl) netEl.textContent = `$ ${formatNumber(totals.totalNet)}`;

      // Filas de la tabla
      if (tableBody) {
        if (!concepts || concepts.length === 0) {
          tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No se registran conceptos liquidados en esta liquidación.</td></tr>';
        } else {
          tableBody.innerHTML = concepts
            .map((c) => {
              let badgeClass = 'bg-secondary-lt';
              let typeLabel = 'Desconocido';
              if (c.type === 'REMUNERATIVE') {
                badgeClass = 'bg-primary-lt text-primary';
                typeLabel = 'REM';
              } else if (c.type === 'NON_REMUNERATIVE') {
                badgeClass = 'bg-teal-lt text-teal';
                typeLabel = 'NO REM';
              } else if (c.type === 'DEDUCTION' || c.type === 'DISCOUNT') {
                badgeClass = 'bg-danger-lt text-danger';
                typeLabel = 'DED';
              }

              const code = c.conceptCode || c.code || '';
              const name = c.conceptName || c.name || '';
              const remVal = Number(c.remunerativeTotal ?? c.remunerativeAmount ?? 0);
              const nremVal = Number(c.nonRemunerativeTotal ?? c.nonRemunerativeAmount ?? 0);
              const dedVal = Number(c.deductionsTotal ?? c.deductionAmount ?? 0);

              const remStr = remVal > 0 ? `$ ${formatNumber(remVal)}` : '-';
              const nremStr = nremVal > 0 ? `$ ${formatNumber(nremVal)}` : '-';
              const dedStr = dedVal > 0 ? `$ ${formatNumber(dedVal)}` : '-';

              return `
                <tr>
                  <td>
                    <span class="badge ${badgeClass} font-monospace me-1">${typeLabel}</span>
                    <span class="font-monospace fw-bold">${escapeHtml(code)}</span>
                  </td>
                  <td>
                    <div class="text-truncate fw-medium" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
                  </td>
                  <td class="text-center font-monospace">
                    <span class="badge bg-light text-dark fw-bold">${c.casesCount || 0}</span>
                  </td>
                  <td class="text-end font-monospace text-nowrap">${remStr}</td>
                  <td class="text-end font-monospace text-nowrap">${nremStr}</td>
                  <td class="text-end font-monospace text-danger text-nowrap">${dedStr}</td>
                </tr>
              `;
            })
            .join('');
        }
      }

      // Totales en pie de tabla
      const footCases = document.getElementById('summary-foot-cases');
      if (footCases) footCases.textContent = `${totals.totalEmployeesCount || period.totalEmployees || '-'}`;

      const footRem = document.getElementById('summary-foot-rem');
      if (footRem) footRem.textContent = `$ ${formatNumber(totals.totalRemunerative)}`;

      const footNrem = document.getElementById('summary-foot-nrem');
      if (footNrem) footNrem.textContent = `$ ${formatNumber(totals.totalNonRemunerative)}`;

      const footDed = document.getElementById('summary-foot-ded');
      if (footDed) footDed.textContent = `$ ${formatNumber(totals.totalDeductions)}`;

      const footInfo = document.getElementById('modal-period-summary-footinfo');
      if (footInfo) {
        footInfo.innerHTML = `<i class="ti ti-check text-success me-1"></i> Total Bruto: <strong>$ ${formatNumber(totals.totalGross)}</strong> • Neto Total a Pagar: <strong>$ ${formatNumber(totals.totalNet)}</strong> • ${concepts.length} conceptos agrupados por naturaleza`;
      }
    } catch (err) {
      console.error('Error al cargar resumen de liquidación:', err);
      showToast(err.message || 'Error al obtener el resumen de liquidación', 'danger');
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">Error: ${escapeHtml(err.message || 'No se pudo cargar el resumen')}</td></tr>`;
      }
    }
  }

  exportPeriodSummaryExcel() {
    if (!this.activePeriodSummaryData || !this.activePeriodSummaryData.period) {
      showToast('No hay datos cargados de resumen para exportar', 'warning');
      return;
    }

    if (!window.XLSX) {
      showToast('La biblioteca Excel (SheetJS) no se encuentra disponible', 'danger');
      return;
    }

    const { period, totals, concepts } = this.activePeriodSummaryData;
    const company = this.activeCompany || {};

    const rows = [
      ['RESUMEN DE LIQUIDACIÓN DE HABERES — TOTALES POR CONCEPTO'],
      ['Empresa:', company.legalName || 'Empresa', 'CUIT:', company.cuit || ''],
      ['Liquidación:', period.settlementName || 'Liquidación', 'Período:', `${period.month}/${period.year}`, 'Liq. N°:', period.settlementNumber || 1],
      ['Fecha de Emisión:', `${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR')}`],
      [],
      ['Código', 'Naturaleza', 'Concepto / Denominación', 'Cant. Casos', 'Remunerativo ($)', 'No Remunerativo ($)', 'Deducciones ($)'],
    ];

    concepts.forEach((c) => {
      let natLabel = 'Deducción';
      if (c.type === 'REMUNERATIVE') natLabel = 'Remunerativo';
      else if (c.type === 'NON_REMUNERATIVE') natLabel = 'No Remunerativo';

      const code = c.conceptCode || c.code || '';
      const name = c.conceptName || c.name || '';
      const remVal = Number(c.remunerativeTotal ?? c.remunerativeAmount ?? 0);
      const nremVal = Number(c.nonRemunerativeTotal ?? c.nonRemunerativeAmount ?? 0);
      const dedVal = Number(c.deductionsTotal ?? c.deductionAmount ?? 0);

      rows.push([
        code,
        natLabel,
        name,
        c.casesCount || 0,
        remVal,
        nremVal,
        dedVal,
      ]);
    });

    rows.push([]);
    rows.push([
      'TOTALES CONSOLIDADOS',
      '',
      '',
      totals.totalEmployeesCount || period.totalEmployees || 0,
      Number(totals.totalRemunerative || 0),
      Number(totals.totalNonRemunerative || 0),
      Number(totals.totalDeductions || 0),
    ]);
    rows.push([
      'NETO TOTAL A PAGAR',
      '',
      '',
      '',
      '',
      '',
      Number(totals.totalNet || 0),
    ]);

    const ws = window.XLSX.utils.aoa_to_sheet(rows);

    // Ajustar anchos de columnas
    ws['!cols'] = [
      { wch: 12 }, // Código
      { wch: 18 }, // Naturaleza
      { wch: 40 }, // Concepto
      { wch: 14 }, // Casos
      { wch: 20 }, // Remunerativo
      { wch: 20 }, // No Remunerativo
      { wch: 20 }, // Deducciones
    ];

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Resumen Liquidación');

    const cleanName = (period.settlementName || 'Liquidacion').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Resumen_${cleanName}_${period.year}_${String(period.month).padStart(2, '0')}.xlsx`;
    window.XLSX.writeFile(wb, fileName);
    showToast(`Planilla Excel descargada: ${fileName}`, 'success');
  }

  printPeriodSummaryPdf() {
    if (!this.activePeriodSummaryData || !this.activePeriodSummaryData.period) {
      showToast('No hay datos cargados de resumen para imprimir', 'warning');
      return;
    }

    const { period, totals, concepts } = this.activePeriodSummaryData;
    const company = this.activeCompany || {};

    const typeLabels = {
      MONTHLY: 'Mensual Normal',
      FIRST_FORTNIGHT: '1ra Quincena',
      SECOND_FORTNIGHT: '2da Quincena',
      SAC: 'S.A.C. (Aguinaldo)',
      VACATIONS: 'Vacaciones Adelantadas',
      FINAL: 'Liquidación Final',
      SPECIAL: 'Liquidación Especial / Ajuste',
    };
    const pTypeStr = typeLabels[period.periodType] || period.periodType;
    const liqDateStr = period.liquidationDate
      ? new Date(String(period.liquidationDate).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR')
      : '-';

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('El navegador bloqueó la ventana emergente. Por favor habilite las ventanas emergentes.', 'danger');
      return;
    }

    const rowsHtml = concepts && concepts.length > 0
      ? concepts.map((c) => {
          let natBadge = '<span style="color: #666;">DED</span>';
          if (c.type === 'REMUNERATIVE') natBadge = '<strong style="color: #0054a6;">REM</strong>';
          else if (c.type === 'NON_REMUNERATIVE') natBadge = '<strong style="color: #0ca678;">NO REM</strong>';

          const code = c.conceptCode || c.code || '';
          const name = c.conceptName || c.name || '';
          const remVal = Number(c.remunerativeTotal ?? c.remunerativeAmount ?? 0);
          const nremVal = Number(c.nonRemunerativeTotal ?? c.nonRemunerativeAmount ?? 0);
          const dedVal = Number(c.deductionsTotal ?? c.deductionAmount ?? 0);

          const rem = remVal > 0 ? `$ ${formatNumber(remVal)}` : '-';
          const nrem = nremVal > 0 ? `$ ${formatNumber(nremVal)}` : '-';
          const ded = dedVal > 0 ? `$ ${formatNumber(dedVal)}` : '-';

          return `
            <tr>
              <td style="font-family: monospace; font-weight: bold;">${escapeHtml(code)}</td>
              <td style="text-align: center; font-size: 7.5pt;">${natBadge}</td>
              <td>${escapeHtml(name)}</td>
              <td style="text-align: center; font-family: monospace;">${c.casesCount || 0}</td>
              <td style="text-align: right; font-family: monospace; white-space: nowrap;">${rem}</td>
              <td style="text-align: right; font-family: monospace; white-space: nowrap;">${nrem}</td>
              <td style="text-align: right; font-family: monospace; color: #dc3545; white-space: nowrap;">${ded}</td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #666;">No hay conceptos registrados.</td></tr>';

    const printHtml = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Resumen de Liquidación — ${escapeHtml(period.settlementName || 'Liquidación')}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #222;
            background: #fff;
            margin: 0;
            padding: 0;
            font-size: 10pt;
            line-height: 1.35;
          }
          .header-box {
            border-bottom: 2px solid #0054a6;
            padding-bottom: 8px;
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .title {
            font-size: 14pt;
            font-weight: 800;
            color: #0054a6;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .subtitle {
            font-size: 9pt;
            color: #555;
            margin: 2px 0 0 0;
          }
          .meta-box {
            text-align: right;
            font-size: 8.5pt;
            color: #666;
          }
          .section-card {
            border: 1px solid #d0d7de;
            border-radius: 4px;
            background: #f8fafc;
            padding: 9px 14px;
            margin-bottom: 12px;
          }
          .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px 16px;
            font-size: 9pt;
          }
          .grid-4 {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr 1fr;
            gap: 8px;
            text-align: center;
            background: #eef2f6;
            padding: 8px;
            border-radius: 4px;
            margin-bottom: 12px;
          }
          .stat-label {
            font-size: 7pt;
            font-weight: 700;
            text-transform: uppercase;
            color: #555;
            margin-bottom: 2px;
          }
          .stat-val {
            font-size: 11pt;
            font-weight: 800;
            font-family: monospace;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8.5pt;
            margin-top: 6px;
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
            padding: 4.5px 8px;
            border: 1px solid #e1e4e8;
            vertical-align: middle;
          }
          tr:nth-child(even) td {
            background-color: #f9fbfd;
          }
          tfoot td {
            background-color: #f1f5f9 !important;
            border-top: 2px solid #0054a6 !important;
            font-weight: bold;
          }
          .footer-box {
            margin-top: 25px;
            padding-top: 10px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            font-size: 8pt;
            color: #666;
          }
          .signatures-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 20px;
            margin-top: 30px;
            text-align: center;
          }
          .signature-line {
            border-top: 1px solid #333;
            padding-top: 4px;
            font-size: 8pt;
            font-weight: bold;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div>
            <h1 class="title">Resumen de Liquidación de Haberes</h1>
            <div class="subtitle">Totales por Concepto • Cuadre Contable y Libro de Sueldos Digital (Ley 20.744)</div>
          </div>
          <div class="meta-box">
            <div><strong>Emisión:</strong> ${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
            <div><strong>Usuario:</strong> Sistema ProyectoSueldos</div>
          </div>
        </div>

        <div class="section-card">
          <div class="grid-2">
            <div>
              <strong>Razón Social:</strong> ${escapeHtml(company.legalName || 'Empresa')}<br>
              <strong>CUIT:</strong> ${escapeHtml(company.cuit || '-')}<br>
              <strong>Domicilio:</strong> ${escapeHtml(company.address || '-')}
            </div>
            <div>
              <strong>Liquidación:</strong> ${escapeHtml(period.settlementName || 'Liquidación')} (#${period.settlementNumber || 1})<br>
              <strong>Período:</strong> ${period.month}/${period.year} • Tipo: ${escapeHtml(pTypeStr)}<br>
              <strong>Fecha de Pago / Liq.:</strong> ${liqDateStr} • Colaboradores: ${totals.totalEmployeesCount || period.totalEmployees || '-'}
            </div>
          </div>
        </div>

        <div class="grid-4">
          <div>
            <div class="stat-label">TOTAL REMUNERATIVO</div>
            <div class="stat-val" style="color: #0054a6;">$ ${formatNumber(totals.totalRemunerative)}</div>
          </div>
          <div>
            <div class="stat-label">TOTAL NO REMUNERATIVO</div>
            <div class="stat-val" style="color: #0ca678;">$ ${formatNumber(totals.totalNonRemunerative)}</div>
          </div>
          <div>
            <div class="stat-label">TOTAL DEDUCCIONES</div>
            <div class="stat-val" style="color: #dc3545;">$ ${formatNumber(totals.totalDeductions)}</div>
          </div>
          <div>
            <div class="stat-label">NETO TOTAL A PAGAR</div>
            <div class="stat-val" style="color: #198754;">$ ${formatNumber(totals.totalNet)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 10%;">Código</th>
              <th style="width: 8%; text-align: center;">Tipo</th>
              <th style="width: 38%;">Concepto / Denominación</th>
              <th style="width: 8%; text-align: center;">Casos</th>
              <th style="width: 12%; text-align: right;">Remunerativo ($)</th>
              <th style="width: 12%; text-align: right;">No Remunerativo ($)</th>
              <th style="width: 12%; text-align: right;">Deducciones ($)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-transform: uppercase;">TOTALES CONSOLIDADOS</td>
              <td style="text-align: center; font-family: monospace;">${totals.totalEmployeesCount || period.totalEmployees || '-'}</td>
              <td style="text-align: right; font-family: monospace;">$ ${formatNumber(totals.totalRemunerative)}</td>
              <td style="text-align: right; font-family: monospace;">$ ${formatNumber(totals.totalNonRemunerative)}</td>
              <td style="text-align: right; font-family: monospace; color: #dc3545;">$ ${formatNumber(totals.totalDeductions)}</td>
            </tr>
          </tfoot>
        </table>

        <div class="signatures-grid">
          <div>
            <div class="signature-line">Confeccionó / Liquidó</div>
            <span style="font-size: 7.5pt; color: #666;">Responsable de Nómina</span>
          </div>
          <div>
            <div class="signature-line">Revisó / Auditoría Contable</div>
            <span style="font-size: 7.5pt; color: #666;">Control de Haberes</span>
          </div>
          <div>
            <div class="signature-line">Aprobó / Dirección</div>
            <span style="font-size: 7.5pt; color: #666;">Gerencia RRHH / Finanzas</span>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
  }

  canClosePayrollPeriods() {
    const userRole = String(this.user?.role || '').toUpperCase();
    const companyRole = String(this.activeCompany?.companyRole || this.activeCompany?.role || '').toUpperCase();
    return userRole === 'OWNER' || userRole === 'ADMIN' || companyRole === 'ADMIN' || companyRole === 'OWNER';
  }

  async loadPayrollPeriods() {
    const spinner = document.getElementById('payroll-periods-spinner');
    if (spinner) spinner.classList.remove('d-none');

    if (this._periodsAbortCtrl) {
      this._periodsAbortCtrl.abort();
    }
    this._periodsAbortCtrl = new AbortController();

    const searchInput = document.getElementById('payroll-period-search');
    const typeFilter = document.getElementById('payroll-period-type-filter');
    const statusFilter = document.getElementById('payroll-period-status-filter');

    const query = new URLSearchParams({
      page: String(this.payrollPeriodsPage),
      limit: String(this.payrollPeriodsPageSize),
    });
    if (searchInput?.value?.trim()) query.append('search', searchInput.value.trim());
    if (typeFilter?.value && typeFilter.value !== 'ALL') {
      query.append('type', typeFilter.value);
      query.append('periodType', typeFilter.value);
    }
    if (statusFilter?.value && statusFilter.value !== 'ALL') {
      query.append('status', statusFilter.value);
    }

    try {
      const res = await apiRequest(`/payroll/periods?${query.toString()}`, {
        signal: this._periodsAbortCtrl.signal,
      });
      this.payrollPeriods = res.data || [];
      const totalFiltered = res.meta?.total ?? this.payrollPeriods.length;
      const badge = document.getElementById('payroll-badge-periods-count');
      if (badge) badge.textContent = totalFiltered;

      this.renderPayrollPeriodsTable(this.payrollPeriods);
      this.renderPayrollPeriodsPagination(res.meta || { total: totalFiltered, page: 1, totalPages: 1 });
      this.syncPayrollPeriodSelectors();
      await this.loadActiveFiscalPeriod?.();

      const activeSettlementsBadge = document.getElementById('payroll-active-settlements-badge');
      const hasActiveFilter =
        Boolean(searchInput?.value?.trim()) ||
        Boolean(typeFilter?.value && typeFilter.value !== 'ALL') ||
        Boolean(statusFilter?.value && statusFilter.value !== 'ALL');
      if (activeSettlementsBadge && hasActiveFilter) {
        activeSettlementsBadge.textContent = `${totalFiltered} liquidación(es)`;
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        showToast(err.message || 'Error al cargar períodos de liquidación', 'danger');
      }
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  async openPayrollCloseModal({ scope, id, name }) {
    const modalEl = document.getElementById('modal-payroll-close-confirm');
    if (!modalEl) return;

    if (this._closePreviewAbortCtrl) {
      this._closePreviewAbortCtrl.abort();
    }
    this._closePreviewAbortCtrl = new AbortController();

    this._pendingCloseContext = { scope, id, name };

    const titleEl = document.getElementById('payroll-close-modal-title');
    const subEl = document.getElementById('payroll-close-modal-subtitle');
    const loadingEl = document.getElementById('payroll-close-loading');
    const contentEl = document.getElementById('payroll-close-content');
    const confirmBtn = document.getElementById('btn-confirm-payroll-close');
    const notesEl = document.getElementById('payroll-close-notes');

    if (titleEl) {
      titleEl.textContent =
        scope === 'FISCAL_PERIOD'
          ? `Cierre Integral: ${name || 'Período Activo'}`
          : `Cerrar Liquidación: ${name || ''}`;
    }
    if (subEl) {
      subEl.textContent =
        scope === 'FISCAL_PERIOD'
          ? 'Cerrará todas las liquidaciones abiertas del mes, depurará novedades y aplicará bajas de Liquidaciones Finales.'
          : 'Bloqueará recibos de esta liquidación, depurará sus novedades no persistentes y aplicará bajas si es Final.';
    }
    if (notesEl) notesEl.value = '';
    if (loadingEl) loadingEl.classList.remove('d-none');
    if (contentEl) contentEl.classList.add('d-none');
    if (confirmBtn) confirmBtn.disabled = true;

    getBootstrapModal(modalEl)?.show();

    const previewEndpoint =
      scope === 'FISCAL_PERIOD'
        ? `/payroll/fiscal-periods/${id}/close-preview`
        : `/payroll/periods/${id}/close-preview`;

    try {
      const res = await apiRequest(previewEndpoint, {
        signal: this._closePreviewAbortCtrl.signal,
      });
      this.renderPayrollClosePreview(res.data, scope);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (loadingEl) loadingEl.classList.add('d-none');
      if (contentEl) contentEl.classList.remove('d-none');
      const blockEl = document.getElementById('payroll-close-blocking-alert');
      if (blockEl) {
        blockEl.innerHTML = `<i class="ti ti-alert-octagon me-1"></i> ${escapeHtml(err.message || 'No se pudo obtener la pre-evaluación de cierre')}`;
        blockEl.classList.remove('d-none');
      }
      showToast(err.message || 'Error al pre-evaluar cierre', 'danger');
    }
  }

  renderPayrollClosePreview(preview, scope) {
    const loadingEl = document.getElementById('payroll-close-loading');
    const contentEl = document.getElementById('payroll-close-content');
    const blockEl = document.getElementById('payroll-close-blocking-alert');
    const warnEl = document.getElementById('payroll-close-warnings-alert');
    const confirmBtn = document.getElementById('btn-confirm-payroll-close');

    if (loadingEl) loadingEl.classList.add('d-none');
    if (contentEl) contentEl.classList.remove('d-none');

    const blocking = preview?.blockingErrors || [];
    const warnings = preview?.warnings || [];

    if (blockEl) {
      if (blocking.length > 0) {
        blockEl.innerHTML = `
          <div class="fw-bold mb-1"><i class="ti ti-alert-octagon me-1"></i> No es posible cerrar hasta resolver lo siguiente:</div>
          <ul class="mb-0 ps-3 small">
            ${blocking.map((b) => `<li>${escapeHtml(b.message)}</li>`).join('')}
          </ul>
        `;
        blockEl.classList.remove('d-none');
      } else {
        blockEl.classList.add('d-none');
        blockEl.innerHTML = '';
      }
    }

    if (warnEl) {
      if (warnings.length > 0) {
        warnEl.innerHTML = `
          <div class="fw-bold mb-1"><i class="ti ti-alert-triangle me-1"></i> Observaciones antes de confirmar:</div>
          <ul class="mb-0 ps-3 small">
            ${warnings.map((w) => `<li>${escapeHtml(w.message)}</li>`).join('')}
          </ul>
        `;
        warnEl.classList.remove('d-none');
      } else {
        warnEl.classList.add('d-none');
        warnEl.innerHTML = '';
      }
    }

    const settlements = preview?.settlementsToClose || [];
    const terminations = preview?.terminationsPreview || [];
    const novSummary = preview?.noveltiesByConceptSummary || [];

    document.getElementById('payroll-close-kpi-settlements').textContent = String(settlements.length);
    document.getElementById('payroll-close-kpi-slips').textContent = String(preview?.totalSlipsToLock || 0);
    document.getElementById('payroll-close-kpi-novelties').textContent = String(preview?.noveltiesToPurgeCount || 0);
    document.getElementById('payroll-close-kpi-terminations').textContent = String(terminations.length);

    const typeLabels = {
      MONTHLY: 'Mensual',
      QUINCE_1: '1ra Quincena',
      QUINCE_2: '2da Quincena',
      SAC_1: '1er SAC',
      SAC_2: '2do SAC',
      VACATIONS: 'Vacaciones',
      FINAL: 'Liquidación Final',
    };

    const sTbody = document.getElementById('payroll-close-settlements-tbody');
    if (sTbody) {
      sTbody.innerHTML =
        settlements.length === 0
          ? '<tr><td colspan="5" class="text-center py-3 text-muted small">Todas las liquidaciones del período ya fueron cerradas previamente.</td></tr>'
          : settlements
              .map(
                (s) => `
                  <tr>
                    <td class="fw-semibold">${escapeHtml(s.settlementName || 'Liquidación')}</td>
                    <td><span class="badge bg-blue-lt">${escapeHtml(typeLabels[s.periodType] || s.periodType)}</span></td>
                    <td class="text-center font-monospace">${s.slipsCount}</td>
                    <td class="text-end font-monospace text-nowrap">$${formatNumber(s.totalNet || 0)}</td>
                    <td class="text-center font-monospace">${s.noveltiesCount}</td>
                  </tr>
                `
              )
              .join('');
    }

    const novSummaryEl = document.getElementById('payroll-close-novelties-summary');
    if (novSummaryEl) {
      if (novSummary.length === 0) {
        novSummaryEl.innerHTML = '<span class="text-muted">No hay novedades no persistentes pendientes de depuración en este alcance.</span>';
      } else {
        novSummaryEl.innerHTML = `
          <div class="d-flex flex-wrap gap-2">
            ${novSummary
              .map(
                (n) =>
                  `<span class="badge bg-warning-lt text-dark border">${escapeHtml(n.conceptCode)} (${escapeHtml(n.conceptName)}): <strong>${n.count}</strong></span>`
              )
              .join('')}
          </div>
          <div class="text-muted mt-1" style="font-size: 0.75rem;">
            Se eliminarán de <code>period_novelties</code> tras quedar respaldadas en los recibos cerrados y el acta de cierre.
          </div>
        `;
      }
    }

    const termSection = document.getElementById('payroll-close-terminations-section');
    const tTbody = document.getElementById('payroll-close-terminations-tbody');
    if (termSection && tTbody) {
      termSection.classList.toggle('d-none', terminations.length === 0);
      tTbody.innerHTML = terminations
        .map((t) => {
          const termDateStr = t.proposedTerminationDate
            ? new Date(`${String(t.proposedTerminationDate).slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR')
            : '-';
          const obs = [];
          if (t.previousStatus !== 'ACTIVE') obs.push('Ya estaba inactivo');
          if (t.activeEmbargoesCount > 0) obs.push(`${t.activeEmbargoesCount} embargo(s) activo(s)`);
          return `
            <tr>
              <td class="font-monospace">${escapeHtml(t.fileNumber || '-')}</td>
              <td class="fw-semibold">${escapeHtml(t.fullName || '-')}</td>
              <td>${escapeHtml(t.sourceSettlementName || 'Final')}</td>
              <td class="text-nowrap fw-bold text-danger">${termDateStr}</td>
              <td class="small text-muted">${obs.length ? escapeHtml(obs.join(' • ')) : 'Pasará a Inactivo / Baja'}</td>
            </tr>
          `;
        })
        .join('');
    }

    const expiredWrap = document.getElementById('payroll-close-opt-expired-wrap');
    const expiredChk = document.getElementById('payroll-close-opt-expired-concepts');
    if (expiredWrap && expiredChk) {
      const showExp = scope === 'FISCAL_PERIOD';
      expiredWrap.classList.toggle('d-none', !showExp);
      expiredChk.checked = true;
    }

    const embWrap = document.getElementById('payroll-close-opt-embargoes-wrap');
    const embChk = document.getElementById('payroll-close-opt-suspend-embargoes');
    if (embWrap && embChk) {
      embWrap.classList.toggle('d-none', terminations.length === 0);
      embChk.checked = true;
    }

    if (confirmBtn) {
      confirmBtn.disabled = !preview?.canClose;
    }
  }

  async executePayrollClose() {
    const ctx = this._pendingCloseContext;
    if (!ctx) return;

    const confirmBtn = document.getElementById('btn-confirm-payroll-close');
    const notesEl = document.getElementById('payroll-close-notes');
    const optExp = document.getElementById('payroll-close-opt-expired-concepts');
    const optEmb = document.getElementById('payroll-close-opt-suspend-embargoes');

    const payload = {
      confirmWarnings: true,
      notes: notesEl?.value?.trim() || null,
      deactivateExpiredConcepts: optExp ? Boolean(optExp.checked) : true,
      suspendTerminatedEmbargoes: optEmb ? Boolean(optEmb.checked) : true,
    };

    const endpoint =
      ctx.scope === 'FISCAL_PERIOD'
        ? `/payroll/fiscal-periods/${ctx.id}/close`
        : `/payroll/periods/${ctx.id}/close`;

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Cerrando...';
    }

    try {
      const res = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const summary = res?.data?.closingSummary;
      const summaryMsg = summary
        ? `Cierre completado: ${summary.totalSlipsClosed} recibo(s) bloqueado(s), ${summary.purgedNoveltiesCount} novedad(es) depurada(s), ${summary.terminatedEmployeesCount} baja(s) aplicada(s).`
        : res.message || 'Cierre completado exitosamente';
      showToast(summaryMsg, 'success');

      getBootstrapModal(document.getElementById('modal-payroll-close-confirm'))?.hide();

      // Invalidar caché local de personal activo para reflejar bajas inmediatamente
      this._cachedActiveEmployees = null;
      this._cachedActiveEmployeesTime = 0;

      await Promise.all([
        this.loadActiveFiscalPeriod?.(),
        this.loadPayrollPeriods(),
        this.loadEmployees?.(),
      ]);
      this.syncPayrollPeriodSelectors();
    } catch (err) {
      showToast(err.message || 'Error al ejecutar el cierre', 'danger');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="ti ti-lock-check me-1"></i> Confirmar Cierre Definitivo';
      }
    }
  }

  async openClosingAuditsModal() {
    const modalEl = document.getElementById('modal-closing-audits');
    const loadingEl = document.getElementById('closing-audits-loading');
    const tbody = document.getElementById('closing-audits-table-body');
    if (!modalEl || !tbody) return;

    tbody.innerHTML = '';
    if (loadingEl) loadingEl.classList.remove('d-none');
    getBootstrapModal(modalEl)?.show();

    try {
      const res = await apiRequest('/payroll/closing-audits?limit=30');
      const rows = res.data || [];
      tbody.innerHTML =
        rows.length === 0
          ? '<tr><td colspan="8" class="text-center py-4 text-muted">Aún no se registraron cierres formales en esta empresa.</td></tr>'
          : rows
              .map((a) => {
                const dateStr = a.closedAt ? new Date(a.closedAt).toLocaleString('es-AR') : '-';
                const scopeLabel = a.scope === 'FISCAL_PERIOD' ? 'Período Fiscal' : 'Liquidación';
                const periodLabel = `${String(a.month).padStart(2, '0')}/${a.year}`;
                const hashShort = a.checksumHash ? String(a.checksumHash).slice(0, 12) : '-';
                return `
                  <tr>
                    <td class="text-nowrap small">${escapeHtml(dateStr)}</td>
                    <td><span class="badge ${a.scope === 'FISCAL_PERIOD' ? 'bg-danger-lt' : 'bg-azure-lt'}">${scopeLabel}</span></td>
                    <td class="font-monospace fw-bold">${periodLabel}</td>
                    <td class="text-center font-monospace">${a.totalSlipsClosed}</td>
                    <td class="text-center font-monospace">${a.purgedNoveltiesCount}</td>
                    <td class="text-center font-monospace">${a.terminatedEmployeesCount}</td>
                    <td class="text-end font-monospace text-nowrap">$${formatNumber(a.totalNet || 0)}</td>
                    <td class="small">
                      <div>${escapeHtml(a.closedByName || a.closedBy || 'Sistema')}</div>
                      <code class="text-muted" style="font-size: 0.7rem;" title="${escapeHtml(a.checksumHash || '')}">sha256:${escapeHtml(hashShort)}</code>
                    </td>
                  </tr>
                `;
              })
              .join('');
    } catch (err) {
      showToast(err.message || 'Error al consultar actas de cierre', 'danger');
    } finally {
      if (loadingEl) loadingEl.classList.add('d-none');
    }
  }
}

export function registerPayrollPeriodsCalcMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(MixinMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
