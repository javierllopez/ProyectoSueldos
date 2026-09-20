import fs from 'fs';
import path from 'path';
import prisma from '../config/prisma.js';

/**
 * Script para poblar la tabla clae_activities en la base de datos MASTER.
 */
export async function seedClae() {
  console.log('🌱 Iniciando carga de Actividades Económicas CLAE (AFIP/ARCA)...');

  const filePath = path.resolve('src/data/clae.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo no encontrado: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const activities = JSON.parse(raw);

  console.log(`Leídos ${activities.length} registros desde clae.json`);

  // Insertar en lotes de 200 usando createMany
  const batchSize = 200;
  let totalInserted = 0;

  for (let i = 0; i < activities.length; i += batchSize) {
    const chunk = activities.slice(i, i + batchSize);
    const result = await prisma.claeActivity.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    totalInserted += result.count;
  }

  const totalCount = await prisma.claeActivity.count();
  console.log(`✅ Carga completada: ${totalInserted} registros nuevos insertados. Total en tabla: ${totalCount}`);
}

// Ejecución directa si se invoca con `node src/scripts/seedClae.js`
if (process.argv[1] && process.argv[1].endsWith('seedClae.js')) {
  seedClae()
    .catch((err) => {
      console.error('❌ Error al cargar CLAE:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
