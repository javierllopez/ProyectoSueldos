import { evaluateCalculatedColumn, getConceptAmount } from './formula-evaluator.js';

/**
 * Obtiene el catálogo de campos disponibles en el sistema para diseñar informes,
 * más el padrón de legajos y valores de agrupación para los filtros de emisión.
 */
export async function getReportMetadata(tenantClient) {
  // Obtener conceptos activos del tenant y empleados activos en paralelo
  const [concepts, employees] = await Promise.all([
    tenantClient.concept.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        arcaConceptCode: true,
      },
      orderBy: { code: 'asc' },
    }),
    tenantClient.employee.findMany({
      where: { deletedAt: null },
      include: {
        department: true,
        jobPosition: {
          include: {
            cct: true,
          },
        },
      },
      orderBy: { fileNumber: 'asc' },
    }),
  ]);

  const compareNatural = (a, b) =>
    String(a ?? '')
      .trim()
      .localeCompare(String(b ?? '').trim(), undefined, { numeric: true, sensitivity: 'base' });

  const employeesCatalog = employees
    .map((emp) => {
      const fullName = `${emp.lastName || ''}, ${emp.firstName || ''}`.trim().replace(/^,|,$/g, '');
      const groupValues = {
        'employee.fileNumber': String(emp.fileNumber || ''),
        'employee.status': String(emp.status || 'ACTIVE'),
        'department.name': String(emp.department?.name || 'Sin Asignar'),
        'jobPosition.name': String(emp.jobPosition?.name || 'Sin Asignar'),
        'jobPosition.cct': String(emp.jobPosition?.cct?.name || emp.jobPosition?.cctCode || 'Fuera de CCT'),
        'employee.payrollGroup': String(emp.payrollGroup || 'MENSUAL'),
      };
      return {
        id: emp.id,
        fileNumber: String(emp.fileNumber || ''),
        fullName,
        status: emp.status || 'ACTIVE',
        groupValues,
      };
    })
    .sort((a, b) => compareNatural(a.fileNumber, b.fileNumber));

  const groupableKeys = [
    'department.name',
    'jobPosition.name',
    'jobPosition.cct',
    'employee.payrollGroup',
    'employee.status',
    'employee.fileNumber',
  ];
  const groupOptionsByField = {};
  for (const key of groupableKeys) {
    const uniqueSet = new Set();
    for (const emp of employeesCatalog) {
      const val = emp.groupValues[key];
      if (val) uniqueSet.add(val);
    }
    groupOptionsByField[key] = Array.from(uniqueSet).sort(compareNatural);
  }

  return {
    categories: [
      {
        id: 'employee',
        name: 'Datos del Personal',
        fields: [
          { id: 'employee.fileNumber', title: 'Legajo', type: 'FIELD', format: 'TEXT', align: 'left', groupable: true },
          { id: 'employee.fullName', title: 'Apellido y Nombre', type: 'FIELD', format: 'TEXT', align: 'left', groupable: false },
          { id: 'employee.cuil', title: 'CUIL', type: 'FIELD', format: 'TEXT', align: 'center', groupable: false },
          { id: 'employee.documentNumber', title: 'DNI / Documento', type: 'FIELD', format: 'TEXT', align: 'center', groupable: false },
          { id: 'employee.hireDate', title: 'Fecha de Ingreso', type: 'FIELD', format: 'DATE', align: 'center', groupable: false },
          { id: 'employee.status', title: 'Estado (Activo/Inactivo)', type: 'FIELD', format: 'TEXT', align: 'center', groupable: true },
          { id: 'department.name', title: 'Departamento / Sector', type: 'FIELD', format: 'TEXT', align: 'left', groupable: true },
          { id: 'jobPosition.name', title: 'Puesto / Cargo', type: 'FIELD', format: 'TEXT', align: 'left', groupable: true },
          { id: 'jobPosition.cct', title: 'Convenio Colectivo (CCT)', type: 'FIELD', format: 'TEXT', align: 'left', groupable: true },
          { id: 'employee.payrollGroup', title: 'Grupo de Pago', type: 'FIELD', format: 'TEXT', align: 'left', groupable: true },
          { id: 'employee.basicSalary', title: 'Sueldo Básico Pactado', type: 'FIELD', format: 'CURRENCY', align: 'right', totalize: true, groupable: false },
        ],
      },
      {
        id: 'payroll',
        name: 'Totales de Liquidación',
        fields: [
          { id: 'payslip.grossSalary', title: 'Sueldo Bruto Total', type: 'FIELD', format: 'CURRENCY', align: 'right', totalize: true, groupable: false },
          { id: 'payslip.remunerativeSalary', title: 'Total Remunerativo', type: 'FIELD', format: 'CURRENCY', align: 'right', totalize: true, groupable: false },
          { id: 'payslip.nonRemunerative', title: 'Total No Remunerativo', type: 'FIELD', format: 'CURRENCY', align: 'right', totalize: true, groupable: false },
          { id: 'payslip.totalDeductions', title: 'Total Descuentos / Retenciones', type: 'FIELD', format: 'CURRENCY', align: 'right', totalize: true, groupable: false },
          { id: 'payslip.netSalary', title: 'Sueldo Neto a Cobrar', type: 'FIELD', format: 'CURRENCY', align: 'right', totalize: true, groupable: false },
          { id: 'payslip.costEmployer', title: 'Costo Empresa (Bruto + Cargas)', type: 'FIELD', format: 'CURRENCY', align: 'right', totalize: true, groupable: false },
          { id: 'payslip.workedDays', title: 'Días Trabajados', type: 'FIELD', format: 'NUMBER', align: 'center', totalize: false, groupable: false },
          { id: 'payslip.paymentMethod', title: 'Forma de Pago', type: 'FIELD', format: 'TEXT', align: 'center', groupable: true },
          { id: 'payslip.bankName', title: 'Banco', type: 'FIELD', format: 'TEXT', align: 'left', groupable: true },
          { id: 'payslip.cbu', title: 'CBU', type: 'FIELD', format: 'TEXT', align: 'left', groupable: false },
        ],
      },
      {
        id: 'concepts',
        name: 'Conceptos Individuales de Nómina',
        fields: concepts.map((c) => ({
          id: `concept.${c.code}`,
          conceptCode: c.code,
          title: `[${c.code}] ${c.name}`,
          type: 'FIELD',
          format: 'CURRENCY',
          align: 'right',
          totalize: true,
          conceptType: c.type,
          groupable: false,
        })),
      },
    ],
    operators: [
      { id: 'EQUALS', label: 'Es igual a' },
      { id: 'NOT_EQUALS', label: 'Es distinto de' },
      { id: 'CONTAINS', label: 'Contiene' },
      { id: 'IN', label: 'Está en la lista' },
      { id: 'GT', label: 'Mayor que (>)' },
      { id: 'GTE', label: 'Mayor o igual que (>=)' },
      { id: 'LT', label: 'Menor que (<)' },
      { id: 'LTE', label: 'Menor o igual que (<=)' },
      { id: 'BETWEEN', label: 'Entre (mín, máx)' },
    ],
    employeesCatalog,
    groupOptionsByField,
    groupFieldLabels: GROUP_FIELD_LABELS,
  };
}

