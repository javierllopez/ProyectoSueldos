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


class SalaryScalesMethods {
  // --- Nóminas (Sueldos Básicos) ---

  getDistinctScaleCctGroups(scales = this.payrollSalaryScales || []) {
    const groupsMap = new Map();
    let noCctCount = 0;

    for (const s of scales) {
      if (!s.cctCode) {
        noCctCount++;
        continue;
      }
      const code = s.cctCode;
      if (!groupsMap.has(code)) {
        const label =
          code.toUpperCase() === 'FC'
            ? 'FC - Fuera de Convenio'
            : (s.cct?.name ? `${code} - ${s.cct.name}` : `CCT ${code}`);
        groupsMap.set(code, {
          code,
          name: s.cct?.name || code,
          label,
          count: 0,
        });
      }
      groupsMap.get(code).count++;
    }

    const groups = Array.from(groupsMap.values()).sort((a, b) => a.code.localeCompare(b.code));
    return { groups, noCctCount };
  }

  populateSalaryScaleCctFilterSelect(selectId, { allLabel = 'Todos los Convenios', includeCounts = false } = {}) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    const scales = this.payrollSalaryScales || [];
    const currentVal = sel.value || 'ALL';
    const { groups, noCctCount } = this.getDistinctScaleCctGroups(scales);

    let html = `<option value="ALL">${escapeHtml(allLabel)}${includeCounts ? ` (${scales.length})` : ''}</option>`;
    for (const g of groups) {
      const countTxt = includeCounts ? ` (${g.count})` : '';
      html += `<option value="${escapeHtml(g.code)}">${escapeHtml(g.label)}${countTxt}</option>`;
    }
    if (noCctCount > 0) {
      html += `<option value="NO_CCT">Sin Convenio / General${includeCounts ? ` (${noCctCount})` : ''}</option>`;
    }

