import { apiRequest, storage, showToast, escapeHtml } from './api.js?v=2.1';
import { logout } from './auth.js?v=2.1';
import { formatCuit } from './utils/helpers.js';
import { ARCA_T03_ACTIVITIES, getArcaActivityInfo } from './utils/helpers.js';

// Submódulos desacoplados de vistas
import { registerAdminMethods } from './modules/admin.view.js?v=admin-2.1';
import { registerCompanyProfileMethods } from './modules/companyProfile.view.js?v=profile-2.1';
import { registerPersonnelMethods } from './modules/personnel.view.js?v=personnel-3.2';
import { registerDisciplinaryMethods } from './modules/disciplinary.view.js?v=disciplinary-1.3';
import { registerPayrollMethods } from './modules/payroll.view.js?v=payroll-4.4';
import { registerSalaryScalesMethods } from './modules/salaryScales.view.js?v=scales-3.6';
import { registerConceptsMethods } from './modules/concepts.view.js?v=concepts-2.1';
import { registerMatricesAndSettingsMethods } from './modules/matricesAndSettings.view.js?v=matrices-2.1';
import { registerEmbargoesMethods } from './modules/embargoes.view.js?v=embargoes-2.1';
import { registerIncomeTaxMethods } from './modules/incomeTax.view.js?v=payroll-2.7';
import { registerReportsMethods } from './modules/reports.view.js?v=reports-2.6';

export { ARCA_T03_ACTIVITIES, getArcaActivityInfo };

class AppController {
  constructor() {
    this.user = null;
    this.account = null;
    this.companies = [];
    this.activeCompany = null;
    this.users = [];
    this.employees = [];
    this.employeesPage = 1;
    this.employeesPageSize = 5;
    this.pendingImportEmployees = [];
    this.departments = [];
    this.departmentsPage = 1;
    this.departmentsPageSize = 5;
    this.pendingImportDepartments = [];
    this.jobPositions = [];
    this.jobPositionsPage = 1;
    this.jobPositionsPageSize = 5;
    this.pendingImportJobPositions = [];
    this.arcaActivities = ARCA_T03_ACTIVITIES;
    this.arcaCcts = [];
    this._arcaCctsCompanyId = null;
    this._arcaCctsPromise = null;
    this.workShifts = [];
    this.workShiftsPage = 1;
    this.workShiftsPageSize = 5;
    this.currentWorkShiftDetails = [];
    this.healthInsurances = [];
    this.healthInsurancesPage = 1;
    this.healthInsurancesPageSize = 5;
    this.unions = [];
    this.unionsPage = 1;
    this.unionsPageSize = 5;
    this.mutuals = [];
    this.mutualsPage = 1;
    this.mutualsPageSize = 5;
    this.kinships = [];
    this.kinshipsPage = 1;
    this.kinshipsPageSize = 5;
    this.currentEmployeeRelatives = [];
    this.currentEmployeeConcepts = [];
    this.currentMassIncreasePreview = [];

    // Estado del Módulo de Liquidación de Sueldos
    this.payrollPeriods = [];
    this.payrollPeriodsPage = 1;
    this.payrollPeriodsPageSize = 5;
    this.selectedPeriodId = null;

    this.payrollSlips = [];
    this.payrollSlipsPage = 1;
    this.payrollSlipsPageSize = 5;

    this.payrollConcepts = [];
    this.allPayrollConcepts = [];
    this.payrollConceptsPage = 1;
    this.payrollConceptsPageSize = 5;

    this.payrollMatrices = [];
    this.payrollMatricesPage = 1;
    this.payrollMatricesPageSize = 5;
    this.matrixFormRows = [];

    this.payrollFixedValues = [];
    this.payrollFixedValuesPage = 1;
    this.payrollFixedValuesPageSize = 5;

    this.salaryScales = [];
    this.payrollSalaryScales = [];
    this.activeFiscalPeriod = null;
    this.payrollSalaryScalesPage = 1;
    this.payrollSalaryScalesPageSize = 5;
    this.currentScaleMassIncreasePreview = [];

    this.payrollSettings = null;
    this.novedadesList = [];
  }

