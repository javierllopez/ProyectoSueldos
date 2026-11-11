import { apiRequest, storage, showToast } from '../api.js?v=2.0';
import { formatCuit, escapeHtml, getBootstrapModal } from '../utils/helpers.js';

const CHART_PALETTE = [
  '#0d9488',
  '#2563eb',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#059669',
  '#db2777',
  '#4f46e5',
  '#ea580c',
  '#0284c7',
];

function formatDateAr(val) {
  if (!val) return '-';
  const str = String(val).slice(0, 10);
  const [y, m, d] = str.split('-');
  if (y && m && d) return `${d}/${m}/${y}`;
  return str;
}

function getSeverityBadge(severity) {
  const map = {
    LOW: '<span class="badge bg-azure-lt text-azure">Baja (Leve)</span>',
    MEDIUM: '<span class="badge bg-amber-lt text-amber">Media (Moderada)</span>',
    HIGH: '<span class="badge bg-orange-lt text-orange">Alta (Grave)</span>',
    CRITICAL: '<span class="badge bg-danger-lt text-danger">Crítica (Muy Grave)</span>',
  };
  return map[severity] || `<span class="badge bg-secondary-lt">${escapeHtml(severity || 'MEDIA')}</span>`;
}

function getSeverityText(severity) {
  const map = {
    LOW: 'Baja (Leve)',
    MEDIUM: 'Media (Moderada)',
    HIGH: 'Alta (Grave)',
    CRITICAL: 'Crítica (Muy Grave)',
  };
  return map[severity] || severity || 'Media';
}

class DisciplinaryMethods {
  initDisciplinaryState() {
    if (!this._disciplinaryInitialized) {
      this.discIncidentTypes = [];
      this.discSanctionTypes = [];
      this.discIncidents = [];
      this.discSanctions = [];
      this.currentIncidentAttachments = [];
      this.currentSanctionAttachments = [];
      this.currentSanctionCandidateIncidents = [];
      this.currentDisciplinaryReportData = null;
      this.currentEmployeeDisciplinaryHistory = null;
      this.discApexCharts = [];
      this._disciplinaryInitialized = true;
    }
  }

