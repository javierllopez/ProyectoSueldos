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

}

export function registerAdminMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(AdminMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
