import fs from 'fs';
import path from 'path';

const latin1 = fs.readFileSync(path.resolve('Docs/listadoSSSalud.xls.txt'), 'latin1');
const lines = latin1.split(/\r?\n/).filter(l => l.trim().length > 0);

const healthInsurances = [];

for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split('\t');
  const rnas = parts[0]?.trim();
  const nombreRaw = parts[1]?.trim().replace(/\s+/g, ' ') || '';
  const siglaRaw = parts[2]?.trim().replace(/\s+/g, ' ') || '';

  let displayName = nombreRaw;
  if (siglaRaw) {
    const siglaEscaped = siglaRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('\\s*\\(\\s*' + siglaEscaped + '\\s*\\)', 'i');
    const cleanedNombre = nombreRaw.replace(regex, '').trim();
    displayName = `${siglaRaw} - ${cleanedNombre}`;
  }

  healthInsurances.push({
    code: rnas,
    name: displayName,
    sigla: siglaRaw || null,
    legalName: nombreRaw,
    address: parts[3]?.trim().replace(/\s+/g, ' ') || null,
    city: parts[4]?.trim().replace(/\s+/g, ' ') || null,
    postalCode: parts[5]?.trim().replace(/\s+/g, ' ') || null,
    province: parts[6]?.trim().replace(/\s+/g, ' ') || null,
    phone: parts[7]?.trim().replace(/\s+/g, ' ') || null,
    otherPhones: parts[8]?.trim().replace(/\s+/g, ' ') || null,
    email: parts[9]?.trim().replace(/\s+/g, ' ') || null,
    web: parts[10]?.trim().replace(/\s+/g, ' ') || null,
    habilitaOpcion: parts[11]?.trim() === 'SI'
  });
}

// Agregar prepagas y regímenes especiales comunes en nóminas
const additionalEntities = [
  {
    code: '4-0030-0',
    name: 'Galeno Argentina (Medicina Prepaga)',
    sigla: 'GALENO',
    legalName: 'Galeno Argentina S.A.',
    address: null,
    city: 'Ciudad Autónoma de Buenos Aires',
    postalCode: null,
    province: 'CAPITAL FEDERAL',
    phone: '0810-999-4253',
    otherPhones: null,
    email: null,
    web: 'www.galenoargentina.com.ar',
    habilitaOpcion: true
  },
  {
    code: '4-0080-0',
    name: 'OSDE (Medicina Prepaga)',
    sigla: 'OSDE',
    legalName: 'OSDE Organización de Servicios Directos Empresarios',
    address: 'Av. Leandro N. Alem 1067',
    city: 'Ciudad Autónoma de Buenos Aires',
    postalCode: '1001',
    province: 'CAPITAL FEDERAL',
    phone: '0810-555-6733',
    otherPhones: null,
    email: 'contacto@osde.com.ar',
    web: 'www.osde.com.ar',
    habilitaOpcion: true
  },
  {
    code: '4-0010-0',
    name: 'Swiss Medical (Medicina Prepaga)',
    sigla: 'SWISS MEDICAL',
    legalName: 'Swiss Medical S.A.',
    address: 'Av. Pueyrredón 1443',
    city: 'Ciudad Autónoma de Buenos Aires',
    postalCode: '1118',
    province: 'CAPITAL FEDERAL',
    phone: '0810-444-7700',
    otherPhones: null,
    email: null,
    web: 'www.swissmedical.com.ar',
    habilitaOpcion: true
  },
  {
    code: '1-1180-8',
    name: 'OSSMAC (Seguros)',
    sigla: 'OSSMAC',
    legalName: 'Obra Social del Seguro, Mutual y Actividades Conexas',
    address: null,
    city: null,
    postalCode: null,
    province: 'CAPITAL FEDERAL',
    phone: null,
    otherPhones: null,
    email: null,
    web: null,
    habilitaOpcion: true
  },
  {
    code: '9-0010-0',
    name: 'IOMA (Provincia de Buenos Aires)',
    sigla: 'IOMA',
    legalName: 'Instituto de Obra Médico Asistencial',
    address: 'Calle 46 N° 538',
    city: 'La Plata',
    postalCode: '1900',
    province: 'BUENOS AIRES',
    phone: '0810-999-4662',
    otherPhones: null,
    email: null,
    web: 'www.ioma.gba.gob.ar',
    habilitaOpcion: false
  },
  {
    code: '0-0010-0',
    name: 'PAMI / INSSJP',
    sigla: 'PAMI',
    legalName: 'Instituto Nacional de Servicios Sociales para Jubilados y Pensionados',
    address: 'Av. Corrientes 655',
    city: 'Ciudad Autónoma de Buenos Aires',
    postalCode: '1043',
    province: 'CAPITAL FEDERAL',
    phone: '138',
    otherPhones: null,
    email: null,
    web: 'www.pami.org.ar',
    habilitaOpcion: false
  }
];

for (const entity of additionalEntities) {
  healthInsurances.push(entity);
}

const outputPath = path.resolve('src/data/healthInsurances.json');
fs.writeFileSync(outputPath, JSON.stringify(healthInsurances, null, 2), 'utf-8');

console.log(`Creado exitosamente ${outputPath} con ${healthInsurances.length} entidades de salud (${lines.length - 1} de SSSalud + ${additionalEntities.length} prepagas/especiales).`);
