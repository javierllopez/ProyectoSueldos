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
import {
  parseClipboardGrid,
  parseClipboardCellValue,
  formatCellValueForInput,
  isOvertimeHoursConcept,
  isSensitiveDeductionOrAdvance,
  isConceptCompatibleWithPeriodType,
} from '../../utils/clipboardMatrixParser.js?v=payroll-5.3';

class MixinMethods {
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

  async fetchAllEmployeesForValidation() {
    const empRes = await apiRequest('/employees?status=ALL&limit=5000');
    const emps = empRes.data || [];
    if (empRes.meta && empRes.meta.totalPages > 1) {
      for (let p = 2; p <= empRes.meta.totalPages; p++) {
        const nextRes = await apiRequest(`/employees?status=ALL&limit=5000&page=${p}`);
        if (nextRes.data) emps.push(...nextRes.data);
      }
    }
    return emps;
  }

  async fetchAllConceptsCatalog() {
    const res = await apiRequest('/payroll/concepts?limit=1000');
    const list = res.data || [];
    if (res.meta && res.meta.totalPages > 1) {
      for (let p = 2; p <= res.meta.totalPages; p++) {
        const nextRes = await apiRequest(`/payroll/concepts?limit=1000&page=${p}`);
        if (nextRes.data) list.push(...nextRes.data);
      }
    }
    return list;
  }