/**
 * Resuelve el valor de un campo específico para una fila unificada
 */
function resolveFieldValue(fieldId, row) {
  if (!row) return '';

  if (fieldId.startsWith('concept.')) {
    const code = fieldId.replace('concept.', '');
    return getConceptAmount(row, code);
  }

  switch (fieldId) {
    case 'employee.fileNumber':
      return row.employee?.fileNumber || '';
    case 'employee.fullName':
      return `${row.employee?.lastName || ''}, ${row.employee?.firstName || ''}`.trim().replace(/^,|,$/g, '');
    case 'employee.lastName':
      return row.employee?.lastName || '';
    case 'employee.firstName':
      return row.employee?.firstName || '';
    case 'employee.cuil':
      return row.employee?.cuil || '';
    case 'employee.documentNumber':
      return row.employee?.documentNumber || '';
    case 'employee.hireDate':
      return row.employee?.hireDate ? new Date(row.employee.hireDate).toISOString().split('T')[0] : '';
    case 'employee.status':
      return row.employee?.status || '';
    case 'department.name':
      return row.employee?.department?.name || 'Sin Asignar';
    case 'jobPosition.name':
      return row.employee?.jobPosition?.name || 'Sin Asignar';
    case 'jobPosition.cct':
      return row.employee?.jobPosition?.cct?.name || row.employee?.jobPosition?.cctCode || 'Fuera de CCT';
    case 'employee.payrollGroup':
      return row.employee?.payrollGroup || 'MENSUAL';
    case 'employee.basicSalary':
      return Number(row.employee?.basicSalary || 0);
    case 'payslip.grossSalary':
      return Number(row.payslip?.grossSalary || 0);
    case 'payslip.remunerativeSalary':
      return Number(row.payslip?.remunerativeSalary || 0);
    case 'payslip.nonRemunerative':
      return Number(row.payslip?.nonRemunerative || 0);
    case 'payslip.totalDeductions':
      return Number(row.payslip?.totalDeductions || 0);
    case 'payslip.netSalary':
      return Number(row.payslip?.netSalary || 0);
    case 'payslip.costEmployer': {
      const gross = Number(row.payslip?.grossSalary || 0);
      const contrib =
        Number(row.payslip?.sipaContrib || 0) +
        Number(row.payslip?.inssjypContrib || 0) +
        Number(row.payslip?.osContrib || 0) +
        Number(row.payslip?.fneContrib || 0) +
        Number(row.payslip?.aaffContrib || 0) +
        Number(row.payslip?.artContrib || 0) +
        Number(row.payslip?.scvoContrib || 0) +
        Number(row.payslip?.unionContrib || 0);
      return Math.round((gross + contrib) * 100) / 100;
    }
    case 'payslip.workedDays':
      return row.payslip?.workedDays || 30;
    case 'payslip.paymentMethod':
      return row.payslip?.paymentMethod || 'CBU';
    case 'payslip.bankName':
      return row.payslip?.bankName || '';
    case 'payslip.cbu':
      return row.payslip?.cbu || row.employee?.cbu || '';
    case 'period.label':
      return row.periodLabel || row.payslip?._periodLabel || '';
    default:
      return row[fieldId] !== undefined ? row[fieldId] : '';
  }
}