  setupDisciplinaryModals() {
    this.initDisciplinaryState();

    // Inicializar fechas por defecto en filtros de informes (Año en curso)
    const now = new Date();
    const firstDayYear = `${now.getFullYear()}-01-01`;
    const todayStr = now.toISOString().slice(0, 10);

    const repFrom = document.getElementById('disc-report-date-from');
    const repTo = document.getElementById('disc-report-date-to');
    if (repFrom && !repFrom.value) repFrom.value = firstDayYear;
    if (repTo && !repTo.value) repTo.value = todayStr;

    // Búsqueda en Tablas ABM
    document.getElementById('disc-incident-type-search')?.addEventListener('input', () => {
      this.renderDiscIncidentTypesTable();
    });
    document.getElementById('disc-sanction-type-search')?.addEventListener('input', () => {
      this.renderDiscSanctionTypesTable();
    });

    // Botones Nuevo Tipo de Incidente / Sanción
    document.getElementById('btn-new-disc-incident-type')?.addEventListener('click', () => {
      this.openNewDiscIncidentTypeModal();
    });
    document.getElementById('btn-new-disc-sanction-type')?.addEventListener('click', () => {
      this.openNewDiscSanctionTypeModal();
    });

    // Submit Tipo de Incidente
    document.getElementById('form-disc-incident-type')?.addEventListener('submit', (e) => {
      this.saveDiscIncidentType(e);
    });

    // Submit Tipo de Sanción
    document.getElementById('form-disc-sanction-type')?.addEventListener('submit', (e) => {
      this.saveDiscSanctionType(e);
    });

    // Filtros reactivos en Novedades -> Incidentes
    ['disc-filter-incident-emp', 'disc-filter-incident-type', 'disc-filter-incident-status', 'disc-filter-incident-from', 'disc-filter-incident-to'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => this.loadDiscIncidents());
    });

    // Filtros reactivos en Novedades -> Sanciones
    ['disc-filter-sanction-emp', 'disc-filter-sanction-type', 'disc-filter-sanction-from', 'disc-filter-sanction-to'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => this.loadDiscSanctions());
    });

    // Botones Nuevo Incidente / Nueva Sanción
    document.getElementById('btn-new-disc-incident')?.addEventListener('click', () => {
      this.openNewDiscIncidentModal();
    });
    document.getElementById('btn-new-disc-sanction')?.addEventListener('click', () => {
      this.openNewDiscSanctionModal();
    });

    // Adjuntos en Modal Incidente
    document.getElementById('btn-disc-incident-add-file')?.addEventListener('click', () => {
      document.getElementById('disc-incident-file-input')?.click();
    });
    document.getElementById('disc-incident-file-input')?.addEventListener('change', (e) => {
      this.handleDisciplinaryFileSelect(e, 'INCIDENT');
    });

    // Adjuntos en Modal Sanción
    document.getElementById('btn-disc-sanction-add-file')?.addEventListener('click', () => {
      document.getElementById('disc-sanction-file-input')?.click();
    });
    document.getElementById('disc-sanction-file-input')?.addEventListener('change', (e) => {
      this.handleDisciplinaryFileSelect(e, 'SANCTION');
    });

    // Cambio de Colaborador en Modal Sanción -> Cargar Incidentes del Colaborador
    document.getElementById('disc-sanction-employee')?.addEventListener('change', (e) => {
      this.loadCandidateIncidentsForSanction(e.target.value, []);
    });

    // Cambio de Tipo de Sanción -> habilitar/sugerir días de suspensión
    document.getElementById('disc-sanction-type')?.addEventListener('change', (e) => {
      const st = (this.discSanctionTypes || []).find((t) => t.id === e.target.value);
      const daysInput = document.getElementById('disc-sanction-susp-days');
      if (daysInput && st) {
        if (!st.requiresSuspensionDays) {
          daysInput.value = '0';
        } else if (Number(daysInput.value) === 0) {
          daysInput.value = '1';
        }
      }
    });

    // Submit Incidente y Sanción
    document.getElementById('form-disc-incident')?.addEventListener('submit', (e) => {
      this.saveDiscIncident(e);
    });
    document.getElementById('form-disc-sanction')?.addEventListener('submit', (e) => {
      this.saveDiscSanction(e);
    });

    // Informes Disciplinarios: Emitir en pantalla, Imprimir A4 y Descargar PDF A4
    document.getElementById('btn-disc-report-execute')?.addEventListener('click', () => {
      this.executeDisciplinaryReportInScreen();
    });
    document.getElementById('btn-disc-report-print')?.addEventListener('click', () => {
      this.printCurrentDisciplinaryReportA4();
    });
    document.getElementById('btn-disc-report-pdf')?.addEventListener('click', () => {
      this.downloadCurrentDisciplinaryReportPdf();
    });

    // Pestaña 7 en Legajo del Empleado: Cargar al abrir pestaña + Imprimir A4 + PDF A4
    document.getElementById('tab-btn-emp-disciplinary')?.addEventListener('shown.bs.tab', () => {
      const empId = document.getElementById('employee-form-id')?.value;
      if (empId) {
        this.loadEmployeeDisciplinaryHistoryTab(empId);
      }
    });
    document.getElementById('btn-emp-disc-history-print')?.addEventListener('click', () => {
      this.printEmployeeDisciplinaryHistoryA4();
    });
    document.getElementById('btn-emp-disc-history-pdf')?.addEventListener('click', () => {
      this.downloadEmployeeDisciplinaryHistoryPdf();
    });
  }

  // =========================================================================
  // CARGA DE CATÁLOGOS Y SINCRONIZACIÓN DE SELECTORES
  // =========================================================================

  ensureSubtabsActiveState(containerId, defaultBtnId, defaultPaneId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const activePane = container.querySelector('.tab-content > .tab-pane.active');
    if (!activePane) {
      const activeBtn = container.querySelector('.nav-pills .nav-link.active') || document.getElementById(defaultBtnId);
      if (activeBtn) {
        activeBtn.classList.add('active');
        const targetSel = activeBtn.getAttribute('data-bs-target');
        const pane = (targetSel && container.querySelector(targetSel)) || document.getElementById(defaultPaneId);
        if (pane) pane.classList.add('show', 'active');
      }
    }
  }

  async loadDisciplinaryCatalogs() {
    this.initDisciplinaryState();
    this.ensureSubtabsActiveState(
      'pane-personnel-disc-tables',
      'subtab-btn-incident-types',
      'subpane-disc-incident-types'
    );
    try {
      const [incTypesRes, sancTypesRes] = await Promise.all([
        apiRequest('/disciplinary/incident-types'),
        apiRequest('/disciplinary/sanction-types'),
      ]);
      this.discIncidentTypes = incTypesRes.data || [];
      this.discSanctionTypes = sancTypesRes.data || [];

      this.updateDisciplinaryBadges();
      this.populateDisciplinarySelectors();
      this.renderDiscIncidentTypesTable();
      this.renderDiscSanctionTypesTable();
    } catch (err) {
      console.error('Error al cargar catálogos disciplinarios:', err);
      showToast(err.message || 'Error al cargar tablas disciplinarias', 'danger');
    }
  }

  updateDisciplinaryBadges() {
    const bTables = document.getElementById('personnel-badge-disc-tables-count');
    if (bTables) {
      bTables.textContent = (this.discIncidentTypes?.length || 0) + (this.discSanctionTypes?.length || 0);
    }
    const bIncTypes = document.getElementById('badge-disc-incident-types-count');
    if (bIncTypes) bIncTypes.textContent = this.discIncidentTypes?.length || 0;

    const bSancTypes = document.getElementById('badge-disc-sanction-types-count');
    if (bSancTypes) bSancTypes.textContent = this.discSanctionTypes?.length || 0;

    const bRecords = document.getElementById('personnel-badge-disc-records-count');
    if (bRecords) {
      bRecords.textContent = (this.discIncidents?.length || 0) + (this.discSanctions?.length || 0);
    }
    const bInc = document.getElementById('badge-disc-incidents-count');
    if (bInc) bInc.textContent = this.discIncidents?.length || 0;

    const bSanc = document.getElementById('badge-disc-sanctions-count');
    if (bSanc) bSanc.textContent = this.discSanctions?.length || 0;
  }

  populateDisciplinarySelectors() {
    const employees = this.employees || [];
    const empOptionsHtml = employees
      .map((e) => `<option value="${e.id}">[${escapeHtml(e.fileNumber || '-')}] ${escapeHtml(e.lastName)}, ${escapeHtml(e.firstName)}</option>`)
      .join('');

    // Filtros de empleados
    ['disc-filter-incident-emp', 'disc-filter-sanction-emp', 'disc-report-employee-select'].forEach((id) => {
      const sel = document.getElementById(id);
      if (sel) {
        const cur = sel.value || 'ALL';
        sel.innerHTML = `<option value="ALL">Todos los Colaboradores</option>${empOptionsHtml}`;
        sel.value = cur;
      }
    });

    // Selectores de empleados en modales de carga
    ['disc-incident-employee', 'disc-sanction-employee'].forEach((id) => {
      const sel = document.getElementById(id);
      if (sel) {
        const cur = sel.value || '';
        sel.innerHTML = `<option value="">Seleccionar Colaborador...</option>${empOptionsHtml}`;
        sel.value = cur;
      }
    });

    // Filtros y selectores de Tipos de Incidentes
    const incTypes = this.discIncidentTypes || [];
    const filterIncType = document.getElementById('disc-filter-incident-type');
    if (filterIncType) {
      const cur = filterIncType.value || 'ALL';
      filterIncType.innerHTML =
        '<option value="ALL">Todos los Tipos</option>' +
        incTypes.map((t) => `<option value="${t.id}">[${escapeHtml(t.code)}] ${escapeHtml(t.name)}</option>`).join('');
      filterIncType.value = cur;
    }

    const modalIncType = document.getElementById('disc-incident-type');
    if (modalIncType) {
      const cur = modalIncType.value || '';
      const activeIncTypes = incTypes.filter((t) => t.isActive !== false);
      modalIncType.innerHTML =
        '<option value="">Seleccionar Tipo de Incidente...</option>' +
        activeIncTypes.map((t) => `<option value="${t.id}">[${escapeHtml(t.code)}] ${escapeHtml(t.name)}</option>`).join('');
      modalIncType.value = cur;
    }

    // Filtros y selectores de Tipos de Sanciones
    const sancTypes = this.discSanctionTypes || [];
    const filterSancType = document.getElementById('disc-filter-sanction-type');
    if (filterSancType) {
      const cur = filterSancType.value || 'ALL';
      filterSancType.innerHTML =
        '<option value="ALL">Todos los Tipos</option>' +
        sancTypes.map((t) => `<option value="${t.id}">[${escapeHtml(t.code)}] ${escapeHtml(t.name)}</option>`).join('');
      filterSancType.value = cur;
    }

    const modalSancType = document.getElementById('disc-sanction-type');
    if (modalSancType) {
      const cur = modalSancType.value || '';
      const activeSancTypes = sancTypes.filter((t) => t.isActive !== false);
      modalSancType.innerHTML =
        '<option value="">Seleccionar Tipo de Sanción...</option>' +
        activeSancTypes.map((t) => `<option value="${t.id}">[${escapeHtml(t.code)}] ${escapeHtml(t.name)}</option>`).join('');
      modalSancType.value = cur;
    }
  }

  // =========================================================================
  // 1. ABM DE TIPOS DE INCIDENTES Y TIPOS DE SANCIONES (SUBMENÚ "TABLAS")
  // =========================================================================

  renderDiscIncidentTypesTable() {
    const tbody = document.getElementById('disc-incident-types-tbody');
    if (!tbody) return;

    const search = (document.getElementById('disc-incident-type-search')?.value || '').trim().toLowerCase();
    const list = (this.discIncidentTypes || []).filter((t) => {
      if (!search) return true;
      return (
        (t.code || '').toLowerCase().includes(search) ||
        (t.name || '').toLowerCase().includes(search) ||
        (t.description || '').toLowerCase().includes(search)
      );
    });

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No se encontraron tipos de incidentes registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map((item) => {
        const count = item._count?.incidents ?? 0;
        const statusBadge = item.isActive !== false
          ? '<span class="badge bg-success-lt text-success">Activo</span>'
          : '<span class="badge bg-secondary-lt text-secondary">Inactivo</span>';

        return `
          <tr>
            <td class="font-monospace fw-bold text-dark">${escapeHtml(item.code)}</td>
            <td class="fw-bold text-dark">${escapeHtml(item.name)}</td>
            <td class="text-muted small">${escapeHtml(item.description || '-')}</td>
            <td class="text-center">${getSeverityBadge(item.severity)}</td>
            <td class="text-center"><span class="badge bg-light text-dark border font-monospace">${count}</span></td>
            <td class="text-center">${statusBadge}</td>
            <td class="text-end">
              <div class="d-inline-flex gap-1">
                <button type="button" class="btn btn-sm btn-icon btn-outline-teal btn-edit-disc-inc-type" data-id="${item.id}" title="Editar">
                  <i class="ti ti-edit"></i>
                </button>
                <button type="button" class="btn btn-sm btn-icon btn-outline-danger btn-del-disc-inc-type" data-id="${item.id}" title="Eliminar">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-disc-inc-type').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = this.discIncidentTypes.find((x) => x.id === btn.dataset.id);
        if (item) this.openEditDiscIncidentTypeModal(item);
      });
    });

    tbody.querySelectorAll('.btn-del-disc-inc-type').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = this.discIncidentTypes.find((x) => x.id === btn.dataset.id);
        if (item) this.deleteDiscIncidentType(item);
      });
    });
  }

  openNewDiscIncidentTypeModal() {
    document.getElementById('form-disc-incident-type')?.reset();
    document.getElementById('disc-incident-type-id').value = '';
    document.getElementById('modal-disc-incident-type-title').textContent = 'Nuevo Tipo de Incidente';
    document.getElementById('disc-incident-type-alert')?.classList.add('d-none');
    document.getElementById('disc-incident-type-severity').value = 'MEDIUM';
    document.getElementById('disc-incident-type-active').checked = true;
    getBootstrapModal(document.getElementById('modal-disc-incident-type'))?.show();
  }

  openEditDiscIncidentTypeModal(item) {
    document.getElementById('disc-incident-type-id').value = item.id;
    document.getElementById('modal-disc-incident-type-title').textContent = `Editar Tipo de Incidente: ${item.code}`;
    document.getElementById('disc-incident-type-alert')?.classList.add('d-none');
    document.getElementById('disc-incident-type-code').value = item.code || '';
    document.getElementById('disc-incident-type-name').value = item.name || '';
    document.getElementById('disc-incident-type-desc').value = item.description || '';
    document.getElementById('disc-incident-type-severity').value = item.severity || 'MEDIUM';
    document.getElementById('disc-incident-type-active').checked = item.isActive !== false;
    getBootstrapModal(document.getElementById('modal-disc-incident-type'))?.show();
  }

  async saveDiscIncidentType(e) {
    e.preventDefault();
    const id = document.getElementById('disc-incident-type-id').value;
    const alertBox = document.getElementById('disc-incident-type-alert');
    const submitBtn = document.getElementById('btn-save-disc-incident-type');
    if (alertBox) alertBox.classList.add('d-none');

    const payload = {
      code: document.getElementById('disc-incident-type-code').value.trim().toUpperCase(),
      name: document.getElementById('disc-incident-type-name').value.trim(),
      description: document.getElementById('disc-incident-type-desc').value.trim() || null,
      severity: document.getElementById('disc-incident-type-severity').value,
      isActive: Boolean(document.getElementById('disc-incident-type-active').checked),
    };

    if (submitBtn) submitBtn.disabled = true;
    try {
      if (id) {
        await apiRequest(`/disciplinary/incident-types/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        showToast('Tipo de incidente actualizado correctamente');
      } else {
        await apiRequest('/disciplinary/incident-types', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Tipo de incidente creado exitosamente');
      }
      getBootstrapModal(document.getElementById('modal-disc-incident-type'))?.hide();
      await this.loadDisciplinaryCatalogs();
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al guardar tipo de incidente';
        alertBox.classList.remove('d-none');
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  deleteDiscIncidentType(item) {
    this.confirmDeleteAction({
      title: 'Eliminar Tipo de Incidente',
      message: `¿Confirmás la eliminación del tipo de incidente <strong>"[${escapeHtml(item.code)}] ${escapeHtml(item.name)}"</strong>?`,
      onConfirm: async () => {
        await apiRequest(`/disciplinary/incident-types/${item.id}`, { method: 'DELETE' });
        showToast('Tipo de incidente eliminado');
        await this.loadDisciplinaryCatalogs();
      },
    });
  }

  // --- Tipos de Sanciones ---

  renderDiscSanctionTypesTable() {
    const tbody = document.getElementById('disc-sanction-types-tbody');
    if (!tbody) return;

    const search = (document.getElementById('disc-sanction-type-search')?.value || '').trim().toLowerCase();
    const list = (this.discSanctionTypes || []).filter((t) => {
      if (!search) return true;
      return (
        (t.code || '').toLowerCase().includes(search) ||
        (t.name || '').toLowerCase().includes(search) ||
        (t.description || '').toLowerCase().includes(search)
      );
    });

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No se encontraron tipos de sanciones registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map((item) => {
        const count = item._count?.sanctions ?? 0;
        const statusBadge = item.isActive !== false
          ? '<span class="badge bg-success-lt text-success">Activo</span>'
          : '<span class="badge bg-secondary-lt text-secondary">Inactivo</span>';
        const suspBadge = item.requiresSuspensionDays
          ? '<span class="badge bg-purple-lt text-purple">Sí (Suspensión)</span>'
          : '<span class="badge bg-light text-muted border">No</span>';

        return `
          <tr>
            <td class="font-monospace fw-bold text-dark">${escapeHtml(item.code)}</td>
            <td class="fw-bold text-dark">${escapeHtml(item.name)}</td>
            <td class="text-muted small">${escapeHtml(item.description || '-')}</td>
            <td class="text-center">${getSeverityBadge(item.severity)}</td>
            <td class="text-center">${suspBadge}</td>
            <td class="text-center"><span class="badge bg-light text-dark border font-monospace">${count}</span></td>
            <td class="text-center">${statusBadge}</td>
            <td class="text-end">
              <div class="d-inline-flex gap-1">
                <button type="button" class="btn btn-sm btn-icon btn-outline-teal btn-edit-disc-sanc-type" data-id="${item.id}" title="Editar">
                  <i class="ti ti-edit"></i>
                </button>
                <button type="button" class="btn btn-sm btn-icon btn-outline-danger btn-del-disc-sanc-type" data-id="${item.id}" title="Eliminar">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-disc-sanc-type').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = this.discSanctionTypes.find((x) => x.id === btn.dataset.id);
        if (item) this.openEditDiscSanctionTypeModal(item);
      });
    });

    tbody.querySelectorAll('.btn-del-disc-sanc-type').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = this.discSanctionTypes.find((x) => x.id === btn.dataset.id);
        if (item) this.deleteDiscSanctionType(item);
      });
    });
  }

  openNewDiscSanctionTypeModal() {
    document.getElementById('form-disc-sanction-type')?.reset();
    document.getElementById('disc-sanction-type-id').value = '';
    document.getElementById('modal-disc-sanction-type-title').textContent = 'Nuevo Tipo de Sanción';
    document.getElementById('disc-sanction-type-alert')?.classList.add('d-none');
    document.getElementById('disc-sanction-type-severity').value = 'MEDIUM';
    document.getElementById('disc-sanction-type-req-days').checked = false;
    document.getElementById('disc-sanction-type-active').checked = true;
    getBootstrapModal(document.getElementById('modal-disc-sanction-type'))?.show();
  }

  openEditDiscSanctionTypeModal(item) {
    document.getElementById('disc-sanction-type-id').value = item.id;
    document.getElementById('modal-disc-sanction-type-title').textContent = `Editar Tipo de Sanción: ${item.code}`;
    document.getElementById('disc-sanction-type-alert')?.classList.add('d-none');
    document.getElementById('disc-sanction-type-code').value = item.code || '';
    document.getElementById('disc-sanction-type-name').value = item.name || '';
    document.getElementById('disc-sanction-type-desc').value = item.description || '';
    document.getElementById('disc-sanction-type-severity').value = item.severity || 'MEDIUM';
    document.getElementById('disc-sanction-type-req-days').checked = Boolean(item.requiresSuspensionDays);
    document.getElementById('disc-sanction-type-active').checked = item.isActive !== false;
    getBootstrapModal(document.getElementById('modal-disc-sanction-type'))?.show();
  }

  async saveDiscSanctionType(e) {
    e.preventDefault();
    const id = document.getElementById('disc-sanction-type-id').value;
    const alertBox = document.getElementById('disc-sanction-type-alert');
    const submitBtn = document.getElementById('btn-save-disc-sanction-type');
    if (alertBox) alertBox.classList.add('d-none');

    const payload = {
      code: document.getElementById('disc-sanction-type-code').value.trim().toUpperCase(),
      name: document.getElementById('disc-sanction-type-name').value.trim(),
      description: document.getElementById('disc-sanction-type-desc').value.trim() || null,
      severity: document.getElementById('disc-sanction-type-severity').value,
      requiresSuspensionDays: Boolean(document.getElementById('disc-sanction-type-req-days').checked),
      isActive: Boolean(document.getElementById('disc-sanction-type-active').checked),
    };

    if (submitBtn) submitBtn.disabled = true;
    try {
      if (id) {
        await apiRequest(`/disciplinary/sanction-types/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        showToast('Tipo de sanción actualizado correctamente');
      } else {
        await apiRequest('/disciplinary/sanction-types', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Tipo de sanción creado exitosamente');
      }
      getBootstrapModal(document.getElementById('modal-disc-sanction-type'))?.hide();
      await this.loadDisciplinaryCatalogs();
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al guardar tipo de sanción';
        alertBox.classList.remove('d-none');
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  deleteDiscSanctionType(item) {
    this.confirmDeleteAction({
      title: 'Eliminar Tipo de Sanción',
      message: `¿Confirmás la eliminación del tipo de sanción <strong>"[${escapeHtml(item.code)}] ${escapeHtml(item.name)}"</strong>?`,
      onConfirm: async () => {
        await apiRequest(`/disciplinary/sanction-types/${item.id}`, { method: 'DELETE' });
        showToast('Tipo de sanción eliminado');
        await this.loadDisciplinaryCatalogs();
      },
    });
  }

  // =========================================================================
  // 2. NOVEDADES: REGISTRO DE INCIDENTES Y SANCIONES + ADJUNTOS
  // =========================================================================

  async loadDisciplinaryRecordsView() {
    this.ensureSubtabsActiveState(
      'pane-personnel-disc-records',
      'subtab-btn-incidents-record',
      'subpane-disc-incidents-record'
    );
    await this.loadDisciplinaryCatalogs();
    await Promise.all([this.loadDiscIncidents(), this.loadDiscSanctions()]);
  }

  async loadDiscIncidents() {
    const tbody = document.getElementById('disc-incidents-tbody');
    if (!tbody) return;

    const params = new URLSearchParams();
    const empId = document.getElementById('disc-filter-incident-emp')?.value;
    const typeId = document.getElementById('disc-filter-incident-type')?.value;
    const status = document.getElementById('disc-filter-incident-status')?.value;
    const from = document.getElementById('disc-filter-incident-from')?.value;
    const to = document.getElementById('disc-filter-incident-to')?.value;

    if (empId && empId !== 'ALL') params.append('employeeId', empId);
    if (typeId && typeId !== 'ALL') params.append('incidentTypeId', typeId);
    if (status && status !== 'ALL') params.append('sanctionedStatus', status);
    if (from) params.append('dateFrom', from);
    if (to) params.append('dateTo', to);

    try {
      const res = await apiRequest(`/disciplinary/incidents?${params.toString()}`);
      this.discIncidents = res.data || [];
      this.updateDisciplinaryBadges();
      this.renderDiscIncidentsTable();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">${escapeHtml(err.message || 'Error al cargar incidentes')}</td></tr>`;
    }
  }

  renderDiscIncidentsTable() {
    const tbody = document.getElementById('disc-incidents-tbody');
    if (!tbody) return;

    if (!this.discIncidents || this.discIncidents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No hay incidentes registrados para los filtros seleccionados.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.discIncidents
      .map((inc) => {
        const emp = inc.employee || {};
        const deptName = emp.department?.name || '-';
        const type = inc.incidentType || {};
        const attCount = Array.isArray(inc.attachments) ? inc.attachments.length : 0;

        const sanctionsBadge = inc.isSanctioned
          ? `<span class="badge bg-danger-lt text-danger" title="${escapeHtml(inc.sanctions.map((s) => `${s.sanctionTypeName} (${formatDateAr(s.sanctionDate)})`).join(', '))}"><i class="ti ti-gavel me-1"></i>Sancionado (${inc.sanctions.length})</span>`
          : `<span class="badge bg-amber-lt text-amber">Sin sanción</span>`;

        const attBtn = attCount > 0
          ? `<button type="button" class="btn btn-xs btn-outline-teal btn-view-disc-inc-att" data-id="${inc.id}">
               <i class="ti ti-paperclip me-1"></i>${attCount} adj.
             </button>`
          : `<span class="text-muted small">-</span>`;

        return `
          <tr>
            <td class="font-monospace fw-bold">${formatDateAr(inc.incidentDate)}</td>
            <td class="font-monospace fw-bold text-dark">${escapeHtml(emp.fileNumber || '-')}</td>
            <td>
              <div class="fw-bold text-dark">${escapeHtml(`${emp.lastName || ''}, ${emp.firstName || ''}`)}</div>
              <div class="text-muted small">${escapeHtml(deptName)}</div>
            </td>
            <td>
              <span class="badge bg-amber-lt text-amber font-monospace me-1">${escapeHtml(type.code || '')}</span>
              <span class="fw-semibold">${escapeHtml(type.name || '-')}</span>
            </td>
            <td class="small text-muted" style="max-width: 280px;">${escapeHtml(inc.observations || '-')}</td>
            <td class="text-center">${attBtn}</td>
            <td class="text-center">${sanctionsBadge}</td>
            <td class="text-end">
              <div class="d-inline-flex gap-1">
                <button type="button" class="btn btn-sm btn-icon btn-outline-teal btn-edit-disc-inc" data-id="${inc.id}" title="Editar Incidente">
                  <i class="ti ti-edit"></i>
                </button>
                <button type="button" class="btn btn-sm btn-icon btn-outline-danger btn-del-disc-inc" data-id="${inc.id}" title="Eliminar Incidente">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-view-disc-inc-att').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inc = this.discIncidents.find((x) => x.id === btn.dataset.id);
        if (inc) {
          this.openDisciplinaryAttachmentsViewer(
            `Incidente del ${formatDateAr(inc.incidentDate)} — ${inc.employee?.lastName}, ${inc.employee?.firstName}`,
            inc.attachments || []
          );
        }
      });
    });

    tbody.querySelectorAll('.btn-edit-disc-inc').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inc = this.discIncidents.find((x) => x.id === btn.dataset.id);
        if (inc) this.openEditDiscIncidentModal(inc);
      });
    });

    tbody.querySelectorAll('.btn-del-disc-inc').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inc = this.discIncidents.find((x) => x.id === btn.dataset.id);
        if (inc) this.deleteDiscIncident(inc);
      });
    });
  }

  openNewDiscIncidentModal() {
    this.populateDisciplinarySelectors();
    document.getElementById('form-disc-incident')?.reset();
    document.getElementById('disc-incident-id').value = '';
    document.getElementById('modal-disc-incident-title').textContent = 'Registrar Nuevo Incidente';
    document.getElementById('disc-incident-alert')?.classList.add('d-none');
    document.getElementById('disc-incident-date').value = new Date().toISOString().slice(0, 10);
    this.currentIncidentAttachments = [];
    this.renderDisciplinaryAttachmentsEditList('INCIDENT');
    getBootstrapModal(document.getElementById('modal-disc-incident'))?.show();
  }

  openEditDiscIncidentModal(inc) {
    this.populateDisciplinarySelectors();
    document.getElementById('disc-incident-id').value = inc.id;
    document.getElementById('modal-disc-incident-title').textContent = `Modificar Incidente (${formatDateAr(inc.incidentDate)})`;
    document.getElementById('disc-incident-alert')?.classList.add('d-none');
    document.getElementById('disc-incident-date').value = String(inc.incidentDate).slice(0, 10);
    document.getElementById('disc-incident-employee').value = inc.employeeId;
    document.getElementById('disc-incident-type').value = inc.incidentTypeId;
    document.getElementById('disc-incident-observations').value = inc.observations || '';
    this.currentIncidentAttachments = Array.isArray(inc.attachments) ? [...inc.attachments] : [];
    this.renderDisciplinaryAttachmentsEditList('INCIDENT');
    getBootstrapModal(document.getElementById('modal-disc-incident'))?.show();
  }

  async saveDiscIncident(e) {
    e.preventDefault();
    const id = document.getElementById('disc-incident-id').value;
    const alertBox = document.getElementById('disc-incident-alert');
    const submitBtn = document.getElementById('btn-save-disc-incident');
    if (alertBox) alertBox.classList.add('d-none');

    const payload = {
      employeeId: document.getElementById('disc-incident-employee').value,
      incidentTypeId: document.getElementById('disc-incident-type').value,
      incidentDate: document.getElementById('disc-incident-date').value,
      observations: document.getElementById('disc-incident-observations').value.trim() || null,
      attachments: this.currentIncidentAttachments || [],
    };

    if (submitBtn) submitBtn.disabled = true;
    try {
      if (id) {
        await apiRequest(`/disciplinary/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        showToast('Incidente actualizado correctamente');
      } else {
        await apiRequest('/disciplinary/incidents', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Incidente registrado exitosamente');
      }
      getBootstrapModal(document.getElementById('modal-disc-incident'))?.hide();
      await Promise.all([this.loadDiscIncidents(), this.loadDisciplinaryCatalogs()]);
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al guardar el incidente';
        alertBox.classList.remove('d-none');
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  deleteDiscIncident(inc) {
    const empName = `${inc.employee?.lastName || ''}, ${inc.employee?.firstName || ''}`;
    this.confirmDeleteAction({
      title: 'Eliminar Incidente',
      message: `¿Confirmás la eliminación del incidente del <strong>${formatDateAr(inc.incidentDate)}</strong> correspondiente a <strong>${escapeHtml(empName)}</strong>?`,
      onConfirm: async () => {
        await apiRequest(`/disciplinary/incidents/${inc.id}`, { method: 'DELETE' });
        showToast('Incidente eliminado');
        await Promise.all([this.loadDiscIncidents(), this.loadDiscSanctions(), this.loadDisciplinaryCatalogs()]);
      },
    });
  }

  // =========================================================================
  // SANCIONES DISCIPLINARIAS (CON ASIGNACIÓN OPCIONAL 0..N DE INCIDENTES)
  // =========================================================================

  async loadDiscSanctions() {
    const tbody = document.getElementById('disc-sanctions-tbody');
    if (!tbody) return;

    const params = new URLSearchParams();
    const empId = document.getElementById('disc-filter-sanction-emp')?.value;
    const typeId = document.getElementById('disc-filter-sanction-type')?.value;
    const from = document.getElementById('disc-filter-sanction-from')?.value;
    const to = document.getElementById('disc-filter-sanction-to')?.value;

    if (empId && empId !== 'ALL') params.append('employeeId', empId);
    if (typeId && typeId !== 'ALL') params.append('sanctionTypeId', typeId);
    if (from) params.append('dateFrom', from);
    if (to) params.append('dateTo', to);

    try {
      const res = await apiRequest(`/disciplinary/sanctions?${params.toString()}`);
      this.discSanctions = res.data || [];
      this.updateDisciplinaryBadges();
      this.renderDiscSanctionsTable();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">${escapeHtml(err.message || 'Error al cargar sanciones')}</td></tr>`;
    }
  }

  renderDiscSanctionsTable() {
    const tbody = document.getElementById('disc-sanctions-tbody');
    if (!tbody) return;

    if (!this.discSanctions || this.discSanctions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No hay sanciones registradas para los filtros seleccionados.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.discSanctions
      .map((sanc) => {
        const emp = sanc.employee || {};
        const deptName = emp.department?.name || '-';
        const type = sanc.sanctionType || {};
        const attCount = Array.isArray(sanc.attachments) ? sanc.attachments.length : 0;
        const linked = sanc.linkedIncidents || [];

        const linkedHtml = linked.length > 0
          ? linked
              .map(
                (i) =>
                  `<span class="badge bg-amber-lt text-amber d-inline-block me-1 mb-1">${formatDateAr(i.incidentDate)} - ${escapeHtml(i.incidentType?.code || i.incidentType?.name || 'Inc.')}</span>`
              )
              .join('')
          : `<span class="badge bg-light text-muted border">Sin incidentes asociados (Directa)</span>`;

        const suspHtml = sanc.suspensionDays
          ? `<span class="badge bg-purple-lt text-purple ms-1">${sanc.suspensionDays} día(s) susp.</span>`
          : '';

        const attBtn = attCount > 0
          ? `<button type="button" class="btn btn-xs btn-outline-teal btn-view-disc-sanc-att" data-id="${sanc.id}">
               <i class="ti ti-paperclip me-1"></i>${attCount} adj.
             </button>`
          : `<span class="text-muted small">-</span>`;

        return `
          <tr>
            <td class="font-monospace fw-bold">${formatDateAr(sanc.sanctionDate)}</td>
            <td class="font-monospace fw-bold text-dark">${escapeHtml(emp.fileNumber || '-')}</td>
            <td>
              <div class="fw-bold text-dark">${escapeHtml(`${emp.lastName || ''}, ${emp.firstName || ''}`)}</div>
              <div class="text-muted small">${escapeHtml(deptName)}</div>
            </td>
            <td>
              <div>
                <span class="badge bg-danger-lt text-danger font-monospace me-1">${escapeHtml(type.code || '')}</span>
                <span class="fw-semibold">${escapeHtml(type.name || '-')}</span>
              </div>
              ${suspHtml}
            </td>
            <td style="max-width: 240px;">${linkedHtml}</td>
            <td class="small text-muted" style="max-width: 240px;">${escapeHtml(sanc.observations || '-')}</td>
            <td class="text-center">${attBtn}</td>
            <td class="text-end">
              <div class="d-inline-flex gap-1">
                <button type="button" class="btn btn-sm btn-icon btn-outline-teal btn-edit-disc-sanc" data-id="${sanc.id}" title="Editar Sanción">
                  <i class="ti ti-edit"></i>
                </button>
                <button type="button" class="btn btn-sm btn-icon btn-outline-danger btn-del-disc-sanc" data-id="${sanc.id}" title="Eliminar Sanción">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-view-disc-sanc-att').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sanc = this.discSanctions.find((x) => x.id === btn.dataset.id);
        if (sanc) {
          this.openDisciplinaryAttachmentsViewer(
            `Sanción del ${formatDateAr(sanc.sanctionDate)} — ${sanc.employee?.lastName}, ${sanc.employee?.firstName}`,
            sanc.attachments || []
          );
        }
      });
    });

    tbody.querySelectorAll('.btn-edit-disc-sanc').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sanc = this.discSanctions.find((x) => x.id === btn.dataset.id);
        if (sanc) this.openEditDiscSanctionModal(sanc);
      });
    });

    tbody.querySelectorAll('.btn-del-disc-sanc').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sanc = this.discSanctions.find((x) => x.id === btn.dataset.id);
        if (sanc) this.deleteDiscSanction(sanc);
      });
    });
  }

  async loadCandidateIncidentsForSanction(employeeId, preselectedIds = []) {
    const container = document.getElementById('disc-sanction-incidents-checklist');
    const badge = document.getElementById('disc-sanction-linked-count-badge');
    if (!container) return;

    if (!employeeId) {
      container.innerHTML = `<div class="text-muted small text-center py-2">Seleccione un colaborador para ver sus incidentes registrados.</div>`;
      if (badge) badge.textContent = '0 seleccionados';
      return;
    }

    container.innerHTML = `<div class="text-center py-2 text-muted small"><span class="spinner-border spinner-border-sm me-1"></span> Cargando incidentes del colaborador...</div>`;

    try {
      const res = await apiRequest(`/disciplinary/incidents?employeeId=${encodeURIComponent(employeeId)}`);
      const incidents = res.data || [];
      this.currentSanctionCandidateIncidents = incidents;

      if (incidents.length === 0) {
        container.innerHTML = `<div class="text-muted small text-center py-2">El colaborador no registra incidentes previos. Puede emitir la sanción directamente sin incidentes vinculados.</div>`;
        if (badge) badge.textContent = '0 seleccionados';
        return;
      }

      const selectedSet = new Set(preselectedIds);

      container.innerHTML = incidents
        .map((inc) => {
          const isChecked = selectedSet.has(inc.id);
          const alreadySanctionedInfo = inc.isSanctioned
            ? `<span class="badge bg-danger-lt text-danger ms-1">Ya sancionado</span>`
            : `<span class="badge bg-amber-lt text-amber ms-1">Pendiente</span>`;

          return `
            <label class="d-flex align-items-start gap-2 p-2 border-bottom cursor-pointer">
              <input type="checkbox" class="form-check-input mt-1 disc-sanction-inc-checkbox" value="${inc.id}" ${isChecked ? 'checked' : ''}>
              <div class="flex-grow-1 small">
                <div class="fw-bold text-dark">
                  <span class="font-monospace">${formatDateAr(inc.incidentDate)}</span> —
                  [${escapeHtml(inc.incidentType?.code || '')}] ${escapeHtml(inc.incidentType?.name || '')}
                  ${alreadySanctionedInfo}
                </div>
                <div class="text-muted">${escapeHtml(inc.observations || 'Sin observaciones')}</div>
              </div>
            </label>
          `;
        })
        .join('');

      const updateCount = () => {
        const checkedCount = container.querySelectorAll('.disc-sanction-inc-checkbox:checked').length;
        if (badge) badge.textContent = `${checkedCount} seleccionado(s)`;
      };

      container.querySelectorAll('.disc-sanction-inc-checkbox').forEach((cb) => {
        cb.addEventListener('change', updateCount);
      });
      updateCount();
    } catch (err) {
      container.innerHTML = `<div class="text-danger small text-center py-2">Error al cargar incidentes del colaborador.</div>`;
    }
  }

  openNewDiscSanctionModal() {
    this.populateDisciplinarySelectors();
    document.getElementById('form-disc-sanction')?.reset();
    document.getElementById('disc-sanction-id').value = '';
    document.getElementById('modal-disc-sanction-title').textContent = 'Registrar Sanción Disciplinaria';
    document.getElementById('disc-sanction-alert')?.classList.add('d-none');
    document.getElementById('disc-sanction-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('disc-sanction-susp-days').value = '0';
    this.currentSanctionAttachments = [];
    this.renderDisciplinaryAttachmentsEditList('SANCTION');
    this.loadCandidateIncidentsForSanction('', []);
    getBootstrapModal(document.getElementById('modal-disc-sanction'))?.show();
  }

  async openEditDiscSanctionModal(sanc) {
    this.populateDisciplinarySelectors();
    document.getElementById('disc-sanction-id').value = sanc.id;
    document.getElementById('modal-disc-sanction-title').textContent = `Modificar Sanción (${formatDateAr(sanc.sanctionDate)})`;
    document.getElementById('disc-sanction-alert')?.classList.add('d-none');
    document.getElementById('disc-sanction-date').value = String(sanc.sanctionDate).slice(0, 10);
    document.getElementById('disc-sanction-employee').value = sanc.employeeId;
    document.getElementById('disc-sanction-type').value = sanc.sanctionTypeId;
    document.getElementById('disc-sanction-susp-days').value = sanc.suspensionDays || 0;
    document.getElementById('disc-sanction-observations').value = sanc.observations || '';
    this.currentSanctionAttachments = Array.isArray(sanc.attachments) ? [...sanc.attachments] : [];
    this.renderDisciplinaryAttachmentsEditList('SANCTION');

    const linkedIds = (sanc.linkedIncidents || []).map((i) => i.id);
    await this.loadCandidateIncidentsForSanction(sanc.employeeId, linkedIds);
    getBootstrapModal(document.getElementById('modal-disc-sanction'))?.show();
  }

  async saveDiscSanction(e) {
    e.preventDefault();
    const id = document.getElementById('disc-sanction-id').value;
    const alertBox = document.getElementById('disc-sanction-alert');
    const submitBtn = document.getElementById('btn-save-disc-sanction');
    if (alertBox) alertBox.classList.add('d-none');

    const checkedIncidentIds = Array.from(
      document.querySelectorAll('#disc-sanction-incidents-checklist .disc-sanction-inc-checkbox:checked')
    ).map((cb) => cb.value);

    const suspDaysVal = parseInt(document.getElementById('disc-sanction-susp-days').value || '0', 10);

    const payload = {
      employeeId: document.getElementById('disc-sanction-employee').value,
      sanctionTypeId: document.getElementById('disc-sanction-type').value,
      sanctionDate: document.getElementById('disc-sanction-date').value,
      suspensionDays: suspDaysVal > 0 ? suspDaysVal : null,
      observations: document.getElementById('disc-sanction-observations').value.trim() || null,
      incidentIds: checkedIncidentIds,
      attachments: this.currentSanctionAttachments || [],
    };

    if (submitBtn) submitBtn.disabled = true;
    try {
      if (id) {
        await apiRequest(`/disciplinary/sanctions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        showToast('Sanción actualizada correctamente');
      } else {
        await apiRequest('/disciplinary/sanctions', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Sanción emitida exitosamente');
      }
      getBootstrapModal(document.getElementById('modal-disc-sanction'))?.hide();
      await Promise.all([this.loadDiscSanctions(), this.loadDiscIncidents(), this.loadDisciplinaryCatalogs()]);
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al guardar la sanción';
        alertBox.classList.remove('d-none');
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  deleteDiscSanction(sanc) {
    const empName = `${sanc.employee?.lastName || ''}, ${sanc.employee?.firstName || ''}`;
    this.confirmDeleteAction({
      title: 'Eliminar Sanción Disciplinaria',
      message: `¿Confirmás la eliminación de la sanción del <strong>${formatDateAr(sanc.sanctionDate)}</strong> aplicada a <strong>${escapeHtml(empName)}</strong>?`,
      onConfirm: async () => {
        await apiRequest(`/disciplinary/sanctions/${sanc.id}`, { method: 'DELETE' });
        showToast('Sanción eliminada');
        await Promise.all([this.loadDiscSanctions(), this.loadDiscIncidents(), this.loadDisciplinaryCatalogs()]);
      },
    });
  }

  // =========================================================================
  // GESTIÓN DE DOCUMENTOS Y FOTOS ADJUNTAS (CARGA Y VISOR MODAL)
  // =========================================================================

  handleDisciplinaryFileSelect(e, targetType) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const listRef = targetType === 'INCIDENT' ? this.currentIncidentAttachments : this.currentSanctionAttachments;

    files.forEach((file) => {
      if (listRef.length >= 10) {
        showToast('Máximo 10 archivos adjuntos permitidos por registro', 'warning');
        return;
      }

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const img = new Image();
          img.onload = () => {
            const maxDim = 1280;
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

            listRef.push({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name: file.name,
              mimeType: 'image/jpeg',
              size: Math.round(dataUrl.length * 0.75),
              dataUrl,
            });
            this.renderDisciplinaryAttachmentsEditList(targetType);
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
      } else if (file.type === 'application/pdf') {
        if (file.size > 5 * 1024 * 1024) {
          showToast(`El documento "${file.name}" supera el límite de 5 MB`, 'warning');
          return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
          listRef.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: file.name,
            mimeType: 'application/pdf',
            size: file.size,
            dataUrl: evt.target.result,
          });
          this.renderDisciplinaryAttachmentsEditList(targetType);
        };
        reader.readAsDataURL(file);
      } else {
        showToast(`Formato no soportado (${file.name}). Use JPG, PNG, WEBP o PDF.`, 'warning');
      }
    });

    e.target.value = '';
  }

  renderDisciplinaryAttachmentsEditList(targetType) {
    const containerId = targetType === 'INCIDENT' ? 'disc-incident-attachments-list' : 'disc-sanction-attachments-list';
    const container = document.getElementById(containerId);
    if (!container) return;

    const listRef = targetType === 'INCIDENT' ? this.currentIncidentAttachments : this.currentSanctionAttachments;
    if (!listRef || listRef.length === 0) {
      container.innerHTML = `<div class="col-12 text-muted small fst-italic">Sin documentos ni fotografías adjuntas.</div>`;
      return;
    }

    container.innerHTML = listRef
      .map((att, idx) => {
        const isImg = (att.mimeType || '').startsWith('image/');
        const preview = isImg
          ? `<img src="${att.dataUrl}" alt="${escapeHtml(att.name)}" class="rounded border" style="width: 44px; height: 44px; object-fit: cover;">`
          : `<div class="avatar avatar-sm bg-danger-lt text-danger rounded"><i class="ti ti-file-type-pdf fs-2"></i></div>`;

        return `
          <div class="col-md-6">
            <div class="d-flex align-items-center justify-content-between p-2 bg-white border rounded shadow-2xs">
              <div class="d-flex align-items-center gap-2 text-truncate">
                ${preview}
                <div class="text-truncate">
                  <div class="fw-semibold small text-truncate" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</div>
                  <div class="text-muted" style="font-size: 0.7rem;">${isImg ? 'Fotografía' : 'Documento PDF'}</div>
                </div>
              </div>
              <button type="button" class="btn btn-xs btn-icon btn-outline-danger btn-remove-disc-att ms-2" data-idx="${idx}">
                <i class="ti ti-x"></i>
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    container.querySelectorAll('.btn-remove-disc-att').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        listRef.splice(idx, 1);
        this.renderDisciplinaryAttachmentsEditList(targetType);
      });
    });
  }

  openDisciplinaryAttachmentsViewer(subtitle, attachments = []) {
    const subEl = document.getElementById('modal-disc-attachments-subtitle');
    const bodyEl = document.getElementById('modal-disc-attachments-body');
    if (subEl) subEl.textContent = subtitle || 'Documentación respaldatoria';
    if (!bodyEl) return;

    if (!attachments || attachments.length === 0) {
      bodyEl.innerHTML = `<div class="text-center py-4 text-muted">No hay archivos adjuntos en este registro.</div>`;
    } else {
      bodyEl.innerHTML = `
        <div class="row g-3">
          ${attachments
            .map((att) => {
              const isImg = (att.mimeType || '').startsWith('image/');
              return `
                <div class="col-md-6">
                  <div class="card border shadow-2xs h-100">
                    <div class="card-body p-2 d-flex flex-column">
                      <div class="d-flex align-items-center justify-content-between mb-2">
                        <span class="fw-bold small text-truncate" title="${escapeHtml(att.name)}">
                          <i class="ti ${isImg ? 'ti-photo text-teal' : 'ti-file-type-pdf text-danger'} me-1"></i>
                          ${escapeHtml(att.name)}
                        </span>
                        <a href="${att.dataUrl}" download="${escapeHtml(att.name || 'adjunto')}" class="btn btn-xs btn-outline-primary">
                          <i class="ti ti-download me-1"></i> Descargar
                        </a>
                      </div>
                      ${
                        isImg
                          ? `<div class="text-center bg-light rounded p-1"><img src="${att.dataUrl}" alt="${escapeHtml(att.name)}" class="img-fluid rounded" style="max-height: 260px; object-fit: contain;"></div>`
                          : `<iframe src="${att.dataUrl}" class="w-100 rounded border" style="height: 260px;"></iframe>`
                      }
                    </div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      `;
    }

    getBootstrapModal(document.getElementById('modal-disc-attachments'))?.show();
  }

  // =========================================================================
  // 3. INFORMES DISCIPLINARIOS (PANTALLA CON APEXCHARTS, IMPRESIÓN A4 Y PDF)
  // =========================================================================

  destroyDisciplinaryApexCharts() {
    if (Array.isArray(this.discApexCharts)) {
      this.discApexCharts.forEach((ch) => {
        try {
          ch.destroy();
        } catch (_e) {
          // ignore
        }
      });
    }
    this.discApexCharts = [];
  }

  getDisciplinaryReportParams() {
    return {
      reportType: document.getElementById('disc-report-type-select')?.value || 'INCIDENTS_DETAIL',
      dateFrom: document.getElementById('disc-report-date-from')?.value || '',
      dateTo: document.getElementById('disc-report-date-to')?.value || '',
      employeeId: document.getElementById('disc-report-employee-select')?.value || 'ALL',
    };
  }

  async executeDisciplinaryReportInScreen() {
    const params = this.getDisciplinaryReportParams();
    if (!params.dateFrom || !params.dateTo) {
      showToast('Por favor indique Fecha Desde y Fecha Hasta para emitir el informe', 'warning');
      return;
    }

    const container = document.getElementById('disc-reports-results-container');
    const btnPrint = document.getElementById('btn-disc-report-print');
    const btnPdf = document.getElementById('btn-disc-report-pdf');
    if (!container) return;

    this.destroyDisciplinaryApexCharts();
    container.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-teal mb-2" role="status"></div>
        <div class="fw-bold text-dark">Procesando informe disciplinario...</div>
      </div>
    `;

    try {
      const res = await apiRequest('/disciplinary/reports/execute', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      const report = res.data;
      this.currentDisciplinaryReportData = report;

      if (btnPrint) btnPrint.classList.remove('d-none');
      if (btnPdf) btnPdf.classList.remove('d-none');

      this.renderDisciplinaryReportScreen(report);
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message || 'Error al emitir el informe')}</div>`;
    }
  }

  renderDisciplinaryReportScreen(report) {
    const container = document.getElementById('disc-reports-results-container');
    if (!container) return;

    const headerBanner = `
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 p-3 mb-3 rounded border bg-white shadow-2xs">
        <div>
          <span class="badge bg-teal-lt text-teal mb-1">${escapeHtml(report.company?.name || 'Empresa Activa')}</span>
          <h4 class="fw-bold mb-0 text-dark">${escapeHtml(report.title)}</h4>
          <div class="text-muted small">
            Período consultado: <strong>${formatDateAr(report.parameters?.dateFrom)}</strong> al <strong>${formatDateAr(report.parameters?.dateTo)}</strong>
            ${report.employeeFilter ? ` | Colaborador: <strong>[${escapeHtml(report.employeeFilter.fileNumber)}] ${escapeHtml(report.employeeFilter.lastName)}, ${escapeHtml(report.employeeFilter.firstName)}</strong>` : ' | Alcance: <strong>Toda la Nómina</strong>'}
          </div>
        </div>
        <div class="text-end">
          <div class="text-muted small">Total en el período</div>
          <div class="fs-2 fw-bold text-teal font-monospace">${report.totalCount || 0} registro(s)</div>
        </div>
      </div>
    `;

    if (report.reportType === 'INCIDENTS_DETAIL') {
      const groups = report.groups || [];
      if (groups.length === 0) {
        container.innerHTML = `${headerBanner}<div class="alert alert-info">No se registraron incidentes en el período seleccionado.</div>`;
        return;
      }

      const groupsHtml = groups
        .map(
          (g) => `
          <div class="card border shadow-2xs mb-3">
            <div class="card-header bg-amber-lt py-2 px-3 d-flex justify-content-between align-items-center">
              <div class="fw-bold text-dark">
                <i class="ti ti-alert-triangle me-1 text-amber"></i>
                [${escapeHtml(g.incidentTypeCode)}] ${escapeHtml(g.incidentTypeName)}
                <span class="ms-2">${getSeverityBadge(g.severity)}</span>
              </div>
              <span class="badge bg-amber text-white">${g.count} incidente(s)</span>
            </div>
            <div class="table-responsive">
              <table class="table table-vcenter card-table table-striped mb-0">
                <thead>
                  <tr>
                    <th style="width: 100px;">Fecha</th>
                    <th style="width: 90px;">Legajo</th>
                    <th style="width: 220px;">Colaborador</th>
                    <th style="width: 160px;">Sector</th>
                    <th>Observaciones</th>
                    <th style="width: 170px;" class="text-center">Estado / Sanción</th>
                  </tr>
                </thead>
                <tbody>
                  ${g.items
                    .map(
                      (item) => `
                      <tr>
                        <td class="font-monospace fw-bold">${formatDateAr(item.incidentDate)}</td>
                        <td class="font-monospace">${escapeHtml(item.fileNumber)}</td>
                        <td class="fw-semibold">${escapeHtml(item.employeeName)}</td>
                        <td class="text-muted small">${escapeHtml(item.departmentName)}</td>
                        <td class="small">${escapeHtml(item.observations || '-')}</td>
                        <td class="text-center">
                          ${
                            item.isSanctioned
                              ? `<span class="badge bg-danger-lt text-danger">${escapeHtml(item.sanctionsText || 'Sancionado')}</span>`
                              : `<span class="badge bg-amber-lt text-amber">Sin sancionar</span>`
                          }
                        </td>
                      </tr>
                    `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>
        `
        )
        .join('');

      container.innerHTML = `${headerBanner}${groupsHtml}`;
      return;
    }

    if (report.reportType === 'SANCTIONS_DETAIL') {
      const groups = report.groups || [];
      if (groups.length === 0) {
        container.innerHTML = `${headerBanner}<div class="alert alert-info">No se registraron sanciones en el período seleccionado.</div>`;
        return;
      }

      const groupsHtml = groups
        .map(
          (g) => `
          <div class="card border shadow-2xs mb-3">
            <div class="card-header bg-danger-lt py-2 px-3 d-flex justify-content-between align-items-center">
              <div class="fw-bold text-dark">
                <i class="ti ti-gavel me-1 text-danger"></i>
                [${escapeHtml(g.sanctionTypeCode)}] ${escapeHtml(g.sanctionTypeName)}
                <span class="ms-2">${getSeverityBadge(g.severity)}</span>
              </div>
              <span class="badge bg-danger text-white">${g.count} sanción(es)</span>
            </div>
            <div class="table-responsive">
              <table class="table table-vcenter card-table table-striped mb-0">
                <thead>
                  <tr>
                    <th style="width: 100px;">Fecha</th>
                    <th style="width: 90px;">Legajo</th>
                    <th style="width: 210px;">Colaborador</th>
                    <th style="width: 140px;">Sector</th>
                    <th style="width: 95px;" class="text-center">Días Susp.</th>
                    <th style="width: 220px;">Incidentes Asociados</th>
                    <th>Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  ${g.items
                    .map(
                      (item) => `
                      <tr>
                        <td class="font-monospace fw-bold">${formatDateAr(item.sanctionDate)}</td>
                        <td class="font-monospace">${escapeHtml(item.fileNumber)}</td>
                        <td class="fw-semibold">${escapeHtml(item.employeeName)}</td>
                        <td class="text-muted small">${escapeHtml(item.departmentName)}</td>
                        <td class="text-center font-monospace">${item.suspensionDays ? `${item.suspensionDays} d.` : '-'}</td>
                        <td class="small">${escapeHtml(item.linkedIncidentsText || 'Sin incidentes asociados')}</td>
                        <td class="small">${escapeHtml(item.observations || '-')}</td>
                      </tr>
                    `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>
        `
        )
        .join('');

      container.innerHTML = `${headerBanner}${groupsHtml}`;
      return;
    }

    if (report.reportType === 'INCIDENTS_STATS') {
      const totals = report.totalsByType || [];
      const dist = report.sanctionedDistribution || { sanctioned: 0, unsanctioned: 0, sanctionedPct: 0, unsanctionedPct: 0 };

      container.innerHTML = `
        ${headerBanner}
        <div class="row g-3 mb-3">
          <div class="col-md-5">
            <div class="card border shadow-2xs h-100">
              <div class="card-header py-2 px-3 fw-bold small bg-light-subtle">Cantidades Totales por Tipo de Incidente</div>
              <div class="table-responsive">
                <table class="table table-vcenter card-table table-striped mb-0">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Tipo de Incidente</th>
                      <th class="text-end">Cant.</th>
                      <th class="text-end">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${
                      totals.length === 0
                        ? `<tr><td colspan="4" class="text-center py-3 text-muted">Sin datos en el período</td></tr>`
                        : totals
                            .map(
                              (t) => `
                            <tr>
                              <td class="font-monospace fw-bold">${escapeHtml(t.code)}</td>
                              <td>${escapeHtml(t.name)}</td>
                              <td class="text-end font-monospace fw-bold">${t.count}</td>
                              <td class="text-end font-monospace">${t.percentage.toFixed(2)}%</td>
                            </tr>
                          `
                            )
                            .join('')
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card border shadow-2xs h-100">
              <div class="card-header py-2 px-3 fw-bold small bg-light-subtle">Porcentaje por Tipo de Incidente</div>
              <div class="card-body d-flex align-items-center justify-content-center">
                <div id="disc-chart-inc-pie" class="w-100" style="min-height: 240px;"></div>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card border shadow-2xs h-100">
              <div class="card-header py-2 px-3 fw-bold small bg-light-subtle">Incidentes Sancionados vs. No Sancionados</div>
              <div class="card-body d-flex flex-column align-items-center justify-content-center">
                <div id="disc-chart-inc-sanctioned-pie" class="w-100" style="min-height: 210px;"></div>
                <div class="small text-muted text-center mt-2">
                  Sancionados: <strong>${dist.sanctioned} (${dist.sanctionedPct}%)</strong> |
                  No Sancionados: <strong>${dist.unsanctioned} (${dist.unsanctionedPct}%)</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="card border shadow-2xs">
          <div class="card-header py-2 px-3 fw-bold small bg-light-subtle">Evolución Mensual de Totales por Tipo de Incidente</div>
          <div class="card-body">
            <div id="disc-chart-inc-evolution" style="min-height: 290px;"></div>
          </div>
        </div>
      `;

      this.mountDisciplinaryApexCharts(report);
      return;
    }

    if (report.reportType === 'SANCTIONS_STATS') {
      const totals = report.totalsByType || [];

      container.innerHTML = `
        ${headerBanner}
        <div class="row g-3 mb-3">
          <div class="col-md-6">
            <div class="card border shadow-2xs h-100">
              <div class="card-header py-2 px-3 fw-bold small bg-light-subtle">Cantidades Totales por Tipo de Sanción</div>
              <div class="table-responsive">
                <table class="table table-vcenter card-table table-striped mb-0">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Tipo de Sanción</th>
                      <th class="text-end">Cant.</th>
                      <th class="text-end">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${
                      totals.length === 0
                        ? `<tr><td colspan="4" class="text-center py-3 text-muted">Sin datos en el período</td></tr>`
                        : totals
                            .map(
                              (t) => `
                            <tr>
                              <td class="font-monospace fw-bold">${escapeHtml(t.code)}</td>
                              <td>${escapeHtml(t.name)}</td>
                              <td class="text-end font-monospace fw-bold">${t.count}</td>
                              <td class="text-end font-monospace">${t.percentage.toFixed(2)}%</td>
                            </tr>
                          `
                            )
                            .join('')
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="col-md-6">
            <div class="card border shadow-2xs h-100">
              <div class="card-header py-2 px-3 fw-bold small bg-light-subtle">Porcentaje por Tipo de Sanción sobre el Total</div>
              <div class="card-body d-flex align-items-center justify-content-center">
                <div id="disc-chart-sanc-pie" class="w-100" style="min-height: 250px;"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="card border shadow-2xs">
          <div class="card-header py-2 px-3 fw-bold small bg-light-subtle">Evolución Mensual de Totales por Tipo de Sanción</div>
          <div class="card-body">
            <div id="disc-chart-sanc-evolution" style="min-height: 290px;"></div>
          </div>
        </div>
      `;

      this.mountDisciplinaryApexCharts(report);
    }
  }

  mountDisciplinaryApexCharts(report) {
    if (!window.ApexCharts) return;

    const totals = report.totalsByType || [];
    const evolution = report.evolution || { months: [], series: [] };

    if (report.reportType === 'INCIDENTS_STATS') {
      const pieEl = document.getElementById('disc-chart-inc-pie');
      if (pieEl && totals.length > 0) {
        const pieChart = new window.ApexCharts(pieEl, {
          chart: { type: 'donut', height: 240, fontFamily: 'inherit' },
          labels: totals.map((t) => t.name),
          series: totals.map((t) => t.count),
          colors: CHART_PALETTE,
          legend: { position: 'bottom' },
          dataLabels: { enabled: true },
        });
        pieChart.render();
        this.discApexCharts.push(pieChart);
      }

      const sancPieEl = document.getElementById('disc-chart-inc-sanctioned-pie');
      const dist = report.sanctionedDistribution || { sanctioned: 0, unsanctioned: 0 };
      if (sancPieEl && dist.sanctioned + dist.unsanctioned > 0) {
        const sancChart = new window.ApexCharts(sancPieEl, {
          chart: { type: 'pie', height: 215, fontFamily: 'inherit' },
          labels: ['Sancionados', 'No Sancionados'],
          series: [dist.sanctioned, dist.unsanctioned],
          colors: ['#dc2626', '#0d9488'],
          legend: { position: 'bottom' },
        });
        sancChart.render();
        this.discApexCharts.push(sancChart);
      }

      const lineEl = document.getElementById('disc-chart-inc-evolution');
      if (lineEl && evolution.months.length > 0 && evolution.series.length > 0) {
        const lineChart = new window.ApexCharts(lineEl, {
          chart: { type: 'line', height: 290, toolbar: { show: false }, fontFamily: 'inherit' },
          series: evolution.series.map((s) => ({ name: s.name, data: s.data })),
          xaxis: { categories: evolution.months },
          colors: CHART_PALETTE,
          stroke: { width: 3, curve: 'smooth' },
          markers: { size: 4 },
          yaxis: { min: 0, forceNiceScale: true },
        });
        lineChart.render();
        this.discApexCharts.push(lineChart);
      }
    } else if (report.reportType === 'SANCTIONS_STATS') {
      const pieEl = document.getElementById('disc-chart-sanc-pie');
      if (pieEl && totals.length > 0) {
        const pieChart = new window.ApexCharts(pieEl, {
          chart: { type: 'donut', height: 250, fontFamily: 'inherit' },
          labels: totals.map((t) => t.name),
          series: totals.map((t) => t.count),
          colors: CHART_PALETTE,
          legend: { position: 'bottom' },
          dataLabels: { enabled: true },
        });
        pieChart.render();
        this.discApexCharts.push(pieChart);
      }

      const lineEl = document.getElementById('disc-chart-sanc-evolution');
      if (lineEl && evolution.months.length > 0 && evolution.series.length > 0) {
        const lineChart = new window.ApexCharts(lineEl, {
          chart: { type: 'line', height: 290, toolbar: { show: false }, fontFamily: 'inherit' },
          series: evolution.series.map((s) => ({ name: s.name, data: s.data })),
          xaxis: { categories: evolution.months },
          colors: CHART_PALETTE,
          stroke: { width: 3, curve: 'smooth' },
          markers: { size: 4 },
          yaxis: { min: 0, forceNiceScale: true },
        });
        lineChart.render();
        this.discApexCharts.push(lineChart);
      }
    }
  }

  async downloadCurrentDisciplinaryReportPdf() {
    const params = this.getDisciplinaryReportParams();
    if (!params.dateFrom || !params.dateTo) {
      showToast('Seleccione Fecha Desde y Fecha Hasta primero', 'warning');
      return;
    }

    try {
      showToast('Generando archivo PDF A4...', 'info');
      const token = storage.getToken();
      const companyId = storage.getActiveCompanyId();
      const res = await fetch('/api/v1/disciplinary/reports/export/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        throw new Error('No se pudo generar el archivo PDF del informe.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `informe_disciplinario_${params.reportType.toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Informe PDF A4 descargado correctamente', 'success');
    } catch (err) {
      showToast(err.message || 'Error al descargar PDF', 'danger');
    }
  }

  // =========================================================================
  // GENERADOR DE IMPRESIÓN A4 NATIVA EN PAPEL (SIN CONTORNOS DE PANTALLA)
  // =========================================================================

  buildSvgPieChartForPrint(title, slices) {
    const total = slices.reduce((acc, s) => acc + (Number(s.value) || 0), 0);
    if (total <= 0) {
      return `<div style="padding:12px; font-size:9pt; color:#64748b;">${escapeHtml(title)}: Sin datos en el período.</div>`;
    }

    let currentAngle = -Math.PI / 2;
    const cx = 75;
    const cy = 75;
    const r = 60;
    const paths = [];

    slices.forEach((s, idx) => {
      const val = Number(s.value) || 0;
      if (val <= 0) return;
      const frac = val / total;
      const color = s.color || CHART_PALETTE[idx % CHART_PALETTE.length];
      if (frac >= 0.9999) {
        paths.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#ffffff" stroke-width="1"/>`);
      } else {
        const endAngle = currentAngle + frac * Math.PI * 2;
        const x1 = cx + r * Math.cos(currentAngle);
        const y1 = cy + r * Math.sin(currentAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const largeArc = frac > 0.5 ? 1 : 0;
        paths.push(
          `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${color}" stroke="#ffffff" stroke-width="1"/>`
        );
        currentAngle = endAngle;
      }
    });

    const legendHtml = slices
      .map((s, idx) => {
        const val = Number(s.value) || 0;
        const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
        const color = s.color || CHART_PALETTE[idx % CHART_PALETTE.length];
        return `
          <div style="display:flex; align-items:center; gap:6px; font-size:8pt; margin-bottom:4px;">
            <span style="display:inline-block; width:10px; height:10px; background:${color};"></span>
            <span>${escapeHtml(s.label)}: <strong>${val} (${pct}%)</strong></span>
          </div>
        `;
      })
      .join('');

    return `
      <div style="margin-bottom: 10px;">
        <div style="font-weight:700; font-size:9.5pt; margin-bottom:6px; color:#0f172a;">${escapeHtml(title)}</div>
        <div style="display:flex; align-items:center; gap:18px;">
          <svg width="150" height="150" viewBox="0 0 150 150">${paths.join('')}</svg>
          <div>${legendHtml}</div>
        </div>
      </div>
    `;
  }

  buildSvgLineChartForPrint(title, months, seriesList) {
    if (!months || months.length === 0 || !seriesList || seriesList.length === 0) {
      return `<div style="padding:12px; font-size:9pt; color:#64748b;">${escapeHtml(title)}: Sin datos de evolución.</div>`;
    }

    const w = 640;
    const h = 190;
    const padL = 36;
    const padR = 20;
    const padT = 16;
    const padB = 34;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    let maxVal = 1;
    seriesList.forEach((s) => {
      (s.data || []).forEach((v) => {
        if (v > maxVal) maxVal = v;
      });
    });

    let gridLines = '';
    for (let i = 0; i <= 4; i++) {
      const y = padT + plotH - (i / 4) * plotH;
      const val = Math.round((maxVal * i) / 4);
      gridLines += `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#cbd5e1" stroke-width="0.6"/>`;
      gridLines += `<text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="8" fill="#475569">${val}</text>`;
    }

    let xLabels = '';
    months.forEach((m, idx) => {
      const x = months.length === 1 ? padL + plotW / 2 : padL + (idx / (months.length - 1)) * plotW;
      xLabels += `<text x="${x}" y="${padT + plotH + 16}" text-anchor="middle" font-size="8" fill="#334155">${escapeHtml(m)}</text>`;
    });

    let polylines = '';
    seriesList.forEach((s, sIdx) => {
      const color = CHART_PALETTE[sIdx % CHART_PALETTE.length];
      const pts = (s.data || []).map((val, idx) => {
        const x = months.length === 1 ? padL + plotW / 2 : padL + (idx / (months.length - 1)) * plotW;
        const y = padT + plotH - (val / maxVal) * plotH;
        return { x, y };
      });
      if (pts.length > 0) {
        const ptStr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        polylines += `<polyline fill="none" stroke="${color}" stroke-width="2" points="${ptStr}"/>`;
        pts.forEach((p) => {
          polylines += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${color}"/>`;
        });
      }
    });

    const legend = seriesList
      .map((s, sIdx) => {
        const color = CHART_PALETTE[sIdx % CHART_PALETTE.length];
        return `<span style="display:inline-flex; align-items:center; gap:4px; margin-right:12px; font-size:8pt;"><span style="width:9px; height:9px; background:${color}; display:inline-block;"></span>${escapeHtml(s.name)}</span>`;
      })
      .join('');

    return `
      <div style="margin-top: 12px;">
        <div style="font-weight:700; font-size:9.5pt; margin-bottom:4px; color:#0f172a;">${escapeHtml(title)}</div>
        <svg width="100%" viewBox="0 0 ${w} ${h}" style="max-width:100%; height:auto;">
          ${gridLines}
          ${xLabels}
          ${polylines}
        </svg>
        <div style="margin-top:4px;">${legend}</div>
      </div>
    `;
  }

  printCurrentDisciplinaryReportA4() {
    const report = this.currentDisciplinaryReportData;
    if (!report) {
      showToast('Primero emita el informe en pantalla', 'warning');
      return;
    }

    const printContainer = document.getElementById('disciplinary-print-container');
    if (!printContainer) return;

    const companyName = report.company?.name || this.activeCompany?.name || 'Empresa';
    const companyCuit = report.company?.cuit || this.activeCompany?.cuit || '';
    const periodText = `${formatDateAr(report.parameters?.dateFrom)} al ${formatDateAr(report.parameters?.dateTo)}`;
    const empScope = report.employeeFilter
      ? `[${report.employeeFilter.fileNumber}] ${report.employeeFilter.lastName}, ${report.employeeFilter.firstName}`
      : 'Todos los colaboradores';

    let bodyContentHtml = '';

    if (report.reportType === 'INCIDENTS_DETAIL') {
      bodyContentHtml = (report.groups || [])
        .map(
          (g) => `
          <div class="disc-print-group-title">
            TIPO DE INCIDENTE: [${escapeHtml(g.incidentTypeCode)}] ${escapeHtml(g.incidentTypeName)} — Gravedad: ${escapeHtml(getSeverityText(g.severity))} (${g.count} caso/s)
          </div>
          <table class="disc-print-table">
            <thead>
              <tr>
                <th style="width: 11%;">Fecha</th>
                <th style="width: 10%;">Legajo</th>
                <th style="width: 24%;">Colaborador</th>
                <th style="width: 16%;">Sector</th>
                <th style="width: 24%;">Observaciones</th>
                <th style="width: 15%;">Estado / Sanción</th>
              </tr>
            </thead>
            <tbody>
              ${g.items
                .map(
                  (it) => `
                  <tr>
                    <td class="disc-col-nowrap">${formatDateAr(it.incidentDate)}</td>
                    <td class="disc-col-nowrap">${escapeHtml(it.fileNumber)}</td>
                    <td>${escapeHtml(it.employeeName)}</td>
                    <td>${escapeHtml(it.departmentName)}</td>
                    <td>${escapeHtml(it.observations || '-')}</td>
                    <td>${escapeHtml(it.isSanctioned ? `Sancionado (${it.sanctionsText})` : 'Sin sancionar')}</td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        `
        )
        .join('');
    } else if (report.reportType === 'SANCTIONS_DETAIL') {
      bodyContentHtml = (report.groups || [])
        .map(
          (g) => `
          <div class="disc-print-group-title">
            TIPO DE SANCIÓN: [${escapeHtml(g.sanctionTypeCode)}] ${escapeHtml(g.sanctionTypeName)} — Gravedad: ${escapeHtml(getSeverityText(g.severity))} (${g.count} caso/s)
          </div>
          <table class="disc-print-table">
            <thead>
              <tr>
                <th style="width: 11%;">Fecha</th>
                <th style="width: 9%;">Legajo</th>
                <th style="width: 22%;">Colaborador</th>
                <th style="width: 14%;">Sector</th>
                <th style="width: 8%; text-align:right;">Susp.</th>
                <th style="width: 18%;">Incidentes Asociados</th>
                <th style="width: 18%;">Observaciones</th>
              </tr>
            </thead>
            <tbody>
              ${g.items
                .map(
                  (it) => `
                  <tr>
                    <td class="disc-col-nowrap">${formatDateAr(it.sanctionDate)}</td>
                    <td class="disc-col-nowrap">${escapeHtml(it.fileNumber)}</td>
                    <td>${escapeHtml(it.employeeName)}</td>
                    <td>${escapeHtml(it.departmentName)}</td>
                    <td class="disc-col-nowrap" style="text-align:right;">${it.suspensionDays ? `${it.suspensionDays} d.` : '-'}</td>
                    <td>${escapeHtml(it.linkedIncidentsText || 'Sin incidentes')}</td>
                    <td>${escapeHtml(it.observations || '-')}</td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        `
        )
        .join('');
    } else if (report.reportType === 'INCIDENTS_STATS') {
      const totals = report.totalsByType || [];
      const dist = report.sanctionedDistribution || { sanctioned: 0, unsanctioned: 0 };
      const pie1 = this.buildSvgPieChartForPrint(
        'Porcentaje por Tipo de Incidente sobre el Total',
        totals.map((t, i) => ({ label: t.name, value: t.count, color: CHART_PALETTE[i % CHART_PALETTE.length] }))
      );
      const pie2 = this.buildSvgPieChartForPrint('Distribución de Incidentes Sancionados vs. No Sancionados', [
        { label: 'Sancionados', value: dist.sanctioned, color: '#dc2626' },
        { label: 'No Sancionados', value: dist.unsanctioned, color: '#0d9488' },
      ]);
      const lineSvg = this.buildSvgLineChartForPrint(
        'Evolución Mensual de Totales por Tipo de Incidente',
        report.evolution?.months || [],
        report.evolution?.series || []
      );

      bodyContentHtml = `
        <table class="disc-print-table" style="margin-bottom: 14px;">
          <thead>
            <tr>
              <th style="width: 16%;">Código</th>
              <th style="width: 54%;">Tipo de Incidente</th>
              <th style="width: 15%; text-align:right;">Cantidad</th>
              <th style="width: 15%; text-align:right;">Porcentaje</th>
            </tr>
          </thead>
          <tbody>
            ${totals
              .map(
                (t) => `
                <tr>
                  <td class="disc-col-nowrap">${escapeHtml(t.code)}</td>
                  <td>${escapeHtml(t.name)}</td>
                  <td class="disc-col-nowrap" style="text-align:right;">${t.count}</td>
                  <td class="disc-col-nowrap" style="text-align:right;">${t.percentage.toFixed(2)}%</td>
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
        <div style="display:flex; justify-content:space-between; gap:20px;">
          <div style="width:50%;">${pie1}</div>
          <div style="width:50%;">${pie2}</div>
        </div>
        ${lineSvg}
      `;
    } else if (report.reportType === 'SANCTIONS_STATS') {
      const totals = report.totalsByType || [];
      const pie1 = this.buildSvgPieChartForPrint(
        'Porcentaje por Tipo de Sanción sobre el Total',
        totals.map((t, i) => ({ label: t.name, value: t.count, color: CHART_PALETTE[i % CHART_PALETTE.length] }))
      );
      const lineSvg = this.buildSvgLineChartForPrint(
        'Evolución Mensual de Totales por Tipo de Sanción',
        report.evolution?.months || [],
        report.evolution?.series || []
      );

      bodyContentHtml = `
        <table class="disc-print-table" style="margin-bottom: 14px;">
          <thead>
            <tr>
              <th style="width: 16%;">Código</th>
              <th style="width: 54%;">Tipo de Sanción</th>
              <th style="width: 15%; text-align:right;">Cantidad</th>
              <th style="width: 15%; text-align:right;">Porcentaje</th>
            </tr>
          </thead>
          <tbody>
            ${totals
              .map(
                (t) => `
                <tr>
                  <td class="disc-col-nowrap">${escapeHtml(t.code)}</td>
                  <td>${escapeHtml(t.name)}</td>
                  <td class="disc-col-nowrap" style="text-align:right;">${t.count}</td>
                  <td class="disc-col-nowrap" style="text-align:right;">${t.percentage.toFixed(2)}%</td>
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
        ${pie1}
        ${lineSvg}
      `;
    }

    printContainer.innerHTML = `
      <div class="disc-print-sheet">
        <div class="disc-print-header">
          <div>
            <div class="disc-print-company">${escapeHtml(companyName)} ${companyCuit ? `(CUIT: ${escapeHtml(formatCuit(companyCuit))})` : ''}</div>
            <div class="disc-print-title">${escapeHtml(report.title)}</div>
          </div>
          <div class="disc-print-meta">
            <div>Período: <strong>${escapeHtml(periodText)}</strong></div>
            <div>Alcance: <strong>${escapeHtml(empScope)}</strong> | Total: <strong>${report.totalCount || 0}</strong></div>
          </div>
        </div>
        ${bodyContentHtml}
        <div class="disc-print-footer">
          <span>Régimen Disciplinario — ${escapeHtml(companyName)}</span>
          <span>Emitido el ${new Date().toLocaleString('es-AR')}</span>
        </div>
      </div>
    `;

    this.triggerDisciplinaryPrintWindow();
  }

  triggerDisciplinaryPrintWindow() {
    const printContainer = document.getElementById('disciplinary-print-container');
    if (!printContainer) return;

    printContainer.classList.remove('d-none');
    document.body.classList.add('disciplinary-printing');

    const cleanup = () => {
      document.body.classList.remove('disciplinary-printing');
      printContainer.classList.add('d-none');
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      window.print();
    }, 150);
  }

  // =========================================================================
  // 4. PESTAÑA 7 EN LEGAJO DEL EMPLEADO: HISTORIAL DISCIPLINARIO INVERSO + PDF
  // =========================================================================

  resetEmployeeDisciplinaryHistoryTab() {
    this.currentEmployeeDisciplinaryHistory = null;
    const countBadge = document.getElementById('emp-disciplinary-tab-count');
    if (countBadge) countBadge.textContent = '0';

    const incBadge = document.getElementById('emp-disc-summary-incidents');
    if (incBadge) incBadge.textContent = '0 Incidentes';
    const sancBadge = document.getElementById('emp-disc-summary-sanctions');
    if (sancBadge) sancBadge.textContent = '0 Sanciones';
    const suspBadge = document.getElementById('emp-disc-summary-susp-days');
    if (suspBadge) suspBadge.textContent = '0 Días Susp.';

    const tbody = document.getElementById('emp-disciplinary-history-tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-4 text-muted">
            Guarde el nuevo legajo primero para registrar o consultar su historial de incidentes y sanciones.
          </td>
        </tr>
      `;
    }
  }

  async loadEmployeeDisciplinaryHistoryTab(employeeId) {
    if (!employeeId) {
      this.resetEmployeeDisciplinaryHistoryTab();
      return;
    }

    const tbody = document.getElementById('emp-disciplinary-history-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-1"></span> Cargando historial disciplinario...</td></tr>`;
    }

    try {
      const res = await apiRequest(`/disciplinary/employees/${employeeId}/history`);
      const data = res.data;
      this.currentEmployeeDisciplinaryHistory = data;

      const totalEvents = data.history?.length || 0;
      const countBadge = document.getElementById('emp-disciplinary-tab-count');
      if (countBadge) countBadge.textContent = String(totalEvents);

      const incBadge = document.getElementById('emp-disc-summary-incidents');
      if (incBadge) incBadge.textContent = `${data.summary?.totalIncidents || 0} Incidente(s)`;
      const sancBadge = document.getElementById('emp-disc-summary-sanctions');
      if (sancBadge) sancBadge.textContent = `${data.summary?.totalSanctions || 0} Sanción(es)`;
      const suspBadge = document.getElementById('emp-disc-summary-susp-days');
      if (suspBadge) suspBadge.textContent = `${data.summary?.totalSuspensionDays || 0} Día(s) Susp.`;

      if (!tbody) return;
      if (totalEvents === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center py-4 text-muted">
              <i class="ti ti-circle-check text-success me-1"></i> El colaborador no registra incidentes ni sanciones disciplinarias en su legajo.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = data.history
        .map((item, idx) => {
          const isSanc = item.kind === 'SANCTION';
          const kindBadge = isSanc
            ? '<span class="badge bg-danger-lt text-danger fw-bold"><i class="ti ti-gavel me-1"></i>SANCIÓN</span>'
            : '<span class="badge bg-amber-lt text-amber fw-bold"><i class="ti ti-alert-triangle me-1"></i>INCIDENTE</span>';

          let extraDetail = '';
          if (isSanc) {
            const suspTxt = item.suspensionDays ? `<span class="badge bg-purple-lt text-purple me-1">${item.suspensionDays} día(s) susp.</span>` : '';
            const linkedTxt =
              item.linkedIncidents && item.linkedIncidents.length > 0
                ? `<div class="small text-muted mt-1"><i class="ti ti-link me-1"></i>Originada por: ${escapeHtml(
                    item.linkedIncidents.map((li) => `${formatDateAr(li.date)} (${li.typeName})`).join(', ')
                  )}</div>`
                : `<div class="small text-muted mt-1">Sanción directa (sin incidentes asociados)</div>`;
            extraDetail = `${suspTxt}${linkedTxt}`;
          } else {
            extraDetail = item.isSanctioned
              ? `<div class="small text-danger mt-1"><i class="ti ti-gavel me-1"></i>Sancionado en: ${escapeHtml(
                  item.sanctions.map((s) => `${s.typeName} (${formatDateAr(s.date)})`).join(', ')
                )}</div>`
              : `<div class="small text-muted mt-1">Sin sanción aplicada</div>`;
          }

          const attCount = Array.isArray(item.attachments) ? item.attachments.length : 0;
          const attBtn =
            attCount > 0
              ? `<button type="button" class="btn btn-xs btn-outline-teal btn-emp-hist-att" data-idx="${idx}">
                   <i class="ti ti-paperclip me-1"></i>${attCount} adj.
                 </button>`
              : `<span class="text-muted small">-</span>`;

          return `
            <tr>
              <td class="font-monospace fw-bold">${formatDateAr(item.eventDate)}</td>
              <td class="text-center">${kindBadge}</td>
              <td>
                <div class="fw-bold text-dark">[${escapeHtml(item.typeCode)}] ${escapeHtml(item.typeName)}</div>
                <div>${getSeverityBadge(item.severity)}</div>
              </td>
              <td>
                <div class="text-dark small">${escapeHtml(item.observations || 'Sin observaciones')}</div>
                ${extraDetail}
              </td>
              <td class="text-center">${attBtn}</td>
            </tr>
          `;
        })
        .join('');

      tbody.querySelectorAll('.btn-emp-hist-att').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = data.history[parseInt(btn.dataset.idx, 10)];
          if (item) {
            this.openDisciplinaryAttachmentsViewer(
              `${item.kind === 'SANCTION' ? 'Sanción' : 'Incidente'} del ${formatDateAr(item.eventDate)} — ${item.typeName}`,
              item.attachments || []
            );
          }
        });
      });
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-danger">${escapeHtml(err.message || 'Error al cargar historial')}</td></tr>`;
      }
    }
  }

  async downloadEmployeeDisciplinaryHistoryPdf() {
    const empId = document.getElementById('employee-form-id')?.value;
    if (!empId) {
      showToast('Guarde el legajo primero para exportar su historial en PDF', 'warning');
      return;
    }

    try {
      showToast('Generando historial disciplinario en PDF A4...', 'info');
      const token = storage.getToken();
      const companyId = storage.getActiveCompanyId();
      const res = await fetch(`/api/v1/disciplinary/employees/${encodeURIComponent(empId)}/history/pdf`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      });

      if (!res.ok) {
        throw new Error('Error al generar el PDF del historial disciplinario.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `historial_disciplinario_legajo_${empId.slice(0, 6)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Historial disciplinario PDF A4 descargado', 'success');
    } catch (err) {
      showToast(err.message || 'Error al descargar historial PDF', 'danger');
    }
  }

  printEmployeeDisciplinaryHistoryA4() {
    const data = this.currentEmployeeDisciplinaryHistory;
    if (!data || !data.employee) {
      showToast('No hay datos de historial cargados para imprimir', 'warning');
      return;
    }

    const printContainer = document.getElementById('disciplinary-print-container');
    if (!printContainer) return;

    const emp = data.employee;
    const companyName = data.company?.name || this.activeCompany?.name || 'Empresa';
    const companyCuit = data.company?.cuit || this.activeCompany?.cuit || '';

    const rowsHtml =
      !data.history || data.history.length === 0
        ? `<tr><td colspan="5" style="text-align:center; padding:14px;">El colaborador no registra incidentes ni sanciones disciplinarias.</td></tr>`
        : data.history
            .map((item) => {
              const isSanc = item.kind === 'SANCTION';
              const linkText = isSanc
                ? item.linkedIncidents?.length > 0
                  ? `${item.suspensionDays ? `Susp.: ${item.suspensionDays} d. | ` : ''}Inc.: ${item.linkedIncidents.map((i) => `${formatDateAr(i.date)} (${i.typeCode})`).join(', ')}`
                  : item.suspensionDays
                    ? `Susp.: ${item.suspensionDays} día(s) | Directa`
                    : 'Directa (sin incidentes)'
                : item.isSanctioned
                  ? `Sancionado (${item.sanctions.map((s) => `${formatDateAr(s.date)} ${s.typeCode}`).join(', ')})`
                  : 'Sin sancionar';

              return `
                <tr>
                  <td class="disc-col-nowrap">${formatDateAr(item.eventDate)}</td>
                  <td class="disc-col-nowrap"><strong>${isSanc ? 'SANCIÓN' : 'INCIDENTE'}</strong></td>
                  <td>[${escapeHtml(item.typeCode)}] ${escapeHtml(item.typeName)}</td>
                  <td>${escapeHtml(item.observations || '-')}</td>
                  <td>${escapeHtml(linkText)}</td>
                </tr>
              `;
            })
            .join('');

    printContainer.innerHTML = `
      <div class="disc-print-sheet">
        <div class="disc-print-header">
          <div>
            <div class="disc-print-company">${escapeHtml(companyName)} ${companyCuit ? `(CUIT: ${escapeHtml(formatCuit(companyCuit))})` : ''}</div>
            <div class="disc-print-title">HISTORIAL DE INCIDENTES Y SANCIONES DEL LEGAJO</div>
          </div>
          <div class="disc-print-meta">
            <div>Legajo: <strong>${escapeHtml(emp.fileNumber)}</strong> — <strong>${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}</strong></div>
            <div>CUIL: <strong>${escapeHtml(formatCuit(emp.cuil))}</strong> | Sector: <strong>${escapeHtml(emp.department)}</strong></div>
            <div>Incidentes: <strong>${data.summary?.totalIncidents || 0}</strong> | Sanciones: <strong>${data.summary?.totalSanctions || 0}</strong> | Días Susp.: <strong>${data.summary?.totalSuspensionDays || 0}</strong></div>
          </div>
        </div>
        <table class="disc-print-table">
          <thead>
            <tr>
              <th style="width: 11%;">Fecha</th>
              <th style="width: 12%;">Evento</th>
              <th style="width: 24%;">Tipo / Motivo</th>
              <th style="width: 31%;">Observaciones / Detalle</th>
              <th style="width: 22%;">Vinculación / Estado</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="disc-print-footer">
          <span>Historial Disciplinario — Legajo ${escapeHtml(emp.fileNumber)} (${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)})</span>
          <span>Emitido el ${new Date().toLocaleString('es-AR')}</span>
        </div>
      </div>
    `;

    this.triggerDisciplinaryPrintWindow();
  }
}

export function registerDisciplinaryMethods(targetPrototype) {
  Object.getOwnPropertyNames(DisciplinaryMethods.prototype).forEach((name) => {
    if (name !== 'constructor') {
      targetPrototype[name] = DisciplinaryMethods.prototype[name];
    }
  });
}

