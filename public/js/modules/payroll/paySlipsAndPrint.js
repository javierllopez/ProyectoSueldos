import { apiRequest, storage, showToast } from '../../api.js?v=2.1';
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
  async loadPayrollSlips(periodId) {
    if (!periodId) return;

    const slipsInput = document.getElementById('slips-period-select');
    if (slipsInput && slipsInput.value !== periodId) {
      slipsInput.value = periodId;
    }
    this.renderPeriodContextBanners(periodId);

    const spinner = document.getElementById('slips-spinner');
    if (spinner) spinner.classList.remove('d-none');

    const searchInput = document.getElementById('slips-search-input');
    const deptFilter = document.getElementById('slips-department-filter');

    if (deptFilter && deptFilter.options.length <= 1) {
      try {
        const deptsRes = await apiRequest('/departments?limit=500');
        const depts = deptsRes.data || [];
        const curDept = deptFilter.value || 'ALL';
        deptFilter.innerHTML =
          '<option value="ALL">Todos los Sectores</option>' +
          depts.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
        deptFilter.value = curDept;
      } catch (_e) {
        // Ignorar error de carga opcional de sectores
      }
    }

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

    const periodId = document.getElementById('slips-period-select')?.value;
    const currentPeriod = (this.payrollPeriods || []).find((p) => p.id === periodId);
    const isPeriodOpen = currentPeriod ? currentPeriod.status !== 'CLOSED' : true;

    tbody.innerHTML = slips
      .map((s) => {
        const emp = s.employee || {};
        const bruto = Number(s.grossSalary || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const retenciones = Number(s.totalDeductions || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const neto = Number(s.netSalary || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const initials = ((emp.firstName?.[0] || '') + (emp.lastName?.[0] || '')).toUpperCase() || 'EM';
        const canDelete = isPeriodOpen && (s.payrollPeriod?.status ? s.payrollPeriod.status !== 'CLOSED' : true);

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
              <span class="badge bg-secondary-lt px-1 py-0 mt-1" style="font-size: 0.68rem;" title="Días trabajados para Registro 02 (LSD ARCA)">
                <i class="ti ti-calendar me-1"></i>${s.workedDays !== undefined && s.workedDays !== null ? s.workedDays : 30}d
              </span>
            </td>
            <td class="text-end font-monospace">
              <div class="fw-bold text-success fs-3" style="letter-spacing: -0.02em;">$ ${neto}</div>
            </td>
            <td class="col-slip-status">
              ${
                s.status === 'CLOSED'
                  ? `<span class="badge bg-success text-white d-inline-flex align-items-center justify-content-center" title="Recibo cerrado e inmutable" style="width: 28px; height: 28px; border-radius: 6px; padding: 0; overflow: visible;"><i class="ti ti-lock"></i></span>`
                  : `<span class="badge bg-green-lt text-success d-inline-flex align-items-center justify-content-center" title="Recibo emitido" style="width: 28px; height: 28px; border-radius: 6px; padding: 0; overflow: visible;"><i class="ti ti-check"></i></span>`
              }
            </td>
            <td class="col-slip-action">
              <div class="d-flex gap-1 justify-content-end align-items-center">
                <button type="button" class="btn btn-sm btn-icon btn-outline-primary btn-view-slip" data-id="${s.id}" title="Ver e imprimir recibo oficial">
                  <i class="ti ti-eye"></i>
                </button>
                <button type="button" class="btn btn-sm btn-icon btn-outline-purple btn-audit-slip" data-id="${s.id}" title="Auditoría de liquidación (Ver todos los conceptos y auxiliares)">
                  <i class="ti ti-report-analytics"></i>
                </button>
                ${
                  canDelete
                    ? `<button type="button" class="btn btn-sm btn-icon btn-outline-danger btn-delete-slip" data-id="${s.id}" data-name="${escapeHtml(emp.lastName || '')}, ${escapeHtml(emp.firstName || '')}" data-file="${escapeHtml(emp.fileNumber || '')}" title="Eliminar recibo de sueldo">
                         <i class="ti ti-trash"></i>
                       </button>`
                    : `<button type="button" class="btn btn-sm btn-icon btn-outline-secondary" disabled title="Liquidación cerrada: no se permite eliminar recibos">
                         <i class="ti ti-trash"></i>
                       </button>`
                }
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

    tbody.querySelectorAll('.btn-delete-slip').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.confirmDeleteSlip(btn.dataset.id, btn.dataset.name, btn.dataset.file);
      });
    });
  }

  confirmDeleteSlip(slipId, name, fileNumber) {
    const modalEl = document.getElementById('modal-confirm-delete');
    const msg = `¿Estás seguro de que deseas eliminar el recibo de sueldo del colaborador <strong>${escapeHtml(name)}</strong>${fileNumber ? ` (Legajo ${escapeHtml(fileNumber)})` : ''}?`;
    const warn = 'Esta acción eliminará el cálculo del recibo y todos sus conceptos detallados para esta liquidación abierta.';

    if (!modalEl) {
      if (confirm(`¿Estás seguro de que deseas eliminar el recibo de sueldo de ${name}?`)) {
        this.executeDeleteSlip(slipId);
      }
      return;
    }

    const titleEl = document.getElementById('modal-confirm-delete-title');
    const msgEl = document.getElementById('modal-confirm-delete-message');
    const warnEl = document.getElementById('modal-confirm-delete-warning');
    const btnConfirm = document.getElementById('btn-confirm-delete-action');

    if (titleEl) titleEl.textContent = '¿Eliminar Recibo de Sueldo?';
    if (msgEl) msgEl.innerHTML = msg;
    if (warnEl) {
      warnEl.innerHTML = `<i class="ti ti-alert-triangle me-1"></i> ${warn}`;
      warnEl.classList.remove('d-none');
    }

    if (btnConfirm) {
      btnConfirm.innerHTML = '<i class="ti ti-trash me-1"></i> Eliminar Recibo';
      const newBtn = btnConfirm.cloneNode(true);
      btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);

      newBtn.addEventListener('click', async () => {
        newBtn.disabled = true;
        newBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Eliminando...';
        try {
          await this.executeDeleteSlip(slipId);
          getBootstrapModal(modalEl)?.hide();
        } catch (err) {
          showToast(err.message || 'Error al eliminar recibo', 'danger');
        } finally {
          newBtn.disabled = false;
          newBtn.innerHTML = '<i class="ti ti-trash me-1"></i> Eliminar Recibo';
        }
      });
    }

    getBootstrapModal(modalEl)?.show();
  }

  async executeDeleteSlip(slipId) {
    const res = await apiRequest(`/payroll/slips/${slipId}`, { method: 'DELETE' });
    showToast(res.message || 'Recibo de sueldo eliminado correctamente', 'success');
    const sel = document.getElementById('slips-period-select');
    if (sel?.value) {
      await this.loadPayrollSlips(sel.value);
    }
    await this.loadPayrollPeriods();
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

  generatePayslipHtml(data) {
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
            <td class="font-monospace text-center">${escapeHtml(it.conceptCode)}</td>
            <td class="payslip-col-concept-name">${escapeHtml(it.conceptName)}</td>
            <td class="text-center font-monospace">${it.units ? Number(it.units) : '-'}</td>
            <td class="text-end font-monospace">${isRem ? `$ ${amountStr}` : ''}</td>
            <td class="text-end font-monospace">${isNonRem ? `$ ${amountStr}` : ''}</td>
            <td class="text-end font-monospace payslip-col-retenciones">${isDed ? `$ ${amountStr}` : ''}</td>
          </tr>
        `;
      })
      .join('');

    return `
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
          <span class="d-inline-flex align-items-center gap-1">
            DÍAS TRABAJADOS (REG 02): <strong class="badge bg-secondary-lt fw-bold px-2 py-1">${slip.workedDays !== undefined && slip.workedDays !== null ? slip.workedDays : 30}</strong>
            <button type="button" class="btn btn-sm btn-icon btn-ghost-secondary p-0 ms-1 btn-edit-slip-days" data-id="${slip.id}" data-days="${slip.workedDays !== undefined && slip.workedDays !== null ? slip.workedDays : 30}" title="Modificar días trabajados para Registro 02 (LSD ARCA)">
              <i class="ti ti-pencil" style="font-size: 13px;"></i>
            </button>
          </span>
        </div>
        <div class="p-0">
          <table class="payslip-table-items">
            <colgroup>
              <col style="width: 48px;">
              <col style="width: auto;">
              <col style="width: 55px;">
              <col style="width: 105px;">
              <col style="width: 110px;">
              <col style="width: 110px;">
            </colgroup>
            <thead>
              <tr>
                <th class="text-center">Cód.</th>
                <th>Concepto</th>
                <th class="text-center">Unid.</th>
                <th class="text-end">Remunerativos</th>
                <th class="text-end">No Remunerativos</th>
                <th class="text-end payslip-col-retenciones">Retenciones</th>
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

  renderPayslipVector(data) {
    const area = document.getElementById('printable-payslip-area');
    if (!area) return;

    area.innerHTML = this.generatePayslipHtml(data);

    // Handler para editar días trabajados de forma directa desde el recibo
    area.querySelectorAll('.btn-edit-slip-days').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const currentDays = btn.dataset.days || '30';
        const newDaysStr = window.prompt('Ingrese la cantidad de días trabajados a informar en el Registro 02 para este recibo (0 a 30):', currentDays);
        if (newDaysStr === null) return;
        const parsed = parseInt(newDaysStr, 10);
        if (isNaN(parsed) || parsed < 0 || parsed > 30) {
          showToast('Debe ingresar un número entero válido entre 0 y 30 días.', 'warning');
          return;
        }
        try {
          await apiRequest(`/payroll/slips/${btn.dataset.id}/worked-days`, {
            method: 'PATCH',
            body: { workedDays: parsed },
          });
          showToast(`Días trabajados actualizados a ${parsed} días exitosamente`, 'success');
          await this.openPayslipModal(btn.dataset.id, 'OFFICIAL');
          const sel = document.getElementById('slips-period-select');
          if (sel?.value) this.loadPayrollSlips(sel.value);
        } catch (err) {
          showToast(err.message || 'Error al actualizar días trabajados', 'danger');
        }
      });
    });
  }

  resolveAuditItemFormula(it, slip, formatMoney) {
    let formulaExpl = it.formulaExplanation;
    if (!formulaExpl && it.formula) {
      let substituted = it.formula;
      const itemMap = new Map();
      (slip.items || []).forEach((item) => {
        itemMap.set(String(item.conceptCode).toUpperCase(), item.amount);
        const num = String(item.conceptCode).replace(/\D/g, '');
        if (num) itemMap.set(num, item.amount);
      });
      itemMap.set('BASICO', slip.basicSalary || slip.grossSalary || 0);
      itemMap.set('TOTAL_REMUNERATIVO', slip.remunerativeSalary || 0);
      itemMap.set('TOTAL_BRUTO', slip.grossSalary || 0);
      itemMap.set('CANTIDAD', it.units || 1);
      itemMap.set('UNIDADES', it.units || 1);
      itemMap.set('HORAS', it.units || 0);

      substituted = substituted.replace(/\[([A-Z0-9_:]+)\]/gi, (match, key) => {
        const uKey = key.toUpperCase().trim();
        if (itemMap.has(uKey)) {
          return String(itemMap.get(uKey));
        }
        return match;
      });
      formulaExpl = substituted;
    } else if (!formulaExpl && it.rate && it.baseAmount) {
      formulaExpl = `${formatMoney(it.baseAmount)} * ${it.rate}%`;
    }

    if (
      formulaExpl &&
      /(TOPE_MAX|TOPE_MIN|LIMITAR|SI|IF|MIN|MAX|REDONDEAR|ROUND|ABS|CEIL|FLOOR|DIF_DIAS|DIF_MESES|DIF_ANIOS|DIF_FECHA|DIFERENCIA_FECHAS)\s*\(/i.test(
        formulaExpl
      )
    ) {
      let expr = formulaExpl;
      const fnRegex =
        /(TOPE_MAX|TOPE_MIN|LIMITAR|SI|IF|MIN|MAX|REDONDEAR|ROUND|ABS|CEIL|FLOOR|DIF_DIAS|DIF_MESES|DIF_ANIOS|DIF_FECHA|DIFERENCIA_FECHAS)\s*\(/i;
      let safety = 25;
      while (fnRegex.test(expr) && safety > 0) {
        safety--;
        const matches = [
          ...expr.matchAll(
            /(TOPE_MAX|TOPE_MIN|LIMITAR|SI|IF|MIN|MAX|REDONDEAR|ROUND|ABS|CEIL|FLOOR|DIF_DIAS|DIF_MESES|DIF_ANIOS|DIF_FECHA|DIFERENCIA_FECHAS)\s*\(/gi
          ),
        ];
        if (matches.length === 0) break;
        const lastMatch = matches[matches.length - 1];
        const fnName = lastMatch[1].toUpperCase();
        const startIdx = lastMatch.index;
        const openParen = startIdx + lastMatch[0].length - 1;

        let depth = 1;
        let closeParen = -1;
        for (let i = openParen + 1; i < expr.length; i++) {
          if (expr[i] === '(') depth++;
          else if (expr[i] === ')') {
            depth--;
            if (depth === 0) {
              closeParen = i;
              break;
            }
          }
        }
        if (closeParen === -1) break;

        const innerArgs = expr
          .substring(openParen + 1, closeParen)
          .split(',')
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
        let val = 0;

        if (fnName === 'DIF_DIAS') {
          const d1 = new Date(innerArgs[0]);
          const d2 = new Date(innerArgs[1]);
          const inc =
            innerArgs[2] === 'true' ||
            innerArgs[2] === '1' ||
            (innerArgs[2] && innerArgs[2].toUpperCase() === 'INCLUSIVO');
          if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
            const diffMs = d2.getTime() - d1.getTime();
            const diffDays = Math.round(diffMs / 86400000);
            val = inc ? diffDays + 1 : diffDays;
          }
        } else if (fnName === 'DIF_MESES') {
          const d1 = new Date(innerArgs[0]);
          const d2 = new Date(innerArgs[1]);
          if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
            let m = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
            if (d2.getDate() < d1.getDate()) m--;
            val = Math.max(0, m);
          }
        } else if (fnName === 'DIF_ANIOS') {
          const d1 = new Date(innerArgs[0]);
          const d2 = new Date(innerArgs[1]);
          if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
            let y = d2.getFullYear() - d1.getFullYear();
            const mDiff = d2.getMonth() - d1.getMonth();
            if (mDiff < 0 || (mDiff === 0 && d2.getDate() < d1.getDate())) y--;
            val = Math.max(0, y);
          }
        } else if (fnName === 'DIF_FECHA' || fnName === 'DIFERENCIA_FECHAS') {
          const d1 = new Date(innerArgs[0]);
          const d2 = new Date(innerArgs[1]);
          const unit = String(innerArgs[2] || 'DIAS').toUpperCase();
          const inc = innerArgs[3] === 'true' || innerArgs[3] === '1';
          if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
            if (unit.startsWith('DIA') || unit === 'D') {
              const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000);
              val = inc ? diffDays + 1 : diffDays;
            } else if (unit.startsWith('MES') || unit === 'M') {
              let m = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
              if (d2.getDate() < d1.getDate()) m--;
              val = Math.max(0, m);
            } else {
              let y = d2.getFullYear() - d1.getFullYear();
              const mDiff = d2.getMonth() - d1.getMonth();
              if (mDiff < 0 || (mDiff === 0 && d2.getDate() < d1.getDate())) y--;
              val = Math.max(0, y);
            }
          }
        } else if (fnName === 'TOPE_MAX') {
          val = Math.min(Number(innerArgs[0]) || 0, Number(innerArgs[1]) || 0);
        } else if (fnName === 'TOPE_MIN') {
          val = Math.max(Number(innerArgs[0]) || 0, Number(innerArgs[1]) || 0);
        } else if (fnName === 'LIMITAR') {
          val = Math.min(Math.max(Number(innerArgs[0]) || 0, Number(innerArgs[1]) || 0), Number(innerArgs[2]) || 0);
        } else if (fnName === 'MIN') {
          val = Math.min(...innerArgs.map(Number));
        } else if (fnName === 'MAX') {
          val = Math.max(...innerArgs.map(Number));
        } else if (fnName === 'REDONDEAR' || fnName === 'ROUND') {
          const dec = Number(innerArgs[1]) || 2;
          const f = Math.pow(10, dec);
          val = Math.round((Number(innerArgs[0]) || 0) * f) / f;
        } else if (fnName === 'ABS') {
          val = Math.abs(Number(innerArgs[0]) || 0);
        } else if (fnName === 'CEIL') {
          val = Math.ceil(Number(innerArgs[0]) || 0);
        } else if (fnName === 'FLOOR') {
          val = Math.floor(Number(innerArgs[0]) || 0);
        } else if (fnName === 'SI' || fnName === 'IF') {
          val = innerArgs[1] || 0;
        }

        expr = expr.substring(0, startIdx) + String(val) + expr.substring(closeParen + 1);
      }
      formulaExpl = expr;
    }

    return formulaExpl || '';
  }

  printPayslipAuditReport() {
    if (this.currentPayslipAuditData) {
      const printContainer = document.getElementById('audit-payslip-print-container');
      if (printContainer) {
        printContainer.innerHTML = this.generatePayslipAuditPrintHtml(this.currentPayslipAuditData);
      }
    }
    document.body.classList.add('audit-printing');
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('audit-printing');
      }, 300);
    }, 80);
  }

  getAuditEmployerContributions(data, slip, formatMoney) {
    const precomputed =
      data?.employerContributionItems ||
      data?.breakdown?.employerContributionItems ||
      slip?.employerContributionItems;
    if (Array.isArray(precomputed) && precomputed.length > 0) {
      return precomputed;
    }

    const basis = slip?.f931Basis || slip?.basis || {};
    const totalRem = Number(slip?.remunerativeSalary ?? slip?.totalRemunerative ?? 0);
    const gross = Number(slip?.grossSalary ?? 0);
    const bi2 = basis.baseImponible2 !== undefined ? Number(basis.baseImponible2) : totalRem;
    const bi4 = Number(basis.baseImponible4 !== undefined ? basis.baseImponible4 : totalRem)
      + Number(basis.baseDifContribOs || 0);
    const bi9 = basis.baseImponible9 !== undefined ? Number(basis.baseImponible9) : gross;
    const detraction = Number(basis.detractionAmount || 0);
    const bi10 = basis.baseImponible10 !== undefined
      ? Number(basis.baseImponible10)
      : Math.max(0, bi2 - detraction);

    const defs = [
      { code: 'CP9100', field: 'sipaContrib', name: 'SIPA - Régimen Previsional Patronal', shortName: 'SIPA (Previsional)', ratePct: 10.77, base: bi10, basisLabel: 'BI 10 (SIPA c/ detracción)' },
      { code: 'CP9101', field: 'inssjypContrib', name: 'INSSJyP / PAMI - Contrib. Patronal', shortName: 'INSSJyP / PAMI', ratePct: 1.58, base: bi2, basisLabel: 'BI 2 (Contribución SIPA)' },
      { code: 'CP9102', field: 'osContrib', name: 'Obra Social Patronal', shortName: 'Obra Social Patronal', ratePct: 6.0, base: bi4, basisLabel: 'BI 4 (Obra Social)' },
      { code: 'CP9103', field: 'fneContrib', name: 'Fondo Nacional de Empleo (FNE)', shortName: 'FNE (Fondo Nac. Empleo)', ratePct: 0.94, base: bi2, basisLabel: 'BI 2 (Contribución SIPA)' },
      { code: 'CP9104', field: 'aaffContrib', name: 'Asignaciones Familiares (AAFF)', shortName: 'AAFF (Asig. Familiares)', ratePct: 4.7, base: bi2, basisLabel: 'BI 2 (Contribución SIPA)' },
      { code: 'CP9105', field: 'artContrib', name: 'ART - Aseguradora de Riesgos del Trabajo', shortName: 'ART (Riesgos del Trabajo)', ratePct: 3.5, base: bi9, basisLabel: 'BI 9 (LRT / ART)', fixedFee: 850 },
      { code: 'CP9106', field: 'scvoContrib', name: 'SCVO - Seguro Colectivo de Vida Obligatorio', shortName: 'SCVO (Seguro Vida Oblig.)', ratePct: 0, base: 0, basisLabel: 'Cuota Fija Mensual', isFixedOnly: true },
      { code: 'CP9107', field: 'unionContrib', name: 'Contribución Patronal Sindical / Convencional', shortName: 'Contribución Sindical', ratePct: 0.5, base: totalRem, basisLabel: 'Total Remunerativo' },
    ];

    const list = [];
    defs.forEach((d, idx) => {
      const amount = Math.round(Number(slip?.[d.field] || 0) * 100) / 100;
      if (amount <= 0) return;
      const baseAmount = d.isFixedOnly ? amount : d.base;
      const formulaExplanation = d.isFixedOnly
        ? `Suma fija obligatoria Dec. 1567/74 ($ ${formatMoney(amount)})`
        : d.fixedFee
          ? `${d.basisLabel}: $ ${formatMoney(baseAmount)} × ${formatMoney(d.ratePct)}% + Fijo ART $ ${formatMoney(d.fixedFee)} = $ ${formatMoney(amount)}`
          : d.field === 'sipaContrib' && detraction > 0
            ? `${d.basisLabel}: ($ ${formatMoney(bi2)} − Detrac. $ ${formatMoney(detraction)} = $ ${formatMoney(baseAmount)}) × ${formatMoney(d.ratePct)}% = $ ${formatMoney(amount)}`
            : `${d.basisLabel}: $ ${formatMoney(baseAmount)} × ${formatMoney(d.ratePct)}% = $ ${formatMoney(amount)}`;

      list.push({
        id: `contrib-${d.field}`,
        conceptCode: d.code,
        conceptName: d.name,
        shortName: d.shortName,
        field: d.field,
        type: 'EMPLOYER_CONTRIB',
        units: d.ratePct > 0 ? d.ratePct : 1,
        unitLabel: d.ratePct > 0 ? '%' : 'Fijo',
        ratePct: d.ratePct,
        baseAmount,
        amount,
        calculationOrder: 9100 + idx,
        formulaExplanation,
      });
    });

    return list;
  }

  generatePayslipAuditPrintHtml(data) {
    const slip = data?.slip || data || {};
    const emp = slip.employee || {};
    const comp = data?.company || this.activeCompany || {};
    const period = slip.payrollPeriod || {};
    const items = slip.items || [];
    const basis = slip.basis || {};
    const formatMoney = (n) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const contribItems = this.getAuditEmployerContributions(data, slip, formatMoney);

    const typeLabelsPlain = {
      REMUNERATIVE: 'Remunerativo',
      NON_REMUNERATIVE: 'No Remunerativo',
      DEDUCTION: 'Deducción / Retención',
      AUXILIARY: 'Auxiliar de Cálculo',
      EMPLOYER_CONTRIB: 'Contribución Patronal',
    };

    const sortedItems = [...items].sort((a, b) =>
      String(a.conceptCode || '').localeCompare(String(b.conceptCode || ''), undefined, { numeric: true })
    );
    const allAuditItems = [...sortedItems, ...contribItems];

    const compName = escapeHtml(comp.businessName || comp.legalName || comp.name || 'EMPRESA');
    const compCuit = formatCuit(comp.cuit);
    const compAddress = escapeHtml(comp.address || 'Domicilio fiscal no especificado');
    const periodLabel = escapeHtml(
      period.settlementName
        ? `${String(period.month || '').padStart(2, '0')}/${period.year || ''} - ${period.settlementName}`
        : `${String(period.month || '').padStart(2, '0')}/${period.year || ''}`
    );
    const empFullName = escapeHtml(`${emp.lastName || ''}, ${emp.firstName || ''}`.replace(/^,\s*/, '') || '-');
    const empFile = escapeHtml(emp.fileNumber || '-');
    const empCuil = formatCuit(emp.cuil);
    const empPosition = escapeHtml(emp.jobPosition?.name || 'Sin cargo asignado');
    const empDept = escapeHtml(emp.department?.name || 'Sin sector');
    const empCbu = emp.cbu && String(emp.cbu).trim()
      ? `${escapeHtml(String(emp.cbu).trim())}${emp.bankName ? ` (${escapeHtml(emp.bankName)})` : ''}`
      : 'Sin CBU informado';
    const nowStr = new Date().toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const hashStr = escapeHtml(slip.signatureHash || 'SEC-VALID-PAYROLL-AUDIT');

    // Preparar filas e inferir peso vertical para paginación multipágina A4
    const preparedRows = allAuditItems.map((it, idx) => {
      const isAux = it.type === 'AUXILIARY';
      const isDed = it.type === 'DEDUCTION';
      const isContrib = it.type === 'EMPLOYER_CONTRIB';
      const amountStr = `${isDed ? '-$ ' : '$ '}${formatMoney(it.amount)}`;
      const unitsStr = isContrib
        ? (it.ratePct > 0 ? `${formatMoney(it.ratePct)}%` : '1 cuota')
        : (it.units !== null && it.units !== undefined ? String(it.units) : '-');
      const baseStr = isContrib
        ? (it.ratePct > 0 && it.baseAmount ? `$ ${formatMoney(it.baseAmount)}` : 'Fijo')
        : (it.baseAmount ? `$ ${formatMoney(it.baseAmount)}` : it.rate ? `${it.rate}%` : '-');
      const typeStr = typeLabelsPlain[it.type] || String(it.type || '-');
      const formulaExpl = isContrib
        ? (it.formulaExplanation || '')
        : this.resolveAuditItemFormula(it, slip, formatMoney);

      const nameLines = Math.max(1, Math.ceil(String(it.conceptName || '').length / 38));
      const formulaLines = formulaExpl ? Math.max(1, Math.ceil((formulaExpl.length + 9) / 48)) : 0;
      const typeLines = Math.max(1, Math.ceil(typeStr.length / 15));
      const contentLines = Math.max(nameLines + formulaLines, typeLines);
      const heightMm = 4.2 + contentLines * 3.6;

      const rowCls = isAux ? 'ap-row-aux' : isContrib ? 'ap-row-contrib' : '';
      const amtCls = isDed ? 'ap-val-ded' : isAux ? 'ap-val-aux' : isContrib ? 'ap-val-contrib' : '';
      const arcaCell = isContrib ? 'F.931' : escapeHtml(it.arcaConceptCode || '-');

      const html = `
        <tr class="${rowCls}">
          <td class="ap-col-idx">${idx + 1}</td>
          <td class="ap-col-code">${escapeHtml(it.conceptCode || '-')}</td>
          <td class="ap-col-name">
            <div class="ap-concept-title">${escapeHtml(it.conceptName || '-')}</div>
            ${formulaExpl ? `<div class="ap-concept-formula">Fórmula: ${escapeHtml(formulaExpl)}</div>` : ''}
          </td>
          <td class="ap-col-type">${escapeHtml(typeStr)}</td>
          <td class="ap-col-units">${escapeHtml(unitsStr)}</td>
          <td class="ap-col-base">${escapeHtml(baseStr)}</td>
          <td class="ap-col-amount ${amtCls}">${amountStr}</td>
          <td class="ap-col-arca">${arcaCell}</td>
        </tr>
      `;
      return { html, heightMm };
    });

    // Presupuesto vertical útil del cuerpo por página A4 (~212mm disponibles entre encabezado y pie)
    const MAX_BODY_HEIGHT_MM = 208;
    const SUMMARY_HEIGHT_MM = 68 + contribItems.length * 4;

    const pages = [];
    let currentRows = [];
    let currentHeight = 0;

    preparedRows.forEach((row) => {
      if (currentRows.length > 0 && currentHeight + row.heightMm > MAX_BODY_HEIGHT_MM) {
        pages.push({ rows: currentRows, includeSummary: false });
        currentRows = [row];
        currentHeight = row.heightMm;
      } else {
        currentRows.push(row);
        currentHeight += row.heightMm;
      }
    });

    if (currentRows.length > 0 || pages.length === 0) {
      if (currentHeight + SUMMARY_HEIGHT_MM <= MAX_BODY_HEIGHT_MM) {
        pages.push({ rows: currentRows, includeSummary: true });
      } else {
        pages.push({ rows: currentRows, includeSummary: false });
        pages.push({ rows: [], includeSummary: true });
      }
    }

    const totalPages = pages.length;

    const summaryBlockHtml = `
      <div class="audit-print-summary-section">
        <div class="audit-print-summary-grid">
          <div class="audit-print-summary-col">
            <div class="audit-print-section-title">REMUNERACIONES IMPONIBLES ARCA (F.931)</div>
            <table class="audit-print-kv-table">
              <tbody>
                <tr>
                  <td>Remuneración 1: Aportes Previsionales (SIPA con tope)</td>
                  <td class="ap-kv-val">$ ${formatMoney(basis.baseImponible1)}</td>
                </tr>
                <tr>
                  <td>Remuneración 2: Contrib. Previsionales e INSSJyP (sin tope)</td>
                  <td class="ap-kv-val">$ ${formatMoney(basis.baseImponible2)}</td>
                </tr>
                <tr>
                  <td>Remuneración 3: Contrib. FNE, Asig. Familiares y RENATRE</td>
                  <td class="ap-kv-val">$ ${formatMoney(basis.baseImponible3)}</td>
                </tr>
                <tr>
                  <td>Remuneración 4: Aportes Obra Social y FSR (con tope)</td>
                  <td class="ap-kv-val">$ ${formatMoney(basis.baseImponible4)}</td>
                </tr>
                <tr>
                  <td>Remuneración 5: Aportes INSSJyP (PAMI)</td>
                  <td class="ap-kv-val">$ ${formatMoney(basis.baseImponible5)}</td>
                </tr>
                <tr>
                  <td>Remuneración 8: Contribuciones Obra Social y FSR</td>
                  <td class="ap-kv-val">$ ${formatMoney(
                    basis.baseImponible8 !== undefined && basis.baseImponible8 !== null
                      ? basis.baseImponible8
                      : basis.baseImponible4
                  )}</td>
                </tr>
                <tr>
                  <td>Remuneración 9: Ley de Riesgos del Trabajo (LRT / ART)</td>
                  <td class="ap-kv-val">$ ${formatMoney(basis.baseImponible9)}</td>
                </tr>
                <tr>
                  <td>Remuneración 10: Contribución SIPA con Detracción</td>
                  <td class="ap-kv-val">$ ${formatMoney(basis.baseImponible10)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="audit-print-summary-col">
            <div class="audit-print-section-title">RESUMEN DE LIQUIDACIÓN Y COSTO LABORAL</div>
            <table class="audit-print-kv-table">
              <tbody>
                <tr>
                  <td>Total Haberes Remunerativos</td>
                  <td class="ap-kv-val">$ ${formatMoney(slip.remunerativeSalary)}</td>
                </tr>
                <tr>
                  <td>Total Conceptos No Remunerativos</td>
                  <td class="ap-kv-val">$ ${formatMoney(slip.nonRemunerative)}</td>
                </tr>
                <tr>
                  <td>Total Deducciones y Retenciones del Colaborador</td>
                  <td class="ap-kv-val ap-val-ded">-$ ${formatMoney(slip.totalDeductions)}</td>
                </tr>
                <tr class="ap-kv-highlight">
                  <td>SUELDO NETO DE BOLSILLO A COBRAR</td>
                  <td class="ap-kv-val">$ ${formatMoney(slip.netSalary)}</td>
                </tr>
                ${contribItems.map((c) => `
                <tr>
                  <td>&bull; ${escapeHtml(c.shortName || c.conceptName)}${c.ratePct > 0 ? ` (${formatMoney(c.ratePct)}%)` : ''}</td>
                  <td class="ap-kv-val ap-val-contrib">$ ${formatMoney(c.amount)}</td>
                </tr>`).join('')}
                <tr>
                  <td>Total Contribuciones Patronales Empleador</td>
                  <td class="ap-kv-val ap-val-contrib">$ ${formatMoney(slip.totalEmployerContrib)}</td>
                </tr>
                <tr class="ap-kv-highlight">
                  <td>COSTO LABORAL TOTAL EMPRESA</td>
                  <td class="ap-kv-val">$ ${formatMoney(slip.totalLaborCost)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    return pages
      .map((pageObj, pageIdx) => {
        const pageNum = pageIdx + 1;
        const hasRows = pageObj.rows.length > 0;
        return `
          <section class="audit-print-page">
            <header class="audit-print-page-header">
              <div class="audit-print-header-top">
                <div>
                  <div class="audit-print-doc-title">INFORME DE AUDITORÍA Y CONTROL DE LIQUIDACIÓN</div>
                  <div class="audit-print-doc-subtitle">Secuencia completa de conceptos liquidados, variables auxiliares, fórmulas aplicadas y bases F.931</div>
                </div>
                <div class="audit-print-header-right">
                  <div><strong>Período:</strong> ${periodLabel}</div>
                  <div><strong>Emisión:</strong> ${nowStr} &bull; <strong>Página ${pageNum} de ${totalPages}</strong></div>
                </div>
              </div>
              <div class="audit-print-meta-strip">
                <div class="audit-print-meta-col">
                  <div><strong>Empleador:</strong> ${compName} &bull; <strong>CUIT:</strong> ${compCuit}</div>
                  <div><strong>Domicilio:</strong> ${compAddress}</div>
                </div>
                <div class="audit-print-meta-col">
                  <div><strong>Colaborador:</strong> ${empFullName} &bull; <strong>Legajo:</strong> ${empFile} &bull; <strong>CUIL:</strong> ${empCuil}</div>
                  <div><strong>Sector / Cargo:</strong> ${empDept} / ${empPosition} &bull; <strong>CBU:</strong> ${empCbu}</div>
                </div>
              </div>
            </header>

            <main class="audit-print-page-body">
              ${
                hasRows
                  ? `
                <table class="audit-print-table">
                  <colgroup>
                    <col style="width: 4%;" />
                    <col style="width: 9%;" />
                    <col style="width: 33%;" />
                    <col style="width: 13%;" />
                    <col style="width: 8%;" />
                    <col style="width: 12%;" />
                    <col style="width: 13%;" />
                    <col style="width: 8%;" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="ap-col-idx">#</th>
                      <th class="ap-col-code">Código</th>
                      <th class="ap-col-name">Concepto / Variable</th>
                      <th class="ap-col-type">Tipo</th>
                      <th class="ap-col-units">Unidades</th>
                      <th class="ap-col-base">Base / Tasa</th>
                      <th class="ap-col-amount">Importe ($)</th>
                      <th class="ap-col-arca">Cód. ARCA</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${pageObj.rows.map((r) => r.html).join('')}
                  </tbody>
                </table>
              `
                  : ''
              }
              ${pageObj.includeSummary ? summaryBlockHtml : ''}
            </main>

            <footer class="audit-print-page-footer">
              <div>${compName} (CUIT ${compCuit}) &bull; Legajo ${empFile} - ${empFullName}</div>
              <div>Hash Integridad: ${hashStr}</div>
              <div><strong>Página ${pageNum} de ${totalPages}</strong></div>
            </footer>
          </section>
        `;
      })
      .join('');
  }

  renderPayslipAudit(data) {
    const area = document.getElementById('payslip-audit-area');
    if (!area) return;

    this.currentPayslipAuditData = data;
    const printContainer = document.getElementById('audit-payslip-print-container');
    if (printContainer) {
      printContainer.innerHTML = this.generatePayslipAuditPrintHtml(data);
    }

    const slip = data.slip || data;
    const emp = slip.employee || {};
    const comp = data.company || this.activeCompany || {};
    const period = slip.payrollPeriod || {};
    const items = slip.items || [];
    const basis = slip.basis || {};
    const formatMoney = (n) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
    const contribItems = this.getAuditEmployerContributions(data, slip, formatMoney);

    const typeBadges = {
      REMUNERATIVE: '<span class="badge bg-green-lt">Remunerativo</span>',
      NON_REMUNERATIVE: '<span class="badge bg-blue-lt">No Remunerativo</span>',
      DEDUCTION: '<span class="badge bg-danger-lt">Deducción / Retención</span>',
      AUXILIARY: '<span class="badge bg-purple text-white"><i class="ti ti-tools me-1"></i>Auxiliar de Cálculo</span>',
      EMPLOYER_CONTRIB: '<span class="badge bg-indigo-lt text-indigo"><i class="ti ti-building-bank me-1"></i>Contribución Patronal</span>',
    };

    const sortedItems = [...items].sort((a, b) => {
      return String(a.conceptCode || '').localeCompare(String(b.conceptCode || ''), undefined, { numeric: true });
    });
    const allAuditRows = [...sortedItems, ...contribItems];

    const cbuDisplay = emp.cbu && String(emp.cbu).trim()
      ? `CBU: <strong class="text-dark">${escapeHtml(String(emp.cbu).trim())}</strong>${emp.bankName ? ` (${escapeHtml(emp.bankName)})` : ''}`
      : `CBU: <span class="badge bg-warning-lt text-warning fw-normal">Sin CBU informado</span>`;

    const itemRows = allAuditRows.map((it, idx) => {
      const isAux = it.type === 'AUXILIARY';
      const isContrib = it.type === 'EMPLOYER_CONTRIB';
      const rowClass = isAux ? 'bg-purple-lt bg-opacity-10' : isContrib ? 'bg-indigo-lt bg-opacity-10' : '';
      const amountStr = formatMoney(it.amount);
      const unitsStr = isContrib
        ? (it.ratePct > 0 ? `${formatMoney(it.ratePct)}%` : '1 cuota')
        : (it.units !== null && it.units !== undefined ? String(it.units) : '-');
      const baseStr = isContrib
        ? (it.ratePct > 0 && it.baseAmount ? `$ ${formatMoney(it.baseAmount)}` : 'Fijo')
        : (it.baseAmount ? `$ ${formatMoney(it.baseAmount)}` : (it.rate ? `${it.rate}%` : '-'));

      const formulaExpl = isContrib
        ? (it.formulaExplanation || '')
        : this.resolveAuditItemFormula(it, slip, formatMoney);

      const formulaExplHtml = formulaExpl ? `
        <div class="text-muted small font-monospace mt-1" style="font-size: 0.76rem;">
          <i class="ti ti-math-function text-purple me-1"></i>Fórmula: <span class="badge bg-light text-dark border font-monospace px-1 py-0">${escapeHtml(formulaExpl)}</span>
        </div>
      ` : '';

      const codeClass = isContrib ? 'text-indigo' : 'text-primary';
      const amountClass = isAux ? 'text-purple' : (it.type === 'DEDUCTION' ? 'text-danger' : isContrib ? 'text-indigo' : 'text-dark');
      const arcaCellHtml = isContrib
        ? '<span class="badge bg-indigo-lt text-indigo font-monospace">F.931</span>'
        : `<code>${escapeHtml(it.arcaConceptCode || '-')}</code>`;

      return `
        <tr class="${rowClass}">
          <td class="text-center font-monospace text-muted small py-1 col-audit-idx">${idx + 1}</td>
          <td class="font-monospace fw-bold ${codeClass} py-1 col-audit-code" style="white-space: nowrap;">${escapeHtml(it.conceptCode)}</td>
          <td class="py-1 col-audit-name">
            <span class="fw-semibold text-dark d-inline-block align-middle" title="${escapeHtml(it.conceptName)}">${escapeHtml(it.conceptName)}</span>
            ${formulaExplHtml}
          </td>
          <td class="py-1 col-audit-type" style="white-space: nowrap;">${typeBadges[it.type] || it.type}</td>
          <td class="text-center font-monospace py-1 col-audit-units" style="white-space: nowrap;">${escapeHtml(unitsStr)}</td>
          <td class="text-end font-monospace text-muted py-1 col-audit-base" style="white-space: nowrap;">${escapeHtml(baseStr)}</td>
          <td class="text-end font-monospace fw-bold py-1 col-audit-amount ${amountClass}" style="white-space: nowrap;">
            ${it.type === 'DEDUCTION' ? '-' : ''}$ ${amountStr}
          </td>
          <td class="text-center py-1 col-audit-arca" style="white-space: nowrap;">
            ${arcaCellHtml}
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
            <span class="badge bg-primary-lt font-monospace">${sortedItems.length} conceptos + ${contribItems.length} contrib.</span>
          </div>
          <div class="small text-muted d-flex align-items-center flex-wrap gap-1">
            <span class="badge bg-purple text-white"><i class="ti ti-tools me-1"></i>Auxiliar</span>
            <span class="small">Variables intermedias de cálculo (no impresas en recibo legal ni ARCA)</span>
          </div>
        </div>
        <div class="table-responsive" style="max-height: 440px; overflow-y: auto;">
          <table class="table table-vcenter card-table table-hover table-sm mb-0 table-audit-concepts">
            <thead class="sticky-top bg-light border-bottom" style="z-index: 2;">
              <tr class="table-light">
                <th class="text-center py-1 col-audit-idx" style="width: 45px;">#</th>
                <th class="py-1 col-audit-code" style="width: 80px;">Código</th>
                <th class="py-1 col-audit-name">Concepto / Variable</th>
                <th class="py-1 col-audit-type" style="width: 170px;">Tipo</th>
                <th class="text-center py-1 col-audit-units" style="width: 90px;">Unidades</th>
                <th class="text-end py-1 col-audit-base" style="width: 120px;">Base / Tasa</th>
                <th class="text-end py-1 col-audit-amount" style="width: 140px;">Importe ($)</th>
                <th class="text-center py-1 col-audit-arca" style="width: 90px;">Código ARCA</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Remuneraciones Imponibles F.931 ARCA y Costo Laboral -->
      <div class="row g-2">
        <div class="col-md-6">
          <div class="card shadow-xs h-100">
            <div class="card-header py-1 px-3 bg-white">
              <h5 class="card-title mb-0 small text-uppercase text-muted">
                <i class="ti ti-building-bank me-1 text-indigo"></i> Remuneraciones Imponibles ARCA F.931
              </h5>
            </div>
            <div class="card-body py-2 px-3">
              <table class="table table-sm table-borderless mb-0 small">
                <tr>
                  <td class="text-muted py-0">Remuneración 1: Aportes Previsionales (SIPA con tope)</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible1)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Remuneración 2: Contribuciones Previsionales e INSSJyP (SIPA sin tope)</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible2)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Remuneración 3: Contribuciones FNE, Asignaciones Familiares y RENATRE</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible3)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Remuneración 4: Aportes Obra Social y FSR (con tope)</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible4)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Remuneración 5: Aportes INSSJyP (PAMI)</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible5)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Remuneración 8: Contribuciones Obra Social y FSR</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible8 !== undefined && basis.baseImponible8 !== null ? basis.baseImponible8 : basis.baseImponible4)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Remuneración 9: Ley de Riesgos del Trabajo (LRT / ART)</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible9)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Remuneración 10: Contribución SIPA con Detracción (Ley 27.430 / 27.541)</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible10)}</td>
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
                ${contribItems.length > 0 ? `
                <tr class="border-top">
                  <td colspan="2" class="text-uppercase fw-bold text-indigo pt-2 pb-1" style="font-size: 0.7rem;">
                    <i class="ti ti-building-bank me-1"></i>Detalle Contribuciones Patronales Generadas
                  </td>
                </tr>
                ${contribItems.map((c) => `
                <tr>
                  <td class="text-muted py-0 ps-2">
                    <span class="font-monospace text-indigo me-1">${escapeHtml(c.conceptCode)}</span>${escapeHtml(c.shortName || c.conceptName)}${c.ratePct > 0 ? ` <span class="text-muted">(${formatMoney(c.ratePct)}%)</span>` : ''}
                  </td>
                  <td class="text-end font-monospace text-indigo py-0">$ ${formatMoney(c.amount)}</td>
                </tr>`).join('')}` : ''}
                <tr class="border-top">
                  <td class="text-muted fw-semibold py-1">Total Contribuciones Patronales:</td>
                  <td class="text-end font-monospace fw-bold text-indigo py-1">$ ${formatMoney(slip.totalEmployerContrib)}</td>
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

  // --- Libro de Sueldos Digital (ARCA) Unificado Mensual ---

}

export function registerPayrollSlipsMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(MixinMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
