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
  renderDepartmentsTable() {
    const tbody = document.getElementById('departments-table-body');
    if (!tbody) return;

    const searchTerm = document.getElementById('department-search-input')?.value?.toLowerCase().trim() || '';
    const filtered = this.departments.filter((d) => {
      if (!searchTerm) return true;
      return (
        (d.name && d.name.toLowerCase().includes(searchTerm)) ||
        (d.code && d.code.toLowerCase().includes(searchTerm))
      );
    });

    const countLabel = document.getElementById('departments-count-label');
    if (countLabel) countLabel.textContent = this.departments.length;

    const paginationContainer = document.getElementById('departments-pagination-container');
    const paginationInfo = document.getElementById('departments-pagination-info');
    const paginationList = document.getElementById('departments-pagination-list');

    if (filtered.length === 0) {
      if (paginationContainer) paginationContainer.classList.add('d-none');
      if (searchTerm) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-5 text-muted">
              <i class="ti ti-search-off fs-1 d-block mb-2 text-teal"></i>
              No se encontraron sectores que coincidan con "<strong>${escapeHtml(searchTerm)}</strong>".
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-5 text-muted">
              <i class="ti ti-sitemap fs-1 d-block mb-2 text-teal opacity-50"></i>
              <div class="fw-bold mb-1">No hay sectores registrados en la empresa</div>
              <small class="d-block mb-3">Comienza creando el primer sector de la estructura funcional.</small>
              <button class="btn btn-sm btn-personnel" onclick="document.getElementById('btn-open-new-department-modal').click()">
                <i class="ti ti-plus me-1"></i> Crear Primer Sector
              </button>
            </td>
          </tr>
        `;
      }
      return;
    }

    // Paginación para eliminar scroll y visualizar datos de un vistazo
    const pageSize = this.departmentsPageSize || 5;
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (this.departmentsPage > totalPages) this.departmentsPage = totalPages;
    if (this.departmentsPage < 1) this.departmentsPage = 1;

    const startIndex = (this.departmentsPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filtered.length);
    const paginatedItems = filtered.slice(startIndex, endIndex);

    if (paginationContainer) paginationContainer.classList.remove('d-none');
    if (paginationInfo) {
      paginationInfo.innerHTML = `Mostrando <strong>${startIndex + 1}</strong> a <strong>${endIndex}</strong> de <strong>${filtered.length}</strong> sectores` +
        (searchTerm ? ` (filtrados de ${this.departments.length})` : '');
    }

    if (paginationList) {
      this.renderPaginationControls(paginationList, this.departmentsPage, totalPages, (newPage) => {
        this.departmentsPage = newPage;
        this.renderDepartmentsTable();
      });
    }

    tbody.innerHTML = paginatedItems
      .map((d) => {
        const codeBadge = d.code
          ? `<span class="badge bg-teal-lt text-teal font-monospace px-2 py-1">${escapeHtml(d.code)}</span>`
          : `<span class="badge bg-secondary-lt text-muted font-monospace px-2 py-1">S/C</span>`;

        const empBadge =
          (d.employeeCount || 0) > 0
            ? `<button class="btn btn-sm btn-outline-teal btn-filter-dept-employees py-0 px-2" data-id="${d.id}" title="Ver empleados de este sector">
                <i class="ti ti-users me-1"></i><strong>${d.employeeCount}</strong> ${d.employeeCount === 1 ? 'empleado' : 'empleados'}
               </button>`
            : `<span class="badge bg-light text-muted border"><i class="ti ti-user-x me-1"></i>0 empleados</span>`;

        return `
          <tr>
            <td>${codeBadge}</td>
            <td>
              <div class="d-flex align-items-center">
                <span class="avatar avatar-xs bg-teal-lt text-teal rounded me-2">
                  <i class="ti ti-sitemap"></i>
                </span>
                <span class="fw-bold text-dark">${escapeHtml(d.name)}</span>
              </div>
            </td>
            <td class="text-center">${empBadge}</td>
            <td class="text-end">
              <div class="d-inline-flex gap-1">
                <button class="btn btn-sm btn-outline-primary btn-edit-dept" data-id="${d.id}" title="Editar Sector">
                  <i class="ti ti-edit me-1"></i>Editar
                </button>
                <button class="btn btn-sm btn-outline-danger btn-delete-dept" data-id="${d.id}" data-name="${escapeHtml(d.name)}" data-count="${d.employeeCount || 0}" title="Eliminar Sector">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-dept').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = this.departments.find((x) => x.id === btn.dataset.id);
        if (d) this.openEditDepartmentModal(d);
      });
    });

    tbody.querySelectorAll('.btn-delete-dept').forEach((btn) => {
      btn.addEventListener('click', () => {
        const count = parseInt(btn.dataset.count, 10) || 0;
        this.deleteDepartment(btn.dataset.id, btn.dataset.name, count);
      });
    });

    tbody.querySelectorAll('.btn-filter-dept-employees').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const deptId = btn.dataset.id;
        const deptFilter = document.getElementById('employee-filter-department');
        if (deptFilter) {
          deptFilter.value = deptId;
        }
        this.switchPersonnelPane('#pane-personnel-employees');
      });
    });
  }

  renderJobPositionsTable() {
    const tbody = document.getElementById('job-positions-table-body');
    if (!tbody) return;

    const searchTerm = document.getElementById('job-position-search-input')?.value?.toLowerCase().trim() || '';
    const filtered = this.jobPositions.filter((p) => {
      if (!searchTerm) return true;
      return (
        (p.name && p.name.toLowerCase().includes(searchTerm)) ||
        (p.code && p.code.toLowerCase().includes(searchTerm)) ||
        (p.cct?.name && p.cct.name.toLowerCase().includes(searchTerm)) ||
        (p.cct?.code && p.cct.code.toLowerCase().includes(searchTerm)) ||
        (p.category?.name && p.category.name.toLowerCase().includes(searchTerm)) ||
        (p.arcaPosition?.name && p.arcaPosition.name.toLowerCase().includes(searchTerm)) ||
        (p.serviceType?.name && p.serviceType.name.toLowerCase().includes(searchTerm))
      );
    });

    const countLabel = document.getElementById('job-positions-count-label');
    if (countLabel) countLabel.textContent = this.jobPositions.length;

    const paginationContainer = document.getElementById('job-positions-pagination-container');
    const paginationInfo = document.getElementById('job-positions-pagination-info');
    const paginationList = document.getElementById('job-positions-pagination-list');

    if (filtered.length === 0) {
      if (paginationContainer) paginationContainer.classList.add('d-none');
      if (searchTerm) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-5 text-muted">
              <i class="ti ti-search-off fs-1 d-block mb-2 text-teal"></i>
              No se encontraron puestos que coincidan con "<strong>${escapeHtml(searchTerm)}</strong>".
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-5 text-muted">
              <i class="ti ti-briefcase fs-1 d-block mb-2 text-teal opacity-50"></i>
              <div class="fw-bold mb-1">No hay puestos de trabajo registrados en la empresa</div>
              <small class="d-block mb-3">Define los cargos y roles operativos con su encuadre ARCA para asignarlos a los empleados.</small>
              <button class="btn btn-sm btn-personnel" onclick="document.getElementById('btn-open-new-job-position-modal').click()">
                <i class="ti ti-plus me-1"></i> Crear Primer Puesto
              </button>
            </td>
          </tr>
        `;
      }
      return;
    }

    const pageSize = this.jobPositionsPageSize || 5;
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (this.jobPositionsPage > totalPages) this.jobPositionsPage = totalPages;
    if (this.jobPositionsPage < 1) this.jobPositionsPage = 1;

    const startIndex = (this.jobPositionsPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filtered.length);
    const paginatedItems = filtered.slice(startIndex, endIndex);

    if (paginationContainer) paginationContainer.classList.remove('d-none');
    if (paginationInfo) {
      paginationInfo.innerHTML = `Mostrando <strong>${startIndex + 1}</strong> a <strong>${endIndex}</strong> de <strong>${filtered.length}</strong> puestos` +
        (searchTerm ? ` (filtrados de ${this.jobPositions.length})` : '');
    }

    if (paginationList) {
      this.renderPaginationControls(paginationList, this.jobPositionsPage, totalPages, (newPage) => {
        this.jobPositionsPage = newPage;
        this.renderJobPositionsTable();
      });
    }

    tbody.innerHTML = paginatedItems
      .map((p) => {
        const codeBadge = p.code
          ? `<span class="badge bg-teal-lt text-teal font-monospace px-2 py-1">${escapeHtml(p.code)}</span>`
          : `<span class="badge bg-secondary-lt text-muted font-monospace px-2 py-1">S/C</span>`;

        const actInfo = getArcaActivityInfo(p.activityCode || '049');
        const actBadge = `<span class="badge bg-green-lt text-green font-monospace px-2 py-1 ms-1" title="Actividad ARCA T03: ${escapeHtml(actInfo.name)}">T03: ${escapeHtml(actInfo.code)}</span>`;

        const cctBadge = p.cct
          ? `<div class="d-flex align-items-center gap-2">
               <span class="badge bg-indigo-lt text-indigo py-1 px-2 font-monospace"><i class="ti ti-file-certificate me-1"></i>${escapeHtml(p.cct.code)}</span>
               <span class="small text-muted text-truncate" style="max-width: 450px;" title="${escapeHtml(p.cct.name)}">${escapeHtml(p.cct.name)}</span>
             </div>`
          : `<span class="badge bg-light text-muted border font-monospace">S/CCT</span>`;

        return `
          <tr>
            <td>
              <div class="d-flex align-items-center">
                ${codeBadge}
                ${actBadge}
              </div>
            </td>
            <td>
              <div class="d-flex align-items-center">
                <span class="avatar avatar-xs bg-teal-lt text-teal rounded me-2">
                  <i class="ti ti-briefcase"></i>
                </span>
                <span class="fw-bold text-dark">${escapeHtml(p.name)}</span>
              </div>
            </td>
            <td>${cctBadge}</td>
            <td class="text-end">
              <div class="d-inline-flex gap-1">
                <button class="btn btn-sm btn-outline-primary btn-edit-pos" data-id="${p.id}" title="Editar Puesto">
                  <i class="ti ti-edit me-1"></i>Editar
                </button>
                <button class="btn btn-sm btn-outline-danger btn-delete-pos" data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-count="${p.employeeCount || 0}" title="Eliminar Puesto">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-pos').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = this.jobPositions.find((x) => x.id === btn.dataset.id);
        if (p) this.openEditJobPositionModal(p);
      });
    });

    tbody.querySelectorAll('.btn-delete-pos').forEach((btn) => {
      btn.addEventListener('click', () => {
        const count = parseInt(btn.dataset.count, 10) || 0;
        this.deleteJobPosition(btn.dataset.id, btn.dataset.name, count);
      });
    });

    tbody.querySelectorAll('.btn-filter-job-employees').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchPersonnelPane('#pane-personnel-employees');
      });
    });
  }

  renderWorkShiftsTable() {
    const tbody = document.getElementById('work-shifts-table-body');
    if (!tbody) return;

    const searchTerm = document.getElementById('work-shift-search-input')?.value?.toLowerCase().trim() || '';
    const filtered = this.workShifts.filter((s) => {
      if (!searchTerm) return true;
      return (
        (s.name && s.name.toLowerCase().includes(searchTerm)) ||
        (s.code && s.code.toLowerCase().includes(searchTerm)) ||
        (s.description && s.description.toLowerCase().includes(searchTerm)) ||
        (s.cycleType && s.cycleType.toLowerCase().includes(searchTerm))
      );
    });

    const countLabel = document.getElementById('work-shifts-count-label');
    if (countLabel) countLabel.textContent = this.workShifts.length;

    const paginationContainer = document.getElementById('work-shifts-pagination-container');
    const paginationInfo = document.getElementById('work-shifts-pagination-info');
    const paginationList = document.getElementById('work-shifts-pagination-list');

    if (filtered.length === 0) {
      if (paginationContainer) paginationContainer.classList.add('d-none');
      if (searchTerm) {
        tbody.innerHTML = `
          <tr>
            <td colspan="10" class="text-center py-5 text-muted">
              <i class="ti ti-search-off fs-1 d-block mb-2 text-teal"></i>
              No se encontraron jornadas que coincidan con "<strong>${escapeHtml(searchTerm)}</strong>".
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="10" class="text-center py-5 text-muted">
              <i class="ti ti-clock-play fs-1 d-block mb-2 text-teal opacity-50"></i>
              <div class="fw-bold mb-1">No hay jornadas de trabajo registradas en la empresa</div>
              <small class="d-block mb-3">Define los tipos de jornada (normales, nocturnas, franqueros o rotativas) para asociarlas a los colaboradores y utilizarlas en las fórmulas de nómina.</small>
              <button class="btn btn-sm btn-personnel" onclick="document.getElementById('btn-open-new-work-shift-modal').click()">
                <i class="ti ti-plus me-1"></i> Crear Primera Jornada
              </button>
            </td>
          </tr>
        `;
      }
      return;
    }

    const pageSize = this.workShiftsPageSize || 5;
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (this.workShiftsPage > totalPages) this.workShiftsPage = totalPages;
    if (this.workShiftsPage < 1) this.workShiftsPage = 1;

    const startIndex = (this.workShiftsPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filtered.length);
    const paginatedItems = filtered.slice(startIndex, endIndex);

    if (paginationContainer) paginationContainer.classList.remove('d-none');
    if (paginationInfo) {
      paginationInfo.innerHTML = `Mostrando <strong>${startIndex + 1}</strong> a <strong>${endIndex}</strong> de <strong>${filtered.length}</strong> jornadas` +
        (searchTerm ? ` (filtradas de ${this.workShifts.length})` : '');
    }

    if (paginationList) {
      this.renderPaginationControls(paginationList, this.workShiftsPage, totalPages, (newPage) => {
        this.workShiftsPage = newPage;
        this.renderWorkShiftsTable();
      });
    }

    tbody.innerHTML = paginatedItems
      .map((s) => {
        const codeBadge = s.code
          ? `<span class="badge bg-teal-lt text-teal font-monospace px-2 py-1">${escapeHtml(s.code)}</span>`
          : `<span class="badge bg-secondary-lt text-muted font-monospace px-2 py-1">S/C</span>`;

        let cycleBadge = '<span class="badge bg-blue-lt text-blue">Semanal</span>';
        if (s.cycleType === 'ROTATIVO_DIAS') {
          cycleBadge = `<span class="badge bg-purple-lt text-purple"><i class="ti ti-repeat me-1"></i>Rotativo (${s.cycleLengthDays || 6}d)</span>`;
        } else if (s.cycleType === 'FRANQUERO') {
          cycleBadge = '<span class="badge bg-azure-lt text-azure"><i class="ti ti-calendar-event me-1"></i>Franquero</span>';
        }

        const empCount = s.employeeCount ?? s.assignedEmployeesCount ?? 0;
        const empBadge =
          empCount > 0
            ? `<button class="btn btn-sm btn-outline-teal btn-filter-shift-employees py-0 px-2" data-id="${s.id}" title="Ver colaboradores con esta jornada">
                <i class="ti ti-users me-1"></i><strong>${empCount}</strong> ${empCount === 1 ? 'empleado' : 'empleados'}
               </button>`
            : `<span class="badge bg-light text-muted border"><i class="ti ti-user-x me-1"></i>0 empleados</span>`;

        const descHtml = s.description
          ? `<div class="small text-muted text-truncate" style="max-width: 320px;" title="${escapeHtml(s.description)}">${escapeHtml(s.description)}</div>`
          : '';

        return `
          <tr>
            <td>${codeBadge}</td>
            <td>
              <div class="d-flex align-items-center">
                <span class="avatar avatar-xs bg-blue-lt text-blue rounded me-2">
                  <i class="ti ti-clock"></i>
                </span>
                <div>
                  <div class="fw-bold text-dark">${escapeHtml(s.name)}</div>
                  ${descHtml}
                </div>
              </div>
            </td>
            <td>${cycleBadge}</td>
            <td class="text-center font-monospace fw-bold text-teal">${Number(s.percentage ?? 100).toFixed(2)}%</td>
            <td class="text-center font-monospace fw-bold text-dark">${Number(s.dailyHours).toFixed(2)} hs</td>
            <td class="text-center font-monospace fw-bold text-dark">${Number(s.weeklyHours).toFixed(2)} hs</td>
            <td class="text-center font-monospace fw-bold text-dark">${Number(s.monthlyHours).toFixed(2)} hs</td>
            <td class="text-center font-monospace text-muted">${Number(s.monthlyDays).toFixed(2)} d</td>
            <td class="text-center">${empBadge}</td>
            <td class="text-end">
              <div class="d-inline-flex gap-1">
                <button class="btn btn-sm btn-outline-primary btn-edit-shift" data-id="${s.id}" title="Editar Jornada">
                  <i class="ti ti-edit me-1"></i>Editar
                </button>
                <button class="btn btn-sm btn-outline-danger btn-delete-shift" data-id="${s.id}" data-name="${escapeHtml(s.name)}" data-count="${empCount}" title="Eliminar Jornada">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-shift').forEach((btn) => {
      btn.addEventListener('click', () => {
        const s = this.workShifts.find((x) => x.id === btn.dataset.id);
        if (s) this.openEditWorkShiftModal(s);
      });
    });

    tbody.querySelectorAll('.btn-delete-shift').forEach((btn) => {
      btn.addEventListener('click', () => {
        const count = parseInt(btn.dataset.count, 10) || 0;
        this.deleteWorkShift(btn.dataset.id, btn.dataset.name, count);
      });
    });

    tbody.querySelectorAll('.btn-filter-shift-employees').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchPersonnelPane('#pane-personnel-employees');
      });
    });
  }


  openNewDepartmentModal() {
    document.getElementById('form-department').reset();
    document.getElementById('department-form-id').value = '';
    document.getElementById('modal-department-form-title').textContent = 'Nuevo Sector';
    document.getElementById('department-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-department');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Sector';
    getBootstrapModal(document.getElementById('modal-department-form'))?.show();
  }

  openEditDepartmentModal(dept) {
    document.getElementById('department-form-id').value = dept.id;
    document.getElementById('department-input-name').value = dept.name;
    document.getElementById('department-input-code').value = dept.code || '';
    document.getElementById('modal-department-form-title').textContent = `Editar Sector: ${dept.name}`;
    document.getElementById('department-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-department');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Actualizar Sector';
    getBootstrapModal(document.getElementById('modal-department-form'))?.show();
  }

  async deleteDepartment(id, name, employeeCount = 0) {
    if (employeeCount > 0) {
      this.confirmDeleteAction({
        title: 'Sector con Empleados Asignados',
        message: `No es posible eliminar el sector <strong>"${escapeHtml(name)}"</strong> porque tiene <strong>${employeeCount}</strong> empleado(s) activo(s) asignado(s).`,
        warning: 'Para dar de baja este sector, primero debes reasignar a sus colaboradores a otro sector.',
        confirmText: 'Entendido',
        onConfirm: async () => {},
      });
      return;
    }

    this.confirmDeleteAction({
      title: 'Eliminar Sector',
      message: `¿Estás seguro de que deseas eliminar el sector <strong>"${escapeHtml(name)}"</strong> de la estructura organizacional?`,
      onConfirm: async () => {
        await apiRequest(`/departments/${id}`, { method: 'DELETE' });
        showToast('Sector eliminado correctamente');
        await this.loadPersonnelAuxiliaryData();
      },
    });
  }

  // --- Importación de Sectores desde Excel ---

  populateCategorySelector(selectedCctCode = '', preserveCurrentVal = true) {
    // Mantener compatibilidad: inicializa el buscador y respeta el valor actual si existe
    this.setupCategoryInteractiveSearch();
    const catInput = document.getElementById('job-position-input-category');
    if (!preserveCurrentVal && catInput) {
      this.clearJobPositionCategorySelection();
    }
  }

  setupCategoryInteractiveSearch() {
    const searchInput = document.getElementById('job-position-category-search-input');
    const dropdown = document.getElementById('job-position-category-results-dropdown');
    const changeBtn = document.getElementById('btn-change-category');
    if (!searchInput || searchInput.dataset.setupDone) return;
    searchInput.dataset.setupDone = 'true';

    const renderResults = async (query = '') => {
      const q = query.trim();
      let matches = [];
      const currentCct = document.getElementById('job-position-input-cct')?.value || '';

      if (!q) {
        if (this.currentCctCategories && this.currentCctCategories.length > 0) {
          matches = this.currentCctCategories.slice(0, 30);
        } else if (currentCct) {
          try {
            const res = await apiRequest(`/arca-categories?cctCode=${encodeURIComponent(currentCct)}&limit=30`);
            matches = res.data || [];
          } catch (err) {
            matches = [];
          }
        } else {
          matches = (this.arcaCategories || []).slice(0, 30);
        }
      } else {
        try {
          const cctParam = currentCct ? `&cctCode=${encodeURIComponent(currentCct)}` : '';
          const res = await apiRequest(`/arca-categories?search=${encodeURIComponent(q)}${cctParam}&limit=30`);
          matches = res.data || [];
        } catch (err) {
          const lq = q.toLowerCase();
          const base = this.currentCctCategories || this.arcaCategories || [];
          matches = base.filter(
            (c) => c.code.toLowerCase().includes(lq) || (c.name && c.name.toLowerCase().includes(lq))
          ).slice(0, 30);
        }
      }

      if (matches.length === 0) {
        dropdown.innerHTML = `
          <div class="p-3 text-center text-muted small">
            <i class="ti ti-search-off fs-2 d-block mb-1 text-secondary opacity-50"></i>
            No se encontró ninguna categoría para "<strong>${escapeHtml(query)}</strong>"${currentCct ? ` admitida en el convenio ${escapeHtml(currentCct)}` : ''}.
          </div>
        `;
        dropdown.style.display = 'block';
        return;
      }

      let html = `<div class="dropdown-header text-uppercase text-muted py-2 bg-light border-bottom" style="font-size: 0.72rem;">
        Categorías encontradas: ${matches.length} ${currentCct ? `(Convenio ${escapeHtml(currentCct)})` : ''}
      </div>`;

      html += matches.map((c) => `
        <button type="button" class="dropdown-item d-flex align-items-center justify-content-between py-2 border-bottom border-light btn-select-cat-option" data-code="${escapeHtml(c.code)}">
          <div class="text-truncate me-2 text-start">
            <div class="d-flex align-items-center gap-2 mb-1">
              <span class="badge bg-teal-lt text-teal font-monospace fw-bold px-2 py-0" style="font-size: 0.75rem;">${escapeHtml(c.code)}</span>
              <strong class="text-dark small text-truncate">${escapeHtml(c.name)}</strong>
            </div>
            <div class="text-muted text-truncate" style="font-size: 0.75rem;">${escapeHtml(c.cct || c.description || 'Categoría oficial ARCA')}</div>
          </div>
          <i class="ti ti-chevron-right text-muted fs-3 opacity-50"></i>
        </button>
      `).join('');

      dropdown.innerHTML = html;
      dropdown.style.display = 'block';

      dropdown.querySelectorAll('.btn-select-cat-option').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const code = btn.dataset.code;
          const found = matches.find((x) => x.code === code) || (this.currentCctCategories || []).find((x) => x.code === code) || (this.arcaCategories || []).find((x) => x.code === code);
          this.setJobPositionCategorySelection(code, found);
          dropdown.style.display = 'none';
        });
      });
    };

    let debounceTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        renderResults(searchInput.value);
      }, 150);
    });

    searchInput.addEventListener('focus', () => {
      renderResults(searchInput.value);
    });

    document.addEventListener('click', (e) => {
      const wrapper = document.getElementById('job-position-category-search-wrapper');
      if (wrapper && !wrapper.contains(e.target)) {
        if (dropdown) dropdown.style.display = 'none';
      }
    });

    if (changeBtn) {
      changeBtn.addEventListener('click', () => {
        this.clearJobPositionCategorySelection();
        searchInput.focus();
        renderResults('');
      });
    }
  }

  async setJobPositionCategorySelection(code, catObj = null) {
    const hiddenInput = document.getElementById('job-position-input-category');
    const selectedBox = document.getElementById('job-position-category-selected-box');
    const searchWrapper = document.getElementById('job-position-category-search-wrapper');
    const searchInput = document.getElementById('job-position-category-search-input');
    const dropdown = document.getElementById('job-position-category-results-dropdown');

    if (!hiddenInput) return;
    hiddenInput.value = code || '';

    if (!code) {
      this.clearJobPositionCategorySelection();
      return;
    }

    let cat = catObj || (this.currentCctCategories || []).find((c) => c.code === code) || (this.arcaCategories || []).find((c) => c.code === code);
    if (!cat) {
      try {
        const res = await apiRequest(`/arca-categories?search=${encodeURIComponent(code)}&limit=1`);
        cat = (res.data || []).find((c) => c.code === code);
      } catch (err) {}
    }
    if (!cat) cat = { code, name: code, description: '' };

    const codeBadge = document.getElementById('job-position-category-selected-code');
    const nameEl = document.getElementById('job-position-category-selected-name');
    const descEl = document.getElementById('job-position-category-selected-desc');

    if (codeBadge) codeBadge.textContent = cat.code;
    if (nameEl) nameEl.textContent = cat.name || cat.code;
    if (descEl) descEl.textContent = cat.cct || (cat.description ? cat.description.slice(0, 100) : 'Categoría oficial ARCA');

    if (selectedBox) selectedBox.classList.remove('d-none');
    if (searchWrapper) searchWrapper.classList.add('d-none');
    if (searchInput) searchInput.value = '';
    if (dropdown) dropdown.style.display = 'none';
  }

  clearJobPositionCategorySelection() {
    const hiddenInput = document.getElementById('job-position-input-category');
    const selectedBox = document.getElementById('job-position-category-selected-box');
    const searchWrapper = document.getElementById('job-position-category-search-wrapper');
    const searchInput = document.getElementById('job-position-category-search-input');
    const dropdown = document.getElementById('job-position-category-results-dropdown');

    if (hiddenInput) hiddenInput.value = '';
    if (selectedBox) selectedBox.classList.add('d-none');
    if (searchWrapper) searchWrapper.classList.remove('d-none');
    if (searchInput) searchInput.value = '';
    if (dropdown) dropdown.style.display = 'none';
  }

  // --- Manejo Ágil de Selección de CCT ---
  setupCctInteractiveSearch() {
    const searchInput = document.getElementById('job-position-cct-search-input');
    const dropdown = document.getElementById('job-position-cct-results-dropdown');
    const changeBtn = document.getElementById('btn-change-cct');
    if (!searchInput || searchInput.dataset.setupDone) return;
    searchInput.dataset.setupDone = 'true';

    // Lista de convenios más frecuentes para acceso rápido
    const topFrequentCodes = ['FC', '0130/75', '0076/75', '0389/04', '0260/75', '0122/75', '0040/89', '0244/94', '0544/08', '0652/12'];

    const renderResults = (query = '') => {
      const q = query.trim().toLowerCase();
      let matches = [];

      if (!q) {
        // Mostrar frecuentes si no hay texto ingresado
        matches = (this.arcaCcts || []).filter((c) => topFrequentCodes.includes(c.code));
      } else {
        // Filtrar en memoria entre los 2670 convenios (instantáneo)
        const normalizedQ = q.replace(/^0+/, '');
        matches = (this.arcaCcts || []).filter((c) => {
          return (
            c.code.toLowerCase().includes(q) ||
            c.code.replace(/^0+/, '').toLowerCase().includes(normalizedQ) ||
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.sector && c.sector.toLowerCase().includes(q)) ||
            (c.description && c.description.toLowerCase().includes(q))
          );
        }).slice(0, 30);
      }

      if (matches.length === 0) {
        dropdown.innerHTML = `
          <div class="p-3 text-center text-muted small">
            <i class="ti ti-search-off fs-2 d-block mb-1 text-secondary opacity-50"></i>
            No se encontró ningún convenio para "<strong>${escapeHtml(query)}</strong>".
          </div>
        `;
        dropdown.style.display = 'block';
        return;
      }

      let html = '';
      if (!q) {
        html += `<div class="dropdown-header text-uppercase text-primary fw-bold py-2 bg-light border-bottom" style="font-size: 0.72rem;">
          <i class="ti ti-star me-1 text-warning"></i> Convenios Frecuentes / Acceso Rápido
        </div>`;
      } else {
        html += `<div class="dropdown-header text-uppercase text-muted py-2 bg-light border-bottom" style="font-size: 0.72rem;">
          Resultados encontrados: ${matches.length} ${matches.length === 30 ? '(mostrando primeros 30)' : ''}
        </div>`;
      }

      html += matches.map((c) => `
        <button type="button" class="dropdown-item d-flex align-items-center justify-content-between py-2 border-bottom border-light btn-select-cct-option" data-code="${escapeHtml(c.code)}">
          <div class="text-truncate me-2 text-start">
            <div class="d-flex align-items-center gap-2 mb-1">
              <span class="badge bg-indigo-lt text-indigo font-monospace fw-bold px-2 py-0" style="font-size: 0.75rem;">${escapeHtml(c.code)}</span>
              <strong class="text-dark small text-truncate">${escapeHtml(c.sector || c.name.split('-')[0].trim())}</strong>
            </div>
            <div class="text-muted text-truncate" style="font-size: 0.75rem;">${escapeHtml(c.name)}</div>
          </div>
          <i class="ti ti-chevron-right text-muted fs-3 opacity-50"></i>
        </button>
      `).join('');

      dropdown.innerHTML = html;
      dropdown.style.display = 'block';

      dropdown.querySelectorAll('.btn-select-cct-option').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const code = btn.dataset.code;
          const found = (this.arcaCcts || []).find((x) => x.code === code);
          dropdown.style.display = 'none';
          await this.setJobPositionCctSelection(code, found, false);
        });
      });
    };

    let debounceTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        renderResults(searchInput.value);
      }, 80);
    });

    searchInput.addEventListener('focus', () => {
      renderResults(searchInput.value);
    });

    // Cerrar dropdown al hacer clic fuera del wrapper
    document.addEventListener('click', (e) => {
      const wrapper = document.getElementById('job-position-cct-search-wrapper');
      if (wrapper && !wrapper.contains(e.target)) {
        if (dropdown) dropdown.style.display = 'none';
      }
    });

    if (changeBtn) {
      changeBtn.addEventListener('click', async () => {
        await this.clearJobPositionCctSelection();
        searchInput.focus();
        renderResults('');
      });
    }
  }

  async setJobPositionCctSelection(code, cctObj = null, preserveCurrentSelections = false) {
    const hiddenInput = document.getElementById('job-position-input-cct');
    const selectedBox = document.getElementById('job-position-cct-selected-box');
    const searchWrapper = document.getElementById('job-position-cct-search-wrapper');
    const searchInput = document.getElementById('job-position-cct-search-input');
    const dropdown = document.getElementById('job-position-cct-results-dropdown');

    if (!hiddenInput) return;
    hiddenInput.value = code || '';

    if (!code) {
      await this.clearJobPositionCctSelection();
      return;
    }

    const cct = cctObj || (this.arcaCcts || []).find((c) => c.code === code) || { code, name: code, sector: '' };

    const codeBadge = document.getElementById('job-position-cct-selected-code');
    const nameEl = document.getElementById('job-position-cct-selected-name');
    const sectorEl = document.getElementById('job-position-cct-selected-sector');

    if (codeBadge) codeBadge.textContent = cct.code;
    if (nameEl) nameEl.textContent = cct.name || cct.code;
    if (sectorEl) {
      sectorEl.textContent = cct.sector ? `Sector: ${cct.sector}` : (cct.description ? cct.description.slice(0, 100) : 'Convenio colectivo registrado ante ARCA');
    }

    if (selectedBox) selectedBox.classList.remove('d-none');
    if (searchWrapper) searchWrapper.classList.add('d-none');
    if (searchInput) searchInput.value = '';
    if (dropdown) dropdown.style.display = 'none';

    // Disparar filtrado en cascada reactivo de Categorías y Puestos
    await this.onJobPositionCctChanged(code, preserveCurrentSelections);
  }

  async clearJobPositionCctSelection() {
    const hiddenInput = document.getElementById('job-position-input-cct');
    const selectedBox = document.getElementById('job-position-cct-selected-box');
    const searchWrapper = document.getElementById('job-position-cct-search-wrapper');
    const searchInput = document.getElementById('job-position-cct-search-input');
    const dropdown = document.getElementById('job-position-cct-results-dropdown');

    if (hiddenInput) hiddenInput.value = '';
    if (selectedBox) selectedBox.classList.add('d-none');
    if (searchWrapper) searchWrapper.classList.remove('d-none');
    if (searchInput) searchInput.value = '';
    if (dropdown) dropdown.style.display = 'none';

    await this.onJobPositionCctChanged('');
  }

  /**
   * Actualiza dinámicamente las categorías y ocupaciones admitidas por el CCT seleccionado.
   * @param {string} cctCode - Código del CCT (ej. '0130/75', 'FC').
   * @param {boolean} preserveCurrentSelections - Si es true (e.g. al abrir modal de edición), no limpia las selecciones actuales si son válidas.
   */
  async onJobPositionCctChanged(cctCode, preserveCurrentSelections = false) {
    const catBadge = document.getElementById('job-position-category-count-badge');
    const catHint = document.getElementById('job-position-category-hint');
    const posBadge = document.getElementById('job-position-arca-pos-count-badge');
    const posHint = document.getElementById('job-position-arca-pos-hint');
    const posSelect = document.getElementById('job-position-input-arca-position');

    if (!cctCode) {
      this.currentCctCategories = null;
      this.currentCctPositions = null;
      if (catBadge) catBadge.textContent = '46.435 Categorías';
      if (catHint) catHint.textContent = 'Buscador oficial ARCA por código o denominación profesional.';
      if (posBadge) posBadge.textContent = `${this.arcaPositions?.length || 430} Ocupaciones`;
      if (posHint) posHint.textContent = 'Nomenclador de ocupaciones de Mi Simplificación Registral.';
      this.renderJobPositionArcaSelect(this.arcaPositions || []);
      return;
    }

    if (catBadge) catBadge.innerHTML = '<span class="spinner-border spinner-border-sm" style="width: 0.6rem; height: 0.6rem;"></span> Filtrando...';
    if (posBadge) posBadge.innerHTML = '<span class="spinner-border spinner-border-sm" style="width: 0.6rem; height: 0.6rem;"></span> Filtrando...';

    try {
      const [catRes, posRes] = await Promise.all([
        apiRequest(`/arca-categories?cctCode=${encodeURIComponent(cctCode)}&limit=500`),
        apiRequest(`/arca-positions?cctCode=${encodeURIComponent(cctCode)}`),
      ]);

      const categories = catRes.data || [];
      const positions = posRes.data || [];

      this.currentCctCategories = categories;
      this.currentCctPositions = positions;

      // 1. Actualizar feedback visual en Categorías
      if (catBadge) {
        catBadge.textContent = `${categories.length} Categorías (${cctCode})`;
      }
      if (catHint) {
        catHint.innerHTML = `<span class="text-teal fw-bold"><i class="ti ti-filter me-1"></i>Filtrado por Convenio ${escapeHtml(cctCode)}</span>: ${categories.length} categoría(s) admitida(s).`;
      }

      // Si la categoría seleccionada no pertenece al convenio (y no es carga inicial), limpiarla
      if (!preserveCurrentSelections) {
        const currentCatCode = document.getElementById('job-position-input-category')?.value;
        if (currentCatCode && !categories.some((c) => c.code === currentCatCode)) {
          this.clearJobPositionCategorySelection();
        }
      }

      // 2. Actualizar feedback visual y opciones en Puestos / Ocupaciones (F.883)
      const effectivePositions = positions.length > 0 ? positions : (this.arcaPositions || []);
      if (posBadge) {
        posBadge.textContent = positions.length > 0
          ? `${positions.length} Ocupaciones (${cctCode})`
          : `${this.arcaPositions?.length || 430} Ocupaciones`;
      }
      if (posHint) {
        posHint.innerHTML = positions.length > 0
          ? `<span class="text-purple fw-bold"><i class="ti ti-filter me-1"></i>Filtrado por Convenio ${escapeHtml(cctCode)}</span>: ${positions.length} ocupación(es) habilitada(s).`
          : `Nomenclador general ARCA (todas las ocupaciones disponibles).`;
      }

      const currentPosVal = posSelect ? posSelect.value : '';
      this.renderJobPositionArcaSelect(effectivePositions);

      if (posSelect) {
        if (preserveCurrentSelections && currentPosVal) {
          posSelect.value = currentPosVal;
        } else if (currentPosVal && positions.length > 0 && !positions.some((p) => p.code === currentPosVal)) {
          posSelect.value = '';
        }
      }
    } catch (err) {
      console.warn('Error al filtrar categorías y puestos por CCT:', err);
      if (catBadge) catBadge.textContent = 'Catálogo ARCA';
      if (posBadge) posBadge.textContent = 'Catálogo ARCA';
    }
  }

  renderJobPositionArcaSelect(positions) {
    const posSelect = document.getElementById('job-position-input-arca-position');
    if (!posSelect) return;
    const currentVal = posSelect.value;
    const list = positions && positions.length > 0 ? positions : (this.arcaPositions || []);
    const grouped = {};
    list.forEach((p) => {
      const group = p.groupName || 'Ocupaciones Generales';
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(p);
    });

    let html = '<option value="">-- Sin puesto oficial asignado --</option>';
    for (const [groupName, groupPositions] of Object.entries(grouped)) {
      html += `<optgroup label="${escapeHtml(groupName)}">`;
      groupPositions.forEach((p) => {
        html += `<option value="${escapeHtml(p.code)}">${escapeHtml(p.code)} - ${escapeHtml(p.name)}</option>`;
      });
      html += '</optgroup>';
    }
    posSelect.innerHTML = html;
    if (currentVal && list.some((p) => p.code === currentVal)) {
      posSelect.value = currentVal;
    }
  }

  populateJobPositionModalSelectors(selectedCctCode) {
    // 0. Inicializar buscador predictivo ágil de Convenios Colectivos (CCT)
    this.setupCctInteractiveSearch();
    this.setupCategoryInteractiveSearch();

    // Renderizar lista completa inicial de puestos ARCA
    this.renderJobPositionArcaSelect(this.arcaPositions || []);

    // 3. Selector de Tipo de Servicio (Seguridad Social - Tabla T10)
    const servSelect = document.getElementById('job-position-input-service-type');
    if (servSelect && this.arcaServiceTypes && this.arcaServiceTypes.length > 0) {
      const currentVal = servSelect.value;
      let html = '<option value="">-- Seleccionar Tipo de Servicio --</option>';
      this.arcaServiceTypes.forEach((s) => {
        html += `<option value="${escapeHtml(s.code)}">${escapeHtml(s.code)} - ${escapeHtml(s.name)}</option>`;
      });
      servSelect.innerHTML = html;
      if (currentVal) servSelect.value = currentVal;
    }

    // 4. Selector de Código de Actividad del Trabajador (ARCA Tabla T03)
    const actSelect = document.getElementById('job-position-input-activity');
    if (actSelect) {
      const currentVal = actSelect.value;
      const activities = (this.arcaActivities && this.arcaActivities.length > 0) ? this.arcaActivities : ARCA_T03_ACTIVITIES;
      let html = '';
      activities.forEach((a) => {
        html += `<option value="${escapeHtml(a.code)}">${escapeHtml(a.code)} - ${escapeHtml(a.name)}</option>`;
      });
      actSelect.innerHTML = html;
      actSelect.value = currentVal || '049';
    }
  }

  // --- Puestos de Trabajo ---
  async openNewJobPositionModal() {
    await this.ensureArcaReferenceCatalogsLoaded();
    document.getElementById('form-job-position').reset();
    document.getElementById('job-position-form-id').value = '';
    this.populateJobPositionModalSelectors('');
    await this.clearJobPositionCctSelection();
    this.clearJobPositionCategorySelection();
    const arcaSelect = document.getElementById('job-position-input-arca-position');
    if (arcaSelect) arcaSelect.value = '';
    const servSelect = document.getElementById('job-position-input-service-type');
    if (servSelect) servSelect.value = '01'; // Default: Servicios comunes
    const actSelect = document.getElementById('job-position-input-activity');
    if (actSelect) actSelect.value = '049'; // Default: Actividades no clasificadas
    document.getElementById('modal-job-position-form-title').textContent = 'Nuevo Puesto de Trabajo';
    document.getElementById('job-position-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-job-position');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Puesto';
    getBootstrapModal(document.getElementById('modal-job-position-form'))?.show();
  }

  async openEditJobPositionModal(pos) {
    await this.ensureArcaReferenceCatalogsLoaded();
    document.getElementById('job-position-form-id').value = pos.id;
    document.getElementById('job-position-input-name').value = pos.name;
    document.getElementById('job-position-input-code').value = pos.code || '';
    this.populateJobPositionModalSelectors(pos.cctCode || '');

    if (pos.cctCode) {
      await this.setJobPositionCctSelection(pos.cctCode, pos.cct, true);
    } else {
      await this.clearJobPositionCctSelection();
    }

    if (pos.categoryCode) {
      await this.setJobPositionCategorySelection(pos.categoryCode, pos.category);
    } else {
      this.clearJobPositionCategorySelection();
    }

    const arcaSelect = document.getElementById('job-position-input-arca-position');
    if (arcaSelect) arcaSelect.value = pos.positionCode || '';
    const servSelect = document.getElementById('job-position-input-service-type');
    if (servSelect) servSelect.value = pos.serviceTypeCode || '01';
    const actSelect = document.getElementById('job-position-input-activity');
    if (actSelect) actSelect.value = pos.activityCode || '049';
    document.getElementById('modal-job-position-form-title').textContent = `Editar Puesto: ${pos.name}`;
    document.getElementById('job-position-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-job-position');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Actualizar Puesto';
    getBootstrapModal(document.getElementById('modal-job-position-form'))?.show();
  }

  async deleteJobPosition(id, name, employeeCount = 0) {
    if (employeeCount > 0) {
      this.confirmDeleteAction({
        title: 'Puesto con Empleados Asignados',
        message: `No es posible eliminar el puesto <strong>"${escapeHtml(name)}"</strong> porque tiene <strong>${employeeCount}</strong> empleado(s) activo(s) asignado(s).`,
        warning: 'Para dar de baja este puesto, primero debes reasignar a sus colaboradores a otro puesto.',
        confirmText: 'Entendido',
        onConfirm: async () => {},
      });
      return;
    }

    this.confirmDeleteAction({
      title: 'Eliminar Puesto de Trabajo',
      message: `¿Estás seguro de que deseas eliminar el puesto <strong>"${escapeHtml(name)}"</strong>?`,
      onConfirm: async () => {
        await apiRequest(`/job-positions/${id}`, { method: 'DELETE' });
        showToast('Puesto de trabajo eliminado correctamente');
        await this.loadPersonnelAuxiliaryData();
      },
    });
  }

  // --- Jornadas de Trabajo (Estructura Organizacional) ---

  async openNewWorkShiftModal() {
    await this.ensureEmployeeModalAuxiliaryLoaded();
    document.getElementById('form-work-shift').reset();
    document.getElementById('work-shift-form-id').value = '';
    document.getElementById('modal-work-shift-form-title').textContent = 'Nueva Jornada de Trabajo';
    document.getElementById('work-shift-status-badge').textContent = 'Nueva Definición';
    document.getElementById('work-shift-status-badge').className = 'badge bg-blue-lt';
    document.getElementById('work-shift-form-alert')?.classList.add('d-none');
    document.getElementById('work-shift-select-cycle-type').value = 'SEMANAL';
    const cycleHint = document.getElementById('work-shift-cycle-hint');
    if (cycleHint) cycleHint.textContent = 'Esquema semanal fijo con asignación de francos.';
    document.getElementById('btn-add-cycle-day')?.classList.add('d-none');

    // Cargar plantilla por defecto: Normal Diurna (L a V 8hs)
    this.applyWorkShiftPreset('NORMAL_5D', false);

    const submitBtn = document.getElementById('btn-save-work-shift');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Jornada';
    getBootstrapModal(document.getElementById('modal-work-shift-form'))?.show();
  }

  async openEditWorkShiftModal(shift) {
    await this.ensureEmployeeModalAuxiliaryLoaded();
    document.getElementById('form-work-shift').reset();
    document.getElementById('work-shift-form-id').value = shift.id;
    document.getElementById('modal-work-shift-form-title').textContent = `Editar Jornada: ${shift.name}`;
    document.getElementById('work-shift-status-badge').textContent = 'Modificando';
    document.getElementById('work-shift-status-badge').className = 'badge bg-teal-lt';
    document.getElementById('work-shift-form-alert')?.classList.add('d-none');

    document.getElementById('work-shift-input-name').value = shift.name || '';
    document.getElementById('work-shift-input-code').value = shift.code || '';
    document.getElementById('work-shift-select-cycle-type').value = shift.cycleType || 'SEMANAL';
    document.getElementById('work-shift-input-description').value = shift.description || '';

    // Totales de horas y porcentaje de jornada
    document.getElementById('work-shift-input-daily-hours').value = Number(shift.dailyHours || 8).toFixed(2);
    document.getElementById('work-shift-input-weekly-hours').value = Number(shift.weeklyHours || 48).toFixed(2);
    document.getElementById('work-shift-input-monthly-hours').value = Number(shift.monthlyHours || 200).toFixed(2);
    document.getElementById('work-shift-input-monthly-days').value = Number(shift.monthlyDays || 30).toFixed(2);
    const pctInput = document.getElementById('work-shift-input-percentage');
    if (pctInput) pctInput.value = Number(shift.percentage != null ? shift.percentage : 100).toFixed(2);

    const isRotativo = shift.cycleType === 'ROTATIVO_DIAS';
    const btnAddCycleDay = document.getElementById('btn-add-cycle-day');
    if (btnAddCycleDay) {
      if (isRotativo) btnAddCycleDay.classList.remove('d-none');
      else btnAddCycleDay.classList.add('d-none');
    }
    const cycleHint = document.getElementById('work-shift-cycle-hint');
    if (cycleHint) {
      cycleHint.textContent = isRotativo
        ? 'Ciclo de N días continuos que rotan secuencialmente.'
        : 'Esquema semanal fijo con asignación de francos.';
    }

    // Cargar detalles desde el objeto o desde la API para asegurar frescura
    let details = shift.details;
    if (!details || details.length === 0) {
      try {
        const res = await apiRequest(`/work-shifts/${shift.id}`);
        if (res.data?.details) {
          details = res.data.details;
        }
      } catch (err) {
        console.warn('No se pudieron obtener detalles completos de la jornada:', err);
      }
    }

    if (details && details.length > 0) {
      this.currentWorkShiftDetails = JSON.parse(JSON.stringify(details));
    } else {
      // Fallback a 7 días semanales
      const dayNames = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      this.currentWorkShiftDetails = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
        dayOfWeek: d,
        cycleDayNumber: null,
        dayName: dayNames[d],
        isWorkDay: d <= 5,
        startTime: d <= 5 ? '08:00' : null,
        endTime: d <= 5 ? '16:00' : null,
        breakMinutes: 0,
        netHours: d <= 5 ? Number(shift.dailyHours || 8) : 0,
        crossesMidnight: false,
      }));
    }

    this.renderWorkShiftDiagramRows();

    const submitBtn = document.getElementById('btn-save-work-shift');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Actualizar Jornada';
    getBootstrapModal(document.getElementById('modal-work-shift-form'))?.show();
  }

  async deleteWorkShift(id, name, employeeCount = 0) {
    if (employeeCount > 0) {
      this.confirmDeleteAction({
        title: 'Jornada con Colaboradores Asignados',
        message: `No es posible eliminar la jornada <strong>"${escapeHtml(name)}"</strong> porque se encuentra asignada a <strong>${employeeCount}</strong> colaborador(es) activo(s).`,
        warning: 'Por favor, reasigne previamente a los colaboradores a otra jornada activa.',
        confirmText: 'Entendido',
        onConfirm: async () => {},
      });
      return;
    }

    this.confirmDeleteAction({
      title: 'Eliminar Jornada de Trabajo',
      message: `¿Estás seguro de que deseas eliminar la jornada <strong>"${escapeHtml(name)}"</strong> de la estructura organizacional?`,
      confirmText: 'Eliminar Jornada',
      onConfirm: async () => {
        await apiRequest(`/work-shifts/${id}`, { method: 'DELETE' });
        showToast('Jornada de trabajo eliminada correctamente', 'success');
        await this.loadPersonnelAuxiliaryData();
      },
    });
  }

  computeShiftDetailNetHours(startTime, endTime, breakMinutes = 0) {
    if (!startTime || !endTime) return { netHours: 0, crossesMidnight: false };
    const parts1 = startTime.split(':').map(Number);
    const parts2 = endTime.split(':').map(Number);
    if (parts1.length !== 2 || parts2.length !== 2 || isNaN(parts1[0]) || isNaN(parts2[0])) {
      return { netHours: 0, crossesMidnight: false };
    }
    const startMin = parts1[0] * 60 + parts1[1];
    const endMin = parts2[0] * 60 + parts2[1];
    let totalMin = endMin - startMin;
    let crossesMidnight = false;
    if (totalMin < 0) {
      totalMin += 24 * 60;
      crossesMidnight = true;
    }
    const netMin = Math.max(0, totalMin - (parseInt(breakMinutes, 10) || 0));
    const netHours = Math.round((netMin / 60) * 100) / 100;
    return { netHours, crossesMidnight };
  }

  renderWorkShiftDiagramRows() {
    const tbody = document.getElementById('work-shift-details-tbody');
    if (!tbody) return;

    const details = this.currentWorkShiftDetails || [];
    const dayNames = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const cycleType = document.getElementById('work-shift-select-cycle-type')?.value || 'SEMANAL';

    let totalNetHours = 0;
    let workDays = 0;
    let francoDays = 0;

    tbody.innerHTML = details
      .map((d, idx) => {
        const rowId = `shift-row-${idx}`;
        const dayLabel = d.dayName || (d.dayOfWeek ? dayNames[d.dayOfWeek] : `Día ${d.cycleDayNumber || idx + 1}`);
        const isWork = Boolean(d.isWorkDay);
        const startTimeVal = d.startTime || (isWork ? '08:00' : '');
        const endTimeVal = d.endTime || (isWork ? '16:00' : '');
        const breakMins = parseInt(d.breakMinutes, 10) || 0;

        let { netHours, crossesMidnight } = this.computeShiftDetailNetHours(startTimeVal, endTimeVal, breakMins);
        if (!isWork) {
          netHours = 0;
          crossesMidnight = false;
          francoDays++;
        } else {
          workDays++;
          totalNetHours += netHours;
        }

        // Actualizar en memoria
        d.netHours = netHours;
        d.crossesMidnight = crossesMidnight;

        let badgeHtml = '<span class="badge bg-secondary-lt text-muted font-monospace">Franco</span>';
        if (isWork) {
          if (crossesMidnight) {
            badgeHtml = '<span class="badge bg-indigo-lt text-indigo"><i class="ti ti-moon me-1"></i>+1 día (Nocturno)</span>';
          } else {
            badgeHtml = '<span class="badge bg-teal-lt text-teal"><i class="ti ti-sun me-1"></i>Diurno</span>';
          }
        }

        const deleteBtnHtml =
          cycleType === 'ROTATIVO_DIAS' && details.length > 2
            ? `<button type="button" class="btn btn-sm btn-ghost-danger py-0 px-1 btn-delete-shift-row" data-idx="${idx}" title="Eliminar este tramo del ciclo">
                <i class="ti ti-x"></i>
               </button>`
            : '';

        return `
          <tr id="${rowId}" data-idx="${idx}" class="${!isWork ? 'bg-light-subtle opacity-75' : ''}">
            <td class="align-middle">
              <span class="fw-bold ${isWork ? 'text-dark' : 'text-muted'}">${escapeHtml(dayLabel)}</span>
            </td>
            <td class="text-center align-middle">
              <div class="form-check form-switch d-inline-block m-0">
                <input class="form-check-input shift-row-switch" type="checkbox" data-idx="${idx}" ${isWork ? 'checked' : ''}>
                <label class="form-check-label small fw-semibold ms-1">${isWork ? 'Laborable' : 'Franco'}</label>
              </div>
            </td>
            <td class="align-middle">
              <input type="time" class="form-control form-control-sm font-monospace shift-row-start" data-idx="${idx}" value="${startTimeVal}" ${!isWork ? 'disabled' : ''}>
            </td>
            <td class="align-middle">
              <input type="time" class="form-control form-control-sm font-monospace shift-row-end" data-idx="${idx}" value="${endTimeVal}" ${!isWork ? 'disabled' : ''}>
            </td>
            <td class="text-center align-middle">
              <input type="number" class="form-control form-control-sm font-monospace text-center shift-row-break" data-idx="${idx}" min="0" max="480" step="5" value="${breakMins}" ${!isWork ? 'disabled' : ''}>
            </td>
            <td class="text-center align-middle shift-row-badge-cell">
              ${badgeHtml}
            </td>
            <td class="text-end align-middle font-monospace fw-bold fs-4 ${isWork ? 'text-primary' : 'text-muted'} shift-row-net-cell">
              ${netHours.toFixed(2)} hs
            </td>
            <td class="text-center align-middle">
              ${deleteBtnHtml}
            </td>
          </tr>
        `;
      })
      .join('');

    // Actualizar resumen en pie de tabla
    const summaryText = document.getElementById('work-shift-diagram-summary-text');
    if (summaryText) {
      summaryText.textContent = `Resumen del ciclo: ${workDays} días laborables, ${francoDays} francos.`;
    }
    const totalHoursDisplay = document.getElementById('work-shift-diagram-total-hours');
    if (totalHoursDisplay) {
      totalHoursDisplay.textContent = `${totalNetHours.toFixed(2)} hs`;
    }

    // Vincular eventos reactivos a los inputs de cada fila
    tbody.querySelectorAll('.shift-row-switch').forEach((sw) => {
      sw.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (this.currentWorkShiftDetails[idx]) {
          this.currentWorkShiftDetails[idx].isWorkDay = e.target.checked;
          if (e.target.checked) {
            if (!this.currentWorkShiftDetails[idx].startTime) this.currentWorkShiftDetails[idx].startTime = '08:00';
            if (!this.currentWorkShiftDetails[idx].endTime) this.currentWorkShiftDetails[idx].endTime = '16:00';
          }
        }
        this.renderWorkShiftDiagramRows();
        this.syncWorkShiftTotalsFromDiagram(false);
      });
    });

    const updateRowOnTimeChange = (idx) => {
      const row = tbody.querySelector(`tr[data-idx="${idx}"]`);
      if (!row) return;
      const startEl = row.querySelector('.shift-row-start');
      const endEl = row.querySelector('.shift-row-end');
      const breakEl = row.querySelector('.shift-row-break');
      const badgeCell = row.querySelector('.shift-row-badge-cell');
      const netCell = row.querySelector('.shift-row-net-cell');

      const startVal = startEl?.value || '08:00';
      const endVal = endEl?.value || '16:00';
      const breakVal = parseInt(breakEl?.value, 10) || 0;

      const { netHours, crossesMidnight } = this.computeShiftDetailNetHours(startVal, endVal, breakVal);

      if (this.currentWorkShiftDetails[idx]) {
        this.currentWorkShiftDetails[idx].startTime = startVal;
        this.currentWorkShiftDetails[idx].endTime = endVal;
        this.currentWorkShiftDetails[idx].breakMinutes = breakVal;
        this.currentWorkShiftDetails[idx].netHours = netHours;
        this.currentWorkShiftDetails[idx].crossesMidnight = crossesMidnight;
      }

      if (badgeCell) {
        if (crossesMidnight) {
          badgeCell.innerHTML = '<span class="badge bg-indigo-lt text-indigo"><i class="ti ti-moon me-1"></i>+1 día (Nocturno)</span>';
        } else {
          badgeCell.innerHTML = '<span class="badge bg-teal-lt text-teal"><i class="ti ti-sun me-1"></i>Diurno</span>';
        }
      }
      if (netCell) {
        netCell.textContent = `${netHours.toFixed(2)} hs`;
      }

      // Recalcular total acumulado en el pie
      let sum = 0;
      this.currentWorkShiftDetails.forEach((item) => {
        if (item.isWorkDay) sum += Number(item.netHours || 0);
      });
      if (totalHoursDisplay) totalHoursDisplay.textContent = `${sum.toFixed(2)} hs`;
    };

    tbody.querySelectorAll('.shift-row-start, .shift-row-end, .shift-row-break').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        updateRowOnTimeChange(idx);
      });
      inp.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        updateRowOnTimeChange(idx);
        this.syncWorkShiftTotalsFromDiagram(false);
      });
    });

    tbody.querySelectorAll('.btn-delete-shift-row').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.idx, 10);
        this.currentWorkShiftDetails.splice(idx, 1);
        // Re-indexar días del ciclo
        this.currentWorkShiftDetails.forEach((d, i) => {
          d.cycleDayNumber = i + 1;
          d.dayName = `Día ${i + 1}`;
        });
        this.renderWorkShiftDiagramRows();
        this.syncWorkShiftTotalsFromDiagram(false);
      });
    });
  }

  collectWorkShiftDetailsFromDOM() {
    const tbody = document.getElementById('work-shift-details-tbody');
    if (!tbody) return this.currentWorkShiftDetails || [];

    const rows = tbody.querySelectorAll('tr[data-idx]');
    const details = [];

    rows.forEach((row) => {
      const idx = parseInt(row.dataset.idx, 10);
      const original = this.currentWorkShiftDetails[idx] || {};
      const isWork = Boolean(row.querySelector('.shift-row-switch')?.checked);
      const startTime = isWork ? (row.querySelector('.shift-row-start')?.value || '08:00') : null;
      const endTime = isWork ? (row.querySelector('.shift-row-end')?.value || '16:00') : null;
      const breakMinutes = isWork ? (parseInt(row.querySelector('.shift-row-break')?.value, 10) || 0) : 0;

      const { netHours, crossesMidnight } = isWork
        ? this.computeShiftDetailNetHours(startTime, endTime, breakMinutes)
        : { netHours: 0, crossesMidnight: false };

      details.push({
        id: original.id || undefined,
        dayOfWeek: original.dayOfWeek !== undefined ? original.dayOfWeek : null,
        cycleDayNumber: original.cycleDayNumber !== undefined ? original.cycleDayNumber : null,
        dayName: original.dayName || null,
        isWorkDay: isWork,
        startTime: startTime,
        endTime: endTime,
        crossesMidnight: crossesMidnight,
        breakMinutes: breakMinutes,
        netHours: netHours,
        notes: original.notes || null,
      });
    });

    this.currentWorkShiftDetails = details;
    return details;
  }

  syncWorkShiftTotalsFromDiagram(userInitiated = false) {
    const details = this.collectWorkShiftDetailsFromDOM();
    const cycleType = document.getElementById('work-shift-select-cycle-type')?.value || 'SEMANAL';

    let totalDiagramHours = 0;
    let workDaysCount = 0;

    details.forEach((d) => {
      if (d.isWorkDay) {
        workDaysCount++;
        totalDiagramHours += Number(d.netHours || 0);
      }
    });

    // 1. Horas diarias sugeridas: promedio de horas por día laborable
    const dailyHours = workDaysCount > 0 ? Math.round((totalDiagramHours / workDaysCount) * 100) / 100 : 8.00;

    // 2. Horas semanales sugeridas
    let weeklyHours = totalDiagramHours;
    if (cycleType === 'ROTATIVO_DIAS') {
      const cycleLen = details.length || 7;
      weeklyHours = Math.round(((totalDiagramHours / cycleLen) * 7) * 100) / 100;
    }

    // 3. Horas mensuales sugeridas (semanal * 4.3333, o tope 200 para 48hs estándar)
    let monthlyHours = 200.00;
    if (Math.abs(weeklyHours - 48) < 0.1) {
      monthlyHours = 200.00;
    } else {
      monthlyHours = Math.round((weeklyHours * (52 / 12)) * 100) / 100;
    }

    // 4. Días mensuales sugeridos (30 días por defecto legal en Argentina)
    const monthlyDays = 30.00;

    // 5. Porcentaje de jornada sugerido sobre horas semanales estándar de Haberes
    const stdWeekly = parseFloat(this.payrollSettings?.standardWeeklyHours) || 48.00;
    let suggestedPct = 100.00;
    if (stdWeekly > 0 && weeklyHours > 0) {
      suggestedPct = Math.min(100.00, Math.round(((weeklyHours / stdWeekly) * 100) * 100) / 100);
    }

    const dailyInp = document.getElementById('work-shift-input-daily-hours');
    const weeklyInp = document.getElementById('work-shift-input-weekly-hours');
    const monthlyInp = document.getElementById('work-shift-input-monthly-hours');
    const daysInp = document.getElementById('work-shift-input-monthly-days');
    const pctInp = document.getElementById('work-shift-input-percentage');

    if (dailyInp) dailyInp.value = dailyHours.toFixed(2);
    if (weeklyInp) weeklyInp.value = weeklyHours.toFixed(2);
    if (monthlyInp) monthlyInp.value = monthlyHours.toFixed(2);
    if (daysInp) daysInp.value = monthlyDays.toFixed(2);
    if (pctInp) pctInp.value = suggestedPct.toFixed(2);

    if (userInitiated) {
      showToast('Totales sugeridos calculados desde el diagrama de horarios', 'info');
    }
  }

  applyWorkShiftPreset(presetKey, showNotification = true) {
    const dayNames = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    let name = '';
    let code = '';
    let cycleType = 'SEMANAL';
    let description = '';
    let details = [];
    let dailyHours = 8.00;
    let weeklyHours = 40.00;
    let monthlyHours = 173.33;
    let monthlyDays = 30.00;

    if (presetKey === 'NORMAL_5D') {
      name = 'Jornada Normal Diurna (L a V 8hs)';
      code = 'NORM_5D';
      cycleType = 'SEMANAL';
      description = 'Jornada estándar de 40 horas semanales distribuidas de lunes a viernes (08:00 a 16:00 hs). Sábados y domingos francos.';
      dailyHours = 8.00;
      weeklyHours = 40.00;
      monthlyHours = 173.33;
      monthlyDays = 30.00;
      details = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
        dayOfWeek: d,
        cycleDayNumber: null,
        dayName: dayNames[d],
        isWorkDay: d <= 5,
        startTime: d <= 5 ? '08:00' : null,
        endTime: d <= 5 ? '16:00' : null,
        breakMinutes: 0,
        netHours: d <= 5 ? 8.00 : 0,
        crossesMidnight: false,
      }));
    } else if (presetKey === 'NORMAL_6D') {
      name = 'Jornada Normal con Sábado (L a V 8hs, Sáb 4hs)';
      code = 'NORM_6D';
      cycleType = 'SEMANAL';
      description = 'Jornada semanal de 44 horas. Lunes a viernes 8hs (08:00 a 16:00 hs) y sábado 4hs (08:00 a 12:00 hs). Domingo franco.';
      dailyHours = 8.00;
      weeklyHours = 44.00;
      monthlyHours = 190.67;
      monthlyDays = 30.00;
      details = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
        dayOfWeek: d,
        cycleDayNumber: null,
        dayName: dayNames[d],
        isWorkDay: d <= 6,
        startTime: '08:00',
        endTime: d <= 5 ? '16:00' : (d === 6 ? '12:00' : null),
        breakMinutes: 0,
        netHours: d <= 5 ? 8.00 : (d === 6 ? 4.00 : 0),
        crossesMidnight: false,
      }));
    } else if (presetKey === 'NIGHT') {
      name = 'Jornada Nocturna Continua 7hs (22:00 a 05:00)';
      code = 'NOCT_7H';
      cycleType = 'SEMANAL';
      description = 'Régimen nocturno según Art. 200 LCT (máximo legal 7 horas diarias entre las 21:00 y las 06:00). Turno de 22:00 a 05:00 hs (+1 día cruce de medianoche).';
      dailyHours = 7.00;
      weeklyHours = 35.00;
      monthlyHours = 151.67;
      monthlyDays = 30.00;
      details = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
        dayOfWeek: d,
        cycleDayNumber: null,
        dayName: dayNames[d],
        isWorkDay: d <= 5,
        startTime: d <= 5 ? '22:00' : null,
        endTime: d <= 5 ? '05:00' : null,
        breakMinutes: 0,
        netHours: d <= 5 ? 7.00 : 0,
        crossesMidnight: d <= 5,
      }));
    } else if (presetKey === 'FRANQUERO') {
      name = 'Personal Franquero Fin de Semana (Sáb-Dom 12hs)';
      code = 'FRANQ_24H';
      cycleType = 'FRANQUERO';
      description = 'Guardia y cobertura de fines de semana. Turnos de 12 horas (08:00 a 20:00 hs) sábados y domingos. Lunes a viernes francos.';
      dailyHours = 12.00;
      weeklyHours = 24.00;
      monthlyHours = 104.00;
      monthlyDays = 30.00;
      details = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
        dayOfWeek: d,
        cycleDayNumber: null,
        dayName: dayNames[d],
        isWorkDay: d >= 6,
        startTime: d >= 6 ? '08:00' : null,
        endTime: d >= 6 ? '20:00' : null,
        breakMinutes: 0,
        netHours: d >= 6 ? 12.00 : 0,
        crossesMidnight: false,
      }));
    } else if (presetKey === 'ALTERNO_1X1') {
      name = 'Ciclo Alterno 1x1 (1 día 12hs, 1 día franco)';
      code = 'ROT_1X1';
      cycleType = 'ROTATIVO_DIAS';
      description = 'Régimen de guardia continua 1x1: 1 día de guardia de 12 horas (07:00 a 19:00 hs) seguido de 1 día de descanso completo.';
      dailyHours = 12.00;
      weeklyHours = 42.00;
      monthlyHours = 182.00;
      monthlyDays = 30.00;
      details = [
        {
          dayOfWeek: null,
          cycleDayNumber: 1,
          dayName: 'Día 1 (Guardia 12hs)',
          isWorkDay: true,
          startTime: '07:00',
          endTime: '19:00',
          breakMinutes: 0,
          netHours: 12.00,
          crossesMidnight: false,
        },
        {
          dayOfWeek: null,
          cycleDayNumber: 2,
          dayName: 'Día 2 (Franco)',
          isWorkDay: false,
          startTime: null,
          endTime: null,
          breakMinutes: 0,
          netHours: 0.00,
          crossesMidnight: false,
        },
      ];
    } else if (presetKey === 'ROTATIVO_4X2') {
      name = 'Ciclo Rotativo 4x2 (4 días 8hs, 2 días franco)';
      code = 'ROT_4X2';
      cycleType = 'ROTATIVO_DIAS';
      description = 'Régimen continuo de producción: 4 días consecutivos de labor (06:00 a 14:00 hs) seguidos de 2 días consecutivos de franco.';
      dailyHours = 8.00;
      weeklyHours = 37.33;
      monthlyHours = 161.78;
      monthlyDays = 30.00;
      details = [1, 2, 3, 4, 5, 6].map((i) => ({
        dayOfWeek: null,
        cycleDayNumber: i,
        dayName: i <= 4 ? `Día ${i} (Turno 8hs)` : `Día ${i} (Franco)`,
        isWorkDay: i <= 4,
        startTime: i <= 4 ? '06:00' : null,
        endTime: i <= 4 ? '14:00' : null,
        breakMinutes: 0,
        netHours: i <= 4 ? 8.00 : 0,
        crossesMidnight: false,
      }));
    }

    document.getElementById('work-shift-input-name').value = name;
    document.getElementById('work-shift-input-code').value = code;
    document.getElementById('work-shift-select-cycle-type').value = cycleType;
    document.getElementById('work-shift-input-description').value = description;

    // Totales sugeridos
    const stdWeekly = parseFloat(this.payrollSettings?.standardWeeklyHours) || 48.00;
    let presetPct = 100.00;
    if (stdWeekly > 0 && weeklyHours > 0) {
      presetPct = Math.min(100.00, Math.round(((weeklyHours / stdWeekly) * 100) * 100) / 100);
    }

    document.getElementById('work-shift-input-daily-hours').value = dailyHours.toFixed(2);
    document.getElementById('work-shift-input-weekly-hours').value = weeklyHours.toFixed(2);
    document.getElementById('work-shift-input-monthly-hours').value = monthlyHours.toFixed(2);
    document.getElementById('work-shift-input-monthly-days').value = monthlyDays.toFixed(2);
    const pctInp = document.getElementById('work-shift-input-percentage');
    if (pctInp) pctInp.value = presetPct.toFixed(2);

    const isRotativo = cycleType === 'ROTATIVO_DIAS';
    const btnAddCycleDay = document.getElementById('btn-add-cycle-day');
    if (btnAddCycleDay) {
      if (isRotativo) btnAddCycleDay.classList.remove('d-none');
      else btnAddCycleDay.classList.add('d-none');
    }
    const cycleHint = document.getElementById('work-shift-cycle-hint');
    if (cycleHint) {
      cycleHint.textContent = isRotativo
        ? 'Ciclo de N días continuos que rotan secuencialmente.'
        : 'Esquema semanal fijo con asignación de francos.';
    }

    this.currentWorkShiftDetails = details;
    this.renderWorkShiftDiagramRows();

    if (showNotification) {
      showToast(`Plantilla cargada: ${name}`, 'info');
    }
  }

  setupWorkShiftModalEvents() {
    // Cambio de tipo de ciclo
    document.getElementById('work-shift-select-cycle-type')?.addEventListener('change', (e) => {
      const isRotativo = e.target.value === 'ROTATIVO_DIAS';
      const btnAddCycleDay = document.getElementById('btn-add-cycle-day');
      if (btnAddCycleDay) {
        if (isRotativo) btnAddCycleDay.classList.remove('d-none');
        else btnAddCycleDay.classList.add('d-none');
      }
      const cycleHint = document.getElementById('work-shift-cycle-hint');
      if (cycleHint) {
        cycleHint.textContent = isRotativo
          ? 'Ciclo de N días continuos (ej. 1x1, 4x2) que rotan secuencialmente.'
          : 'Esquema semanal fijo con asignación de francos.';
      }
    });

    // Botón añadir día al ciclo
    document.getElementById('btn-add-cycle-day')?.addEventListener('click', () => {
      const details = this.currentWorkShiftDetails || [];
      const newDayNum = details.length + 1;
      details.push({
        dayOfWeek: null,
        cycleDayNumber: newDayNum,
        dayName: `Día ${newDayNum}`,
        isWorkDay: true,
        startTime: '08:00',
        endTime: '16:00',
        breakMinutes: 0,
        netHours: 8.00,
        crossesMidnight: false,
      });
      this.currentWorkShiftDetails = details;
      this.renderWorkShiftDiagramRows();
      this.syncWorkShiftTotalsFromDiagram(false);
    });

    // Botón para sincronizar y sugerir totales desde el diagrama
    document.getElementById('btn-sync-shift-totals')?.addEventListener('click', () => {
      this.syncWorkShiftTotalsFromDiagram(true);
    });

    // Presets rápidos
    document.getElementById('preset-shift-normal-5d')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.applyWorkShiftPreset('NORMAL_5D');
    });
    document.getElementById('preset-shift-normal-6d')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.applyWorkShiftPreset('NORMAL_6D');
    });
    document.getElementById('preset-shift-night')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.applyWorkShiftPreset('NIGHT');
    });
    document.getElementById('preset-shift-franquero')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.applyWorkShiftPreset('FRANQUERO');
    });
    document.getElementById('preset-shift-alterno-1x1')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.applyWorkShiftPreset('ALTERNO_1X1');
    });
    document.getElementById('preset-shift-rotativo-4x2')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.applyWorkShiftPreset('ROTATIVO_4X2');
    });

    // Recalcular sugerencia de porcentaje al tipear manualmente horas semanales
    document.getElementById('work-shift-input-weekly-hours')?.addEventListener('input', (e) => {
      const wh = parseFloat(e.target.value) || 0;
      const stdWeekly = parseFloat(this.payrollSettings?.standardWeeklyHours) || 48.00;
      const pctInput = document.getElementById('work-shift-input-percentage');
      if (pctInput && stdWeekly > 0) {
        const pct = Math.min(100.00, Math.round(((wh / stdWeekly) * 100) * 100) / 100);
        pctInput.value = pct.toFixed(2);
      }
    });

    // Submit del Formulario de Jornada
    document.getElementById('form-work-shift')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('work-shift-form-id')?.value;
      const alertBox = document.getElementById('work-shift-form-alert');
      const submitBtn = document.getElementById('btn-save-work-shift');
      if (alertBox) alertBox.classList.add('d-none');

      const nameVal = document.getElementById('work-shift-input-name')?.value?.trim();
      const codeVal = document.getElementById('work-shift-input-code')?.value?.trim().toUpperCase();
      const cycleTypeVal = document.getElementById('work-shift-select-cycle-type')?.value || 'SEMANAL';
      const descVal = document.getElementById('work-shift-input-description')?.value?.trim();

      const dailyHoursVal = parseFloat(document.getElementById('work-shift-input-daily-hours')?.value) || 8.00;
      const weeklyHoursVal = parseFloat(document.getElementById('work-shift-input-weekly-hours')?.value) || 48.00;
      const monthlyHoursVal = parseFloat(document.getElementById('work-shift-input-monthly-hours')?.value) || 200.00;
      const monthlyDaysVal = parseFloat(document.getElementById('work-shift-input-monthly-days')?.value) || 30.00;
      const percentageVal = parseFloat(document.getElementById('work-shift-input-percentage')?.value) || 100.00;

      if (!nameVal) {
        if (alertBox) {
          alertBox.textContent = 'La denominación de la jornada es obligatoria.';
          alertBox.classList.remove('d-none');
        }
        return;
      }

      // Recopilar detalles del diagrama en pantalla
      const details = this.collectWorkShiftDetailsFromDOM();

      const payload = {
        name: nameVal,
        code: codeVal || null,
        description: descVal || null,
        cycleType: cycleTypeVal,
        percentage: percentageVal,
        dailyHours: dailyHoursVal,
        weeklyHours: weeklyHoursVal,
        monthlyHours: monthlyHoursVal,
        monthlyDays: monthlyDaysVal,
        details: details,
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
      }

      try {
        if (id) {
          await apiRequest(`/work-shifts/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
          showToast('Jornada de trabajo actualizada exitosamente', 'success');
        } else {
          await apiRequest('/work-shifts', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Jornada de trabajo creada exitosamente', 'success');
        }
        getBootstrapModal(document.getElementById('modal-work-shift-form'))?.hide();
        await this.loadPersonnelAuxiliaryData();
      } catch (err) {
        if (alertBox) {
          alertBox.textContent = err.message || 'Error al guardar jornada de trabajo';
          alertBox.classList.remove('d-none');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = id
            ? '<i class="ti ti-device-floppy me-1"></i> Actualizar Jornada'
            : '<i class="ti ti-device-floppy me-1"></i> Guardar Jornada';
        }
      }
    });
  }

  // --- Obras Sociales ---
}

export function registerPersonnelOrgMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(MixinMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
