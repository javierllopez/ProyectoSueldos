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

  async fetchIndividualConcepts(isPersistent = null, targetPeriodType = null) {
    let url = '/payroll/concepts?scope=INDIVIDUAL&limit=500&excludeCalculated=true';
    if (isPersistent !== null && isPersistent !== undefined) {
      url += `&isPersistent=${isPersistent}`;
    }
    const res = await apiRequest(url);
    let list = res.data || [];
    list = list.filter((c) => (c.noveltyDataType || '').toUpperCase() !== 'CALCULADO');

    if (targetPeriodType) {
      const pType = String(targetPeriodType).toUpperCase();
      if (pType === 'MONTHLY') {
        // En liquidación MENSUAL no se permiten conceptos de vacaciones
        list = list.filter((c) => {
          const cPeriodType = String(c.periodType || '').toUpperCase();
          const cCode = String(c.code || '').toUpperCase();
          return cPeriodType !== 'VACATIONS' && !cCode.startsWith('VA');
        });
      } else if (pType === 'VACATIONS') {
        // En liquidación de VACACIONES solo se permiten conceptos de vacaciones
        list = list.filter((c) => {
          const cPeriodType = String(c.periodType || '').toUpperCase();
          const cCode = String(c.code || '').toUpperCase();
          return cPeriodType === 'VACATIONS' || cCode.startsWith('VA');
        });
      } else if (pType === 'SAC_1' || pType === 'SAC_2' || pType === 'SAC') {
        list = list.filter((c) => {
          const cPeriodType = String(c.periodType || '').toUpperCase();
          return cPeriodType === 'SAC' || cPeriodType === 'SAC_1' || cPeriodType === 'SAC_2' || cPeriodType === 'MONTHLY';
        });
      } else if (pType === 'FINAL') {
        list = list.filter((c) => {
          const cPeriodType = String(c.periodType || '').toUpperCase();
          return cPeriodType === 'FINAL' || cPeriodType === 'MONTHLY';
        });
      }
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
    const addBtn = document.getElementById('btn-nov-nopers-con-add');
    const batchBtn = document.getElementById('btn-nov-nopers-con-batch-sheet');
    const importBtn = document.getElementById('btn-nov-nopers-con-import-excel');
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

    // Badges en cabecera
    document.getElementById('batch-sheet-period-badge').textContent = period ? `${String(period.month).padStart(2, '0')}/${period.year} - ${period.settlementName}` : '';
    document.getElementById('batch-sheet-concept-badge').textContent = concept ? `[${concept.code}] ${concept.name}` : '';

    // Encabezado de columna dinámico
    const valHeader = document.getElementById('batch-sheet-col-val-header');
    if (valHeader) {
      if (concept?.noveltyDataType === 'HOURS') valHeader.textContent = 'Horas';
      else if (concept?.noveltyDataType === 'PERCENTAGE') valHeader.textContent = '% Porc.';
      else if (concept?.noveltyDataType === 'AMOUNT' || concept?.noveltyDataType === 'IMPORTE') valHeader.textContent = 'Importe ($)';
      else valHeader.textContent = 'Valor / Cantidad';
    }

    const employees = await this.fetchActiveEmployees();
    this.batchSheetEmployees = employees;

    // Cargar novedades existentes para pre-llenar
    const res = await apiRequest(`/payroll/periods/${periodId}/novelties?conceptId=${conceptId}`);
    const existingNovelties = res.data || [];
    const novMap = new Map();
    existingNovelties.forEach((n) => novMap.set(n.employeeId, n));

    const tbody = document.getElementById('batch-sheet-tbody');
    if (!tbody) return;

    tbody.innerHTML = employees
      .map((emp, index) => {
        const existing = novMap.get(emp.id);
        const isAmt = concept?.noveltyDataType === 'AMOUNT' || concept?.noveltyDataType === 'IMPORTE' || concept?.calculationType === 'FIXED_AMOUNT';
        const initVal = existing ? (isAmt ? existing.amount : existing.units) : '';
        const initNotes = existing ? (existing.notes || '') : '';
        const isFilled = initVal !== '' && initVal !== null && initVal !== undefined;

        return `
          <tr data-emp-id="${emp.id}" data-row-index="${index}" class="batch-sheet-row">
            <td><strong class="font-monospace text-primary">${escapeHtml(emp.fileNumber)}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}</div>
            </td>
            <td>${formatCuit(emp.cuil)}</td>
            <td>${escapeHtml(emp.department?.name || '-')}</td>
            <td class="text-center">
              <input type="number" step="0.01" min="0" 
                class="form-control form-control-sm text-end font-monospace batch-sheet-val" 
                placeholder="0.00" 
                value="${initVal !== '' && initVal !== null ? initVal : ''}" 
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
              ${isFilled ? '<span class="badge bg-success-lt">Cargado</span>' : '<span class="badge bg-secondary-lt">Pendiente</span>'}
            </td>
          </tr>
        `;
      })
      .join('');

    this.updateBatchSheetStats();

    // Navegación con teclado por Enter y Flechas
    tbody.querySelectorAll('.batch-sheet-val').forEach((input) => {
      input.addEventListener('keydown', (e) => {
        const idx = Number(input.dataset.index);
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
          e.preventDefault();
          const next = tbody.querySelector(`.batch-sheet-val[data-index="${idx + 1}"]`);
          if (next) {
            next.focus();
            next.select();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = tbody.querySelector(`.batch-sheet-val[data-index="${idx - 1}"]`);
          if (prev) {
            prev.focus();
            prev.select();
          }
        }
      });

      input.addEventListener('input', () => {
        const tr = input.closest('tr');
        const statusCell = tr?.querySelector('.batch-sheet-status-cell');
        const hasVal = input.value.trim() !== '';
        if (statusCell) {
          statusCell.innerHTML = hasVal ? '<span class="badge bg-success-lt">Cargado</span>' : '<span class="badge bg-secondary-lt">Pendiente</span>';
        }
        this.updateBatchSheetStats();
      });
    });

    getBootstrapModal(document.getElementById('modal-novelty-batch-sheet'))?.show();
  }

  updateBatchSheetStats() {
    const inputs = document.querySelectorAll('.batch-sheet-val');
    let filled = 0;
    inputs.forEach((inp) => {
      if (inp.value.trim() !== '' && Number(inp.value) > 0) filled++;
    });
    const statsEl = document.getElementById('batch-sheet-stats');
    if (statsEl) statsEl.textContent = `${filled} con valor cargado`;
  }

  async saveBatchSheet() {
    if (!this.batchSheetPeriod || !this.batchSheetConcept) return;

    const rows = document.querySelectorAll('#batch-sheet-tbody tr[data-emp-id]');
    const novelties = [];
    const isAmt = this.batchSheetConcept.noveltyDataType === 'AMOUNT' || this.batchSheetConcept.noveltyDataType === 'IMPORTE' || this.batchSheetConcept.calculationType === 'FIXED_AMOUNT';

    rows.forEach((row) => {
      const empId = row.dataset.empId;
      const valInput = row.querySelector('.batch-sheet-val');
      const notesInput = row.querySelector('.batch-sheet-notes');

      const valStr = valInput?.value.trim();
      const notesStr = notesInput?.value.trim();

      if (valStr !== '' || notesStr !== '') {
        const numVal = Number(valStr) || 0;
        novelties.push({
          employeeId: empId,
          conceptId: this.batchSheetConcept.id,
          units: isAmt ? 1 : numVal,
          amount: isAmt ? numVal : null,
          notes: notesStr || null,
        });
      }
    });

    if (novelties.length === 0) {
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
        body: JSON.stringify({ novelties }),
      });

      showToast(`¡Planilla guardada exitosamente! ${res.processedCount} novedades registradas`);
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
          validRows.push({
            employeeId: matchedEmp.id,
            conceptId: this.excelImportConcept.id,
            units: (this.excelImportConcept.noveltyDataType === 'AMOUNT' || this.excelImportConcept.noveltyDataType === 'IMPORTE') ? 1 : numVal,
            amount: (this.excelImportConcept.noveltyDataType === 'AMOUNT' || this.excelImportConcept.noveltyDataType === 'IMPORTE') ? numVal : null,
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
        body: JSON.stringify({ novelties: this.excelImportValidRows }),
      });

      showToast(`¡Importación completada! Se registraron ${res.processedCount} novedades`);
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
