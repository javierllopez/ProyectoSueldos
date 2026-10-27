import assert from 'assert';
import {
  deletePaySlip,
  getPaySlips,
} from './src/modules/payroll/payroll.service.js';

console.log('\n================================================================');
console.log('TEST SUITE: BORRADO DE RECIBOS Y VISTA DE LIQUIDACIÓN');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

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

function createMockPrisma() {
  const periods = [
    {
      id: 'period-open-1',
      month: 9,
      year: 2026,
      settlementName: 'Mensual Abierto',
      status: 'CALCULATED',
      totalGross: 2500000,
      totalNet: 2000000,
      totalEmployerCost: 3100000,
      fiscalPeriod: { id: 'fp-1', status: 'OPEN' },
    },
    {
      id: 'period-closed-1',
      month: 8,
      year: 2026,
      settlementName: 'Mensual Cerrado',
      status: 'CLOSED',
      totalGross: 1000000,
      totalNet: 800000,
      totalEmployerCost: 1250000,
      fiscalPeriod: { id: 'fp-2', status: 'CLOSED' },
    },
  ];

  const employees = [
    {
      id: 'emp-1',
      fileNumber: 'L101',
      firstName: 'Roberto',
      lastName: 'Gómez',
      cuil: '20-12345678-9',
      department: { name: 'Ventas' },
      jobPosition: { name: 'Vendedor' },
    },
    {
      id: 'emp-2',
      fileNumber: 'L102',
      firstName: 'Ana',
      lastName: 'Pérez',
      cuil: '27-98765432-1',
      department: { name: 'Administración' },
      jobPosition: { name: 'Contadora' },
    },
  ];

  const slips = [
    {
      id: 'slip-open-1',
      payrollPeriodId: 'period-open-1',
      employeeId: 'emp-1',
      grossSalary: 1500000,
      netSalary: 1200000,
      totalLaborCost: 1850000,
      payrollPeriod: periods[0],
      employee: employees[0],
    },
    {
      id: 'slip-open-2',
      payrollPeriodId: 'period-open-1',
      employeeId: 'emp-2',
      grossSalary: 1000000,
      netSalary: 800000,
      totalLaborCost: 1250000,
      payrollPeriod: periods[0],
      employee: employees[1],
    },
    {
      id: 'slip-closed-1',
      payrollPeriodId: 'period-closed-1',
      employeeId: 'emp-1',
      grossSalary: 1000000,
      netSalary: 800000,
      totalLaborCost: 1250000,
      payrollPeriod: periods[1],
      employee: employees[0],
    },
  ];

  const slipItems = [
    { id: 'item-1', paySlipId: 'slip-open-1', conceptCode: '1001', amount: 1500000 },
    { id: 'item-2', paySlipId: 'slip-open-2', conceptCode: '1001', amount: 1000000 },
  ];

  const slipBases = [
    { id: 'basis-1', paySlipId: 'slip-open-1', baseImponible1: 1500000 },
    { id: 'basis-2', paySlipId: 'slip-open-2', baseImponible1: 1000000 },
  ];

  const mockPrisma = {
    $executeRawUnsafe: async () => {},
    $queryRawUnsafe: async () => [],
    paySlip: {
      findUnique: async ({ where, include }) => {
        const s = slips.find((x) => x.id === where.id);
        if (!s) return null;
        return {
          ...s,
          payrollPeriod: include?.payrollPeriod ? periods.find((p) => p.id === s.payrollPeriodId) : s.payrollPeriod,
          employee: include?.employee ? employees.find((e) => e.id === s.employeeId) : s.employee,
        };
      },
      count: async ({ where } = {}) => {
        let list = [...slips];
        if (where?.payrollPeriodId) list = list.filter((s) => s.payrollPeriodId === where.payrollPeriodId);
        return list.length;
      },
      findMany: async ({ where, include }) => {
        let list = [...slips];
        if (where?.payrollPeriodId) list = list.filter((s) => s.payrollPeriodId === where.payrollPeriodId);
        return list.map((s) => ({
          ...s,
          payrollPeriod: include?.payrollPeriod ? periods.find((p) => p.id === s.payrollPeriodId) : undefined,
          employee: include?.employee ? employees.find((e) => e.id === s.employeeId) : undefined,
        }));
      },
      delete: async ({ where }) => {
        const idx = slips.findIndex((s) => s.id === where.id);
        if (idx >= 0) slips.splice(idx, 1);
        return { message: 'ok' };
      },
      aggregate: async ({ where, _sum }) => {
        const list = slips.filter((s) => s.payrollPeriodId === where.payrollPeriodId);
        const grossSalary = list.reduce((acc, s) => acc + Number(s.grossSalary || 0), 0);
        const netSalary = list.reduce((acc, s) => acc + Number(s.netSalary || 0), 0);
        const totalLaborCost = list.reduce((acc, s) => acc + Number(s.totalLaborCost || 0), 0);
        return {
          _sum: {
            grossSalary,
            netSalary,
            totalLaborCost,
          },
        };
      },
    },
    paySlipItem: {
      deleteMany: async ({ where }) => {
        const count = slipItems.filter((it) => it.paySlipId === where.paySlipId).length;
        for (let i = slipItems.length - 1; i >= 0; i--) {
          if (slipItems[i].paySlipId === where.paySlipId) slipItems.splice(i, 1);
        }
        return { count };
      },
    },
    paySlipBasis: {
      deleteMany: async ({ where }) => {
        const count = slipBases.filter((b) => b.paySlipId === where.paySlipId).length;
        for (let i = slipBases.length - 1; i >= 0; i--) {
          if (slipBases[i].paySlipId === where.paySlipId) slipBases.splice(i, 1);
        }
        return { count };
      },
    },
    payrollPeriod: {
      update: async ({ where, data }) => {
        const p = periods.find((x) => x.id === where.id);
        if (p) Object.assign(p, data);
        return p;
      },
      findUnique: async ({ where }) => periods.find((x) => x.id === where.id) || null,
    },
    $transaction: async (cb) => {
      return cb(mockPrisma);
    },
    _state: { periods, slips, slipItems, slipBases },
  };

  return mockPrisma;
}