  async loadAppPartials() {
    if (this._partialsLoaded) return;
    if (this._partialsPromise) return this._partialsPromise;

    const PARTIALS_VERSION = 'partials-3.4';
    const viewFiles = [
      '/partials/core-views.html',
      '/partials/personnel-view.html',
      '/partials/payroll-view.html',
    ];
    const modalFiles = [
      '/partials/personnel-modals.html',
      '/partials/payroll-modals.html',
      '/partials/reports-disciplinary-modals.html',
    ];

    const fetchHtml = async (url) => {
      const res = await fetch(`${url}?v=${PARTIALS_VERSION}`);
      if (!res.ok) {
        throw new Error(`No se pudo cargar ${url} (HTTP ${res.status})`);
      }
      return res.text();
    };

    this._partialsPromise = (async () => {
      const [viewsHtml, modalsHtml] = await Promise.all([
        Promise.all(viewFiles.map(fetchHtml)),
        Promise.all(modalFiles.map(fetchHtml)),
      ]);

      const loader = document.getElementById('app-bootstrap-loader');
      if (loader) loader.remove();

      const viewsContainer = document.getElementById('app-views-container');
      if (viewsContainer) {
        viewsContainer.insertAdjacentHTML('beforeend', viewsHtml.join('\n'));
      }

      const modalsAnchor = document.getElementById('app-modals-anchor');
      if (modalsAnchor) {
        modalsAnchor.insertAdjacentHTML('afterend', modalsHtml.join('\n'));
        modalsAnchor.remove();
      } else {
        document.body.insertAdjacentHTML('beforeend', modalsHtml.join('\n'));
      }

      this._partialsLoaded = true;
    })().catch((err) => {
      this._partialsPromise = null;
      throw err;
    });

    return this._partialsPromise;
  }

  async init() {
    // 1. Verificar sesión
    const token = storage.getToken();
    if (!token) {
      window.location.href = '/login.html';
      return;
    }

    try {
      // 2. Obtener perfil de usuario y cargar vistas/modales HTML en paralelo
      const [meRes] = await Promise.all([
        apiRequest('/auth/me'),
        this.loadAppPartials(),
      ]);
      this.user = meRes.data.user;
      this.account = this.user.account;
      storage.setUser(this.user);

      this.renderUserInfo();

      // 3. Cargar empresas
      await this.loadCompanies();

      // 4. Configurar eventos de navegación
      this.setupNavigation();
      this.setupCompanyModals();
      this.setupCompanyProfileForm();
      this.setupUserModals();
      this.setupPersonnelModals();
      this.setupDisciplinaryModals?.();
      this.setupPayrollModals();
      this.setupPayrollNavigation();

      // 5. Cargar vista inicial
      this.showView('dashboard');
    } catch (err) {
      console.error('Error al inicializar la aplicación:', err);
      if (err.status === 401) {
        storage.clearSession();
        window.location.href = '/login.html';
      } else {
        const loader = document.getElementById('app-bootstrap-loader');
        if (loader) {
          loader.innerHTML = '';
          const alertEl = document.createElement('div');
          alertEl.className = 'alert alert-danger d-inline-block text-start';
          alertEl.textContent = err.message || 'Error al cargar los módulos del sistema.';
          loader.appendChild(alertEl);
        }
        showToast(err.message || 'Error al conectar con el servidor', 'danger');
      }
    }
  }

