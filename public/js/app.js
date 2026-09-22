import { apiRequest, storage, showToast } from './api.js';
import { logout } from './auth.js';

// CUIT validator (Algoritmo Módulo 11 de AFIP)
function isValidCuit(cuit) {
  if (!cuit) return false;
  const clean = cuit.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i], 10) * mult[i];
  }
  const mod = sum % 11;
  let verifier = 11 - mod;
  if (verifier === 11) verifier = 0;
  if (verifier === 10) verifier = 9;
  return verifier === parseInt(clean[10], 10);
}

// Formateador visual de CUIT: 30-12345678-9
function formatCuit(cuit) {
  if (!cuit) return '-';
  const clean = cuit.replace(/\D/g, '');
  if (clean.length !== 11) return cuit;
  return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`;
}

// Catálogo oficial de entidades financieras del BCRA (Códigos de 3 dígitos de CBU)
const BCRA_BANK_CODES = {
  '005': 'The Royal Bank of Scotland N.V.',
  '007': 'Banco de Galicia y Buenos Aires',
  '011': 'Banco de la Nación Argentina',
  '014': 'Banco de la Provincia de Buenos Aires',
  '015': 'Industrial and Commercial Bank of China (ICBC)',
  '016': 'Citibank N.A.',
  '017': 'BBVA Argentina',
  '018': 'Banco de la Provincia de Córdoba',
  '020': 'Banco de la Ciudad de Buenos Aires',
  '027': 'Banco Santander Argentina',
  '029': 'Banco de la Provincia del Neuquén',
  '034': 'Banco Patagonia',
  '044': 'Banco Hipotecario S.A.',
  '045': 'Banco de San Juan',
  '065': 'Banco Municipal de Rosario',
  '072': 'Banco Santander',
  '083': 'Banco del Chubut',
  '086': 'Banco de Santa Cruz',
  '093': 'Banco de La Pampa',
  '094': 'Banco de Corrientes',
  '097': 'Banco Provincia del Neuquén',
  '147': 'Banco Interfinanzas',
  '150': 'HSBC Bank Argentina',
  '165': 'JP Morgan Chase Bank',
  '191': 'Banco Credicoop Cooperativo Limitado',
  '198': 'Banco de Valores',
  '247': 'Banco Roela',
  '254': 'Banco Mariva',
  '259': 'Banco Itaú Argentina',
  '262': 'Bank of America',
  '266': 'BNP Paribas',
  '268': 'Banco Provincia de Tierra del Fuego',
  '269': 'Banco de la República Oriental del Uruguay',
  '277': 'Banco Sáenz',
  '281': 'Banco Meridian',
  '285': 'Banco Macro S.A.',
  '299': 'Banco Comafi',
  '300': 'Banco BICE',
  '301': 'Banco Piano',
  '305': 'Banco Julio',
  '309': 'Banco Rioja',
  '310': 'Banco del Sol',
  '311': 'Nuevo Banco del Chaco',
  '312': 'Banco Voii',
  '315': 'Banco de Formosa',
  '319': 'Banco CMF',
  '321': 'Banco de Santiago del Estero',
  '322': 'Nuevo Banco de Santa Fe',
  '330': 'Banco BMA',
  '338': 'Banco de Servicios Financieros',
  '340': 'Banco Bica',
  '341': 'Banco Coinag',
  '384': 'Wilobank',
  '386': 'Nuevo Banco de Entre Ríos',
  '389': 'Banco Columbia',
  '426': 'Banco BIND (Banco Industrial)',
  '431': 'Banco Cetelem',
  '432': 'Banco de Comercio',
  '448': 'Banco Roela',
  '000': 'CVU - Billetera Virtual (PSP)',
};

function getCbuBankName(cbu) {
  if (!cbu || typeof cbu !== 'string') return null;
  const clean = cbu.replace(/\D/g, '');
  if (clean.length < 3) return null;
  const bankCode = clean.slice(0, 3);
  return BCRA_BANK_CODES[bankCode] || `Entidad Bancaria N° ${bankCode}`;
}

// CBU validator (Procedimiento y algoritmo oficial de dígitos verificadores del B.C.R.A.)
function isValidCbu(cbu) {
  if (!cbu || typeof cbu !== 'string') return false;
  const clean = cbu.replace(/\D/g, '');
  if (clean.length !== 22) return false;
  if (/^0{22}$/.test(clean)) return false;

  // Bloque 1: Entidad (3), Sucursal (4), Verificador (1) -> Ponderador [7, 1, 3, 9, 7, 1, 3]
  const w1 = [7, 1, 3, 9, 7, 1, 3];
  let s1 = 0;
  for (let i = 0; i < 7; i++) {
    s1 += parseInt(clean[i], 10) * w1[i];
  }
  const d1 = (10 - (s1 % 10)) % 10;
  if (d1 !== parseInt(clean[7], 10)) return false;

  // Bloque 2: Cuenta (13), Verificador (1) -> Ponderador [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]
  const w2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];
  let s2 = 0;
  for (let i = 0; i < 13; i++) {
    s2 += parseInt(clean[8 + i], 10) * w2[i];
  }
  const d2 = (10 - (s2 % 10)) % 10;
  if (d2 !== parseInt(clean[21], 10)) return false;

  return true;
}

// Formateador numérico universal con separador de miles y decimales en formato es-AR
function formatNumber(val, decimals = 2) {
  const num = Number(val !== undefined && val !== null ? val : 0);
  if (isNaN(num)) return '0,00';
  return num.toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
window.formatNumber = formatNumber;

// Sanitizador seguro para interpolación en templates HTML
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper universal para modales (compatible con Tabler y Bootstrap)
function getBootstrapModal(element) {
  if (!element) return null;
  const ModalClass = window.bootstrap?.Modal || window.tabler?.Modal || window.tabler?.bootstrap?.Modal;
  if (!ModalClass) return null;
  return ModalClass.getOrCreateInstance ? ModalClass.getOrCreateInstance(element) : new ModalClass(element);
}

// ---------------------------------------------------------------------------
// Helpers: Formato de Horas (HH:MM) y Utilidades de Novedades
// ---------------------------------------------------------------------------

// Validar formato estricto de horas HH:MM
function isValidTimeFormat(val) {
  if (val === null || val === undefined) return false;
  const str = String(val).trim();
  return /^\d{1,3}:[0-5]\d$/.test(str);
}

// Convertir "HH:MM" a horas decimales (ej: "15:02" -> 15.03, "15:30" -> 15.5)
function hoursToDecimal(val, defaultValue = null) {
  if (val === null || val === undefined || val === '') return defaultValue;
  if (typeof val === 'number') return Math.round(val * 100) / 100;
  const str = String(val).trim();
  if (isValidTimeFormat(str)) {
    const [h, m] = str.split(':').map(Number);
    return Math.round((h + m / 60) * 100) / 100;
  }
  const parsed = parseFloat(str);
  return !isNaN(parsed) ? Math.round(parsed * 100) / 100 : defaultValue;
}

// Convertir número decimal de horas a string en formato horario "HH:MM"
function decimalToHours(val, defaultValue = '00:00') {
  if (val === null || val === undefined || val === '') return defaultValue;
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num) || num < 0) return defaultValue;

  const totalMinutes = Math.round(num * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const formattedHours = hours < 10 ? `0${hours}` : `${hours}`;
  const formattedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;

  return `${formattedHours}:${formattedMinutes}`;
}

// Determinar el tipo de dato aceptado por un concepto
function getConceptInputType(concept) {
  if (!concept) return 'UNITS';
  const dt = (concept.noveltyDataType || '').toUpperCase();
  if (dt === 'SOLO_ASIGNACION' || dt === 'NONE' || dt === 'SIN_NOVEDAD') return 'NONE';
  if (dt === 'HORAS' || dt === 'HOURS') return 'HOURS';
  if (dt === 'PORCENTAJE' || dt === 'PERCENTAGE') return 'PERCENTAGE';
  if (dt === 'IMPORTE' || dt === 'AMOUNT') return 'AMOUNT';
  if (dt === 'CANTIDAD' || dt === 'UNITS') return 'UNITS';
  if (concept.calculationType === 'FIXED_AMOUNT') return 'AMOUNT';
  if (concept.calculationType === 'PERCENTAGE') return 'PERCENTAGE';
  return 'UNITS';
}

// Formateador de columna única para novedades y conceptos asignados
function formatNoveltyValue(concept, item) {
  if (!item) return '-';
  const inputType = getConceptInputType(concept);
  const units = item.units;
  const amt = item.fixedAmount !== null && item.fixedAmount !== undefined
    ? item.fixedAmount
    : (item.amount !== null && item.amount !== undefined ? item.amount : null);

  if (inputType === 'NONE') {
    return '<span class="badge bg-blue-lt fw-bold px-2 py-1"><i class="ti ti-check me-1"></i>Asignado (Fórmula)</span>';
  }

  if (inputType === 'HOURS') {
    if (units !== null && units !== undefined && units !== '') {
      return `<span class="badge bg-purple-lt font-monospace fs-4 px-2 py-1">${decimalToHours(units)} hs</span>`;
    }
    return '<span class="text-muted">-</span>';
  }

  if (inputType === 'PERCENTAGE') {
    if (units !== null && units !== undefined && units !== '') {
      return `<span class="font-monospace fw-bold">${formatNumber(units)}%</span>`;
    }
    return '<span class="text-muted">-</span>';
  }

  if (inputType === 'AMOUNT') {
    if (amt !== null && amt !== undefined && amt !== '') {
      return `<span class="font-monospace fw-bold text-success">$${formatNumber(amt)}</span>`;
    }
    return '<span class="text-muted">-</span>';
  }

  // UNITS / CANTIDAD
  if (units !== null && units !== undefined && units !== '') {
    return `<span class="font-monospace fw-bold">${formatNumber(units)}</span>`;
  }
  if (amt !== null && amt !== undefined && amt !== '') {
    return `<span class="font-monospace fw-bold text-success">$${formatNumber(amt)}</span>`;
  }
  return '<span class="text-muted">-</span>';
}

// ---------------------------------------------------------------------------
// Helpers: Combo Boxes con Filtrado en Tiempo Real (TomSelect)
// ---------------------------------------------------------------------------

// TomSelect Helper: Inicializar combo box con filtrado en tiempo real
function initSearchableSelect(selectOrId, customOptions = {}) {
  const el = typeof selectOrId === 'string' ? document.getElementById(selectOrId) : selectOrId;
  if (!el || typeof window.TomSelect === 'undefined') return null;
  if (el.tomselect) {
    return el.tomselect;
  }

  const config = {
    create: false,
    maxOptions: 1000,
    allowEmptyOption: true,
    copyClassesToDropdown: false,
    sortField: false,
    ...customOptions,
  };

  try {
    const ts = new window.TomSelect(el, config);
    return ts;
  } catch (err) {
    console.warn('Error al inicializar TomSelect en', el, err);
    return null;
  }
}

// TomSelect Helper: Actualizar opciones y refrescar combo box
function updateSearchableSelect(selectOrId, optionsHtml, selectedValue = null) {
  const el = typeof selectOrId === 'string' ? document.getElementById(selectOrId) : selectOrId;
  if (!el) return null;

  if (el.tomselect) {
    el.tomselect.destroy();
  }

  if (optionsHtml !== undefined && optionsHtml !== null) {
    el.innerHTML = optionsHtml;
  }

  if (selectedValue !== null && selectedValue !== undefined) {
    el.value = selectedValue;
  }

  return initSearchableSelect(el);
}

// TomSelect Helper: Fijar valor sincronizando TomSelect y nativo
function setSearchableSelectValue(selectOrId, value, silent = false) {
  const el = typeof selectOrId === 'string' ? document.getElementById(selectOrId) : selectOrId;
  if (!el) return;
  if (el.tomselect) {
    el.tomselect.setValue(value, silent);
  } else {
    el.value = value;
  }
}

// Helper para ocultar un select y su wrapper de TomSelect si existe
function hideSelect(selectOrId) {
  const el = typeof selectOrId === 'string' ? document.getElementById(selectOrId) : selectOrId;
  if (!el) return;
  el.classList.add('d-none');
  if (el.tomselect?.wrapper) {
    el.tomselect.wrapper.classList.add('d-none');
  }
}

// Helper para mostrar un select y su wrapper de TomSelect si existe
function showSelect(selectOrId) {
  const el = typeof selectOrId === 'string' ? document.getElementById(selectOrId) : selectOrId;
  if (!el) return;
  el.classList.remove('d-none');
  if (el.tomselect?.wrapper) {
    el.tomselect.wrapper.classList.remove('d-none');
  }
}

// ---------------------------------------------------------------------------
// Helpers: Renderizado y Extracción de Control Único Dinámico de Novedades
// ---------------------------------------------------------------------------

// Renderizado dinámico de un único control de novedad según el tipo aceptado
function renderDynamicNoveltyControl(containerId, concept, initialData = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const inputType = getConceptInputType(concept);
  const prefix = containerId.startsWith('period') ? 'period-novelty' : 'pers-concept';
  const units = initialData.units;
  const amt = initialData.fixedAmount !== null && initialData.fixedAmount !== undefined
    ? initialData.fixedAmount
    : (initialData.amount !== null && initialData.amount !== undefined ? initialData.amount : null);

  container.dataset.inputType = inputType;

  if (inputType === 'NONE') {
    container.innerHTML = `
      <div class="alert alert-info py-2 px-3 mb-1 d-flex align-items-center gap-2">
        <i class="ti ti-info-circle fs-2 text-info"></i>
        <div>
          <strong>Concepto por Asignación / Fórmula:</strong><br>
          <span class="small text-muted">No requiere ingresar horas ni unidades. El resultado se calculará automáticamente según la fórmula configurada para el concepto.</span>
        </div>
      </div>
      <input type="hidden" id="${prefix}-val-input" value="1" />
    `;
    return;
  }

  if (inputType === 'HOURS') {
    const formattedHours = (units !== null && units !== undefined && units !== '')
      ? decimalToHours(units)
      : '';
    container.innerHTML = `
      <label class="form-label required fw-bold" for="${prefix}-val-input">
        <i class="ti ti-clock me-1 text-primary"></i> Horas a Liquidar (HH:MM) <span class="text-danger">*</span>
      </label>
      <div class="input-group">
        <span class="input-group-text"><i class="ti ti-clock"></i></span>
        <input type="text" id="${prefix}-val-input" class="form-control font-monospace fs-2 fw-bold text-center" 
          placeholder="00:00" 
          maxlength="6"
          autocomplete="off"
          value="${escapeHtml(formattedHours)}" required />
        <span class="input-group-text">hs</span>
      </div>
      <small class="form-hint mt-1 text-muted">
        Ingrese únicamente en formato horario <strong>hh:mm</strong> (ej: 08:30, 15:02, 120:00).
      </small>
    `;

    const input = document.getElementById(`${prefix}-val-input`);
    if (input) {
      input.addEventListener('input', (e) => {
        let val = e.target.value.replace(/[^0-9:]/g, '');
        if (!val.includes(':') && val.length >= 3) {
          val = val.slice(0, val.length - 2) + ':' + val.slice(val.length - 2);
        }
        e.target.value = val;
      });
      input.addEventListener('blur', (e) => {
        let val = e.target.value.trim();
        if (val && /^\d{1,3}$/.test(val)) {
          const h = parseInt(val, 10);
          val = (h < 10 ? '0' : '') + h + ':00';
          e.target.value = val;
        }
      });
    }
  } else if (inputType === 'PERCENTAGE') {
    const valStr = (units !== null && units !== undefined && units !== '') ? units : '';
    container.innerHTML = `
      <label class="form-label required fw-bold" for="${prefix}-val-input">
        <i class="ti ti-percentage me-1 text-primary"></i> Porcentaje (%) <span class="text-danger">*</span>
      </label>
      <div class="input-group">
        <input type="number" step="0.01" min="0" max="100" id="${prefix}-val-input" 
          class="form-control font-monospace text-end fs-2 fw-bold" 
          placeholder="0.00" 
          value="${valStr}" required />
        <span class="input-group-text">%</span>
      </div>
      <small class="form-hint mt-1 text-muted">Porcentaje numérico aplicable (0.00% a 100.00%).</small>
    `;
  } else if (inputType === 'AMOUNT') {
    const valStr = (amt !== null && amt !== undefined && amt !== '') ? amt : '';
    container.innerHTML = `
      <label class="form-label required fw-bold" for="${prefix}-val-input">
        <i class="ti ti-currency-dollar me-1 text-primary"></i> Importe Fijo ($) <span class="text-danger">*</span>
      </label>
      <div class="input-group">
        <span class="input-group-text">$</span>
        <input type="number" step="0.01" min="0" id="${prefix}-val-input" 
          class="form-control font-monospace text-end fs-2 fw-bold" 
          placeholder="0.00" 
          value="${valStr}" required />
      </div>
      <small class="form-hint mt-1 text-muted">Importe monetario en pesos para este concepto.</small>
    `;
  } else {
    // UNITS / CANTIDAD
    const valStr = (units !== null && units !== undefined && units !== '') ? units : '';
    container.innerHTML = `
      <label class="form-label required fw-bold" for="${prefix}-val-input">
        <i class="ti ti-hash me-1 text-primary"></i> Cantidad / Unidades <span class="text-danger">*</span>
      </label>
      <div class="input-group">
        <input type="number" step="0.01" min="0" id="${prefix}-val-input" 
          class="form-control font-monospace text-end fs-2 fw-bold" 
          placeholder="0.00" 
          value="${valStr}" required />
        <span class="input-group-text">unidades</span>
      </div>
      <small class="form-hint mt-1 text-muted">Cantidad numérica, días o factor multiplicador.</small>
    `;
  }
}

// Obtener valor del control dinámico con validaciones
function getDynamicNoveltyControlValue(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return { error: 'No se encontró el contenedor del formulario' };

  const inputType = container.dataset.inputType || 'UNITS';
  const prefix = containerId.startsWith('period') ? 'period-novelty' : 'pers-concept';
  const input = document.getElementById(`${prefix}-val-input`);

  if (!input) return { error: 'No se encontró el campo de valor' };

  if (inputType === 'NONE') {
    return {
      inputType: 'NONE',
      units: 1,
      amount: null,
      fixedAmount: null,
    };
  }

  const rawVal = input.value.trim();
  if (rawVal === '') {
    return { error: 'Debe ingresar un valor para el concepto.' };
  }

  if (inputType === 'HOURS') {
    if (!isValidTimeFormat(rawVal)) {
      return { error: 'El formato de horas debe ser estrictamente HH:MM (ej: 08:30, 15:02, 120:00).' };
    }
    const decVal = hoursToDecimal(rawVal);
    if (decVal === null || isNaN(decVal) || decVal < 0) {
      return { error: 'El valor de horas ingresado no es válido.' };
    }
    return {
      inputType: 'HOURS',
      units: decVal,
      amount: null,
      fixedAmount: null,
    };
  }

  const numVal = parseFloat(rawVal);
  if (isNaN(numVal) || numVal < 0) {
    return { error: 'El valor debe ser un número válido mayor o igual a 0.' };
  }

  if (inputType === 'PERCENTAGE') {
    if (numVal > 100) {
      return { error: 'El porcentaje no puede ser mayor al 100%.' };
    }
    return {
      inputType: 'PERCENTAGE',
      units: numVal,
      amount: null,
      fixedAmount: null,
    };
  }

  if (inputType === 'AMOUNT') {
    return {
      inputType: 'AMOUNT',
      units: 1,
      amount: numVal,
      fixedAmount: numVal,
    };
  }

  // UNITS
  return {
    inputType: 'UNITS',
    units: numVal,
    amount: null,
    fixedAmount: numVal,
  };
}


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

  // --- Vista 1: Dashboard ---
  renderDashboard() {
    const compCountEl = document.getElementById('stat-companies-count');
    const activeCompNameEl = document.getElementById('stat-active-company');
    const planNameEl = document.getElementById('stat-plan-name');

    if (compCountEl) compCountEl.textContent = this.companies.length;
    if (activeCompNameEl) {
      activeCompNameEl.textContent = this.activeCompany ? this.activeCompany.name : 'Ninguna seleccionada';
    }
    if (planNameEl) planNameEl.textContent = this.account?.status || 'TRIAL';
  }

  // --- Vista 2: ABM de Empresas ---
  renderCompaniesTable() {
    const tbody = document.getElementById('companies-table-body');
    if (!tbody) return;

    if (this.companies.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-4 text-muted">
            <i class="ti ti-building-off fs-1 d-block mb-2"></i>
            No hay empresas registradas todavía. ¡Crea tu primera empresa para comenzar!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.companies
      .map((c) => {
        const isCurrent = this.activeCompany && this.activeCompany.id === c.id;
        return `
        <tr class="${isCurrent ? 'table-active' : ''}">
          <td>
            <div class="d-flex align-items-center gap-2">
              <span class="avatar avatar-sm bg-primary-lt"><i class="ti ti-building"></i></span>
              <div>
                <strong>${c.name}</strong>
                ${c.tradeName ? `<div class="text-muted small">${c.tradeName}</div>` : ''}
              </div>
            </div>
          </td>
          <td><code>${formatCuit(c.cuit)}</code></td>
          <td>
            ${
              c.activityCode
                ? `<span class="badge bg-blue-lt" title="${c.activity?.description || ''}"><i class="ti ti-briefcase me-1"></i>${c.activityCode}</span>`
                : '<span class="text-muted small">Sin asignar</span>'
            }
          </td>
          <td><span class="badge bg-success-lt">${c.status}</span></td>
          <td><span class="badge bg-azure-lt"><i class="ti ti-database me-1"></i> Aprovisionada</span></td>
          <td>
            ${
              isCurrent
                ? '<span class="badge bg-primary me-1"><i class="ti ti-check me-1"></i> Activa</span>'
                : `<button class="btn btn-sm btn-outline-primary btn-select-company me-1" data-id="${c.id}">Seleccionar</button>`
            }
            <button class="btn btn-sm btn-outline-secondary btn-open-profile" data-id="${c.id}" title="Cargar y editar ficha de la empresa">
              <i class="ti ti-file-text me-1"></i> Ficha / Datos
            </button>
          </td>
          <td class="text-end">
            <div class="dropdown">
              <button class="btn btn-sm btn-icon" data-bs-toggle="dropdown">
                <i class="ti ti-dots-vertical"></i>
              </button>
              <div class="dropdown-menu dropdown-menu-end">
                <a class="dropdown-item btn-open-profile" href="#" data-id="${c.id}">
                  <i class="ti ti-file-certificate me-2"></i> Datos de la Empresa (Ficha)
                </a>
                ${
                  this.user?.role === 'OWNER'
                    ? `
                  <a class="dropdown-item btn-edit-company" href="#" data-id="${c.id}">
                    <i class="ti ti-edit me-2"></i> Editar Razón Social
                  </a>
                  <div class="dropdown-divider"></div>
                  <a class="dropdown-item text-danger btn-delete-company" href="#" data-id="${c.id}" data-name="${c.name}">
                    <i class="ti ti-trash me-2"></i> Eliminar
                  </a>
                `
                    : ''
                }
              </div>
            </div>
          </td>
        </tr>
      `;
      })
      .join('');

    // Asignar listeners
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

    document.getElementById('profile-company-title').textContent = 'Nueva Empresa: Carga de Datos';
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
      cuitFeedback.className = 'form-hint';
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
      submitBtn.innerHTML = '<i class="ti ti-device-floppy me-2"></i> Crear y Guardar Empresa';
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
      submitBtn.innerHTML = '<i class="ti ti-device-floppy me-2"></i> Guardar Cambios de la Empresa';
    }

    const cuitInput = document.getElementById('profile-cuit');
    if (cuitInput) {
      cuitInput.value = formatCuit(company.cuit);
      cuitInput.readOnly = true;
      cuitInput.classList.add('bg-light');
      cuitInput.classList.remove('is-invalid');
    }
    const cuitStatus = document.getElementById('profile-cuit-status');
    if (cuitStatus) cuitStatus.innerHTML = '<i class="ti ti-check text-success" title="Validado en AFIP"></i>';
    const cuitFeedback = document.getElementById('profile-cuit-feedback');
    if (cuitFeedback) {
      cuitFeedback.className = 'form-hint text-success';
      cuitFeedback.textContent = 'CUIT registrado en el sistema.';
    }

    this.showView('company-profile');
    this.activateCompanyTab('tab-btn-fiscal');
    await this.renderCompanyProfileView();
  }

  async deleteCompany(companyId, companyName) {
    if (!confirm(`¿Estás seguro de que deseas dar de baja la empresa "${companyName}"?`)) {
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

  // --- Vista 3: ABM de Usuarios ---
  // --- Vista 3: ABM de Usuarios y Asignación de Derechos ---
  async renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><span class="spinner-border spinner-border-sm me-2"></span>Cargando colaboradores...</td></tr>';

    try {
      const res = await apiRequest('/users?limit=50');
      this.users = res.data || [];

      if (this.users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No se encontraron colaboradores en la cuenta.</td></tr>';
        return;
      }

      tbody.innerHTML = this.users
        .map((u) => {
          const initials = `${(u.firstName || '')[0] || ''}${(u.lastName || '')[0] || ''}`.toUpperCase() || 'U';
          const roleBadgeClass =
            u.role === 'OWNER'
              ? 'bg-primary text-white'
              : u.role === 'ADMIN'
              ? 'bg-purple-lt'
              : 'bg-azure-lt';
          const roleLabel =
            u.role === 'OWNER'
              ? 'Propietario'
              : u.role === 'ADMIN'
              ? 'Administrador'
              : 'Colaborador';

          let companiesHtml = '';
          if (u.role === 'OWNER' || u.role === 'ADMIN') {
            companiesHtml = '<span class="badge bg-teal-lt"><i class="ti ti-shield-check me-1"></i>Todas las empresas (Acceso total)</span>';
          } else if (u.companyAccesses && u.companyAccesses.length > 0) {
            companiesHtml = u.companyAccesses
              .map((a) => {
                const compName = a.company ? a.company.name : 'Empresa';
                const roleName =
                  a.role === 'ADMIN'
                    ? 'Admin'
                    : a.role === 'OPERATOR'
                    ? 'Operador'
                    : 'Auditor';
                return `<span class="badge bg-light text-dark border me-1 mb-1" title="${compName} (${roleName})">
                  ${compName} <span class="badge bg-primary-lt ms-1">${roleName}</span>
                </span>`;
              })
              .join('');
          } else {
            companiesHtml = '<span class="text-muted small">Sin empresas asignadas</span>';
          }

          return `
          <tr>
            <td>
              <div class="d-flex align-items-center gap-2">
                <span class="avatar avatar-sm bg-blue-lt fw-bold">${initials}</span>
                <div>
                  <div class="d-flex align-items-center gap-2">
                    <strong>${u.firstName} ${u.lastName}</strong>
                    ${u.position ? `<span class="badge bg-secondary-lt small">${u.position}</span>` : ''}
                  </div>
                  <div class="text-muted small d-flex flex-wrap gap-2 mt-1">
                    <span><i class="ti ti-mail me-1"></i>${u.email}</span>
                    ${u.cuil ? `<span><i class="ti ti-id me-1"></i>CUIL: ${formatCuit(u.cuil)}</span>` : ''}
                    ${u.phone ? `<span><i class="ti ti-phone me-1"></i>${u.phone}</span>` : ''}
                  </div>
                </div>
              </div>
            </td>
            <td>
              <span class="badge ${roleBadgeClass}">${roleLabel}</span>
            </td>
            <td>
              <span class="badge ${u.isActive ? 'bg-success-lt' : 'bg-danger-lt'}">
                <i class="ti ${u.isActive ? 'ti-check' : 'ti-ban'} me-1"></i>
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
                <div class="btn-group btn-group-sm">
                  <button class="btn btn-outline-primary btn-edit-user" data-id="${u.id}" title="Editar datos y permisos">
                    <i class="ti ti-edit me-1"></i> Editar
                  </button>
                  <button class="btn btn-outline-${u.isActive ? 'warning' : 'success'} btn-toggle-status-user" data-id="${u.id}" data-active="${u.isActive}" title="${u.isActive ? 'Suspender acceso' : 'Habilitar acceso'}">
                    <i class="ti ti-${u.isActive ? 'ban' : 'check'}"></i>
                  </button>
                  <button class="btn btn-outline-danger btn-delete-user" data-id="${u.id}" data-name="${u.firstName} ${u.lastName}" title="Eliminar colaborador">
                    <i class="ti ti-trash"></i>
                  </button>
                </div>
              `
                  : '<span class="badge bg-light text-muted">Cuenta Principal</span>'
              }
            </td>
          </tr>
        `;
        })
        .join('');

      // Asignar listeners de acciones
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
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center py-4">${err.message}</td></tr>`;
    }
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
            cuilFeedback.className = 'valid-feedback d-block';
            cuilFeedback.textContent = '✓ CUIL válido según algoritmo de AFIP/ARCA';
          } else {
            cuilInput.classList.remove('is-valid');
            cuilInput.classList.add('is-invalid');
            cuilFeedback.className = 'invalid-feedback d-block';
            cuilFeedback.textContent = '✗ Dígito verificador incorrecto';
          }
        } else {
          cuilInput.classList.remove('is-valid', 'is-invalid');
          cuilFeedback.className = 'form-hint small';
          cuilFeedback.textContent = '11 dígitos sin guiones.';
        }
      });
    }

    const form = document.getElementById('form-user-unified');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('btn-save-user-unified');
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

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando...';

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
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Colaborador';
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
      container.innerHTML = '<div class="text-muted small p-2">No hay empresas registradas en la cuenta aún.</div>';
      return;
    }

    const accessMap = new Map(userAccesses.map((a) => [a.companyId, a.role]));

    container.innerHTML = this.companies
      .map((c) => {
        const currentRole = accessMap.get(c.id);
        const isChecked = !!currentRole;
        const selectedRole = currentRole || 'OPERATOR';

        return `
        <div class="user-company-matrix-row d-flex align-items-center justify-content-between p-2 mb-2 bg-white rounded border">
          <div class="form-check mb-0">
            <input class="form-check-input user-company-check" type="checkbox" data-company-id="${c.id}" id="check-comp-${c.id}" ${isChecked ? 'checked' : ''}>
            <label class="form-check-label" for="check-comp-${c.id}">
              <strong class="d-block text-truncate" style="max-width: 170px;">${c.name}</strong>
              <small class="text-muted">${formatCuit(c.cuit)}</small>
            </label>
          </div>
          <div style="width: 130px;">
            <select class="form-select form-select-sm user-company-role-select" data-company-id="${c.id}" ${!isChecked ? 'disabled' : ''}>
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

  // --- Vista 4: Mi Cuenta ---
  renderAccountView() {
    const nameEl = document.getElementById('account-view-name');
    const planEl = document.getElementById('account-view-plan');
    const limitEl = document.getElementById('account-view-limit');

    if (nameEl) nameEl.textContent = this.account?.name || '-';
    if (planEl) planEl.textContent = this.account?.status || 'TRIAL';
    if (limitEl) {
      limitEl.textContent = `${this.companies.length} de ${this.account?.maxCompanies || 1} empresas registradas`;
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
        cuitInput.classList.add('bg-light');
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

  setupCompanyProfileForm() {
    const form = document.getElementById('form-company-profile');
    if (!form) return;

    // Validación interactiva de CUIT para el formulario
    const cuitInput = document.getElementById('profile-cuit');
    const cuitStatus = document.getElementById('profile-cuit-status');
    const cuitFeedback = document.getElementById('profile-cuit-feedback');

    if (cuitInput) {
      cuitInput.addEventListener('input', () => {
        if (this.companyFormMode !== 'new') return;
        const val = cuitInput.value.replace(/\D/g, '');
        if (val.length === 11) {
          if (isValidCuit(val)) {
            cuitInput.classList.remove('is-invalid');
            cuitInput.classList.add('is-valid');
            if (cuitStatus) cuitStatus.innerHTML = '<i class="ti ti-check text-success"></i>';
            if (cuitFeedback) {
              cuitFeedback.className = 'valid-feedback d-block';
              cuitFeedback.textContent = '✓ CUIT válido según algoritmo de AFIP/ARCA';
            }
          } else {
            cuitInput.classList.remove('is-valid');
            cuitInput.classList.add('is-invalid');
            if (cuitStatus) cuitStatus.innerHTML = '<i class="ti ti-x text-danger"></i>';
            if (cuitFeedback) {
              cuitFeedback.className = 'invalid-feedback d-block';
              cuitFeedback.textContent = '✗ Dígito verificador incorrecto';
            }
          }
        } else {
          cuitInput.classList.remove('is-valid', 'is-invalid');
          if (cuitStatus) cuitStatus.innerHTML = '<i class="ti ti-id"></i>';
          if (cuitFeedback) {
            cuitFeedback.className = 'form-hint';
            cuitFeedback.textContent = '11 dígitos numéricos sin guiones.';
          }
        }
      });
    }

    // Selector interactivo de Actividades Económicas CLAE
    const actInput = document.getElementById('profile-activity-input');
    const clearClaeBtn = document.getElementById('btn-clear-clae');

    if (clearClaeBtn) {
      clearClaeBtn.addEventListener('click', () => {
        this.setClaeSelection('', '');
      });
    }

    if (actInput) {
      actInput.addEventListener('input', () => {
        const val = actInput.value.trim();
        if (!val) {
          this.setClaeSelection('', '');
          return;
        }

        // 1. Coincidencia exacta con datalist "XXXXXX - Descripción" o "XXXXXX"
        const matched = this.claeActivities?.find(
          (a) => a.code === val || `${a.code} - ${a.description}` === val || val.startsWith(`${a.code} -`)
        );
        if (matched) {
          this.setClaeSelection(matched.code, matched.description);
          return;
        }

        // 2. Si el usuario tipea el código numérico directamente (6 dígitos)
        const codeOnly = val.replace(/\D/g, '');
        if (codeOnly.length === 6) {
          const byCode = this.claeActivities?.find((a) => a.code === codeOnly);
          if (byCode) {
            this.setClaeSelection(byCode.code, byCode.description);
            return;
          }
        }

        // Si todavía está tipeando y no coincide exactamente
        const codeHidden = document.getElementById('profile-activity-code');
        if (codeHidden) codeHidden.value = '';
        const badge = document.getElementById('profile-activity-badge');
        if (badge) badge.classList.add('d-none');
      });
    }

    // Navegación secuencial entre pestañas con botones Anterior / Siguiente
    const tabsList = ['tab-btn-fiscal', 'tab-btn-address', 'tab-btn-payroll'];
    const prevBtn = document.getElementById('btn-company-tab-prev');
    const nextBtn = document.getElementById('btn-company-tab-next');

    const updateTabNavButtons = (activeTabId) => {
      const idx = tabsList.indexOf(activeTabId);
      if (prevBtn) {
        if (idx <= 0) prevBtn.classList.add('d-none');
        else prevBtn.classList.remove('d-none');
      }
      if (nextBtn) {
        if (idx >= tabsList.length - 1) nextBtn.classList.add('d-none');
        else nextBtn.classList.remove('d-none');
      }
    };

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const activeTab = document.querySelector('#company-profile-tabs .nav-link.active');
        const activeId = activeTab ? activeTab.id : tabsList[0];
        const currentIdx = tabsList.indexOf(activeId);
        if (currentIdx > 0) {
          this.activateCompanyTab(tabsList[currentIdx - 1]);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const activeTab = document.querySelector('#company-profile-tabs .nav-link.active');
        const activeId = activeTab ? activeTab.id : tabsList[0];
        const currentIdx = tabsList.indexOf(activeId);
        if (currentIdx < tabsList.length - 1) {
          this.activateCompanyTab(tabsList[currentIdx + 1]);
        }
      });
    }

    // Escuchar cambio de pestañas para sincronizar los botones Anterior / Siguiente
    document.querySelectorAll('#company-profile-tabs [data-bs-toggle="tab"]').forEach((tabLink) => {
      tabLink.addEventListener('shown.bs.tab', (e) => {
        updateTabNavButtons(e.target.id);
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (this.user?.role !== 'OWNER') {
        showToast('Solo el Propietario (Owner) de la cuenta posee permisos para modificar los datos de la empresa', 'danger');
        return;
      }
      const submitBtn = document.getElementById('btn-save-profile');
      const alertBox = document.getElementById('profile-alert');
      if (alertBox) alertBox.classList.add('d-none');

      const legalName = document.getElementById('profile-legal-name').value.trim();
      const tradeName = document.getElementById('profile-trade-name').value.trim() || null;
      const cuitRaw = document.getElementById('profile-cuit').value.replace(/\D/g, '');

      const profilePayload = {
        legalName,
        tradeName,
        taxCondition: document.getElementById('profile-tax-condition').value,
        grossIncomeNumber: document.getElementById('profile-gross-income').value.trim() || null,
        address: document.getElementById('profile-address').value.trim() || null,
        city: document.getElementById('profile-city').value.trim() || null,
        province: document.getElementById('profile-province').value.trim() || null,
        postalCode: document.getElementById('profile-postal-code').value.trim() || null,
        phone: document.getElementById('profile-phone').value.trim() || null,
        email: document.getElementById('profile-email').value.trim() || null,
        activityStart: document.getElementById('profile-activity-start').value || null,
        activityCode: document.getElementById('profile-activity-code')?.value.trim() || null,
        activityDescription: document.getElementById('profile-activity-description')?.value.trim() || null,
        artName: document.getElementById('profile-art-name').value.trim() || null,
        bankName: document.getElementById('profile-bank-name').value.trim() || null,
        bankCbu: document.getElementById('profile-bank-cbu').value.trim() || null,
      };

      if (this.companyFormMode === 'new') {
        if (!isValidCuit(cuitRaw)) {
          if (alertBox) {
            alertBox.textContent = 'Por favor ingresa un CUIT válido (11 dígitos numéricos).';
            alertBox.classList.remove('d-none');
          }
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Aprovisionando base física MySQL...';

        try {
          // 1. Crear empresa en base MASTER y aprovisionar DB física independiente
          const createRes = await apiRequest('/companies', {
            method: 'POST',
            body: JSON.stringify({
              name: legalName,
              tradeName,
              cuit: cuitRaw,
              activityCode: profilePayload.activityCode,
            }),
          });

          const createdCompany = createRes.data;
          storage.setActiveCompanyId(createdCompany.id);

          // 2. Guardar ficha completa en la base física del nuevo tenant
          await apiRequest('/companies/profile', {
            method: 'PUT',
            headers: { 'x-company-id': createdCompany.id },
            body: JSON.stringify(profilePayload),
          });

          showToast('¡Empresa creada y base de datos aprovisionada con éxito!');
          await this.loadCompanies();

          const fullCompany = this.companies.find((c) => c.id === createdCompany.id);
          if (fullCompany) {
            this.openEditCompanyForm(fullCompany);
          } else {
            this.showView('companies');
          }
        } catch (err) {
          if (alertBox) {
            alertBox.textContent = err.message || 'Error al dar de alta la empresa';
            alertBox.classList.remove('d-none');
          }
          showToast(err.message || 'Error al crear empresa', 'danger');
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="ti ti-device-floppy me-2"></i> Crear y Guardar Empresa';
        }
      } else {
        // Modo Edición
        if (!this.activeCompany) {
          showToast('No hay una empresa activa seleccionada', 'danger');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando cambios...';

        try {
          await apiRequest('/companies/profile', {
            method: 'PUT',
            body: JSON.stringify(profilePayload),
          });

          showToast('Ficha de la empresa guardada exitosamente');

          // Actualizar título y listado si cambió la razón social
          if (profilePayload.legalName) {
            this.activeCompany.name = profilePayload.legalName;
            document.getElementById('profile-company-title').textContent = profilePayload.legalName;
            await this.loadCompanies();
          }
        } catch (err) {
          if (alertBox) {
            alertBox.textContent = err.message || 'Error al guardar los datos de la empresa';
            alertBox.classList.remove('d-none');
          }
          showToast(err.message || 'Error al guardar', 'danger');
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="ti ti-device-floppy me-2"></i> Guardar Cambios de la Empresa';
        }
      }
    });
  }

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
    setTableLoading('health-insurances-table-body', 4, 'Cargando obras sociales...', 'health-insurances-pagination-container');
    setTableLoading('unions-table-body', 4, 'Cargando sindicatos...', 'unions-pagination-container');
    setTableLoading('mutuals-table-body', 4, 'Cargando mutuales...', 'mutuals-pagination-container');
    setTableLoading('kinships-table-body', 4, 'Cargando parentescos...', 'kinships-pagination-container');

    const [deptRes, jobRes, hiRes, unionRes, mutualRes, kinRes, catRes, posRes, servRes, cctRes, modRes, profileRes, salaryScalesRes, payrollSettingsRes] = await Promise.all([
      apiRequest('/departments'),
      apiRequest('/job-positions'),
      apiRequest('/health-insurances'),
      apiRequest('/unions'),
      apiRequest('/mutuals'),
      apiRequest('/kinships'),
      apiRequest('/arca-categories'),
      apiRequest('/arca-positions'),
      apiRequest('/arca-service-types'),
      apiRequest('/arca-ccts'),
      apiRequest('/arca-contract-modalities'),
      apiRequest('/companies/profile').catch(() => ({ data: null })),
      apiRequest('/payroll/salary-scales').catch(() => ({ data: [] })),
      apiRequest('/payroll/settings').catch(() => ({ data: null })),
    ]);

    this.departments = deptRes.data || [];
    this.jobPositions = jobRes.data || [];
    this.healthInsurances = hiRes.data || [];
    this.unions = unionRes.data || [];
    this.mutuals = mutualRes.data || [];
    this.kinships = kinRes.data || [];
    this.arcaCategories = catRes.data || [];
    this.arcaPositions = posRes.data || [];
    this.arcaServiceTypes = servRes.data || [];
    this.arcaCcts = cctRes.data || [];
    this.arcaContractModalities = modRes.data || [];
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

        const cctBadge = p.cct
          ? `<div class="d-flex align-items-center gap-2">
               <span class="badge bg-indigo-lt text-indigo py-1 px-2 font-monospace"><i class="ti ti-file-certificate me-1"></i>${escapeHtml(p.cct.code)}</span>
               <span class="small text-muted text-truncate" style="max-width: 450px;" title="${escapeHtml(p.cct.name)}">${escapeHtml(p.cct.name)}</span>
             </div>`
          : `<span class="badge bg-light text-muted border font-monospace">S/CCT</span>`;

        return `
          <tr>
            <td>${codeBadge}</td>
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
    const pctInput = document.getElementById('employee-input-part-time-pct');
    if (pctInput) pctInput.value = pct;

    const badge = document.getElementById('emp-jornada-badge');
    if (badge) {
      if (isPartTime || pct < 100) {
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
        const concept = item.concept || this.payrollConcepts.find((c) => c.id === item.conceptId) || {};
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

  async ensurePayrollConceptsLoaded() {
    if (this.payrollConcepts.length === 0) {
      try {
        const res = await apiRequest('/payroll/concepts?limit=500');
        this.payrollConcepts = res.data || [];
      } catch (err) {
        console.warn('Error al cargar conceptos para selector:', err);
      }
    }
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
      select.innerHTML = '<option value="">Seleccione un concepto...</option>' +
        this.payrollConcepts.map((c) => `<option value="${c.id}">${escapeHtml(c.code)} - ${escapeHtml(c.name)} (${escapeHtml(c.type)})</option>`).join('');
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
      select.innerHTML = '<option value="">Seleccione un concepto...</option>' +
        this.payrollConcepts.map((c) => `<option value="${c.id}">${escapeHtml(c.code)} - ${escapeHtml(c.name)} (${escapeHtml(c.type)})</option>`).join('');
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
        const conceptObj = this.payrollConcepts.find((c) => c.id === payload.conceptId);
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
      select.innerHTML = '<option value="">Seleccione un concepto...</option>' +
        this.payrollConcepts.map((c) => `<option value="${c.id}">${escapeHtml(c.code)} - ${escapeHtml(c.name)} (${escapeHtml(c.type)})</option>`).join('');
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

      const payload = {
        name: nameVal,
        code: codeVal || null,
        cctCode: cctCode || null,
        categoryCode: categoryCode || null,
        positionCode: positionCode || null,
        serviceTypeCode: serviceTypeCode || null,
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

  populateEmployeeSelects(selectedDept = '', selectedJob = '', selectedHi = '', selectedUnion = '', selectedMutual = '', selectedContractModality = '', selectedSalaryScale = '') {
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

    this.updateSalaryScaleOptions(selectedContractModality, selectedSalaryScale);
  }

  /**
   * Filtra y actualiza dinámicamente las opciones del selector de nómina según la modalidad de contrato
   * (Mostrando únicamente nóminas de pasantes para modalidades 27 y 51, o únicamente estándar para las demás).
   */
  updateSalaryScaleOptions(selectedContractModality, selectedSalaryScale) {
    const scaleSelect = document.getElementById('employee-select-salary-scale');
    if (!scaleSelect) return;

    const modCode = selectedContractModality !== undefined && selectedContractModality !== null
      ? String(selectedContractModality)
      : (document.getElementById('employee-input-contract-modality')?.value || '');
    const isInternMod = modCode === '27' || modCode === '51';
    const allScales = this.salaryScales || [];
    const filteredScales = isInternMod
      ? allScales.filter((s) => s.isInternOnly === true)
      : allScales.filter((s) => !s.isInternOnly);

    // Actualizar títulos e indicaciones visuales
    const cardTitle = document.getElementById('employee-scale-card-title');
    const selectLabel = document.getElementById('employee-scale-select-label');
    const selectHint = document.getElementById('employee-scale-select-hint');
    const amountLabel = document.getElementById('employee-scale-amount-label');

    if (cardTitle) cardTitle.textContent = isInternMod ? 'Asignación Estímulo del Pasante (Ley 26.427)' : 'Sueldo Básico del Colaborador';
    if (selectLabel) selectLabel.innerHTML = isInternMod ? 'Nómina de Pasante Asignada <span class="text-danger">*</span>' : 'Nómina / Básico Asignado <span class="text-danger">*</span>';
    if (selectHint) selectHint.textContent = isInternMod ? 'Nómina exclusiva de asignación estímulo para pasantes educativos (Ley 26.427).' : 'Sueldo básico asignado según nómina seleccionada desde el módulo de Haberes.';
    if (amountLabel) amountLabel.textContent = isInternMod ? 'Asignación Estímulo Mensual' : 'Importe Básico Mensual';

    let targetSelection = selectedSalaryScale || scaleSelect.value || '';
    if (!filteredScales.some((s) => s.id === targetSelection)) {
      targetSelection = '';
    }

    const placeholderText = isInternMod ? '-- Seleccionar Nómina de Pasante --' : '-- Seleccionar Nómina --';
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

    this.populateEmployeeSelects('', '', '', '', '', '8', '');
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

    this.populateEmployeeSelects(
      fullEmp.departmentId,
      fullEmp.jobPositionId,
      fullEmp.healthInsuranceId,
      fullEmp.unionId,
      fullEmp.mutualId,
      fullEmp.contractModalityCode || '8',
      fullEmp.salaryScaleId || fullEmp.salaryScale?.id || ''
    );
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

  // ==========================================================================
  // MÓDULO DE LIQUIDACIÓN DE SUELDOS & LIBRO DE SUELDOS DIGITAL (ARCA)
  // ==========================================================================

  setupPayrollNavigation() {
    const navLinks = document.querySelectorAll('#payroll-sidebar-nav .payroll-nav-item:not([data-bs-toggle="collapse"]), #payroll-sidebar-nav .payroll-nav-subitem');
    navLinks.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        navLinks.forEach((i) => i.classList.remove('active'));
        document.querySelectorAll('#payroll-sidebar-nav .payroll-nav-item').forEach((i) => i.classList.remove('active'));
        item.classList.add('active');

        // Si es un sub-ítem, mantener activo visualmente el menú padre
        const parentDropdown = item.closest('.payroll-nav-dropdown');
        if (parentDropdown) {
          const parentBtn = parentDropdown.querySelector('.payroll-nav-item');
          if (parentBtn) parentBtn.classList.add('active');
        }

        const targetPaneId = item.getAttribute('href');
        document.querySelectorAll('#payroll-tab-content > .tab-pane').forEach((p) => {
          p.classList.remove('show', 'active');
        });
        const targetPane = document.querySelector(targetPaneId);
        if (targetPane) targetPane.classList.add('show', 'active');

        // Cargar datos según el panel activado
        if (targetPaneId === '#pane-payroll-periods') {
          this.loadPayrollPeriods();
        } else if (targetPaneId === '#pane-nov-pers-emp') {
          this.loadNovPersEmp();
        } else if (targetPaneId === '#pane-nov-pers-con') {
          this.loadNovPersCon();
        } else if (targetPaneId === '#pane-nov-nopers-emp') {
          this.syncPayrollPeriodSelectors();
          this.loadNovNoPersEmp();
        } else if (targetPaneId === '#pane-nov-nopers-con') {
          this.syncPayrollPeriodSelectors();
          this.loadNovNoPersCon();
        } else if (targetPaneId === '#pane-payroll-settlement') {
          this.syncPayrollPeriodSelectors();
          this.loadSettlementView();
        } else if (targetPaneId === '#pane-payroll-slips') {
          this.syncPayrollPeriodSelectors();
          const periodSelect = document.getElementById('slips-period-select');
          if (periodSelect && periodSelect.value) {
            this.loadPayrollSlips(periodSelect.value);
          }
        } else if (targetPaneId === '#pane-payroll-lsd') {
          this.syncPayrollPeriodSelectors();
        } else if (targetPaneId === '#pane-payroll-concepts') {
          this.loadPayrollConcepts();
        } else if (targetPaneId === '#pane-payroll-matrices') {
          this.loadPayrollMatrices();
        } else if (targetPaneId === '#pane-payroll-fixed-values') {
          this.loadPayrollFixedValues();
        } else if (targetPaneId === '#pane-payroll-salary-scales') {
          this.loadPayrollSalaryScales();
        } else if (targetPaneId === '#pane-payroll-settings') {
          this.loadPayrollSettings();
        }
      });
    });
  }

  async renderPayrollView() {
    if (!this.activeCompany) {
      showToast('Por favor selecciona una empresa activa para liquidar sueldos', 'warning');
      this.showView('companies');
      return;
    }
    await this.loadPayrollPeriods();
    await this.loadPayrollSalaryScales();
    await this.loadPayrollConcepts();
    await this.loadPayrollMatrices();
    await this.loadPayrollFixedValues();
    await this.loadPayrollSettings();
  }

  setupPayrollModals() {
    // --- Period Modal ---
    const newPeriodBtnHeader = document.getElementById('btn-new-period-header');
    const newPeriodBtn = document.getElementById('btn-open-new-period-modal');
    if (newPeriodBtnHeader) newPeriodBtnHeader.addEventListener('click', () => this.openNewPeriodModal());
    if (newPeriodBtn) newPeriodBtn.addEventListener('click', () => this.openNewPeriodModal());

    const formPeriod = document.getElementById('form-payroll-period');
    if (formPeriod) {
      formPeriod.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.savePayrollPeriod();
      });
    }

    // --- Search & Filters for Periods ---
    const periodSearch = document.getElementById('payroll-period-search');
    if (periodSearch) {
      periodSearch.addEventListener('input', () => {
        this.payrollPeriodsPage = 1;
        this.loadPayrollPeriods();
      });
    }
    const periodTypeFilter = document.getElementById('payroll-period-type-filter');
    if (periodTypeFilter) {
      periodTypeFilter.addEventListener('change', () => {
        this.payrollPeriodsPage = 1;
        this.loadPayrollPeriods();
      });
    }
    const periodPageSize = document.getElementById('payroll-periods-page-size-select');
    if (periodPageSize) {
      periodPageSize.addEventListener('change', () => {
        this.payrollPeriodsPageSize = Number(periodPageSize.value) || 5;
        this.payrollPeriodsPage = 1;
        this.loadPayrollPeriods();
      });
    }

    // --- Setup de Novedades y Liquidación ---
    this.setupNoveltyPersistentHandlers();
    this.setupNoveltyNoPersistentHandlers();
    this.setupSettlementHandlers();
    this.setupBatchSheetHandlers();
    this.setupExcelImportHandlers();
    this.setupSimulatePayslipHandlers();

    // --- Slips Handlers ---
    const slipsPeriodSelect = document.getElementById('slips-period-select');
    if (slipsPeriodSelect) {
      slipsPeriodSelect.addEventListener('change', () => {
        this.activePayrollPeriodId = slipsPeriodSelect.value;
        this.payrollSlipsPage = 1;
        this.loadPayrollSlips(slipsPeriodSelect.value);
      });
    }
    const slipsDeptFilter = document.getElementById('slips-department-filter');
    if (slipsDeptFilter) {
      slipsDeptFilter.addEventListener('change', () => {
        this.payrollSlipsPage = 1;
        this.loadPayrollSlips(slipsPeriodSelect?.value);
      });
    }
    const slipsSearch = document.getElementById('slips-search-input');
    if (slipsSearch) {
      slipsSearch.addEventListener('input', () => {
        this.payrollSlipsPage = 1;
        this.loadPayrollSlips(slipsPeriodSelect?.value);
      });
    }
    const slipsPageSize = document.getElementById('slips-page-size-select');
    if (slipsPageSize) {
      slipsPageSize.addEventListener('change', () => {
        this.payrollSlipsPageSize = Number(slipsPageSize.value) || 5;
        this.payrollSlipsPage = 1;
        this.loadPayrollSlips(slipsPeriodSelect?.value);
      });
    }
    const btnBatchPrint = document.getElementById('btn-export-slips-batch');
    if (btnBatchPrint) {
      btnBatchPrint.addEventListener('click', () => window.print());
    }

    // --- Print Modal Button ---
    const btnPrintPayslip = document.getElementById('btn-print-payslip');
    if (btnPrintPayslip) {
      btnPrintPayslip.addEventListener('click', () => window.print());
    }

    // --- LSD Handlers ---
    const btnValidateLsd = document.getElementById('btn-validate-lsd');
    if (btnValidateLsd) {
      btnValidateLsd.addEventListener('click', () => this.auditLsdConsistency());
    }
    const btnDownloadLsdConcepts = document.getElementById('btn-download-lsd-concepts');
    if (btnDownloadLsdConcepts) {
      btnDownloadLsdConcepts.addEventListener('click', () => this.downloadLsdConceptsFile());
    }
    const btnDownloadLsdPayroll = document.getElementById('btn-download-lsd-payroll');
    if (btnDownloadLsdPayroll) {
      btnDownloadLsdPayroll.addEventListener('click', () => this.downloadLsdPayrollFile());
    }

    // --- Concepts Handlers ---
    const btnNewConcept = document.getElementById('btn-open-new-concept-modal');
    if (btnNewConcept) {
      btnNewConcept.addEventListener('click', () => this.openNewConceptModal());
    }
    const conceptsSearch = document.getElementById('concepts-search-input');
    if (conceptsSearch) {
      conceptsSearch.addEventListener('input', () => {
        this.payrollConceptsPage = 1;
        this.loadPayrollConcepts();
      });
    }
    const conceptsTypeFilter = document.getElementById('concepts-type-filter');
    if (conceptsTypeFilter) {
      conceptsTypeFilter.addEventListener('change', () => {
        this.payrollConceptsPage = 1;
        this.loadPayrollConcepts();
      });
    }

    const conceptsPeriodTypeFilter = document.getElementById('concepts-period-type-filter');
    if (conceptsPeriodTypeFilter) {
      conceptsPeriodTypeFilter.addEventListener('change', () => {
        this.payrollConceptsPage = 1;
        this.loadPayrollConcepts();
      });
    }
    const conceptsPersistentFilter = document.getElementById('concepts-persistent-filter');
    if (conceptsPersistentFilter) {
      conceptsPersistentFilter.addEventListener('change', () => {
        this.payrollConceptsPage = 1;
        this.loadPayrollConcepts();
      });
    }
    const conceptsPageSize = document.getElementById('concepts-page-size-select');
    if (conceptsPageSize) {
      conceptsPageSize.addEventListener('change', () => {
        this.payrollConceptsPageSize = Number(conceptsPageSize.value) || 5;
        this.payrollConceptsPage = 1;
        this.loadPayrollConcepts();
      });
    }

    const calcTypeSelect = document.getElementById('concept-input-calc-type');
    if (calcTypeSelect) {
      calcTypeSelect.addEventListener('change', () => {
        const val = calcTypeSelect.value;
        const formulaBox = document.getElementById('concept-formula-box');
        const matrixBox = document.getElementById('concept-matrix-box');
        if (val === 'FORMULA') {
          formulaBox?.classList.remove('d-none');
          matrixBox?.classList.add('d-none');
        } else if (val === 'MATRIX') {
          formulaBox?.classList.add('d-none');
          matrixBox?.classList.remove('d-none');
        } else {
          formulaBox?.classList.add('d-none');
          matrixBox?.classList.add('d-none');
        }
      });
    }

    // Inicializar diseñador visual de fórmulas con ComboBox y validación en vivo
    this.setupFormulaDesigner();

    const formConcept = document.getElementById('form-payroll-concept');
    if (formConcept) {
      formConcept.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.savePayrollConcept();
      });
    }

    const conceptMatrixSelect = document.getElementById('concept-select-matrix');
    if (conceptMatrixSelect) {
      conceptMatrixSelect.addEventListener('change', () => {
        this.updateConceptMatrixInfoBanner();
      });
    }

    const btnQuickCreateMatrix = document.getElementById('btn-quick-create-matrix');
    if (btnQuickCreateMatrix) {
      btnQuickCreateMatrix.addEventListener('click', () => {
        this.openNewMatrixModal();
      });
    }

    // --- Matrices View & Modal Handlers ---
    const btnNewMatrix = document.getElementById('btn-open-new-matrix-modal');
    if (btnNewMatrix) {
      btnNewMatrix.addEventListener('click', () => this.openNewMatrixModal());
    }

    const matricesSearch = document.getElementById('matrices-search-input');
    if (matricesSearch) {
      matricesSearch.addEventListener('input', () => {
        this.payrollMatricesPage = 1;
        this.loadPayrollMatrices();
      });
    }

    const matricesTypeFilter = document.getElementById('matrices-type-filter');
    if (matricesTypeFilter) {
      matricesTypeFilter.addEventListener('change', () => {
        this.payrollMatricesPage = 1;
        this.loadPayrollMatrices();
      });
    }

    const matricesPageSize = document.getElementById('matrices-page-size-select');
    if (matricesPageSize) {
      matricesPageSize.addEventListener('change', () => {
        this.payrollMatricesPageSize = Number(matricesPageSize.value) || 5;
        this.payrollMatricesPage = 1;
        this.loadPayrollMatrices();
      });
    }

    const btnMatrixAddRow = document.getElementById('btn-matrix-add-row');
    if (btnMatrixAddRow) {
      btnMatrixAddRow.addEventListener('click', () => this.addMatrixFormRow());
    }

    const matrixMatchTypeSelect = document.getElementById('matrix-input-match-type');
    if (matrixMatchTypeSelect) {
      matrixMatchTypeSelect.addEventListener('change', () => {
        this.syncMatrixFormRowsFromDOM();
        this.renderMatrixFormRows();
      });
    }

    const matrixReturnTypeSelect = document.getElementById('matrix-input-return-type');
    if (matrixReturnTypeSelect) {
      matrixReturnTypeSelect.addEventListener('change', () => {
        this.syncMatrixFormRowsFromDOM();
        this.renderMatrixFormRows();
      });
    }

    const btnInsertMatrixFormula = document.getElementById('btn-insert-matrix-formula');
    if (btnInsertMatrixFormula) {
      btnInsertMatrixFormula.addEventListener('click', () => {
        const select = document.getElementById('formula-select-matrix');
        const val = select?.value;
        if (!val) return;
        const formulaInput = document.getElementById('concept-input-formula');
        if (formulaInput) {
          const token = `[MATRIZ:${val}]`;
          const start = formulaInput.selectionStart || formulaInput.value.length;
          const end = formulaInput.selectionEnd || formulaInput.value.length;
          const text = formulaInput.value;
          formulaInput.value = text.substring(0, start) + token + text.substring(end);
          formulaInput.focus();
          const newPos = start + token.length;
          formulaInput.setSelectionRange(newPos, newPos);
        }
      });
    }

    const formMatrix = document.getElementById('form-payroll-matrix');
    if (formMatrix) {
      formMatrix.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.savePayrollMatrix();
      });
    }

    // --- Valores Globales Fijos View & Modal Handlers ---
    const btnNewFixedValue = document.getElementById('btn-open-new-fixed-value-modal');
    if (btnNewFixedValue) {
      btnNewFixedValue.addEventListener('click', () => this.openNewFixedValueModal());
    }

    const fixedValuesSearch = document.getElementById('fixed-values-search-input');
    if (fixedValuesSearch) {
      fixedValuesSearch.addEventListener('input', () => {
        this.payrollFixedValuesPage = 1;
        this.loadPayrollFixedValues();
      });
    }

    const fixedValuesStatusFilter = document.getElementById('fixed-values-status-filter');
    if (fixedValuesStatusFilter) {
      fixedValuesStatusFilter.addEventListener('change', () => {
        this.payrollFixedValuesPage = 1;
        this.loadPayrollFixedValues();
      });
    }

    const fixedValuesPageSize = document.getElementById('fixed-values-page-size-select');
    if (fixedValuesPageSize) {
      fixedValuesPageSize.addEventListener('change', () => {
        this.payrollFixedValuesPageSize = Number(fixedValuesPageSize.value) || 5;
        this.payrollFixedValuesPage = 1;
        this.loadPayrollFixedValues();
      });
    }

    const fixedValueCodeInput = document.getElementById('fixed-value-input-code');
    if (fixedValueCodeInput) {
      fixedValueCodeInput.addEventListener('input', () => {
        fixedValueCodeInput.value = fixedValueCodeInput.value.toUpperCase().replace(/\s+/g, '_');
      });
    }

    const fixedValueUnitSelect = document.getElementById('fixed-value-input-unit');
    if (fixedValueUnitSelect) {
      fixedValueUnitSelect.addEventListener('change', () => {
        const addon = document.getElementById('fixed-value-unit-addon');
        if (addon) addon.textContent = fixedValueUnitSelect.value;
      });
    }

    const formFixedValue = document.getElementById('form-payroll-fixed-value');
    if (formFixedValue) {
      formFixedValue.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.saveFixedValue();
      });
    }

    const btnInsertFixedValueToken = document.getElementById('btn-insert-fixed-value-formula');
    if (btnInsertFixedValueToken) {
      btnInsertFixedValueToken.addEventListener('click', () => {
        const sel = document.getElementById('formula-select-fixed-value');
        if (!sel || !sel.value) return;
        const inputFormula = document.getElementById('concept-input-formula');
        if (!inputFormula) return;
        const token = `[VALOR:${sel.value}]`;
        const start = inputFormula.selectionStart || inputFormula.value.length;
        const end = inputFormula.selectionEnd || inputFormula.value.length;
        inputFormula.value = inputFormula.value.substring(0, start) + token + inputFormula.value.substring(end);
        inputFormula.focus();
        inputFormula.dispatchEvent(new Event('input'));
      });
    }

    // --- Settings Form ---
    const formSettings = document.getElementById('form-payroll-settings');
    if (formSettings) {
      formSettings.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.savePayrollSettings();
      });
    }

    // --- Aumentos Generalizados y Asignación Masiva ---
    document.getElementById('btn-open-mass-wage-increase')?.addEventListener('click', () => {
      this.openMassWageIncreaseModal();
    });

    document.getElementById('btn-open-mass-assign-concept')?.addEventListener('click', () => {
      this.openMassAssignConceptModal();
    });

    const massIncreaseTypeSelect = document.getElementById('mass-increase-type');
    if (massIncreaseTypeSelect) {
      massIncreaseTypeSelect.addEventListener('change', () => {
        const isPct = massIncreaseTypeSelect.value === 'PERCENTAGE';
        const symbol = document.getElementById('mass-increase-symbol');
        const addon = document.getElementById('mass-increase-unit-addon');
        if (symbol) symbol.textContent = isPct ? '(%)' : '($)';
        if (addon) addon.textContent = isPct ? '%' : '$';
      });
    }

    document.getElementById('btn-preview-mass-increase')?.addEventListener('click', () => {
      this.previewMassWageIncrease();
    });

    document.getElementById('btn-apply-mass-increase')?.addEventListener('click', () => {
      this.applyMassWageIncrease();
    });

    document.getElementById('form-mass-assign-concept')?.addEventListener('submit', (e) => {
      this.submitMassAssignConcept(e);
    });

    // --- Nóminas (Sueldos Básicos) y Actualización Masiva de Escalas ---
    document.getElementById('btn-open-new-scale-modal')?.addEventListener('click', () => {
      this.openNewSalaryScaleModal();
    });

    document.getElementById('form-salary-scale')?.addEventListener('submit', (e) => {
      this.saveSalaryScale(e);
    });

    document.getElementById('payroll-scale-search')?.addEventListener('input', () => {
      this.payrollSalaryScalesPage = 1;
      this.renderPayrollSalaryScalesTable();
    });

    document.getElementById('payroll-scales-page-size-select')?.addEventListener('change', (e) => {
      this.payrollSalaryScalesPageSize = parseInt(e.target.value, 10) || 5;
      this.payrollSalaryScalesPage = 1;
      this.renderPayrollSalaryScalesTable();
    });

    document.getElementById('btn-open-mass-scale-increase')?.addEventListener('click', () => {
      this.openMassScaleIncreaseModal();
    });

    const massScaleIncreaseTypeSelect = document.getElementById('mass-scale-increase-type');
    if (massScaleIncreaseTypeSelect) {
      massScaleIncreaseTypeSelect.addEventListener('change', () => {
        const isPct = massScaleIncreaseTypeSelect.value === 'PERCENTAGE';
        const label = document.getElementById('mass-scale-increase-value-label');
        const symbol = document.getElementById('mass-scale-increase-symbol');
        const input = document.getElementById('mass-scale-increase-value');
        if (label) label.textContent = isPct ? 'Porcentaje a Aplicar (%)' : 'Monto Adicional Fijo ($)';
        if (symbol) symbol.textContent = isPct ? '%' : '$';
        if (input) input.placeholder = isPct ? 'Ej. 12.5' : 'Ej. 50000.00';
      });
    }

    document.getElementById('btn-preview-mass-scale-increase')?.addEventListener('click', () => {
      this.previewMassScaleIncrease();
    });

    document.getElementById('form-mass-scale-increase')?.addEventListener('submit', (e) => {
      this.applyMassScaleIncrease(e);
    });
  }

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
    const alertBox = document.getElementById('scale-form-alert');
    const submitBtn = document.getElementById('btn-save-salary-scale');

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

      const payload = { name, code, amount, description, isInternOnly };
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

  renderPayrollPeriodsTable(periods) {
    const tbody = document.getElementById('payroll-periods-table-body');
    if (!tbody) return;

    if (periods.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-4 text-muted">
            <i class="ti ti-calendar-off fs-1 d-block mb-2 text-secondary"></i>
            No se registraron liquidaciones aún. Hacé click en "Nueva Liquidación" para comenzar.
          </td>
        </tr>
      `;
      return;
    }

    const typeLabels = {
      MONTHLY: 'Mensual',
      QUINCE_1: '1ra Quincena',
      QUINCE_2: '2da Quincena',
      SAC_1: '1er SAC',
      SAC_2: '2do SAC',
      VACATIONS: 'Vacaciones',
      FINAL: 'Final',
    };

    const statusBadges = {
      DRAFT: '<span class="badge bg-secondary-lt"><i class="ti ti-pencil me-1"></i> Borrador</span>',
      CALCULATED: '<span class="badge bg-azure-lt"><i class="ti ti-calculator me-1"></i> Calculada</span>',
      CLOSED: '<span class="badge bg-success"><i class="ti ti-lock me-1"></i> Cerrada</span>',
    };

    tbody.innerHTML = periods
      .map((p) => {
        const monthStr = String(p.month).padStart(2, '0');
        const count = p.paySlipsCount !== undefined ? p.paySlipsCount : p._count?.paySlips || 0;
        const gross = Number(p.totalGross || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
        const net = Number(p.totalNet || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
        const isClosed = p.status === 'CLOSED';

        return `
          <tr>
            <td><strong class="font-monospace">${monthStr}/${p.year}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(p.settlementName || 'Liquidación')}</div>
              <small class="text-muted">Liq. #${p.settlementNumber || 1}</small>
            </td>
            <td><span class="badge bg-blue-lt">${typeLabels[p.periodType] || p.periodType}</span></td>
            <td class="text-center"><span class="badge bg-purple-lt">${count}</span></td>
            <td class="text-end font-monospace">$${gross}</td>
            <td class="text-end font-monospace fw-bold text-success">$${net}</td>
            <td class="text-center">${statusBadges[p.status] || p.status}</td>
            <td class="text-end">
              <div class="btn-group btn-group-sm">
                <button type="button" class="btn btn-outline-primary btn-calc-period" data-id="${p.id}" title="Cargar novedades y calcular">
                  <i class="ti ti-calculator"></i>
                </button>
                <button type="button" class="btn btn-outline-success btn-view-period-slips" data-id="${p.id}" title="Ver recibos generados">
                  <i class="ti ti-receipt-2"></i>
                </button>
                <button type="button" class="btn btn-outline-purple btn-export-period-lsd" data-id="${p.id}" title="Exportar Libro Digital ARCA">
                  <i class="ti ti-file-certificate"></i>
                </button>
                ${
                  !isClosed
                    ? `
                  <button type="button" class="btn btn-outline-secondary btn-close-period" data-id="${p.id}" data-name="${escapeHtml(p.settlementName)}" title="Cerrar liquidación">
                    <i class="ti ti-lock"></i>
                  </button>
                  <button type="button" class="btn btn-outline-danger btn-del-period" data-id="${p.id}" data-name="${escapeHtml(p.settlementName)}" title="Eliminar liquidación">
                    <i class="ti ti-trash"></i>
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

    // Listeners
    tbody.querySelectorAll('.btn-calc-period').forEach((btn) => {
      btn.addEventListener('click', () => {
        const periodId = btn.dataset.id;
        this.activePayrollPeriodId = periodId;
        this.syncPayrollPeriodSelectors(periodId);
        document.getElementById('side-payroll-settlement')?.click();
        const select = document.getElementById('settlement-period-select');
        if (select) {
          select.value = periodId;
          this.loadSettlementView();
        }
      });
    });

    tbody.querySelectorAll('.btn-view-period-slips').forEach((btn) => {
      btn.addEventListener('click', () => {
        const periodId = btn.dataset.id;
        this.activePayrollPeriodId = periodId;
        this.syncPayrollPeriodSelectors(periodId);
        document.getElementById('side-payroll-slips')?.click();
        const select = document.getElementById('slips-period-select');
        if (select) {
          select.value = periodId;
          this.loadPayrollSlips(periodId);
        }
      });
    });

    tbody.querySelectorAll('.btn-export-period-lsd').forEach((btn) => {
      btn.addEventListener('click', () => {
        const periodId = btn.dataset.id;
        document.getElementById('side-payroll-lsd')?.click();
        const select = document.getElementById('lsd-period-select');
        if (select) {
          select.value = periodId;
          this.auditLsdConsistency();
        }
      });
    });

    tbody.querySelectorAll('.btn-close-period').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.confirmClosePeriod(btn.dataset.id, btn.dataset.name);
      });
    });

    tbody.querySelectorAll('.btn-del-period').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.confirmDeletePeriod(btn.dataset.id, btn.dataset.name);
      });
    });
  }

  renderPayrollPeriodsPagination(meta) {
    const list = document.getElementById('payroll-periods-pagination-list');
    const info = document.getElementById('payroll-periods-pagination-info');
    if (!list) return;

    if (info) {
      info.textContent = `Mostrando ${this.payrollPeriods.length} de ${meta.total} liquidaciones`;
    }

    const { page, totalPages } = meta;
    this.renderPaginationControls(list, page, totalPages, (newPage) => {
      this.payrollPeriodsPage = newPage;
      this.loadPayrollPeriods();
    });
  }

  syncPayrollPeriodSelectors(preferredPeriodId = null) {
    if (preferredPeriodId) {
      this.activePayrollPeriodId = preferredPeriodId;
    }
    const selectors = [
      'nov-nopers-emp-period-select',
      'nov-nopers-con-period-select',
      'settlement-period-select',
      'slips-period-select',
      'lsd-period-select',
      'novedades-period-select',
    ];
    selectors.forEach((selId) => {
      const el = document.getElementById(selId);
      if (!el) return;
      if (this.payrollPeriods.length === 0) {
        updateSearchableSelect(el, '<option value="">No hay liquidaciones registradas</option>', '');
        return;
      }
      const targetVal = this.activePayrollPeriodId || el.value || (this.payrollPeriods.length > 0 ? this.payrollPeriods[0].id : '');
      const optsHtml = this.payrollPeriods
        .map(
          (p) => `<option value="${p.id}" ${p.id === targetVal ? 'selected' : ''}>${String(p.month).padStart(2, '0')}/${p.year} - ${escapeHtml(p.settlementName)} (${p.status})</option>`
        )
        .join('');
      updateSearchableSelect(el, optsHtml, targetVal);
    });
  }

  openNewPeriodModal() {
    const form = document.getElementById('form-payroll-period');
    form?.reset();
    document.getElementById('payroll-period-form-id').value = '';
    document.getElementById('modal-payroll-period-title').textContent = 'Nueva Liquidación de Sueldos';
    document.getElementById('payroll-period-form-alert')?.classList.add('d-none');

    const now = new Date();
    document.getElementById('period-input-year').value = now.getFullYear();
    document.getElementById('period-input-month').value = now.getMonth() + 1;
    document.getElementById('period-input-type').value = 'MONTHLY';
    document.getElementById('period-input-payment-place').value = 'Casa Central';

    // Sugerir fecha de pago: 4to día hábil del mes siguiente
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 5);
    document.getElementById('period-input-payment-date').value = nextMonth.toISOString().split('T')[0];

    getBootstrapModal(document.getElementById('modal-payroll-period-form'))?.show();
  }

  async savePayrollPeriod() {
    const submitBtn = document.getElementById('btn-save-payroll-period');
    const alertBox = document.getElementById('payroll-period-form-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const payload = {
      year: Number(document.getElementById('period-input-year').value),
      month: Number(document.getElementById('period-input-month').value),
      periodType: document.getElementById('period-input-type').value,
      settlementName: document.getElementById('period-input-name').value.trim() || undefined,
      paymentDate: document.getElementById('period-input-payment-date').value || null,
      paymentPlace: document.getElementById('period-input-payment-place').value.trim() || null,
      depositDate: document.getElementById('period-input-deposit-date').value || null,
      depositBank: document.getElementById('period-input-deposit-bank').value.trim() || null,
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Creando...';

    try {
      const res = await apiRequest('/payroll/periods', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const newPeriodId = res?.data?.id || res?.id;
      if (newPeriodId) {
        this.activePayrollPeriodId = newPeriodId;
      }

      showToast('Liquidación creada exitosamente');
      getBootstrapModal(document.getElementById('modal-payroll-period-form'))?.hide();
      await this.loadPayrollPeriods();
      this.syncPayrollPeriodSelectors(this.activePayrollPeriodId);
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al crear la liquidación';
        alertBox.classList.remove('d-none');
      }
      showToast(err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="ti ti-check me-1"></i> Crear Liquidación';
    }
  }

  confirmClosePeriod(id, name) {
    this.confirmDeleteAction({
      title: 'Cerrar Liquidación',
      message: `¿Estás seguro de que deseas cerrar la liquidación <strong>"${escapeHtml(name)}"</strong>?<br><span class="text-muted small">Una vez cerrada quedará bloqueada contra modificaciones.</span>`,
      confirmText: 'Cerrar Período',
      onConfirm: async () => {
        await apiRequest(`/payroll/periods/${id}/close`, { method: 'POST' });
        showToast('Liquidación cerrada correctamente');
        await this.loadPayrollPeriods();
      },
    });
  }

  confirmDeletePeriod(id, name) {
    this.confirmDeleteAction({
      title: 'Eliminar Liquidación',
      message: `¿Estás seguro de que deseas eliminar la liquidación <strong>"${escapeHtml(name)}"</strong> y todos sus recibos asociados?`,
      onConfirm: async () => {
        await apiRequest(`/payroll/periods/${id}`, { method: 'DELETE' });
        showToast('Liquidación eliminada correctamente');
        await this.loadPayrollPeriods();
      },
    });
  }

  // --- Carga de Novedades Interactiva ---

  // =========================================================================
  // SISTEMA DE NOVEDADES (PERSISTENTES Y NO PERSISTENTES) Y LIQUIDACIÓN
  // =========================================================================

  async fetchActiveEmployees() {
    if (this._cachedActiveEmployees && this._cachedActiveEmployeesTime && (Date.now() - this._cachedActiveEmployeesTime < 20000)) {
      return this._cachedActiveEmployees;
    }
    const empRes = await apiRequest('/employees?status=ACTIVE&limit=5000');
    let emps = empRes.data || [];
    if (empRes.meta && empRes.meta.totalPages > 1) {
      for (let p = 2; p <= empRes.meta.totalPages; p++) {
        const nextRes = await apiRequest(`/employees?status=ACTIVE&limit=5000&page=${p}`);
        if (nextRes.data) emps.push(...nextRes.data);
      }
    }
    this._cachedActiveEmployees = emps;
    this._cachedActiveEmployeesTime = Date.now();
    return emps;
  }

  async fetchIndividualConcepts(isPersistent = null) {
    let url = '/payroll/concepts?scope=INDIVIDUAL&limit=500';
    if (isPersistent !== null && isPersistent !== undefined) {
      url += `&isPersistent=${isPersistent}`;
    }
    const res = await apiRequest(url);
    return res.data || [];
  }

  isPeriodClosed(periodId) {
    const period = this.payrollPeriods.find((p) => p.id === periodId);
    return period && period.status === 'CLOSED';
  }

  // -------------------------------------------------------------------------
  // 1. NOVEDADES PERSISTENTES - CONCEPTOS POR EMPLEADO (#pane-nov-pers-emp)
  // -------------------------------------------------------------------------

  async loadNovPersEmp() {
    const spinner = document.getElementById('nov-pers-emp-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      const employees = await this.fetchActiveEmployees();
      const select = document.getElementById('nov-pers-emp-select');
      if (select) {
        const currentVal = select.value;
        const optsHtml = '<option value="">Seleccione un colaborador...</option>' +
          employees.map((e) => `<option value="${e.id}" ${e.id === currentVal ? 'selected' : ''}>${escapeHtml(e.fileNumber)} - ${escapeHtml(e.lastName)}, ${escapeHtml(e.firstName)} (${formatCuit(e.cuil)})</option>`).join('');

        updateSearchableSelect(select, optsHtml, currentVal);

        if (currentVal) {
          await this.onNovPersEmpSelected(currentVal);
        } else {
          this.clearNovPersEmpView();
        }
      }
    } catch (err) {
      showToast(err.message || 'Error al cargar personal para novedades persistentes', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  clearNovPersEmpView() {
    document.getElementById('nov-pers-emp-card')?.classList.add('d-none');
    const addBtn = document.getElementById('btn-nov-pers-emp-add');
    if (addBtn) addBtn.disabled = true;
    const tbody = document.getElementById('nov-pers-emp-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Seleccione un colaborador para visualizar sus conceptos persistentes.</td></tr>';
    }
    const countBadge = document.getElementById('nov-pers-emp-count');
    if (countBadge) countBadge.textContent = '0 conceptos';
  }

  async onNovPersEmpSelected(employeeId) {
    if (!employeeId) {
      this.clearNovPersEmpView();
      return;
    }

    const employees = await this.fetchActiveEmployees();
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;

    this.novPersEmpSelectedEmp = emp;

    // Actualizar ficha rápida
    document.getElementById('nov-pers-emp-name').textContent = `${emp.lastName}, ${emp.firstName}`;
    document.getElementById('nov-pers-emp-file').textContent = emp.fileNumber;
    document.getElementById('nov-pers-emp-cuil').textContent = formatCuit(emp.cuil);
    document.getElementById('nov-pers-emp-dept').textContent = emp.department?.name || 'Sin Sector';
    const basicVal = Number(emp.baseSalary) || 0;
    document.getElementById('nov-pers-emp-basic').textContent = basicVal > 0 ? `$${formatNumber(basicVal)}` : 'Según CCT';
    document.getElementById('nov-pers-emp-card')?.classList.remove('d-none');

    const addBtn = document.getElementById('btn-nov-pers-emp-add');
    if (addBtn) addBtn.disabled = false;

    // Cargar conceptos persistentes del empleado
    const spinner = document.getElementById('nov-pers-emp-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      const res = await apiRequest(`/employees/${employeeId}/concepts`);
      const assigned = res.data || [];
      this.novPersEmpList = assigned;
      this.renderNovPersEmpTable(assigned);
    } catch (err) {
      showToast(err.message || 'Error al cargar conceptos del colaborador', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  renderNovPersEmpTable(assignedList) {
    const tbody = document.getElementById('nov-pers-emp-table-body');
    const countBadge = document.getElementById('nov-pers-emp-count');
    if (countBadge) countBadge.textContent = `${assignedList.length} concepto(s)`;
    if (!tbody) return;

    if (assignedList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Este colaborador no tiene conceptos persistentes individuales asignados.</td></tr>';
      return;
    }

    tbody.innerHTML = assignedList
      .map((item) => {
        const c = item.concept || {};
        const isGeneral = c.scope === 'GENERAL';

        const typeBadge = c.type === 'REMUNERATIVE'
          ? '<span class="badge bg-blue-lt">Remun.</span>'
          : c.type === 'NON_REMUNERATIVE'
          ? '<span class="badge bg-azure-lt">No Remun.</span>'
          : '<span class="badge bg-red-lt">Retención</span>';

        const scopeBadge = isGeneral
          ? '<span class="badge bg-secondary-lt fw-bold" title="Concepto general de liquidación"><i class="ti ti-world me-1"></i>General</span>'
          : '<span class="badge bg-teal-lt fw-bold" title="Asignación individual particular"><i class="ti ti-user-check me-1"></i>Individual</span>';

        const formattedVal = formatNoveltyValue(c, item);
        const notesHtml = item.notes
          ? `<div class="text-muted text-truncate mt-1" style="font-size: 0.75rem; max-width: 320px;" title="${escapeHtml(item.notes)}"><i class="ti ti-notes me-1"></i>${escapeHtml(item.notes)}</div>`
          : '';

        const actionButtons = isGeneral
          ? `
            <button type="button" class="btn btn-sm btn-icon btn-ghost-secondary" disabled title="Concepto general: modifíquelo en la sección Conceptos">
              <i class="ti ti-lock"></i>
            </button>
            <button type="button" class="btn btn-sm btn-icon btn-ghost-secondary" disabled title="Concepto general: modifíquelo en la sección Conceptos">
              <i class="ti ti-lock"></i>
            </button>
          `
          : `
            <button type="button" class="btn btn-sm btn-icon btn-ghost-primary btn-edit-nov-pers-emp" data-id="${item.id}" title="Modificar asignación">
              <i class="ti ti-edit"></i>
            </button>
            <button type="button" class="btn btn-sm btn-icon btn-ghost-danger btn-del-nov-pers-emp" data-id="${item.id}" data-name="${escapeHtml(c.name || '')}" title="Eliminar asignación">
              <i class="ti ti-trash"></i>
            </button>
          `;

        return `
          <tr data-assignment-id="${item.id}" class="${isGeneral ? 'bg-light-subtle' : ''}">
            <td><strong class="font-monospace text-indigo">${escapeHtml(c.code || '-')}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(c.name || '-')}</div>
              <div class="text-muted small">${item.isActive ? '<span class="text-success">● Activo</span>' : '<span class="text-danger">○ Inactivo</span>'}</div>
              ${notesHtml}
            </td>
            <td>${typeBadge}</td>
            <td class="text-center">${scopeBadge}</td>
            <td class="text-end">${formattedVal}</td>
            <td class="text-end text-nowrap">${actionButtons}</td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-nov-pers-emp').forEach((btn) => {
      btn.addEventListener('click', () => {
        const asgId = btn.dataset.id;
        const asg = this.novPersEmpList.find((a) => a.id === asgId);
        if (asg) this.openPersistentConceptModal({ assignment: asg, employee: this.novPersEmpSelectedEmp });
      });
    });

    tbody.querySelectorAll('.btn-del-nov-pers-emp').forEach((btn) => {
      btn.addEventListener('click', () => {
        const asgId = btn.dataset.id;
        const name = btn.dataset.name;
        this.confirmDeleteAction({
          title: 'Eliminar Concepto Persistente',
          message: `¿Estás seguro de que deseas desasignar el concepto <strong>"${escapeHtml(name)}"</strong> de este colaborador?`,
          onConfirm: async () => {
            await apiRequest(`/employees/${this.novPersEmpSelectedEmp.id}/concepts/${asgId}`, { method: 'DELETE' });
            showToast('Concepto desasignado correctamente');
            await this.onNovPersEmpSelected(this.novPersEmpSelectedEmp.id);
          },
        });
      });
    });
  }

  // -------------------------------------------------------------------------
  // 2. NOVEDADES PERSISTENTES - EMPLEADOS POR CONCEPTO (#pane-nov-pers-con)
  // -------------------------------------------------------------------------

  async loadNovPersCon() {
    const spinner = document.getElementById('nov-pers-con-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      const concepts = await this.fetchIndividualConcepts(true);
      const select = document.getElementById('nov-pers-con-select');
      if (select) {
        const currentVal = select.value;
        const optsHtml = '<option value="">Seleccione un concepto...</option>' +
          concepts.map((c) => `<option value="${c.id}" ${c.id === currentVal ? 'selected' : ''}>[${escapeHtml(c.code)}] ${escapeHtml(c.name)} (${c.type})</option>`).join('');

        updateSearchableSelect(select, optsHtml, currentVal);

        if (currentVal) {
          await this.onNovPersConSelected(currentVal);
        } else {
          this.clearNovPersConView();
        }
      }
    } catch (err) {
      showToast(err.message || 'Error al cargar conceptos persistentes', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  clearNovPersConView() {
    document.getElementById('nov-pers-con-card')?.classList.add('d-none');
    const addBtn = document.getElementById('btn-nov-pers-con-add');
    if (addBtn) addBtn.disabled = true;
    const tbody = document.getElementById('nov-pers-con-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Seleccione un concepto persistente para listar los colaboradores asignados.</td></tr>';
    }
    const countBadge = document.getElementById('nov-pers-con-count');
    if (countBadge) countBadge.textContent = '0 colaboradores';
  }

  async onNovPersConSelected(conceptId) {
    if (!conceptId) {
      this.clearNovPersConView();
      return;
    }

    const concepts = await this.fetchIndividualConcepts(true);
    const concept = concepts.find((c) => c.id === conceptId);
    if (!concept) return;

    this.novPersConSelectedConcept = concept;

    // Actualizar card
    document.getElementById('nov-pers-con-title').textContent = `[${concept.code}] ${concept.name}`;
    document.getElementById('nov-pers-con-type').textContent = concept.type;
    document.getElementById('nov-pers-con-datatype').textContent = concept.noveltyDataType || 'UNITS';
    document.getElementById('nov-pers-con-calctype').textContent = concept.calculationType;
    document.getElementById('nov-pers-con-formula').textContent = concept.formula || 'Sin fórmula (valor directo)';
    document.getElementById('nov-pers-con-card')?.classList.remove('d-none');

    const addBtn = document.getElementById('btn-nov-pers-con-add');
    if (addBtn) addBtn.disabled = false;

    // Cargar empleados asignados a este concepto
    const spinner = document.getElementById('nov-pers-con-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      const res = await apiRequest(`/employees/by-concept/${conceptId}`);
      const list = res.data || [];
      this.novPersConList = list;
      this.renderNovPersConTable(list);
    } catch (err) {
      showToast(err.message || 'Error al listar empleados con este concepto', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  renderNovPersConTable(assignments) {
    const tbody = document.getElementById('nov-pers-con-table-body');
    const countBadge = document.getElementById('nov-pers-con-count');
    if (countBadge) countBadge.textContent = `${assignments.length} colaborador(es)`;
    if (!tbody) return;

    if (assignments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Ningún colaborador tiene asignado este concepto persistente actualmente.</td></tr>';
      return;
    }

    const c = this.novPersConSelectedConcept || {};

    tbody.innerHTML = assignments
      .map((asg) => {
        const emp = asg.employee || {};
        const formattedVal = formatNoveltyValue(c, asg);
        const notesHtml = asg.notes
          ? `<div class="text-muted text-truncate mt-1" style="font-size: 0.75rem; max-width: 320px;" title="${escapeHtml(asg.notes)}"><i class="ti ti-notes me-1"></i>${escapeHtml(asg.notes)}</div>`
          : '';

        return `
          <tr data-assignment-id="${asg.id}">
            <td><strong class="font-monospace text-primary">${escapeHtml(emp.fileNumber || '-')}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(emp.lastName || '-')}, ${escapeHtml(emp.firstName || '-')}</div>
              <div class="text-muted small">${asg.isActive ? '<span class="text-success">● Activo</span>' : '<span class="text-danger">○ Inactivo</span>'}</div>
              ${notesHtml}
            </td>
            <td>${formatCuit(emp.cuil || '')}</td>
            <td>${escapeHtml(emp.department?.name || '-')}</td>
            <td class="text-end">${formattedVal}</td>
            <td class="text-end text-nowrap">
              <button type="button" class="btn btn-sm btn-icon btn-ghost-primary btn-edit-nov-pers-con" data-id="${asg.id}" title="Modificar asignación">
                <i class="ti ti-edit"></i>
              </button>
              <button type="button" class="btn btn-sm btn-icon btn-ghost-danger btn-del-nov-pers-con" data-id="${asg.id}" data-name="${escapeHtml(emp.lastName || '')}, ${escapeHtml(emp.firstName || '')}" title="Eliminar asignación">
                <i class="ti ti-trash"></i>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-nov-pers-con').forEach((btn) => {
      btn.addEventListener('click', () => {
        const asgId = btn.dataset.id;
        const asg = this.novPersConList.find((a) => a.id === asgId);
        if (asg) this.openPersistentConceptModal({ assignment: asg, concept: this.novPersConSelectedConcept });
      });
    });

    tbody.querySelectorAll('.btn-del-nov-pers-con').forEach((btn) => {
      btn.addEventListener('click', () => {
        const asgId = btn.dataset.id;
        const name = btn.dataset.name;
        this.confirmDeleteAction({
          title: 'Eliminar Asignación',
          message: `¿Estás seguro de que deseas desasignar este concepto a <strong>"${escapeHtml(name)}"</strong>?`,
          onConfirm: async () => {
            await apiRequest(`/employees/by-concept/${this.novPersConSelectedConcept.id}/${asgId}`, { method: 'DELETE' });
            showToast('Asignación eliminada correctamente');
            await this.onNovPersConSelected(this.novPersConSelectedConcept.id);
          },
        });
      });
    });
  }

  // -------------------------------------------------------------------------
  // MODAL: ASIGNACIÓN DE CONCEPTO PERSISTENTE (COMPARTIDO)
  // -------------------------------------------------------------------------

  async openPersistentConceptModal({ assignment = null, employee = null, concept = null } = {}) {
    const form = document.getElementById('form-assign-persistent-concept');
    if (form) form.reset();
    document.getElementById('pers-concept-alert')?.classList.add('d-none');
    document.getElementById('pers-concept-assign-id').value = assignment?.id || '';

    // Manejo de Colaborador
    const empSelect = document.getElementById('pers-concept-employee-select');
    const empStatic = document.getElementById('pers-concept-employee-static');
    const targetEmp = employee || assignment?.employee;

    if (targetEmp) {
      hideSelect(empSelect);
      empSelect.required = false;
      empStatic.classList.remove('d-none');
      empStatic.textContent = `${targetEmp.fileNumber} - ${targetEmp.lastName}, ${targetEmp.firstName} (${formatCuit(targetEmp.cuil)})`;
      empStatic.dataset.empId = targetEmp.id;
    } else {
      empStatic.classList.add('d-none');
      showSelect(empSelect);
      empSelect.required = true;
      const emps = await this.fetchActiveEmployees();
      const empOpts = '<option value="">Seleccione un colaborador...</option>' +
        emps.map((e) => `<option value="${e.id}">${escapeHtml(e.fileNumber)} - ${escapeHtml(e.lastName)}, ${escapeHtml(e.firstName)}</option>`).join('');
      updateSearchableSelect(empSelect, empOpts, '');
    }

    // Manejo de Concepto
    const conSelect = document.getElementById('pers-concept-select');
    const conStatic = document.getElementById('pers-concept-static');
    const targetCon = concept || assignment?.concept;

    const persistentConcepts = await this.fetchIndividualConcepts(true);

    if (targetCon) {
      hideSelect(conSelect);
      conSelect.required = false;
      conStatic.classList.remove('d-none');
      conStatic.textContent = `[${targetCon.code}] ${targetCon.name}`;
      conStatic.dataset.conceptId = targetCon.id;
      this.updatePersistentConceptModalHint(targetCon);
      renderDynamicNoveltyControl('pers-concept-dynamic-container', targetCon, assignment || {});
    } else {
      conStatic.classList.add('d-none');
      showSelect(conSelect);
      conSelect.required = true;
      const conOpts = '<option value="">Seleccione un concepto persistente...</option>' +
        persistentConcepts.map((c) => `<option value="${c.id}">[${escapeHtml(c.code)}] ${escapeHtml(c.name)} (${c.type})</option>`).join('');
      updateSearchableSelect(conSelect, conOpts, '');
      document.getElementById('pers-concept-hint')?.classList.add('d-none');
      renderDynamicNoveltyControl('pers-concept-dynamic-container', null, assignment || {});
    }

    // Valores
    if (assignment) {
      document.getElementById('modal-pers-concept-title').textContent = 'Modificar Concepto Persistente';
      document.getElementById('pers-concept-valid-from').value = assignment.validFrom ? assignment.validFrom.split('T')[0] : '';
      document.getElementById('pers-concept-valid-to').value = assignment.validTo ? assignment.validTo.split('T')[0] : '';
      document.getElementById('pers-concept-notes').value = assignment.notes || '';
      document.getElementById('pers-concept-is-active').checked = assignment.isActive !== false;
    } else {
      document.getElementById('modal-pers-concept-title').textContent = 'Asignar Concepto Persistente';
      document.getElementById('pers-concept-valid-from').value = '';
      document.getElementById('pers-concept-valid-to').value = '';
      document.getElementById('pers-concept-notes').value = '';
      document.getElementById('pers-concept-is-active').checked = true;
    }

    getBootstrapModal(document.getElementById('modal-assign-persistent-concept'))?.show();
  }

  updatePersistentConceptModalHint(concept) {
    const hint = document.getElementById('pers-concept-hint');
    if (!hint || !concept) return;

    hint.classList.remove('d-none');
    document.getElementById('pers-concept-hint-code').textContent = `[${concept.code}] ${concept.name}`;
    document.getElementById('pers-concept-hint-type').textContent = concept.type;
    document.getElementById('pers-concept-hint-datatype').textContent = `Tipo de Entrada: ${concept.noveltyDataType || 'UNITS'} | Cálculo: ${concept.calculationType}`;

    renderDynamicNoveltyControl('pers-concept-dynamic-container', concept, {});
  }

  // -------------------------------------------------------------------------
  // 3. NOVEDADES NO PERSISTENTES - CONCEPTOS POR EMPLEADO (#pane-nov-nopers-emp)
  // -------------------------------------------------------------------------

  async loadNovNoPersEmp() {
    const periodSelect = document.getElementById('nov-nopers-emp-period-select');
    const periodId = periodSelect?.value;
    const isClosed = this.isPeriodClosed(periodId);

    const roAlert = document.getElementById('nov-nopers-emp-readonly-alert');
    if (roAlert) roAlert.classList.toggle('d-none', !isClosed);

    const empSelect = document.getElementById('nov-nopers-emp-select');
    const employees = await this.fetchActiveEmployees();
    if (empSelect) {
      const currentEmp = empSelect.value;
      const empOpts = '<option value="">Seleccione un colaborador...</option>' +
        employees.map((e) => `<option value="${e.id}" ${e.id === currentEmp ? 'selected' : ''}>${escapeHtml(e.fileNumber)} - ${escapeHtml(e.lastName)}, ${escapeHtml(e.firstName)}</option>`).join('');

      updateSearchableSelect(empSelect, empOpts, currentEmp);

      if (currentEmp && periodId) {
        await this.refreshNovNoPersEmpTable(periodId, currentEmp);
      } else {
        this.clearNovNoPersEmpView();
      }
    }
  }

  clearNovNoPersEmpView() {
    const addBtn = document.getElementById('btn-nov-nopers-emp-add');
    const simBtn = document.getElementById('btn-nov-nopers-emp-simulate');
    if (addBtn) addBtn.disabled = true;
    if (simBtn) simBtn.disabled = true;
    const tbody = document.getElementById('nov-nopers-emp-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">Seleccione una liquidación activa y un colaborador para gestionar sus novedades.</td></tr>';
    }
    const countBadge = document.getElementById('nov-nopers-emp-count');
    if (countBadge) countBadge.textContent = '0 novedades';
  }

  async refreshNovNoPersEmpTable(periodId, employeeId) {
    if (!periodId || !employeeId) {
      this.clearNovNoPersEmpView();
      return;
    }

    const isClosed = this.isPeriodClosed(periodId);
    const addBtn = document.getElementById('btn-nov-nopers-emp-add');
    const simBtn = document.getElementById('btn-nov-nopers-emp-simulate');
    if (addBtn) addBtn.disabled = isClosed;
    if (simBtn) simBtn.disabled = false;

    const spinner = document.getElementById('nov-nopers-emp-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      const res = await apiRequest(`/payroll/periods/${periodId}/novelties?employeeId=${employeeId}`);
      const novelties = res.data || [];
      this.novNoPersEmpList = novelties;
      this.renderNovNoPersEmpTable(novelties, isClosed);
    } catch (err) {
      showToast(err.message || 'Error al cargar novedades del período', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  renderNovNoPersEmpTable(novelties, isClosed) {
    const tbody = document.getElementById('nov-nopers-emp-table-body');
    const countBadge = document.getElementById('nov-nopers-emp-count');
    if (countBadge) countBadge.textContent = `${novelties.length} novedad(es)`;
    if (!tbody) return;

    if (novelties.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No se registraron novedades para este colaborador en el período.</td></tr>';
      return;
    }

    tbody.innerHTML = novelties
      .map((nov) => {
        const c = nov.concept || {};
        const typeBadge = c.type === 'REMUNERATIVE'
          ? '<span class="badge bg-blue-lt">Remun.</span>'
          : c.type === 'NON_REMUNERATIVE'
          ? '<span class="badge bg-azure-lt">No Remun.</span>'
          : '<span class="badge bg-red-lt">Retención</span>';

        const formattedVal = formatNoveltyValue(c, nov);
        const notesHtml = nov.notes
          ? `<div class="text-muted text-truncate mt-1" style="font-size: 0.75rem; max-width: 320px;" title="${escapeHtml(nov.notes)}"><i class="ti ti-notes me-1"></i>${escapeHtml(nov.notes)}</div>`
          : '';

        return `
          <tr data-novelty-id="${nov.id}">
            <td><strong class="font-monospace text-azure">${escapeHtml(c.code || '-')}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(c.name || '-')}</div>
              ${notesHtml}
            </td>
            <td>${typeBadge}</td>
            <td class="text-end">${formattedVal}</td>
            <td class="text-end text-nowrap">
              <button type="button" class="btn btn-sm btn-icon btn-ghost-primary btn-edit-period-nov" data-id="${nov.id}" ${isClosed ? 'disabled' : ''} title="Editar">
                <i class="ti ti-edit"></i>
              </button>
              <button type="button" class="btn btn-sm btn-icon btn-ghost-danger btn-del-period-nov" data-id="${nov.id}" data-name="${escapeHtml(c.name || '')}" ${isClosed ? 'disabled' : ''} title="Eliminar">
                <i class="ti ti-trash"></i>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-period-nov').forEach((btn) => {
      btn.addEventListener('click', () => {
        const novId = btn.dataset.id;
        const nov = this.novNoPersEmpList.find((n) => n.id === novId);
        if (nov) this.openPeriodNoveltyModal({ novelty: nov });
      });
    });

    tbody.querySelectorAll('.btn-del-period-nov').forEach((btn) => {
      btn.addEventListener('click', () => {
        const novId = btn.dataset.id;
        const name = btn.dataset.name;
        const periodId = document.getElementById('nov-nopers-emp-period-select')?.value;
        const empId = document.getElementById('nov-nopers-emp-select')?.value;
        this.confirmDeleteAction({
          title: 'Eliminar Novedad del Período',
          message: `¿Estás seguro de que deseas eliminar la novedad <strong>"${escapeHtml(name)}"</strong>?`,
          onConfirm: async () => {
            await apiRequest(`/payroll/periods/${periodId}/novelties/${novId}`, { method: 'DELETE' });
            showToast('Novedad eliminada correctamente');
            await this.refreshNovNoPersEmpTable(periodId, empId);
          },
        });
      });
    });
  }

  // -------------------------------------------------------------------------
  // 4. NOVEDADES NO PERSISTENTES - EMPLEADOS POR CONCEPTO (#pane-nov-nopers-con)
  // -------------------------------------------------------------------------

  async loadNovNoPersCon() {
    const periodSelect = document.getElementById('nov-nopers-con-period-select');
    const periodId = periodSelect?.value;
    const isClosed = this.isPeriodClosed(periodId);

    const roAlert = document.getElementById('nov-nopers-con-readonly-alert');
    if (roAlert) roAlert.classList.toggle('d-none', !isClosed);

    const conSelect = document.getElementById('nov-nopers-con-select');
    const concepts = await this.fetchIndividualConcepts(false);
    if (conSelect) {
      const currentCon = conSelect.value;
      const optsHtml = '<option value="">Seleccione un concepto...</option>' +
        concepts.map((c) => `<option value="${c.id}" ${c.id === currentCon ? 'selected' : ''}>[${escapeHtml(c.code)}] ${escapeHtml(c.name)} (${c.type})</option>`).join('');

      updateSearchableSelect(conSelect, optsHtml, currentCon);

      if (currentCon && periodId) {
        await this.refreshNovNoPersConTable(periodId, currentCon);
      } else {
        this.clearNovNoPersConView();
      }
    }
  }

  clearNovNoPersConView() {
    const addBtn = document.getElementById('btn-nov-nopers-con-add');
    const batchBtn = document.getElementById('btn-nov-nopers-con-batch-sheet');
    const importBtn = document.getElementById('btn-nov-nopers-con-import-excel');
    if (addBtn) addBtn.disabled = true;
    if (batchBtn) batchBtn.disabled = true;
    if (importBtn) importBtn.disabled = true;

    const tbody = document.getElementById('nov-nopers-con-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Seleccione una liquidación y un concepto no persistente para visualizar las novedades cargadas.</td></tr>';
    }
    const countBadge = document.getElementById('nov-nopers-con-count');
    if (countBadge) countBadge.textContent = '0 colaboradores';
  }

  async refreshNovNoPersConTable(periodId, conceptId) {
    if (!periodId || !conceptId) {
      this.clearNovNoPersConView();
      return;
    }

    const isClosed = this.isPeriodClosed(periodId);
    const addBtn = document.getElementById('btn-nov-nopers-con-add');
    const batchBtn = document.getElementById('btn-nov-nopers-con-batch-sheet');
    const importBtn = document.getElementById('btn-nov-nopers-con-import-excel');
    if (addBtn) addBtn.disabled = isClosed;
    if (batchBtn) batchBtn.disabled = isClosed;
    if (importBtn) importBtn.disabled = isClosed;

    const spinner = document.getElementById('nov-nopers-con-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      if (!this.novNoPersConSelectedConcept || this.novNoPersConSelectedConcept.id !== conceptId) {
        const concepts = await this.fetchIndividualConcepts(false);
        this.novNoPersConSelectedConcept = concepts.find((c) => c.id === conceptId) || null;
      }

      const res = await apiRequest(`/payroll/periods/${periodId}/novelties?conceptId=${conceptId}`);
      const novelties = res.data || [];
      this.novNoPersConList = novelties;
      this.renderNovNoPersConTable(novelties, isClosed);
    } catch (err) {
      showToast(err.message || 'Error al cargar novedades del concepto en el período', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  renderNovNoPersConTable(novelties, isClosed) {
    const tbody = document.getElementById('nov-nopers-con-table-body');
    const countBadge = document.getElementById('nov-nopers-con-count');
    if (countBadge) countBadge.textContent = `${novelties.length} colaborador(es)`;
    if (!tbody) return;

    if (novelties.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No se registran novedades para este concepto en el período seleccionado.</td></tr>';
      return;
    }

    const c = this.novNoPersConSelectedConcept || (novelties[0] ? novelties[0].concept : {});

    tbody.innerHTML = novelties
      .map((nov) => {
        const emp = nov.employee || {};
        const formattedVal = formatNoveltyValue(c, nov);
        const notesHtml = nov.notes
          ? `<div class="text-muted text-truncate mt-1" style="font-size: 0.75rem; max-width: 320px;" title="${escapeHtml(nov.notes)}"><i class="ti ti-notes me-1"></i>${escapeHtml(nov.notes)}</div>`
          : '';

        return `
          <tr data-novelty-id="${nov.id}">
            <td><strong class="font-monospace text-primary">${escapeHtml(emp.fileNumber || '-')}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(emp.lastName || '-')}, ${escapeHtml(emp.firstName || '-')}</div>
              ${notesHtml}
            </td>
            <td>${formatCuit(emp.cuil || '')}</td>
            <td>${escapeHtml(emp.department?.name || '-')}</td>
            <td class="text-end">${formattedVal}</td>
            <td class="text-end text-nowrap">
              <button type="button" class="btn btn-sm btn-icon btn-ghost-primary btn-edit-period-con-nov" data-id="${nov.id}" ${isClosed ? 'disabled' : ''} title="Editar">
                <i class="ti ti-edit"></i>
              </button>
              <button type="button" class="btn btn-sm btn-icon btn-ghost-danger btn-del-period-con-nov" data-id="${nov.id}" data-name="${escapeHtml(emp.lastName || '')}, ${escapeHtml(emp.firstName || '')}" ${isClosed ? 'disabled' : ''} title="Eliminar">
                <i class="ti ti-trash"></i>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-period-con-nov').forEach((btn) => {
      btn.addEventListener('click', () => {
        const novId = btn.dataset.id;
        const nov = this.novNoPersConList.find((n) => n.id === novId);
        if (nov) this.openPeriodNoveltyModal({ novelty: nov });
      });
    });

    tbody.querySelectorAll('.btn-del-period-con-nov').forEach((btn) => {
      btn.addEventListener('click', () => {
        const novId = btn.dataset.id;
        const name = btn.dataset.name;
        const periodId = document.getElementById('nov-nopers-con-period-select')?.value;
        const conceptId = document.getElementById('nov-nopers-con-select')?.value;
        this.confirmDeleteAction({
          title: 'Eliminar Novedad del Período',
          message: `¿Estás seguro de que deseas eliminar la novedad cargada para <strong>"${escapeHtml(name)}"</strong>?`,
          onConfirm: async () => {
            await apiRequest(`/payroll/periods/${periodId}/novelties/${novId}`, { method: 'DELETE' });
            showToast('Novedad eliminada correctamente');
            await this.refreshNovNoPersConTable(periodId, conceptId);
          },
        });
      });
    });
  }

  // -------------------------------------------------------------------------
  // MODAL: CARGA / EDICIÓN DE NOVEDAD NO PERSISTENTE (COMPARTIDO)
  // -------------------------------------------------------------------------

  async openPeriodNoveltyModal({ novelty = null, employeeId = null, conceptId = null, periodId = null } = {}) {
    const form = document.getElementById('form-period-novelty');
    if (form) form.reset();
    document.getElementById('period-novelty-alert')?.classList.add('d-none');

    const effectivePeriodId = periodId || novelty?.payrollPeriodId || this.activePayrollPeriodId || document.getElementById('nov-nopers-emp-period-select')?.value || document.getElementById('nov-nopers-con-period-select')?.value;
    document.getElementById('period-novelty-id').value = novelty?.id || '';
    document.getElementById('period-novelty-period-id').value = effectivePeriodId || '';

    const periodObj = (this.payrollPeriods || []).find((p) => p.id === effectivePeriodId);
    const periodName = periodObj ? `${periodObj.settlementName} (${String(periodObj.month).padStart(2, '0')}/${periodObj.year})` : '';
    const subtitleEl = document.getElementById('modal-period-novelty-subtitle');
    if (subtitleEl) {
      subtitleEl.innerHTML = periodName
        ? `<span class="badge bg-blue-lt text-blue me-1"><i class="ti ti-calendar me-1"></i>${escapeHtml(periodName)}</span> <span class="text-muted">Novedad individual no persistente</span>`
        : 'Novedad individual no persistente';
    }

    // Manejo de Colaborador
    const empSelect = document.getElementById('period-novelty-employee-select');
    const empStatic = document.getElementById('period-novelty-employee-static');
    const targetEmpId = employeeId || novelty?.employeeId || document.getElementById('nov-nopers-emp-select')?.value;
    const employees = await this.fetchActiveEmployees();

    if (targetEmpId) {
      const emp = employees.find((e) => e.id === targetEmpId);
      hideSelect(empSelect);
      empSelect.required = false;
      empStatic.classList.remove('d-none');
      empStatic.textContent = emp ? `${emp.fileNumber} - ${emp.lastName}, ${emp.firstName}` : targetEmpId;
      empStatic.dataset.empId = targetEmpId;
    } else {
      empStatic.classList.add('d-none');
      showSelect(empSelect);
      empSelect.required = true;
      const empOpts = '<option value="">Seleccione un colaborador...</option>' +
        employees.map((e) => `<option value="${e.id}">${escapeHtml(e.fileNumber)} - ${escapeHtml(e.lastName)}, ${escapeHtml(e.firstName)}</option>`).join('');
      updateSearchableSelect(empSelect, empOpts, '');
    }

    // Manejo de Concepto
    const conSelect = document.getElementById('period-novelty-concept-select');
    const conStatic = document.getElementById('period-novelty-concept-static');
    const targetConId = conceptId || novelty?.conceptId || document.getElementById('nov-nopers-con-select')?.value;
    const nonPersConcepts = await this.fetchIndividualConcepts(false);

    if (targetConId) {
      const con = nonPersConcepts.find((c) => c.id === targetConId) || novelty?.concept;
      hideSelect(conSelect);
      conSelect.required = false;
      conStatic.classList.remove('d-none');
      conStatic.textContent = con ? `[${con.code}] ${con.name}` : targetConId;
      conStatic.dataset.conceptId = targetConId;
      this.updatePeriodNoveltyModalHint(con);
      renderDynamicNoveltyControl('period-novelty-dynamic-container', con, novelty || {});
    } else {
      conStatic.classList.add('d-none');
      showSelect(conSelect);
      conSelect.required = true;
      const conOpts = '<option value="">Seleccione un concepto no persistente...</option>' +
        nonPersConcepts.map((c) => `<option value="${c.id}">[${escapeHtml(c.code)}] ${escapeHtml(c.name)} (${c.type})</option>`).join('');
      updateSearchableSelect(conSelect, conOpts, '');
      document.getElementById('period-novelty-concept-hint')?.classList.add('d-none');
      renderDynamicNoveltyControl('period-novelty-dynamic-container', null, novelty || {});
    }

    // Valores
    if (novelty) {
      document.getElementById('modal-period-novelty-title').textContent = 'Editar Novedad del Período';
      document.getElementById('period-novelty-notes').value = novelty.notes || '';
    } else {
      document.getElementById('modal-period-novelty-title').textContent = 'Cargar Novedad del Período';
      document.getElementById('period-novelty-notes').value = '';
    }

    getBootstrapModal(document.getElementById('modal-period-novelty-form'))?.show();
  }

  updatePeriodNoveltyModalHint(concept) {
    const hint = document.getElementById('period-novelty-concept-hint');
    if (!hint || !concept) return;

    hint.classList.remove('d-none');
    document.getElementById('period-novelty-hint-code').textContent = `[${concept.code}] ${concept.name}`;
    document.getElementById('period-novelty-hint-type').textContent = concept.type;
    document.getElementById('period-novelty-hint-datatype').textContent = `Tipo de Entrada: ${concept.noveltyDataType || 'UNITS'} | Cálculo: ${concept.calculationType}`;

    renderDynamicNoveltyControl('period-novelty-dynamic-container', concept, {});
  }

  // -------------------------------------------------------------------------
  // 5. PLANILLA ÁGIL DE CARGA RÁPIDA (#modal-novelty-batch-sheet)
  // -------------------------------------------------------------------------

  async openBatchSheetModal() {
    const periodId = document.getElementById('nov-nopers-con-period-select')?.value;
    const conceptId = document.getElementById('nov-nopers-con-select')?.value;
    if (!periodId || !conceptId) {
      showToast('Seleccione una liquidación y un concepto para abrir la planilla ágil', 'warning');
      return;
    }

    const concepts = await this.fetchIndividualConcepts(false);
    const concept = concepts.find((c) => c.id === conceptId);
    const period = this.payrollPeriods.find((p) => p.id === periodId);

    this.batchSheetConcept = concept;
    this.batchSheetPeriod = period;

    // Badges en cabecera
    document.getElementById('batch-sheet-period-badge').textContent = period ? `${String(period.month).padStart(2, '0')}/${period.year} - ${period.settlementName}` : '';
    document.getElementById('batch-sheet-concept-badge').textContent = concept ? `[${concept.code}] ${concept.name}` : '';

    // Encabezado de columna dinámico
    const valHeader = document.getElementById('batch-sheet-col-val-header');
    if (valHeader) {
      if (concept?.noveltyDataType === 'HOURS') valHeader.textContent = 'Horas';
      else if (concept?.noveltyDataType === 'PERCENTAGE') valHeader.textContent = '% Porc.';
      else if (concept?.noveltyDataType === 'AMOUNT') valHeader.textContent = 'Importe ($)';
      else valHeader.textContent = 'Valor / Cantidad';
    }

    const employees = await this.fetchActiveEmployees();
    this.batchSheetEmployees = employees;

    // Cargar novedades existentes para pre-llenar
    const res = await apiRequest(`/payroll/periods/${periodId}/novelties?conceptId=${conceptId}`);
    const existingNovelties = res.data || [];
    const novMap = new Map();
    existingNovelties.forEach((n) => novMap.set(n.employeeId, n));

    const tbody = document.getElementById('batch-sheet-tbody');
    if (!tbody) return;

    tbody.innerHTML = employees
      .map((emp, index) => {
        const existing = novMap.get(emp.id);
        const isAmt = concept?.noveltyDataType === 'AMOUNT';
        const initVal = existing ? (isAmt ? existing.amount : existing.units) : '';
        const initNotes = existing ? (existing.notes || '') : '';
        const isFilled = initVal !== '' && initVal !== null && initVal !== undefined;

        return `
          <tr data-emp-id="${emp.id}" data-row-index="${index}" class="batch-sheet-row">
            <td><strong class="font-monospace text-primary">${escapeHtml(emp.fileNumber)}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}</div>
            </td>
            <td>${formatCuit(emp.cuil)}</td>
            <td>${escapeHtml(emp.department?.name || '-')}</td>
            <td class="text-center">
              <input type="number" step="0.01" min="0" 
                class="form-control form-control-sm text-end font-monospace batch-sheet-val" 
                placeholder="0.00" 
                value="${initVal !== '' && initVal !== null ? initVal : ''}" 
                data-emp-id="${emp.id}" 
                data-index="${index}" />
            </td>
            <td>
              <input type="text" maxlength="255" 
                class="form-control form-control-sm batch-sheet-notes" 
                placeholder="Observaciones..." 
                value="${escapeHtml(initNotes)}" 
                data-emp-id="${emp.id}" 
                data-index="${index}" />
            </td>
            <td class="text-center batch-sheet-status-cell">
              ${isFilled ? '<span class="badge bg-success-lt">Cargado</span>' : '<span class="badge bg-secondary-lt">Pendiente</span>'}
            </td>
          </tr>
        `;
      })
      .join('');

    this.updateBatchSheetStats();

    // Navegación con teclado por Enter y Flechas
    tbody.querySelectorAll('.batch-sheet-val').forEach((input) => {
      input.addEventListener('keydown', (e) => {
        const idx = Number(input.dataset.index);
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
          e.preventDefault();
          const next = tbody.querySelector(`.batch-sheet-val[data-index="${idx + 1}"]`);
          if (next) {
            next.focus();
            next.select();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = tbody.querySelector(`.batch-sheet-val[data-index="${idx - 1}"]`);
          if (prev) {
            prev.focus();
            prev.select();
          }
        }
      });

      input.addEventListener('input', () => {
        const tr = input.closest('tr');
        const statusCell = tr?.querySelector('.batch-sheet-status-cell');
        const hasVal = input.value.trim() !== '';
        if (statusCell) {
          statusCell.innerHTML = hasVal ? '<span class="badge bg-success-lt">Cargado</span>' : '<span class="badge bg-secondary-lt">Pendiente</span>';
        }
        this.updateBatchSheetStats();
      });
    });

    getBootstrapModal(document.getElementById('modal-novelty-batch-sheet'))?.show();
  }

  updateBatchSheetStats() {
    const inputs = document.querySelectorAll('.batch-sheet-val');
    let filled = 0;
    inputs.forEach((inp) => {
      if (inp.value.trim() !== '' && Number(inp.value) > 0) filled++;
    });
    const statsEl = document.getElementById('batch-sheet-stats');
    if (statsEl) statsEl.textContent = `${filled} con valor cargado`;
  }

  async saveBatchSheet() {
    if (!this.batchSheetPeriod || !this.batchSheetConcept) return;

    const rows = document.querySelectorAll('#batch-sheet-tbody tr[data-emp-id]');
    const novelties = [];
    const isAmt = this.batchSheetConcept.noveltyDataType === 'AMOUNT' || this.batchSheetConcept.calculationType === 'FIXED_AMOUNT';

    rows.forEach((row) => {
      const empId = row.dataset.empId;
      const valInput = row.querySelector('.batch-sheet-val');
      const notesInput = row.querySelector('.batch-sheet-notes');

      const valStr = valInput?.value.trim();
      const notesStr = notesInput?.value.trim();

      if (valStr !== '' || notesStr !== '') {
        const numVal = Number(valStr) || 0;
        novelties.push({
          employeeId: empId,
          conceptId: this.batchSheetConcept.id,
          units: isAmt ? 1 : numVal,
          amount: isAmt ? numVal : null,
          notes: notesStr || null,
        });
      }
    });

    if (novelties.length === 0) {
      showToast('No se ingresaron novedades para guardar en la planilla', 'warning');
      return;
    }

    const saveBtn = document.getElementById('btn-save-batch-sheet');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
    }

    try {
      const res = await apiRequest(`/payroll/periods/${this.batchSheetPeriod.id}/novelties/batch`, {
        method: 'POST',
        body: JSON.stringify({ novelties }),
      });

      showToast(`¡Planilla guardada exitosamente! ${res.processedCount} novedades registradas`);
      getBootstrapModal(document.getElementById('modal-novelty-batch-sheet'))?.hide();
      await this.refreshNovNoPersConTable(this.batchSheetPeriod.id, this.batchSheetConcept.id);
    } catch (err) {
      showToast(err.message || 'Error al guardar lote de novedades', 'danger');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Lote de Novedades';
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. IMPORTADOR DE NOVEDADES DESDE EXCEL / CSV (#modal-novelties-import-excel)
  // -------------------------------------------------------------------------

  async openExcelImportModal() {
    const periodId = document.getElementById('nov-nopers-con-period-select')?.value;
    const conceptId = document.getElementById('nov-nopers-con-select')?.value;
    if (!periodId || !conceptId) {
      showToast('Seleccione una liquidación y un concepto para importar novedades', 'warning');
      return;
    }

    const concepts = await this.fetchIndividualConcepts(false);
    const concept = concepts.find((c) => c.id === conceptId);
    const period = this.payrollPeriods.find((p) => p.id === periodId);

    this.excelImportConcept = concept;
    this.excelImportPeriod = period;
    this.excelImportValidRows = [];

    document.getElementById('modal-import-excel-subtitle').textContent = `Período: ${period ? period.settlementName : ''} | Concepto: [${concept?.code}] ${concept?.name}`;
    document.getElementById('novelties-file-input').value = '';
    document.getElementById('novelties-import-alert')?.classList.add('d-none');
    document.getElementById('novelties-import-preview-section')?.classList.add('d-none');
    document.getElementById('btn-confirm-import-novelties').disabled = true;

    getBootstrapModal(document.getElementById('modal-novelties-import-excel'))?.show();
  }

  downloadNoveltyTemplateCsv() {
    if (!this.excelImportConcept) return;

    const employees = this.batchSheetEmployees || [];
    let csvContent = 'Legajo;CUIL;Valor;Observaciones\r\n';

    employees.forEach((e) => {
      csvContent += `"${e.fileNumber}";"${e.cuil}";0;""\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `plantilla_novedades_${this.excelImportConcept.code}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async handleNoveltiesFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const alertBox = document.getElementById('novelties-import-alert');
    if (alertBox) alertBox.classList.add('d-none');

    try {
      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!json || json.length === 0) {
        throw new Error('El archivo seleccionado no contiene filas de datos.');
      }

      await this.processImportedNoveltyRows(json);
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = `Error al procesar archivo: ${err.message}`;
        alertBox.classList.remove('d-none');
      }
    }
  }

  async processImportedNoveltyRows(rows) {
    const employees = await this.fetchActiveEmployees();
    const empByFile = new Map();
    const empByCuil = new Map();
    employees.forEach((e) => {
      if (e.fileNumber) empByFile.set(String(e.fileNumber).trim().toLowerCase(), e);
      if (e.cuil) {
        const cleanCuil = String(e.cuil).replace(/[^0-9]/g, '');
        empByCuil.set(cleanCuil, e);
      }
    });

    const validRows = [];
    let errorCount = 0;
    const previewTbody = document.getElementById('novelties-import-preview-body');
    if (!previewTbody) return;

    const previewHtml = rows
      .map((row) => {
        // Encontrar columnas dinámicas
        let legajoVal = '';
        let cuilVal = '';
        let numVal = 0;
        let notesVal = '';

        for (const [key, val] of Object.entries(row)) {
          const k = key.trim().toLowerCase();
          if (k.includes('legajo') || k === 'file') legajoVal = String(val).trim();
          else if (k.includes('cuil') || k.includes('cuit')) cuilVal = String(val).trim();
          else if (k.includes('valor') || k.includes('importe') || k.includes('horas') || k.includes('cant')) numVal = Number(val) || 0;
          else if (k.includes('obs') || k.includes('nota') || k.includes('aclar')) notesVal = String(val).trim();
        }

        // Emparejar empleado
        let matchedEmp = null;
        if (legajoVal && empByFile.has(legajoVal.toLowerCase())) {
          matchedEmp = empByFile.get(legajoVal.toLowerCase());
        } else if (cuilVal) {
          const clean = cuilVal.replace(/[^0-9]/g, '');
          if (empByCuil.has(clean)) matchedEmp = empByCuil.get(clean);
        }

        const isValid = matchedEmp && (numVal > 0 || notesVal !== '');
        if (isValid) {
          validRows.push({
            employeeId: matchedEmp.id,
            conceptId: this.excelImportConcept.id,
            units: this.excelImportConcept.noveltyDataType === 'AMOUNT' ? 1 : numVal,
            amount: this.excelImportConcept.noveltyDataType === 'AMOUNT' ? numVal : null,
            notes: notesVal || null,
          });
        } else {
          errorCount++;
        }

        const statusBadge = matchedEmp
          ? (isValid ? '<span class="badge bg-success-lt">Válido</span>' : '<span class="badge bg-warning-lt">Sin Valor</span>')
          : '<span class="badge bg-danger-lt">No Encontrado</span>';

        return `
          <tr>
            <td><strong>${escapeHtml(legajoVal || '-')}</strong></td>
            <td>${matchedEmp ? `${escapeHtml(matchedEmp.lastName)}, ${escapeHtml(matchedEmp.firstName)}` : '<em class="text-danger">Colaborador no existe</em>'}</td>
            <td class="text-end font-monospace">${formatNumber(numVal)}</td>
            <td><small class="text-muted">${escapeHtml(notesVal || '-')}</small></td>
            <td class="text-center">${statusBadge}</td>
          </tr>
        `;
      })
      .join('');

    previewTbody.innerHTML = previewHtml;
    this.excelImportValidRows = validRows;

    document.getElementById('import-preview-valid-count').textContent = `${validRows.length} válidos`;
    document.getElementById('import-preview-error-count').textContent = `${errorCount} con error o sin valor`;
    document.getElementById('novelties-import-preview-section')?.classList.remove('d-none');

    const confirmBtn = document.getElementById('btn-confirm-import-novelties');
    if (confirmBtn) confirmBtn.disabled = validRows.length === 0;
  }

  async confirmImportNovelties() {
    if (!this.excelImportPeriod || !this.excelImportConcept || this.excelImportValidRows.length === 0) return;

    const confirmBtn = document.getElementById('btn-confirm-import-novelties');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Importando...';
    }

    try {
      const res = await apiRequest(`/payroll/periods/${this.excelImportPeriod.id}/novelties/batch`, {
        method: 'POST',
        body: JSON.stringify({ novelties: this.excelImportValidRows }),
      });

      showToast(`¡Importación completada! Se registraron ${res.processedCount} novedades`);
      getBootstrapModal(document.getElementById('modal-novelties-import-excel'))?.hide();
      await this.refreshNovNoPersConTable(this.excelImportPeriod.id, this.excelImportConcept.id);
    } catch (err) {
      showToast(err.message || 'Error al importar archivo de novedades', 'danger');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="ti ti-upload me-1"></i> Importar Novedades al Período';
      }
    }
  }

  // -------------------------------------------------------------------------
  // 7. SIMULACIÓN DE RECIBO PROVISORIO EN VIVO (#modal-simulate-payslip)
  // -------------------------------------------------------------------------

  async openSimulatePayslipModal(employeeId, periodId) {
    if (!employeeId || !periodId) {
      showToast('Seleccione un colaborador y una liquidación para simular el recibo', 'warning');
      return;
    }

    const employees = await this.fetchActiveEmployees();
    const emp = employees.find((e) => e.id === employeeId);
    const period = this.payrollPeriods.find((p) => p.id === periodId);

    document.getElementById('sim-payslip-subtitle').textContent = `Colaborador: ${emp ? `${emp.lastName}, ${emp.firstName}` : ''} | Liquidación: ${period ? period.settlementName : ''}`;
    document.getElementById('sim-payslip-gross').textContent = '$0,00';
    document.getElementById('sim-payslip-non-rem').textContent = '$0,00';
    document.getElementById('sim-payslip-deductions').textContent = '$0,00';
    document.getElementById('sim-payslip-net').textContent = '$0,00';

    const tbody = document.getElementById('sim-payslip-tbody');
    if (tbody) tbody.innerHTML = '';

    const spinner = document.getElementById('sim-payslip-spinner');
    if (spinner) spinner.classList.remove('d-none');

    getBootstrapModal(document.getElementById('modal-simulate-payslip'))?.show();

    try {
      const res = await apiRequest(`/payroll/periods/${periodId}/calculate-single/${employeeId}`, {
        method: 'POST',
      });

      const slip = res.data.paySlip || {};
      document.getElementById('sim-payslip-gross').textContent = `$${formatNumber(slip.grossSalary || res.data.totalGross)}`;
      document.getElementById('sim-payslip-non-rem').textContent = `$${formatNumber(slip.nonRemunerativeSalary || 0)}`;
      document.getElementById('sim-payslip-deductions').textContent = `$${formatNumber(slip.deductionsTotal || res.data.totalDeductions)}`;
      document.getElementById('sim-payslip-net').textContent = `$${formatNumber(slip.netSalary || res.data.totalNet)}`;

      const items = slip.items || [];
      if (tbody) {
        tbody.innerHTML = items
          .map((item) => {
            const isRem = item.conceptType === 'REMUNERATIVE';
            const isNonRem = item.conceptType === 'NON_REMUNERATIVE';
            const isDed = item.conceptType === 'DEDUCTION';

            return `
              <tr>
                <td><strong class="font-monospace">${escapeHtml(item.conceptCode)}</strong></td>
                <td>${escapeHtml(item.conceptName)}</td>
                <td class="text-center font-monospace">${item.units ? formatNumber(item.units) : '-'}</td>
                <td class="text-end font-monospace">${isRem ? `$${formatNumber(item.amount)}` : '-'}</td>
                <td class="text-end font-monospace text-azure">${isNonRem ? `$${formatNumber(item.amount)}` : '-'}</td>
                <td class="text-end font-monospace text-danger">${isDed ? `$${formatNumber(item.amount)}` : '-'}</td>
              </tr>
            `;
          })
          .join('');
      }
    } catch (err) {
      showToast(err.message || 'Error al simular recibo', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  // -------------------------------------------------------------------------
  // 8. PROCESO DE LIQUIDACIÓN (#pane-payroll-settlement)
  // -------------------------------------------------------------------------

  async loadSettlementView() {
    const periodSelect = document.getElementById('settlement-period-select');
    const periodId = periodSelect?.value;
    if (!periodId) {
      this.clearSettlementView();
      return;
    }

    const isClosed = this.isPeriodClosed(periodId);
    const roAlert = document.getElementById('settlement-readonly-alert');
    if (roAlert) roAlert.classList.toggle('d-none', !isClosed);

    document.getElementById('btn-settlement-calc-single').disabled = isClosed;
    document.getElementById('btn-settlement-calc-batch').disabled = isClosed;
    document.getElementById('btn-settlement-calc-all').disabled = isClosed;

    // Asegurar que la sub-pestaña de liquidación individual esté activa y visible si ninguna está seleccionada
    const activeSubTab = document.querySelector('#pane-payroll-settlement .tab-content > .tab-pane.active');
    if (!activeSubTab) {
      document.querySelectorAll('#pane-payroll-settlement .nav-tabs .nav-link').forEach((l) => l.classList.remove('active'));
      document.querySelectorAll('#pane-payroll-settlement .tab-content > .tab-pane').forEach((p) => p.classList.remove('show', 'active'));
      document.querySelector('#pane-payroll-settlement a[href="#tab-settlement-single"]')?.classList.add('active');
      document.getElementById('tab-settlement-single')?.classList.add('show', 'active');
    } else if (!activeSubTab.classList.contains('show')) {
      activeSubTab.classList.add('show');
    }

    try {
      const [employees, slipsRes, deptsRes] = await Promise.all([
        this.fetchActiveEmployees(),
        apiRequest(`/payroll/periods/${periodId}/slips?limit=1000`),
        apiRequest('/departments?limit=500'),
      ]);

      this.settlementEmployees = employees;
      this.settlementSlips = slipsRes.data || [];
      const depts = deptsRes.data || [];

      // Actualizar Métricas Superiores
      const slipMap = new Map();
      let totalNet = 0;
      this.settlementSlips.forEach((s) => {
        slipMap.set(s.employeeId, s);
        totalNet += Number(s.netSalary) || 0;
      });

      const totalNomina = employees.length;
      let liquidatedCount = 0;
      employees.forEach((e) => {
        if (slipMap.has(e.id)) liquidatedCount++;
      });
      const pendingCount = Math.max(0, totalNomina - liquidatedCount);

      document.getElementById('settlement-stat-total').textContent = totalNomina;
      document.getElementById('settlement-stat-liquidated').textContent = liquidatedCount;
      document.getElementById('settlement-stat-pending').textContent = pendingCount;
      document.getElementById('settlement-stat-net').textContent = `$${formatNumber(totalNet)}`;

      // Pestaña 1: Selector Individual
      const singleSelect = document.getElementById('settlement-single-emp-select');
      if (singleSelect) {
        const curSingle = singleSelect.value;
        const singleOpts = '<option value="">Seleccionar colaborador...</option>' +
          employees.map((e) => `<option value="${e.id}" ${e.id === curSingle ? 'selected' : ''}>${escapeHtml(e.fileNumber)} - ${escapeHtml(e.lastName)}, ${escapeHtml(e.firstName)}</option>`).join('');

        updateSearchableSelect(singleSelect, singleOpts, curSingle);

        if (curSingle) {
          this.onSettlementSingleSelected(curSingle, slipMap.get(curSingle));
        } else {
          document.getElementById('settlement-single-emp-info')?.classList.add('d-none');
          document.getElementById('settlement-single-result')?.classList.add('d-none');
          document.getElementById('settlement-single-result-placeholder')?.classList.remove('d-none');
          document.getElementById('btn-settlement-calc-single').disabled = true;
        }
      }

      // Pestaña 2: Filtros y Tabla Lote
      const deptFilter = document.getElementById('settlement-batch-dept-filter');
      if (deptFilter) {
        const curDept = deptFilter.value;
        const deptOpts = '<option value="ALL">Todos los Sectores</option>' +
          depts.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
        updateSearchableSelect(deptFilter, deptOpts, curDept || 'ALL');
      }

      this.renderSettlementBatchTable(employees, slipMap);
    } catch (err) {
      showToast(err.message || 'Error al cargar módulo de liquidación', 'danger');
    }
  }

  clearSettlementView() {
    document.getElementById('settlement-stat-total').textContent = '0';
    document.getElementById('settlement-stat-liquidated').textContent = '0';
    document.getElementById('settlement-stat-pending').textContent = '0';
    document.getElementById('settlement-stat-net').textContent = '$0,00';
    document.getElementById('settlement-single-emp-info')?.classList.add('d-none');
    document.getElementById('settlement-single-result')?.classList.add('d-none');
    document.getElementById('settlement-single-result-placeholder')?.classList.remove('d-none');
    const tbody = document.getElementById('settlement-batch-table-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Seleccione una liquidación activa.</td></tr>';
  }

  onSettlementSingleSelected(employeeId, existingSlip = null) {
    const emp = this.settlementEmployees.find((e) => e.id === employeeId);
    if (!emp) return;

    document.getElementById('settlement-single-name').textContent = `${emp.lastName}, ${emp.firstName}`;
    document.getElementById('settlement-single-file').textContent = emp.fileNumber;
    document.getElementById('settlement-single-cuil').textContent = formatCuit(emp.cuil);
    document.getElementById('settlement-single-dept').textContent = emp.department?.name || 'Sin Sector';
    const basicVal = Number(emp.baseSalary) || 0;
    document.getElementById('settlement-single-basic').textContent = basicVal > 0 ? `$${formatNumber(basicVal)}` : 'Según CCT';
    document.getElementById('settlement-single-emp-info')?.classList.remove('d-none');

    const periodId = document.getElementById('settlement-period-select')?.value;
    const isClosed = this.isPeriodClosed(periodId);
    document.getElementById('btn-settlement-calc-single').disabled = isClosed;

    const slip = existingSlip || this.settlementSlips.find((s) => s.employeeId === employeeId);
    if (slip) {
      document.getElementById('settlement-single-result-placeholder')?.classList.add('d-none');
      document.getElementById('settlement-single-result')?.classList.remove('d-none');
      document.getElementById('res-single-rem').textContent = `$${formatNumber(slip.grossSalary)}`;
      document.getElementById('res-single-nonrem').textContent = `$${formatNumber(slip.nonRemunerativeSalary || 0)}`;
      document.getElementById('res-single-ded').textContent = `$${formatNumber(slip.deductionsTotal)}`;
      document.getElementById('res-single-net').textContent = `$${formatNumber(slip.netSalary)}`;
      document.getElementById('res-single-cost').textContent = `$${formatNumber(slip.totalLaborCost || 0)}`;

      const viewSlipBtn = document.getElementById('btn-settlement-single-view-slip');
      if (viewSlipBtn) {
        viewSlipBtn.onclick = () => this.openPayslipModal(slip.id);
      }
    } else {
      document.getElementById('settlement-single-result')?.classList.add('d-none');
      document.getElementById('settlement-single-result-placeholder')?.classList.remove('d-none');
      document.getElementById('settlement-single-result-placeholder').textContent = 'Colaborador pendiente de liquidar en este período. Presione el botón para liquidar.';
    }
  }

  async calculateSingleEmployee() {
    const periodId = document.getElementById('settlement-period-select')?.value;
    const empId = document.getElementById('settlement-single-emp-select')?.value;
    if (!periodId || !empId) {
      showToast('Seleccione un colaborador para liquidar', 'warning');
      return;
    }

    const btn = document.getElementById('btn-settlement-calc-single');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Calculando...';

    try {
      const res = await apiRequest(`/payroll/periods/${periodId}/calculate-single/${empId}`, {
        method: 'POST',
      });

      showToast(`¡Liquidación completada para el colaborador! Neto: $${formatNumber(res.data.totalNet)}`);
      await this.loadSettlementView();
      const singleSelect = document.getElementById('settlement-single-emp-select');
      if (singleSelect) singleSelect.value = empId;
      this.onSettlementSingleSelected(empId);
    } catch (err) {
      showToast(err.message || 'Error al liquidar colaborador', 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-calculator me-1"></i> Liquidar / Reliquidar Colaborador';
    }
  }

  renderSettlementBatchTable(employees, slipMap) {
    const tbody = document.getElementById('settlement-batch-table-body');
    if (!tbody) return;

    if (employees.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No hay colaboradores activos en la nómina.</td></tr>';
      return;
    }

    tbody.innerHTML = employees
      .map((emp) => {
        const slip = slipMap.get(emp.id);
        const isLiquidated = Boolean(slip);
        const netStr = isLiquidated ? `$${formatNumber(slip.netSalary)}` : '-';
        const deptId = emp.departmentId || '';

        return `
          <tr data-emp-id="${emp.id}" data-dept-id="${deptId}" data-status="${isLiquidated ? 'LIQUIDATED' : 'PENDING'}">
            <td class="text-center">
              <input type="checkbox" class="form-check-input settlement-batch-check" data-emp-id="${emp.id}" />
            </td>
            <td><strong class="font-monospace text-primary">${escapeHtml(emp.fileNumber)}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}</div>
            </td>
            <td>${formatCuit(emp.cuil)}</td>
            <td>${escapeHtml(emp.department?.name || 'Sin Sector')}</td>
            <td class="text-center">
              ${isLiquidated ? '<span class="badge bg-success-lt">Liquidado</span>' : '<span class="badge bg-warning-lt">Pendiente</span>'}
            </td>
            <td class="text-end font-monospace fw-bold">${netStr}</td>
          </tr>
        `;
      })
      .join('');

    this.updateSettlementBatchSelectedCount();

    // Checkbox listeners
    tbody.querySelectorAll('.settlement-batch-check').forEach((cb) => {
      cb.addEventListener('change', () => this.updateSettlementBatchSelectedCount());
    });
  }

  updateSettlementBatchSelectedCount() {
    const checked = document.querySelectorAll('.settlement-batch-check:checked');
    const countEl = document.getElementById('settlement-batch-selected-count');
    if (countEl) countEl.textContent = checked.length;

    const periodId = document.getElementById('settlement-period-select')?.value;
    const isClosed = this.isPeriodClosed(periodId);
    const calcBatchBtn = document.getElementById('btn-settlement-calc-batch');
    if (calcBatchBtn) calcBatchBtn.disabled = isClosed || checked.length === 0;
  }

  filterSettlementBatchTable() {
    const deptVal = document.getElementById('settlement-batch-dept-filter')?.value || 'ALL';
    const statusVal = document.getElementById('settlement-batch-status-filter')?.value || 'ALL';
    const searchVal = document.getElementById('settlement-batch-search')?.value.trim().toLowerCase() || '';

    const rows = document.querySelectorAll('#settlement-batch-table-body tr[data-emp-id]');
    rows.forEach((row) => {
      const rowDept = row.dataset.deptId;
      const rowStatus = row.dataset.status;
      const rowText = row.textContent.toLowerCase();

      const matchDept = deptVal === 'ALL' || rowDept === deptVal;
      const matchStatus = statusVal === 'ALL' || rowStatus === statusVal;
      const matchSearch = !searchVal || rowText.includes(searchVal);

      row.style.display = matchDept && matchStatus && matchSearch ? '' : 'none';
    });
  }

  async calculateBatchEmployees() {
    const periodId = document.getElementById('settlement-period-select')?.value;
    const checked = document.querySelectorAll('.settlement-batch-check:checked');
    const employeeIds = Array.from(checked).map((cb) => cb.dataset.empId);

    if (!periodId || employeeIds.length === 0) {
      showToast('Seleccione al menos un colaborador para liquidar en lote', 'warning');
      return;
    }

    const btn = document.getElementById('btn-settlement-calc-batch');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Liquidando lote...';

    try {
      const res = await apiRequest(`/payroll/periods/${periodId}/calculate-batch`, {
        method: 'POST',
        body: JSON.stringify({ employeeIds }),
      });

      showToast(`¡Liquidación en lote completada para ${res.data.processedEmployees} empleado(s)! Total Neto: $${formatNumber(res.data.totalNet)}`);
      await this.loadSettlementView();
    } catch (err) {
      showToast(err.message || 'Error al liquidar lote de empleados', 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-calculator me-1"></i> Liquidar Selección';
    }
  }

  async calculateAllEmployees() {
    const periodId = document.getElementById('settlement-period-select')?.value;
    if (!periodId) {
      showToast('Seleccione una liquidación para procesar', 'warning');
      return;
    }

    const period = this.payrollPeriods.find((p) => p.id === periodId);
    if (!confirm(`¿Iniciar Liquidación General de toda la nómina para "${period?.settlementName || ''}"? Este proceso calculará o actualizará los recibos de todos los empleados activos.`)) {
      return;
    }

    const btn = document.getElementById('btn-settlement-calc-all');
    const progressBar = document.getElementById('settlement-all-progress');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Procesando Nómina Completa...';
    progressBar?.classList.remove('d-none');

    try {
      const res = await apiRequest(`/payroll/periods/${periodId}/calculate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      showToast(`¡Liquidación general exitosa! ${res.data.processedEmployees} colaboradores procesados. Total Neto: $${formatNumber(res.data.totalNet)}`);
      await this.loadSettlementView();
      await this.loadPayrollPeriods();
    } catch (err) {
      showToast(err.message || 'Error al ejecutar liquidación general', 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-calculator me-2"></i> Iniciar Liquidación General';
      progressBar?.classList.add('d-none');
    }
  }

  // -------------------------------------------------------------------------
  // LISTENERS Y CONEXIÓN DE EVENTOS DE NOVEDADES & LIQUIDACIÓN
  // -------------------------------------------------------------------------

  setupNoveltyPersistentHandlers() {
    // 1. Conceptos por Empleado
    const empSelect = document.getElementById('nov-pers-emp-select');
    if (empSelect) {
      empSelect.addEventListener('change', () => this.onNovPersEmpSelected(empSelect.value));
    }
    const btnAddEmp = document.getElementById('btn-nov-pers-emp-add');
    if (btnAddEmp) {
      btnAddEmp.addEventListener('click', () => {
        if (this.novPersEmpSelectedEmp) {
          this.openPersistentConceptModal({ employee: this.novPersEmpSelectedEmp });
        }
      });
    }

    // 2. Empleados por Concepto
    const conSelect = document.getElementById('nov-pers-con-select');
    if (conSelect) {
      conSelect.addEventListener('change', () => this.onNovPersConSelected(conSelect.value));
    }
    const btnAddCon = document.getElementById('btn-nov-pers-con-add');
    if (btnAddCon) {
      btnAddCon.addEventListener('click', () => {
        if (this.novPersConSelectedConcept) {
          this.openPersistentConceptModal({ concept: this.novPersConSelectedConcept });
        }
      });
    }

    // Concept select change inside modal
    const modalConSelect = document.getElementById('pers-concept-select');
    if (modalConSelect) {
      modalConSelect.addEventListener('change', async () => {
        const concepts = await this.fetchIndividualConcepts(true);
        const c = concepts.find((x) => x.id === modalConSelect.value);
        if (c) {
          this.updatePersistentConceptModalHint(c);
        } else {
          document.getElementById('pers-concept-hint')?.classList.add('d-none');
          renderDynamicNoveltyControl('pers-concept-dynamic-container', null, {});
        }
      });
    }

    // Guardar asignación persistente
    const formPers = document.getElementById('form-assign-persistent-concept');
    if (formPers) {
      formPers.addEventListener('submit', async (e) => {
        e.preventDefault();
        const alertBox = document.getElementById('pers-concept-alert');
        if (alertBox) alertBox.classList.add('d-none');

        const empId = document.getElementById('pers-concept-employee-static').dataset.empId || document.getElementById('pers-concept-employee-select').value;
        const conId = document.getElementById('pers-concept-static').dataset.conceptId || document.getElementById('pers-concept-select').value;
        const validFrom = document.getElementById('pers-concept-valid-from').value || null;
        const validTo = document.getElementById('pers-concept-valid-to').value || null;
        const notes = document.getElementById('pers-concept-notes').value.trim() || null;
        const isActive = document.getElementById('pers-concept-is-active').checked;

        if (!empId || !conId) {
          if (alertBox) {
            alertBox.textContent = 'Debe seleccionar un colaborador y un concepto.';
            alertBox.classList.remove('d-none');
          }
          return;
        }

        const valResult = getDynamicNoveltyControlValue('pers-concept-dynamic-container');
        if (valResult.error) {
          if (alertBox) {
            alertBox.textContent = valResult.error;
            alertBox.classList.remove('d-none');
          }
          return;
        }

        const saveBtn = document.getElementById('btn-save-persistent-concept');
        if (saveBtn) saveBtn.disabled = true;

        try {
          await apiRequest(`/employees/${empId}/concepts`, {
            method: 'POST',
            body: JSON.stringify({
              conceptId: conId,
              units: valResult.inputType === 'AMOUNT' ? null : valResult.units,
              fixedAmount: valResult.inputType === 'AMOUNT' ? valResult.fixedAmount : null,
              validFrom,
              validTo,
              notes,
              isActive,
            }),
          });

          showToast('Concepto persistente asignado con éxito');
          getBootstrapModal(document.getElementById('modal-assign-persistent-concept'))?.hide();

          // Refrescar según pantalla activa
          if (document.getElementById('pane-nov-pers-emp')?.classList.contains('active')) {
            await this.onNovPersEmpSelected(empId);
          } else if (document.getElementById('pane-nov-pers-con')?.classList.contains('active')) {
            await this.onNovPersConSelected(conId);
          }
        } catch (err) {
          if (alertBox) {
            alertBox.textContent = err.message || 'Error al guardar asignación';
            alertBox.classList.remove('d-none');
          }
        } finally {
          if (saveBtn) saveBtn.disabled = false;
        }
      });
    }
  }

  setupNoveltyNoPersistentHandlers() {
    // 1. Conceptos por Empleado
    const perSelectEmp = document.getElementById('nov-nopers-emp-period-select');
    const empSelect = document.getElementById('nov-nopers-emp-select');
    if (perSelectEmp) {
      perSelectEmp.addEventListener('change', () => {
        this.activePayrollPeriodId = perSelectEmp.value;
        this.refreshNovNoPersEmpTable(perSelectEmp.value, empSelect?.value);
      });
    }
    if (empSelect) {
      empSelect.addEventListener('change', () => this.refreshNovNoPersEmpTable(perSelectEmp?.value, empSelect.value));
    }
    const btnAddEmp = document.getElementById('btn-nov-nopers-emp-add');
    if (btnAddEmp) {
      btnAddEmp.addEventListener('click', () => {
        this.openPeriodNoveltyModal({
          employeeId: empSelect?.value,
          periodId: perSelectEmp?.value || this.activePayrollPeriodId,
        });
      });
    }

    // 2. Empleados por Concepto
    const perSelectCon = document.getElementById('nov-nopers-con-period-select');
    const conSelect = document.getElementById('nov-nopers-con-select');
    if (perSelectCon) {
      perSelectCon.addEventListener('change', () => {
        this.activePayrollPeriodId = perSelectCon.value;
        this.refreshNovNoPersConTable(perSelectCon.value, conSelect?.value);
      });
    }
    if (conSelect) {
      conSelect.addEventListener('change', () => this.refreshNovNoPersConTable(perSelectCon?.value, conSelect.value));
    }
    const btnAddCon = document.getElementById('btn-nov-nopers-con-add');
    if (btnAddCon) {
      btnAddCon.addEventListener('click', () => {
        this.openPeriodNoveltyModal({
          conceptId: conSelect?.value,
          periodId: perSelectCon?.value || this.activePayrollPeriodId,
        });
      });
    }

    // Concept select change inside modal
    const modalConSelect = document.getElementById('period-novelty-concept-select');
    if (modalConSelect) {
      modalConSelect.addEventListener('change', async () => {
        const concepts = await this.fetchIndividualConcepts(false);
        const c = concepts.find((x) => x.id === modalConSelect.value);
        if (c) {
          this.updatePeriodNoveltyModalHint(c);
        } else {
          document.getElementById('period-novelty-concept-hint')?.classList.add('d-none');
          renderDynamicNoveltyControl('period-novelty-dynamic-container', null, {});
        }
      });
    }

    // Formulario de novedad submit
    const formNovelty = document.getElementById('form-period-novelty');
    if (formNovelty) {
      formNovelty.addEventListener('submit', async (e) => {
        e.preventDefault();
        const alertBox = document.getElementById('period-novelty-alert');
        if (alertBox) alertBox.classList.add('d-none');

        const periodId = document.getElementById('period-novelty-period-id').value;
        const empId = document.getElementById('period-novelty-employee-static').dataset.empId || document.getElementById('period-novelty-employee-select').value;
        const conId = document.getElementById('period-novelty-concept-static').dataset.conceptId || document.getElementById('period-novelty-concept-select').value;
        const notes = document.getElementById('period-novelty-notes').value.trim() || null;

        if (!periodId || !empId || !conId) {
          if (alertBox) {
            alertBox.textContent = 'Debe indicar período, colaborador y concepto.';
            alertBox.classList.remove('d-none');
          }
          return;
        }

        const valResult = getDynamicNoveltyControlValue('period-novelty-dynamic-container');
        if (valResult.error) {
          if (alertBox) {
            alertBox.textContent = valResult.error;
            alertBox.classList.remove('d-none');
          }
          return;
        }

        const saveBtn = document.getElementById('btn-save-period-novelty');
        if (saveBtn) saveBtn.disabled = true;

        try {
          await apiRequest(`/payroll/periods/${periodId}/novelties`, {
            method: 'POST',
            body: JSON.stringify({
              employeeId: empId,
              conceptId: conId,
              units: valResult.inputType === 'AMOUNT' ? 1 : valResult.units,
              amount: valResult.inputType === 'AMOUNT' ? valResult.amount : null,
              notes,
            }),
          });

          showToast('Novedad registrada exitosamente');
          getBootstrapModal(document.getElementById('modal-period-novelty-form'))?.hide();

          if (document.getElementById('pane-nov-nopers-emp')?.classList.contains('active')) {
            await this.refreshNovNoPersEmpTable(periodId, empId);
          } else if (document.getElementById('pane-nov-nopers-con')?.classList.contains('active')) {
            await this.refreshNovNoPersConTable(periodId, conId);
          }
        } catch (err) {
          if (alertBox) {
            alertBox.textContent = err.message || 'Error al guardar novedad';
            alertBox.classList.remove('d-none');
          }
        } finally {
          if (saveBtn) saveBtn.disabled = false;
        }
      });
    }
  }

  setupBatchSheetHandlers() {
    const btnOpen = document.getElementById('btn-nov-nopers-con-batch-sheet');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => this.openBatchSheetModal());
    }

    const btnClear = document.getElementById('btn-batch-sheet-clear-zeros');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        document.querySelectorAll('.batch-sheet-val').forEach((inp) => {
          if (Number(inp.value) === 0) inp.value = '';
        });
        this.updateBatchSheetStats();
      });
    }

    const filterInput = document.getElementById('batch-sheet-filter-input');
    if (filterInput) {
      filterInput.addEventListener('input', () => {
        const q = filterInput.value.trim().toLowerCase();
        document.querySelectorAll('#batch-sheet-tbody tr').forEach((row) => {
          const t = row.textContent.toLowerCase();
          row.style.display = !q || t.includes(q) ? '' : 'none';
        });
      });
    }

    const btnSave = document.getElementById('btn-save-batch-sheet');
    if (btnSave) {
      btnSave.addEventListener('click', () => this.saveBatchSheet());
    }
  }

  setupExcelImportHandlers() {
    const btnOpen = document.getElementById('btn-nov-nopers-con-import-excel');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => this.openExcelImportModal());
    }

    const btnDownload = document.getElementById('btn-download-novelty-template');
    if (btnDownload) {
      btnDownload.addEventListener('click', () => this.downloadNoveltyTemplateCsv());
    }

    const fileInput = document.getElementById('novelties-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.handleNoveltiesFileSelect(e));
    }

    const btnConfirm = document.getElementById('btn-confirm-import-novelties');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => this.confirmImportNovelties());
    }
  }

  setupSimulatePayslipHandlers() {
    const btnSimulate = document.getElementById('btn-nov-nopers-emp-simulate');
    if (btnSimulate) {
      btnSimulate.addEventListener('click', () => {
        const periodId = document.getElementById('nov-nopers-emp-period-select')?.value;
        const empId = document.getElementById('nov-nopers-emp-select')?.value;
        this.openSimulatePayslipModal(empId, periodId);
      });
    }

    const btnGoSettle = document.getElementById('btn-sim-go-settle');
    if (btnGoSettle) {
      btnGoSettle.addEventListener('click', () => {
        getBootstrapModal(document.getElementById('modal-simulate-payslip'))?.hide();
        document.getElementById('side-payroll-settlement')?.click();
        const periodId = document.getElementById('nov-nopers-emp-period-select')?.value;
        const empId = document.getElementById('nov-nopers-emp-select')?.value;
        const settlePeriodSelect = document.getElementById('settlement-period-select');
        if (settlePeriodSelect && periodId) settlePeriodSelect.value = periodId;
        this.loadSettlementView().then(() => {
          const singleSelect = document.getElementById('settlement-single-emp-select');
          if (singleSelect && empId) {
            singleSelect.value = empId;
            this.onSettlementSingleSelected(empId);
          }
        });
      });
    }
  }

  setupSettlementHandlers() {
    const periodSelect = document.getElementById('settlement-period-select');
    if (periodSelect) {
      periodSelect.addEventListener('change', () => {
        this.activePayrollPeriodId = periodSelect.value;
        this.loadSettlementView();
      });
    }

    // Modalidad 1: Individual
    const singleSelect = document.getElementById('settlement-single-emp-select');
    if (singleSelect) {
      singleSelect.addEventListener('change', () => this.onSettlementSingleSelected(singleSelect.value));
    }
    const btnCalcSingle = document.getElementById('btn-settlement-calc-single');
    if (btnCalcSingle) {
      btnCalcSingle.addEventListener('click', () => this.calculateSingleEmployee());
    }

    // Modalidad 2: Lote Checkboxes & Filtros
    const deptFilter = document.getElementById('settlement-batch-dept-filter');
    const statusFilter = document.getElementById('settlement-batch-status-filter');
    const searchInput = document.getElementById('settlement-batch-search');
    if (deptFilter) deptFilter.addEventListener('change', () => this.filterSettlementBatchTable());
    if (statusFilter) statusFilter.addEventListener('change', () => this.filterSettlementBatchTable());
    if (searchInput) searchInput.addEventListener('input', () => this.filterSettlementBatchTable());

    const masterCheck = document.getElementById('settlement-batch-master-check');
    if (masterCheck) {
      masterCheck.addEventListener('change', () => {
        const visibleChecks = document.querySelectorAll('#settlement-batch-table-body tr:not([style*="display: none"]) .settlement-batch-check');
        visibleChecks.forEach((cb) => (cb.checked = masterCheck.checked));
        this.updateSettlementBatchSelectedCount();
      });
    }

    const btnSelectAll = document.getElementById('btn-settlement-batch-select-all');
    if (btnSelectAll) {
      btnSelectAll.addEventListener('click', () => {
        document.querySelectorAll('#settlement-batch-table-body tr:not([style*="display: none"]) .settlement-batch-check').forEach((cb) => (cb.checked = true));
        this.updateSettlementBatchSelectedCount();
      });
    }

    const btnDeselectAll = document.getElementById('btn-settlement-batch-deselect-all');
    if (btnDeselectAll) {
      btnDeselectAll.addEventListener('click', () => {
        document.querySelectorAll('.settlement-batch-check').forEach((cb) => (cb.checked = false));
        if (masterCheck) masterCheck.checked = false;
        this.updateSettlementBatchSelectedCount();
      });
    }

    const btnCalcBatch = document.getElementById('btn-settlement-calc-batch');
    if (btnCalcBatch) {
      btnCalcBatch.addEventListener('click', () => this.calculateBatchEmployees());
    }

    // Modalidad 3: General
    const btnCalcAll = document.getElementById('btn-settlement-calc-all');
    if (btnCalcAll) {
      btnCalcAll.addEventListener('click', () => this.calculateAllEmployees());
    }
  }

  // --- Recibos de Sueldo ---

  async loadPayrollSlips(periodId) {
    if (!periodId) return;

    const spinner = document.getElementById('slips-spinner');
    if (spinner) spinner.classList.remove('d-none');

    const searchInput = document.getElementById('slips-search-input');
    const deptFilter = document.getElementById('slips-department-filter');

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

    tbody.innerHTML = slips
      .map((s) => {
        const emp = s.employee || {};
        const bruto = Number(s.grossSalary || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const retenciones = Number(s.totalDeductions || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const neto = Number(s.netSalary || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const initials = ((emp.firstName?.[0] || '') + (emp.lastName?.[0] || '')).toUpperCase() || 'EM';

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
            </td>
            <td class="text-end font-monospace">
              <div class="fw-bold text-success fs-3" style="letter-spacing: -0.02em;">$ ${neto}</div>
            </td>
            <td class="col-slip-status">
              <span class="badge bg-green-lt text-success d-inline-flex align-items-center justify-content-center" title="Recibo emitido" style="width: 28px; height: 28px; border-radius: 6px; padding: 0; overflow: visible;">
                <i class="ti ti-check"></i>
              </span>
            </td>
            <td class="col-slip-action">
              <div class="d-flex gap-1 justify-content-end">
                <button type="button" class="btn btn-sm btn-icon btn-outline-primary btn-view-slip" data-id="${s.id}" title="Ver e imprimir recibo oficial">
                  <i class="ti ti-eye"></i>
                </button>
                <button type="button" class="btn btn-sm btn-icon btn-outline-purple btn-audit-slip" data-id="${s.id}" title="Auditoría de liquidación (Ver todos los conceptos y auxiliares)">
                  <i class="ti ti-report-analytics"></i>
                </button>
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

  renderPayslipVector(data) {
    const area = document.getElementById('printable-payslip-area');
    if (!area) return;

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
    const items = (slip.items || []).filter((it) => it.type !== 'AUXILIARY');
    const itemRows = items
      .map((it) => {
        const isRem = it.type === 'REMUNERATIVE';
        const isNonRem = it.type === 'NON_REMUNERATIVE';
        const isDed = it.type === 'DEDUCTION';
        const amountStr = formatMoney(it.amount);

        return `
          <tr>
            <td class="font-monospace text-center" style="width: 50px;">${escapeHtml(it.conceptCode)}</td>
            <td>${escapeHtml(it.conceptName)}</td>
            <td class="text-center" style="width: 60px;">${it.units ? Number(it.units) : '-'}</td>
            <td class="text-end font-monospace" style="width: 100px;">${isRem ? amountStr : ''}</td>
            <td class="text-end font-monospace" style="width: 100px;">${isNonRem ? amountStr : ''}</td>
            <td class="text-end font-monospace" style="width: 100px;">${isDed ? amountStr : ''}</td>
          </tr>
        `;
      })
      .join('');

    area.innerHTML = `
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
            <div class="col-4"><strong>CBU:</strong> <code style="font-size: 9.5px;">${escapeHtml(slip.cbu || emp.cbu || '-')}</code></div>
          </div>
        </div>
      </div>

      <!-- BLOQUE 2: DETALLE DE CONCEPTOS LIQUIDADOS -->
      <div class="payslip-box" style="min-height: 180px;">
        <div class="payslip-box-header">
          <span>DETALLE DE HABERES Y DEDUCCIONES</span>
          <span>DÍAS TRABAJADOS: ${slip.workedDays || 30}</span>
        </div>
        <div class="p-0">
          <table class="payslip-table-items">
            <thead>
              <tr>
                <th class="text-center">Cód.</th>
                <th>Concepto</th>
                <th class="text-center">Unid.</th>
                <th class="text-end">Remunerativos</th>
                <th class="text-end">No Remunerativos</th>
                <th class="text-end">Retenciones</th>
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

  renderPayslipAudit(data) {
    const area = document.getElementById('payslip-audit-area');
    if (!area) return;

    const slip = data.slip || data;
    const emp = slip.employee || {};
    const comp = data.company || this.activeCompany || {};
    const period = slip.payrollPeriod || {};
    const items = slip.items || [];
    const basis = slip.basis || {};
    const formatMoney = (n) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });

    const typeBadges = {
      REMUNERATIVE: '<span class="badge bg-green-lt">Remunerativo</span>',
      NON_REMUNERATIVE: '<span class="badge bg-blue-lt">No Remunerativo</span>',
      DEDUCTION: '<span class="badge bg-danger-lt">Deducción / Retención</span>',
      AUXILIARY: '<span class="badge bg-purple text-white"><i class="ti ti-tools me-1"></i>Auxiliar de Cálculo</span>',
    };

    const sortedItems = [...items].sort((a, b) => {
      return String(a.conceptCode).localeCompare(String(b.conceptCode));
    });

    const itemRows = sortedItems.map((it, idx) => {
      const isAux = it.type === 'AUXILIARY';
      const rowClass = isAux ? 'bg-purple-lt bg-opacity-10' : '';
      const amountStr = formatMoney(it.amount);
      const unitsStr = it.units !== null && it.units !== undefined ? String(it.units) : '-';
      const baseStr = it.baseAmount ? `$ ${formatMoney(it.baseAmount)}` : (it.rate ? `${it.rate}%` : '-');

      return `
        <tr class="${rowClass}">
          <td class="text-center font-monospace text-muted small py-1">${idx + 1}</td>
          <td class="font-monospace fw-bold text-primary py-1">${escapeHtml(it.conceptCode)}</td>
          <td class="py-1">
            <span class="fw-semibold text-dark text-truncate d-inline-block align-middle" style="max-width: 320px;" title="${escapeHtml(it.conceptName)}">${escapeHtml(it.conceptName)}</span>
          </td>
          <td class="py-1">${typeBadges[it.type] || it.type}</td>
          <td class="text-center font-monospace py-1">${unitsStr}</td>
          <td class="text-end font-monospace text-muted py-1">${baseStr}</td>
          <td class="text-end font-monospace fw-bold py-1 ${isAux ? 'text-purple' : (it.type === 'DEDUCTION' ? 'text-danger' : 'text-dark')}">
            ${it.type === 'DEDUCTION' ? '-' : ''}$ ${amountStr}
          </td>
          <td class="text-center py-1">
            <code>${escapeHtml(it.arcaConceptCode || '-')}</code>
          </td>
        </tr>
      `;
    }).join('');

    area.innerHTML = `
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
                    Legajo: <strong>${escapeHtml(emp.fileNumber || '-')}</strong> | CUIL: <strong>${formatCuit(emp.cuil)}</strong> | ${escapeHtml(emp.jobPosition?.name || '-')}
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
            <span class="badge bg-primary-lt font-monospace">${items.length} conceptos</span>
          </div>
          <div class="small text-muted d-flex align-items-center flex-wrap gap-1">
            <span class="badge bg-purple text-white"><i class="ti ti-tools me-1"></i>Auxiliar</span>
            <span class="small">Variables intermedias de cálculo (no impresas en recibo legal ni ARCA)</span>
          </div>
        </div>
        <div class="table-responsive" style="max-height: 212px; overflow-y: auto;">
          <table class="table table-vcenter card-table table-hover table-sm mb-0">
            <thead class="sticky-top bg-light border-bottom" style="z-index: 2;">
              <tr class="table-light">
                <th class="text-center py-1" style="width: 45px;">#</th>
                <th class="py-1" style="width: 80px;">Código</th>
                <th class="py-1">Concepto / Variable</th>
                <th class="py-1" style="width: 170px;">Tipo</th>
                <th class="text-center py-1" style="width: 90px;">Unidades</th>
                <th class="text-end py-1" style="width: 120px;">Base / Tasa</th>
                <th class="text-end py-1" style="width: 130px;">Importe ($)</th>
                <th class="text-center py-1" style="width: 90px;">Código ARCA</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Bases Imponibles F.931 ARCA y Costo Laboral -->
      <div class="row g-2">
        <div class="col-md-6">
          <div class="card shadow-xs h-100">
            <div class="card-header py-1 px-3 bg-white">
              <h5 class="card-title mb-0 small text-uppercase text-muted">
                <i class="ti ti-building-bank me-1 text-indigo"></i> Bases Imponibles ARCA F.931
              </h5>
            </div>
            <div class="card-body py-2 px-3">
              <table class="table table-sm table-borderless mb-0 small">
                <tr>
                  <td class="text-muted py-0">Base 1 (SIPA Topeada):</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible1)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Base 2 (INSSJyP PAMI):</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible2)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Base 3 (Fondo Nac. Empleo):</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible3)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Base 4 (Asignaciones Familiares):</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible4)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Base 5 (Obra Social Patronal):</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible5)}</td>
                </tr>
                <tr>
                  <td class="text-muted py-0">Base 9 (LRT / Riesgos Trabajo sin tope):</td>
                  <td class="text-end font-monospace fw-bold py-0">$ ${formatMoney(basis.baseImponible9)}</td>
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
                <tr>
                  <td class="text-muted py-0">Total Contribuciones Patronales:</td>
                  <td class="text-end font-monospace fw-bold text-indigo py-0">$ ${formatMoney(slip.totalEmployerContrib)}</td>
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

  // --- Libro de Sueldos Digital (ARCA) ---

  async auditLsdConsistency() {
    const periodSelect = document.getElementById('lsd-period-select');
    const periodId = periodSelect?.value;
    if (!periodId) {
      showToast('Seleccione un período para auditar', 'warning');
      return;
    }

    try {
      const res = await apiRequest(`/payroll/periods/${periodId}/lsd/validate`);
      const val = res.data;
      const title = document.getElementById('lsd-status-title');
      const desc = document.getElementById('lsd-status-desc');
      const icon = document.getElementById('lsd-status-icon');
      const errBox = document.getElementById('lsd-errors-list');

      if (val.isValid) {
        if (title) title.textContent = 'Consistencia 100% Válida para ARCA';
        if (desc) desc.textContent = 'La liquidación cumple estrictamente los 999 caracteres por línea, las 10 bases imponibles y la parametrización del F.931.';
        if (icon) {
          icon.className = 'ti ti-shield-check fs-2 text-success';
        }
        if (errBox) errBox.classList.add('d-none');
        showToast('Liquidación auditada con éxito: formato apto para Libro de Sueldos Digital');
      } else {
        if (title) title.textContent = 'Se detectaron inconsistencias en la liquidación';
        if (desc) desc.textContent = `Se encontraron ${val.errors.length} error(es) que deben corregirse antes de presentar a ARCA:`;
        if (icon) {
          icon.className = 'ti ti-alert-triangle fs-2 text-warning';
        }
        if (errBox) {
          errBox.innerHTML = val.errors.map((e) => `<div>&bull; ${escapeHtml(e)}</div>`).join('');
          errBox.classList.remove('d-none');
        }
        showToast('Existen observaciones para la presentación en ARCA', 'warning');
      }
    } catch (err) {
      showToast(err.message || 'Error al validar ARCA', 'danger');
    }
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
    const periodId = periodSelect?.value;
    if (!periodId) {
      showToast('Seleccione un período para exportar', 'warning');
      return;
    }

    try {
      showToast('Generando Libro de Sueldos Digital ARCA (999 chars)...');
      const token = storage.getToken();
      const companyId = storage.getActiveCompanyId();

      const response = await fetch(`/api/v1/payroll/periods/${periodId}/lsd/payroll`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error?.message || 'Error al descargar liquidación ARCA');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LSD_Liquidacion_ARCA_${periodId.substring(0, 8)}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Archivo F.931 (999 caracteres) descargado correctamente');
    } catch (err) {
      showToast(err.message || 'Error en descarga ARCA', 'danger');
    }
  }

  // --- Conceptos y Diseñador de Fórmulas ---

  async loadPayrollConcepts() {
    const spinner = document.getElementById('concepts-spinner');
    if (spinner) spinner.classList.remove('d-none');

    const searchInput = document.getElementById('concepts-search-input');
    const typeFilter = document.getElementById('concepts-type-filter');
    const periodTypeFilter = document.getElementById('concepts-period-type-filter');
    const persistentFilter = document.getElementById('concepts-persistent-filter');

    const query = new URLSearchParams({
      page: String(this.payrollConceptsPage),
      limit: String(this.payrollConceptsPageSize),
    });
    if (searchInput?.value?.trim()) query.append('search', searchInput.value.trim());
    if (typeFilter?.value && typeFilter.value !== 'ALL') query.append('type', typeFilter.value);
    if (periodTypeFilter?.value && periodTypeFilter.value !== 'ALL') query.append('periodType', periodTypeFilter.value);
    if (persistentFilter?.value && persistentFilter.value !== 'ALL') query.append('isPersistent', persistentFilter.value);

    try {
      const res = await apiRequest(`/payroll/concepts?${query.toString()}`);
      this.payrollConcepts = res.data || [];
      const badge = document.getElementById('payroll-badge-concepts-count');
      if (badge) badge.textContent = res.meta?.total || this.payrollConcepts.length;

      this.renderPayrollConceptsTable(this.payrollConcepts);
      this.renderPayrollConceptsPagination(res.meta || { total: this.payrollConcepts.length, page: 1, totalPages: 1 });
    } catch (err) {
      showToast(err.message || 'Error al cargar conceptos', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  renderPayrollConceptsTable(concepts) {
    const tbody = document.getElementById('concepts-table-body');
    if (!tbody) return;

    if (concepts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">No se encontraron conceptos registrados.</td></tr>';
      return;
    }

    const typeBadges = {
      REMUNERATIVE: '<span class="badge bg-green-lt">Remunerativo</span>',
      NON_REMUNERATIVE: '<span class="badge bg-blue-lt">No Remunerativo</span>',
      DEDUCTION: '<span class="badge bg-danger-lt">Retención</span>',
      AUXILIARY: '<span class="badge bg-purple text-white"><i class="ti ti-tools me-1"></i>Auxiliar</span>',
    };

    const periodTypeBadges = {
      ALL: '<span class="badge bg-secondary-lt">Todas</span>',
      MONTHLY: '<span class="badge bg-azure-lt">Mensual</span>',
      QUINCE_1: '<span class="badge bg-blue-lt">1ra Quincena</span>',
      QUINCE_2: '<span class="badge bg-blue-lt">2da Quincena</span>',
      SAC_1: '<span class="badge bg-indigo-lt">1er SAC</span>',
      SAC_2: '<span class="badge bg-indigo-lt">2do SAC</span>',
      SAC: '<span class="badge bg-indigo-lt">Ambos SAC</span>',
      VACATIONS: '<span class="badge bg-teal-lt">Vacaciones</span>',
      FINAL: '<span class="badge bg-orange-lt">Final</span>',
    };

    const calcBadges = {
      FIXED: '<span class="badge bg-light text-dark border">Fijo</span>',
      FORMULA: '<span class="badge bg-purple-lt"><i class="ti ti-math-function me-1"></i>Fórmula</span>',
      MATRIX: '<span class="badge bg-azure-lt"><i class="ti ti-table me-1"></i>Matriz</span>',
    };

    tbody.innerHTML = concepts
      .map((c) => {
        const persistentBadge = (c.isPersistent !== false && c.isPersistent !== 0)
          ? '<span class="badge bg-teal-lt"><i class="ti ti-repeat me-1"></i>Persistente</span>'
          : '<span class="badge bg-yellow-lt"><i class="ti ti-calendar-off me-1"></i>No Persistente</span>';
        const noveltyBadge = c.noveltyDataType && c.noveltyDataType !== 'CANTIDAD'
          ? `<span class="badge bg-cyan-lt small py-0 px-1 font-monospace" style="font-size: 0.68rem;">Nov: ${escapeHtml(c.noveltyDataType)}</span>`
          : '';
        const scopeBadge = (c.scope === 'INDIVIDUAL')
          ? '<span class="badge bg-purple-lt" title="Aplica solo si se asigna expresamente al empleado"><i class="ti ti-user me-1"></i>Individual</span>'
          : '<span class="badge bg-azure-lt" title="Aplica a toda la nómina"><i class="ti ti-users me-1"></i>General</span>';

        return `
          <tr>
            <td><strong class="font-monospace text-primary">${escapeHtml(c.code)}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(c.name)}</div>
              ${noveltyBadge}
            </td>
            <td>${typeBadges[c.type] || c.type}</td>
            <td>${scopeBadge}</td>
            <td>${periodTypeBadges[c.periodType] || `<span class="badge bg-light text-muted">${escapeHtml(c.periodType || 'Todas')}</span>`}</td>
            <td>${persistentBadge}</td>
            <td>${calcBadges[c.calculationType] || c.calculationType}</td>
            <td class="text-center"><span class="badge bg-success-lt">Activo</span></td>
            <td class="text-end">
              <div class="btn-group btn-group-sm">
                <button type="button" class="btn btn-outline-primary btn-edit-concept" data-id="${c.id}" title="Editar / Modificar fórmula">
                  <i class="ti ti-edit"></i>
                </button>
                <button type="button" class="btn btn-outline-danger btn-del-concept" data-id="${c.id}" data-name="${escapeHtml(c.name)}" title="Eliminar concepto">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-concept').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = this.payrollConcepts.find((x) => x.id === btn.dataset.id);
        if (c) this.openEditConceptModal(c);
      });
    });

    tbody.querySelectorAll('.btn-del-concept').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.confirmDeleteConcept(btn.dataset.id, btn.dataset.name);
      });
    });
  }

  renderPayrollConceptsPagination(meta) {
    const list = document.getElementById('concepts-pagination-list');
    const info = document.getElementById('concepts-pagination-info');
    if (!list) return;

    if (info) {
      info.textContent = `Mostrando ${this.payrollConcepts.length} de ${meta.total} conceptos`;
    }

    const { page, totalPages } = meta;
    this.renderPaginationControls(list, page, totalPages, (newPage) => {
      this.payrollConceptsPage = newPage;
      this.loadPayrollConcepts();
    });
  }

  openNewConceptModal() {
    const form = document.getElementById('form-payroll-concept');
    form?.reset();
    document.getElementById('concept-form-id').value = '';
    document.getElementById('modal-concept-form-title').textContent = 'Nuevo Concepto de Liquidación';
    document.getElementById('concept-form-alert')?.classList.add('d-none');
    document.getElementById('formula-live-status')?.classList.add('d-none');

    const codeInput = document.getElementById('concept-input-code');
    codeInput.readOnly = false;
    codeInput.classList.remove('bg-light');

    document.getElementById('concept-input-type').value = 'REMUNERATIVE';
    const scopeSelect = document.getElementById('concept-input-scope');
    if (scopeSelect) scopeSelect.value = 'GENERAL';
    document.getElementById('concept-input-calc-type').value = 'FORMULA';
    const noveltySelect = document.getElementById('concept-input-novelty-type');
    if (noveltySelect) noveltySelect.value = 'CANTIDAD';

    const periodTypeSelect = document.getElementById('concept-input-period-type');
    if (periodTypeSelect) periodTypeSelect.value = 'ALL';
    const persistentSelect = document.getElementById('concept-input-is-persistent');
    if (persistentSelect) persistentSelect.value = 'true';
    document.getElementById('concept-formula-box')?.classList.remove('d-none');
    document.getElementById('concept-matrix-box')?.classList.add('d-none');

    this.populateConceptModalMatrixOptions();
    this.populateFormulaConceptOptions();
    const matrixSelect = document.getElementById('concept-select-matrix');
    if (matrixSelect) matrixSelect.value = '';
    const infoAlert = document.getElementById('concept-matrix-info');
    if (infoAlert) infoAlert.classList.add('d-none');

    getBootstrapModal(document.getElementById('modal-concept-form'))?.show();
  }

  openEditConceptModal(c) {
    document.getElementById('concept-form-id').value = c.id;
    document.getElementById('modal-concept-form-title').textContent = `Editar Concepto: [${c.code}] ${c.name}`;
    document.getElementById('concept-form-alert')?.classList.add('d-none');
    document.getElementById('formula-live-status')?.classList.add('d-none');

    const codeInput = document.getElementById('concept-input-code');
    codeInput.value = c.code;
    codeInput.readOnly = true;
    codeInput.classList.add('bg-light');

    document.getElementById('concept-input-name').value = c.name;
    document.getElementById('concept-input-type').value = c.type;
    const scopeSelect = document.getElementById('concept-input-scope');
    if (scopeSelect) scopeSelect.value = c.scope || 'GENERAL';
    document.getElementById('concept-input-calc-type').value = c.calculationType || 'FIXED';
    const noveltySelect = document.getElementById('concept-input-novelty-type');
    if (noveltySelect) noveltySelect.value = c.noveltyDataType || 'CANTIDAD';

    const editPeriodTypeSelect = document.getElementById('concept-input-period-type');
    if (editPeriodTypeSelect) editPeriodTypeSelect.value = c.periodType || 'ALL';
    const editPersistentSelect = document.getElementById('concept-input-is-persistent');
    if (editPersistentSelect) {
      editPersistentSelect.value = (c.isPersistent === false || c.isPersistent === 0) ? 'false' : 'true';
    }
    document.getElementById('concept-input-default-value').value = c.defaultValue || '0.00';
    document.getElementById('concept-input-arca-code').value = c.arcaConceptCode || '';
    document.getElementById('concept-input-formula').value = c.formula || '';
    document.getElementById('concept-input-matrix').value = c.matrixData || '';

    // Subsystem checks
    document.getElementById('subsys-sipa').checked = Boolean(c.appliesSipaAporte);
    document.getElementById('subsys-inssjyp').checked = Boolean(c.appliesInssjypAporte);
    document.getElementById('subsys-os').checked = Boolean(c.appliesOsAporte);
    document.getElementById('subsys-fsr').checked = Boolean(c.appliesFsrAporte);
    document.getElementById('subsys-aaff').checked = Boolean(c.appliesAaffContrib);
    document.getElementById('subsys-fne').checked = Boolean(c.appliesFneContrib);
    document.getElementById('subsys-lrt').checked = Boolean(c.appliesLrtContrib);
    document.getElementById('subsys-renatre').checked = Boolean(c.appliesRenatreAporte);

    // Toggle formula vs matrix boxes
    const formulaBox = document.getElementById('concept-formula-box');
    const matrixBox = document.getElementById('concept-matrix-box');
    if (c.calculationType === 'FORMULA') {
      formulaBox?.classList.remove('d-none');
      matrixBox?.classList.add('d-none');
    } else if (c.calculationType === 'MATRIX') {
      formulaBox?.classList.add('d-none');
      matrixBox?.classList.remove('d-none');
    } else {
      formulaBox?.classList.add('d-none');
      matrixBox?.classList.add('d-none');
    }

    this.populateConceptModalMatrixOptions();
    this.populateFormulaConceptOptions(c.code);
    const matrixSelect = document.getElementById('concept-select-matrix');
    if (matrixSelect) {
      matrixSelect.value = c.matrixId || '';
      this.updateConceptMatrixInfoBanner();
    }

    if (c.formula && c.calculationType === 'FORMULA') {
      this.validateFormulaInDesigner();
    }

    getBootstrapModal(document.getElementById('modal-concept-form'))?.show();
  }

  async savePayrollConcept() {
    const submitBtn = document.getElementById('btn-save-concept');
    const alertBox = document.getElementById('concept-form-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const id = document.getElementById('concept-form-id').value;
    const calcType = document.getElementById('concept-input-calc-type').value;
    const matrixIdVal = document.getElementById('concept-select-matrix')?.value;
    const matrixId = calcType === 'MATRIX' && matrixIdVal ? matrixIdVal : null;
    const codeVal = document.getElementById('concept-input-code').value.trim();

    const payload = {
      code: codeVal,
      name: document.getElementById('concept-input-name').value.trim(),
      type: document.getElementById('concept-input-type').value,
      scope: document.getElementById('concept-input-scope')?.value || 'GENERAL',
      calculationType: calcType,
      calculationOrder: parseInt(codeVal, 10) || 100,
      noveltyDataType: document.getElementById('concept-input-novelty-type')?.value || 'CANTIDAD',
      periodType: document.getElementById('concept-input-period-type')?.value || 'ALL',
      isPersistent: document.getElementById('concept-input-is-persistent')?.value === 'true',
      defaultValue: Number(document.getElementById('concept-input-default-value').value) || 0,
      formula: calcType === 'FORMULA' ? document.getElementById('concept-input-formula').value.trim() : null,
      matrixData: calcType === 'MATRIX' ? document.getElementById('concept-input-matrix').value.trim() : null,
      matrixId: matrixId,
      arcaConceptCode: document.getElementById('concept-input-arca-code').value.trim() || null,
      appliesSipaAporte: document.getElementById('subsys-sipa').checked,
      appliesSipaContrib: document.getElementById('subsys-sipa').checked,
      appliesInssjypAporte: document.getElementById('subsys-inssjyp').checked,
      appliesInssjypContrib: document.getElementById('subsys-inssjyp').checked,
      appliesOsAporte: document.getElementById('subsys-os').checked,
      appliesOsContrib: document.getElementById('subsys-os').checked,
      appliesFsrAporte: document.getElementById('subsys-fsr').checked,
      appliesFsrContrib: document.getElementById('subsys-fsr').checked,
      appliesAaffContrib: document.getElementById('subsys-aaff').checked,
      appliesFneContrib: document.getElementById('subsys-fne').checked,
      appliesLrtContrib: document.getElementById('subsys-lrt').checked,
      appliesRenatreAporte: document.getElementById('subsys-renatre').checked,
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';

    try {
      if (id) {
        await apiRequest(`/payroll/concepts/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('Concepto actualizado correctamente');
      } else {
        await apiRequest('/payroll/concepts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Concepto creado exitosamente');
      }

      getBootstrapModal(document.getElementById('modal-concept-form'))?.hide();
      await this.loadPayrollConcepts();
    } catch (err) {
      if (alertBox) {
        let msg = err.message || 'Error al guardar el concepto';
        if (err.details && Array.isArray(err.details) && err.details.length > 0) {
          const detailMessages = err.details
            .map((d) => `• ${d.field ? `<strong>${escapeHtml(d.field)}:</strong> ` : ''}${escapeHtml(d.message)}`)
            .join('<br>');
          msg = `<div class="fw-bold mb-1">${escapeHtml(err.message)}:</div>${detailMessages}`;
          alertBox.innerHTML = msg;
        } else {
          alertBox.textContent = msg;
        }
        alertBox.classList.remove('d-none');
      }
      showToast(err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Concepto';
    }
  }

  setupFormulaDesigner() {
    const btnInsertConcept = document.getElementById('btn-insert-concept-token');
    const conceptSelect = document.getElementById('formula-select-concept');
    const metricSelect = document.getElementById('formula-select-concept-metric');
    const formulaInput = document.getElementById('concept-input-formula');
    const tokenContainer = document.getElementById('formula-token-buttons');

    const insertTextAtCursor = (text) => {
      if (!formulaInput) return;
      const start = formulaInput.selectionStart || formulaInput.value.length;
      const end = formulaInput.selectionEnd || formulaInput.value.length;
      const current = formulaInput.value;
      formulaInput.value = current.substring(0, start) + text + current.substring(end);
      formulaInput.focus();
      const newPos = start + text.length;
      formulaInput.setSelectionRange(newPos, newPos);
      this.validateFormulaInDesigner();
    };

    if (btnInsertConcept) {
      btnInsertConcept.addEventListener('click', () => {
        const target = conceptSelect?.value;
        const metric = metricSelect?.value || 'CURRENT';
        if (!target) return;

        let token = '';
        if (metric === 'CURRENT') {
          token = `[${target}]`;
        } else {
          token = `[${metric}:${target}]`;
        }
        insertTextAtCursor(token);
      });
    }

    if (tokenContainer) {
      tokenContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-token-formula');
        if (!btn) return;
        const token = btn.dataset.token;
        if (!token) return;
        insertTextAtCursor(token);
      });
    }

    let debounceTimer = null;
    if (formulaInput) {
      formulaInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => this.validateFormulaInDesigner(), 350);
      });
    }
  }

  async validateFormulaInDesigner() {
    const formulaInput = document.getElementById('concept-input-formula');
    const statusBox = document.getElementById('formula-live-status');
    const statusContent = document.getElementById('formula-live-status-content');
    const codeInput = document.getElementById('concept-input-code');
    const typeInput = document.getElementById('concept-input-type');

    if (!formulaInput || !statusBox || !statusContent) return;

    const formula = formulaInput.value.trim();
    if (!formula) {
      statusBox.classList.add('d-none');
      return;
    }

    statusBox.classList.remove('d-none');
    statusContent.innerHTML = '<div class="spinner-border spinner-border-sm text-purple me-1" role="status"></div><span>Validando fórmula y dependencias...</span>';

    try {
      const res = await apiRequest('/payroll/concepts/validate-formula', {
        method: 'POST',
        body: JSON.stringify({
          formula,
          conceptCode: codeInput?.value?.trim() || '',
          type: typeInput?.value || '',
          calculationOrder: parseInt(codeInput?.value, 10) || 100,
        }),
      });

      const val = res.data;
      if (val.isValid) {
        statusContent.innerHTML = `
          <i class="ti ti-check fs-2 text-success"></i>
          <div>
            <span class="text-success fw-semibold">Fórmula válida.</span>
            <span class="text-muted ms-1 small">Secuencia de ejecución y sintaxis correctas. Tokens: ${val.parsedTokens?.length || 0}.</span>
          </div>
        `;
      } else {
        statusContent.innerHTML = `
          <i class="ti ti-alert-circle fs-2 text-danger"></i>
          <div>
            <span class="text-danger fw-semibold">Error de validación:</span>
            <span class="text-danger ms-1 small">${escapeHtml(val.errors?.join('; ') || val.error || 'Sintaxis no admitida')}</span>
          </div>
        `;
      }
    } catch (err) {
      statusContent.innerHTML = `
        <i class="ti ti-alert-triangle fs-2 text-warning"></i>
        <span class="text-muted small">No se pudo verificar: ${escapeHtml(err.message)}</span>
      `;
    }
  }

  populateFormulaConceptOptions(currentCode = '') {
    const group = document.getElementById('formula-concept-options-group');
    if (!group) return;

    const available = (this.payrollConcepts || [])
      .filter((c) => c.code !== currentCode && c.isActive !== false)
      .sort((a, b) => (parseInt(a.code, 10) || 0) - (parseInt(b.code, 10) || 0));

    if (available.length === 0) {
      group.innerHTML = '<option value="" disabled>No hay otros conceptos registrados</option>';
      return;
    }

    group.innerHTML = available
      .map((c) => {
        const typeLabel = c.type === 'AUXILIARY' ? ' [AUX]' : (c.type === 'DEDUCTION' ? ' [RET]' : '');
        return `<option value="${escapeHtml(c.code)}">[${escapeHtml(c.code)}] ${escapeHtml(c.name)}${typeLabel}</option>`;
      })
      .join('');
  }

  confirmDeleteConcept(id, name) {
    this.confirmDeleteAction({
      title: 'Eliminar Concepto',
      message: `¿Estás seguro de que deseas eliminar el concepto <strong>"${escapeHtml(name)}"</strong>?`,
      onConfirm: async () => {
        await apiRequest(`/payroll/concepts/${id}`, { method: 'DELETE' });
        showToast('Concepto eliminado correctamente');
        await this.loadPayrollConcepts();
      },
    });
  }

  // --- Matrices de Liquidación (Lookup Matrices) ---

  async loadPayrollMatrices() {
    const spinner = document.getElementById('matrices-spinner');
    if (spinner) spinner.classList.remove('d-none');

    const searchInput = document.getElementById('matrices-search-input');
    const typeFilter = document.getElementById('matrices-type-filter');

    const query = new URLSearchParams({
      page: String(this.payrollMatricesPage),
      limit: String(this.payrollMatricesPageSize),
    });
    if (searchInput?.value?.trim()) query.append('search', searchInput.value.trim());
    if (typeFilter?.value && typeFilter.value !== 'ALL') query.append('matchType', typeFilter.value);

    try {
      const res = await apiRequest(`/payroll/matrices?${query.toString()}`);
      this.payrollMatrices = res.data || [];
      const badge = document.getElementById('payroll-badge-matrices-count');
      if (badge) badge.textContent = res.meta?.total || this.payrollMatrices.length;

      this.renderPayrollMatricesTable(this.payrollMatrices);
      this.renderPayrollMatricesPagination(res.meta || { total: this.payrollMatrices.length, page: 1, totalPages: 1 });
      this.populateConceptModalMatrixOptions();
    } catch (err) {
      showToast(err.message || 'Error al cargar matrices de liquidación', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  renderPayrollMatricesTable(matrices) {
    const tbody = document.getElementById('matrices-table-body');
    if (!tbody) return;

    if (matrices.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-4 text-muted">
            <i class="ti ti-table-off fs-1 d-block mb-2 text-secondary"></i>
            No se encontraron matrices de liquidación registradas. Hacé click en "Nueva Matriz" para comenzar.
          </td>
        </tr>
      `;
      return;
    }

    const typeBadges = {
      RANGE: '<span class="badge bg-purple-lt"><i class="ti ti-arrows-left-right me-1"></i>Por Rangos</span>',
      EXACT: '<span class="badge bg-azure-lt"><i class="ti ti-equal me-1"></i>Valor Exacto</span>',
    };

    tbody.innerHTML = matrices
      .map((m) => {
        let rows = m.rows || [];
        let resultType = m.resultType || 'AMOUNT';
        if (typeof rows === 'string') {
          try {
            rows = JSON.parse(rows);
          } catch {
            rows = [];
          }
        }
        if (rows && !Array.isArray(rows) && typeof rows === 'object') {
          if (rows.resultType) resultType = rows.resultType;
          rows = rows.rules || rows.rows || [];
        }
        const rowCount = Array.isArray(rows) ? rows.length : 0;
        const returnBadge = resultType === 'PERCENTAGE'
          ? '<span class="badge bg-purple-lt ms-1">% Porcentaje</span>'
          : '<span class="badge bg-green-lt ms-1">$ Importe</span>';

        const conceptMatch = this.payrollConcepts?.find((c) => c.code === m.inputConceptCode);
        const conceptLabel = conceptMatch ? `[${conceptMatch.code}] ${conceptMatch.name}` : m.inputConceptCode;

        return `
          <tr>
            <td><strong class="font-monospace text-primary">${escapeHtml(m.code)}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(m.name)}</div>
              ${m.description ? `<small class="text-muted">${escapeHtml(m.description)}</small>` : ''}
            </td>
            <td>
              <span class="badge bg-indigo-lt">
                <i class="ti ti-arrow-right-circle me-1"></i>${escapeHtml(conceptLabel)}
              </span>
            </td>
            <td>
              ${typeBadges[m.matchType] || m.matchType}
              ${returnBadge}
            </td>
            <td class="text-center">
              <span class="badge bg-light text-dark border">${rowCount} regla(s)</span>
            </td>
            <td class="text-center"><span class="badge bg-success-lt">Activa</span></td>
            <td class="text-end">
              <div class="btn-group btn-group-sm">
                <button type="button" class="btn btn-outline-primary btn-edit-matrix" data-id="${m.id}" title="Editar matriz y valores">
                  <i class="ti ti-edit"></i>
                </button>
                <button type="button" class="btn btn-outline-danger btn-del-matrix" data-id="${m.id}" data-name="${escapeHtml(m.name)}" title="Eliminar matriz">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-matrix').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = this.payrollMatrices.find((x) => x.id === btn.dataset.id);
        if (m) this.openEditMatrixModal(m);
      });
    });

    tbody.querySelectorAll('.btn-del-matrix').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.confirmDeleteMatrix(btn.dataset.id, btn.dataset.name);
      });
    });
  }

  renderPayrollMatricesPagination(meta) {
    const list = document.getElementById('matrices-pagination-list');
    const info = document.getElementById('matrices-pagination-info');
    if (!list) return;

    if (info) {
      info.textContent = `Mostrando ${this.payrollMatrices.length} de ${meta.total} matrices`;
    }

    const { page, totalPages } = meta;
    this.renderPaginationControls(list, page, totalPages, (newPage) => {
      this.payrollMatricesPage = newPage;
      this.loadPayrollMatrices();
    });
  }

  populateMatrixInputConceptSelect(selectedVal = '') {
    const select = document.getElementById('matrix-input-concept');
    if (!select) return;

    let html = '<option value="">-- Seleccione el Concepto de Entrada --</option>';

    // 1. Conceptos creados por el usuario y del sistema
    if (this.payrollConcepts && this.payrollConcepts.length > 0) {
      html += '<optgroup label="Conceptos de Nómina">';
      const sorted = [...this.payrollConcepts].sort((a, b) => a.code.localeCompare(b.code));
      for (const c of sorted) {
        const isSel = String(c.code) === String(selectedVal) ? 'selected' : '';
        html += `<option value="${escapeHtml(c.code)}" ${isSel}>[${escapeHtml(c.code)}] ${escapeHtml(c.name)}</option>`;
      }
      html += '</optgroup>';
    }

    // 2. Variables automáticas del legajo
    html += `
      <optgroup label="Variables Automáticas del Legajo">
        <option value="ANTIGUEDAD_ANOS" ${selectedVal === 'ANTIGUEDAD_ANOS' ? 'selected' : ''}>ANTIGUEDAD_ANOS (Años enteros de antigüedad)</option>
        <option value="ANTIGUEDAD_MESES" ${selectedVal === 'ANTIGUEDAD_MESES' ? 'selected' : ''}>ANTIGUEDAD_MESES (Meses de antigüedad)</option>
        <option value="DIAS_TRABAJADOS" ${selectedVal === 'DIAS_TRABAJADOS' ? 'selected' : ''}>DIAS_TRABAJADOS (Días liquidados en el mes)</option>
        <option value="HORAS_TRABAJADAS" ${selectedVal === 'HORAS_TRABAJADAS' ? 'selected' : ''}>HORAS_TRABAJADAS (Horas liquidadas en el mes)</option>
        <option value="CATEGORIA" ${selectedVal === 'CATEGORIA' ? 'selected' : ''}>CATEGORIA (Categoría laboral del empleado)</option>
        <option value="PUESTO" ${selectedVal === 'PUESTO' ? 'selected' : ''}>PUESTO (Código de puesto de trabajo)</option>
        <option value="TOTAL_REMUNERATIVO" ${selectedVal === 'TOTAL_REMUNERATIVO' ? 'selected' : ''}>TOTAL_REMUNERATIVO (Bruto acumulado)</option>
      </optgroup>
    `;

    select.innerHTML = html;
  }

  renderMatrixFormRows() {
    const thead = document.getElementById('matrix-rows-thead');
    const tbody = document.getElementById('matrix-rows-tbody');
    const hint = document.getElementById('matrix-rows-mode-hint');
    const footer = document.getElementById('matrix-rows-footer');
    if (!tbody) return;

    const matchType = document.getElementById('matrix-input-match-type')?.value || 'RANGE';
    const returnType = document.getElementById('matrix-input-return-type')?.value || 'AMOUNT';
    const isPercentage = returnType === 'PERCENTAGE';
    const valColHeader = isPercentage ? 'Porcentaje Devuelto (%)' : 'Importe Fijo Devuelto ($)';

    if (thead) {
      if (matchType === 'EXACT') {
        thead.innerHTML = `
          <tr>
            <th style="width: 50%;">Valor Clave de Entrada (Texto o Número)</th>
            <th style="width: 40%;">${valColHeader}</th>
            <th class="w-1 text-end">Acción</th>
          </tr>
        `;
        if (hint) {
          hint.textContent = isPercentage
            ? 'Defina los valores clave y el porcentaje (%) que devuelve la matriz'
            : 'Defina los valores clave y el importe fijo ($) que devuelve la matriz';
        }
      } else {
        thead.innerHTML = `
          <tr>
            <th style="width: 30%;">Desde (>=)</th>
            <th style="width: 30%;">Hasta (<=)</th>
            <th style="width: 30%;">${valColHeader}</th>
            <th class="w-1 text-end">Acción</th>
          </tr>
        `;
        if (hint) {
          hint.textContent = isPercentage
            ? 'Defina los tramos numéricos y el porcentaje (%) que devuelve la matriz'
            : 'Defina los tramos numéricos y el importe fijo ($) que devuelve la matriz';
        }
      }
    }

    if (!this.matrixFormRows || this.matrixFormRows.length === 0) {
      this.matrixFormRows = [{ from: 0, to: 1, inputValue: '', value: 0, valueType: returnType }];
    }

    tbody.innerHTML = this.matrixFormRows
      .map((row, idx) => {
        const valStr = row.value !== undefined && row.value !== null && row.value !== '' ? row.value : '';
        if (matchType === 'EXACT') {
          return `
            <tr data-row-index="${idx}">
              <td>
                <input type="text" class="form-control form-control-sm matrix-row-input" value="${escapeHtml(row.inputValue || '')}" placeholder="Ej. A, B, 100..." required />
              </td>
              <td>
                <div class="input-group input-group-sm">
                  ${!isPercentage ? '<span class="input-group-text">$</span>' : ''}
                  <input type="number" step="0.01" class="form-control matrix-row-value font-monospace text-end" value="${valStr}" placeholder="${isPercentage ? '15.00' : '0.00'}" required />
                  ${isPercentage ? '<span class="input-group-text">%</span>' : ''}
                </div>
              </td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-danger btn-del-matrix-row" data-index="${idx}" title="Eliminar regla">
                  <i class="ti ti-trash"></i>
                </button>
              </td>
            </tr>
          `;
        } else {
          const fromStr = row.from !== undefined && row.from !== null && row.from !== '' ? row.from : '';
          const toStr = row.to !== undefined && row.to !== null && row.to !== '' ? row.to : '';
          return `
            <tr data-row-index="${idx}">
              <td>
                <input type="number" step="any" class="form-control form-control-sm matrix-row-from font-monospace" value="${fromStr}" placeholder="0" />
              </td>
              <td>
                <input type="number" step="any" class="form-control form-control-sm matrix-row-to font-monospace" value="${toStr}" placeholder="Sin límite" />
              </td>
              <td>
                <div class="input-group input-group-sm">
                  ${!isPercentage ? '<span class="input-group-text">$</span>' : ''}
                  <input type="number" step="0.01" class="form-control matrix-row-value font-monospace text-end" value="${valStr}" placeholder="${isPercentage ? '15.00' : '0.00'}" required />
                  ${isPercentage ? '<span class="input-group-text">%</span>' : ''}
                </div>
              </td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-danger btn-del-matrix-row" data-index="${idx}" title="Eliminar regla">
                  <i class="ti ti-trash"></i>
                </button>
              </td>
            </tr>
          `;
        }
      })
      .join('');

    if (footer) {
      footer.textContent = `${this.matrixFormRows.length} regla(s) configurada(s).`;
    }

    tbody.querySelectorAll('.btn-del-matrix-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        this.deleteMatrixFormRow(idx);
      });
    });
  }

  syncMatrixFormRowsFromDOM() {
    const tbody = document.getElementById('matrix-rows-tbody');
    if (!tbody) return;

    const returnType = document.getElementById('matrix-input-return-type')?.value || 'AMOUNT';
    const trs = tbody.querySelectorAll('tr[data-row-index]');
    const updated = [];

    trs.forEach((tr) => {
      const fromInput = tr.querySelector('.matrix-row-from');
      const toInput = tr.querySelector('.matrix-row-to');
      const keyInput = tr.querySelector('.matrix-row-input');
      const valInput = tr.querySelector('.matrix-row-value');

      updated.push({
        from: fromInput && fromInput.value.trim() !== '' ? Number(fromInput.value) : null,
        to: toInput && toInput.value.trim() !== '' ? Number(toInput.value) : null,
        inputValue: keyInput ? keyInput.value.trim() : '',
        value: valInput && valInput.value.trim() !== '' ? Number(valInput.value) : 0,
        valueType: returnType,
      });
    });

    if (updated.length > 0) {
      this.matrixFormRows = updated;
    }
  }

  addMatrixFormRow(initialData = null) {
    this.syncMatrixFormRowsFromDOM();
    const returnType = document.getElementById('matrix-input-return-type')?.value || 'AMOUNT';
    this.matrixFormRows.push({
      from: null,
      to: null,
      inputValue: '',
      value: 0,
      valueType: returnType,
      ...(initialData || {}),
    });
    this.renderMatrixFormRows();
  }

  deleteMatrixFormRow(idx) {
    this.syncMatrixFormRowsFromDOM();
    if (this.matrixFormRows.length <= 1) {
      showToast('La matriz debe contener al menos una regla de valores', 'warning');
      return;
    }
    this.matrixFormRows.splice(idx, 1);
    this.renderMatrixFormRows();
  }

  openNewMatrixModal() {
    const form = document.getElementById('form-payroll-matrix');
    form?.reset();
    document.getElementById('matrix-form-id').value = '';
    document.getElementById('modal-matrix-form-title').textContent = 'Nueva Matriz de Liquidación';
    document.getElementById('matrix-form-alert')?.classList.add('d-none');

    const codeInput = document.getElementById('matrix-input-code');
    codeInput.readOnly = false;
    codeInput.classList.remove('bg-light');

    document.getElementById('matrix-input-match-type').value = 'RANGE';
    document.getElementById('matrix-input-return-type').value = 'AMOUNT';
    document.getElementById('matrix-input-default-value').value = '0.00';

    this.populateMatrixInputConceptSelect('');
    this.matrixFormRows = [
      { from: 0, to: 1, value: 0, valueType: 'AMOUNT' },
      { from: 2, to: 5, value: 0, valueType: 'AMOUNT' },
    ];
    this.renderMatrixFormRows();

    getBootstrapModal(document.getElementById('modal-matrix-form'))?.show();
  }

  openEditMatrixModal(m) {
    document.getElementById('matrix-form-id').value = m.id;
    document.getElementById('modal-matrix-form-title').textContent = `Editar Matriz: [${m.code}] ${m.name}`;
    document.getElementById('matrix-form-alert')?.classList.add('d-none');

    const codeInput = document.getElementById('matrix-input-code');
    codeInput.value = m.code;
    codeInput.readOnly = true;
    codeInput.classList.add('bg-light');

    document.getElementById('matrix-input-name').value = m.name;
    document.getElementById('matrix-input-description').value = m.description || '';
    document.getElementById('matrix-input-match-type').value = m.matchType || 'RANGE';
    document.getElementById('matrix-input-default-value').value = m.defaultValue !== undefined ? m.defaultValue : '0.00';

    let rows = m.rows || [];
    let returnType = m.resultType || 'AMOUNT';
    if (typeof rows === 'string') {
      try {
        rows = JSON.parse(rows);
      } catch {
        rows = [];
      }
    }
    if (rows && !Array.isArray(rows) && typeof rows === 'object') {
      if (rows.resultType) returnType = rows.resultType;
      rows = rows.rules || rows.rows || [];
    }
    if (Array.isArray(rows) && rows[0]?.valueType) {
      returnType = rows[0].valueType;
    }

    const retSelect = document.getElementById('matrix-input-return-type');
    if (retSelect) retSelect.value = returnType;

    this.populateMatrixInputConceptSelect(m.inputConceptCode);
    this.matrixFormRows = Array.isArray(rows) && rows.length > 0 ? rows : [{ from: 0, to: 1, value: 0, valueType: returnType }];
    this.renderMatrixFormRows();

    getBootstrapModal(document.getElementById('modal-matrix-form'))?.show();
  }

  async savePayrollMatrix() {
    const submitBtn = document.getElementById('btn-save-payroll-matrix');
    const alertBox = document.getElementById('matrix-form-alert');
    if (alertBox) alertBox.classList.add('d-none');

    this.syncMatrixFormRowsFromDOM();

    const id = document.getElementById('matrix-form-id').value;
    const code = document.getElementById('matrix-input-code').value.trim().toUpperCase();
    const name = document.getElementById('matrix-input-name').value.trim();
    const inputConceptCode = document.getElementById('matrix-input-concept').value.trim();
    const matchType = document.getElementById('matrix-input-match-type').value;
    const returnType = document.getElementById('matrix-input-return-type').value;
    const defaultValue = Number(document.getElementById('matrix-input-default-value').value) || 0;
    const description = document.getElementById('matrix-input-description').value.trim() || null;

    if (!code || !name || !inputConceptCode) {
      if (alertBox) {
        alertBox.textContent = 'Por favor complete todos los campos obligatorios (*)';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    if (!this.matrixFormRows || this.matrixFormRows.length === 0) {
      if (alertBox) {
        alertBox.textContent = 'Debe agregar al menos una regla a la matriz';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    // Asegurar que cada fila tenga su valueType
    const finalizedRows = this.matrixFormRows.map((r) => ({
      ...r,
      valueType: returnType,
    }));

    const payload = {
      code,
      name,
      description,
      inputConceptCode,
      matchType,
      defaultValue,
      rows: {
        resultType: returnType,
        rules: finalizedRows,
      },
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';

    try {
      if (id) {
        await apiRequest(`/payroll/matrices/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('Matriz de liquidación actualizada correctamente');
      } else {
        await apiRequest('/payroll/matrices', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Matriz de liquidación creada exitosamente');
      }

      getBootstrapModal(document.getElementById('modal-matrix-form'))?.hide();
      await this.loadPayrollMatrices();
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al guardar la matriz de liquidación';
        alertBox.classList.remove('d-none');
      }
      showToast(err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Matriz';
    }
  }

  confirmDeleteMatrix(id, name) {
    this.confirmDeleteAction({
      title: 'Eliminar Matriz de Liquidación',
      message: `¿Estás seguro de que deseas eliminar la matriz <strong>"${escapeHtml(name)}"</strong>?`,
      onConfirm: async () => {
        try {
          await apiRequest(`/payroll/matrices/${id}`, { method: 'DELETE' });
          showToast('Matriz eliminada correctamente');
          await this.loadPayrollMatrices();
        } catch (err) {
          showToast(err.message || 'Error al eliminar matriz. Verifique que no esté siendo utilizada por conceptos.', 'danger');
        }
      },
    });
  }

  populateConceptModalMatrixOptions() {
    const conceptSelect = document.getElementById('concept-select-matrix');
    const formulaSelect = document.getElementById('formula-select-matrix');

    let html = '<option value="">-- Seleccionar Matriz de Liquidación --</option>';
    let formulaHtml = '<option value="">-- Elegir matriz para insertar en fórmula --</option>';

    if (this.payrollMatrices && this.payrollMatrices.length > 0) {
      for (const m of this.payrollMatrices) {
        const driver = m.inputConceptCode || '-';
        html += `<option value="${m.id}">[${escapeHtml(m.code)}] ${escapeHtml(m.name)} (Entrada: ${escapeHtml(driver)})</option>`;
        formulaHtml += `<option value="${escapeHtml(m.code)}">[${escapeHtml(m.code)}] ${escapeHtml(m.name)}</option>`;
      }
    }

    if (conceptSelect) conceptSelect.innerHTML = html;
    if (formulaSelect) formulaSelect.innerHTML = formulaHtml;
    this.populateFormulaFixedValuesSelect();
  }

  updateConceptMatrixInfoBanner() {
    const conceptSelect = document.getElementById('concept-select-matrix');
    const infoBox = document.getElementById('concept-matrix-info');
    const infoText = document.getElementById('concept-matrix-info-text');
    if (!conceptSelect || !infoBox || !infoText) return;

    const selectedId = conceptSelect.value;
    if (!selectedId) {
      infoBox.classList.add('d-none');
      return;
    }

    const matrix = this.payrollMatrices?.find((m) => m.id === selectedId);
    if (!matrix) {
      infoBox.classList.add('d-none');
      return;
    }

    let rows = matrix.rows || [];
    let resultType = matrix.resultType || 'AMOUNT';
    if (typeof rows === 'string') {
      try {
        rows = JSON.parse(rows);
      } catch {
        rows = [];
      }
    }
    if (rows && !Array.isArray(rows) && typeof rows === 'object') {
      if (rows.resultType) resultType = rows.resultType;
      rows = rows.rules || rows.rows || [];
    }
    const count = Array.isArray(rows) ? rows.length : 0;
    const typeStr = matrix.matchType === 'RANGE' ? 'Rangos numéricos' : 'Valor exacto';
    const resStr = resultType === 'PERCENTAGE' ? 'Porcentaje (%) sobre concepto entrada' : 'Importe fijo ($)';

    infoText.innerHTML = `Matriz activa: <strong>[${escapeHtml(matrix.code)}] ${escapeHtml(matrix.name)}</strong>. Concepto de entrada (Driver): <code class="badge bg-light text-dark">${escapeHtml(matrix.inputConceptCode)}</code>. Modo: <strong>${typeStr}</strong>. Devuelve: <strong>${resStr}</strong> (${count} regla(s)).`;
    infoBox.classList.remove('d-none');
  }

  // --- Valores Globales Fijos (Constantes de Liquidación) ---

  async loadPayrollFixedValues() {
    const spinner = document.getElementById('fixed-values-spinner');
    if (spinner) spinner.classList.remove('d-none');

    const searchInput = document.getElementById('fixed-values-search-input');
    const statusFilter = document.getElementById('fixed-values-status-filter');

    const query = new URLSearchParams({
      page: String(this.payrollFixedValuesPage),
      limit: String(this.payrollFixedValuesPageSize),
    });
    if (searchInput?.value?.trim()) query.append('search', searchInput.value.trim());
    if (statusFilter?.value && statusFilter.value !== 'ALL') query.append('isActive', statusFilter.value);

    try {
      const res = await apiRequest(`/payroll/fixed-values?${query.toString()}`);
      this.payrollFixedValues = res.data || [];
      const badge = document.getElementById('payroll-badge-fixed-values-count');
      if (badge) badge.textContent = res.meta?.total || this.payrollFixedValues.length;

      this.renderPayrollFixedValuesTable(this.payrollFixedValues);
      this.renderPayrollFixedValuesPagination(res.meta || { total: this.payrollFixedValues.length, page: 1, totalPages: 1 });
      this.populateFormulaFixedValuesSelect();
    } catch (err) {
      showToast(err.message || 'Error al cargar valores fijos', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  renderPayrollFixedValuesTable(fixedValues) {
    const tbody = document.getElementById('fixed-values-table-body');
    if (!tbody) return;

    if (fixedValues.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-5 text-muted">
            <i class="ti ti-pinned-off fs-1 d-block mb-2 text-secondary opacity-50"></i>
            No se encontraron valores fijos registrados. Hacé click en "Nuevo Valor Fijo" para comenzar.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = fixedValues
      .map((fv) => {
        const numVal = Number(fv.value || 0);
        const formattedVal = fv.unit === '$'
          ? `$ ${formatNumber(numVal, 2)}`
          : `${formatNumber(numVal, 2)} ${escapeHtml(fv.unit || '')}`;

        const statusBadge = fv.isActive
          ? '<span class="badge bg-success-lt"><i class="ti ti-check me-1"></i>Activo</span>'
          : '<span class="badge bg-secondary-lt"><i class="ti ti-x me-1"></i>Inactivo</span>';

        return `
          <tr>
            <td>
              <span class="badge bg-azure-lt font-monospace fs-3 fw-bold">${escapeHtml(fv.code)}</span>
            </td>
            <td>
              <div class="fw-bold">${escapeHtml(fv.name)}</div>
              ${fv.description ? `<div class="text-muted small text-truncate" style="max-width: 320px;">${escapeHtml(fv.description)}</div>` : ''}
            </td>
            <td class="text-end">
              <span class="fw-bold fs-3 text-dark font-monospace">${formattedVal}</span>
            </td>
            <td class="text-center">
              <span class="badge bg-light text-secondary border">${escapeHtml(fv.unit || '$')}</span>
            </td>
            <td class="text-center">${statusBadge}</td>
            <td class="text-end">
              <div class="btn-list flex-nowrap justify-content-end">
                <button type="button" class="btn btn-sm btn-outline-primary btn-edit-fixed-value" data-id="${fv.id}" title="Editar valor fijo">
                  <i class="ti ti-edit"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger btn-delete-fixed-value" data-id="${fv.id}" data-code="${escapeHtml(fv.code)}" title="Eliminar valor fijo">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-fixed-value').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.editFixedValue(btn.dataset.id);
      });
    });

    tbody.querySelectorAll('.btn-delete-fixed-value').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.confirmDeleteFixedValue(btn.dataset.id, btn.dataset.code);
      });
    });
  }

  renderPayrollFixedValuesPagination(meta) {
    const list = document.getElementById('fixed-values-pagination-list');
    const info = document.getElementById('fixed-values-pagination-info');
    if (!list || !info) return;

    if (!meta || meta.total === 0) {
      info.textContent = 'Mostrando 0 valores fijos';
      list.innerHTML = '';
      return;
    }

    info.textContent = `Mostrando ${this.payrollFixedValues.length} de ${meta.total} valores fijos`;

    const totalPages = meta.totalPages || 1;
    let html = '';

    html += `
      <li class="page-item ${this.payrollFixedValuesPage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${this.payrollFixedValuesPage - 1}" tabindex="-1" aria-disabled="${this.payrollFixedValuesPage === 1}">
          <i class="ti ti-chevron-left"></i>
        </a>
      </li>
    `;

    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= this.payrollFixedValuesPage - 1 && p <= this.payrollFixedValuesPage + 1)) {
        html += `
          <li class="page-item ${p === this.payrollFixedValuesPage ? 'active' : ''}">
            <a class="page-link" href="#" data-page="${p}">${p}</a>
          </li>
        `;
      } else if (p === this.payrollFixedValuesPage - 2 || p === this.payrollFixedValuesPage + 2) {
        html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
      }
    }

    html += `
      <li class="page-item ${this.payrollFixedValuesPage === totalPages ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${this.payrollFixedValuesPage + 1}" aria-disabled="${this.payrollFixedValuesPage === totalPages}">
          <i class="ti ti-chevron-right"></i>
        </a>
      </li>
    `;

    list.innerHTML = html;

    list.querySelectorAll('.page-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const p = Number(link.dataset.page);
        if (p >= 1 && p <= totalPages && p !== this.payrollFixedValuesPage) {
          this.payrollFixedValuesPage = p;
          this.loadPayrollFixedValues();
        }
      });
    });
  }

  openNewFixedValueModal() {
    document.getElementById('fixed-value-form-id').value = '';
    document.getElementById('modal-fixed-value-form-title').textContent = 'Nuevo Valor Fijo';
    document.getElementById('fixed-value-input-code').value = '';
    document.getElementById('fixed-value-input-code').readOnly = false;
    document.getElementById('fixed-value-input-name').value = '';
    document.getElementById('fixed-value-input-value').value = '';
    document.getElementById('fixed-value-input-unit').value = '$';
    document.getElementById('fixed-value-unit-addon').textContent = '$';
    document.getElementById('fixed-value-input-desc').value = '';
    document.getElementById('fixed-value-input-active').checked = true;

    const alertBox = document.getElementById('fixed-value-form-alert');
    if (alertBox) {
      alertBox.classList.add('d-none');
      alertBox.textContent = '';
    }

    const modalEl = document.getElementById('modal-fixed-value-form');
    if (modalEl) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  }

  async editFixedValue(id) {
    try {
      const res = await apiRequest(`/payroll/fixed-values/${id}`);
      const fv = res.data;
      if (!fv) return;

      document.getElementById('fixed-value-form-id').value = fv.id;
      document.getElementById('modal-fixed-value-form-title').textContent = 'Editar Valor Fijo';
      document.getElementById('fixed-value-input-code').value = fv.code;
      document.getElementById('fixed-value-input-code').readOnly = false;
      document.getElementById('fixed-value-input-name').value = fv.name;
      document.getElementById('fixed-value-input-value').value = fv.value;
      document.getElementById('fixed-value-input-unit').value = fv.unit || '$';
      document.getElementById('fixed-value-unit-addon').textContent = fv.unit || '$';
      document.getElementById('fixed-value-input-desc').value = fv.description || '';
      document.getElementById('fixed-value-input-active').checked = Boolean(fv.isActive);

      const alertBox = document.getElementById('fixed-value-form-alert');
      if (alertBox) {
        alertBox.classList.add('d-none');
        alertBox.textContent = '';
      }

      const modalEl = document.getElementById('modal-fixed-value-form');
      if (modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
      }
    } catch (err) {
      showToast(err.message || 'Error al obtener datos del valor fijo', 'danger');
    }
  }

  async saveFixedValue() {
    const id = document.getElementById('fixed-value-form-id').value;
    const code = document.getElementById('fixed-value-input-code').value.trim().toUpperCase().replace(/\s+/g, '_');
    const name = document.getElementById('fixed-value-input-name').value.trim();
    const value = Number(document.getElementById('fixed-value-input-value').value);
    const unit = document.getElementById('fixed-value-input-unit').value.trim();
    const description = document.getElementById('fixed-value-input-desc').value.trim();
    const isActive = document.getElementById('fixed-value-input-active').checked;

    const alertBox = document.getElementById('fixed-value-form-alert');
    if (alertBox) {
      alertBox.classList.add('d-none');
      alertBox.textContent = '';
    }

    if (!code || !name) {
      if (alertBox) {
        alertBox.textContent = 'El código y la denominación son obligatorios.';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    const payload = {
      code,
      name,
      value: isNaN(value) ? 0 : value,
      unit: unit || '$',
      description: description || null,
      isActive,
    };

    const btn = document.getElementById('btn-save-fixed-value');
    if (btn) btn.disabled = true;

    try {
      if (id) {
        await apiRequest(`/payroll/fixed-values/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('Valor fijo actualizado correctamente', 'success');
      } else {
        await apiRequest('/payroll/fixed-values', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Valor fijo creado exitosamente', 'success');
      }

      const modalEl = document.getElementById('modal-fixed-value-form');
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }

      await this.loadPayrollFixedValues();
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al guardar el valor fijo';
        alertBox.classList.remove('d-none');
      } else {
        showToast(err.message || 'Error al guardar el valor fijo', 'danger');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  confirmDeleteFixedValue(id, code) {
    const codeEl = document.getElementById('delete-fixed-value-code');
    if (codeEl) codeEl.textContent = `[${code}]`;

    const btnConfirm = document.getElementById('btn-confirm-delete-fixed-value');
    if (btnConfirm) {
      btnConfirm.onclick = async () => {
        try {
          btnConfirm.disabled = true;
          await apiRequest(`/payroll/fixed-values/${id}`, { method: 'DELETE' });
          showToast('Valor fijo eliminado correctamente', 'success');

          const modalEl = document.getElementById('modal-delete-fixed-value-confirm');
          if (modalEl) {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
          }

          await this.loadPayrollFixedValues();
        } catch (err) {
          showToast(err.message || 'Error al eliminar el valor fijo', 'danger');
        } finally {
          btnConfirm.disabled = false;
        }
      };
    }

    const modalEl = document.getElementById('modal-delete-fixed-value-confirm');
    if (modalEl) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  }

  populateFormulaFixedValuesSelect() {
    const sel = document.getElementById('formula-select-fixed-value');
    if (!sel) return;

    let html = '<option value="">-- Seleccionar Valor Fijo para insertar en la fórmula --</option>';
    for (const fv of this.payrollFixedValues) {
      if (fv.isActive) {
        const formatted = fv.unit === '$' ? `$ ${formatNumber(fv.value, 2)}` : `${formatNumber(fv.value, 2)} ${escapeHtml(fv.unit || '')}`;
        html += `<option value="${escapeHtml(fv.code)}">[${escapeHtml(fv.code)}] ${escapeHtml(fv.name)} (${formatted})</option>`;
      }
    }
    sel.innerHTML = html;
  }

  // --- Parámetros y Alícuotas Patronales (Pestaña Dedicada) ---

  async loadPayrollSettings() {
    try {
      const res = await apiRequest('/payroll/settings');
      this.payrollSettings = res.data;
      const s = this.payrollSettings;

      if (s) {
        const empType = document.getElementById('settings-employer-type');
        if (empType) empType.value = s.employerType || 'SERVICIOS_COMERCIO';

        const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el && val !== undefined) el.value = val;
        };

        setVal('settings-detraction-base', s.detractionBase);
        setVal('settings-sipa-rate', s.sipaRate);
        setVal('settings-inssjyp-rate', s.inssjypRate);
        setVal('settings-os-rate', s.osRate);
        setVal('settings-fne-rate', s.fneRate);
        setVal('settings-aaff-rate', s.aaffRate);
        setVal('settings-art-rate', s.artRate);
        setVal('settings-art-fixed', s.artFixedFee);
        setVal('settings-scvo-fee', s.scvoFee);
        setVal('settings-anses-min', s.ansesMinCap);
        setVal('settings-anses-max', s.ansesMaxCap);
        setVal('settings-standard-weekly-hours', s.standardWeeklyHoursFormatted || this.formatDecimalToHours(s.standardWeeklyHours, '48:00'));
        setVal('settings-standard-monthly-hours', s.standardMonthlyHoursFormatted || this.formatDecimalToHours(s.standardMonthlyHours, '200:00'));
      }
    } catch (err) {
      console.warn('Error al cargar parámetros patronales:', err.message);
    }
  }

  async savePayrollSettings() {
    const submitBtn = document.getElementById('btn-save-payroll-settings');
    const alertBox = document.getElementById('payroll-settings-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const payload = {
      employerType: document.getElementById('settings-employer-type').value,
      detractionBase: Number(document.getElementById('settings-detraction-base').value),
      sipaRate: Number(document.getElementById('settings-sipa-rate').value),
      inssjypRate: Number(document.getElementById('settings-inssjyp-rate').value),
      osRate: Number(document.getElementById('settings-os-rate').value),
      fneRate: Number(document.getElementById('settings-fne-rate').value),
      aaffRate: Number(document.getElementById('settings-aaff-rate').value),
      artRate: Number(document.getElementById('settings-art-rate').value),
      artFixedFee: Number(document.getElementById('settings-art-fixed').value),
      scvoFee: Number(document.getElementById('settings-scvo-fee').value),
      ansesMinCap: Number(document.getElementById('settings-anses-min').value),
      ansesMaxCap: Number(document.getElementById('settings-anses-max').value),
      standardWeeklyHours: document.getElementById('settings-standard-weekly-hours')?.value?.trim() || '48:00',
      standardMonthlyHours: document.getElementById('settings-standard-monthly-hours')?.value?.trim() || '200:00',
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando...';

    try {
      await apiRequest('/payroll/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      showToast('Parámetros y alícuotas patronales actualizados con éxito');
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al actualizar parámetros';
        alertBox.classList.remove('d-none');
      }
      showToast(err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="ti ti-device-floppy me-2"></i> Guardar Parámetros y Alícuotas';
    }
  }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  const app = new AppController();
  app.init();
});
