import { apiRequest, storage, showToast } from './api.js';
import { logout } from './auth.js';
import { formatCuit } from './utils/helpers.js';
import { ARCA_T03_ACTIVITIES, getArcaActivityInfo } from './utils/helpers.js';

// Submódulos desacoplados de vistas
import { registerAdminMethods } from './modules/admin.view.js';
import { registerCompanyProfileMethods } from './modules/companyProfile.view.js';
import { registerPersonnelMethods } from './modules/personnel.view.js';
import { registerPayrollMethods } from './modules/payroll.view.js';
import { registerSalaryScalesMethods } from './modules/salaryScales.view.js';
import { registerConceptsMethods } from './modules/concepts.view.js';
import { registerMatricesAndSettingsMethods } from './modules/matricesAndSettings.view.js';

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
    this.payrollSalaryScalesPage = 1;
    this.payrollSalaryScalesPageSize = 5;
    this.currentScaleMassIncreasePreview = [];

    this.payrollSettings = null;
    this.novedadesList = [];
  }

  async init() {
    // 1. Verificar sesión
    const token = storage.getToken();
    if (!token) {
      window.location.href = '/login.html';
      return;
    }

    try {
      // 2. Obtener perfil de usuario
      const meRes = await apiRequest('/auth/me');
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
        <strong class="text-truncate">${this.activeCompany.name}</strong>
      </span>
    `;

    // Llenar dropdown
    this.companies.forEach((company) => {
      const isSelected = company.id === this.activeCompany.id;
      const item = document.createElement('a');
      item.className = `dropdown-item d-flex align-items-center justify-content-between ${isSelected ? 'active' : ''}`;
      item.href = '#';
      item.innerHTML = `
        <span class="d-flex align-items-center gap-2">
          <i class="ti ti-building"></i>
          <span>${company.name}</span>
        </span>
        <small class="text-muted">${formatCuit(company.cuit)}</small>
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
      link.classList.remove('active', 'active-personnel');
      if (link.getAttribute('data-view-target') === viewName) {
        link.classList.add('active');
        if (viewName === 'employees') {
          link.classList.add('active-personnel');
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
registerPayrollMethods(AppController.prototype);
registerSalaryScalesMethods(AppController.prototype);
registerConceptsMethods(AppController.prototype);
registerMatricesAndSettingsMethods(AppController.prototype);

export { AppController };

// Inicializar la aplicación cuando el DOM esté listo
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const app = new AppController();
    app.init();
  });
}
