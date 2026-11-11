import prismaMaster from '../config/prisma.js';
import { seedArcaMaster } from './seedArca.js';

async function main() {
  await seedArcaMaster({ verbose: true });
  console.log('Catálogos y relaciones ARCA sincronizados en base MASTER.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prismaMaster.$disconnect());
