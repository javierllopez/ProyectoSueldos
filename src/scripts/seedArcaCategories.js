import prisma from '../config/prisma.js';
import { seedArcaMaster } from './seedArca.js';

async function main() {
  const summary = await seedArcaMaster({ verbose: true });
  console.log('Catálogos oficiales ARCA actualizados en MASTER:', summary.categories);
}

main()
  .catch((err) => {
    console.error('Error al cargar categorías ARCA en MASTER:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
