import assert from 'assert';
import {
  getCctSummary,
  assignConceptByCct,
  batchImportConceptNovelties,
  deleteEmployeeConcept,
  deleteConceptAssignment,
  listEmployeeConcepts,
  listConceptAssignedEmployees,
} from './src/modules/employees/employee.service.js';

console.log('\n================================================================');
console.log('TEST SUITE: NOVEDADES PERSISTENTES (CCT, EXCEL Y EMBARGOS)');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// Mock Prisma Client para validar la lógica pura sin depender de base de datos viva
function createMockPrisma() {
  const employees = [
    {
      id: 'emp-1',
      fileNumber: 'L1001',
      firstName: 'Juan',
      lastName: 'Pérez',
      status: 'ACTIVE',
      deletedAt: null,
      jobPositionId: 'jp-1',
      jobPosition: {
        id: 'jp-1',
        name: 'Vendedor',
        cctCode: '130/75',
        cct: { code: '130/75', name: 'Comercio', description: 'CCT 130/75 Comercio' },
      },
    },
    {
      id: 'emp-2',
      fileNumber: 'L1002',
      firstName: 'María',
      lastName: 'Gómez',
      status: 'ACTIVE',
      deletedAt: null,
      jobPositionId: 'jp-1',
      jobPosition: {
        id: 'jp-1',
        name: 'Vendedora',
        cctCode: '130/75',
        cct: { code: '130/75', name: 'Comercio', description: 'CCT 130/75 Comercio' },
      },
    },
    {
      id: 'emp-3',
      fileNumber: 'L1003',
      firstName: 'Carlos',
      lastName: 'López',
      status: 'ACTIVE',
      deletedAt: null,
      jobPositionId: 'jp-2',
      jobPosition: {
        id: 'jp-2',
        name: 'Gerente General',
        cctCode: 'FUERA',
        cct: null,
      },
    },
    {
      id: 'emp-4',
      fileNumber: 'L1004',
      firstName: 'Lucía',
      lastName: 'Martínez',
      status: 'ACTIVE',
      deletedAt: null,
      jobPositionId: null,
      jobPosition: null,
    },
  ];

  const concepts = [
    {
      id: 'concept-prod',
      code: 'PROD',
      name: 'Premio Producción',
      scope: 'INDIVIDUAL',
      isPersistent: true,
      noveltyDataType: 'IMPORTE',
      isEmbargo: false,
      deletedAt: null,
    },
    {
      id: 'concept-embargo',
      code: 'EMB01',
      name: 'Embargo Judicial Comercial',
      scope: 'INDIVIDUAL',
      isPersistent: true,
      noveltyDataType: 'IMPORTE',
      isEmbargo: true,
      deletedAt: null,
    },
  ];

  const employeeConcepts = [
    {
      id: 'asg-emb-1',
      employeeId: 'emp-1',
      conceptId: 'concept-embargo',
      amount: 15000,
      units: null,
      notes: 'Embargo Expte 1234',
      isActive: true,
      concept: concepts[1],
      employee: employees[0],
    },
  ];

  const employeeEmbargoes = [
    {
      id: 'emb-1',
      employeeId: 'emp-1',
      status: 'ACTIVE',
      concepts: [{ conceptId: 'concept-embargo' }],
    },
  ];

  const employeeEmbargoConcepts = [
    {
      id: 'eec-1',
      embargoId: 'emb-1',
      conceptId: 'concept-embargo',
      embargo: { employeeId: 'emp-1', status: 'ACTIVE' },
    },
  ];

  const mockPrisma = {
    $executeRawUnsafe: async () => {},
    $queryRawUnsafe: async () => [],
    employee: {
      findMany: async ({ where } = {}) => {
        let list = [...employees];
        if (where?.status) list = list.filter((e) => e.status === where.status);
        if (where?.deletedAt === null) list = list.filter((e) => e.deletedAt === null);
        if (where?.jobPosition?.cctCode) {
          list = list.filter((e) => e.jobPosition?.cctCode === where.jobPosition.cctCode);
        } else if (where?.jobPosition?.OR) {
          list = list.filter((e) => e.jobPosition?.cctCode === 'FUERA' || (e.jobPosition?.name || '').toLowerCase().includes('fuera'));
        } else if (where?.OR) {
          list = list.filter((e) => !e.jobPositionId || !e.jobPosition?.cctCode);
        }
        return list;
      },
      findFirst: async ({ where } = {}) => {
        return employees.find((e) => e.id === where?.id) || null;
      },
    },
    concept: {
      findUnique: async ({ where }) => concepts.find((c) => c.id === where.id) || null,
      findFirst: async ({ where }) => concepts.find((c) => c.id === where.id) || null,
    },
    employeeConcept: {
      findMany: async ({ where } = {}) => {
        let list = [...employeeConcepts];
        if (where?.employeeId) list = list.filter((ac) => ac.employeeId === where.employeeId);
        if (where?.conceptId) list = list.filter((ac) => ac.conceptId === where.conceptId);
        return list;
      },
      findFirst: async ({ where } = {}) => {
        return employeeConcepts.find((ac) => {
          if (where?.employeeId && ac.employeeId !== where.employeeId) return false;
          if (where?.id && ac.id !== where.id) return false;
          if (where?.conceptId && ac.conceptId !== where.conceptId) return false;
          if (where?.OR && Array.isArray(where.OR)) {
            const matchOr = where.OR.some((cond) => {
              if (cond.id && ac.id === cond.id) return true;
              if (cond.conceptId && ac.conceptId === cond.conceptId) return true;
              return false;
            });
            if (!matchOr) return false;
          }
          return true;
        }) || null;
      },
      findUnique: async ({ where }) => {
        if (where.id) return employeeConcepts.find((ac) => ac.id === where.id) || null;
        if (where.employeeId_conceptId) {
          return employeeConcepts.find((ac) => ac.employeeId === where.employeeId_conceptId.employeeId && ac.conceptId === where.employeeId_conceptId.conceptId) || null;
        }
        return null;
      },
      create: async ({ data }) => {
        const item = { ...data, concept: concepts.find((c) => c.id === data.conceptId) };
        employeeConcepts.push(item);
        return item;
      },
      update: async ({ where, data }) => {
        const idx = employeeConcepts.findIndex((ac) => ac.id === where.id);
        if (idx >= 0) {
          employeeConcepts[idx] = { ...employeeConcepts[idx], ...data };
          return employeeConcepts[idx];
        }
        return null;
      },
      delete: async ({ where }) => {
        const idx = employeeConcepts.findIndex((ac) => ac.id === where.id);
        if (idx >= 0) employeeConcepts.splice(idx, 1);
        return { message: 'ok' };
      },
    },
    employeeEmbargo: {
      findMany: async ({ where } = {}) => {
        return employeeEmbargoes.filter((e) => (!where?.employeeId || e.employeeId === where.employeeId) && (!where?.status || e.status === where.status));
      },
    },
    employeeEmbargoConcept: {
      findMany: async ({ where } = {}) => {
        return employeeEmbargoConcepts.filter((eec) => eec.conceptId === where?.conceptId);
      },
      count: async ({ where } = {}) => {
        return employeeEmbargoConcepts.filter((eec) => eec.conceptId === where?.conceptId && eec.embargo?.employeeId === where?.embargo?.employeeId).length;
      },
    },
    $transaction: async (cb) => {
      return cb(mockPrisma);
    },
  };
  return mockPrisma;
}

