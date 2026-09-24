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


class MatricesAndSettingsMethods {
  renderPayrollMatricesTable(matrices) {
    const tbody = document.getElementById('matrices-table-body');
    if (!tbody) return;

    if (matrices.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-4 text-muted">
            <i class="ti ti-table-off fs-1 d-block mb-2 text-secondary"></i>
            No se encontraron matrices de liquidación registradas. Hacé click en "Nueva Matriz" para comenzar.
          </td>
        </tr>
      `;
      return;
    }

    const typeBadges = {
      RANGE: '<span class="badge bg-purple-lt"><i class="ti ti-arrows-left-right me-1"></i>Por Rangos</span>',
      EXACT: '<span class="badge bg-azure-lt"><i class="ti ti-equal me-1"></i>Valor Exacto</span>',
    };

    tbody.innerHTML = matrices
      .map((m) => {
        let rows = m.rows || [];
        let resultType = m.resultType || 'AMOUNT';
        if (typeof rows === 'string') {
          try {
            rows = JSON.parse(rows);
          } catch {
            rows = [];
          }
        }
        if (rows && !Array.isArray(rows) && typeof rows === 'object') {
          if (rows.resultType) resultType = rows.resultType;
          rows = rows.rules || rows.rows || [];
        }
        const rowCount = Array.isArray(rows) ? rows.length : 0;
        const returnBadge = resultType === 'PERCENTAGE'
          ? '<span class="badge bg-purple-lt ms-1">% Porcentaje</span>'
          : '<span class="badge bg-green-lt ms-1">$ Importe</span>';

        const allConcepts = (this.allPayrollConcepts && this.allPayrollConcepts.length > 0)
          ? this.allPayrollConcepts
          : (this.payrollConcepts || []);
        const conceptMatch = allConcepts.find((c) => c.code === m.inputConceptCode);
        const conceptLabel = conceptMatch ? `[${conceptMatch.code}] ${conceptMatch.name}` : m.inputConceptCode;

        return `
          <tr>
            <td><strong class="font-monospace text-primary">${escapeHtml(m.code)}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(m.name)}</div>
              ${m.description ? `<small class="text-muted">${escapeHtml(m.description)}</small>` : ''}
            </td>
            <td>
              <span class="badge bg-indigo-lt">
                <i class="ti ti-arrow-right-circle me-1"></i>${escapeHtml(conceptLabel)}
              </span>
            </td>
            <td>
              ${typeBadges[m.matchType] || m.matchType}
              ${returnBadge}
            </td>
            <td class="text-center">
              <span class="badge bg-light text-dark border">${rowCount} regla(s)</span>
            </td>
            <td class="text-center"><span class="badge bg-success-lt">Activa</span></td>
            <td class="text-end">
              <div class="btn-group btn-group-sm">
                <button type="button" class="btn btn-outline-primary btn-edit-matrix" data-id="${m.id}" title="Editar matriz y valores">
                  <i class="ti ti-edit"></i>
                </button>
                <button type="button" class="btn btn-outline-danger btn-del-matrix" data-id="${m.id}" data-name="${escapeHtml(m.name)}" title="Eliminar matriz">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-matrix').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = this.payrollMatrices.find((x) => x.id === btn.dataset.id);
        if (m) this.openEditMatrixModal(m);
      });
    });

    tbody.querySelectorAll('.btn-del-matrix').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.confirmDeleteMatrix(btn.dataset.id, btn.dataset.name);
      });
    });
  }

  renderPayrollMatricesPagination(meta) {
    const list = document.getElementById('matrices-pagination-list');
    const info = document.getElementById('matrices-pagination-info');
    if (!list) return;

    if (info) {
      info.textContent = `Mostrando ${this.payrollMatrices.length} de ${meta.total} matrices`;
    }

    const { page, totalPages } = meta;
    this.renderPaginationControls(list, page, totalPages, (newPage) => {
      this.payrollMatricesPage = newPage;
      this.loadPayrollMatrices();
    });
  }

  populateMatrixInputConceptSelect(selectedVal = '') {
    const select = document.getElementById('matrix-input-concept');
    if (!select) return;

    let html = '<option value="">-- Seleccione el Concepto de Entrada --</option>';

    // 1. Conceptos creados por el usuario y del sistema
    const concepts = (this.allPayrollConcepts && this.allPayrollConcepts.length > 0)
      ? this.allPayrollConcepts
      : (this.payrollConcepts || []);
    if (concepts && concepts.length > 0) {
      html += '<optgroup label="Conceptos de Nómina">';
      const sorted = [...concepts]
        .filter((c) => c.isActive !== false && !c.deletedAt)
        .sort((a, b) => {
          const numA = parseInt(String(a.code).replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(String(b.code).replace(/\D/g, ''), 10) || 0;
          return numA - numB || String(a.code).localeCompare(String(b.code));
        });
      for (const c of sorted) {
        const isSel = String(c.code) === String(selectedVal) ? 'selected' : '';
        html += `<option value="${escapeHtml(c.code)}" ${isSel}>[${escapeHtml(c.code)}] ${escapeHtml(c.name)}</option>`;
      }
      html += '</optgroup>';
    }

    // 2. Variables automáticas del legajo
    html += `
      <optgroup label="Variables Automáticas del Legajo">
        <option value="ANTIGUEDAD_ANOS" ${selectedVal === 'ANTIGUEDAD_ANOS' ? 'selected' : ''}>ANTIGUEDAD_ANOS (Años enteros de antigüedad)</option>
        <option value="ANTIGUEDAD_MESES" ${selectedVal === 'ANTIGUEDAD_MESES' ? 'selected' : ''}>ANTIGUEDAD_MESES (Meses de antigüedad)</option>
        <option value="DIAS_TRABAJADOS" ${selectedVal === 'DIAS_TRABAJADOS' ? 'selected' : ''}>DIAS_TRABAJADOS (Días liquidados en el mes)</option>
        <option value="HORAS_TRABAJADAS" ${selectedVal === 'HORAS_TRABAJADAS' ? 'selected' : ''}>HORAS_TRABAJADAS (Horas liquidadas en el mes)</option>
        <option value="CATEGORIA" ${selectedVal === 'CATEGORIA' ? 'selected' : ''}>CATEGORIA (Categoría laboral del empleado)</option>
        <option value="PUESTO" ${selectedVal === 'PUESTO' ? 'selected' : ''}>PUESTO (Código de puesto de trabajo)</option>
        <option value="TOTAL_REMUNERATIVO" ${selectedVal === 'TOTAL_REMUNERATIVO' ? 'selected' : ''}>TOTAL_REMUNERATIVO (Bruto acumulado)</option>
      </optgroup>
    `;

    select.innerHTML = html;
  }

  renderMatrixFormRows() {
    const thead = document.getElementById('matrix-rows-thead');
    const tbody = document.getElementById('matrix-rows-tbody');
    const hint = document.getElementById('matrix-rows-mode-hint');
    const footer = document.getElementById('matrix-rows-footer');
    if (!tbody) return;

    const matchType = document.getElementById('matrix-input-match-type')?.value || 'RANGE';
    const returnType = document.getElementById('matrix-input-return-type')?.value || 'AMOUNT';
    const isPercentage = returnType === 'PERCENTAGE';
    const valColHeader = isPercentage ? 'Porcentaje Devuelto (%)' : 'Importe Fijo Devuelto ($)';

    if (thead) {
      if (matchType === 'EXACT') {
        thead.innerHTML = `
          <tr>
            <th style="width: 50%;">Valor Clave de Entrada (Texto o Número)</th>
            <th style="width: 40%;">${valColHeader}</th>
            <th class="w-1 text-end">Acción</th>
          </tr>
        `;
        if (hint) {
          hint.textContent = isPercentage
            ? 'Defina los valores clave y el porcentaje (%) que devuelve la matriz'
            : 'Defina los valores clave y el importe fijo ($) que devuelve la matriz';
        }
      } else {
        thead.innerHTML = `
          <tr>
            <th style="width: 30%;">Desde (>=)</th>
            <th style="width: 30%;">Hasta (<=)</th>
            <th style="width: 30%;">${valColHeader}</th>
            <th class="w-1 text-end">Acción</th>
          </tr>
        `;
        if (hint) {
          hint.textContent = isPercentage
            ? 'Defina los tramos numéricos y el porcentaje (%) que devuelve la matriz'
            : 'Defina los tramos numéricos y el importe fijo ($) que devuelve la matriz';
        }
      }
    }

    if (!this.matrixFormRows || this.matrixFormRows.length === 0) {
      this.matrixFormRows = [{ from: 0, to: 1, inputValue: '', value: 0, valueType: returnType }];
    }

    tbody.innerHTML = this.matrixFormRows
      .map((row, idx) => {
        const valStr = row.value !== undefined && row.value !== null && row.value !== '' ? row.value : '';
        if (matchType === 'EXACT') {
          return `
            <tr data-row-index="${idx}">
              <td>
                <input type="text" class="form-control form-control-sm matrix-row-input" value="${escapeHtml(row.inputValue || '')}" placeholder="Ej. A, B, 100..." required />
              </td>
              <td>
                <div class="input-group input-group-sm">
                  ${!isPercentage ? '<span class="input-group-text">$</span>' : ''}
                  <input type="number" step="0.01" class="form-control matrix-row-value font-monospace text-end" value="${valStr}" placeholder="${isPercentage ? '15.00' : '0.00'}" required />
                  ${isPercentage ? '<span class="input-group-text">%</span>' : ''}
                </div>
              </td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-danger btn-del-matrix-row" data-index="${idx}" title="Eliminar regla">
                  <i class="ti ti-trash"></i>
                </button>
              </td>
            </tr>
          `;
        } else {
          const fromStr = row.from !== undefined && row.from !== null && row.from !== '' ? row.from : '';
          const toStr = row.to !== undefined && row.to !== null && row.to !== '' ? row.to : '';
          return `
            <tr data-row-index="${idx}">
              <td>
                <input type="number" step="any" class="form-control form-control-sm matrix-row-from font-monospace" value="${fromStr}" placeholder="0" />
              </td>
              <td>
                <input type="number" step="any" class="form-control form-control-sm matrix-row-to font-monospace" value="${toStr}" placeholder="Sin límite" />
              </td>
              <td>
                <div class="input-group input-group-sm">
                  ${!isPercentage ? '<span class="input-group-text">$</span>' : ''}
                  <input type="number" step="0.01" class="form-control matrix-row-value font-monospace text-end" value="${valStr}" placeholder="${isPercentage ? '15.00' : '0.00'}" required />
                  ${isPercentage ? '<span class="input-group-text">%</span>' : ''}
                </div>
              </td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-danger btn-del-matrix-row" data-index="${idx}" title="Eliminar regla">
                  <i class="ti ti-trash"></i>
                </button>
              </td>
            </tr>
          `;
        }
      })
      .join('');

    if (footer) {
      footer.textContent = `${this.matrixFormRows.length} regla(s) configurada(s).`;
    }

    tbody.querySelectorAll('.btn-del-matrix-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        this.deleteMatrixFormRow(idx);
      });
    });
  }

  syncMatrixFormRowsFromDOM() {
    const tbody = document.getElementById('matrix-rows-tbody');
    if (!tbody) return;

    const returnType = document.getElementById('matrix-input-return-type')?.value || 'AMOUNT';
    const trs = tbody.querySelectorAll('tr[data-row-index]');
    const updated = [];

    trs.forEach((tr) => {
      const fromInput = tr.querySelector('.matrix-row-from');
      const toInput = tr.querySelector('.matrix-row-to');
      const keyInput = tr.querySelector('.matrix-row-input');
      const valInput = tr.querySelector('.matrix-row-value');

      updated.push({
        from: fromInput && fromInput.value.trim() !== '' ? Number(fromInput.value) : null,
        to: toInput && toInput.value.trim() !== '' ? Number(toInput.value) : null,
        inputValue: keyInput ? keyInput.value.trim() : '',
        value: valInput && valInput.value.trim() !== '' ? Number(valInput.value) : 0,
        valueType: returnType,
      });
    });

    if (updated.length > 0) {
      this.matrixFormRows = updated;
    }
  }

  addMatrixFormRow(initialData = null) {
    this.syncMatrixFormRowsFromDOM();
    const returnType = document.getElementById('matrix-input-return-type')?.value || 'AMOUNT';
    this.matrixFormRows.push({
      from: null,
      to: null,
      inputValue: '',
      value: 0,
      valueType: returnType,
      ...(initialData || {}),
    });
    this.renderMatrixFormRows();
  }

  deleteMatrixFormRow(idx) {
    this.syncMatrixFormRowsFromDOM();
    if (this.matrixFormRows.length <= 1) {
      showToast('La matriz debe contener al menos una regla de valores', 'warning');
      return;
    }
    this.matrixFormRows.splice(idx, 1);
    this.renderMatrixFormRows();
  }

  openNewMatrixModal() {
    const form = document.getElementById('form-payroll-matrix');
    form?.reset();
    document.getElementById('matrix-form-id').value = '';
    document.getElementById('modal-matrix-form-title').textContent = 'Nueva Matriz de Liquidación';
    document.getElementById('matrix-form-alert')?.classList.add('d-none');

    const codeInput = document.getElementById('matrix-input-code');
    codeInput.readOnly = false;
    codeInput.classList.remove('bg-light');

    document.getElementById('matrix-input-match-type').value = 'RANGE';
    document.getElementById('matrix-input-return-type').value = 'AMOUNT';
    document.getElementById('matrix-input-default-value').value = '0.00';

    this.populateMatrixInputConceptSelect('');
    this.matrixFormRows = [
      { from: 0, to: 1, value: 0, valueType: 'AMOUNT' },
      { from: 2, to: 5, value: 0, valueType: 'AMOUNT' },
    ];
    this.renderMatrixFormRows();

    getBootstrapModal(document.getElementById('modal-matrix-form'))?.show();
  }

  openEditMatrixModal(m) {
    document.getElementById('matrix-form-id').value = m.id;
    document.getElementById('modal-matrix-form-title').textContent = `Editar Matriz: [${m.code}] ${m.name}`;
    document.getElementById('matrix-form-alert')?.classList.add('d-none');

    const codeInput = document.getElementById('matrix-input-code');
    codeInput.value = m.code;
    codeInput.readOnly = true;
    codeInput.classList.add('bg-light');

    document.getElementById('matrix-input-name').value = m.name;
    document.getElementById('matrix-input-description').value = m.description || '';
    document.getElementById('matrix-input-match-type').value = m.matchType || 'RANGE';
    document.getElementById('matrix-input-default-value').value = m.defaultValue !== undefined ? m.defaultValue : '0.00';

    let rows = m.rows || [];
    let returnType = m.resultType || 'AMOUNT';
    if (typeof rows === 'string') {
      try {
        rows = JSON.parse(rows);
      } catch {
        rows = [];
      }
    }
    if (rows && !Array.isArray(rows) && typeof rows === 'object') {
      if (rows.resultType) returnType = rows.resultType;
      rows = rows.rules || rows.rows || [];
    }
    if (Array.isArray(rows) && rows[0]?.valueType) {
      returnType = rows[0].valueType;
    }

    const retSelect = document.getElementById('matrix-input-return-type');
    if (retSelect) retSelect.value = returnType;

    this.populateMatrixInputConceptSelect(m.inputConceptCode);
    this.matrixFormRows = Array.isArray(rows) && rows.length > 0 ? rows : [{ from: 0, to: 1, value: 0, valueType: returnType }];
    this.renderMatrixFormRows();

    getBootstrapModal(document.getElementById('modal-matrix-form'))?.show();
  }

  async savePayrollMatrix() {
    const submitBtn = document.getElementById('btn-save-payroll-matrix');
    const alertBox = document.getElementById('matrix-form-alert');
    if (alertBox) alertBox.classList.add('d-none');

    this.syncMatrixFormRowsFromDOM();

    const id = document.getElementById('matrix-form-id').value;
    const code = document.getElementById('matrix-input-code').value.trim().toUpperCase();
    const name = document.getElementById('matrix-input-name').value.trim();
    const inputConceptCode = document.getElementById('matrix-input-concept').value.trim();
    const matchType = document.getElementById('matrix-input-match-type').value;
    const returnType = document.getElementById('matrix-input-return-type').value;
    const defaultValue = Number(document.getElementById('matrix-input-default-value').value) || 0;
    const description = document.getElementById('matrix-input-description').value.trim() || null;

    if (!code || !name || !inputConceptCode) {
      if (alertBox) {
        alertBox.textContent = 'Por favor complete todos los campos obligatorios (*)';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    if (!this.matrixFormRows || this.matrixFormRows.length === 0) {
      if (alertBox) {
        alertBox.textContent = 'Debe agregar al menos una regla a la matriz';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    // Asegurar que cada fila tenga su valueType
    const finalizedRows = this.matrixFormRows.map((r) => ({
      ...r,
      valueType: returnType,
    }));

    const payload = {
      code,
      name,
      description,
      inputConceptCode,
      matchType,
      defaultValue,
      rows: {
        resultType: returnType,
        rules: finalizedRows,
      },
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';

    try {
      if (id) {
        await apiRequest(`/payroll/matrices/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('Matriz de liquidación actualizada correctamente');
      } else {
        await apiRequest('/payroll/matrices', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Matriz de liquidación creada exitosamente');
      }

      getBootstrapModal(document.getElementById('modal-matrix-form'))?.hide();
      await this.loadPayrollMatrices();
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al guardar la matriz de liquidación';
        alertBox.classList.remove('d-none');
      }
      showToast(err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Matriz';
    }
  }

  confirmDeleteMatrix(id, name) {
    this.confirmDeleteAction({
      title: 'Eliminar Matriz de Liquidación',
      message: `¿Estás seguro de que deseas eliminar la matriz <strong>"${escapeHtml(name)}"</strong>?`,
      onConfirm: async () => {
        try {
          await apiRequest(`/payroll/matrices/${id}`, { method: 'DELETE' });
          showToast('Matriz eliminada correctamente');
          await this.loadPayrollMatrices();
        } catch (err) {
          showToast(err.message || 'Error al eliminar matriz. Verifique que no esté siendo utilizada por conceptos.', 'danger');
        }
      },
    });
  }

  populateConceptModalMatrixOptions() {
    const conceptSelect = document.getElementById('concept-select-matrix');
    const formulaSelect = document.getElementById('formula-select-matrix');

    let html = '<option value="">-- Seleccionar Matriz de Liquidación --</option>';
    let formulaHtml = '<option value="">-- Elegir matriz para insertar en fórmula --</option>';

    if (this.payrollMatrices && this.payrollMatrices.length > 0) {
      for (const m of this.payrollMatrices) {
        const driver = m.inputConceptCode || '-';
        html += `<option value="${m.id}">[${escapeHtml(m.code)}] ${escapeHtml(m.name)} (Entrada: ${escapeHtml(driver)})</option>`;
        formulaHtml += `<option value="${escapeHtml(m.code)}">[${escapeHtml(m.code)}] ${escapeHtml(m.name)}</option>`;
      }
    }

    if (conceptSelect) conceptSelect.innerHTML = html;
    if (formulaSelect) formulaSelect.innerHTML = formulaHtml;
    this.populateFormulaFixedValuesSelect();
    this.populateFormulaSalaryScalesSelect();
  }

  updateConceptMatrixInfoBanner() {
    const conceptSelect = document.getElementById('concept-select-matrix');
    const infoBox = document.getElementById('concept-matrix-info');
    const infoText = document.getElementById('concept-matrix-info-text');
    if (!conceptSelect || !infoBox || !infoText) return;

    const selectedId = conceptSelect.value;
    if (!selectedId) {
      infoBox.classList.add('d-none');
      return;
    }

    const matrix = this.payrollMatrices?.find((m) => m.id === selectedId);
    if (!matrix) {
      infoBox.classList.add('d-none');
      return;
    }

    let rows = matrix.rows || [];
    let resultType = matrix.resultType || 'AMOUNT';
    if (typeof rows === 'string') {
      try {
        rows = JSON.parse(rows);
      } catch {
        rows = [];
      }
    }
    if (rows && !Array.isArray(rows) && typeof rows === 'object') {
      if (rows.resultType) resultType = rows.resultType;
      rows = rows.rules || rows.rows || [];
    }
    const count = Array.isArray(rows) ? rows.length : 0;
    const typeStr = matrix.matchType === 'RANGE' ? 'Rangos numéricos' : 'Valor exacto';
    const resStr = resultType === 'PERCENTAGE' ? 'Porcentaje (%) sobre concepto entrada' : 'Importe fijo ($)';

    infoText.innerHTML = `Matriz activa: <strong>[${escapeHtml(matrix.code)}] ${escapeHtml(matrix.name)}</strong>. Concepto de entrada (Driver): <code class="badge bg-light text-dark">${escapeHtml(matrix.inputConceptCode)}</code>. Modo: <strong>${typeStr}</strong>. Devuelve: <strong>${resStr}</strong> (${count} regla(s)).`;
    infoBox.classList.remove('d-none');
  }

  // --- Valores Globales Fijos (Constantes de Liquidación) ---

  async loadPayrollFixedValues() {
    const spinner = document.getElementById('fixed-values-spinner');
    if (spinner) spinner.classList.remove('d-none');

    const searchInput = document.getElementById('fixed-values-search-input');
    const statusFilter = document.getElementById('fixed-values-status-filter');

    const query = new URLSearchParams({
      page: String(this.payrollFixedValuesPage),
      limit: String(this.payrollFixedValuesPageSize),
    });
    if (searchInput?.value?.trim()) query.append('search', searchInput.value.trim());
    if (statusFilter?.value && statusFilter.value !== 'ALL') query.append('isActive', statusFilter.value);

    try {
      const res = await apiRequest(`/payroll/fixed-values?${query.toString()}`);
      this.payrollFixedValues = res.data || [];
      const badge = document.getElementById('payroll-badge-fixed-values-count');
      if (badge) badge.textContent = res.meta?.total || this.payrollFixedValues.length;

      this.renderPayrollFixedValuesTable(this.payrollFixedValues);
      this.renderPayrollFixedValuesPagination(res.meta || { total: this.payrollFixedValues.length, page: 1, totalPages: 1 });
      this.populateFormulaFixedValuesSelect();
    } catch (err) {
      showToast(err.message || 'Error al cargar valores fijos', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  renderPayrollFixedValuesTable(fixedValues) {
    const tbody = document.getElementById('fixed-values-table-body');
    if (!tbody) return;

    if (fixedValues.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-5 text-muted">
            <i class="ti ti-pinned-off fs-1 d-block mb-2 text-secondary opacity-50"></i>
            No se encontraron valores fijos registrados. Hacé click en "Nuevo Valor Fijo" para comenzar.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = fixedValues
      .map((fv) => {
        const numVal = Number(fv.value || 0);
        const formattedVal = fv.unit === '$'
          ? `$ ${formatNumber(numVal, 2)}`
          : `${formatNumber(numVal, 2)} ${escapeHtml(fv.unit || '')}`;

        const statusBadge = fv.isActive
          ? '<span class="badge bg-success-lt"><i class="ti ti-check me-1"></i>Activo</span>'
          : '<span class="badge bg-secondary-lt"><i class="ti ti-x me-1"></i>Inactivo</span>';

        return `
          <tr>
            <td>
              <span class="badge bg-azure-lt font-monospace fs-3 fw-bold">${escapeHtml(fv.code)}</span>
            </td>
            <td>
              <div class="fw-bold">${escapeHtml(fv.name)}</div>
              ${fv.description ? `<div class="text-muted small text-truncate" style="max-width: 320px;">${escapeHtml(fv.description)}</div>` : ''}
            </td>
            <td class="text-end">
              <span class="fw-bold fs-3 text-dark font-monospace">${formattedVal}</span>
            </td>
            <td class="text-center">
              <span class="badge bg-light text-secondary border">${escapeHtml(fv.unit || '$')}</span>
            </td>
            <td class="text-center">${statusBadge}</td>
            <td class="text-end">
              <div class="btn-list flex-nowrap justify-content-end">
                <button type="button" class="btn btn-sm btn-outline-primary btn-edit-fixed-value" data-id="${fv.id}" title="Editar valor fijo">
                  <i class="ti ti-edit"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger btn-delete-fixed-value" data-id="${fv.id}" data-code="${escapeHtml(fv.code)}" title="Eliminar valor fijo">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-fixed-value').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.editFixedValue(btn.dataset.id);
      });
    });

    tbody.querySelectorAll('.btn-delete-fixed-value').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.confirmDeleteFixedValue(btn.dataset.id, btn.dataset.code);
      });
    });
  }

  renderPayrollFixedValuesPagination(meta) {
    const list = document.getElementById('fixed-values-pagination-list');
    const info = document.getElementById('fixed-values-pagination-info');
    if (!list || !info) return;

    if (!meta || meta.total === 0) {
      info.textContent = 'Mostrando 0 valores fijos';
      list.innerHTML = '';
      return;
    }

    info.textContent = `Mostrando ${this.payrollFixedValues.length} de ${meta.total} valores fijos`;

    const totalPages = meta.totalPages || 1;
    let html = '';

    html += `
      <li class="page-item ${this.payrollFixedValuesPage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${this.payrollFixedValuesPage - 1}" tabindex="-1" aria-disabled="${this.payrollFixedValuesPage === 1}">
          <i class="ti ti-chevron-left"></i>
        </a>
      </li>
    `;

    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= this.payrollFixedValuesPage - 1 && p <= this.payrollFixedValuesPage + 1)) {
        html += `
          <li class="page-item ${p === this.payrollFixedValuesPage ? 'active' : ''}">
            <a class="page-link" href="#" data-page="${p}">${p}</a>
          </li>
        `;
      } else if (p === this.payrollFixedValuesPage - 2 || p === this.payrollFixedValuesPage + 2) {
        html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
      }
    }

    html += `
      <li class="page-item ${this.payrollFixedValuesPage === totalPages ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${this.payrollFixedValuesPage + 1}" aria-disabled="${this.payrollFixedValuesPage === totalPages}">
          <i class="ti ti-chevron-right"></i>
        </a>
      </li>
    `;

    list.innerHTML = html;

    list.querySelectorAll('.page-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const p = Number(link.dataset.page);
        if (p >= 1 && p <= totalPages && p !== this.payrollFixedValuesPage) {
          this.payrollFixedValuesPage = p;
          this.loadPayrollFixedValues();
        }
      });
    });
  }

  openNewFixedValueModal() {
    document.getElementById('fixed-value-form-id').value = '';
    document.getElementById('modal-fixed-value-form-title').textContent = 'Nuevo Valor Fijo';
    document.getElementById('fixed-value-input-code').value = '';
    document.getElementById('fixed-value-input-code').readOnly = false;
    document.getElementById('fixed-value-input-name').value = '';
    document.getElementById('fixed-value-input-value').value = '';
    document.getElementById('fixed-value-input-unit').value = '$';
    document.getElementById('fixed-value-unit-addon').textContent = '$';
    document.getElementById('fixed-value-input-desc').value = '';
    document.getElementById('fixed-value-input-active').checked = true;

    const alertBox = document.getElementById('fixed-value-form-alert');
    if (alertBox) {
      alertBox.classList.add('d-none');
      alertBox.textContent = '';
    }

    const modalEl = document.getElementById('modal-fixed-value-form');
    if (modalEl) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  }

  async editFixedValue(id) {
    try {
      const res = await apiRequest(`/payroll/fixed-values/${id}`);
      const fv = res.data;
      if (!fv) return;

      document.getElementById('fixed-value-form-id').value = fv.id;
      document.getElementById('modal-fixed-value-form-title').textContent = 'Editar Valor Fijo';
      document.getElementById('fixed-value-input-code').value = fv.code;
      document.getElementById('fixed-value-input-code').readOnly = false;
      document.getElementById('fixed-value-input-name').value = fv.name;
      document.getElementById('fixed-value-input-value').value = fv.value;
      document.getElementById('fixed-value-input-unit').value = fv.unit || '$';
      document.getElementById('fixed-value-unit-addon').textContent = fv.unit || '$';
      document.getElementById('fixed-value-input-desc').value = fv.description || '';
      document.getElementById('fixed-value-input-active').checked = Boolean(fv.isActive);

      const alertBox = document.getElementById('fixed-value-form-alert');
      if (alertBox) {
        alertBox.classList.add('d-none');
        alertBox.textContent = '';
      }

      const modalEl = document.getElementById('modal-fixed-value-form');
      if (modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
      }
    } catch (err) {
      showToast(err.message || 'Error al obtener datos del valor fijo', 'danger');
    }
  }

  async saveFixedValue() {
    const id = document.getElementById('fixed-value-form-id').value;
    const code = document.getElementById('fixed-value-input-code').value.trim().toUpperCase().replace(/\s+/g, '_');
    const name = document.getElementById('fixed-value-input-name').value.trim();
    const value = Number(document.getElementById('fixed-value-input-value').value);
    const unit = document.getElementById('fixed-value-input-unit').value.trim();
    const description = document.getElementById('fixed-value-input-desc').value.trim();
    const isActive = document.getElementById('fixed-value-input-active').checked;

    const alertBox = document.getElementById('fixed-value-form-alert');
    if (alertBox) {
      alertBox.classList.add('d-none');
      alertBox.textContent = '';
    }

    if (!code || !name) {
      if (alertBox) {
        alertBox.textContent = 'El código y la denominación son obligatorios.';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    const payload = {
      code,
      name,
      value: isNaN(value) ? 0 : value,
      unit: unit || '$',
      description: description || null,
      isActive,
    };

    const btn = document.getElementById('btn-save-fixed-value');
    if (btn) btn.disabled = true;

    try {
      if (id) {
        await apiRequest(`/payroll/fixed-values/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('Valor fijo actualizado correctamente', 'success');
      } else {
        await apiRequest('/payroll/fixed-values', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Valor fijo creado exitosamente', 'success');
      }

      const modalEl = document.getElementById('modal-fixed-value-form');
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }

      await this.loadPayrollFixedValues();
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al guardar el valor fijo';
        alertBox.classList.remove('d-none');
      } else {
        showToast(err.message || 'Error al guardar el valor fijo', 'danger');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  confirmDeleteFixedValue(id, code) {
    const codeEl = document.getElementById('delete-fixed-value-code');
    if (codeEl) codeEl.textContent = `[${code}]`;

    const btnConfirm = document.getElementById('btn-confirm-delete-fixed-value');
    if (btnConfirm) {
      btnConfirm.onclick = async () => {
        try {
          btnConfirm.disabled = true;
          await apiRequest(`/payroll/fixed-values/${id}`, { method: 'DELETE' });
          showToast('Valor fijo eliminado correctamente', 'success');

          const modalEl = document.getElementById('modal-delete-fixed-value-confirm');
          if (modalEl) {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
          }

          await this.loadPayrollFixedValues();
        } catch (err) {
          showToast(err.message || 'Error al eliminar el valor fijo', 'danger');
        } finally {
          btnConfirm.disabled = false;
        }
      };
    }

    const modalEl = document.getElementById('modal-delete-fixed-value-confirm');
    if (modalEl) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  }

  populateFormulaFixedValuesSelect() {
    const sel = document.getElementById('formula-select-fixed-value');
    if (!sel) return;

    let html = '<option value="">-- Seleccionar Valor Fijo para insertar en la fórmula --</option>';
    for (const fv of this.payrollFixedValues) {
      if (fv.isActive) {
        const formatted = fv.unit === '$' ? `$ ${formatNumber(fv.value, 2)}` : `${formatNumber(fv.value, 2)} ${escapeHtml(fv.unit || '')}`;
        html += `<option value="${escapeHtml(fv.code)}">[${escapeHtml(fv.code)}] ${escapeHtml(fv.name)} (${formatted})</option>`;
      }
    }
    sel.innerHTML = html;
  }

  populateFormulaSalaryScalesSelect() {
    const sel = document.getElementById('formula-select-salary-scale');
    if (!sel) return;

    let html = '<option value="">-- Seleccionar Nómina para insertar en la fórmula --</option>';
    const scales = this.salaryScales || this.payrollSalaryScales || [];
    for (const sc of scales) {
      if (sc.isActive !== false) {
        const tokenVal = sc.code || sc.name.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
        const basicAmt = Number(sc.basicSalary || sc.currentBasicSalary || sc.amount || 0);
        const formatted = `$ ${formatNumber(basicAmt, 2)}`;
        const codeDisplay = sc.code ? `[${escapeHtml(sc.code)}] ` : '';
        html += `<option value="${escapeHtml(tokenVal)}">${codeDisplay}${escapeHtml(sc.name)} (${formatted})</option>`;
      }
    }
    sel.innerHTML = html;
  }

  // --- Parámetros y Alícuotas Patronales (Pestaña Dedicada) ---

  async loadPayrollSettings() {
    try {
      const res = await apiRequest('/payroll/settings');
      this.payrollSettings = res.data;
      const s = this.payrollSettings;

      if (s) {
        const empType = document.getElementById('settings-employer-type');
        if (empType) empType.value = s.employerType || 'SERVICIOS_COMERCIO';

        const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el && val !== undefined) el.value = val;
        };

        setVal('settings-detraction-base', s.detractionBase);
        setVal('settings-sipa-rate', s.sipaRate);
        setVal('settings-inssjyp-rate', s.inssjypRate);
        setVal('settings-os-rate', s.osRate);
        setVal('settings-fne-rate', s.fneRate);
        setVal('settings-aaff-rate', s.aaffRate);
        setVal('settings-art-rate', s.artRate);
        setVal('settings-art-fixed', s.artFixedFee);
        setVal('settings-scvo-fee', s.scvoFee);
        setVal('settings-anses-min', s.ansesMinCap);
        setVal('settings-anses-max', s.ansesMaxCap);
        setVal('settings-standard-weekly-hours', s.standardWeeklyHoursFormatted || this.formatDecimalToHours(s.standardWeeklyHours, '48:00'));
        setVal('settings-standard-monthly-hours', s.standardMonthlyHoursFormatted || this.formatDecimalToHours(s.standardMonthlyHours, '200:00'));
      }
    } catch (err) {
      console.warn('Error al cargar parámetros patronales:', err.message);
    }
  }

  async savePayrollSettings() {
    const submitBtn = document.getElementById('btn-save-payroll-settings');
    const alertBox = document.getElementById('payroll-settings-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const payload = {
      employerType: document.getElementById('settings-employer-type').value,
      detractionBase: Number(document.getElementById('settings-detraction-base').value),
      sipaRate: Number(document.getElementById('settings-sipa-rate').value),
      inssjypRate: Number(document.getElementById('settings-inssjyp-rate').value),
      osRate: Number(document.getElementById('settings-os-rate').value),
      fneRate: Number(document.getElementById('settings-fne-rate').value),
      aaffRate: Number(document.getElementById('settings-aaff-rate').value),
      artRate: Number(document.getElementById('settings-art-rate').value),
      artFixedFee: Number(document.getElementById('settings-art-fixed').value),
      scvoFee: Number(document.getElementById('settings-scvo-fee').value),
      ansesMinCap: Number(document.getElementById('settings-anses-min').value),
      ansesMaxCap: Number(document.getElementById('settings-anses-max').value),
      standardWeeklyHours: document.getElementById('settings-standard-weekly-hours')?.value?.trim() || '48:00',
      standardMonthlyHours: document.getElementById('settings-standard-monthly-hours')?.value?.trim() || '200:00',
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando...';

    try {
      await apiRequest('/payroll/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      showToast('Parámetros y alícuotas patronales actualizados con éxito');
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Error al actualizar parámetros';
        alertBox.classList.remove('d-none');
      }
      showToast(err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="ti ti-device-floppy me-2"></i> Guardar Parámetros y Alícuotas';
    }
  }
}

export function registerMatricesAndSettingsMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(MatricesAndSettingsMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
