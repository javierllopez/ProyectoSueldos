import { apiRequest, showToast } from '../../api.js?v=2.1';
import {
  formatNumber,
  escapeHtml,
  getBootstrapModal,
} from '../../utils/helpers.js';

const FINAL_CAUSES_FALLBACK = [
  { code: 'DESPIDO_SIN_CAUSA', label: '1. Despido sin justa causa (Art. 245 LCT)' },
  { code: 'PERIODO_PRUEBA', label: '2. Extinción en período de prueba (Art. 92 bis LCT / Art. 48 Ley 27.802)' },
  { code: 'RENUNCIA', label: '3. Renuncia del trabajador (Art. 240 LCT)' },
  { code: 'DESPIDO_CON_CAUSA', label: '4. Despido con justa causa (Art. 242 LCT)' },
  { code: 'MUTUO_ACUERDO', label: '5. Mutuo acuerdo / Voluntad concurrente (Art. 241 LCT)' },
  { code: 'JUBILACION', label: '6. Extinción por jubilación (Art. 252 LCT)' },
  { code: 'FALLECIMIENTO', label: '7. Fallecimiento del trabajador (Art. 248 LCT)' },
  { code: 'FUERZA_MAYOR', label: '8. Fuerza mayor o falta de trabajo no imputable (Art. 247 LCT)' },
  { code: 'FIN_CONTRATO_EVENTUAL', label: '9. Fin contrato eventual (Arts. 99/100 LCT y Arts. 73/74 Ley 24.013)' },
];

class FinalSettlementAssistantMethods {
  isTerminalSettlementType(periodType) {
    const key = String(periodType || '').trim().toUpperCase();
    const cfg = this.getSettlementTypeConfig ? this.getSettlementTypeConfig(key) : null;
    if (cfg) return Boolean(cfg.triggersEmployeeTermination);
    return key === 'FINAL' || key === 'LIQUIDACION_FINAL';
  }

