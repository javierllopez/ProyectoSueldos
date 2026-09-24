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


class CompanyProfileMethods {
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
}

export function registerCompanyProfileMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(CompanyProfileMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
