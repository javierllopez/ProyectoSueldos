// public/js/utils/helpers.js
// Funciones de validación, formateo de CUIT/CBU/Horas, utilidades DOM y TomSelect

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

// Catálogo oficial de Códigos de Actividad de la Seguridad Social ARCA / AFIP (Tabla T03 - SICOSS / LSD)
export const ARCA_T03_ACTIVITIES = [
  { code: '049', t03Code: '49', name: 'Actividades no clasificadas (General / Comercio / Industria / Servicios)', description: 'Régimen general estándar para comercio, servicios e industria privada no encuadrada en regímenes especiales.' },
  { code: '000', t03Code: '00', name: 'Zona de Desastre (Decreto Nº 1386/01)', description: 'Zonas de desastre declaradas oficialmente según Decreto 1386/01 (excepto actividad agropecuaria).' },
  { code: '001', t03Code: '01', name: 'Producción Primaria (excepto agropecuaria)', description: 'Explotación de minas, canteras, extracción de petróleo y gas, pesca marítima y fluvial.' },
  { code: '002', t03Code: '02', name: 'Producción de bienes sin comercialización', description: 'Fabricación y manufactura directa de bienes sin etapa de venta o distribución comercial integrada.' },
  { code: '003', t03Code: '03', name: 'Construcción de inmuebles', description: 'Obras de arquitectura, ingeniería civil y construcción de edificios residenciales o comerciales.' },
  { code: '004', t03Code: '04', name: 'Turismo', description: 'Servicios de hotelería, agencias de viaje y actividades de fomento turístico.' },
  { code: '005', t03Code: '05', name: 'Investigación Científica y Tecnológica', description: 'Desarrollo tecnológico, laboratorios científicos e innovación bajo regímenes de promoción.' },
  { code: '006', t03Code: '06', name: 'Administración Pública (Con Obra Social Ley 23.660)', description: 'Organismos del sector público centralizado o descentralizado con cobertura de obra social nacional.' },
  { code: '007', t03Code: '07', name: 'Enseñanza Privada (Ley 13.047 - No Decreto 137/05)', description: 'Institutos y colegios de enseñanza privada regulados por Ley 13.047 fuera del régimen especial de jubilación docente.' },
  { code: '008', t03Code: '08', name: 'Servicio Doméstico / Régimen Casas Particulares', description: 'Personal contratado bajo el régimen de trabajo para el personal de casas particulares.' },
  { code: '009', t03Code: '09', name: 'Servicios energéticos (Res. MTESS 268 y 824/09)', description: 'Generación, transporte y distribución de energía eléctrica, gas y combustibles.' },
  { code: '010', t03Code: '10', name: 'Universidades Privadas - Personal no docente (Decreto 1123/99)', description: 'Personal administrativo, de maestranza y de servicios generales en universidades privadas reconocidas.' },
  { code: '011', t03Code: '11', name: 'Personal Permanente Discontinuo de Empresas de Servicios Eventuales', description: 'Trabajadores asignados por empresas de servicios eventuales a empresas usuarias.' },
  { code: '012', t03Code: '12', name: 'Programas Intensivos de Trabajo (PIT)', description: 'Planes de inserción y entrenamiento laboral intensivo bajo convenios estatales.' },
  { code: '013', t03Code: '13', name: 'Personal Embarcado', description: 'Tripulación de buques y embarcaciones marítimas, fluviales y lacustres de bandera nacional.' },
  { code: '014', t03Code: '14', name: 'Personal Embarcado (Decreto 1255/98 s/Res. SSS 18/99)', description: 'Personal de navegación con encuadre específico y retenciones previsionales según Decreto 1255/98.' },
  { code: '015', t03Code: '15', name: 'L.R.T. —Directores S.A., entes mixtos y municipales—', description: 'Directores de sociedades anónimas y funcionarios que aportan exclusivamente a la Ley de Riesgos del Trabajo.' },
  { code: '016', t03Code: '16', name: 'No obligados al SIJP (Colegios profesionales, reciprocidad)', description: 'Profesionales afiliados a cajas provinciales o sistemas con convenio de reciprocidad jubilatoria.' },
  { code: '017', t03Code: '17', name: 'Obligados al SIJP - Sin Obra Social Nacional', description: 'Personal estatal o regímenes provinciales con aportes al SIJP y cobertura en cajas u obras sociales provinciales.' },
  { code: '018', t03Code: '18', name: 'Provincia incorporada al SIJP sin O.S. nacional con ART', description: 'Regímenes de provincias transferidas con aportes previsionales nacionales y seguro de riesgos del trabajo.' },
  { code: '019', t03Code: '19', name: 'Provincia incorporada al SIJP sin O.S. nacional sin ART', description: 'Regímenes de provincias transferidas con autoseguro provincial para riesgos del trabajo.' },
  { code: '020', t03Code: '20', name: 'Ley Nº 24.331 - Zona Franca', description: 'Trabajadores dependientes en establecimientos radicados dentro de zonas francas nacionales.' },
  { code: '021', t03Code: '21', name: 'Empresas del Estado con Obra Social y FNE (Dec. 1024/93)', description: 'Sociedades del Estado y entes públicos con aportes a obras sociales sindicales y Fondo Nacional de Empleo.' },
  { code: '022', t03Code: '22', name: 'Empresas del Estado sin Obra Social y con FNE (Dec. 1024/93)', description: 'Entes públicos con cajas asistenciales propias y Fondo Nacional de Empleo.' },
  { code: '029', t03Code: '29', name: 'Personal Embarcado con Obra Social (Dec. 1255/98)', description: 'Personal de a bordo con cobertura de salud provista por obras sociales sindicales de la actividad marítima.' },
  { code: '030', t03Code: '30', name: 'AFA (Decreto 1212/03) - Aportante Autónomo', description: 'Régimen especial de futbolistas y personal de clubes de fútbol afiliados a AFA.' },
  { code: '031', t03Code: '31', name: 'Trabajador Rural de la Armada Argentina', description: 'Personal civil dependiente de dependencias agropecuarias navales.' },
  { code: '032', t03Code: '32', name: 'CSJN, Magistrados Provinciales, Revisores de Cuentas', description: 'Poder Judicial de la Nación, jueces y magistrados provinciales con régimen jubilatorio especial.' },
  { code: '033', t03Code: '33', name: 'Representante Gremial en uso de licencia', description: 'Dirigentes sindicales con reserva de puesto y licencia gremial legal.' },
  { code: '034', t03Code: '34', name: 'Docentes Estatales Nacionales con Obra Social (Dec. 137/05)', description: 'Docentes de nivel inicial, primario y secundario nacional con alícuota diferencial previsional del 13%.' },
  { code: '035', t03Code: '35', name: 'Docentes Estatales Nacionales sin Obra Social (Dec. 137/05)', description: 'Docentes estatales bajo régimen diferencial previsional con cobertura de obra social provincial.' },
  { code: '041', t03Code: '41', name: 'Construcción - Ley 22.250 / Fondo de Cese Laboral', description: 'Obreros y operarios de la industria de la construcción bajo el régimen del IERIC y Libreta de Trabajo.' },
  { code: '042', t03Code: '42', name: 'Producción Primaria y Bienes con Beneficio Fiscal', description: 'Actividades manufactureras y primarias amparadas por regímenes de reducción o crédito fiscal.' },
  { code: '043', t03Code: '43', name: 'Comercio y Servicios (Régimen General)', description: 'Empresas comerciales mayoristas, minoristas y de servicios al consumidor.' },
  { code: '048', t03Code: '48', name: 'Actividades con Regímenes Previsionales Especiales / Diferenciales', description: 'Trabajadores expuestos a factores de penosidad, insalubridad o regímenes especiales de retiro.' },
  { code: '050', t03Code: '50', name: 'Incapacidad Laboral Temporaria (ILT actividades generales)', description: 'Período cubierto por la Aseguradora de Riesgos del Trabajo (ART) por accidente de trabajo o enfermedad profesional.' },
  { code: '080', t03Code: '80', name: 'Profesionales y Personal de la Salud (Emergencia Sanitaria)', description: 'Personal asistencial y de soporte médico en clínicas, sanatorios y hospitales privados.' },
  { code: '088', t03Code: '88', name: 'Docentes / Enseñanza Privada (Decreto 137/05)', description: 'Docentes de establecimientos educativos privados incorporados a la enseñanza oficial con régimen jubilatorio docente.' },
  { code: '097', t03Code: '97', name: 'Investigadores y Científicos (Decreto 160/05)', description: 'Personal dedicado a la investigación científica y tecnológica con régimen previsional del 85% móvil.' },
  { code: '098', t03Code: '98', name: 'No Docentes Universitarios Nacionales (Decreto 366/06)', description: 'Personal técnico, administrativo y de servicios en universidades públicas nacionales.' },
  { code: '099', t03Code: '99', name: 'Personal de Dirección / Directores con opción relación de dependencia', description: 'Directores de S.A. o socios gerentes de S.R.L. con remuneración formal técnico-administrativa optando por aportes en relación de dependencia.' },
];

export function getArcaActivityInfo(code) {
  if (!code) return { code: '049', t03Code: '49', name: 'Actividades no clasificadas (General / Comercio / Industria / Servicios)', description: 'Régimen general estándar para comercio, servicios e industria privada.' };
  const str = String(code).trim();
  const padded = str.padStart(3, '0');
  const found = ARCA_T03_ACTIVITIES.find((a) => a.code === padded || a.t03Code === str || a.code === str);
  if (found) return found;
  return { code: padded, t03Code: str, name: `Actividad Código ${str}`, description: 'Actividad declarada en el puesto de trabajo' };
}

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
if (typeof window !== 'undefined') window.formatNumber = formatNumber;

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


export {
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
  getDynamicNoveltyControlValue
};
