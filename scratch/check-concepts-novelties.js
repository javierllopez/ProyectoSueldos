import prisma from '../src/config/prisma.js';
import tenantConnectionManager from '../src/services/tenantConnectionManager.js';

async function main() {
  const company = await prisma.companyRegistry.findFirst({
    where: { deletedAt: null }
  });
  console.log('Company:', company.dbName);
  const tc = await tenantConnectionManager.getTenantClient({
    companySlug: company.dbName.replace('sueldos_', ''),
    dbName: company.dbName
  });

  const concepts = await tc.concept.findMany({
    select: {
      code: true,
      name: true,
      type: true,
      calculationType: true,
      noveltyDataType: true,
      scope: true,
      isPersistent: true
    },
    orderBy: { code: 'asc' }
  });
  console.log(`Total concepts: ${concepts.length}`);
  console.table(concepts);

  // Check employee 569 AVALOS, PAULA YAMILA
  const emp = await tc.employee.findFirst({
    where: { fileNumber: '569' },
    include: {
      assignedConcepts: {
        include: {
          concept: true
        }
      }
    }
  });

  if (emp) {
    console.log(`\nEmpleado 569: ${emp.lastName}, ${emp.firstName}`);
    console.log('Conceptos asignados directamente en employee_concepts:');
    emp.assignedConcepts.forEach(ac => {
      console.log(`- [${ac.concept.code}] ${ac.concept.name} (scope: ${ac.concept.scope}, isPersistent: ${ac.concept.isPersistent})`);
    });
  } else {
    console.log('No employee 569 found with fileNumber 569');
    const allEmps = await tc.employee.findMany({
      select: { id: true, fileNumber: true, lastName: true, firstName: true }
    });
    console.table(allEmps);
  }

  // Check period novelties
  console.log('\nPeriod novelties:');
  const novs = await tc.periodNovelty.findMany({
    include: {
      concept: true,
      employee: true,
      payrollPeriod: true
    }
  });
  console.log(`Total period novelties: ${novs.length}`);
  novs.forEach(n => {
    console.log(`- Period: ${n.payrollPeriod.year}/${n.payrollPeriod.month} (${n.payrollPeriod.periodType}) | Emp: ${n.employee.fileNumber} ${n.employee.lastName} | Concept: [${n.concept.code}] ${n.concept.name} (calcType: ${n.concept.calculationType}, novType: ${n.concept.noveltyDataType}) | units: ${n.units}, amount: ${n.amount}, notes: ${n.notes}`);
  });

  await prisma.$disconnect();
  await tc.$disconnect();
}

main().catch(console.error);
