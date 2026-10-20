import { apiRequest, storage, showToast } from '../api.js';
import {
  isValidCuit,
  formatCuit,
  escapeHtml,
  getBootstrapModal,
} from '../utils/helpers.js';

class AdminMethods {
  renderDashboard() {
    const compCountEl = document.getElementById('stat-companies-count');
    const activeCompNameEl = document.getElementById('stat-active-company');
    const planNameEl = document.getElementById('stat-plan-name');

    if (compCountEl) compCountEl.textContent = this.companies.length;
    if (activeCompNameEl) {
      activeCompNameEl.textContent = this.activeCompany ? this.activeCompany.name : 'Ninguna seleccionada';
    }
    if (planNameEl) planNameEl.textContent = this.account?.status || 'TRIAL';

    // Card lateral de Empresa Activa en Dashboard
    const dashActiveName = document.getElementById('dash-active-company-name');
    const dashActiveCuit = document.getElementById('dash-active-company-cuit');
    const dashActiveAvatar = document.getElementById('dash-active-company-avatar');

    if (dashActiveName) {
      dashActiveName.textContent = this.activeCompany ? this.activeCompany.name : 'Sin empresa seleccionada';
    }
    if (dashActiveCuit) {
      dashActiveCuit.textContent = this.activeCompany ? formatCuit(this.activeCompany.cuit) : '-';
    }
    if (dashActiveAvatar && this.activeCompany) {
      const initials = (this.activeCompany.name || 'PS').substring(0, 2).toUpperCase();
      dashActiveAvatar.textContent = initials;
    }

    const tenantIndicator = document.getElementById('adm-active-tenant-indicator');
    if (tenantIndicator) {
      tenantIndicator.textContent = this.activeCompany
        ? `Empresa Activa: ${this.activeCompany.name}`
        : 'Sin empresa seleccionada';
    }
  }

