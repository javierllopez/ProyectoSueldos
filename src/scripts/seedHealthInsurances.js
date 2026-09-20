import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '../generated/tenant-client/index.js';

async function seed() {
  const dbUrl = process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(/sueldos_master.*/, 'sueldos_emp_30546259605_f4ed76')
    : 'mysql://root:Munrito19!@localhost:3306/sueldos_emp_30546259605_f4ed76';

  console.log(`Conectando a base de datos de empresa: ${dbUrl.replace(/:[^:@]+@/, ':***@')}...`);
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

  try {
    const catalogPath = path.resolve('src/data/healthInsurances.json');
    const hiCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    console.log(`Catálogo cargado con ${hiCatalog.length} entidades de salud.`);

    const existingHis = await prisma.healthInsurance.findMany({
      select: { id: true, code: true, name: true, deletedAt: true },
    });
    console.log(`Entidades existentes en base de datos: ${existingHis.length}`);

    // Mapeo de códigos preliminares a códigos oficiales SSSalud
    const oldCodeMap = {
      '1-2620-4': '126205',
      '1-1200-5': '125707',
      '1-0540-8': '105408',
      '1-2100-3': '115300',
    };

    const existingCodes = new Set();
    let updatedCount = 0;

    for (const h of existingHis) {
      if (oldCodeMap[h.code]) {
        const targetCode = oldCodeMap[h.code];
        const match = hiCatalog.find((c) => c.code === targetCode);
        if (match) {
          await prisma.healthInsurance.update({
            where: { id: h.id },
            data: { code: match.code, name: match.name },
          });
          console.log(`Actualizado: [${h.code}] ${h.name} -> [${match.code}] ${match.name} (ID: ${h.id})`);
          existingCodes.add(targetCode);
          updatedCount++;
          continue;
        }
      }
      if (h.code) existingCodes.add(h.code);
    }

    const missingHis = hiCatalog.filter((hi) => !existingCodes.has(hi.code));
    console.log(`Entidades faltantes por insertar: ${missingHis.length}`);

    if (missingHis.length > 0) {
      const recordsToInsert = missingHis.map((hi) => ({
        id: crypto.randomUUID(),
        code: hi.code,
        name: hi.name,
      }));

      await prisma.healthInsurance.createMany({
        data: recordsToInsert,
      });
      console.log(`Insertadas ${recordsToInsert.length} nuevas obras sociales.`);
    }

    const totalCount = await prisma.healthInsurance.count();
    console.log(`Total final de obras sociales en la base de datos: ${totalCount}`);

    // Verificar afiliación de empleados
    const employees = await prisma.employee.findMany({
      select: {
        id: true,
        fileNumber: true,
        firstName: true,
        lastName: true,
        healthInsurance: { select: { id: true, code: true, name: true } },
      },
    });
    console.log('Verificación de empleados y sus obras sociales:');
    employees.forEach((e) => {
      console.log(` - Legajo ${e.fileNumber}: ${e.lastName}, ${e.firstName} -> [${e.healthInsurance?.code}] ${e.healthInsurance?.name}`);
    });
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch(console.error);
