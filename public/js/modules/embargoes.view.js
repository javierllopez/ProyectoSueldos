import { apiRequest, showToast, escapeHtml } from '../api.js';

function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '0,00';
  return Number(num).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

class EmbargoesMethods {
  // ==========================================================================
  // SUBMÓDULO: EMBARGOS DE HABERES (ÓRDENES JUDICIALES MULTI-CONCEPTO)
  // ==========================================================================

  setupEmbargoModals() {
    this.embargoesPage = 1;
    this.embargoesLimit = 50;
    this.embargoesSearchQuery = '';
    this.embargoesStatusFilter = 'ACTIVE';

    // 1. Botón Nuevo Embargo
    const btnNew = document.getElementById('btn-new-embargo');
    if (btnNew) {
      btnNew.addEventListener('click', () => this.openNewEmbargoModal());
    }

    // 2. Buscador
    const searchInput = document.getElementById('embargoes-search-input');
    if (searchInput) {
      let debounceTimer = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.embargoesSearchQuery = e.target.value.trim();
          this.embargoesPage = 1;
          this.loadEmbargoes();
        }, 350);
      });
    }

    // 3. Filtro por Estado
    const statusSelect = document.getElementById('embargoes-filter-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        this.embargoesStatusFilter = e.target.value;
        this.embargoesPage = 1;
        this.loadEmbargoes();
      });
    }

    // 4. Toggle de Tiene Tope de Deuda
    const hasCapSwitch = document.getElementById('embargo-input-has-cap');
    if (hasCapSwitch) {
      hasCapSwitch.addEventListener('change', (e) => {
        this.handleEmbargoHasCapToggle(e.target.checked);
      });
    }

    // 5. Tipo de Embargo (auto-ajuste de tope si es Cuota Alimentaria)
    const typeSelect = document.getElementById('embargo-input-type');
    if (typeSelect) {
      typeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'ALIMENTARIO') {
          if (hasCapSwitch) {
            hasCapSwitch.checked = false;
            this.handleEmbargoHasCapToggle(false);
          }
        } else if (e.target.value === 'COMERCIAL') {
          if (hasCapSwitch) {
            hasCapSwitch.checked = true;
            this.handleEmbargoHasCapToggle(true);
          }
        }
      });
    }

    // 6. Botón Autocompletar Conceptos Vinculados
    const btnAutocomplete = document.getElementById('btn-embargo-autocomplete-concepts');
    if (btnAutocomplete) {
      btnAutocomplete.addEventListener('click', () => this.handleEmbargoAutocomplete());
    }

    // 7. Envío del Formulario
    const form = document.getElementById('form-payroll-embargo');
    if (form) {
      form.addEventListener('submit', (e) => this.saveEmbargo(e));
    }

    // 8. Delegación de eventos en la tabla
    const tbody = document.getElementById('embargoes-table-body');
    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const btnHistory = e.target.closest('.btn-view-embargo-history');
        if (btnHistory) {
          const id = btnHistory.dataset.id;
          if (id) this.openEmbargoHistoryModal(id);
          return;
        }

        const btnEdit = e.target.closest('.btn-edit-embargo');
        if (btnEdit) {
          const id = btnEdit.dataset.id;
          if (id) this.openEditEmbargoModal(id);
          return;
        }

        const btnToggle = e.target.closest('.btn-toggle-embargo-status');
        if (btnToggle) {
          const id = btnToggle.dataset.id;
          const targetStatus = btnToggle.dataset.action;
          if (id && targetStatus) this.handleEmbargoStatusToggle(id, targetStatus);
          return;
        }

        const btnDel = e.target.closest('.btn-delete-embargo');
        if (btnDel) {
          const id = btnDel.dataset.id;
          if (id) this.handleDeleteEmbargo(id);
          return;
        }
      });
    }

    // 9. Botón Imprimir Informe de Embargos A4
    const btnPrintHist = document.getElementById('btn-print-embargo-history');
    if (btnPrintHist) {
      btnPrintHist.addEventListener('click', () => this.printEmbargoHistoryReport());
    }
  }

  handleEmbargoHasCapToggle(hasCap) {
    const boxAmount = document.getElementById('embargo-box-total-amount');
    const inputAmount = document.getElementById('embargo-input-total-amount');
    const hintCap = document.getElementById('embargo-hint-cap');

    if (hasCap) {
      if (boxAmount) boxAmount.classList.remove('d-none');
      if (inputAmount) inputAmount.required = true;
      if (hintCap) {
        hintCap.innerHTML = '<i class="ti ti-info-circle me-1"></i>Para embargos comerciales con límite, las retenciones cuota a cuota amortizan este importe hasta cancelarlo a cero.';
      }
    } else {
      if (boxAmount) boxAmount.classList.add('d-none');
      if (inputAmount) {
        inputAmount.required = false;
        inputAmount.value = '';
      }
      if (hintCap) {
        hintCap.innerHTML = '<i class="ti ti-heart-handshake me-1 text-indigo"></i>Las cuotas alimentarias o embargos sin límite se descuentan de forma indefinida en cada período hasta que decida suspenderlos o darlos de baja.';
      }
    }
  }

  async loadEmbargoes() {
    const spinner = document.getElementById('embargoes-table-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      const params = new URLSearchParams({
        page: String(this.embargoesPage || 1),
        limit: String(this.embargoesLimit || 50),
      });
      if (this.embargoesStatusFilter && this.embargoesStatusFilter !== 'ALL') {
        params.append('status', this.embargoesStatusFilter);
      }
      if (this.embargoesSearchQuery) {
        params.append('search', this.embargoesSearchQuery);
      }

      const res = await apiRequest(`/embargoes?${params.toString()}`);
      this.currentEmbargoesList = res.embargoes || [];
      this.embargoesPagination = res.pagination || { total: 0, page: 1, limit: 50, totalPages: 1 };

      // Actualizar contadores y badges
      if (res.stats) {
        const metricActive = document.getElementById('embargo-metric-active-count');
        if (metricActive) metricActive.textContent = res.stats.totalActive;

        const metricDebt = document.getElementById('embargo-metric-total-debt');
        if (metricDebt) metricDebt.textContent = `$ ${formatNumber(res.stats.totalCappedDebt)}`;

        const metricAlimony = document.getElementById('embargo-metric-alimony-count');
        if (metricAlimony) metricAlimony.textContent = res.stats.totalAlimony;

        const sidebarBadge = document.getElementById('payroll-badge-embargoes-count');
        if (sidebarBadge) sidebarBadge.textContent = res.stats.totalActive;
      }

      const totalAmortized = this.currentEmbargoesList.reduce((sum, e) => sum + Number(e.accumulatedAmount || 0), 0);
      const metricAmortized = document.getElementById('embargo-metric-amortized');
      if (metricAmortized) metricAmortized.textContent = `$ ${formatNumber(totalAmortized)}`;

      const badgeTotal = document.getElementById('embargoes-badge-total');
      if (badgeTotal) badgeTotal.textContent = `${this.embargoesPagination.total} registros`;

      this.renderEmbargoesTable();
      this.renderEmbargoesPagination();
    } catch (err) {
      console.error('Error al cargar embargos:', err);
      showToast(err.message || 'Error al cargar los embargos judiciales', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  renderEmbargoesTable() {
    const tbody = document.getElementById('embargoes-table-body');
    if (!tbody) return;

    const list = this.currentEmbargoesList || [];

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-5 text-muted">
            <div class="empty">
              <div class="empty-icon text-muted">
                <i class="ti ti-scale fs-1 text-primary"></i>
              </div>
              <p class="empty-title">No se encontraron embargos judiciales</p>
              <p class="empty-subtitle text-muted">
                ${this.embargoesSearchQuery ? 'Pruebe modificando los términos de búsqueda o filtros.' : 'No existen órdenes de embargo registradas con los filtros seleccionados.'}
              </p>
              <div class="empty-action">
                <button type="button" class="btn btn-primary btn-sm" id="btn-empty-new-embargo">
                  <i class="ti ti-plus me-1"></i> Registrar Primer Embargo
                </button>
              </div>
            </div>
          </td>
        </tr>
      `;
      const btnEmpty = document.getElementById('btn-empty-new-embargo');
      if (btnEmpty) btnEmpty.addEventListener('click', () => this.openNewEmbargoModal());
      return;
    }

    const typeBadges = {
      COMERCIAL: '<span class="badge bg-purple-lt" title="Embargo Ejecutivo / Comercial"><i class="ti ti-briefcase me-1"></i>Comercial</span>',
      ALIMENTARIO: '<span class="badge bg-indigo-lt" title="Cuota Alimentaria"><i class="ti ti-heart-handshake me-1"></i>Alimentario</span>',
      IMPOSITIVO: '<span class="badge bg-orange-lt" title="Embargo Impositivo"><i class="ti ti-receipt-tax me-1"></i>Impositivo</span>',
      OTRO: '<span class="badge bg-secondary-lt">Otro</span>',
    };

    const statusBadges = {
      ACTIVE: '<span class="badge bg-success-lt"><i class="ti ti-check me-1"></i>Activo</span>',
      COMPLETED: '<span class="badge bg-blue-lt"><i class="ti ti-circle-check me-1"></i>Completado</span>',
      SUSPENDED: '<span class="badge bg-warning-lt"><i class="ti ti-player-pause me-1"></i>Suspendido</span>',
      CANCELLED: '<span class="badge bg-secondary-lt"><i class="ti ti-x me-1"></i>Cancelado</span>',
    };

    tbody.innerHTML = list
      .map((e) => {
        const emp = e.employee;
        const empName = emp ? `${emp.lastName}, ${emp.firstName}` : 'Sin empleado';
        const fileNumber = emp ? emp.fileNumber : '-';
        const cuil = emp ? emp.cuil : '-';

        const conceptsBadges = (e.concepts && e.concepts.length > 0)
          ? e.concepts
              .map((c) => {
                const con = c.concept;
                if (!con) return '';
                const pfx = con.code ? con.code.substring(0, 2) : 'SU';
                const pfxClass = pfx === 'SU' ? 'bg-blue-lt' : pfx === 'SA' ? 'bg-indigo-lt' : pfx === 'VA' ? 'bg-teal-lt' : 'bg-orange-lt';
                return `<span class="badge ${pfxClass} font-monospace me-1 mb-1" style="font-size: 0.68rem;" title="${escapeHtml(con.name)}">${escapeHtml(con.code)}</span>`;
              })
              .join('')
          : '<span class="text-muted small">Sin conceptos</span>';

        const totalOficioStr = e.hasCap && e.totalAmount !== null
          ? `$ ${formatNumber(e.totalAmount)}`
          : '<span class="badge bg-light text-muted">Sin Límite</span>';

        const amortizadoStr = `$ ${formatNumber(e.accumulatedAmount)}`;
        const progressBar = e.hasCap && e.totalAmount && e.totalAmount > 0
          ? `<div class="progress progress-xs mt-1" style="height: 4px;" title="${e.progressPercent}% amortizado">
               <div class="progress-bar ${e.progressPercent >= 100 ? 'bg-blue' : 'bg-success'}" style="width: ${e.progressPercent}%"></div>
             </div>
             <div class="text-end text-muted mt-1" style="font-size: 0.65rem;">
               <span>${e.progressPercent}% amortizado</span>
             </div>`
          : '';

        let saldoStr = '<span class="badge bg-indigo-lt" style="font-size: 0.7rem;">Indefinido</span>';
        if (e.hasCap) {
          if (e.remainingBalance !== null && e.remainingBalance <= 0) {
            saldoStr = '<span class="badge bg-success-lt fw-bold font-monospace">$ 0,00</span>';
          } else {
            saldoStr = `<span class="fw-bold font-monospace text-dark">$ ${formatNumber(e.remainingBalance)}</span>`;
          }
        }

        let toggleStatusBtn = '';
        if (e.status === 'ACTIVE') {
          toggleStatusBtn = `<button type="button" class="btn btn-outline-warning btn-icon btn-toggle-embargo-status" data-id="${e.id}" data-action="SUSPENDED" title="Suspender retención"><i class="ti ti-player-pause"></i></button>`;
        } else if (e.status === 'SUSPENDED') {
          toggleStatusBtn = `<button type="button" class="btn btn-outline-success btn-icon btn-toggle-embargo-status" data-id="${e.id}" data-action="ACTIVE" title="Reanudar retención activa"><i class="ti ti-player-play"></i></button>`;
        }

        return `
          <tr>
            <td class="align-middle">
              <div class="d-flex align-items-center gap-1">
                <span class="badge bg-blue-lt font-monospace px-1" style="font-size: 0.72rem;">${escapeHtml(fileNumber)}</span>
                <span class="fw-bold text-dark text-truncate" style="max-width: 155px;" title="${escapeHtml(empName)}">${escapeHtml(empName)}</span>
              </div>
              <div class="text-muted font-monospace" style="font-size: 0.72rem;">CUIL: ${escapeHtml(cuil)}</div>
            </td>
            <td class="align-middle">
              <div class="fw-bold text-dark text-truncate" title="${escapeHtml(e.caseTitle)}">
                ${escapeHtml(e.caseTitle)}
              </div>
              <div class="d-flex align-items-center gap-2 text-muted small text-truncate" style="font-size: 0.72rem;">
                ${e.dossierNumber ? `<span class="font-monospace text-nowrap"><i class="ti ti-file-text me-1"></i>${escapeHtml(e.dossierNumber)}</span>` : ''}
                <span class="text-truncate" title="${escapeHtml(e.court || '-')}${e.judicialDistrict ? ' · ' + escapeHtml(e.judicialDistrict) : ''}">
                  <i class="ti ti-building-estate me-1"></i>${escapeHtml(e.court || '-')}${e.judicialDistrict ? ` · ${escapeHtml(e.judicialDistrict)}` : ''}
                </span>
              </div>
            </td>
            <td class="align-middle">
              <div class="mb-1">${typeBadges[e.embargoType] || e.embargoType}</div>
              <div class="d-flex flex-wrap gap-1">${conceptsBadges}</div>
            </td>
            <td class="align-middle">
              <div class="d-flex justify-content-between align-items-center" style="font-size: 0.75rem;">
                <span class="text-muted">Total:</span>
                <span class="font-monospace fw-bold">${totalOficioStr}</span>
              </div>
              <div class="d-flex justify-content-between align-items-center" style="font-size: 0.75rem;">
                <span class="text-muted">Amortización:</span>
                <span class="font-monospace text-success fw-semibold">${amortizadoStr}</span>
              </div>
              <div class="d-flex justify-content-between align-items-center border-top mt-1 pt-1" style="font-size: 0.75rem;">
                <span class="text-muted fw-bold">Saldo:</span>
                ${saldoStr}
              </div>
              ${progressBar}
            </td>
            <td class="align-middle text-center">
              ${statusBadges[e.status] || e.status}
            </td>
            <td class="align-middle text-end pe-2">
              <div class="btn-group btn-group-sm text-nowrap">
                <button type="button" class="btn btn-outline-info btn-icon btn-view-embargo-history" data-id="${e.id}" title="Ver historial de retenciones">
                  <i class="ti ti-history"></i>
                </button>
                <button type="button" class="btn btn-outline-primary btn-icon btn-edit-embargo" data-id="${e.id}" title="Editar oficio judicial">
                  <i class="ti ti-edit"></i>
                </button>
                ${toggleStatusBtn}
                <button type="button" class="btn btn-outline-danger btn-icon btn-delete-embargo" data-id="${e.id}" title="Eliminar / Anular embargo">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  renderEmbargoesPagination() {
    const infoEl = document.getElementById('embargoes-pagination-info');
    const btnsEl = document.getElementById('embargoes-pagination-btns');
    if (!infoEl || !btnsEl) return;

    const { total, page, limit, totalPages } = this.embargoesPagination;
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);
    infoEl.textContent = `Mostrando ${start} a ${end} de ${total} embargos`;

    if (totalPages <= 1) {
      btnsEl.innerHTML = '';
      return;
    }

    btnsEl.innerHTML = `
      <button type="button" class="btn btn-outline-secondary ${page <= 1 ? 'disabled' : ''}" id="btn-embargoes-prev">
        <i class="ti ti-chevron-left"></i>
      </button>
      <span class="btn btn-outline-secondary disabled">Pág. ${page} / ${totalPages}</span>
      <button type="button" class="btn btn-outline-secondary ${page >= totalPages ? 'disabled' : ''}" id="btn-embargoes-next">
        <i class="ti ti-chevron-right"></i>
      </button>
    `;

    document.getElementById('btn-embargoes-prev')?.addEventListener('click', () => {
      if (this.embargoesPage > 1) {
        this.embargoesPage--;
        this.loadEmbargoes();
      }
    });

    document.getElementById('btn-embargoes-next')?.addEventListener('click', () => {
      if (this.embargoesPage < this.embargoesPagination.totalPages) {
        this.embargoesPage++;
        this.loadEmbargoes();
      }
    });
  }

  async loadEmbargoAuxiliaryData() {
    try {
      const [empRes, conRes] = await Promise.all([
        apiRequest('/employees?limit=500&status=ACTIVE'),
        apiRequest('/payroll/concepts?limit=500'),
      ]);
      this.cachedEmployees = empRes.data || empRes.employees || empRes || [];
      const allConcepts = conRes.data || conRes.concepts || conRes || [];
      this.cachedEmbargoConcepts = allConcepts.filter(
        (c) => c.isEmbargo || c.arcaConceptCode === '810012' || (c.type === 'DEDUCTION' && String(c.code).includes('610'))
      );
    } catch (err) {
      console.error('Error al cargar datos auxiliares de embargo:', err);
    }
  }

  populateEmbargoSelects() {
    const empSelect = document.getElementById('embargo-input-employee-id');
    if (empSelect) {
      const currentVal = empSelect.value;
      empSelect.innerHTML = '<option value="">Seleccione un colaborador...</option>' +
        (this.cachedEmployees || [])
          .map((emp) => `<option value="${emp.id}">[${escapeHtml(emp.fileNumber)}] ${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)} (CUIL: ${escapeHtml(emp.cuil)})</option>`)
          .join('');
      if (currentVal) empSelect.value = currentVal;
    }

    const concepts = this.cachedEmbargoConcepts || [];
    const monthlyConcepts = concepts.filter(
      (c) => !c.periodType || c.periodType === 'MONTHLY' || c.periodType === 'QUINCE' || String(c.code).startsWith('SU')
    );
    const sacConcepts = concepts.filter(
      (c) => c.periodType === 'SAC' || c.periodType === 'SAC_1' || c.periodType === 'SAC_2' || String(c.code).startsWith('SA')
    );
    const vacConcepts = concepts.filter(
      (c) => c.periodType === 'VACATIONS' || String(c.code).startsWith('VA')
    );
    const finalConcepts = concepts.filter(
      (c) => c.periodType === 'FINAL' || String(c.code).startsWith('FI')
    );

    const populate = (selectId, list, emptyLabel) => {
      const sel = document.getElementById(selectId);
      if (!sel) return;
      const currentVal = sel.value;
      sel.innerHTML = `<option value="">${emptyLabel}</option>` +
        list
          .map((c) => `<option value="${c.id}">[${escapeHtml(c.code)}] ${escapeHtml(c.name)}</option>`)
          .join('');
      if (currentVal) sel.value = currentVal;
    };

    populate('embargo-select-concept-monthly', monthlyConcepts, '-- No retener en Sueldo --');
    populate('embargo-select-concept-sac', sacConcepts, '-- No retener en SAC --');
    populate('embargo-select-concept-vacations', vacConcepts, '-- No retener en Vacaciones --');
    populate('embargo-select-concept-final', finalConcepts, '-- No retener en Liquidación Final --');
  }

  async openNewEmbargoModal() {
    await this.loadEmbargoAuxiliaryData();
    this.populateEmbargoSelects();

    document.getElementById('embargo-input-id').value = '';
    document.getElementById('modal-payroll-embargo-title').textContent = 'Registrar Embargo Judicial';
    
    const empSelect = document.getElementById('embargo-input-employee-id');
    if (empSelect) {
      empSelect.value = '';
      empSelect.disabled = false;
    }

    document.getElementById('embargo-input-case-title').value = '';
    document.getElementById('embargo-input-dossier').value = '';
    document.getElementById('embargo-input-court').value = '';
    document.getElementById('embargo-input-secretary').value = '';
    document.getElementById('embargo-input-judicial-district').value = '';
    document.getElementById('embargo-input-type').value = 'COMERCIAL';
    document.getElementById('embargo-input-has-cap').checked = true;
    this.handleEmbargoHasCapToggle(true);
    document.getElementById('embargo-input-total-amount').value = '';
    document.getElementById('embargo-input-priority').value = '1';
    document.getElementById('embargo-input-status').value = 'ACTIVE';
    document.getElementById('embargo-input-start-date').value = new Date().toISOString().substring(0, 10);
    document.getElementById('embargo-input-notes').value = '';

    ['embargo-select-concept-monthly', 'embargo-select-concept-sac', 'embargo-select-concept-vacations', 'embargo-select-concept-final'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const alertEl = document.getElementById('embargo-form-alert');
    if (alertEl) alertEl.classList.add('d-none');

    // Preseleccionar si existe algún concepto de Sueldo
    const monthlySel = document.getElementById('embargo-select-concept-monthly');
    if (monthlySel && monthlySel.options.length > 1) {
      monthlySel.selectedIndex = 1;
      this.handleEmbargoAutocomplete();
    }

    const modalEl = document.getElementById('modal-payroll-embargo-form');
    if (modalEl && window.bootstrap?.Modal) {
      const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  }

  async openEditEmbargoModal(id) {
    const alertEl = document.getElementById('embargo-form-alert');
    if (alertEl) alertEl.classList.add('d-none');

    try {
      await this.loadEmbargoAuxiliaryData();
      this.populateEmbargoSelects();

      const res = await apiRequest(`/embargoes/${id}`);
      const embargo = res.data || res;

      document.getElementById('embargo-input-id').value = embargo.id;
      document.getElementById('modal-payroll-embargo-title').textContent = 'Editar Embargo Judicial';
      
      const empSelect = document.getElementById('embargo-input-employee-id');
      if (empSelect) {
        empSelect.value = embargo.employeeId;
        empSelect.disabled = true;
      }

      document.getElementById('embargo-input-case-title').value = embargo.caseTitle || '';
      document.getElementById('embargo-input-dossier').value = embargo.dossierNumber || '';
      document.getElementById('embargo-input-court').value = embargo.court || '';
      document.getElementById('embargo-input-secretary').value = embargo.secretary || '';
      document.getElementById('embargo-input-judicial-district').value = embargo.judicialDistrict || '';
      document.getElementById('embargo-input-type').value = embargo.embargoType || 'COMERCIAL';
      
      const hasCap = Boolean(embargo.hasCap);
      document.getElementById('embargo-input-has-cap').checked = hasCap;
      this.handleEmbargoHasCapToggle(hasCap);
      
      document.getElementById('embargo-input-total-amount').value = embargo.totalAmount !== null ? embargo.totalAmount : '';
      document.getElementById('embargo-input-priority').value = embargo.priorityOrder || 1;
      document.getElementById('embargo-input-status').value = embargo.status || 'ACTIVE';
      document.getElementById('embargo-input-start-date').value = embargo.startDate ? embargo.startDate.substring(0, 10) : '';
      document.getElementById('embargo-input-notes').value = embargo.notes || '';

      const assignedIds = new Set((embargo.concepts || []).map((c) => c.conceptId));
      
      const setVal = (selectId) => {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        sel.value = '';
        for (const opt of sel.options) {
          if (assignedIds.has(opt.value)) {
            sel.value = opt.value;
            break;
          }
        }
      };

      setVal('embargo-select-concept-monthly');
      setVal('embargo-select-concept-sac');
      setVal('embargo-select-concept-vacations');
      setVal('embargo-select-concept-final');

      const modalEl = document.getElementById('modal-payroll-embargo-form');
      if (modalEl && window.bootstrap?.Modal) {
        const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
      }
    } catch (err) {
      console.error('Error al abrir edición de embargo:', err);
      showToast(err.message || 'Error al cargar los datos del embargo', 'danger');
    }
  }

  handleEmbargoAutocomplete() {
    const monthlySel = document.getElementById('embargo-select-concept-monthly');
    let baseCode = '';

    if (monthlySel && monthlySel.value) {
      const selectedOption = monthlySel.options[monthlySel.selectedIndex];
      const match = selectedOption.textContent.match(/\[[A-Z]{2}([0-9]{4})\]/);
      if (match) baseCode = match[1];
    }

    if (!baseCode) {
      ['embargo-select-concept-sac', 'embargo-select-concept-vacations', 'embargo-select-concept-final'].forEach((id) => {
        const sel = document.getElementById(id);
        if (sel && sel.value && !baseCode) {
          const match = sel.options[sel.selectedIndex].textContent.match(/\[[A-Z]{2}([0-9]{4})\]/);
          if (match) baseCode = match[1];
        }
      });
    }

    if (!baseCode) {
      showToast('Seleccione un concepto en alguno de los tipos de liquidación para autocompletar los demás', 'warning');
      return;
    }

    const matchAndSet = (selectId) => {
      const sel = document.getElementById(selectId);
      if (!sel) return;
      for (const opt of sel.options) {
        if (opt.textContent.includes(baseCode)) {
          sel.value = opt.value;
          break;
        }
      }
    };

    matchAndSet('embargo-select-concept-monthly');
    matchAndSet('embargo-select-concept-sac');
    matchAndSet('embargo-select-concept-vacations');
    matchAndSet('embargo-select-concept-final');

    showToast(`Autocompletados conceptos con numeración base ${baseCode}`, 'success');
  }

  async saveEmbargo(e) {
    e.preventDefault();
    const alertEl = document.getElementById('embargo-form-alert');
    const submitBtn = document.getElementById('btn-save-embargo');

    if (alertEl) alertEl.classList.add('d-none');

    const id = document.getElementById('embargo-input-id')?.value;
    const employeeId = document.getElementById('embargo-input-employee-id')?.value;
    const caseTitle = document.getElementById('embargo-input-case-title')?.value?.trim();
    const dossierNumber = document.getElementById('embargo-input-dossier')?.value?.trim();
    const court = document.getElementById('embargo-input-court')?.value?.trim();
    const secretary = document.getElementById('embargo-input-secretary')?.value?.trim();
    const judicialDistrict = document.getElementById('embargo-input-judicial-district')?.value?.trim();
    const embargoType = document.getElementById('embargo-input-type')?.value;
    const hasCap = Boolean(document.getElementById('embargo-input-has-cap')?.checked);
    const totalAmountVal = document.getElementById('embargo-input-total-amount')?.value;
    const priorityOrder = parseInt(document.getElementById('embargo-input-priority')?.value, 10) || 1;
    const status = document.getElementById('embargo-input-status')?.value || 'ACTIVE';
    const startDate = document.getElementById('embargo-input-start-date')?.value;
    const notes = document.getElementById('embargo-input-notes')?.value?.trim();

    const selectedConcepts = new Set();
    ['embargo-select-concept-monthly', 'embargo-select-concept-sac', 'embargo-select-concept-vacations', 'embargo-select-concept-final'].forEach((selId) => {
      const val = document.getElementById(selId)?.value;
      if (val) selectedConcepts.add(val);
    });

    const conceptIds = Array.from(selectedConcepts);

    if (conceptIds.length === 0) {
      if (alertEl) {
        alertEl.textContent = 'Debe asignar al menos un concepto de retención al embargo judicial.';
        alertEl.classList.remove('d-none');
      }
      return;
    }

    if (hasCap && (!totalAmountVal || Number(totalAmountVal) <= 0)) {
      if (alertEl) {
        alertEl.textContent = 'El monto total a descontar (tope de deuda) es obligatorio y debe ser mayor a 0.';
        alertEl.classList.remove('d-none');
      }
      return;
    }

    const payload = {
      employeeId,
      caseTitle,
      dossierNumber: dossierNumber || null,
      court: court || null,
      secretary: secretary || null,
      judicialDistrict: judicialDistrict || null,
      embargoType,
      hasCap,
      totalAmount: hasCap ? Number(totalAmountVal) : null,
      priorityOrder,
      status,
      startDate: startDate || null,
      notes: notes || null,
      conceptIds,
    };

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
    }

    try {
      if (id) {
        await apiRequest(`/embargoes/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Embargo judicial actualizado correctamente', 'success');
      } else {
        await apiRequest('/embargoes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Embargo judicial registrado con éxito', 'success');
      }

      const modalEl = document.getElementById('modal-payroll-embargo-form');
      if (modalEl && window.bootstrap?.Modal) {
        const modal = window.bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }
      await this.loadEmbargoes();
    } catch (err) {
      console.error('Error al guardar embargo:', err);
      if (alertEl) {
        alertEl.textContent = err.message || 'Error al guardar el embargo judicial';
        alertEl.classList.remove('d-none');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Embargo';
      }
    }
  }

  async openEmbargoHistoryModal(id) {
    try {
      const res = await apiRequest(`/embargoes/${id}/history`);
      const { embargo, history } = res.data || res;
      this.activeEmbargoHistoryData = { embargo, history: history || [] };

      document.getElementById('modal-embargo-history-title').textContent = `Retenciones: ${embargo.caseTitle}`;
      document.getElementById('modal-embargo-history-subtitle').textContent = `${embargo.court || 'Juzgado'} • Empleado: ${embargo.employee?.lastName}, ${embargo.employee?.firstName}`;

      document.getElementById('embargo-hist-total-debt').textContent = embargo.hasCap && embargo.totalAmount !== null
        ? `$ ${formatNumber(embargo.totalAmount)}`
        : 'Sin Límite';

      document.getElementById('embargo-hist-total-amortized').textContent = `$ ${formatNumber(embargo.accumulatedAmount)}`;

      document.getElementById('embargo-hist-remaining-balance').textContent = embargo.hasCap && embargo.remainingBalance !== null
        ? `$ ${formatNumber(embargo.remainingBalance)}`
        : 'Indefinido';

      const tbody = document.getElementById('embargo-history-table-body');
      if (tbody) {
        if (!history || history.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Aún no se han practicado retenciones para este embargo en liquidaciones cerradas.</td></tr>';
        } else {
          tbody.innerHTML = history
            .map((h) => {
              const periodLabel = `${h.periodMonth}/${h.periodYear} - ${h.periodName || h.periodType}`;
              const balanceStr = h.remainingBalance !== null ? `$ ${formatNumber(h.remainingBalance)}` : 'Indefinido';
              return `
                <tr>
                  <td class="text-truncate"><strong>${escapeHtml(periodLabel)}</strong></td>
                  <td class="text-center">#${h.settlementNumber || 1}</td>
                  <td class="text-truncate" title="[${escapeHtml(h.conceptCode)}] ${escapeHtml(h.conceptName)}"><span class="badge bg-light text-dark font-monospace">[${escapeHtml(h.conceptCode)}] ${escapeHtml(h.conceptName)}</span></td>
                  <td class="text-end fw-bold font-monospace text-primary text-nowrap">$ ${formatNumber(h.amount)}</td>
                  <td class="text-end font-monospace text-success text-nowrap">$ ${formatNumber(h.runningAccumulated)}</td>
                  <td class="text-end font-monospace text-danger text-nowrap">${balanceStr}</td>
                </tr>
              `;
            })
            .join('');
        }
      }

      const modalEl = document.getElementById('modal-payroll-embargo-history');
      if (modalEl && window.bootstrap?.Modal) {
        const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
      }
    } catch (err) {
      console.error('Error al ver historial:', err);
      showToast(err.message || 'Error al obtener historial de retenciones', 'danger');
    }
  }

  printEmbargoHistoryReport() {
    if (!this.activeEmbargoHistoryData || !this.activeEmbargoHistoryData.embargo) {
      showToast('No hay datos de embargo disponibles para imprimir', 'warning');
      return;
    }

    const { embargo, history } = this.activeEmbargoHistoryData;
    const emp = embargo.employee || {};
    const empName = `${emp.lastName || ''}, ${emp.firstName || ''}`.trim() || 'Sin especificar';
    const empFile = emp.fileNumber ? `Legajo N° ${emp.fileNumber}` : '';
    const empCuil = emp.cuil ? `CUIL: ${emp.cuil}` : '';

    const totalDebtStr = embargo.hasCap && embargo.totalAmount !== null
      ? `$ ${formatNumber(embargo.totalAmount)}`
      : 'Sin Límite (Cuota Alimentaria)';
    const totalAmortizedStr = `$ ${formatNumber(embargo.accumulatedAmount || 0)}`;
    const remainingBalanceStr = embargo.hasCap && embargo.remainingBalance !== null
      ? `$ ${formatNumber(embargo.remainingBalance)}`
      : (embargo.hasCap ? '$ 0,00' : 'Indefinido');

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('El navegador bloqueó la ventana emergente. Por favor habilite las ventanas emergentes.', 'danger');
      return;
    }

    const historyRows = (history && history.length > 0)
      ? history.map((h, idx) => {
          const pLabel = `${h.periodMonth}/${h.periodYear} — ${h.periodName || h.periodType}`;
          const bal = h.remainingBalance !== null ? `$ ${formatNumber(h.remainingBalance)}` : 'Indefinido';
          return `
            <tr>
              <td style="text-align: center;">${idx + 1}</td>
              <td><strong>${escapeHtml(pLabel)}</strong></td>
              <td style="text-align: center;">#${h.settlementNumber || 1}</td>
              <td>[${escapeHtml(h.conceptCode)}] ${escapeHtml(h.conceptName)}</td>
              <td style="text-align: right; font-weight: bold; white-space: nowrap;">$ ${formatNumber(h.amount)}</td>
              <td style="text-align: right; white-space: nowrap;">$ ${formatNumber(h.runningAccumulated)}</td>
              <td style="text-align: right; font-weight: bold; white-space: nowrap;">${bal}</td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #666;">No se registran retenciones practicadas hasta la fecha.</td></tr>';

    const printHtml = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Informe Judicial de Retenciones — ${escapeHtml(embargo.caseTitle || 'Embargo')}</title>
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
            font-size: 11pt;
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
            font-size: 15pt;
            font-weight: 800;
            color: #0054a6;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .subtitle {
            font-size: 9.5pt;
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
            padding: 10px 14px;
            margin-bottom: 12px;
          }
          .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 16px;
            font-size: 9.5pt;
          }
          .grid-3 {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 8px;
            text-align: center;
            background: #eef2f6;
            padding: 8px;
            border-radius: 4px;
            margin-bottom: 14px;
          }
          .stat-label {
            font-size: 7.5pt;
            font-weight: 700;
            text-transform: uppercase;
            color: #555;
            margin-bottom: 2px;
          }
          .stat-val {
            font-size: 13pt;
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
            font-size: 8pt;
            font-weight: 700;
            text-transform: uppercase;
            border: 1px solid #0054a6;
          }
          td {
            padding: 5px 8px;
            border: 1px solid #e1e4e8;
            vertical-align: middle;
          }
          tr:nth-child(even) td {
            background-color: #f9fbfd;
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
          .signature-box {
            border-top: 1px solid #333;
            width: 220px;
            text-align: center;
            padding-top: 5px;
            font-weight: bold;
            font-size: 8.5pt;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div>
            <h1 class="title">Constancia de Retenciones por Embargo Judicial</h1>
            <div class="subtitle">Rendición Oficial de Cuotas y Amortizaciones de Haberes (LCT Art. 120 / 140)</div>
          </div>
          <div class="meta-box">
            <div><strong>Emisión:</strong> ${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
            <div><strong>Estado:</strong> ${embargo.status === 'ACTIVE' ? 'ACTIVO' : escapeHtml(embargo.status)}</div>
          </div>
        </div>

        <div class="section-card">
          <div class="grid-2">
            <div>
              <strong>Colaborador / Demandado:</strong> ${escapeHtml(empName)}<br>
              <span style="color: #555;">${empFile ? escapeHtml(empFile) + ' • ' : ''}${empCuil ? escapeHtml(empCuil) : ''}</span>
            </div>
            <div>
              <strong>Tipo de Embargo:</strong> ${escapeHtml(embargo.embargoType || 'COMERCIAL')} ${embargo.hasCap ? '(Con Tope Deuda)' : '(Sin Límite)'}<br>
              <strong>Prioridad:</strong> N° ${embargo.priorityOrder || 1}
            </div>
            <div>
              <strong>Autos Caratulados:</strong> ${escapeHtml(embargo.caseTitle || '-')}<br>
              <strong>Expediente N°:</strong> ${escapeHtml(embargo.dossierNumber || '-')}
            </div>
            <div>
              <strong>Juzgado / Secretaría:</strong> ${escapeHtml(embargo.court || '-')}${embargo.secretary ? ' — ' + escapeHtml(embargo.secretary) : ''}<br>
              <strong>Jurisdicción / Fuero:</strong> ${escapeHtml(embargo.judicialDistrict || '-')}
            </div>
          </div>
        </div>

        <div class="grid-3">
          <div>
            <div class="stat-label">MONTO TOTAL ORDENADO</div>
            <div class="stat-val" style="color: #222;">${totalDebtStr}</div>
          </div>
          <div>
            <div class="stat-label">TOTAL AMORTIZADO A LA FECHA</div>
            <div class="stat-val" style="color: #198754;">${totalAmortizedStr}</div>
          </div>
          <div>
            <div class="stat-label">SALDO DEUDOR RESTANTE</div>
            <div class="stat-val" style="color: #dc3545;">${remainingBalanceStr}</div>
          </div>
        </div>

        <table style="width: 100%;">
          <thead>
            <tr>
              <th style="width: 5%; text-align: center;">#</th>
              <th style="width: 25%;">Período / Liquidación</th>
              <th style="width: 8%; text-align: center;">Liq. N°</th>
              <th style="width: 26%;">Concepto Imputado</th>
              <th style="width: 12%; text-align: right;">Retenido ($)</th>
              <th style="width: 12%; text-align: right;">Acumulado ($)</th>
              <th style="width: 12%; text-align: right;">Saldo ($)</th>
            </tr>
          </thead>
          <tbody>
            ${historyRows}
          </tbody>
        </table>

        <div class="footer-box">
          <div>
            <em>Documento emitido como constancia fidedigna de retención judicial y acreditación procesal.</em>
          </div>
          <div class="signature-box">
            Firma y Sello Agente de Retención<br>
            <span style="font-size: 7.5pt; font-weight: normal; color: #555;">Responsable de Liquidación de Haberes</span>
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

  async handleEmbargoStatusToggle(id, targetStatus) {
    try {
      await apiRequest(`/embargoes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: targetStatus }),
      });
      showToast(`Estado del embargo actualizado a ${targetStatus === 'ACTIVE' ? 'ACTIVO' : 'SUSPENDIDO'}`, 'success');
      await this.loadEmbargoes();
    } catch (err) {
      console.error('Error al cambiar estado:', err);
      showToast(err.message || 'Error al actualizar el estado del embargo', 'danger');
    }
  }

  async handleDeleteEmbargo(id) {
    if (!confirm('¿Está seguro de que desea eliminar o anular este embargo judicial? Si ya posee liquidaciones históricas emitidas, quedará archivado como CANCELADO para resguardar la trazabilidad contable.')) {
      return;
    }

    try {
      const res = await apiRequest(`/embargoes/${id}`, { method: 'DELETE' });
      showToast(res.message || 'Embargo judicial procesado correctamente', 'success');
      await this.loadEmbargoes();
    } catch (err) {
      console.error('Error al eliminar embargo:', err);
      showToast(err.message || 'Error al eliminar el embargo judicial', 'danger');
    }
  }
}

export function registerEmbargoesMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(EmbargoesMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