/**
 * Calcula la agregación solicitada (SUM, AVG, COUNT, MIN, MAX) para una columna sobre un conjunto de filas.
 */
export function computeAggregation(rows, colId, aggregation = 'SUM') {
  if (!rows || rows.length === 0) return 0;
  const mode = String(aggregation || 'SUM').toUpperCase();

  if (mode === 'COUNT') {
    return rows.filter((r) => r[colId] !== null && r[colId] !== undefined && r[colId] !== '').length;
  }

  const nums = rows.map((r) => Number(r[colId])).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return 0;

  switch (mode) {
    case 'AVG':
      return Math.round((nums.reduce((acc, v) => acc + v, 0) / nums.length + Number.EPSILON) * 100) / 100;
    case 'MIN':
      return Math.round((Math.min(...nums) + Number.EPSILON) * 100) / 100;
    case 'MAX':
      return Math.round((Math.max(...nums) + Number.EPSILON) * 100) / 100;
    case 'SUM':
    default:
      return Math.round((nums.reduce((acc, v) => acc + v, 0) + Number.EPSILON) * 100) / 100;
  }
}

const GROUP_FIELD_LABELS = {
  'period.label': 'Período de Liquidación',
  'employee.fileNumber': 'Legajo',
  'employee.fullName': 'Apellido y Nombre',
  'employee.cuil': 'CUIL',
  'employee.documentNumber': 'DNI / Documento',
  'employee.hireDate': 'Fecha de Ingreso',
  'employee.status': 'Estado',
  'department.name': 'Departamento / Sector',
  'jobPosition.name': 'Puesto / Cargo',
  'jobPosition.cct': 'Convenio Colectivo (CCT)',
  'employee.payrollGroup': 'Grupo de Pago',
  'payslip.paymentMethod': 'Forma de Pago',
  'payslip.bankName': 'Banco',
};

/**
 * Agrupa recursivamente las filas por los campos de agrupación especificados.
 */
function buildGroupTree(rows, groupings, columns, totals, level = 0) {
  if (level >= groupings.length) {
    return { isLeaf: true, rows };
  }

  const groupField = groupings[level];
  const groupFieldLabel = GROUP_FIELD_LABELS[groupField] || groupField;
  const map = new Map();

  for (const row of rows) {
    const key = String(row[groupField] || 'Sin Asignar');
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(row);
  }

  const groups = [];

  for (const [groupKey, groupRows] of map.entries()) {
    // Calcular subtotales y porcentajes sobre el total general
    const subtotals = {};
    const groupPercentages = {};
    for (const col of columns) {
      if (col.totalize || col.format === 'PERCENT_GROUP' || col.format === 'PERCENT_TOTAL') {
        const rawSubtotal = computeAggregation(groupRows, col.id, col.aggregation || 'SUM');
        subtotals[col.id] = rawSubtotal;

        const grandTotal = totals ? Number(totals[col.id]) || 0 : 0;
        if (Math.abs(grandTotal) > 0) {
          groupPercentages[col.id] =
            Math.round(((rawSubtotal / grandTotal) * 100 + Number.EPSILON) * 100) / 100;
        } else {
          groupPercentages[col.id] = 0;
        }

        if (col.format === 'PERCENT_TOTAL') {
          subtotals[col.id] = groupPercentages[col.id];
        }
      }
    }

    // Si es hoja y hay columnas PERCENT_GROUP, calcular el porcentaje de cada fila respecto al subtotal del grupo
    if (level + 1 >= groupings.length) {
      for (const col of columns) {
        if (col.format === 'PERCENT_GROUP') {
          const grpSum = subtotals[col.id] || 0;
          for (const r of groupRows) {
            const rawVal = Number(r[col.id]) || 0;
            r[col.id] =
              Math.abs(grpSum) > 0
                ? Math.round(((rawVal / grpSum) * 100 + Number.EPSILON) * 100) / 100
                : 0;
          }
          subtotals[col.id] = Math.abs(grpSum) > 0 ? 100 : 0;
        }
      }
    } else {
      for (const col of columns) {
        if (col.format === 'PERCENT_GROUP') {
          const grpSum = subtotals[col.id] || 0;
          subtotals[col.id] = Math.abs(grpSum) > 0 ? 100 : 0;
        }
      }
    }

    const child = buildGroupTree(groupRows, groupings, columns, totals, level + 1);

    groups.push({
      groupField,
      groupFieldLabel,
      groupKey,
      count: groupRows.length,
      subtotals,
      groupPercentages,
      ...child,
    });
  }

  return { isLeaf: false, groups };
}

