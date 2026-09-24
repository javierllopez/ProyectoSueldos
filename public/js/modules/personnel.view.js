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


class PersonnelMethods {

  // =========================================================================
  // --- MÓDULO DE PERSONAL, ESTRUCTURA ORGANIZACIONAL Y AFILIACIONES ---
  // =========================================================================

  async renderPersonnelView() {
    if (!this.activeCompany) {
      showToast('Por favor selecciona una empresa activa primero', 'warning');
      return;
    }


    try {
      await this.loadPersonnelAuxiliaryData();
      await this.loadEmployees();
    } catch (err) {
      console.error('Error al cargar datos del módulo de personal:', err);
      showToast(err.message || 'Error al cargar personal', 'danger');
    }
  }

  async loadPersonnelAuxiliaryData() {
    // Mostrar spinners de carga en las tablas auxiliares
    const setTableLoading = (tbodyId, colspan, text, pagContainerId) => {
      const tb = document.getElementById(tbodyId);
      const pag = document.getElementById(pagContainerId);
      if (pag) pag.classList.add('d-none');
      if (tb) {
        tb.innerHTML = `
          <tr>
            <td colspan="${colspan}" class="text-center py-5 text-muted">
              <span class="spinner-border spinner-border-sm text-teal me-2" role="status"></span>
              ${text}
            </td>
          </tr>
        `;
      }
    };

    setTableLoading('departments-table-body', 4, 'Cargando sectores...', 'departments-pagination-container');
    setTableLoading('job-positions-table-body', 4, 'Cargando puestos de trabajo...', 'job-positions-pagination-container');
    setTableLoading('work-shifts-table-body', 10, 'Cargando jornadas de trabajo...', 'work-shifts-pagination-container');
    setTableLoading('health-insurances-table-body', 4, 'Cargando obras sociales...', 'health-insurances-pagination-container');
    setTableLoading('unions-table-body', 4, 'Cargando sindicatos...', 'unions-pagination-container');
    setTableLoading('mutuals-table-body', 4, 'Cargando mutuales...', 'mutuals-pagination-container');
    setTableLoading('kinships-table-body', 4, 'Cargando parentescos...', 'kinships-pagination-container');

    const [deptRes, jobRes, shiftRes, hiRes, unionRes, mutualRes, kinRes, catRes, posRes, servRes, cctRes, modRes, actRes, profileRes, salaryScalesRes, payrollSettingsRes] = await Promise.all([
      apiRequest('/departments'),
      apiRequest('/job-positions'),
      apiRequest('/work-shifts').catch(() => ({ data: [] })),
      apiRequest('/health-insurances'),
      apiRequest('/unions'),
      apiRequest('/mutuals'),
      apiRequest('/kinships'),
      apiRequest('/arca-categories'),
      apiRequest('/arca-positions'),
      apiRequest('/arca-service-types'),
      apiRequest('/arca-ccts'),
      apiRequest('/arca-contract-modalities'),
      apiRequest('/arca-activities').catch(() => ({ data: ARCA_T03_ACTIVITIES })),
      apiRequest('/companies/profile').catch(() => ({ data: null })),
      apiRequest('/payroll/salary-scales').catch(() => ({ data: [] })),
      apiRequest('/payroll/settings').catch(() => ({ data: null })),
    ]);

    this.departments = deptRes.data || [];
    this.jobPositions = jobRes.data || [];
    this.workShifts = shiftRes.data || [];
    this.healthInsurances = hiRes.data || [];
    this.unions = unionRes.data || [];
    this.mutuals = mutualRes.data || [];
    this.kinships = kinRes.data || [];
    this.arcaCategories = catRes.data || [];
    this.arcaPositions = posRes.data || [];
    this.arcaServiceTypes = servRes.data || [];
    this.arcaCcts = cctRes.data || [];
    this.arcaContractModalities = modRes.data || [];
    this.arcaActivities = (actRes && actRes.data && actRes.data.length > 0) ? actRes.data : ARCA_T03_ACTIVITIES;
    this.salaryScales = salaryScalesRes.data || [];
    this.payrollSalaryScales = this.salaryScales;
    if (profileRes && profileRes.data) {
      this.activeCompanyProfile = profileRes.data;
    }
    if (payrollSettingsRes && payrollSettingsRes.data) {
      this.payrollSettings = payrollSettingsRes.data;
    }
    this.populateJobPositionModalSelectors();

    // Actualizar contadores del menú lateral

    const bDept = document.getElementById('personnel-badge-dept-count');
    if (bDept) bDept.textContent = this.departments.length;
    const bJob = document.getElementById('personnel-badge-job-count');
    if (bJob) bJob.textContent = this.jobPositions.length;
    const bShift = document.getElementById('personnel-badge-shifts-count');
    if (bShift) bShift.textContent = this.workShifts.length;
    const bHi = document.getElementById('personnel-badge-hi-count');
    if (bHi) bHi.textContent = this.healthInsurances.length;
    const bUnion = document.getElementById('personnel-badge-union-count');
    if (bUnion) bUnion.textContent = this.unions.length;
    const bMutual = document.getElementById('personnel-badge-mutual-count');
    if (bMutual) bMutual.textContent = this.mutuals.length;
    const bKin = document.getElementById('personnel-badge-kin-count');
    if (bKin) bKin.textContent = this.kinships.length;
    const bScales = document.getElementById('payroll-badge-scales-count');
    if (bScales) bScales.textContent = this.salaryScales.length;

    // Actualizar select de parentescos en modal de familiar
    const kinSelect = document.getElementById('relative-input-kinship');
    if (kinSelect) {
      const currentVal = kinSelect.value;
      kinSelect.innerHTML =
        '<option value="">Seleccionar Parentesco...</option>' +
        this.kinships.map((k) => `<option value="${k.id}">${escapeHtml(k.name)}</option>`).join('');
      kinSelect.value = currentVal || '';
    }

    // Actualizar select de filtro de sector
    const deptFilter = document.getElementById('employee-filter-department');
    if (deptFilter) {
      const currentVal = deptFilter.value;
      const opts =
        '<option value="ALL">Todos los Sectores</option>' +
        this.departments.map((d) => `<option value="${d.id}">${d.name}</option>`).join('');
      updateSearchableSelect(deptFilter, opts, currentVal || 'ALL');
    }

    const slipsDept = document.getElementById('slips-department-filter');
    if (slipsDept) {
      const currentVal = slipsDept.value;
      const opts =
        '<option value="ALL">Todos los Sectores</option>' +
        this.departments.map((d) => `<option value="${d.id}">${d.name}</option>`).join('');
      updateSearchableSelect(slipsDept, opts, currentVal || 'ALL');
    }

    this.renderDepartmentsTable();
    this.renderJobPositionsTable();
    this.renderWorkShiftsTable();
    this.renderHealthInsurancesTable();
    this.renderUnionsTable();
    this.renderMutualsTable();
    this.renderKinshipsTable();
  }

