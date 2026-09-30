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


class ConceptsMethods {
  renderPayrollConceptsTable(concepts) {
    const tbody = document.getElementById('concepts-table-body');
    if (!tbody) return;

    if (concepts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">No se encontraron conceptos registrados.</td></tr>';
      return;
    }

    const typeBadges = {
      REMUNERATIVE: '<span class="badge bg-green-lt">Remunerativo</span>',
      NON_REMUNERATIVE: '<span class="badge bg-blue-lt">No Remunerativo</span>',
      DEDUCTION: '<span class="badge bg-danger-lt">Retención</span>',
      AUXILIARY: '<span class="badge bg-purple text-white"><i class="ti ti-tools me-1"></i>Auxiliar</span>',
    };

    const periodTypeBadges = {
      ALL: '<span class="badge bg-secondary-lt">Todas</span>',
      MONTHLY: '<span class="badge bg-azure-lt">Mensual</span>',
      QUINCE: '<span class="badge bg-blue-lt">Quincenal</span>',
      QUINCE_1: '<span class="badge bg-blue-lt">1ra Quincena</span>',
      QUINCE_2: '<span class="badge bg-blue-lt">2da Quincena</span>',
      SAC_1: '<span class="badge bg-indigo-lt">1er SAC</span>',
      SAC_2: '<span class="badge bg-indigo-lt">2do SAC</span>',
      SAC: '<span class="badge bg-indigo-lt">Ambos SAC</span>',
      VACATIONS: '<span class="badge bg-teal-lt">Vacaciones</span>',
      FINAL: '<span class="badge bg-orange-lt">Final</span>',
    };

    const calcBadges = {
      FIXED: '<span class="badge bg-light text-dark border">Fijo</span>',
      FORMULA: '<span class="badge bg-purple-lt"><i class="ti ti-math-function me-1"></i>Fórmula</span>',
      MATRIX: '<span class="badge bg-azure-lt"><i class="ti ti-table me-1"></i>Matriz</span>',
    };

    tbody.innerHTML = concepts
      .map((c) => {
        const persistentBadge = (c.isPersistent !== false && c.isPersistent !== 0)
          ? '<span class="badge bg-teal-lt"><i class="ti ti-repeat me-1"></i>Persistente</span>'
          : '<span class="badge bg-yellow-lt"><i class="ti ti-calendar-off me-1"></i>No Persistente</span>';
        const noveltyBadge = c.noveltyDataType && c.noveltyDataType !== 'CANTIDAD'
          ? (c.noveltyDataType === 'CALCULADO'
              ? '<span class="badge bg-azure-lt small py-0 px-1 font-monospace" style="font-size: 0.68rem;"><i class="ti ti-calculator me-1"></i>Calculado</span>'
              : `<span class="badge bg-cyan-lt small py-0 px-1 font-monospace" style="font-size: 0.68rem;">Nov: ${escapeHtml(c.noveltyDataType)}</span>`)
          : '';
        const scopeBadge = (c.scope === 'INDIVIDUAL')
          ? '<span class="badge bg-purple-lt" title="Aplica solo si se asigna expresamente al empleado"><i class="ti ti-user me-1"></i>Individual</span>'
          : '<span class="badge bg-azure-lt" title="Aplica a toda la nómina"><i class="ti ti-users me-1"></i>General</span>';

        return `
          <tr>
            <td><strong class="font-monospace text-primary">${escapeHtml(c.code)}</strong></td>
            <td>
              <div class="fw-bold">${escapeHtml(c.name)}</div>
              ${noveltyBadge}
            </td>
            <td>${typeBadges[c.type] || c.type}</td>
            <td>${scopeBadge}</td>
            <td>${periodTypeBadges[c.periodType] || `<span class="badge bg-light text-muted">${escapeHtml(c.periodType || 'Todas')}</span>`}</td>
            <td>${persistentBadge}</td>
            <td>${calcBadges[c.calculationType] || c.calculationType}</td>
            <td class="text-center"><span class="badge bg-success-lt">Activo</span></td>
            <td class="text-end">
              <div class="btn-group btn-group-sm">
                <button type="button" class="btn btn-outline-primary btn-edit-concept" data-id="${c.id}" title="Editar / Modificar fórmula">
                  <i class="ti ti-edit"></i>
                </button>
                <button type="button" class="btn btn-outline-danger btn-del-concept" data-id="${c.id}" data-name="${escapeHtml(c.name)}" title="Eliminar concepto">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit-concept').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = (this.allPayrollConcepts || []).find((x) => x.id === btn.dataset.id) ||
                  this.payrollConcepts.find((x) => x.id === btn.dataset.id);
        if (c) this.openEditConceptModal(c);
      });
    });

    tbody.querySelectorAll('.btn-del-concept').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.confirmDeleteConcept(btn.dataset.id, btn.dataset.name);
      });
    });
  }

  renderPayrollConceptsPagination(meta) {
    const list = document.getElementById('concepts-pagination-list');
    const info = document.getElementById('concepts-pagination-info');
    if (!list) return;

    if (info) {
      info.textContent = `Mostrando ${this.payrollConcepts.length} de ${meta.total} conceptos`;
    }

    const { page, totalPages } = meta;
    this.renderPaginationControls(list, page, totalPages, (newPage) => {
      this.payrollConceptsPage = newPage;
      this.loadPayrollConcepts();
    });
  }

  getPrefixForPeriodType(periodType) {
    const map = {
      MONTHLY: 'SU',
      QUINCE: 'QU',
      QUINCE_1: 'QU',
      QUINCE_2: 'QU',
      SAC: 'SA',
      SAC_1: 'SA',
      SAC_2: 'SA',
      VACATIONS: 'VA',
      FINAL: 'FI',
      ADJUSTMENT: 'AJ',
      GRATIFICATION: 'GR',
    };
    return map[periodType] || 'SU';
  }

  updateConceptNormalizedCode(forcePad = false) {
    const periodTypeSelect = document.getElementById('concept-input-period-type');
    const numberInput = document.getElementById('concept-input-number');
    const codeInput = document.getElementById('concept-input-code');
    const badge = document.getElementById('concept-prefix-badge');

    if (!periodTypeSelect || !numberInput || !codeInput) return;

    const prefix = this.getPrefixForPeriodType(periodTypeSelect.value);
    if (badge) badge.textContent = prefix;

    const rawNum = numberInput.value.replace(/\D/g, '').slice(0, 4);
    if (numberInput.value !== rawNum) {
      numberInput.value = rawNum;
    }

    if (forcePad && rawNum.length > 0 && rawNum.length < 4) {
      numberInput.value = rawNum.padStart(4, '0');
    }

    const currentNum = numberInput.value;
    if (currentNum.length > 0) {
      const formattedNum = (forcePad || currentNum.length === 4) ? currentNum.padStart(4, '0') : currentNum;
      codeInput.value = `${prefix}${formattedNum}`;
    } else {
      codeInput.value = '';
    }

    this.populateFormulaConceptOptions(codeInput.value);
  }

  applyArcaSubsystemsSuggestion(arcaCode) {
    const code = String(arcaCode || '').trim();
    const isDeduction = code.startsWith('81') || code.startsWith('82') || (parseInt(code, 10) >= 810000 && parseInt(code, 10) <= 829999);
    const isRemunerative = code.startsWith('1') || (parseInt(code, 10) >= 110000 && parseInt(code, 10) <= 499999);
    const isOsOnly = code === '540000';
    const isSpecialNoRem = code === '551000';
    const isLrtPasantias = code === '550000';

    const state = {
      r1: false, r2: false, r3: false, r4: false, r5: false,
      r6: false, r7: false, r8: false, r9: false, r10: false,
    };

    if (isDeduction) {
      // Normativa ARCA LSD: Retenciones/Descuentos informan '0' en todos los subsistemas F.931
    } else if (isRemunerative) {
      const currentCode = document.getElementById('concept-input-code')?.value?.trim();
      if (currentCode === 'SU1002') {
        // Honorarios Directores S.A. (Mod. 099): solo LRT
        state.r9 = true;
      } else {
        // Remunerativos generales: R1, R2, R3, R4, R5, R8, R9, R10
        state.r1 = true;
        state.r2 = true;
        state.r3 = true;
        state.r4 = true;
        state.r5 = true;
        state.r8 = true;
        state.r9 = true;
        state.r10 = true;
      }
    } else if (isOsOnly) {
      // 540000: Incremento No Remunerativo exclusivo para Obra Social y FSR
      state.r4 = true;
      state.r8 = true;
    } else if (isSpecialNoRem) {
      // 551000: Importes No Remunerativos Especiales c/ OS y LRT
      state.r4 = true;
      state.r8 = true;
      state.r9 = true;
    } else if (isLrtPasantias) {
      // 550000: Incrementos No Remunerativos Generales / Pasantías c/ ART LRT
      state.r9 = true;
    }

    for (let i = 1; i <= 10; i++) {
      const el = document.getElementById(`subsys-r${i}`);
      if (el) el.checked = Boolean(state[`r${i}`]);
    }
  }

  handleArcaCodeChange(arcaSelect) {
    if (!arcaSelect) return;
    const formId = document.getElementById('concept-form-id')?.value;
    const newCode = arcaSelect.value;
    const prevCode = arcaSelect.dataset.prevValue;

    if (formId && prevCode !== undefined && prevCode !== newCode) {
      const confirmReassign = window.confirm(
        `Ha modificado el código ARCA a [${newCode || 'Sin código'}].\n\n¿Desea reasignar las bases remunerativas (R1 a R10) de acuerdo al nuevo código ARCA seleccionado?`
      );
      if (confirmReassign) {
        this.applyArcaSubsystemsSuggestion(newCode);
      }
    } else {
      this.applyArcaSubsystemsSuggestion(newCode);
    }
    arcaSelect.dataset.prevValue = newCode;
  }

  updateFormulaAccumulatorsFilter() {
    const group = document.getElementById('formula-group-accumulators');
    if (!group) return;

    const type = document.getElementById('concept-input-type')?.value || 'REMUNERATIVE';
    const numPart = parseInt(document.getElementById('concept-input-number')?.value?.replace(/\D/g, ''), 10) || 0;

    let options = [];
    if (type === 'REMUNERATIVE') {
      options = [];
    } else if (type === 'NON_REMUNERATIVE') {
      options = [
        { value: 'TOTAL_REMUNERATIVO', label: '[TOTAL_REMUNERATIVO] Total Remunerativo' }
      ];
    } else if (type === 'DEDUCTION') {
      options = [
        { value: 'TOTAL_REMUNERATIVO', label: '[TOTAL_REMUNERATIVO] Total Remunerativo' },
        { value: 'TOTAL_NO_REMUNERATIVO', label: '[TOTAL_NO_REMUNERATIVO] Total No Remunerativo' },
        { value: 'TOTAL_BRUTO', label: '[TOTAL_BRUTO] Sueldo Bruto (Rem + No Rem)' }
      ];
    } else if (type === 'AUXILIARY') {
      if (numPart <= 3999) {
        options = [];
      } else if (numPart <= 5999) {
        options = [
          { value: 'TOTAL_REMUNERATIVO', label: '[TOTAL_REMUNERATIVO] Total Remunerativo' }
        ];
      } else {
        options = [
          { value: 'TOTAL_REMUNERATIVO', label: '[TOTAL_REMUNERATIVO] Total Remunerativo' },
          { value: 'TOTAL_NO_REMUNERATIVO', label: '[TOTAL_NO_REMUNERATIVO] Total No Remunerativo' },
          { value: 'TOTAL_BRUTO', label: '[TOTAL_BRUTO] Sueldo Bruto (Rem + No Rem)' }
        ];
      }
    }

    if (options.length === 0) {
      group.innerHTML = '';
      group.style.display = 'none';
    } else {
      group.style.display = '';
      group.innerHTML = options
        .map(o => `<option value="${o.value}">${o.label}</option>`)
        .join('');
    }
  }

  updateFormulaNoveltiesFilter() {
    const group = document.getElementById('formula-group-novelties');
    if (!group) return;

    const noveltyType = document.getElementById('concept-input-novelty-type')?.value || 'CANTIDAD';
    const noveltyMap = {
      CANTIDAD: '<option value="CANTIDAD">[CANTIDAD] Novedad: Cantidad / Unidades</option>',
      HORAS: '<option value="HORAS">[HORAS] Novedad: Horas (formato decimal o HH:MM)</option>',
      PORCENTAJE: '<option value="PORCENTAJE">[PORCENTAJE] Novedad: Porcentaje (dividido 100)</option>',
      IMPORTE: '<option value="IMPORTE">[IMPORTE] Novedad: Importe / Monto ($)</option>',
    };

    let html = '';
    if (noveltyMap[noveltyType]) {
      html += noveltyMap[noveltyType];
    }
    html += '<option value="VALOR_BASE">[VALOR_BASE] Valor Base / Defecto del Concepto</option>';

    group.innerHTML = html;
    group.style.display = '';
  }

  async openNewConceptModal() {
    await this.fetchAllPayrollConcepts(true);

    const form = document.getElementById('form-payroll-concept');
    form?.reset();
    document.getElementById('concept-form-id').value = '';
    document.getElementById('modal-concept-form-title').textContent = 'Nuevo Concepto de Liquidación';
    document.getElementById('concept-form-alert')?.classList.add('d-none');
    document.getElementById('formula-live-status')?.classList.add('d-none');

    const periodTypeSelect = document.getElementById('concept-input-period-type');
    if (periodTypeSelect) {
      periodTypeSelect.value = 'MONTHLY';
      periodTypeSelect.disabled = false;
    }

    const numberInput = document.getElementById('concept-input-number');
    if (numberInput) {
      numberInput.value = '';
      numberInput.readOnly = false;
      numberInput.classList.remove('bg-light');
    }

    const codeInput = document.getElementById('concept-input-code');
    if (codeInput) {
      codeInput.value = '';
    }
    const badge = document.getElementById('concept-prefix-badge');
    if (badge) badge.textContent = 'SU';

    document.getElementById('concept-input-type').value = 'REMUNERATIVE';
    const arcaSelect = document.getElementById('concept-input-arca-code');
    if (arcaSelect) {
      arcaSelect.value = '110000';
      arcaSelect.dataset.prevValue = '110000';
    }
    const scopeSelect = document.getElementById('concept-input-scope');
    if (scopeSelect) scopeSelect.value = 'GENERAL';
    document.getElementById('concept-input-calc-type').value = 'FORMULA';
    const noveltySelect = document.getElementById('concept-input-novelty-type');
    if (noveltySelect) noveltySelect.value = 'CANTIDAD';
    const qtySourceSelect = document.getElementById('concept-input-quantity-source');
    if (qtySourceSelect) qtySourceSelect.value = 'AUTO';
    const qtyFormulaBox = document.getElementById('concept-quantity-formula-box');
    if (qtyFormulaBox) qtyFormulaBox.classList.add('d-none');
    const qtyFormulaInput = document.getElementById('concept-input-quantity-formula');
    if (qtyFormulaInput) qtyFormulaInput.value = '';
    const persistentSelect = document.getElementById('concept-input-is-persistent');
    if (persistentSelect) persistentSelect.value = 'true';
    document.getElementById('concept-formula-box')?.classList.remove('d-none');
    document.getElementById('concept-matrix-box')?.classList.add('d-none');

    this.applyArcaSubsystemsSuggestion('110000');
    this.updateFormulaAccumulatorsFilter();
    this.updateFormulaNoveltiesFilter();

    this.populateConceptModalMatrixOptions();
    await this.populateFormulaConceptOptions('', 'MONTHLY');
    this.populateFormulaFixedValuesSelect();
    this.populateFormulaSalaryScalesSelect();
    const matrixSelect = document.getElementById('concept-select-matrix');
    if (matrixSelect) matrixSelect.value = '';
    const infoAlert = document.getElementById('concept-matrix-info');
    if (infoAlert) infoAlert.classList.add('d-none');

    getBootstrapModal(document.getElementById('modal-concept-form'))?.show();
  }

  async openEditConceptModal(c) {
    await this.fetchAllPayrollConcepts(true);
    const freshC = (this.allPayrollConcepts || []).find((x) => x.id === c.id) || c;
    c = freshC;

    document.getElementById('concept-form-id').value = c.id;
    document.getElementById('modal-concept-form-title').textContent = `Editar Concepto: [${c.code}] ${c.name}`;
    document.getElementById('concept-form-alert')?.classList.add('d-none');
    document.getElementById('formula-live-status')?.classList.add('d-none');

    // Extraer prefijo y número de 4 dígitos
    let prefix = 'SU';
    let numPart = '';
    const codeMatch = String(c.code).match(/^([A-Z]{2})([0-9]{4})$/);
    if (codeMatch) {
      prefix = codeMatch[1];
      numPart = codeMatch[2];
    } else {
      prefix = this.getPrefixForPeriodType(c.periodType);
      numPart = String(c.code).replace(/\D/g, '').padStart(4, '0').slice(-4);
    }

    const editPeriodTypeSelect = document.getElementById('concept-input-period-type');
    if (editPeriodTypeSelect) {
      editPeriodTypeSelect.value = c.periodType || 'MONTHLY';
      editPeriodTypeSelect.disabled = true;
    }

    const badge = document.getElementById('concept-prefix-badge');
    if (badge) badge.textContent = prefix;

    const numberInput = document.getElementById('concept-input-number');
    if (numberInput) {
      numberInput.value = numPart;
      numberInput.readOnly = true;
      numberInput.classList.add('bg-light');
    }

    const codeInput = document.getElementById('concept-input-code');
    if (codeInput) {
      codeInput.value = c.code;
    }

    document.getElementById('concept-input-name').value = c.name;
    document.getElementById('concept-input-type').value = c.type;
    const scopeSelect = document.getElementById('concept-input-scope');
    if (scopeSelect) scopeSelect.value = c.scope || 'GENERAL';
    document.getElementById('concept-input-calc-type').value = c.calculationType || 'FIXED';
    const noveltySelect = document.getElementById('concept-input-novelty-type');
    if (noveltySelect) noveltySelect.value = c.noveltyDataType || 'CANTIDAD';

    const qtySourceSelect = document.getElementById('concept-input-quantity-source');
    const qtyFormulaBox = document.getElementById('concept-quantity-formula-box');
    const qtyFormulaInput = document.getElementById('concept-input-quantity-formula');
    const rawQS = String(c.quantitySource || 'AUTO').trim();
    if (rawQS.startsWith('FORMULA:') || (rawQS !== 'AUTO' && !['ANTIGUEDAD_ANOS', 'ANTIGUEDAD_MESES', 'DIAS_TRABAJADOS', 'HORAS_TRABAJADAS', 'DIAS_LICENCIA'].includes(rawQS))) {
      if (qtySourceSelect) qtySourceSelect.value = 'FORMULA';
      if (qtyFormulaBox) qtyFormulaBox.classList.remove('d-none');
      if (qtyFormulaInput) qtyFormulaInput.value = rawQS.replace(/^FORMULA:\s*/i, '');
    } else {
      if (qtySourceSelect) qtySourceSelect.value = rawQS;
      if (qtyFormulaBox) qtyFormulaBox.classList.add('d-none');
      if (qtyFormulaInput) qtyFormulaInput.value = '';
    }

    const editPersistentSelect = document.getElementById('concept-input-is-persistent');
    if (editPersistentSelect) {
      editPersistentSelect.value = (c.isPersistent === false || c.isPersistent === 0) ? 'false' : 'true';
    }
    document.getElementById('concept-input-default-value').value = c.defaultValue || '0.00';
    const arcaSelect = document.getElementById('concept-input-arca-code');
    if (arcaSelect) {
      const codeVal = c.arcaConceptCode ? String(c.arcaConceptCode).trim() : '';
      if (codeVal && !Array.from(arcaSelect.options).some(o => o.value === codeVal)) {
        const customOpt = document.createElement('option');
        customOpt.value = codeVal;
        customOpt.textContent = `[${codeVal}] Código ARCA Personalizado / Existente`;
        arcaSelect.appendChild(customOpt);
      }
      arcaSelect.value = codeVal;
      arcaSelect.dataset.prevValue = codeVal;
    }
    document.getElementById('concept-input-formula').value = c.formula || '';
    document.getElementById('concept-input-matrix').value = c.matrixData || '';

    // Subsystem checks (R1..R10)
    const r1 = document.getElementById('subsys-r1'); if (r1) r1.checked = Boolean(c.appliesSipaAporte);
    const r2 = document.getElementById('subsys-r2'); if (r2) r2.checked = Boolean(c.appliesSipaContrib);
    const r3 = document.getElementById('subsys-r3'); if (r3) r3.checked = Boolean(c.appliesAaffContrib || c.appliesFneContrib || c.appliesRenatreAporte || c.appliesRenatreContrib);
    const r4 = document.getElementById('subsys-r4'); if (r4) r4.checked = Boolean(c.appliesOsAporte || c.appliesFsrAporte);
    const r5 = document.getElementById('subsys-r5'); if (r5) r5.checked = Boolean(c.appliesInssjypAporte || c.appliesInssjypContrib);
    const r6 = document.getElementById('subsys-r6'); if (r6) r6.checked = Boolean(c.appliesRegDifAporte);
    const r7 = document.getElementById('subsys-r7'); if (r7) r7.checked = Boolean(c.appliesRegEspAporte);
    const r8 = document.getElementById('subsys-r8'); if (r8) r8.checked = Boolean(c.appliesOsContrib || c.appliesFsrContrib);
    const r9 = document.getElementById('subsys-r9'); if (r9) r9.checked = Boolean(c.appliesLrtContrib);
    const r10 = document.getElementById('subsys-r10'); if (r10) r10.checked = Boolean(c.appliesDetraccion);

    this.updateFormulaAccumulatorsFilter();
    this.updateFormulaNoveltiesFilter();

    // Toggle formula vs matrix boxes
    const formulaBox = document.getElementById('concept-formula-box');
    const matrixBox = document.getElementById('concept-matrix-box');
    if (c.calculationType === 'FORMULA') {
      formulaBox?.classList.remove('d-none');
      matrixBox?.classList.add('d-none');
    } else if (c.calculationType === 'MATRIX') {
      formulaBox?.classList.add('d-none');
      matrixBox?.classList.remove('d-none');
    } else {
      formulaBox?.classList.add('d-none');
      matrixBox?.classList.add('d-none');
    }

    this.populateConceptModalMatrixOptions();
    await this.populateFormulaConceptOptions(c.code, c.periodType);
    this.populateFormulaFixedValuesSelect();
    this.populateFormulaSalaryScalesSelect();
    const matrixSelect = document.getElementById('concept-select-matrix');
    if (matrixSelect) {
      matrixSelect.value = c.matrixId || '';
      this.updateConceptMatrixInfoBanner();
    }

    if (c.formula && c.calculationType === 'FORMULA') {
      this.validateFormulaInDesigner();
    }

    getBootstrapModal(document.getElementById('modal-concept-form'))?.show();
  }

  async savePayrollConcept() {
    const submitBtn = document.getElementById('btn-save-concept');
    const alertBox = document.getElementById('concept-form-alert');
    if (alertBox) alertBox.classList.add('d-none');

    const id = document.getElementById('concept-form-id').value;
    const calcType = document.getElementById('concept-input-calc-type').value;
    const matrixIdVal = document.getElementById('concept-select-matrix')?.value;
    const matrixId = calcType === 'MATRIX' && matrixIdVal ? matrixIdVal : null;

    this.updateConceptNormalizedCode(true);
    const codeVal = document.getElementById('concept-input-code').value.trim();

    if (!codeVal || !/^[A-Z]{2}[0-9]{4}$/.test(codeVal)) {
      if (alertBox) {
        alertBox.textContent = 'El código de concepto debe tener 2 letras de prefijo y 4 dígitos (Ej. SU1000, SU6001). Ingrese un número de concepto válido.';
        alertBox.classList.remove('d-none');
      }
      return;
    }

    const numericPart = parseInt(codeVal.slice(2), 10) || 1000;

    const rawQtySource = document.getElementById('concept-input-quantity-source')?.value || 'AUTO';
    let finalQtySource = rawQtySource;
    if (rawQtySource === 'FORMULA') {
      let formVal = document.getElementById('concept-input-quantity-formula')?.value?.trim() || '';
      formVal = formVal.replace(/^FORMULA:\s*/i, '').trim();
      finalQtySource = formVal ? `FORMULA:${formVal}` : 'AUTO';
    }

    const payload = {
      code: codeVal,
      name: document.getElementById('concept-input-name').value.trim(),
      type: document.getElementById('concept-input-type').value,
      scope: document.getElementById('concept-input-scope')?.value || 'GENERAL',
      calculationType: calcType,
      calculationOrder: numericPart,
      noveltyDataType: document.getElementById('concept-input-novelty-type')?.value || 'CANTIDAD',
      quantitySource: finalQtySource,
      periodType: document.getElementById('concept-input-period-type')?.value || 'MONTHLY',
      isPersistent: document.getElementById('concept-input-is-persistent')?.value === 'true',
      defaultValue: Number(document.getElementById('concept-input-default-value').value) || 0,
      formula: calcType === 'FORMULA' ? document.getElementById('concept-input-formula').value.trim() : null,
      matrixData: calcType === 'MATRIX' ? document.getElementById('concept-input-matrix').value.trim() : null,
      matrixId: matrixId,
      arcaConceptCode: document.getElementById('concept-input-arca-code').value.trim() || null,
      appliesSipaAporte: document.getElementById('subsys-r1')?.checked || false,
      appliesSipaContrib: document.getElementById('subsys-r2')?.checked || false,
      appliesInssjypAporte: document.getElementById('subsys-r5')?.checked || false,
      appliesInssjypContrib: document.getElementById('subsys-r5')?.checked || false,
      appliesOsAporte: document.getElementById('subsys-r4')?.checked || false,
      appliesOsContrib: document.getElementById('subsys-r8')?.checked || false,
      appliesFsrAporte: document.getElementById('subsys-r4')?.checked || false,
      appliesFsrContrib: document.getElementById('subsys-r8')?.checked || false,
      appliesRenatreAporte: document.getElementById('subsys-r3')?.checked || false,
      appliesRenatreContrib: document.getElementById('subsys-r3')?.checked || false,
      appliesAaffContrib: document.getElementById('subsys-r3')?.checked || false,
      appliesFneContrib: document.getElementById('subsys-r3')?.checked || false,
      appliesLrtContrib: document.getElementById('subsys-r9')?.checked || false,
      appliesRegDifAporte: document.getElementById('subsys-r6')?.checked || false,
      appliesRegEspAporte: document.getElementById('subsys-r7')?.checked || false,
      appliesDetraccion: document.getElementById('subsys-r10')?.checked || false,
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';

    try {
      if (id) {
        await apiRequest(`/payroll/concepts/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('Concepto actualizado correctamente');
      } else {
        await apiRequest('/payroll/concepts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Concepto creado exitosamente');
      }

      getBootstrapModal(document.getElementById('modal-concept-form'))?.hide();
      await Promise.all([
        this.loadPayrollConcepts(),
        this.fetchAllPayrollConcepts(true),
      ]);
    } catch (err) {
      if (alertBox) {
        let msg = err.message || 'Error al guardar el concepto';
        if (err.details && Array.isArray(err.details) && err.details.length > 0) {
          const detailMessages = err.details
            .map((d) => `• ${d.field ? `<strong>${escapeHtml(d.field)}:</strong> ` : ''}${escapeHtml(d.message)}`)
            .join('<br>');
          msg = `<div class="fw-bold mb-1">${escapeHtml(err.message)}:</div>${detailMessages}`;
          alertBox.innerHTML = msg;
        } else {
          alertBox.textContent = msg;
        }
        alertBox.classList.remove('d-none');
      }
      showToast(err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="ti ti-device-floppy me-1"></i> Guardar Concepto';
    }
  }

  setupFormulaDesigner() {
    const btnInsertConcept = document.getElementById('btn-insert-concept-token');
    const btnInsertMetric = document.getElementById('btn-insert-metric-token');
    const conceptSelect = document.getElementById('formula-select-concept');
    const metricSelect = document.getElementById('formula-select-concept-metric');
    const formulaInput = document.getElementById('concept-input-formula');
    const tokenContainer = document.getElementById('formula-token-buttons');

    const insertTextAtCursor = (text) => {
      if (!formulaInput) return;
      const start = formulaInput.selectionStart || formulaInput.value.length;
      const end = formulaInput.selectionEnd || formulaInput.value.length;
      const current = formulaInput.value;
      formulaInput.value = current.substring(0, start) + text + current.substring(end);
      formulaInput.focus();
      const newPos = start + text.length;
      formulaInput.setSelectionRange(newPos, newPos);
      this.validateFormulaInDesigner();
    };

    if (btnInsertConcept) {
      btnInsertConcept.addEventListener('click', () => {
        let target = conceptSelect?.value;
        const metric = metricSelect?.value || 'CURRENT';
        if (!target) return;
        const token = (metric === 'CURRENT') ? `[${target}]` : `[${metric}:${target}]`;
        insertTextAtCursor(token);
      });
    }

    if (btnInsertMetric) {
      btnInsertMetric.addEventListener('click', () => {
        const metric = metricSelect?.value || 'CURRENT';
        let target = conceptSelect?.value;
        if (!target) {
          target = 'TOTAL_REMUNERATIVO';
        }
        const token = (metric === 'CURRENT') ? `[${target}]` : `[${metric}:${target}]`;
        insertTextAtCursor(token);
      });
    }

    const btnInsertMatrix = document.getElementById('btn-insert-matrix-formula');
    if (btnInsertMatrix) {
      btnInsertMatrix.onclick = () => {
        const sel = document.getElementById('formula-select-matrix');
        if (sel?.value) insertTextAtCursor(`[MATRIZ:${sel.value}]`);
      };
    }

    const btnInsertFixed = document.getElementById('btn-insert-fixed-value-formula');
    if (btnInsertFixed) {
      btnInsertFixed.onclick = () => {
        const sel = document.getElementById('formula-select-fixed-value');
        if (sel?.value) insertTextAtCursor(`[VALOR:${sel.value}]`);
      };
    }

    const btnInsertScale = document.getElementById('btn-insert-salary-scale-formula');
    if (btnInsertScale) {
      btnInsertScale.onclick = () => {
        const sel = document.getElementById('formula-select-salary-scale');
        if (sel?.value) insertTextAtCursor(`[NOMINA:${sel.value}]`);
      };
    }

    if (tokenContainer) {
      tokenContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-token-formula');
        if (!btn) return;
        const token = btn.dataset.token;
        if (!token) return;
        insertTextAtCursor(token);
      });
    }

