import { apiRequest, showToast } from '../../api.js?v=2.1';
import {
  formatCuit,
  formatNumber,
  escapeHtml,
  getBootstrapModal,
  getConceptInputType,
  updateSearchableSelect,
  decimalToHours,
} from '../../utils/helpers.js';
import {
  parseClipboardGrid,
  parseClipboardCellValue,
  formatCellValueForInput,
  matchClipboardRowsByEmployeeKey,
  isOvertimeHoursConcept,
  isSensitiveDeductionOrAdvance,
  parseMultiConceptExcelMatrix,
  isConceptCompatibleWithPeriodType,
} from '../../utils/clipboardMatrixParser.js?v=payroll-5.3';

function makeCellKey(empId, conceptId) {
  return `${empId}::${conceptId}`;
}

function getConceptTypeShortBadge(type) {
  if (type === 'REMUNERATIVE') return '<span class="badge bg-blue-lt">Rem.</span>';
  if (type === 'NON_REMUNERATIVE') return '<span class="badge bg-azure-lt">No Rem.</span>';
  return '<span class="badge bg-red-lt">Ded.</span>';
}

function getInputTypeUnitLabel(inputType) {
  if (inputType === 'HOURS') return 'hs';
  if (inputType === 'AMOUNT') return '$';
  if (inputType === 'PERCENTAGE') return '%';
  if (inputType === 'NONE') return 'Asig.';
  return 'Cant.';
}

function formatColumnTotal(sum, count, inputType) {
  if (inputType === 'NONE') {
    return `${count} asig.`;
  }
  const rounded = Math.round((sum || 0) * 100) / 100;
  if (inputType === 'HOURS') {
    return `${formatNumber(rounded)} hs (${decimalToHours(rounded)})`;
  }
  if (inputType === 'AMOUNT') {
    return `$ ${formatNumber(rounded)}`;
  }
  if (inputType === 'PERCENTAGE') {
    const avg = count > 0 ? Math.round((rounded / count) * 100) / 100 : 0;
    return `${count} reg. (prom. ${formatNumber(avg)}%)`;
  }
  return formatNumber(rounded);
}

class MatrixMixinMethods {
  ensureNovMatrixState() {
    if (!this.novMatrixState) {
      this.novMatrixState = {
        periodId: '',
        period: null,
        isClosed: false,
        employees: [],
        compatibleConcepts: [],
        conceptMap: new Map(),
        selectedConceptIds: [],
        initialMap: new Map(),
        draftMap: new Map(),
        carriedKeys: new Set(),
        carriedEmpIds: new Set(),
        formulaWarningKeys: new Set(),
        undoStack: [],
        searchTerm: '',
        deptFilter: '',
        viewFilter: 'ALL',
        carryoverContext: null,
        hasClonedSensitiveDeduction: false,
        activeNoteKey: null,
      };
    }
    return this.novMatrixState;
  }

  getNormalizedInitialForPair(state, empId, concept) {
    const init = state.initialMap.get(makeCellKey(empId, concept.id));
    if (!init) return null;
    const isAmt = getConceptInputType(concept) === 'AMOUNT';
    const rawNum = isAmt ? init.amount : init.units;
    const val = rawNum !== null && rawNum !== undefined && rawNum !== '' ? Math.round(Number(rawNum) * 100) / 100 : 0;
    const notes = init.notes ? String(init.notes).trim() : '';
    return {
      value: val > 0 ? val : 0,
      units: isAmt ? 1 : (val > 0 ? val : 0),
      amount: isAmt ? (val > 0 ? val : 0) : null,
      notes,
    };
  }

  getMatrixCellClassification(empId, concept) {
    const state = this.ensureNovMatrixState();
    const key = makeCellKey(empId, concept.id);
    const inputType = getConceptInputType(concept);
    const isAmt = inputType === 'AMOUNT';

    const initNorm = this.getNormalizedInitialForPair(state, empId, concept);
    const draft = state.draftMap.get(key);

    if (!draft) {
      if (!initNorm) {
        return { status: 'EMPTY', value: null, notes: '', rawText: '', payloadItem: null, invalid: false, error: null };
      }
      const val = initNorm.value > 0 ? initNorm.value : null;
      return {
        status: 'CLEAN',
        value: val,
        notes: initNorm.notes,
        rawText: val !== null ? formatCellValueForInput(val, inputType) : '',
        payloadItem: null,
        invalid: false,
        error: null,
      };
    }

    if (draft.invalid) {
      return {
        status: 'INVALID',
        value: null,
        notes: draft.notes || '',
        rawText: draft.rawText || '',
        payloadItem: null,
        invalid: true,
        error: draft.error || 'Valor inválido',
      };
    }

    const draftVal = !draft.empty && draft.value !== null && draft.value !== undefined && Number(draft.value) > 0
      ? Math.round(Number(draft.value) * 100) / 100
      : 0;
    const draftNotes = draft.notes ? String(draft.notes).trim() : '';
    const hasDraftContent = draftVal > 0 || draftNotes !== '';

    if (!hasDraftContent) {
      if (initNorm) {
        return {
          status: 'REMOVAL',
          value: null,
          notes: '',
          rawText: draft.rawText !== undefined ? draft.rawText : '',
          payloadItem: null,
          invalid: false,
          error: null,
        };
      }
      return {
        status: 'EMPTY',
        value: null,
        notes: '',
        rawText: '',
        payloadItem: null,
        invalid: false,
        error: null,
      };
    }

    const payloadItem = {
      employeeId: empId,
      conceptId: concept.id,
      units: isAmt ? 1 : draftVal,
      amount: isAmt ? draftVal : null,
      notes: draftNotes || null,
    };

    if (!initNorm) {
      return {
        status: 'NEW_DIRTY',
        value: draftVal > 0 ? draftVal : null,
        notes: draftNotes,
        rawText: draft.rawText !== undefined ? draft.rawText : (draftVal > 0 ? formatCellValueForInput(draftVal, inputType) : ''),
        payloadItem,
        invalid: false,
        error: null,
      };
    }

    const sameVal = Math.abs((initNorm.value || 0) - draftVal) < 0.001;
    const sameNotes = (initNorm.notes || '') === draftNotes;

    if (sameVal && sameNotes) {
      return {
        status: 'CLEAN',
        value: draftVal > 0 ? draftVal : null,
        notes: draftNotes,
        rawText: draft.rawText !== undefined ? draft.rawText : (draftVal > 0 ? formatCellValueForInput(draftVal, inputType) : ''),
        payloadItem: null,
        invalid: false,
        error: null,
      };
    }

    return {
      status: 'MODIFIED_DIRTY',
      value: draftVal > 0 ? draftVal : null,
      notes: draftNotes,
      rawText: draft.rawText !== undefined ? draft.rawText : (draftVal > 0 ? formatCellValueForInput(draftVal, inputType) : ''),
      payloadItem,
      invalid: false,
      error: null,
    };
  }

  getMatrixDeltas() {
    const state = this.ensureNovMatrixState();
    const items = [];
    const removals = [];
    const invalidCells = [];
    const overtimeWarnings = [];

    for (const emp of state.employees) {
      for (const cid of state.selectedConceptIds) {
        const concept = state.conceptMap.get(cid);
        if (!concept) continue;
        const cls = this.getMatrixCellClassification(emp.id, concept);
        if (cls.status === 'INVALID') {
          invalidCells.push({ empId: emp.id, conceptId: cid, error: cls.error });
        } else if (cls.status === 'REMOVAL') {
          removals.push({ employeeId: emp.id, conceptId: cid });
        } else if ((cls.status === 'NEW_DIRTY' || cls.status === 'MODIFIED_DIRTY') && cls.payloadItem) {
          items.push(cls.payloadItem);
        }

        if (!cls.invalid && cls.value !== null && cls.value > 30 && isOvertimeHoursConcept(concept)) {
          overtimeWarnings.push({
            empId: emp.id,
            conceptId: cid,
            hours: cls.value,
          });
        }
      }
    }

    return { items, removals, invalidCells, overtimeWarnings };
  }

  hasUnsavedMatrixChanges() {
    const state = this.ensureNovMatrixState();
    if (!state.periodId || state.isClosed || state.selectedConceptIds.length === 0) return false;
    const { items, removals, invalidCells } = this.getMatrixDeltas();
    return items.length > 0 || removals.length > 0 || invalidCells.length > 0;
  }

  pushMatrixUndoSnapshot() {
    const state = this.ensureNovMatrixState();
    const draftClone = new Map();
    for (const [k, v] of state.draftMap.entries()) {
      draftClone.set(k, { ...v });
    }
    state.undoStack.push({
      draftMap: draftClone,
      carriedKeys: new Set(state.carriedKeys),
      carriedEmpIds: new Set(state.carriedEmpIds),
      formulaWarningKeys: new Set(state.formulaWarningKeys),
      selectedConceptIds: [...state.selectedConceptIds],
      hasClonedSensitiveDeduction: state.hasClonedSensitiveDeduction,
      carryoverContext: state.carryoverContext ? { ...state.carryoverContext } : null,
    });
    if (state.undoStack.length > 10) {
      state.undoStack.shift();
    }
    this.updateMatrixUndoButton();
  }

  undoLastMatrixAction() {
    const state = this.ensureNovMatrixState();
    if (!state.undoStack || state.undoStack.length === 0) return;
    const snap = state.undoStack.pop();
    state.draftMap = snap.draftMap;
    state.carriedKeys = snap.carriedKeys;
    state.carriedEmpIds = snap.carriedEmpIds;
    state.formulaWarningKeys = snap.formulaWarningKeys;
    state.hasClonedSensitiveDeduction = snap.hasClonedSensitiveDeduction;
    state.carryoverContext = snap.carryoverContext;
    if (Array.isArray(snap.selectedConceptIds)) {
      state.selectedConceptIds = snap.selectedConceptIds;
      this.refreshMatrixConceptPicker();
    }
    this.renderNovMatrix();
    showToast('Se revirtió el último cambio masivo en la grilla');
  }

  updateMatrixUndoButton() {
    const state = this.ensureNovMatrixState();
    const undoBtn = document.getElementById('btn-nov-matrix-undo');
    if (undoBtn) {
      undoBtn.disabled = state.isClosed || !state.undoStack || state.undoStack.length === 0;
    }
  }