  renderUserInfo() {
    document.querySelectorAll('.user-fullname').forEach((el) => {
      el.textContent = `${this.user.firstName} ${this.user.lastName}`;
    });
    document.querySelectorAll('.user-role-badge').forEach((el) => {
      el.textContent = this.user.role;
      el.className = `badge ${this.user.role === 'OWNER' ? 'bg-primary-lt' : 'bg-secondary-lt'}`;
    });
    document.querySelectorAll('.account-name').forEach((el) => {
      el.textContent = this.account?.name || 'Mi Cuenta';
    });

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
      });
    }

    // Ocultar botones de administración si el usuario no es OWNER o ADMIN
    const isAdmin = this.user.role === 'OWNER' || this.user.role === 'ADMIN';
    document.querySelectorAll('.admin-only').forEach((el) => {
      if (!isAdmin) el.classList.add('d-none');
    });

    const isOwner = this.user.role === 'OWNER';
    document.querySelectorAll('.owner-only').forEach((el) => {
      if (!isOwner) el.classList.add('d-none');
    });
  }

  async ensureArcaCctsLoaded(force = false) {
    const activeId = this.activeCompany?.id || storage.getActiveCompanyId() || null;
    if (!force && this._arcaCctsCompanyId === activeId && Array.isArray(this.arcaCcts) && this.arcaCcts.length > 0) {
      return this.arcaCcts;
    }
    if (!force && this._arcaCctsPromise && this._arcaCctsPromiseCompanyId === activeId) {
      return this._arcaCctsPromise;
    }

    this._arcaCctsPromiseCompanyId = activeId;
    this._arcaCctsPromise = apiRequest('/arca-ccts')
      .then((res) => {
        const list = res?.data || [];
        this.arcaCcts = list;
        this._arcaCctsCompanyId = activeId;
        return list;
      })
      .finally(() => {
        this._arcaCctsPromise = null;
      });

    return this._arcaCctsPromise;
  }

  async loadCompanies() {
    try {
      const res = await apiRequest('/companies?limit=100');
      this.companies = res.data || [];
      this.renderCompanySelector();
    } catch (err) {
      console.error('Error al cargar empresas:', err);
    }
  }

  renderCompanySelector() {
    const selectorBtn = document.getElementById('active-company-btn');
    const dropdownMenu = document.getElementById('company-selector-dropdown');
    if (!selectorBtn || !dropdownMenu) return;

    dropdownMenu.innerHTML = '';

    if (this.companies.length === 0) {
      selectorBtn.innerHTML = '<span class="text-muted"><i class="ti ti-building me-1"></i> Sin empresas</span>';
      this.activeCompany = null;
      storage.setActiveCompanyId(null);
      return;
    }

    // Identificar empresa activa
    const storedId = storage.getActiveCompanyId();
    this.activeCompany = this.companies.find((c) => c.id === storedId) || this.companies[0];
    storage.setActiveCompanyId(this.activeCompany.id);

    selectorBtn.innerHTML = `
      <span class="d-flex align-items-center text-truncate" style="max-width: 180px;">
        <span class="company-badge-indicator"></span>
        <strong class="text-truncate">${escapeHtml(this.activeCompany.name)}</strong>
      </span>
    `;

    // Actualizar Card lateral de Empresa Activa en Dashboard
    const dashActiveName = document.getElementById('dash-active-company-name');
    const dashActiveCuit = document.getElementById('dash-active-company-cuit');
    const dashActiveAvatar = document.getElementById('dash-active-company-avatar');
    const statActiveComp = document.getElementById('stat-active-company');
    if (dashActiveName) dashActiveName.textContent = this.activeCompany.name;
    if (dashActiveCuit) dashActiveCuit.textContent = formatCuit(this.activeCompany.cuit);
    if (dashActiveAvatar) dashActiveAvatar.textContent = (this.activeCompany.name || 'PS').substring(0, 2).toUpperCase();
    if (statActiveComp) statActiveComp.textContent = this.activeCompany.name;
    const admTenantIndicator = document.getElementById('adm-active-tenant-indicator');
    if (admTenantIndicator) admTenantIndicator.textContent = `Empresa Activa: ${this.activeCompany.name}`;
    const admKpiActive = document.getElementById('adm-kpi-active-company');
    if (admKpiActive) admKpiActive.textContent = this.activeCompany.name;
    const payTenantName = document.getElementById('payroll-header-company-name');
    if (payTenantName) payTenantName.textContent = this.activeCompany.name;
    document.querySelectorAll('.payroll-active-company-name-sync').forEach((el) => {
      el.textContent = this.activeCompany.name;
    });

    // Llenar dropdown
    this.companies.forEach((company) => {
      const isSelected = company.id === this.activeCompany.id;
      const item = document.createElement('a');
      item.className = `dropdown-item d-flex align-items-center justify-content-between ${isSelected ? 'active' : ''}`;
      item.href = '#';
      item.innerHTML = `
        <span class="d-flex align-items-center gap-2">
          <i class="ti ti-building"></i>
          <span>${escapeHtml(company.name)}</span>
        </span>
        <small class="text-muted">${escapeHtml(formatCuit(company.cuit))}</small>
      `;

      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.selectCompany(company);
      });

      dropdownMenu.appendChild(item);
    });

    // Opción para registrar nueva empresa (Exclusivo para el rol OWNER)
    if (this.user?.role === 'OWNER') {
      const divider = document.createElement('div');
      divider.className = 'dropdown-divider';
      dropdownMenu.appendChild(divider);

      const newCompanyItem = document.createElement('a');
      newCompanyItem.className = 'dropdown-item text-primary';
      newCompanyItem.href = '#';
      newCompanyItem.innerHTML = '<i class="ti ti-plus me-1"></i> Nueva Empresa';
      newCompanyItem.addEventListener('click', (e) => {
        e.preventDefault();
        this.openNewCompanyForm();
      });
      dropdownMenu.appendChild(newCompanyItem);
    }
  }

  selectCompany(company, refresh = true) {
    this.activeCompany = company;
    storage.setActiveCompanyId(company.id);
    this.arcaCcts = [];
    this._arcaCctsCompanyId = null;
    this._arcaCctsPromise = null;
    this._arcaRefCompanyId = null;
    this._arcaRefPromise = null;
    this._empModalAuxCompanyId = null;
    this._empModalAuxPromise = null;
    this._affilConceptsCompanyId = null;
    this._affilConceptsPromise = null;
    this.salaryScales = [];
    this.payrollSalaryScales = [];
    this.activeFiscalPeriod = null;
    this.fiscalPeriodsList = [];
    if (this.incomeTaxState) {
      this.incomeTaxState.userChangedPeriod = false;
      this.incomeTaxState.currentSettlement = null;
    }
    this.renderCompanySelector();
    showToast(`Empresa activa: ${company.name}`);
    if (refresh && this.currentView !== 'company-profile') {
      this.refreshCurrentView();
    }
  }

  setupNavigation() {
    const navLinks = document.querySelectorAll('[data-view-target]');
    navLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = link.getAttribute('data-view-target');
        if (targetView === 'company-profile') {
          if (this.activeCompany) {
            this.openEditCompanyForm(this.activeCompany);
          } else {
            this.openNewCompanyForm();
          }
        } else {
          this.showView(targetView);
        }
      });
    });
  }

  showView(viewName) {
    this.currentView = viewName;

    // Actualizar clases activas en navegación
    document.querySelectorAll('[data-view-target]').forEach((link) => {
      link.classList.remove('active', 'active-personnel', 'active-payroll');
      if (link.getAttribute('data-view-target') === viewName) {
        link.classList.add('active');
        if (viewName === 'employees') {
          link.classList.add('active-personnel');
        } else if (viewName === 'payroll') {
          link.classList.add('active-payroll');
        }
      }
    });

    // Mostrar/ocultar contenedores
    document.querySelectorAll('.app-view').forEach((view) => {
      view.classList.add('d-none');
    });

    const targetEl = document.getElementById(`view-${viewName}`);
    if (targetEl) {
      targetEl.classList.remove('d-none');
    }

    // Cargar datos según la vista
    if (viewName === 'dashboard') {
      this.renderDashboard();
    } else if (viewName === 'companies') {
      this.renderCompaniesTable();
    } else if (viewName === 'company-profile') {
      if (this.companyFormMode === 'new') {
        // Formulario en modo nueva empresa
      } else {
        this.companyFormMode = 'edit';
        this.renderCompanyProfileView();
      }
    } else if (viewName === 'users') {
      this.renderUsersTable();
    } else if (viewName === 'employees') {
      this.renderPersonnelView();
    } else if (viewName === 'payroll') {
      this.renderPayrollView();
    } else if (viewName === 'account') {
      this.renderAccountView();
    }
  }

  refreshCurrentView() {
    if (this.currentView) {
      this.showView(this.currentView);
    }
  }
}

// Registrar métodos de los submódulos en el prototipo de AppController
registerAdminMethods(AppController.prototype);
registerCompanyProfileMethods(AppController.prototype);
registerPersonnelMethods(AppController.prototype);
registerDisciplinaryMethods(AppController.prototype);
registerPayrollMethods(AppController.prototype);
registerSalaryScalesMethods(AppController.prototype);
registerConceptsMethods(AppController.prototype);
registerMatricesAndSettingsMethods(AppController.prototype);
registerEmbargoesMethods(AppController.prototype);
registerIncomeTaxMethods(AppController.prototype);
registerReportsMethods(AppController.prototype);

export { AppController };

// Inicializar la aplicación cuando el DOM esté listo
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const app = new AppController();
    window.app = app;
    app.init();
  });
}
