/**
 * Cliente HTTP para consumir la API REST de ProyectoSueldos.
 * Administra tokens JWT, empresa activa y redirecciones automáticas.
 */

const API_BASE = '/api/v1';

export const storage = {
  getToken: () => localStorage.getItem('ps_access_token'),
  getRefreshToken: () => localStorage.getItem('ps_refresh_token'),
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem('ps_user'));
    } catch {
      return null;
    }
  },
  getActiveCompanyId: () => localStorage.getItem('ps_active_company_id'),

  setSession: ({ accessToken, refreshToken, user }) => {
    if (accessToken) localStorage.setItem('ps_access_token', accessToken);
    if (refreshToken) localStorage.setItem('ps_refresh_token', refreshToken);
    if (user) localStorage.setItem('ps_user', JSON.stringify(user));
  },

  setUser: (user) => {
    localStorage.setItem('ps_user', JSON.stringify(user));
  },

  setActiveCompanyId: (companyId) => {
    if (companyId) {
      localStorage.setItem('ps_active_company_id', companyId);
    } else {
      localStorage.removeItem('ps_active_company_id');
    }
  },

  clearSession: () => {
    localStorage.removeItem('ps_access_token');
    localStorage.removeItem('ps_refresh_token');
    localStorage.removeItem('ps_user');
    localStorage.removeItem('ps_active_company_id');
  },
};

/**
 * Realiza una petición a la API REST inyectando cabeceras de auth y tenant.
 */
export async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const token = storage.getToken();
  const activeCompanyId = storage.getActiveCompanyId();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (activeCompanyId) {
    headers['x-company-id'] = activeCompanyId;
  }

  try {
    let response = await fetch(url, {
      ...options,
      headers,
    });

    // Si recibimos 401 y tenemos refresh token, intentar renovar la sesión
    if (response.status === 401 && storage.getRefreshToken() && !endpoint.includes('/auth/')) {
      const refreshed = await attemptTokenRefresh();
      if (refreshed) {
        // Reintentar la petición original con el nuevo token
        headers['Authorization'] = `Bearer ${storage.getToken()}`;
        response = await fetch(url, {
          ...options,
          headers,
        });
      } else {
        storage.clearSession();
        window.location.href = '/login.html?expired=1';
        return;
      }
    }

    if (response.status === 204) {
      return null;
    }

    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { error: { message: text || response.statusText || 'Error en la petición' } };
    }

    if (!response.ok) {
      const error = new Error(data.error?.message || `Error ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.details = data.error?.details || [];
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Intenta refrescar el Access Token usando el Refresh Token almacenado.
 */
async function attemptTokenRefresh() {
  const refreshToken = storage.getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    storage.setSession({
      accessToken: data.data.accessToken,
      refreshToken: data.data.refreshToken,
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Muestra una notificación flotante (Toast) usando clases de Tabler/Bootstrap.
 */
export function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toastEl = document.createElement('div');
  const bgClass = type === 'success' ? 'bg-success text-white' : type === 'danger' ? 'bg-danger text-white' : 'bg-primary text-white';
  const icon = type === 'success' ? 'ti-check' : type === 'danger' ? 'ti-alert-triangle' : 'ti-info-circle';

  toastEl.className = `toast align-items-center ${bgClass} border-0 show mb-2 shadow`;
  toastEl.setAttribute('role', 'alert');
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body d-flex align-items-center gap-2">
        <i class="ti ${icon}"></i>
        <span>${message}</span>
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;

  container.appendChild(toastEl);

  setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.remove(), 300);
  }, 4000);
}

/**
 * Sanitiza texto para evitar inyecciones HTML en strings dinámicos.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

