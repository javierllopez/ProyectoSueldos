import fs from 'fs';
import path from 'path';
import prisma from '../config/prisma.js';

function getCategories() {
  const filePath = path.resolve('src/data/arcaCategories.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function escapeSqlString(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\0/g, '\\0')}'`;
}

export async function seedArcaCategoriesForDb(dbName, categories) {
  console.log(`\nProcesando base de datos: ${dbName}...`);
  
  // 1. Asegurar que la tabla arca_categories exista
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`${dbName}\`.\`arca_categories\` (
      \`code\` VARCHAR(50) NOT NULL PRIMARY KEY,
      \`name\` VARCHAR(191) NOT NULL,
      \`cct\` VARCHAR(191) NULL,
      \`description\` TEXT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 2. Comprobar cuántos registros existen
  const countResult = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS total FROM \`${dbName}\`.\`arca_categories\``);
  const currentCount = Number(countResult[0]?.total || 0);
  console.log(`  Registros actuales en ${dbName}.arca_categories: ${currentCount}`);

  if (currentCount >= categories.length) {
    console.log(`  -> La base ya cuenta con todas las categorías (${currentCount}). No se requieren inserciones.`);
    return currentCount;
  }

  // 3. Inserción masiva en lotes de 1000 con INSERT IGNORE para máxima velocidad
  const chunkSize = 1000;
  const totalChunks = Math.ceil(categories.length / chunkSize);
  const startTime = Date.now();

  for (let i = 0; i < categories.length; i += chunkSize) {
    const chunk = categories.slice(i, i + chunkSize);
    const valueRows = chunk.map((cat) => {
      const code = escapeSqlString(cat.code);
      const name = escapeSqlString(cat.name?.slice(0, 191));
      const cct = cat.cct ? escapeSqlString(cat.cct.slice(0, 191)) : 'NULL';
      const desc = escapeSqlString(cat.description || cat.name);
      return `(${code}, ${name}, ${cct}, ${desc}, NOW(3), NOW(3))`;
    });

    const sql = `
      INSERT IGNORE INTO \`${dbName}\`.\`arca_categories\`
        (\`code\`, \`name\`, \`cct\`, \`description\`, \`created_at\`, \`updated_at\`)
      VALUES ${valueRows.join(',\n')};
    `;

    await prisma.$executeRawUnsafe(sql);
    const currentChunkIdx = Math.floor(i / chunkSize) + 1;
    if (currentChunkIdx % 10 === 0 || currentChunkIdx === totalChunks) {
      process.stdout.write(`  Lote ${currentChunkIdx}/${totalChunks} insertado...\r`);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const finalResult = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS total FROM \`${dbName}\`.\`arca_categories\``);
  const finalCount = Number(finalResult[0]?.total || 0);
  console.log(`\n  ✅ Finalizado en ${durationSec}s. Total final de categorías en ${dbName}: ${finalCount}`);
  return finalCount;
}

async function main() {
  const categories = getCategories();
  console.log(`Cargadas ${categories.length} categorías desde src/data/arcaCategories.json.`);

  // Obtener todas las bases de datos registradas en CompanyRegistry
  const companies = await prisma.companyRegistry.findMany();
  console.log(`Empresas registradas encontradas: ${companies.length}`);

  // También obtener todas las bases físicas existentes en MySQL con prefijo sueldos_emp_
  const rawDbs = await prisma.$queryRawUnsafe("SHOW DATABASES LIKE 'sueldos_emp_%'");
  const physicalDbs = rawDbs.map((r) => Object.values(r)[0]);
  console.log(`Bases de datos físicas 'sueldos_emp_%' encontradas: ${physicalDbs.length}`);

  const targetDbs = new Set([...companies.map((c) => c.dbName), ...physicalDbs]);

  for (const dbName of targetDbs) {
    try {
      await seedArcaCategoriesForDb(dbName, categories);
    } catch (err) {
      console.error(`  ❌ Error procesando ${dbName}:`, err.message);
    }
  }

  console.log('\n=============================================');
  console.log('🎉 Migración y carga masiva de ARCA Categories completada.');
  console.log('=============================================');
}

if (process.argv[1]?.endsWith('seedArcaCategories.js')) {
  main()
    .catch((err) => {
      console.error('Error fatal durante la carga masiva:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
