import { apiRequest, storage, showToast } from './api.js';

// Si el usuario ya está autenticado y accede a login o register, redirigir a app.html
export function checkAlreadyAuthenticated() {
  const token = storage.getToken();
  if (token) {
    window.location.href = '/app.html';
  }
}

// Inicializar página de Login
export function initLoginForm() {
  const form = document.getElementById('login-form');
  const alertBox = document.getElementById('login-alert');
  const demoBtn = document.getElementById('btn-demo-creds');

  if (demoBtn) {
    demoBtn.addEventListener('click', () => {
      document.getElementById('email').value = 'javier_l@yahoo.com';
      document.getElementById('password').value = 'Munrito19!';
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.classList.add('d-none');
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Iniciando sesión...';

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      try {
        const res = await apiRequest('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });

        storage.setSession({
          accessToken: res.data.accessToken,
          refreshToken: res.data.refreshToken,
          user: res.data.user,
        });

        // Si el usuario tiene empresas disponibles, seleccionar la primera por defecto
        if (res.data.companies && res.data.companies.length > 0) {
          storage.setActiveCompanyId(res.data.companies[0].id);
        }

        window.location.href = '/app.html';
      } catch (err) {
        alertBox.textContent = err.message || 'Error al iniciar sesión';
        alertBox.classList.remove('d-none');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Iniciar Sesión';
      }
    });
  }
}

// Inicializar página de Registro
export function initRegisterForm() {
  const form = document.getElementById('register-form');
  const alertBox = document.getElementById('register-alert');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.classList.add('d-none');
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Registrando cuenta...';

      const accountName = document.getElementById('accountName').value.trim();
      const firstName = document.getElementById('firstName').value.trim();
      const lastName = document.getElementById('lastName').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (password !== confirmPassword) {
        alertBox.textContent = 'Las contraseñas no coinciden';
        alertBox.classList.remove('d-none');
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Crear Cuenta';
        return;
      }

      try {
        const res = await apiRequest('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            accountName,
            firstName,
            lastName,
            email,
            password,
          }),
        });

        storage.setSession({
          accessToken: res.data.accessToken,
          refreshToken: res.data.refreshToken,
          user: res.data.user,
        });

        window.location.href = '/app.html';
      } catch (err) {
        if (err.details && err.details.length > 0) {
          alertBox.textContent = err.details.map((d) => d.message).join('. ');
        } else {
          alertBox.textContent = err.message || 'Error al crear la cuenta';
        }
        alertBox.classList.remove('d-none');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Crear Cuenta';
      }
    });
  }
}

// Cierre de sesión
export async function logout() {
  const refreshToken = storage.getRefreshToken();
  try {
    if (refreshToken) {
      await apiRequest('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    }
  } catch (err) {
    console.warn('Error al revocar refresh token:', err.message);
  } finally {
    storage.clearSession();
    window.location.href = '/login.html';
  }
}
