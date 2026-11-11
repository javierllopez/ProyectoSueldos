import prismaMaster from '../config/prisma.js';
import { seedArcaMaster } from './seedArca.js';

async function main() {
  await seedArcaMaster({ verbose: true });
  const count = await prismaMaster.arcaContractModality.count();
  console.log(`Modalidades de contratación en MASTER: ${count}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prismaMaster.$disconnect());
