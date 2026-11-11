import { apiRequest, storage, showToast } from '../../api.js?v=2.0';
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
            <td colspan="5" class="text-center py-5 text-muted">
              <i class="ti ti-search-off fs-1 d-block mb-2 text-teal"></i>
              No se encontraron sindicatos que coincidan con "<strong>${escapeHtml(searchTerm)}</strong>".
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center py-5 text-muted">
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

        const unionConceptsList = (u.concepts && u.concepts.length > 0)
          ? u.concepts
          : (u.concept ? [u.concept] : []);

        const conceptBadge = unionConceptsList.length > 0
          ? (unionConceptsList.length <= 2
              ? unionConceptsList.map((c) => `
                  <span class="badge bg-indigo-lt text-indigo px-2 py-1 mb-1 me-1 text-wrap" title="${escapeHtml(c.name)}">
                    <i class="ti ti-receipt-2 me-1"></i><strong>${escapeHtml(c.code)}</strong> [${escapeHtml(c.periodType || 'MENSUAL')}]
                  </span>
                `).join('')
              : `
                  <span class="badge bg-indigo-lt text-indigo px-2 py-1 mb-1 me-1" title="${escapeHtml(unionConceptsList[0].name)}">
                    <i class="ti ti-receipt-2 me-1"></i><strong>${escapeHtml(unionConceptsList[0].code)}</strong> [${escapeHtml(unionConceptsList[0].periodType || 'MENSUAL')}]
                  </span>
                  <span class="badge bg-secondary-lt text-dark px-2 py-1 mb-1" title="${unionConceptsList.slice(1).map((c) => `${c.code}: ${c.name}`).join(' | ')}">
                    +${unionConceptsList.length - 1} más
                  </span>
                `)
          : `<span class="badge bg-secondary-lt text-muted px-2 py-1">Sin asignar</span>`;

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
            <td>${conceptBadge}</td>
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
            <td colspan="5" class="text-center py-5 text-muted">
              <i class="ti ti-search-off fs-1 d-block mb-2 text-teal"></i>
              No se encontraron mutuales que coincidan con "<strong>${escapeHtml(searchTerm)}</strong>".
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center py-5 text-muted">
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

        const mutualConceptsList = (m.concepts && m.concepts.length > 0)
          ? m.concepts
          : (m.concept ? [m.concept] : []);

        const conceptBadge = mutualConceptsList.length > 0
          ? (mutualConceptsList.length <= 2
              ? mutualConceptsList.map((c) => `
                  <span class="badge bg-indigo-lt text-indigo px-2 py-1 mb-1 me-1 text-wrap" title="${escapeHtml(c.name)}">
                    <i class="ti ti-receipt-2 me-1"></i><strong>${escapeHtml(c.code)}</strong> [${escapeHtml(c.periodType || 'MENSUAL')}]
                  </span>
                `).join('')
              : `
                  <span class="badge bg-indigo-lt text-indigo px-2 py-1 mb-1 me-1" title="${escapeHtml(mutualConceptsList[0].name)}">
                    <i class="ti ti-receipt-2 me-1"></i><strong>${escapeHtml(mutualConceptsList[0].code)}</strong> [${escapeHtml(mutualConceptsList[0].periodType || 'MENSUAL')}]
                  </span>
                  <span class="badge bg-secondary-lt text-dark px-2 py-1 mb-1" title="${mutualConceptsList.slice(1).map((c) => `${c.code}: ${c.name}`).join(' | ')}">
                    +${mutualConceptsList.length - 1} más
                  </span>
                `)
          : `<span class="badge bg-secondary-lt text-muted px-2 py-1">Sin asignar</span>`;

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
            <td>${conceptBadge}</td>
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
      const conceptsList = (this.allPayrollConcepts && this.allPayrollConcepts.length > 0)
        ? this.allPayrollConcepts
        : (this.payrollConcepts || []);
      select.innerHTML = '<option value="">Seleccione un concepto...</option>' +
        conceptsList.map((c) => `<option value="${c.id}">${escapeHtml(c.code)} - ${escapeHtml(c.name)} (${escapeHtml(c.type)})</option>`).join('');
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

  populateAffiliationConceptSelectors() {
    const unionSelect = document.getElementById('union-input-concept');
    const mutualSelect = document.getElementById('mutual-input-concept');
    const concepts = this.deductionConcepts || [];

    const buildOptions = () => {
      let html = '';
      concepts.forEach((c) => {
        const periodLabel = c.periodType ? ` [${escapeHtml(c.periodType)}]` : ' [MENSUAL]';
        const arcaInfo = c.arcaConceptCode ? ` (ARCA: ${escapeHtml(c.arcaConceptCode)})` : '';
        html += `<option value="${c.id}">${escapeHtml(c.code)} - ${escapeHtml(c.name)}${periodLabel}${arcaInfo}</option>`;
      });
      return html;
    };

    const optionsHtml = buildOptions();
    const tsConfig = {
      plugins: ['remove_button'],
      multiple: true,
      placeholder: 'Seleccionar conceptos de descuento...',
      maxOptions: 1000,
      sortField: false,
    };

    if (unionSelect) {
      if (unionSelect.tomselect) {
        unionSelect.tomselect.destroy();
      }
      unionSelect.innerHTML = optionsHtml;
      initSearchableSelect(unionSelect, tsConfig);
    }
    if (mutualSelect) {
      if (mutualSelect.tomselect) {
        mutualSelect.tomselect.destroy();
      }
      mutualSelect.innerHTML = optionsHtml;
      initSearchableSelect(mutualSelect, tsConfig);
    }
  }

  // --- Sindicatos ---
  async openNewUnionModal() {
    await this.ensureAffiliationConceptsLoaded();
    document.getElementById('form-union').reset();
    document.getElementById('union-form-id').value = '';
    this.populateAffiliationConceptSelectors();
    const conceptSel = document.getElementById('union-input-concept');
    if (conceptSel?.tomselect) {
      conceptSel.tomselect.clear();
    } else if (conceptSel) {
      conceptSel.value = '';
    }
    const applyWrap = document.getElementById('union-apply-employees-wrap');
    if (applyWrap) applyWrap.classList.add('d-none');
    const applyCheck = document.getElementById('union-input-apply-employees');
    if (applyCheck) applyCheck.checked = false;
    document.getElementById('modal-union-form-title').textContent = 'Nuevo Sindicato';
    document.getElementById('union-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-union');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Sindicato';
    getBootstrapModal(document.getElementById('modal-union-form'))?.show();
  }

  async openEditUnionModal(union) {
    await this.ensureAffiliationConceptsLoaded();
    document.getElementById('union-form-id').value = union.id;
    document.getElementById('union-input-name').value = union.name;
    document.getElementById('union-input-code').value = union.code || '';
    this.populateAffiliationConceptSelectors();
    const conceptSel = document.getElementById('union-input-concept');
    const conceptIds = union.conceptIds && union.conceptIds.length > 0
      ? union.conceptIds
      : (union.conceptId ? [union.conceptId] : []);
    if (conceptSel?.tomselect) {
      conceptSel.tomselect.setValue(conceptIds);
    } else if (conceptSel) {
      Array.from(conceptSel.options).forEach((opt) => {
        opt.selected = conceptIds.includes(opt.value);
      });
    }
    const applyWrap = document.getElementById('union-apply-employees-wrap');
    if (applyWrap) applyWrap.classList.remove('d-none');
    const applyCheck = document.getElementById('union-input-apply-employees');
    if (applyCheck) applyCheck.checked = false;
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
  async openNewMutualModal() {
    await this.ensureAffiliationConceptsLoaded();
    document.getElementById('form-mutual').reset();
    document.getElementById('mutual-form-id').value = '';
    this.populateAffiliationConceptSelectors();
    const conceptSel = document.getElementById('mutual-input-concept');
    if (conceptSel?.tomselect) {
      conceptSel.tomselect.clear();
    } else if (conceptSel) {
      conceptSel.value = '';
    }
    const applyWrap = document.getElementById('mutual-apply-employees-wrap');
    if (applyWrap) applyWrap.classList.add('d-none');
    const applyCheck = document.getElementById('mutual-input-apply-employees');
    if (applyCheck) applyCheck.checked = false;
    document.getElementById('modal-mutual-form-title').textContent = 'Nueva Mutual';
    document.getElementById('mutual-form-alert')?.classList.add('d-none');
    const submitBtn = document.getElementById('btn-save-mutual');
    if (submitBtn) submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Mutual';
    getBootstrapModal(document.getElementById('modal-mutual-form'))?.show();
  }

  async openEditMutualModal(mutual) {
    await this.ensureAffiliationConceptsLoaded();
    document.getElementById('mutual-form-id').value = mutual.id;
    document.getElementById('mutual-input-name').value = mutual.name;
    document.getElementById('mutual-input-code').value = mutual.code || '';
    this.populateAffiliationConceptSelectors();
    const conceptSel = document.getElementById('mutual-input-concept');
    const conceptIds = mutual.conceptIds && mutual.conceptIds.length > 0
      ? mutual.conceptIds
      : (mutual.conceptId ? [mutual.conceptId] : []);
    if (conceptSel?.tomselect) {
      conceptSel.tomselect.setValue(conceptIds);
    } else if (conceptSel) {
      Array.from(conceptSel.options).forEach((opt) => {
        opt.selected = conceptIds.includes(opt.value);
      });
    }
    const applyWrap = document.getElementById('mutual-apply-employees-wrap');
    if (applyWrap) applyWrap.classList.remove('d-none');
    const applyCheck = document.getElementById('mutual-input-apply-employees');
    if (applyCheck) applyCheck.checked = false;
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

  // --- Familiares de Empleado y Cobertura Ley 23.660 ---
  isPrimaryFamilyKinship(kinship) {
    if (!kinship) return false;
    const code = String(kinship.code || '').toUpperCase().trim();
    const primaryCodes = ['CONYUGE', 'CONVIVIENTE', 'HIJO_MENOR_21', 'HIJO_ESTUDIANTE', 'HIJO_INCAPACITADO', 'TUTELA'];
    if (primaryCodes.includes(code) || code.startsWith('HIJO')) return true;
    const name = String(kinship.name || '').toLowerCase();
    if (name.includes('cónyuge') || name.includes('conyuge') || name.includes('conviviente') || name.includes('hijo') || name.includes('tutela') || name.includes('guarda')) {
      return true;
    }
    return false;
  }

  updateAdherentSwitchState() {
    const kinSelect = document.getElementById('relative-input-kinship');
    const adherentSwitch = document.getElementById('relative-input-is-adherent');
    const adherentHint = document.getElementById('relative-adherent-hint');
    if (!kinSelect || !adherentSwitch) return;

    if (!kinSelect.value) {
      adherentSwitch.checked = false;
      adherentSwitch.disabled = true;
      if (adherentHint) {
        adherentHint.textContent = 'Selecciona primero el parentesco para validar si aplica como adherente.';
      }
      return;
    }

    const selectedKin = this.kinships.find((k) => k.id === kinSelect.value);
    const isPrimary = this.isPrimaryFamilyKinship(selectedKin);

    if (isPrimary) {
      adherentSwitch.checked = false;
      adherentSwitch.disabled = true;
      if (adherentHint) {
        adherentHint.innerHTML = '<span class="text-primary fw-medium"><i class="ti ti-info-circle me-1"></i>Grupo familiar primario: Cobertura automática s/Ley 23.660 (no cotiza como adherente).</span>';
      }
    } else {
      adherentSwitch.disabled = false;
      if (adherentHint) {
        adherentHint.textContent = 'Aplica a familiares a cargo fuera del grupo primario (ej. padres, hermanos s/Art. 9 inc. b Ley 23.660).';
      }
    }
  }

  updateTaxTypeSuggestion() {
    const kinSelect = document.getElementById('relative-input-kinship');
    const taxTypeSelect = document.getElementById('relative-input-tax-type');
    if (!kinSelect || !taxTypeSelect || !kinSelect.value) return;

    const selectedKin = this.kinships.find((k) => k.id === kinSelect.value);
    if (!selectedKin) return;

    const code = String(selectedKin.code || '').toUpperCase();
    const name = String(selectedKin.name || '').toLowerCase();

    if (code === 'CONYUGE' || code === 'CONVIVIENTE' || name.includes('cónyuge') || name.includes('conyuge') || name.includes('conviviente')) {
      taxTypeSelect.value = 'SPOUSE';
    } else if (code.startsWith('HIJO') || name.includes('hijo') || name.includes('hija') || name.includes('hijastro')) {
      const isDisability = Boolean(document.getElementById('relative-input-is-disability')?.checked);
      taxTypeSelect.value = isDisability ? 'DISABLED_CHILD' : 'CHILD';
    }
  }

  openNewRelativeModal() {
    document.getElementById('form-employee-relative').reset();
    document.getElementById('employee-relative-form-index').value = '';
    document.getElementById('employee-relative-form-id').value = '';
    document.getElementById('modal-employee-relative-form-title').textContent = 'Agregar Familiar';
    document.getElementById('relative-form-alert')?.classList.add('d-none');
    document.getElementById('relative-input-doc-type').value = 'DNI';
    const adherentSwitch = document.getElementById('relative-input-is-adherent');
    if (adherentSwitch) {
      adherentSwitch.checked = false;
      adherentSwitch.disabled = true;
    }
    const taxSwitch = document.getElementById('relative-input-applies-income-tax');
    if (taxSwitch) taxSwitch.checked = false;
    const taxFields = document.getElementById('relative-income-tax-fields');
    if (taxFields) taxFields.classList.add('d-none');
    const taxType = document.getElementById('relative-input-tax-type');
    if (taxType) taxType.value = 'CHILD';
    const taxPct = document.getElementById('relative-input-deduction-pct');
    if (taxPct) taxPct.value = '100';
    const disSwitch = document.getElementById('relative-input-is-disability');
    if (disSwitch) disSwitch.checked = false;
    const noIncSwitch = document.getElementById('relative-input-has-no-income');
    if (noIncSwitch) noIncSwitch.checked = true;
    const fromMonth = document.getElementById('relative-input-tax-from-month');
    if (fromMonth) fromMonth.value = '1';
    const toMonth = document.getElementById('relative-input-tax-to-month');
    if (toMonth) toMonth.value = '12';

    this.updateAdherentSwitchState();
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

    const adherentSwitch = document.getElementById('relative-input-is-adherent');
    if (adherentSwitch) {
      adherentSwitch.checked = Boolean(rel.isAdherent);
    }
    this.updateAdherentSwitchState();
    if (!this.isPrimaryFamilyKinship(this.kinships.find((k) => k.id === (rel.kinshipId || rel.kinship?.id)))) {
      if (adherentSwitch) adherentSwitch.checked = Boolean(rel.isAdherent);
    }

    const appliesTax = Boolean(rel.appliesIncomeTax);
    const taxSwitch = document.getElementById('relative-input-applies-income-tax');
    if (taxSwitch) taxSwitch.checked = appliesTax;
    const taxFields = document.getElementById('relative-income-tax-fields');
    if (taxFields) {
      if (appliesTax) taxFields.classList.remove('d-none');
      else taxFields.classList.add('d-none');
    }
    const taxType = document.getElementById('relative-input-tax-type');
    if (taxType) taxType.value = rel.incomeTaxDeductionType || 'CHILD';
    const taxPct = document.getElementById('relative-input-deduction-pct');
    if (taxPct) taxPct.value = String(rel.deductionPercentage ? Number(rel.deductionPercentage) : 100);
    const disSwitch = document.getElementById('relative-input-is-disability');
    if (disSwitch) disSwitch.checked = Boolean(rel.isDisability);
    const noIncSwitch = document.getElementById('relative-input-has-no-income');
    if (noIncSwitch) noIncSwitch.checked = rel.hasNoIncomeOrBelowMni !== undefined ? Boolean(rel.hasNoIncomeOrBelowMni) : true;
    const fromMonth = document.getElementById('relative-input-tax-from-month');
    if (fromMonth) fromMonth.value = String(rel.validFromMonth || 1);
    const toMonth = document.getElementById('relative-input-tax-to-month');
    if (toMonth) toMonth.value = String(rel.validToMonth || 12);

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
}

export function registerPersonnelAffiliationsMassMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(MixinMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