  // --- Helper: Copiar texto al portapapeles ---
  copyToClipboard(text, label = 'Dato') {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      showToast(`${label} copiado al portapapeles: ${text}`);
    }).catch(() => {
      showToast(`Error al copiar ${label}`, 'danger');
    });
  }

  // --- Vista 2: ABM de Empresas (Obsidian Luxury Dark) ---
  renderCompaniesTable() {
    const tbody = document.getElementById('companies-table-body');
    if (!tbody) return;

    // Actualizar métricas KPI de Empresas
    const totalCompEl = document.getElementById('adm-kpi-total-companies');
    const activeCompEl = document.getElementById('adm-kpi-active-company');
    const quotaCompEl = document.getElementById('adm-kpi-quota-companies');
    const dbStatusEl = document.getElementById('adm-kpi-db-status');
    const tenantIndicator = document.getElementById('adm-active-tenant-indicator');

    const totalCount = this.companies.length;
    const maxCompanies = this.account?.maxCompanies || 1;

    if (totalCompEl) totalCompEl.textContent = totalCount;
    if (activeCompEl) {
      activeCompEl.textContent = this.activeCompany ? this.activeCompany.name : 'Ninguna';
      activeCompEl.title = this.activeCompany ? this.activeCompany.name : '';
    }
    if (quotaCompEl) quotaCompEl.textContent = `${totalCount} de ${maxCompanies}`;
    if (dbStatusEl) dbStatusEl.textContent = totalCount > 0 ? '100% OK' : '0%';
    if (tenantIndicator) {
      tenantIndicator.textContent = this.activeCompany
        ? `Empresa Activa: ${this.activeCompany.name}`
        : 'Sin empresa seleccionada';
    }

    // Configurar búsqueda reactiva y filtros si aún no fueron inicializados
    this.setupCompaniesFilters();

    // Filtrar empresas según término de búsqueda y filtro de estado
    const query = (this.companiesSearchQuery || '').toLowerCase().trim();
    const filter = this.companiesFilterStatus || 'ALL';

    const filteredCompanies = this.companies.filter((c) => {
      const matchSearch =
        !query ||
        (c.name && c.name.toLowerCase().includes(query)) ||
        (c.tradeName && c.tradeName.toLowerCase().includes(query)) ||
        (c.cuit && c.cuit.includes(query));

      if (!matchSearch) return false;

      if (filter === 'ACTIVE') {
        return this.activeCompany && this.activeCompany.id === c.id;
      }
      if (filter === 'WITH_CLAE') {
        return !!c.activityCode;
      }
      return true;
    });

    if (filteredCompanies.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="adm-empty-state">
              <div class="adm-empty-icon">
                <i class="ti ti-building-off"></i>
              </div>
              <h3 class="adm-empty-title">
                ${query ? 'No se encontraron empresas con ese criterio' : 'No hay empresas registradas aún'}
              </h3>
              <p class="adm-empty-desc">
                ${
                  query
                    ? 'Verificá que el nombre, CUIT o término ingresado esté bien escrito.'
                    : 'Aprovisioná tu primera empresa cliente para comenzar a liquidar sueldos con base de datos independiente.'
                }
              </p>
              ${
                !query && this.user?.role === 'OWNER'
                  ? `<button class="adm-btn-primary btn-empty-new-comp" type="button"><i class="ti ti-plus"></i> Crear Primera Empresa</button>`
                  : ''
              }
            </div>
          </td>
        </tr>
      `;

      const emptyNewBtn = tbody.querySelector('.btn-empty-new-comp');
      if (emptyNewBtn) {
        emptyNewBtn.addEventListener('click', () => this.openNewCompanyForm());
      }
      return;
    }

    tbody.innerHTML = filteredCompanies
      .map((c) => {
        const isCurrent = this.activeCompany && this.activeCompany.id === c.id;
        const initials = (c.name || 'EM').substring(0, 2).toUpperCase();
        const safeName = escapeHtml(c.name || 'Sin Razón Social');
        const safeTradeName = c.tradeName ? escapeHtml(c.tradeName) : '';

        return `
        <tr class="${isCurrent ? 'adm-row-active' : ''}">
          <td>
            <div class="d-flex align-items-center gap-3">
              <div class="adm-avatar adm-avatar-company">
                ${initials}
              </div>
              <div class="d-flex flex-column" style="max-width: 240px;">
                <strong class="text-white text-truncate" title="${safeName}">${safeName}</strong>
                ${safeTradeName ? `<span class="text-muted small text-truncate" title="${safeTradeName}">${safeTradeName}</span>` : ''}
              </div>
            </div>
          </td>
          <td>
            <div class="d-flex align-items-center gap-2">
              <span class="adm-cuit-chip">
                <code>${formatCuit(c.cuit)}</code>
                <button type="button" class="adm-copy-btn btn-copy-cuit" data-cuit="${c.cuit}" title="Copiar CUIT" aria-label="Copiar CUIT">
                  <i class="ti ti-copy"></i>
                </button>
              </span>
            </div>
          </td>
          <td>
            ${
              c.activityCode
                ? `<span class="adm-badge adm-badge-clae" title="${escapeHtml(c.activity?.description || 'Actividad CLAE')}">
                    <i class="ti ti-briefcase text-info"></i> CLAE ${c.activityCode}
                   </span>`
                : '<span class="text-muted small">Sin asignar</span>'
            }
          </td>
          <td>
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="adm-badge adm-badge-active">
                <i class="ti ti-check"></i> ${c.status || 'ACTIVA'}
              </span>
              <span class="adm-badge adm-badge-db" title="Base física MySQL aprovisionada e independiente">
                <i class="ti ti-database"></i> Aprovisionada
              </span>
            </div>
          </td>
          <td>
            ${
              isCurrent
                ? `<span class="adm-badge adm-badge-active">
                    <span class="adm-pulse-dot"></span> Empresa Activa
                   </span>`
                : `<button class="adm-action-btn adm-action-btn-primary btn-select-company" data-id="${c.id}" type="button" aria-label="Seleccionar empresa ${safeName}">
                    <i class="ti ti-check"></i> Activar
                   </button>`
            }
          </td>
          <td class="text-end">
            <div class="d-flex align-items-center justify-content-end gap-2">
              <button class="adm-action-btn btn-open-profile" data-id="${c.id}" title="Ficha y Parámetros Fiscales" type="button" aria-label="Ficha de ${safeName}">
                <i class="ti ti-file-text"></i> Ficha
              </button>
              <div class="dropdown">
                <button class="adm-action-icon-btn" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Más opciones para ${safeName}">
                  <i class="ti ti-dots-vertical"></i>
                </button>
                <div class="dropdown-menu dropdown-menu-end adm-dropdown-luxury">
                  <a class="dropdown-item btn-open-profile" href="#" data-id="${c.id}">
                    <i class="ti ti-file-certificate me-2 text-info"></i> Datos y Ficha Fiscal
                  </a>
                  ${
                    this.user?.role === 'OWNER'
                      ? `
                    <a class="dropdown-item btn-edit-company" href="#" data-id="${c.id}">
                      <i class="ti ti-edit me-2 text-primary"></i> Modificar Razón Social
                    </a>
                    <div class="dropdown-divider"></div>
                    <a class="dropdown-item text-danger btn-delete-company" href="#" data-id="${c.id}" data-name="${safeName}">
                      <i class="ti ti-trash me-2"></i> Dar de Baja
                    </a>
                  `
                      : ''
                  }
                </div>
              </div>
            </div>
          </td>
        </tr>
      `;
      })
      .join('');

    // Asignar listeners reactivos
    tbody.querySelectorAll('.btn-select-company').forEach((btn) => {
      btn.addEventListener('click', () => {
        const comp = this.companies.find((c) => c.id === btn.dataset.id);
        if (comp) this.selectCompany(comp);
      });
    });

    tbody.querySelectorAll('.btn-open-profile').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const comp = this.companies.find((c) => c.id === btn.dataset.id);
        if (comp) this.openEditCompanyForm(comp);
      });
    });

    tbody.querySelectorAll('.btn-edit-company').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const comp = this.companies.find((c) => c.id === btn.dataset.id);
        if (comp) this.openEditCompanyForm(comp);
      });
    });

    tbody.querySelectorAll('.btn-delete-company').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.deleteCompany(btn.dataset.id, btn.dataset.name);
      });
    });

    tbody.querySelectorAll('.btn-copy-cuit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.copyToClipboard(btn.dataset.cuit, 'CUIT');
      });
    });
  }

  setupCompaniesFilters() {
    if (this._companiesFiltersConfigured) return;
    this._companiesFiltersConfigured = true;

    const searchInput = document.getElementById('companies-search-input');
    const statusSelect = document.getElementById('companies-status-filter');

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.companiesSearchQuery = searchInput.value;
        this.renderCompaniesTable();
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', () => {
        this.companiesFilterStatus = statusSelect.value;
        this.renderCompaniesTable();
      });
    }
  }

  setupCompanyModals() {
    const newBtn = document.getElementById('btn-open-new-company-form');
    if (newBtn) {
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openNewCompanyForm();
      });
    }
  }

  openNewCompanyForm() {
    this.companyFormMode = 'new';
    this.editingCompany = null;

    const titleEl = document.getElementById('profile-company-title');
    if (titleEl) titleEl.textContent = 'Nueva Empresa: Alta de Razón Social';

    const alertBox = document.getElementById('profile-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const readonlyNotice = document.getElementById('profile-readonly-notice');
    if (readonlyNotice) readonlyNotice.classList.add('d-none');

    const form = document.getElementById('form-company-profile');
    if (form) {
      form.querySelectorAll('input, select, textarea').forEach((input) => {
        input.disabled = false;
      });
    }

    // Limpiar campos
    document.getElementById('profile-legal-name').value = '';
    document.getElementById('profile-trade-name').value = '';

    const cuitInput = document.getElementById('profile-cuit');
    cuitInput.value = '';
    cuitInput.readOnly = false;
    cuitInput.classList.remove('bg-light', 'is-valid', 'is-invalid');
    const cuitStatus = document.getElementById('profile-cuit-status');
    if (cuitStatus) cuitStatus.innerHTML = '<i class="ti ti-id"></i>';
    const cuitFeedback = document.getElementById('profile-cuit-feedback');
    if (cuitFeedback) {
      cuitFeedback.className = 'adm-form-hint';
      cuitFeedback.textContent = '11 dígitos numéricos sin guiones.';
    }

    document.getElementById('profile-tax-condition').value = 'RESPONSABLE_INSCRIPTO';
    document.getElementById('profile-gross-income').value = '';
    document.getElementById('profile-address').value = '';
    document.getElementById('profile-city').value = '';
    document.getElementById('profile-province').value = '';
    document.getElementById('profile-postal-code').value = '';
    document.getElementById('profile-phone').value = '';
    document.getElementById('profile-email').value = '';
    document.getElementById('profile-activity-start').value = '';
    document.getElementById('profile-art-name').value = '';
    document.getElementById('profile-bank-name').value = '';
    document.getElementById('profile-bank-cbu').value = '';

    this.setClaeSelection('', '');
    this.loadClaeActivities();
    this.activateCompanyTab('tab-btn-fiscal');

    const submitBtn = document.getElementById('btn-save-profile');
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="ti ti-device-floppy"></i> Crear y Guardar Empresa';
    }

    this.showView('company-profile');
  }

  async openEditCompanyForm(company) {
    this.companyFormMode = 'edit';
    this.editingCompany = company;
    this.selectCompany(company, false);

    const titleEl = document.getElementById('profile-company-title');
    if (titleEl) titleEl.textContent = company.name;

    const alertBox = document.getElementById('profile-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const submitBtn = document.getElementById('btn-save-profile');
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="ti ti-device-floppy"></i> Guardar Cambios de la Empresa';
    }

    const cuitInput = document.getElementById('profile-cuit');
    if (cuitInput) {
      cuitInput.value = formatCuit(company.cuit);
      cuitInput.readOnly = true;
      cuitInput.classList.remove('is-invalid');
    }
    const cuitStatus = document.getElementById('profile-cuit-status');
    if (cuitStatus) cuitStatus.innerHTML = '<i class="ti ti-check text-success" title="Validado en AFIP/ARCA"></i>';
    const cuitFeedback = document.getElementById('profile-cuit-feedback');
    if (cuitFeedback) {
      cuitFeedback.className = 'adm-form-hint text-success';
      cuitFeedback.textContent = '✓ CUIT registrado en el sistema.';
    }

    this.showView('company-profile');
    this.activateCompanyTab('tab-btn-fiscal');
    await this.renderCompanyProfileView();
  }

  async deleteCompany(companyId, companyName) {
    if (!confirm(`¿Confirmás que deseas dar de baja la empresa "${companyName}"? Esta acción afectará el acceso a sus datos operativos.`)) {
      return;
    }

    try {
      await apiRequest(`/companies/${companyId}`, {
        method: 'DELETE',
      });
      showToast(`Empresa "${companyName}" dada de baja correctamente`);
      await this.loadCompanies();
      this.renderCompaniesTable();
    } catch (err) {
      showToast(err.message || 'Error al dar de baja empresa', 'danger');
    }
  }

  // --- Vista 3: ABM de Usuarios (Obsidian Luxury Dark) ---
  async renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    // Estado 1: Shimmer Skeleton de Carga
    tbody.innerHTML = `
      <tr class="adm-skeleton-row">
        <td><div class="adm-skeleton-box" style="width: 70%;"></div></td>
        <td><div class="adm-skeleton-box" style="width: 40%;"></div></td>
        <td><div class="adm-skeleton-box" style="width: 30%;"></div></td>
        <td><div class="adm-skeleton-box" style="width: 60%;"></div></td>
        <td><div class="adm-skeleton-box" style="width: 50%;"></div></td>
      </tr>
      <tr class="adm-skeleton-row">
        <td><div class="adm-skeleton-box" style="width: 80%;"></div></td>
        <td><div class="adm-skeleton-box" style="width: 45%;"></div></td>
        <td><div class="adm-skeleton-box" style="width: 35%;"></div></td>
        <td><div class="adm-skeleton-box" style="width: 55%;"></div></td>
        <td><div class="adm-skeleton-box" style="width: 50%;"></div></td>
      </tr>
    `;

    try {
      const res = await apiRequest('/users?limit=50');
      this.users = res.data || [];

      // Actualizar métricas KPI de Usuarios
      const totalUsersEl = document.getElementById('adm-kpi-total-users');
      const adminUsersEl = document.getElementById('adm-kpi-admin-users');
      const operatorUsersEl = document.getElementById('adm-kpi-operator-users');
      const activeUsersEl = document.getElementById('adm-kpi-active-users');

      const totalUsers = this.users.length;
      const adminCount = this.users.filter((u) => u.role === 'ADMIN' || u.role === 'OWNER').length;
      const operatorCount = this.users.filter((u) => u.role === 'MEMBER').length;
      const activeCount = this.users.filter((u) => u.isActive).length;

      if (totalUsersEl) totalUsersEl.textContent = totalUsers;
      if (adminUsersEl) adminUsersEl.textContent = adminCount;
      if (operatorUsersEl) operatorUsersEl.textContent = operatorCount;
      if (activeUsersEl) activeUsersEl.textContent = activeCount;

      this.setupUsersFilters();
      this.renderUsersRows();
    } catch (err) {
      // Estado 3: Error
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="p-4 text-center">
            <div class="alert alert-danger mb-0 d-inline-flex align-items-center gap-2">
              <i class="ti ti-alert-triangle fs-3"></i>
              <span>Error al cargar colaboradores: ${escapeHtml(err.message)}</span>
            </div>
          </td>
        </tr>
      `;
    }
  }

  setupUsersFilters() {
    if (this._usersFiltersConfigured) return;
    this._usersFiltersConfigured = true;

    const searchInput = document.getElementById('users-search-input');
    const roleSelect = document.getElementById('users-role-filter');

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.usersSearchQuery = searchInput.value;
        this.renderUsersRows();
      });
    }

    if (roleSelect) {
      roleSelect.addEventListener('change', () => {
        this.usersRoleFilter = roleSelect.value;
        this.renderUsersRows();
      });
    }
  }

  renderUsersRows() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    const query = (this.usersSearchQuery || '').toLowerCase().trim();
    const roleFilter = this.usersRoleFilter || 'ALL';

    const filteredUsers = this.users.filter((u) => {
      const matchSearch =
        !query ||
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(query) ||
        (u.email && u.email.toLowerCase().includes(query)) ||
        (u.position && u.position.toLowerCase().includes(query)) ||
        (u.cuil && u.cuil.includes(query));

      if (!matchSearch) return false;

      if (roleFilter !== 'ALL') {
        return u.role === roleFilter;
      }
      return true;
    });

    if (filteredUsers.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="adm-empty-state">
              <div class="adm-empty-icon">
                <i class="ti ti-users"></i>
              </div>
              <h3 class="adm-empty-title">
                ${query ? 'No se encontraron colaboradores con esa búsqueda' : 'No hay colaboradores en la cuenta'}
              </h3>
              <p class="adm-empty-desc">
                ${
                  query
                    ? 'Verificá el nombre, email o cargo ingresado.'
                    : 'Invitá a tu equipo contable o liquidadores asignándoles permisos específicos por empresa.'
                }
              </p>
              ${
                !query
                  ? `<button class="adm-btn-primary btn-empty-new-user" type="button"><i class="ti ti-user-plus"></i> Registrar Colaborador</button>`
                  : ''
              }
            </div>
          </td>
        </tr>
      `;

      const emptyNewBtn = tbody.querySelector('.btn-empty-new-user');
      if (emptyNewBtn) {
        emptyNewBtn.addEventListener('click', () => this.openNewUserModal());
      }
      return;
    }

    tbody.innerHTML = filteredUsers
      .map((u) => {
        const initials = `${(u.firstName || '')[0] || ''}${(u.lastName || '')[0] || ''}`.toUpperCase() || 'U';
        const safeName = escapeHtml(`${u.firstName} ${u.lastName}`);
        const safeEmail = escapeHtml(u.email || '');
        const safePosition = u.position ? escapeHtml(u.position) : '';

        const roleBadgeClass =
          u.role === 'OWNER'
            ? 'adm-badge-role-owner'
            : u.role === 'ADMIN'
            ? 'adm-badge-role-admin'
            : 'adm-badge-role-member';

        const roleLabel =
          u.role === 'OWNER'
            ? 'Propietario (Owner)'
            : u.role === 'ADMIN'
            ? 'Administrador General'
            : 'Operador / Colaborador';

        let companiesHtml = '';
        if (u.role === 'OWNER' || u.role === 'ADMIN') {
          companiesHtml = `
            <span class="adm-badge adm-badge-active" title="Acceso total irrestricto">
              <i class="ti ti-shield-check"></i> Todas las empresas (Acceso total)
            </span>
          `;
        } else if (u.companyAccesses && u.companyAccesses.length > 0) {
          companiesHtml = u.companyAccesses
            .map((a) => {
              const compName = a.company ? escapeHtml(a.company.name) : 'Empresa';
              const roleName =
                a.role === 'ADMIN'
                  ? 'Admin'
                  : a.role === 'OPERATOR'
                  ? 'Operador'
                  : 'Solo Lectura';
              return `
                <span class="adm-badge adm-badge-clae me-1 mb-1" title="${compName} (${roleName})">
                  <i class="ti ti-building me-1 text-info"></i>
                  ${compName} <span class="badge bg-primary-lt ms-1">${roleName}</span>
                </span>
              `;
            })
            .join('');
        } else {
          companiesHtml = '<span class="text-muted small">Sin empresas asignadas</span>';
        }

        return `
        <tr>
          <td>
            <div class="d-flex align-items-center gap-3">
              <div class="adm-avatar adm-avatar-user">
                ${initials}
              </div>
              <div class="d-flex flex-column" style="max-width: 280px;">
                <div class="d-flex align-items-center gap-2 flex-wrap">
                  <strong class="text-white text-truncate" title="${safeName}">${safeName}</strong>
                  ${safePosition ? `<span class="adm-badge adm-badge-clae" style="font-size: 0.7rem;">${safePosition}</span>` : ''}
                </div>
                <div class="text-muted small d-flex flex-wrap gap-2 mt-1">
                  <span><i class="ti ti-mail text-secondary me-1"></i>${safeEmail}</span>
                  ${u.cuil ? `<span><i class="ti ti-id text-secondary me-1"></i>CUIL: ${formatCuit(u.cuil)}</span>` : ''}
                  ${u.phone ? `<span><i class="ti ti-phone text-secondary me-1"></i>${escapeHtml(u.phone)}</span>` : ''}
                </div>
              </div>
            </div>
          </td>
          <td>
            <span class="adm-badge ${roleBadgeClass}">
              ${roleLabel}
            </span>
          </td>
          <td>
            <span class="adm-badge ${u.isActive ? 'adm-badge-active' : 'adm-badge-suspended'}">
              <i class="ti ${u.isActive ? 'ti-circle-check' : 'ti-ban'}"></i>
              ${u.isActive ? 'Activo' : 'Suspendido'}
            </span>
          </td>
          <td>
            <div class="d-flex flex-wrap align-items-center">
              ${companiesHtml}
            </div>
          </td>
          <td class="text-end">
            ${
              u.role !== 'OWNER'
                ? `
              <div class="d-flex align-items-center justify-content-end gap-2">
                <button class="adm-action-btn adm-action-btn-primary btn-edit-user" data-id="${u.id}" title="Editar datos y permisos" type="button" aria-label="Editar ${safeName}">
                  <i class="ti ti-edit"></i> Editar
                </button>
                <button class="adm-action-icon-btn btn-toggle-status-user" data-id="${u.id}" data-active="${u.isActive}" title="${u.isActive ? 'Suspender acceso' : 'Habilitar acceso'}" type="button" aria-label="Cambiar estado ${safeName}">
                  <i class="ti ${u.isActive ? 'ti-ban text-warning' : 'ti-check text-success'}"></i>
                </button>
                <button class="adm-action-icon-btn adm-action-btn-danger btn-delete-user" data-id="${u.id}" data-name="${safeName}" title="Eliminar colaborador" type="button" aria-label="Eliminar ${safeName}">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            `
                : '<span class="adm-badge adm-badge-role-owner"><i class="ti ti-crown"></i> Cuenta Titular</span>'
            }
          </td>
        </tr>
      `;
      })
      .join('');

    // Asignar listeners
    tbody.querySelectorAll('.btn-edit-user').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openEditUserModal(btn.dataset.id);
      });
    });

    tbody.querySelectorAll('.btn-toggle-status-user').forEach((btn) => {
      btn.addEventListener('click', () => {
        const currentActive = btn.dataset.active === 'true';
        this.toggleUserStatus(btn.dataset.id, currentActive);
      });
    });

    tbody.querySelectorAll('.btn-delete-user').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.deleteUser(btn.dataset.id, btn.dataset.name);
      });
    });
  }

  setupUserModals() {
    const newBtn = document.getElementById('btn-open-new-user-modal');
    if (newBtn) {
      newBtn.addEventListener('click', () => {
        this.openNewUserModal();
      });
    }

    const roleSelect = document.getElementById('user-input-role');
    if (roleSelect) {
      roleSelect.addEventListener('change', () => {
        const isRoleAdmin = roleSelect.value === 'ADMIN';
        const matrixContainer = document.getElementById('user-companies-matrix-container');
        const adminNotice = document.getElementById('user-admin-role-notice');
        if (isRoleAdmin) {
          if (matrixContainer) matrixContainer.classList.add('d-none');
          if (adminNotice) adminNotice.classList.remove('d-none');
        } else {
          if (matrixContainer) matrixContainer.classList.remove('d-none');
          if (adminNotice) adminNotice.classList.add('d-none');
        }
      });
    }

    // Validación interactiva de CUIL
    const cuilInput = document.getElementById('user-input-cuil');
    const cuilFeedback = document.getElementById('user-cuil-feedback');
    if (cuilInput && cuilFeedback) {
      cuilInput.addEventListener('input', () => {
        const val = cuilInput.value.replace(/\D/g, '');
        if (val.length === 11) {
          if (isValidCuit(val)) {
            cuilInput.classList.remove('is-invalid');
            cuilInput.classList.add('is-valid');
            cuilFeedback.className = 'adm-form-hint text-success d-block';
            cuilFeedback.textContent = '✓ CUIL válido según algoritmo de AFIP/ARCA';
          } else {
            cuilInput.classList.remove('is-valid');
            cuilInput.classList.add('is-invalid');
            cuilFeedback.className = 'adm-form-hint text-danger d-block';
            cuilFeedback.textContent = '✗ Dígito verificador incorrecto';
          }
        } else {
          cuilInput.classList.remove('is-valid', 'is-invalid');
          cuilFeedback.className = 'adm-form-hint small';
          cuilFeedback.textContent = '11 dígitos numéricos sin guiones.';
        }
      });
    }

    const form = document.getElementById('form-user-unified');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('btn-save-user') || document.getElementById('btn-save-user-unified');
        const alertBox = document.getElementById('user-form-alert');
        if (alertBox) alertBox.classList.add('d-none');

        const userId = document.getElementById('user-form-id').value;
        const firstName = document.getElementById('user-input-firstname').value.trim();
        const lastName = document.getElementById('user-input-lastname').value.trim();
        const email = document.getElementById('user-input-email').value.trim();
        const cuil = document.getElementById('user-input-cuil').value.trim();
        const phone = document.getElementById('user-input-phone').value.trim();
        const position = document.getElementById('user-input-position').value.trim();
        const role = document.getElementById('user-input-role').value;
        const password = document.getElementById('user-input-password').value;
        const isActive = document.getElementById('user-input-is-active').checked;

        // Recolectar accesos a empresas seleccionados en la matriz
        const companyAccesses = [];
        if (role === 'MEMBER') {
          const rows = document.querySelectorAll('.user-company-matrix-row');
          rows.forEach((row) => {
            const check = row.querySelector('.user-company-check');
            const select = row.querySelector('.user-company-role-select');
            if (check && check.checked) {
              companyAccesses.push({
                companyId: check.dataset.companyId,
                role: select.value,
              });
            }
          });
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando...';
        }

        try {
          if (!userId) {
            // Alta de nuevo colaborador
            if (!password || password.length < 8) {
              throw new Error('La contraseña es requerida y debe contener al menos 8 caracteres');
            }

            await apiRequest('/users', {
              method: 'POST',
              body: JSON.stringify({
                firstName,
                lastName,
                email,
                password,
                cuil: cuil || null,
                phone: phone || null,
                position: position || null,
                role,
                companyAccesses,
              }),
            });

            showToast('Colaborador registrado exitosamente');
          } else {
            // Edición de colaborador existente
            const updatePayload = {
              firstName,
              lastName,
              email,
              cuil: cuil || null,
              phone: phone || null,
              position: position || null,
              role,
              isActive,
              companyAccesses,
            };

            if (password && password.length >= 8) {
              updatePayload.password = password;
            }

            await apiRequest(`/users/${userId}`, {
              method: 'PATCH',
              body: JSON.stringify(updatePayload),
            });

            showToast('Colaborador actualizado correctamente');
          }

          const modalEl = document.getElementById('modal-user-form');
          const modalInstance = getBootstrapModal(modalEl);
          if (modalInstance) modalInstance.hide();
          form.reset();

          await this.renderUsersTable();
        } catch (err) {
          if (alertBox) {
            alertBox.textContent = err.message || 'Error al procesar el usuario';
            alertBox.classList.remove('d-none');
          }
          showToast(err.message || 'Error al guardar', 'danger');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="ti ti-device-floppy"></i> Guardar Colaborador';
          }
        }
      });
    }
  }

  openNewUserModal() {
    const modalEl = document.getElementById('modal-user-form');
    if (!modalEl) return;

    document.getElementById('modal-user-form-title').textContent = 'Nuevo Colaborador de la Cuenta';
    document.getElementById('user-form-id').value = '';
    const alertBox = document.getElementById('user-form-alert');
    if (alertBox) alertBox.classList.add('d-none');

    document.getElementById('user-input-firstname').value = '';
    document.getElementById('user-input-lastname').value = '';
    document.getElementById('user-input-email').value = '';
    document.getElementById('user-input-cuil').value = '';
    document.getElementById('user-input-phone').value = '';
    document.getElementById('user-input-position').value = '';
    document.getElementById('user-input-role').value = 'MEMBER';

    const pwdInput = document.getElementById('user-input-password');
    pwdInput.value = '';
    pwdInput.required = true;
    document.getElementById('user-input-password-label').textContent = 'Contraseña Provisoria *';
    document.getElementById('user-input-password-hint').textContent = 'Requerida (mínimo 8 caracteres) para que el usuario pueda ingresar.';

    document.getElementById('user-input-status-container').classList.add('d-none');
    document.getElementById('user-input-is-active').checked = true;

    document.getElementById('user-admin-role-notice').classList.add('d-none');
    document.getElementById('user-companies-matrix-container').classList.remove('d-none');

    this.renderCompanyMatrix([]);

    const modal = getBootstrapModal(modalEl);
    if (modal) {
      modal.show();
    }
  }

  async openEditUserModal(userId) {
    const modalEl = document.getElementById('modal-user-form');
    if (!modalEl) return;

    document.getElementById('modal-user-form-title').textContent = 'Editar Colaborador y Permisos';
    document.getElementById('user-form-id').value = userId;
    const alertBox = document.getElementById('user-form-alert');
    if (alertBox) alertBox.classList.add('d-none');

    try {
      const res = await apiRequest(`/users/${userId}`);
      const user = res.data;

      document.getElementById('user-input-firstname').value = user.firstName || '';
      document.getElementById('user-input-lastname').value = user.lastName || '';
      document.getElementById('user-input-email').value = user.email || '';
      document.getElementById('user-input-cuil').value = user.cuil || '';
      document.getElementById('user-input-phone').value = user.phone || '';
      document.getElementById('user-input-position').value = user.position || '';
      document.getElementById('user-input-role').value = user.role || 'MEMBER';

      const pwdInput = document.getElementById('user-input-password');
      pwdInput.value = '';
      pwdInput.required = false;
      document.getElementById('user-input-password-label').textContent = 'Cambiar Contraseña (Opcional)';
      document.getElementById('user-input-password-hint').textContent = 'Dejar en blanco si no se desea modificar la contraseña actual.';

      const statusContainer = document.getElementById('user-input-status-container');
      statusContainer.classList.remove('d-none');
      document.getElementById('user-input-is-active').checked = !!user.isActive;

      const isRoleAdmin = user.role === 'ADMIN';
      const matrixContainer = document.getElementById('user-companies-matrix-container');
      const adminNotice = document.getElementById('user-admin-role-notice');
      if (isRoleAdmin) {
        matrixContainer.classList.add('d-none');
        adminNotice.classList.remove('d-none');
      } else {
        matrixContainer.classList.remove('d-none');
        adminNotice.classList.add('d-none');
      }

      this.renderCompanyMatrix(user.companyAccesses || []);

      const modal = getBootstrapModal(modalEl);
      if (modal) {
        modal.show();
      }
    } catch (err) {
      showToast(err.message || 'Error al cargar usuario', 'danger');
    }
  }

  renderCompanyMatrix(userAccesses = []) {
    const container = document.getElementById('user-companies-matrix-list');
    if (!container) return;

    if (!this.companies || this.companies.length === 0) {
      container.innerHTML = '<div class="text-muted small p-3 text-center">No hay empresas registradas en la cuenta aún.</div>';
      return;
    }

    const accessMap = new Map(userAccesses.map((a) => [a.companyId, a.role]));

    container.innerHTML = this.companies
      .map((c) => {
        const currentRole = accessMap.get(c.id);
        const isChecked = !!currentRole;
        const selectedRole = currentRole || 'OPERATOR';
        const safeName = escapeHtml(c.name);

        return `
        <div class="user-company-matrix-row adm-matrix-item">
          <div class="form-check mb-0 d-flex align-items-center gap-2">
            <input class="form-check-input user-company-check" type="checkbox" data-company-id="${c.id}" id="check-comp-${c.id}" ${isChecked ? 'checked' : ''}>
            <label class="form-check-label ms-1" for="check-comp-${c.id}">
              <strong class="d-block text-white text-truncate" style="max-width: 180px;" title="${safeName}">${safeName}</strong>
              <small class="text-muted font-monospace">${formatCuit(c.cuit)}</small>
            </label>
          </div>
          <div style="width: 140px;">
            <select class="adm-form-select user-company-role-select" data-company-id="${c.id}" ${!isChecked ? 'disabled' : ''} style="min-height: 38px; font-size: 0.8125rem;">
              <option value="OPERATOR" ${selectedRole === 'OPERATOR' ? 'selected' : ''}>Operador</option>
              <option value="ADMIN" ${selectedRole === 'ADMIN' ? 'selected' : ''}>Admin Empresa</option>
              <option value="VIEWER" ${selectedRole === 'VIEWER' ? 'selected' : ''}>Solo Lectura</option>
            </select>
          </div>
        </div>
      `;
      })
      .join('');

    // Habilitar/deshabilitar select al tildar o destildar el checkbox
    container.querySelectorAll('.user-company-check').forEach((check) => {
      check.addEventListener('change', () => {
        const row = check.closest('.user-company-matrix-row');
        const select = row.querySelector('.user-company-role-select');
        if (select) select.disabled = !check.checked;
      });
    });
  }

  async toggleUserStatus(userId, currentActive) {
    const actionName = currentActive ? 'suspender' : 'activar';
    if (!confirm(`¿Confirmas que deseas ${actionName} el acceso de este usuario?`)) {
      return;
    }

    try {
      await apiRequest(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !currentActive }),
      });
      showToast(`Usuario ${!currentActive ? 'activado' : 'suspendido'} correctamente`);
      await this.renderUsersTable();
    } catch (err) {
      showToast(err.message || `Error al ${actionName} usuario`, 'danger');
    }
  }

  async deleteUser(userId, userName) {
    if (!confirm(`¿Estás seguro de que deseas dar de baja al colaborador "${userName}"?`)) {
      return;
    }

    try {
      await apiRequest(`/users/${userId}`, {
        method: 'DELETE',
      });
      showToast(`Colaborador "${userName}" eliminado correctamente`);
      await this.renderUsersTable();
    } catch (err) {
      showToast(err.message || 'Error al eliminar usuario', 'danger');
    }
  }

  // --- Vista 4: Mi Cuenta (Obsidian Luxury Dark) ---
  renderAccountView() {
    const nameEl = document.getElementById('account-view-name');
    const planEl = document.getElementById('account-view-plan');
    const limitEl = document.getElementById('account-view-limit');
    const quotaBar = document.getElementById('account-view-quota-bar');
    const quotaText = document.getElementById('account-view-quota-text');
    const quotaPct = document.getElementById('account-view-quota-pct');
    const tenantIdEl = document.getElementById('account-view-tenant-id');

    const totalUsed = this.companies.length;
    const maxLimit = this.account?.maxCompanies || 1;
    const percentage = Math.min(100, Math.round((totalUsed / maxLimit) * 100));

    if (nameEl) nameEl.textContent = this.account?.name || '-';
    if (planEl) planEl.textContent = this.account?.status || 'TRIAL';
    if (limitEl) {
      limitEl.textContent = `${totalUsed} de ${maxLimit} empresas registradas`;
    }
    if (quotaBar) {
      quotaBar.style.width = `${percentage}%`;
    }
    if (quotaText) {
      quotaText.textContent = `${totalUsed} de ${maxLimit} cupos utilizados`;
    }
    if (quotaPct) {
      quotaPct.textContent = `${percentage}%`;
    }
    if (tenantIdEl) {
      tenantIdEl.textContent = this.account?.id || 'MASTER';
    }
  }

  // --- Vista: Ficha y Datos de la Empresa Activa ---
  async renderCompanyProfileView() {
    const alertBox = document.getElementById('profile-alert');
    if (alertBox) alertBox.classList.add('d-none');

    if (!this.activeCompany && this.companies.length > 0) {
      const activeId = storage.getActiveCompanyId();
      this.activeCompany = this.companies.find((c) => c.id === activeId) || this.companies[0];
    }

    if (!this.activeCompany) {
      const titleEl = document.getElementById('profile-company-title');
      if (titleEl) titleEl.textContent = 'Ninguna empresa seleccionada';
      if (alertBox) {
        alertBox.innerHTML = '<i class="ti ti-alert-circle me-1"></i> Por favor selecciona o registra una empresa en el menú superior para cargar sus datos.';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    const titleEl = document.getElementById('profile-company-title');
    if (titleEl) titleEl.textContent = this.activeCompany.name;

    try {
      const res = await apiRequest('/companies/profile');
      const profile = res.data;
      if (!profile) return;

      if (titleEl) titleEl.textContent = profile.legalName || this.activeCompany.name;

      const legalNameInput = document.getElementById('profile-legal-name');
      if (legalNameInput) legalNameInput.value = profile.legalName || this.activeCompany.name || '';

      const tradeNameInput = document.getElementById('profile-trade-name');
      if (tradeNameInput) tradeNameInput.value = profile.tradeName || this.activeCompany.tradeName || '';

      const cuitInput = document.getElementById('profile-cuit');
      if (cuitInput) {
        cuitInput.value = formatCuit(profile.cuit || this.activeCompany.cuit);
        cuitInput.readOnly = true;
      }

      const taxConditionInput = document.getElementById('profile-tax-condition');
      if (taxConditionInput) taxConditionInput.value = profile.taxCondition || 'RESPONSABLE_INSCRIPTO';

      const grossIncomeInput = document.getElementById('profile-gross-income');
      if (grossIncomeInput) grossIncomeInput.value = profile.grossIncomeNumber || '';

      const addressInput = document.getElementById('profile-address');
      if (addressInput) addressInput.value = profile.address || '';

      const cityInput = document.getElementById('profile-city');
      if (cityInput) cityInput.value = profile.city || '';

      const provinceInput = document.getElementById('profile-province');
      if (provinceInput) provinceInput.value = profile.province || '';

      const postalCodeInput = document.getElementById('profile-postal-code');
      if (postalCodeInput) postalCodeInput.value = profile.postalCode || '';

      const phoneInput = document.getElementById('profile-phone');
      if (phoneInput) phoneInput.value = profile.phone || '';

      const emailInput = document.getElementById('profile-email');
      if (emailInput) emailInput.value = profile.email || '';

      const activityStartInput = document.getElementById('profile-activity-start');
      if (activityStartInput) activityStartInput.value = profile.activityStart ? profile.activityStart.split('T')[0] : '';

      const artNameInput = document.getElementById('profile-art-name');
      if (artNameInput) artNameInput.value = profile.artName || '';

      const bankNameInput = document.getElementById('profile-bank-name');
      if (bankNameInput) bankNameInput.value = profile.bankName || '';

      const bankCbuInput = document.getElementById('profile-bank-cbu');
      if (bankCbuInput) bankCbuInput.value = profile.bankCbu || '';

      await this.loadClaeActivities();
      if (profile.activityCode) {
        let desc = profile.activityDescription;
        if (!desc && this.claeActivities) {
          const found = this.claeActivities.find((a) => a.code === profile.activityCode);
          if (found) desc = found.description;
        }
        this.setClaeSelection(profile.activityCode, desc);
      } else {
        this.setClaeSelection('', '');
      }

      // Control de derechos: Solo el rol OWNER puede modificar
      const isOwner = this.user?.role === 'OWNER';
      const readonlyNotice = document.getElementById('profile-readonly-notice');
      if (readonlyNotice) {
        if (!isOwner) readonlyNotice.classList.remove('d-none');
        else readonlyNotice.classList.add('d-none');
      }

      const form = document.getElementById('form-company-profile');
      if (form) {
        form.querySelectorAll('input, select, textarea').forEach((input) => {
          if (!isOwner) {
            input.disabled = true;
          } else {
            if (input.id !== 'profile-cuit') {
              input.disabled = false;
            }
          }
        });
      }

      const submitBtn = document.getElementById('btn-save-profile');
      if (submitBtn) {
        if (isOwner) submitBtn.classList.remove('d-none');
        else submitBtn.classList.add('d-none');
      }
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al obtener la ficha de la empresa';
        alertBox.classList.remove('d-none');
      }
    }
  }

  async loadClaeActivities() {
    if (this.claeActivities && this.claeActivities.length > 0) return;
    try {
      const res = await apiRequest('/clae?limit=1000');
      this.claeActivities = res.data || [];
      this.populateClaeDatalist();
    } catch (err) {
      console.warn('No se pudieron cargar actividades CLAE:', err.message);
    }
  }

  populateClaeDatalist() {
    const datalist = document.getElementById('clae-suggestions');
    if (!datalist || !this.claeActivities) return;
    datalist.innerHTML = this.claeActivities
      .map((a) => `<option value="${a.code} - ${a.description}">[${a.code}] ${a.description}</option>`)
      .join('');
  }

  setClaeSelection(code, description) {
    const input = document.getElementById('profile-activity-input');
    const codeHidden = document.getElementById('profile-activity-code');
    const descHidden = document.getElementById('profile-activity-description');
    const badge = document.getElementById('profile-activity-badge');
    const badgeCode = document.getElementById('badge-clae-code');
    const badgeDesc = document.getElementById('badge-clae-desc');

    if (code) {
      if (codeHidden) codeHidden.value = code;
      if (descHidden) descHidden.value = description || '';
      if (input) input.value = `${code} - ${description || ''}`;
      if (badge) badge.classList.remove('d-none');
      if (badgeCode) badgeCode.textContent = code;
      if (badgeDesc) badgeDesc.textContent = description || '';
    } else {
      if (codeHidden) codeHidden.value = '';
      if (descHidden) descHidden.value = '';
      if (input) input.value = '';
      if (badge) badge.classList.add('d-none');
      if (badgeCode) badgeCode.textContent = '';
      if (badgeDesc) badgeDesc.textContent = '';
    }
  }

  activateCompanyTab(tabBtnId) {
    const tabBtn = document.getElementById(tabBtnId);
    if (tabBtn) {
      if (window.bootstrap?.Tab) {
        const tabInstance = window.bootstrap.Tab.getOrCreateInstance(tabBtn);
        tabInstance.show();
      } else {
        tabBtn.click();
      }
    }
  }
}

export function registerAdminMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(AdminMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
