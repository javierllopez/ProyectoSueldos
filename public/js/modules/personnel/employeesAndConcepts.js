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
  async loadEmployees() {
    const tbody = document.getElementById('employees-table-body');
    const paginationContainer = document.getElementById('employees-pagination-container');
    if (paginationContainer) paginationContainer.classList.add('d-none');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-5">
            <div class="d-flex flex-column align-items-center justify-content-center gap-2">
              <div class="spinner-border" style="width: 2.25rem; height: 2.25rem; color: var(--pers-emerald-600);" role="status"></div>
              <div class="fw-bold mt-2" style="color: var(--pers-forest-900); font-family: 'Plus Jakarta Sans', sans-serif;">Cargando nómina de colaboradores...</div>
              <div class="w-75 mt-2">
                <div class="pers-skeleton-row"></div>
                <div class="pers-skeleton-row" style="width: 85%; margin: 8px auto;"></div>
                <div class="pers-skeleton-row" style="width: 70%; margin: 8px auto;"></div>
              </div>
            </div>
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
          <td colspan="7" class="text-center p-0">
            <div class="pers-empty-card">
              <div class="pers-empty-icon-wrap">
                <i class="ti ti-users-off"></i>
              </div>
              <div class="pers-empty-title">No se encontraron colaboradores registrados</div>
              <div class="pers-empty-desc">No hay empleados que coincidan con los filtros seleccionados. Comienza creando un nuevo legajo o ajusta los criterios de búsqueda.</div>
              <button type="button" class="btn-pers-primary" onclick="document.getElementById('btn-open-new-employee-modal').click()">
                <i class="ti ti-user-plus"></i>
                <span>Nuevo Legajo</span>
              </button>
            </div>
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
        const termDateFormatted = emp.terminationDate
          ? new Date(`${String(emp.terminationDate).slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR')
          : null;
        const statusBadge =
          emp.status === 'ACTIVE'
            ? '<span class="badge bg-success-lt"><i class="ti ti-check me-1"></i>Activo</span>'
            : emp.status === 'ON_LEAVE'
            ? '<span class="badge bg-warning-lt"><i class="ti ti-clock me-1"></i>Licencia</span>'
            : `<span class="badge bg-danger-lt"><i class="ti ti-x me-1"></i>Inactivo</span>${
                termDateFormatted
                  ? `<small class="d-block text-muted mt-1" title="${escapeHtml(emp.terminationReason || 'Fecha de baja')}">Baja: ${termDateFormatted}</small>`
                  : ''
              }`;

        const hireDateFormatted = emp.hireDate ? new Date(emp.hireDate).toLocaleDateString('es-AR') : '-';
        const cuitFormatted = emp.cuil ? formatCuit(emp.cuil) : '-';
        const docFormatted = `${emp.documentType || 'DNI'} ${emp.documentNumber || ''}`;

        const photoAvatarHtml = emp.photo
          ? `<span class="avatar avatar-md rounded-circle me-2 border border-2 border-teal shadow-xs emp-table-photo-avatar cursor-pointer" data-emp-id="${emp.id}" style="background-image: url('${escapeHtml(emp.photo)}'); background-size: cover; background-position: center;"></span>`
          : `<span class="avatar avatar-md bg-teal-lt text-teal rounded-circle me-2 fw-bold border border-teal-lt">${initials}</span>`;

        return `
          <tr>
            <td class="pers-legajo-cell">${escapeHtml(emp.fileNumber || '-')}</td>
            <td>
              <div class="d-flex align-items-center">
                ${photoAvatarHtml}
                <div class="pers-text-truncate" style="max-width: 220px;">
                  <div class="fw-bold text-dark text-truncate" title="${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}">${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}</div>
                  <small class="text-muted text-truncate d-block" title="${escapeHtml(emp.email || emp.phone || 'Sin contacto')}">${escapeHtml(emp.email || emp.phone || 'Sin contacto')}</small>
                </div>
              </div>
            </td>
            <td>
              <div>${escapeHtml(docFormatted)}</div>
              <small class="text-muted font-monospace">${escapeHtml(cuitFormatted)}</small>
            </td>
            <td>
              <div class="fw-medium text-teal pers-text-truncate" title="${escapeHtml(emp.department?.name || 'Sin sector')}">${escapeHtml(emp.department?.name || 'Sin sector')}</div>
              <small class="text-muted pers-text-truncate d-block" title="${escapeHtml(emp.jobPosition?.name || 'Sin puesto')}">${escapeHtml(emp.jobPosition?.name || 'Sin puesto')}</small>
            </td>
            <td class="text-nowrap">${hireDateFormatted}</td>
            <td>${statusBadge}</td>
            <td class="text-end text-nowrap">
              <div class="d-inline-flex gap-1 justify-content-end align-items-center">
                <button type="button" class="pers-action-btn pers-action-btn-edit btn-edit-employee" data-id="${emp.id}" data-bs-toggle="tooltip" data-bs-placement="top" title="Modificar Ficha" aria-label="Modificar Ficha">
                  <i class="ti ti-edit"></i>
                </button>
                ${
                  emp.status === 'ACTIVE'
                    ? `
                  <button type="button" class="pers-action-btn pers-action-btn-delete btn-delete-employee" data-id="${emp.id}" data-name="${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}" data-bs-toggle="tooltip" data-bs-placement="top" title="Dar de Baja" aria-label="Dar de Baja">
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

    tbody.querySelectorAll('.emp-table-photo-avatar').forEach((avatarEl) => {
      avatarEl.addEventListener('mouseenter', () => {
        const emp = this.employees.find((x) => x.id === avatarEl.dataset.empId);
        if (emp && emp.photo) {
          this.showEmployeePhotoZoom(
            emp.photo,
            `${emp.lastName || ''}, ${emp.firstName || ''}`.replace(/^,\s*|\s*,\s*$/g, ''),
            avatarEl.getBoundingClientRect()
          );
        }
      });
      avatarEl.addEventListener('mouseleave', () => {
        this.hideEmployeePhotoZoom();
      });
    });
  }

  showEmployeePhotoZoom(photoSrc, captionText, anchorRect) {
    if (!photoSrc) return;
    const popover = document.getElementById('employee-photo-zoom-popover');
    const imgEl = document.getElementById('employee-photo-zoom-img');
    const capEl = document.getElementById('employee-photo-zoom-caption');
    if (!popover || !imgEl) return;

    imgEl.src = photoSrc;
    if (capEl) {
      capEl.textContent = captionText || 'Foto del colaborador';
    }

    popover.classList.remove('d-none');

    const popW = 246;
    const popH = 266;
    const margin = 12;
    let left = (anchorRect?.right || 100) + margin;
    let top = (anchorRect?.top || 100) - 8;

    if (left + popW > window.innerWidth - 12) {
      left = Math.max(12, (anchorRect?.left || 100) - popW - margin);
    }
    if (top + popH > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - popH - 12);
    }
    if (top < 12) top = 12;

    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }

  hideEmployeePhotoZoom() {
    const popover = document.getElementById('employee-photo-zoom-popover');
    if (popover) {
      popover.classList.add('d-none');
    }
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


  renderEmployeeRelativesTable() {
    const tbody = document.getElementById('employee-relatives-table-body');
    const tabCount = document.getElementById('emp-relatives-tab-count');
    if (tabCount) tabCount.textContent = this.currentEmployeeRelatives.length;

    if (!tbody) return;

    if (this.currentEmployeeRelatives.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-4 text-muted">
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
        const isAdherent = Boolean(rel.isAdherent);

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
            <td>
              ${isAdherent
                ? '<span class="badge bg-purple-lt text-purple fw-bold"><i class="ti ti-shield-plus me-1"></i>Adherente OS</span>'
                : '<span class="badge bg-light text-muted border"><i class="ti ti-shield-check me-1"></i>Titular OS</span>'}
              ${rel.appliesIncomeTax
                ? `<span class="badge bg-indigo-lt text-indigo fw-bold ms-1" title="Carga computable para Ganancias (${rel.incomeTaxType})"><i class="ti ti-receipt-tax me-1"></i>Ganancias (${Number(rel.deductionPercentage || 100)}%)</span>`
                : ''}
            </td>
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

    const shiftId = document.getElementById('employee-select-work-shift')?.value;
    const shift = shiftId ? (this.workShifts || []).find((s) => s.id === shiftId) : null;
    if (shift && shift.percentage !== undefined && shift.percentage !== null) {
      pct = Number(shift.percentage);
    }

    const pctInput = document.getElementById('employee-input-part-time-pct');
    if (pctInput) pctInput.value = pct;

    const badge = document.getElementById('emp-jornada-badge');
    if (badge) {
      if (shift) {
        badge.innerHTML = `<i class="ti ti-clock-check me-1"></i>${escapeHtml(shift.name)} (${Number(pct).toFixed(0)}% / ${Number(shift.weeklyHours).toFixed(1)}hs sem)`;
        badge.className = 'badge bg-blue text-white shadow-xs';
      } else if (isPartTime || pct < 100) {
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
        const conceptsList = (this.allPayrollConcepts && this.allPayrollConcepts.length > 0)
          ? this.allPayrollConcepts
          : (this.payrollConcepts || []);
        const concept = item.concept || conceptsList.find((c) => c.id === item.conceptId) || {};
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

  async fetchAllPayrollConcepts(forceRefresh = false) {
    if (!this.allPayrollConcepts || this.allPayrollConcepts.length === 0 || forceRefresh) {
      try {
        const res = await apiRequest('/payroll/concepts?limit=1000');
        this.allPayrollConcepts = res.data || [];
      } catch (err) {
        console.warn('Error al cargar catálogo completo de conceptos:', err);
        if (!this.allPayrollConcepts) this.allPayrollConcepts = [];
      }
    }
    return this.allPayrollConcepts;
  }

  async ensurePayrollConceptsLoaded(forceRefresh = false) {
    await this.fetchAllPayrollConcepts(forceRefresh);
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
      const conceptsList = (this.allPayrollConcepts && this.allPayrollConcepts.length > 0)
        ? this.allPayrollConcepts
        : (this.payrollConcepts || []);
      select.innerHTML = '<option value="">Seleccione un concepto...</option>' +
        conceptsList.map((c) => `<option value="${c.id}">${escapeHtml(c.code)} - ${escapeHtml(c.name)} (${escapeHtml(c.type)})</option>`).join('');
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
      const conceptsList = (this.allPayrollConcepts && this.allPayrollConcepts.length > 0)
        ? this.allPayrollConcepts
        : (this.payrollConcepts || []);
      select.innerHTML = '<option value="">Seleccione un concepto...</option>' +
        conceptsList.map((c) => `<option value="${c.id}">${escapeHtml(c.code)} - ${escapeHtml(c.name)} (${escapeHtml(c.type)})</option>`).join('');
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
        const conceptsList = (this.allPayrollConcepts && this.allPayrollConcepts.length > 0)
          ? this.allPayrollConcepts
          : (this.payrollConcepts || []);
        const conceptObj = conceptsList.find((c) => c.id === payload.conceptId);
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


  populateEmployeeSelects(selectedDept = '', selectedJob = '', selectedHi = '', selectedUnion = '', selectedMutual = '', selectedContractModality = '', selectedSalaryScale = '', selectedWorkShift = '', selectedPaymentMethod = '') {
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

    // Selector de Jornada de Trabajo en Tab 6
    const shiftSelect = document.getElementById('employee-select-work-shift');
    if (shiftSelect) {
      const activeShifts = (this.workShifts || []).filter((s) => s.isActive !== false);
      const optsHtml =
        '<option value="">Sin jornada específica asignada (Usar estándar 8hs/48hs/200hs)</option>' +
        activeShifts
          .map(
            (s) =>
              `<option value="${s.id}" ${s.id === selectedWorkShift ? 'selected' : ''}>${escapeHtml(s.name)} (${Number(s.weeklyHours).toFixed(1)}hs sem / ${Number(s.monthlyHours).toFixed(1)}hs mes / ${Number(s.dailyHours).toFixed(1)}hs día)</option>`
          )
          .join('');
      updateSearchableSelect(shiftSelect, optsHtml, selectedWorkShift);
    }

    // Selector de Forma de Pago en Tab 6
    const pmSelect = document.getElementById('employee-select-payment-method');
    if (pmSelect) {
      const methods = this.paymentMethods || [];
      const optsHtml =
        '<option value="">-- Seleccionar Forma de Pago --</option>' +
        methods
          .map(
            (pm) =>
              `<option value="${pm.id}" ${pm.id === selectedPaymentMethod ? 'selected' : ''}>${escapeHtml(pm.name)}</option>`
          )
          .join('');
      pmSelect.innerHTML = optsHtml;
      pmSelect.value = selectedPaymentMethod || '';
      this.updateEmployeePaymentMethodDesc(pmSelect.value);
    }

    this.updateSalaryScaleOptions(selectedContractModality, selectedSalaryScale, {
      selectedJobPositionId: selectedJob,
      isUserJobChange: false,
    });
  }

  updateEmployeePaymentMethodDesc(paymentMethodId) {
    const descEl = document.getElementById('employee-payment-method-desc');
    if (!descEl) return;

    const pm = (this.paymentMethods || []).find((m) => m.id === paymentMethodId);
    if (pm && pm.description) {
      descEl.innerHTML = `<i class="ti ti-circle-check me-1 text-teal flex-shrink-0"></i><span class="text-dark">${escapeHtml(pm.description)}</span>`;
    } else if (pm) {
      descEl.innerHTML = `<i class="ti ti-circle-check me-1 text-teal flex-shrink-0"></i><span class="text-dark">Forma de pago seleccionada: ${escapeHtml(pm.name)}.</span>`;
    } else {
      descEl.innerHTML = `<i class="ti ti-info-circle me-1 text-teal flex-shrink-0"></i><span>Seleccioná una forma de pago para visualizar su descripción operativa.</span>`;
    }
  }

  handleEmployeeWorkShiftChange(shiftId) {
    const daysInput = document.getElementById('employee-input-monthly-days');
    const dailyHoursInput = document.getElementById('employee-input-daily-hours');
    const weeklyHoursInput = document.getElementById('employee-input-weekly-hours');
    const monthlyHoursInput = document.getElementById('employee-input-monthly-hours');
    const isPartTimeCheck = document.getElementById('employee-input-is-part-time');

    if (!shiftId) {
      if (daysInput) daysInput.value = '30.00';
      if (dailyHoursInput) dailyHoursInput.value = '8.00';
      if (weeklyHoursInput && !weeklyHoursInput.value) {
        weeklyHoursInput.value = this.payrollSettings?.standardWeeklyHoursFormatted || '48:00';
      }
      if (monthlyHoursInput && !monthlyHoursInput.value) {
        monthlyHoursInput.value = this.payrollSettings?.standardMonthlyHoursFormatted || '200:00';
      }
      this.updateEmployeeJornadaBadge();
      return;
    }

    const shift = (this.workShifts || []).find((s) => s.id === shiftId);
    if (!shift) return;

    if (daysInput) daysInput.value = Number(shift.monthlyDays).toFixed(2);
    if (dailyHoursInput) dailyHoursInput.value = Number(shift.dailyHours).toFixed(2);
    if (weeklyHoursInput) weeklyHoursInput.value = this.formatDecimalToHours(shift.weeklyHours);
    if (monthlyHoursInput) monthlyHoursInput.value = this.formatDecimalToHours(shift.monthlyHours);

    const partTimePctInput = document.getElementById('employee-input-part-time-pct');
    if (partTimePctInput && shift.percentage !== undefined && shift.percentage !== null) {
      partTimePctInput.value = Number(shift.percentage);
    }

    const stdWeeklyDec = this.parseHoursToDecimal(this.payrollSettings?.standardWeeklyHoursFormatted || '48:00') || 48;
    if (isPartTimeCheck) {
      isPartTimeCheck.checked = Number(shift.weeklyHours) < stdWeeklyDec;
    }
    this.updateEmployeeJornadaBadge();
  }

  /**
   * Obtiene el puesto de trabajo actualmente seleccionado en el legajo y su código CCT asociado.
   */
  getSelectedEmployeeJobCct(explicitJobId = undefined) {
    const jobId =
      explicitJobId !== undefined && explicitJobId !== null
        ? String(explicitJobId)
        : (document.getElementById('employee-input-job-position')?.value || '');
    const job = (this.jobPositions || []).find((p) => p.id === jobId) || null;
    const cctCode = job ? (job.cctCode || job.cct?.code || null) : null;
    const cctObj = job?.cct || (cctCode ? (this.arcaCcts || []).find((c) => c.code === cctCode) : null);
    return {
      job,
      cctCode: cctCode ? String(cctCode).trim() : null,
      cctName: cctObj?.name || null,
    };
  }

  /**
   * Filtra y actualiza dinámicamente las opciones del selector de nómina según la modalidad de contrato
   * (pasantes Mod. 27/51, directores Mod. 099 o estándar) y el Convenio Colectivo (CCT) del puesto laboral asignado.
   */
  updateSalaryScaleOptions(selectedContractModality, selectedSalaryScale, options = {}) {
    const scaleSelect = document.getElementById('employee-select-salary-scale');
    if (!scaleSelect) return;

    const { selectedJobPositionId, isUserJobChange = false } = options || {};
    const modCode = selectedContractModality !== undefined && selectedContractModality !== null
      ? String(selectedContractModality)
      : (document.getElementById('employee-input-contract-modality')?.value || '');
    const isInternMod = modCode === '27' || modCode === '51';
    const isDirectorMod = modCode === '99';
    const allScales = this.salaryScales || [];

    const modalityScales = isDirectorMod
      ? allScales.filter((s) => s.isDirectorOnly === true)
      : (isInternMod
          ? allScales.filter((s) => s.isInternOnly === true)
          : allScales.filter((s) => !s.isInternOnly && !s.isDirectorOnly));

    const { job, cctCode: jobCctCode, cctName: jobCctName } = this.getSelectedEmployeeJobCct(selectedJobPositionId);

    let filteredScales = modalityScales;
    let filterMode = 'STANDARD';

    if (!isInternMod && !isDirectorMod) {
      if (jobCctCode) {
        const cctMatched = modalityScales.filter((s) => s.cctCode === jobCctCode);
        if (cctMatched.length > 0) {
          filteredScales = cctMatched;
          filterMode = 'CCT_EXACT';
        } else {
          const generalFallback = modalityScales.filter((s) => !s.cctCode);
          if (generalFallback.length > 0) {
            filteredScales = generalFallback;
            filterMode = 'CCT_FALLBACK_GENERAL';
          } else {
            filteredScales = [];
            filterMode = 'CCT_EMPTY';
          }
        }
      } else {
        filteredScales = modalityScales;
        filterMode = job ? 'JOB_NO_CCT' : 'NO_JOB';
      }
    }

    let targetSelection =
      selectedSalaryScale !== undefined && selectedSalaryScale !== null
        ? String(selectedSalaryScale)
        : (scaleSelect.value || '');

    let legacyOutOfCctScale = null;
    if (targetSelection && !filteredScales.some((s) => s.id === targetSelection)) {
      if (!isUserJobChange) {
        legacyOutOfCctScale = modalityScales.find((s) => s.id === targetSelection) || null;
      }
      if (!legacyOutOfCctScale) {
        targetSelection = '';
      }
    }

    // Actualizar títulos e indicaciones visuales
    const cardTitle = document.getElementById('employee-scale-card-title');
    const selectLabel = document.getElementById('employee-scale-select-label');
    const selectHint = document.getElementById('employee-scale-select-hint');
    const amountLabel = document.getElementById('employee-scale-amount-label');
    const cctBadge = document.getElementById('employee-scale-cct-badge');

    if (cardTitle) {
      cardTitle.textContent = isDirectorMod
        ? 'Retribución / Honorarios del Director (LRT Mod. 099)'
        : (isInternMod ? 'Asignación Estímulo del Pasante (Ley 26.427)' : 'Sueldo Básico del Colaborador');
    }
    if (selectLabel) {
      selectLabel.innerHTML = isDirectorMod
        ? 'Nómina de Director Asignada <span class="text-danger">*</span>'
        : (isInternMod ? 'Nómina de Pasante Asignada <span class="text-danger">*</span>' : 'Nómina / Básico Asignado <span class="text-danger">*</span>');
    }
    if (cctBadge) {
      if (isInternMod || isDirectorMod) {
        cctBadge.classList.add('d-none');
      } else if (jobCctCode) {
        cctBadge.className = 'badge bg-indigo-lt text-indigo';
        cctBadge.textContent = `Filtrado por CCT ${jobCctCode}`;
        cctBadge.title = jobCctName || `Convenio ${jobCctCode}`;
      } else if (job) {
        cctBadge.className = 'badge bg-secondary-lt text-muted';
        cctBadge.textContent = 'Puesto sin CCT (todas las nóminas)';
        cctBadge.title = '';
      } else {
        cctBadge.className = 'badge bg-secondary-lt text-muted';
        cctBadge.textContent = 'Sin puesto seleccionado';
        cctBadge.title = '';
      }
    }
    if (selectHint) {
      if (isDirectorMod) {
        selectHint.textContent = 'Nómina exclusiva para Directores / Autoridades con cobertura ART (exentos de aportes y contribuciones SUSS).';
      } else if (isInternMod) {
        selectHint.textContent = 'Nómina exclusiva de asignación estímulo para pasantes educativos (Ley 26.427).';
      } else if (legacyOutOfCctScale) {
        selectHint.innerHTML = `<span class="text-warning fw-bold"><i class="ti ti-alert-triangle me-1"></i>La nómina actual (${escapeHtml(legacyOutOfCctScale.name)}) no pertenece al convenio ${escapeHtml(jobCctCode || 'del puesto')}. Podés actualizarla aquí.</span>`;
      } else if (filterMode === 'CCT_EXACT') {
        selectHint.textContent = `Mostrando ${filteredScales.length} nómina(s) correspondientes al convenio ${jobCctCode}${jobCctName ? ` (${jobCctName})` : ''}.`;
      } else if (filterMode === 'CCT_FALLBACK_GENERAL') {
        selectHint.innerHTML = `<span class="text-muted">No hay nóminas específicas cargadas para CCT <strong>${escapeHtml(jobCctCode)}</strong>; se muestran nóminas generales sin convenio asignado.</span>`;
      } else if (filterMode === 'CCT_EMPTY') {
        selectHint.innerHTML = `<span class="text-danger">No existen nóminas cargadas para CCT <strong>${escapeHtml(jobCctCode)}</strong>. Podés crearlas en Haberes → Nómina.</span>`;
      } else if (filterMode === 'JOB_NO_CCT') {
        selectHint.textContent = 'El puesto asignado no tiene CCT configurado; se muestran todas las nóminas disponibles.';
      } else {
        selectHint.textContent = 'Seleccioná un Puesto de Trabajo en "2. Laboral y Cobertura" para filtrar automáticamente por convenio laboral.';
      }
    }
    if (amountLabel) {
      amountLabel.textContent = isDirectorMod
        ? 'Honorarios / Haber Mensual'
        : (isInternMod ? 'Asignación Estímulo Mensual' : 'Importe Básico Mensual');
    }

    const placeholderText = isDirectorMod
      ? '-- Seleccionar Nómina de Director --'
      : (isInternMod
          ? '-- Seleccionar Nómina de Pasante --'
          : (jobCctCode ? `-- Seleccionar Nómina (CCT ${jobCctCode}) --` : '-- Seleccionar Nómina --'));

    const formatOptionLabel = (s, includeCctPrefix = false) => {
      const prefix = includeCctPrefix ? (s.cctCode ? `[${s.cctCode}] ` : '[General] ') : '';
      return `${prefix}${s.name} ($ ${formatNumber(s.amount)})`;
    };

    const showPrefix = !isInternMod && !isDirectorMod && !jobCctCode;
    let optsHtml = `<option value="">${escapeHtml(placeholderText)}</option>`;

    if (filterMode === 'CCT_FALLBACK_GENERAL') {
      optsHtml += `<optgroup label="Sin convenio asignado (Generales)">`;
      optsHtml += filteredScales
        .map((s) => `<option value="${s.id}" data-amount="${s.amount}" ${s.id === targetSelection ? 'selected' : ''}>${escapeHtml(formatOptionLabel(s, false))}</option>`)
        .join('');
      optsHtml += '</optgroup>';
    } else {
      optsHtml += filteredScales
        .map((s) => `<option value="${s.id}" data-amount="${s.amount}" ${s.id === targetSelection ? 'selected' : ''}>${escapeHtml(formatOptionLabel(s, showPrefix))}</option>`)
        .join('');
    }

    if (legacyOutOfCctScale) {
      optsHtml += `<optgroup label="Nómina actual asignada (fuera del CCT del puesto)">`;
      optsHtml += `<option value="${legacyOutOfCctScale.id}" data-amount="${legacyOutOfCctScale.amount}" selected>${escapeHtml(formatOptionLabel(legacyOutOfCctScale, true))}</option>`;
      optsHtml += '</optgroup>';
    }

    scaleSelect.innerHTML = optsHtml;
    scaleSelect.value = targetSelection;

    const found =
      filteredScales.find((s) => s.id === targetSelection) ||
      (legacyOutOfCctScale && legacyOutOfCctScale.id === targetSelection ? legacyOutOfCctScale : null);
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

      const actWorkerEl = document.getElementById('emp-preview-activity');
      const actWorkerDescEl = document.getElementById('emp-preview-activity-desc');
      const actWorkerBadge = document.getElementById('emp-preview-activity-badge');
      if (actWorkerEl) actWorkerEl.textContent = 'Sin puesto seleccionado';
      if (actWorkerDescEl) actWorkerDescEl.textContent = 'Seleccioná un Puesto en "2. Laboral y Cobertura"';
      if (actWorkerBadge) actWorkerBadge.textContent = 'T03';
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

    // Actividad Previsional del Trabajador (ARCA T03)
    const actWorkerEl = document.getElementById('emp-preview-activity');
    const actWorkerDescEl = document.getElementById('emp-preview-activity-desc');
    const actWorkerBadge = document.getElementById('emp-preview-activity-badge');
    if (actWorkerEl) {
      const actInfo = getArcaActivityInfo(job.activityCode || '049');
      actWorkerEl.textContent = `${actInfo.code} - ${actInfo.name}`;
      if (actWorkerDescEl) actWorkerDescEl.textContent = actInfo.description || 'Régimen previsional para SICOSS / Libro de Sueldos Digital';
      if (actWorkerBadge) actWorkerBadge.textContent = `T03 ${actInfo.code}`;
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

  async openNewEmployeeModal() {
    await Promise.all([
      this.ensureArcaReferenceCatalogsLoaded(),
      this.ensureEmployeeModalAuxiliaryLoaded(),
    ]);

    document.getElementById('form-employee').reset();
    document.getElementById('employee-form-id').value = '';
    document.getElementById('modal-employee-form-title').textContent = 'Ficha de Personal / Legajo';
    document.getElementById('employee-form-alert')?.classList.add('d-none');
    document.getElementById('employee-termination-fields-row')?.classList.add('d-none');
    const termDateNew = document.getElementById('employee-input-termination-date');
    if (termDateNew) termDateNew.value = '';
    const termReasonNew = document.getElementById('employee-input-termination-reason');
    if (termReasonNew) termReasonNew.value = '';
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

    this.populateEmployeeSelects('', '', '', '', '', '8', '', '', '');
    this.handleEmployeeWorkShiftChange('');
    this.updateEmployeeEncuadrePreview('');
    this.updateEmployeeMapPreview();
    this.resetEmployeeDisciplinaryHistoryTab?.();

    const firstTab = document.getElementById('tab-btn-emp-personal');
    if (firstTab && window.bootstrap?.Tab) {
      new window.bootstrap.Tab(firstTab).show();
    }
    getBootstrapModal(document.getElementById('modal-employee-form'))?.show();
  }

  async openEditEmployeeModal(emp) {
    let fullEmp = emp;
    const [detailRes] = await Promise.all([
      apiRequest(`/employees/${emp.id}`).catch((err) => {
        console.warn('No se pudo obtener el detalle completo del empleado:', err);
        return null;
      }),
      this.ensureArcaReferenceCatalogsLoaded(),
      this.ensureEmployeeModalAuxiliaryLoaded(),
    ]);
    if (detailRes?.data) fullEmp = detailRes.data;

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
    const termRow = document.getElementById('employee-termination-fields-row');
    if (termRow) termRow.classList.toggle('d-none', (fullEmp.status || 'ACTIVE') !== 'INACTIVE');
    const termDateEl = document.getElementById('employee-input-termination-date');
    if (termDateEl) termDateEl.value = fullEmp.terminationDate ? String(fullEmp.terminationDate).slice(0, 10) : '';
    const termReasonEl = document.getElementById('employee-input-termination-reason');
    if (termReasonEl) termReasonEl.value = fullEmp.terminationReason || '';

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

    const empShiftId = fullEmp.workShiftId || fullEmp.workShift?.id || '';
    const empPaymentMethodId = fullEmp.paymentMethodId || fullEmp.paymentMethod?.id || '';
    this.populateEmployeeSelects(
      fullEmp.departmentId,
      fullEmp.jobPositionId,
      fullEmp.healthInsuranceId,
      fullEmp.unionId,
      fullEmp.mutualId,
      fullEmp.contractModalityCode || '8',
      fullEmp.salaryScaleId || fullEmp.salaryScale?.id || '',
      empShiftId,
      empPaymentMethodId
    );
    this.handleEmployeeWorkShiftChange(empShiftId);
    this.updateEmployeeEncuadrePreview(fullEmp.jobPositionId);
    this.updateEmployeeMapPreview();
    this.loadEmployeeDisciplinaryHistoryTab?.(fullEmp.id);

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
}

export function registerPersonnelEmployeesMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(MixinMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
