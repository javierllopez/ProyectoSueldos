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
  async loadLsdMonthlyPeriods(preferredKey = null) {
    const select = document.getElementById('lsd-period-select');
    if (!select) return;

    try {
      const res = await apiRequest('/payroll/lsd/monthly-periods');
      const periods = res.data || [];
      this.lsdMonthlyPeriods = periods;

      if (periods.length === 0) {
        updateSearchableSelect(select, '<option value="">No hay liquidaciones registradas</option>', '');
        return;
      }

      const targetVal = preferredKey || select.value || periods[0].periodKey;
      const optsHtml = periods
        .map((p) => `<option value="${p.periodKey}" ${p.periodKey === targetVal ? 'selected' : ''}>${escapeHtml(p.label)}</option>`)
        .join('');

      updateSearchableSelect(select, optsHtml, targetVal);

      const helperText = document.getElementById('lsd-period-helper-text');
      const currentP = periods.find((p) => p.periodKey === targetVal) || periods[0];
      if (helperText && currentP) {
        const openNotice = currentP.hasOpen ? ' <span class="badge bg-warning-lt text-warning ms-1">Contiene liquidaciones abiertas</span>' : '';
        helperText.innerHTML = `<i class="ti ti-info-circle me-1"></i> Se consolidarán automáticamente <strong>${currentP.settlements.length} liquidaciones</strong> (${currentP.totalSlips} recibos).${openNotice}`;
      }
    } catch (err) {
      showToast(err.message || 'Error al cargar períodos mensuales para LSD', 'danger');
    }
  }

  resetLsdStatusCard() {
    const title = document.getElementById('lsd-status-title');
    const desc = document.getElementById('lsd-status-desc');
    const icon = document.getElementById('lsd-status-icon');
    const errBox = document.getElementById('lsd-errors-list');
    const modalBtnContainer = document.getElementById('lsd-modal-launch-btn-container');

    if (title) title.textContent = 'Consistencia de Liquidación';
    if (desc) desc.textContent = 'Haga clic en "Auditar Consistencia ARCA" para previsualizar y validar el período mensual.';
    if (icon) icon.className = 'ti ti-shield-check fs-2 text-muted';
    if (errBox) errBox.classList.add('d-none');
    if (modalBtnContainer) modalBtnContainer.classList.add('d-none');
  }

  async openLsdAuditConfirmModal() {
    const select = document.getElementById('lsd-period-select');
    const periodKey = select?.value;
    if (!periodKey || !periodKey.includes('-')) {
      showToast('Seleccione un período mensual para auditar', 'warning');
      return;
    }

    const [year, month] = periodKey.split('-');
    try {
      showToast('Cargando detalle de liquidaciones del período...');
      const res = await apiRequest(`/payroll/lsd/monthly/${year}/${month}/preview`);
      const preview = res.data;

      const modalEl = document.getElementById('modal-lsd-audit-confirm');
      if (!modalEl) return;

      const periodEl = document.getElementById('modal-lsd-confirm-period');
      if (periodEl) periodEl.textContent = preview.periodKey;

      const settsCountEl = document.getElementById('modal-lsd-confirm-settlements-count');
      if (settsCountEl) settsCountEl.textContent = preview.totalSettlements;

      const empsCountEl = document.getElementById('modal-lsd-confirm-employees-count');
      if (empsCountEl) empsCountEl.textContent = preview.uniqueEmployeesCount;

      const grossEl = document.getElementById('modal-lsd-confirm-total-gross');
      if (grossEl) grossEl.textContent = '$' + Number(preview.totalGross || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const warnBox = document.getElementById('modal-lsd-confirm-open-warning');
      if (warnBox) {
        if (preview.hasOpen) warnBox.classList.remove('d-none');
        else warnBox.classList.add('d-none');
      }

      const latestDateStr = preview.latestPaymentDate
        ? new Date(String(preview.latestPaymentDate).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR')
        : '-';
      const dateInfoEl = document.getElementById('modal-lsd-confirm-payment-date-info');
      if (dateInfoEl) {
        dateInfoEl.innerHTML = `<i class="ti ti-calendar-check text-primary me-1"></i> Fecha de pago en Reg 02: <strong>${latestDateStr}</strong>`;
      }

      const tbody = document.getElementById('modal-lsd-confirm-tbody');
      if (tbody) {
        tbody.innerHTML = (preview.settlements || [])
          .map((s) => {
            const isOpen = s.status !== 'CLOSED';
            const statusBadge = isOpen
              ? `<span class="badge bg-warning-lt text-warning"><i class="ti ti-clock me-1"></i>${escapeHtml(s.status)}</span>`
              : `<span class="badge bg-success-lt text-success"><i class="ti ti-circle-check me-1"></i>CERRADA</span>`;

            const sDate = s.paymentDate
              ? new Date(String(s.paymentDate).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR')
              : '-';
            const sGross = '$' + Number(s.totalGross || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            return `<tr>
              <td><span class="badge bg-secondary-lt fw-bold">${escapeHtml(s.settlementType || 'M')}</span></td>
              <td>
                <div class="fw-bold">${escapeHtml(s.settlementName)}</div>
                <div class="text-muted small">${escapeHtml(s.periodTypeLabel || s.periodType)} • Liq. #${s.settlementNumber}</div>
              </td>
              <td class="font-monospace small">${sDate}</td>
              <td class="text-center font-monospace fw-bold">${s.slipsCount}</td>
              <td class="text-end font-monospace">${sGross}</td>
              <td class="text-center">${statusBadge}</td>
            </tr>`;
          })
          .join('');
      }

      getBootstrapModal(modalEl)?.show();
    } catch (err) {
      showToast(err.message || 'Error al obtener liquidaciones del mes', 'danger');
    }
  }

  async auditLsdConsistency() {
    const modalEl = document.getElementById('modal-lsd-audit-confirm');
    if (modalEl) getBootstrapModal(modalEl)?.hide();

    const periodSelect = document.getElementById('lsd-period-select');
    const periodKey = periodSelect?.value;
    if (!periodKey || !periodKey.includes('-')) {
      showToast('Seleccione un período para auditar', 'warning');
      return;
    }

    const [year, month] = periodKey.split('-');

    try {
      showToast('Auditando consistencia técnica de Libro de Sueldos Digital (ARCA)...');
      const res = await apiRequest(`/payroll/lsd/monthly/${year}/${month}/validate`);
      const val = res.data;
      const title = document.getElementById('lsd-status-title');
      const desc = document.getElementById('lsd-status-desc');
      const icon = document.getElementById('lsd-status-icon');
      const errBox = document.getElementById('lsd-errors-list');
      const modalBtnContainer = document.getElementById('lsd-modal-launch-btn-container');

      if (val.isValid) {
        if (title) title.textContent = 'Consistencia 100% Válida para ARCA';
        if (desc) desc.textContent = `El período ${periodKey} (${val.totalSettlements} liquidaciones, ${val.totalEmployees} trabajadores) cumple estrictamente los 999 caracteres por registro, el tope de 30 días y las 10 bases imponibles unificadas.`;
        if (icon) {
          icon.className = 'ti ti-shield-check fs-2 text-success';
        }
        if (errBox) errBox.classList.add('d-none');
        if (modalBtnContainer) modalBtnContainer.classList.add('d-none');
        this.currentLsdAuditErrors = [];
        this.currentLsdAuditPeriodKey = null;
        showToast('Período auditado con éxito: formato apto para Libro de Sueldos Digital (F.931)', 'success');
      } else {
        const errors = val.errors || [];
        const errorCount = errors.length;
        this.currentLsdAuditErrors = errors;
        this.currentLsdAuditPeriodKey = periodKey;

        if (title) title.textContent = 'Se detectaron inconsistencias en el período mensual';
        if (desc) desc.textContent = `Se encontraron ${errorCount} error(es) en el período ${periodKey} que deben corregirse antes de presentar a ARCA:`;
        if (icon) {
          icon.className = 'ti ti-alert-triangle fs-2 text-warning';
        }

        if (modalBtnContainer) {
          modalBtnContainer.classList.remove('d-none');
          const badgeCount = document.getElementById('lsd-errors-badge-count');
          if (badgeCount) badgeCount.textContent = errorCount;
        }

        if (errBox) {
          errBox.innerHTML = `
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
              <span class="fw-bold text-danger"><i class="ti ti-alert-circle me-1"></i> Se encontraron ${errorCount} inconsistencias en la liquidación mensual</span>
              <button type="button" class="btn btn-sm btn-danger px-3 py-1" id="btn-reopen-lsd-errors-modal">
                <i class="ti ti-list-details me-1"></i> Ver Lista Completa y Exportar a Excel
              </button>
            </div>
            <div class="small text-muted mb-2">Haga clic en el botón para revisar la lista detallada y exportar las inconsistencias en formato Excel (.xlsx).</div>
            <div class="border rounded bg-white p-2" style="max-height: 180px; overflow-y: auto;">
              ${errors
                .slice(0, 5)
                .map((e) => {
                  if (typeof e === 'string') {
                    return `<div class="py-1 border-bottom border-light-subtle">&bull; ${escapeHtml(e)}</div>`;
                  }
                  const legajoInfo = e.legajo ? `<strong>[Legajo ${escapeHtml(e.legajo)}${e.cuil ? ' - CUIL ' + escapeHtml(e.cuil) : ''}]</strong> ` : '';
                  const typeBadge = e.type ? `<span class="badge bg-danger-lt me-1">${escapeHtml(e.type)}</span> ` : '';
                  const msg = escapeHtml(e.message || JSON.stringify(e));
                  return `<div class="d-flex align-items-start gap-1 py-1 border-bottom border-light-subtle">
                    <span class="text-danger">&bull;</span>
                    <div>${typeBadge}${legajoInfo}<span>${msg}</span></div>
                  </div>`;
                })
                .join('')}
              ${errorCount > 5 ? `<div class="text-center pt-2 text-muted small fst-italic">... y ${errorCount - 5} inconsistencias adicionales. Abra la ventana para ver todas o exportar a Excel.</div>` : ''}
            </div>
          `;
          errBox.classList.remove('d-none');

          const btnReopen = document.getElementById('btn-reopen-lsd-errors-modal');
          if (btnReopen) {
            btnReopen.addEventListener('click', () => this.showLsdAuditErrorsModal(this.currentLsdAuditErrors, this.currentLsdAuditPeriodKey));
          }
        }

        showToast(`Se detectaron ${errorCount} inconsistencias en ARCA`, 'warning');

        // Lanzar automáticamente la ventana de errores luego de la auditoría
        this.showLsdAuditErrorsModal(errors, periodKey);
      }
    } catch (err) {
      showToast(err.message || 'Error al validar ARCA', 'danger');
    }
  }

  showLsdAuditErrorsModal(errors, periodKey) {
    this.currentLsdAuditErrors = errors || [];
    this.currentLsdAuditPeriodKey = periodKey;

    const modalEl = document.getElementById('modal-lsd-audit-errors');
    if (!modalEl) return;

    // Resetear campo de búsqueda
    const searchInput = document.getElementById('modal-lsd-audit-search');
    if (searchInput) searchInput.value = '';

    // Poblar selector de tipos de inconsistencia
    const typeSelect = document.getElementById('modal-lsd-audit-filter-type');
    if (typeSelect) {
      const types = Array.from(new Set((errors || []).map((e) => (typeof e === 'object' && e?.type ? e.type : 'ERROR_GENERAL'))));
      typeSelect.innerHTML = '<option value="ALL">Todos los tipos de inconsistencia</option>' +
        types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
      typeSelect.value = 'ALL';
    }

    const periodSelect = document.getElementById('lsd-period-select');
    const periodText = periodSelect?.options[periodSelect.selectedIndex]?.text?.trim() || '';
    const subtitleEl = document.getElementById('modal-lsd-audit-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent = `Período: ${periodText || periodKey} • Se detectaron ${(errors || []).length} observación(es) técnica(s)`;
    }

    this.renderLsdAuditErrorsTable();

    getBootstrapModal(modalEl)?.show();
  }

  renderLsdAuditErrorsTable() {
    const tbody = document.getElementById('modal-lsd-audit-tbody');
    const countEl = document.getElementById('modal-lsd-audit-count');
    if (!tbody) return;

    const searchTerm = (document.getElementById('modal-lsd-audit-search')?.value || '').toLowerCase().trim();
    const filterType = document.getElementById('modal-lsd-audit-filter-type')?.value || 'ALL';

    const errors = this.currentLsdAuditErrors || [];
    const filtered = errors.filter((e) => {
      const isObj = typeof e === 'object' && e !== null;
      const type = isObj && e.type ? e.type : 'ERROR_GENERAL';
      const legajo = isObj && e.legajo ? String(e.legajo).toLowerCase() : '';
      const cuil = isObj && e.cuil ? String(e.cuil).toLowerCase() : '';
      const msg = isObj && e.message ? String(e.message).toLowerCase() : String(e).toLowerCase();

      if (filterType !== 'ALL' && type !== filterType) return false;
      if (searchTerm) {
        return legajo.includes(searchTerm) || cuil.includes(searchTerm) || type.toLowerCase().includes(searchTerm) || msg.includes(searchTerm);
      }
      return true;
    });

    if (countEl) {
      countEl.textContent = `${filtered.length} de ${errors.length} ${errors.length === 1 ? 'error' : 'errores'}`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr>
        <td colspan="5" class="text-center py-4 text-muted">
          <i class="ti ti-search-off fs-2 d-block mb-1"></i>
          No se encontraron inconsistencias que coincidan con el filtro aplicado.
        </td>
      </tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map((e, idx) => {
        const isObj = typeof e === 'object' && e !== null;
        const legajo = isObj ? (e.legajo || '-') : '-';
        const cuil = isObj ? (e.cuil || '-') : '-';
        const type = isObj ? (e.type || 'ERROR_GENERAL') : 'ERROR_GENERAL';
        const msg = isObj ? (e.message || JSON.stringify(e)) : String(e);

        let badgeClass = 'bg-danger-lt text-danger';
        if (type.includes('BRUTO')) badgeClass = 'bg-warning-lt text-warning';
        else if (type.includes('DIAS')) badgeClass = 'bg-orange-lt text-orange';
        else if (type.includes('SIPA')) badgeClass = 'bg-danger-lt text-danger';

        return `<tr>
          <td class="text-center font-monospace small text-muted">${idx + 1}</td>
          <td>
            <span class="badge bg-secondary-lt font-monospace fw-bold">${escapeHtml(legajo)}</span>
          </td>
          <td class="font-monospace small">${escapeHtml(cuil)}</td>
          <td>
            <span class="badge ${badgeClass} text-uppercase" style="font-size: 0.72rem;">${escapeHtml(type)}</span>
          </td>
          <td>
            <div class="small text-wrap text-break">${escapeHtml(msg)}</div>
          </td>
        </tr>`;
      })
      .join('');
  }

  exportLsdErrorsToExcel() {
    if (!window.XLSX) {
      showToast('La librería SheetJS (XLSX) no está disponible en este momento', 'warning');
      return;
    }

    const errors = this.currentLsdAuditErrors || [];
    if (errors.length === 0) {
      showToast('No hay inconsistencias para exportar a Excel', 'warning');
      return;
    }

    // Preparar filas estructuradas para la hoja de cálculo
    const rows = errors.map((e, index) => {
      const isObj = typeof e === 'object' && e !== null;
      return {
        'N°': index + 1,
        'Legajo': isObj ? (e.legajo || '-') : '-',
        'CUIL': isObj ? (e.cuil || '-') : '-',
        'Tipo de Inconsistencia': isObj ? (e.type || 'ERROR_GENERAL') : 'ERROR_GENERAL',
        'Detalle de la Observación': isObj ? (e.message || JSON.stringify(e)) : String(e),
      };
    });

    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.json_to_sheet(rows);

    // Configurar anchos automáticos de columna
    ws['!cols'] = [
      { wch: 6 },   // N°
      { wch: 12 },  // Legajo
      { wch: 16 },  // CUIL
      { wch: 30 },  // Tipo de Inconsistencia
      { wch: 80 },  // Detalle de la Observación
    ];

    const periodSelect = document.getElementById('lsd-period-select');
    const periodVal = (periodSelect?.value || 'Periodo').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Inconsistencias_ARCA_${periodVal}.xlsx`;

    window.XLSX.utils.book_append_sheet(wb, ws, 'Inconsistencias_ARCA');
    window.XLSX.writeFile(wb, filename);

    showToast('Inconsistencias exportadas exitosamente a Excel (.xlsx)', 'success');
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
    const periodKey = periodSelect?.value;
    if (!periodKey || !periodKey.includes('-')) {
      showToast('Seleccione un período mensual para exportar', 'warning');
      return;
    }

    const [year, month] = periodKey.split('-');

    try {
      showToast('Generando archivo Libro de Sueldos Digital (ARCA)...');
      const token = storage.getToken();
      const companyId = storage.getActiveCompanyId();

      const response = await fetch(`/api/v1/payroll/lsd/monthly/${year}/${month}/export`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error?.message || errJson.message || 'Error al descargar liquidación ARCA');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LSD_Mensual_${year}${String(month).padStart(2, '0')}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Archivo F.931 mensual unificado (999 caracteres) descargado correctamente', 'success');
    } catch (err) {
      showToast(err.message || 'Error en descarga ARCA', 'danger');
    }
  }

  // --- Conceptos y Diseñador de Fórmulas ---

}

export function registerPayrollLsdMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(MixinMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