  async fetchIndividualConcepts(isPersistent = null, targetPeriodType = null) {
    let url = '/payroll/concepts?scope=INDIVIDUAL&limit=500&excludeCalculated=true';
    if (isPersistent !== null && isPersistent !== undefined) {
      url += `&isPersistent=${isPersistent}`;
    }
    const res = await apiRequest(url);
    let list = res.data || [];
    list = list.filter((c) => (c.noveltyDataType || '').toUpperCase() !== 'CALCULADO');

    if (targetPeriodType) {
      list = list.filter((c) => isConceptCompatibleWithPeriodType(c, targetPeriodType));
    }

    return list;
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
          : (item.isEmbargo || item.concept?.isEmbargo)
          ? `
            <button type="button" class="btn btn-sm btn-icon btn-ghost-primary btn-edit-nov-pers-emp" data-id="${item.id}" title="Modificar asignación">
              <i class="ti ti-edit"></i>
            </button>
            <span class="badge bg-purple-lt text-nowrap d-inline-flex align-items-center" title="Embargo judicial: Solo puede eliminarse desde la pantalla de Embargos de Sueldo" style="font-size: 0.72rem; cursor: help;">
              <i class="ti ti-gavel me-1"></i> Embargo
            </span>
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
    const excelBtn = document.getElementById('btn-nov-pers-con-excel');
    if (excelBtn) excelBtn.disabled = true;
    const cctBtn = document.getElementById('btn-nov-pers-con-cct');
    if (cctBtn) cctBtn.disabled = true;
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
    const excelBtn = document.getElementById('btn-nov-pers-con-excel');
    if (excelBtn) excelBtn.disabled = false;
    const cctBtn = document.getElementById('btn-nov-pers-con-cct');
    if (cctBtn) cctBtn.disabled = false;

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
              ${(asg.isEmbargo || c.isEmbargo)
                ? `
                  <button type="button" class="btn btn-sm btn-icon btn-ghost-primary btn-edit-nov-pers-con" data-id="${asg.id}" title="Modificar asignación">
                    <i class="ti ti-edit"></i>
                  </button>
                  <span class="badge bg-purple-lt text-nowrap d-inline-flex align-items-center" title="Embargo judicial: Solo puede eliminarse desde la pantalla de Embargos de Sueldo" style="font-size: 0.72rem; cursor: help;">
                    <i class="ti ti-gavel me-1"></i> Embargo
                  </span>
                `
                : `
                  <button type="button" class="btn btn-sm btn-icon btn-ghost-primary btn-edit-nov-pers-con" data-id="${asg.id}" title="Modificar asignación">
                    <i class="ti ti-edit"></i>
                  </button>
                  <button type="button" class="btn btn-sm btn-icon btn-ghost-danger btn-del-nov-pers-con" data-id="${asg.id}" data-name="${escapeHtml(emp.lastName || '')}, ${escapeHtml(emp.firstName || '')}" title="Eliminar asignación">
                    <i class="ti ti-trash"></i>
                  </button>
                `}
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
  // IMPORTACIÓN DE NOVEDADES PERSISTENTES DESDE EXCEL
  // -------------------------------------------------------------------------

  openPersConceptExcelModal() {
    if (!this.novPersConSelectedConcept) return;
    const c = this.novPersConSelectedConcept;

    document.getElementById('pers-excel-concept-title').textContent = `[${c.code}] ${c.name}`;
    document.getElementById('pers-excel-datatype-badge').textContent = c.noveltyDataType || 'UNITS';

    // Limpiar alertas, previsualización e informes previos
    document.getElementById('pers-excel-alert')?.classList.add('d-none');
    document.getElementById('pers-excel-preview-card')?.classList.add('d-none');
    document.getElementById('pers-excel-result-card')?.classList.add('d-none');
    document.getElementById('pers-excel-omitted-container')?.classList.add('d-none');

    const fileInput = document.getElementById('pers-concept-excel-file');
    if (fileInput) fileInput.value = '';

    const submitBtn = document.getElementById('btn-pers-excel-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="ti ti-upload me-1"></i> Procesar e Importar Novedades';
    }

    this.persConceptExcelParsedRows = [];

    getBootstrapModal(document.getElementById('modal-import-pers-concept-excel'))?.show();
  }

  downloadPersConceptExcelTemplate() {
    if (!window.XLSX) {
      showToast('La librería SheetJS (XLSX) no está disponible en este momento', 'warning');
      return;
    }
    const c = this.novPersConSelectedConcept || { code: 'CONCEPTO', name: 'Novedad' };
    const sampleVal = c.noveltyDataType === 'IMPORTE' ? 50000 : (c.noveltyDataType === 'PORCENTAJE' ? 10 : 1);

    const rows = [
      ['Legajo', 'Valor', 'Vigente Desde', 'Vigente Hasta'],
      ['L-1001', sampleVal, '2026-01-01', ''],
      ['L-1002', sampleVal, '', ''],
      ['L-1003', sampleVal, '2026-06-01', '2026-12-31'],
    ];

    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(rows);

    ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 18 }];

    window.XLSX.utils.book_append_sheet(wb, ws, 'Novedades');
    const filename = `Plantilla_Novedad_${c.code}.xlsx`;
    window.XLSX.writeFile(wb, filename);
  }

  async handlePersConceptExcelFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const alertBox = document.getElementById('pers-excel-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const previewCard = document.getElementById('pers-excel-preview-card');
    const previewTbody = document.getElementById('pers-excel-preview-tbody');
    const previewCount = document.getElementById('pers-excel-preview-count');
    const submitBtn = document.getElementById('btn-pers-excel-submit');

    try {
      if (!window.XLSX) throw new Error('La librería SheetJS no está cargada');
      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

      if (!rawRows || rawRows.length < 2) {
        throw new Error('El archivo debe contener al menos una fila de encabezados y una fila con datos.');
      }

      // Procesar filas (si fila 0 es encabezado con texto no numérico)
      const startIndex = typeof rawRows[0][0] === 'string' && isNaN(Number(rawRows[0][0])) ? 1 : 0;
      const parsedRows = [];

      for (let i = startIndex; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length === 0) continue;

        const legajo = String(row[0] || '').trim();
        if (!legajo) continue;

        const val = Number(row[1]) || 0;

        let vFrom = '';
        let vTo = '';
        if (row[2]) vFrom = this.formatExcelDate(row[2]);
        if (row[3]) vTo = this.formatExcelDate(row[3]);

        parsedRows.push({
          fileNumber: legajo,
          value: val,
          validFrom: vFrom || null,
          validTo: vTo || null,
        });
      }

      if (parsedRows.length === 0) {
        throw new Error('No se encontraron filas con número de legajo válido en el archivo.');
      }

      this.persConceptExcelParsedRows = parsedRows;

      // Renderizar previsualización
      if (previewTbody) {
        previewTbody.innerHTML = parsedRows
          .slice(0, 50)
          .map((r, idx) => `
            <tr>
              <td><span class="text-muted">${idx + 1}</span></td>
              <td><strong class="font-monospace text-primary">${escapeHtml(r.fileNumber)}</strong></td>
              <td class="text-end font-monospace">${escapeHtml(String(r.value))}</td>
              <td>${r.validFrom ? escapeHtml(r.validFrom) : '<span class="text-muted small">Permanente</span>'}</td>
              <td>${r.validTo ? escapeHtml(r.validTo) : '<span class="text-muted small">Sin vencimiento</span>'}</td>
            </tr>
          `)
          .join('');
      }

      if (previewCount) {
        previewCount.textContent = `${parsedRows.length} fila(s) detectada(s)`;
      }

      previewCard?.classList.remove('d-none');
      if (submitBtn) submitBtn.disabled = false;
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = `Error al procesar el archivo: ${err.message}`;
        alertBox.classList.remove('d-none');
      }
      previewCard?.classList.add('d-none');
      if (submitBtn) submitBtn.disabled = true;
    }
  }

  formatExcelDate(cellVal) {
    if (!cellVal) return '';
    if (typeof cellVal === 'number') {
      const date = new Date(Math.round((cellVal - 25569) * 86400 * 1000));
      return date.toISOString().split('T')[0];
    }
    const str = String(cellVal).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${String(parts[1]).padStart(2, '0')}-${String(parts[0]).padStart(2, '0')}`;
    }
    return str;
  }

  async submitPersConceptExcel() {
    if (!this.novPersConSelectedConcept) return;
    if (!this.persConceptExcelParsedRows || this.persConceptExcelParsedRows.length === 0) return;

    const alertBox = document.getElementById('pers-excel-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const submitBtn = document.getElementById('btn-pers-excel-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span> Importando...';
    }

    try {
      const res = await apiRequest(`/employees/by-concept/${this.novPersConSelectedConcept.id}/batch-import-novelties`, {
        method: 'POST',
        body: {
          rows: this.persConceptExcelParsedRows,
          defaultNotes: 'Importado por Excel',
        },
      });

      const data = res.data || {};
      const resultCard = document.getElementById('pers-excel-result-card');
      const resultAlert = document.getElementById('pers-excel-result-alert');
      const omittedContainer = document.getElementById('pers-excel-omitted-container');
      const omittedTbody = document.getElementById('pers-excel-omitted-tbody');

      if (resultCard && resultAlert) {
        resultCard.classList.remove('d-none');
        resultAlert.className = 'alert alert-success py-2 mb-2';
        resultAlert.innerHTML = `
          <div class="fw-bold"><i class="ti ti-check me-1"></i> Importación Finalizada</div>
          <div class="small mt-1">
            <strong>${data.processedCount || 0}</strong> colaboradores procesados: 
            <span class="badge bg-green-lt">${data.createdCount || 0} nuevas altas</span> | 
            <span class="badge bg-blue-lt">${data.updatedCount || 0} valores actualizados</span>
          </div>
        `;

        if (Array.isArray(data.omittedRows) && data.omittedRows.length > 0) {
          resultAlert.innerHTML += `<div class="small text-danger mt-1"><strong>${data.omittedRows.length}</strong> legajos fueron omitidos por no existir o estar inactivos en nómina.</div>`;
          if (omittedContainer && omittedTbody) {
            omittedContainer.classList.remove('d-none');
            omittedTbody.innerHTML = data.omittedRows
              .map((o) => `
                <tr>
                  <td><strong class="font-monospace text-danger">${escapeHtml(o.fileNumber)}</strong></td>
                  <td>${escapeHtml(String(o.value !== undefined ? o.value : '-'))}</td>
                  <td>${escapeHtml(o.reason || 'Legajo inexistente')}</td>
                </tr>
              `)
              .join('');
          }
        } else {
          omittedContainer?.classList.add('d-none');
        }
      }

      showToast(res.message || 'Importación completada correctamente', 'success');

      // Recargar lista de colaboradores con este concepto
      await this.onNovPersConSelected(this.novPersConSelectedConcept.id);

      if (submitBtn) {
        submitBtn.innerHTML = '<i class="ti ti-check me-1"></i> Importación Finalizada';
        submitBtn.disabled = true;
      }
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al importar archivo';
        alertBox.classList.remove('d-none');
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="ti ti-upload me-1"></i> Reintentar Importación';
      }
    }
  }

  // -------------------------------------------------------------------------
  // ASIGNACIÓN POR CONVENIO COLECTIVO DE TRABAJO (CCT)
  // -------------------------------------------------------------------------

  async openPersConceptCctModal() {
    if (!this.novPersConSelectedConcept) return;
    const c = this.novPersConSelectedConcept;

    document.getElementById('pers-cct-concept-title').textContent = `[${c.code}] ${c.name}`;
    document.getElementById('pers-cct-alert')?.classList.add('d-none');

    // Cargar selector de CCT
    const select = document.getElementById('pers-cct-select');
    const countBadge = document.getElementById('pers-cct-count-badge');
    if (countBadge) countBadge.textContent = '0 colaboradores alcanzados';

    if (select) {
      select.innerHTML = '<option value="">Cargando convenios asignados...</option>';
      select.disabled = true;

      try {
        const res = await apiRequest('/employees/cct-summary');
        const summary = res.data || [];
        this.persConceptCctSummary = summary;

        let optsHtml = '<option value="">Seleccione un convenio colectivo o condición...</option>';
        summary.forEach((item) => {
          optsHtml += `<option value="${escapeHtml(item.code)}" data-count="${item.count}">${escapeHtml(item.name)} (${item.count} colab.)</option>`;
        });
        select.innerHTML = optsHtml;
        select.disabled = false;
      } catch (err) {
        select.innerHTML = '<option value="">Error al cargar convenios</option>';
        showToast(err.message || 'Error al obtener resumen de CCT', 'danger');
      }
    }

    // Renderizar control dinámico de entrada según tipo de dato
    renderDynamicNoveltyControl('pers-cct-dynamic-container', c, {});

    // Limpiar campos de vigencia y notas
    const validFrom = document.getElementById('pers-cct-valid-from');
    if (validFrom) validFrom.value = '';
    const validTo = document.getElementById('pers-cct-valid-to');
    if (validTo) validTo.value = '';
    const notes = document.getElementById('pers-cct-notes');
    if (notes) notes.value = '';

    getBootstrapModal(document.getElementById('modal-assign-pers-concept-cct'))?.show();
  }

  async submitPersConceptCct(e) {
    e.preventDefault();
    if (!this.novPersConSelectedConcept) return;

    const alertBox = document.getElementById('pers-cct-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const cctOption = document.getElementById('pers-cct-select')?.value;
    if (!cctOption) {
      if (alertBox) {
        alertBox.textContent = 'Debe seleccionar un convenio colectivo o condición';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    const valContainer = document.getElementById('pers-cct-dynamic-container');
    const inputVal = valContainer?.querySelector('input');
    const valueNum = inputVal ? Number(inputVal.value) || 0 : 0;

    const validFrom = document.getElementById('pers-cct-valid-from')?.value || null;
    const validTo = document.getElementById('pers-cct-valid-to')?.value || null;
    const notes = document.getElementById('pers-cct-notes')?.value.trim() || null;

    const submitBtn = document.getElementById('btn-pers-cct-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span> Asignando...';
    }

    try {
      const res = await apiRequest(`/employees/by-concept/${this.novPersConSelectedConcept.id}/assign-by-cct`, {
        method: 'POST',
        body: {
          cctOption,
          value: valueNum,
          amount: this.novPersConSelectedConcept.noveltyDataType === 'IMPORTE' ? valueNum : null,
          units: this.novPersConSelectedConcept.noveltyDataType !== 'IMPORTE' ? valueNum : null,
          validFrom,
          validTo,
          notes,
        },
      });

      showToast(res.message || 'Concepto asignado al convenio exitosamente', 'success');
      getBootstrapModal(document.getElementById('modal-assign-pers-concept-cct'))?.hide();

      // Recargar lista de colaboradores con este concepto
      await this.onNovPersConSelected(this.novPersConSelectedConcept.id);
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al asignar concepto por CCT';
        alertBox.classList.remove('d-none');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="ti ti-check me-1"></i> Asignar a Colaboradores';
      }
    }
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
      const emptyMsg = isClosed
        ? 'Liquidación cerrada: las novedades no persistentes fueron consolidadas en los recibos y depuradas al cierre.'
        : 'No se registraron novedades para este colaborador en el período.';
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">${emptyMsg}</td></tr>`;
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

    const periodObj = (this.payrollPeriods || []).find((p) => p.id === periodId);
    const targetPeriodType = periodObj?.periodType || 'MONTHLY';

    const conSelect = document.getElementById('nov-nopers-con-select');
    const concepts = await this.fetchIndividualConcepts(false, targetPeriodType);
    if (conSelect) {
      const currentCon = conSelect.value;
      const optsHtml = '<option value="">Seleccione un concepto...</option>' +
        concepts.map((c) => `<option value="${c.id}" ${c.id === currentCon ? 'selected' : ''}>[${escapeHtml(c.code)}] ${escapeHtml(c.name)} (${c.type})</option>`).join('');

      updateSearchableSelect(conSelect, optsHtml, currentCon);

      if (currentCon && periodId && concepts.some((c) => c.id === currentCon)) {
        await this.refreshNovNoPersConTable(periodId, currentCon);
      } else {
        this.clearNovNoPersConView();
      }
    }
  }

  clearNovNoPersConView() {
    const periodId = document.getElementById('nov-nopers-con-period-select')?.value;
    const isClosed = periodId ? this.isPeriodClosed(periodId) : true;
    const matrixBtn = document.getElementById('btn-nov-nopers-con-open-matrix');
    const matrixExcelBtn = document.getElementById('btn-nov-nopers-con-import-matrix-excel');
    if (matrixBtn) matrixBtn.disabled = !periodId;
    if (matrixExcelBtn) matrixExcelBtn.disabled = !periodId || isClosed;

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
    const matrixBtn = document.getElementById('btn-nov-nopers-con-open-matrix');
    const matrixExcelBtn = document.getElementById('btn-nov-nopers-con-import-matrix-excel');
    const addBtn = document.getElementById('btn-nov-nopers-con-add');
    const batchBtn = document.getElementById('btn-nov-nopers-con-batch-sheet');
    const importBtn = document.getElementById('btn-nov-nopers-con-import-excel');
    if (matrixBtn) matrixBtn.disabled = !periodId;
    if (matrixExcelBtn) matrixExcelBtn.disabled = isClosed;
    if (addBtn) addBtn.disabled = isClosed;
    if (batchBtn) batchBtn.disabled = isClosed;
    if (importBtn) importBtn.disabled = isClosed;

    const spinner = document.getElementById('nov-nopers-con-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      const periodObj = (this.payrollPeriods || []).find((p) => p.id === periodId);
      const targetPeriodType = periodObj?.periodType || 'MONTHLY';
      if (!this.novNoPersConSelectedConcept || this.novNoPersConSelectedConcept.id !== conceptId) {
        const concepts = await this.fetchIndividualConcepts(false, targetPeriodType);
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
      const emptyMsg = isClosed
        ? 'Liquidación cerrada: las novedades no persistentes fueron consolidadas en los recibos y depuradas al cierre.'
        : 'No se registran novedades para este concepto en el período seleccionado.';
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">${emptyMsg}</td></tr>`;
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
    const targetPeriodType = periodObj?.periodType || 'MONTHLY';
    const nonPersConcepts = await this.fetchIndividualConcepts(false, targetPeriodType);

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

    const period = this.payrollPeriods.find((p) => p.id === periodId);
    const concepts = await this.fetchIndividualConcepts(false, period?.periodType);
    const concept = concepts.find((c) => c.id === conceptId);

    this.batchSheetConcept = concept;
    this.batchSheetPeriod = period;
    this.batchSheetUndoSnapshot = null;
    this.batchSheetCarriedEmpIds = new Set();

    const undoBtn = document.getElementById('btn-batch-sheet-undo');
    if (undoBtn) undoBtn.disabled = true;
    const onlyCarriedWrap = document.getElementById('batch-sheet-only-carried-wrap');
    const onlyCarriedChk = document.getElementById('batch-sheet-only-carried');
    if (onlyCarriedWrap) onlyCarriedWrap.classList.add('d-none');
    if (onlyCarriedChk) onlyCarriedChk.checked = false;
    const ctxAlert = document.getElementById('batch-sheet-context-alert');
    if (ctxAlert) ctxAlert.classList.add('d-none');
    const filterInp = document.getElementById('batch-sheet-filter-input');
    if (filterInp) filterInp.value = '';

    // Badges en cabecera
    document.getElementById('batch-sheet-period-badge').textContent = period ? `${String(period.month).padStart(2, '0')}/${period.year} - ${period.settlementName}` : '';
    document.getElementById('batch-sheet-concept-badge').textContent = concept ? `[${concept.code}] ${concept.name}` : '';

    // Encabezado de columna dinámico
    const inputType = getConceptInputType(concept);
    const isAmt = inputType === 'AMOUNT';
    const valHeader = document.getElementById('batch-sheet-col-val-header');
    if (valHeader) {
      if (inputType === 'HOURS') valHeader.textContent = 'Horas';
      else if (inputType === 'PERCENTAGE') valHeader.textContent = '% Porc.';
      else if (inputType === 'AMOUNT') valHeader.textContent = 'Importe ($)';
      else if (inputType === 'NONE') valHeader.textContent = 'Asig. (1 / vacío)';
      else valHeader.textContent = 'Valor / Cantidad';
    }

    const employees = await this.fetchActiveEmployees();
    this.batchSheetEmployees = employees;

    // Cargar novedades existentes para pre-llenar
    const res = await apiRequest(`/payroll/periods/${periodId}/novelties?conceptId=${conceptId}`);
    const existingNovelties = res.data || [];
    const novMap = new Map();
    existingNovelties.forEach((n) => novMap.set(n.employeeId, n));
    this.batchSheetExistingEmpIds = new Set(existingNovelties.map((n) => n.employeeId));

    const tbody = document.getElementById('batch-sheet-tbody');
    if (!tbody) return;

    const valPlaceholder = inputType === 'HOURS' ? '00:00 / 0' : inputType === 'NONE' ? '1 / vacío' : '0,00';

    tbody.innerHTML = employees
      .map((emp, index) => {
        const existing = novMap.get(emp.id);
        const hadExisting = Boolean(existing);
        const initRawNum = existing ? (isAmt ? existing.amount : existing.units) : null;
        const initFormatted = initRawNum !== null && initRawNum !== undefined && initRawNum !== ''
          ? formatCellValueForInput(Number(initRawNum), inputType)
          : '';
        const initNotes = existing ? (existing.notes || '') : '';
        const hasPositiveInit = initRawNum !== '' && initRawNum !== null && initRawNum !== undefined && Number(initRawNum) > 0;
        const isFilled = hasPositiveInit || Boolean(initNotes);
        const statusBadge = isFilled
          ? '<span class="badge bg-success-lt">Cargado</span>'
          : (hadExisting ? '<span class="badge bg-warning-lt">Se quitará</span>' : '<span class="badge bg-secondary-lt">Pendiente</span>');

        return `
          <tr data-emp-id="${emp.id}" data-row-index="${index}" data-had-existing="${hadExisting ? 'true' : 'false'}" class="batch-sheet-row">
            <td><strong class="font-monospace text-primary">${escapeHtml(emp.fileNumber)}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}</div>
            </td>
            <td>${formatCuit(emp.cuil)}</td>
            <td>${escapeHtml(emp.department?.name || '-')}</td>
            <td class="text-center">
              <input type="text" inputmode="${inputType === 'NONE' ? 'text' : 'decimal'}"
                class="form-control form-control-sm text-end font-monospace batch-sheet-val"
                placeholder="${valPlaceholder}"
                value="${escapeHtml(initFormatted)}"
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
              ${statusBadge}
            </td>
          </tr>
        `;
      })
      .join('');

    this.updateBatchSheetStats();

    // Navegación con teclado por Enter/Flechas saltando filas ocultas + soporte pegado Ctrl+V desde Excel
    tbody.querySelectorAll('.batch-sheet-val').forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const visibleInputs = Array.from(tbody.querySelectorAll('.batch-sheet-val')).filter(
            (inp) => inp.closest('tr')?.style.display !== 'none'
          );
          const pos = visibleInputs.indexOf(input);
          if (pos === -1) return;
          const delta = (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) ? -1 : 1;
          const target = visibleInputs[pos + delta];
          if (target) {
            target.focus();
            target.select();
          }
        }
      });

      input.addEventListener('blur', () => {
        const parsed = parseClipboardCellValue(input.value, getConceptInputType(this.batchSheetConcept));
        if (!parsed.invalid) {
          input.value = parsed.empty ? '' : formatCellValueForInput(parsed.value, getConceptInputType(this.batchSheetConcept));
          this.updateBatchSheetRowState(input.closest('tr'));
          this.updateBatchSheetStats();
        }
      });

      input.addEventListener('paste', (e) => this.handleBatchSheetPaste(e, input));
    });

    tbody.querySelectorAll('.batch-sheet-val, .batch-sheet-notes').forEach((input) => {
      input.addEventListener('input', () => {
        this.updateBatchSheetRowState(input.closest('tr'));
        this.updateBatchSheetStats();
      });
    });

    getBootstrapModal(document.getElementById('modal-novelty-batch-sheet'))?.show();
  }

  captureBatchSheetUndoSnapshot() {
    const tbody = document.getElementById('batch-sheet-tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr[data-emp-id]')).map((row) => ({
      empId: row.dataset.empId,
      val: row.querySelector('.batch-sheet-val')?.value || '',
      notes: row.querySelector('.batch-sheet-notes')?.value || '',
    }));
    this.batchSheetUndoSnapshot = {
      rows,
      carriedEmpIds: new Set(this.batchSheetCarriedEmpIds || []),
    };
    const undoBtn = document.getElementById('btn-batch-sheet-undo');
    if (undoBtn) undoBtn.disabled = false;
  }

  undoBatchSheetAction() {
    const snap = this.batchSheetUndoSnapshot;
    const tbody = document.getElementById('batch-sheet-tbody');
    if (!snap || !tbody) return;

    this.batchSheetCarriedEmpIds = new Set(snap.carriedEmpIds || []);
    const rowByEmp = new Map(
      Array.from(tbody.querySelectorAll('tr[data-emp-id]')).map((r) => [r.dataset.empId, r])
    );

    for (const item of snap.rows) {
      const row = rowByEmp.get(item.empId);
      if (!row) continue;
      const valInp = row.querySelector('.batch-sheet-val');
      const notesInp = row.querySelector('.batch-sheet-notes');
      if (valInp) valInp.value = item.val;
      if (notesInp) notesInp.value = item.notes;
      row.classList.toggle('nov-matrix-row-carried', this.batchSheetCarriedEmpIds.has(item.empId));
      this.updateBatchSheetRowState(row);
    }

    this.batchSheetUndoSnapshot = null;
    const undoBtn = document.getElementById('btn-batch-sheet-undo');
    if (undoBtn) undoBtn.disabled = true;
    this.applyBatchSheetRowFilters();
    this.updateBatchSheetStats();
    showToast('Se revirtió la última carga masiva en Planilla Ágil');
  }

  handleBatchSheetPaste(e, startInput) {
    const rawText = e.clipboardData?.getData('text/plain');
    if (!rawText) return;
    const grid = parseClipboardGrid(rawText);
    if (grid.length === 0) return;

    e.preventDefault();
    this.captureBatchSheetUndoSnapshot();

    const tbody = document.getElementById('batch-sheet-tbody');
    if (!tbody) return;

    const visibleRows = Array.from(tbody.querySelectorAll('tr[data-emp-id]')).filter(
      (r) => r.style.display !== 'none'
    );
    const startRow = startInput.closest('tr');
    const startIdx = visibleRows.indexOf(startRow);
    if (startIdx === -1) return;

    const inputType = getConceptInputType(this.batchSheetConcept);
    let applied = 0;
    let invalidCount = 0;
    let overflowRows = 0;

    for (let i = 0; i < grid.length; i++) {
      const targetRow = visibleRows[startIdx + i];
      if (!targetRow) {
        overflowRows++;
        continue;
      }
      const pasteCells = grid[i];
      const valInp = targetRow.querySelector('.batch-sheet-val');
      const notesInp = targetRow.querySelector('.batch-sheet-notes');

      if (valInp && pasteCells.length >= 1) {
        const parsed = parseClipboardCellValue(pasteCells[0], inputType);
        valInp.value = parsed.invalid
          ? String(pasteCells[0] ?? '').trim()
          : (parsed.empty ? '' : formatCellValueForInput(parsed.value, inputType));
        valInp.classList.remove('matrix-cell-pasted-flash');
        void valInp.offsetWidth;
        valInp.classList.add('matrix-cell-pasted-flash');
        if (parsed.invalid) invalidCount++;
        else applied++;
      }

      if (notesInp && pasteCells.length >= 2) {
        notesInp.value = String(pasteCells[1] ?? '').trim().slice(0, 255);
      }

      this.updateBatchSheetRowState(targetRow);
    }

    this.updateBatchSheetStats();
    let msg = `Pegado aplicado sobre ${applied} fila(s)`;
    if (invalidCount > 0) msg += ` · ${invalidCount} inválida(s)`;
    if (overflowRows > 0) msg += ` · ${overflowRows} excedente(s) omitida(s)`;
    showToast(msg, invalidCount > 0 ? 'warning' : 'success');
  }

  applyCarryoverToSingleBatchModal(data, { mode, overwrite, includeNotes }) {
    const tbody = document.getElementById('batch-sheet-tbody');
    if (!tbody || !this.batchSheetConcept) return;

    this.captureBatchSheetUndoSnapshot();
    const inputType = getConceptInputType(this.batchSheetConcept);
    const itemByEmp = new Map();
    for (const it of data.items || []) {
      if (it.conceptId === this.batchSheetConcept.id) {
        itemByEmp.set(it.employeeId, it);
      }
    }

    let affected = 0;
    let sensitiveCloned = false;

    tbody.querySelectorAll('tr[data-emp-id]').forEach((row) => {
      const empId = row.dataset.empId;
      const item = itemByEmp.get(empId);
      if (!item) return;

      this.batchSheetCarriedEmpIds.add(empId);
      row.classList.add('nov-matrix-row-carried');

      if (mode === 'CLONE_VALUES') {
        const valInp = row.querySelector('.batch-sheet-val');
        const notesInp = row.querySelector('.batch-sheet-notes');
        const curParsed = parseClipboardCellValue(valInp?.value || '', inputType);
        const hasCurrent = !curParsed.invalid && !curParsed.empty && Number(curParsed.value) > 0;
        if (!overwrite && hasCurrent) return;

        const srcRaw = inputType === 'AMOUNT' ? item.amount : item.units;
        const srcNum = srcRaw !== null && srcRaw !== undefined ? Math.round(Number(srcRaw) * 100) / 100 : 0;
        if (valInp && srcNum > 0) {
          valInp.value = formatCellValueForInput(srcNum, inputType);
        }
        if (notesInp && includeNotes && item.notes) {
          notesInp.value = String(item.notes).trim().slice(0, 255);
        }
        if (isSensitiveDeductionOrAdvance(this.batchSheetConcept)) {
          sensitiveCloned = true;
        }
        this.updateBatchSheetRowState(row);
        affected++;
      } else {
        affected++;
      }
    });

    const onlyCarriedWrap = document.getElementById('batch-sheet-only-carried-wrap');
    const onlyCarriedChk = document.getElementById('batch-sheet-only-carried');
    if (onlyCarriedWrap) onlyCarriedWrap.classList.remove('d-none');
    if (onlyCarriedChk && mode === 'ZERO_TEMPLATE') {
      onlyCarriedChk.checked = true;
    }

    const ctxAlert = document.getElementById('batch-sheet-context-alert');
    if (ctxAlert) {
      const srcName = data.sourcePeriod
        ? `${String(data.sourcePeriod.month).padStart(2, '0')}/${data.sourcePeriod.year} - ${data.sourcePeriod.settlementName}`
        : 'Período anterior';
      let msg = `<strong>Arrastre desde ${escapeHtml(srcName)}:</strong> ${affected} legajo(s) aplicados en borrador.`;
      if (data.skippedInactiveCount > 0) {
        msg += ` (${data.skippedInactiveCount} baja/inactivo omitido)`;
      }
      if (sensitiveCloned) {
        msg += ' <strong>Control LCT (Arts. 130–133):</strong> verificá tope de adelantos/deducciones.';
        ctxAlert.className = 'alert alert-warning py-1 px-3 mb-0 rounded-0 border-bottom small flex-shrink-0';
      } else {
        ctxAlert.className = 'alert alert-info py-1 px-3 mb-0 rounded-0 border-bottom small flex-shrink-0';
      }
      ctxAlert.innerHTML = msg;
    }

    this.applyBatchSheetRowFilters();
    this.updateBatchSheetStats();
    showToast(`Arrastre aplicado en Planilla Ágil (${affected} colaboradores)`);
  }

  applyBatchSheetRowFilters() {
    const q = (document.getElementById('batch-sheet-filter-input')?.value || '').trim().toLowerCase();
    const onlyCarried = document.getElementById('batch-sheet-only-carried')?.checked === true;
    document.querySelectorAll('#batch-sheet-tbody tr[data-emp-id]').forEach((row) => {
      const text = row.textContent.toLowerCase();
      const matchSearch = !q || text.includes(q);
      const matchCarried = !onlyCarried || this.batchSheetCarriedEmpIds?.has(row.dataset.empId);
      row.style.display = matchSearch && matchCarried ? '' : 'none';
    });
  }

  getBatchSheetRowState(row) {
    const valStr = row.querySelector('.batch-sheet-val')?.value.trim() || '';
    const notesStr = row.querySelector('.batch-sheet-notes')?.value.trim() || '';
    const inputType = getConceptInputType(this.batchSheetConcept);
    const parsed = parseClipboardCellValue(valStr, inputType);
    const numVal = !parsed.invalid && !parsed.empty && parsed.value !== null ? Number(parsed.value) : 0;
    const hasPositiveVal = !parsed.invalid && !parsed.empty && numVal > 0;
    const hasNotes = notesStr !== '';
    const hadExisting =
      row.dataset.hadExisting === 'true' ||
      Boolean(this.batchSheetExistingEmpIds?.has(row.dataset.empId));
    return {
      valStr,
      notesStr,
      numVal,
      hasPositiveVal,
      hasNotes,
      hadExisting,
      invalid: parsed.invalid,
      error: parsed.error,
      isFilled: !parsed.invalid && (hasPositiveVal || hasNotes),
    };
  }

  updateBatchSheetRowState(row) {
    if (!row) return;
    const state = this.getBatchSheetRowState(row);
    const valInp = row.querySelector('.batch-sheet-val');
    const isOvertimeWarn = !state.invalid && state.numVal > 30 && isOvertimeHoursConcept(this.batchSheetConcept);

    if (valInp) {
      valInp.classList.toggle('matrix-cell-invalid', state.invalid);
      valInp.classList.toggle('matrix-cell-overtime-warn', isOvertimeWarn);
      valInp.title = state.invalid
        ? (state.error || 'Valor inválido')
        : (isOvertimeWarn ? 'Supera tope orientativo 30 hs/mes (Dec. 484/2000)' : '');
    }

    const statusCell = row.querySelector('.batch-sheet-status-cell');
    if (statusCell) {
      if (state.invalid) {
        statusCell.innerHTML = `<span class="badge bg-danger-lt" title="${escapeHtml(state.error || '')}">Inválido</span>`;
      } else if (state.isFilled) {
        statusCell.innerHTML = isOvertimeWarn
          ? '<span class="badge bg-warning-lt" title="Supera 30 hs extras (Dec. 484/2000)">Cargado &gt;30h</span>'
          : '<span class="badge bg-success-lt">Cargado</span>';
      } else if (state.hadExisting) {
        statusCell.innerHTML = '<span class="badge bg-warning-lt">Se quitará</span>';
      } else {
        statusCell.innerHTML = '<span class="badge bg-secondary-lt">Pendiente</span>';
      }
    }
  }

  updateBatchSheetStats() {
    const rows = document.querySelectorAll('#batch-sheet-tbody tr[data-emp-id]');
    let filled = 0;
    let invalidCount = 0;
    rows.forEach((row) => {
      const s = this.getBatchSheetRowState(row);
      if (s.invalid) invalidCount++;
      else if (s.isFilled) filled++;
    });
    const statsEl = document.getElementById('batch-sheet-stats');
    if (statsEl) {
      statsEl.textContent = invalidCount > 0
        ? `${filled} cargados · ${invalidCount} error(es)`
        : `${filled} con valor cargado`;
    }
  }

  async saveBatchSheet() {
    if (!this.batchSheetPeriod || !this.batchSheetConcept) return;

    const rows = document.querySelectorAll('#batch-sheet-tbody tr[data-emp-id]');
    const items = [];
    const removeEmployeeIds = [];
    const isAmt = getConceptInputType(this.batchSheetConcept) === 'AMOUNT';
    let firstInvalidInput = null;

    rows.forEach((row) => {
      const empId = row.dataset.empId;
      const { notesStr, numVal, hasPositiveVal, hasNotes, hadExisting, isFilled, invalid } = this.getBatchSheetRowState(row);

      if (invalid && !firstInvalidInput) {
        firstInvalidInput = row.querySelector('.batch-sheet-val');
        return;
      }

      if (isFilled) {
        items.push({
          employeeId: empId,
          conceptId: this.batchSheetConcept.id,
          units: isAmt ? 1 : (hasPositiveVal ? numVal : 0),
          amount: isAmt ? (hasPositiveVal ? numVal : 0) : null,
          notes: hasNotes ? notesStr : null,
        });
      } else if (hadExisting) {
        removeEmployeeIds.push(empId);
      }
    });

    if (firstInvalidInput) {
      showToast('Corregí los valores inválidos marcados en rojo antes de guardar la planilla', 'warning');
      firstInvalidInput.focus();
      firstInvalidInput.select();
      return;
    }

    if (items.length === 0 && removeEmployeeIds.length === 0) {
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
        body: JSON.stringify({
          items,
          conceptId: this.batchSheetConcept.id,
          removeEmployeeIds,
        }),
      });

      const savedCount = res?.data?.savedCount ?? res?.savedCount ?? items.length;
      const deletedCount = res?.data?.deletedCount ?? res?.deletedCount ?? 0;
      const processedCount = res?.data?.processedCount ?? res?.processedCount ?? (savedCount + deletedCount);
      let successMsg = `¡Planilla guardada exitosamente! ${processedCount} novedades registradas`;
      if (deletedCount > 0 && savedCount > 0) {
        successMsg = `¡Planilla guardada exitosamente! ${savedCount} novedades registradas y ${deletedCount} eliminadas`;
      } else if (deletedCount > 0) {
        successMsg = `¡Planilla actualizada! Se eliminaron ${deletedCount} novedades`;
      }

      showToast(successMsg);
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

    const period = this.payrollPeriods.find((p) => p.id === periodId);
    const concepts = await this.fetchIndividualConcepts(false, period?.periodType);
    const concept = concepts.find((c) => c.id === conceptId);

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
          const isAmtImport = getConceptInputType(this.excelImportConcept) === 'AMOUNT';
          validRows.push({
            employeeId: matchedEmp.id,
            conceptId: this.excelImportConcept.id,
            units: isAmtImport ? 1 : numVal,
            amount: isAmtImport ? numVal : null,
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
        body: JSON.stringify({ items: this.excelImportValidRows }),
      });

      const processedCount = res?.data?.processedCount ?? res?.processedCount ?? this.excelImportValidRows.length;
      showToast(`¡Importación completada! Se registraron ${processedCount} novedades`);
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

}

export function registerPayrollNoveltiesMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(MixinMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
