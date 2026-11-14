import { apiRequest, storage, showToast } from '../../api.js?v=2.1';
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
} from '../../utils/helpers.js';


class MixinMethods {
  async renderPersonnelView() {
    if (!this.activeCompany) {
      showToast('Por favor selecciona una empresa activa primero', 'warning');
      return;
    }

    const persTenantName = document.getElementById('personnel-header-company-name');
    if (persTenantName && this.activeCompany) {
      persTenantName.textContent = this.activeCompany.name;
    }

    // Invalidar cachés operativas al reingresar a Personal sin disparar peticiones hasta abrir modales
    this._empModalAuxCompanyId = null;
    this._affilConceptsCompanyId = null;

    try {
      await this.loadPersonnelAuxiliaryData();
      await this.loadEmployees();
      this.loadDisciplinaryCatalogs?.();
    } catch (err) {
      console.error('Error al cargar datos del módulo de personal:', err);
      showToast(err.message || 'Error al cargar personal', 'danger');
    }
  }

  async _ensureCompanyCachedCatalog(key, fetcher, force = false) {
    const companyId = this.activeCompany?.id || storage.getActiveCompanyId() || null;
    const loadedKey = `${key}CompanyId`;
    const promiseKey = `${key}Promise`;
    const promiseCompanyKey = `${key}PromiseCompanyId`;

    if (!force && this[loadedKey] === companyId) {
      return;
    }
    if (!force && this[promiseKey] && this[promiseCompanyKey] === companyId) {
      return this[promiseKey];
    }

    this[promiseCompanyKey] = companyId;
    this[promiseKey] = Promise.resolve()
      .then(fetcher)
      .then((res) => {
        if ((this.activeCompany?.id || storage.getActiveCompanyId() || null) === companyId) {
          this[loadedKey] = companyId;
        }
        return res;
      })
      .finally(() => {
        if (this[promiseCompanyKey] === companyId) {
          this[promiseKey] = null;
        }
      });

    return this[promiseKey];
  }

  async ensureArcaReferenceCatalogsLoaded(force = false) {
    return this._ensureCompanyCachedCatalog('_arcaRef', async () => {
      const [catRes, posRes, servRes, cctRes, modRes, actRes] = await Promise.all([
        apiRequest('/arca-categories'),
        apiRequest('/arca-positions'),
        apiRequest('/arca-service-types'),
        this.ensureArcaCctsLoaded ? this.ensureArcaCctsLoaded(force).then((data) => ({ data })) : apiRequest('/arca-ccts'),
        apiRequest('/arca-contract-modalities'),
        apiRequest('/arca-activities').catch(() => ({ data: ARCA_T03_ACTIVITIES })),
      ]);

      this.arcaCategories = catRes?.data || [];
      this.arcaPositions = posRes?.data || [];
      this.arcaServiceTypes = servRes?.data || [];
      this.arcaCcts = cctRes?.data || [];
      this.arcaContractModalities = modRes?.data || [];
      this.arcaActivities = (actRes && actRes.data && actRes.data.length > 0) ? actRes.data : ARCA_T03_ACTIVITIES;
    }, force);
  }

  async ensureEmployeeModalAuxiliaryLoaded(force = false) {
    return this._ensureCompanyCachedCatalog('_empModalAux', async () => {
      const [profileRes, payrollSettingsRes, paymentMethodsRes] = await Promise.all([
        apiRequest('/companies/profile').catch(() => ({ data: null })),
        apiRequest('/payroll/settings').catch(() => ({ data: null })),
        apiRequest('/payment-methods').catch(() => ({ data: [] })),
      ]);

      if (profileRes && profileRes.data) {
        this.activeCompanyProfile = profileRes.data;
      }
      if (payrollSettingsRes && payrollSettingsRes.data) {
        this.payrollSettings = payrollSettingsRes.data;
      }
      this.paymentMethods = paymentMethodsRes?.data || [];
    }, force);
  }

  async ensureAffiliationConceptsLoaded(force = false) {
    return this._ensureCompanyCachedCatalog('_affilConcepts', async () => {
      const deductionConceptsRes = await apiRequest('/payroll/concepts?limit=500&type=DEDUCTION').catch(() => ({ data: [] }));
      this.deductionConcepts = (deductionConceptsRes && deductionConceptsRes.data && (Array.isArray(deductionConceptsRes.data) ? deductionConceptsRes.data : deductionConceptsRes.data.items)) || [];
    }, force);
  }

