import { apiRequest, storage, showToast } from '../api.js';
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
} from '../utils/helpers.js';


class PayrollMethods {
  // ==========================================================================
  // MÓDULO DE LIQUIDACIÓN DE SUELDOS & LIBRO DE SUELDOS DIGITAL (ARCA)
  // ==========================================================================

  setupPayrollNavigation() {
    const navLinks = document.querySelectorAll('#payroll-sidebar-nav .payroll-nav-item:not([data-bs-toggle="collapse"]), #payroll-sidebar-nav .payroll-nav-subitem');
    navLinks.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        navLinks.forEach((i) => i.classList.remove('active'));
        document.querySelectorAll('#payroll-sidebar-nav .payroll-nav-item').forEach((i) => i.classList.remove('active'));
        item.classList.add('active');

        // Si es un sub-ítem, mantener activo visualmente el menú padre
        const parentDropdown = item.closest('.payroll-nav-dropdown');
        if (parentDropdown) {
          const parentBtn = parentDropdown.querySelector('.payroll-nav-item');
          if (parentBtn) parentBtn.classList.add('active');
        }

        const targetPaneId = item.getAttribute('href');
        document.querySelectorAll('#payroll-tab-content > .tab-pane').forEach((p) => {
          p.classList.remove('show', 'active');
        });
        const targetPane = document.querySelector(targetPaneId);
        if (targetPane) targetPane.classList.add('show', 'active');

        // Cargar datos según el panel activado
        if (targetPaneId === '#pane-payroll-periods') {
          this.loadPayrollPeriods();
        } else if (targetPaneId === '#pane-nov-pers-emp') {
          this.loadNovPersEmp();
        } else if (targetPaneId === '#pane-nov-pers-con') {
          this.loadNovPersCon();
        } else if (targetPaneId === '#pane-nov-nopers-emp') {
          this.syncPayrollPeriodSelectors();
          this.loadNovNoPersEmp();
        } else if (targetPaneId === '#pane-nov-nopers-con') {
          this.syncPayrollPeriodSelectors();
          this.loadNovNoPersCon();
        } else if (targetPaneId === '#pane-payroll-settlement') {
          this.syncPayrollPeriodSelectors();
          this.loadSettlementView();
        } else if (targetPaneId === '#pane-payroll-slips') {
          this.syncPayrollPeriodSelectors();
          const periodSelect = document.getElementById('slips-period-select');
          if (periodSelect && periodSelect.value) {
            this.loadPayrollSlips(periodSelect.value);
          }
        } else if (targetPaneId === '#pane-payroll-lsd') {
          this.syncPayrollPeriodSelectors();
        } else if (targetPaneId === '#pane-payroll-concepts') {
          this.loadPayrollConcepts();
        } else if (targetPaneId === '#pane-payroll-matrices') {
          this.loadPayrollMatrices();
        } else if (targetPaneId === '#pane-payroll-fixed-values') {
          this.loadPayrollFixedValues();
        } else if (targetPaneId === '#pane-payroll-salary-scales') {
          this.loadPayrollSalaryScales();
        } else if (targetPaneId === '#pane-payroll-settings') {
          this.loadPayrollSettings();
        }
      });
    });
  }

  async renderPayrollView() {
    if (!this.activeCompany) {
      showToast('Por favor selecciona una empresa activa para liquidar sueldos', 'warning');
      this.showView('companies');
      return;
    }
    await this.loadPayrollPeriods();
    await this.loadPayrollSalaryScales();
    await this.loadPayrollConcepts();
    await this.loadPayrollMatrices();
    await this.loadPayrollFixedValues();
    await this.loadPayrollSettings();
  }

  setupPayrollModals() {
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
      periodSearch.addEventListener('input', () => {
        this.payrollPeriodsPage = 1;
        this.loadPayrollPeriods();
      });
    }
    const periodTypeFilter = document.getElementById('payroll-period-type-filter');
    if (periodTypeFilter) {
      periodTypeFilter.addEventListener('change', () => {
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

    // --- Slips Handlers ---
    const slipsPeriodSelect = document.getElementById('slips-period-select');
    if (slipsPeriodSelect) {
      slipsPeriodSelect.addEventListener('change', () => {
        this.activePayrollPeriodId = slipsPeriodSelect.value;
        this.payrollSlipsPage = 1;
        this.loadPayrollSlips(slipsPeriodSelect.value);
      });
    }
    const slipsDeptFilter = document.getElementById('slips-department-filter');
    if (slipsDeptFilter) {
      slipsDeptFilter.addEventListener('change', () => {
        this.payrollSlipsPage = 1;
        this.loadPayrollSlips(slipsPeriodSelect?.value);
      });
    }
    const slipsSearch = document.getElementById('slips-search-input');
    if (slipsSearch) {
      slipsSearch.addEventListener('input', () => {
        this.payrollSlipsPage = 1;
        this.loadPayrollSlips(slipsPeriodSelect?.value);
      });
    }
    const slipsPageSize = document.getElementById('slips-page-size-select');
    if (slipsPageSize) {
      slipsPageSize.addEventListener('change', () => {
        this.payrollSlipsPageSize = Number(slipsPageSize.value) || 5;
        this.payrollSlipsPage = 1;
        this.loadPayrollSlips(slipsPeriodSelect?.value);
      });
    }
    const btnBatchPrint = document.getElementById('btn-export-slips-batch');
    if (btnBatchPrint) {
      btnBatchPrint.addEventListener('click', () => window.print());
    }

    // --- Print Modal Button ---
    const btnPrintPayslip = document.getElementById('btn-print-payslip');
    if (btnPrintPayslip) {
      btnPrintPayslip.addEventListener('click', () => window.print());
    }

    // --- LSD Handlers ---
    const btnValidateLsd = document.getElementById('btn-validate-lsd');
    if (btnValidateLsd) {
      btnValidateLsd.addEventListener('click', () => this.auditLsdConsistency());
    }
    const btnDownloadLsdConcepts = document.getElementById('btn-download-lsd-concepts');
    if (btnDownloadLsdConcepts) {
      btnDownloadLsdConcepts.addEventListener('click', () => this.downloadLsdConceptsFile());
    }
    const btnDownloadLsdPayroll = document.getElementById('btn-download-lsd-payroll');
    if (btnDownloadLsdPayroll) {
      btnDownloadLsdPayroll.addEventListener('click', () => this.downloadLsdPayrollFile());
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
      });
      conceptNumInput.addEventListener('blur', () => {
        this.updateConceptNormalizedCode(true);
      });
    }

    const conceptTypeSelect = document.getElementById('concept-input-type');
    if (conceptTypeSelect) {
      conceptTypeSelect.addEventListener('change', () => {
        const arcaSelect = document.getElementById('concept-input-arca-code');
        const formId = document.getElementById('concept-form-id')?.value;
        if (arcaSelect && !formId) {
          const t = conceptTypeSelect.value;
          if (t === 'REMUNERATIVE') arcaSelect.value = '110000';
          else if (t === 'NON_REMUNERATIVE') arcaSelect.value = '550000';
          else if (t === 'DEDUCTION') arcaSelect.value = '810000';
          else if (t === 'AUXILIARY') arcaSelect.value = '';
          this.applyArcaSubsystemsSuggestion(arcaSelect.value);
        }
      });
    }

    const arcaSelect = document.getElementById('concept-input-arca-code');
    if (arcaSelect) {
      arcaSelect.addEventListener('change', () => {
        this.applyArcaSubsystemsSuggestion(arcaSelect.value);
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

    const btnInsertMatrixFormula = document.getElementById('btn-insert-matrix-formula');
    if (btnInsertMatrixFormula) {
      btnInsertMatrixFormula.addEventListener('click', () => {
        const select = document.getElementById('formula-select-matrix');
        const val = select?.value;
        if (!val) return;
        const formulaInput = document.getElementById('concept-input-formula');
        if (formulaInput) {
          const token = `[MATRIZ:${val}]`;
          const start = formulaInput.selectionStart || formulaInput.value.length;
          const end = formulaInput.selectionEnd || formulaInput.value.length;
          const text = formulaInput.value;
          formulaInput.value = text.substring(0, start) + token + text.substring(end);
          formulaInput.focus();
          const newPos = start + token.length;
          formulaInput.setSelectionRange(newPos, newPos);
        }
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

    const btnInsertFixedValueToken = document.getElementById('btn-insert-fixed-value-formula');
    if (btnInsertFixedValueToken) {
      btnInsertFixedValueToken.addEventListener('click', () => {
        const sel = document.getElementById('formula-select-fixed-value');
        if (!sel || !sel.value) return;
        const inputFormula = document.getElementById('concept-input-formula');
        if (!inputFormula) return;
        const token = `[VALOR:${sel.value}]`;
        const start = inputFormula.selectionStart || inputFormula.value.length;
        const end = inputFormula.selectionEnd || inputFormula.value.length;
        inputFormula.value = inputFormula.value.substring(0, start) + token + inputFormula.value.substring(end);
        inputFormula.focus();
        inputFormula.dispatchEvent(new Event('input'));
      });
    }

    const btnInsertSalaryScaleToken = document.getElementById('btn-insert-salary-scale-formula');
    if (btnInsertSalaryScaleToken) {
      btnInsertSalaryScaleToken.addEventListener('click', () => {
        const sel = document.getElementById('formula-select-salary-scale');
        if (!sel || !sel.value) return;
        const inputFormula = document.getElementById('concept-input-formula');
        if (!inputFormula) return;
        const token = `[NOMINA:${sel.value}]`;
        const start = inputFormula.selectionStart || inputFormula.value.length;
        const end = inputFormula.selectionEnd || inputFormula.value.length;
        inputFormula.value = inputFormula.value.substring(0, start) + token + inputFormula.value.substring(end);
        inputFormula.focus();
        inputFormula.dispatchEvent(new Event('input'));
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

    document.getElementById('payroll-scales-page-size-select')?.addEventListener('change', (e) => {
      this.payrollSalaryScalesPageSize = parseInt(e.target.value, 10) || 5;
      this.payrollSalaryScalesPage = 1;
      this.renderPayrollSalaryScalesTable();
    });

    document.getElementById('btn-open-mass-scale-increase')?.addEventListener('click', () => {
      this.openMassScaleIncreaseModal();
    });

    const massScaleIncreaseTypeSelect = document.getElementById('mass-scale-increase-type');
    if (massScaleIncreaseTypeSelect) {
      massScaleIncreaseTypeSelect.addEventListener('change', () => {
        const isPct = massScaleIncreaseTypeSelect.value === 'PERCENTAGE';
        const label = document.getElementById('mass-scale-increase-value-label');
        const symbol = document.getElementById('mass-scale-increase-symbol');
        const input = document.getElementById('mass-scale-increase-value');
        if (label) label.textContent = isPct ? 'Porcentaje a Aplicar (%)' : 'Monto Adicional Fijo ($)';
        if (symbol) symbol.textContent = isPct ? '%' : '$';
        if (input) input.placeholder = isPct ? 'Ej. 12.5' : 'Ej. 50000.00';
      });
    }

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
              <small class="text-muted">Liq. #${p.settlementNumber || 1}</small>
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
                <button type="button" class="btn btn-outline-purple btn-export-period-lsd" data-id="${p.id}" title="Exportar Libro Digital ARCA">
                  <i class="ti ti-file-certificate"></i>
                </button>
                ${
                  !isClosed
                    ? `
                  <button type="button" class="btn btn-outline-secondary btn-close-period" data-id="${p.id}" data-name="${escapeHtml(p.settlementName)}" title="Cerrar liquidación">
                    <i class="ti ti-lock"></i>
                  </button>
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
        document.getElementById('side-payroll-settlement')?.click();
        const select = document.getElementById('settlement-period-select');
        if (select) {
          select.value = periodId;
          this.loadSettlementView();
        }
      });
    });

    tbody.querySelectorAll('.btn-view-period-slips').forEach((btn) => {
      btn.addEventListener('click', () => {
        const periodId = btn.dataset.id;
        this.activePayrollPeriodId = periodId;
        this.syncPayrollPeriodSelectors(periodId);
        document.getElementById('side-payroll-slips')?.click();
        const select = document.getElementById('slips-period-select');
        if (select) {
          select.value = periodId;
          this.loadPayrollSlips(periodId);
        }
      });
    });

    tbody.querySelectorAll('.btn-export-period-lsd').forEach((btn) => {
      btn.addEventListener('click', () => {
        const periodId = btn.dataset.id;
        document.getElementById('side-payroll-lsd')?.click();
        const select = document.getElementById('lsd-period-select');
        if (select) {
          select.value = periodId;
          this.auditLsdConsistency();
        }
      });
    });

    tbody.querySelectorAll('.btn-close-period').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.confirmClosePeriod(btn.dataset.id, btn.dataset.name);
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
    const selectors = [
      'nov-nopers-emp-period-select',
      'nov-nopers-con-period-select',
      'settlement-period-select',
      'slips-period-select',
      'lsd-period-select',
      'novedades-period-select',
    ];
    selectors.forEach((selId) => {
      const el = document.getElementById(selId);
      if (!el) return;
      if (this.payrollPeriods.length === 0) {
        updateSearchableSelect(el, '<option value="">No hay liquidaciones registradas</option>', '');
        return;
      }
      const targetVal = this.activePayrollPeriodId || el.value || (this.payrollPeriods.length > 0 ? this.payrollPeriods[0].id : '');
      const optsHtml = this.payrollPeriods
        .map(
          (p) => `<option value="${p.id}" ${p.id === targetVal ? 'selected' : ''}>${String(p.month).padStart(2, '0')}/${p.year} - ${escapeHtml(p.settlementName)} (${p.status})</option>`
        )
        .join('');
      updateSearchableSelect(el, optsHtml, targetVal);
    });
  }

  openNewPeriodModal() {
    const form = document.getElementById('form-payroll-period');
    form?.reset();
    document.getElementById('payroll-period-form-id').value = '';
    document.getElementById('modal-payroll-period-title').textContent = 'Nueva Liquidación de Sueldos';
    document.getElementById('payroll-period-form-alert')?.classList.add('d-none');

    const now = new Date();
    document.getElementById('period-input-year').value = now.getFullYear();
    document.getElementById('period-input-month').value = now.getMonth() + 1;
    document.getElementById('period-input-type').value = 'MONTHLY';
    document.getElementById('period-input-payment-place').value = 'Casa Central';

    // Sugerir fecha de pago: 4to día hábil del mes siguiente
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 5);
    document.getElementById('period-input-payment-date').value = nextMonth.toISOString().split('T')[0];

    getBootstrapModal(document.getElementById('modal-payroll-period-form'))?.show();
  }

  async savePayrollPeriod() {
    const submitBtn = document.getElementById('btn-save-payroll-period');
    const alertBox = document.getElementById('payroll-period-form-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const payload = {
      year: Number(document.getElementById('period-input-year').value),
      month: Number(document.getElementById('period-input-month').value),
      periodType: document.getElementById('period-input-type').value,
      settlementName: document.getElementById('period-input-name').value.trim() || undefined,
      paymentDate: document.getElementById('period-input-payment-date').value || null,
      paymentPlace: document.getElementById('period-input-payment-place').value.trim() || null,
      depositDate: document.getElementById('period-input-deposit-date').value || null,
      depositBank: document.getElementById('period-input-deposit-bank').value.trim() || null,
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
    this.confirmDeleteAction({
      title: 'Cerrar Liquidación',
      message: `¿Estás seguro de que deseas cerrar la liquidación <strong>"${escapeHtml(name)}"</strong>?<br><span class="text-muted small">Una vez cerrada quedará bloqueada contra modificaciones.</span>`,
      confirmText: 'Cerrar Período',
      onConfirm: async () => {
        await apiRequest(`/payroll/periods/${id}/close`, { method: 'POST' });
        showToast('Liquidación cerrada correctamente');
        await this.loadPayrollPeriods();
      },
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

  async fetchActiveEmployees() {
    if (this._cachedActiveEmployees && this._cachedActiveEmployeesTime && (Date.now() - this._cachedActiveEmployeesTime < 20000)) {
      return this._cachedActiveEmployees;
    }
    const empRes = await apiRequest('/employees?status=ACTIVE&limit=5000');
    let emps = empRes.data || [];
    if (empRes.meta && empRes.meta.totalPages > 1) {
      for (let p = 2; p <= empRes.meta.totalPages; p++) {
        const nextRes = await apiRequest(`/employees?status=ACTIVE&limit=5000&page=${p}`);
        if (nextRes.data) emps.push(...nextRes.data);
      }
    }
    this._cachedActiveEmployees = emps;
    this._cachedActiveEmployeesTime = Date.now();
    return emps;
  }

  async fetchIndividualConcepts(isPersistent = null) {
    let url = '/payroll/concepts?scope=INDIVIDUAL&limit=500';
    if (isPersistent !== null && isPersistent !== undefined) {
      url += `&isPersistent=${isPersistent}`;
    }
    const res = await apiRequest(url);
    return res.data || [];
  }

  isPeriodClosed(periodId) {
    const period = this.payrollPeriods.find((p) => p.id === periodId);
    return period && period.status === 'CLOSED';
  }

  // -------------------------------------------------------------------------
  // 1. NOVEDADES PERSISTENTES - CONCEPTOS POR EMPLEADO (#pane-nov-pers-emp)
  // -------------------------------------------------------------------------

  async loadNovPersEmp() {
    const spinner = document.getElementById('nov-pers-emp-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      const employees = await this.fetchActiveEmployees();
      const select = document.getElementById('nov-pers-emp-select');
      if (select) {
        const currentVal = select.value;
        const optsHtml = '<option value="">Seleccione un colaborador...</option>' +
          employees.map((e) => `<option value="${e.id}" ${e.id === currentVal ? 'selected' : ''}>${escapeHtml(e.fileNumber)} - ${escapeHtml(e.lastName)}, ${escapeHtml(e.firstName)} (${formatCuit(e.cuil)})</option>`).join('');

        updateSearchableSelect(select, optsHtml, currentVal);

        if (currentVal) {
          await this.onNovPersEmpSelected(currentVal);
        } else {
          this.clearNovPersEmpView();
        }
      }
    } catch (err) {
      showToast(err.message || 'Error al cargar personal para novedades persistentes', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  clearNovPersEmpView() {
    document.getElementById('nov-pers-emp-card')?.classList.add('d-none');
    const addBtn = document.getElementById('btn-nov-pers-emp-add');
    if (addBtn) addBtn.disabled = true;
    const tbody = document.getElementById('nov-pers-emp-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Seleccione un colaborador para visualizar sus conceptos persistentes.</td></tr>';
    }
    const countBadge = document.getElementById('nov-pers-emp-count');
    if (countBadge) countBadge.textContent = '0 conceptos';
  }

  async onNovPersEmpSelected(employeeId) {
    if (!employeeId) {
      this.clearNovPersEmpView();
      return;
    }

    const employees = await this.fetchActiveEmployees();
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;

    this.novPersEmpSelectedEmp = emp;

    // Actualizar ficha rápida
    document.getElementById('nov-pers-emp-name').textContent = `${emp.lastName}, ${emp.firstName}`;
    document.getElementById('nov-pers-emp-file').textContent = emp.fileNumber;
    document.getElementById('nov-pers-emp-cuil').textContent = formatCuit(emp.cuil);
    document.getElementById('nov-pers-emp-dept').textContent = emp.department?.name || 'Sin Sector';
    const basicVal = Number(emp.baseSalary) || 0;
    document.getElementById('nov-pers-emp-basic').textContent = basicVal > 0 ? `$${formatNumber(basicVal)}` : 'Según CCT';
    document.getElementById('nov-pers-emp-card')?.classList.remove('d-none');

    const addBtn = document.getElementById('btn-nov-pers-emp-add');
    if (addBtn) addBtn.disabled = false;

    // Cargar conceptos persistentes del empleado
    const spinner = document.getElementById('nov-pers-emp-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      const res = await apiRequest(`/employees/${employeeId}/concepts`);
      const assigned = res.data || [];
      this.novPersEmpList = assigned;
      this.renderNovPersEmpTable(assigned);
    } catch (err) {
      showToast(err.message || 'Error al cargar conceptos del colaborador', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  renderNovPersEmpTable(assignedList) {
    const tbody = document.getElementById('nov-pers-emp-table-body');
    const countBadge = document.getElementById('nov-pers-emp-count');
    if (countBadge) countBadge.textContent = `${assignedList.length} concepto(s)`;
    if (!tbody) return;

    if (assignedList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Este colaborador no tiene conceptos persistentes individuales asignados.</td></tr>';
      return;
    }

    tbody.innerHTML = assignedList
      .map((item) => {
        const c = item.concept || {};
        const isGeneral = c.scope === 'GENERAL';

        const typeBadge = c.type === 'REMUNERATIVE'
          ? '<span class="badge bg-blue-lt">Remun.</span>'
          : c.type === 'NON_REMUNERATIVE'
          ? '<span class="badge bg-azure-lt">No Remun.</span>'
          : '<span class="badge bg-red-lt">Retención</span>';

        const scopeBadge = isGeneral
          ? '<span class="badge bg-secondary-lt fw-bold" title="Concepto general de liquidación"><i class="ti ti-world me-1"></i>General</span>'
          : '<span class="badge bg-teal-lt fw-bold" title="Asignación individual particular"><i class="ti ti-user-check me-1"></i>Individual</span>';

        const formattedVal = formatNoveltyValue(c, item);
        const notesHtml = item.notes
          ? `<div class="text-muted text-truncate mt-1" style="font-size: 0.75rem; max-width: 320px;" title="${escapeHtml(item.notes)}"><i class="ti ti-notes me-1"></i>${escapeHtml(item.notes)}</div>`
          : '';

        const actionButtons = isGeneral
          ? `
            <button type="button" class="btn btn-sm btn-icon btn-ghost-secondary" disabled title="Concepto general: modifíquelo en la sección Conceptos">
              <i class="ti ti-lock"></i>
            </button>
            <button type="button" class="btn btn-sm btn-icon btn-ghost-secondary" disabled title="Concepto general: modifíquelo en la sección Conceptos">
              <i class="ti ti-lock"></i>
            </button>
          `
          : `
            <button type="button" class="btn btn-sm btn-icon btn-ghost-primary btn-edit-nov-pers-emp" data-id="${item.id}" title="Modificar asignación">
              <i class="ti ti-edit"></i>
            </button>
            <button type="button" class="btn btn-sm btn-icon btn-ghost-danger btn-del-nov-pers-emp" data-id="${item.id}" data-name="${escapeHtml(c.name || '')}" title="Eliminar asignación">
              <i class="ti ti-trash"></i>
            </button>
          `;

        return `
          <tr data-assignment-id="${item.id}" class="${isGeneral ? 'bg-light-subtle' : ''}">
            <td><strong class="font-monospace text-indigo">${escapeHtml(c.code || '-')}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(c.name || '-')}</div>
              <div class="text-muted small">${item.isActive ? '<span class="text-success">● Activo</span>' : '<span class="text-danger">○ Inactivo</span>'}</div>
              ${notesHtml}
            </td>
            <td>${typeBadge}</td>
            <td class="text-center">${scopeBadge}</td>
            <td class="text-end">${formattedVal}</td>
            <td class="text-end text-nowrap">${actionButtons}</td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-nov-pers-emp').forEach((btn) => {
      btn.addEventListener('click', () => {
        const asgId = btn.dataset.id;
        const asg = this.novPersEmpList.find((a) => a.id === asgId);
        if (asg) this.openPersistentConceptModal({ assignment: asg, employee: this.novPersEmpSelectedEmp });
      });
    });

    tbody.querySelectorAll('.btn-del-nov-pers-emp').forEach((btn) => {
      btn.addEventListener('click', () => {
        const asgId = btn.dataset.id;
        const name = btn.dataset.name;
        this.confirmDeleteAction({
          title: 'Eliminar Concepto Persistente',
          message: `¿Estás seguro de que deseas desasignar el concepto <strong>"${escapeHtml(name)}"</strong> de este colaborador?`,
          onConfirm: async () => {
            await apiRequest(`/employees/${this.novPersEmpSelectedEmp.id}/concepts/${asgId}`, { method: 'DELETE' });
            showToast('Concepto desasignado correctamente');
            await this.onNovPersEmpSelected(this.novPersEmpSelectedEmp.id);
          },
        });
      });
    });
  }

  // -------------------------------------------------------------------------
  // 2. NOVEDADES PERSISTENTES - EMPLEADOS POR CONCEPTO (#pane-nov-pers-con)
  // -------------------------------------------------------------------------

  async loadNovPersCon() {
    const spinner = document.getElementById('nov-pers-con-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      const concepts = await this.fetchIndividualConcepts(true);
      const select = document.getElementById('nov-pers-con-select');
      if (select) {
        const currentVal = select.value;
        const optsHtml = '<option value="">Seleccione un concepto...</option>' +
          concepts.map((c) => `<option value="${c.id}" ${c.id === currentVal ? 'selected' : ''}>[${escapeHtml(c.code)}] ${escapeHtml(c.name)} (${c.type})</option>`).join('');

        updateSearchableSelect(select, optsHtml, currentVal);

        if (currentVal) {
          await this.onNovPersConSelected(currentVal);
        } else {
          this.clearNovPersConView();
        }
      }
    } catch (err) {
      showToast(err.message || 'Error al cargar conceptos persistentes', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  clearNovPersConView() {
    document.getElementById('nov-pers-con-card')?.classList.add('d-none');
    const addBtn = document.getElementById('btn-nov-pers-con-add');
    if (addBtn) addBtn.disabled = true;
    const tbody = document.getElementById('nov-pers-con-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Seleccione un concepto persistente para listar los colaboradores asignados.</td></tr>';
    }
    const countBadge = document.getElementById('nov-pers-con-count');
    if (countBadge) countBadge.textContent = '0 colaboradores';
  }

  async onNovPersConSelected(conceptId) {
    if (!conceptId) {
      this.clearNovPersConView();
      return;
    }

    const concepts = await this.fetchIndividualConcepts(true);
    const concept = concepts.find((c) => c.id === conceptId);
    if (!concept) return;

    this.novPersConSelectedConcept = concept;

    // Actualizar card
    document.getElementById('nov-pers-con-title').textContent = `[${concept.code}] ${concept.name}`;
    document.getElementById('nov-pers-con-type').textContent = concept.type;
    document.getElementById('nov-pers-con-datatype').textContent = concept.noveltyDataType || 'UNITS';
    document.getElementById('nov-pers-con-calctype').textContent = concept.calculationType;
    document.getElementById('nov-pers-con-formula').textContent = concept.formula || 'Sin fórmula (valor directo)';
    document.getElementById('nov-pers-con-card')?.classList.remove('d-none');

    const addBtn = document.getElementById('btn-nov-pers-con-add');
    if (addBtn) addBtn.disabled = false;

    // Cargar empleados asignados a este concepto
    const spinner = document.getElementById('nov-pers-con-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      const res = await apiRequest(`/employees/by-concept/${conceptId}`);
      const list = res.data || [];
      this.novPersConList = list;
      this.renderNovPersConTable(list);
    } catch (err) {
      showToast(err.message || 'Error al listar empleados con este concepto', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  renderNovPersConTable(assignments) {
    const tbody = document.getElementById('nov-pers-con-table-body');
    const countBadge = document.getElementById('nov-pers-con-count');
    if (countBadge) countBadge.textContent = `${assignments.length} colaborador(es)`;
    if (!tbody) return;

    if (assignments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Ningún colaborador tiene asignado este concepto persistente actualmente.</td></tr>';
      return;
    }

    const c = this.novPersConSelectedConcept || {};

    tbody.innerHTML = assignments
      .map((asg) => {
        const emp = asg.employee || {};
        const formattedVal = formatNoveltyValue(c, asg);
        const notesHtml = asg.notes
          ? `<div class="text-muted text-truncate mt-1" style="font-size: 0.75rem; max-width: 320px;" title="${escapeHtml(asg.notes)}"><i class="ti ti-notes me-1"></i>${escapeHtml(asg.notes)}</div>`
          : '';

        return `
          <tr data-assignment-id="${asg.id}">
            <td><strong class="font-monospace text-primary">${escapeHtml(emp.fileNumber || '-')}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(emp.lastName || '-')}, ${escapeHtml(emp.firstName || '-')}</div>
              <div class="text-muted small">${asg.isActive ? '<span class="text-success">● Activo</span>' : '<span class="text-danger">○ Inactivo</span>'}</div>
              ${notesHtml}
            </td>
            <td>${formatCuit(emp.cuil || '')}</td>
            <td>${escapeHtml(emp.department?.name || '-')}</td>
            <td class="text-end">${formattedVal}</td>
            <td class="text-end text-nowrap">
              <button type="button" class="btn btn-sm btn-icon btn-ghost-primary btn-edit-nov-pers-con" data-id="${asg.id}" title="Modificar asignación">
                <i class="ti ti-edit"></i>
              </button>
              <button type="button" class="btn btn-sm btn-icon btn-ghost-danger btn-del-nov-pers-con" data-id="${asg.id}" data-name="${escapeHtml(emp.lastName || '')}, ${escapeHtml(emp.firstName || '')}" title="Eliminar asignación">
                <i class="ti ti-trash"></i>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-nov-pers-con').forEach((btn) => {
      btn.addEventListener('click', () => {
        const asgId = btn.dataset.id;
        const asg = this.novPersConList.find((a) => a.id === asgId);
        if (asg) this.openPersistentConceptModal({ assignment: asg, concept: this.novPersConSelectedConcept });
      });
    });

    tbody.querySelectorAll('.btn-del-nov-pers-con').forEach((btn) => {
      btn.addEventListener('click', () => {
        const asgId = btn.dataset.id;
        const name = btn.dataset.name;
        this.confirmDeleteAction({
          title: 'Eliminar Asignación',
          message: `¿Estás seguro de que deseas desasignar este concepto a <strong>"${escapeHtml(name)}"</strong>?`,
          onConfirm: async () => {
            await apiRequest(`/employees/by-concept/${this.novPersConSelectedConcept.id}/${asgId}`, { method: 'DELETE' });
            showToast('Asignación eliminada correctamente');
            await this.onNovPersConSelected(this.novPersConSelectedConcept.id);
          },
        });
      });
    });
  }

  // -------------------------------------------------------------------------
  // MODAL: ASIGNACIÓN DE CONCEPTO PERSISTENTE (COMPARTIDO)
  // -------------------------------------------------------------------------

  async openPersistentConceptModal({ assignment = null, employee = null, concept = null } = {}) {
    const form = document.getElementById('form-assign-persistent-concept');
    if (form) form.reset();
    document.getElementById('pers-concept-alert')?.classList.add('d-none');
    document.getElementById('pers-concept-assign-id').value = assignment?.id || '';

    // Manejo de Colaborador
    const empSelect = document.getElementById('pers-concept-employee-select');
    const empStatic = document.getElementById('pers-concept-employee-static');
    const targetEmp = employee || assignment?.employee;

    if (targetEmp) {
      hideSelect(empSelect);
      empSelect.required = false;
      empStatic.classList.remove('d-none');
      empStatic.textContent = `${targetEmp.fileNumber} - ${targetEmp.lastName}, ${targetEmp.firstName} (${formatCuit(targetEmp.cuil)})`;
      empStatic.dataset.empId = targetEmp.id;
    } else {
      empStatic.classList.add('d-none');
      showSelect(empSelect);
      empSelect.required = true;
      const emps = await this.fetchActiveEmployees();
      const empOpts = '<option value="">Seleccione un colaborador...</option>' +
        emps.map((e) => `<option value="${e.id}">${escapeHtml(e.fileNumber)} - ${escapeHtml(e.lastName)}, ${escapeHtml(e.firstName)}</option>`).join('');
      updateSearchableSelect(empSelect, empOpts, '');
    }

    // Manejo de Concepto
    const conSelect = document.getElementById('pers-concept-select');
    const conStatic = document.getElementById('pers-concept-static');
    const targetCon = concept || assignment?.concept;

    const persistentConcepts = await this.fetchIndividualConcepts(true);

    if (targetCon) {
      hideSelect(conSelect);
      conSelect.required = false;
      conStatic.classList.remove('d-none');
      conStatic.textContent = `[${targetCon.code}] ${targetCon.name}`;
      conStatic.dataset.conceptId = targetCon.id;
      this.updatePersistentConceptModalHint(targetCon);
      renderDynamicNoveltyControl('pers-concept-dynamic-container', targetCon, assignment || {});
    } else {
      conStatic.classList.add('d-none');
      showSelect(conSelect);
      conSelect.required = true;
      const conOpts = '<option value="">Seleccione un concepto persistente...</option>' +
        persistentConcepts.map((c) => `<option value="${c.id}">[${escapeHtml(c.code)}] ${escapeHtml(c.name)} (${c.type})</option>`).join('');
      updateSearchableSelect(conSelect, conOpts, '');
      document.getElementById('pers-concept-hint')?.classList.add('d-none');
      renderDynamicNoveltyControl('pers-concept-dynamic-container', null, assignment || {});
    }

    // Valores
    if (assignment) {
      document.getElementById('modal-pers-concept-title').textContent = 'Modificar Concepto Persistente';
      document.getElementById('pers-concept-valid-from').value = assignment.validFrom ? assignment.validFrom.split('T')[0] : '';
      document.getElementById('pers-concept-valid-to').value = assignment.validTo ? assignment.validTo.split('T')[0] : '';
      document.getElementById('pers-concept-notes').value = assignment.notes || '';
      document.getElementById('pers-concept-is-active').checked = assignment.isActive !== false;
    } else {
      document.getElementById('modal-pers-concept-title').textContent = 'Asignar Concepto Persistente';
      document.getElementById('pers-concept-valid-from').value = '';
      document.getElementById('pers-concept-valid-to').value = '';
      document.getElementById('pers-concept-notes').value = '';
      document.getElementById('pers-concept-is-active').checked = true;
    }

    getBootstrapModal(document.getElementById('modal-assign-persistent-concept'))?.show();
  }

  updatePersistentConceptModalHint(concept) {
    const hint = document.getElementById('pers-concept-hint');
    if (!hint || !concept) return;

    hint.classList.remove('d-none');
    document.getElementById('pers-concept-hint-code').textContent = `[${concept.code}] ${concept.name}`;
    document.getElementById('pers-concept-hint-type').textContent = concept.type;
    document.getElementById('pers-concept-hint-datatype').textContent = `Tipo de Entrada: ${concept.noveltyDataType || 'UNITS'} | Cálculo: ${concept.calculationType}`;

    renderDynamicNoveltyControl('pers-concept-dynamic-container', concept, {});
  }

  // -------------------------------------------------------------------------
  // 3. NOVEDADES NO PERSISTENTES - CONCEPTOS POR EMPLEADO (#pane-nov-nopers-emp)
  // -------------------------------------------------------------------------

  async loadNovNoPersEmp() {
    const periodSelect = document.getElementById('nov-nopers-emp-period-select');
    const periodId = periodSelect?.value;
    const isClosed = this.isPeriodClosed(periodId);

    const roAlert = document.getElementById('nov-nopers-emp-readonly-alert');
    if (roAlert) roAlert.classList.toggle('d-none', !isClosed);

    const empSelect = document.getElementById('nov-nopers-emp-select');
    const employees = await this.fetchActiveEmployees();
    if (empSelect) {
      const currentEmp = empSelect.value;
      const empOpts = '<option value="">Seleccione un colaborador...</option>' +
        employees.map((e) => `<option value="${e.id}" ${e.id === currentEmp ? 'selected' : ''}>${escapeHtml(e.fileNumber)} - ${escapeHtml(e.lastName)}, ${escapeHtml(e.firstName)}</option>`).join('');

      updateSearchableSelect(empSelect, empOpts, currentEmp);

      if (currentEmp && periodId) {
        await this.refreshNovNoPersEmpTable(periodId, currentEmp);
      } else {
        this.clearNovNoPersEmpView();
      }
    }
  }

  clearNovNoPersEmpView() {
    const addBtn = document.getElementById('btn-nov-nopers-emp-add');
    const simBtn = document.getElementById('btn-nov-nopers-emp-simulate');
    if (addBtn) addBtn.disabled = true;
    if (simBtn) simBtn.disabled = true;
    const tbody = document.getElementById('nov-nopers-emp-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">Seleccione una liquidación activa y un colaborador para gestionar sus novedades.</td></tr>';
    }
    const countBadge = document.getElementById('nov-nopers-emp-count');
    if (countBadge) countBadge.textContent = '0 novedades';
  }

  async refreshNovNoPersEmpTable(periodId, employeeId) {
    if (!periodId || !employeeId) {
      this.clearNovNoPersEmpView();
      return;
    }

    const isClosed = this.isPeriodClosed(periodId);
    const addBtn = document.getElementById('btn-nov-nopers-emp-add');
    const simBtn = document.getElementById('btn-nov-nopers-emp-simulate');
    if (addBtn) addBtn.disabled = isClosed;
    if (simBtn) simBtn.disabled = false;

    const spinner = document.getElementById('nov-nopers-emp-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      const res = await apiRequest(`/payroll/periods/${periodId}/novelties?employeeId=${employeeId}`);
      const novelties = res.data || [];
      this.novNoPersEmpList = novelties;
      this.renderNovNoPersEmpTable(novelties, isClosed);
    } catch (err) {
      showToast(err.message || 'Error al cargar novedades del período', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  renderNovNoPersEmpTable(novelties, isClosed) {
    const tbody = document.getElementById('nov-nopers-emp-table-body');
    const countBadge = document.getElementById('nov-nopers-emp-count');
    if (countBadge) countBadge.textContent = `${novelties.length} novedad(es)`;
    if (!tbody) return;

    if (novelties.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No se registraron novedades para este colaborador en el período.</td></tr>';
      return;
    }

    tbody.innerHTML = novelties
      .map((nov) => {
        const c = nov.concept || {};
        const typeBadge = c.type === 'REMUNERATIVE'
          ? '<span class="badge bg-blue-lt">Remun.</span>'
          : c.type === 'NON_REMUNERATIVE'
          ? '<span class="badge bg-azure-lt">No Remun.</span>'
          : '<span class="badge bg-red-lt">Retención</span>';

        const formattedVal = formatNoveltyValue(c, nov);
        const notesHtml = nov.notes
          ? `<div class="text-muted text-truncate mt-1" style="font-size: 0.75rem; max-width: 320px;" title="${escapeHtml(nov.notes)}"><i class="ti ti-notes me-1"></i>${escapeHtml(nov.notes)}</div>`
          : '';

        return `
          <tr data-novelty-id="${nov.id}">
            <td><strong class="font-monospace text-azure">${escapeHtml(c.code || '-')}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(c.name || '-')}</div>
              ${notesHtml}
            </td>
            <td>${typeBadge}</td>
            <td class="text-end">${formattedVal}</td>
            <td class="text-end text-nowrap">
              <button type="button" class="btn btn-sm btn-icon btn-ghost-primary btn-edit-period-nov" data-id="${nov.id}" ${isClosed ? 'disabled' : ''} title="Editar">
                <i class="ti ti-edit"></i>
              </button>
              <button type="button" class="btn btn-sm btn-icon btn-ghost-danger btn-del-period-nov" data-id="${nov.id}" data-name="${escapeHtml(c.name || '')}" ${isClosed ? 'disabled' : ''} title="Eliminar">
                <i class="ti ti-trash"></i>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-period-nov').forEach((btn) => {
      btn.addEventListener('click', () => {
        const novId = btn.dataset.id;
        const nov = this.novNoPersEmpList.find((n) => n.id === novId);
        if (nov) this.openPeriodNoveltyModal({ novelty: nov });
      });
    });

    tbody.querySelectorAll('.btn-del-period-nov').forEach((btn) => {
      btn.addEventListener('click', () => {
        const novId = btn.dataset.id;
        const name = btn.dataset.name;
        const periodId = document.getElementById('nov-nopers-emp-period-select')?.value;
        const empId = document.getElementById('nov-nopers-emp-select')?.value;
        this.confirmDeleteAction({
          title: 'Eliminar Novedad del Período',
          message: `¿Estás seguro de que deseas eliminar la novedad <strong>"${escapeHtml(name)}"</strong>?`,
          onConfirm: async () => {
            await apiRequest(`/payroll/periods/${periodId}/novelties/${novId}`, { method: 'DELETE' });
            showToast('Novedad eliminada correctamente');
            await this.refreshNovNoPersEmpTable(periodId, empId);
          },
        });
      });
    });
  }

  // -------------------------------------------------------------------------
  // 4. NOVEDADES NO PERSISTENTES - EMPLEADOS POR CONCEPTO (#pane-nov-nopers-con)
  // -------------------------------------------------------------------------

  async loadNovNoPersCon() {
    const periodSelect = document.getElementById('nov-nopers-con-period-select');
    const periodId = periodSelect?.value;
    const isClosed = this.isPeriodClosed(periodId);

    const roAlert = document.getElementById('nov-nopers-con-readonly-alert');
    if (roAlert) roAlert.classList.toggle('d-none', !isClosed);

    const conSelect = document.getElementById('nov-nopers-con-select');
    const concepts = await this.fetchIndividualConcepts(false);
    if (conSelect) {
      const currentCon = conSelect.value;
      const optsHtml = '<option value="">Seleccione un concepto...</option>' +
        concepts.map((c) => `<option value="${c.id}" ${c.id === currentCon ? 'selected' : ''}>[${escapeHtml(c.code)}] ${escapeHtml(c.name)} (${c.type})</option>`).join('');

      updateSearchableSelect(conSelect, optsHtml, currentCon);

      if (currentCon && periodId) {
        await this.refreshNovNoPersConTable(periodId, currentCon);
      } else {
        this.clearNovNoPersConView();
      }
    }
  }

  clearNovNoPersConView() {
    const addBtn = document.getElementById('btn-nov-nopers-con-add');
    const batchBtn = document.getElementById('btn-nov-nopers-con-batch-sheet');
    const importBtn = document.getElementById('btn-nov-nopers-con-import-excel');
    if (addBtn) addBtn.disabled = true;
    if (batchBtn) batchBtn.disabled = true;
    if (importBtn) importBtn.disabled = true;

    const tbody = document.getElementById('nov-nopers-con-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Seleccione una liquidación y un concepto no persistente para visualizar las novedades cargadas.</td></tr>';
    }
    const countBadge = document.getElementById('nov-nopers-con-count');
    if (countBadge) countBadge.textContent = '0 colaboradores';
  }

  async refreshNovNoPersConTable(periodId, conceptId) {
    if (!periodId || !conceptId) {
      this.clearNovNoPersConView();
      return;
    }

    const isClosed = this.isPeriodClosed(periodId);
    const addBtn = document.getElementById('btn-nov-nopers-con-add');
    const batchBtn = document.getElementById('btn-nov-nopers-con-batch-sheet');
    const importBtn = document.getElementById('btn-nov-nopers-con-import-excel');
    if (addBtn) addBtn.disabled = isClosed;
    if (batchBtn) batchBtn.disabled = isClosed;
    if (importBtn) importBtn.disabled = isClosed;

    const spinner = document.getElementById('nov-nopers-con-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      if (!this.novNoPersConSelectedConcept || this.novNoPersConSelectedConcept.id !== conceptId) {
        const concepts = await this.fetchIndividualConcepts(false);
        this.novNoPersConSelectedConcept = concepts.find((c) => c.id === conceptId) || null;
      }

      const res = await apiRequest(`/payroll/periods/${periodId}/novelties?conceptId=${conceptId}`);
      const novelties = res.data || [];
      this.novNoPersConList = novelties;
      this.renderNovNoPersConTable(novelties, isClosed);
    } catch (err) {
      showToast(err.message || 'Error al cargar novedades del concepto en el período', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  renderNovNoPersConTable(novelties, isClosed) {
    const tbody = document.getElementById('nov-nopers-con-table-body');
    const countBadge = document.getElementById('nov-nopers-con-count');
    if (countBadge) countBadge.textContent = `${novelties.length} colaborador(es)`;
    if (!tbody) return;

    if (novelties.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No se registran novedades para este concepto en el período seleccionado.</td></tr>';
      return;
    }

    const c = this.novNoPersConSelectedConcept || (novelties[0] ? novelties[0].concept : {});

    tbody.innerHTML = novelties
      .map((nov) => {
        const emp = nov.employee || {};
        const formattedVal = formatNoveltyValue(c, nov);
        const notesHtml = nov.notes
          ? `<div class="text-muted text-truncate mt-1" style="font-size: 0.75rem; max-width: 320px;" title="${escapeHtml(nov.notes)}"><i class="ti ti-notes me-1"></i>${escapeHtml(nov.notes)}</div>`
          : '';

        return `
          <tr data-novelty-id="${nov.id}">
            <td><strong class="font-monospace text-primary">${escapeHtml(emp.fileNumber || '-')}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(emp.lastName || '-')}, ${escapeHtml(emp.firstName || '-')}</div>
              ${notesHtml}
            </td>
            <td>${formatCuit(emp.cuil || '')}</td>
            <td>${escapeHtml(emp.department?.name || '-')}</td>
            <td class="text-end">${formattedVal}</td>
            <td class="text-end text-nowrap">
              <button type="button" class="btn btn-sm btn-icon btn-ghost-primary btn-edit-period-con-nov" data-id="${nov.id}" ${isClosed ? 'disabled' : ''} title="Editar">
                <i class="ti ti-edit"></i>
              </button>
              <button type="button" class="btn btn-sm btn-icon btn-ghost-danger btn-del-period-con-nov" data-id="${nov.id}" data-name="${escapeHtml(emp.lastName || '')}, ${escapeHtml(emp.firstName || '')}" ${isClosed ? 'disabled' : ''} title="Eliminar">
                <i class="ti ti-trash"></i>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-period-con-nov').forEach((btn) => {
      btn.addEventListener('click', () => {
        const novId = btn.dataset.id;
        const nov = this.novNoPersConList.find((n) => n.id === novId);
        if (nov) this.openPeriodNoveltyModal({ novelty: nov });
      });
    });

    tbody.querySelectorAll('.btn-del-period-con-nov').forEach((btn) => {
      btn.addEventListener('click', () => {
        const novId = btn.dataset.id;
        const name = btn.dataset.name;
        const periodId = document.getElementById('nov-nopers-con-period-select')?.value;
        const conceptId = document.getElementById('nov-nopers-con-select')?.value;
        this.confirmDeleteAction({
          title: 'Eliminar Novedad del Período',
          message: `¿Estás seguro de que deseas eliminar la novedad cargada para <strong>"${escapeHtml(name)}"</strong>?`,
          onConfirm: async () => {
            await apiRequest(`/payroll/periods/${periodId}/novelties/${novId}`, { method: 'DELETE' });
            showToast('Novedad eliminada correctamente');
            await this.refreshNovNoPersConTable(periodId, conceptId);
          },
        });
      });
    });
  }

  // -------------------------------------------------------------------------
  // MODAL: CARGA / EDICIÓN DE NOVEDAD NO PERSISTENTE (COMPARTIDO)
  // -------------------------------------------------------------------------

  async openPeriodNoveltyModal({ novelty = null, employeeId = null, conceptId = null, periodId = null } = {}) {
    const form = document.getElementById('form-period-novelty');
    if (form) form.reset();
    document.getElementById('period-novelty-alert')?.classList.add('d-none');

    const effectivePeriodId = periodId || novelty?.payrollPeriodId || this.activePayrollPeriodId || document.getElementById('nov-nopers-emp-period-select')?.value || document.getElementById('nov-nopers-con-period-select')?.value;
    document.getElementById('period-novelty-id').value = novelty?.id || '';
    document.getElementById('period-novelty-period-id').value = effectivePeriodId || '';

    const periodObj = (this.payrollPeriods || []).find((p) => p.id === effectivePeriodId);
    const periodName = periodObj ? `${periodObj.settlementName} (${String(periodObj.month).padStart(2, '0')}/${periodObj.year})` : '';
    const subtitleEl = document.getElementById('modal-period-novelty-subtitle');
    if (subtitleEl) {
      subtitleEl.innerHTML = periodName
        ? `<span class="badge bg-blue-lt text-blue me-1"><i class="ti ti-calendar me-1"></i>${escapeHtml(periodName)}</span> <span class="text-muted">Novedad individual no persistente</span>`
        : 'Novedad individual no persistente';
    }

    // Manejo de Colaborador
    const empSelect = document.getElementById('period-novelty-employee-select');
    const empStatic = document.getElementById('period-novelty-employee-static');
    const targetEmpId = employeeId || novelty?.employeeId || document.getElementById('nov-nopers-emp-select')?.value;
    const employees = await this.fetchActiveEmployees();

    if (targetEmpId) {
      const emp = employees.find((e) => e.id === targetEmpId);
      hideSelect(empSelect);
      empSelect.required = false;
      empStatic.classList.remove('d-none');
      empStatic.textContent = emp ? `${emp.fileNumber} - ${emp.lastName}, ${emp.firstName}` : targetEmpId;
      empStatic.dataset.empId = targetEmpId;
    } else {
      empStatic.classList.add('d-none');
      showSelect(empSelect);
      empSelect.required = true;
      const empOpts = '<option value="">Seleccione un colaborador...</option>' +
        employees.map((e) => `<option value="${e.id}">${escapeHtml(e.fileNumber)} - ${escapeHtml(e.lastName)}, ${escapeHtml(e.firstName)}</option>`).join('');
      updateSearchableSelect(empSelect, empOpts, '');
    }

    // Manejo de Concepto
    const conSelect = document.getElementById('period-novelty-concept-select');
    const conStatic = document.getElementById('period-novelty-concept-static');
    const targetConId = conceptId || novelty?.conceptId || document.getElementById('nov-nopers-con-select')?.value;
    const nonPersConcepts = await this.fetchIndividualConcepts(false);

    if (targetConId) {
      const con = nonPersConcepts.find((c) => c.id === targetConId) || novelty?.concept;
      hideSelect(conSelect);
      conSelect.required = false;
      conStatic.classList.remove('d-none');
      conStatic.textContent = con ? `[${con.code}] ${con.name}` : targetConId;
      conStatic.dataset.conceptId = targetConId;
      this.updatePeriodNoveltyModalHint(con);
      renderDynamicNoveltyControl('period-novelty-dynamic-container', con, novelty || {});
    } else {
      conStatic.classList.add('d-none');
      showSelect(conSelect);
      conSelect.required = true;
      const conOpts = '<option value="">Seleccione un concepto no persistente...</option>' +
        nonPersConcepts.map((c) => `<option value="${c.id}">[${escapeHtml(c.code)}] ${escapeHtml(c.name)} (${c.type})</option>`).join('');
      updateSearchableSelect(conSelect, conOpts, '');
      document.getElementById('period-novelty-concept-hint')?.classList.add('d-none');
      renderDynamicNoveltyControl('period-novelty-dynamic-container', null, novelty || {});
    }

    // Valores
    if (novelty) {
      document.getElementById('modal-period-novelty-title').textContent = 'Editar Novedad del Período';
      document.getElementById('period-novelty-notes').value = novelty.notes || '';
    } else {
      document.getElementById('modal-period-novelty-title').textContent = 'Cargar Novedad del Período';
      document.getElementById('period-novelty-notes').value = '';
    }

    getBootstrapModal(document.getElementById('modal-period-novelty-form'))?.show();
  }

  updatePeriodNoveltyModalHint(concept) {
    const hint = document.getElementById('period-novelty-concept-hint');
    if (!hint || !concept) return;

    hint.classList.remove('d-none');
    document.getElementById('period-novelty-hint-code').textContent = `[${concept.code}] ${concept.name}`;
    document.getElementById('period-novelty-hint-type').textContent = concept.type;
    document.getElementById('period-novelty-hint-datatype').textContent = `Tipo de Entrada: ${concept.noveltyDataType || 'UNITS'} | Cálculo: ${concept.calculationType}`;

    renderDynamicNoveltyControl('period-novelty-dynamic-container', concept, {});
  }

  // -------------------------------------------------------------------------
  // 5. PLANILLA ÁGIL DE CARGA RÁPIDA (#modal-novelty-batch-sheet)
  // -------------------------------------------------------------------------

  async openBatchSheetModal() {
    const periodId = document.getElementById('nov-nopers-con-period-select')?.value;
    const conceptId = document.getElementById('nov-nopers-con-select')?.value;
    if (!periodId || !conceptId) {
      showToast('Seleccione una liquidación y un concepto para abrir la planilla ágil', 'warning');
      return;
    }

    const concepts = await this.fetchIndividualConcepts(false);
    const concept = concepts.find((c) => c.id === conceptId);
    const period = this.payrollPeriods.find((p) => p.id === periodId);

    this.batchSheetConcept = concept;
    this.batchSheetPeriod = period;

    // Badges en cabecera
    document.getElementById('batch-sheet-period-badge').textContent = period ? `${String(period.month).padStart(2, '0')}/${period.year} - ${period.settlementName}` : '';
    document.getElementById('batch-sheet-concept-badge').textContent = concept ? `[${concept.code}] ${concept.name}` : '';

    // Encabezado de columna dinámico
    const valHeader = document.getElementById('batch-sheet-col-val-header');
    if (valHeader) {
      if (concept?.noveltyDataType === 'HOURS') valHeader.textContent = 'Horas';
      else if (concept?.noveltyDataType === 'PERCENTAGE') valHeader.textContent = '% Porc.';
      else if (concept?.noveltyDataType === 'AMOUNT' || concept?.noveltyDataType === 'IMPORTE') valHeader.textContent = 'Importe ($)';
      else valHeader.textContent = 'Valor / Cantidad';
    }

    const employees = await this.fetchActiveEmployees();
    this.batchSheetEmployees = employees;

    // Cargar novedades existentes para pre-llenar
    const res = await apiRequest(`/payroll/periods/${periodId}/novelties?conceptId=${conceptId}`);
    const existingNovelties = res.data || [];
    const novMap = new Map();
    existingNovelties.forEach((n) => novMap.set(n.employeeId, n));

    const tbody = document.getElementById('batch-sheet-tbody');
    if (!tbody) return;

    tbody.innerHTML = employees
      .map((emp, index) => {
        const existing = novMap.get(emp.id);
        const isAmt = concept?.noveltyDataType === 'AMOUNT' || concept?.noveltyDataType === 'IMPORTE' || concept?.calculationType === 'FIXED_AMOUNT';
        const initVal = existing ? (isAmt ? existing.amount : existing.units) : '';
        const initNotes = existing ? (existing.notes || '') : '';
        const isFilled = initVal !== '' && initVal !== null && initVal !== undefined;

        return `
          <tr data-emp-id="${emp.id}" data-row-index="${index}" class="batch-sheet-row">
            <td><strong class="font-monospace text-primary">${escapeHtml(emp.fileNumber)}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}</div>
            </td>
            <td>${formatCuit(emp.cuil)}</td>
            <td>${escapeHtml(emp.department?.name || '-')}</td>
            <td class="text-center">
              <input type="number" step="0.01" min="0" 
                class="form-control form-control-sm text-end font-monospace batch-sheet-val" 
                placeholder="0.00" 
                value="${initVal !== '' && initVal !== null ? initVal : ''}" 
                data-emp-id="${emp.id}" 
                data-index="${index}" />
            </td>
            <td>
              <input type="text" maxlength="255" 
                class="form-control form-control-sm batch-sheet-notes" 
                placeholder="Observaciones..." 
                value="${escapeHtml(initNotes)}" 
                data-emp-id="${emp.id}" 
                data-index="${index}" />
            </td>
            <td class="text-center batch-sheet-status-cell">
              ${isFilled ? '<span class="badge bg-success-lt">Cargado</span>' : '<span class="badge bg-secondary-lt">Pendiente</span>'}
            </td>
          </tr>
        `;
      })
      .join('');

    this.updateBatchSheetStats();

    // Navegación con teclado por Enter y Flechas
    tbody.querySelectorAll('.batch-sheet-val').forEach((input) => {
      input.addEventListener('keydown', (e) => {
        const idx = Number(input.dataset.index);
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
          e.preventDefault();
          const next = tbody.querySelector(`.batch-sheet-val[data-index="${idx + 1}"]`);
          if (next) {
            next.focus();
            next.select();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = tbody.querySelector(`.batch-sheet-val[data-index="${idx - 1}"]`);
          if (prev) {
            prev.focus();
            prev.select();
          }
        }
      });

      input.addEventListener('input', () => {
        const tr = input.closest('tr');
        const statusCell = tr?.querySelector('.batch-sheet-status-cell');
        const hasVal = input.value.trim() !== '';
        if (statusCell) {
          statusCell.innerHTML = hasVal ? '<span class="badge bg-success-lt">Cargado</span>' : '<span class="badge bg-secondary-lt">Pendiente</span>';
        }
        this.updateBatchSheetStats();
      });
    });

    getBootstrapModal(document.getElementById('modal-novelty-batch-sheet'))?.show();
  }

  updateBatchSheetStats() {
    const inputs = document.querySelectorAll('.batch-sheet-val');
    let filled = 0;
    inputs.forEach((inp) => {
      if (inp.value.trim() !== '' && Number(inp.value) > 0) filled++;
    });
    const statsEl = document.getElementById('batch-sheet-stats');
    if (statsEl) statsEl.textContent = `${filled} con valor cargado`;
  }

  async saveBatchSheet() {
    if (!this.batchSheetPeriod || !this.batchSheetConcept) return;

    const rows = document.querySelectorAll('#batch-sheet-tbody tr[data-emp-id]');
    const novelties = [];
    const isAmt = this.batchSheetConcept.noveltyDataType === 'AMOUNT' || this.batchSheetConcept.noveltyDataType === 'IMPORTE' || this.batchSheetConcept.calculationType === 'FIXED_AMOUNT';

    rows.forEach((row) => {
      const empId = row.dataset.empId;
      const valInput = row.querySelector('.batch-sheet-val');
      const notesInput = row.querySelector('.batch-sheet-notes');

      const valStr = valInput?.value.trim();
      const notesStr = notesInput?.value.trim();

      if (valStr !== '' || notesStr !== '') {
        const numVal = Number(valStr) || 0;
        novelties.push({
          employeeId: empId,
          conceptId: this.batchSheetConcept.id,
          units: isAmt ? 1 : numVal,
          amount: isAmt ? numVal : null,
          notes: notesStr || null,
        });
      }
    });

    if (novelties.length === 0) {
      showToast('No se ingresaron novedades para guardar en la planilla', 'warning');
      return;
    }

    const saveBtn = document.getElementById('btn-save-batch-sheet');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
    }

    try {
      const res = await apiRequest(`/payroll/periods/${this.batchSheetPeriod.id}/novelties/batch`, {
        method: 'POST',
        body: JSON.stringify({ novelties }),
      });

      showToast(`¡Planilla guardada exitosamente! ${res.processedCount} novedades registradas`);
      getBootstrapModal(document.getElementById('modal-novelty-batch-sheet'))?.hide();
      await this.refreshNovNoPersConTable(this.batchSheetPeriod.id, this.batchSheetConcept.id);
    } catch (err) {
      showToast(err.message || 'Error al guardar lote de novedades', 'danger');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Lote de Novedades';
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. IMPORTADOR DE NOVEDADES DESDE EXCEL / CSV (#modal-novelties-import-excel)
  // -------------------------------------------------------------------------

  async openExcelImportModal() {
    const periodId = document.getElementById('nov-nopers-con-period-select')?.value;
    const conceptId = document.getElementById('nov-nopers-con-select')?.value;
    if (!periodId || !conceptId) {
      showToast('Seleccione una liquidación y un concepto para importar novedades', 'warning');
      return;
    }

    const concepts = await this.fetchIndividualConcepts(false);
    const concept = concepts.find((c) => c.id === conceptId);
    const period = this.payrollPeriods.find((p) => p.id === periodId);

    this.excelImportConcept = concept;
    this.excelImportPeriod = period;
    this.excelImportValidRows = [];

    document.getElementById('modal-import-excel-subtitle').textContent = `Período: ${period ? period.settlementName : ''} | Concepto: [${concept?.code}] ${concept?.name}`;
    document.getElementById('novelties-file-input').value = '';
    document.getElementById('novelties-import-alert')?.classList.add('d-none');
    document.getElementById('novelties-import-preview-section')?.classList.add('d-none');
    document.getElementById('btn-confirm-import-novelties').disabled = true;

    getBootstrapModal(document.getElementById('modal-novelties-import-excel'))?.show();
  }

  downloadNoveltyTemplateCsv() {
    if (!this.excelImportConcept) return;

    const employees = this.batchSheetEmployees || [];
    let csvContent = 'Legajo;CUIL;Valor;Observaciones\r\n';

    employees.forEach((e) => {
      csvContent += `"${e.fileNumber}";"${e.cuil}";0;""\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `plantilla_novedades_${this.excelImportConcept.code}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async handleNoveltiesFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const alertBox = document.getElementById('novelties-import-alert');
    if (alertBox) alertBox.classList.add('d-none');

    try {
      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!json || json.length === 0) {
        throw new Error('El archivo seleccionado no contiene filas de datos.');
      }

      await this.processImportedNoveltyRows(json);
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = `Error al procesar archivo: ${err.message}`;
        alertBox.classList.remove('d-none');
      }
    }
  }

  async processImportedNoveltyRows(rows) {
    const employees = await this.fetchActiveEmployees();
    const empByFile = new Map();
    const empByCuil = new Map();
    employees.forEach((e) => {
      if (e.fileNumber) empByFile.set(String(e.fileNumber).trim().toLowerCase(), e);
      if (e.cuil) {
        const cleanCuil = String(e.cuil).replace(/[^0-9]/g, '');
        empByCuil.set(cleanCuil, e);
      }
    });

    const validRows = [];
    let errorCount = 0;
    const previewTbody = document.getElementById('novelties-import-preview-body');
    if (!previewTbody) return;

    const previewHtml = rows
      .map((row) => {
        // Encontrar columnas dinámicas
        let legajoVal = '';
        let cuilVal = '';
        let numVal = 0;
        let notesVal = '';

        for (const [key, val] of Object.entries(row)) {
          const k = key.trim().toLowerCase();
          if (k.includes('legajo') || k === 'file') legajoVal = String(val).trim();
          else if (k.includes('cuil') || k.includes('cuit')) cuilVal = String(val).trim();
          else if (k.includes('valor') || k.includes('importe') || k.includes('horas') || k.includes('cant')) numVal = Number(val) || 0;
          else if (k.includes('obs') || k.includes('nota') || k.includes('aclar')) notesVal = String(val).trim();
        }

        // Emparejar empleado
        let matchedEmp = null;
        if (legajoVal && empByFile.has(legajoVal.toLowerCase())) {
          matchedEmp = empByFile.get(legajoVal.toLowerCase());
        } else if (cuilVal) {
          const clean = cuilVal.replace(/[^0-9]/g, '');
          if (empByCuil.has(clean)) matchedEmp = empByCuil.get(clean);
        }

        const isValid = matchedEmp && (numVal > 0 || notesVal !== '');
        if (isValid) {
          validRows.push({
            employeeId: matchedEmp.id,
            conceptId: this.excelImportConcept.id,
            units: (this.excelImportConcept.noveltyDataType === 'AMOUNT' || this.excelImportConcept.noveltyDataType === 'IMPORTE') ? 1 : numVal,
            amount: (this.excelImportConcept.noveltyDataType === 'AMOUNT' || this.excelImportConcept.noveltyDataType === 'IMPORTE') ? numVal : null,
            notes: notesVal || null,
          });
        } else {
          errorCount++;
        }

        const statusBadge = matchedEmp
          ? (isValid ? '<span class="badge bg-success-lt">Válido</span>' : '<span class="badge bg-warning-lt">Sin Valor</span>')
          : '<span class="badge bg-danger-lt">No Encontrado</span>';

        return `
          <tr>
            <td><strong>${escapeHtml(legajoVal || '-')}</strong></td>
            <td>${matchedEmp ? `${escapeHtml(matchedEmp.lastName)}, ${escapeHtml(matchedEmp.firstName)}` : '<em class="text-danger">Colaborador no existe</em>'}</td>
            <td class="text-end font-monospace">${formatNumber(numVal)}</td>
            <td><small class="text-muted">${escapeHtml(notesVal || '-')}</small></td>
            <td class="text-center">${statusBadge}</td>
          </tr>
        `;
      })
      .join('');

    previewTbody.innerHTML = previewHtml;
    this.excelImportValidRows = validRows;

    document.getElementById('import-preview-valid-count').textContent = `${validRows.length} válidos`;
    document.getElementById('import-preview-error-count').textContent = `${errorCount} con error o sin valor`;
    document.getElementById('novelties-import-preview-section')?.classList.remove('d-none');

    const confirmBtn = document.getElementById('btn-confirm-import-novelties');
    if (confirmBtn) confirmBtn.disabled = validRows.length === 0;
  }

  async confirmImportNovelties() {
    if (!this.excelImportPeriod || !this.excelImportConcept || this.excelImportValidRows.length === 0) return;

    const confirmBtn = document.getElementById('btn-confirm-import-novelties');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Importando...';
    }

    try {
      const res = await apiRequest(`/payroll/periods/${this.excelImportPeriod.id}/novelties/batch`, {
        method: 'POST',
        body: JSON.stringify({ novelties: this.excelImportValidRows }),
      });

      showToast(`¡Importación completada! Se registraron ${res.processedCount} novedades`);
      getBootstrapModal(document.getElementById('modal-novelties-import-excel'))?.hide();
      await this.refreshNovNoPersConTable(this.excelImportPeriod.id, this.excelImportConcept.id);
    } catch (err) {
      showToast(err.message || 'Error al importar archivo de novedades', 'danger');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="ti ti-upload me-1"></i> Importar Novedades al Período';
      }
    }
  }

  // -------------------------------------------------------------------------
  // 7. SIMULACIÓN DE RECIBO PROVISORIO EN VIVO (#modal-simulate-payslip)
  // -------------------------------------------------------------------------

  async openSimulatePayslipModal(employeeId, periodId) {
    if (!employeeId || !periodId) {
      showToast('Seleccione un colaborador y una liquidación para simular el recibo', 'warning');
      return;
    }

    const employees = await this.fetchActiveEmployees();
    const emp = employees.find((e) => e.id === employeeId);
    const period = this.payrollPeriods.find((p) => p.id === periodId);

    document.getElementById('sim-payslip-subtitle').textContent = `Colaborador: ${emp ? `${emp.lastName}, ${emp.firstName}` : ''} | Liquidación: ${period ? period.settlementName : ''}`;
    document.getElementById('sim-payslip-gross').textContent = '$0,00';
    document.getElementById('sim-payslip-non-rem').textContent = '$0,00';
    document.getElementById('sim-payslip-deductions').textContent = '$0,00';
    document.getElementById('sim-payslip-net').textContent = '$0,00';

    const tbody = document.getElementById('sim-payslip-tbody');
    if (tbody) tbody.innerHTML = '';

    const spinner = document.getElementById('sim-payslip-spinner');
    if (spinner) spinner.classList.remove('d-none');

    getBootstrapModal(document.getElementById('modal-simulate-payslip'))?.show();

    try {
      const res = await apiRequest(`/payroll/periods/${periodId}/calculate-single/${employeeId}`, {
        method: 'POST',
      });

      const slip = res.data.paySlip || {};
      document.getElementById('sim-payslip-gross').textContent = `$${formatNumber(slip.grossSalary || res.data.totalGross)}`;
      document.getElementById('sim-payslip-non-rem').textContent = `$${formatNumber(slip.nonRemunerativeSalary || 0)}`;
      document.getElementById('sim-payslip-deductions').textContent = `$${formatNumber(slip.deductionsTotal || res.data.totalDeductions)}`;
      document.getElementById('sim-payslip-net').textContent = `$${formatNumber(slip.netSalary || res.data.totalNet)}`;

      const items = slip.items || [];
      if (tbody) {
        tbody.innerHTML = items
          .map((item) => {
            const isRem = item.conceptType === 'REMUNERATIVE';
            const isNonRem = item.conceptType === 'NON_REMUNERATIVE';
            const isDed = item.conceptType === 'DEDUCTION';

            return `
              <tr>
                <td><strong class="font-monospace">${escapeHtml(item.conceptCode)}</strong></td>
                <td>${escapeHtml(item.conceptName)}</td>
                <td class="text-center font-monospace">${item.units ? formatNumber(item.units) : '-'}</td>
                <td class="text-end font-monospace">${isRem ? `$${formatNumber(item.amount)}` : '-'}</td>
                <td class="text-end font-monospace text-azure">${isNonRem ? `$${formatNumber(item.amount)}` : '-'}</td>
                <td class="text-end font-monospace text-danger">${isDed ? `$${formatNumber(item.amount)}` : '-'}</td>
              </tr>
            `;
          })
          .join('');
      }
    } catch (err) {
      showToast(err.message || 'Error al simular recibo', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  // -------------------------------------------------------------------------
  // 8. PROCESO DE LIQUIDACIÓN (#pane-payroll-settlement)
  // -------------------------------------------------------------------------

  async loadSettlementView() {
    const periodSelect = document.getElementById('settlement-period-select');
    const periodId = periodSelect?.value;
    if (!periodId) {
      this.clearSettlementView();
      return;
    }

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
        apiRequest(`/payroll/periods/${periodId}/slips?limit=1000`),
        apiRequest('/departments?limit=500'),
      ]);

      this.settlementEmployees = employees;
      this.settlementSlips = slipsRes.data || [];
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
        showToast('El colaborador no registra conceptos a liquidar en este período (no se generó recibo vacío).', 'warning');
      } else {
        this.showOmittedAlert(0, res.data.processedEmployees || 0, []);
        showToast(`¡Liquidación completada para el colaborador! Neto: $${formatNumber(res.data.totalNet)}`);
      }
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
        showToast(
          `Liquidación en lote: ${res.data.processedEmployees} recibo(s) generados. Se omitieron ${res.data.omittedEmployeesCount} legajo(s) por no registrar conceptos a liquidar.`,
          'info'
        );
      } else {
        showToast(`¡Liquidación en lote completada para ${res.data.processedEmployees} empleado(s)! Total Neto: $${formatNumber(res.data.totalNet)}`);
      }
      await this.loadSettlementView();
    } catch (err) {
      showToast(err.message || 'Error al liquidar lote de empleados', 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-calculator me-1"></i> Liquidar Selección';
    }
  }

  async calculateAllEmployees() {
    const periodId = document.getElementById('settlement-period-select')?.value;
    if (!periodId) {
      showToast('Seleccione una liquidación para procesar', 'warning');
      return;
    }

    const period = this.payrollPeriods.find((p) => p.id === periodId);
    if (!confirm(`¿Iniciar Liquidación General de toda la nómina para "${period?.settlementName || ''}"? Este proceso calculará o actualizará los recibos de todos los empleados activos.`)) {
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
      perSelectCon.addEventListener('change', () => {
        this.activePayrollPeriodId = perSelectCon.value;
        this.refreshNovNoPersConTable(perSelectCon.value, conSelect?.value);
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
        const concepts = await this.fetchIndividualConcepts(false);
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
        document.getElementById('side-payroll-settlement')?.click();
        const periodId = document.getElementById('nov-nopers-emp-period-select')?.value;
        const empId = document.getElementById('nov-nopers-emp-select')?.value;
        const settlePeriodSelect = document.getElementById('settlement-period-select');
        if (settlePeriodSelect && periodId) settlePeriodSelect.value = periodId;
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
    const periodSelect = document.getElementById('settlement-period-select');
    if (periodSelect) {
      periodSelect.addEventListener('change', () => {
        this.activePayrollPeriodId = periodSelect.value;
        this.showOmittedAlert(0, 0, []);
        this.loadSettlementView();
      });
    }

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
      tbody.innerHTML = '<tr><td colspan="3" class="text-center py-3 text-muted">No se registran colaboradores omitidos.</td></tr>';
    } else {
      tbody.innerHTML = this.lastOmittedEmployees.map((o) => `
        <tr>
          <td><strong class="font-monospace text-primary">${escapeHtml(o.fileNumber || '-')}</strong></td>
          <td><span class="fw-bold text-dark">${escapeHtml(o.name || '-')}</span></td>
          <td class="text-end text-muted small">${escapeHtml(o.reason || 'Sin conceptos liquidados')}</td>
        </tr>
      `).join('');
    }

    getBootstrapModal(document.getElementById('modal-omitted-employees'))?.show();
  }

  // --- Recibos de Sueldo ---

  async loadPayrollSlips(periodId) {
    if (!periodId) return;

    const spinner = document.getElementById('slips-spinner');
    if (spinner) spinner.classList.remove('d-none');

    const searchInput = document.getElementById('slips-search-input');
    const deptFilter = document.getElementById('slips-department-filter');

    const query = new URLSearchParams({
      page: String(this.payrollSlipsPage),
      limit: String(this.payrollSlipsPageSize),
    });
    if (searchInput?.value?.trim()) query.append('search', searchInput.value.trim());
    if (deptFilter?.value && deptFilter.value !== 'ALL') query.append('departmentId', deptFilter.value);

    try {
      const res = await apiRequest(`/payroll/periods/${periodId}/slips?${query.toString()}`);
      this.payrollSlips = res.data || [];
      const badge = document.getElementById('payroll-badge-slips-count');
      if (badge) badge.textContent = res.meta?.total || this.payrollSlips.length;

      this.renderPayrollSlipsTable(this.payrollSlips);
      this.renderPayrollSlipsPagination(res.meta || { total: this.payrollSlips.length, page: 1, totalPages: 1 });
    } catch (err) {
      showToast(err.message || 'Error al cargar recibos', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  renderPayrollSlipsTable(slips) {
    const tbody = document.getElementById('slips-table-body');
    if (!tbody) return;

    if (slips.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-muted">
            <i class="ti ti-receipt-off fs-1 d-block mb-2 text-secondary"></i>
            No se encontraron recibos calculados para este período.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = slips
      .map((s) => {
        const emp = s.employee || {};
        const bruto = Number(s.grossSalary || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const retenciones = Number(s.totalDeductions || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const neto = Number(s.netSalary || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const initials = ((emp.firstName?.[0] || '') + (emp.lastName?.[0] || '')).toUpperCase() || 'EM';

        return `
          <tr>
            <td>
              <div class="d-flex align-items-center">
                <span class="avatar avatar-sm rounded-circle bg-primary-lt text-primary fw-bold me-2 flex-shrink-0" style="width: 32px; height: 32px; font-size: 0.75rem;">
                  ${escapeHtml(initials)}
                </span>
                <div class="text-truncate" style="max-width: 220px;">
                  <div class="fw-bold text-dark text-truncate" title="${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}">
                    ${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}
                  </div>
                  <div class="small text-muted d-flex align-items-center gap-1 font-monospace" style="font-size: 0.72rem;">
                    <span class="badge bg-blue-lt px-1 py-0" style="font-size: 0.68rem;">Leg. ${escapeHtml(emp.fileNumber || '-')}</span>
                    <span>${formatCuit(emp.cuil)}</span>
                  </div>
                </div>
              </div>
            </td>
            <td>
              <div class="text-truncate" style="max-width: 170px;">
                <div class="fw-semibold text-dark text-truncate" title="${escapeHtml(emp.department?.name || '-')}">
                  ${escapeHtml(emp.department?.name || '-')}
                </div>
                <small class="text-muted d-block text-truncate" style="font-size: 0.72rem;" title="${escapeHtml(emp.jobPosition?.name || '-')}">
                  ${escapeHtml(emp.jobPosition?.name || '-')}
                </small>
              </div>
            </td>
            <td class="text-end font-monospace">
              <div class="fw-semibold text-dark" style="font-size: 0.85rem;">$ ${bruto}</div>
              <small class="text-danger d-block" style="font-size: 0.73rem;">-$ ${retenciones}</small>
            </td>
            <td class="text-end font-monospace">
              <div class="fw-bold text-success fs-3" style="letter-spacing: -0.02em;">$ ${neto}</div>
            </td>
            <td class="col-slip-status">
              <span class="badge bg-green-lt text-success d-inline-flex align-items-center justify-content-center" title="Recibo emitido" style="width: 28px; height: 28px; border-radius: 6px; padding: 0; overflow: visible;">
                <i class="ti ti-check"></i>
              </span>
            </td>
            <td class="col-slip-action">
              <div class="d-flex gap-1 justify-content-end">
                <button type="button" class="btn btn-sm btn-icon btn-outline-primary btn-view-slip" data-id="${s.id}" title="Ver e imprimir recibo oficial">
                  <i class="ti ti-eye"></i>
                </button>
                <button type="button" class="btn btn-sm btn-icon btn-outline-purple btn-audit-slip" data-id="${s.id}" title="Auditoría de liquidación (Ver todos los conceptos y auxiliares)">
                  <i class="ti ti-report-analytics"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-view-slip').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openPayslipModal(btn.dataset.id, 'OFFICIAL');
      });
    });

    tbody.querySelectorAll('.btn-audit-slip').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openPayslipModal(btn.dataset.id, 'AUDIT');
      });
    });
  }

  renderPayrollSlipsPagination(meta) {
    const list = document.getElementById('slips-pagination-list');
    const info = document.getElementById('slips-pagination-info');
    if (!list) return;

    if (info) {
      info.textContent = `Mostrando ${this.payrollSlips.length} de ${meta.total} recibos`;
    }

    const { page, totalPages } = meta;
    this.renderPaginationControls(list, page, totalPages, (newPage) => {
      this.payrollSlipsPage = newPage;
      const sel = document.getElementById('slips-period-select');
      this.loadPayrollSlips(sel?.value);
    });
  }

  async openPayslipModal(slipId, defaultTab = 'OFFICIAL') {
    const area = document.getElementById('printable-payslip-area');
    const auditArea = document.getElementById('payslip-audit-area');
    if (area) {
      area.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-muted">Generando recibo oficial vectorial...</div></div>';
    }
    if (auditArea) {
      auditArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-purple" role="status"></div><div class="mt-2 text-muted">Cargando auditoría integral de liquidación...</div></div>';
    }

    // Activar pestaña solicitada
    if (defaultTab === 'AUDIT') {
      const tabTrigger = document.getElementById('link-tab-payslip-audit');
      if (tabTrigger) {
        if (window.bootstrap?.Tab) {
          window.bootstrap.Tab.getOrCreateInstance(tabTrigger).show();
        } else {
          tabTrigger.click();
        }
      }
    } else {
      const tabTrigger = document.getElementById('link-tab-payslip-official');
      if (tabTrigger) {
        if (window.bootstrap?.Tab) {
          window.bootstrap.Tab.getOrCreateInstance(tabTrigger).show();
        } else {
          tabTrigger.click();
        }
      }
    }

    getBootstrapModal(document.getElementById('modal-view-payslip'))?.show();

    try {
      const res = await apiRequest(`/payroll/slips/${slipId}`);
      this.renderPayslipVector(res.data);
      this.renderPayslipAudit(res.data);
    } catch (err) {
      if (area) area.innerHTML = `<div class="alert alert-danger m-3">${err.message}</div>`;
      if (auditArea) auditArea.innerHTML = `<div class="alert alert-danger m-3">${err.message}</div>`;
      showToast(err.message, 'danger');
    }
  }

  renderPayslipVector(data) {
    const area = document.getElementById('printable-payslip-area');
    if (!area) return;

    const slip = data.slip || data;
    const emp = slip.employee || {};
    const comp = data.company || this.activeCompany || {};
    const period = slip.payrollPeriod || {};
    const breakdown = data.breakdown || {};
    const dist = data.costDistribution || {};

    const formatMoney = (n) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const periodLabel = `${monthNames[(period.month || 1) - 1]} ${period.year || 2026}`;

    // SVG Donut Chart Vectorial
    const pctNet = Number(slip.pctNetSalary) || 0;
    const pctDed = Number(slip.pctEmployeeDeductions) || 0;
    const pctSS = Number(slip.pctSocialSecurityContrib) || 0;
    const pctOS = Number(slip.pctHealthContrib) || 0;
    const pctART = Number(slip.pctArtAndInsurance) || 0;

    const slices = [
      { percentage: pctNet, color: '#2fb344', label: 'Neto a Cobrar' },
      { percentage: pctDed, color: '#f59f00', label: 'Retenciones al Empleado' },
      { percentage: pctSS, color: '#4263eb', label: 'Seg. Social Patronal' },
      { percentage: pctOS, color: '#206bc4', label: 'Obra Social Patronal' },
      { percentage: pctART, color: '#d63939', label: 'ART y Seguros' },
    ].filter((s) => s.percentage > 0);

    let cumulativePercent = 0;
    const paths = slices.map((slice) => {
      const startAngle = (cumulativePercent / 100) * 2 * Math.PI;
      cumulativePercent += slice.percentage;
      const endAngle = (cumulativePercent / 100) * 2 * Math.PI;

      const x1 = 45 + 38 * Math.cos(startAngle);
      const y1 = 45 + 38 * Math.sin(startAngle);
      const x2 = 45 + 38 * Math.cos(endAngle);
      const y2 = 45 + 38 * Math.sin(endAngle);
      const largeArc = slice.percentage > 50 ? 1 : 0;

      return `<path d="M 45 45 L ${x1.toFixed(2)} ${y1.toFixed(2)} A 38 38 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${slice.color}" stroke="#ffffff" stroke-width="0.8" />`;
    });

    const pieSvg = `
      <svg viewBox="0 0 90 90" class="cost-pie-svg">
        ${paths.join('')}
      </svg>
    `;

    // Items table rows (EN EL RECIBO OFICIAL LEGAL NUNCA SE IMPRIMEN CONCEPTOS AUXILIARES)
    // Items table rows (EN EL RECIBO OFICIAL LEGAL NUNCA SE IMPRIMEN CONCEPTOS AUXILIARES)
    const typePriority = {
      REMUNERATIVE: 1,
      NON_REMUNERATIVE: 2,
      DEDUCTION: 3,
    };
    const items = (slip.items || [])
      .filter((it) => it.type !== 'AUXILIARY')
      .sort((a, b) => {
        const pA = typePriority[a.type] || 99;
        const pB = typePriority[b.type] || 99;
        if (pA !== pB) return pA - pB;
        return String(a.conceptCode).localeCompare(String(b.conceptCode), undefined, { numeric: true });
      });

    const itemRows = items
      .map((it) => {
        const isRem = it.type === 'REMUNERATIVE';
        const isNonRem = it.type === 'NON_REMUNERATIVE';
        const isDed = it.type === 'DEDUCTION';
        const amountStr = formatMoney(it.amount);

        return `
          <tr>
            <td class="font-monospace text-center" style="width: 50px;">${escapeHtml(it.conceptCode)}</td>
            <td>${escapeHtml(it.conceptName)}</td>
            <td class="text-center" style="width: 60px;">${it.units ? Number(it.units) : '-'}</td>
            <td class="text-end font-monospace" style="width: 100px;">${isRem ? amountStr : ''}</td>
            <td class="text-end font-monospace" style="width: 100px;">${isNonRem ? amountStr : ''}</td>
            <td class="text-end font-monospace" style="width: 100px;">${isDed ? amountStr : ''}</td>
          </tr>
        `;
      })
      .join('');

    area.innerHTML = `
      <!-- BLOQUE 1: ENCABEZADO OFICIAL LEY 27.802 & DECRETO 407/2026 -->
      <div class="payslip-box">
        <div class="payslip-box-header">
          <span>RECIBO OFICIAL DE HABERES (LEY N° 20.744, LEY N° 27.802 Y DECRETO N° 407/2026)</span>
          <span>ORIGINAL / COPIA</span>
        </div>
        <div class="payslip-box-body">
          <div class="row g-2">
            <div class="col-7">
              <div style="font-size: 13px; font-weight: 800; color: #2b3a8c;">${escapeHtml(comp.legalName || comp.name)}</div>
              <div class="small"><strong>CUIT:</strong> ${formatCuit(comp.cuit)} &bull; <strong>Cond. IVA:</strong> ${comp.taxCondition || 'Resp. Inscripto'}</div>
              <div class="small"><strong>Domicilio:</strong> ${escapeHtml(comp.address || 'Domicilio Legal Registrado')} - ${escapeHtml(comp.city || '')}</div>
              <div class="small"><strong>ART:</strong> ${escapeHtml(comp.artName || 'Prevención ART')}</div>
            </div>
            <div class="col-5 border-start ps-3">
              <div class="small"><strong>Período Liquidado:</strong> ${periodLabel}</div>
              <div class="small"><strong>Tipo Liquidación:</strong> ${period.settlementName || 'Mensual Ordinario'}</div>
              <div class="small"><strong>Fecha de Pago:</strong> ${slip.paymentDate ? slip.paymentDate.split('T')[0] : 'Al cobro'}</div>
              <div class="small"><strong>Banco / Cuenta:</strong> ${escapeHtml(slip.bankName || 'Acreditación Bancaria')}</div>
            </div>
          </div>
          <hr style="margin: 6px 0; border-color: #cbd5e1;">
          <div class="row g-2">
            <div class="col-3"><strong>Legajo:</strong> ${escapeHtml(emp.fileNumber)}</div>
            <div class="col-5"><strong>Trabajador:</strong> ${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}</div>
            <div class="col-4"><strong>CUIL:</strong> ${formatCuit(emp.cuil)}</div>
            <div class="col-3"><strong>Ingreso:</strong> ${emp.hireDate ? emp.hireDate.split('T')[0] : '-'}</div>
            <div class="col-5"><strong>Puesto / Categoría:</strong> ${escapeHtml(emp.jobPosition?.name || '-')}</div>
            <div class="col-4"><strong>CBU:</strong> ${slip.cbu && String(slip.cbu).trim() ? `<code style="font-size: 9.5px;">${escapeHtml(slip.cbu)}</code>` : `<span class="badge bg-warning-lt text-warning fw-normal" style="font-size: 9px;">Sin CBU informado</span>`}</div>
          </div>
        </div>
      </div>

      <!-- BLOQUE 2: DETALLE DE CONCEPTOS LIQUIDADOS -->
      <div class="payslip-box" style="min-height: 180px;">
        <div class="payslip-box-header">
          <span>DETALLE DE HABERES Y DEDUCCIONES</span>
          <span>DÍAS TRABAJADOS: ${slip.workedDays || 30}</span>
        </div>
        <div class="p-0">
          <table class="payslip-table-items">
            <thead>
              <tr>
                <th class="text-center">Cód.</th>
                <th>Concepto</th>
                <th class="text-center">Unid.</th>
                <th class="text-end">Remunerativos</th>
                <th class="text-end">No Remunerativos</th>
                <th class="text-end">Retenciones</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>
        </div>
      </div>

      <!-- BLOQUE 3: TOTALES Y SUELDO NETO EN LETRAS -->
      <div class="row g-2">
        <div class="col-4">
          <div class="payslip-box text-center p-2">
            <div class="small text-muted fw-bold">TOTAL REMUNERATIVO</div>
            <div class="fw-bold font-monospace" style="font-size: 13px;">$${formatMoney(slip.remunerativeSalary)}</div>
          </div>
        </div>
        <div class="col-4">
          <div class="payslip-box text-center p-2">
            <div class="small text-muted fw-bold">TOTAL NO REMUNERATIVO</div>
            <div class="fw-bold font-monospace" style="font-size: 13px;">$${formatMoney(slip.nonRemunerative)}</div>
          </div>
        </div>
        <div class="col-4">
          <div class="payslip-box text-center p-2">
            <div class="small text-muted fw-bold">TOTAL RETENCIONES</div>
            <div class="fw-bold font-monospace text-danger" style="font-size: 13px;">-$${formatMoney(slip.totalDeductions)}</div>
          </div>
        </div>
      </div>

      <div class="payslip-net-box d-flex align-items-center justify-content-between">
        <div>
          <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #1b5e20;">SUELDO NETO A COBRAR (EN PESOS)</div>
          <div style="font-size: 10px; font-style: italic; color: #2e7d32;">
            SON: <strong>${escapeHtml(slip.netSalaryWords || data.netSalaryWords || '')}</strong>
          </div>
        </div>
        <div class="payslip-net-amount font-monospace">$${formatMoney(slip.netSalary)}</div>
      </div>

      <!-- BLOQUE 4 Y 5: CONTRIBUCIONES PATRONALES Y GRÁFICO COSTO LABORAL TOTAL = 100% -->
      <div class="payslip-box">
        <div class="payslip-box-header">
          <span>CONTRIBUCIONES PATRONALES Y DISTRIBUCIÓN DEL COSTO LABORAL TOTAL (100%)</span>
          <span>LEY N° 27.802 &bull; DECRETO N° 407/2026</span>
        </div>
        <div class="payslip-box-body">
          <div class="row align-items-center">
            <div class="col-7">
              <div class="row g-1 small">
                <div class="col-6"><strong>SIPA Jubilación:</strong> $${formatMoney(slip.sipaContrib)}</div>
                <div class="col-6"><strong>INSSJyP (PAMI):</strong> $${formatMoney(slip.inssjypContrib)}</div>
                <div class="col-6"><strong>Obra Social Patronal:</strong> $${formatMoney(slip.osContrib)}</div>
                <div class="col-6"><strong>FNE / Empleo:</strong> $${formatMoney(slip.fneContrib)}</div>
                <div class="col-6"><strong>Asignaciones Familiares:</strong> $${formatMoney(slip.aaffContrib)}</div>
                <div class="col-6"><strong>ART y Seguros (SCVO):</strong> $${formatMoney((Number(slip.artContrib) || 0) + (Number(slip.scvoContrib) || 0))}</div>
              </div>
              <div class="mt-2 pt-1 border-top d-flex justify-content-between" style="font-size: 11px;">
                <span><strong>Total Contribuciones Patronales:</strong> $${formatMoney(slip.totalEmployerContrib)}</span>
                <span style="color: #2b3a8c;"><strong>COSTO LABORAL TOTAL:</strong> $${formatMoney(slip.totalLaborCost)}</span>
              </div>
            </div>
            <div class="col-5 border-start ps-3 d-flex align-items-center gap-3">
              <div>${pieSvg}</div>
              <div style="font-size: 9px; line-height: 1.25;">
                <div class="cost-pie-legend-item"><span class="cost-pie-color-bullet" style="background:#2fb344;"></span><span><strong>${pctNet}%</strong> Neto de Bolsillo</span></div>
                <div class="cost-pie-legend-item"><span class="cost-pie-color-bullet" style="background:#f59f00;"></span><span><strong>${pctDed}%</strong> Retenciones</span></div>
                <div class="cost-pie-legend-item"><span class="cost-pie-color-bullet" style="background:#4263eb;"></span><span><strong>${pctSS}%</strong> Seguridad Social</span></div>
                <div class="cost-pie-legend-item"><span class="cost-pie-color-bullet" style="background:#206bc4;"></span><span><strong>${pctOS}%</strong> Obra Social</span></div>
                <div class="cost-pie-legend-item"><span class="cost-pie-color-bullet" style="background:#d63939;"></span><span><strong>${pctART}%</strong> ART / Seguros</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- BLOQUE 6: FIRMAS Y FIRMA DIGITAL / INTEGRIDAD -->
      <div class="payslip-signature-area">
        <div class="payslip-signature-box">
          <div>Firma del Empleador / Responsable Legal</div>
          <div style="font-size: 8px; color: #777;">Recibo Oficial emitido conforme Ley 20.744</div>
        </div>
        <div class="payslip-signature-box">
          <div>Firma del Trabajador / Conforme</div>
          <div style="font-size: 8px; color: #777;">Constancia de acreditación o recepción de haberes</div>
        </div>
      </div>
      <div class="text-center mt-2 text-muted" style="font-size: 8px; font-family: monospace;">
        HASH DE INTEGRIDAD (SHA-256): ${slip.signatureHash || 'SEC-VALID-PAYROLL-HASH'} &bull; EMISIÓN ELECTRÓNICA VÁLIDA
      </div>
    `;
  }

  renderPayslipAudit(data) {
    const area = document.getElementById('payslip-audit-area');
    if (!area) return;

    const slip = data.slip || data;
    const emp = slip.employee || {};
    const comp = data.company || this.activeCompany || {};
    const period = slip.payrollPeriod || {};
    const items = slip.items || [];
    const basis = slip.basis || {};
    const formatMoney = (n) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });

    const typeBadges = {
      REMUNERATIVE: '<span class="badge bg-green-lt">Remunerativo</span>',
      NON_REMUNERATIVE: '<span class="badge bg-blue-lt">No Remunerativo</span>',
      DEDUCTION: '<span class="badge bg-danger-lt">Deducción / Retención</span>',
      AUXILIARY: '<span class="badge bg-purple text-white"><i class="ti ti-tools me-1"></i>Auxiliar de Cálculo</span>',
    };

    const typeOrder = {
      REMUNERATIVE: 1,
      NON_REMUNERATIVE: 2,
      DEDUCTION: 3,
      AUXILIARY: 4,
    };

    const sortedItems = [...items].sort((a, b) => {
      const orderA = typeOrder[a.type] || 5;
      const orderB = typeOrder[b.type] || 5;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.conceptCode || '').localeCompare(String(b.conceptCode || ''));
    });

    const cbuDisplay = emp.cbu && String(emp.cbu).trim()
      ? `CBU: <strong class="text-dark">${escapeHtml(String(emp.cbu).trim())}</strong>${emp.bankName ? ` (${escapeHtml(emp.bankName)})` : ''}`
      : `CBU: <span class="badge bg-warning-lt text-warning fw-normal">Sin CBU informado</span>`;

    const itemRows = sortedItems.map((it, idx) => {
      const isAux = it.type === 'AUXILIARY';
      const rowClass = isAux ? 'bg-purple-lt bg-opacity-10' : '';
      const amountStr = formatMoney(it.amount);
      const unitsStr = it.units !== null && it.units !== undefined ? String(it.units) : '-';
      const baseStr = it.baseAmount ? `$ ${formatMoney(it.baseAmount)}` : (it.rate ? `${it.rate}%` : '-');

      return `
        <tr class="${rowClass}">
          <td class="text-center font-monospace text-muted small py-1">${idx + 1}</td>
          <td class="font-monospace fw-bold text-primary py-1">${escapeHtml(it.conceptCode)}</td>
          <td class="py-1">
            <span class="fw-semibold text-dark text-truncate d-inline-block align-middle" style="max-width: 320px;" title="${escapeHtml(it.conceptName)}">${escapeHtml(it.conceptName)}</span>
          </td>
          <td class="py-1">${typeBadges[it.type] || it.type}</td>
          <td class="text-center font-monospace py-1">${unitsStr}</td>
          <td class="text-end font-monospace text-muted py-1">${baseStr}</td>
          <td class="text-end font-monospace fw-bold py-1 ${isAux ? 'text-purple' : (it.type === 'DEDUCTION' ? 'text-danger' : 'text-dark')}">
            ${it.type === 'DEDUCTION' ? '-' : ''}$ ${amountStr}
          </td>
          <td class="text-center py-1">
            <code>${escapeHtml(it.arcaConceptCode || '-')}</code>
          </td>
        </tr>
      `;
    }).join('');

    area.innerHTML = `
      <!-- Encabezado Corporativo Exclusivo para Impresión A4 -->
      <div class="d-none d-print-block payslip-audit-print-header">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <h3 class="fw-bold mb-0 text-uppercase" style="color: #2b3a8c;">${escapeHtml(comp.businessName || comp.name || 'EMPRESA')}</h3>
            <div class="small text-muted">CUIT: <strong>${formatCuit(comp.cuit)}</strong> &bull; ${escapeHtml(comp.address || '')}</div>
          </div>
          <div class="text-end">
            <div class="fw-bold fs-3 text-uppercase">AUDITORÍA Y CONTROL DE LIQUIDACIÓN</div>
            <div class="small text-muted">Período: <strong>${escapeHtml(period.settlementName || `${period.month}/${period.year}`)}</strong> &bull; Emisión: ${new Date().toLocaleDateString('es-AR')}</div>
          </div>
        </div>
      </div>

      <!-- Encabezado de Auditoría -->
      <div class="card shadow-xs mb-2">
        <div class="card-body py-2 px-3">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div>
              <div class="d-flex align-items-center gap-2">
                <span class="avatar avatar-sm bg-purple-lt text-purple fw-bold rounded-circle">
                  ${escapeHtml(((emp.firstName?.[0] || '') + (emp.lastName?.[0] || '')).toUpperCase() || 'EM')}
                </span>
                <div>
                  <h4 class="mb-0 fw-bold fs-3">${escapeHtml(emp.lastName || '')}, ${escapeHtml(emp.firstName || '')}</h4>
                  <div class="small text-muted font-monospace">
                    Legajo: <strong>${escapeHtml(emp.fileNumber || '-')}</strong> | CUIL: <strong>${formatCuit(emp.cuil)}</strong> | Cargo: <strong>${escapeHtml(emp.jobPosition?.name || '-')}</strong> | ${cbuDisplay}
                  </div>
                </div>
              </div>
            </div>
            <div class="text-end d-flex align-items-center gap-3">
              <div class="text-end">
                <div class="text-muted small">Período Liquidado</div>
                <div class="fw-bold">${escapeHtml(period.settlementName || `${period.month}/${period.year}`)}</div>
              </div>
              <span class="badge bg-green-lt fs-3 font-monospace py-1 px-2">Neto: $ ${formatMoney(slip.netSalary)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Tabla Integral de Conceptos con Scroll Independiente (Máximo 5 renglones visibles sin scroll) -->
      <div class="card shadow-xs mb-2">
        <div class="card-header py-1 px-3 bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div class="d-flex align-items-center gap-2">
            <h5 class="card-title mb-0 text-dark">
              <i class="ti ti-list-details me-1 text-primary"></i> Secuencia Completa de Conceptos Liquidados
            </h5>
            <span class="badge bg-primary-lt font-monospace">${items.length} conceptos</span>
          </div>
          <div class="small text-muted d-flex align-items-center flex-wrap gap-1">
            <span class="badge bg-purple text-white"><i class="ti ti-tools me-1"></i>Auxiliar</span>
            <span class="small">Variables intermedias de cálculo (no impresas en recibo legal ni ARCA)</span>
          </div>
        </div>
        <div class="table-responsive" style="max-height: 212px; overflow-y: auto;">
          <table class="table table-vcenter card-table table-hover table-sm mb-0">
            <thead class="sticky-top bg-light border-bottom" style="z-index: 2;">
              <tr class="table-light">
                <th class="text-center py-1" style="width: 45px;">#</th>
                <th class="py-1" style="width: 80px;">Código</th>
                <th class="py-1">Concepto / Variable</th>
                <th class="py-1" style="width: 170px;">Tipo</th>
                <th class="text-center py-1" style="width: 90px;">Unidades</th>
                <th class="text-end py-1" style="width: 120px;">Base / Tasa</th>
                <th class="text-end py-1" style="width: 130px;">Importe ($)</th>
                <th class="text-center py-1" style="width: 90px;">Código ARCA</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Bases Imponibles F.931 ARCA y Costo Laboral -->
      <div class="row g-2">
        <div class="col-md-6">
          <div class="card shadow-xs h-100">
            <div class="card-header py-1 px-3 bg-white">
              <h5 class="card-title mb-0 small text-uppercase text-muted">
                <i class="ti ti-building-bank me-1 text-indigo"></i> Bases Imponibles ARCA F.931
              </h5>
            </div>
            <div class="card-body py-2 px-3">
              <table class="table table-sm table-borderless mb-0 small">
                <tr>
                  <td class="text-muted py-0">Base 1 (SIPA Topeada):</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible1)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Base 2 (INSSJyP PAMI):</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible2)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Base 3 (Fondo Nac. Empleo):</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible3)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Base 4 (Asignaciones Familiares):</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible4)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Base 5 (Obra Social Patronal):</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible5)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Base 9 (LRT / Riesgos Trabajo sin tope):</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible9)}</td>
                </tr>
              </table>
            </div>
          </div>
        </div>

        <div class="col-md-6">
          <div class="card shadow-xs h-100">
            <div class="card-header py-1 px-3 bg-white">
              <h5 class="card-title mb-0 small text-uppercase text-muted">
                <i class="ti ti-calculator me-1 text-teal"></i> Resumen de Costo y Aportes Patronales
              </h5>
            </div>
            <div class="card-body py-2 px-3">
              <table class="table table-sm table-borderless mb-0 small">
                <tr>
                  <td class="text-muted py-0">Total Remunerativo:</td>
                  <td class="text-end font-monospace fw-bold text-success py-0">$ ${formatMoney(slip.remunerativeSalary)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Total No Remunerativo:</td>
                  <td class="text-end font-monospace fw-bold text-primary py-0">$ ${formatMoney(slip.nonRemunerative)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Total Deducciones Empleado:</td>
                  <td class="text-end font-monospace fw-bold text-danger py-0">-$ ${formatMoney(slip.totalDeductions)}</td>
                </tr>
                <tr class="border-top">
                  <td class="fw-bold py-1">Sueldo Neto de Bolsillo:</td>
                  <td class="text-end font-monospace fw-bold fs-4 text-success py-1">$ ${formatMoney(slip.netSalary)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Total Contribuciones Patronales:</td>
                  <td class="text-end font-monospace fw-bold text-indigo py-0">$ ${formatMoney(slip.totalEmployerContrib)}</td>
                </tr>
                <tr class="border-top">
                  <td class="fw-bold text-dark py-1">Costo Laboral Total Empresa:</td>
                  <td class="text-end font-monospace fw-bold fs-4 text-dark py-1">$ ${formatMoney(slip.totalLaborCost)}</td>
                </tr>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- Libro de Sueldos Digital (ARCA) ---

  async auditLsdConsistency() {
    const periodSelect = document.getElementById('lsd-period-select');
    const periodId = periodSelect?.value;
    if (!periodId) {
      showToast('Seleccione un período para auditar', 'warning');
      return;
    }

    try {
      const res = await apiRequest(`/payroll/periods/${periodId}/lsd/validate`);
      const val = res.data;
      const title = document.getElementById('lsd-status-title');
      const desc = document.getElementById('lsd-status-desc');
      const icon = document.getElementById('lsd-status-icon');
      const errBox = document.getElementById('lsd-errors-list');

      if (val.isValid) {
        if (title) title.textContent = 'Consistencia 100% Válida para ARCA';
        if (desc) desc.textContent = 'La liquidación cumple estrictamente los 999 caracteres por línea, las 10 bases imponibles y la parametrización del F.931.';
        if (icon) {
          icon.className = 'ti ti-shield-check fs-2 text-success';
        }
        if (errBox) errBox.classList.add('d-none');
        showToast('Liquidación auditada con éxito: formato apto para Libro de Sueldos Digital');
      } else {
        if (title) title.textContent = 'Se detectaron inconsistencias en la liquidación';
        if (desc) desc.textContent = `Se encontraron ${val.errors.length} error(es) que deben corregirse antes de presentar a ARCA:`;
        if (icon) {
          icon.className = 'ti ti-alert-triangle fs-2 text-warning';
        }
        if (errBox) {
          errBox.innerHTML = val.errors.map((e) => `<div>&bull; ${escapeHtml(e)}</div>`).join('');
          errBox.classList.remove('d-none');
        }
        showToast('Existen observaciones para la presentación en ARCA', 'warning');
      }
    } catch (err) {
      showToast(err.message || 'Error al validar ARCA', 'danger');
    }
  }

  async downloadLsdConceptsFile() {
    try {
      showToast('Generando archivo de conceptos ARCA (195 chars)...');
      const token = storage.getToken();
      const companyId = storage.getActiveCompanyId();

      const response = await fetch('/api/v1/payroll/lsd/concepts', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      });
      if (!response.ok) throw new Error('Error al descargar conceptos ARCA');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'LSD_Conceptos_ARCA.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Archivo de Conceptos ARCA descargado correctamente');
    } catch (err) {
      showToast(err.message || 'Error en descarga ARCA', 'danger');
    }
  }

  async downloadLsdPayrollFile() {
    const periodSelect = document.getElementById('lsd-period-select');
    const periodId = periodSelect?.value;
    if (!periodId) {
      showToast('Seleccione un período para exportar', 'warning');
      return;
    }

    try {
      showToast('Generando Libro de Sueldos Digital ARCA (999 chars)...');
      const token = storage.getToken();
      const companyId = storage.getActiveCompanyId();

      const response = await fetch(`/api/v1/payroll/periods/${periodId}/lsd/payroll`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error?.message || 'Error al descargar liquidación ARCA');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LSD_Liquidacion_ARCA_${periodId.substring(0, 8)}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Archivo F.931 (999 caracteres) descargado correctamente');
    } catch (err) {
      showToast(err.message || 'Error en descarga ARCA', 'danger');
    }
  }

  // --- Conceptos y Diseñador de Fórmulas ---

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

}

export function registerPayrollMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(PayrollMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
