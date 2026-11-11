import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import prisma from '../config/prisma.js';

const DATA_DIR = path.join(import.meta.dirname, '../data');

async function readCatalogFile(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  const raw = await fs.promises.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function seedInChunks(delegate, rows, mapper = null, chunkSize = 1000) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const data = mapper ? slice.map(mapper) : slice;
    const res = await delegate.createMany({ data, skipDuplicates: true });
    inserted += res?.count || 0;
  }
  return inserted;
}

/**
 * Puebla de forma idempotente las 6 tablas oficiales de ARCA en la base de datos MASTER.
 * @param {object} [options]
 * @param {boolean} [options.verbose=true]
 */
export async function seedArcaMaster({ verbose = true } = {}) {
  const log = (...args) => {
    if (verbose) console.log(...args);
  };

  log('Iniciando carga de catálogos oficiales ARCA en base MASTER...');

  const [ccts, categories, positions, serviceTypes, cctCatPos, modalities] = await Promise.all([
    readCatalogFile('arcaCcts.json'),
    readCatalogFile('arcaCategories.json'),
    readCatalogFile('arcaPositions.json'),
    readCatalogFile('arcaServiceTypes.json'),
    readCatalogFile('arcaCctCategoryPositions.json'),
    readCatalogFile('arcaContractModalities.json'),
  ]);

  const insertedCcts = await seedInChunks(prisma.arcaCct, ccts, null, 1000);
  const insertedCats = await seedInChunks(prisma.arcaCategory, categories, null, 1000);
  const insertedPos = await seedInChunks(prisma.arcaPosition, positions, null, 1000);
  const insertedServ = await seedInChunks(prisma.arcaServiceType, serviceTypes, null, 500);
  const insertedRel = await seedInChunks(
    prisma.arcaCctCategoryPosition,
    cctCatPos,
    (r) => ({ id: crypto.randomUUID(), ...r }),
    1000
  );
  const insertedMod = await seedInChunks(prisma.arcaContractModality, modalities, null, 500);

  const summary = {
    ccts: { source: ccts.length, inserted: insertedCcts },
    categories: { source: categories.length, inserted: insertedCats },
    positions: { source: positions.length, inserted: insertedPos },
    serviceTypes: { source: serviceTypes.length, inserted: insertedServ },
    relations: { source: cctCatPos.length, inserted: insertedRel },
    contractModalities: { source: modalities.length, inserted: insertedMod },
  };

  log('Carga ARCA en MASTER completada:', JSON.stringify(summary));
  return summary;
}

if (process.argv[1] && process.argv[1].endsWith('seedArca.js')) {
  seedArcaMaster({ verbose: true })
    .catch((err) => {
      console.error('Error al cargar catálogos ARCA en MASTER:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