    sel.innerHTML = html;
    const validVals = new Set(['ALL', ...groups.map((g) => g.code), ...(noCctCount > 0 ? ['NO_CCT'] : [])]);
    sel.value = validVals.has(currentVal) ? currentVal : 'ALL';
  }

  formatSalaryScaleCctCell(scale) {
    if (!scale?.cctCode) {
      return '<span class="badge bg-secondary-lt text-muted">General / Sin CCT</span>';
    }
    const isFc = String(scale.cctCode).toUpperCase() === 'FC';
    const badgeCls = isFc ? 'bg-purple-lt text-purple' : 'bg-indigo-lt text-indigo';
    const subName = scale.cct?.name || (isFc ? 'Fuera de Convenio' : '');
    return `
      <div class="d-flex flex-column" style="max-width: 205px;">
        <div><span class="badge ${badgeCls} font-monospace">${escapeHtml(scale.cctCode)}</span></div>
        ${subName ? `<span class="text-muted text-truncate mt-1" style="font-size: 0.72rem;" title="${escapeHtml(subName)}">${escapeHtml(subName)}</span>` : ''}
      </div>
    `;
  }

  renderSalaryScaleRowHtml(scale) {
    const empCount = scale.assignedEmployeesCount ?? scale.employeesCount ?? scale._count?.employees ?? 0;
    const scalePeriods = Array.isArray(scale.periods) ? scale.periods : [];
    const periodsBadgesHtml = scalePeriods.length > 0
      ? `<div class="d-flex flex-wrap gap-1 mt-1">
          ${scalePeriods
            .slice(-4)
            .map((p) => {
              const fStr = String(p.validFrom || '').slice(0, 10).split('-').reverse().join('/');
              const tStr = String(p.validTo || '').slice(0, 10).split('-').reverse().join('/');
              return `<span class="badge bg-teal-lt text-teal font-monospace" style="font-size: 0.7rem;" title="Vigencia: ${fStr} al ${tStr}">
                ${fStr}–${tStr}: $ ${formatNumber(p.amount)}
              </span>`;
            })
            .join('')}
        </div>`
      : '';

    return `
      <tr>
        <td>
          <div class="d-flex flex-wrap align-items-center gap-2">
            <div class="fw-bold text-dark">${escapeHtml(scale.name)}</div>
            ${scale.isInternOnly ? '<span class="badge bg-teal-lt text-teal"><i class="ti ti-school me-1"></i>Pasantes Ley 26.427</span>' : ''}
            ${scale.isDirectorOnly ? '<span class="badge bg-purple-lt text-purple"><i class="ti ti-tie me-1"></i>Directores LRT (Mod. 099)</span>' : ''}
          </div>
          ${periodsBadgesHtml}
        </td>
        <td>
          ${scale.code ? `<span class="badge bg-secondary-lt font-monospace">${escapeHtml(scale.code)}</span>` : '<span class="text-muted small">-</span>'}
        </td>
        <td>
          ${this.formatSalaryScaleCctCell(scale)}
        </td>
        <td>
          <span class="text-muted small">${escapeHtml(scale.description || '-')}</span>
        </td>
        <td class="text-end font-monospace fw-bold fs-4 text-teal text-nowrap">
          $ ${formatNumber(scale.amount)}
        </td>
        <td class="text-center">
          <span class="badge ${empCount > 0 ? 'bg-blue-lt' : 'bg-secondary-lt'}">
            <i class="ti ti-users me-1"></i>${empCount} ${empCount === 1 ? 'colaborador' : 'colaboradores'}
          </span>
        </td>
        <td class="text-end text-nowrap">
          <div class="dropdown">
            <button class="btn btn-sm btn-icon btn-ghost-secondary rounded" data-bs-toggle="dropdown" aria-expanded="false" title="Acciones">
              <i class="ti ti-dots-vertical"></i>
            </button>
            <div class="dropdown-menu dropdown-menu-end shadow-sm">
              <a class="dropdown-item btn-edit-salary-scale" href="#" data-id="${scale.id}">
                <i class="ti ti-edit me-2 text-primary"></i> Editar Nómina
              </a>
              <div class="dropdown-divider"></div>
              <a class="dropdown-item text-danger btn-delete-salary-scale" href="#" data-id="${scale.id}" data-name="${escapeHtml(scale.name)}" data-count="${empCount}">
                <i class="ti ti-trash me-2"></i> Dar de Baja
              </a>
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  async loadPayrollSalaryScales() {
    const spinner = document.getElementById('payroll-scales-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      const res = await apiRequest('/payroll/salary-scales');
      this.payrollSalaryScales = res.data || [];
      this.salaryScales = this.payrollSalaryScales;

      const badgeCount = document.getElementById('payroll-badge-scales-count');
      if (badgeCount) badgeCount.textContent = this.payrollSalaryScales.length;

      this.populateSalaryScaleCctFilterSelect('payroll-scale-cct-filter', {
        allLabel: 'Todos los Convenios',
        includeCounts: true,
      });

      this.renderPayrollSalaryScalesTable();
    } catch (err) {
      console.error('Error al cargar nóminas de sueldo básico:', err);
      showToast(err.message || 'Error al cargar nóminas', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  renderPayrollSalaryScalesTable() {
    const tbody = document.getElementById('payroll-scales-table-body');
    if (!tbody) return;

    const searchTerm = document.getElementById('payroll-scale-search')?.value?.toLowerCase().trim() || '';
    const cctFilter = document.getElementById('payroll-scale-cct-filter')?.value || 'ALL';
    const groupByCct = Boolean(document.getElementById('payroll-scale-group-by-cct')?.checked);

    const filtered = (this.payrollSalaryScales || []).filter((s) => {
      if (cctFilter === 'NO_CCT' && s.cctCode) return false;
      if (cctFilter !== 'ALL' && cctFilter !== 'NO_CCT' && s.cctCode !== cctFilter) return false;

      if (!searchTerm) return true;
      return (
        (s.name && s.name.toLowerCase().includes(searchTerm)) ||
        (s.code && s.code.toLowerCase().includes(searchTerm)) ||
        (s.description && s.description.toLowerCase().includes(searchTerm)) ||
        (s.cctCode && s.cctCode.toLowerCase().includes(searchTerm)) ||
        (s.cct?.name && s.cct.name.toLowerCase().includes(searchTerm))
      );
    });

    const paginationContainer = document.getElementById('payroll-scales-pagination-container');
    const paginationInfo = document.getElementById('payroll-scales-pagination-info');
    const paginationList = document.getElementById('payroll-scales-pagination-list');
    const pageSizeEl = document.getElementById('payroll-scales-page-size-select');

    if (filtered.length === 0) {
      if (paginationContainer) paginationContainer.classList.add('d-none');
      if (searchTerm || cctFilter !== 'ALL') {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center py-5 text-muted">
              <i class="ti ti-search-off fs-1 d-block mb-2 text-teal"></i>
              No se encontraron nóminas que coincidan con los filtros aplicados.
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center py-5 text-muted">
              <i class="ti ti-cash-banknote fs-1 d-block mb-2 text-teal opacity-50"></i>
              <div class="fw-bold mb-1">No hay nóminas de sueldo básico registradas</div>
              <small class="d-block mb-3">Define los básicos salariales para asociarlos a los colaboradores y facilitar los aumentos masivos.</small>
              <button class="btn btn-sm btn-payroll" onclick="document.getElementById('btn-open-new-scale-modal').click()">
                <i class="ti ti-plus me-1"></i> Crear Primera Nómina
              </button>
            </td>
          </tr>
        `;
      }
      return;
    }

    const isFiltered = Boolean(searchTerm) || cctFilter !== 'ALL';

    if (groupByCct) {
      if (paginationContainer) paginationContainer.classList.remove('d-none');
      if (pageSizeEl) pageSizeEl.disabled = true;
      if (paginationList) paginationList.innerHTML = '';

      const groupsMap = new Map();
      for (const s of filtered) {
        const key = s.cctCode || '__NO_CCT__';
        if (!groupsMap.has(key)) {
          const title = !s.cctCode
            ? 'Generales / Sin Convenio Asignado'
            : (String(s.cctCode).toUpperCase() === 'FC'
                ? 'Fuera de Convenio (FC)'
                : `CCT ${s.cctCode}${s.cct?.name ? ` — ${s.cct.name}` : ''}`);
          groupsMap.set(key, {
            key,
            cctCode: s.cctCode || null,
            title,
            items: [],
            totalEmployees: 0,
          });
        }
        const grp = groupsMap.get(key);
        grp.items.push(s);
        grp.totalEmployees += (s.assignedEmployeesCount ?? s.employeesCount ?? s._count?.employees ?? 0);
      }

      const sortedGroups = Array.from(groupsMap.values()).sort((a, b) => {
        if (!a.cctCode && b.cctCode) return 1;
        if (a.cctCode && !b.cctCode) return -1;
        return String(a.cctCode || '').localeCompare(String(b.cctCode || ''));
      });

      if (paginationInfo) {
        paginationInfo.innerHTML = `Agrupado en <strong>${sortedGroups.length}</strong> grupo(s) — <strong>${filtered.length}</strong> nómina(s)` +
          (isFiltered ? ` (de ${this.payrollSalaryScales.length} totales)` : '');
      }

      tbody.innerHTML = sortedGroups
        .map((grp) => {
          const badgeCls = !grp.cctCode
            ? 'bg-secondary-lt text-secondary'
            : (String(grp.cctCode).toUpperCase() === 'FC' ? 'bg-purple-lt text-purple' : 'bg-indigo-lt text-indigo');
          const headerHtml = `
            <tr class="table-light border-top border-bottom">
              <td colspan="7" class="py-2 px-3">
                <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <div class="d-flex align-items-center gap-2">
                    <span class="badge ${badgeCls} fw-bold font-monospace">
                      <i class="ti ti-folders me-1"></i>${escapeHtml(grp.cctCode || 'SIN CCT')}
                    </span>
                    <span class="fw-bold text-dark">${escapeHtml(grp.title)}</span>
                  </div>
                  <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-teal-lt text-teal">${grp.items.length} ítem(s)</span>
                    <span class="badge bg-blue-lt text-blue">${grp.totalEmployees} colaborador(es)</span>
                  </div>
                </div>
              </td>
            </tr>
          `;
          return headerHtml + grp.items.map((scale) => this.renderSalaryScaleRowHtml(scale)).join('');
        })
        .join('');
    } else {
      if (pageSizeEl) pageSizeEl.disabled = false;
      const pageSize = this.payrollSalaryScalesPageSize || 5;
      const totalPages = Math.ceil(filtered.length / pageSize) || 1;
      if (this.payrollSalaryScalesPage > totalPages) this.payrollSalaryScalesPage = totalPages;
      if (this.payrollSalaryScalesPage < 1) this.payrollSalaryScalesPage = 1;

      const startIndex = (this.payrollSalaryScalesPage - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, filtered.length);
      const paginatedItems = filtered.slice(startIndex, endIndex);

      if (paginationContainer) paginationContainer.classList.remove('d-none');
      if (paginationInfo) {
        paginationInfo.innerHTML = `Mostrando <strong>${startIndex + 1}</strong> a <strong>${endIndex}</strong> de <strong>${filtered.length}</strong> nóminas` +
          (isFiltered ? ` (filtradas de ${this.payrollSalaryScales.length})` : '');
      }

      if (paginationList) {
        let pagesHtml = '';
        pagesHtml += `
          <li class="page-item ${this.payrollSalaryScalesPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${this.payrollSalaryScalesPage - 1}"><i class="ti ti-chevron-left"></i></a>
          </li>
        `;
        for (let p = 1; p <= totalPages; p++) {
          if (p === 1 || p === totalPages || (p >= this.payrollSalaryScalesPage - 1 && p <= this.payrollSalaryScalesPage + 1)) {
            pagesHtml += `
              <li class="page-item ${p === this.payrollSalaryScalesPage ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${p}">${p}</a>
              </li>
            `;
          } else if (p === this.payrollSalaryScalesPage - 2 || p === this.payrollSalaryScalesPage + 2) {
            pagesHtml += '<li class="page-item disabled"><span class="page-link">…</span></li>';
          }
        }
        pagesHtml += `
          <li class="page-item ${this.payrollSalaryScalesPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${this.payrollSalaryScalesPage + 1}"><i class="ti ti-chevron-right"></i></a>
          </li>
        `;
        paginationList.innerHTML = pagesHtml;

        paginationList.querySelectorAll('.page-link[data-page]').forEach((link) => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPage = parseInt(link.getAttribute('data-page'), 10);
            if (targetPage >= 1 && targetPage <= totalPages && targetPage !== this.payrollSalaryScalesPage) {
              this.payrollSalaryScalesPage = targetPage;
              this.renderPayrollSalaryScalesTable();
            }
          });
        });
      }

      tbody.innerHTML = paginatedItems.map((scale) => this.renderSalaryScaleRowHtml(scale)).join('');
    }

    tbody.querySelectorAll('.btn-edit-salary-scale').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        this.openEditSalaryScaleModal(id);
      });
    });

    tbody.querySelectorAll('.btn-delete-salary-scale').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        const count = parseInt(btn.getAttribute('data-count'), 10) || 0;
        this.deleteSalaryScale(id, name, count);
      });
    });
  }

  setupScaleCctInteractiveSearch() {
    const searchInput = document.getElementById('scale-cct-search-input');
    const dropdown = document.getElementById('scale-cct-results-dropdown');
    const changeBtn = document.getElementById('btn-change-scale-cct');
    if (!searchInput || searchInput.dataset.setupDone) return;
    searchInput.dataset.setupDone = 'true';

    const topFrequentCodes = ['FC', '0130/75', '0076/75', '0389/04', '0260/75', '0122/75', '0040/89', '0244/94', '0544/08', '0652/12'];

    const renderResults = async (query = '') => {
      if (!Array.isArray(this.arcaCcts) || this.arcaCcts.length === 0) {
        if (dropdown) {
          dropdown.innerHTML = '<div class="p-3 text-center text-muted small"><span class="spinner-border spinner-border-sm me-2"></span>Cargando catálogo de convenios ARCA...</div>';
          dropdown.style.display = 'block';
        }
        await this.ensureArcaCctsLoaded?.().catch(() => []);
      }

      const q = query.trim().toLowerCase();
      let matches = [];
      const catalog = this.arcaCcts || [];

      if (!q) {
        matches = catalog.filter((c) => topFrequentCodes.includes(c.code));
      } else {
        const normalizedQ = q.replace(/^0+/, '');
        matches = catalog
          .filter((c) => {
            return (
              c.code.toLowerCase().includes(q) ||
              c.code.replace(/^0+/, '').toLowerCase().includes(normalizedQ) ||
              (c.name && c.name.toLowerCase().includes(q)) ||
              (c.sector && c.sector.toLowerCase().includes(q)) ||
              (c.description && c.description.toLowerCase().includes(q))
            );
          })
          .slice(0, 30);
      }

      if (!dropdown) return;

      let html = `
        <button type="button" class="dropdown-item d-flex align-items-center justify-content-between py-2 bg-light-subtle border-bottom btn-clear-scale-cct-opt">
          <span class="small fw-bold text-secondary"><i class="ti ti-ban me-1"></i>Sin convenio asignado / Escala General</span>
          <span class="badge bg-secondary-lt text-secondary">Opcional</span>
        </button>
      `;

      if (matches.length === 0) {
        html += `
          <div class="p-3 text-center text-muted small">
            <i class="ti ti-search-off fs-2 d-block mb-1 text-secondary opacity-50"></i>
            No se encontró ningún convenio para "<strong>${escapeHtml(query)}</strong>".
          </div>
        `;
      } else {
        html += `<div class="dropdown-header text-uppercase text-muted py-1 bg-light border-bottom" style="font-size: 0.7rem;">
          ${!q ? 'Convenios frecuentes' : `Coincidencias: ${matches.length}${matches.length === 30 ? ' (primeros 30)' : ''}`}
        </div>`;
        html += matches
          .map(
            (c) => `
          <button type="button" class="dropdown-item d-flex align-items-center justify-content-between py-2 border-bottom border-light btn-select-scale-cct-opt" data-code="${escapeHtml(c.code)}">
            <div class="text-truncate me-2 text-start">
              <div class="d-flex align-items-center gap-2 mb-1">
                <span class="badge bg-indigo-lt text-indigo font-monospace fw-bold px-2 py-0" style="font-size: 0.74rem;">${escapeHtml(c.code)}</span>
                <strong class="text-dark small text-truncate">${escapeHtml(c.sector || c.name.split('-')[0].trim())}</strong>
              </div>
              <div class="text-muted text-truncate" style="font-size: 0.74rem;">${escapeHtml(c.name)}</div>
            </div>
            <i class="ti ti-chevron-right text-muted opacity-50"></i>
          </button>
        `
          )
          .join('');
      }

      dropdown.innerHTML = html;
      dropdown.style.display = 'block';

      dropdown.querySelector('.btn-clear-scale-cct-opt')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.clearScaleCctSelection();
      });

      dropdown.querySelectorAll('.btn-select-scale-cct-opt').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const code = btn.dataset.code;
          const found = (this.arcaCcts || []).find((x) => x.code === code);
          this.setScaleCctSelection(code, found);
        });
      });
    };

    let debounceTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        renderResults(searchInput.value);
      }, 90);
    });

    searchInput.addEventListener('focus', () => {
      renderResults(searchInput.value);
    });

    document.addEventListener('click', (e) => {
      const wrapper = document.getElementById('scale-cct-search-wrapper');
      if (wrapper && !wrapper.contains(e.target)) {
        if (dropdown) dropdown.style.display = 'none';
      }
    });

    changeBtn?.addEventListener('click', () => {
      this.clearScaleCctSelection();
      searchInput.focus();
      renderResults('');
    });
  }

  setScaleCctSelection(code, cctObj = null) {
    const hiddenInput = document.getElementById('scale-input-cct-code');
    const selectedBox = document.getElementById('scale-cct-selected-box');
    const searchWrapper = document.getElementById('scale-cct-search-wrapper');
    const searchInput = document.getElementById('scale-cct-search-input');
    const dropdown = document.getElementById('scale-cct-results-dropdown');

    if (!hiddenInput) return;
    if (!code) {
      this.clearScaleCctSelection();
      return;
    }

    hiddenInput.value = code;
    const cct = cctObj || (this.arcaCcts || []).find((c) => c.code === code) || { code, name: code, sector: '' };

    const codeBadge = document.getElementById('scale-cct-selected-code');
    const nameEl = document.getElementById('scale-cct-selected-name');
    const sectorEl = document.getElementById('scale-cct-selected-sector');

    if (codeBadge) codeBadge.textContent = cct.code;
    if (nameEl) nameEl.textContent = cct.name || cct.code;
    if (sectorEl) sectorEl.textContent = cct.sector ? `Sector: ${cct.sector}` : 'Convenio Colectivo ARCA';

    if (selectedBox) selectedBox.classList.remove('d-none');
    if (searchWrapper) searchWrapper.classList.add('d-none');
    if (searchInput) searchInput.value = '';
    if (dropdown) dropdown.style.display = 'none';
  }

  clearScaleCctSelection() {
    const hiddenInput = document.getElementById('scale-input-cct-code');
    const selectedBox = document.getElementById('scale-cct-selected-box');
    const searchWrapper = document.getElementById('scale-cct-search-wrapper');
    const searchInput = document.getElementById('scale-cct-search-input');
    const dropdown = document.getElementById('scale-cct-results-dropdown');

    if (hiddenInput) hiddenInput.value = '';
    if (selectedBox) selectedBox.classList.add('d-none');
    if (searchWrapper) searchWrapper.classList.remove('d-none');
    if (searchInput) searchInput.value = '';
    if (dropdown) dropdown.style.display = 'none';
  }

  openNewSalaryScaleModal() {
    const form = document.getElementById('form-salary-scale');
    if (form) form.reset();
    document.getElementById('scale-form-id').value = '';
    document.getElementById('modal-salary-scale-title').textContent = 'Nueva Nómina de Sueldo Básico';
    document.getElementById('scale-form-alert')?.classList.add('d-none');
    const internCheck = document.getElementById('scale-input-is-intern-only');
    if (internCheck) internCheck.checked = false;
    const directorCheck = document.getElementById('scale-input-is-director-only');
    if (directorCheck) directorCheck.checked = false;

    this.setupScaleCctInteractiveSearch();
    this.clearScaleCctSelection();
    this.ensureArcaCctsLoaded?.().catch(() => []);

    // Mutua exclusión
    if (internCheck && directorCheck) {
      internCheck.onchange = () => { if (internCheck.checked) directorCheck.checked = false; };
      directorCheck.onchange = () => { if (directorCheck.checked) internCheck.checked = false; };
    }

    const submitBtn = document.getElementById('btn-save-salary-scale');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Nómina';
    getBootstrapModal(document.getElementById('modal-salary-scale'))?.show();
  }

  openEditSalaryScaleModal(id) {
    const scale = this.payrollSalaryScales.find((s) => s.id === id);
    if (!scale) return;

    document.getElementById('scale-form-id').value = scale.id;
    document.getElementById('scale-input-name').value = scale.name;
    document.getElementById('scale-input-code').value = scale.code || '';
    document.getElementById('scale-input-amount').value = scale.amount;
    document.getElementById('scale-input-description').value = scale.description || '';
    const internCheck = document.getElementById('scale-input-is-intern-only');
    if (internCheck) internCheck.checked = Boolean(scale.isInternOnly);
    const directorCheck = document.getElementById('scale-input-is-director-only');
    if (directorCheck) directorCheck.checked = Boolean(scale.isDirectorOnly);

    this.setupScaleCctInteractiveSearch();
    this.ensureArcaCctsLoaded?.().catch(() => []);
    if (scale.cctCode) {
      this.setScaleCctSelection(scale.cctCode, scale.cct);
    } else {
      this.clearScaleCctSelection();
    }

    // Mutua exclusión
    if (internCheck && directorCheck) {
      internCheck.onchange = () => { if (internCheck.checked) directorCheck.checked = false; };
      directorCheck.onchange = () => { if (directorCheck.checked) internCheck.checked = false; };
    }

    document.getElementById('modal-salary-scale-title').textContent = `Editar Nómina: ${scale.name}`;
    document.getElementById('scale-form-alert')?.classList.add('d-none');

    const submitBtn = document.getElementById('btn-save-salary-scale');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Actualizar Nómina';

    getBootstrapModal(document.getElementById('modal-salary-scale'))?.show();
  }

  async saveSalaryScale(e) {
    e.preventDefault();
    const id = document.getElementById('scale-form-id').value;
    const name = document.getElementById('scale-input-name').value.trim();
    const code = document.getElementById('scale-input-code').value.trim() || null;
    const cctCode = document.getElementById('scale-input-cct-code')?.value?.trim() || null;
    const amount = Number(document.getElementById('scale-input-amount').value);
    const description = document.getElementById('scale-input-description').value.trim() || null;
    const isInternOnly = document.getElementById('scale-input-is-intern-only')?.checked || false;
    const isDirectorOnly = document.getElementById('scale-input-is-director-only')?.checked || false;
    const alertBox = document.getElementById('scale-form-alert');
    const submitBtn = document.getElementById('btn-save-salary-scale');

    if (isInternOnly && isDirectorOnly) {
      if (alertBox) {
        alertBox.textContent = 'Una nómina no puede ser simultáneamente exclusiva para pasantes y directores.';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    if (!name || isNaN(amount) || amount < 0) {
      if (alertBox) {
        alertBox.textContent = 'Por favor ingresa una denominación válida y un sueldo básico mayor o igual a 0.';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    try {
      if (submitBtn) submitBtn.disabled = true;
      if (alertBox) alertBox.classList.add('d-none');

      const payload = { name, code, cctCode, amount, description, isInternOnly, isDirectorOnly };
      let res;
      if (id) {
        res = await apiRequest(`/payroll/salary-scales/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        const affectedCount = res.data?.affectedEmployeesCount || 0;
        showToast(`Nómina actualizada exitosamente${affectedCount > 0 ? ` (${affectedCount} colaboradores actualizados en cascada)` : ''}`);
      } else {
        res = await apiRequest('/payroll/salary-scales', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Nómina creada exitosamente');
      }

      getBootstrapModal(document.getElementById('modal-salary-scale'))?.hide();
      await this.loadPayrollSalaryScales();
      if (this.employees.length > 0) {
        await this.loadEmployees();
      }
    } catch (err) {
      console.error('Error al guardar nómina:', err);
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al guardar la nómina.';
        alertBox.classList.remove('d-none');
      } else {
        showToast(err.message || 'Error al guardar', 'danger');
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async deleteSalaryScale(id, name, count) {
    if (count > 0) {
      showToast(`No se puede dar de baja la nómina "${name}" porque tiene ${count} colaborador(es) asignado(s). Asigna otra nómina primero.`, 'warning');
      return;
    }

    this.confirmDeleteAction({
      title: 'Dar de Baja Nómina',
      message: `¿Estás seguro de que deseas dar de baja la nómina <strong>"${escapeHtml(name)}"</strong>?`,
      confirmText: 'Dar de Baja',
      onConfirm: async () => {
        try {
          await apiRequest(`/payroll/salary-scales/${id}`, { method: 'DELETE' });
          showToast('Nómina dada de baja exitosamente');
          await this.loadPayrollSalaryScales();
        } catch (err) {
          showToast(err.message || 'Error al dar de baja la nómina', 'danger');
        }
      },
    });
  }

  // --- Actualización Masiva de Nóminas / Sueldos Básicos (Multi-Período) ---

  getDefaultNextMonthRange(prevValidTo = null) {
    let year;
    let month; // 1-12
    if (prevValidTo && /^\d{4}-\d{2}-\d{2}$/.test(prevValidTo)) {
      const [py, pm] = prevValidTo.split('-').map(Number);
      if (pm === 12) {
        year = py + 1;
        month = 1;
      } else {
        year = py;
        month = pm + 1;
      }
    } else if (this.activeFiscalPeriod?.year && this.activeFiscalPeriod?.month) {
      year = Number(this.activeFiscalPeriod.year);
      month = Number(this.activeFiscalPeriod.month);
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const dd = String(lastDay).padStart(2, '0');
    return {
      validFrom: `${year}-${mm}-01`,
      validTo: `${year}-${mm}-${dd}`,
    };
  }

  getMassScaleMatchingScales(cctCode = 'ALL') {
    const scales = this.payrollSalaryScales || [];
    if (cctCode === 'NO_CCT') {
      return scales.filter((s) => !s.cctCode);
    }
    if (cctCode && cctCode !== 'ALL') {
      return scales.filter((s) => s.cctCode === cctCode);
    }
    return scales;
  }

  renderMassScaleItemsChecklist(matchingScales) {
    const container = document.getElementById('mass-scale-items-checklist');
    if (!container) return;

    if (!matchingScales || matchingScales.length === 0) {
      container.innerHTML = '<div class="col-12 text-muted small py-2 text-center">No hay ítems de nómina para el convenio seleccionado.</div>';
      this.updateMassScaleScopeBadge(0, 0);
      return;
    }

    container.innerHTML = matchingScales
      .map(
        (s) => `
      <div class="col-md-4 col-sm-6">
        <label class="form-check border rounded bg-white px-2 py-1 mb-0 cursor-pointer d-flex align-items-center gap-2 shadow-2xs">
          <input class="form-check-input m-0 flex-shrink-0 mass-scale-item-chk" type="checkbox" value="${escapeHtml(s.id)}" checked />
          <div class="text-truncate flex-fill">
            <div class="fw-bold small text-dark text-truncate" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>
            <div class="text-muted font-monospace" style="font-size: 0.7rem;">
              ${s.cctCode ? escapeHtml(s.cctCode) : 'Sin CCT'} &bull; $ ${formatNumber(s.amount)}
            </div>
          </div>
        </label>
      </div>
    `
      )
      .join('');

    container.querySelectorAll('.mass-scale-item-chk').forEach((chk) => {
      chk.addEventListener('change', () => {
        const total = container.querySelectorAll('.mass-scale-item-chk').length;
        const checkedCount = container.querySelectorAll('.mass-scale-item-chk:checked').length;
        this.updateMassScaleScopeBadge(checkedCount, total);
        this.invalidateMassScalePreview();
      });
    });

    this.updateMassScaleScopeBadge(matchingScales.length, matchingScales.length);
  }

  updateMassScaleScopeBadge(selectedCount, totalCount) {
    const badge = document.getElementById('mass-scale-scope-badge');
    if (!badge) return;
    if (totalCount === 0 || selectedCount === 0) {
      badge.className = 'badge bg-danger-lt text-danger fw-bold py-2 px-2';
      badge.textContent = '0 ítems seleccionados';
    } else if (selectedCount === totalCount) {
      badge.className = 'badge bg-teal-lt text-teal fw-bold py-2 px-2';
      badge.textContent = `${selectedCount} ítem(s) alcanzados`;
    } else {
      badge.className = 'badge bg-indigo-lt text-indigo fw-bold py-2 px-2';
      badge.textContent = `${selectedCount} de ${totalCount} ítem(s)`;
    }
  }

  handleMassScaleCctFilterChange() {
    const cctCode = document.getElementById('mass-scale-cct-filter')?.value || 'ALL';
    const matching = this.getMassScaleMatchingScales(cctCode);
    this.renderMassScaleItemsChecklist(matching);
    this.invalidateMassScalePreview();
  }

  toggleMassScaleItemsChecklist() {
    const wrap = document.getElementById('mass-scale-items-checklist-wrap');
    const btn = document.getElementById('btn-toggle-mass-scale-items');
    if (!wrap) return;
    const isHidden = wrap.classList.contains('d-none');
    wrap.classList.toggle('d-none', !isHidden);
    if (btn) btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  }

  setMassScaleChecklistAll(checked) {
    const container = document.getElementById('mass-scale-items-checklist');
    if (!container) return;
    const chks = container.querySelectorAll('.mass-scale-item-chk');
    chks.forEach((chk) => {
      chk.checked = checked;
    });
    this.updateMassScaleScopeBadge(checked ? chks.length : 0, chks.length);
    this.invalidateMassScalePreview();
  }

  collectMassScaleScopeFromForm() {
    const cctCode = document.getElementById('mass-scale-cct-filter')?.value || 'ALL';
    const container = document.getElementById('mass-scale-items-checklist');
    const chks = container ? Array.from(container.querySelectorAll('.mass-scale-item-chk')) : [];
    const selectedIds = chks.filter((c) => c.checked).map((c) => c.value);

    if (chks.length === 0 || selectedIds.length === 0) {
      return { error: 'Debe seleccionar al menos un ítem de nómina (o un convenio con nóminas registradas) para aplicar el aumento.' };
    }

    const scope = { cctCode };
    // Si el usuario destildó alguno manualmente, enviar scaleIds explícitos; si están todos tildados para el convenio, alcanza con cctCode (o scaleIds si es parcial)
    if (selectedIds.length < chks.length) {
      scope.scaleIds = selectedIds;
    }
    return scope;
  }

  openMassScaleIncreaseModal() {
    const form = document.getElementById('form-mass-scale-increase');
    if (form) form.reset();

    const container = document.getElementById('mass-scale-periods-container');
    if (container) container.innerHTML = '';

    document.getElementById('mass-scale-increase-alert')?.classList.add('d-none');
    document.getElementById('mass-scale-preview-section')?.classList.add('d-none');
    document.getElementById('mass-scale-items-checklist-wrap')?.classList.add('d-none');
    const toggleBtn = document.getElementById('btn-toggle-mass-scale-items');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');

    const applyBtn = document.getElementById('btn-apply-mass-scale-increase');
    if (applyBtn) applyBtn.disabled = true;
    this.currentScaleMassIncreasePreview = [];

    this.populateSalaryScaleCctFilterSelect('mass-scale-cct-filter', {
      allLabel: 'Todos los Convenios (Actualización Global)',
      includeCounts: true,
    });
    const listCctFilter = document.getElementById('payroll-scale-cct-filter')?.value || 'ALL';
    const modalCctSel = document.getElementById('mass-scale-cct-filter');
    if (modalCctSel && Array.from(modalCctSel.options).some((o) => o.value === listCctFilter)) {
      modalCctSel.value = listCctFilter;
    }
    this.handleMassScaleCctFilterChange();

    const initialRange = this.getDefaultNextMonthRange(null);
    this.addMassScalePeriodRow({
      validFrom: initialRange.validFrom,
      validTo: initialRange.validTo,
      increaseType: 'PERCENTAGE',
      value: '',
      rounding: 'DECIMAL_2',
    });

    getBootstrapModal(document.getElementById('modal-mass-scale-increase'))?.show();
  }

  addMassScalePeriodRow(defaults = {}) {
    const container = document.getElementById('mass-scale-periods-container');
    if (!container) return;

    const existingRows = container.querySelectorAll('.mass-scale-period-row');
    let defaultRange = { validFrom: defaults.validFrom || '', validTo: defaults.validTo || '' };
    if (!defaultRange.validFrom || !defaultRange.validTo) {
      const lastRow = existingRows[existingRows.length - 1];
      const lastTo = lastRow?.querySelector('.period-row-valid-to')?.value || null;
      defaultRange = this.getDefaultNextMonthRange(lastTo);
    }

    const incType = defaults.increaseType || 'PERCENTAGE';
    const isPct = incType === 'PERCENTAGE';
    const calcBase = defaults.calculationBase || 'CURRENT_BASE';
    const roundingVal = defaults.rounding || 'DECIMAL_2';
    const rowEl = document.createElement('tr');
    rowEl.className = 'mass-scale-period-row border-bottom';
    rowEl.innerHTML = `
      <td class="py-2 px-2 align-middle">
        <input type="date" class="form-control form-control-sm font-monospace period-row-valid-from" value="${escapeHtml(defaultRange.validFrom)}" required />
      </td>
      <td class="py-2 px-2 align-middle">
        <input type="date" class="form-control form-control-sm font-monospace period-row-valid-to" value="${escapeHtml(defaultRange.validTo)}" required />
      </td>
      <td class="py-2 px-2 align-middle">
        <select class="form-select form-select-sm period-row-increase-type">
          <option value="PERCENTAGE" ${isPct ? 'selected' : ''}>Porcentaje (%)</option>
          <option value="FIXED_AMOUNT" ${!isPct ? 'selected' : ''}>Suma fija ($)</option>
        </select>
      </td>
      <td class="py-2 px-2 align-middle">
        <select class="form-select form-select-sm period-row-calc-base">
          <option value="CURRENT_BASE" ${calcBase === 'CURRENT_BASE' ? 'selected' : ''}>Sobre el período actual</option>
          <option value="PREVIOUS_PERIOD" ${calcBase === 'PREVIOUS_PERIOD' ? 'selected' : ''}>Sobre el período anterior</option>
        </select>
      </td>
      <td class="py-2 px-2 align-middle">
        <div class="input-group input-group-sm">
          <span class="input-group-text period-row-symbol">${isPct ? '%' : '$'}</span>
          <input type="number" step="0.01" min="0.01" class="form-control font-monospace fw-bold period-row-value"
            value="${defaults.value !== undefined && defaults.value !== null ? escapeHtml(String(defaults.value)) : ''}"
            placeholder="${isPct ? 'Ej. 12.5' : 'Ej. 50000'}" required />
        </div>
      </td>
      <td class="py-2 px-2 align-middle">
        <select class="form-select form-select-sm period-row-rounding">
          <option value="DECIMAL_2" ${roundingVal === 'DECIMAL_2' ? 'selected' : ''}>2 Decimales</option>
          <option value="INTEGER" ${roundingVal === 'INTEGER' ? 'selected' : ''}>Entero ($)</option>
          <option value="NONE" ${roundingVal === 'NONE' ? 'selected' : ''}>Sin Redondeo</option>
        </select>
      </td>
      <td class="py-2 px-2 align-middle text-end">
        <button type="button" class="btn btn-sm btn-icon btn-outline-danger btn-remove-period-row" title="Quitar período">
          <i class="ti ti-trash"></i>
        </button>
      </td>
    `;

    const typeSel = rowEl.querySelector('.period-row-increase-type');
    const symEl = rowEl.querySelector('.period-row-symbol');
    const valInput = rowEl.querySelector('.period-row-value');
    typeSel?.addEventListener('change', () => {
      const pct = typeSel.value === 'PERCENTAGE';
      if (symEl) symEl.textContent = pct ? '%' : '$';
      if (valInput) valInput.placeholder = pct ? 'Ej. 12.5' : 'Ej. 50000';
      this.updateMassScalePeriodRowRemoveButtons();
      this.invalidateMassScalePreview();
    });

    rowEl.querySelectorAll('input, select').forEach((inp) => {
      inp.addEventListener('input', () => this.invalidateMassScalePreview());
      inp.addEventListener('change', () => this.invalidateMassScalePreview());
    });

    const removeBtn = rowEl.querySelector('.btn-remove-period-row');
    removeBtn?.addEventListener('click', () => {
      const allRows = container.querySelectorAll('.mass-scale-period-row');
      if (allRows.length <= 1) return;
      rowEl.remove();
      this.updateMassScalePeriodRowRemoveButtons();
      this.invalidateMassScalePreview();
    });

    container.appendChild(rowEl);
    this.updateMassScalePeriodRowRemoveButtons();
    this.invalidateMassScalePreview();
  }

  updateMassScalePeriodRowRemoveButtons() {
    const container = document.getElementById('mass-scale-periods-container');
    if (!container) return;
    const rows = container.querySelectorAll('.mass-scale-period-row');
    rows.forEach((r, idx) => {
      const btn = r.querySelector('.btn-remove-period-row');
      if (btn) btn.disabled = rows.length <= 1;

      const incType = r.querySelector('.period-row-increase-type')?.value || 'PERCENTAGE';
      const calcBaseSel = r.querySelector('.period-row-calc-base');
      if (calcBaseSel) {
        if (idx === 0) {
          calcBaseSel.value = 'CURRENT_BASE';
          calcBaseSel.disabled = true;
          calcBaseSel.title = 'El primer período siempre se calcula sobre el período actual';
        } else if (incType !== 'PERCENTAGE') {
          calcBaseSel.disabled = true;
          calcBaseSel.title = 'La base de cálculo aplica solo para aumentos porcentuales';
        } else {
          calcBaseSel.disabled = false;
          calcBaseSel.title = '';
        }
      }
    });
  }

  invalidateMassScalePreview() {
    const applyBtn = document.getElementById('btn-apply-mass-scale-increase');
    if (applyBtn) applyBtn.disabled = true;
  }

  collectMassScalePeriodsFromForm() {
    const container = document.getElementById('mass-scale-periods-container');
    const rows = container ? Array.from(container.querySelectorAll('.mass-scale-period-row')) : [];
    if (rows.length === 0) {
      return { error: 'Debe agregar al menos un período de actualización.' };
    }

    const periods = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const validFrom = r.querySelector('.period-row-valid-from')?.value?.trim() || '';
      const validTo = r.querySelector('.period-row-valid-to')?.value?.trim() || '';
      const increaseType = r.querySelector('.period-row-increase-type')?.value || 'PERCENTAGE';
      const calculationBase = i === 0 ? 'CURRENT_BASE' : (r.querySelector('.period-row-calc-base')?.value || 'CURRENT_BASE');
      const value = parseFloat(r.querySelector('.period-row-value')?.value);
      const rounding = r.querySelector('.period-row-rounding')?.value || 'DECIMAL_2';

      if (!validFrom || !validTo) {
        return { error: `En el renglón #${i + 1}, debe completar la "Fecha desde" y la "Fecha hasta".` };
      }
      if (validFrom > validTo) {
        return { error: `En el renglón #${i + 1}, la "Fecha desde" no puede ser posterior a la "Fecha hasta".` };
      }
      if (isNaN(value) || value <= 0) {
        return { error: `En el renglón #${i + 1}, por favor ingrese un valor numérico mayor a cero.` };
      }

      periods.push({
        validFrom,
        validTo,
        increaseType,
        calculationBase,
        value,
        rounding,
      });
    }

    for (let i = 0; i < periods.length; i++) {
      for (let j = i + 1; j < periods.length; j++) {
        const a = periods[i];
        const b = periods[j];
        if (a.validFrom <= b.validTo && b.validFrom <= a.validTo) {
          return {
            error: `Los períodos de los renglones #${i + 1} (${a.validFrom} al ${a.validTo}) y #${j + 1} (${b.validFrom} al ${b.validTo}) se superponen en fechas.`,
          };
        }
      }
    }

    return { periods };
  }

  formatShortDateAr(isoStr) {
    if (!isoStr) return '-';
    const parts = String(isoStr).slice(0, 10).split('-');
    if (parts.length !== 3) return isoStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  async previewMassScaleIncrease() {
    const alertBox = document.getElementById('mass-scale-increase-alert');
    const previewSection = document.getElementById('mass-scale-preview-section');
    const previewThead = document.getElementById('mass-scale-preview-thead');
    const previewTbody = document.getElementById('mass-scale-preview-tbody');
    const summaryBadge = document.getElementById('mass-scale-preview-summary');
    const applyBtn = document.getElementById('btn-apply-mass-scale-increase');

    if (alertBox) alertBox.classList.add('d-none');

    const scope = this.collectMassScaleScopeFromForm();
    if (scope.error) {
      if (alertBox) {
        alertBox.textContent = scope.error;
        alertBox.classList.remove('d-none');
      }
      return;
    }

    const collected = this.collectMassScalePeriodsFromForm();
    if (collected.error) {
      if (alertBox) {
        alertBox.textContent = collected.error;
        alertBox.classList.remove('d-none');
      }
      return;
    }

    try {
      const btn = document.getElementById('btn-preview-mass-scale-increase');
      if (btn) btn.disabled = true;

      const reqBody = {
        cctCode: scope.cctCode,
        periods: collected.periods,
      };
      if (Array.isArray(scope.scaleIds)) {
        reqBody.scaleIds = scope.scaleIds;
      }

      const res = await apiRequest('/payroll/salary-scales/mass-increase/preview', {
        method: 'POST',
        body: JSON.stringify(reqBody),
      });

      const data = res.data;
      this.currentScaleMassIncreasePreview = data.preview || [];
      const sortedPeriods = data.periods || collected.periods;

      if (summaryBadge) {
        summaryBadge.textContent = `${sortedPeriods.length} período(s) | ${data.totalScales} nóminas | ${data.totalEmployeesAffected} colaboradores afectados`;
      }

      if (previewThead) {
        const periodColsHtml = sortedPeriods
          .map((p, idx) => {
            const baseText =
              p.increaseType === 'PERCENTAGE'
                ? idx === 0 || p.calculationBase !== 'PREVIOUS_PERIOD'
                  ? ' (s/ actual)'
                  : ' (s/ anterior)'
                : '';
            const labelRule =
              p.increaseType === 'PERCENTAGE'
                ? `+${formatNumber(p.value)}%${baseText}`
                : `+ $ ${formatNumber(p.value)}`;
            return `
              <th class="bg-light py-2 px-3 text-end text-nowrap">
                <div class="text-success fw-bold">Período ${idx + 1}: ${this.formatShortDateAr(p.validFrom)} al ${this.formatShortDateAr(p.validTo)}</div>
                <span class="badge bg-teal-lt text-teal font-monospace mt-1">${labelRule}</span>
              </th>
            `;
          })
          .join('');

        previewThead.innerHTML = `
          <tr>
            <th class="bg-light py-2 px-3">Nómina</th>
            <th class="bg-light py-2 px-3 text-end text-nowrap">Básico Actual</th>
            ${periodColsHtml}
            <th class="bg-light py-2 px-3 text-center text-nowrap">Colaboradores</th>
          </tr>
        `;
      }

      if (previewTbody) {
        const totalCols = 3 + sortedPeriods.length;
        if (this.currentScaleMassIncreasePreview.length === 0) {
          previewTbody.innerHTML = `
            <tr>
              <td colspan="${totalCols}" class="text-center py-4 text-muted">No se encontraron nóminas registradas para actualizar.</td>
            </tr>
          `;
          if (applyBtn) applyBtn.disabled = true;
        } else {
          previewTbody.innerHTML = this.currentScaleMassIncreasePreview
            .map((item) => {
              const pVals = Array.isArray(item.periodValues) ? item.periodValues : [];
              const periodCellsHtml = pVals
                .map(
                  (pv) => `
                  <td class="py-2 px-3 text-end font-monospace text-nowrap">
                    <div class="text-teal fw-bold">$ ${formatNumber(pv.newAmount)}</div>
                    <div class="text-success small">+ $ ${formatNumber(pv.difference)}</div>
                  </td>
                `
                )
                .join('');

              return `
                <tr>
                  <td class="py-2 px-3">
                    <div class="fw-bold text-dark">${escapeHtml(item.name)}</div>
                    <div class="text-muted" style="font-size: 0.72rem;">
                      ${item.cctCode ? `<span class="badge bg-indigo-lt text-indigo font-monospace">${escapeHtml(item.cctCode)}</span>` : '<span class="badge bg-secondary-lt text-muted">General</span>'}
                    </div>
                  </td>
                  <td class="py-2 px-3 text-end font-monospace text-muted text-nowrap">$ ${formatNumber(item.currentAmount)}</td>
                  ${periodCellsHtml}
                  <td class="py-2 px-3 text-center">
                    <span class="badge ${item.assignedEmployeesCount > 0 ? 'bg-blue-lt' : 'bg-secondary-lt'}">
                      ${item.assignedEmployeesCount}
                    </span>
                  </td>
                </tr>
              `;
            })
            .join('');
          if (applyBtn) applyBtn.disabled = false;
        }
      }

      if (previewSection) previewSection.classList.remove('d-none');
    } catch (err) {
      console.error('Error al previsualizar aumento masivo de nóminas:', err);
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al generar la previsualización.';
        alertBox.classList.remove('d-none');
      }
    } finally {
      const btn = document.getElementById('btn-preview-mass-scale-increase');
      if (btn) btn.disabled = false;
    }
  }

  async applyMassScaleIncrease(e) {
    if (e) e.preventDefault();
    const alertBox = document.getElementById('mass-scale-increase-alert');
    const applyBtn = document.getElementById('btn-apply-mass-scale-increase');

    if (alertBox) alertBox.classList.add('d-none');

    const scope = this.collectMassScaleScopeFromForm();
    if (scope.error) {
      if (alertBox) {
        alertBox.textContent = scope.error;
        alertBox.classList.remove('d-none');
      }
      return;
    }

    const collected = this.collectMassScalePeriodsFromForm();
    if (collected.error) {
      if (alertBox) {
        alertBox.textContent = collected.error;
        alertBox.classList.remove('d-none');
      }
      return;
    }

    try {
      if (applyBtn) applyBtn.disabled = true;

      const reqBody = {
        cctCode: scope.cctCode,
        periods: collected.periods,
      };
      if (Array.isArray(scope.scaleIds)) {
        reqBody.scaleIds = scope.scaleIds;
      }

      const res = await apiRequest('/payroll/salary-scales/mass-increase/apply', {
        method: 'POST',
        body: JSON.stringify(reqBody),
      });

      const data = res.data;
      const periodsCount = data.periodsCount || collected.periods.length;
      showToast(
        `¡Aumento masivo aplicado! Se registraron ${periodsCount} período(s) en ${data.totalScalesUpdated} nóminas y se actualizaron ${data.totalEmployeesUpdated} colaboradores.`
      );

      getBootstrapModal(document.getElementById('modal-mass-scale-increase'))?.hide();
      await this.loadPayrollSalaryScales();
      if (this.employees.length > 0) {
        await this.loadEmployees();
      }
    } catch (err) {
      console.error('Error al aplicar aumento masivo de nóminas:', err);
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al aplicar el aumento masivo.';
        alertBox.classList.remove('d-none');
      } else {
        showToast(err.message || 'Error al aplicar aumento', 'danger');
      }
    } finally {
      if (applyBtn) applyBtn.disabled = false;
    }
  }

  // --- Períodos de Liquidación ---

  async loadPayrollPeriods() {
    const spinner = document.getElementById('payroll-periods-spinner');
    if (spinner) spinner.classList.remove('d-none');

    const searchInput = document.getElementById('payroll-period-search');
    const typeFilter = document.getElementById('payroll-period-type-filter');

    const query = new URLSearchParams({
      page: String(this.payrollPeriodsPage),
      limit: String(this.payrollPeriodsPageSize),
    });
    if (searchInput?.value?.trim()) query.append('search', searchInput.value.trim());
    if (typeFilter?.value && typeFilter.value !== 'ALL') {
      query.append('type', typeFilter.value);
      query.append('periodType', typeFilter.value);
    }

    try {
      const res = await apiRequest(`/payroll/periods?${query.toString()}`);
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
        Boolean(searchInput?.value?.trim()) || Boolean(typeFilter?.value && typeFilter.value !== 'ALL');
      if (activeSettlementsBadge && hasActiveFilter) {
        activeSettlementsBadge.textContent = `${totalFiltered} liquidación(es)`;
      }
    } catch (err) {
      showToast(err.message || 'Error al cargar períodos de liquidación', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

}

export function registerSalaryScalesMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(SalaryScalesMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