  setupNoveltyMatrixHandlers() {
    if (this._novMatrixHandlersBound) return;
    this._novMatrixHandlersBound = true;

    const periodSelect = document.getElementById('nov-matrix-period-select');
    if (periodSelect) {
      periodSelect.addEventListener('change', async () => {
        const nextPeriodId = periodSelect.value;
        const state = this.ensureNovMatrixState();
        if (state.periodId && nextPeriodId !== state.periodId && this.hasUnsavedMatrixChanges()) {
          const ok = window.confirm('Tenés cambios sin guardar en la grilla multiconcepto. ¿Descartarlos y cambiar de liquidación?');
          if (!ok) {
            updateSearchableSelect(periodSelect, null, state.periodId);
            return;
          }
        }
        this.activePayrollPeriodId = nextPeriodId;
        await this.loadNovNoPersMatrix({ periodId: nextPeriodId, resetSelection: true });
      });
    }

    const conceptPicker = document.getElementById('nov-matrix-concept-picker');
    if (conceptPicker) {
      conceptPicker.addEventListener('change', async () => {
        const cid = conceptPicker.value;
        if (!cid) return;
        await this.addConceptColumnToMatrix(cid);
        if (conceptPicker.tomselect) {
          conceptPicker.tomselect.clear(true);
        } else {
          conceptPicker.value = '';
        }
      });
    }

    document.getElementById('btn-nov-matrix-load-current-concepts')?.addEventListener('click', () => this.loadActivePeriodMatrixColumns());
    document.getElementById('btn-nov-matrix-empty-load-current')?.addEventListener('click', () => this.loadActivePeriodMatrixColumns());

    const openCarryoverFn = () => {
      const state = this.ensureNovMatrixState();
      if (!state.periodId) {
        showToast('Seleccione una liquidación destino primero', 'warning');
        return;
      }
      this.openCarryoverModal({
        targetMode: 'MATRIX',
        periodId: state.periodId,
        conceptIds: [...state.selectedConceptIds],
      });
    };
    document.getElementById('btn-nov-matrix-open-carryover')?.addEventListener('click', openCarryoverFn);
    document.getElementById('btn-nov-matrix-empty-carryover')?.addEventListener('click', openCarryoverFn);

    const openMatrixExcelFn = (sourcePane = 'MATRIX') => {
      const targetPeriodId =
        sourcePane === 'CON'
          ? (document.getElementById('nov-nopers-con-period-select')?.value || this.activePayrollPeriodId)
          : (this.ensureNovMatrixState().periodId || document.getElementById('nov-matrix-period-select')?.value || this.activePayrollPeriodId);
      if (!targetPeriodId) {
        showToast('Seleccione una liquidación destino primero', 'warning');
        return;
      }
      this.openMatrixExcelImportModal({ periodId: targetPeriodId, sourcePane });
    };
    document.getElementById('btn-nov-matrix-import-excel')?.addEventListener('click', () => openMatrixExcelFn('MATRIX'));
    document.getElementById('btn-nov-matrix-empty-import-excel')?.addEventListener('click', () => openMatrixExcelFn('MATRIX'));
    document.getElementById('btn-nov-nopers-con-import-matrix-excel')?.addEventListener('click', () => openMatrixExcelFn('CON'));

    document.getElementById('btn-download-matrix-excel-template')?.addEventListener('click', () => this.downloadMatrixExcelTemplate());
    document.getElementById('nov-matrix-excel-file-input')?.addEventListener('change', (e) => this.handleMatrixExcelFileChange(e));
    document.getElementById('nov-matrix-excel-skip-errors')?.addEventListener('change', () => this.updateMatrixExcelActionButtons());
    document.getElementById('btn-load-matrix-excel-to-grid')?.addEventListener('click', () => this.loadMatrixExcelIntoDraftGrid());
    document.getElementById('btn-confirm-matrix-excel-import')?.addEventListener('click', () => this.confirmMatrixExcelDirectImport());

    document.getElementById('btn-nov-matrix-clear-cols')?.addEventListener('click', () => {
      const state = this.ensureNovMatrixState();
      if (state.selectedConceptIds.length === 0) return;
      state.selectedConceptIds = [];
      this.refreshMatrixConceptPicker();
      this.renderNovMatrix();
    });

    document.getElementById('btn-nov-matrix-dismiss-carryover-banner')?.addEventListener('click', () => {
      const state = this.ensureNovMatrixState();
      state.carryoverContext = null;
      document.getElementById('nov-matrix-carryover-banner')?.classList.add('d-none');
    });

    // Búsqueda con debounce (180ms)
    const searchInput = document.getElementById('nov-matrix-search');
    if (searchInput) {
      let debounceTimer = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const state = this.ensureNovMatrixState();
          state.searchTerm = searchInput.value.trim().toLowerCase();
          this.renderNovMatrixBody();
        }, 180);
      });
    }

    document.getElementById('nov-matrix-dept-filter')?.addEventListener('change', (e) => {
      const state = this.ensureNovMatrixState();
      state.deptFilter = e.target.value || '';
      this.renderNovMatrixBody();
    });

    document.getElementById('nov-matrix-view-filter')?.addEventListener('change', (e) => {
      const state = this.ensureNovMatrixState();
      state.viewFilter = e.target.value || 'ALL';
      this.renderNovMatrixBody();
    });

    document.getElementById('btn-nov-matrix-smart-paste')?.addEventListener('click', () => this.openSmartPasteModal());
    document.getElementById('btn-nov-matrix-undo')?.addEventListener('click', () => this.undoLastMatrixAction());
    document.getElementById('btn-nov-matrix-save')?.addEventListener('click', () => this.saveNovMatrixChanges());

    // Handlers del Modal de Arrastre (#modal-nov-carryover)
    document.getElementById('nov-carryover-source-period')?.addEventListener('change', (e) => {
      this.loadCarryoverPreview(e.target.value || null);
    });
    document.querySelectorAll('input[name="nov-carryover-mode"]').forEach((radio) => {
      radio.addEventListener('change', () => this.refreshCarryoverLegalWarning());
    });
    document.getElementById('nov-carryover-add-concepts')?.addEventListener('change', () => this.refreshCarryoverLegalWarning());
    document.getElementById('btn-apply-nov-carryover')?.addEventListener('click', () => this.applyCarryoverToTarget());

    // Handlers del Modal de Pegado Inteligente (#modal-nov-matrix-smart-paste)
    document.getElementById('nov-smart-paste-textarea')?.addEventListener('input', () => this.previewSmartPaste());
    document.getElementById('btn-apply-nov-smart-paste')?.addEventListener('click', () => this.applySmartPaste());

    // Handlers del Modal de Nota por Celda (#modal-matrix-cell-note)
    document.getElementById('btn-save-matrix-note')?.addEventListener('click', () => this.saveMatrixCellNote());
    document.getElementById('btn-clear-matrix-note')?.addEventListener('click', () => {
      const noteInput = document.getElementById('matrix-note-input');
      if (noteInput) noteInput.value = '';
      this.saveMatrixCellNote();
    });
  }

  async loadNovNoPersMatrix({ periodId = null, preselectConceptIds = null, resetSelection = false } = {}) {
    if (this._skipNextMatrixLoad) {
      this._skipNextMatrixLoad = false;
      return;
    }
    const state = this.ensureNovMatrixState();
    const periodSelect = document.getElementById('nov-matrix-period-select');
    const resolvedPeriodId =
      periodId ||
      this._pendingMatrixPeriodId ||
      periodSelect?.value ||
      this.activePayrollPeriodId ||
      this.payrollPeriods?.[0]?.id ||
      '';
    this._pendingMatrixPeriodId = null;

    if (!resolvedPeriodId) {
      state.periodId = '';
      state.period = null;
      this.renderNovMatrix();
      return;
    }

    const pendingPreselect = preselectConceptIds || this._pendingMatrixPreselectConceptIds || null;
    this._pendingMatrixPreselectConceptIds = null;

    const isPeriodSwitch = state.periodId !== resolvedPeriodId || resetSelection;
    if (isPeriodSwitch) {
      state.periodId = resolvedPeriodId;
      state.selectedConceptIds = [];
      state.initialMap.clear();
      state.draftMap.clear();
      state.carriedKeys.clear();
      state.carriedEmpIds.clear();
      state.formulaWarningKeys.clear();
      state.undoStack = [];
      state.carryoverContext = null;
      state.hasClonedSensitiveDeduction = false;
      state.viewFilter = 'ALL';
      const vf = document.getElementById('nov-matrix-view-filter');
      if (vf) vf.value = 'ALL';
    }

    const periodObj = (this.payrollPeriods || []).find((p) => p.id === resolvedPeriodId) || null;
    state.period = periodObj;
    state.isClosed = periodObj ? periodObj.status === 'CLOSED' : false;

    const spinner = document.getElementById('nov-matrix-spinner');
    if (spinner) spinner.classList.remove('d-none');

    try {
      const [employees, compatibleConcepts] = await Promise.all([
        this.fetchActiveEmployees(),
        this.fetchIndividualConcepts(false, periodObj?.periodType || 'MONTHLY'),
      ]);

      state.employees = [...employees].sort((a, b) =>
        String(a.lastName || '').localeCompare(String(b.lastName || ''), 'es') ||
        String(a.fileNumber || '').localeCompare(String(b.fileNumber || ''), 'es', { numeric: true })
      );
      state.compatibleConcepts = compatibleConcepts;
      state.conceptMap = new Map(compatibleConcepts.map((c) => [c.id, c]));

      this.populateMatrixDepartmentFilter();

      if (Array.isArray(pendingPreselect) && pendingPreselect.length > 0) {
        const toAdd = pendingPreselect.filter((id) => state.conceptMap.has(id) && !state.selectedConceptIds.includes(id));
        state.selectedConceptIds.push(...toAdd);
        if (toAdd.length > 0) {
          await this.hydrateMatrixNoveltiesForConcepts(toAdd);
        }
      } else if (isPeriodSwitch && state.selectedConceptIds.length === 0) {
        await this.loadActivePeriodMatrixColumns({ silentEmpty: true });
      } else if (state.selectedConceptIds.length > 0) {
        await this.hydrateMatrixNoveltiesForConcepts(state.selectedConceptIds);
      }

      this.refreshMatrixConceptPicker();
      this.renderNovMatrix();
    } catch (err) {
      showToast(err.message || 'Error al cargar la Planilla Ágil Multiconcepto', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  populateMatrixDepartmentFilter() {
    const state = this.ensureNovMatrixState();
    const deptSelect = document.getElementById('nov-matrix-dept-filter');
    if (!deptSelect) return;

    const depts = Array.from(
      new Set(state.employees.map((e) => e.department?.name).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'es'));

    const prev = state.deptFilter || '';
    deptSelect.innerHTML =
      '<option value="">Todos los sectores</option>' +
      depts.map((d) => `<option value="${escapeHtml(d)}" ${d === prev ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('');
  }

  refreshMatrixConceptPicker() {
    const state = this.ensureNovMatrixState();
    const picker = document.getElementById('nov-matrix-concept-picker');
    if (!picker) return;

    const selectedSet = new Set(state.selectedConceptIds);
    const available = state.compatibleConcepts.filter((c) => !selectedSet.has(c.id));
    const optsHtml =
      '<option value="">Seleccione un concepto para agregar...</option>' +
      available
        .map((c) => `<option value="${c.id}">[${escapeHtml(c.code)}] ${escapeHtml(c.name)} (${getInputTypeUnitLabel(getConceptInputType(c))})</option>`)
        .join('');

    updateSearchableSelect(picker, optsHtml, '');
  }

  async hydrateMatrixNoveltiesForConcepts(conceptIds = []) {
    const state = this.ensureNovMatrixState();
    if (!state.periodId || !Array.isArray(conceptIds) || conceptIds.length === 0) return;

    const csv = encodeURIComponent(conceptIds.join(','));
    const res = await apiRequest(`/payroll/periods/${state.periodId}/novelties?conceptIds=${csv}`);
    const list = res.data || [];

    const fetchedSet = new Set(conceptIds);
    for (const k of Array.from(state.initialMap.keys())) {
      const cid = k.split('::')[1];
      if (fetchedSet.has(cid)) {
        state.initialMap.delete(k);
      }
    }

    for (const nov of list) {
      state.initialMap.set(makeCellKey(nov.employeeId, nov.conceptId), {
        units: nov.units !== null && nov.units !== undefined ? Number(nov.units) : null,
        amount: nov.amount !== null && nov.amount !== undefined ? Number(nov.amount) : null,
        notes: nov.notes || null,
      });
    }
  }

  async addConceptColumnToMatrix(conceptId) {
    const state = this.ensureNovMatrixState();
    if (!state.conceptMap.has(conceptId) || state.selectedConceptIds.includes(conceptId)) return;

    state.selectedConceptIds.push(conceptId);
    const spinner = document.getElementById('nov-matrix-spinner');
    if (spinner) spinner.classList.remove('d-none');
    try {
      await this.hydrateMatrixNoveltiesForConcepts([conceptId]);
      this.refreshMatrixConceptPicker();
      this.renderNovMatrix();
    } catch (err) {
      showToast(err.message || 'Error al agregar columna de concepto', 'danger');
    } finally {
      if (spinner) spinner.classList.add('d-none');
    }
  }

  async loadActivePeriodMatrixColumns({ silentEmpty = false } = {}) {
    const state = this.ensureNovMatrixState();
    if (!state.periodId) return;

    const res = await apiRequest(`/payroll/periods/${state.periodId}/novelties`);
    const list = res.data || [];
    if (list.length === 0) {
      if (!silentEmpty) {
        showToast('La liquidación actual aún no posee novedades cargadas', 'info');
      }
      return;
    }

    const usedIds = Array.from(new Set(list.map((n) => n.conceptId).filter((id) => state.conceptMap.has(id))));
    for (const cid of usedIds) {
      if (!state.selectedConceptIds.includes(cid)) {
        state.selectedConceptIds.push(cid);
      }
    }
    for (const nov of list) {
      state.initialMap.set(makeCellKey(nov.employeeId, nov.conceptId), {
        units: nov.units !== null && nov.units !== undefined ? Number(nov.units) : null,
        amount: nov.amount !== null && nov.amount !== undefined ? Number(nov.amount) : null,
        notes: nov.notes || null,
      });
    }

    this.refreshMatrixConceptPicker();
    this.renderNovMatrix();
  }

  getFilteredMatrixEmployees() {
    const state = this.ensureNovMatrixState();
    return state.employees.filter((emp) => {
      if (state.deptFilter && (emp.department?.name || '') !== state.deptFilter) {
        return false;
      }
      if (state.searchTerm) {
        const text = `${emp.fileNumber || ''} ${emp.lastName || ''} ${emp.firstName || ''} ${emp.cuil || ''}`.toLowerCase();
        if (!text.includes(state.searchTerm)) return false;
      }
      if (state.viewFilter === 'ALL') return true;

      if (state.viewFilter === 'CARRIED') {
        return state.carriedEmpIds.has(emp.id);
      }
      let hasData = false;
      let hasModified = false;
      let hasInvalid = false;
      for (const cid of state.selectedConceptIds) {
        const concept = state.conceptMap.get(cid);
        if (!concept) continue;
        const cls = this.getMatrixCellClassification(emp.id, concept);
        if (cls.status === 'INVALID') hasInvalid = true;
        if (cls.status === 'NEW_DIRTY' || cls.status === 'MODIFIED_DIRTY' || cls.status === 'REMOVAL') hasModified = true;
        if (cls.value !== null || cls.notes) hasData = true;
      }
      if (state.viewFilter === 'WITH_DATA') return hasData;
      if (state.viewFilter === 'MODIFIED') return hasModified;
      if (state.viewFilter === 'INVALID') return hasInvalid;
      return true;
    });
  }

  renderMatrixChips() {
    const state = this.ensureNovMatrixState();
    const container = document.getElementById('nov-matrix-selected-chips');
    if (!container) return;

    if (state.selectedConceptIds.length === 0) {
      container.innerHTML = '<span class="text-muted small fst-italic">Ninguna columna seleccionada</span>';
      return;
    }

    container.innerHTML = state.selectedConceptIds
      .map((cid) => {
        const c = state.conceptMap.get(cid);
        if (!c) return '';
        const unitLbl = getInputTypeUnitLabel(getConceptInputType(c));
        return `
          <span class="badge bg-indigo-lt text-indigo d-inline-flex align-items-center gap-1 py-1 px-2">
            <span class="font-monospace fw-bold">[${escapeHtml(c.code)}]</span>
            <span>${escapeHtml(c.name)}</span>
            <small class="text-muted">(${unitLbl})</small>
            <button type="button" class="btn-close btn-remove-matrix-col ms-1" style="font-size: 0.55rem;" data-concept-id="${c.id}" aria-label="Quitar columna"></button>
          </span>
        `;
      })
      .join('');

    container.querySelectorAll('.btn-remove-matrix-col').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.conceptId;
        state.selectedConceptIds = state.selectedConceptIds.filter((id) => id !== cid);
        this.refreshMatrixConceptPicker();
        this.renderNovMatrix();
      });
    });
  }

  renderNovMatrix() {
    const state = this.ensureNovMatrixState();
    this.renderMatrixChips();

    const roAlert = document.getElementById('nov-matrix-readonly-alert');
    if (roAlert) roAlert.classList.toggle('d-none', !state.isClosed);

    const openCarryoverBtn = document.getElementById('btn-nov-matrix-open-carryover');
    if (openCarryoverBtn) openCarryoverBtn.disabled = state.isClosed || !state.periodId;
    const importExcelBtn = document.getElementById('btn-nov-matrix-import-excel');
    if (importExcelBtn) importExcelBtn.disabled = state.isClosed || !state.periodId;
    const emptyImportExcelBtn = document.getElementById('btn-nov-matrix-empty-import-excel');
    if (emptyImportExcelBtn) emptyImportExcelBtn.disabled = state.isClosed || !state.periodId;
    const smartPasteBtn = document.getElementById('btn-nov-matrix-smart-paste');
    if (smartPasteBtn) smartPasteBtn.disabled = state.isClosed || state.selectedConceptIds.length === 0;

    const carryoverBanner = document.getElementById('nov-matrix-carryover-banner');
    const carryoverText = document.getElementById('nov-matrix-carryover-banner-text');
    if (carryoverBanner && carryoverText) {
      if (state.carryoverContext) {
        carryoverBanner.classList.remove('d-none');
        carryoverText.innerHTML = state.carryoverContext.html;
      } else {
        carryoverBanner.classList.add('d-none');
      }
    }

    const emptyEl = document.getElementById('nov-matrix-empty-state');
    const tableCardBody = document.getElementById('nov-matrix-table-card-body');
    if (state.selectedConceptIds.length === 0) {
      if (emptyEl) emptyEl.classList.remove('d-none');
      if (tableCardBody) tableCardBody.classList.add('d-none');
      this.updateMatrixTotalsAndBadges();
      this.updateMatrixUndoButton();
      return;
    }

    if (emptyEl) emptyEl.classList.add('d-none');
    if (tableCardBody) tableCardBody.classList.remove('d-none');

    this.renderMatrixHead();
    this.renderNovMatrixBody();
    this.updateMatrixUndoButton();
  }

  renderMatrixHead() {
    const state = this.ensureNovMatrixState();
    const thead = document.getElementById('nov-matrix-thead');
    if (!thead) return;

    const conceptCols = state.selectedConceptIds
      .map((cid) => state.conceptMap.get(cid))
      .filter(Boolean);

    thead.innerHTML = `
      <tr>
        <th class="nov-matrix-sticky-legajo">Legajo</th>
        <th class="nov-matrix-sticky-emp">Colaborador</th>
        ${conceptCols
          .map((c) => {
            const inputType = getConceptInputType(c);
            const unitLabel = getInputTypeUnitLabel(inputType);
            return `
              <th class="nov-matrix-col-header" data-concept-id="${c.id}">
                <div class="d-flex justify-content-between align-items-start gap-1">
                  <div class="text-truncate" style="max-width: 140px;" title="[${escapeHtml(c.code)}] ${escapeHtml(c.name)}">
                    <span class="font-monospace fw-bold text-primary small">[${escapeHtml(c.code)}]</span>
                    <div class="fw-bold small text-truncate">${escapeHtml(c.name)}</div>
                  </div>
                  <button type="button" class="btn-close btn-matrix-col-hide flex-shrink-0 mt-1" style="font-size: 0.6rem;" data-concept-id="${c.id}" title="Ocultar columna"></button>
                </div>
                <div class="d-flex align-items-center justify-content-between mt-1">
                  ${getConceptTypeShortBadge(c.type)}
                  <span class="badge bg-secondary-lt font-monospace">${unitLabel}</span>
                </div>
              </th>
            `;
          })
          .join('')}
      </tr>
    `;

    thead.querySelectorAll('.btn-matrix-col-hide').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.conceptId;
        state.selectedConceptIds = state.selectedConceptIds.filter((id) => id !== cid);
        this.refreshMatrixConceptPicker();
        this.renderNovMatrix();
      });
    });

    const tfoot = document.getElementById('nov-matrix-tfoot');
    if (tfoot) {
      tfoot.innerHTML = `
        <tr>
          <td class="nov-matrix-sticky-legajo small text-muted">Totales</td>
          <td class="nov-matrix-sticky-emp small" id="nov-matrix-foot-emp-summary">-</td>
          ${conceptCols
            .map(
              (c) => `
                <td class="text-end">
                  <div class="font-monospace small fw-bold" id="nov-matrix-foot-sum-${c.id}">0</div>
                  <div class="text-muted" style="font-size: 0.7rem;" id="nov-matrix-foot-cnt-${c.id}">0 emp.</div>
                </td>
              `
            )
            .join('')}
        </tr>
      `;
    }
  }

  getCellClassesForStatus(cls, isOvertimeWarn) {
    const classes = ['form-control', 'form-control-sm', 'font-monospace', 'text-end', 'matrix-cell-input'];
    if (cls.status === 'INVALID') classes.push('matrix-cell-invalid');
    else if (cls.status === 'REMOVAL') classes.push('matrix-cell-removal');
    else if (isOvertimeWarn) classes.push('matrix-cell-overtime-warn');
    else if (cls.status === 'NEW_DIRTY' || cls.status === 'MODIFIED_DIRTY') classes.push('matrix-cell-dirty');
    return classes.join(' ');
  }

  renderNovMatrixBody() {
    const state = this.ensureNovMatrixState();
    const tbody = document.getElementById('nov-matrix-tbody');
    if (!tbody) return;

    const visibleEmployees = this.getFilteredMatrixEmployees();
    const conceptCols = state.selectedConceptIds.map((cid) => state.conceptMap.get(cid)).filter(Boolean);

    const visCountEl = document.getElementById('nov-matrix-visible-count');
    if (visCountEl) {
      visCountEl.textContent = `${visibleEmployees.length} de ${state.employees.length} legajos visibles`;
    }

    if (visibleEmployees.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${2 + conceptCols.length}" class="text-center py-4 text-muted">
            No hay colaboradores que coincidan con el filtro aplicado.
          </td>
        </tr>
      `;
      this.updateMatrixTotalsAndBadges();
      return;
    }

    tbody.innerHTML = visibleEmployees
      .map((emp, rowIdx) => {
        const isCarriedRow = state.carriedEmpIds.has(emp.id);
        return `
          <tr class="${isCarriedRow ? 'nov-matrix-row-carried' : ''}" data-emp-id="${emp.id}" data-vis-row="${rowIdx}">
            <td class="nov-matrix-sticky-legajo">
              <strong class="font-monospace text-primary">${escapeHtml(emp.fileNumber || '-')}</strong>
            </td>
            <td class="nov-matrix-sticky-emp">
              <div class="fw-bold text-truncate" title="${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}">${escapeHtml(emp.lastName)}, ${escapeHtml(emp.firstName)}</div>
              <div class="text-muted small text-truncate">${formatCuit(emp.cuil)} &bull; ${escapeHtml(emp.department?.name || 'Sin sector')}</div>
            </td>
            ${conceptCols
              .map((c, colIdx) => {
                const key = makeCellKey(emp.id, c.id);
                const inputType = getConceptInputType(c);
                const cls = this.getMatrixCellClassification(emp.id, c);
                const isOvertimeWarn = !cls.invalid && cls.value !== null && cls.value > 30 && isOvertimeHoursConcept(c);
                const hasFormulaWarn = state.formulaWarningKeys.has(key);
                const hasNote = Boolean(cls.notes);

                let tooltip = '';
                if (cls.invalid) tooltip = cls.error;
                else if (isOvertimeWarn) tooltip = 'Supera tope orientativo 30 hs/mes (Dec. 484/2000)';
                else if (hasFormulaWarn) tooltip = 'Importe reconstruido de recibo cerrado en concepto con fórmula';
                else if (cls.status === 'REMOVAL') tooltip = 'Se eliminará la novedad al guardar';

                const placeholder =
                  inputType === 'HOURS'
                    ? '00:00 / 0'
                    : inputType === 'NONE'
                    ? '1 / vacío'
                    : '0,00';

                const inputClasses = this.getCellClassesForStatus(cls, isOvertimeWarn);

                return `
                  <td data-cell-key="${key}">
                    <div class="nov-matrix-cell-wrap">
                      <input type="text"
                        inputmode="${inputType === 'NONE' ? 'text' : 'decimal'}"
                        class="${inputClasses}"
                        data-emp-id="${emp.id}"
                        data-concept-id="${c.id}"
                        data-vis-row="${rowIdx}"
                        data-col-idx="${colIdx}"
                        placeholder="${placeholder}"
                        title="${escapeHtml(tooltip)}"
                        value="${escapeHtml(cls.rawText)}"
                        ${state.isClosed ? 'readonly disabled' : ''} />
                      <button type="button"
                        class="btn btn-sm btn-icon ${hasNote ? 'btn-azure-lt text-azure' : 'btn-ghost-secondary text-muted'} btn-matrix-cell-note"
                        data-emp-id="${emp.id}"
                        data-concept-id="${c.id}"
                        title="${hasNote ? escapeHtml(cls.notes) : 'Agregar observación'}"
                        ${state.isClosed ? 'disabled' : ''}>
                        <i class="ti ti-${hasNote ? 'note' : 'notes'}"></i>
                      </button>
                    </div>
                  </td>
                `;
              })
              .join('')}
          </tr>
        `;
      })
      .join('');

    this.bindMatrixGridCellEvents(tbody);
    this.updateMatrixTotalsAndBadges();
  }

  bindMatrixGridCellEvents(tbody) {
    const state = this.ensureNovMatrixState();

    tbody.querySelectorAll('.matrix-cell-input').forEach((input) => {
      input.addEventListener('input', () => {
        if (state.isClosed) return;
        const empId = input.dataset.empId;
        const cid = input.dataset.conceptId;
        const concept = state.conceptMap.get(cid);
        if (!concept) return;

        const key = makeCellKey(empId, cid);
        const existingDraft = state.draftMap.get(key);
        const rawText = input.value;
        const parsed = parseClipboardCellValue(rawText, getConceptInputType(concept));

        state.draftMap.set(key, {
          empty: parsed.empty,
          value: parsed.value,
          notes: existingDraft ? existingDraft.notes : (state.initialMap.get(key)?.notes || ''),
          rawText,
          invalid: parsed.invalid,
          error: parsed.error,
        });

        this.syncSingleMatrixInputVisual(input, empId, concept);
        this.updateMatrixTotalsAndBadges();
      });

      input.addEventListener('blur', () => {
        if (state.isClosed) return;
        const empId = input.dataset.empId;
        const cid = input.dataset.conceptId;
        const concept = state.conceptMap.get(cid);
        if (!concept) return;

        const key = makeCellKey(empId, cid);
        const draft = state.draftMap.get(key);
        if (draft && !draft.invalid) {
          const inputType = getConceptInputType(concept);
          const formatted = draft.empty ? '' : formatCellValueForInput(draft.value, inputType);
          draft.rawText = formatted;
          input.value = formatted;
          this.syncSingleMatrixInputVisual(input, empId, concept);
        }
      });

      input.addEventListener('keydown', (e) => {
        const row = Number(input.dataset.visRow);
        const col = Number(input.dataset.colIdx);

        if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const delta = (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) ? -1 : 1;
          const target = tbody.querySelector(`.matrix-cell-input[data-vis-row="${row + delta}"][data-col-idx="${col}"]`);
          if (target) {
            target.focus();
            target.select();
          }
        } else if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
          e.preventDefault();
          const delta = e.key === 'ArrowRight' ? 1 : -1;
          const target = tbody.querySelector(`.matrix-cell-input[data-vis-row="${row}"][data-col-idx="${col + delta}"]`);
          if (target) {
            target.focus();
            target.select();
          }
        }
      });

      input.addEventListener('paste', (e) => {
        if (state.isClosed) return;
        this.handleMatrixCellPaste(e, input);
      });
    });

    tbody.querySelectorAll('.btn-matrix-cell-note').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openMatrixCellNoteModal(btn.dataset.empId, btn.dataset.conceptId);
      });
    });
  }

  syncSingleMatrixInputVisual(input, empId, concept) {
    const cls = this.getMatrixCellClassification(empId, concept);
    const isOvertimeWarn = !cls.invalid && cls.value !== null && cls.value > 30 && isOvertimeHoursConcept(concept);
    input.className = this.getCellClassesForStatus(cls, isOvertimeWarn);
    if (cls.invalid) input.title = cls.error || 'Valor inválido';
    else if (isOvertimeWarn) input.title = 'Supera tope orientativo 30 hs/mes (Dec. 484/2000)';
    else if (cls.status === 'REMOVAL') input.title = 'Se eliminará al guardar';
    else input.title = '';
  }

  handleMatrixCellPaste(e, startInput) {
    const rawText = e.clipboardData?.getData('text/plain');
    if (!rawText) return;

    const grid = parseClipboardGrid(rawText);
    if (grid.length === 0) return;

    e.preventDefault();
    const state = this.ensureNovMatrixState();
    this.pushMatrixUndoSnapshot();

    const tbody = document.getElementById('nov-matrix-tbody');
    if (!tbody) return;

    const startRow = Number(startInput.dataset.visRow);
    const startCol = Number(startInput.dataset.colIdx);
    const visibleEmployees = this.getFilteredMatrixEmployees();
    const maxCols = state.selectedConceptIds.length;

    let appliedCount = 0;
    let invalidCount = 0;
    let skippedOverflowRows = 0;

    for (let r = 0; r < grid.length; r++) {
      const targetRowIdx = startRow + r;
      if (targetRowIdx >= visibleEmployees.length) {
        skippedOverflowRows += 1;
        continue;
      }
      const emp = visibleEmployees[targetRowIdx];
      const pasteRow = grid[r];

      for (let c = 0; c < pasteRow.length; c++) {
        const targetColIdx = startCol + c;
        if (targetColIdx >= maxCols) break;

        const cid = state.selectedConceptIds[targetColIdx];
        const concept = state.conceptMap.get(cid);
        if (!concept) continue;

        const inputType = getConceptInputType(concept);
        const parsed = parseClipboardCellValue(pasteRow[c], inputType);
        const key = makeCellKey(emp.id, cid);
        const existingDraft = state.draftMap.get(key);
        const currentNotes = existingDraft ? existingDraft.notes : (state.initialMap.get(key)?.notes || '');
        const displayRaw = parsed.invalid
          ? String(pasteRow[c] ?? '').trim()
          : (parsed.empty ? '' : formatCellValueForInput(parsed.value, inputType));

        state.draftMap.set(key, {
          empty: parsed.empty,
          value: parsed.value,
          notes: currentNotes,
          rawText: displayRaw,
          invalid: parsed.invalid,
          error: parsed.error,
        });

        const cellInput = tbody.querySelector(
          `.matrix-cell-input[data-vis-row="${targetRowIdx}"][data-col-idx="${targetColIdx}"]`
        );
        if (cellInput) {
          cellInput.value = displayRaw;
          this.syncSingleMatrixInputVisual(cellInput, emp.id, concept);
          cellInput.classList.remove('matrix-cell-pasted-flash');
          void cellInput.offsetWidth;
          cellInput.classList.add('matrix-cell-pasted-flash');
        }

        if (parsed.invalid) invalidCount++;
        else appliedCount++;
      }
    }

    this.updateMatrixTotalsAndBadges();
    this.updateMatrixUndoButton();

    let msg = `Pegado aplicado en ${appliedCount} celda(s)`;
    if (invalidCount > 0) msg += ` · ${invalidCount} celda(s) inválidas marcadas en rojo`;
    if (skippedOverflowRows > 0) msg += ` · ${skippedOverflowRows} fila(s) excedieron el límite de tabla`;
    showToast(msg, invalidCount > 0 ? 'warning' : 'success');
  }

  updateMatrixTotalsAndBadges() {
    const state = this.ensureNovMatrixState();

    // Totales por columna sobre toda la nómina en memoria
    for (const cid of state.selectedConceptIds) {
      const concept = state.conceptMap.get(cid);
      if (!concept) continue;
      const inputType = getConceptInputType(concept);
      let colSum = 0;
      let colCount = 0;

      for (const emp of state.employees) {
        const cls = this.getMatrixCellClassification(emp.id, concept);
        if (!cls.invalid && cls.value !== null && cls.value > 0) {
          colSum += cls.value;
          colCount++;
        }
      }

      const sumEl = document.getElementById(`nov-matrix-foot-sum-${cid}`);
      const cntEl = document.getElementById(`nov-matrix-foot-cnt-${cid}`);
      if (sumEl) sumEl.textContent = formatColumnTotal(colSum, colCount, inputType);
      if (cntEl) cntEl.textContent = `${colCount} emp.`;
    }

    const { items, removals, invalidCells, overtimeWarnings } = this.getMatrixDeltas();

    const empSummaryEl = document.getElementById('nov-matrix-foot-emp-summary');
    if (empSummaryEl) {
      empSummaryEl.textContent = `${state.employees.length} legajos en nómina`;
    }

    const pendingBadge = document.getElementById('nov-matrix-pending-badge');
    if (pendingBadge) {
      if (invalidCells.length > 0) {
        pendingBadge.className = 'badge bg-danger-lt text-danger fw-semibold text-nowrap';
        pendingBadge.textContent = `${invalidCells.length} error(es) en celdas`;
      } else if (items.length === 0 && removals.length === 0) {
        pendingBadge.className = 'badge bg-secondary-lt fw-semibold text-nowrap';
        pendingBadge.textContent = 'Sin cambios pendientes';
      } else {
        const parts = [];
        if (items.length > 0) parts.push(`${items.length} a guardar`);
        if (removals.length > 0) parts.push(`${removals.length} a quitar`);
        pendingBadge.className = 'badge bg-blue-lt text-blue fw-semibold text-nowrap';
        pendingBadge.textContent = parts.join(' · ');
      }
    }

    const saveBtn = document.getElementById('btn-nov-matrix-save');
    if (saveBtn) {
      saveBtn.disabled = state.isClosed || (items.length === 0 && removals.length === 0 && invalidCells.length === 0);
    }

    // Alertas legales contextuales (Arts. 130-133 LCT + Dec. 484/2000 > 30 hs)
    const legalAlert = document.getElementById('nov-matrix-legal-alert');
    if (legalAlert) {
      const notices = [];
      if (state.hasClonedSensitiveDeduction) {
        notices.push(
          '<strong>Control LCT (Arts. 130, 131 y 133):</strong> Se clonaron valores en conceptos de deducción o anticipos desde el período anterior. Verificá que correspondan al período actual y respeten el tope del 50% en adelantos (Art. 130) y del 20% en deducciones generales (Art. 133).'
        );
      }
      if (overtimeWarnings.length > 0) {
        notices.push(
          `<strong>Alerta orientativa Horas Extras (Dec. 484/2000 / Art. 201 LCT / Ley 27.802):</strong> ${overtimeWarnings.length} celda(s) superan las 30 hs extras mensuales de referencia general (verificá autorizaciones o banco de horas Art. 197 bis LCT; toda hora trabajada debe abonarse).`
        );
      }
      if (notices.length > 0) {
        legalAlert.innerHTML = `<i class="ti ti-scale me-1"></i> ${notices.join('<br>')}`;
        legalAlert.classList.remove('d-none');
      } else {
        legalAlert.classList.add('d-none');
      }
    }
  }

  async saveNovMatrixChanges() {
    const state = this.ensureNovMatrixState();
    if (!state.periodId || state.isClosed) return;

    const { items, removals, invalidCells } = this.getMatrixDeltas();
    if (invalidCells.length > 0) {
      showToast(`Hay ${invalidCells.length} celda(s) inválidas marcadas en rojo. Corregilas antes de guardar.`, 'warning');
      const firstBad = document.querySelector(
        `#nov-matrix-tbody .matrix-cell-input[data-emp-id="${invalidCells[0].empId}"][data-concept-id="${invalidCells[0].conceptId}"]`
      );
      if (firstBad) {
        firstBad.focus();
        firstBad.select();
      }
      return;
    }

    if (items.length === 0 && removals.length === 0) {
      showToast('No hay cambios pendientes para guardar', 'info');
      return;
    }

    const saveBtn = document.getElementById('btn-nov-matrix-save');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    }

    try {
      const res = await apiRequest(`/payroll/periods/${state.periodId}/novelties/batch`, {
        method: 'POST',
        body: JSON.stringify({
          items,
          removals,
          returnData: false,
        }),
      });

      // Consolidar cambios en initialMap y limpiar dirty state
      for (const rem of removals) {
        state.initialMap.delete(makeCellKey(rem.employeeId, rem.conceptId));
        state.draftMap.delete(makeCellKey(rem.employeeId, rem.conceptId));
      }
      for (const it of items) {
        const key = makeCellKey(it.employeeId, it.conceptId);
        state.initialMap.set(key, {
          units: it.units,
          amount: it.amount,
          notes: it.notes || null,
        });
        state.draftMap.delete(key);
      }
      state.undoStack = [];
      state.hasClonedSensitiveDeduction = false;

      const savedCount = res?.data?.savedCount ?? res?.savedCount ?? items.length;
      const deletedCount = res?.data?.deletedCount ?? res?.deletedCount ?? removals.length;
      const parts = [];
      if (savedCount > 0) parts.push(`${savedCount} guardada(s)`);
      if (deletedCount > 0) parts.push(`${deletedCount} eliminada(s)`);
      showToast(`Grilla multiconcepto actualizada (${parts.join(', ')})`);

      this.renderNovMatrix();
    } catch (err) {
      showToast(err.message || 'Error al guardar novedades de la grilla multiconcepto', 'danger');
    } finally {
      if (saveBtn) {
        saveBtn.innerHTML = '<i class="ti ti-device-floppy"></i>';
        this.updateMatrixTotalsAndBadges();
      }
    }
  }

  // -------------------------------------------------------------------------
  // NOTA POR CELDA (#modal-matrix-cell-note)
  // -------------------------------------------------------------------------

  openMatrixCellNoteModal(empId, conceptId) {
    const state = this.ensureNovMatrixState();
    const emp = state.employees.find((e) => e.id === empId);
    const concept = state.conceptMap.get(conceptId);
    if (!emp || !concept) return;

    state.activeNoteKey = { empId, conceptId };
    const cls = this.getMatrixCellClassification(empId, concept);

    const subEl = document.getElementById('matrix-note-subtitle');
    if (subEl) {
      subEl.textContent = `[${emp.fileNumber}] ${emp.lastName}, ${emp.firstName} | [${concept.code}] ${concept.name}`;
    }
    const inputEl = document.getElementById('matrix-note-input');
    if (inputEl) {
      inputEl.value = cls.notes || '';
    }

    getBootstrapModal(document.getElementById('modal-matrix-cell-note'))?.show();
  }

  saveMatrixCellNote() {
    const state = this.ensureNovMatrixState();
    const active = state.activeNoteKey;
    if (!active) return;

    const { empId, conceptId } = active;
    const concept = state.conceptMap.get(conceptId);
    if (!concept) return;

    const inputEl = document.getElementById('matrix-note-input');
    const newNotes = inputEl ? inputEl.value.trim() : '';
    const key = makeCellKey(empId, conceptId);
    const currentCls = this.getMatrixCellClassification(empId, concept);
    const currentDraft = state.draftMap.get(key);

    this.pushMatrixUndoSnapshot();

    state.draftMap.set(key, {
      empty: currentDraft ? currentDraft.empty : (currentCls.value === null),
      value: currentDraft ? currentDraft.value : currentCls.value,
      notes: newNotes,
      rawText: currentDraft ? currentDraft.rawText : currentCls.rawText,
      invalid: currentDraft ? currentDraft.invalid : false,
      error: currentDraft ? currentDraft.error : null,
    });

    getBootstrapModal(document.getElementById('modal-matrix-cell-note'))?.hide();
    this.renderNovMatrixBody();
  }

  // -------------------------------------------------------------------------
  // PEGADO INTELIGENTE POR LEGAJO / CUIL (#modal-nov-matrix-smart-paste)
  // -------------------------------------------------------------------------

  openSmartPasteModal() {
    const state = this.ensureNovMatrixState();
    if (state.selectedConceptIds.length === 0) {
      showToast('Agregá al menos una columna de concepto antes de usar Pegar por Legajo/CUIL', 'warning');
      return;
    }

    const colsHintEl = document.getElementById('nov-smart-paste-columns-hint');
    if (colsHintEl) {
      const colNames = state.selectedConceptIds
        .map((cid) => state.conceptMap.get(cid))
        .filter(Boolean)
        .map((c) => `[${escapeHtml(c.code)}] ${escapeHtml(c.name)} (${getInputTypeUnitLabel(getConceptInputType(c))})`);
      colsHintEl.innerHTML = colNames.join(' &rarr; ');
    }

    const ta = document.getElementById('nov-smart-paste-textarea');
    if (ta) ta.value = '';
    const summaryEl = document.getElementById('nov-smart-paste-summary');
    if (summaryEl) summaryEl.textContent = 'Pegá filas arriba para previsualizar el emparejamiento';
    const previewThead = document.getElementById('nov-smart-paste-preview-thead');
    if (previewThead) previewThead.innerHTML = '';
    const previewTbody = document.getElementById('nov-smart-paste-preview-tbody');
    if (previewTbody) {
      previewTbody.innerHTML = '<tr><td class="text-center py-3 text-muted small">Sin filas para previsualizar.</td></tr>';
    }
    const applyBtn = document.getElementById('btn-apply-nov-smart-paste');
    if (applyBtn) applyBtn.disabled = true;

    this._pendingSmartPasteResult = null;
    getBootstrapModal(document.getElementById('modal-nov-matrix-smart-paste'))?.show();
  }

  previewSmartPaste() {
    const state = this.ensureNovMatrixState();
    const ta = document.getElementById('nov-smart-paste-textarea');
    const summaryEl = document.getElementById('nov-smart-paste-summary');
    const thead = document.getElementById('nov-smart-paste-preview-thead');
    const tbody = document.getElementById('nov-smart-paste-preview-tbody');
    const applyBtn = document.getElementById('btn-apply-nov-smart-paste');

    const rawText = ta ? ta.value : '';
    const grid = parseClipboardGrid(rawText);
    if (grid.length === 0 || (grid.length === 1 && grid[0].every((c) => !String(c).trim()))) {
      this._pendingSmartPasteResult = null;
      if (applyBtn) applyBtn.disabled = true;
      if (summaryEl) summaryEl.textContent = 'Pegá filas arriba para previsualizar el emparejamiento';
      if (tbody) tbody.innerHTML = '<tr><td class="text-center py-3 text-muted small">Sin filas para previsualizar.</td></tr>';
      return;
    }

    const { matchedRows, unmatchedKeys, headerSkipped } = matchClipboardRowsByEmployeeKey(grid, state.employees);
    const cols = state.selectedConceptIds.map((cid) => state.conceptMap.get(cid)).filter(Boolean);

    let invalidCellCount = 0;
    const preparedRows = matchedRows.map((row) => {
      const cells = cols.map((c, idx) => {
        const rawCell = row.values[idx] !== undefined ? String(row.values[idx]) : '';
        const parsed = parseClipboardCellValue(rawCell, getConceptInputType(c));
        if (parsed.invalid) invalidCellCount++;
        return {
          concept: c,
          rawCell,
          parsed,
        };
      });
      return {
        employee: row.employee,
        rawKey: row.rawKey,
        cells,
      };
    });

    this._pendingSmartPasteResult = {
      preparedRows,
      unmatchedKeys,
      headerSkipped,
      invalidCellCount,
    };

    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Clave Pegada</th>
          <th>Colaborador Emparejado</th>
          ${cols.map((c) => `<th class="text-end">[${escapeHtml(c.code)}] ${escapeHtml(c.name)}</th>`).join('')}
        </tr>
      `;
    }

    if (tbody) {
      const matchedHtml = preparedRows
        .map((r) => `
          <tr>
            <td class="font-monospace small">${escapeHtml(r.rawKey)}</td>
            <td class="small fw-semibold">${escapeHtml(r.employee.fileNumber)} - ${escapeHtml(r.employee.lastName)}, ${escapeHtml(r.employee.firstName)}</td>
            ${r.cells
              .map((cell) => {
                if (cell.parsed.invalid) {
                  return `<td class="text-end text-danger small fw-bold" title="${escapeHtml(cell.parsed.error)}">${escapeHtml(cell.rawCell)} <i class="ti ti-alert-circle"></i></td>`;
                }
                if (cell.parsed.empty) {
                  return '<td class="text-end text-muted small">—</td>';
                }
                return `<td class="text-end font-monospace small">${escapeHtml(formatCellValueForInput(cell.parsed.value, getConceptInputType(cell.concept)))}</td>`;
              })
              .join('')}
          </tr>
        `)
        .join('');

      const unmatchedHtml = unmatchedKeys
        .map(
          (u) => `
          <tr class="table-warning">
            <td class="font-monospace small">${escapeHtml(u.key)}</td>
            <td colspan="${1 + cols.length}" class="small text-warning fw-semibold">No encontrado entre colaboradores activos (se omitirá)</td>
          </tr>
        `
        )
        .join('');

      tbody.innerHTML = matchedHtml + unmatchedHtml || '<tr><td class="text-center py-3 text-muted small">Sin filas válidas.</td></tr>';
    }

    if (summaryEl) {
      summaryEl.textContent = `${preparedRows.length} emparejado(s) · ${unmatchedKeys.length} no encontrado(s) · ${invalidCellCount} error(es)`;
    }
    if (applyBtn) {
      applyBtn.disabled = preparedRows.length === 0;
    }
  }

  applySmartPaste() {
    const state = this.ensureNovMatrixState();
    const res = this._pendingSmartPasteResult;
    if (!res || !res.preparedRows || res.preparedRows.length === 0) return;

    const overwrite = document.getElementById('nov-smart-paste-conflict-overwrite')?.checked === true;
    this.pushMatrixUndoSnapshot();

    let applied = 0;
    let skippedExisting = 0;

    for (const row of res.preparedRows) {
      for (const cell of row.cells) {
        if (cell.rawCell.trim() === '' && !overwrite) continue;
        const key = makeCellKey(row.employee.id, cell.concept.id);
        const cls = this.getMatrixCellClassification(row.employee.id, cell.concept);
        const hasCurrentVal = cls.value !== null && cls.value > 0;
        if (!overwrite && hasCurrentVal) {
          skippedExisting++;
          continue;
        }
        const existingDraft = state.draftMap.get(key);
        const currentNotes = existingDraft ? existingDraft.notes : (state.initialMap.get(key)?.notes || '');
        const inputType = getConceptInputType(cell.concept);
        const displayRaw = cell.parsed.invalid
          ? cell.rawCell.trim()
          : (cell.parsed.empty ? '' : formatCellValueForInput(cell.parsed.value, inputType));

        state.draftMap.set(key, {
          empty: cell.parsed.empty,
          value: cell.parsed.value,
          notes: currentNotes,
          rawText: displayRaw,
          invalid: cell.parsed.invalid,
          error: cell.parsed.error,
        });
        applied++;
      }
    }

    getBootstrapModal(document.getElementById('modal-nov-matrix-smart-paste'))?.hide();
    this.renderNovMatrix();
    let msg = `Pegado por Legajo/CUIL aplicado (${applied} celdas)`;
    if (skippedExisting > 0) msg += ` · ${skippedExisting} celdas existentes preservadas`;
    if (res.unmatchedKeys.length > 0) msg += ` · ${res.unmatchedKeys.length} claves no encontradas`;
    showToast(msg, res.invalidCellCount > 0 ? 'warning' : 'success');
  }

  // -------------------------------------------------------------------------
  // MODAL COMPARTIDO: COPIAR DE PERÍODO ANTERIOR (#modal-nov-carryover)
  // -------------------------------------------------------------------------

  async openCarryoverModal({ targetMode = 'MATRIX', periodId, conceptIds = [] } = {}) {
    if (!periodId) {
      showToast('Seleccione una liquidación primero', 'warning');
      return;
    }

    this._carryoverModalCfg = {
      targetMode,
      periodId,
      fixedConceptIds: targetMode === 'SINGLE' ? conceptIds : [],
      previewData: null,
    };

    const modeZero = document.getElementById('nov-carryover-mode-zero');
    if (modeZero) modeZero.checked = true;
    const conflictEmpty = document.getElementById('nov-carryover-conflict-empty');
    if (conflictEmpty) conflictEmpty.checked = true;
    const incNotes = document.getElementById('nov-carryover-include-notes');
    if (incNotes) incNotes.checked = true;
    const addColsWrap = document.getElementById('nov-carryover-add-concepts-wrap');
    const addColsChk = document.getElementById('nov-carryover-add-concepts');
    if (addColsWrap) addColsWrap.classList.toggle('d-none', targetMode !== 'MATRIX');
    if (addColsChk) addColsChk.checked = true;

    const legalWarn = document.getElementById('nov-carryover-legal-warning');
    if (legalWarn) legalWarn.classList.add('d-none');

    const srcSelect = document.getElementById('nov-carryover-source-period');
    if (srcSelect) {
      srcSelect.innerHTML = '<option value="">Buscando liquidaciones anteriores...</option>';
      srcSelect.disabled = true;
    }

    const applyBtn = document.getElementById('btn-apply-nov-carryover');
    if (applyBtn) applyBtn.disabled = true;

    getBootstrapModal(document.getElementById('modal-nov-carryover'))?.show();
    await this.loadCarryoverPreview(null, true);
  }

  async loadCarryoverPreview(sourcePeriodId = null, populatePeriods = false) {
    const cfg = this._carryoverModalCfg;
    if (!cfg) return;

    const infoEl = document.getElementById('nov-carryover-origin-info');
    const applyBtn = document.getElementById('btn-apply-nov-carryover');
    const srcSelect = document.getElementById('nov-carryover-source-period');

    if (infoEl) {
      infoEl.className = 'alert alert-info py-2 px-3 small mb-3';
      infoEl.textContent = 'Consultando liquidación origen...';
    }
    if (applyBtn) applyBtn.disabled = true;

    try {
      const qs = new URLSearchParams();
      if (sourcePeriodId) qs.set('sourcePeriodId', sourcePeriodId);
      if (cfg.fixedConceptIds && cfg.fixedConceptIds.length > 0) {
        qs.set('conceptIds', cfg.fixedConceptIds.join(','));
      }
      const url = `/payroll/periods/${cfg.periodId}/novelties/carryover-source${qs.toString() ? `?${qs.toString()}` : ''}`;
      const res = await apiRequest(url);
      const data = res.data || {};
      cfg.previewData = data;

      if (populatePeriods && srcSelect) {
        const list = data.availableSourcePeriods || [];
        if (list.length === 0) {
          srcSelect.innerHTML = '<option value="">No existen otras liquidaciones previas en la empresa</option>';
          srcSelect.disabled = true;
        } else {
          const selectedId = data.sourcePeriod?.id || '';
          srcSelect.innerHTML = list
            .map(
              (p) =>
                `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${String(p.month).padStart(2, '0')}/${p.year} - ${escapeHtml(p.settlementName)} (${p.status})${p.samePeriodType ? '' : ' [Otro tipo]'}</option>`
            )
            .join('');
          srcSelect.disabled = false;
        }
      }

      if (!data.sourcePeriod || (data.items || []).length === 0) {
        if (infoEl) {
          infoEl.className = 'alert alert-warning py-2 px-3 small mb-3';
          infoEl.innerHTML = data.sourcePeriod
            ? `No se encontraron novedades compatibles en <strong>${escapeHtml(data.sourcePeriod.settlementName)}</strong>.`
            : 'No se encontró una liquidación anterior compatible.';
        }
        if (applyBtn) applyBtn.disabled = true;
        this.refreshCarryoverLegalWarning();
        return;
      }

      const originDesc =
        data.sourceOrigin === 'CLOSED_PAYSLIPS'
          ? 'Recibos liquidados en período cerrado (reconstrucción inmutable desde <code>pay_slip_items</code>)'
          : 'Novedades cargadas en período abierto (<code>period_novelties</code>)';

      const uniqueEmpCount = new Set((data.items || []).map((i) => i.employeeId)).size;
      const formulaWarnCount = (data.items || []).filter((i) => i.formulaAmountWarning).length;

      let extraHtml = '';
      if (data.skippedInactiveCount > 0) {
        extraHtml += `<br><span class="text-warning fw-semibold">Se excluyeron ${data.skippedInactiveCount} colaborador(es) dado(s) de baja/inactivos.</span>`;
      }
      if (formulaWarnCount > 0) {
        extraHtml += `<br><span class="text-warning fw-semibold">${formulaWarnCount} registro(s) de tipo Importe con fórmula reconstruyeron el monto resultante del recibo cerrado (verificalos antes de liquidar).</span>`;
      }

      if (infoEl) {
        infoEl.className = 'alert alert-info py-2 px-3 small mb-3';
        infoEl.innerHTML = `
          <strong>Origen de datos:</strong> ${originDesc}<br>
          <strong>Resumen:</strong> ${uniqueEmpCount} colaborador(es) activos en ${(data.concepts || []).length} concepto(s) (${(data.items || []).length} registros totales).
          ${extraHtml}
        `;
      }

      if (applyBtn) applyBtn.disabled = false;
      this.refreshCarryoverLegalWarning();
    } catch (err) {
      if (infoEl) {
        infoEl.className = 'alert alert-danger py-2 px-3 small mb-3';
        infoEl.textContent = err.message || 'Error al consultar liquidación origen';
      }
    }
  }

  refreshCarryoverLegalWarning() {
    const cfg = this._carryoverModalCfg;
    const warnEl = document.getElementById('nov-carryover-legal-warning');
    if (!warnEl || !cfg?.previewData) return;

    const isClone = document.getElementById('nov-carryover-mode-clone')?.checked === true;
    const concepts = cfg.previewData.concepts || [];
    const sensitive = concepts.filter((c) => isSensitiveDeductionOrAdvance(c));

    if (isClone && sensitive.length > 0) {
      const names = sensitive.map((c) => `[${escapeHtml(c.code)}] ${escapeHtml(c.name)}`).join(', ');
      warnEl.innerHTML = `<i class="ti ti-scale me-1"></i> <strong>Control LCT (Arts. 130, 131 y 133):</strong> Estás por clonar importes sobre conceptos de deducción/anticipo (${names}). Verificá que cuenten con autorización vigente y respeten el tope del 50% en adelantos y 20% en deducciones generales.`;
      warnEl.classList.remove('d-none');
    } else {
      warnEl.classList.add('d-none');
    }
  }

  async applyCarryoverToTarget() {
    const cfg = this._carryoverModalCfg;
    if (!cfg?.previewData) return;

    const data = cfg.previewData;
    const mode = document.getElementById('nov-carryover-mode-clone')?.checked ? 'CLONE_VALUES' : 'ZERO_TEMPLATE';
    const overwrite = document.getElementById('nov-carryover-conflict-overwrite')?.checked === true;
    const includeNotes = document.getElementById('nov-carryover-include-notes')?.checked !== false;
    const addConceptsAuto = document.getElementById('nov-carryover-add-concepts')?.checked !== false;

    if (cfg.targetMode === 'SINGLE') {
      this.applyCarryoverToSingleBatchModal(data, { mode, overwrite, includeNotes });
      getBootstrapModal(document.getElementById('modal-nov-carryover'))?.hide();
      return;
    }

    const state = this.ensureNovMatrixState();
    this.pushMatrixUndoSnapshot();

    if (addConceptsAuto) {
      const newCols = (data.concepts || [])
        .map((c) => c.id)
        .filter((cid) => state.conceptMap.has(cid) && !state.selectedConceptIds.includes(cid));
      if (newCols.length > 0) {
        state.selectedConceptIds.push(...newCols);
        await this.hydrateMatrixNoveltiesForConcepts(newCols);
        this.refreshMatrixConceptPicker();
      }
    }

    const selectedSet = new Set(state.selectedConceptIds);
    const activeEmpSet = new Set(state.employees.map((e) => e.id));
    let affected = 0;
    let sensitiveCloned = false;

    for (const item of data.items || []) {
      if (!selectedSet.has(item.conceptId) || !activeEmpSet.has(item.employeeId)) continue;
      const concept = state.conceptMap.get(item.conceptId);
      if (!concept) continue;

      const key = makeCellKey(item.employeeId, item.conceptId);
      state.carriedKeys.add(key);
      state.carriedEmpIds.add(item.employeeId);
      if (item.formulaAmountWarning) state.formulaWarningKeys.add(key);

      if (mode === 'CLONE_VALUES') {
        const cls = this.getMatrixCellClassification(item.employeeId, concept);
        const hasVal = cls.value !== null && cls.value > 0;
        if (!overwrite && hasVal) continue;

        const inputType = getConceptInputType(concept);
        const rawVal = inputType === 'AMOUNT' ? item.amount : item.units;
        const numVal = rawVal !== null && rawVal !== undefined ? Math.round(Number(rawVal) * 100) / 100 : 0;
        if (numVal <= 0 && !(includeNotes && item.notes)) continue;

        if (isSensitiveDeductionOrAdvance(concept)) sensitiveCloned = true;

        state.draftMap.set(key, {
          empty: numVal <= 0,
          value: numVal > 0 ? numVal : null,
          notes: includeNotes && item.notes ? item.notes : (cls.notes || ''),
          rawText: numVal > 0 ? formatCellValueForInput(numVal, inputType) : '',
          invalid: false,
          error: null,
        });
        affected++;
      } else {
        affected++;
      }
    }

    if (sensitiveCloned) {
      state.hasClonedSensitiveDeduction = true;
    }

    const srcName = data.sourcePeriod ? `${String(data.sourcePeriod.month).padStart(2, '0')}/${data.sourcePeriod.year} - ${data.sourcePeriod.settlementName}` : 'Período anterior';
    const modeDesc = mode === 'CLONE_VALUES'
      ? `valores clonados en borrador (${affected} celdas)`
      : `legajos marcados con arrastre (${state.carriedEmpIds.size} colaboradores; valores en 0 para completar)`;
    const skippedText = data.skippedInactiveCount > 0 ? ` · ${data.skippedInactiveCount} baja(s) omitida(s)` : '';

    state.carryoverContext = {
      html: `<i class="ti ti-copy me-1"></i><strong>Arrastre desde ${escapeHtml(srcName)}:</strong> ${modeDesc}${skippedText}. Revisá y presioná <strong>Guardar Cambios</strong> para confirmar.`,
    };

    if (mode === 'ZERO_TEMPLATE') {
      state.viewFilter = 'CARRIED';
      const vf = document.getElementById('nov-matrix-view-filter');
      if (vf) vf.value = 'CARRIED';
    }

    getBootstrapModal(document.getElementById('modal-nov-carryover'))?.hide();
    this.renderNovMatrix();
    showToast(`Arrastre aplicado en borrador (${mode === 'CLONE_VALUES' ? `${affected} celdas` : `${state.carriedEmpIds.size} legajos`})`);
  }

  // -------------------------------------------------------------------------
  // MODAL: IMPORTADOR EXCEL MULTICONCEPTO (#modal-novelties-import-matrix-excel)
  // -------------------------------------------------------------------------

  async openMatrixExcelImportModal({ periodId, sourcePane = 'MATRIX' } = {}) {
    const resolvedPeriodId = periodId || this.activePayrollPeriodId;
    if (!resolvedPeriodId) {
      showToast('Seleccione una liquidación abierta antes de importar desde Excel', 'warning');
      return;
    }

    const periodObj = (this.payrollPeriods || []).find((p) => p.id === resolvedPeriodId) || null;
    if (periodObj?.status === 'CLOSED') {
      showToast('No se pueden importar novedades sobre una liquidación cerrada', 'warning');
      return;
    }

    this._matrixExcelState = {
      periodId: resolvedPeriodId,
      periodObj,
      sourcePane,
      allEmployees: [],
      allConcepts: [],
      parsedResult: null,
    };

    const pBadge = document.getElementById('nov-matrix-excel-period-badge');
    if (pBadge) {
      pBadge.textContent = periodObj
        ? `${String(periodObj.month).padStart(2, '0')}/${periodObj.year} - ${periodObj.settlementName}`
        : resolvedPeriodId;
    }
    const tBadge = document.getElementById('nov-matrix-excel-type-badge');
    if (tBadge) {
      tBadge.textContent = `Tipo: ${periodObj?.periodType || 'MONTHLY'}`;
    }

    const fileInput = document.getElementById('nov-matrix-excel-file-input');
    if (fileInput) fileInput.value = '';
    document.getElementById('nov-matrix-excel-error-alert')?.classList.add('d-none');
    document.getElementById('nov-matrix-excel-legal-alert')?.classList.add('d-none');
    document.getElementById('nov-matrix-excel-preview-section')?.classList.add('d-none');
    document.getElementById('nov-matrix-excel-invalid-cols-box')?.classList.add('d-none');
    document.getElementById('nov-matrix-excel-skip-errors-wrap')?.classList.add('d-none');

    const skipChk = document.getElementById('nov-matrix-excel-skip-errors');
    if (skipChk) skipChk.checked = false;

    const btnGrid = document.getElementById('btn-load-matrix-excel-to-grid');
    const btnImport = document.getElementById('btn-confirm-matrix-excel-import');
    if (btnGrid) btnGrid.disabled = true;
    if (btnImport) btnImport.disabled = true;

    getBootstrapModal(document.getElementById('modal-novelties-import-matrix-excel'))?.show();

    try {
      const [allEmployees, allConcepts] = await Promise.all([
        this.fetchAllEmployeesForValidation(),
        this.fetchAllConceptsCatalog(),
      ]);
      if (this._matrixExcelState && this._matrixExcelState.periodId === resolvedPeriodId) {
        this._matrixExcelState.allEmployees = allEmployees;
        this._matrixExcelState.allConcepts = allConcepts;
      }
    } catch (err) {
      const errEl = document.getElementById('nov-matrix-excel-error-alert');
      if (errEl) {
        errEl.textContent = err.message || 'Error al cargar catálogo de conceptos o legajos para validación';
        errEl.classList.remove('d-none');
      }
    }
  }

  async ensureMatrixExcelCatalogsLoaded() {
    const st = this._matrixExcelState;
    if (!st) return null;
    if (st.allEmployees.length === 0 || st.allConcepts.length === 0) {
      const [allEmployees, allConcepts] = await Promise.all([
        this.fetchAllEmployeesForValidation(),
        this.fetchAllConceptsCatalog(),
      ]);
      st.allEmployees = allEmployees;
      st.allConcepts = allConcepts;
    }
    return st;
  }

  async downloadMatrixExcelTemplate() {
    const st = await this.ensureMatrixExcelCatalogsLoaded();
    if (!st) return;

    const targetType = st.periodObj?.periodType || 'MONTHLY';
    const compatibleConcepts = (st.allConcepts || [])
      .filter(
        (c) =>
          !c.deletedAt &&
          String(c.scope || '').toUpperCase() === 'INDIVIDUAL' &&
          !c.isPersistent &&
          String(c.noveltyDataType || '').toUpperCase() !== 'CALCULADO' &&
          isConceptCompatibleWithPeriodType(c, targetType)
      )
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));

    if (compatibleConcepts.length === 0) {
      showToast(`No existen conceptos no persistentes individuales habilitados para el tipo ${targetType}`, 'warning');
      return;
    }

    const activeEmployees = (st.allEmployees || [])
      .filter((e) => !e.deletedAt && String(e.status || '').toUpperCase() === 'ACTIVE')
      .sort((a, b) =>
        String(a.fileNumber || '').localeCompare(String(b.fileNumber || ''), 'es', { numeric: true })
      );

    const headers = ['Legajo', ...compatibleConcepts.map((c) => c.code)];
    const aoa = [headers, ...activeEmployees.map((e) => [String(e.fileNumber || ''), ...compatibleConcepts.map(() => '')])];

    if (window.XLSX?.utils?.aoa_to_sheet) {
      const wb = window.XLSX.utils.book_new();
      const ws = window.XLSX.utils.aoa_to_sheet(aoa);
      window.XLSX.utils.book_append_sheet(wb, ws, 'Novedades');
      window.XLSX.writeFile(wb, `plantilla_novedades_${String(targetType).toLowerCase()}.xlsx`);
      return;
    }

    showToast('La librería XLSX no está disponible en el navegador', 'danger');
  }

  async handleMatrixExcelFileChange(e) {
    const file = e.target?.files?.[0];
    if (!file) return;

    const st = await this.ensureMatrixExcelCatalogsLoaded();
    if (!st) return;

    const errBox = document.getElementById('nov-matrix-excel-error-alert');
    const legalBox = document.getElementById('nov-matrix-excel-legal-alert');
    const previewSec = document.getElementById('nov-matrix-excel-preview-section');
    const invalidColsBox = document.getElementById('nov-matrix-excel-invalid-cols-box');
    const skipWrap = document.getElementById('nov-matrix-excel-skip-errors-wrap');
    const skipChk = document.getElementById('nov-matrix-excel-skip-errors');

    if (errBox) errBox.classList.add('d-none');
    if (legalBox) legalBox.classList.add('d-none');
    if (invalidColsBox) invalidColsBox.classList.add('d-none');
    if (skipWrap) skipWrap.classList.add('d-none');
    if (skipChk) skipChk.checked = false;

    try {
      if (!window.XLSX) {
        throw new Error('No se encontró la librería de lectura Excel (XLSX).');
      }
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

      const targetType = st.periodObj?.periodType || 'MONTHLY';
      const parsed = parseMultiConceptExcelMatrix(rawRows, {
        employees: st.allEmployees,
        allConcepts: st.allConcepts,
        targetPeriodType: targetType,
      });
      st.parsedResult = parsed;

      if (parsed.fatalError) {
        if (previewSec) previewSec.classList.add('d-none');
        if (errBox) {
          errBox.textContent = parsed.fatalError;
          errBox.classList.remove('d-none');
        }
        this.updateMatrixExcelActionButtons();
        return;
      }

      if (previewSec) previewSec.classList.remove('d-none');

      const cValidBadge = document.getElementById('nov-matrix-excel-cols-valid-badge');
      const cInvBadge = document.getElementById('nov-matrix-excel-cols-invalid-badge');
      const rActBadge = document.getElementById('nov-matrix-excel-rows-active-badge');
      const rInvBadge = document.getElementById('nov-matrix-excel-rows-invalid-badge');
      const itemsBadge = document.getElementById('nov-matrix-excel-items-badge');

      const rowErrorTotal = parsed.inactiveRowsCount + parsed.notFoundRowsCount + parsed.duplicateRowsCount;

      if (cValidBadge) cValidBadge.textContent = `${parsed.validColumns.length} col. válidas`;
      if (cInvBadge) {
        cInvBadge.textContent = `${parsed.invalidColumns.length} col. rechazadas`;
        cInvBadge.classList.toggle('d-none', parsed.invalidColumns.length === 0);
      }
      if (rActBadge) rActBadge.textContent = `${parsed.activeRowsCount} legajos activos`;
      if (rInvBadge) {
        rInvBadge.textContent = `${rowErrorTotal} legajos c/error · ${parsed.invalidCellsCount} celdas`;
        rInvBadge.classList.toggle('d-none', rowErrorTotal === 0 && parsed.invalidCellsCount === 0);
      }
      if (itemsBadge) itemsBadge.textContent = `${parsed.validItems.length} novedades listas`;

      if (parsed.invalidColumns.length > 0 && invalidColsBox) {
        invalidColsBox.innerHTML =
          '<strong>Columnas rechazadas (encabezados):</strong><ul class="mb-0 mt-1 ps-3">' +
          parsed.invalidColumns
            .map((ic) => `<li><code>${escapeHtml(ic.header)}</code>: ${escapeHtml(ic.reason)}</li>`)
            .join('') +
          '</ul>';
        invalidColsBox.classList.remove('d-none');
      }

      if (parsed.hasFatalHeaderErrors && errBox) {
        errBox.innerHTML =
          '<strong>Importación bloqueada:</strong> Todas las columnas de conceptos del archivo deben ser válidas y pertenecer al tipo de liquidación <code>' +
          escapeHtml(targetType) +
          '</code>. Corregí el archivo y volvé a seleccionarlo.';
        errBox.classList.remove('d-none');
      } else if ((rowErrorTotal > 0 || parsed.invalidCellsCount > 0) && errBox) {
        const msgParts = [];
        if (parsed.inactiveRowsCount > 0) msgParts.push(`${parsed.inactiveRowsCount} legajo(s) sin relación laboral activa`);
        if (parsed.notFoundRowsCount > 0) msgParts.push(`${parsed.notFoundRowsCount} legajo(s) inexistente(s)`);
        if (parsed.duplicateRowsCount > 0) msgParts.push(`${parsed.duplicateRowsCount} legajo(s) duplicado(s)`);
        if (parsed.invalidCellsCount > 0) msgParts.push(`${parsed.invalidCellsCount} celda(s) con formato inválido`);

        errBox.innerHTML = `<strong>Observaciones detectadas (Art. 52 / 140 LCT):</strong> ${msgParts.join(' · ')}.`;
        errBox.classList.remove('d-none');

        if (parsed.validItems.length > 0 && skipWrap) {
          skipWrap.classList.remove('d-none');
        }
      }

      if (legalBox) {
        const legalNotices = [];
        if (parsed.hasSensitiveDeductions) {
          legalNotices.push(
            '<strong>Control LCT (Arts. 130, 131 y 133):</strong> El archivo incluye conceptos de deducción o anticipo. Verificá los topes legales aplicables antes de liquidar.'
          );
        }
        if (parsed.overtimeWarningsCount > 0) {
          legalNotices.push(
            `<strong>Alerta orientativa Horas Extras (Dec. 484/2000 / Art. 201 LCT / Ley 27.802):</strong> ${parsed.overtimeWarningsCount} celda(s) superan 30 hs extras mensuales (verificá autorizaciones o banco de horas; las horas trabajadas deben abonarse).`
          );
        }
        if (legalNotices.length > 0) {
          legalBox.innerHTML = `<i class="ti ti-scale me-1"></i> ${legalNotices.join('<br>')}`;
          legalBox.classList.remove('d-none');
        }
      }

      this.renderMatrixExcelPreviewTable(parsed);
      this.updateMatrixExcelActionButtons();
    } catch (err) {
      if (previewSec) previewSec.classList.add('d-none');
      if (errBox) {
        errBox.textContent = `Error al leer el archivo Excel: ${err.message}`;
        errBox.classList.remove('d-none');
      }
      st.parsedResult = null;
      this.updateMatrixExcelActionButtons();
    }
  }

  renderMatrixExcelPreviewTable(parsed) {
    const thead = document.getElementById('nov-matrix-excel-preview-thead');
    const tbody = document.getElementById('nov-matrix-excel-preview-tbody');
    if (!thead || !tbody) return;

    thead.innerHTML = `
      <tr>
        <th style="width: 55px;">Fila</th>
        <th style="width: 90px;">Legajo</th>
        <th style="min-width: 210px;">Colaborador / Relación Laboral</th>
        <th style="width: 150px;">Validación</th>
        ${parsed.validColumns
          .map(
            (col) =>
              `<th class="text-end text-nowrap" title="${escapeHtml(col.concept.name)}">
                <span class="font-monospace text-primary">${escapeHtml(col.code)}</span>
                <div class="text-muted fw-normal" style="font-size: 0.7rem;">${escapeHtml(getInputTypeUnitLabel(col.inputType))}</div>
              </th>`
          )
          .join('')}
      </tr>
    `;

    if (parsed.rowsPreview.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${4 + parsed.validColumns.length}" class="text-center py-3 text-muted small">El archivo no contiene filas de datos.</td></tr>`;
      return;
    }

    tbody.innerHTML = parsed.rowsPreview
      .map((row) => {
        const isRowInvalid = row.status === 'INACTIVE' || row.status === 'NOT_FOUND' || row.status === 'DUPLICATE';
        const badgeHtml =
          row.status === 'OK'
            ? '<span class="badge bg-success-lt">Válido</span>'
            : row.status === 'CELL_ERROR'
            ? '<span class="badge bg-warning-lt text-warning">Error celda</span>'
            : `<span class="badge bg-danger-lt">${escapeHtml(row.statusLabel)}</span>`;

        const empDesc = row.employee
          ? `${escapeHtml(row.employee.lastName)}, ${escapeHtml(row.employee.firstName)}`
          : '<em class="text-danger">No registrado en nómina</em>';

        return `
          <tr class="${isRowInvalid ? 'table-danger' : ''}">
            <td class="text-muted font-monospace small">${row.rowNumber}</td>
            <td class="font-monospace fw-bold">${escapeHtml(row.rawLegajo)}</td>
            <td class="small">${empDesc}</td>
            <td>${badgeHtml}</td>
            ${row.cells
              .map((cell) => {
                if (cell.invalid) {
                  return `<td class="text-end text-danger small fw-bold" title="${escapeHtml(cell.error || '')}">${escapeHtml(cell.raw)} <i class="ti ti-alert-circle"></i></td>`;
                }
                if (cell.empty) {
                  return '<td class="text-end text-muted small">—</td>';
                }
                const cls = cell.overtimeWarn ? 'text-warning fw-bold' : 'font-monospace';
                return `<td class="text-end small ${cls}">${escapeHtml(formatCellValueForInput(cell.value, cell.inputType || 'UNITS'))}</td>`;
              })
              .join('')}
          </tr>
        `;
      })
      .join('');
  }

  updateMatrixExcelActionButtons() {
    const st = this._matrixExcelState;
    const res = st?.parsedResult;
    const btnGrid = document.getElementById('btn-load-matrix-excel-to-grid');
    const btnImport = document.getElementById('btn-confirm-matrix-excel-import');

    if (!res || res.fatalError || res.hasFatalHeaderErrors || res.validItems.length === 0) {
      if (btnGrid) btnGrid.disabled = true;
      if (btnImport) btnImport.disabled = true;
      return;
    }

    const hasRowOrCellErrors =
      res.inactiveRowsCount > 0 ||
      res.notFoundRowsCount > 0 ||
      res.duplicateRowsCount > 0 ||
      res.invalidCellsCount > 0;
    const skipChecked = document.getElementById('nov-matrix-excel-skip-errors')?.checked === true;
    const canProceed = !hasRowOrCellErrors || skipChecked;

    if (btnGrid) btnGrid.disabled = !canProceed;
    if (btnImport) btnImport.disabled = !canProceed;
  }

  async loadMatrixExcelIntoDraftGrid() {
    const st = this._matrixExcelState;
    const res = st?.parsedResult;
    if (!st || !res || res.hasFatalHeaderErrors || res.validItems.length === 0) return;

    const validColIds = res.validColumns.map((c) => c.concept.id);
    const state = this.ensureNovMatrixState();

    if (state.periodId !== st.periodId || state.employees.length === 0) {
      await this.loadNovNoPersMatrix({ periodId: st.periodId, preselectConceptIds: validColIds });
    } else {
      const missingCols = validColIds.filter((id) => state.conceptMap.has(id) && !state.selectedConceptIds.includes(id));
      if (missingCols.length > 0) {
        state.selectedConceptIds.push(...missingCols);
        await this.hydrateMatrixNoveltiesForConcepts(missingCols);
        this.refreshMatrixConceptPicker();
      }
    }

    this.pushMatrixUndoSnapshot();

    for (const item of res.validItems) {
      const concept = state.conceptMap.get(item.conceptId);
      if (!concept) continue;
      const inputType = getConceptInputType(concept);
      const valNum = inputType === 'AMOUNT' ? Number(item.amount || 0) : Number(item.units || 0);
      if (valNum <= 0) continue;

      const key = makeCellKey(item.employeeId, item.conceptId);
      const existingCls = this.getMatrixCellClassification(item.employeeId, concept);
      state.draftMap.set(key, {
        empty: false,
        value: valNum,
        notes: existingCls.notes || '',
        rawText: formatCellValueForInput(valNum, inputType),
        invalid: false,
        error: null,
      });
    }

    if (res.hasSensitiveDeductions) {
      state.hasClonedSensitiveDeduction = true;
    }

    getBootstrapModal(document.getElementById('modal-novelties-import-matrix-excel'))?.hide();

    const matrixPane = document.getElementById('pane-nov-nopers-matrix');
    if (matrixPane && !matrixPane.classList.contains('active')) {
      this._skipNextMatrixLoad = true;
      this.activePayrollPeriodId = st.periodId;
      this.switchPayrollPane('#pane-nov-nopers-matrix');
    }

    this.renderNovMatrix();
    showToast(`Se cargaron ${res.validItems.length} novedades del Excel en el borrador de la grilla`);
  }

  async confirmMatrixExcelDirectImport() {
    const st = this._matrixExcelState;
    const res = st?.parsedResult;
    if (!st || !res || res.hasFatalHeaderErrors || res.validItems.length === 0) return;

    const btnImport = document.getElementById('btn-confirm-matrix-excel-import');
    const btnGrid = document.getElementById('btn-load-matrix-excel-to-grid');
    if (btnImport) {
      btnImport.disabled = true;
      btnImport.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Importando...';
    }
    if (btnGrid) btnGrid.disabled = true;

    try {
      const apiRes = await apiRequest(`/payroll/periods/${st.periodId}/novelties/batch`, {
        method: 'POST',
        body: JSON.stringify({
          items: res.validItems,
          returnData: false,
          requireActiveEmployees: true,
        }),
      });

      const savedCount = apiRes?.data?.savedCount ?? apiRes?.savedCount ?? res.validItems.length;
      showToast(`Importación Excel completada: ${savedCount} novedad(es) registrada(s)`);
      getBootstrapModal(document.getElementById('modal-novelties-import-matrix-excel'))?.hide();

      const matrixState = this.ensureNovMatrixState();
      if (matrixState.periodId === st.periodId && matrixState.selectedConceptIds.length > 0) {
        await this.hydrateMatrixNoveltiesForConcepts(matrixState.selectedConceptIds);
        for (const it of res.validItems) {
          matrixState.draftMap.delete(makeCellKey(it.employeeId, it.conceptId));
        }
        this.renderNovMatrix();
      }

      const conPeriodId = document.getElementById('nov-nopers-con-period-select')?.value;
      const conSelectId = document.getElementById('nov-nopers-con-select')?.value;
      if (document.getElementById('pane-nov-nopers-con')?.classList.contains('active') && conPeriodId === st.periodId && conSelectId) {
        await this.refreshNovNoPersConTable(conPeriodId, conSelectId);
      }
    } catch (err) {
      const errBox = document.getElementById('nov-matrix-excel-error-alert');
      if (errBox) {
        errBox.textContent = err.message || 'Error al importar novedades desde Excel';
        errBox.classList.remove('d-none');
      }
      showToast(err.message || 'Error al importar novedades desde Excel', 'danger');
    } finally {
      if (btnImport) {
        btnImport.innerHTML = '<i class="ti ti-upload me-1"></i> Importar al Período';
      }
      this.updateMatrixExcelActionButtons();
    }
  }
}

export function registerNoveltyMatrixSheetMethods(proto) {
  Object.getOwnPropertyNames(MatrixMixinMethods.prototype).forEach((name) => {
    if (name !== 'constructor') {
      proto[name] = MatrixMixinMethods.prototype[name];
    }
  });
}