function formatPeriodName(p) {
  if (!p) return 'Nómina Activa';
  const mm = String(p.month || 1).padStart(2, '0');
  return `${mm}/${p.year} - ${p.settlementName || p.name || p.periodType}`;
}

function compareFileNumbers(a, b) {
  return String(a ?? '')
    .trim()
    .localeCompare(String(b ?? '').trim(), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Ejecuta el informe sobre los datos del tenant.
 */
export async function executeReportData(
  tenantClient,
  config,
  {
    periodId,
    periodFromId,
    periodToId,
    multiPeriodMode = 'SUM',
    groupFilterLevel1,
    groupFilterLevel2,
    employeeFrom,
    employeeTo,
    filtersOverride = [],
  } = {}
) {
  // 1. Obtener el o los períodos de liquidación seleccionados
  let selectedPeriods = [];
  const effectiveFromId = periodFromId || periodId || null;
  const effectiveToId = periodToId || periodFromId || periodId || null;

  if (effectiveFromId || effectiveToId) {
    const allPeriods = await tenantClient.payrollPeriod.findMany({
      orderBy: [{ year: 'asc' }, { month: 'asc' }, { createdAt: 'asc' }],
    });

    const idxFrom = effectiveFromId ? allPeriods.findIndex((p) => p.id === effectiveFromId) : -1;
    const idxTo = effectiveToId ? allPeriods.findIndex((p) => p.id === effectiveToId) : -1;

    if (idxFrom !== -1 && idxTo !== -1) {
      const startIdx = Math.min(idxFrom, idxTo);
      const endIdx = Math.max(idxFrom, idxTo);
      selectedPeriods = allPeriods.slice(startIdx, endIdx + 1);
    } else if (idxFrom !== -1) {
      selectedPeriods = [allPeriods[idxFrom]];
    } else if (idxTo !== -1) {
      selectedPeriods = [allPeriods[idxTo]];
    }
  }

  if (selectedPeriods.length === 0) {
    // Priorizar el período más reciente que posea recibos liquidados,
    // prefiriendo liquidaciones generales mensuales sobre liquidaciones individuales
    const recentPeriods = await tenantClient.payrollPeriod.findMany({
      include: {
        _count: { select: { paySlips: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
      take: 15,
    });

    if (recentPeriods.length > 0) {
      const periodsWithSlips = recentPeriods.filter((p) => (p._count?.paySlips || 0) > 0);
      if (periodsWithSlips.length > 0) {
        const latestYear = periodsWithSlips[0].year;
        const latestMonth = periodsWithSlips[0].month;
        const sameMonthPeriods = periodsWithSlips.filter(
          (p) => p.year === latestYear && p.month === latestMonth
        );
        sameMonthPeriods.sort((a, b) => {
          if (b._count.paySlips !== a._count.paySlips) {
            return b._count.paySlips - a._count.paySlips;
          }
          const aIsMonthly = a.periodType === 'MONTHLY' ? 1 : 0;
          const bIsMonthly = b.periodType === 'MONTHLY' ? 1 : 0;
          return bIsMonthly - aIsMonthly;
        });
        selectedPeriods = [sameMonthPeriods[0]];
      } else {
        selectedPeriods = [recentPeriods[0]];
      }
    }
  }

  const periodsMap = new Map();
  selectedPeriods.forEach((p, idx) => {
    periodsMap.set(p.id, { period: p, orderIdx: idx, label: formatPeriodName(p) });
  });

  // 2. Obtener perfil de la empresa (cabecera institucional)
  const companyProfile = await tenantClient.companyProfile.findFirst();

  // 3. Consultar recibos con sus empleados y conceptos para todos los períodos del rango
  const periodIds = selectedPeriods.map((p) => p.id);
  let paySlips = await tenantClient.paySlip.findMany({
    where: periodIds.length > 0 ? { payrollPeriodId: { in: periodIds } } : {},
    include: {
      employee: {
        include: {
          department: true,
          jobPosition: {
            include: {
              cct: true,
            },
          },
          salaryScale: true,
        },
      },
      items: true,
    },
    orderBy: [{ employee: { fileNumber: 'asc' } }],
  });

  // Ordenar recibos cronológicamente por período y luego por número de legajo natural
  paySlips.sort((a, b) => {
    const pOrderA = periodsMap.get(a.payrollPeriodId)?.orderIdx ?? 0;
    const pOrderB = periodsMap.get(b.payrollPeriodId)?.orderIdx ?? 0;
    if (pOrderA !== pOrderB) return pOrderA - pOrderB;
    return compareFileNumbers(a.employee?.fileNumber, b.employee?.fileNumber);
  });

  // Si aún no hay recibos liquidados en el rango de períodos, usar nómina activa de empleados como base
  if (paySlips.length === 0) {
    const activeEmployees = await tenantClient.employee.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      include: {
        department: true,
        jobPosition: {
          include: {
            cct: true,
          },
        },
        salaryScale: true,
      },
      orderBy: { fileNumber: 'asc' },
    });

    const fallbackPeriodId = selectedPeriods[0]?.id || 'active';
    paySlips = activeEmployees.map((emp) => ({
      id: `emp-${emp.id}`,
      employeeId: emp.id,
      payrollPeriodId: fallbackPeriodId,
      employee: emp,
      grossSalary: emp.basicSalary || 0,
      remunerativeSalary: emp.basicSalary || 0,
      nonRemunerative: 0,
      totalDeductions: 0,
      netSalary: emp.basicSalary || 0,
      workedDays: 30,
      paymentMethod: 'CBU',
      bankName: '',
      cbu: emp.cbu || '',
      items: [],
    }));
  }

  const effectiveMultiMode = multiPeriodMode === 'GROUP_BY_PERIOD' ? 'GROUP_BY_PERIOD' : 'SUM';

  // Si se seleccionó modo SUM (Sumar períodos por empleado) y hay recibos de uno o varios períodos,
  // consolidar por employeeId sumando totales y conceptos antes de evaluar las fórmulas
  if (effectiveMultiMode === 'SUM' && selectedPeriods.length > 1) {
    const consolidatedByEmp = new Map();

    for (const ps of paySlips) {
      const empKey = ps.employeeId || ps.employee?.id || ps.id;
      if (!consolidatedByEmp.has(empKey)) {
        consolidatedByEmp.set(empKey, {
          id: ps.id,
          employeeId: ps.employeeId,
          payrollPeriodId: ps.payrollPeriodId,
          employee: ps.employee,
          grossSalary: Number(ps.grossSalary || 0),
          remunerativeSalary: Number(ps.remunerativeSalary || 0),
          nonRemunerative: Number(ps.nonRemunerative || 0),
          totalDeductions: Number(ps.totalDeductions || 0),
          netSalary: Number(ps.netSalary || 0),
          workedDays: Number(ps.workedDays || 0),
          sipaContrib: Number(ps.sipaContrib || 0),
          inssjypContrib: Number(ps.inssjypContrib || 0),
          osContrib: Number(ps.osContrib || 0),
          fneContrib: Number(ps.fneContrib || 0),
          aaffContrib: Number(ps.aaffContrib || 0),
          artContrib: Number(ps.artContrib || 0),
          scvoContrib: Number(ps.scvoContrib || 0),
          unionContrib: Number(ps.unionContrib || 0),
          paymentMethod: ps.paymentMethod || 'CBU',
          bankName: ps.bankName || '',
          cbu: ps.cbu || ps.employee?.cbu || '',
          _itemsMap: new Map(),
        });
      } else {
        const acc = consolidatedByEmp.get(empKey);
        acc.grossSalary += Number(ps.grossSalary || 0);
        acc.remunerativeSalary += Number(ps.remunerativeSalary || 0);
        acc.nonRemunerative += Number(ps.nonRemunerative || 0);
        acc.totalDeductions += Number(ps.totalDeductions || 0);
        acc.netSalary += Number(ps.netSalary || 0);
        acc.workedDays += Number(ps.workedDays || 0);
        acc.sipaContrib += Number(ps.sipaContrib || 0);
        acc.inssjypContrib += Number(ps.inssjypContrib || 0);
        acc.osContrib += Number(ps.osContrib || 0);
        acc.fneContrib += Number(ps.fneContrib || 0);
        acc.aaffContrib += Number(ps.aaffContrib || 0);
        acc.artContrib += Number(ps.artContrib || 0);
        acc.scvoContrib += Number(ps.scvoContrib || 0);
        acc.unionContrib += Number(ps.unionContrib || 0);
      }

      const target = consolidatedByEmp.get(empKey);
      for (const it of ps.items || []) {
        const prevAmt = target._itemsMap.get(it.conceptCode) || 0;
        target._itemsMap.set(it.conceptCode, prevAmt + Number(it.amount || 0));
      }
    }

    paySlips = Array.from(consolidatedByEmp.values())
      .map((acc) => {
        const items = Array.from(acc._itemsMap.entries()).map(([conceptCode, amount]) => ({
          conceptCode,
          amount: Math.round((amount + Number.EPSILON) * 100) / 100,
        }));
        delete acc._itemsMap;
        acc.items = items;
        return acc;
      })
      .sort((a, b) => compareFileNumbers(a.employee?.fileNumber, b.employee?.fileNumber));
  }

  // Determinar agrupaciones efectivas:
  // En modo GROUP_BY_PERIOD, el período es la agrupación principal (Nivel 1), manteniendo debajo las del informe
  const baseTemplateGroupings = (config.groupings || []).filter(Boolean);
  const effectiveGroupings =
    effectiveMultiMode === 'GROUP_BY_PERIOD'
      ? ['period.label', ...baseTemplateGroupings.filter((g) => g !== 'period.label')]
      : [...baseTemplateGroupings];

  // 4. Transformar a filas aplanadas evaluando conceptos y fórmulas
  const columns = config.fields || config.columns || [];
  const processedRows = [];

  for (const ps of paySlips) {
    const conceptsMap = {};
    for (const it of ps.items || []) {
      conceptsMap[it.conceptCode] = (conceptsMap[it.conceptCode] || 0) + Number(it.amount || 0);
    }

    const periodInfo = periodsMap.get(ps.payrollPeriodId);
    const periodLabel = periodInfo ? periodInfo.label : formatPeriodName(selectedPeriods[0]);
    ps._periodLabel = periodLabel;

    const unifiedRow = {
      id: ps.id,
      employeeId: ps.employeeId,
      employee: ps.employee,
      payslip: ps,
      items: ps.items,
      conceptsMap,
      periodLabel,
    };

    // Resolver cada columna para esta fila
    const rowOutput = {
      _raw: { id: ps.id, employeeId: ps.employeeId, payrollPeriodId: ps.payrollPeriodId },
    };

    for (const col of columns) {
      if (col.type === 'CALCULATED') {
        rowOutput[col.id] = evaluateCalculatedColumn(col.formula, unifiedRow);
      } else {
        const sourceField = col.source || col.id;
        rowOutput[col.id] = resolveFieldValue(sourceField, unifiedRow);
      }
    }

    // Asegurar resolución de campos clave para filtros, agrupaciones y fallback de identificación
    if (rowOutput['employee.fileNumber'] === undefined) {
      rowOutput['employee.fileNumber'] = resolveFieldValue('employee.fileNumber', unifiedRow);
    }
    if (rowOutput['employee.fullName'] === undefined) {
      rowOutput['employee.fullName'] = resolveFieldValue('employee.fullName', unifiedRow);
    }
    if (rowOutput['period.label'] === undefined) {
      rowOutput['period.label'] = periodLabel;
    }
    for (const groupField of effectiveGroupings) {
      if (rowOutput[groupField] === undefined) {
        rowOutput[groupField] = resolveFieldValue(groupField, unifiedRow);
      }
    }
    if (config.chart?.xAxisField && rowOutput[config.chart.xAxisField] === undefined) {
      rowOutput[config.chart.xAxisField] = resolveFieldValue(config.chart.xAxisField, unifiedRow);
    }
    if (config.chart?.yAxisField && rowOutput[config.chart.yAxisField] === undefined) {
      rowOutput[config.chart.yAxisField] = resolveFieldValue(config.chart.yAxisField, unifiedRow);
    }

    processedRows.push(rowOutput);
  }

  // 5. Aplicar filtros dinámicos + filtros del modal de emisión (Grupo Nivel 1/2 y Rango de Legajos)
  const allFilters = [...(config.filters || []), ...(filtersOverride || [])];
  let filteredRows = processedRows;

  // 5.1. Filtro por Grupo de Selección (Nivel 1 y Nivel 2 de la plantilla)
  const tplGroup1 = baseTemplateGroupings[0] || null;
  const tplGroup2 = baseTemplateGroupings[1] || null;

  if (tplGroup1 && groupFilterLevel1 && groupFilterLevel1 !== 'ALL') {
    filteredRows = filteredRows.filter(
      (r) => String(r[tplGroup1] || '').toLowerCase() === String(groupFilterLevel1).toLowerCase()
    );
  }
  if (tplGroup2 && groupFilterLevel2 && groupFilterLevel2 !== 'ALL') {
    filteredRows = filteredRows.filter(
      (r) => String(r[tplGroup2] || '').toLowerCase() === String(groupFilterLevel2).toLowerCase()
    );
  }

  // 5.2. Filtro por Rango de Legajos (Desde / Hasta con opción "ALL")
  const hasEmpFrom = employeeFrom && employeeFrom !== 'ALL';
  const hasEmpTo = employeeTo && employeeTo !== 'ALL';
  if (hasEmpFrom || hasEmpTo) {
    let minEmp = hasEmpFrom ? String(employeeFrom).trim() : null;
    let maxEmp = hasEmpTo ? String(employeeTo).trim() : null;
    if (minEmp && maxEmp && compareFileNumbers(minEmp, maxEmp) > 0) {
      const tmp = minEmp;
      minEmp = maxEmp;
      maxEmp = tmp;
    }

    filteredRows = filteredRows.filter((r) => {
      const fn = String(r['employee.fileNumber'] || '').trim();
      if (minEmp && compareFileNumbers(fn, minEmp) < 0) return false;
      if (maxEmp && compareFileNumbers(fn, maxEmp) > 0) return false;
      return true;
    });
  }

  if (allFilters.length > 0) {
    filteredRows = filteredRows.filter((row) => {
      return allFilters.every((f) => {
        const val = row[f.field];
        if (val === undefined) return true;

        switch (f.operator) {
          case 'EQUALS':
            return String(val).toLowerCase() === String(f.value).toLowerCase();
          case 'NOT_EQUALS':
            return String(val).toLowerCase() !== String(f.value).toLowerCase();
          case 'CONTAINS':
            return String(val).toLowerCase().includes(String(f.value).toLowerCase());
          case 'IN':
            return Array.isArray(f.value) ? f.value.includes(val) : false;
          case 'GT':
            return Number(val) > Number(f.value);
          case 'GTE':
            return Number(val) >= Number(f.value);
          case 'LT':
            return Number(val) < Number(f.value);
          case 'LTE':
            return Number(val) <= Number(f.value);
          case 'BETWEEN': {
            const range = Array.isArray(f.value)
              ? f.value
              : String(f.value ?? '')
                  .split(',')
                  .map((s) => s.trim());
            if (range.length < 2) return true;
            const numVal = Number(val);
            const min = Number(range[0]);
            const max = Number(range[1]);
            return Number.isFinite(numVal) && numVal >= min && numVal <= max;
          }
          default:
            return true;
        }
      });
    });
  }

  // 5.5. Excluir registros cuyas columnas numéricas / de liquidación estén todas en 0
  const numericValueFormats = new Set(['CURRENCY', 'NUMBER', 'PERCENT', 'PERCENT_GROUP', 'PERCENT_TOTAL']);
  const valueColumns = columns.filter(
    (col) =>
      col.type === 'CALCULATED' ||
      col.type === 'CONCEPT' ||
      col.totalize === true ||
      numericValueFormats.has(col.format)
  );

  if (valueColumns.length > 0) {
    filteredRows = filteredRows.filter((row) =>
      valueColumns.some((col) => {
        const num = Number(row[col.id]);
        return Number.isFinite(num) && Math.abs(num) > 0.0001;
      })
    );
  }

  // 6. Calcular Totales Generales (sobre valores base antes de transformar porcentajes)
  const totals = {};
  for (const col of columns) {
    if (col.totalize || col.format === 'PERCENT_GROUP' || col.format === 'PERCENT_TOTAL') {
      totals[col.id] = computeAggregation(filteredRows, col.id, col.aggregation || 'SUM');
    }
  }

  // 7. Construir árbol de grupos (calculando subtotales y groupPercentages)
  let groupedData = null;
  if (effectiveGroupings.length > 0) {
    groupedData = buildGroupTree(filteredRows, effectiveGroupings, columns, totals);
    for (const col of columns) {
      if (col.format === 'PERCENT_GROUP') {
        const grandTotal = totals[col.id] || 0;
        totals[col.id] = Math.abs(grandTotal) > 0 ? 100 : 0;
      }
    }
  } else {
    // Si no hay agrupación pero una columna pidió PERCENT_GROUP, usar el total general como base
    for (const col of columns) {
      if (col.format === 'PERCENT_GROUP') {
        const grandTotal = totals[col.id] || 0;
        for (const r of filteredRows) {
          const rawVal = Number(r[col.id]) || 0;
          r[col.id] =
            Math.abs(grandTotal) > 0
              ? Math.round(((rawVal / grandTotal) * 100 + Number.EPSILON) * 100) / 100
              : 0;
        }
        totals[col.id] = Math.abs(grandTotal) > 0 ? 100 : 0;
      }
    }
  }

  // Transformar columnas PERCENT_TOTAL respecto al total general
  for (const col of columns) {
    if (col.format === 'PERCENT_TOTAL') {
      const grandTotal = totals[col.id] || 0;
      for (const r of filteredRows) {
        const rawVal = Number(r[col.id]) || 0;
        r[col.id] =
          Math.abs(grandTotal) > 0
            ? Math.round(((rawVal / grandTotal) * 100 + Number.EPSILON) * 100) / 100
            : 0;
      }
      totals[col.id] = Math.abs(grandTotal) > 0 ? 100 : 0;
    }
  }

  // 8. Construir datos para el Gráfico si está habilitado
  let chartData = null;
  if (config.chart && config.chart.enabled && config.chart.xAxisField && config.chart.yAxisField) {
    const xField = config.chart.xAxisField;
    const yField = config.chart.yAxisField;
    const aggMode = config.chart.aggregation || 'SUM';
    const groupRowsMap = new Map();

    for (const r of filteredRows) {
      let xValRaw = r[xField];
      if (xValRaw === undefined) {
        xValRaw = 'Otros';
      }
      const xVal = String(xValRaw || 'Sin Asignar');
      if (!groupRowsMap.has(xVal)) {
        groupRowsMap.set(xVal, []);
      }
      groupRowsMap.get(xVal).push(r);
    }

    const categories = Array.from(groupRowsMap.keys());
    const seriesData = categories.map((cat) => computeAggregation(groupRowsMap.get(cat), yField, aggMode));

    chartData = {
      type: config.chart.type || 'bar',
      title: config.chart.title || 'Resumen Gráfico',
      categories,
      series: [
        {
          name: columns.find((c) => c.id === yField)?.title || yField,
          data: seriesData,
        },
      ],
    };
  }

  // 9. Si hay agrupaciones activas, no repetir las columnas de agrupación en el detalle
  const activeGroupings = new Set(effectiveGroupings);
  let detailColumns = columns;
  if (activeGroupings.size > 0) {
    detailColumns = columns.filter(
      (col) => !activeGroupings.has(col.id) && !activeGroupings.has(col.source)
    );
    const hasDescriptiveCol = detailColumns.some(
      (col) => !col.totalize && col.format !== 'PERCENT_GROUP' && col.format !== 'PERCENT_TOTAL'
    );
    if (!hasDescriptiveCol) {
      detailColumns = [
        {
          id: 'employee.fullName',
          title: 'Apellido y Nombre',
          type: 'FIELD',
          source: 'employee.fullName',
          format: 'TEXT',
          align: 'left',
          totalize: false,
          aggregation: 'SUM',
        },
        ...detailColumns,
      ];
    }
  }

  let periodSummaryLabel = 'Nómina Activa';
  if (selectedPeriods.length === 1) {
    periodSummaryLabel = formatPeriodName(selectedPeriods[0]);
  } else if (selectedPeriods.length > 1) {
    const firstLbl = formatPeriodName(selectedPeriods[0]);
    const lastLbl = formatPeriodName(selectedPeriods[selectedPeriods.length - 1]);
    const modeTag =
      effectiveMultiMode === 'GROUP_BY_PERIOD' ? 'Agrupado por Período' : 'Suma Consolidada';
    periodSummaryLabel = `Desde ${firstLbl} hasta ${lastLbl} (${selectedPeriods.length} períodos • ${modeTag})`;
  }

  return {
    meta: {
      companyName: companyProfile?.legalName || companyProfile?.tradeName || 'Empresa',
      cuit: companyProfile?.cuit || '',
      reportTitle: config.reportTitle || config.meta?.reportTitle || 'Informe de Liquidación de Haberes',
      periodName: periodSummaryLabel,
      subtotalPosition: config.subtotalPosition || 'FOOTER',
      showGroupPercentOfTotal: config.showGroupPercentOfTotal !== false,
      groupings: Array.from(activeGroupings),
      multiPeriodMode: effectiveMultiMode,
      periodCount: selectedPeriods.length,
      generatedAt: new Date().toISOString(),
      totalRows: filteredRows.length,
    },
    columns: detailColumns,
    flatRows: filteredRows,
    groupedData,
    totals,
    chartData,
  };
}

