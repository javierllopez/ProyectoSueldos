import { apiRequest, showToast } from '../../api.js?v=2.1';
import {
  formatNumber,
  escapeHtml,
  getBootstrapModal,
} from '../../utils/helpers.js';

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const RUBRIC_ORDER = ['BASIC', 'ADDITIONALS', 'OVERTIME', 'VACATIONS', 'SAC', 'NON_REMUNERATIVE'];

class RetroactiveSettlementMethods {
  setupRetroactiveSettlementWizard() {
    if (this._retroWizardBound) return;
    this._retroWizardBound = true;

    document.getElementById('btn-open-retroactive-wizard')?.addEventListener('click', () => {
      this.openRetroactiveSettlementWizard();
    });

    document.getElementById('retro-tab-btn-wizard')?.addEventListener('click', () => {
      this.switchRetroWizardMainTab('wizard');
    });
    document.getElementById('retro-tab-btn-history')?.addEventListener('click', () => {
      this.switchRetroWizardMainTab('history');
      this.loadRetroactiveRunsHistory();
    });

    document.getElementById('retro-source-mode')?.addEventListener('change', (e) => {
      const isSim = e.target.value === 'SIMULATE_INCREASE';
      document.getElementById('retro-simulate-rule-box')?.classList.toggle('d-none', !isSim);
    });

    document.getElementById('retro-target-period-select')?.addEventListener('change', () => {
      this._updateRetroTargetTypeBadgeAndMappings();
    });

    document.getElementById('btn-retro-run-preview')?.addEventListener('click', () => {
      this.requestRetroactivePreview();
    });

    document.getElementById('retro-subtab-active')?.addEventListener('click', () => {
      this._retroActiveSubTab = 'ACTIVE';
      document.getElementById('retro-subtab-active')?.classList.replace('btn-outline-purple', 'btn-purple');
      document.getElementById('retro-subtab-active')?.classList.add('active');
      document.getElementById('retro-subtab-inactive')?.classList.replace('btn-warning', 'btn-outline-warning');
      document.getElementById('retro-subtab-inactive')?.classList.remove('active');
      this.renderRetroactivePreviewTable();
    });

    document.getElementById('retro-subtab-inactive')?.addEventListener('click', () => {
      this._retroActiveSubTab = 'INACTIVE';
      document.getElementById('retro-subtab-inactive')?.classList.replace('btn-outline-warning', 'btn-warning');
      document.getElementById('retro-subtab-inactive')?.classList.add('active');
      document.getElementById('retro-subtab-active')?.classList.replace('btn-purple', 'btn-outline-purple');
      document.getElementById('retro-subtab-active')?.classList.remove('active');
      this.renderRetroactivePreviewTable();
    });

    let searchTimer = null;
    document.getElementById('retro-preview-search')?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => this.renderRetroactivePreviewTable(), 180);
    });

    document.getElementById('retro-select-all-emp')?.addEventListener('change', (e) => {
      const checked = Boolean(e.target.checked);
      const list = this._getRetroCurrentTabEmployees();
      if (!this._retroSelectedEmpIds) this._retroSelectedEmpIds = new Set();
      for (const emp of list) {
        if (checked) this._retroSelectedEmpIds.add(emp.employeeId);
        else this._retroSelectedEmpIds.delete(emp.employeeId);
      }
      this.renderRetroactivePreviewTable();
    });

    // Switch de ignorar inactivos con confirmación legal obligatoria
    document.getElementById('retro-ignore-inactive-switch')?.addEventListener('change', (e) => {
      if (e.target.checked) {
        this._openRetroIgnoreInactiveConfirmModal({ triggeredBySwitch: true });
      } else {
        this._retroIgnoreInactiveConfirmed = false;
        const inactive = this._retroLastPreview?.inactiveEmployees || [];
        if (this._retroSelectedEmpIds) {
          inactive.forEach((emp) => this._retroSelectedEmpIds.add(emp.employeeId));
        }
        this.renderRetroactivePreviewTable();
      }
    });

    const cancelIgnoreHandler = () => {
      const sw = document.getElementById('retro-ignore-inactive-switch');
      if (sw) sw.checked = false;
      this._retroIgnoreInactiveConfirmed = false;
      this._pendingApplyAfterConfirm = false;
      const modalEl = document.getElementById('modal-retroactive-ignore-inactive-confirm');
      getBootstrapModal(modalEl)?.hide();
      const inactive = this._retroLastPreview?.inactiveEmployees || [];
      if (this._retroSelectedEmpIds) {
        inactive.forEach((emp) => this._retroSelectedEmpIds.add(emp.employeeId));
      }
      this.renderRetroactivePreviewTable();
    };

    document.getElementById('btn-retro-cancel-ignore-inactive')?.addEventListener('click', cancelIgnoreHandler);
    document.getElementById('btn-retro-close-ignore-inactive')?.addEventListener('click', cancelIgnoreHandler);

    document.getElementById('btn-retro-confirm-ignore-inactive')?.addEventListener('click', async () => {
      const sw = document.getElementById('retro-ignore-inactive-switch');
      if (sw) sw.checked = true;
      this._retroIgnoreInactiveConfirmed = true;
      const inactive = this._retroLastPreview?.inactiveEmployees || [];
      if (this._retroSelectedEmpIds) {
        inactive.forEach((emp) => this._retroSelectedEmpIds.delete(emp.employeeId));
      }
      const modalEl = document.getElementById('modal-retroactive-ignore-inactive-confirm');
      getBootstrapModal(modalEl)?.hide();
      this.renderRetroactivePreviewTable();

      if (this._pendingApplyAfterConfirm) {
        this._pendingApplyAfterConfirm = false;
        await this.applyRetroactiveWizard();
      }
    });

    document.getElementById('btn-retro-export-excel')?.addEventListener('click', () => {
      this.exportRetroactiveExcel();
    });

    document.getElementById('btn-retro-refresh-history')?.addEventListener('click', () => {
      this.loadRetroactiveRunsHistory();
    });

    document.getElementById('btn-retro-apply')?.addEventListener('click', () => {
      this.applyRetroactiveWizard();
    });
  }

  switchRetroWizardMainTab(tab) {
    const isHistory = tab === 'history';
    document.getElementById('retro-pane-wizard')?.classList.toggle('d-none', isHistory);
    document.getElementById('retro-pane-history')?.classList.toggle('d-none', !isHistory);
    document.getElementById('retro-tab-btn-wizard')?.classList.toggle('active', !isHistory);
    document.getElementById('retro-tab-btn-history')?.classList.toggle('active', isHistory);
    const applyBtn = document.getElementById('btn-retro-apply');
    if (applyBtn) {
      applyBtn.disabled = isHistory || !this._retroLastPreview || !this._retroEligiblePeriods?.length;
    }
  }

  _populateRetroMonthSelectors() {
    const populate = (id, selectedMonth) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      sel.innerHTML = MONTH_NAMES_ES.map((mName, idx) => `<option value="${idx + 1}">${mName}</option>`).join('');
      sel.value = String(selectedMonth);
    };

    const now = new Date();
    const curY = Number(this.activeFiscalPeriod?.year || now.getFullYear());
    const curM = Number(this.activeFiscalPeriod?.month || now.getMonth() + 1);
    let prevM = curM - 1;
    let prevY = curY;
    if (prevM < 1) {
      prevM = 12;
      prevY -= 1;
    }

    populate('retro-from-month', prevM);
    populate('retro-to-month', prevM);
    const fromY = document.getElementById('retro-from-year');
    const toY = document.getElementById('retro-to-year');
    if (fromY) fromY.value = String(prevY);
    if (toY) toY.value = String(prevY);
  }

  async openRetroactiveSettlementWizard(preselectedPeriodId = null) {
    this.setupRetroactiveSettlementWizard();
    const modalEl = document.getElementById('modal-retroactive-settlement');
    if (!modalEl) return;

    const alertBox = document.getElementById('retro-wizard-alert');
    alertBox?.classList.add('d-none');
    document.getElementById('retro-preview-results-section')?.classList.add('d-none');
    const applyBtn = document.getElementById('btn-retro-apply');
    if (applyBtn) applyBtn.disabled = true;

    this._retroLastPreview = null;
    this._retroActiveSubTab = 'ACTIVE';
    this._retroIgnoreInactiveConfirmed = false;
    this._pendingApplyAfterConfirm = false;
    this._retroSelectedEmpIds = new Set();
    const sw = document.getElementById('retro-ignore-inactive-switch');
    if (sw) sw.checked = false;

    this.switchRetroWizardMainTab('wizard');
    this._populateRetroMonthSelectors();

    // Cargar en paralelo escalas (si falta), tipos de liquidación y liquidaciones abiertas
    const [scalesRes, typesRes, openPeriodsRes] = await Promise.all([
      Array.isArray(this.payrollSalaryScales) && this.payrollSalaryScales.length > 0
        ? Promise.resolve({ data: this.payrollSalaryScales })
        : apiRequest('/payroll/salary-scales').catch(() => ({ data: [] })),
      Array.isArray(this.payrollSettlementTypes) && this.payrollSettlementTypes.length > 0
        ? Promise.resolve({ data: this.payrollSettlementTypes })
        : apiRequest('/payroll/settlement-types').catch(() => ({ data: [] })),
      apiRequest('/payroll/periods?status=OPEN&limit=100').catch(() => ({ data: [] })),
    ]);

    if (scalesRes?.data) this.payrollSalaryScales = scalesRes.data;
    if (typesRes?.data) this.payrollSettlementTypes = typesRes.data;

    // Poblar selector de CCTs
    if (this.populateSalaryScaleCctFilterSelect) {
      this.populateSalaryScaleCctFilterSelect('retro-cct-select', {
        allLabel: 'Todos los Convenios / Escalas',
        includeCounts: true,
      });
    }

    // Filtrar exclusivamente liquidaciones ABIERTAS con allowsRetroactives === true
    const stMap = this.getSettlementTypeMap ? this.getSettlementTypeMap() : new Map();
    const openPeriods = Array.isArray(openPeriodsRes?.data) ? openPeriodsRes.data : [];
    const eligible = openPeriods.filter((p) => {
      if (p.status === 'CLOSED' || p.fiscalPeriod?.status === 'CLOSED') return false;
      const cfg = stMap.get(String(p.periodType || '').trim().toUpperCase());
      return Boolean(cfg && cfg.allowsRetroactives === true);
    });
    this._retroEligiblePeriods = eligible;

    const targetSel = document.getElementById('retro-target-period-select');
    const noEligibleWarn = document.getElementById('retro-no-eligible-warning');
    if (targetSel) {
      if (eligible.length === 0) {
        targetSel.innerHTML = '<option value="">Sin liquidaciones abiertas habilitadas para retroactivos</option>';
        targetSel.disabled = true;
        noEligibleWarn?.classList.remove('d-none');
      } else {
        targetSel.disabled = false;
        noEligibleWarn?.classList.add('d-none');
        targetSel.innerHTML = eligible
          .map((p) => {
            const cfg = stMap.get(String(p.periodType || '').trim().toUpperCase());
            const typeName = cfg?.name || p.periodType;
            const daysLbl = Number(cfg?.defaultWorkedDays ?? 0);
            const mmStr = String(p.month || '').padStart(2, '0');
            return `<option value="${escapeHtml(p.id)}">${escapeHtml(p.settlementName || typeName)} (${mmStr}/${p.year} • ${escapeHtml(typeName)} • ${daysLbl}d)</option>`;
          })
          .join('');
        if (preselectedPeriodId && eligible.some((p) => p.id === preselectedPeriodId)) {
          targetSel.value = preselectedPeriodId;
        }
      }
    }

    this._updateRetroTargetTypeBadgeAndMappings();
    getBootstrapModal(modalEl)?.show();
  }

  _updateRetroTargetTypeBadgeAndMappings() {
    const targetId = document.getElementById('retro-target-period-select')?.value;
    const badge = document.getElementById('retro-target-type-badge');
    const stMap = this.getSettlementTypeMap ? this.getSettlementTypeMap() : new Map();
    const found = (this._retroEligiblePeriods || []).find((p) => p.id === targetId);
    if (badge) {
      if (found) {
        const cfg = stMap.get(String(found.periodType || '').toUpperCase());
        badge.textContent = `${cfg?.name || found.periodType} (${Number(cfg?.defaultWorkedDays ?? 0)} días base)`;
      } else {
        badge.textContent = 'Solo liquidaciones habilitadas para retroactivos';
      }
    }
  }

  _buildRetroPayloadBase() {
    const mode = document.getElementById('retro-source-mode')?.value || 'EXISTING_SCALE_PERIODS';
    const payload = {
      cctCode: document.getElementById('retro-cct-select')?.value || 'ALL',
      fromMonth: Number(document.getElementById('retro-from-month')?.value || 1),
      fromYear: Number(document.getElementById('retro-from-year')?.value || new Date().getFullYear()),
      toMonth: Number(document.getElementById('retro-to-month')?.value || 1),
      toYear: Number(document.getElementById('retro-to-year')?.value || new Date().getFullYear()),
      scaleSourceMode: mode,
      includeSacRecalculation: Boolean(document.getElementById('retro-include-sac-check')?.checked),
      targetPeriodId: document.getElementById('retro-target-period-select')?.value || null,
    };

    if (mode === 'SIMULATE_INCREASE') {
      payload.increaseRule = {
        increaseType: document.getElementById('retro-rule-type')?.value || 'PERCENTAGE',
        value: Number(document.getElementById('retro-rule-value')?.value || 0),
        treatment: document.getElementById('retro-rule-treatment')?.value || 'REMUNERATIVE',
        rounding: document.getElementById('retro-rule-rounding')?.value || 'DECIMAL_2',
      };
    }

    return payload;
  }

  async requestRetroactivePreview() {
    const alertBox = document.getElementById('retro-wizard-alert');
    const btn = document.getElementById('btn-retro-run-preview');
    alertBox?.classList.add('d-none');

    const payload = this._buildRetroPayloadBase();
    if (!payload.targetPeriodId) {
      if (alertBox) {
        alertBox.textContent = 'Debe seleccionar una liquidación abierta habilitada para retroactivos.';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Calculando...';

    try {
      const res = await apiRequest('/payroll/retroactives/preview', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      this._retroLastPreview = res.data;
      this._retroIgnoreInactiveConfirmed = false;
      const sw = document.getElementById('retro-ignore-inactive-switch');
      if (sw) sw.checked = false;

      // Por defecto seleccionar activos + inactivos detectados hasta que el usuario decida ignorar inactivos
      this._retroSelectedEmpIds = new Set([
        ...(res.data.activeEmployees || []).map((e) => e.employeeId),
        ...(res.data.inactiveEmployees || []).map((e) => e.employeeId),
      ]);

      this.renderRetroactivePreview(res.data);
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'No se pudo generar la vista previa retroactiva.';
        alertBox.classList.remove('d-none');
      }
      showToast(err.message || 'Error en vista previa retroactiva', 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  renderRetroactivePreview(preview) {
    document.getElementById('retro-preview-results-section')?.classList.remove('d-none');

    const s = preview.summary || {};
    document.getElementById('retro-kpi-active-count').textContent = String(s.employeesActiveCount || 0);
    document.getElementById('retro-kpi-inactive-count').textContent = String(s.employeesInactiveCount || 0);
    document.getElementById('retro-kpi-rem-total').textContent = `$ ${formatNumber(s.totalRemunerativeActive || 0)}`;
    document.getElementById('retro-kpi-nr-total').textContent = `$ ${formatNumber(s.totalNonRemunerativeActive || 0)}`;
    document.getElementById('retro-kpi-sac-total').textContent = `$ ${formatNumber(s.totalSacActive || 0)}`;
    document.getElementById('retro-kpi-grand-total').textContent = `$ ${formatNumber(s.grandTotalActive || 0)}`;

    document.getElementById('retro-subtab-active-count').textContent = String((preview.activeEmployees || []).length);
    document.getElementById('retro-subtab-inactive-count').textContent = String((preview.inactiveEmployees || []).length);

    const hasInactives = (preview.inactiveEmployees || []).length > 0;
    document.getElementById('retro-ignore-inactive-wrap')?.classList.toggle('d-none', !hasInactives);

    // Alertas legales y técnicas
    const alerts = [];
    const la = preview.legalAlerts || {};
    if (la.hasPriorFiscalYear) {
      alerts.push(
        `<div class="alert alert-info py-2 px-3 mb-1 small"><i class="ti ti-receipt-tax me-1"></i><strong>Impuesto a las Ganancias 4ta Cat. (Art. 24 LIG / RG 4003 Art. 9°):</strong> El rango incluye períodos de año(s) fiscal(es) anterior(es) (<code>${escapeHtml((la.priorFiscalYears || []).join(', '))}</code>). El trabajador puede optar en <strong>SiRADIG F.572 Web</strong> por imputar al ejercicio de devengamiento original (F.1359 Reg. 03); caso contrario rige criterio de lo percibido.</div>`
      );
    }
    if (la.hasInactiveEmployeesWithSlips) {
      alerts.push(
        `<div class="alert alert-warning py-2 px-3 mb-1 small"><i class="ti ti-user-exclamation me-1"></i><strong>Colaboradores Egresados Detectados (${preview.inactiveEmployees.length}):</strong> Conforme <strong>Plenario CNAT N° 71 ("Maza c/ La Agraria")</strong>, los egresados que trabajaron en el período ajustado conservan derecho al retroactivo. Si decide ignorarlos, deberá confirmar la advertencia legal.</div>`
      );
    }
    if (la.priorRunsOverlap) {
      alerts.push(
        `<div class="alert alert-danger py-2 px-3 mb-1 small"><i class="ti ti-copy-off me-1"></i><strong>Posible Duplicación Detectada:</strong> Existen corridas retroactivas previas que cubren parte de estos períodos y legajos. La aplicación quedará bloqueada salvo que habilite <em>"Permitir reaplicación"</em>.</div>`
      );
    }
    if (la.missingTargetDeductions) {
      alerts.push(
        `<div class="alert alert-danger py-2 px-3 mb-1 small"><i class="ti ti-alert-octagon me-1"></i><strong>Sin Conceptos de Deducción de Ley:</strong> El tipo de liquidación destino aplica retenciones legales, pero aún no tiene conceptos DEDUCTION asociados.</div>`
      );
    }
    if (la.workedDaysOverlapWarning) {
      alerts.push(
        `<div class="alert alert-warning py-2 px-3 mb-1 small"><i class="ti ti-calendar-exclamation me-1"></i>${escapeHtml(la.workedDaysOverlapWarning)}</div>`
      );
    }
    document.getElementById('retro-legal-alerts-container').innerHTML = alerts.join('');
    document.getElementById('retro-allow-duplicate-wrap')?.classList.toggle('d-none', !la.priorRunsOverlap);

    // Poblar selects de mapeo de conceptos compatibles
    const compList = preview.compatibleTargetConcepts || [];
    const suggested = preview.suggestedConceptMapping || {};
    for (const rubric of RUBRIC_ORDER) {
      const sel = document.getElementById(`retro-map-${rubric}`);
      if (!sel) continue;
      const expectedType = rubric === 'NON_REMUNERATIVE' ? 'NON_REMUNERATIVE' : 'REMUNERATIVE';
      const opts = compList.filter((c) => c.type === expectedType || compList.length === 0);
      sel.innerHTML =
        `<option value="">-- Sin asignar --</option>` +
        (opts.length > 0 ? opts : compList)
          .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.code)} — ${escapeHtml(c.name)}${c.arcaConceptCode ? ` [${escapeHtml(c.arcaConceptCode)}]` : ''}</option>`)
          .join('');
      if (suggested[rubric]) {
        sel.value = suggested[rubric];
      }
    }

    this.renderRetroactivePreviewTable();

    const applyBtn = document.getElementById('btn-retro-apply');
    const totalCount = (preview.activeEmployees || []).length + (preview.inactiveEmployees || []).length;
    if (applyBtn) applyBtn.disabled = totalCount === 0;
    document.getElementById('retro-footer-status').textContent = totalCount > 0
      ? `Listo para aplicar sobre "${preview.selectedTargetPeriod?.settlementName || ''}".`
      : 'No se detectaron diferencias retroactivas para los parámetros ingresados.';
  }

  _getRetroCurrentTabEmployees() {
    if (!this._retroLastPreview) return [];
    const list =
      this._retroActiveSubTab === 'INACTIVE'
        ? (this._retroLastPreview.inactiveEmployees || [])
        : (this._retroLastPreview.activeEmployees || []);
    const q = (document.getElementById('retro-preview-search')?.value || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        String(e.fileNumber || '').toLowerCase().includes(q) ||
        String(e.fullName || '').toLowerCase().includes(q) ||
        String(e.scaleName || '').toLowerCase().includes(q)
    );
  }

  renderRetroactivePreviewTable() {
    const tbody = document.getElementById('retro-preview-tbody');
    if (!tbody) return;
    const rows = this._getRetroCurrentTabEmployees();
    const ignoreInactive = Boolean(document.getElementById('retro-ignore-inactive-switch')?.checked);

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No hay colaboradores para mostrar en esta vista.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map((emp) => {
        const isDisabled = emp.status !== 'ACTIVE' && ignoreInactive;
        const isChecked = !isDisabled && this._retroSelectedEmpIds?.has(emp.employeeId);
        const statusTag =
          emp.status !== 'ACTIVE'
            ? `<span class="badge bg-warning-lt text-warning ms-1">Egresado</span>`
            : '';
        const overlapTag = emp.hasPriorRunOverlap
          ? `<span class="badge bg-danger-lt text-danger ms-1" title="Ya aplicado previamente">Duplicado</span>`
          : '';
        const detailRowsHtml = (emp.lines || [])
          .map(
            (ln) => `
              <tr>
                <td class="font-monospace">${escapeHtml(ln.periodLabel)}</td>
                <td><span class="font-monospace fw-bold">${escapeHtml(ln.sourceConceptCode)}</span> — ${escapeHtml(ln.sourceConceptName)}</td>
                <td class="text-end font-monospace">$ ${formatNumber(ln.originalAmount)}</td>
                <td class="text-end font-monospace">$ ${formatNumber(ln.recalculatedAmount)}</td>
                <td class="text-end font-monospace fw-bold text-success">+ $ ${formatNumber(ln.deltaAmount)}</td>
                <td class="small text-muted">${escapeHtml(ln.formulaHint || '')}</td>
              </tr>`
          )
          .join('');

        return `
          <tr class="${isDisabled ? 'opacity-50' : ''}">
            <td class="text-center">
              <input type="checkbox" class="form-check-input retro-emp-check" data-emp-id="${escapeHtml(emp.employeeId)}" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''} />
            </td>
            <td class="font-monospace fw-bold">${escapeHtml(emp.fileNumber)}</td>
            <td>${escapeHtml(emp.fullName)}${statusTag}${overlapTag}</td>
            <td class="small text-muted">${escapeHtml(emp.scaleName)}</td>
            <td class="text-end font-monospace text-nowrap">$ ${formatNumber(emp.totalRemunerative)}</td>
            <td class="text-end font-monospace text-nowrap">$ ${formatNumber(emp.totalNonRemunerative)}</td>
            <td class="text-end font-monospace text-nowrap">$ ${formatNumber(emp.sacDelta)}</td>
            <td class="text-end font-monospace fw-bold text-purple text-nowrap">$ ${formatNumber(emp.totalDelta)}</td>
            <td class="text-center">
              <button type="button" class="btn btn-sm btn-ghost-secondary btn-retro-toggle-detail" data-emp-id="${escapeHtml(emp.employeeId)}" title="Ver desglose por período y concepto">
                <i class="ti ti-chevron-down"></i>
              </button>
            </td>
          </tr>
          <tr class="d-none bg-light" id="retro-detail-row-${escapeHtml(emp.employeeId)}">
            <td colspan="9" class="p-2">
              <div class="table-responsive">
                <table class="table table-xs table-bordered mb-0 bg-white">
                  <thead>
                    <tr class="text-muted small">
                      <th>Período</th>
                      <th>Concepto Origen</th>
                      <th class="text-end">Original</th>
                      <th class="text-end">Recalculado</th>
                      <th class="text-end">Diferencia</th>
                      <th>Referencia</th>
                    </tr>
                  </thead>
                  <tbody>${detailRowsHtml}</tbody>
                </table>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.retro-emp-check').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const eid = e.target.getAttribute('data-emp-id');
        if (e.target.checked) this._retroSelectedEmpIds.add(eid);
        else this._retroSelectedEmpIds.delete(eid);
      });
    });

    tbody.querySelectorAll('.btn-retro-toggle-detail').forEach((btn) => {
      btn.addEventListener('click', () => {
        const eid = btn.getAttribute('data-emp-id');
        document.getElementById(`retro-detail-row-${eid}`)?.classList.toggle('d-none');
      });
    });
  }

  _getOmittedInactiveSummary() {
    const inactives = this._retroLastPreview?.inactiveEmployees || [];
    const ignoreInactive = Boolean(document.getElementById('retro-ignore-inactive-switch')?.checked);
    const omitted = inactives.filter(
      (e) => ignoreInactive || !this._retroSelectedEmpIds?.has(e.employeeId)
    );
    const amount = omitted.reduce((s, e) => s + Number(e.totalDelta || 0), 0);
    return { omitted, amount };
  }

  _openRetroIgnoreInactiveConfirmModal({ triggeredBySwitch = false } = {}) {
    const inactives = this._retroLastPreview?.inactiveEmployees || [];
    const listToCount = triggeredBySwitch ? inactives : this._getOmittedInactiveSummary().omitted;
    const totalAmt = listToCount.reduce((s, e) => s + Number(e.totalDelta || 0), 0);

    document.getElementById('retro-ignore-inactive-count').textContent = String(listToCount.length);
    document.getElementById('retro-ignore-inactive-amount').textContent = `$ ${formatNumber(totalAmt)}`;

    const modalEl = document.getElementById('modal-retroactive-ignore-inactive-confirm');
    getBootstrapModal(modalEl)?.show();
  }

  async applyRetroactiveWizard() {
    if (!this._retroLastPreview) return;

    const { omitted } = this._getOmittedInactiveSummary();
    if (omitted.length > 0 && !this._retroIgnoreInactiveConfirmed) {
      this._pendingApplyAfterConfirm = true;
      this._openRetroIgnoreInactiveConfirmModal({ triggeredBySwitch: false });
      return;
    }

    const alertBox = document.getElementById('retro-wizard-alert');
    const applyBtn = document.getElementById('btn-retro-apply');
    alertBox?.classList.add('d-none');

    const ignoreInactive = Boolean(document.getElementById('retro-ignore-inactive-switch')?.checked);
    const selectedEmployeeIds = [...(this._retroSelectedEmpIds || [])].filter((id) => {
      if (!ignoreInactive) return true;
      return !(this._retroLastPreview.inactiveEmployees || []).some((ie) => ie.employeeId === id);
    });

    const conceptMapping = {};
    for (const rubric of RUBRIC_ORDER) {
      const v = document.getElementById(`retro-map-${rubric}`)?.value;
      if (v) conceptMapping[rubric] = v;
    }

    const payload = {
      ...this._buildRetroPayloadBase(),
      selectedEmployeeIds,
      ignoreInactiveEmployees: ignoreInactive,
      ignoredInactiveConfirmed: omitted.length > 0 ? Boolean(this._retroIgnoreInactiveConfirmed) : false,
      conceptMapping,
      agreementLabel: document.getElementById('retro-agreement-label')?.value?.trim() || null,
      updateSalaryScales: Boolean(document.getElementById('retro-update-scales-check')?.checked),
      allowDuplicateOverride: Boolean(document.getElementById('retro-allow-duplicate-check')?.checked),
      duplicateStrategy: document.getElementById('retro-duplicate-strategy')?.value || 'ADD',
    };

    const origHtml = applyBtn.innerHTML;
    applyBtn.disabled = true;
    applyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Aplicando...';

    try {
      const res = await apiRequest('/payroll/retroactives/apply', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast(res.message || 'Retroactivos paritarios aplicados exitosamente');
      getBootstrapModal(document.getElementById('modal-retroactive-settlement'))?.hide();
      if (this.loadPayrollPeriods) await this.loadPayrollPeriods();
      if (this.refreshNovNoPersConTable) await this.refreshNovNoPersConTable();
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al aplicar los retroactivos paritarios.';
        alertBox.classList.remove('d-none');
      }
      showToast(err.message || 'Error al aplicar retroactivos', 'danger');
    } finally {
      applyBtn.disabled = false;
      applyBtn.innerHTML = origHtml;
    }
  }

  exportRetroactiveExcel() {
    if (!this._retroLastPreview || !window.XLSX) {
      showToast('Genere primero una vista previa para exportar.', 'warning');
      return;
    }
    const rows = [
      ...(this._retroLastPreview.activeEmployees || []),
      ...(this._retroLastPreview.inactiveEmployees || []),
    ];
    const aoa = [
      ['Estado', 'Legajo', 'Colaborador', 'Escala', 'Período', 'Concepto Origen', 'Original ($)', 'Recalculado ($)', 'Diferencia ($)'],
    ];
    for (const emp of rows) {
      for (const ln of emp.lines || []) {
        aoa.push([
          emp.status === 'ACTIVE' ? 'ACTIVO' : 'INACTIVO / EGRESADO',
          emp.fileNumber,
          emp.fullName,
          emp.scaleName,
          ln.periodLabel,
          `${ln.sourceConceptCode} - ${ln.sourceConceptName}`,
          ln.originalAmount,
          ln.recalculatedAmount,
          ln.deltaAmount,
        ]);
      }
    }
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    window.XLSX.utils.book_append_sheet(wb, ws, 'Retroactivos Paritarios');
    window.XLSX.writeFile(wb, 'Retroactivos_Paritarios_Papel_Trabajo.xlsx');
  }

  async loadRetroactiveRunsHistory() {
    const tbody = document.getElementById('retro-history-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">Cargando historial de corridas...</td></tr>`;
    try {
      const res = await apiRequest('/payroll/retroactives/runs?limit=50');
      const runs = res.data || [];
      if (runs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No se registraron corridas retroactivas aún.</td></tr>`;
        return;
      }
      tbody.innerHTML = runs
        .map((r) => {
          const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleString('es-AR') : '-';
          const rangeStr = `${String(r.fromMonth).padStart(2, '0')}/${r.fromYear} → ${String(r.toMonth).padStart(2, '0')}/${r.toYear}`;
          const omittedBadge =
            r.ignoredInactiveCount > 0
              ? `<span class="badge bg-warning-lt text-warning">${r.ignoredInactiveCount} omitido(s) (Conf.)</span>`
              : '<span class="text-muted small">0</span>';
          return `
            <tr>
              <td class="small text-nowrap">${escapeHtml(dateStr)}</td>
              <td>
                <div class="fw-semibold">${escapeHtml(r.agreementLabel || '-')}</div>
                <div class="small text-muted font-monospace">${escapeHtml(rangeStr)}</div>
              </td>
              <td class="small">${escapeHtml(r.targetPeriodName || r.targetPeriodId)}</td>
              <td class="text-center font-monospace">${Number(r.activeAppliedCount || 0)} / ${Number(r.inactiveAppliedCount || 0)}</td>
              <td class="text-center">${omittedBadge}</td>
              <td class="text-end font-monospace fw-bold text-purple text-nowrap">$ ${formatNumber(r.grandTotal || 0)}</td>
            </tr>
          `;
        })
        .join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">${escapeHtml(err.message)}</td></tr>`;
    }
  }
}

export function registerRetroactiveSettlementMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(RetroactiveSettlementMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
