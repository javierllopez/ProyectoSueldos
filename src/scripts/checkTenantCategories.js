import prisma from '../config/prisma.js';

async function checkMasterCategories() {
  const [ccts, categories, positions, relations, modalities] = await Promise.all([
    prisma.arcaCct.count(),
    prisma.arcaCategory.count(),
    prisma.arcaPosition.count(),
    prisma.arcaCctCategoryPosition.count(),
    prisma.arcaContractModality.count(),
  ]);

  console.log('Catálogos oficiales ARCA en base MASTER:');
  console.log(`  arcaCct count: ${ccts}`);
  console.log(`  arcaCategory count: ${categories}`);
  console.log(`  arcaPosition count: ${positions}`);
  console.log(`  arcaCctCategoryPosition count: ${relations}`);
  console.log(`  arcaContractModality count: ${modalities}`);
}

checkMasterCategories()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