async function runTests() {
  const prisma = createMockPrisma();

  // --- 1. Resumen de CCTs ---
  console.log('--- 1. Resumen de CCTs Asignados ---');
  await itAsync('getCctSummary retorna CCTs activos, Sin Convenio y Fuera de Convenio', async () => {
    const summary = await getCctSummary(prisma);
    assert(Array.isArray(summary), 'Debe retornar un array');
    const cct130 = summary.find((s) => s.code === '130/75');
    assert(cct130, 'Debe existir CCT 130/75');
    assert.strictEqual(cct130.count, 2, 'CCT 130/75 debe tener 2 colaboradores');

    const fuera = summary.find((s) => s.code === 'FUERA_CONVENIO');
    assert(fuera, 'Debe existir opción FUERA_CONVENIO');
    assert.strictEqual(fuera.count, 1, 'Fuera de convenio debe tener 1 colaborador');

    const sinConv = summary.find((s) => s.code === 'SIN_CONVENIO');
    assert(sinConv, 'Debe existir opción SIN_CONVENIO');
    assert.strictEqual(sinConv.count, 1, 'Sin convenio debe tener 1 colaborador');
  });

  // --- 2. Asignación masiva por CCT ---
  console.log('\n--- 2. Asignación Masiva por CCT ---');
  await itAsync('assignConceptByCct asigna concepto a todos los colaboradores del convenio', async () => {
    const res = await assignConceptByCct(prisma, 'concept-prod', {
      cctOption: '130/75',
      value: 75000,
      notes: 'Acuerdo Paritario Comercio',
    });
    assert.strictEqual(res.totalEmployees, 2, 'Debió alcanzar a los 2 empleados de 130/75');
    assert(res.createdCount + res.updatedCount === 2, 'Debieron registrarse 2 asignaciones');
  });

  await itAsync('assignConceptByCct funciona para Personal Sin Convenio', async () => {
    const res = await assignConceptByCct(prisma, 'concept-prod', {
      cctOption: 'SIN_CONVENIO',
      value: 30000,
    });
    assert.strictEqual(res.totalEmployees, 1, 'Debió alcanzar al único empleado sin convenio');
  });

  // --- 3. Importación Masiva por Excel ---
  console.log('\n--- 3. Importación Masiva por Excel ---');
  await itAsync('batchImportConceptNovelties procesa legajos válidos y omite inexistentes', async () => {
    const excelRows = [
      { fileNumber: 'L1001', value: 80000, validFrom: '2026-01-01', validTo: '2026-12-31' },
      { fileNumber: 'L1002', value: 85000, validFrom: null, validTo: null },
      { fileNumber: 'L9999', value: 50000, validFrom: null, validTo: null }, // Inexistente
      { fileNumber: 'L8888', value: 40000, validFrom: null, validTo: null }, // Inexistente
    ];

    const result = await batchImportConceptNovelties(prisma, 'concept-prod', { rows: excelRows });
    assert.strictEqual(result.processedCount, 2, 'Debió procesar 2 legajos válidos (L1001 y L1002)');
    assert.strictEqual(result.omittedCount, 2, 'Debió omitir 2 legajos inexistentes (L9999 y L8888)');
    assert.strictEqual(result.omittedRows.length, 2, 'omittedRows debe tener 2 elementos');
    assert.strictEqual(result.omittedRows[0].fileNumber, 'L9999');
    assert.strictEqual(result.omittedRows[1].fileNumber, 'L8888');
  });

  // --- 4. Blindaje contra Eliminación de Embargos Judiciales ---
  console.log('\n--- 4. Blindaje Legal de Embargos Judiciales ---');
  await itAsync('deleteEmployeeConcept arroja Error 400 al intentar borrar un concepto de embargo', async () => {
    let threw = false;
    try {
      await deleteEmployeeConcept(prisma, 'emp-1', 'asg-emb-1');
    } catch (err) {
      threw = true;
      assert.strictEqual(err.status, 400);
      assert(err.message.includes('embargo judicial'), `Mensaje debe mencionar embargo judicial: "${err.message}"`);
    }
    assert(threw, 'deleteEmployeeConcept debió arrojar error');
  });

  await itAsync('deleteConceptAssignment arroja Error 400 al intentar borrar una asignación de embargo', async () => {
    let threw = false;
    try {
      await deleteConceptAssignment(prisma, 'asg-emb-1');
    } catch (err) {
      threw = true;
      assert.strictEqual(err.status, 400);
      assert(err.message.includes('embargo judicial'), `Mensaje debe mencionar embargo judicial: "${err.message}"`);
    }
    assert(threw, 'deleteConceptAssignment debió arrojar error');
  });

  await itAsync('listEmployeeConcepts marca correctamente isEmbargo: true', async () => {
    const list = await listEmployeeConcepts(prisma, 'emp-1');
    const embItem = list.find((item) => item.conceptId === 'concept-embargo');
    assert(embItem, 'Debe listar el concepto de embargo');
    assert.strictEqual(embItem.isEmbargo, true, 'isEmbargo debe ser true para embargos');
  });

  await itAsync('listConceptAssignedEmployees marca correctamente isEmbargo: true', async () => {
    const list = await listConceptAssignedEmployees(prisma, 'concept-embargo');
    assert(list.length > 0, 'Debe haber asignaciones');
    assert.strictEqual(list[0].isEmbargo, true, 'isEmbargo debe ser true');
  });

  console.log('\n================================================================');
  console.log(`RESUMEN: ${passed} superadas, ${failed} fallidas`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