    let debounceTimer = null;
    if (formulaInput) {
      formulaInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => this.validateFormulaInDesigner(), 350);
      });
    }

    const codeInput = document.getElementById('concept-input-code');
    if (codeInput) {
      codeInput.addEventListener('input', (e) => {
        this.populateFormulaConceptOptions(e.target.value.trim());
      });
    }

    const periodTypeSelect = document.getElementById('concept-input-period-type');
    if (periodTypeSelect) {
      periodTypeSelect.addEventListener('change', (e) => {
        const curCode = document.getElementById('concept-input-code')?.value?.trim() || '';
        this.populateFormulaConceptOptions(curCode, e.target.value);
      });
    }
  }

  async validateFormulaInDesigner() {
    const formulaInput = document.getElementById('concept-input-formula');
    const statusBox = document.getElementById('formula-live-status');
    const statusContent = document.getElementById('formula-live-status-content');
    const codeInput = document.getElementById('concept-input-code');
    const typeInput = document.getElementById('concept-input-type');

    if (!formulaInput || !statusBox || !statusContent) return;

    const formula = formulaInput.value.trim();
    if (!formula) {
      statusBox.classList.add('d-none');
      return;
    }

    statusBox.classList.remove('d-none');
    statusContent.innerHTML = '<div class="spinner-border spinner-border-sm text-purple me-1" role="status"></div><span>Validando fórmula y dependencias...</span>';

    try {
      const res = await apiRequest('/payroll/concepts/validate-formula', {
        method: 'POST',
        body: JSON.stringify({
          formula,
          conceptCode: codeInput?.value?.trim() || '',
          type: typeInput?.value || '',
          calculationOrder: parseInt(codeInput?.value?.replace(/\D/g, ''), 10) || 100,
        }),
      });

      const val = res.data;
      if (val.isValid) {
        statusContent.innerHTML = `
          <i class="ti ti-check fs-2 text-success"></i>
          <div>
            <span class="text-success fw-semibold">Fórmula válida.</span>
            <span class="text-muted ms-1 small">Secuencia de ejecución y sintaxis correctas. Tokens: ${val.parsedTokens?.length || 0}.</span>
          </div>
        `;
      } else {
        statusContent.innerHTML = `
          <i class="ti ti-alert-circle fs-2 text-danger"></i>
          <div>
            <span class="text-danger fw-semibold">Error de validación:</span>
            <span class="text-danger ms-1 small">${escapeHtml(val.errors?.join('; ') || val.error || 'Sintaxis no admitida')}</span>
          </div>
        `;
      }
    } catch (err) {
      statusContent.innerHTML = `
        <i class="ti ti-alert-triangle fs-2 text-warning"></i>
        <span class="text-muted small">No se pudo verificar: ${escapeHtml(err.message)}</span>
      `;
    }
  }

  async populateFormulaConceptOptions(currentCode = '', periodType = '') {
    const group = document.getElementById('formula-concept-options-group');
    if (!group) return;

    let list = this.allPayrollConcepts;
    if (!list || list.length === 0) {
      list = await this.fetchAllPayrollConcepts();
    }
    if (!list || list.length === 0) {
      list = this.payrollConcepts || [];
    }

    const pType = periodType || document.getElementById('concept-input-period-type')?.value || 'MONTHLY';
    const targetPrefix = this.getPrefixForPeriodType(pType);

    const available = (list || [])
      .filter((c) => {
        if (c.code === currentCode) return false;
        if (c.isActive === false || c.deletedAt) return false;

        const cType = c.periodType || 'MONTHLY';
        if (cType === pType) return true;
        if (c.code && c.code.startsWith(targetPrefix)) return true;
        if (pType === 'QUINCE' && (cType === 'QUINCE_1' || cType === 'QUINCE_2' || cType === 'QUINCE')) return true;
        if (pType === 'SAC' && (cType === 'SAC_1' || cType === 'SAC_2' || cType === 'SAC')) return true;
        return false;
      })
      .sort((a, b) => {
        const numA = parseInt(String(a.code).replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(String(b.code).replace(/\D/g, ''), 10) || 0;
        return numA - numB || String(a.code).localeCompare(String(b.code));
      });

    if (available.length === 0) {
      group.innerHTML = `<option value="" disabled>No hay otros conceptos para ${escapeHtml(pType)} (${escapeHtml(targetPrefix)})</option>`;
      return;
    }

    group.innerHTML = available
      .map((c) => {
        const typeLabel = c.type === 'AUXILIARY' ? ' [AUX]' : (c.type === 'DEDUCTION' ? ' [RET]' : (c.type === 'NON_REMUNERATIVE' ? ' [NO REM]' : ''));
        return `<option value="${escapeHtml(c.code)}">[${escapeHtml(c.code)}] ${escapeHtml(c.name)}${typeLabel}</option>`;
      })
      .join('');
  }

  confirmDeleteConcept(id, name) {
    this.confirmDeleteAction({
      title: 'Eliminar Concepto',
      message: `¿Estás seguro de que deseas eliminar el concepto <strong>"${escapeHtml(name)}"</strong>?`,
      onConfirm: async () => {
        await apiRequest(`/payroll/concepts/${id}`, { method: 'DELETE' });
        showToast('Concepto eliminado correctamente');
        await Promise.all([
          this.loadPayrollConcepts(),
          this.fetchAllPayrollConcepts(true),
        ]);
      },
    });
  }

  // --- Matrices de Liquidación (Lookup Matrices) ---

  async loadPayrollMatrices() {
    const spinner = document.getElementById('matrices-spinner');
    if (spinner) spinner.classList.remove('d-none');

    const searchInput = document.getElementById('matrices-search-input');
    const typeFilter = document.getElementById('matrices-type-filter');

    const query = new URLSearchParams({
      page: String(this.payrollMatricesPage),
      limit: String(this.payrollMatricesPageSize),
    });
    if (searchInput?.value?.trim()) query.append('search', searchInput.value.trim());
    if (typeFilter?.value && typeFilter.value !== 'ALL') query.append('matchType', typeFilter.value);

    try {
      const res = await apiRequest(`/payroll/matrices?${query.toString()}`);
      this.payrollMatrices = res.data || [];
      const badge = document.getElementById('payroll-badge-matrices-count');
      if (badge) badge.textContent = res.meta?.total || this.payrollMatrices.length;

      this.renderPayrollMatricesTable(this.payrollMatrices);
      this.renderPayrollMatricesPagination(res.meta || { total: this.payrollMatrices.length, page: 1, totalPages: 1 });
      this.populateConceptModalMatrixOptions();
    } catch (err) {
      showToast(err.message || 'Error al cargar matrices de liquidación', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

}

export function registerConceptsMethods(proto) {
  const descriptors = Object.getOwnPropertyDescriptors(ConceptsMethods.prototype);
  delete descriptors.constructor;
  Object.defineProperties(proto, descriptors);
}