  setupFinalSettlementAssistant() {
    if (this._finalAssistantBound) return;
    this._finalAssistantBound = true;

    const btnOpen = document.getElementById('btn-open-final-assistant');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => {
        const periodId = document.getElementById('settlement-period-select')?.value || this.activePayrollPeriodId;
        const selectedEmpId = document.getElementById('settlement-single-emp-select')?.value || null;
        if (periodId) {
          this.openFinalSettlementAssistant(periodId, selectedEmpId);
        }
      });
    }

    const triggerDebouncedPreview = (immediate = false) => {
      if (this._finalPreviewTimer) {
        clearTimeout(this._finalPreviewTimer);
      }
      if (immediate) {
        this.requestFinalSettlementPreview();
      } else {
        this._finalPreviewTimer = setTimeout(() => {
          this.requestFinalSettlementPreview();
        }, 350);
      }
    };

    const empSel = document.getElementById('final-ws-emp-select');
    if (empSel) {
      empSel.addEventListener('change', () => {
        // Limpiar overrides manuales de MRMNH/SAC al cambiar de empleado para recalcular desde su historial
        const mrmnhIn = document.getElementById('final-ws-custom-mrmnh');
        const semIn = document.getElementById('final-ws-custom-sem');
        if (mrmnhIn) mrmnhIn.value = '';
        if (semIn) semIn.value = '';
        triggerDebouncedPreview(true);
      });
    }

    const causeSel = document.getElementById('final-ws-cause-select');
    if (causeSel) {
      causeSel.addEventListener('change', () => {
        this.syncFinalAssistantFieldVisibility();
        triggerDebouncedPreview(true);
      });
    }

    const immediateControls = [
      'final-ws-term-date',
      'final-ws-include-worked-days',
      'final-ws-divisor-mode',
      'final-ws-preaviso-given',
      'final-ws-apply-vizzoti',
      'final-ws-is-executive',
      'final-ws-probation-months',
    ];
    immediateControls.forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => triggerDebouncedPreview(true));
    });

    const debouncedInputs = [
      'final-ws-vacation-taken',
      'final-ws-cct-cap',
      'final-ws-custom-mrmnh',
      'final-ws-custom-sem',
      'final-ws-gratification',
    ];
    debouncedInputs.forEach((id) => {
      document.getElementById(id)?.addEventListener('input', () => triggerDebouncedPreview(false));
    });

    const workedLsdInput = document.getElementById('final-ws-worked-days-lsd');
    if (workedLsdInput) {
      workedLsdInput.addEventListener('input', () => {
        if (this._finalWizardState?.preview) {
          const val = Math.max(0, Math.min(30, Math.round(Number(workedLsdInput.value) || 0)));
          this._finalWizardState.preview.workedDaysForLsd = val;
        }
      });
    }

    const formEl = document.getElementById('form-final-settlement-wizard');
    if (formEl) {
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.applyFinalSettlementAssistant();
      });
    }
  }

  syncFinalAssistantFieldVisibility() {
    const cause = document.getElementById('final-ws-cause-select')?.value || 'DESPIDO_SIN_CAUSA';
    const vizzotiGroup = document.getElementById('final-ws-cct-cap-group');
    const preavisoWrap = document.getElementById('final-ws-preaviso-wrap');
    const gratWrap = document.getElementById('final-ws-gratification-wrap');
    const execWrap = document.getElementById('final-ws-executive-wrap');

    const showsIndemnity = ['DESPIDO_SIN_CAUSA', 'FALLECIMIENTO', 'FUERZA_MAYOR'].includes(cause);
    const showsPreaviso = ['DESPIDO_SIN_CAUSA', 'FUERZA_MAYOR'].includes(cause);
    const showsGrat = ['MUTUO_ACUERDO', 'DESPIDO_SIN_CAUSA', 'RENUNCIA', 'JUBILACION'].includes(cause);

    if (vizzotiGroup) vizzotiGroup.classList.toggle('d-none', !showsIndemnity);
    if (execWrap) execWrap.classList.toggle('d-none', !showsIndemnity);
    if (preavisoWrap) preavisoWrap.classList.toggle('d-none', !showsPreaviso);
    if (gratWrap) gratWrap.classList.toggle('d-none', !showsGrat);
  }

  async openFinalSettlementAssistant(periodId, preselectedEmployeeId = null) {
    this.setupFinalSettlementAssistant();
    const modalEl = document.getElementById('modal-final-settlement-wizard');
    if (!modalEl) return;

    const period =
      this.payrollPeriods?.find((p) => p.id === periodId) ||
      this.activeFiscalPeriod?.settlements?.find((p) => p.id === periodId) ||
      null;

    if (!period) {
      showToast('No se encontró la liquidación seleccionada.', 'warning');
      return;
    }
    if (!this.isTerminalSettlementType(period.periodType)) {
      showToast('El Asistente de Liquidación Final sólo aplica a liquidaciones finales que generan baja.', 'warning');
      return;
    }

    this._finalWizardState = {
      periodId,
      period,
      preview: null,
      rubros: [],
      abortController: null,
      seq: 0,
    };

    const subtitleEl = document.getElementById('final-ws-modal-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent = `${period.settlementName || 'Liquidación Final'} • ${String(period.month).padStart(2, '0')}/${period.year}`;
    }

    // Poblar selector de causas inicialmente (se enriquece también con preview)
    const causeSel = document.getElementById('final-ws-cause-select');
    if (causeSel && causeSel.options.length === 0) {
      causeSel.innerHTML = FINAL_CAUSES_FALLBACK
        .map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.label)}</option>`)
        .join('');
    }

    // Cargar empleados activos/egresados (reutilizando fetchActiveEmployees o /employees?limit=500)
    const empSel = document.getElementById('final-ws-emp-select');
    if (empSel) {
      empSel.innerHTML = '<option value="">Cargando legajos...</option>';
    }

    const errAlert = document.getElementById('final-ws-error-alert');
    if (errAlert) {
      errAlert.textContent = '';
      errAlert.classList.add('d-none');
    }

    getBootstrapModal(modalEl)?.show();

    try {
      const empRes = await apiRequest('/employees?status=ALL&limit=500');
      const employees = empRes.data || [];
      if (empSel) {
        empSel.innerHTML = '<option value="">-- Seleccione un colaborador --</option>' +
          employees
            .map(
              (e) =>
                `<option value="${escapeHtml(e.id)}">[${escapeHtml(e.fileNumber)}] ${escapeHtml(e.lastName)}, ${escapeHtml(e.firstName)}${e.status !== 'ACTIVE' ? ' (Inactivo)' : ''}</option>`
            )
            .join('');

        const targetEmpId =
          preselectedEmployeeId && employees.some((e) => e.id === preselectedEmployeeId)
            ? preselectedEmployeeId
            : (employees.find((e) => e.status === 'ACTIVE')?.id || employees[0]?.id || '');

        empSel.value = targetEmpId;
      }

      // Reset inputs al abrir para que el primer preview cargue la hoja guardada o valores sugeridos
      const termInput = document.getElementById('final-ws-term-date');
      if (termInput) {
        const fallbackDate = period.liquidationDate
          ? String(period.liquidationDate).slice(0, 10)
          : new Date(Date.UTC(period.year, period.month, 0)).toISOString().slice(0, 10);
        termInput.value = fallbackDate;
      }
      ['final-ws-custom-mrmnh', 'final-ws-custom-sem', 'final-ws-cct-cap', 'final-ws-reason-label'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const gratEl = document.getElementById('final-ws-gratification');
      if (gratEl) gratEl.value = '0';
      const vacEl = document.getElementById('final-ws-vacation-taken');
      if (vacEl) vacEl.value = '0';

      if (empSel?.value) {
        await this.requestFinalSettlementPreview({ hydrateFromSaved: true });
      }
    } catch (err) {
      showToast(err.message || 'Error al inicializar asistente de liquidación final', 'danger');
    }
  }

  collectFinalPreviewPayload({ hydrateFromSaved = false } = {}) {
    const employeeId = document.getElementById('final-ws-emp-select')?.value || '';
    const termVal = document.getElementById('final-ws-term-date')?.value || '';
    const causeVal = document.getElementById('final-ws-cause-select')?.value || 'DESPIDO_SIN_CAUSA';
    const includeWorked = document.getElementById('final-ws-include-worked-days')?.checked;
    const divisorMode = document.getElementById('final-ws-divisor-mode')?.value || 'CALENDAR';
    const preavisoGiven = document.getElementById('final-ws-preaviso-given')?.checked;
    const probationMonths = Number(document.getElementById('final-ws-probation-months')?.value ?? 6);
    const vacTaken = Number(document.getElementById('final-ws-vacation-taken')?.value ?? 0);
    const applyVizzoti = document.getElementById('final-ws-apply-vizzoti')?.checked;
    const isExecutive = document.getElementById('final-ws-is-executive')?.checked;
    const cctCapRaw = document.getElementById('final-ws-cct-cap')?.value;
    const customMrmnhRaw = document.getElementById('final-ws-custom-mrmnh')?.value;
    const customSemRaw = document.getElementById('final-ws-custom-sem')?.value;
    const gratRaw = document.getElementById('final-ws-gratification')?.value;

    if (hydrateFromSaved) {
      return { employeeId };
    }

    return {
      employeeId,
      terminationDate: termVal || null,
      terminationCause: causeVal,
      includeWorkedDays: Boolean(includeWorked),
      daysDivisorMode: divisorMode,
      preavisoGiven: Boolean(preavisoGiven),
      probationMonthsLimit: probationMonths,
      vacationDaysTaken: vacTaken,
      applyVizzoti: Boolean(applyVizzoti),
      cctCapAmount: cctCapRaw !== '' && cctCapRaw !== null ? Number(cctCapRaw) : null,
      isExecutive: Boolean(isExecutive),
      customMrmnh: customMrmnhRaw !== '' && Number(customMrmnhRaw) > 0 ? Number(customMrmnhRaw) : null,
      customBestSemesterRemun: customSemRaw !== '' && Number(customSemRaw) > 0 ? Number(customSemRaw) : null,
      gratificationAmount: Number(gratRaw || 0),
    };
  }

  async requestFinalSettlementPreview({ hydrateFromSaved = false } = {}) {
    const state = this._finalWizardState;
    if (!state || !state.periodId) return;

    const employeeId = document.getElementById('final-ws-emp-select')?.value;
    if (!employeeId) return;

    if (state.abortController) {
      state.abortController.abort();
    }
    state.abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const currentSeq = ++state.seq;

    const loadingBadge = document.getElementById('final-ws-loading-indicator');
    const errAlert = document.getElementById('final-ws-error-alert');
    if (loadingBadge) loadingBadge.classList.remove('d-none');
    if (errAlert) {
      errAlert.textContent = '';
      errAlert.classList.add('d-none');
    }

    try {
      const payload = this.collectFinalPreviewPayload({ hydrateFromSaved });
      const res = await apiRequest(`/payroll/periods/${state.periodId}/final-assistant/preview`, {
        method: 'POST',
        body: JSON.stringify(payload),
        ...(state.abortController ? { signal: state.abortController.signal } : {}),
      });

      if (currentSeq !== state.seq) return;
      const data = res?.data;
      if (!data) return;

      state.preview = data;
      state.rubros = Array.isArray(data.rubros) ? data.rubros.map((r) => ({ ...r })) : [];

      this.hydrateFinalWizardControlsFromPreview(data, hydrateFromSaved);
      this.renderFinalWizardPreview(data);
    } catch (err) {
      if (err?.name === 'AbortError' || currentSeq !== state.seq) return;
      if (errAlert) {
        errAlert.textContent = err.message || 'Error al previsualizar liquidación final';
        errAlert.classList.remove('d-none');
      }
    } finally {
      if (loadingBadge && currentSeq === state.seq) {
        loadingBadge.classList.add('d-none');
      }
    }
  }

  hydrateFinalWizardControlsFromPreview(data, isInitialHydration = false) {
    const causeSel = document.getElementById('final-ws-cause-select');
    if (causeSel && Array.isArray(data.causesCatalog) && causeSel.options.length !== data.causesCatalog.length) {
      const prevVal = causeSel.value;
      causeSel.innerHTML = data.causesCatalog
        .map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.label)}</option>`)
        .join('');
      if (prevVal) causeSel.value = prevVal;
    }
    if (causeSel && data.cause?.code) {
      causeSel.value = data.cause.code;
    }

    const termDateEl = document.getElementById('final-ws-term-date');
    if (termDateEl && data.seniority?.terminationDate) {
      termDateEl.value = data.seniority.terminationDate;
    }

    if (isInitialHydration) {
      const incEl = document.getElementById('final-ws-include-worked-days');
      if (incEl) {
        const hasWorkedIncluded = (data.rubros || []).some((r) => r.key === 'WORKED_DAYS' && r.included);
        incEl.checked = data.savedWorksheet ? hasWorkedIncluded : data.existingMonthWorkedDays === 0;
      }
    }

    const mrmnhEl = document.getElementById('final-ws-custom-mrmnh');
    if (mrmnhEl && !mrmnhEl.value && data.parametersUsed?.mrmnh > 0) {
      mrmnhEl.placeholder = `Detectado: $${formatNumber(data.parametersUsed.mrmnh)}`;
    }
    const semEl = document.getElementById('final-ws-custom-sem');
    if (semEl && !semEl.value && data.parametersUsed?.bestSemesterRemun > 0) {
      semEl.placeholder = `Detectado: $${formatNumber(data.parametersUsed.bestSemesterRemun)}`;
    }
    const workedLsdEl = document.getElementById('final-ws-worked-days-lsd');
    if (workedLsdEl) {
      workedLsdEl.value = String(data.workedDaysForLsd ?? 0);
    }
    const reasonEl = document.getElementById('final-ws-reason-label');
    if (reasonEl && (isInitialHydration || !reasonEl.value)) {
      reasonEl.placeholder = data.cause?.shortLabel || 'Motivo de baja para legajo';
    }

    this.syncFinalAssistantFieldVisibility();
  }

  renderFinalWizardPreview(data) {
    // 1. KPIs superiores
    const hireDateStr = data.seniority?.hireDate
      ? new Date(`${data.seniority.hireDate}T12:00:00`).toLocaleDateString('es-AR')
      : '-';
    document.getElementById('final-ws-kpi-hire').textContent = hireDateStr;

    const sen = data.seniority || {};
    document.getElementById('final-ws-kpi-seniority').textContent = `${sen.years || 0}a ${sen.months || 0}m ${sen.days || 0}d`;
    document.getElementById('final-ws-kpi-periods').textContent = sen.inProbationPeriod
      ? 'Período de Prueba'
      : `${sen.indemnityPeriods || 0} per. Art. 245`;

    document.getElementById('final-ws-kpi-mrmnh').textContent = `$${formatNumber(data.parametersUsed?.mrmnh || 0)}`;
    document.getElementById('final-ws-kpi-mrmnh-src').textContent = data.salaryAudit?.detectedMrmnhLabel || 'Escala / Básico';

    const dueStr = data.legalDueDate
      ? new Date(`${data.legalDueDate}T12:00:00`).toLocaleDateString('es-AR')
      : '-';
    document.getElementById('final-ws-kpi-due').textContent = dueStr;

    // 2. Alertas legales y operativas
    const warningsBox = document.getElementById('final-ws-warnings-container');
    if (warningsBox) {
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      if (warnings.length === 0) {
        warningsBox.innerHTML = '';
        warningsBox.classList.add('d-none');
      } else {
        warningsBox.classList.remove('d-none');
        warningsBox.innerHTML = warnings
          .map((w) => {
            const cls = w.severity === 'warning' ? 'alert-warning' : 'alert-info';
            return `<div class="alert ${cls} py-2 px-3 small mb-2"><i class="ti ti-alert-triangle me-1"></i> ${escapeHtml(w.message)}</div>`;
          })
          .join('');
      }
    }

    // 3. Tabla de auditoría 12 meses ordinarios
    const histTbody = document.getElementById('final-ws-history-tbody');
    if (histTbody) {
      const rows = data.salaryAudit?.history12Months || [];
      if (rows.length === 0) {
        histTbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center text-muted py-2 small">
              Sin recibos ordinarios cerrados previos. Se utiliza básico vigente / escala salarial ($${formatNumber(data.parametersUsed?.mrmnh || 0)}).
            </td>
          </tr>`;
      } else {
        histTbody.innerHTML = rows
          .map(
            (r) => `
            <tr class="${r.isMrmnh ? 'table-success fw-semibold' : ''}">
              <td class="font-monospace text-nowrap">${escapeHtml(r.periodLabel)}</td>
              <td class="text-truncate" style="max-width: 240px;" title="${escapeHtml(r.settlementNames || '-')}">${escapeHtml(r.settlementNames || '-')}</td>
              <td class="text-center">${r.workedDays}</td>
              <td class="text-end font-monospace text-nowrap">
                $${formatNumber(r.remunerativeTotal)}
                ${r.isMrmnh ? '<span class="badge bg-success ms-1">MRMNH</span>' : ''}
              </td>
            </tr>`
          )
          .join('');
      }
    }

    // 4. Tabla editable de rubros
    this.renderFinalWizardRubrosTable();
  }

  renderFinalWizardRubrosTable() {
    const tbody = document.getElementById('final-ws-rubros-tbody');
    const rubros = this._finalWizardState?.rubros || [];
    if (!tbody) return;

    tbody.innerHTML = rubros
      .map((r, idx) => {
        const naturezaBadge = r.isRemunerative
          ? '<span class="badge bg-green-lt">Remunerativo SUSS</span>'
          : '<span class="badge bg-azure-lt">Indemniz. / Exento SUSS</span>';
        const taxBadge =
          r.incomeTaxTreatment === 'EXENTO'
            ? '<span class="badge bg-teal-lt">Exento Ganancias</span>'
            : r.incomeTaxTreatment === 'EXENTO_HASTA_TOPE'
              ? '<span class="badge bg-warning-lt">Exento hasta tope Art. 245</span>'
              : r.incomeTaxTreatment === 'EVALUAR_REGIMEN'
                ? '<span class="badge bg-secondary-lt">Evaluar Ganancias</span>'
                : '<span class="badge bg-orange-lt">Gravado Ganancias</span>';

        return `
          <tr class="${r.included ? '' : 'opacity-50'}">
            <td class="text-center align-middle">
              <input type="checkbox" class="form-check-input final-ws-rubro-check" data-idx="${idx}" ${r.included ? 'checked' : ''} />
            </td>
            <td class="align-middle">
              <div class="fw-semibold text-dark">${escapeHtml(r.label)}</div>
              <div class="small text-muted">
                <span class="font-monospace">${escapeHtml(r.targetConceptCode || r.conceptCode)}</span>
                &bull; ARCA <span class="font-monospace fw-semibold">${escapeHtml(r.arcaConceptCode)}</span>
                &bull; ${escapeHtml(r.legalRef)}
              </div>
              <div class="small text-muted fst-italic">${escapeHtml(r.formulaExplanation || '')}</div>
            </td>
            <td class="text-center align-middle">
              <div>${naturezaBadge}</div>
              <div class="mt-1">${taxBadge}</div>
            </td>
            <td class="text-end align-middle font-monospace text-nowrap">
              ${r.units !== undefined && r.units !== null ? `${escapeHtml(String(r.units))} ${escapeHtml(r.unitLabel || '')}` : '-'}
            </td>
            <td class="text-end align-middle" style="width: 170px;">
              <div class="input-group input-group-sm">
                <span class="input-group-text">$</span>
                <input type="number" step="0.01" min="0"
                  class="form-control text-end font-monospace final-ws-rubro-amount"
                  data-idx="${idx}"
                  value="${Number(r.amount || 0).toFixed(2)}"
                  ${r.included ? '' : 'disabled'} />
              </div>
            </td>
          </tr>`;
      })
      .join('');

    tbody.querySelectorAll('.final-ws-rubro-check').forEach((chk) => {
      chk.addEventListener('change', () => {
        const idx = Number(chk.dataset.idx);
        const r = this._finalWizardState?.rubros?.[idx];
        if (!r) return;
        r.included = chk.checked;
        const rowEl = chk.closest('tr');
        rowEl?.classList.toggle('opacity-50', !chk.checked);
        const amtInput = rowEl?.querySelector('.final-ws-rubro-amount');
        if (amtInput) amtInput.disabled = !chk.checked;
        this.updateFinalWizardLiveTotals();
      });
    });

    tbody.querySelectorAll('.final-ws-rubro-amount').forEach((inp) => {
      inp.addEventListener('input', () => {
        const idx = Number(inp.dataset.idx);
        const r = this._finalWizardState?.rubros?.[idx];
        if (!r) return;
        r.amount = Math.max(0, Math.round((Number(inp.value) || 0) * 100) / 100);
        this.updateFinalWizardLiveTotals();
      });
    });

    this.updateFinalWizardLiveTotals();
  }

  updateFinalWizardLiveTotals() {
    const rubros = this._finalWizardState?.rubros || [];
    let rem = 0;
    let nonRem = 0;
    let taxGrav = 0;
    let taxExempt = 0;

    for (const r of rubros) {
      if (!r.included) continue;
      const amt = Math.max(0, Number(r.amount) || 0);
      if (amt <= 0) continue;
      if (r.type === 'REMUNERATIVE') rem += amt;
      else nonRem += amt;

      if (r.incomeTaxTreatment === 'EXENTO') taxExempt += amt;
      else taxGrav += amt;
    }

    const total = Math.round((rem + nonRem) * 100) / 100;
    const setTxt = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `$${formatNumber(Math.round(v * 100) / 100)}`;
    };
    setTxt('final-ws-total-rem', rem);
    setTxt('final-ws-total-nonrem', nonRem);
    setTxt('final-ws-total-gross', total);
    setTxt('final-ws-total-taxable', taxGrav);
    setTxt('final-ws-total-exempt', taxExempt);
  }

  async applyFinalSettlementAssistant() {
    const state = this._finalWizardState;
    if (!state || !state.periodId) return;

    const empId = document.getElementById('final-ws-emp-select')?.value;
    const termDate = document.getElementById('final-ws-term-date')?.value;
    if (!empId || !termDate) {
      showToast('Seleccione colaborador y fecha de egreso.', 'warning');
      return;
    }

    const applyBtn = document.getElementById('btn-apply-final-settlement');
    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Aplicando y calculando...';
    }

    try {
      const basePayload = this.collectFinalPreviewPayload({ hydrateFromSaved: false });
      const workedLsd = Math.max(0, Math.min(30, Math.round(Number(document.getElementById('final-ws-worked-days-lsd')?.value || 0))));
      const customReason = document.getElementById('final-ws-reason-label')?.value?.trim() || null;

      const payload = {
        ...basePayload,
        employeeId: empId,
        terminationDate: termDate,
        terminationReasonLabel: customReason,
        workedDaysForLsd: workedLsd,
        items: (state.rubros || []).map((r) => ({
          conceptCode: r.conceptCode,
          included: Boolean(r.included),
          amount: Math.max(0, Math.round((Number(r.amount) || 0) * 100) / 100),
          units: r.units !== undefined && r.units !== null ? Number(r.units) : 1,
        })),
      };

      const res = await apiRequest(`/payroll/periods/${state.periodId}/final-assistant/apply`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const slip = res?.data?.paySlip;
      showToast(
        slip
          ? `Liquidación Final aplicada. Neto calculado: $${formatNumber(slip.netSalary || 0)}`
          : res.message || 'Liquidación Final aplicada exitosamente',
        'success'
      );

      getBootstrapModal(document.getElementById('modal-final-settlement-wizard'))?.hide();

      await Promise.allSettled([
        this.loadPayrollPeriods(),
        this.loadSettlementView(),
      ]);

      const singleSelect = document.getElementById('settlement-single-emp-select');
      if (singleSelect && singleSelect.querySelector(`option[value="${CSS.escape(empId)}"]`)) {
        singleSelect.value = empId;
        this.onSettlementSingleSelected?.(empId);
      }
    } catch (err) {
      const errAlert = document.getElementById('final-ws-error-alert');
      if (errAlert) {
        errAlert.textContent = err.message || 'Error al aplicar liquidación final';
        errAlert.classList.remove('d-none');
      }
      showToast(err.message || 'Error al aplicar liquidación final', 'danger');
    } finally {
      if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.innerHTML = '<i class="ti ti-check me-1"></i> Aplicar al Recibo y Calcular';
      }
    }
  }
}

export function registerFinalSettlementAssistantMethods(targetPrototype) {
  Object.getOwnPropertyNames(FinalSettlementAssistantMethods.prototype).forEach((name) => {
    if (name !== 'constructor') {
      targetPrototype[name] = FinalSettlementAssistantMethods.prototype[name];
    }
  });
}