  async loadPersonnelAuxiliaryData() {
    // Mostrar feedback de carga (Skeleton Pulse & Spinner) en tablas auxiliares
    const setTableLoading = (tbodyId, colspan, text, pagContainerId) => {
      const tb = document.getElementById(tbodyId);
      const pag = document.getElementById(pagContainerId);
      if (pag) pag.classList.add('d-none');
      if (tb) {
        tb.innerHTML = `
          <tr>
            <td colspan="${colspan}" class="text-center py-5">
              <div class="d-flex flex-column align-items-center justify-content-center gap-2">
                <div class="spinner-border text-success" style="width: 2rem; height: 2rem; color: var(--pers-emerald-600) !important;" role="status"></div>
                <div class="fw-bold mt-2" style="color: var(--pers-forest-900); font-family: 'Plus Jakarta Sans', sans-serif;">${escapeHtml(text)}</div>
                <div class="w-75 mt-2">
                  <div class="pers-skeleton-row"></div>
                  <div class="pers-skeleton-row" style="width: 80%; margin: 8px auto;"></div>
                </div>
              </div>
            </td>
          </tr>
        `;
      }
    };

    setTableLoading('departments-table-body', 4, 'Cargando sectores...', 'departments-pagination-container');
    setTableLoading('job-positions-table-body', 4, 'Cargando puestos de trabajo...', 'job-positions-pagination-container');
    setTableLoading('work-shifts-table-body', 10, 'Cargando jornadas de trabajo...', 'work-shifts-pagination-container');
    setTableLoading('health-insurances-table-body', 4, 'Cargando obras sociales...', 'health-insurances-pagination-container');
    setTableLoading('unions-table-body', 5, 'Cargando sindicatos...', 'unions-pagination-container');
    setTableLoading('mutuals-table-body', 5, 'Cargando mutuales...', 'mutuals-pagination-container');
    setTableLoading('kinships-table-body', 4, 'Cargando parentescos...', 'kinships-pagination-container');

    const [deptRes, jobRes, shiftRes, hiRes, unionRes, mutualRes, kinRes, salaryScalesRes] = await Promise.all([
      apiRequest('/departments'),
      apiRequest('/job-positions'),
      apiRequest('/work-shifts').catch(() => ({ data: [] })),
      apiRequest('/health-insurances'),
      apiRequest('/unions'),
      apiRequest('/mutuals'),
      apiRequest('/kinships'),
      apiRequest('/payroll/salary-scales').catch(() => ({ data: [] })),
    ]);

    this.departments = deptRes.data || [];
    this.jobPositions = jobRes.data || [];
    this.workShifts = shiftRes.data || [];
    this.healthInsurances = hiRes.data || [];
    this.unions = unionRes.data || [];
    this.mutuals = mutualRes.data || [];
    this.kinships = kinRes.data || [];
    this.salaryScales = salaryScalesRes.data || [];
    this.payrollSalaryScales = this.salaryScales;

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


  switchPersonnelPane(targetSelector) {
    if (!targetSelector) return;

    // 1. Actualizar clases activas en la barra lateral
    const sidebarNav = document.getElementById('personnel-sidebar-nav');
    if (sidebarNav) {
      sidebarNav.querySelectorAll('.pers-nav-link, .personnel-nav-item, .pers-sub-link, .personnel-sub-item').forEach((x) => {
        const target = x.getAttribute('data-bs-target') || x.getAttribute('href');
        if (target === targetSelector) {
          x.classList.add('active');
          // Si es un sub-ítem dentro de un acordeón, asegurar que el menú padre esté desplegado
          const submenu = x.closest('.collapse');
          if (submenu) {
            const parentCollapse = document.querySelector(`[data-bs-target="#${submenu.id}"]`);
            if (parentCollapse) {
              parentCollapse.classList.remove('collapsed');
              parentCollapse.setAttribute('aria-expanded', 'true');
            }
            if (window.bootstrap?.Collapse) {
              const inst = window.bootstrap.Collapse.getOrCreateInstance(submenu, { toggle: false });
              inst.show();
            } else {
              submenu.classList.add('show');
            }
          }
        } else {
          x.classList.remove('active');
        }
      });
    }

    // 2. Ocultar todos los panes de primer nivel y activar el seleccionado (sin desactivar sub-pestañas internas)
    const tabContent = document.getElementById('personnel-tab-content');
    if (tabContent) {
      tabContent.querySelectorAll(':scope > .tab-pane').forEach((pane) => {
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
    } else if (targetSelector === '#pane-personnel-disc-tables') {
      this.loadDisciplinaryCatalogs?.();
    } else if (targetSelector === '#pane-personnel-disc-records') {
      this.loadDisciplinaryRecordsView?.();
    } else if (targetSelector === '#pane-personnel-disc-reports') {
      this.loadDisciplinaryCatalogs?.();
    }
  }

  setupPersonnelModals() {
    // Manejador de navegación de la barra lateral izquierda del módulo (ítems principales y submenúes)
    const sidebarNav = document.getElementById('personnel-sidebar-nav');
    if (sidebarNav) {
      // Ítems principales (Nómina de Personal)
      sidebarNav.querySelectorAll('.pers-nav-link, .personnel-nav-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const target = item.getAttribute('data-bs-target') || item.getAttribute('href');
          if (target) this.switchPersonnelPane(target);
        });
      });

      // Sub-ítems (Sectores, Puestos, Obras Sociales, Sindicatos, Mutuales)
      sidebarNav.querySelectorAll('.pers-sub-link, .personnel-sub-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const target = item.getAttribute('data-bs-target') || item.getAttribute('href');
          if (target) this.switchPersonnelPane(target);
        });
      });

      // Padres de acordeón (despliegue manual garantizado con prevención de doble toggle)
      sidebarNav.querySelectorAll('.pers-nav-parent, .personnel-parent-item').forEach((parent) => {
        parent.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetCollapseId = parent.getAttribute('data-bs-target');
          if (targetCollapseId) {
            const collapseEl = document.querySelector(targetCollapseId);
            if (collapseEl) {
              if (window.bootstrap?.Collapse) {
                const inst = window.bootstrap.Collapse.getOrCreateInstance(collapseEl);
                inst.toggle();
              } else {
                collapseEl.classList.toggle('show');
                const isShown = collapseEl.classList.contains('show');
                parent.classList.toggle('collapsed', !isShown);
                parent.setAttribute('aria-expanded', isShown ? 'true' : 'false');
              }
            }
          }
        });
      });

      // Sincronización precisa de chevron y aria-expanded mediante eventos nativos del collapse
      sidebarNav.querySelectorAll('.collapse').forEach((collapseEl) => {
        collapseEl.addEventListener('show.bs.collapse', () => {
          const parent = sidebarNav.querySelector(`[data-bs-target="#${collapseEl.id}"]`);
          if (parent) {
            parent.classList.remove('collapsed');
            parent.setAttribute('aria-expanded', 'true');
          }
        });
        collapseEl.addEventListener('hide.bs.collapse', () => {
          const parent = sidebarNav.querySelector(`[data-bs-target="#${collapseEl.id}"]`);
          if (parent) {
            parent.classList.add('collapsed');
            parent.setAttribute('aria-expanded', 'false');
          }
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

    document.getElementById('employee-input-status')?.addEventListener('change', (e) => {
      const row = document.getElementById('employee-termination-fields-row');
      if (row) row.classList.toggle('d-none', e.target.value !== 'INACTIVE');
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

    // Evento al posar el puntero del mouse sobre la foto del empleado en la ficha de edición
    photoWrapper?.addEventListener('mouseenter', () => {
      const currentPhoto = photoDataInput?.value?.trim();
      if (!currentPhoto) return;
      const lName = document.getElementById('employee-input-last-name')?.value?.trim() || '';
      const fName = document.getElementById('employee-input-first-name')?.value?.trim() || '';
      const fullName = [lName, fName].filter(Boolean).join(', ') || 'Foto del Colaborador';
      this.showEmployeePhotoZoom(currentPhoto, fullName, photoWrapper.getBoundingClientRect());
    });

    photoWrapper?.addEventListener('mouseleave', () => {
      this.hideEmployeePhotoZoom();
    });

    document.getElementById('modal-employee-form')?.addEventListener('hide.bs.modal', () => {
      this.hideEmployeePhotoZoom();
    });

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
          // Redimensionar en canvas a max 480x480 para almacenamiento ligero y ampliación nítida del rostro
          const maxDim = 480;
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
      this.hideEmployeePhotoZoom();
      if (photoFileInput) photoFileInput.value = '';
      if (photoDataInput) photoDataInput.value = '';
      if (photoPreviewAvatar) {
        photoPreviewAvatar.style.backgroundImage = '';
      }
      if (photoIconPlaceholder) photoIconPlaceholder.classList.remove('d-none');
      if (btnRemovePhoto) btnRemovePhoto.classList.add('d-none');
    });

    // Cambio reactivo de puesto de trabajo para actualizar Encuadre Normativo (Pestaña 3) y filtrar Nómina (Pestaña 6)
    document.getElementById('employee-input-job-position')?.addEventListener('change', (e) => {
      this.updateEmployeeEncuadrePreview(e.target.value);
      this.updateSalaryScaleOptions(undefined, undefined, {
        selectedJobPositionId: e.target.value,
        isUserJobChange: true,
      });
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

    // Selector de Forma de Pago en Tab 6
    document.getElementById('employee-select-payment-method')?.addEventListener('change', (e) => {
      this.updateEmployeePaymentMethodDesc(e.target.value);
    });

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
          terminationDate: document.getElementById('employee-input-status')?.value === 'INACTIVE'
            ? (document.getElementById('employee-input-termination-date')?.value || null)
            : null,
          terminationReason: document.getElementById('employee-input-status')?.value === 'INACTIVE'
            ? (document.getElementById('employee-input-termination-reason')?.value?.trim() || null)
            : null,
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
          paymentMethodId: document.getElementById('employee-select-payment-method')?.value || null,
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
            isAdherent: Boolean(r.isAdherent),
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

      const conceptSelectEl = document.getElementById('union-input-concept');
      let conceptIdsVal = [];
      if (conceptSelectEl?.tomselect) {
        const val = conceptSelectEl.tomselect.getValue();
        conceptIdsVal = Array.isArray(val) ? val : (val ? [val] : []);
      } else if (conceptSelectEl) {
        conceptIdsVal = Array.from(conceptSelectEl.selectedOptions).map((o) => o.value).filter(Boolean);
      }
      const applyEmployeesVal = document.getElementById('union-input-apply-employees')?.checked || false;

      const payload = {
        name: nameVal,
        code: codeVal || null,
        conceptIds: conceptIdsVal,
        conceptId: conceptIdsVal[0] || null,
        applyToEmployees: applyEmployeesVal,
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

      const mutConceptSelectEl = document.getElementById('mutual-input-concept');
      let mutConceptIdsVal = [];
      if (mutConceptSelectEl?.tomselect) {
        const val = mutConceptSelectEl.tomselect.getValue();
        mutConceptIdsVal = Array.isArray(val) ? val : (val ? [val] : []);
      } else if (mutConceptSelectEl) {
        mutConceptIdsVal = Array.from(mutConceptSelectEl.selectedOptions).map((o) => o.value).filter(Boolean);
      }
      const applyEmployeesVal = document.getElementById('mutual-input-apply-employees')?.checked || false;

      const payload = {
        name: nameVal,
        code: codeVal || null,
        conceptIds: mutConceptIdsVal,
        conceptId: mutConceptIdsVal[0] || null,
        applyToEmployees: applyEmployeesVal,
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

    // Cambio de Parentesco para validar adherencia a Obra Social (Ley 23.660) y sugerir tipo en Ganancias
    document.getElementById('relative-input-kinship')?.addEventListener('change', () => {
      this.updateAdherentSwitchState();
      this.updateTaxTypeSuggestion();
    });

    // Toggle de contenedor de campos de Impuesto a las Ganancias
    document.getElementById('relative-input-applies-income-tax')?.addEventListener('change', (e) => {
      const container = document.getElementById('relative-income-tax-fields');
      if (container) {
        if (e.target.checked) {
          container.classList.remove('d-none');
          this.updateTaxTypeSuggestion();
        } else {
          container.classList.add('d-none');
        }
      }
    });

    // Toggle de incapacidad laboral
    document.getElementById('relative-input-is-disability')?.addEventListener('change', (e) => {
      const taxTypeSelect = document.getElementById('relative-input-tax-type');
      if (e.target.checked && taxTypeSelect && taxTypeSelect.value === 'CHILD') {
        taxTypeSelect.value = 'DISABLED_CHILD';
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

      const isAdherent = Boolean(document.getElementById('relative-input-is-adherent')?.checked);
      const selectedKin = this.kinships.find((k) => k.id === kinshipId);

      if (isAdherent && this.isPrimaryFamilyKinship(selectedKin)) {
        if (alertBox) {
          alertBox.textContent = 'Los familiares del grupo familiar primario (cónyuge, conviviente, hijos y tutelados) poseen cobertura automática de Obra Social por Ley 23.660 y no pueden registrarse como adherentes.';
          alertBox.classList.remove('d-none');
        }
        return;
      }

      const appliesIncomeTax = Boolean(document.getElementById('relative-input-applies-income-tax')?.checked);
      const incomeTaxDeductionType = appliesIncomeTax ? document.getElementById('relative-input-tax-type')?.value || null : null;
      const deductionPercentage = appliesIncomeTax ? parseFloat(document.getElementById('relative-input-deduction-pct')?.value || '100') : 100;
      const isDisability = appliesIncomeTax ? Boolean(document.getElementById('relative-input-is-disability')?.checked) : false;
      const hasNoIncomeOrBelowMni = appliesIncomeTax ? Boolean(document.getElementById('relative-input-has-no-income')?.checked) : true;
      const validFromMonth = appliesIncomeTax ? parseInt(document.getElementById('relative-input-tax-from-month')?.value || '1', 10) : 1;
      const validToMonth = appliesIncomeTax ? parseInt(document.getElementById('relative-input-tax-to-month')?.value || '12', 10) : 12;

      const relPayload = {
        kinshipId,
        lastName,
        firstName,
        documentType,
        documentNumber,
        cuil: cuilRaw,
        birthDate,
        isAdherent,
        appliesIncomeTax,
        incomeTaxDeductionType,
        deductionPercentage,
        isDisability,
        hasNoIncomeOrBelowMni,
        validFromMonth,
        validToMonth,
      };

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

}

export function registerPersonnelCatalogCoreMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(MixinMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
