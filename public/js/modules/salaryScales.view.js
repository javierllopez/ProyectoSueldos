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

  async loadPayrollSalaryScales() {
    const spinner = document.getElementById('payroll-scales-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      const res = await apiRequest('/payroll/salary-scales');
      this.payrollSalaryScales = res.data || [];
      this.salaryScales = this.payrollSalaryScales;

      const badgeCount = document.getElementById('payroll-badge-scales-count');
      if (badgeCount) badgeCount.textContent = this.payrollSalaryScales.length;

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
    const filtered = this.payrollSalaryScales.filter((s) => {
      if (!searchTerm) return true;
      return (
        (s.name && s.name.toLowerCase().includes(searchTerm)) ||
        (s.code && s.code.toLowerCase().includes(searchTerm)) ||
        (s.description && s.description.toLowerCase().includes(searchTerm))
      );
    });

    const paginationContainer = document.getElementById('payroll-scales-pagination-container');
    const paginationInfo = document.getElementById('payroll-scales-pagination-info');
    const paginationList = document.getElementById('payroll-scales-pagination-list');

    if (filtered.length === 0) {
      if (paginationContainer) paginationContainer.classList.add('d-none');
      if (searchTerm) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-5 text-muted">
              <i class="ti ti-search-off fs-1 d-block mb-2 text-teal"></i>
              No se encontraron nóminas que coincidan con "<strong>${escapeHtml(searchTerm)}</strong>".
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-5 text-muted">
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
        (searchTerm ? ` (filtradas de ${this.payrollSalaryScales.length})` : '');
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

    tbody.innerHTML = paginatedItems
      .map((scale) => {
        const empCount = scale.assignedEmployeesCount ?? scale.employeesCount ?? scale._count?.employees ?? 0;
        return `
          <tr>
            <td>
              <div class="d-flex align-items-center gap-2">
                <div class="fw-bold text-dark">${escapeHtml(scale.name)}</div>
                ${scale.isInternOnly ? '<span class="badge bg-teal-lt text-teal"><i class="ti ti-school me-1"></i>Pasantes Ley 26.427</span>' : ''}
                ${scale.isDirectorOnly ? '<span class="badge bg-purple-lt text-purple"><i class="ti ti-tie me-1"></i>Directores LRT (Mod. 099)</span>' : ''}
              </div>
            </td>
            <td>
              ${scale.code ? `<span class="badge bg-secondary-lt font-monospace">${escapeHtml(scale.code)}</span>` : '<span class="text-muted small">-</span>'}
            </td>
            <td>
              <span class="text-muted small">${escapeHtml(scale.description || '-')}</span>
            </td>
            <td class="text-end font-monospace fw-bold fs-4 text-teal">
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
      })
      .join('');

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

      const payload = { name, code, amount, description, isInternOnly, isDirectorOnly };
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

  // --- Actualización Masiva de Nóminas / Sueldos Básicos ---

  openMassScaleIncreaseModal() {
    const form = document.getElementById('form-mass-scale-increase');
    if (form) form.reset();
    document.getElementById('mass-scale-increase-type').value = 'PERCENTAGE';
    document.getElementById('mass-scale-increase-value').value = '';
    document.getElementById('mass-scale-increase-rounding').value = 'DECIMAL_2';
    document.getElementById('mass-scale-increase-value-label').textContent = 'Porcentaje a Aplicar (%)';
    document.getElementById('mass-scale-increase-symbol').textContent = '%';
    document.getElementById('mass-scale-increase-value').placeholder = 'Ej. 12.5';
    document.getElementById('mass-scale-increase-alert')?.classList.add('d-none');
    document.getElementById('mass-scale-preview-section')?.classList.add('d-none');
    const applyBtn = document.getElementById('btn-apply-mass-scale-increase');
    if (applyBtn) applyBtn.disabled = true;
    this.currentScaleMassIncreasePreview = [];

    getBootstrapModal(document.getElementById('modal-mass-scale-increase'))?.show();
  }

  async previewMassScaleIncrease() {
    const type = document.getElementById('mass-scale-increase-type').value;
    const value = parseFloat(document.getElementById('mass-scale-increase-value').value);
    const rounding = document.getElementById('mass-scale-increase-rounding').value;
    const alertBox = document.getElementById('mass-scale-increase-alert');
    const previewSection = document.getElementById('mass-scale-preview-section');
    const previewTbody = document.getElementById('mass-scale-preview-tbody');
    const summaryBadge = document.getElementById('mass-scale-preview-summary');
    const applyBtn = document.getElementById('btn-apply-mass-scale-increase');

    if (alertBox) alertBox.classList.add('d-none');

    if (isNaN(value) || value <= 0) {
      if (alertBox) {
        alertBox.textContent = 'Por favor ingresa un valor numérico mayor a cero.';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    try {
      const btn = document.getElementById('btn-preview-mass-scale-increase');
      if (btn) btn.disabled = true;

      const res = await apiRequest('/payroll/salary-scales/mass-increase/preview', {
        method: 'POST',
        body: JSON.stringify({
          increaseType: type,
          value,
          rounding,
        }),
      });

      const data = res.data;
      this.currentScaleMassIncreasePreview = data.preview || [];

      if (summaryBadge) {
        summaryBadge.textContent = `${data.totalScales} nóminas | ${data.totalEmployeesAffected} colaboradores afectados`;
      }

      if (previewTbody) {
        if (this.currentScaleMassIncreasePreview.length === 0) {
          previewTbody.innerHTML = `
            <tr>
              <td colspan="5" class="text-center py-4 text-muted">No se encontraron nóminas registradas para actualizar.</td>
            </tr>
          `;
          if (applyBtn) applyBtn.disabled = true;
        } else {
          previewTbody.innerHTML = this.currentScaleMassIncreasePreview
            .map((item) => `
              <tr>
                <td class="fw-bold text-dark">${escapeHtml(item.name)}</td>
                <td class="text-end font-monospace text-muted">$ ${formatNumber(item.currentAmount)}</td>
                <td class="text-end font-monospace text-teal fw-bold">$ ${formatNumber(item.newAmount)}</td>
                <td class="text-end font-monospace text-success">+ $ ${formatNumber(item.difference)}</td>
                <td class="text-center">
                  <span class="badge ${item.assignedEmployeesCount > 0 ? 'bg-blue-lt' : 'bg-secondary-lt'}">
                    ${item.assignedEmployeesCount}
                  </span>
                </td>
              </tr>
            `)
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
    const type = document.getElementById('mass-scale-increase-type').value;
    const value = parseFloat(document.getElementById('mass-scale-increase-value').value);
    const rounding = document.getElementById('mass-scale-increase-rounding').value;
    const alertBox = document.getElementById('mass-scale-increase-alert');
    const applyBtn = document.getElementById('btn-apply-mass-scale-increase');

    if (alertBox) alertBox.classList.add('d-none');

    if (isNaN(value) || value <= 0) {
      if (alertBox) {
        alertBox.textContent = 'Por favor ingresa un valor numérico mayor a cero.';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    try {
      if (applyBtn) applyBtn.disabled = true;

      const res = await apiRequest('/payroll/salary-scales/mass-increase/apply', {
        method: 'POST',
        body: JSON.stringify({
          increaseType: type,
          value,
          rounding,
        }),
      });

      const data = res.data;
      showToast(`¡Aumento masivo aplicado! Se actualizaron ${data.totalScalesUpdated} nóminas y ${data.totalEmployeesUpdated} colaboradores.`);

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
    if (typeFilter?.value && typeFilter.value !== 'ALL') query.append('type', typeFilter.value);

    try {
      const res = await apiRequest(`/payroll/periods?${query.toString()}`);
      this.payrollPeriods = res.data || [];
      const badge = document.getElementById('payroll-badge-periods-count');
      if (badge) badge.textContent = res.meta?.total || this.payrollPeriods.length;

      this.renderPayrollPeriodsTable(this.payrollPeriods);
      this.renderPayrollPeriodsPagination(res.meta || { total: this.payrollPeriods.length, page: 1, totalPages: 1 });
      this.syncPayrollPeriodSelectors();
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