async function runTests() {
  const prisma = createMockPrisma();

  console.log('--- 1. Validación de Eliminación en Liquidaciones Cerradas ---');
  await itAsync('deletePaySlip arroja Error 400 si la liquidación está cerrada', async () => {
    let threw = false;
    try {
      await deletePaySlip(prisma, 'slip-closed-1');
    } catch (err) {
      threw = true;
      assert.strictEqual(err.status, 400);
      assert(err.message.includes('cerrada legalmente'), `Mensaje debe indicar liquidación cerrada: "${err.message}"`);
    }
    assert(threw, 'deletePaySlip debió arrojar error 400');
  });

  console.log('\n--- 2. Validación de Recibo Inexistente ---');
  await itAsync('deletePaySlip arroja Error 404 si el recibo no existe', async () => {
    let threw = false;
    try {
      await deletePaySlip(prisma, 'slip-inexistente');
    } catch (err) {
      threw = true;
      assert.strictEqual(err.status, 404);
    }
    assert(threw, 'deletePaySlip debió arrojar error 404');
  });

  console.log('\n--- 3. Eliminación Exitosa en Liquidación Abierta y Recálculo de Totales ---');
  await itAsync('deletePaySlip elimina el recibo, sus items y bases, y actualiza los totales del período', async () => {
    const res = await deletePaySlip(prisma, 'slip-open-1');
    assert(res.success, 'Debe retornar success: true');
    assert(res.message.includes('Gómez, Roberto'), 'El mensaje debe nombrar al empleado');

    // Verificar que slip-open-1 ya no está en la colección de slips
    const found = prisma._state.slips.find((s) => s.id === 'slip-open-1');
    assert.strictEqual(found, undefined, 'slip-open-1 debe haber sido eliminado');

    // Verificar que los items y bases del slip fueron eliminados
    const items = prisma._state.slipItems.filter((it) => it.paySlipId === 'slip-open-1');
    assert.strictEqual(items.length, 0, 'No deben quedar items del recibo eliminado');

    const bases = prisma._state.slipBases.filter((b) => b.paySlipId === 'slip-open-1');
    assert.strictEqual(bases.length, 0, 'No deben quedar bases del recibo eliminado');

    // Verificar que los totales del período se actualizaron restando el recibo eliminado
    const period = prisma._state.periods.find((p) => p.id === 'period-open-1');
    assert.strictEqual(period.totalGross, 1000000, 'Total Gross debe ser 1.000.000 tras eliminar el recibo de 1.500.000');
    assert.strictEqual(period.totalNet, 800000, 'Total Net debe ser 800.000');
    assert.strictEqual(period.totalEmployerCost, 1250000, 'Total Employer Cost debe ser 1.250.000');
  });

  console.log('\n--- 4. Consulta de Recibos con Estado de Liquidación (getPaySlips) ---');
  await itAsync('getPaySlips incluye payrollPeriod con su status para condicionar el botón de borrado', async () => {
    const res = await getPaySlips(prisma, 'period-open-1', { page: 1, limit: 5 });
    assert(Array.isArray(res.data), 'res.data debe ser un array');
    assert.strictEqual(res.data.length, 1, 'Queda 1 recibo en period-open-1');
    const slip = res.data[0];
    assert(slip.payrollPeriod, 'Debe incluir payrollPeriod');
    assert.strictEqual(slip.payrollPeriod.status, 'CALCULATED', 'Status debe ser CALCULATED (abierta)');
  });

  console.log('\n================================================================');
  console.log(`RESUMEN: ${passed} superadas, ${failed} fallidas`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