  async loadEmployees() {
    const tbody = document.getElementById('employees-table-body');
    const paginationContainer = document.getElementById('employees-pagination-container');
    if (paginationContainer) paginationContainer.classList.add('d-none');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-5 text-muted">
            <span class="spinner-border spinner-border-sm text-teal me-2" role="status"></span>
            Cargando nómina de colaboradores...
          </td>
        </tr>
      `;
    }

    const search = document.getElementById('employee-search-input')?.value || '';
    const departmentId = document.getElementById('employee-filter-department')?.value || 'ALL';
    const status = document.getElementById('employee-filter-status')?.value || 'ALL';

    const params = new URLSearchParams();
    params.append('limit', '5000');
    if (search.trim()) params.append('search', search.trim());
    if (departmentId && departmentId !== 'ALL') params.append('departmentId', departmentId);
    if (status && status !== 'ALL') params.append('status', status);

    try {
      const res = await apiRequest(`/employees?${params.toString()}`);
      this.employees = res.data || [];
    } catch (err) {
      console.error('Error al cargar empleados:', err);
      this.employees = [];
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center py-4 text-danger">
              <i class="ti ti-alert-triangle me-1"></i> Error al cargar empleados: ${escapeHtml(err.message || 'Error de conexión')}
            </td>
          </tr>
        `;
      }
      return;
    }

    // Actualizar badge de cantidad de empleados en el sidebar
    const empBadge = document.getElementById('personnel-badge-emp-count');
    if (empBadge) {
      const activeCount = this.employees.filter((e) => e.status === 'ACTIVE').length;
      empBadge.textContent = activeCount;
    }

    this.renderEmployeesTable();
  }

  // --- Render Tablas ---

  renderEmployeesTable() {
    const tbody = document.getElementById('employees-table-body');
    if (!tbody) return;

    const TooltipClass = window.bootstrap?.Tooltip || window.tabler?.Tooltip;
    if (TooltipClass) {
      tbody.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
        const inst = TooltipClass.getInstance(el);
        if (inst) inst.dispose();
      });
    }

    const paginationContainer = document.getElementById('employees-pagination-container');
    const paginationInfo = document.getElementById('employees-pagination-info');
    const paginationList = document.getElementById('employees-pagination-list');

    if (this.employees.length === 0) {
      if (paginationContainer) paginationContainer.classList.add('d-none');
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-5 text-muted">
            <i class="ti ti-users-off fs-1 d-block mb-2 text-teal opacity-50"></i>
            No se encontraron empleados registrados con los filtros seleccionados.
          </td>
        </tr>
      `;
      return;
    }

    const pageSize = this.employeesPageSize || 5;
    const totalPages = Math.ceil(this.employees.length / pageSize) || 1;
    if (this.employeesPage > totalPages) this.employeesPage = totalPages;
    if (this.employeesPage < 1) this.employeesPage = 1;

    const startIndex = (this.employeesPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, this.employees.length);
    const paginatedItems = this.employees.slice(startIndex, endIndex);

    if (paginationContainer) paginationContainer.classList.remove('d-none');
    if (paginationInfo) {
      const searchVal = document.getElementById('employee-search-input')?.value?.trim();
      const isFiltered = searchVal ||
        (document.getElementById('employee-filter-department')?.value !== 'ALL') ||
        (document.getElementById('employee-filter-status')?.value !== 'ALL');

      paginationInfo.innerHTML = `Mostrando <strong>${startIndex + 1}</strong> a <strong>${endIndex}</strong> de <strong>${this.employees.length}</strong> colaboradores` +
        (isFiltered ? ' (filtrados)' : '');
    }

    if (paginationList) {
      this.renderPaginationControls(paginationList, this.employeesPage, totalPages, (newPage) => {
        this.employeesPage = newPage;
        this.renderEmployeesTable();
      });
    }

    tbody.innerHTML = paginatedItems
      .map((emp) => {
        const initials = `${(emp.lastName || '')[0] || ''}${(emp.firstName || '')[0] || ''}`.toUpperCase() || 'EM';
        const statusBadge =
          emp.status === 'ACTIVE'
            ? '<span class="badge bg-success-lt"><i class="ti ti-check me-1"></i>Activo</span>'
            : emp.status === 'ON_LEAVE'
            ? '<span class="badge bg-warning-lt"><i class="ti ti-clock me-1"></i>Licencia</span>'
            : '<span class="badge bg-danger-lt"><i class="ti ti-x me-1"></i>Inactivo</span>';

        const hireDateFormatted = emp.hireDate ? new Date(emp.hireDate).toLocaleDateString('es-AR') : '-';
        const cuitFormatted = emp.cuil ? formatCuit(emp.cuil) : '-';
        const docFormatted = `${emp.documentType || 'DNI'} ${emp.documentNumber || ''}`;

        const photoAvatarHtml = emp.photo
          ? `<span class="avatar avatar-md rounded-circle me-2 border border-2 border-teal shadow-xs" style="background-image: url('${escapeHtml(emp.photo)}'); background-size: cover; background-position: center;"></span>`
          : `<span class="avatar avatar-md bg-teal-lt text-teal rounded-circle me-2 fw-bold border border-teal-lt">${initials}</span>`;

        return `
          <tr>
            <td class="font-monospace fw-bold text-teal">${escapeHtml(emp.fileNumber || '-')}</td>
            <td>
              <div class="d-flex align-items-center">
                ${photoAvatarHtml}
                <div>
                  <div class="fw-bold text-dark">${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}</div>
                  <small class="text-muted">${escapeHtml(emp.email || emp.phone || 'Sin contacto')}</small>
                </div>
              </div>
            </td>
            <td>
              <div>${escapeHtml(docFormatted)}</div>
              <small class="text-muted font-monospace">${escapeHtml(cuitFormatted)}</small>
            </td>
            <td>
              <div class="fw-medium text-teal">${escapeHtml(emp.department?.name || 'Sin sector')}</div>
              <small class="text-muted">${escapeHtml(emp.jobPosition?.name || 'Sin puesto')}</small>
            </td>
            <td>${hireDateFormatted}</td>
            <td>${statusBadge}</td>
            <td class="text-end text-nowrap">
              <div class="d-inline-flex gap-1">
                <button type="button" class="btn btn-sm btn-icon btn-outline-primary btn-edit-employee" data-id="${emp.id}" data-bs-toggle="tooltip" data-bs-placement="top" title="Modificar Ficha">
                  <i class="ti ti-edit"></i>
                </button>
                ${
                  emp.status === 'ACTIVE'
                    ? `
                  <button type="button" class="btn btn-sm btn-icon btn-outline-danger btn-delete-employee" data-id="${emp.id}" data-name="${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}" data-bs-toggle="tooltip" data-bs-placement="top" title="Dar de Baja">
                    <i class="ti ti-user-x"></i>
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

    if (TooltipClass) {
      tbody.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
        new TooltipClass(el);
      });
    }

    tbody.querySelectorAll('.btn-edit-employee').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tip = TooltipClass ? TooltipClass.getInstance(btn) : null;
        if (tip) tip.hide();
        const emp = this.employees.find((x) => x.id === btn.dataset.id);
        if (emp) this.openEditEmployeeModal(emp);
      });
    });

    tbody.querySelectorAll('.btn-delete-employee').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tip = TooltipClass ? TooltipClass.getInstance(btn) : null;
        if (tip) tip.hide();
        this.deleteEmployee(btn.dataset.id, btn.dataset.name);
      });
    });
  }

  // --- Utilidad Reutilizable de Paginación de Tablas ---
  renderPaginationControls(listEl, currentPage, totalPages, onPageChange) {
    if (!listEl) return;
    if (totalPages <= 1) {
      listEl.innerHTML = '';
      return;
    }

    let itemsHtml = '';

    // Botón Anterior
    const prevDisabled = currentPage <= 1;
    itemsHtml += `
      <li class="page-item ${prevDisabled ? 'disabled' : ''}">
        <a class="page-link btn-page-prev" href="#" tabindex="${prevDisabled ? '-1' : '0'}" aria-label="Anterior" title="Página anterior">
          <i class="ti ti-chevron-left"></i>
        </a>
      </li>
    `;

    // Rango de páginas a mostrar
    const pagesToShow = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pagesToShow.push(i);
    } else {
      pagesToShow.push(1);
      if (currentPage > 3) pagesToShow.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pagesToShow.push(i);
      if (currentPage < totalPages - 2) pagesToShow.push('...');
      pagesToShow.push(totalPages);
    }

    pagesToShow.forEach((p) => {
      if (p === '...') {
        itemsHtml += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
      } else {
        const isActive = p === currentPage;
        itemsHtml += `
          <li class="page-item ${isActive ? 'active' : ''}">
            <a class="page-link btn-page-num" href="#" data-page="${p}">${p}</a>
          </li>
        `;
      }
    });

    // Botón Siguiente
    const nextDisabled = currentPage >= totalPages;
    itemsHtml += `
      <li class="page-item ${nextDisabled ? 'disabled' : ''}">
        <a class="page-link btn-page-next" href="#" tabindex="${nextDisabled ? '-1' : '0'}" aria-label="Siguiente" title="Página siguiente">
          <i class="ti ti-chevron-right"></i>
        </a>
      </li>
    `;

    listEl.innerHTML = itemsHtml;

    // Asignar listeners
    listEl.querySelectorAll('.btn-page-prev').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage > 1) onPageChange(currentPage - 1);
      });
    });

    listEl.querySelectorAll('.btn-page-next').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage < totalPages) onPageChange(currentPage + 1);
      });
    });

    listEl.querySelectorAll('.btn-page-num').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const p = parseInt(btn.dataset.page, 10);
        if (p && p !== currentPage) onPageChange(p);
      });
    });
  }

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

  renderHealthInsurancesTable() {
    const tbody = document.getElementById('health-insurances-table-body');
    if (!tbody) return;

    const searchTerm = document.getElementById('health-insurance-search-input')?.value?.toLowerCase().trim() || '';
    const cleanSearch = searchTerm.replace(/[-\s]/g, '');
    const filtered = this.healthInsurances.filter((h) => {
      if (!searchTerm) return true;
      const cleanCode = (h.code || '').replace(/[-\s]/g, '').toLowerCase();
      return (
        (h.name && h.name.toLowerCase().includes(searchTerm)) ||
        (h.code && h.code.toLowerCase().includes(searchTerm)) ||
        (cleanSearch && cleanCode && cleanCode.includes(cleanSearch))
      );
    });

    const countLabel = document.getElementById('health-insurances-count-label');
    if (countLabel) countLabel.textContent = this.healthInsurances.length;

    const paginationContainer = document.getElementById('health-insurances-pagination-container');
    const paginationInfo = document.getElementById('health-insurances-pagination-info');
    const paginationList = document.getElementById('health-insurances-pagination-list');

    if (filtered.length === 0) {
      if (paginationContainer) paginationContainer.classList.add('d-none');
      if (searchTerm) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-5 text-muted">
              <i class="ti ti-search-off fs-1 d-block mb-2 text-teal"></i>
              No se encontraron obras sociales que coincidan con "<strong>${escapeHtml(searchTerm)}</strong>".
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-5 text-muted">
              <i class="ti ti-first-aid-kit fs-1 d-block mb-2 text-teal opacity-50"></i>
              <div class="fw-bold mb-1">No hay obras sociales registradas</div>
              <small class="d-block mb-3">Registra agentes del seguro de salud para la cobertura del personal.</small>
              <button class="btn btn-sm btn-personnel" onclick="document.getElementById('btn-open-new-health-insurance-modal').click()">
                <i class="ti ti-plus me-1"></i> Registrar Primera Obra Social
              </button>
            </td>
          </tr>
        `;
      }
      return;
    }

    const pageSize = this.healthInsurancesPageSize || 5;
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (this.healthInsurancesPage > totalPages) this.healthInsurancesPage = totalPages;
    if (this.healthInsurancesPage < 1) this.healthInsurancesPage = 1;

    const startIndex = (this.healthInsurancesPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filtered.length);
    const paginatedItems = filtered.slice(startIndex, endIndex);

    if (paginationContainer) paginationContainer.classList.remove('d-none');
    if (paginationInfo) {
      paginationInfo.innerHTML = `Mostrando <strong>${startIndex + 1}</strong> a <strong>${endIndex}</strong> de <strong>${filtered.length}</strong> obras sociales` +
        (searchTerm ? ` (filtrados de ${this.healthInsurances.length})` : '');
    }

    if (paginationList) {
      this.renderPaginationControls(paginationList, this.healthInsurancesPage, totalPages, (newPage) => {
        this.healthInsurancesPage = newPage;
        this.renderHealthInsurancesTable();
      });
    }

    tbody.innerHTML = paginatedItems
      .map((h) => {
        const codeBadge = h.code
          ? `<span class="badge bg-teal-lt text-teal font-monospace px-2 py-1">${escapeHtml(h.code)}</span>`
          : `<span class="badge bg-secondary-lt text-muted font-monospace px-2 py-1">S/C</span>`;

        const empBadge =
          (h.employeeCount || 0) > 0
            ? `<button class="btn btn-sm btn-outline-teal btn-filter-hi-employees py-0 px-2" data-id="${h.id}" title="Ver empleados afiliados">
                <i class="ti ti-users me-1"></i><strong>${h.employeeCount}</strong> ${h.employeeCount === 1 ? 'afiliado' : 'afiliados'}
               </button>`
            : `<span class="badge bg-light text-muted border"><i class="ti ti-user-x me-1"></i>0 afiliados</span>`;

        return `
          <tr>
            <td>${codeBadge}</td>
            <td>
              <div class="d-flex align-items-center">
                <span class="avatar avatar-xs bg-teal-lt text-teal rounded me-2">
                  <i class="ti ti-first-aid-kit"></i>
                </span>
                <span class="fw-bold text-dark">${escapeHtml(h.name)}</span>
              </div>
            </td>
            <td class="text-center">${empBadge}</td>
            <td class="text-end">
              <div class="d-inline-flex gap-1">
                <button class="btn btn-sm btn-outline-primary btn-edit-hi" data-id="${h.id}" title="Editar Obra Social">
                  <i class="ti ti-edit me-1"></i>Editar
                </button>
                <button class="btn btn-sm btn-outline-danger btn-delete-hi" data-id="${h.id}" data-name="${escapeHtml(h.name)}" data-count="${h.employeeCount || 0}" title="Eliminar Obra Social">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-hi').forEach((btn) => {
      btn.addEventListener('click', () => {
        const h = this.healthInsurances.find((x) => x.id === btn.dataset.id);
        if (h) this.openEditHealthInsuranceModal(h);
      });
    });

    tbody.querySelectorAll('.btn-delete-hi').forEach((btn) => {
      btn.addEventListener('click', () => {
        const count = parseInt(btn.dataset.count, 10) || 0;
        this.deleteHealthInsurance(btn.dataset.id, btn.dataset.name, count);
      });
    });

    tbody.querySelectorAll('.btn-filter-hi-employees').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchPersonnelPane('#pane-personnel-employees');
      });
    });
  }

  renderUnionsTable() {
    const tbody = document.getElementById('unions-table-body');
    if (!tbody) return;

    const searchTerm = document.getElementById('union-search-input')?.value?.toLowerCase().trim() || '';
    const filtered = this.unions.filter((u) => {
      if (!searchTerm) return true;
      return (
        (u.name && u.name.toLowerCase().includes(searchTerm)) ||
        (u.code && u.code.toLowerCase().includes(searchTerm))
      );
    });

    const countLabel = document.getElementById('unions-count-label');
    if (countLabel) countLabel.textContent = this.unions.length;

    const paginationContainer = document.getElementById('unions-pagination-container');
    const paginationInfo = document.getElementById('unions-pagination-info');
    const paginationList = document.getElementById('unions-pagination-list');

    if (filtered.length === 0) {
      if (paginationContainer) paginationContainer.classList.add('d-none');
      if (searchTerm) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-5 text-muted">
              <i class="ti ti-search-off fs-1 d-block mb-2 text-teal"></i>
              No se encontraron sindicatos que coincidan con "<strong>${escapeHtml(searchTerm)}</strong>".
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-5 text-muted">
              <i class="ti ti-certificate fs-1 d-block mb-2 text-teal opacity-50"></i>
              <div class="fw-bold mb-1">No hay sindicatos registrados</div>
              <small class="d-block mb-3">Registra los convenios y entidades gremiales a las que adhiere la empresa.</small>
              <button class="btn btn-sm btn-personnel" onclick="document.getElementById('btn-open-new-union-modal').click()">
                <i class="ti ti-plus me-1"></i> Registrar Primer Sindicato
              </button>
            </td>
          </tr>
        `;
      }
      return;
    }

    const pageSize = this.unionsPageSize || 5;
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (this.unionsPage > totalPages) this.unionsPage = totalPages;
    if (this.unionsPage < 1) this.unionsPage = 1;

    const startIndex = (this.unionsPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filtered.length);
    const paginatedItems = filtered.slice(startIndex, endIndex);

    if (paginationContainer) paginationContainer.classList.remove('d-none');
    if (paginationInfo) {
      paginationInfo.innerHTML = `Mostrando <strong>${startIndex + 1}</strong> a <strong>${endIndex}</strong> de <strong>${filtered.length}</strong> sindicatos` +
        (searchTerm ? ` (filtrados de ${this.unions.length})` : '');
    }

    if (paginationList) {
      this.renderPaginationControls(paginationList, this.unionsPage, totalPages, (newPage) => {
        this.unionsPage = newPage;
        this.renderUnionsTable();
      });
    }

    tbody.innerHTML = paginatedItems
      .map((u) => {
        const codeBadge = u.code
          ? `<span class="badge bg-teal-lt text-teal font-monospace px-2 py-1">${escapeHtml(u.code)}</span>`
          : `<span class="badge bg-secondary-lt text-muted font-monospace px-2 py-1">S/C</span>`;

        const empBadge =
          (u.employeeCount || 0) > 0
            ? `<button class="btn btn-sm btn-outline-teal btn-filter-union-employees py-0 px-2" data-id="${u.id}" title="Ver empleados afiliados">
                <i class="ti ti-users me-1"></i><strong>${u.employeeCount}</strong> ${u.employeeCount === 1 ? 'afiliado' : 'afiliados'}
               </button>`
            : `<span class="badge bg-light text-muted border"><i class="ti ti-user-x me-1"></i>0 afiliados</span>`;

        return `
          <tr>
            <td>${codeBadge}</td>
            <td>
              <div class="d-flex align-items-center">
                <span class="avatar avatar-xs bg-teal-lt text-teal rounded me-2">
                  <i class="ti ti-certificate"></i>
                </span>
                <span class="fw-bold text-dark">${escapeHtml(u.name)}</span>
              </div>
            </td>
            <td class="text-center">${empBadge}</td>
            <td class="text-end">
              <div class="d-inline-flex gap-1">
                <button class="btn btn-sm btn-outline-primary btn-edit-union" data-id="${u.id}" title="Editar Sindicato">
                  <i class="ti ti-edit me-1"></i>Editar
                </button>
                <button class="btn btn-sm btn-outline-danger btn-delete-union" data-id="${u.id}" data-name="${escapeHtml(u.name)}" data-count="${u.employeeCount || 0}" title="Eliminar Sindicato">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-union').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = this.unions.find((x) => x.id === btn.dataset.id);
        if (u) this.openEditUnionModal(u);
      });
    });

    tbody.querySelectorAll('.btn-delete-union').forEach((btn) => {
      btn.addEventListener('click', () => {
        const count = parseInt(btn.dataset.count, 10) || 0;
        this.deleteUnion(btn.dataset.id, btn.dataset.name, count);
      });
    });

    tbody.querySelectorAll('.btn-filter-union-employees').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchPersonnelPane('#pane-personnel-employees');
      });
    });
  }

  renderMutualsTable() {
    const tbody = document.getElementById('mutuals-table-body');
    if (!tbody) return;

    const searchTerm = document.getElementById('mutual-search-input')?.value?.toLowerCase().trim() || '';
    const filtered = this.mutuals.filter((m) => {
      if (!searchTerm) return true;
      return (
        (m.name && m.name.toLowerCase().includes(searchTerm)) ||
        (m.code && m.code.toLowerCase().includes(searchTerm))
      );
    });

    const countLabel = document.getElementById('mutuals-count-label');
    if (countLabel) countLabel.textContent = this.mutuals.length;

    const paginationContainer = document.getElementById('mutuals-pagination-container');
    const paginationInfo = document.getElementById('mutuals-pagination-info');
    const paginationList = document.getElementById('mutuals-pagination-list');

    if (filtered.length === 0) {
      if (paginationContainer) paginationContainer.classList.add('d-none');
      if (searchTerm) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-5 text-muted">
              <i class="ti ti-search-off fs-1 d-block mb-2 text-teal"></i>
              No se encontraron mutuales que coincidan con "<strong>${escapeHtml(searchTerm)}</strong>".
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-5 text-muted">
              <i class="ti ti-heart-handshake fs-1 d-block mb-2 text-teal opacity-50"></i>
              <div class="fw-bold mb-1">No hay mutuales registradas</div>
              <small class="d-block mb-3">Registra mutuales o beneficios complementarios para el personal.</small>
              <button class="btn btn-sm btn-personnel" onclick="document.getElementById('btn-open-new-mutual-modal').click()">
                <i class="ti ti-plus me-1"></i> Registrar Primera Mutual
              </button>
            </td>
          </tr>
        `;
      }
      return;
    }

    const pageSize = this.mutualsPageSize || 5;
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (this.mutualsPage > totalPages) this.mutualsPage = totalPages;
    if (this.mutualsPage < 1) this.mutualsPage = 1;

    const startIndex = (this.mutualsPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filtered.length);
    const paginatedItems = filtered.slice(startIndex, endIndex);

    if (paginationContainer) paginationContainer.classList.remove('d-none');
    if (paginationInfo) {
      paginationInfo.innerHTML = `Mostrando <strong>${startIndex + 1}</strong> a <strong>${endIndex}</strong> de <strong>${filtered.length}</strong> mutuales` +
        (searchTerm ? ` (filtrados de ${this.mutuals.length})` : '');
    }

    if (paginationList) {
      this.renderPaginationControls(paginationList, this.mutualsPage, totalPages, (newPage) => {
        this.mutualsPage = newPage;
        this.renderMutualsTable();
      });
    }

    tbody.innerHTML = paginatedItems
      .map((m) => {
        const codeBadge = m.code
          ? `<span class="badge bg-teal-lt text-teal font-monospace px-2 py-1">${escapeHtml(m.code)}</span>`
          : `<span class="badge bg-secondary-lt text-muted font-monospace px-2 py-1">S/C</span>`;

        const empBadge =
          (m.employeeCount || 0) > 0
            ? `<button class="btn btn-sm btn-outline-teal btn-filter-mutual-employees py-0 px-2" data-id="${m.id}" title="Ver empleados afiliados">
                <i class="ti ti-users me-1"></i><strong>${m.employeeCount}</strong> ${m.employeeCount === 1 ? 'afiliado' : 'afiliados'}
               </button>`
            : `<span class="badge bg-light text-muted border"><i class="ti ti-user-x me-1"></i>0 afiliados</span>`;

        return `
          <tr>
            <td>${codeBadge}</td>
            <td>
              <div class="d-flex align-items-center">
                <span class="avatar avatar-xs bg-teal-lt text-teal rounded me-2">
                  <i class="ti ti-heart-handshake"></i>
                </span>
                <span class="fw-bold text-dark">${escapeHtml(m.name)}</span>
              </div>
            </td>
            <td class="text-center">${empBadge}</td>
            <td class="text-end">
              <div class="d-inline-flex gap-1">
                <button class="btn btn-sm btn-outline-primary btn-edit-mutual" data-id="${m.id}" title="Editar Mutual">
                  <i class="ti ti-edit me-1"></i>Editar
                </button>
                <button class="btn btn-sm btn-outline-danger btn-delete-mutual" data-id="${m.id}" data-name="${escapeHtml(m.name)}" data-count="${m.employeeCount || 0}" title="Eliminar Mutual">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-mutual').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = this.mutuals.find((x) => x.id === btn.dataset.id);
        if (m) this.openEditMutualModal(m);
      });
    });

    tbody.querySelectorAll('.btn-delete-mutual').forEach((btn) => {
      btn.addEventListener('click', () => {
        const count = parseInt(btn.dataset.count, 10) || 0;
        this.deleteMutual(btn.dataset.id, btn.dataset.name, count);
      });
    });

    tbody.querySelectorAll('.btn-filter-mutual-employees').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchPersonnelPane('#pane-personnel-employees');
      });
    });
  }

  renderKinshipsTable() {
    const tbody = document.getElementById('kinships-table-body');
    if (!tbody) return;

    const searchTerm = document.getElementById('kinship-search-input')?.value?.toLowerCase().trim() || '';
    const filtered = this.kinships.filter((k) => {
      if (!searchTerm) return true;
      return (
        (k.name && k.name.toLowerCase().includes(searchTerm)) ||
        (k.code && k.code.toLowerCase().includes(searchTerm))
      );
    });

    const countLabel = document.getElementById('kinships-count-label');
    if (countLabel) countLabel.textContent = this.kinships.length;

    const paginationContainer = document.getElementById('kinships-pagination-container');
    const paginationInfo = document.getElementById('kinships-pagination-info');
    const paginationList = document.getElementById('kinships-pagination-list');

    if (filtered.length === 0) {
      if (paginationContainer) paginationContainer.classList.add('d-none');
      if (searchTerm) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-5 text-muted">
              <i class="ti ti-search-off fs-1 d-block mb-2 text-teal"></i>
              No se encontraron parentescos que coincidan con "<strong>${escapeHtml(searchTerm)}</strong>".
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-5 text-muted">
              <i class="ti ti-heart-handshake fs-1 d-block mb-2 text-teal opacity-50"></i>
              <div class="fw-bold mb-1">No hay parentescos registrados</div>
              <small class="d-block mb-3">Registra los vínculos familiares para asignar a los colaboradores.</small>
              <button class="btn btn-sm btn-personnel" onclick="document.getElementById('btn-open-new-kinship-modal').click()">
                <i class="ti ti-plus me-1"></i> Registrar Primer Parentesco
              </button>
            </td>
          </tr>
        `;
      }
      return;
    }

    const pageSize = this.kinshipsPageSize || 5;
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (this.kinshipsPage > totalPages) this.kinshipsPage = totalPages;
    if (this.kinshipsPage < 1) this.kinshipsPage = 1;

    const startIndex = (this.kinshipsPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filtered.length);
    const paginatedItems = filtered.slice(startIndex, endIndex);

    if (paginationContainer) paginationContainer.classList.remove('d-none');
    if (paginationInfo) {
      paginationInfo.innerHTML = `Mostrando <strong>${startIndex + 1}</strong> a <strong>${endIndex}</strong> de <strong>${filtered.length}</strong> parentescos` +
        (searchTerm ? ` (filtrados de ${this.kinships.length})` : '');
    }

    if (paginationList) {
      this.renderPaginationControls(paginationList, this.kinshipsPage, totalPages, (newPage) => {
        this.kinshipsPage = newPage;
        this.renderKinshipsTable();
      });
    }

    tbody.innerHTML = paginatedItems
      .map((k) => {
        const codeBadge = k.code
          ? `<span class="badge bg-teal-lt text-teal font-monospace px-2 py-1">${escapeHtml(k.code)}</span>`
          : `<span class="badge bg-secondary-lt text-muted font-monospace px-2 py-1">S/C</span>`;

        const relBadge =
          (k.relativeCount || 0) > 0
            ? `<span class="badge bg-teal-lt text-teal"><i class="ti ti-users me-1"></i><strong>${k.relativeCount}</strong> ${k.relativeCount === 1 ? 'familiar' : 'familiares'}</span>`
            : `<span class="badge bg-light text-muted border"><i class="ti ti-user-x me-1"></i>0 familiares</span>`;

        return `
          <tr>
            <td>${codeBadge}</td>
            <td>
              <div class="d-flex align-items-center">
                <span class="avatar avatar-xs bg-teal-lt text-teal rounded me-2">
                  <i class="ti ti-heart-handshake"></i>
                </span>
                <span class="fw-bold text-dark">${escapeHtml(k.name)}</span>
              </div>
            </td>
            <td class="text-center">${relBadge}</td>
            <td class="text-end">
              <div class="d-inline-flex gap-1">
                <button class="btn btn-sm btn-outline-primary btn-edit-kinship" data-id="${k.id}" title="Editar Parentesco">
                  <i class="ti ti-edit me-1"></i>Editar
                </button>
                <button class="btn btn-sm btn-outline-danger btn-delete-kinship" data-id="${k.id}" data-name="${escapeHtml(k.name)}" data-count="${k.relativeCount || 0}" title="Eliminar Parentesco">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-kinship').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = this.kinships.find((x) => x.id === btn.dataset.id);
        if (k) this.openEditKinshipModal(k);
      });
    });

    tbody.querySelectorAll('.btn-delete-kinship').forEach((btn) => {
      btn.addEventListener('click', () => {
        const count = parseInt(btn.dataset.count, 10) || 0;
        this.deleteKinship(btn.dataset.id, btn.dataset.name, count);
      });
    });
  }

  renderEmployeeRelativesTable() {
    const tbody = document.getElementById('employee-relatives-table-body');
    const tabCount = document.getElementById('emp-relatives-tab-count');
    if (tabCount) tabCount.textContent = this.currentEmployeeRelatives.length;

    if (!tbody) return;

    if (this.currentEmployeeRelatives.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-muted">
            <i class="ti ti-users-off fs-2 d-block mb-1 text-teal opacity-50"></i>
            No hay familiares registrados para este empleado.<br>
            <small>Haz clic en "<strong>+ Agregar Familiar</strong>" para registrar cónyuge, hijos u otras cargas familiares.</small>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.currentEmployeeRelatives
      .map((rel, idx) => {
        const kinName =
          rel.kinship?.name ||
          this.kinships.find((k) => k.id === rel.kinshipId)?.name ||
          'Vínculo no especificado';

        let ageStr = '';
        let birthStr = '-';
        if (rel.birthDate) {
          const bDate = new Date(rel.birthDate);
          birthStr = bDate.toLocaleDateString('es-AR');
          const today = new Date();
          let age = today.getFullYear() - bDate.getFullYear();
          const m = today.getMonth() - bDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) {
            age--;
          }
          if (age >= 0) {
            ageStr = ` <span class="badge bg-light text-muted border ms-1">${age} años</span>`;
          }
        }

        const docStr = `${escapeHtml(rel.documentType || 'DNI')} ${escapeHtml(rel.documentNumber || '-')}`;
        const cuilStr = rel.cuil ? formatCuit(rel.cuil) : '<span class="text-muted">-</span>';

        return `
          <tr>
            <td>
              <span class="badge bg-teal-lt text-teal fw-bold">
                <i class="ti ti-heart-handshake me-1"></i>${escapeHtml(kinName)}
              </span>
            </td>
            <td>
              <div class="fw-bold text-dark">${escapeHtml(rel.lastName)}, ${escapeHtml(rel.firstName)}</div>
            </td>
            <td class="font-monospace">${docStr}</td>
            <td class="font-monospace">${cuilStr}</td>
            <td>${birthStr}${ageStr}</td>
            <td class="text-end">
              <div class="d-inline-flex gap-1">
                <button type="button" class="btn btn-sm btn-icon btn-outline-primary btn-edit-relative" data-index="${idx}" title="Editar familiar">
                  <i class="ti ti-edit"></i>
                </button>
                <button type="button" class="btn btn-sm btn-icon btn-outline-danger btn-delete-relative" data-index="${idx}" title="Eliminar familiar">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-relative').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        this.openEditRelativeModal(idx);
      });
    });

    tbody.querySelectorAll('.btn-delete-relative').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        this.deleteRelativeFromForm(idx);
      });
    });
  }

  // --- Helpers de Formato Horario (HH:MM) y Jornada ---

  parseHoursToDecimal(str) {
    if (!str) return 0;
    const parts = String(str).trim().split(':');
    if (parts.length !== 2) return parseFloat(str) || 0;
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return Math.round((h + m / 60) * 100) / 100;
  }

  formatDecimalToHours(decimalVal, defaultVal = '00:00') {
    if (decimalVal === undefined || decimalVal === null || isNaN(decimalVal) || decimalVal === '') {
      return defaultVal;
    }
    const totalMinutes = Math.round(Number(decimalVal) * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  updateEmployeeJornadaBadge() {
    const isPartTime = Boolean(document.getElementById('employee-input-is-part-time')?.checked);
    const weeklyStr = document.getElementById('employee-input-weekly-hours')?.value || (this.payrollSettings?.standardWeeklyHoursFormatted || '48:00');
    const stdWeeklyStr = this.payrollSettings?.standardWeeklyHoursFormatted || '48:00';
    const weeklyDec = this.parseHoursToDecimal(weeklyStr);
    const stdWeeklyDec = this.parseHoursToDecimal(stdWeeklyStr) || 48;

    let pct = 100;
    if (stdWeeklyDec > 0) {
      pct = Math.round((weeklyDec / stdWeeklyDec) * 10000) / 100;
      if (pct > 100) pct = 100;
      if (pct < 1) pct = 1;
    }

    const shiftId = document.getElementById('employee-select-work-shift')?.value;
    const shift = shiftId ? (this.workShifts || []).find((s) => s.id === shiftId) : null;
    if (shift && shift.percentage !== undefined && shift.percentage !== null) {
      pct = Number(shift.percentage);
    }

    const pctInput = document.getElementById('employee-input-part-time-pct');
    if (pctInput) pctInput.value = pct;

    const badge = document.getElementById('emp-jornada-badge');
    if (badge) {
      if (shift) {
        badge.innerHTML = `<i class="ti ti-clock-check me-1"></i>${escapeHtml(shift.name)} (${Number(pct).toFixed(0)}% / ${Number(shift.weeklyHours).toFixed(1)}hs sem)`;
        badge.className = 'badge bg-blue text-white shadow-xs';
      } else if (isPartTime || pct < 100) {
        badge.textContent = `Jornada Parcial (${pct}%)`;
        badge.className = 'badge bg-warning text-dark';
      } else {
        badge.textContent = `Jornada Completa (${pct}%)`;
        badge.className = 'badge bg-teal text-white';
      }
    }
  }

  updateCbuValidationUI() {
    const cbuInput = document.getElementById('employee-input-cbu');
    const cbuStatus = document.getElementById('employee-cbu-status');
    const cbuFeedback = document.getElementById('employee-cbu-feedback');
    const cbuBadge = document.getElementById('employee-cbu-bank-badge');
    if (!cbuInput) return;

    const val = cbuInput.value.replace(/\D/g, '');
    cbuInput.value = val;

    if (!val) {
      cbuInput.classList.remove('is-valid', 'is-invalid');
      if (cbuStatus) cbuStatus.innerHTML = '<i class="ti ti-credit-card text-muted"></i>';
      if (cbuFeedback) {
        cbuFeedback.className = 'form-hint';
        cbuFeedback.textContent = 'Ingresá los 22 dígitos numéricos. Se validarán los dígitos verificadores según el procedimiento del B.C.R.A.';
      }
      if (cbuBadge) {
        cbuBadge.className = 'badge bg-secondary-lt font-monospace';
        cbuBadge.textContent = 'Sin C.B.U.';
      }
      return;
    }

    const bankName = getCbuBankName(val);

    if (val.length === 22) {
      if (isValidCbu(val)) {
        cbuInput.classList.remove('is-invalid');
        cbuInput.classList.add('is-valid');
        if (cbuStatus) cbuStatus.innerHTML = '<i class="ti ti-check text-success"></i>';
        if (cbuFeedback) {
          cbuFeedback.className = 'valid-feedback d-block';
          cbuFeedback.innerHTML = `✓ C.B.U. válido (${escapeHtml(bankName || 'Entidad Bancaria')})`;
        }
        if (cbuBadge) {
          cbuBadge.className = 'badge bg-success-lt font-monospace';
          cbuBadge.innerHTML = `<i class="ti ti-building-bank me-1"></i>${escapeHtml(bankName || 'Banco Oficial')}`;
        }
      } else {
        cbuInput.classList.remove('is-valid');
        cbuInput.classList.add('is-invalid');
        if (cbuStatus) cbuStatus.innerHTML = '<i class="ti ti-x text-danger"></i>';
        if (cbuFeedback) {
          cbuFeedback.className = 'invalid-feedback d-block';
          cbuFeedback.textContent = '✗ Dígitos verificadores de C.B.U. incorrectos (Algoritmo B.C.R.A.)';
        }
        if (cbuBadge) {
          cbuBadge.className = 'badge bg-danger-lt font-monospace';
          cbuBadge.textContent = 'C.B.U. Inválido';
        }
      }
    } else {
      cbuInput.classList.remove('is-valid', 'is-invalid');
      if (cbuStatus) cbuStatus.innerHTML = '<i class="ti ti-credit-card text-warning"></i>';
      if (cbuFeedback) {
        cbuFeedback.className = 'form-hint text-warning';
        cbuFeedback.textContent = `Ingresando dígitos: ${val.length} / 22...`;
      }
      if (cbuBadge) {
        if (val.length >= 3 && bankName) {
          cbuBadge.className = 'badge bg-info-lt font-monospace';
          cbuBadge.textContent = bankName;
        } else {
          cbuBadge.className = 'badge bg-secondary-lt font-monospace';
          cbuBadge.textContent = 'Verificando...';
        }
      }
    }
  }

  // --- Conceptos Fijos Asignados a Empleados ---

  renderEmployeeConceptsTable() {
    const tbody = document.getElementById('employee-concepts-table-body');
    if (!tbody) return;

    if (!this.currentEmployeeConcepts || this.currentEmployeeConcepts.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-4 text-muted">
            <i class="ti ti-info-circle me-1 text-teal"></i> No posee conceptos fijos asignados aún. Haz clic en "<strong>Asignar Concepto Fijo</strong>" para agregar uno.
          </td>
        </tr>
      `;
      return;
    }

    const typeBadge = {
      REMUNERATIVO: '<span class="badge bg-teal-lt text-teal">REMUNERATIVO</span>',
      NO_REMUNERATIVO: '<span class="badge bg-purple-lt text-purple">NO REMUNERATIVO</span>',
      DESCUENTO: '<span class="badge bg-danger-lt text-danger">DESCUENTO</span>',
      APORTE_PATRONAL: '<span class="badge bg-warning-lt text-warning">APORTE PATRONAL</span>',
    };

    tbody.innerHTML = this.currentEmployeeConcepts
      .map((item, idx) => {
        const conceptsList = (this.allPayrollConcepts && this.allPayrollConcepts.length > 0)
          ? this.allPayrollConcepts
          : (this.payrollConcepts || []);
        const concept = item.concept || conceptsList.find((c) => c.id === item.conceptId) || {};
        const code = concept.code || item.code || '-';
        const name = concept.name || item.name || 'Concepto';
        const type = concept.type || item.type || 'REMUNERATIVO';
        const badge = typeBadge[type] || `<span class="badge bg-secondary-lt">${type}</span>`;
        const amountStr = item.amount !== null && item.amount !== undefined ? `$ ${formatNumber(item.amount)}` : '-';
        const unitsStr = item.units !== null && item.units !== undefined ? formatNumber(item.units) : '-';

        let vigencia = 'Permanente';
        if (item.startDate || item.endDate) {
          const s = item.startDate ? new Date(item.startDate).toLocaleDateString('es-AR') : 'Inicio';
          const e = item.endDate ? new Date(item.endDate).toLocaleDateString('es-AR') : 'Indefinido';
          vigencia = `${s} - ${e}`;
        }

        const statusBadge = item.isActive !== false
          ? '<span class="badge bg-success-lt text-success"><i class="ti ti-check me-1"></i>Activo</span>'
          : '<span class="badge bg-secondary-lt text-secondary"><i class="ti ti-x me-1"></i>Inactivo</span>';

        return `
          <tr>
            <td class="font-monospace fw-bold text-dark">${escapeHtml(code)}</td>
            <td>
              <div class="fw-bold text-dark">${escapeHtml(name)}</div>
              ${item.notes ? `<div class="small text-muted">${escapeHtml(item.notes)}</div>` : ''}
            </td>
            <td>${badge}</td>
            <td class="text-end font-monospace fw-bold">${amountStr}</td>
            <td class="text-center font-monospace">${unitsStr}</td>
            <td class="small text-muted">${vigencia}</td>
            <td class="text-center">${statusBadge}</td>
            <td class="text-end">
              <div class="d-inline-flex gap-1">
                <button type="button" class="btn btn-sm btn-icon btn-outline-teal btn-edit-emp-concept" data-index="${idx}" title="Editar asignación">
                  <i class="ti ti-edit"></i>
                </button>
                <button type="button" class="btn btn-sm btn-icon btn-outline-danger btn-delete-emp-concept" data-index="${idx}" title="Eliminar asignación">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-emp-concept').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        this.openEditEmployeeConceptModal(idx);
      });
    });

    tbody.querySelectorAll('.btn-delete-emp-concept').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        this.deleteEmployeeConceptAssignment(idx);
      });
    });
  }

  async fetchAllPayrollConcepts(forceRefresh = false) {
    if (!this.allPayrollConcepts || this.allPayrollConcepts.length === 0 || forceRefresh) {
      try {
        const res = await apiRequest('/payroll/concepts?limit=1000');
        this.allPayrollConcepts = res.data || [];
      } catch (err) {
        console.warn('Error al cargar catálogo completo de conceptos:', err);
        if (!this.allPayrollConcepts) this.allPayrollConcepts = [];
      }
    }
    return this.allPayrollConcepts;
  }

  async ensurePayrollConceptsLoaded(forceRefresh = false) {
    await this.fetchAllPayrollConcepts(forceRefresh);
  }

  async openAssignConceptModal() {
    await this.ensurePayrollConceptsLoaded();

    const form = document.getElementById('form-assign-employee-concept');
    if (form) form.reset();

    document.getElementById('employee-concept-form-id').value = '';
    document.getElementById('employee-concept-form-employee-id').value = document.getElementById('employee-form-id')?.value || '';
    document.getElementById('modal-assign-employee-concept-title').textContent = 'Asignar Concepto Fijo';
    document.getElementById('assign-concept-alert')?.classList.add('d-none');

    const select = document.getElementById('emp-concept-select');
    if (select) {
      const conceptsList = (this.allPayrollConcepts && this.allPayrollConcepts.length > 0)
        ? this.allPayrollConcepts
        : (this.payrollConcepts || []);
      select.innerHTML = '<option value="">Seleccione un concepto...</option>' +
        conceptsList.map((c) => `<option value="${c.id}">${escapeHtml(c.code)} - ${escapeHtml(c.name)} (${escapeHtml(c.type)})</option>`).join('');
      select.disabled = false;
    }

    document.getElementById('emp-concept-amount').value = '';
    document.getElementById('emp-concept-units').value = '';
    document.getElementById('emp-concept-valid-from').value = '';
    document.getElementById('emp-concept-valid-to').value = '';
    document.getElementById('emp-concept-notes').value = '';
    document.getElementById('emp-concept-is-active').checked = true;

    getBootstrapModal(document.getElementById('modal-assign-employee-concept'))?.show();
  }

  async openEditEmployeeConceptModal(index) {
    await this.ensurePayrollConceptsLoaded();
    const item = this.currentEmployeeConcepts[index];
    if (!item) return;

    document.getElementById('employee-concept-form-id').value = String(index);
    document.getElementById('employee-concept-form-employee-id').value = document.getElementById('employee-form-id')?.value || '';
    document.getElementById('modal-assign-employee-concept-title').textContent = 'Modificar Asignación de Concepto';
    document.getElementById('assign-concept-alert')?.classList.add('d-none');

    const select = document.getElementById('emp-concept-select');
    if (select) {
      const conceptsList = (this.allPayrollConcepts && this.allPayrollConcepts.length > 0)
        ? this.allPayrollConcepts
        : (this.payrollConcepts || []);
      select.innerHTML = '<option value="">Seleccione un concepto...</option>' +
        conceptsList.map((c) => `<option value="${c.id}">${escapeHtml(c.code)} - ${escapeHtml(c.name)} (${escapeHtml(c.type)})</option>`).join('');
      select.value = item.conceptId;
      select.disabled = true; // No cambiar de concepto al editar
    }

    document.getElementById('emp-concept-amount').value = item.amount !== null && item.amount !== undefined ? item.amount : '';
    document.getElementById('emp-concept-units').value = item.units !== null && item.units !== undefined ? item.units : '';
    document.getElementById('emp-concept-valid-from').value = item.startDate ? item.startDate.split('T')[0] : '';
    document.getElementById('emp-concept-valid-to').value = item.endDate ? item.endDate.split('T')[0] : '';
    document.getElementById('emp-concept-notes').value = item.notes || '';
    document.getElementById('emp-concept-is-active').checked = item.isActive !== false;

    getBootstrapModal(document.getElementById('modal-assign-employee-concept'))?.show();
  }

  async saveEmployeeConceptAssignment(e) {
    e.preventDefault();
    const alertBox = document.getElementById('assign-concept-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const indexVal = document.getElementById('employee-concept-form-id').value;
    const employeeId = document.getElementById('employee-form-id')?.value;
    const conceptId = document.getElementById('emp-concept-select').value;
    const amountVal = document.getElementById('emp-concept-amount').value;
    const unitsVal = document.getElementById('emp-concept-units').value;
    const startDateVal = document.getElementById('emp-concept-valid-from').value || null;
    const endDateVal = document.getElementById('emp-concept-valid-to').value || null;
    const notesVal = document.getElementById('emp-concept-notes').value.trim() || null;
    const isActiveVal = Boolean(document.getElementById('emp-concept-is-active').checked);

    if (!conceptId && indexVal === '') {
      if (alertBox) {
        alertBox.textContent = 'Por favor selecciona el concepto a asignar.';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    const payload = {
      conceptId: conceptId || this.currentEmployeeConcepts[parseInt(indexVal, 10)]?.conceptId,
      amount: amountVal !== '' ? parseFloat(amountVal) : null,
      units: unitsVal !== '' ? parseFloat(unitsVal) : null,
      startDate: startDateVal,
      endDate: endDateVal,
      notes: notesVal,
      isActive: isActiveVal,
    };

    const submitBtn = document.getElementById('btn-save-employee-concept');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
    }

    try {
      if (employeeId) {
        if (indexVal !== '') {
          // Edición de asignación existente
          const existing = this.currentEmployeeConcepts[parseInt(indexVal, 10)];
          await apiRequest(`/employees/${employeeId}/concepts/${existing.conceptId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
          showToast('Concepto actualizado correctamente');
        } else {
          // Asignación nueva a empleado existente
          await apiRequest(`/employees/${employeeId}/concepts`, {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          showToast('Concepto asignado exitosamente');
        }
        // Refrescar datos del empleado
        const empRes = await apiRequest(`/employees/${employeeId}`);
        if (empRes.data) {
          this.currentEmployeeConcepts = empRes.data.assignedConcepts || [];
        }
      } else {
        // Modo creación en memoria (nuevo legajo aún no persistido)
        const conceptsList = (this.allPayrollConcepts && this.allPayrollConcepts.length > 0)
          ? this.allPayrollConcepts
          : (this.payrollConcepts || []);
        const conceptObj = conceptsList.find((c) => c.id === payload.conceptId);
        const localItem = {
          ...payload,
          concept: conceptObj,
          code: conceptObj?.code,
          name: conceptObj?.name,
          type: conceptObj?.type,
        };
        if (indexVal !== '') {
          this.currentEmployeeConcepts[parseInt(indexVal, 10)] = localItem;
        } else {
          this.currentEmployeeConcepts.push(localItem);
        }
        showToast('Concepto asignado a la ficha');
      }

      this.renderEmployeeConceptsTable();
      getBootstrapModal(document.getElementById('modal-assign-employee-concept'))?.hide();
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al guardar la asignación';
        alertBox.classList.remove('d-none');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="ti ti-check me-1"></i> Guardar Asignación';
      }
    }
  }

  async deleteEmployeeConceptAssignment(index) {
    const item = this.currentEmployeeConcepts[index];
    if (!item) return;

    const conceptName = item.concept?.name || item.name || 'Concepto';
    const employeeId = document.getElementById('employee-form-id')?.value;

    this.confirmDeleteAction({
      title: 'Quitar Concepto Asignado',
      message: `¿Estás seguro de que deseas quitar el concepto <strong>"${escapeHtml(conceptName)}"</strong> de este colaborador?`,
      confirmText: 'Quitar Concepto',
      onConfirm: async () => {
        if (employeeId && item.conceptId) {
          await apiRequest(`/employees/${employeeId}/concepts/${item.conceptId}`, {
            method: 'DELETE',
          });
          showToast('Concepto quitado exitosamente');
          const empRes = await apiRequest(`/employees/${employeeId}`);
          if (empRes.data) {
            this.currentEmployeeConcepts = empRes.data.assignedConcepts || [];
          }
        } else {
          this.currentEmployeeConcepts.splice(index, 1);
          showToast('Concepto quitado');
        }
        this.renderEmployeeConceptsTable();
      },
    });
  }

  // --- Aumentos Generalizados / Masivos ---

  openMassWageIncreaseModal() {
    const form = document.getElementById('form-mass-wage-increase');
    if (form) form.reset();

    document.getElementById('mass-increase-alert')?.classList.add('d-none');
    document.getElementById('mass-increase-success')?.classList.add('d-none');

    document.getElementById('mass-increase-type').value = 'PERCENTAGE';
    document.getElementById('mass-increase-val').value = '';
    document.getElementById('mass-increase-symbol').textContent = '(%)';
    document.getElementById('mass-increase-unit-addon').textContent = '%';
    document.getElementById('mass-increase-rounding').value = 'DECIMAL_2';
    document.getElementById('mass-increase-target-basic').checked = true;
    document.getElementById('mass-increase-target-hourly').checked = false;
    document.getElementById('mass-increase-target-concepts').checked = false;

    // Poblar sectores
    const deptSelect = document.getElementById('mass-increase-filter-dept');
    if (deptSelect) {
      deptSelect.innerHTML = '<option value="ALL">Todos los Sectores</option>' +
        this.departments.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
    }

    document.getElementById('mass-increase-filter-group').value = 'ALL';
    document.getElementById('mass-increase-count').textContent = '0';

    const tbody = document.getElementById('mass-increase-preview-tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-4 text-muted">
            Hacé click en "<strong>Previsualizar Impacto</strong>" para calcular las variaciones antes de aplicar el aumento.
          </td>
        </tr>
      `;
    }

    document.getElementById('btn-apply-mass-increase').disabled = true;
    this.currentMassIncreasePreview = [];

    getBootstrapModal(document.getElementById('modal-mass-wage-increase'))?.show();
  }

  getMassIncreasePayload() {
    const increaseType = document.getElementById('mass-increase-type').value;
    const increaseValue = parseFloat(document.getElementById('mass-increase-val').value);
    const applyToBasic = Boolean(document.getElementById('mass-increase-target-basic').checked);
    const applyToHourlyRate = Boolean(document.getElementById('mass-increase-target-hourly').checked);
    const applyToConcepts = Boolean(document.getElementById('mass-increase-target-concepts').checked);
    const rounding = document.getElementById('mass-increase-rounding').value;
    const filterDept = document.getElementById('mass-increase-filter-dept').value;
    const filterGroup = document.getElementById('mass-increase-filter-group').value;

    return {
      increaseType,
      increaseValue,
      applyToBasic,
      applyToHourlyRate,
      applyToConcepts,
      rounding,
      filterDepartmentId: filterDept !== 'ALL' ? filterDept : null,
      filterPayrollGroup: filterGroup !== 'ALL' ? filterGroup : null,
      filterStatus: 'ACTIVE',
    };
  }

  async previewMassWageIncrease() {
    const alertBox = document.getElementById('mass-increase-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const payload = this.getMassIncreasePayload();
    if (!payload.increaseValue || payload.increaseValue <= 0) {
      if (alertBox) {
        alertBox.textContent = 'Ingresa un valor de aumento mayor a cero.';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    if (!payload.applyToBasic && !payload.applyToHourlyRate && !payload.applyToConcepts) {
      if (alertBox) {
        alertBox.textContent = 'Selecciona al menos un componente a impactar (Sueldo Básico, Valor Hora o Conceptos).';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    const previewBtn = document.getElementById('btn-preview-mass-increase');
    if (previewBtn) {
      previewBtn.disabled = true;
      previewBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Calculando...';
    }

    try {
      const res = await apiRequest('/employees/mass-wage-increase/preview', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const list = res.data?.preview || [];
      this.currentMassIncreasePreview = list;

      const countEl = document.getElementById('mass-increase-count');
      if (countEl) countEl.textContent = list.length;

      const tbody = document.getElementById('mass-increase-preview-tbody');
      if (tbody) {
        if (list.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="8" class="text-center py-4 text-muted">
                No se encontraron empleados activos que coincidan con los filtros seleccionados.
              </td>
            </tr>
          `;
          document.getElementById('btn-apply-mass-increase').disabled = true;
        } else {
          tbody.innerHTML = list
            .map((item) => {
              return `
                <tr>
                  <td class="font-monospace fw-bold text-dark">${escapeHtml(item.fileNumber || '-')}</td>
                  <td class="fw-bold text-dark">${escapeHtml(item.name)}</td>
                  <td><span class="badge bg-light text-muted border">${escapeHtml(item.department || '-')}</span></td>
                  <td><span class="badge bg-secondary-lt">${escapeHtml(item.payrollGroup || 'MENSUAL')}</span></td>
                  <td class="text-end font-monospace">$ ${formatNumber(item.currentBasicSalary)}</td>
                  <td class="text-end font-monospace text-success fw-bold">$ ${formatNumber(item.newBasicSalary)}</td>
                  <td class="text-end font-monospace">$ ${formatNumber(item.currentHourlyRate)}</td>
                  <td class="text-end font-monospace text-success fw-bold">$ ${formatNumber(item.newHourlyRate)}</td>
                </tr>
              `;
            })
            .join('');

          document.getElementById('btn-apply-mass-increase').disabled = false;
        }
      }
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al previsualizar aumento';
        alertBox.classList.remove('d-none');
      }
    } finally {
      if (previewBtn) {
        previewBtn.disabled = false;
        previewBtn.innerHTML = '<i class="ti ti-eye me-1"></i> Previsualizar Impacto';
      }
    }
  }

  async applyMassWageIncrease() {
    const payload = this.getMassIncreasePayload();
    const applyBtn = document.getElementById('btn-apply-mass-increase');
    const alertBox = document.getElementById('mass-increase-alert');
    const successBox = document.getElementById('mass-increase-success');
    if (alertBox) alertBox.classList.add('d-none');
    if (successBox) successBox.classList.add('d-none');

    this.confirmDeleteAction({
      title: 'Confirmar Aumento Generalizado Masivo',
      message: `¿Confirmas la aplicación definitiva del aumento a los <strong>${this.currentMassIncreasePreview.length}</strong> colaboradores seleccionados? Esta acción actualizará los básicos y/o valores hora de la nómina.`,
      confirmText: 'Aplicar Aumento Masivo',
      onConfirm: async () => {
        if (applyBtn) {
          applyBtn.disabled = true;
          applyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Aplicando...';
        }

        try {
          const res = await apiRequest('/employees/mass-wage-increase/apply', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

          const updatedCount = res.data?.updatedCount || 0;
          showToast(`Aumento masivo aplicado con éxito a ${updatedCount} colaborador(es)`);
          getBootstrapModal(document.getElementById('modal-mass-wage-increase'))?.hide();
          await this.loadEmployees();
        } catch (err) {
          if (alertBox) {
            alertBox.textContent = err.message || 'Error al aplicar el aumento masivo';
            alertBox.classList.remove('d-none');
          }
        } finally {
          if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.innerHTML = '<i class="ti ti-check me-1"></i> Confirmar y Aplicar Aumento Masivo';
          }
        }
      },
    });
  }

  // --- Asignación Masiva de Concepto a Nómina ---

  async openMassAssignConceptModal() {
    await this.ensurePayrollConceptsLoaded();

    const form = document.getElementById('form-mass-assign-concept');
    if (form) form.reset();

    document.getElementById('mass-assign-alert')?.classList.add('d-none');
    document.getElementById('mass-assign-success')?.classList.add('d-none');

    const select = document.getElementById('mass-assign-concept-select');
    if (select) {
      const conceptsList = (this.allPayrollConcepts && this.allPayrollConcepts.length > 0)
        ? this.allPayrollConcepts
        : (this.payrollConcepts || []);
      select.innerHTML = '<option value="">Seleccione un concepto...</option>' +
        conceptsList.map((c) => `<option value="${c.id}">${escapeHtml(c.code)} - ${escapeHtml(c.name)} (${escapeHtml(c.type)})</option>`).join('');
    }

    const deptSelect = document.getElementById('mass-assign-filter-dept');
    if (deptSelect) {
      deptSelect.innerHTML = '<option value="ALL">Todos los Sectores</option>' +
        this.departments.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
    }

    document.getElementById('mass-assign-filter-group').value = 'ALL';
    document.getElementById('mass-assign-amount').value = '';
    document.getElementById('mass-assign-units').value = '';
    document.getElementById('mass-assign-valid-from').value = '';
    document.getElementById('mass-assign-valid-to').value = '';

    getBootstrapModal(document.getElementById('modal-mass-assign-concept'))?.show();
  }

  async submitMassAssignConcept(e) {
    e.preventDefault();
    const alertBox = document.getElementById('mass-assign-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const conceptId = document.getElementById('mass-assign-concept-select').value;
    const amountVal = document.getElementById('mass-assign-amount').value;
    const unitsVal = document.getElementById('mass-assign-units').value;
    const startDateVal = document.getElementById('mass-assign-valid-from').value || null;
    const endDateVal = document.getElementById('mass-assign-valid-to').value || null;
    const filterDept = document.getElementById('mass-assign-filter-dept').value;
    const filterGroup = document.getElementById('mass-assign-filter-group').value;

    if (!conceptId) {
      if (alertBox) {
        alertBox.textContent = 'Por favor selecciona el concepto a asignar.';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    const payload = {
      conceptId,
      amount: amountVal !== '' ? parseFloat(amountVal) : null,
      units: unitsVal !== '' ? parseFloat(unitsVal) : null,
      startDate: startDateVal,
      endDate: endDateVal,
      filterDepartmentId: filterDept !== 'ALL' ? filterDept : null,
      filterPayrollGroup: filterGroup !== 'ALL' ? filterGroup : null,
    };

    const submitBtn = document.getElementById('btn-save-mass-assign');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Asignando...';
    }

    try {
      const res = await apiRequest('/employees/mass-assign-concept', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const assignedCount = res.data?.assignedCount || 0;
      showToast(`Concepto asignado con éxito a ${assignedCount} colaborador(es)`);
      getBootstrapModal(document.getElementById('modal-mass-assign-concept'))?.hide();
      await this.loadEmployees();
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al asignar concepto masivamente';
        alertBox.classList.remove('d-none');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="ti ti-check me-1"></i> Asignar Concepto Masivamente';
      }
    }
  }

  // --- Configuración y Apertura de Modales ---

  switchPersonnelPane(targetSelector) {
    if (!targetSelector) return;

    // 1. Actualizar clases activas en la barra lateral
    const sidebarNav = document.getElementById('personnel-sidebar-nav');
    if (sidebarNav) {
      sidebarNav.querySelectorAll('.personnel-nav-item, .personnel-sub-item').forEach((x) => {
        const target = x.getAttribute('data-bs-target') || x.getAttribute('href');
        if (target === targetSelector) {
          x.classList.add('active');
        } else {
          x.classList.remove('active');
        }
      });
    }

    // 2. Ocultar todos los panes y activar el seleccionado
    const tabContent = document.getElementById('personnel-tab-content');
    if (tabContent) {
      tabContent.querySelectorAll('.tab-pane').forEach((pane) => {
        pane.classList.remove('show', 'active');
      });
      const targetPane = tabContent.querySelector(targetSelector);
      if (targetPane) {
        targetPane.classList.add('show', 'active');
      }
    }

    // 3. Renderizar o refrescar datos de la vista seleccionada
    if (targetSelector === '#pane-personnel-employees') {
      this.loadEmployees();
    } else if (targetSelector === '#pane-personnel-departments') {
      this.renderDepartmentsTable();
    } else if (targetSelector === '#pane-personnel-job-positions') {
      this.renderJobPositionsTable();
    } else if (targetSelector === '#pane-personnel-work-shifts') {
      this.renderWorkShiftsTable();
    } else if (targetSelector === '#pane-personnel-health-insurances') {
      this.renderHealthInsurancesTable();
    } else if (targetSelector === '#pane-personnel-unions') {
      this.renderUnionsTable();
    } else if (targetSelector === '#pane-personnel-mutuals') {
      this.renderMutualsTable();
    } else if (targetSelector === '#pane-personnel-kinships') {
      this.renderKinshipsTable();
    }
  }

  setupPersonnelModals() {
    // Manejador de navegación de la barra lateral izquierda del módulo (ítems principales y submenúes)
    const sidebarNav = document.getElementById('personnel-sidebar-nav');
    if (sidebarNav) {
      // Ítems principales (Nómina de Personal)
      sidebarNav.querySelectorAll('.personnel-nav-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const target = item.getAttribute('data-bs-target') || item.getAttribute('href');
          if (target) this.switchPersonnelPane(target);
        });
      });

      // Sub-ítems (Sectores, Puestos, Obras Sociales, Sindicatos, Mutuales)
      sidebarNav.querySelectorAll('.personnel-sub-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const target = item.getAttribute('data-bs-target') || item.getAttribute('href');
          if (target) this.switchPersonnelPane(target);
        });
      });
    }

    // Filtros reactivos en la nómina de empleados
    document.getElementById('employee-search-input')?.addEventListener('input', () => {
      this.employeesPage = 1;
      this.loadEmployees();
    });
    document.getElementById('employee-filter-department')?.addEventListener('change', () => {
      this.employeesPage = 1;
      this.loadEmployees();
    });
    document.getElementById('employee-filter-status')?.addEventListener('change', () => {
      this.employeesPage = 1;
      this.loadEmployees();
    });
    document.getElementById('employees-page-size-select')?.addEventListener('change', (e) => {
      this.employeesPageSize = parseInt(e.target.value, 10) || 5;
      this.employeesPage = 1;
      this.renderEmployeesTable();
    });

    // Filtros reactivos en las tablas del módulo
    document.getElementById('department-search-input')?.addEventListener('input', () => {
      this.departmentsPage = 1;
      this.renderDepartmentsTable();
    });
    document.getElementById('departments-page-size-select')?.addEventListener('change', (e) => {
      this.departmentsPageSize = parseInt(e.target.value, 10) || 5;
      this.departmentsPage = 1;
      this.renderDepartmentsTable();
    });

    document.getElementById('job-position-search-input')?.addEventListener('input', () => {
      this.jobPositionsPage = 1;
      this.renderJobPositionsTable();
    });
    document.getElementById('job-positions-page-size-select')?.addEventListener('change', (e) => {
      this.jobPositionsPageSize = parseInt(e.target.value, 10) || 5;
      this.jobPositionsPage = 1;
      this.renderJobPositionsTable();
    });

    document.getElementById('health-insurance-search-input')?.addEventListener('input', () => {
      this.healthInsurancesPage = 1;
      this.renderHealthInsurancesTable();
    });
    document.getElementById('health-insurances-page-size-select')?.addEventListener('change', (e) => {
      this.healthInsurancesPageSize = parseInt(e.target.value, 10) || 5;
      this.healthInsurancesPage = 1;
      this.renderHealthInsurancesTable();
    });

    document.getElementById('union-search-input')?.addEventListener('input', () => {
      this.unionsPage = 1;
      this.renderUnionsTable();
    });
    document.getElementById('unions-page-size-select')?.addEventListener('change', (e) => {
      this.unionsPageSize = parseInt(e.target.value, 10) || 5;
      this.unionsPage = 1;
      this.renderUnionsTable();
    });

    document.getElementById('mutual-search-input')?.addEventListener('input', () => {
      this.mutualsPage = 1;
      this.renderMutualsTable();
    });
    document.getElementById('mutuals-page-size-select')?.addEventListener('change', (e) => {
      this.mutualsPageSize = parseInt(e.target.value, 10) || 5;
      this.mutualsPage = 1;
      this.renderMutualsTable();
    });

    document.getElementById('kinship-search-input')?.addEventListener('input', () => {
      this.kinshipsPage = 1;
      this.renderKinshipsTable();
    });
    document.getElementById('kinships-page-size-select')?.addEventListener('change', (e) => {
      this.kinshipsPageSize = parseInt(e.target.value, 10) || 5;
      this.kinshipsPage = 1;
      this.renderKinshipsTable();
    });

    // Botones de apertura de modales
    document.getElementById('btn-open-new-employee-modal')?.addEventListener('click', () => this.openNewEmployeeModal());
    document.getElementById('btn-open-import-employees-modal')?.addEventListener('click', () => this.openImportEmployeesModal());
    document.getElementById('btn-download-employee-template')?.addEventListener('click', () => this.downloadEmployeeTemplate());
    document.getElementById('employee-import-file')?.addEventListener('change', (e) => this.handleEmployeeFileSelect(e));
    document.getElementById('btn-confirm-import-employees')?.addEventListener('click', () => this.confirmImportEmployees());
    document.getElementById('btn-open-new-department-modal')?.addEventListener('click', () => this.openNewDepartmentModal());
    document.getElementById('btn-open-import-departments-modal')?.addEventListener('click', () => this.openImportDepartmentsModal());
    document.getElementById('btn-download-department-template')?.addEventListener('click', () => this.downloadDepartmentTemplate());
    document.getElementById('department-import-file')?.addEventListener('change', (e) => this.handleDepartmentFileSelect(e));
    document.getElementById('btn-confirm-import-departments')?.addEventListener('click', () => this.confirmImportDepartments());
    document.getElementById('btn-open-new-job-position-modal')?.addEventListener('click', () => this.openNewJobPositionModal());
    document.getElementById('btn-open-import-job-positions-modal')?.addEventListener('click', () => this.openImportJobPositionsModal());
    document.getElementById('btn-download-job-position-template')?.addEventListener('click', () => this.downloadJobPositionTemplate());
    document.getElementById('job-position-import-file')?.addEventListener('change', (e) => this.handleJobPositionFileSelect(e));
    document.getElementById('btn-confirm-import-job-positions')?.addEventListener('click', () => this.confirmImportJobPositions());
    document.getElementById('btn-open-new-work-shift-modal')?.addEventListener('click', () => this.openNewWorkShiftModal());
    document.getElementById('work-shift-search-input')?.addEventListener('input', () => {
      this.workShiftsPage = 1;
      this.renderWorkShiftsTable();
    });
    this.setupWorkShiftModalEvents();
    document.getElementById('btn-open-new-health-insurance-modal')?.addEventListener('click', () => this.openNewHealthInsuranceModal());
    document.getElementById('btn-open-new-union-modal')?.addEventListener('click', () => this.openNewUnionModal());
    document.getElementById('btn-open-new-mutual-modal')?.addEventListener('click', () => this.openNewMutualModal());
    document.getElementById('btn-open-new-kinship-modal')?.addEventListener('click', () => this.openNewKinshipModal());

    // Botones de gestión de familiares y accesos rápidos
    document.getElementById('btn-add-employee-relative')?.addEventListener('click', () => this.openNewRelativeModal());
    document.getElementById('btn-manage-kinships-quick')?.addEventListener('click', () => {
      getBootstrapModal(document.getElementById('modal-employee-form'))?.hide();
      this.switchPersonnelPane('#pane-personnel-kinships');
    });

    // Validación interactiva de CUIL en formulario de empleado
    const cuilInput = document.getElementById('employee-input-cuil');
    const cuilStatus = document.getElementById('employee-cuil-status');
    const cuilFeedback = document.getElementById('employee-cuil-feedback');

    if (cuilInput) {
      cuilInput.addEventListener('input', () => {
        const val = cuilInput.value.replace(/\D/g, '');
        if (val.length === 11) {
          if (isValidCuit(val)) {
            cuilInput.classList.remove('is-invalid');
            cuilInput.classList.add('is-valid');
            if (cuilStatus) cuilStatus.innerHTML = '<i class="ti ti-check text-success"></i>';
            if (cuilFeedback) {
              cuilFeedback.className = 'valid-feedback d-block';
              cuilFeedback.textContent = '✓ CUIL válido según algoritmo de AFIP/ARCA';
            }
          } else {
            cuilInput.classList.remove('is-valid');
            cuilInput.classList.add('is-invalid');
            if (cuilStatus) cuilStatus.innerHTML = '<i class="ti ti-x text-danger"></i>';
            if (cuilFeedback) {
              cuilFeedback.className = 'invalid-feedback d-block';
              cuilFeedback.textContent = '✗ Dígito verificador de CUIL incorrecto';
            }
          }
        } else {
          cuilInput.classList.remove('is-valid', 'is-invalid');
          if (cuilStatus) cuilStatus.innerHTML = '<i class="ti ti-id"></i>';
          if (cuilFeedback) {
            cuilFeedback.className = 'form-hint';
            cuilFeedback.textContent = '11 dígitos numéricos sin guiones.';
          }
        }
      });
    }

    // Manejo de Carga y Previsualización de Foto del Empleado
    const photoFileInput = document.getElementById('employee-input-photo-file');
    const photoDataInput = document.getElementById('employee-input-photo-data');
    const photoPreviewAvatar = document.getElementById('employee-photo-preview-avatar');
    const photoIconPlaceholder = document.getElementById('employee-photo-icon-placeholder');
    const btnUploadPhoto = document.getElementById('btn-upload-employee-photo');
    const photoWrapper = document.getElementById('employee-photo-preview-wrapper');
    const btnRemovePhoto = document.getElementById('btn-remove-employee-photo');

    const triggerPhotoPick = () => photoFileInput?.click();
    btnUploadPhoto?.addEventListener('click', triggerPhotoPick);
    photoWrapper?.addEventListener('click', triggerPhotoPick);

    photoFileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast('El archivo seleccionado debe ser una imagen válida (JPG, PNG o WEBP)', 'warning');
        return;
      }

      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const img = new Image();
        img.onload = () => {
          // Redimensionar en canvas a max 320x320 para un almacenamiento ultra ligero y nítido
          const maxDim = 320;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          if (photoDataInput) photoDataInput.value = compressedDataUrl;
          if (photoPreviewAvatar) {
            photoPreviewAvatar.style.backgroundImage = `url('${compressedDataUrl}')`;
            photoPreviewAvatar.style.backgroundSize = 'cover';
            photoPreviewAvatar.style.backgroundPosition = 'center';
          }
          if (photoIconPlaceholder) photoIconPlaceholder.classList.add('d-none');
          if (btnRemovePhoto) btnRemovePhoto.classList.remove('d-none');
        };
        img.src = loadEvt.target.result;
      };
      reader.readAsDataURL(file);
    });

    btnRemovePhoto?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (photoFileInput) photoFileInput.value = '';
      if (photoDataInput) photoDataInput.value = '';
      if (photoPreviewAvatar) {
        photoPreviewAvatar.style.backgroundImage = '';
      }
      if (photoIconPlaceholder) photoIconPlaceholder.classList.remove('d-none');
      if (btnRemovePhoto) btnRemovePhoto.classList.add('d-none');
    });

    // Cambio reactivo de puesto de trabajo para actualizar Encuadre Normativo (Pestaña 3)
    document.getElementById('employee-input-job-position')?.addEventListener('change', (e) => {
      this.updateEmployeeEncuadrePreview(e.target.value);
    });

    // Actualización reactiva de mapa de Google Maps en Pestaña 4 (Domicilio)
    let employeeMapDebounce = null;
    const notifyAddressChange = (immediate = false) => {
      if (employeeMapDebounce) clearTimeout(employeeMapDebounce);
      if (immediate) {
        this.updateEmployeeMapPreview();
      } else {
        employeeMapDebounce = setTimeout(() => {
          this.updateEmployeeMapPreview();
        }, 500);
      }
    };

    ['employee-input-street', 'employee-input-street-number', 'employee-input-city', 'employee-input-province'].forEach((inputId) => {
      const inputEl = document.getElementById(inputId);
      if (inputEl) {
        inputEl.addEventListener('input', () => notifyAddressChange(false));
        inputEl.addEventListener('change', () => notifyAddressChange(true));
      }
    });

    document.getElementById('btn-refresh-employee-map')?.addEventListener('click', () => {
      notifyAddressChange(true);
    });

    document.getElementById('tab-btn-emp-contact')?.addEventListener('shown.bs.tab', () => {
      this.updateEmployeeMapPreview();
    });

    // Eventos reactivos de jornada laboral y horas en Tab 6
    document.getElementById('employee-input-is-part-time')?.addEventListener('change', (e) => {
      if (!e.target.checked) {
        const stdWeekly = this.payrollSettings?.standardWeeklyHoursFormatted || '48:00';
        const stdMonthly = this.payrollSettings?.standardMonthlyHoursFormatted || '200:00';
        if (document.getElementById('employee-input-weekly-hours')) {
          document.getElementById('employee-input-weekly-hours').value = stdWeekly;
        }
        if (document.getElementById('employee-input-monthly-hours')) {
          document.getElementById('employee-input-monthly-hours').value = stdMonthly;
        }
      }
      this.updateEmployeeJornadaBadge();
    });
    document.getElementById('employee-input-weekly-hours')?.addEventListener('input', () => {
      this.updateEmployeeJornadaBadge();
    });
    document.getElementById('employee-input-weekly-hours')?.addEventListener('change', () => {
      this.updateEmployeeJornadaBadge();
    });
    document.getElementById('employee-select-work-shift')?.addEventListener('change', (e) => {
      this.handleEmployeeWorkShiftChange(e.target.value);
    });

    // Validación y detección automática de banco para CBU en Tab 6
    const cbuInputEl = document.getElementById('employee-input-cbu');
    if (cbuInputEl) {
      cbuInputEl.addEventListener('input', () => this.updateCbuValidationUI());
      cbuInputEl.addEventListener('blur', () => this.updateCbuValidationUI());
    }

    // Botón para asignar concepto fijo al empleado
    document.getElementById('btn-add-employee-concept')?.addEventListener('click', () => {
      this.openAssignConceptModal();
    });

    // Submit del formulario de asignación de concepto fijo
    document.getElementById('form-assign-employee-concept')?.addEventListener('submit', (e) => {
      this.saveEmployeeConceptAssignment(e);
    });

    // Selector de nómina / sueldo básico en ficha de empleado
    document.getElementById('employee-select-salary-scale')?.addEventListener('change', (e) => {
      const selectedId = e.target.value;
      const scale = (this.salaryScales || []).find((s) => s.id === selectedId);
      const amountDisplay = document.getElementById('employee-scale-amount-display');
      const cardDisplay = document.getElementById('employee-scale-amount-card-display');
      const basicSalaryInput = document.getElementById('employee-input-basic-salary');
      if (scale) {
        const txt = `$ ${formatNumber(scale.amount)}`;
        if (amountDisplay) amountDisplay.textContent = txt;
        if (cardDisplay) cardDisplay.textContent = txt;
        if (basicSalaryInput) basicSalaryInput.value = scale.amount;
      } else {
        if (amountDisplay) amountDisplay.textContent = '$ 0,00';
        if (cardDisplay) cardDisplay.textContent = '$ 0,00';
        if (basicSalaryInput) basicSalaryInput.value = '0.00';
      }
    });

    // Cambio en modalidad de contratación: filtrar nóminas exclusivas o estándar y sugerir jornada
    document.getElementById('employee-input-contract-modality')?.addEventListener('change', (e) => {
      const selectedModality = e.target.value;
      const isIntern = String(selectedModality) === '27' || String(selectedModality) === '51';
      this.updateSalaryScaleOptions(selectedModality);

      // Si es pasante, sugerir o ajustar tope de 20 hs semanales (Ley 26.427 Art. 13)
      if (isIntern) {
        const weeklyInput = document.getElementById('employee-input-weekly-hours');
        const monthlyInput = document.getElementById('employee-input-monthly-hours');
        const partTimeSwitch = document.getElementById('employee-input-is-part-time');
        const partTimePct = document.getElementById('employee-input-part-time-pct');
        const jornadaBadge = document.getElementById('emp-jornada-badge');

        if (weeklyInput && (!weeklyInput.value || parseFloat(weeklyInput.value) > 20)) {
          weeklyInput.value = '20:00';
        }
        if (monthlyInput && (!monthlyInput.value || parseFloat(monthlyInput.value) > 80)) {
          monthlyInput.value = '80:00';
        }
        if (partTimeSwitch) partTimeSwitch.checked = true;
        if (partTimePct) partTimePct.value = '50';
        if (jornadaBadge) {
          jornadaBadge.textContent = 'Pasantía Educativa (Máx 20 hs)';
          jornadaBadge.className = 'badge bg-teal text-white';
        }
      }
    });

    // Botones de toolbar en Nómina de Personal
    document.getElementById('btn-open-mass-wage-increase-emp')?.addEventListener('click', () => {
      this.openMassWageIncreaseModal();
    });
    document.getElementById('btn-open-mass-assign-concept-emp')?.addEventListener('click', () => {
      this.openMassAssignConceptModal();
    });

    // Submit de Empleado
    const employeeForm = document.getElementById('form-employee');
    if (employeeForm) {
      employeeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('employee-form-id').value;
        const alertBox = document.getElementById('employee-form-alert');
        const submitBtn = document.getElementById('btn-save-employee');
        if (alertBox) alertBox.classList.add('d-none');

        const fileNumber = document.getElementById('employee-input-file-number')?.value?.trim();
        const lastName = document.getElementById('employee-input-last-name')?.value?.trim();
        const firstName = document.getElementById('employee-input-first-name')?.value?.trim();
        const docNumber = document.getElementById('employee-input-doc-number')?.value?.trim();
        const cuilRaw = document.getElementById('employee-input-cuil')?.value?.replace(/\D/g, '') || '';
        const birthDate = document.getElementById('employee-input-birth-date')?.value;
        const hireDate = document.getElementById('employee-input-hire-date')?.value;
        const departmentId = document.getElementById('employee-input-department')?.value;
        const jobPositionId = document.getElementById('employee-input-job-position')?.value;
        const healthInsuranceId = document.getElementById('employee-input-health-insurance')?.value;

        // Validación Pestaña 1: Datos Personales
        if (!lastName || !firstName || !docNumber || !birthDate) {
          const tabBtn = document.getElementById('tab-btn-emp-personal');
          if (tabBtn && window.bootstrap?.Tab) new window.bootstrap.Tab(tabBtn).show();
          showToast('Faltan completar datos personales obligatorios (*)', 'warning');
          if (alertBox) {
            alertBox.textContent = 'Por favor completa Apellido, Nombre, Documento y Fecha de Nacimiento.';
            alertBox.classList.remove('d-none');
            alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }

        if (!isValidCuit(cuilRaw)) {
          const tabBtn = document.getElementById('tab-btn-emp-personal');
          if (tabBtn && window.bootstrap?.Tab) new window.bootstrap.Tab(tabBtn).show();
          document.getElementById('employee-input-cuil')?.focus();
          showToast('El CUIL ingresado no es válido según el algoritmo de AFIP/ARCA', 'warning');
          if (alertBox) {
            alertBox.textContent = 'Por favor ingresa un CUIL válido de 11 dígitos numéricos.';
            alertBox.classList.remove('d-none');
            alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }

        // Validación Pestaña 2: Datos Laborales
        if (!fileNumber || !hireDate || !departmentId || !jobPositionId || !healthInsuranceId) {
          const tabBtn = document.getElementById('tab-btn-emp-job');
          if (tabBtn && window.bootstrap?.Tab) new window.bootstrap.Tab(tabBtn).show();
          showToast('Faltan campos obligatorios en la pestaña Laboral (*)', 'warning');
          if (alertBox) {
            alertBox.textContent = 'Por favor selecciona Legajo, Fecha de Ingreso, Sector, Puesto y Obra Social.';
            alertBox.classList.remove('d-none');
            alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }

        // Validación Pestaña 6: Formato de Horas (HH:MM)
        const weeklyWorkingHours = document.getElementById('employee-input-weekly-hours')?.value?.trim() || '48:00';
        const monthlyWorkingHours = document.getElementById('employee-input-monthly-hours')?.value?.trim() || '200:00';
        const timeRegex = /^\d{1,3}:[0-5]\d$/;
        if (!timeRegex.test(weeklyWorkingHours)) {
          const tabBtn = document.getElementById('tab-btn-emp-payroll');
          if (tabBtn && window.bootstrap?.Tab) new window.bootstrap.Tab(tabBtn).show();
          document.getElementById('employee-input-weekly-hours')?.focus();
          showToast('Las horas semanales deben ingresarse en formato horario HH:MM (ej. 48:00)', 'warning');
          return;
        }
        if (!timeRegex.test(monthlyWorkingHours)) {
          const tabBtn = document.getElementById('tab-btn-emp-payroll');
          if (tabBtn && window.bootstrap?.Tab) new window.bootstrap.Tab(tabBtn).show();
          document.getElementById('employee-input-monthly-hours')?.focus();
          showToast('Las horas mensuales deben ingresarse en formato horario HH:MM (ej. 200:00)', 'warning');
          return;
        }

        const cbuRaw = document.getElementById('employee-input-cbu')?.value?.replace(/\D/g, '') || null;
        if (cbuRaw) {
          if (!isValidCbu(cbuRaw)) {
            const tabBtn = document.getElementById('tab-btn-emp-payroll');
            if (tabBtn && window.bootstrap?.Tab) new window.bootstrap.Tab(tabBtn).show();
            document.getElementById('employee-input-cbu')?.focus();
            if (alertBox) {
              alertBox.innerHTML = 'El C.B.U. ingresado es inválido según los dígitos verificadores del B.C.R.A.';
              alertBox.classList.remove('d-none');
              alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            showToast('El C.B.U. ingresado es inválido (algoritmo B.C.R.A.)', 'danger');
            return;
          }
        }
        const bankAccountType = document.getElementById('employee-select-account-type')?.value || 'CAJA_AHORRO_PESOS';

        const payload = {
          fileNumber,
          lastName,
          firstName,
          photo: document.getElementById('employee-input-photo-data')?.value || null,
          documentType: document.getElementById('employee-input-doc-type')?.value || 'DNI',
          documentNumber: docNumber,
          cuil: cuilRaw,
          gender: document.getElementById('employee-input-gender')?.value || 'M',
          birthDate,
          hireDate,
          street: document.getElementById('employee-input-street')?.value?.trim() || null,
          streetNumber: document.getElementById('employee-input-street-number')?.value?.trim() || null,
          floor: document.getElementById('employee-input-floor')?.value?.trim() || null,
          apartment: document.getElementById('employee-input-apartment')?.value?.trim() || null,
          city: document.getElementById('employee-input-city')?.value?.trim() || null,
          postalCode: document.getElementById('employee-input-postal-code')?.value?.trim() || null,
          province: document.getElementById('employee-input-province')?.value?.trim() || null,
          status: document.getElementById('employee-input-status')?.value || 'ACTIVE',
          departmentId,
          jobPositionId,
          healthInsuranceId,
          unionId: document.getElementById('employee-input-union')?.value || null,
          mutualId: document.getElementById('employee-input-mutual')?.value || null,
          contractModalityCode: document.getElementById('employee-input-contract-modality')?.value || null,
          payrollGroup: document.getElementById('employee-input-payroll-group')?.value || 'MENSUAL',
          isPartTime: Boolean(document.getElementById('employee-input-is-part-time')?.checked),
          workShiftId: document.getElementById('employee-select-work-shift')?.value || null,
          weeklyWorkingHours,
          monthlyWorkingHours,
          partTimePercentage: Number(document.getElementById('employee-input-part-time-pct')?.value || 100),
          salaryScaleId: document.getElementById('employee-select-salary-scale')?.value || null,
          basicSalary: Number(document.getElementById('employee-input-basic-salary')?.value || 0),
          cbu: cbuRaw,
          bankAccountType: bankAccountType,
          email: document.getElementById('employee-input-email')?.value?.trim() || null,
          phone: document.getElementById('employee-input-phone')?.value?.trim() || null,
        };

        if (!id && this.currentEmployeeRelatives.length > 0) {
          payload.relatives = this.currentEmployeeRelatives.map((r) => ({
            kinshipId: r.kinshipId || r.kinship?.id,
            lastName: r.lastName,
            firstName: r.firstName,
            documentType: r.documentType || 'DNI',
            documentNumber: r.documentNumber,
            cuil: r.cuil || null,
            birthDate: r.birthDate,
          }));
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = id
            ? '<span class="spinner-border spinner-border-sm me-1"></span> Actualizando...'
            : '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
        }

        try {
          if (id) {
            await apiRequest(`/employees/${id}`, {
              method: 'PATCH',
              body: JSON.stringify(payload),
            });
            showToast('Legajo de empleado actualizado correctamente', 'success');
          } else {
            await apiRequest('/employees', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
            showToast('Empleado dado de alta exitosamente', 'success');
          }

          const modalEl = document.getElementById('modal-employee-form');
          getBootstrapModal(modalEl)?.hide();
          await this.loadPersonnelAuxiliaryData();
          await this.loadEmployees();
        } catch (err) {
          let errorMsg = err.message || 'Error al guardar el empleado';
          if (err.details && Array.isArray(err.details) && err.details.length > 0) {
            errorMsg = err.details.map((d) => `• ${escapeHtml(d.message)}`).join('<br>');
          }
          if (alertBox) {
            alertBox.innerHTML = errorMsg;
            alertBox.classList.remove('d-none');
            alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          showToast(err.message || 'Error al guardar el empleado', 'danger');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = id
              ? '<i class="ti ti-device-floppy me-1"></i> Actualizar Legajo'
              : '<i class="ti ti-device-floppy me-1"></i> Guardar Legajo';
          }
        }
      });

      // Asegurar que el click en el botón dispare la validación y submit del form
      document.getElementById('btn-save-employee')?.addEventListener('click', () => {
        employeeForm.requestSubmit();
      });
    }

    // Submit de Sector
    document.getElementById('form-department')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('department-form-id').value;
      const alertBox = document.getElementById('department-form-alert');
      const submitBtn = document.getElementById('btn-save-department');
      if (alertBox) alertBox.classList.add('d-none');

      const nameVal = document.getElementById('department-input-name').value.trim();
      const codeVal = document.getElementById('department-input-code').value.trim().toUpperCase();

      if (!nameVal) {
        if (alertBox) {
          alertBox.textContent = 'El nombre del sector es obligatorio.';
          alertBox.classList.remove('d-none');
        }
        return;
      }

      const payload = {
        name: nameVal,
        code: codeVal || null,
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
      }

      try {
        if (id) {
          await apiRequest(`/departments/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
          showToast('Sector actualizado correctamente');
        } else {
          await apiRequest('/departments', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Sector creado exitosamente');
        }
        getBootstrapModal(document.getElementById('modal-department-form'))?.hide();
        await this.loadPersonnelAuxiliaryData();
      } catch (err) {
        if (alertBox) {
          alertBox.textContent = err.message || 'Error al guardar sector';
          alertBox.classList.remove('d-none');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Sector';
        }
      }
    });

    // Submit de Puesto de Trabajo
    document.getElementById('form-job-position')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('job-position-form-id').value;
      const alertBox = document.getElementById('job-position-form-alert');
      const submitBtn = document.getElementById('btn-save-job-position');
      if (alertBox) alertBox.classList.add('d-none');

      const nameVal = document.getElementById('job-position-input-name').value.trim();
      const codeVal = document.getElementById('job-position-input-code').value.trim().toUpperCase();

      if (!nameVal) {
        if (alertBox) {
          alertBox.textContent = 'El nombre del puesto es obligatorio.';
          alertBox.classList.remove('d-none');
        }
        return;
      }

      const cctCode = document.getElementById('job-position-input-cct')?.value || null;
      const categoryCode = document.getElementById('job-position-input-category')?.value || null;
      const positionCode = document.getElementById('job-position-input-arca-position')?.value || null;
      const serviceTypeCode = document.getElementById('job-position-input-service-type')?.value || null;
      const activityCode = document.getElementById('job-position-input-activity')?.value || '049';

      const payload = {
        name: nameVal,
        code: codeVal || null,
        cctCode: cctCode || null,
        categoryCode: categoryCode || null,
        positionCode: positionCode || null,
        serviceTypeCode: serviceTypeCode || null,
        activityCode: activityCode || '049',
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
      }

      try {
        if (id) {
          await apiRequest(`/job-positions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
          showToast('Puesto de trabajo actualizado correctamente');
        } else {
          await apiRequest('/job-positions', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Puesto de trabajo registrado exitosamente');
        }
        getBootstrapModal(document.getElementById('modal-job-position-form'))?.hide();
        await this.loadPersonnelAuxiliaryData();
      } catch (err) {
        if (alertBox) {
          alertBox.textContent = err.message || 'Error al guardar puesto';
          alertBox.classList.remove('d-none');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Puesto';
        }
      }
    });

    // Submit de Obra Social
    document.getElementById('form-health-insurance')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('health-insurance-form-id').value;
      const alertBox = document.getElementById('health-insurance-form-alert');
      const submitBtn = document.getElementById('btn-save-health-insurance');
      if (alertBox) alertBox.classList.add('d-none');

      const nameVal = document.getElementById('health-insurance-input-name').value.trim();
      const codeVal = document.getElementById('health-insurance-input-code').value.trim();

      if (!nameVal) {
        if (alertBox) {
          alertBox.textContent = 'La denominación de la obra social es obligatoria.';
          alertBox.classList.remove('d-none');
        }
        return;
      }

      const payload = {
        name: nameVal,
        code: codeVal || null,
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
      }

      try {
        if (id) {
          await apiRequest(`/health-insurances/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
          showToast('Obra social actualizada correctamente');
        } else {
          await apiRequest('/health-insurances', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Obra social registrada exitosamente');
        }
        getBootstrapModal(document.getElementById('modal-health-insurance-form'))?.hide();
        await this.loadPersonnelAuxiliaryData();
      } catch (err) {
        if (alertBox) {
          alertBox.textContent = err.message || 'Error al guardar obra social';
          alertBox.classList.remove('d-none');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Obra Social';
        }
      }
    });

    // Submit de Sindicato
    document.getElementById('form-union')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('union-form-id').value;
      const alertBox = document.getElementById('union-form-alert');
      const submitBtn = document.getElementById('btn-save-union');
      if (alertBox) alertBox.classList.add('d-none');

      const nameVal = document.getElementById('union-input-name').value.trim();
      const codeVal = document.getElementById('union-input-code').value.trim();

      if (!nameVal) {
        if (alertBox) {
          alertBox.textContent = 'El nombre del sindicato es obligatorio.';
          alertBox.classList.remove('d-none');
        }
        return;
      }

      const payload = {
        name: nameVal,
        code: codeVal || null,
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
      }

      try {
        if (id) {
          await apiRequest(`/unions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
          showToast('Sindicato actualizado correctamente');
        } else {
          await apiRequest('/unions', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Sindicato registrado exitosamente');
        }
        getBootstrapModal(document.getElementById('modal-union-form'))?.hide();
        await this.loadPersonnelAuxiliaryData();
      } catch (err) {
        if (alertBox) {
          alertBox.textContent = err.message || 'Error al guardar sindicato';
          alertBox.classList.remove('d-none');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Sindicato';
        }
      }
    });

    // Submit de Mutual
    document.getElementById('form-mutual')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('mutual-form-id').value;
      const alertBox = document.getElementById('mutual-form-alert');
      const submitBtn = document.getElementById('btn-save-mutual');
      if (alertBox) alertBox.classList.add('d-none');

      const nameVal = document.getElementById('mutual-input-name').value.trim();
      const codeVal = document.getElementById('mutual-input-code').value.trim();

      if (!nameVal) {
        if (alertBox) {
          alertBox.textContent = 'El nombre de la mutual es obligatorio.';
          alertBox.classList.remove('d-none');
        }
        return;
      }

      const payload = {
        name: nameVal,
        code: codeVal || null,
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
      }

      try {
        if (id) {
          await apiRequest(`/mutuals/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
          showToast('Mutual actualizada correctamente');
        } else {
          await apiRequest('/mutuals', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Mutual registrada exitosamente');
        }
        getBootstrapModal(document.getElementById('modal-mutual-form'))?.hide();
        await this.loadPersonnelAuxiliaryData();
      } catch (err) {
        if (alertBox) {
          alertBox.textContent = err.message || 'Error al guardar mutual';
          alertBox.classList.remove('d-none');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Mutual';
        }
      }
    });

    // Submit de Parentesco
    document.getElementById('form-kinship')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('kinship-form-id').value;
      const alertBox = document.getElementById('kinship-form-alert');
      const submitBtn = document.getElementById('btn-save-kinship');
      if (alertBox) alertBox.classList.add('d-none');

      const nameVal = document.getElementById('kinship-input-name').value.trim();
      const codeVal = document.getElementById('kinship-input-code').value.trim().toUpperCase();

      if (!nameVal) {
        if (alertBox) {
          alertBox.textContent = 'El nombre del parentesco es obligatorio.';
          alertBox.classList.remove('d-none');
        }
        return;
      }

      const payload = {
        name: nameVal,
        code: codeVal || null,
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
      }

      try {
        if (id) {
          await apiRequest(`/kinships/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
          showToast('Parentesco actualizado correctamente');
        } else {
          await apiRequest('/kinships', { method: 'POST', body: JSON.stringify(payload) });
          showToast('Parentesco registrado exitosamente');
        }
        getBootstrapModal(document.getElementById('modal-kinship-form'))?.hide();
        await this.loadPersonnelAuxiliaryData();
      } catch (err) {
        if (alertBox) {
          alertBox.textContent = err.message || 'Error al guardar parentesco';
          alertBox.classList.remove('d-none');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Parentesco';
        }
      }
    });

    // Submit de Familiar de Empleado (Submodal)
    document.getElementById('form-employee-relative')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const indexVal = document.getElementById('employee-relative-form-index').value;
      const relativeId = document.getElementById('employee-relative-form-id').value;
      const employeeId = document.getElementById('employee-form-id').value;
      const alertBox = document.getElementById('relative-form-alert');
      const submitBtn = document.getElementById('btn-save-employee-relative');
      if (alertBox) alertBox.classList.add('d-none');

      const kinshipId = document.getElementById('relative-input-kinship').value;
      const lastName = document.getElementById('relative-input-last-name').value.trim();
      const firstName = document.getElementById('relative-input-first-name').value.trim();
      const documentType = document.getElementById('relative-input-doc-type').value;
      const documentNumber = document.getElementById('relative-input-doc-number').value.trim();
      const cuilRaw = document.getElementById('relative-input-cuil').value.replace(/\D/g, '') || null;
      const birthDate = document.getElementById('relative-input-birth-date').value;

      if (!kinshipId || !lastName || !firstName || !documentNumber || !birthDate) {
        if (alertBox) {
          alertBox.textContent = 'Por favor completa todos los campos requeridos (*).';
          alertBox.classList.remove('d-none');
        }
        return;
      }

      if (cuilRaw && cuilRaw.length === 11 && !isValidCuit(cuilRaw)) {
        if (alertBox) {
          alertBox.textContent = 'El CUIL ingresado no es válido según el algoritmo oficial.';
          alertBox.classList.remove('d-none');
        }
        return;
      }

      const relPayload = {
        kinshipId,
        lastName,
        firstName,
        documentType,
        documentNumber,
        cuil: cuilRaw,
        birthDate,
      };

      const selectedKin = this.kinships.find((k) => k.id === kinshipId);

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
      }

      try {
        if (employeeId) {
          // Si el empleado ya existe en la base de datos, persistir directamente vía API
          if (relativeId) {
            const res = await apiRequest(`/employees/${employeeId}/relatives/${relativeId}`, {
              method: 'PATCH',
              body: JSON.stringify(relPayload),
            });
            const updated = res.data;
            if (indexVal !== '') {
              this.currentEmployeeRelatives[parseInt(indexVal, 10)] = { ...updated, kinship: selectedKin };
            }
            showToast('Familiar actualizado correctamente');
          } else {
            const res = await apiRequest(`/employees/${employeeId}/relatives`, {
              method: 'POST',
              body: JSON.stringify(relPayload),
            });
            const created = res.data;
            this.currentEmployeeRelatives.push({ ...created, kinship: selectedKin });
            showToast('Familiar agregado exitosamente');
          }
        } else {
          // Si estamos creando un nuevo empleado en memoria
          const localRel = {
            ...relPayload,
            id: relativeId || null,
            kinship: selectedKin,
          };
          if (indexVal !== '') {
            this.currentEmployeeRelatives[parseInt(indexVal, 10)] = localRel;
          } else {
            this.currentEmployeeRelatives.push(localRel);
          }
          showToast('Familiar añadido a la nómina');
        }

        getBootstrapModal(document.getElementById('modal-employee-relative-form'))?.hide();
        this.renderEmployeeRelativesTable();
      } catch (err) {
        if (alertBox) {
          let errorMsg = err.message || 'Error al guardar familiar';
          if (err.details && Array.isArray(err.details)) {
            errorMsg = err.details.map((d) => `• ${escapeHtml(d.message)}`).join('<br>');
          }
          alertBox.innerHTML = errorMsg;
          alertBox.classList.remove('d-none');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="ti ti-check me-1"></i> Confirmar Familiar';
        }
      }
    });
  }

  // --- Modal Universal de Confirmación de Eliminación ---

  confirmDeleteAction({ title, message, warning, confirmText = 'Eliminar', onConfirm }) {
    const modalEl = document.getElementById('modal-confirm-delete');
    if (!modalEl) {
      if (confirm(message || '¿Deseas confirmar esta eliminación?')) {
        onConfirm();
      }
      return;
    }

    const titleEl = document.getElementById('modal-confirm-delete-title');
    const msgEl = document.getElementById('modal-confirm-delete-message');
    const warnEl = document.getElementById('modal-confirm-delete-warning');
    const btnConfirm = document.getElementById('btn-confirm-delete-action');

    if (titleEl) titleEl.textContent = title || '¿Confirmar Eliminación?';
    if (msgEl) msgEl.innerHTML = message || '¿Estás seguro de que deseas dar de baja este registro?';

    if (warnEl) {
      if (warning) {
        warnEl.innerHTML = `<i class="ti ti-alert-triangle me-1"></i> ${warning}`;
        warnEl.classList.remove('d-none');
      } else {
        warnEl.classList.add('d-none');
      }
    }

    if (btnConfirm) {
      btnConfirm.innerHTML = `<i class="ti ti-trash me-1"></i> ${confirmText}`;
      const newBtn = btnConfirm.cloneNode(true);
      btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);

      newBtn.addEventListener('click', async () => {
        newBtn.disabled = true;
        newBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Procesando...';
        try {
          await onConfirm();
          getBootstrapModal(modalEl)?.hide();
        } catch (err) {
          showToast(err.message || 'Error al procesar la solicitud', 'danger');
        } finally {
          newBtn.disabled = false;
          newBtn.innerHTML = `<i class="ti ti-trash me-1"></i> ${confirmText}`;
        }
      });
    }

    getBootstrapModal(modalEl)?.show();
  }

  // --- Aperturas de Modales Auxiliares ---

  populateEmployeeSelects(selectedDept = '', selectedJob = '', selectedHi = '', selectedUnion = '', selectedMutual = '', selectedContractModality = '', selectedSalaryScale = '', selectedWorkShift = '') {
    const deptSelect = document.getElementById('employee-input-department');
    if (deptSelect) {
      const optsHtml =
        '<option value="">Seleccionar Sector...</option>' +
        this.departments.map((d) => `<option value="${d.id}" ${d.id === selectedDept ? 'selected' : ''}>${d.name}</option>`).join('');
      updateSearchableSelect(deptSelect, optsHtml, selectedDept);
    }

    const jobSelect = document.getElementById('employee-input-job-position');
    if (jobSelect) {
      const optsHtml =
        '<option value="">Seleccionar Puesto...</option>' +
        this.jobPositions.map((p) => `<option value="${p.id}" ${p.id === selectedJob ? 'selected' : ''}>${p.name}</option>`).join('');
      updateSearchableSelect(jobSelect, optsHtml, selectedJob);
    }

    const hiSelect = document.getElementById('employee-input-health-insurance');
    if (hiSelect) {
      const optsHtml =
        '<option value="">Seleccionar Obra Social...</option>' +
        this.healthInsurances.map((h) => `<option value="${h.id}" ${h.id === selectedHi ? 'selected' : ''}>${h.code ? `[${h.code}] ` : ''}${escapeHtml(h.name)}</option>`).join('');
      updateSearchableSelect(hiSelect, optsHtml, selectedHi);
    }

    const unionSelect = document.getElementById('employee-input-union');
    if (unionSelect) {
      const optsHtml =
        '<option value="">Ninguno / No Afiliado</option>' +
        this.unions.map((u) => `<option value="${u.id}" ${u.id === selectedUnion ? 'selected' : ''}>${u.name}</option>`).join('');
      updateSearchableSelect(unionSelect, optsHtml, selectedUnion);
    }

    const mutualSelect = document.getElementById('employee-input-mutual');
    if (mutualSelect) {
      const optsHtml =
        '<option value="">Ninguna / No Afiliado</option>' +
        this.mutuals.map((m) => `<option value="${m.id}" ${m.id === selectedMutual ? 'selected' : ''}>${m.name}</option>`).join('');
      updateSearchableSelect(mutualSelect, optsHtml, selectedMutual);
    }

    const modSelect = document.getElementById('employee-input-contract-modality');
    if (modSelect) {
      const modalities = this.arcaContractModalities || [];
      const activeModalities = modalities.filter((m) => m.isActive !== false);
      const historicalModalities = modalities.filter((m) => m.isActive === false);

      let optionsHtml = '<option value="">Seleccionar Modalidad de Contrato...</option>';

      if (activeModalities.length > 0) {
        optionsHtml += '<optgroup label="Modalidades Vigentes">';
        optionsHtml += activeModalities
          .map((m) => `<option value="${m.code}" ${String(m.code) === String(selectedContractModality) ? 'selected' : ''}>${m.code} - ${escapeHtml(m.name)}</option>`)
          .join('');
        optionsHtml += '</optgroup>';
      }

      if (historicalModalities.length > 0) {
        optionsHtml += '<optgroup label="Modalidades Históricas / No Vigentes">';
        optionsHtml += historicalModalities
          .map((m) => `<option value="${m.code}" ${String(m.code) === String(selectedContractModality) ? 'selected' : ''}>${m.code} - ${escapeHtml(m.name)} (No vigente)</option>`)
          .join('');
        optionsHtml += '</optgroup>';
      }

      updateSearchableSelect(modSelect, optionsHtml, selectedContractModality ? String(selectedContractModality) : '');
    }

    // Selector de Jornada de Trabajo en Tab 6
    const shiftSelect = document.getElementById('employee-select-work-shift');
    if (shiftSelect) {
      const activeShifts = (this.workShifts || []).filter((s) => s.isActive !== false);
      const optsHtml =
        '<option value="">Sin jornada específica asignada (Usar estándar 8hs/48hs/200hs)</option>' +
        activeShifts
          .map(
            (s) =>
              `<option value="${s.id}" ${s.id === selectedWorkShift ? 'selected' : ''}>${escapeHtml(s.name)} (${Number(s.weeklyHours).toFixed(1)}hs sem / ${Number(s.monthlyHours).toFixed(1)}hs mes / ${Number(s.dailyHours).toFixed(1)}hs día)</option>`
          )
          .join('');
      updateSearchableSelect(shiftSelect, optsHtml, selectedWorkShift);
    }

    this.updateSalaryScaleOptions(selectedContractModality, selectedSalaryScale);
  }

  handleEmployeeWorkShiftChange(shiftId) {
    const daysInput = document.getElementById('employee-input-monthly-days');
    const dailyHoursInput = document.getElementById('employee-input-daily-hours');
    const weeklyHoursInput = document.getElementById('employee-input-weekly-hours');
    const monthlyHoursInput = document.getElementById('employee-input-monthly-hours');
    const isPartTimeCheck = document.getElementById('employee-input-is-part-time');

    if (!shiftId) {
      if (daysInput) daysInput.value = '30.00';
      if (dailyHoursInput) dailyHoursInput.value = '8.00';
      if (weeklyHoursInput && !weeklyHoursInput.value) {
        weeklyHoursInput.value = this.payrollSettings?.standardWeeklyHoursFormatted || '48:00';
      }
      if (monthlyHoursInput && !monthlyHoursInput.value) {
        monthlyHoursInput.value = this.payrollSettings?.standardMonthlyHoursFormatted || '200:00';
      }
      this.updateEmployeeJornadaBadge();
      return;
    }

    const shift = (this.workShifts || []).find((s) => s.id === shiftId);
    if (!shift) return;

    if (daysInput) daysInput.value = Number(shift.monthlyDays).toFixed(2);
    if (dailyHoursInput) dailyHoursInput.value = Number(shift.dailyHours).toFixed(2);
    if (weeklyHoursInput) weeklyHoursInput.value = this.formatDecimalToHours(shift.weeklyHours);
    if (monthlyHoursInput) monthlyHoursInput.value = this.formatDecimalToHours(shift.monthlyHours);

    const partTimePctInput = document.getElementById('employee-input-part-time-pct');
    if (partTimePctInput && shift.percentage !== undefined && shift.percentage !== null) {
      partTimePctInput.value = Number(shift.percentage);
    }

    const stdWeeklyDec = this.parseHoursToDecimal(this.payrollSettings?.standardWeeklyHoursFormatted || '48:00') || 48;
    if (isPartTimeCheck) {
      isPartTimeCheck.checked = Number(shift.weeklyHours) < stdWeeklyDec;
    }
    this.updateEmployeeJornadaBadge();
  }

  /**
   * Filtra y actualiza dinámicamente las opciones del selector de nómina según la modalidad de contrato
   * (Mostrando únicamente nóminas de pasantes para modalidades 27 y 51, directores para modalidad 99, o estándar para las demás).
   */
  updateSalaryScaleOptions(selectedContractModality, selectedSalaryScale) {
    const scaleSelect = document.getElementById('employee-select-salary-scale');
    if (!scaleSelect) return;

    const modCode = selectedContractModality !== undefined && selectedContractModality !== null
      ? String(selectedContractModality)
      : (document.getElementById('employee-input-contract-modality')?.value || '');
    const isInternMod = modCode === '27' || modCode === '51';
    const isDirectorMod = modCode === '99';
    const allScales = this.salaryScales || [];
    const filteredScales = isDirectorMod
      ? allScales.filter((s) => s.isDirectorOnly === true)
      : (isInternMod
          ? allScales.filter((s) => s.isInternOnly === true)
          : allScales.filter((s) => !s.isInternOnly && !s.isDirectorOnly));

    // Actualizar títulos e indicaciones visuales
    const cardTitle = document.getElementById('employee-scale-card-title');
    const selectLabel = document.getElementById('employee-scale-select-label');
    const selectHint = document.getElementById('employee-scale-select-hint');
    const amountLabel = document.getElementById('employee-scale-amount-label');

    if (cardTitle) {
      cardTitle.textContent = isDirectorMod
        ? 'Retribución / Honorarios del Director (LRT Mod. 099)'
        : (isInternMod ? 'Asignación Estímulo del Pasante (Ley 26.427)' : 'Sueldo Básico del Colaborador');
    }
    if (selectLabel) {
      selectLabel.innerHTML = isDirectorMod
        ? 'Nómina de Director Asignada <span class="text-danger">*</span>'
        : (isInternMod ? 'Nómina de Pasante Asignada <span class="text-danger">*</span>' : 'Nómina / Básico Asignado <span class="text-danger">*</span>');
    }
    if (selectHint) {
      selectHint.textContent = isDirectorMod
        ? 'Nómina exclusiva para Directores / Autoridades con cobertura ART (exentos de aportes y contribuciones SUSS).'
        : (isInternMod ? 'Nómina exclusiva de asignación estímulo para pasantes educativos (Ley 26.427).' : 'Sueldo básico asignado según nómina seleccionada desde el módulo de Haberes.');
    }
    if (amountLabel) {
      amountLabel.textContent = isDirectorMod
        ? 'Honorarios / Haber Mensual'
        : (isInternMod ? 'Asignación Estímulo Mensual' : 'Importe Básico Mensual');
    }

    let targetSelection = selectedSalaryScale || scaleSelect.value || '';
    if (!filteredScales.some((s) => s.id === targetSelection)) {
      targetSelection = '';
    }

    const placeholderText = isDirectorMod
      ? '-- Seleccionar Nómina de Director --'
      : (isInternMod ? '-- Seleccionar Nómina de Pasante --' : '-- Seleccionar Nómina --');
    const optsHtml =
      `<option value="">${placeholderText}</option>` +
      filteredScales
        .map((s) => `<option value="${s.id}" data-amount="${s.amount}" ${s.id === targetSelection ? 'selected' : ''}>${escapeHtml(s.name)} ($ ${formatNumber(s.amount)})</option>`)
        .join('');
    scaleSelect.innerHTML = optsHtml;
    scaleSelect.value = targetSelection;

    const found = filteredScales.find((s) => s.id === targetSelection);
    const amountDisplay = document.getElementById('employee-scale-amount-display');
    const cardDisplay = document.getElementById('employee-scale-amount-card-display');
    const basicSalaryInput = document.getElementById('employee-input-basic-salary');
    if (found) {
      const txt = `$ ${formatNumber(found.amount)}`;
      if (amountDisplay) amountDisplay.textContent = txt;
      if (cardDisplay) cardDisplay.textContent = txt;
      if (basicSalaryInput) basicSalaryInput.value = found.amount;
    } else {
      if (amountDisplay) amountDisplay.textContent = '$ 0,00';
      if (cardDisplay) cardDisplay.textContent = '$ 0,00';
      if (basicSalaryInput) basicSalaryInput.value = '0.00';
    }
  }

  updateEmployeeEncuadrePreview(selectedJobPositionId) {
    const cctEl = document.getElementById('emp-preview-cct');
    const cctDescEl = document.getElementById('emp-preview-cct-desc');
    const cctBadge = document.getElementById('emp-preview-cct-badge');

    const catEl = document.getElementById('emp-preview-category');
    const catDescEl = document.getElementById('emp-preview-category-desc');
    const catBadge = document.getElementById('emp-preview-category-badge');

    const jobEl = document.getElementById('emp-preview-job-position');
    const jobDescEl = document.getElementById('emp-preview-job-desc');
    const jobBadge = document.getElementById('emp-preview-job-badge');

    const actEl = document.getElementById('emp-preview-company-activity');
    const actDescEl = document.getElementById('emp-preview-company-desc');
    const actBadge = document.getElementById('emp-preview-company-badge');

    // 1. Actividad de la Empresa (CLAE)
    const company = this.activeCompanyProfile || this.activeCompany || {};
    const actCode = company.activityCode || '';
    let actDesc = company.activityDescription || '';
    if (!actDesc && actCode && this.claeActivities) {
      const foundAct = this.claeActivities.find((a) => a.code === actCode);
      if (foundAct) actDesc = foundAct.description;
    }

    if (actEl) {
      if (actCode || actDesc) {
        actEl.textContent = actCode && actDesc ? `${actCode} - ${actDesc}` : (actDesc || actCode);
        if (actDescEl) actDescEl.textContent = 'Actividad económica principal declarada en Ficha de Empresa';
        if (actBadge) actBadge.textContent = actCode ? `CLAE ${actCode}` : 'CLAE';
      } else {
        actEl.textContent = 'Sin actividad económica registrada';
        if (actDescEl) actDescEl.textContent = 'Podés registrar el CLAE en Empresa > Ficha de Empresa';
        if (actBadge) actBadge.textContent = 'Sin CLAE';
      }
    }

    // 2. Encuadre vinculado al puesto de trabajo
    const job = (this.jobPositions || []).find((p) => p.id === selectedJobPositionId);
    if (!job) {
      if (cctEl) cctEl.textContent = 'Sin puesto seleccionado';
      if (cctDescEl) cctDescEl.textContent = 'Seleccioná un Puesto en "2. Laboral y Cobertura"';
      if (cctBadge) cctBadge.textContent = 'CCT';

      if (catEl) catEl.textContent = 'Sin puesto seleccionado';
      if (catDescEl) catDescEl.textContent = 'Seleccioná un Puesto en "2. Laboral y Cobertura"';
      if (catBadge) catBadge.textContent = 'Categoría';

      if (jobEl) jobEl.textContent = 'Sin puesto seleccionado';
      if (jobDescEl) jobDescEl.textContent = 'Seleccioná un Puesto en "2. Laboral y Cobertura"';
      if (jobBadge) jobBadge.textContent = 'Puesto';

      const actWorkerEl = document.getElementById('emp-preview-activity');
      const actWorkerDescEl = document.getElementById('emp-preview-activity-desc');
      const actWorkerBadge = document.getElementById('emp-preview-activity-badge');
      if (actWorkerEl) actWorkerEl.textContent = 'Sin puesto seleccionado';
      if (actWorkerDescEl) actWorkerDescEl.textContent = 'Seleccioná un Puesto en "2. Laboral y Cobertura"';
      if (actWorkerBadge) actWorkerBadge.textContent = 'T03';
      return;
    }

    // Puesto
    if (jobEl) {
      jobEl.textContent = job.name || 'Puesto sin nombre';
      const posCode = job.positionCode || job.arcaPosition?.code;
      const arcaPos = job.arcaPosition || (this.arcaPositions || []).find((p) => p.code === posCode);
      if (posCode && arcaPos?.name) {
        if (jobDescEl) jobDescEl.textContent = `Puesto Oficial ARCA: ${posCode} - ${arcaPos.name}`;
        if (jobBadge) jobBadge.textContent = `ARCA ${posCode}`;
      } else if (job.code) {
        if (jobDescEl) jobDescEl.textContent = `Código interno: ${job.code}`;
        if (jobBadge) jobBadge.textContent = job.code;
      } else {
        if (jobDescEl) jobDescEl.textContent = 'Puesto registrado en la empresa';
        if (jobBadge) jobBadge.textContent = 'Puesto';
      }
    }

    // CCT
    if (cctEl) {
      const cctCode = job.cctCode || job.cct?.code;
      const cct = job.cct || (this.arcaCcts || []).find((c) => c.code === cctCode);
      if (cctCode) {
        if (cctCode.toUpperCase() === 'FC') {
          cctEl.textContent = 'Fuera de Convenio (FC)';
          if (cctDescEl) cctDescEl.textContent = 'Régimen excluido de convenio colectivo';
          if (cctBadge) cctBadge.textContent = 'FC';
        } else {
          cctEl.textContent = cct?.name ? `CCT ${cctCode} - ${cct.name}` : `CCT ${cctCode}`;
          if (cctDescEl) cctDescEl.textContent = cct?.sector || 'Convenio colectivo aplicable';
          if (cctBadge) cctBadge.textContent = `CCT ${cctCode}`;
        }
      } else {
        cctEl.textContent = 'No especificado en el puesto';
        if (cctDescEl) cctDescEl.textContent = 'El puesto no tiene CCT vinculado';
        if (cctBadge) cctBadge.textContent = 'Sin CCT';
      }
    }

    // Categoría
    if (catEl) {
      const catCode = job.categoryCode || job.category?.code;
      const cat = job.category || (this.arcaCategories || []).find((c) => c.code === catCode);
      if (catCode) {
        catEl.textContent = cat?.name ? `${cat.name} (${catCode})` : `Código ${catCode}`;
        if (catDescEl) catDescEl.textContent = cat?.description || 'Categoría laboral del CCT';
        if (catBadge) catBadge.textContent = `Cat. ${catCode}`;
      } else {
        catEl.textContent = 'No especificada en el puesto';
        if (catDescEl) catDescEl.textContent = 'El puesto no tiene categoría vinculada';
        if (catBadge) catBadge.textContent = 'Sin Categoría';
      }
    }

    // Actividad Previsional del Trabajador (ARCA T03)
    const actWorkerEl = document.getElementById('emp-preview-activity');
    const actWorkerDescEl = document.getElementById('emp-preview-activity-desc');
    const actWorkerBadge = document.getElementById('emp-preview-activity-badge');
    if (actWorkerEl) {
      const actInfo = getArcaActivityInfo(job.activityCode || '049');
      actWorkerEl.textContent = `${actInfo.code} - ${actInfo.name}`;
      if (actWorkerDescEl) actWorkerDescEl.textContent = actInfo.description || 'Régimen previsional para SICOSS / Libro de Sueldos Digital';
      if (actWorkerBadge) actWorkerBadge.textContent = `T03 ${actInfo.code}`;
    }
  }

  updateEmployeeMapPreview() {
    const street = document.getElementById('employee-input-street')?.value.trim() || '';
    const number = document.getElementById('employee-input-street-number')?.value.trim() || '';
    const city = document.getElementById('employee-input-city')?.value.trim() || '';
    const province = document.getElementById('employee-input-province')?.value.trim() || '';

    const iframe = document.getElementById('employee-map-iframe');
    const placeholder = document.getElementById('employee-map-placeholder');
    const openLink = document.getElementById('employee-map-open-link');
    const label = document.getElementById('employee-map-address-label');
    const loading = document.getElementById('employee-map-loading');

    if (!iframe || !placeholder) return;

    // Se requiere al menos calle o localidad para tener una ubicación con sentido
    if (!street && !city) {
      iframe.classList.add('d-none');
      iframe.src = 'about:blank';
      iframe.dataset.lastQuery = '';
      placeholder.classList.remove('d-none');
      if (openLink) openLink.classList.add('d-none');
      if (label) label.innerHTML = '<i class="ti ti-map-pin me-1 text-teal"></i> Ingrese domicilio';
      if (loading) loading.classList.add('d-none');
      return;
    }

    const parts = [];
    if (street) {
      parts.push(number ? `${street} ${number}` : street);
    }
    if (city) parts.push(city);
    if (province) parts.push(province);
    parts.push('Argentina');

    const fullAddress = parts.join(', ');
    const query = encodeURIComponent(fullAddress);
    const embedUrl = `https://maps.google.com/maps?q=${query}&output=embed`;
    const externalUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;

    if (openLink) {
      openLink.href = externalUrl;
      openLink.classList.remove('d-none');
    }

    if (label) {
      label.innerHTML = `<i class="ti ti-map-pin me-1 text-teal"></i> <span title="${escapeHtml(fullAddress)}">${escapeHtml(fullAddress)}</span>`;
    }

    // Solo recargar iframe si la consulta cambió
    if (iframe.dataset.lastQuery !== fullAddress) {
      iframe.dataset.lastQuery = fullAddress;
      if (loading) loading.classList.remove('d-none');

      iframe.onload = () => {
        if (loading) loading.classList.add('d-none');
      };

      iframe.src = embedUrl;
      placeholder.classList.add('d-none');
      iframe.classList.remove('d-none');
    }
  }

  openNewEmployeeModal() {
    document.getElementById('form-employee').reset();
    document.getElementById('employee-form-id').value = '';
    document.getElementById('modal-employee-form-title').textContent = 'Ficha de Personal / Legajo';
    document.getElementById('employee-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-employee');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Legajo';

    // Resetear foto
    const photoFileInput = document.getElementById('employee-input-photo-file');
    const photoDataInput = document.getElementById('employee-input-photo-data');
    const photoPreviewAvatar = document.getElementById('employee-photo-preview-avatar');
    const photoIconPlaceholder = document.getElementById('employee-photo-icon-placeholder');
    const btnRemovePhoto = document.getElementById('btn-remove-employee-photo');

    if (photoFileInput) photoFileInput.value = '';
    if (photoDataInput) photoDataInput.value = '';
    if (photoPreviewAvatar) photoPreviewAvatar.style.backgroundImage = '';
    if (photoIconPlaceholder) photoIconPlaceholder.classList.remove('d-none');
    if (btnRemovePhoto) btnRemovePhoto.classList.add('d-none');

    const cuilInput = document.getElementById('employee-input-cuil');
    if (cuilInput) cuilInput.classList.remove('is-valid', 'is-invalid');
    const cuilStatus = document.getElementById('employee-cuil-status');
    if (cuilStatus) cuilStatus.innerHTML = '<i class="ti ti-id"></i>';
    const cuilFeedback = document.getElementById('employee-cuil-feedback');
    if (cuilFeedback) {
      cuilFeedback.className = 'form-hint';
      cuilFeedback.textContent = '11 dígitos numéricos sin guiones.';
    }

    this.currentEmployeeRelatives = [];
    this.renderEmployeeRelativesTable();

    // Tab 6: Resetear valores de nómina, jornada y conceptos
    if (document.getElementById('employee-input-payroll-group')) {
      document.getElementById('employee-input-payroll-group').value = 'MENSUAL';
    }
    const isPartTimeCheck = document.getElementById('employee-input-is-part-time');
    if (isPartTimeCheck) isPartTimeCheck.checked = false;
    const stdWeekly = this.payrollSettings?.standardWeeklyHoursFormatted || '48:00';
    const stdMonthly = this.payrollSettings?.standardMonthlyHoursFormatted || '200:00';
    if (document.getElementById('employee-input-weekly-hours')) document.getElementById('employee-input-weekly-hours').value = stdWeekly;
    if (document.getElementById('employee-input-monthly-hours')) document.getElementById('employee-input-monthly-hours').value = stdMonthly;
    if (document.getElementById('employee-input-part-time-pct')) document.getElementById('employee-input-part-time-pct').value = '100';
    if (document.getElementById('employee-input-basic-salary')) document.getElementById('employee-input-basic-salary').value = '0.00';
    if (document.getElementById('employee-input-hourly-rate')) document.getElementById('employee-input-hourly-rate').value = '0.00';
    const scaleDisplayNew = document.getElementById('employee-scale-amount-display');
    if (scaleDisplayNew) scaleDisplayNew.textContent = '$ 0,00';
    const cardScaleDisplay = document.getElementById('employee-scale-amount-card-display');
    if (cardScaleDisplay) cardScaleDisplay.textContent = '$ 0,00';

    // Reset CBU y Tipo de Cuenta
    const cbuInputNew = document.getElementById('employee-input-cbu');
    if (cbuInputNew) {
      cbuInputNew.value = '';
      cbuInputNew.classList.remove('is-valid', 'is-invalid');
    }
    const cbuBadgeNew = document.getElementById('employee-cbu-bank-badge');
    if (cbuBadgeNew) {
      cbuBadgeNew.className = 'badge bg-secondary-lt font-monospace';
      cbuBadgeNew.textContent = 'Sin C.B.U.';
    }
    const cbuStatusIconNew = document.getElementById('employee-cbu-status');
    if (cbuStatusIconNew) cbuStatusIconNew.innerHTML = '<i class="ti ti-credit-card text-muted"></i>';
    const cbuFeedbackNew = document.getElementById('employee-cbu-feedback');
    if (cbuFeedbackNew) {
      cbuFeedbackNew.className = 'form-hint';
      cbuFeedbackNew.textContent = 'Ingresá los 22 dígitos numéricos. Se validarán los dígitos verificadores según el procedimiento del B.C.R.A.';
    }
    const acctTypeSelectNew = document.getElementById('employee-select-account-type');
    if (acctTypeSelectNew) acctTypeSelectNew.value = 'CAJA_AHORRO_PESOS';

    this.currentEmployeeConcepts = [];
    this.renderEmployeeConceptsTable();
    this.updateEmployeeJornadaBadge();

    this.populateEmployeeSelects('', '', '', '', '', '8', '', '');
    this.handleEmployeeWorkShiftChange('');
    this.updateEmployeeEncuadrePreview('');
    this.updateEmployeeMapPreview();

    const firstTab = document.getElementById('tab-btn-emp-personal');
    if (firstTab && window.bootstrap?.Tab) {
      new window.bootstrap.Tab(firstTab).show();
    }
    getBootstrapModal(document.getElementById('modal-employee-form'))?.show();
  }

  async openEditEmployeeModal(emp) {
    let fullEmp = emp;
    try {
      const res = await apiRequest(`/employees/${emp.id}`);
      if (res.data) fullEmp = res.data;
    } catch (err) {
      console.warn('No se pudo obtener el detalle completo del empleado:', err);
    }

    this.currentEmployeeRelatives = fullEmp.relatives || [];
    this.renderEmployeeRelativesTable();

    this.currentEmployeeConcepts = fullEmp.assignedConcepts || [];
    this.renderEmployeeConceptsTable();

    document.getElementById('employee-form-id').value = fullEmp.id;
    document.getElementById('modal-employee-form-title').textContent = `Modificar Legajo: ${fullEmp.lastName}, ${fullEmp.firstName}`;
    document.getElementById('employee-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-employee');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Actualizar Legajo';

    // Cargar o resetear foto
    const photoFileInput = document.getElementById('employee-input-photo-file');
    const photoDataInput = document.getElementById('employee-input-photo-data');
    const photoPreviewAvatar = document.getElementById('employee-photo-preview-avatar');
    const photoIconPlaceholder = document.getElementById('employee-photo-icon-placeholder');
    const btnRemovePhoto = document.getElementById('btn-remove-employee-photo');

    if (photoFileInput) photoFileInput.value = '';
    if (fullEmp.photo) {
      if (photoDataInput) photoDataInput.value = fullEmp.photo;
      if (photoPreviewAvatar) {
        photoPreviewAvatar.style.backgroundImage = `url('${fullEmp.photo}')`;
        photoPreviewAvatar.style.backgroundSize = 'cover';
        photoPreviewAvatar.style.backgroundPosition = 'center';
      }
      if (photoIconPlaceholder) photoIconPlaceholder.classList.add('d-none');
      if (btnRemovePhoto) btnRemovePhoto.classList.remove('d-none');
    } else {
      if (photoDataInput) photoDataInput.value = '';
      if (photoPreviewAvatar) photoPreviewAvatar.style.backgroundImage = '';
      if (photoIconPlaceholder) photoIconPlaceholder.classList.remove('d-none');
      if (btnRemovePhoto) btnRemovePhoto.classList.add('d-none');
    }

    document.getElementById('employee-input-last-name').value = fullEmp.lastName || '';
    document.getElementById('employee-input-first-name').value = fullEmp.firstName || '';
    document.getElementById('employee-input-doc-type').value = fullEmp.documentType || 'DNI';
    document.getElementById('employee-input-doc-number').value = fullEmp.documentNumber || '';
    document.getElementById('employee-input-cuil').value = fullEmp.cuil ? formatCuit(fullEmp.cuil) : '';
    let genderVal = 'M';
    if (fullEmp.gender) {
      const gUpper = String(fullEmp.gender).toUpperCase();
      if (gUpper.startsWith('F')) genderVal = 'F';
      else if (gUpper.startsWith('X')) genderVal = 'X';
      else genderVal = 'M';
    }
    document.getElementById('employee-input-gender').value = genderVal;
    document.getElementById('employee-input-birth-date').value = fullEmp.birthDate ? fullEmp.birthDate.split('T')[0] : '';
    document.getElementById('employee-input-hire-date').value = fullEmp.hireDate ? fullEmp.hireDate.split('T')[0] : '';
    document.getElementById('employee-input-file-number').value = fullEmp.fileNumber || '';
    document.getElementById('employee-input-status').value = fullEmp.status || 'ACTIVE';

    document.getElementById('employee-input-street').value = fullEmp.street || '';
    document.getElementById('employee-input-street-number').value = fullEmp.streetNumber || '';
    document.getElementById('employee-input-floor').value = fullEmp.floor || '';
    document.getElementById('employee-input-apartment').value = fullEmp.apartment || '';
    document.getElementById('employee-input-city').value = fullEmp.city || '';
    document.getElementById('employee-input-postal-code').value = fullEmp.postalCode || '';
    document.getElementById('employee-input-province').value = fullEmp.province || 'Santa Fe';

    document.getElementById('employee-input-email').value = fullEmp.email || '';
    document.getElementById('employee-input-phone').value = fullEmp.phone || '';

    // Tab 6: Cargar valores de nómina, jornada y remuneración
    if (document.getElementById('employee-input-payroll-group')) {
      document.getElementById('employee-input-payroll-group').value = fullEmp.payrollGroup || 'MENSUAL';
    }
    const isPartTimeCheckEdit = document.getElementById('employee-input-is-part-time');
    if (isPartTimeCheckEdit) {
      isPartTimeCheckEdit.checked = Boolean(fullEmp.isPartTime);
    }
    if (document.getElementById('employee-input-weekly-hours')) {
      document.getElementById('employee-input-weekly-hours').value = fullEmp.weeklyWorkingHoursFormatted || (fullEmp.weeklyWorkingHours !== undefined && fullEmp.weeklyWorkingHours !== null ? this.formatDecimalToHours(fullEmp.weeklyWorkingHours) : (this.payrollSettings?.standardWeeklyHoursFormatted || '48:00'));
    }
    if (document.getElementById('employee-input-monthly-hours')) {
      document.getElementById('employee-input-monthly-hours').value = fullEmp.monthlyWorkingHoursFormatted || (fullEmp.monthlyWorkingHours !== undefined && fullEmp.monthlyWorkingHours !== null ? this.formatDecimalToHours(fullEmp.monthlyWorkingHours) : (this.payrollSettings?.standardMonthlyHoursFormatted || '200:00'));
    }
    if (document.getElementById('employee-input-part-time-pct')) {
      document.getElementById('employee-input-part-time-pct').value = fullEmp.partTimePercentage !== undefined && fullEmp.partTimePercentage !== null ? fullEmp.partTimePercentage : 100;
    }
    if (document.getElementById('employee-input-basic-salary')) {
      document.getElementById('employee-input-basic-salary').value = fullEmp.basicSalary !== undefined && fullEmp.basicSalary !== null ? fullEmp.basicSalary : '0.00';
    }
    if (document.getElementById('employee-input-hourly-rate')) {
      document.getElementById('employee-input-hourly-rate').value = fullEmp.hourlyRate !== undefined && fullEmp.hourlyRate !== null ? fullEmp.hourlyRate : '0.00';
    }
    this.updateEmployeeJornadaBadge();

    // Cargar CBU y Tipo de Cuenta Bancaria
    const cbuInputEdit = document.getElementById('employee-input-cbu');
    if (cbuInputEdit) {
      cbuInputEdit.value = fullEmp.cbu || '';
    }
    const acctTypeSelectEdit = document.getElementById('employee-select-account-type');
    if (acctTypeSelectEdit) {
      acctTypeSelectEdit.value = fullEmp.bankAccountType || 'CAJA_AHORRO_PESOS';
    }
    this.updateCbuValidationUI();

    const empShiftId = fullEmp.workShiftId || fullEmp.workShift?.id || '';
    this.populateEmployeeSelects(
      fullEmp.departmentId,
      fullEmp.jobPositionId,
      fullEmp.healthInsuranceId,
      fullEmp.unionId,
      fullEmp.mutualId,
      fullEmp.contractModalityCode || '8',
      fullEmp.salaryScaleId || fullEmp.salaryScale?.id || '',
      empShiftId
    );
    this.handleEmployeeWorkShiftChange(empShiftId);
    this.updateEmployeeEncuadrePreview(fullEmp.jobPositionId);
    this.updateEmployeeMapPreview();

    const firstTab = document.getElementById('tab-btn-emp-personal');
    if (firstTab && window.bootstrap?.Tab) {
      new window.bootstrap.Tab(firstTab).show();
    }
    getBootstrapModal(document.getElementById('modal-employee-form'))?.show();
  }

  async deleteEmployee(id, name) {
    this.confirmDeleteAction({
      title: 'Dar de Baja a Empleado',
      message: `¿Estás seguro de que deseas dar de baja al colaborador <strong>"${escapeHtml(name)}"</strong>?`,
      confirmText: 'Dar de Baja',
      onConfirm: async () => {
        await apiRequest(`/employees/${id}`, { method: 'DELETE' });
        showToast('Empleado dado de baja exitosamente');
        await this.loadEmployees();
      },
    });
  }

  // --- Sectores ---
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
  openImportDepartmentsModal() {
    this.pendingImportDepartments = [];
    const fileInput = document.getElementById('department-import-file');
    if (fileInput) fileInput.value = '';
    const alertBox = document.getElementById('department-import-alert');
    if (alertBox) {
      alertBox.textContent = '';
      alertBox.classList.add('d-none');
    }
    const previewContainer = document.getElementById('department-import-preview-container');
    if (previewContainer) previewContainer.classList.add('d-none');
    const previewBody = document.getElementById('department-import-preview-body');
    if (previewBody) previewBody.innerHTML = '';
    const confirmBtn = document.getElementById('btn-confirm-import-departments');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="ti ti-upload me-1"></i> Confirmar e Importar';
    }
    getBootstrapModal(document.getElementById('modal-import-departments'))?.show();
  }

  downloadDepartmentTemplate() {
    try {
      if (!window.XLSX) {
        throw new Error('La librería SheetJS no está disponible');
      }
      const wb = window.XLSX.utils.book_new();
      const sampleData = [
        ['Código', 'Descripción'],
        ['ADM', 'Administración y Finanzas'],
        ['COM', 'Comercial y Ventas'],
        ['PROD', 'Producción y Planta'],
        ['RRHH', 'Recursos Humanos'],
        ['LOG', 'Logística y Distribución'],
        ['SIST', 'Sistemas y Tecnología'],
        ['MANT', 'Mantenimiento y Servicios'],
      ];
      const ws = window.XLSX.utils.aoa_to_sheet(sampleData);
      ws['!cols'] = [{ wch: 15 }, { wch: 35 }];
      window.XLSX.utils.book_append_sheet(wb, ws, 'Sectores');
      window.XLSX.writeFile(wb, 'plantilla_sectores.xlsx');
      showToast('Plantilla descargada con éxito', 'success');
    } catch (err) {
      console.error('Error al descargar plantilla:', err);
      showToast('No se pudo generar la plantilla: ' + (err.message || 'Error desconocido'), 'danger');
    }
  }

  handleDepartmentFileSelect(e) {
    const file = e.target.files?.[0];
    const alertBox = document.getElementById('department-import-alert');
    const previewContainer = document.getElementById('department-import-preview-container');
    const confirmBtn = document.getElementById('btn-confirm-import-departments');

    if (alertBox) alertBox.classList.add('d-none');
    if (previewContainer) previewContainer.classList.add('d-none');
    if (confirmBtn) confirmBtn.disabled = true;
    this.pendingImportDepartments = [];

    if (!file) return;

    if (!window.XLSX) {
      if (alertBox) {
        alertBox.textContent = 'La librería de lectura Excel (SheetJS) no se encuentra disponible. Por favor recarga la página.';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = window.XLSX.read(data, { type: 'array' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('El archivo no contiene ninguna hoja de cálculo.');
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });

        if (!rows || rows.length === 0) {
          throw new Error('La primera hoja del archivo Excel está vacía.');
        }

        // Determinar si la primera fila es encabezado
        let startIndex = 0;
        const firstRow = rows[0] || [];
        const firstRowText = firstRow.map((c) => String(c || '').toLowerCase().trim()).join(' ');

        if (
          firstRowText.includes('cód') ||
          firstRowText.includes('cod') ||
          firstRowText.includes('desc') ||
          firstRowText.includes('nom') ||
          firstRowText.includes('sec')
        ) {
          startIndex = 1;
        }

        const parsedRows = [];
        for (let i = startIndex; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          // Col 1 (A) = Código, Col 2 (B) = Descripción / Nombre
          const rawCode = row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : '';
          const rawName = row[1] !== undefined && row[1] !== null ? String(row[1]).trim() : '';

          if (!rawCode && !rawName) continue;

          parsedRows.push({
            code: rawCode ? rawCode.toUpperCase() : null,
            name: rawName,
            rowIndex: i + 1,
          });
        }

        if (parsedRows.length === 0) {
          throw new Error('No se encontraron filas con datos válidos en el archivo Excel.');
        }

        this.renderDepartmentImportPreview(parsedRows);
      } catch (err) {
        console.error('Error al procesar archivo:', err);
        if (alertBox) {
          alertBox.textContent = err.message || 'Error al procesar el archivo Excel';
          alertBox.classList.remove('d-none');
        }
      }
    };

    reader.onerror = () => {
      if (alertBox) {
        alertBox.textContent = 'Ocurrió un error al leer el archivo desde el dispositivo.';
        alertBox.classList.remove('d-none');
      }
    };

    reader.readAsArrayBuffer(file);
  }

  renderDepartmentImportPreview(parsedRows) {
    const previewContainer = document.getElementById('department-import-preview-container');
    const tbody = document.getElementById('department-import-preview-body');
    const badgeValid = document.getElementById('badge-import-valid');
    const badgeDuplicates = document.getElementById('badge-import-duplicates');
    const confirmBtn = document.getElementById('btn-confirm-import-departments');
    const alertBox = document.getElementById('department-import-alert');

    // Conjuntos para detectar duplicados con los sectores ya existentes en el sistema
    const existingNamesSet = new Set(
      this.departments.map((d) => (d.name || '').trim().toLowerCase())
    );
    const existingCodesSet = new Set(
      this.departments
        .filter((d) => d.code && d.code.trim())
        .map((d) => d.code.trim().toLowerCase())
    );

    // Conjuntos para detectar duplicados dentro del mismo archivo
    const fileSeenNames = new Set();
    const fileSeenCodes = new Set();

    const validToCreate = [];
    let duplicateCount = 0;
    let invalidCount = 0;

    const htmlRows = parsedRows.map((row) => {
      const code = row.code || '';
      const name = row.name || '';
      const nameLower = name.trim().toLowerCase();
      const codeLower = code ? code.trim().toLowerCase() : null;

      let statusHtml = '';
      let isValid = false;

      if (!name || name.length < 2) {
        invalidCount++;
        statusHtml = '<span class="badge bg-danger-lt" title="La descripción debe tener al menos 2 caracteres"><i class="ti ti-alert-circle me-1"></i>Sin descripción</span>';
      } else if (existingNamesSet.has(nameLower)) {
        duplicateCount++;
        statusHtml = '<span class="badge bg-warning-lt" title="Ya existe un sector registrado con este nombre"><i class="ti ti-ban me-1"></i>Ya registrado (Nombre)</span>';
      } else if (codeLower && existingCodesSet.has(codeLower)) {
        duplicateCount++;
        statusHtml = `<span class="badge bg-warning-lt" title="Ya existe un sector con el código ${escapeHtml(code)}"><i class="ti ti-ban me-1"></i>Ya registrado (Código)</span>`;
      } else if (fileSeenNames.has(nameLower)) {
        duplicateCount++;
        statusHtml = '<span class="badge bg-warning-lt" title="Nombre repetido dentro del mismo archivo"><i class="ti ti-copy me-1"></i>Repetido en archivo</span>';
      } else if (codeLower && fileSeenCodes.has(codeLower)) {
        duplicateCount++;
        statusHtml = `<span class="badge bg-warning-lt" title="Código ${escapeHtml(code)} repetido en el archivo"><i class="ti ti-copy me-1"></i>Código repetido</span>`;
      } else {
        isValid = true;
        validToCreate.push({ name: name.trim(), code: code ? code.trim().toUpperCase() : null });
        fileSeenNames.add(nameLower);
        if (codeLower) fileSeenCodes.add(codeLower);
        statusHtml = '<span class="badge bg-success-lt"><i class="ti ti-plus me-1"></i>Se agregará</span>';
      }

      return `
        <tr class="${isValid ? '' : 'table-light text-muted opacity-75'}">
          <td class="font-monospace fw-bold ${isValid ? 'text-teal' : ''}">${escapeHtml(code || '-')}</td>
          <td class="${isValid ? 'fw-bold text-dark' : ''}">${escapeHtml(name || '(Vacío)')}</td>
          <td class="text-end">${statusHtml}</td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = htmlRows;
    this.pendingImportDepartments = validToCreate;

    if (badgeValid) badgeValid.textContent = `${validToCreate.length} nuevos para agregar`;
    if (badgeDuplicates) badgeDuplicates.textContent = `${duplicateCount + invalidCount} omitidos / duplicados`;

    if (previewContainer) previewContainer.classList.remove('d-none');

    if (validToCreate.length > 0) {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<i class="ti ti-upload me-1"></i> Importar ${validToCreate.length} Sector(es)`;
      }
      if (alertBox) alertBox.classList.add('d-none');
    } else {
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="ti ti-upload me-1"></i> Confirmar e Importar';
      }
      if (alertBox) {
        alertBox.textContent = 'Ninguno de los sectores del archivo es nuevo. Todos ya existen en la empresa o no contienen una descripción válida.';
        alertBox.classList.remove('d-none');
      }
    }
  }

  async confirmImportDepartments() {
    if (!this.pendingImportDepartments || this.pendingImportDepartments.length === 0) {
      showToast('No hay sectores válidos para importar', 'warning');
      return;
    }

    const confirmBtn = document.getElementById('btn-confirm-import-departments');
    const alertBox = document.getElementById('department-import-alert');
    if (alertBox) alertBox.classList.add('d-none');

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Importando sectores...';
    }

    try {
      const res = await apiRequest('/departments/import', {
        method: 'POST',
        body: JSON.stringify({ departments: this.pendingImportDepartments }),
      });

      // Cerrar modal de importación
      getBootstrapModal(document.getElementById('modal-import-departments'))?.hide();

      // Recargar datos auxiliares de personal (sectores, contadores)
      await this.loadPersonnelAuxiliaryData();

      // Mostrar cuadro de mensaje final con el reporte detallado
      this.showDepartmentImportSummary(res.data);
    } catch (err) {
      console.error('Error al importar sectores:', err);
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al procesar la importación';
        alertBox.classList.remove('d-none');
      }
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<i class="ti ti-upload me-1"></i> Importar ${this.pendingImportDepartments.length} Sector(es)`;
      }
    }
  }

  showDepartmentImportSummary(result) {
    const summaryModal = document.getElementById('modal-import-departments-summary');
    const bodyEl = document.getElementById('department-import-summary-body');
    if (!summaryModal || !bodyEl) return;

    const createdCount = result.createdCount || 0;
    const skipped = result.skipped || [];
    const skippedCount = result.skippedCount || skipped.length;

    let html = '';

    // Tarjeta de sectores agregados exitosamente
    if (createdCount > 0) {
      html += `
        <div class="alert alert-success d-flex align-items-center mb-3 shadow-xs">
          <i class="ti ti-circle-check fs-2 me-2"></i>
          <div>
            <strong>¡Importación completada!</strong> Se agregaron <strong>${createdCount}</strong> nuevo(s) sector(es) exitosamente a la empresa.
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="alert alert-info d-flex align-items-center mb-3 shadow-xs">
          <i class="ti ti-info-circle fs-2 me-2"></i>
          <div>No se agregaron nuevos sectores a la base de datos.</div>
        </div>
      `;
    }

    // Cuadro informativo de sectores omitidos (informar sectores que se omitieron)
    if (skippedCount > 0) {
      html += `
        <div class="card card-sm border-warning mb-2 shadow-xs">
          <div class="card-status-top bg-warning"></div>
          <div class="card-body p-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <h6 class="fw-bold text-dark mb-0">
                <i class="ti ti-alert-triangle text-warning me-1"></i> Sectores Omitidos (${skippedCount}):
              </h6>
              <span class="badge bg-warning-lt">No duplicados</span>
            </div>
            <p class="text-muted small mb-2">
              Los siguientes sectores no fueron agregados porque ya existían en el sistema o poseían datos duplicados:
            </p>
            <div class="table-responsive border rounded bg-white" style="max-height: 200px; overflow-y: auto;">
              <table class="table table-sm table-vcenter card-table table-hover mb-0">
                <thead class="sticky-top bg-light">
                  <tr>
                    <th style="width: 100px;">Código</th>
                    <th>Descripción / Nombre</th>
                    <th>Motivo de Omisión</th>
                  </tr>
                </thead>
                <tbody>
                  ${skipped
                    .map(
                      (s) => `
                    <tr>
                      <td class="font-monospace fw-bold text-muted">${escapeHtml(s.code || '-')}</td>
                      <td class="fw-medium text-dark">${escapeHtml(s.name || '-')}</td>
                      <td><span class="badge bg-warning-lt text-wrap text-start">${escapeHtml(s.reason || 'Ya cargado')}</span></td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    bodyEl.innerHTML = html;
    getBootstrapModal(summaryModal)?.show();
  }

  // --- Importación de Puestos de Trabajo desde Excel ---
  openImportJobPositionsModal() {
    this.pendingImportJobPositions = [];
    const fileInput = document.getElementById('job-position-import-file');
    if (fileInput) fileInput.value = '';
    const alertBox = document.getElementById('job-position-import-alert');
    if (alertBox) {
      alertBox.textContent = '';
      alertBox.classList.add('d-none');
    }
    const previewContainer = document.getElementById('job-position-import-preview-container');
    if (previewContainer) previewContainer.classList.add('d-none');
    const previewBody = document.getElementById('job-position-import-preview-body');
    if (previewBody) previewBody.innerHTML = '';
    const confirmBtn = document.getElementById('btn-confirm-import-job-positions');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="ti ti-upload me-1"></i> Confirmar e Importar';
    }
    getBootstrapModal(document.getElementById('modal-import-job-positions'))?.show();
  }

  downloadJobPositionTemplate() {
    try {
      if (!window.XLSX) {
        throw new Error('La librería SheetJS no está disponible');
      }
      const wb = window.XLSX.utils.book_new();
      const sampleData = [
        ['Código *', 'Denominación / Puesto *', 'Convenio CCT (Opcional)', 'Categoría CCT (Opcional)', 'Puesto ARCA (Opcional)', 'Tipo Servicio ARCA (Opcional)'],
        ['ADM-01', 'Administrativo Contable Senior', '0130/75', '', '', ''],
        ['OP-01', 'Operario de Producción y Planta', '', '', '', ''],
        ['VND-01', 'Vendedor de Salón y Atención al Público', '0130/75', '', '', ''],
        ['LOG-01', 'Coordinador de Depósito y Logística', '', '', '', ''],
        ['GER-01', 'Gerente de Operaciones y Servicios', 'FC', '', '', ''],
      ];
      const ws = window.XLSX.utils.aoa_to_sheet(sampleData);
      ws['!cols'] = [
        { wch: 15 },
        { wch: 38 },
        { wch: 24 },
        { wch: 24 },
        { wch: 22 },
        { wch: 26 },
      ];
      window.XLSX.utils.book_append_sheet(wb, ws, 'Puestos');
      window.XLSX.writeFile(wb, 'plantilla_puestos_trabajo.xlsx');
      showToast('Plantilla de puestos descargada con éxito', 'success');
    } catch (err) {
      console.error('Error al descargar plantilla:', err);
      showToast('No se pudo generar la plantilla: ' + (err.message || 'Error desconocido'), 'danger');
    }
  }

  handleJobPositionFileSelect(e) {
    const file = e.target.files?.[0];
    const alertBox = document.getElementById('job-position-import-alert');
    const previewContainer = document.getElementById('job-position-import-preview-container');
    const confirmBtn = document.getElementById('btn-confirm-import-job-positions');

    if (alertBox) alertBox.classList.add('d-none');
    if (previewContainer) previewContainer.classList.add('d-none');
    if (confirmBtn) confirmBtn.disabled = true;
    this.pendingImportJobPositions = [];

    if (!file) return;

    if (!window.XLSX) {
      if (alertBox) {
        alertBox.textContent = 'La librería de lectura Excel (SheetJS) no se encuentra disponible. Por favor recarga la página.';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = window.XLSX.read(data, { type: 'array' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('El archivo no contiene ninguna hoja de cálculo.');
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });

        if (!rows || rows.length === 0) {
          throw new Error('La primera hoja del archivo Excel está vacía.');
        }

        // Determinar si la primera fila es encabezado
        let startIndex = 0;
        let colMap = { code: 0, name: 1, cct: 2, category: 3, position: 4, service: 5 };
        const firstRow = rows[0] || [];
        const firstRowText = firstRow.map((c) => String(c || '').toLowerCase().trim()).join(' ');

        if (
          firstRowText.includes('cód') ||
          firstRowText.includes('cod') ||
          firstRowText.includes('nom') ||
          firstRowText.includes('puesto') ||
          firstRowText.includes('denominac') ||
          firstRowText.includes('cct') ||
          firstRowText.includes('convenio')
        ) {
          startIndex = 1;
          // Asignación inteligente de columnas si los encabezados varían de posición
          firstRow.forEach((cell, idx) => {
            const h = String(cell || '').toLowerCase().trim();
            if (h.includes('cód') || h.includes('cod')) {
              if (!h.includes('cct') && !h.includes('cat') && !h.includes('arca') && !h.includes('serv')) {
                colMap.code = idx;
              }
            } else if (h.includes('nom') || h.includes('denominac') || (h.includes('puesto') && !h.includes('arca'))) {
              colMap.name = idx;
            } else if (h.includes('cct') || h.includes('convenio')) {
              colMap.cct = idx;
            } else if (h.includes('cat') || h.includes('categor')) {
              colMap.category = idx;
            } else if (h.includes('arca') || (h.includes('puesto') && h.includes('arca'))) {
              colMap.position = idx;
            } else if (h.includes('serv') || h.includes('servicio')) {
              colMap.service = idx;
            }
          });
        }

        const parsedRows = [];
        for (let i = startIndex; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const rawCode = row[colMap.code] !== undefined && row[colMap.code] !== null ? String(row[colMap.code]).trim() : '';
          const rawName = row[colMap.name] !== undefined && row[colMap.name] !== null ? String(row[colMap.name]).trim() : '';
          const rawCct = row[colMap.cct] !== undefined && row[colMap.cct] !== null ? String(row[colMap.cct]).trim() : '';
          const rawCat = row[colMap.category] !== undefined && row[colMap.category] !== null ? String(row[colMap.category]).trim() : '';
          const rawPos = row[colMap.position] !== undefined && row[colMap.position] !== null ? String(row[colMap.position]).trim() : '';
          const rawServ = row[colMap.service] !== undefined && row[colMap.service] !== null ? String(row[colMap.service]).trim() : '';

          if (!rawCode && !rawName) continue;

          parsedRows.push({
            code: rawCode ? rawCode.toUpperCase() : '',
            name: rawName,
            cctCode: rawCct || null,
            categoryCode: rawCat || null,
            positionCode: rawPos || null,
            serviceTypeCode: rawServ || null,
            rowIndex: i + 1,
          });
        }

        if (parsedRows.length === 0) {
          throw new Error('No se encontraron filas con datos válidos en el archivo Excel.');
        }

        this.renderJobPositionImportPreview(parsedRows);
      } catch (err) {
        console.error('Error al procesar archivo:', err);
        if (alertBox) {
          alertBox.textContent = err.message || 'Error al procesar el archivo Excel';
          alertBox.classList.remove('d-none');
        }
      }
    };

    reader.onerror = () => {
      if (alertBox) {
        alertBox.textContent = 'Ocurrió un error al leer el archivo desde el dispositivo.';
        alertBox.classList.remove('d-none');
      }
    };

    reader.readAsArrayBuffer(file);
  }

  renderJobPositionImportPreview(parsedRows) {
    const previewContainer = document.getElementById('job-position-import-preview-container');
    const tbody = document.getElementById('job-position-import-preview-body');
    const badgeValid = document.getElementById('badge-job-import-valid');
    const badgeDuplicates = document.getElementById('badge-job-import-duplicates');
    const confirmBtn = document.getElementById('btn-confirm-import-job-positions');
    const alertBox = document.getElementById('job-position-import-alert');

    // Conjuntos para detectar duplicados con los puestos ya existentes en el sistema
    const existingNamesSet = new Set(
      this.jobPositions.map((p) => (p.name || '').trim().toLowerCase())
    );
    const existingCodesSet = new Set(
      this.jobPositions
        .filter((p) => p.code && p.code.trim())
        .map((p) => p.code.trim().toLowerCase())
    );

    // Conjuntos para detectar duplicados dentro del mismo archivo
    const fileSeenNames = new Set();
    const fileSeenCodes = new Set();

    const validToCreate = [];
    let duplicateCount = 0;
    let invalidCount = 0;

    const htmlRows = parsedRows.map((row) => {
      const code = (row.code || '').trim();
      const name = (row.name || '').trim();
      const cctCode = row.cctCode || '';
      const nameLower = name.toLowerCase();
      const codeLower = code.toLowerCase();

      let statusHtml = '';
      let isValid = false;

      // Código y Nombre son obligatorios
      if (!code) {
        invalidCount++;
        statusHtml = '<span class="badge bg-danger-lt" title="El código del puesto es obligatorio"><i class="ti ti-alert-circle me-1"></i>Código requerido</span>';
      } else if (!name || name.length < 2) {
        invalidCount++;
        statusHtml = '<span class="badge bg-danger-lt" title="El nombre debe tener al menos 2 caracteres"><i class="ti ti-alert-circle me-1"></i>Nombre requerido</span>';
      } else if (existingCodesSet.has(codeLower)) {
        duplicateCount++;
        statusHtml = `<span class="badge bg-warning-lt" title="Ya existe un puesto con el código ${escapeHtml(code)}"><i class="ti ti-ban me-1"></i>Ya registrado (Código)</span>`;
      } else if (existingNamesSet.has(nameLower)) {
        duplicateCount++;
        statusHtml = '<span class="badge bg-warning-lt" title="Ya existe un puesto registrado con esta denominación"><i class="ti ti-ban me-1"></i>Ya registrado (Nombre)</span>';
      } else if (fileSeenCodes.has(codeLower)) {
        duplicateCount++;
        statusHtml = `<span class="badge bg-warning-lt" title="Código ${escapeHtml(code)} repetido en el archivo"><i class="ti ti-copy me-1"></i>Código repetido</span>`;
      } else if (fileSeenNames.has(nameLower)) {
        duplicateCount++;
        statusHtml = '<span class="badge bg-warning-lt" title="Denominación repetida dentro del mismo archivo"><i class="ti ti-copy me-1"></i>Nombre repetido</span>';
      } else {
        isValid = true;
        validToCreate.push({
          code: code.toUpperCase(),
          name,
          cctCode: row.cctCode || null,
          categoryCode: row.categoryCode || null,
          positionCode: row.positionCode || null,
          serviceTypeCode: row.serviceTypeCode || null,
        });
        fileSeenCodes.add(codeLower);
        fileSeenNames.add(nameLower);
        statusHtml = '<span class="badge bg-success-lt"><i class="ti ti-plus me-1"></i>Se agregará</span>';
      }

      return `
        <tr class="${isValid ? '' : 'table-light text-muted opacity-75'}">
          <td class="font-monospace fw-bold ${isValid ? 'text-teal' : ''}">${escapeHtml(code || '-')}</td>
          <td class="${isValid ? 'fw-bold text-dark' : ''}">${escapeHtml(name || '(Vacío)')}</td>
          <td class="font-monospace small text-muted">${escapeHtml(cctCode || '-')}</td>
          <td class="text-end">${statusHtml}</td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = htmlRows;
    this.pendingImportJobPositions = validToCreate;

    if (badgeValid) badgeValid.textContent = `${validToCreate.length} nuevos para agregar`;
    if (badgeDuplicates) badgeDuplicates.textContent = `${duplicateCount + invalidCount} omitidos / duplicados`;

    if (previewContainer) previewContainer.classList.remove('d-none');

    if (validToCreate.length > 0) {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<i class="ti ti-upload me-1"></i> Importar ${validToCreate.length} Puesto(s)`;
      }
      if (alertBox) alertBox.classList.add('d-none');
    } else {
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="ti ti-upload me-1"></i> Confirmar e Importar';
      }
      if (alertBox) {
        alertBox.textContent = 'Ninguno de los puestos del archivo es nuevo. Todos ya existen en la empresa, carecen de código obligatorio o no contienen una denominación válida.';
        alertBox.classList.remove('d-none');
      }
    }
  }

  async confirmImportJobPositions() {
    if (!this.pendingImportJobPositions || this.pendingImportJobPositions.length === 0) {
      showToast('No hay puestos de trabajo válidos para importar', 'warning');
      return;
    }

    const confirmBtn = document.getElementById('btn-confirm-import-job-positions');
    const alertBox = document.getElementById('job-position-import-alert');
    if (alertBox) alertBox.classList.add('d-none');

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Importando puestos...';
    }

    try {
      const res = await apiRequest('/job-positions/import', {
        method: 'POST',
        body: JSON.stringify({ jobPositions: this.pendingImportJobPositions }),
      });

      // Cerrar modal de importación
      getBootstrapModal(document.getElementById('modal-import-job-positions'))?.hide();

      // Recargar datos auxiliares de personal (puestos, contadores)
      await this.loadPersonnelAuxiliaryData();

      // Mostrar cuadro de mensaje final con el reporte detallado
      this.showJobPositionsImportSummary(res.data);
    } catch (err) {
      console.error('Error al importar puestos:', err);
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al procesar la importación';
        alertBox.classList.remove('d-none');
      }
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<i class="ti ti-upload me-1"></i> Importar ${this.pendingImportJobPositions.length} Puesto(s)`;
      }
    }
  }

  showJobPositionsImportSummary(result) {
    const summaryModal = document.getElementById('modal-import-job-positions-summary');
    const bodyEl = document.getElementById('job-position-import-summary-body');
    if (!summaryModal || !bodyEl) return;

    const createdCount = result.createdCount || 0;
    const skipped = result.skipped || [];
    const skippedCount = result.skippedCount || skipped.length;

    let html = '';

    // Tarjeta de puestos agregados exitosamente
    if (createdCount > 0) {
      html += `
        <div class="alert alert-success d-flex align-items-center mb-3 shadow-xs">
          <i class="ti ti-circle-check fs-2 me-2"></i>
          <div>
            <strong>¡Importación completada!</strong> Se agregaron <strong>${createdCount}</strong> nuevo(s) puesto(s) de trabajo exitosamente a la empresa.
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="alert alert-info d-flex align-items-center mb-3 shadow-xs">
          <i class="ti ti-info-circle fs-2 me-2"></i>
          <div>No se agregaron nuevos puestos a la base de datos.</div>
        </div>
      `;
    }

    // Cuadro informativo de puestos omitidos
    if (skippedCount > 0) {
      html += `
        <div class="card card-sm border-warning mb-2 shadow-xs">
          <div class="card-status-top bg-warning"></div>
          <div class="card-body p-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <h6 class="fw-bold text-dark mb-0">
                <i class="ti ti-alert-triangle text-warning me-1"></i> Puestos Omitidos (${skippedCount}):
              </h6>
              <span class="badge bg-warning-lt">No duplicados</span>
            </div>
            <p class="text-muted small mb-2">
              Los siguientes puestos no fueron agregados porque ya existían en el sistema, les faltaba código/nombre obligatorio o poseían datos duplicados:
            </p>
            <div class="table-responsive border rounded bg-white" style="max-height: 200px; overflow-y: auto;">
              <table class="table table-sm table-vcenter card-table table-hover mb-0">
                <thead class="sticky-top bg-light">
                  <tr>
                    <th style="width: 110px;">Código</th>
                    <th>Denominación / Puesto</th>
                    <th>Motivo de Omisión</th>
                  </tr>
                </thead>
                <tbody>
                  ${skipped
                    .map(
                      (s) => `
                    <tr>
                      <td class="font-monospace fw-bold text-muted">${escapeHtml(s.code || '-')}</td>
                      <td class="fw-medium text-dark">${escapeHtml(s.name || '-')}</td>
                      <td><span class="badge bg-warning-lt text-wrap text-start">${escapeHtml(s.reason || 'Ya cargado')}</span></td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    bodyEl.innerHTML = html;
    getBootstrapModal(summaryModal)?.show();
  }

  // --- Importación de Nómina de Personal desde Excel ---
  openImportEmployeesModal() {
    this.pendingImportEmployees = [];
    const fileInput = document.getElementById('employee-import-file');
    if (fileInput) fileInput.value = '';
    const alertBox = document.getElementById('employee-import-alert');
    if (alertBox) {
      alertBox.textContent = '';
      alertBox.classList.add('d-none');
    }
    const previewContainer = document.getElementById('employee-import-preview-container');
    if (previewContainer) previewContainer.classList.add('d-none');
    const previewBody = document.getElementById('employee-import-preview-body');
    if (previewBody) previewBody.innerHTML = '';
    const confirmBtn = document.getElementById('btn-confirm-import-employees');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="ti ti-upload me-1"></i> Confirmar e Importar';
    }
    getBootstrapModal(document.getElementById('modal-import-employees'))?.show();
  }

  downloadEmployeeTemplate() {
    try {
      if (!window.XLSX) throw new Error('La librería SheetJS no está disponible');
      const wb = window.XLSX.utils.book_new();
      const headers = [
        'Legajo *', 'Apellido *', 'Nombres *', 'Tipo Documento *', 'Número Documento *', 'CUIL *', 'Género *',
        'Fecha Nacimiento *', 'Fecha Ingreso *', 'Sector *', 'Puesto *', 'Obra Social *', 'Sindicato', 'Mutual',
        'Modalidad Contratación', 'Calle *', 'Número *', 'Piso', 'Departamento', 'Localidad *', 'Código Postal',
        'Provincia *', 'Email *', 'Teléfono *', 'Fecha Baja', 'Motivo Baja'
      ];
      const sampleRows = [
        headers,
        [
          'LEG-001', 'Gómez', 'Martín', 'DNI', '32123456', '20321234564', 'M',
          '15/05/1986', '01/03/2020', 'Administración y Finanzas', 'Analista Contable Senior', 'O.S.P.E.C.E.', '', '',
          '001', 'Av. Corrientes', '1234', '4', 'B', 'CABA', '1043',
          'Buenos Aires', 'martin.gomez@empresa.com', '1145678901', '', ''
        ],
        [
          'LEG-002', 'López', 'Lucía', 'DNI', '35987654', '27359876542', 'F',
          '20/11/1990', '15/08/2021', 'ADM-01', 'PST-01', '1-0010-0', '', '',
          '', 'San Martín', '550', '', '', 'Rosario', '',
          'Santa Fe', 'lucia.lopez@empresa.com', '3414987654', '', ''
        ],
        [
          'LEG-003', 'Pérez', 'Juan Carlos', 'DNI', '28111222', '20281112224', 'M',
          '10/02/1980', '01/01/2018', 'PROD', 'OP-01', 'O.S.P.E.C.E.', '', '',
          '', 'Mitre', '2200', '', '', 'Córdoba', '5000',
          'Córdoba', 'juan.perez@empresa.com', '3514223344', '31/12/2023', 'Renuncia voluntaria'
        ]
      ];
      const ws = window.XLSX.utils.aoa_to_sheet(sampleRows);
      ws['!cols'] = [
        { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 10 },
        { wch: 18 }, { wch: 16 }, { wch: 24 }, { wch: 26 }, { wch: 22 }, { wch: 16 }, { wch: 16 },
        { wch: 22 }, { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 18 }, { wch: 14 },
        { wch: 18 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 24 }
      ];
      window.XLSX.utils.book_append_sheet(wb, ws, 'Personal');
      window.XLSX.writeFile(wb, 'plantilla_personal.xlsx');
      showToast('Plantilla de personal descargada con éxito', 'success');
    } catch (err) {
      console.error('Error al descargar plantilla:', err);
      showToast('No se pudo generar la plantilla: ' + (err.message || 'Error desconocido'), 'danger');
    }
  }

  handleEmployeeFileSelect(e) {
    const file = e.target.files?.[0];
    const alertBox = document.getElementById('employee-import-alert');
    const previewContainer = document.getElementById('employee-import-preview-container');
    const confirmBtn = document.getElementById('btn-confirm-import-employees');

    if (alertBox) alertBox.classList.add('d-none');
    if (previewContainer) previewContainer.classList.add('d-none');
    if (confirmBtn) confirmBtn.disabled = true;
    this.pendingImportEmployees = [];

    if (!file) return;
    if (!window.XLSX) {
      if (alertBox) {
        alertBox.textContent = 'La librería SheetJS no se encuentra disponible. Por favor recarga la página.';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = window.XLSX.read(data, { type: 'array' });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('El archivo no contiene ninguna hoja.');
        }

        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });
        if (!rows || rows.length === 0) {
          throw new Error('La primera hoja del archivo Excel está vacía.');
        }

        let startIndex = 0;
        const colMap = {
          fileNumber: 0, lastName: 1, firstName: 2, documentType: 3, documentNumber: 4, cuil: 5,
          gender: 6, birthDate: 7, hireDate: 8, department: 9, jobPosition: 10, healthInsurance: 11,
          union: 12, mutual: 13, contractModality: 14, street: 15, streetNumber: 16, floor: 17,
          apartment: 18, city: 19, postalCode: 20, province: 21, email: 22, phone: 23,
          terminationDate: 24, terminationReason: 25
        };

        const firstRow = rows[0] || [];
        const firstRowText = firstRow.map((c) => String(c || '').toLowerCase().trim()).join(' ');

        if (firstRowText.includes('leg') || firstRowText.includes('apell') || firstRowText.includes('cuil') || firstRowText.includes('doc')) {
          startIndex = 1;
          firstRow.forEach((cell, idx) => {
            const h = String(cell || '').toLowerCase().trim();
            if (h.includes('leg')) colMap.fileNumber = idx;
            else if (h.includes('apell')) colMap.lastName = idx;
            else if (h.includes('nom')) colMap.firstName = idx;
            else if (h.includes('tipo') && h.includes('doc')) colMap.documentType = idx;
            else if ((h.includes('nro') || h.includes('núm') || h.includes('num')) && h.includes('doc')) colMap.documentNumber = idx;
            else if (h.includes('cuil')) colMap.cuil = idx;
            else if (h.includes('gén') || h.includes('gen')) colMap.gender = idx;
            else if (h.includes('nacim')) colMap.birthDate = idx;
            else if (h.includes('ingres')) colMap.hireDate = idx;
            else if (h.includes('sect')) colMap.department = idx;
            else if (h.includes('puest')) colMap.jobPosition = idx;
            else if (h.includes('obra') || h.includes('social')) colMap.healthInsurance = idx;
            else if (h.includes('sindic')) colMap.union = idx;
            else if (h.includes('mutu')) colMap.mutual = idx;
            else if (h.includes('modalid')) colMap.contractModality = idx;
            else if (h.includes('calle')) colMap.street = idx;
            else if (h.includes('núm') || h.includes('num') || h.includes('altura') || h.includes('puerta')) colMap.streetNumber = idx;
            else if (h.includes('piso')) colMap.floor = idx;
            else if (h.includes('dept') || h.includes('departam')) colMap.apartment = idx;
            else if (h.includes('local') || h.includes('ciudad')) colMap.city = idx;
            else if (h.includes('postal') || h.includes('cp')) colMap.postalCode = idx;
            else if (h.includes('prov')) colMap.province = idx;
            else if (h.includes('mail')) colMap.email = idx;
            else if (h.includes('tel')) colMap.phone = idx;
            else if (h.includes('baja') && (h.includes('fec') || !h.includes('motiv'))) colMap.terminationDate = idx;
            else if (h.includes('motiv')) colMap.terminationReason = idx;
          });
        }

        const parsedRows = [];
        for (let i = startIndex; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;
          const getVal = (col) => (row[col] !== undefined && row[col] !== null ? String(row[col]).trim() : '');

          const fileNumber = getVal(colMap.fileNumber);
          const lastName = getVal(colMap.lastName);
          const firstName = getVal(colMap.firstName);
          if (!fileNumber && !lastName && !firstName) continue;

          parsedRows.push({
            fileNumber,
            lastName,
            firstName,
            documentType: getVal(colMap.documentType) || 'DNI',
            documentNumber: getVal(colMap.documentNumber),
            cuil: getVal(colMap.cuil),
            gender: getVal(colMap.gender) || 'M',
            birthDate: row[colMap.birthDate] !== undefined ? row[colMap.birthDate] : '',
            hireDate: row[colMap.hireDate] !== undefined ? row[colMap.hireDate] : '',
            department: getVal(colMap.department),
            jobPosition: getVal(colMap.jobPosition),
            healthInsurance: getVal(colMap.healthInsurance),
            union: getVal(colMap.union),
            mutual: getVal(colMap.mutual),
            contractModality: getVal(colMap.contractModality),
            street: getVal(colMap.street),
            streetNumber: getVal(colMap.streetNumber),
            floor: getVal(colMap.floor),
            apartment: getVal(colMap.apartment),
            city: getVal(colMap.city),
            postalCode: getVal(colMap.postalCode),
            province: getVal(colMap.province),
            email: getVal(colMap.email),
            phone: getVal(colMap.phone),
            terminationDate: row[colMap.terminationDate] !== undefined ? row[colMap.terminationDate] : '',
            terminationReason: getVal(colMap.terminationReason),
            rowIndex: i + 1,
          });
        }

        if (parsedRows.length === 0) throw new Error('No se encontraron registros con datos en el archivo.');
        this.renderEmployeeImportPreview(parsedRows);
      } catch (err) {
        console.error('Error al procesar archivo de empleados:', err);
        if (alertBox) {
          alertBox.textContent = err.message || 'Error al procesar el archivo';
          alertBox.classList.remove('d-none');
        }
      }
    };
    reader.onerror = () => {
      if (alertBox) {
        alertBox.textContent = 'Error al leer el archivo desde el dispositivo.';
        alertBox.classList.remove('d-none');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  renderEmployeeImportPreview(parsedRows) {
    const previewContainer = document.getElementById('employee-import-preview-container');
    const tbody = document.getElementById('employee-import-preview-body');
    const badgeValid = document.getElementById('badge-emp-import-valid');
    const badgeDuplicates = document.getElementById('badge-emp-import-duplicates');
    const confirmBtn = document.getElementById('btn-confirm-import-employees');
    const alertBox = document.getElementById('employee-import-alert');

    // Catálogos cargados en cliente para validación preliminar
    const deptSet = new Set(this.departments.flatMap((d) => [d.code?.toLowerCase(), d.name?.toLowerCase()]).filter(Boolean));
    const jobSet = new Set(this.jobPositions.flatMap((j) => [j.code?.toLowerCase(), j.name?.toLowerCase()]).filter(Boolean));
    const hiSet = new Set((this.healthInsurances || []).flatMap((h) => [h.code?.toLowerCase(), h.name?.toLowerCase()]).filter(Boolean));
    const unionSet = new Set((this.unions || []).flatMap((u) => [u.code?.toLowerCase(), u.name?.toLowerCase()]).filter(Boolean));
    const mutualSet = new Set((this.mutuals || []).flatMap((m) => [m.code?.toLowerCase(), m.name?.toLowerCase()]).filter(Boolean));

    const existingFilesSet = new Set(this.employees.map((e) => (e.fileNumber || '').trim().toLowerCase()));
    const existingCuilsSet = new Set(this.employees.map((e) => (e.cuil || '').trim().replace(/\D/g, '')));

    const fileSeenFiles = new Set();
    const fileSeenCuils = new Set();
    const validToCreate = [];
    let invalidCount = 0;

    const htmlRows = parsedRows.map((row) => {
      const fn = (row.fileNumber || '').trim();
      const fnLower = fn.toLowerCase();
      const cleanCuil = (row.cuil || '').replace(/\D/g, '');
      const rawDept = (row.department || '').trim();
      const rawJob = (row.jobPosition || '').trim();
      const rawHi = (row.healthInsurance || '').trim();
      const rawUnion = (row.union || '').trim();
      const rawMutual = (row.mutual || '').trim();
      const hasBaja = Boolean(row.terminationDate && String(row.terminationDate).trim());

      let statusHtml = '';
      let isValid = false;

      if (!fn) {
        invalidCount++;
        statusHtml = '<span class="badge bg-danger-lt"><i class="ti ti-alert-circle me-1"></i>Sin Legajo</span>';
      } else if (!row.lastName || row.lastName.length < 2 || !row.firstName || row.firstName.length < 2) {
        invalidCount++;
        statusHtml = '<span class="badge bg-danger-lt"><i class="ti ti-alert-circle me-1"></i>Nombre incompleto</span>';
      } else if (!row.documentNumber) {
        invalidCount++;
        statusHtml = '<span class="badge bg-danger-lt"><i class="ti ti-alert-circle me-1"></i>Sin Documento</span>';
      } else if (!cleanCuil || cleanCuil.length !== 11) {
        invalidCount++;
        statusHtml = '<span class="badge bg-danger-lt"><i class="ti ti-alert-circle me-1"></i>CUIL debe tener 11 dígitos</span>';
      } else if (!row.street || !row.streetNumber || !row.city || !row.province) {
        invalidCount++;
        statusHtml = '<span class="badge bg-danger-lt"><i class="ti ti-alert-circle me-1"></i>Domicilio incompleto</span>';
      } else if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
        invalidCount++;
        statusHtml = '<span class="badge bg-danger-lt"><i class="ti ti-alert-circle me-1"></i>E-mail inválido</span>';
      } else if (!row.phone) {
        invalidCount++;
        statusHtml = '<span class="badge bg-danger-lt"><i class="ti ti-alert-circle me-1"></i>Sin Teléfono</span>';
      } else if (!rawDept || !deptSet.has(rawDept.toLowerCase())) {
        invalidCount++;
        statusHtml = `<span class="badge bg-warning-lt" title="Sector no encontrado: ${escapeHtml(rawDept)}"><i class="ti ti-ban me-1"></i>Sector inexistente</span>`;
      } else if (!rawJob || !jobSet.has(rawJob.toLowerCase())) {
        invalidCount++;
        statusHtml = `<span class="badge bg-warning-lt" title="Puesto no encontrado: ${escapeHtml(rawJob)}"><i class="ti ti-ban me-1"></i>Puesto inexistente</span>`;
      } else if (rawHi && hiSet.size > 0 && !hiSet.has(rawHi.toLowerCase())) {
        invalidCount++;
        statusHtml = `<span class="badge bg-warning-lt" title="Obra Social no encontrada: ${escapeHtml(rawHi)}"><i class="ti ti-ban me-1"></i>Obra Social inexistente</span>`;
      } else if (rawUnion && unionSet.size > 0 && !unionSet.has(rawUnion.toLowerCase())) {
        invalidCount++;
        statusHtml = `<span class="badge bg-warning-lt" title="Sindicato no encontrado"><i class="ti ti-ban me-1"></i>Sindicato inexistente</span>`;
      } else if (rawMutual && mutualSet.size > 0 && !mutualSet.has(rawMutual.toLowerCase())) {
        invalidCount++;
        statusHtml = `<span class="badge bg-warning-lt" title="Mutual no encontrada"><i class="ti ti-ban me-1"></i>Mutual inexistente</span>`;
      } else if (existingFilesSet.has(fnLower)) {
        invalidCount++;
        statusHtml = `<span class="badge bg-warning-lt"><i class="ti ti-ban me-1"></i>Legajo ya registrado</span>`;
      } else if (existingCuilsSet.has(cleanCuil)) {
        invalidCount++;
        statusHtml = `<span class="badge bg-warning-lt"><i class="ti ti-ban me-1"></i>CUIL ya registrado</span>`;
      } else if (fileSeenFiles.has(fnLower)) {
        invalidCount++;
        statusHtml = `<span class="badge bg-warning-lt"><i class="ti ti-copy me-1"></i>Legajo repetido</span>`;
      } else if (fileSeenCuils.has(cleanCuil)) {
        invalidCount++;
        statusHtml = `<span class="badge bg-warning-lt"><i class="ti ti-copy me-1"></i>CUIL repetido</span>`;
      } else {
        isValid = true;
        validToCreate.push(row);
        fileSeenFiles.add(fnLower);
        fileSeenCuils.add(cleanCuil);
        statusHtml = hasBaja
          ? '<span class="badge bg-secondary-lt"><i class="ti ti-user-off me-1"></i>Alta como Inactivo</span>'
          : '<span class="badge bg-success-lt"><i class="ti ti-plus me-1"></i>Se agregará</span>';
      }

      const statusBadge = hasBaja
        ? '<span class="badge bg-danger-lt">Baja</span>'
        : '<span class="badge bg-success-lt">Activo</span>';

      return `
        <tr class="${isValid ? '' : 'table-light text-muted opacity-75'}">
          <td class="font-monospace fw-bold ${isValid ? 'text-teal' : ''}">${escapeHtml(fn || '-')}</td>
          <td class="${isValid ? 'fw-bold text-dark' : ''}">${escapeHtml(row.lastName || '')}, ${escapeHtml(row.firstName || '')}</td>
          <td class="font-monospace small">${escapeHtml(cleanCuil || row.documentNumber || '-')}</td>
          <td class="small text-truncate" style="max-width: 140px;" title="${escapeHtml(rawDept)}">${escapeHtml(rawDept || '-')}</td>
          <td class="small text-truncate" style="max-width: 140px;" title="${escapeHtml(rawJob)}">${escapeHtml(rawJob || '-')}</td>
          <td>${statusBadge}</td>
          <td class="text-end">${statusHtml}</td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = htmlRows;
    this.pendingImportEmployees = validToCreate;

    if (badgeValid) badgeValid.textContent = `${validToCreate.length} nuevos para agregar`;
    if (badgeDuplicates) badgeDuplicates.textContent = `${invalidCount} omitidos / inválidos`;
    if (previewContainer) previewContainer.classList.remove('d-none');

    if (validToCreate.length > 0) {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<i class="ti ti-upload me-1"></i> Importar ${validToCreate.length} Colaborador(es)`;
      }
      if (alertBox) alertBox.classList.add('d-none');
    } else {
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="ti ti-upload me-1"></i> Confirmar e Importar';
      }
      if (alertBox) {
        alertBox.textContent = 'Ninguno de los colaboradores del archivo es nuevo y válido. Verifique los datos obligatorios y la existencia de los sectores y puestos.';
        alertBox.classList.remove('d-none');
      }
    }
  }

  async confirmImportEmployees() {
    if (!this.pendingImportEmployees || this.pendingImportEmployees.length === 0) {
      showToast('No hay colaboradores válidos para importar', 'warning');
      return;
    }

    const confirmBtn = document.getElementById('btn-confirm-import-employees');
    const alertBox = document.getElementById('employee-import-alert');
    if (alertBox) alertBox.classList.add('d-none');

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Importando nómina...';
    }

    try {
      const res = await apiRequest('/employees/import', {
        method: 'POST',
        body: JSON.stringify({ employees: this.pendingImportEmployees }),
      });

      getBootstrapModal(document.getElementById('modal-import-employees'))?.hide();
      await this.loadEmployees();
      await this.loadPersonnelAuxiliaryData();
      this.showEmployeeImportSummary(res.data);
    } catch (err) {
      console.error('Error al importar empleados:', err);
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al procesar la importación';
        alertBox.classList.remove('d-none');
      }
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<i class="ti ti-upload me-1"></i> Importar ${this.pendingImportEmployees.length} Colaborador(es)`;
      }
    }
  }

  showEmployeeImportSummary(result) {
    const summaryModal = document.getElementById('modal-import-employees-summary');
    const bodyEl = document.getElementById('employee-import-summary-body');
    if (!summaryModal || !bodyEl) return;

    const createdCount = result.createdCount || 0;
    const skipped = result.skipped || [];
    const skippedCount = result.skippedCount || skipped.length;

    let html = '';
    if (createdCount > 0) {
      html += `
        <div class="alert alert-success d-flex align-items-center mb-3 shadow-xs">
          <i class="ti ti-circle-check fs-2 me-2"></i>
          <div>
            <strong>¡Importación completada!</strong> Se incorporaron <strong>${createdCount}</strong> colaborador(es) exitosamente al archivo de personal.
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="alert alert-info d-flex align-items-center mb-3 shadow-xs">
          <i class="ti ti-info-circle fs-2 me-2"></i>
          <div>No se incorporaron nuevos empleados a la base de datos.</div>
        </div>
      `;
    }

    if (skippedCount > 0) {
      html += `
        <div class="card card-sm border-warning mb-2 shadow-xs">
          <div class="card-status-top bg-warning"></div>
          <div class="card-body p-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <h6 class="fw-bold text-dark mb-0">
                <i class="ti ti-alert-triangle text-warning me-1"></i> Legajos Omitidos (${skippedCount}):
              </h6>
              <span class="badge bg-warning-lt">No ingresados</span>
            </div>
            <p class="text-muted small mb-2">
              Los siguientes registros fueron omitidos por duplicidad, CUIL inválido o falta de datos requeridos:
            </p>
            <div class="table-responsive border rounded bg-white" style="max-height: 220px; overflow-y: auto;">
              <table class="table table-sm table-vcenter card-table table-hover mb-0">
                <thead class="sticky-top bg-light">
                  <tr>
                    <th style="width: 100px;">Legajo</th>
                    <th>Colaborador</th>
                    <th>Motivo de Omisión</th>
                  </tr>
                </thead>
                <tbody>
                  ${skipped
                    .map(
                      (s) => `
                    <tr>
                      <td class="font-monospace fw-bold text-muted">${escapeHtml(s.fileNumber || '-')}</td>
                      <td class="fw-medium text-dark">${escapeHtml(s.name || '-')}</td>
                      <td><span class="badge bg-warning-lt text-wrap text-start">${escapeHtml(s.reason || 'Datos inválidos')}</span></td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    bodyEl.innerHTML = html;
    getBootstrapModal(summaryModal)?.show();
  }

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

  openNewWorkShiftModal() {
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
  openNewHealthInsuranceModal() {
    document.getElementById('form-health-insurance').reset();
    document.getElementById('health-insurance-form-id').value = '';
    document.getElementById('modal-health-insurance-form-title').textContent = 'Nueva Obra Social';
    document.getElementById('health-insurance-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-health-insurance');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Obra Social';
    getBootstrapModal(document.getElementById('modal-health-insurance-form'))?.show();
  }

  openEditHealthInsuranceModal(hi) {
    document.getElementById('health-insurance-form-id').value = hi.id;
    document.getElementById('health-insurance-input-name').value = hi.name;
    document.getElementById('health-insurance-input-code').value = hi.code || '';
    document.getElementById('modal-health-insurance-form-title').textContent = `Editar Obra Social: ${hi.name}`;
    document.getElementById('health-insurance-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-health-insurance');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Actualizar Obra Social';
    getBootstrapModal(document.getElementById('modal-health-insurance-form'))?.show();
  }

  async deleteHealthInsurance(id, name, employeeCount = 0) {
    if (employeeCount > 0) {
      this.confirmDeleteAction({
        title: 'Obra Social con Afiliados',
        message: `La obra social <strong>"${escapeHtml(name)}"</strong> cuenta con <strong>${employeeCount}</strong> empleado(s) afiliado(s).`,
        warning: 'Recomendamos reasignar a los empleados antes de dar de baja la cobertura.',
        confirmText: 'Continuar de todos modos',
        onConfirm: async () => {
          await apiRequest(`/health-insurances/${id}`, { method: 'DELETE' });
          showToast('Obra social eliminada correctamente');
          await this.loadPersonnelAuxiliaryData();
        },
      });
      return;
    }

    this.confirmDeleteAction({
      title: 'Eliminar Obra Social',
      message: `¿Estás seguro de que deseas dar de baja la obra social <strong>"${escapeHtml(name)}"</strong>?`,
      onConfirm: async () => {
        await apiRequest(`/health-insurances/${id}`, { method: 'DELETE' });
        showToast('Obra social eliminada correctamente');
        await this.loadPersonnelAuxiliaryData();
      },
    });
  }

  // --- Sindicatos ---
  openNewUnionModal() {
    document.getElementById('form-union').reset();
    document.getElementById('union-form-id').value = '';
    document.getElementById('modal-union-form-title').textContent = 'Nuevo Sindicato';
    document.getElementById('union-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-union');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Sindicato';
    getBootstrapModal(document.getElementById('modal-union-form'))?.show();
  }

  openEditUnionModal(union) {
    document.getElementById('union-form-id').value = union.id;
    document.getElementById('union-input-name').value = union.name;
    document.getElementById('union-input-code').value = union.code || '';
    document.getElementById('modal-union-form-title').textContent = `Editar Sindicato: ${union.name}`;
    document.getElementById('union-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-union');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Actualizar Sindicato';
    getBootstrapModal(document.getElementById('modal-union-form'))?.show();
  }

  async deleteUnion(id, name, employeeCount = 0) {
    this.confirmDeleteAction({
      title: 'Eliminar Sindicato / Convenio',
      message: `¿Estás seguro de que deseas eliminar el sindicato <strong>"${escapeHtml(name)}"</strong>?` +
        (employeeCount > 0 ? `<br><span class="text-muted small">Nota: Tiene ${employeeCount} empleado(s) afiliado(s).</span>` : ''),
      onConfirm: async () => {
        await apiRequest(`/unions/${id}`, { method: 'DELETE' });
        showToast('Sindicato eliminado correctamente');
        await this.loadPersonnelAuxiliaryData();
      },
    });
  }

  // --- Mutuales ---
  openNewMutualModal() {
    document.getElementById('form-mutual').reset();
    document.getElementById('mutual-form-id').value = '';
    document.getElementById('modal-mutual-form-title').textContent = 'Nueva Mutual';
    document.getElementById('mutual-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-mutual');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Mutual';
    getBootstrapModal(document.getElementById('modal-mutual-form'))?.show();
  }

  openEditMutualModal(mutual) {
    document.getElementById('mutual-form-id').value = mutual.id;
    document.getElementById('mutual-input-name').value = mutual.name;
    document.getElementById('mutual-input-code').value = mutual.code || '';
    document.getElementById('modal-mutual-form-title').textContent = `Editar Mutual: ${mutual.name}`;
    document.getElementById('mutual-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-mutual');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Actualizar Mutual';
    getBootstrapModal(document.getElementById('modal-mutual-form'))?.show();
  }

  async deleteMutual(id, name, employeeCount = 0) {
    this.confirmDeleteAction({
      title: 'Eliminar Mutual',
      message: `¿Estás seguro de que deseas dar de baja la mutual <strong>"${escapeHtml(name)}"</strong>?` +
        (employeeCount > 0 ? `<br><span class="text-muted small">Nota: Tiene ${employeeCount} empleado(s) afiliado(s).</span>` : ''),
      onConfirm: async () => {
        await apiRequest(`/mutuals/${id}`, { method: 'DELETE' });
        showToast('Mutual eliminada correctamente');
        await this.loadPersonnelAuxiliaryData();
      },
    });
  }

  // --- Familiares de Empleado ---
  openNewRelativeModal() {
    document.getElementById('form-employee-relative').reset();
    document.getElementById('employee-relative-form-index').value = '';
    document.getElementById('employee-relative-form-id').value = '';
    document.getElementById('modal-employee-relative-form-title').textContent = 'Agregar Familiar';
    document.getElementById('relative-form-alert')?.classList.add('d-none');
    document.getElementById('relative-input-doc-type').value = 'DNI';
    getBootstrapModal(document.getElementById('modal-employee-relative-form'))?.show();
  }

  openEditRelativeModal(index) {
    const rel = this.currentEmployeeRelatives[index];
    if (!rel) return;

    document.getElementById('employee-relative-form-index').value = String(index);
    document.getElementById('employee-relative-form-id').value = rel.id || '';
    document.getElementById('modal-employee-relative-form-title').textContent = `Editar Familiar: ${rel.lastName}, ${rel.firstName}`;
    document.getElementById('relative-form-alert')?.classList.add('d-none');

    document.getElementById('relative-input-kinship').value = rel.kinshipId || rel.kinship?.id || '';
    document.getElementById('relative-input-last-name').value = rel.lastName || '';
    document.getElementById('relative-input-first-name').value = rel.firstName || '';
    document.getElementById('relative-input-doc-type').value = rel.documentType || 'DNI';
    document.getElementById('relative-input-doc-number').value = rel.documentNumber || '';
    document.getElementById('relative-input-cuil').value = rel.cuil ? formatCuit(rel.cuil) : '';
    document.getElementById('relative-input-birth-date').value = rel.birthDate ? rel.birthDate.split('T')[0] : '';

    getBootstrapModal(document.getElementById('modal-employee-relative-form'))?.show();
  }

  async deleteRelativeFromForm(index) {
    const rel = this.currentEmployeeRelatives[index];
    if (!rel) return;

    const employeeId = document.getElementById('employee-form-id')?.value;

    this.confirmDeleteAction({
      title: 'Quitar Familiar',
      message: `¿Estás seguro de que deseas quitar a <strong>"${escapeHtml(rel.lastName)}, ${escapeHtml(rel.firstName)}"</strong> de las cargas de familia?`,
      confirmText: 'Quitar',
      onConfirm: async () => {
        if (employeeId && rel.id) {
          await apiRequest(`/employees/${employeeId}/relatives/${rel.id}`, { method: 'DELETE' });
          showToast('Familiar eliminado correctamente');
        }
        this.currentEmployeeRelatives.splice(index, 1);
        this.renderEmployeeRelativesTable();
      },
    });
  }

  // --- Parentescos ---
  openNewKinshipModal() {
    document.getElementById('form-kinship').reset();
    document.getElementById('kinship-form-id').value = '';
    document.getElementById('modal-kinship-form-title').textContent = 'Nuevo Parentesco';
    document.getElementById('kinship-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-kinship');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Parentesco';
    getBootstrapModal(document.getElementById('modal-kinship-form'))?.show();
  }

  openEditKinshipModal(kin) {
    document.getElementById('kinship-form-id').value = kin.id;
    document.getElementById('kinship-input-name').value = kin.name;
    document.getElementById('kinship-input-code').value = kin.code || '';
    document.getElementById('modal-kinship-form-title').textContent = `Editar Parentesco: ${kin.name}`;
    document.getElementById('kinship-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-kinship');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Actualizar Parentesco';
    getBootstrapModal(document.getElementById('modal-kinship-form'))?.show();
  }

  async deleteKinship(id, name, relativeCount = 0) {
    if (relativeCount > 0) {
      this.confirmDeleteAction({
        title: 'Parentesco con Familiares Vinculados',
        message: `No es posible eliminar el parentesco <strong>"${escapeHtml(name)}"</strong> porque tiene <strong>${relativeCount}</strong> familiar(es) vinculado(s).`,
        warning: 'Para dar de baja este parentesco, primero debes modificar o reasignar a los familiares vinculados.',
        confirmText: 'Entendido',
        onConfirm: async () => {},
      });
      return;
    }

    this.confirmDeleteAction({
      title: 'Eliminar Parentesco',
      message: `¿Estás seguro de que deseas eliminar el parentesco <strong>"${escapeHtml(name)}"</strong>?`,
      onConfirm: async () => {
        await apiRequest(`/kinships/${id}`, { method: 'DELETE' });
        showToast('Parentesco eliminado correctamente');
        await this.loadPersonnelAuxiliaryData();
      },
    });
  }

}

export function registerPersonnelMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(PersonnelMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
