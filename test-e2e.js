import app from './src/app.js';
import prismaMaster from './src/config/prisma.js';
import tenantConnectionManager from './src/services/tenantConnectionManager.js';
import http from 'http';

async function runTests() {
  console.log('🧪 Iniciando pruebas integrales del sistema...');
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/v1`;
  console.log(`📡 Servidor de pruebas levantado en puerto temporal ${port}`);

  let adminToken = '';
  let companyId = '';
  let testAccountId = '';
  let testDbName = '';

  try {
    // 1. Health check
    console.log('\n1️⃣ Test: GET /api/v1/health');
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthJson = await healthRes.json();
    console.log('Respuesta Health:', healthRes.status, healthJson);
    if (healthRes.status !== 200) throw new Error('Health check falló');

    // 2. Registro de nueva cuenta y usuario OWNER
    const testEmail = `test_${Date.now()}@sueldos.com`;
    console.log(`\n2️⃣ Test: POST /api/v1/auth/register con ${testEmail}`);
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountName: 'Estudio Contable Test',
        email: testEmail,
        password: 'Password123!',
        firstName: 'Juan',
        lastName: 'Pérez',
      }),
    });
    const regJson = await regRes.json();
    console.log('Respuesta Register:', regRes.status, regJson.message);
    if (regRes.status !== 201) throw new Error(`Registro falló: ${JSON.stringify(regJson)}`);
    adminToken = regJson.data.accessToken;
    testAccountId = regJson.data?.user?.accountId || '';

    // 3. Obtener perfil autenticado
    console.log('\n3️⃣ Test: GET /api/v1/auth/me con Token');
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const meJson = await meRes.json();
    console.log('Respuesta Me:', meRes.status, meJson.data.user.email, 'Rol:', meJson.data.user.role);
    if (meRes.status !== 200) throw new Error('Auth me falló');

    // 3.1 Test: Catálogo de Actividades Económicas CLAE (GET /api/v1/clae)
    console.log('\n3️⃣.1 Test: GET /api/v1/clae (Búsqueda y detalle de CLAE)');
    const claeSearchRes = await fetch(`${baseUrl}/clae?q=informática`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const claeSearchJson = await claeSearchRes.json();
    console.log('Respuesta Búsqueda CLAE:', claeSearchRes.status, 'Total encontrados:', claeSearchJson.meta.total);
    if (claeSearchRes.status !== 200) throw new Error('Búsqueda CLAE falló');
    const softwareAct = claeSearchJson.data.find((a) => a.code === '620100');
    if (!softwareAct) throw new Error('No se encontró el código CLAE 620100 en la búsqueda');

    const claeCodeRes = await fetch(`${baseUrl}/clae/620100`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const claeCodeJson = await claeCodeRes.json();
    console.log('Respuesta Detalle CLAE 620100:', claeCodeRes.status, claeCodeJson.data.description);
    if (claeCodeRes.status !== 200 || claeCodeJson.data.code !== '620100') throw new Error('Detalle CLAE falló');

    // 4. Crear empresa (aprovisionamiento automático de DB MySQL)
    // CUIT válido de prueba: 30-71234567-8 -> 30712345678 (o calculemos uno válido)
    // CUIT: 30-70838125-9 (válido AFIP)
    const validCuit = '30708381256';
    console.log(`\n4️⃣ Test: POST /api/v1/companies (Aprovisionamiento físico de DB para CUIT ${validCuit})`);
    const compRes = await fetch(`${baseUrl}/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Empresa Test S.A.',
        tradeName: 'Test Tech',
        cuit: validCuit,
        activityCode: '620100',
      }),
    });
    const compJson = await compRes.json();
    console.log('Respuesta Crear Empresa:', compRes.status, compJson.message);
    if (compRes.status !== 201) throw new Error(`Crear empresa falló: ${JSON.stringify(compJson)}`);
    companyId = compJson.data.id;
    testDbName = compJson.data.dbName;
    console.log(`  -> Base física creada: ${compJson.data.dbName}, Actividad: ${compJson.data.activityCode}`);
    if (compJson.data.activityCode !== '620100') throw new Error('El activityCode no se guardó en la empresa');

    // 5. Verificar que la empresa figure en el listado
    console.log('\n5️⃣ Test: GET /api/v1/companies');
    const listRes = await fetch(`${baseUrl}/companies`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listJson = await listRes.json();
    console.log('Respuesta Listar Empresas:', listRes.status, 'Total:', listJson.meta.total);
    const listedComp = listJson.data.find((c) => c.id === companyId);
    if (!listedComp || listedComp.activityCode !== '620100') throw new Error('Empresa listada no contiene activityCode');

    // 5.1 Test: Ficha de Empresa (GET /api/v1/companies/profile)
    console.log('\n5️⃣.1 Test: GET /api/v1/companies/profile');
    const profGetRes = await fetch(`${baseUrl}/companies/profile`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const profGetJson = await profGetRes.json();
    console.log('Respuesta Get Profile:', profGetRes.status, 'Razón Social:', profGetJson.data.legalName, 'Actividad:', profGetJson.data.activityCode);
    if (profGetRes.status !== 200) throw new Error('Get profile falló');
    if (profGetJson.data.activityCode !== '620100') throw new Error('Profile no contiene activityCode inicial');

    // 5.2 Test: Actualizar Ficha de Empresa (PUT /api/v1/companies/profile)
    console.log('\n5️⃣.2 Test: PUT /api/v1/companies/profile (fiscal, domicilio, laboral y CLAE)');
    const profPutRes = await fetch(`${baseUrl}/companies/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        legalName: 'Empresa Test S.A. Modificada',
        tradeName: 'Test Tech Digital',
        taxCondition: 'RESPONSABLE_INSCRIPTO',
        grossIncomeNumber: '901-123456-7',
        activityCode: '011211', // Cultivo de soja
        address: 'Av. Corrientes 1234, Piso 4',
        city: 'CABA',
        province: 'Ciudad Autónoma de Buenos Aires',
        postalCode: 'C1043',
        phone: '011 4321-8765',
        email: 'rrhh@testtech.com',
        activityStart: '2022-06-01',
        artName: 'Prevención ART',
        bankName: 'Banco de la Nación Argentina',
        bankCbu: '0110012300000012345678',
      }),
    });
    const profPutJson = await profPutRes.json();
    console.log('Respuesta Put Profile:', profPutRes.status, profPutJson.message);
    if (profPutRes.status !== 200) throw new Error(`Put profile falló: ${JSON.stringify(profPutJson)}`);
    if (profPutJson.data.legalName !== 'Empresa Test S.A. Modificada') throw new Error('Razón social no se actualizó');
    if (profPutJson.data.activityCode !== '011211') throw new Error('Código CLAE no se actualizó en profile');
    if (!profPutJson.data.activityDescription?.toLowerCase().includes('soja')) throw new Error('Descripción de actividad no se autocompletó con soja');
    if (profPutJson.data.artName !== 'Prevención ART') throw new Error('ART no se actualizó');

    // 5.3 Test: Estructura Organizacional - Sectores (Departments)
    console.log('\n5️⃣.3 Test: POST /api/v1/departments y GET /api/v1/departments');
    const deptRes = await fetch(`${baseUrl}/departments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        name: 'Administración y Finanzas',
        code: 'ADM-01',
      }),
    });
    const deptJson = await deptRes.json();
    console.log('Respuesta Crear Sector:', deptRes.status, deptJson.message);
    if (deptRes.status !== 201) throw new Error(`Crear sector falló: ${JSON.stringify(deptJson)}`);
    const departmentId = deptJson.data.id;

    // 5.3.1 Test: POST /api/v1/departments/import (Importación masiva con detección y reporte de duplicados)
    console.log('\n5️⃣.3.1 Test: POST /api/v1/departments/import');
    const importRes = await fetch(`${baseUrl}/departments/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        departments: [
          { code: 'ADM-01', name: 'Administración y Finanzas' }, // Duplicado de la DB -> omitir
          { code: 'VTAS', name: 'Comercial y Ventas' },          // Nuevo -> agregar
          { code: 'PROD', name: 'Producción y Planta' },         // Nuevo -> agregar
          { code: 'PROD', name: 'Producción Duplicada' },        // Código repetido en lote -> omitir
        ],
      }),
    });
    const importJson = await importRes.json();
    console.log('Respuesta Importar Sectores:', importRes.status, importJson.message);
    console.log(`  -> Agregados: ${importJson.data.createdCount}, Omitidos: ${importJson.data.skippedCount}`);
    if (importRes.status !== 200 || importJson.data.createdCount !== 2 || importJson.data.skippedCount !== 2) {
      throw new Error(`Importación de sectores falló: ${JSON.stringify(importJson)}`);
    }
    if (importJson.data.skipped.length !== 2) {
      throw new Error(`El reporte de sectores omitidos no devolvió la cantidad esperada`);
    }
    console.log('  -> Omitidos reportados:', importJson.data.skipped.map((s) => `${s.code || '-'}: ${s.reason}`).join(' | '));

    // 5.4 Test: Estructura Organizacional - Puestos de Trabajo (Job Positions)
    // 5.4 Test: Catálogos ARCA (CCT, Categorías, Puestos, Tipos de Servicio) y Puestos de Trabajo
    console.log('\n5️⃣.4 Test: GET Catálogos ARCA y POST /api/v1/job-positions con campos clave (incluyendo CCT)');
    const [arcaCatRes, arcaPosRes, arcaServRes, arcaCctRes] = await Promise.all([
      fetch(`${baseUrl}/arca-categories`, {
        headers: { Authorization: `Bearer ${adminToken}`, 'x-company-id': companyId },
      }),
      fetch(`${baseUrl}/arca-positions`, {
        headers: { Authorization: `Bearer ${adminToken}`, 'x-company-id': companyId },
      }),
      fetch(`${baseUrl}/arca-service-types`, {
        headers: { Authorization: `Bearer ${adminToken}`, 'x-company-id': companyId },
      }),
      fetch(`${baseUrl}/arca-ccts`, {
        headers: { Authorization: `Bearer ${adminToken}`, 'x-company-id': companyId },
      }),
    ]);
    const arcaCatJson = await arcaCatRes.json();
    const arcaPosJson = await arcaPosRes.json();
    const arcaServJson = await arcaServRes.json();
    const arcaCctJson = await arcaCctRes.json();

    console.log(`  -> ARCA CCTs: ${arcaCctJson.data.length}, Categorías: ${arcaCatJson.data.length}, Puestos: ${arcaPosJson.data.length}, Tipos de Servicio: ${arcaServJson.data.length}`);
    if (arcaCctJson.data.length === 0 || arcaCatJson.data.length === 0 || arcaPosJson.data.length === 0 || arcaServJson.data.length === 0) {
      throw new Error('Los catálogos de ARCA no se precargaron correctamente en la base del tenant');
    }

    const jobRes = await fetch(`${baseUrl}/job-positions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        name: 'Analista Contable Senior',
        code: 'PST-01',
        cctCode: '0130/75',
        categoryCode: 'COM-ADM-D',
        positionCode: '2110',
        serviceTypeCode: '01',
      }),
    });
    const jobJson = await jobRes.json();
    console.log('Respuesta Crear Puesto con ARCA y CCT:', jobRes.status, jobJson.message);
    if (jobRes.status !== 201) throw new Error(`Crear puesto falló: ${JSON.stringify(jobJson)}`);
    const jobPositionId = jobJson.data.id;

    // Verificar que el listado devuelve las relaciones (incluyendo CCT)
    const jobListRes = await fetch(`${baseUrl}/job-positions`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'x-company-id': companyId },
    });
    const jobListJson = await jobListRes.json();
    const createdJob = jobListJson.data.find((p) => p.id === jobPositionId);
    if (!createdJob || !createdJob.cct || !createdJob.category || !createdJob.arcaPosition || !createdJob.serviceType) {
      throw new Error(`El puesto creado no incluye las relaciones ARCA: ${JSON.stringify(createdJob)}`);
    }
    console.log(`  -> Puesto verificado: ${createdJob.name} | CCT: ${createdJob.cct.code} (${createdJob.cct.name}) | Cat: ${createdJob.category.name} | Puesto ARCA: ${createdJob.arcaPosition.name} | Tipo Serv: ${createdJob.serviceType.name}`);

    // Probar actualización parcial de campos ARCA (cambio a Fuera de Convenio)
    const jobPatchRes = await fetch(`${baseUrl}/job-positions/${jobPositionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        cctCode: 'FC',
        categoryCode: 'FC-05',
      }),
    });
    const jobPatchJson = await jobPatchRes.json();
    if (jobPatchRes.status !== 200 || jobPatchJson.data.cctCode !== 'FC' || jobPatchJson.data.categoryCode !== 'FC-05') {
      throw new Error(`Actualizar convenio y categoría ARCA falló: ${JSON.stringify(jobPatchJson)}`);
    }
    console.log('  -> Puesto actualizado con nuevo convenio y categoría Fuera de Convenio exitosamente');

    // 5.4.1 Test: POST /api/v1/job-positions/import (Importación masiva de puestos de trabajo)
    console.log('\n5️⃣.4.1 Test: POST /api/v1/job-positions/import');
    const importJobsRes = await fetch(`${baseUrl}/job-positions/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        jobPositions: [
          { code: 'IMP-01', name: 'Jefe de Depósito', cctCode: '0130/75' },
          { code: 'IMP-02', name: 'Operario Técnico de Mantenimiento' },
          { code: '', name: 'Puesto Sin Código' },
          { code: 'IMP-04', name: '' },
          { code: 'PST-01', name: 'Puesto Repetido DB' },
          { code: 'IMP-01', name: 'Puesto Repetido Lote' },
          { code: 'IMP-07', name: 'Puesto CCT Inválido', cctCode: 'CCT-INEXISTENTE-999' },
        ],
      }),
    });
    const importJobsJson = await importJobsRes.json();
    console.log('Respuesta Importar Puestos:', importJobsRes.status, importJobsJson.message);
    console.log(`  -> Agregados: ${importJobsJson.data.createdCount}, Omitidos: ${importJobsJson.data.skippedCount}`);
    if (importJobsRes.status !== 200 || importJobsJson.data.createdCount !== 2 || importJobsJson.data.skippedCount !== 5) {
      throw new Error(`Importación de puestos falló: ${JSON.stringify(importJobsJson)}`);
    }
    console.log('  -> Omitidos reportados:', importJobsJson.data.skipped.map((s) => `${s.code || '-'}: ${s.reason}`).join(' | '));

    // 5.5 Test: Afiliaciones - Obras Sociales precargadas y creación
    console.log('\n5️⃣.5 Test: GET /api/v1/health-insurances (precarga por defecto)');
    const hiListRes = await fetch(`${baseUrl}/health-insurances`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const hiListJson = await hiListRes.json();
    console.log('Respuesta Listar Obras Sociales:', hiListRes.status, 'Cant. precargadas:', hiListJson.data.length);
    if (hiListJson.data.length === 0) throw new Error('Las obras sociales por defecto no se precargaron');
    const healthInsuranceId = hiListJson.data[0].id;

    // 5.6 Test: Sindicatos y Mutuales
    console.log('\n5️⃣.6 Test: POST /api/v1/unions y POST /api/v1/mutuals');
    const unionRes = await fetch(`${baseUrl}/unions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        name: 'Sindicato de Empleados de Comercio',
        code: 'CCT 130/75',
      }),
    });
    const unionJson = await unionRes.json();
    const unionId = unionJson.data.id;

    const mutualRes = await fetch(`${baseUrl}/mutuals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        name: 'Mutual de Empleados',
        code: 'MUT-01',
      }),
    });
    const mutualJson = await mutualRes.json();
    const mutualId = mutualJson.data.id;
    console.log('Sindicato y Mutual creados:', unionJson.data.name, '|', mutualJson.data.name);

    // 5.7 Simulación: Agregar columna legacy base_salary NOT NULL en employees para verificar auto-migración
    console.log('\n5️⃣.7 Test: Simulación de columna legacy base_salary NOT NULL');
    const tenantDbClient = await (await import('./src/services/tenantConnectionManager.js')).default.getTenantClient({
      dbName: compJson.data.dbName,
      dbHost: 'localhost',
      dbPort: 3306,
    });
    try {
      await tenantDbClient.$executeRawUnsafe('ALTER TABLE `employees` ADD COLUMN `base_salary` DECIMAL(12, 2) NOT NULL;');
      console.log('  -> Columna legacy base_salary NOT NULL inyectada para probar auto-curación');
    } catch (e) {
      // Ignorar si ya existía
    }

    // 6. Dar de alta un empleado con legajo completo, domicilio, sector, puesto y afiliaciones
    const validCuil = '20351234564';
    const samplePhotoBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...samplePhotoData...';
    console.log(`\n6️⃣ Test: POST /api/v1/employees en empresa ${companyId} (con foto y legajo completo)`);
    const empRes = await fetch(`${baseUrl}/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        fileNumber: 'LEG-001',
        lastName: 'Gómez',
        firstName: 'Martín',
        photo: samplePhotoBase64,
        documentType: 'DNI',
        documentNumber: '35123456',
        cuil: validCuil,
        gender: 'M',
        birthDate: '1990-05-15',
        hireDate: '2024-01-01',
        street: 'Av. Corrientes',
        streetNumber: '1234',
        floor: '4',
        apartment: 'B',
        city: 'Rosario',
        postalCode: '2000',
        province: 'Santa Fe',
        email: 'martin.gomez@test.com',
        phone: '+54 9 341 1234567',
        status: 'ACTIVE',
        departmentId,
        jobPositionId,
        healthInsuranceId,
        unionId,
        mutualId,
      }),
    });
    const empJson = await empRes.json();
    console.log('Respuesta Crear Empleado:', empRes.status, empJson.message);
    if (empRes.status !== 201) throw new Error(`Crear empleado falló: ${JSON.stringify(empJson)}`);
    const employeeId = empJson.data.id;
    if (empJson.data.photo !== samplePhotoBase64) throw new Error('La foto del empleado no se guardó correctamente');
    console.log(`  -> Empleado guardado: ${empJson.data.firstName} ${empJson.data.lastName}, Foto: ${empJson.data.photo ? 'Presente (base64)' : 'Ninguna'}`);

    // 6.1 Test: Crear empleado con campos opcionales nulos (sin sindicato, sin mutual, etc.)
    console.log(`\n6️⃣.1 Test: POST /api/v1/employees con campos opcionales nulos`);
    const empOptRes = await fetch(`${baseUrl}/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        fileNumber: 'LEG-002',
        lastName: 'Pérez',
        firstName: 'Lucía',
        documentType: 'DNI',
        documentNumber: '38123456',
        cuil: '27381234563',
        gender: 'F',
        birthDate: '1995-03-20',
        hireDate: '2024-02-01',
        street: 'Mitre',
        streetNumber: '450',
        floor: null,
        apartment: null,
        city: 'Rosario',
        postalCode: '2000',
        province: 'Santa Fe',
        email: null,
        phone: null,
        status: 'ACTIVE',
        departmentId,
        jobPositionId,
        healthInsuranceId,
        unionId: null,
        mutualId: null,
      }),
    });
    const empOptJson = await empOptRes.json();
    console.log('Respuesta Crear Empleado (Opcionales Nulos):', empOptRes.status, empOptJson.message);
    if (empOptRes.status !== 201) throw new Error(`Crear empleado con opcionales nulos falló: ${JSON.stringify(empOptJson)}`);

    // 6.2 Test: POST /api/v1/employees/import (Importación masiva con resolución inteligente y bajas)
    console.log('\n6️⃣.2 Test: POST /api/v1/employees/import');
    const importEmpRes = await fetch(`${baseUrl}/employees/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        employees: [
          // 1. Activo, resuelve relaciones por DESCRIPCIÓN / NOMBRE
          {
            fileNumber: 'LEG-IMP-01',
            lastName: 'Ríos',
            firstName: 'Carlos',
            documentType: 'DNI',
            documentNumber: '30111222',
            cuil: '20-30111222-0',
            gender: 'M',
            birthDate: '1985-06-12',
            hireDate: '2023-03-01',
            department: 'Administración y Finanzas',
            jobPosition: 'Analista Contable Senior',
            healthInsurance: hiListJson.data[0].name,
            union: 'Sindicato de Empleados de Comercio',
            mutual: 'Mutual de Empleados',
            contractModality: '',
            street: 'San Martín',
            streetNumber: '555',
            floor: '2',
            apartment: 'A',
            city: 'Rosario',
            postalCode: '2000',
            province: 'Santa Fe',
            email: 'carlos.rios@test.com',
            phone: '3415551234',
          },
          // 2. Baja/Inactivo, resuelve relaciones por CÓDIGO, fechas DD/MM/YYYY
          {
            fileNumber: 'LEG-IMP-02',
            lastName: 'Álvarez',
            firstName: 'Mariana',
            documentType: 'DNI',
            documentNumber: '31222333',
            cuil: '20312223334',
            gender: 'F',
            birthDate: '15/08/1988',
            hireDate: '01/01/2022',
            department: 'VTAS',
            jobPosition: 'IMP-01',
            healthInsurance: hiListJson.data[0].code || hiListJson.data[0].name,
            union: '',
            mutual: '',
            contractModality: '',
            street: 'Belgrano',
            streetNumber: '1020',
            floor: '',
            apartment: '',
            city: 'Funes',
            postalCode: '',
            province: 'Santa Fe',
            email: 'mariana.alvarez@test.com',
            phone: '3414445566',
            terminationDate: '31/12/2023',
            terminationReason: 'Renuncia voluntaria',
          },
          // 3. Omitido: Falta número de calle (obligatorio)
          {
            fileNumber: 'LEG-IMP-03',
            lastName: 'Test',
            firstName: 'Sin Altura',
            documentType: 'DNI',
            documentNumber: '32444555',
            cuil: '27324445558',
            gender: 'M',
            birthDate: '1990-01-01',
            hireDate: '2023-01-01',
            department: 'ADM-01',
            jobPosition: 'PST-01',
            healthInsurance: hiListJson.data[0].name,
            street: 'Calle Falsa',
            streetNumber: '',
            city: 'Rosario',
            province: 'Santa Fe',
            email: 'sin.altura@test.com',
            phone: '123456',
          },
          // 4. Omitido: CUIL inválido
          {
            fileNumber: 'LEG-IMP-04',
            lastName: 'Test',
            firstName: 'Cuil Inválido',
            documentType: 'DNI',
            documentNumber: '30111222',
            cuil: '20301112229',
            gender: 'M',
            birthDate: '1990-01-01',
            hireDate: '2023-01-01',
            department: 'ADM-01',
            jobPosition: 'PST-01',
            healthInsurance: hiListJson.data[0].name,
            street: 'Calle 1',
            streetNumber: '100',
            city: 'Rosario',
            province: 'Santa Fe',
            email: 'cuil.invalido@test.com',
            phone: '123456',
          },
          // 5. Omitido: Sector inexistente
          {
            fileNumber: 'LEG-IMP-05',
            lastName: 'Test',
            firstName: 'Sector Inexistente',
            documentType: 'DNI',
            documentNumber: '32444555',
            cuil: '27324445558',
            gender: 'F',
            birthDate: '1990-01-01',
            hireDate: '2023-01-01',
            department: 'SECTOR_INEXISTENTE_XYZ',
            jobPosition: 'PST-01',
            healthInsurance: hiListJson.data[0].name,
            street: 'Calle 2',
            streetNumber: '200',
            city: 'Rosario',
            province: 'Santa Fe',
            email: 'sec.inexistente@test.com',
            phone: '123456',
          },
          // 6. Omitido: Legajo duplicado en BD ('LEG-001')
          {
            fileNumber: 'LEG-001',
            lastName: 'Repetido',
            firstName: 'Base Datos',
            documentType: 'DNI',
            documentNumber: '32444555',
            cuil: '27324445558',
            gender: 'M',
            birthDate: '1990-01-01',
            hireDate: '2023-01-01',
            department: 'ADM-01',
            jobPosition: 'PST-01',
            healthInsurance: hiListJson.data[0].name,
            street: 'Calle 3',
            streetNumber: '300',
            city: 'Rosario',
            province: 'Santa Fe',
            email: 'rep.bd@test.com',
            phone: '123456',
          },
          // 7. Omitido: Legajo duplicado dentro del lote ('LEG-IMP-01')
          {
            fileNumber: 'LEG-IMP-01',
            lastName: 'Repetido',
            firstName: 'En Lote',
            documentType: 'DNI',
            documentNumber: '32444555',
            cuil: '27324445558',
            gender: 'M',
            birthDate: '1990-01-01',
            hireDate: '2023-01-01',
            department: 'ADM-01',
            jobPosition: 'PST-01',
            healthInsurance: hiListJson.data[0].name,
            street: 'Calle 4',
            streetNumber: '400',
            city: 'Rosario',
            province: 'Santa Fe',
            email: 'rep.lote@test.com',
            phone: '123456',
          },
        ],
      }),
    });
    const importEmpJson = await importEmpRes.json();
    console.log('Respuesta Importar Empleados:', importEmpRes.status, importEmpJson.message);
    console.log(`  -> Agregados: ${importEmpJson.data.createdCount}, Omitidos: ${importEmpJson.data.skippedCount}`);
    if (importEmpRes.status !== 200 || importEmpJson.data.createdCount !== 2 || importEmpJson.data.skippedCount !== 5) {
      throw new Error(`Importación de empleados falló: ${JSON.stringify(importEmpJson)}`);
    }
    console.log('  -> Omitidos reportados:', importEmpJson.data.skipped.map((s) => `${s.fileNumber}: ${s.reason}`).join(' | '));

    // Verificar que el empleado dado de baja se guardó como INACTIVE con fecha y motivo de baja
    const inactiveEmpRes = await fetch(`${baseUrl}/employees?search=Alvarez`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'x-company-id': companyId },
    });
    const inactiveEmpJson = await inactiveEmpRes.json();
    const importedInactive = inactiveEmpJson.data.find((e) => e.fileNumber === 'LEG-IMP-02');
    if (!importedInactive) throw new Error('El empleado importado LEG-IMP-02 no se encontró');
    if (importedInactive.status !== 'INACTIVE') throw new Error(`El empleado LEG-IMP-02 debió crearse con status INACTIVE y tiene ${importedInactive.status}`);
    if (!importedInactive.terminationDate) throw new Error('El empleado LEG-IMP-02 no registró terminationDate');
    if (importedInactive.terminationReason !== 'Renuncia voluntaria') {
      throw new Error(`El empleado LEG-IMP-02 no registró el motivo de baja esperado: ${importedInactive.terminationReason}`);
    }
    console.log(`  -> Empleado LEG-IMP-02 verificado con status INACTIVE, baja: ${importedInactive.terminationDate}, motivo: "${importedInactive.terminationReason}"`);

    // 7. Listar empleados de la empresa con filtros
    console.log('\n7️⃣ Test: GET /api/v1/employees?search=Gomez&status=ACTIVE');
    const empListRes = await fetch(`${baseUrl}/employees?search=Gomez&status=ACTIVE`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const empListJson = await empListRes.json();
    console.log('Respuesta Listar Empleados:', empListRes.status, 'Total filtrado:', empListJson.meta.total);
    if (empListJson.data.length === 0) throw new Error('El empleado creado no figura en la búsqueda');

    // 7.1 Modificar Ficha de Empleado
    console.log(`\n7️⃣.1 Test: PATCH /api/v1/employees/${employeeId}`);
    const empPatchRes = await fetch(`${baseUrl}/employees/${employeeId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        floor: '5',
        apartment: 'A',
      }),
    });
    const empPatchJson = await empPatchRes.json();
    console.log('Respuesta Patch Empleado:', empPatchRes.status, 'Nuevo piso:', empPatchJson.data.floor);
    if (empPatchRes.status !== 200 || empPatchJson.data.floor !== '5') throw new Error('Modificación de empleado falló');

    // 8. Test de Seguridad: Intentar acceder sin header de empresa
    console.log('\n8️⃣ Test: GET /api/v1/employees sin x-company-id (debe fallar 400)');
    const failTenantRes = await fetch(`${baseUrl}/employees`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const failTenantJson = await failTenantRes.json();
    console.log('Respuesta Esperada:', failTenantRes.status, failTenantJson.error.message);
    if (failTenantRes.status !== 400) throw new Error('Debió fallar con 400');

    // 9. Test de Seguridad: Intentar acceder con token falso
    console.log('\n9️⃣ Test: GET /api/v1/companies con Token Inválido (debe fallar 401)');
    const fakeAuthRes = await fetch(`${baseUrl}/companies`, {
      headers: { Authorization: 'Bearer token_invalido_falso' },
    });
    const fakeAuthJson = await fakeAuthRes.json();
    console.log('Respuesta Esperada:', fakeAuthRes.status, fakeAuthJson.error.message);
    if (fakeAuthRes.status !== 401) throw new Error('Debió fallar con 401');

    // 10. Test ABM de Usuarios: Crear colaborador con datos personales y acceso a empresa
    console.log('\n🔟 Test: POST /api/v1/users (Crear colaborador con CUIL, teléfono, cargo y permisos de empresa)');
    const lauraCuil = '27351234569';
    const lauraEmail = `laura_${Date.now()}@test.com`;
    const createUserRes = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        firstName: 'Laura',
        lastName: 'Fernández',
        email: lauraEmail,
        password: 'Password123!',
        role: 'MEMBER',
        cuil: lauraCuil,
        phone: '+54 9 11 5555-1234',
        position: 'Analista de RRHH',
        companyAccesses: [
          { companyId, role: 'OPERATOR' },
        ],
      }),
    });
    const createUserJson = await createUserRes.json();
    console.log('Respuesta Crear Colaborador:', createUserRes.status, createUserJson.message);
    if (createUserRes.status !== 201) throw new Error(`Crear usuario falló: ${JSON.stringify(createUserJson)}`);
    const newUserId = createUserJson.data.id;

    // 11. Test: Obtener detalle del colaborador y verificar CUIL y matriz de empresas
    console.log(`\n1️⃣1️⃣ Test: GET /api/v1/users/${newUserId}`);
    const getUserRes = await fetch(`${baseUrl}/users/${newUserId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const getUserJson = await getUserRes.json();
    console.log('Respuesta Detalle Usuario:', getUserRes.status, 'CUIL:', getUserJson.data.cuil, 'Empresas:', getUserJson.data.companyAccesses?.length);
    if (getUserRes.status !== 200 || getUserJson.data.cuil !== lauraCuil) {
      throw new Error('Detalle de usuario no devolvió el CUIL esperado');
    }

    // 12. Test de Login con el nuevo colaborador y acceso a los datos de la empresa
    console.log(`\n1️⃣2️⃣ Test: Login del Colaborador ${lauraEmail}`);
    const loginUserRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: lauraEmail,
        password: 'Password123!',
      }),
    });
    const loginUserJson = await loginUserRes.json();
    console.log('Respuesta Login Colaborador:', loginUserRes.status, 'Usuario autenticado:', loginUserJson.data.user.email);
    if (loginUserRes.status !== 200) throw new Error('Login del colaborador falló');
    const lauraToken = loginUserJson.data.accessToken;

    // Verificar que Laura (OPERATOR) puede consultar y crear empleados de la empresa asignada
    const lauraEmpRes = await fetch(`${baseUrl}/employees`, {
      headers: {
        Authorization: `Bearer ${lauraToken}`,
        'x-company-id': companyId,
      },
    });
    console.log('Respuesta Acceso Colaborador a Empleados de Empresa:', lauraEmpRes.status);
    if (lauraEmpRes.status !== 200) throw new Error('El colaborador con permiso no pudo acceder a los empleados');

    // 13. Test de Seguridad: El colaborador PUEDE ver la ficha de la empresa pero NO PUEDE modificarla (Solo OWNER)
    console.log('\n1️⃣3️⃣ Test: Colaborador no-owner intenta leer ficha (permitido) y modificarla (debe fallar 403)');
    const lauraGetProfile = await fetch(`${baseUrl}/companies/profile`, {
      headers: {
        Authorization: `Bearer ${lauraToken}`,
        'x-company-id': companyId,
      },
    });
    console.log('  -> Lectura de ficha por colaborador:', lauraGetProfile.status);
    if (lauraGetProfile.status !== 200) throw new Error('El colaborador debió poder leer la ficha');

    const lauraPutProfile = await fetch(`${baseUrl}/companies/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lauraToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        legalName: 'Intento Ilegal de Modificación S.A.',
      }),
    });
    const lauraPutJson = await lauraPutProfile.json();
    console.log('  -> Modificación de ficha por colaborador (esperado 403):', lauraPutProfile.status, lauraPutJson.error.message);
    if (lauraPutProfile.status !== 403) throw new Error('La modificación por no-owner debió ser rechazada con 403');

    // 14. Test: Baja de Empleado (DELETE /api/v1/employees/:id)
    console.log(`\n1️⃣4️⃣ Test: DELETE /api/v1/employees/${employeeId} por usuario OPERATOR`);
    const delEmpRes = await fetch(`${baseUrl}/employees/${employeeId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${lauraToken}`,
        'x-company-id': companyId,
      },
    });
    console.log('  -> Baja de empleado status:', delEmpRes.status);
    if (delEmpRes.status !== 200) throw new Error('La baja de empleado debió completarse con 200');

    // 15. Test: CRUD de Parentescos (Kinships)
    console.log('\n1️⃣5️⃣ Test: GET /api/v1/kinships y POST /api/v1/kinships');
    const kinListRes = await fetch(`${baseUrl}/kinships`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const kinListJson = await kinListRes.json();
    console.log('  -> Cantidad de parentescos iniciales (precargados):', kinListJson.data?.length);
    if (kinListRes.status !== 200 || !kinListJson.data || kinListJson.data.length < 8) {
      throw new Error(`Se esperaban al menos 8 parentescos por defecto, se obtuvieron: ${kinListJson.data?.length}`);
    }

    const conyugeKin = kinListJson.data.find((k) => k.code === 'CONYUGE' || k.name.includes('Cónyuge'));
    const hijoKin = kinListJson.data.find((k) => k.code === 'HIJO_MENOR' || k.name.includes('Hijo'));
    if (!conyugeKin || !hijoKin) throw new Error('No se encontraron los parentescos básicos Cónyuge e Hijo');

    // Crear un parentesco personalizado
    const createKinRes = await fetch(`${baseUrl}/kinships`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        name: 'Tutor / Encargado Legal',
        code: 'TUTOR_LEGAL',
      }),
    });
    const createKinJson = await createKinRes.json();
    console.log('  -> Creación de parentesco personalizado:', createKinRes.status, createKinJson.data?.name);
    if (createKinRes.status !== 201) throw new Error('Creación de parentesco falló');
    const customKinId = createKinJson.data.id;

    // 16. Test: Alta de Empleado con Familiares en una sola transacción
    console.log('\n1️⃣6️⃣ Test: POST /api/v1/employees con familiares anidados');
    const empFamilyCuit = '20361234562';
    const empWithFamilyRes = await fetch(`${baseUrl}/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        fileNumber: 'L-1002',
        lastName: 'Martínez',
        firstName: 'Carlos',
        photo: null,
        documentType: 'DNI',
        documentNumber: '36123456',
        cuil: empFamilyCuit,
        gender: 'M',
        birthDate: '1991-03-15',
        hireDate: '2024-01-01',
        street: 'San Martín',
        streetNumber: '1234',
        floor: null,
        apartment: null,
        city: 'Rosario',
        postalCode: '2000',
        province: 'Santa Fe',
        status: 'ACTIVE',
        departmentId,
        jobPositionId,
        healthInsuranceId,
        unionId: null,
        mutualId: null,
        relatives: [
          {
            kinshipId: conyugeKin.id,
            lastName: 'Gómez',
            firstName: 'María Elena',
            documentType: 'DNI',
            documentNumber: '37888999',
            cuil: '27378889990',
            birthDate: '1992-06-20',
          },
          {
            kinshipId: hijoKin.id,
            lastName: 'Martínez',
            firstName: 'Tomás',
            documentType: 'DNI',
            documentNumber: '58111222',
            cuil: '20581112220',
            birthDate: '2018-09-10',
          },
        ],
      }),
    });
    const empWithFamilyJson = await empWithFamilyRes.json();
    console.log('  -> Alta de empleado con familiares:', empWithFamilyRes.status, empWithFamilyJson.message);
    if (empWithFamilyRes.status !== 201) throw new Error(`Alta de empleado con parientes falló: ${JSON.stringify(empWithFamilyJson)}`);
    const empFamilyId = empWithFamilyJson.data.id;

    // 17. Test: Obtener detalle del empleado y verificar que incluya los parientes cargados
    console.log(`\n1️⃣7️⃣ Test: GET /api/v1/employees/${empFamilyId} (Verificar parientes asociados)`);
    const empDetailRes = await fetch(`${baseUrl}/employees/${empFamilyId}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const empDetailJson = await empDetailRes.json();
    console.log('  -> Familiares obtenidos en detalle:', empDetailJson.data?.relatives?.length);
    if (empDetailRes.status !== 200 || !empDetailJson.data.relatives || empDetailJson.data.relatives.length !== 2) {
      throw new Error('Se esperaban 2 parientes asociados al empleado');
    }
    console.log('  -> Primer familiar:', empDetailJson.data.relatives[0].firstName, `(${empDetailJson.data.relatives[0].kinship?.name})`);

    // 18. Test: Agregar un tercer familiar directamente vía POST /api/v1/employees/:id/relatives
    console.log(`\n1️⃣8️⃣ Test: POST /api/v1/employees/${empFamilyId}/relatives con parentesco personalizado`);
    const addRelRes = await fetch(`${baseUrl}/employees/${empFamilyId}/relatives`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        kinshipId: customKinId,
        lastName: 'Martínez',
        firstName: 'Lucas',
        documentType: 'DNI',
        documentNumber: '60123123',
        cuil: null,
        birthDate: '2021-12-05',
      }),
    });
    const addRelJson = await addRelRes.json();
    console.log('  -> Agregar familiar a empleado existente:', addRelRes.status, addRelJson.message);
    if (addRelRes.status !== 201) throw new Error('Agregar familiar falló');
    const addedRelId = addRelJson.data.id;

    // 18.1 Test: Modificar datos del familiar (PATCH /api/v1/employees/:id/relatives/:relativeId)
    console.log(`\n1️⃣8️⃣.1 Test: PATCH /api/v1/employees/${empFamilyId}/relatives/${addedRelId}`);
    const patchRelRes = await fetch(`${baseUrl}/employees/${empFamilyId}/relatives/${addedRelId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        firstName: 'Lucas Gabriel',
      }),
    });
    const patchRelJson = await patchRelRes.json();
    console.log('  -> Modificación familiar status:', patchRelRes.status, 'Nombre actualizado:', patchRelJson.data?.firstName);
    if (patchRelRes.status !== 200 || patchRelJson.data.firstName !== 'Lucas Gabriel') {
      throw new Error('Modificación de familiar falló');
    }

    // 19. Test: Validar restricción de borrado de parentesco en uso y posterior baja
    console.log(`\n1️⃣9️⃣ Test: DELETE /api/v1/kinships/${customKinId} cuando está en uso (debe fallar 409 Conflict)`);
    const failDelKinRes = await fetch(`${baseUrl}/kinships/${customKinId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const failDelKinJson = await failDelKinRes.json();
    console.log('  -> Borrado bloqueado status (esperado 409):', failDelKinRes.status, failDelKinJson.error?.message);
    if (failDelKinRes.status !== 409 && failDelKinRes.status !== 400) throw new Error('El borrado de un parentesco en uso debió ser bloqueado');

    // Dar de baja el familiar y luego eliminar el parentesco
    console.log(`\n1️⃣9️⃣.1 Test: DELETE /api/v1/employees/${empFamilyId}/relatives/${addedRelId} y luego eliminar parentesco`);
    const delRelRes = await fetch(`${baseUrl}/employees/${empFamilyId}/relatives/${addedRelId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    console.log('  -> Baja de familiar status:', delRelRes.status);
    if (delRelRes.status !== 200) throw new Error('Baja de familiar falló');

    const successDelKinRes = await fetch(`${baseUrl}/kinships/${customKinId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    console.log('  -> Baja de parentesco desvinculado status:', successDelKinRes.status);
    if (successDelKinRes.status !== 200) throw new Error('Baja de parentesco desvinculado debió completarse con 200');

    // 20. Test Módulo de Liquidación de Sueldos y Libro de Sueldos Digital (ARCA)
    console.log('\n2️⃣0️⃣ Test: Módulo de Liquidación de Sueldos (ARCA / Ley 27.802 & Dec. 407/2026)');

    // 20.1 Conceptos predeterminados
    console.log('  -> 20.1: GET /api/v1/payroll/concepts');
    const conceptsRes = await fetch(`${baseUrl}/payroll/concepts`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const conceptsJson = await conceptsRes.json();
    console.log('     Status:', conceptsRes.status, 'Conceptos precargados:', conceptsJson.meta?.total);
    if (conceptsRes.status !== 200 || !conceptsJson.data || conceptsJson.data.length < 3) {
      throw new Error(`Se esperaban conceptos predeterminados, se obtuvieron: ${conceptsJson.data?.length}`);
    }

    // 20.2 Crear un concepto con fórmula personalizada (Remunerativo 2500)
    console.log('  -> 20.2: POST /api/v1/payroll/concepts (Fórmula personalizada)');
    const createConceptRes = await fetch(`${baseUrl}/payroll/concepts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'SU2500',
        name: 'Bono Productividad',
        type: 'REMUNERATIVE',
        calculationType: 'FORMULA',
        defaultValue: 0,
        formula: '[SU1000] * 0.10',
        arcaConceptCode: '120000',
        appliesSipaAporte: true,
        appliesSipaContrib: true,
        appliesInssjypAporte: true,
        appliesInssjypContrib: true,
        appliesOsAporte: true,
        appliesOsContrib: true,
        appliesFsrAporte: true,
        appliesFsrContrib: true,
        appliesRenatreAporte: false,
        appliesRenatreContrib: false,
        appliesAaffContrib: true,
        appliesFneContrib: true,
        appliesLrtContrib: true,
      }),
    });
    const createConceptJson = await createConceptRes.json();
    console.log('     Status:', createConceptRes.status, 'Concepto creado:', createConceptJson.data?.code, createConceptJson.data?.name);
    if (createConceptRes.status !== 201) throw new Error('Falló creación de concepto con fórmula');

    // 20.2.b Crear concepto de deducción (Jubilación 11%)
    console.log('  -> 20.2.b: POST /api/v1/payroll/concepts (Deducción 6001)');
    const createDedRes = await fetch(`${baseUrl}/payroll/concepts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'SU6005',
        name: 'Retención Adicional 11%',
        type: 'DEDUCTION',
        periodType: 'MONTHLY',
        calculationType: 'PERCENTAGE',
        defaultValue: 11,
        arcaConceptCode: '810000',
        appliesSipaAporte: true,
      }),
    });
    if (createDedRes.status !== 201) throw new Error('Falló creación de concepto de deducción');

    // 20.3 Parámetros y Alícuotas Patronales
    console.log('  -> 20.3: GET & PATCH /api/v1/payroll/settings');
    const settingsRes = await fetch(`${baseUrl}/payroll/settings`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const settingsJson = await settingsRes.json();
    console.log('     Status GET Settings:', settingsRes.status, 'SIPA Patronal:', settingsJson.data?.sipaRate);
    if (settingsRes.status !== 200 || !settingsJson.data?.sipaRate) throw new Error('Falló lectura de parámetros patronales');

    const updateSettingsRes = await fetch(`${baseUrl}/payroll/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        artRate: 3.5,
        artFixedFee: 250.00,
        ansesMaxCap: 3500000.00,
      }),
    });
    const updateSettingsJson = await updateSettingsRes.json();
    console.log('     Status PATCH Settings:', updateSettingsRes.status, 'Nueva ART:', updateSettingsJson.data?.artRate);
    if (updateSettingsRes.status !== 200 || Number(updateSettingsJson.data?.artRate) !== 3.5) {
      throw new Error('Falló actualización de parámetros patronales');
    }

    // 20.4 Crear Período de Liquidación (Septiembre 2026)
    console.log('  -> 20.4: POST /api/v1/payroll/periods');
    const createPeriodRes = await fetch(`${baseUrl}/payroll/periods`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        month: 9,
        year: 2026,
        type: 'MONTHLY',
        name: 'Sueldos Septiembre 2026 - Mensual',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        paymentDate: '2026-10-05',
        depositDate: '2026-10-02',
        depositBank: 'Banco Santander',
      }),
    });
    const createPeriodJson = await createPeriodRes.json();
    console.log('     Status Crear Período:', createPeriodRes.status, 'ID:', createPeriodJson.data?.id);
    if (createPeriodRes.status !== 201) throw new Error('Falló creación de período');
    const periodId = createPeriodJson.data.id;

    // 20.5 Calcular Liquidación con Novedades
    console.log(`  -> 20.5: POST /api/v1/payroll/periods/${periodId}/calculate`);
    const calculateRes = await fetch(`${baseUrl}/payroll/periods/${periodId}/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        novedades: [
          {
            employeeId: empFamilyId,
            workedDays: 30,
            overtime50Hours: 4,
            overtime100Hours: 0,
            unjustifiedAbsences: 0,
            sickLeaveDays: 0,
            customItems: [
              { conceptCode: 'SU1000', amount: 1500000 },
              { conceptCode: 'SU2500' }, // Se calcula con fórmula 10% de SU1000 = 150.000
            ],
          },
        ],
      }),
    });
    const calculateJson = await calculateRes.json();
    console.log('     Status Calcular:', calculateRes.status, 'Procesados:', calculateJson.data?.processedEmployees);
    if (calculateRes.status !== 200 || calculateJson.data?.processedEmployees < 1) {
      throw new Error(`Falló cálculo de liquidación: ${JSON.stringify(calculateJson)}`);
    }

    // 20.6 Listar Recibos del Período
    console.log(`  -> 20.6: GET /api/v1/payroll/periods/${periodId}/slips`);
    const slipsRes = await fetch(`${baseUrl}/payroll/periods/${periodId}/slips`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const slipsJson = await slipsRes.json();
    console.log('     Status Listar Recibos:', slipsRes.status, 'Recibos generados:', slipsJson.data?.length);
    if (slipsRes.status !== 200 || !slipsJson.data || slipsJson.data.length === 0) {
      throw new Error('No se generaron recibos en la liquidación');
    }
    const slip = slipsJson.data[0];
    const slipId = slip.id;
    console.log(`     Recibo #${slip.receiptNumber} - Bruto: $${slip.grossSalary}, Retenciones: $${slip.totalDeductions}, Neto: $${slip.netSalary}, CLT: $${slip.totalLaborCost}`);

    // Verificar cuadratura matemática estricta
    const grossNum = Number(slip.grossSalary);
    const dedNum = Number(slip.totalDeductions);
    const netNum = Number(slip.netSalary);
    const contribNum = Number(slip.totalEmployerContributions);
    const cltNum = Number(slip.totalLaborCost);

    if (Math.abs((grossNum - dedNum) - netNum) > 0.05) {
      throw new Error(`Inconsistencia en recibo: Bruto (${grossNum}) - Retenciones (${dedNum}) != Neto (${netNum})`);
    }
    if (Math.abs((grossNum + contribNum) - cltNum) > 0.05) {
      throw new Error(`Inconsistencia en recibo: Bruto (${grossNum}) + Contribuciones (${contribNum}) != Costo Laboral Total (${cltNum})`);
    }

    // 20.7 Detalle de Recibo de Sueldo (4 Bloques, Ley 27.802 & Dec. 407/2026)
    console.log(`  -> 20.7: GET /api/v1/payroll/slips/${slipId}`);
    const slipDetailRes = await fetch(`${baseUrl}/payroll/slips/${slipId}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const slipDetailJson = await slipDetailRes.json();
    const slipDetail = slipDetailJson.data;
    console.log('     Status Detalle Recibo:', slipDetailRes.status, 'Neto en letras:', slipDetail?.netSalaryWords);
    if (slipDetailRes.status !== 200) throw new Error('Falló obtención de detalle de recibo');
    if (!slipDetail.netSalaryWords || slipDetail.netSalaryWords.length < 5) {
      throw new Error('El importe neto en letras está vacío');
    }
    if (!slipDetail.costDistribution || slipDetail.costDistribution.distribution.length === 0) {
      throw new Error('Falta el desglose del 100% del Costo Laboral Total');
    }
    console.log(`     Desglose CLT (100%): Neto = ${slipDetail.costDistribution.netPercentage}%, Retenciones = ${slipDetail.costDistribution.deductionsPercentage}%, C. Patronales = ${slipDetail.costDistribution.employerContributionsPercentage}%`);

    // 20.8 Validación de consistencia Libro de Sueldos Digital (ARCA)
    console.log(`  -> 20.8: GET /api/v1/payroll/periods/${periodId}/lsd/validate`);
    const lsdValRes = await fetch(`${baseUrl}/payroll/periods/${periodId}/lsd/validate`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const lsdValJson = await lsdValRes.json();
    console.log('     Status Validación LSD:', lsdValRes.status, 'Es válido:', lsdValJson.data?.isValid, 'Errores:', lsdValJson.data?.errors?.length);
    if (lsdValRes.status !== 200 || !lsdValJson.data?.isValid) {
      throw new Error(`Validación LSD falló: ${JSON.stringify(lsdValJson.data?.errors)}`);
    }

    // 20.9 Exportar Archivo 1 ARCA: Parametrización de Conceptos (195 caracteres por línea)
    console.log('  -> 20.9: GET /api/v1/payroll/lsd/concepts (Archivo 1 ARCA - 195 caracteres)');
    const lsdConceptsRes = await fetch(`${baseUrl}/payroll/lsd/concepts`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const lsdConceptsText = await lsdConceptsRes.text();
    console.log('     Status Archivo Conceptos:', lsdConceptsRes.status, 'Bytes:', lsdConceptsText.length);
    if (lsdConceptsRes.status !== 200) throw new Error('Falló exportación de conceptos ARCA');
    const conceptLines = lsdConceptsText.split('\r\n').filter((l) => l.trim().length > 0);
    for (let i = 0; i < conceptLines.length; i++) {
      if (conceptLines[i].length !== 195) {
        throw new Error(`Línea ${i + 1} de conceptos ARCA tiene ${conceptLines[i].length} caracteres (deben ser exactamente 195)`);
      }
    }
    console.log(`     -> ${conceptLines.length} conceptos verificados con longitud exacta de 195 caracteres.`);

    // 20.10 Exportar Archivo 2 ARCA: Liquidación F.931 (longitudes oficiales ARCA: 01:35, 02:115, 03:51, 04:370)
    console.log(`  -> 20.10: GET /api/v1/payroll/periods/${periodId}/lsd/payroll (Archivo 2 ARCA)`);
    const lsdPayrollRes = await fetch(`${baseUrl}/payroll/periods/${periodId}/lsd/payroll`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const lsdPayrollText = await lsdPayrollRes.text();
    console.log('     Status Archivo Liquidación:', lsdPayrollRes.status, 'Bytes:', lsdPayrollText.length);
    if (lsdPayrollRes.status !== 200) throw new Error('Falló exportación de liquidación ARCA');
    const payrollLines = lsdPayrollText.split('\r\n').filter((l) => l.trim().length > 0);
    for (let i = 0; i < payrollLines.length; i++) {
      const type = payrollLines[i].substring(0, 2);
      const expected = type === '01' ? 35 : (type === '02' ? 115 : (type === '03' ? 51 : 370));
      if (payrollLines[i].length !== expected) {
        throw new Error(`Línea ${i + 1} tipo ${type} del libro de sueldos tiene ${payrollLines[i].length} caracteres (deben ser exactamente ${expected})`);
      }
    }
    console.log(`     -> ${payrollLines.length} registros (01:35, 02:115, 03:51, 04:370) verificados con longitudes oficiales de ARCA.`);

    // 21. Test: Módulo de Matrices de Liquidación (Lookup Matrices y Valores Fijos)
    console.log('\n21️⃣ Test: Módulo de Matrices de Liquidación (Lookup Matrices, Asignación de Conceptos y Resolución de Valores Fijos)');

    // 21.1 Crear matriz por rango asignada a ANTIGUEDAD_ANOS
    console.log('  -> 21.1: POST /api/v1/payroll/matrices (Crear Matriz MAT_ANTIGUEDAD)');
    const createMatrixRes = await fetch(`${baseUrl}/payroll/matrices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'MAT_ANTIGUEDAD',
        name: 'Escala Adicional por Antigüedad',
        description: 'Valores fijos según tramos de años de antigüedad',
        inputConceptCode: 'ANTIGUEDAD_ANOS',
        matchType: 'RANGE',
        defaultValue: 0.00,
        rows: [
          { from: 0, to: 1, value: 10000 },
          { from: 2, to: 5, value: 25000 },
          { from: 6, to: 10, value: 50000 },
        ],
      }),
    });
    const createMatrixJson = await createMatrixRes.json();
    console.log('     Status Matriz:', createMatrixRes.status, createMatrixJson.message);
    if (createMatrixRes.status !== 201) throw new Error(`Creación de matriz falló: ${JSON.stringify(createMatrixJson)}`);
    const matrixId = createMatrixJson.data.id;

    // 21.2 Listar matrices con paginación
    console.log('  -> 21.2: GET /api/v1/payroll/matrices?limit=5');
    const listMatricesRes = await fetch(`${baseUrl}/payroll/matrices?limit=5`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const listMatricesJson = await listMatricesRes.json();
    console.log('     Status Listado:', listMatricesRes.status, 'Total:', listMatricesJson.meta?.total);
    if (listMatricesRes.status !== 200) throw new Error('Listado de matrices falló');
    if (listMatricesJson.data[0].rowsCount !== 3) {
      throw new Error(`Se esperaban 3 filas en la matriz, pero se obtuvieron ${listMatricesJson.data[0].rowsCount}`);
    }

    // 21.3 Crear concepto que utiliza directamente la matriz
    console.log('  -> 21.3: POST /api/v1/payroll/concepts (Concepto 1050 vinculado a la Matriz)');
    const conceptMatrixRes = await fetch(`${baseUrl}/payroll/concepts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'SU1050',
        name: 'Adicional Especial por Matriz',
        type: 'REMUNERATIVE',
        calculationType: 'MATRIX',
        matrixId: matrixId,
        appliesSipaAporte: true,
        appliesSipaContrib: true,
        appliesOsAporte: true,
        appliesOsContrib: true,
      }),
    });
    const conceptMatrixJson = await conceptMatrixRes.json();
    console.log('     Status Concepto Matriz:', conceptMatrixRes.status, conceptMatrixJson.message);
    if (conceptMatrixRes.status !== 201) throw new Error(`Creación de concepto con matriz falló: ${JSON.stringify(conceptMatrixJson)}`);

    // 21.4 Crear concepto que utiliza la matriz en una fórmula [MATRIZ:MAT_ANTIGUEDAD]
    console.log('  -> 21.4: POST /api/v1/payroll/concepts (Concepto 1060 con fórmula [MATRIZ:MAT_ANTIGUEDAD])');
    const conceptFormulaMatrixRes = await fetch(`${baseUrl}/payroll/concepts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'SU1060',
        name: 'Bono Complementario por Fórmula',
        type: 'REMUNERATIVE',
        calculationType: 'FORMULA',
        formula: '[SU1000] * 0.05 + [MATRIZ:MAT_ANTIGUEDAD]',
        appliesSipaAporte: true,
        appliesSipaContrib: true,
        appliesOsAporte: true,
        appliesOsContrib: true,
      }),
    });
    const conceptFormulaMatrixJson = await conceptFormulaMatrixRes.json();
    console.log('     Status Concepto Fórmula con Matriz:', conceptFormulaMatrixRes.status, conceptFormulaMatrixJson.message);
    if (conceptFormulaMatrixRes.status !== 201) throw new Error(`Creación de concepto fórmula con matriz falló: ${JSON.stringify(conceptFormulaMatrixJson)}`);

    // 21.5 Recalcular liquidación y verificar resolución matemática de la matriz
    console.log(`  -> 21.5: POST /api/v1/payroll/periods/${periodId}/calculate (Recalcular con conceptos de matriz)`);
    const recalcRes = await fetch(`${baseUrl}/payroll/periods/${periodId}/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        novedades: [
          {
            employeeId: empFamilyId,
            workedDays: 30,
            customItems: [
              { conceptCode: 'SU1000', amount: 500000.00 },
            ],
          },
        ],
      }),
    });
    const recalcJson = await recalcRes.json();
    console.log('     Status Recalculo:', recalcRes.status, recalcJson.message);
    if (recalcRes.status !== 200) throw new Error('Recálculo de liquidación falló');

    // 21.6 Consultar detalle del recibo y verificar los valores devueltos por la matriz
    console.log('  -> 21.6: GET /api/v1/payroll/slips/:slipId (Verificar items resueltos por la matriz)');
    const slipsListRes = await fetch(`${baseUrl}/payroll/periods/${periodId}/slips`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const slipsListJson = await slipsListRes.json();
    const targetSlip = slipsListJson.data.find((s) => s.employeeId === empFamilyId) || slipsListJson.data[0];
    const updatedSlipId = targetSlip.id;

    const matrixSlipDetailRes = await fetch(`${baseUrl}/payroll/slips/${updatedSlipId}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const matrixSlipDetailJson = await matrixSlipDetailRes.json();
    const items = matrixSlipDetailJson.data.items || [];

    const item1050 = items.find((i) => i.conceptCode === 'SU1050');
    const item1060 = items.find((i) => i.conceptCode === 'SU1060');

    console.log('     Item 1050 (Matriz pura - 2 años antigüedad):', item1050 ? `$${item1050.amount}` : 'NO ENCONTRADO');
    console.log('     Item 1060 (Fórmula con [MATRIZ:...]):', item1060 ? `$${item1060.amount}` : 'NO ENCONTRADO');

    if (!item1050 || Number(item1050.amount) !== 25000) {
      throw new Error(`El concepto de matriz 1050 debía ser $25,000.00 pero dio: ${item1050?.amount}`);
    }
    // 500,000 * 0.05 (25,000) + Matriz (25,000) = 50,000
    if (!item1060 || Number(item1060.amount) !== 50000) {
      throw new Error(`El concepto fórmula 1060 debía ser $50,000.00 pero dio: ${item1060?.amount}`);
    }
    console.log('     -> Validación matemática de matriz y fórmula con matriz 100% exitosa.');

    // 21.7 Intentar borrar la matriz en uso (debe rechazar con 400)
    console.log(`  -> 21.7: DELETE /api/v1/payroll/matrices/${matrixId} (Debe rechazar por estar en uso)`);
    const deleteMatrixInUseRes = await fetch(`${baseUrl}/payroll/matrices/${matrixId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const deleteMatrixInUseJson = await deleteMatrixInUseRes.json();
    console.log('     Status Rechazo:', deleteMatrixInUseRes.status, deleteMatrixInUseJson.message);
    if (deleteMatrixInUseRes.status !== 400) {
      throw new Error('Se esperaba status 400 al intentar eliminar una matriz asignada a un concepto activo');
    }

    // 21.8 Crear Matriz de Porcentaje (PERCENTAGE) evaluada sobre concepto driver
    console.log('  -> 21.8: POST /api/v1/payroll/matrices (Crear Matriz de Porcentaje MAT_ESCALA_PCT)');
    const createPctMatrixRes = await fetch(`${baseUrl}/payroll/matrices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'MAT_ESCALA_PCT',
        name: 'Escala Porcentual Productividad',
        description: 'Retorna alícuotas porcentuales sobre el básico según escala',
        inputConceptCode: 'SU1000',
        matchType: 'RANGE',
        defaultValue: 0,
        rows: {
          resultType: 'PERCENTAGE',
          rules: [
            { from: 0, to: 1000000, value: 10, valueType: 'PERCENTAGE' },
            { from: 1000001, to: 5000000, value: 15, valueType: 'PERCENTAGE' },
          ],
        },
      }),
    });
    const createPctMatrixJson = await createPctMatrixRes.json();
    console.log('     Status Matriz Porcentual:', createPctMatrixRes.status, createPctMatrixJson.message);
    if (createPctMatrixRes.status !== 201) throw new Error('Falló creación de matriz porcentual');
    const pctMatrixId = createPctMatrixJson.data.id;

    // 21.9 Crear Concepto 1070 vinculado a la matriz porcentual
    console.log('  -> 21.9: POST /api/v1/payroll/concepts (Concepto 1070 asignado a matriz porcentual)');
    const createConcept1070Res = await fetch(`${baseUrl}/payroll/concepts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'SU1070',
        name: 'Adicional Productividad Escala Pct',
        type: 'REMUNERATIVE',
        calculationType: 'MATRIX',
        matrixId: pctMatrixId,
        defaultValue: 0,
        arcaConceptCode: '110000',
        appliesSipaAporte: true,
        appliesSipaContrib: true,
        appliesInssjypAporte: true,
        appliesInssjypContrib: true,
        appliesOsAporte: true,
        appliesOsContrib: true,
        appliesFsrAporte: true,
        appliesFsrContrib: true,
        appliesLrtContrib: true,
      }),
    });
    console.log('     Status Concepto 1070:', createConcept1070Res.status);
    if (createConcept1070Res.status !== 201) throw new Error('Falló creación de concepto 1070');

    // 21.10 Crear Concepto 1080 con fórmula referenciando la matriz POR NOMBRE
    console.log('  -> 21.10: POST /api/v1/payroll/concepts (Concepto 1080 con [MATRIZ:Escala Porcentual Productividad])');
    const createConcept1080Res = await fetch(`${baseUrl}/payroll/concepts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'SU1080',
        name: 'Plus Referencia por Nombre de Matriz',
        type: 'REMUNERATIVE',
        calculationType: 'FORMULA',
        defaultValue: 0,
        formula: '[MATRIZ:Escala Porcentual Productividad] * 100',
        arcaConceptCode: '110000',
        appliesSipaAporte: true,
        appliesSipaContrib: true,
        appliesInssjypAporte: true,
        appliesInssjypContrib: true,
        appliesOsAporte: true,
        appliesOsContrib: true,
        appliesFsrAporte: true,
        appliesFsrContrib: true,
        appliesLrtContrib: true,
      }),
    });
    console.log('     Status Concepto 1080:', createConcept1080Res.status);
    if (createConcept1080Res.status !== 201) throw new Error('Falló creación de concepto 1080');

    // 21.11 Recalcular y validar resolución de porcentaje y matching por nombre
    console.log('  -> 21.11: POST /api/v1/payroll/periods/:id/calculate (Validar porcentaje y resolución por nombre)');
    const recalc2Res = await fetch(`${baseUrl}/payroll/periods/${periodId}/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        novedades: [
          {
            employeeId: empFamilyId,
            workedDays: 30,
            customItems: [
              { conceptCode: 'SU1000', amount: 500000.00 },
            ],
          },
        ],
      }),
    });
    const recalc2Json = await recalc2Res.json().catch(() => ({}));
    console.log('     Status Segundo Recalculo:', recalc2Res.status, recalc2Json);
    if (recalc2Res.status !== 200) throw new Error('Falló segundo recálculo: ' + JSON.stringify(recalc2Json));

    const slipsList2Res = await fetch(`${baseUrl}/payroll/periods/${periodId}/slips`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const slipsList2Json = await slipsList2Res.json();
    const slipTarget2 = slipsList2Json.data.find((s) => s.employeeId === empFamilyId) || slipsList2Json.data[0];

    const slip2DetailRes = await fetch(`${baseUrl}/payroll/slips/${slipTarget2.id}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const slip2DetailJson = await slip2DetailRes.json();
    const items2 = slip2DetailJson.data.items || [];

    const item1070 = items2.find((i) => i.conceptCode === 'SU1070');
    const item1080 = items2.find((i) => i.conceptCode === 'SU1080');

    console.log('     Item 1070 (Matriz Porcentual 10% sobre básico $500,000):', item1070 ? `$${item1070.amount}` : 'NO ENCONTRADO');
    console.log('     Item 1080 (Fórmula con [MATRIZ:Nombre] -> 10 * 100):', item1080 ? `$${item1080.amount}` : 'NO ENCONTRADO');

    if (!item1070 || Number(item1070.amount) !== 50000) {
      throw new Error(`Item 1070 debía ser $50,000 (10% de $500,000) pero dio: ${item1070?.amount}`);
    }
    if (!item1080 || Number(item1080.amount) !== 1000) {
      throw new Error(`Item 1080 debía ser $1,000 (10 * 100) pero dio: ${item1080?.amount}`);
    }
    console.log('     -> Matriz Porcentual y llamada por Nombre de Matriz 100% verificadas.');

    // 22. Test: Módulo de Valores Globales Fijos (CRUD de Constantes, Integración en Fórmulas e Inmutabilidad)
    console.log('\n2️⃣2️⃣ Test: Módulo de Valores Globales Fijos (CRUD de Constantes, Integración en Fórmulas)');

    // 22.1 Crear Valor Fijo SMVM
    console.log('  -> 22.1: POST /api/v1/payroll/fixed-values (Crear SMVM = $320,000)');
    const createSmvmRes = await fetch(`${baseUrl}/payroll/fixed-values`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'SMVM',
        name: 'Salario Mínimo, Vital y Móvil',
        description: 'Monto oficial fijado por Consejo del Salario',
        value: 320000.00,
        unit: '$',
        isActive: true,
      }),
    });
    const createSmvmJson = await createSmvmRes.json();
    console.log('     Status Crear SMVM:', createSmvmRes.status, createSmvmJson.message);
    if (createSmvmRes.status !== 201) throw new Error(`Falló creación de valor fijo SMVM: ${JSON.stringify(createSmvmJson)}`);
    const smvmId = createSmvmJson.data.id;

    // 22.2 Listar Valores Fijos y Buscar
    console.log('  -> 22.2: GET /api/v1/payroll/fixed-values?search=SMVM');
    const listFvRes = await fetch(`${baseUrl}/payroll/fixed-values?search=SMVM`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const listFvJson = await listFvRes.json();
    console.log('     Status Listar:', listFvRes.status, 'Total encontrados:', listFvJson.meta?.total);
    if (listFvRes.status !== 200 || !listFvJson.data || listFvJson.data.length === 0) {
      throw new Error('No se encontró el valor fijo SMVM al listar');
    }

    // 22.3 Actualizar Valor Fijo a $350,000
    console.log('  -> 22.3: PATCH /api/v1/payroll/fixed-values/:id (Actualizar SMVM a $350,000)');
    const updateFvRes = await fetch(`${baseUrl}/payroll/fixed-values/${smvmId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        value: 350000.00,
      }),
    });
    const updateFvJson = await updateFvRes.json();
    console.log('     Status Actualizar:', updateFvRes.status, 'Nuevo Valor:', updateFvJson.data?.value);
    if (updateFvRes.status !== 200 || Number(updateFvJson.data?.value) !== 350000) {
      throw new Error('Falló actualización de valor fijo SMVM');
    }

    // 22.4 Crear Concepto 1090 que usa fórmula con [VALOR:SMVM] * 0.10
    console.log('  -> 22.4: POST /api/v1/payroll/concepts (Concepto 1090 con [VALOR:SMVM] * 0.10)');
    const createConcept1090Res = await fetch(`${baseUrl}/payroll/concepts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'SU1090',
        name: 'Adicional Fondo Garantía Salarial (10% SMVM)',
        type: 'REMUNERATIVE',
        calculationType: 'FORMULA',
        defaultValue: 0,
        formula: '[VALOR:SMVM] * 0.10',
        arcaConceptCode: '110000',
        appliesSipaAporte: true,
        appliesSipaContrib: true,
        appliesInssjypAporte: true,
        appliesInssjypContrib: true,
        appliesOsAporte: true,
        appliesOsContrib: true,
        appliesFsrAporte: true,
        appliesFsrContrib: true,
        appliesLrtContrib: true,
      }),
    });
    console.log('     Status Concepto 1090:', createConcept1090Res.status);
    if (createConcept1090Res.status !== 201) throw new Error('Falló creación de concepto 1090');

    // 22.5 Crear Concepto 1091 que usa token directo [SMVM] * 0.05
    console.log('  -> 22.5: POST /api/v1/payroll/concepts (Concepto 1091 con [SMVM] * 0.05)');
    const createConcept1091Res = await fetch(`${baseUrl}/payroll/concepts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'SU1091',
        name: 'Plus Salario Mínimo Directo (5% SMVM)',
        type: 'REMUNERATIVE',
        calculationType: 'FORMULA',
        defaultValue: 0,
        formula: '[SMVM] * 0.05',
        arcaConceptCode: '110000',
        appliesSipaAporte: true,
        appliesSipaContrib: true,
        appliesInssjypAporte: true,
        appliesInssjypContrib: true,
        appliesOsAporte: true,
        appliesOsContrib: true,
        appliesFsrAporte: true,
        appliesFsrContrib: true,
        appliesLrtContrib: true,
      }),
    });
    console.log('     Status Concepto 1091:', createConcept1091Res.status);
    if (createConcept1091Res.status !== 201) throw new Error('Falló creación de concepto 1091');

    // 22.6 Recalcular liquidación y verificar la resolución matemática de los valores fijos
    console.log('  -> 22.6: POST /api/v1/payroll/periods/:id/calculate (Validar cálculo con valores fijos)');
    const recalc3Res = await fetch(`${baseUrl}/payroll/periods/${periodId}/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        novedades: [
          {
            employeeId: empFamilyId,
            workedDays: 30,
            customItems: [
              { conceptCode: 'SU1000', amount: 500000.00 },
            ],
          },
        ],
      }),
    });
    const recalc3Json = await recalc3Res.json().catch(() => ({}));
    console.log('     Status Tercer Recalculo:', recalc3Res.status);
    if (recalc3Res.status !== 200) throw new Error('Falló tercer recálculo: ' + JSON.stringify(recalc3Json));

    const slipsList3Res = await fetch(`${baseUrl}/payroll/periods/${periodId}/slips`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const slipsList3Json = await slipsList3Res.json();
    const slipTarget3 = slipsList3Json.data.find((s) => s.employeeId === empFamilyId) || slipsList3Json.data[0];

    const slip3DetailRes = await fetch(`${baseUrl}/payroll/slips/${slipTarget3.id}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const slip3DetailJson = await slip3DetailRes.json();
    const items3 = slip3DetailJson.data.items || [];

    const item1090 = items3.find((i) => i.conceptCode === 'SU1090');
    const item1091 = items3.find((i) => i.conceptCode === 'SU1091');

    console.log('     Item 1090 ([VALOR:SMVM] * 0.10 -> 10% de $350,000):', item1090 ? `$${item1090.amount}` : 'NO ENCONTRADO');
    console.log('     Item 1091 ([SMVM] * 0.05 -> 5% de $350,000):', item1091 ? `$${item1091.amount}` : 'NO ENCONTRADO');

    if (!item1090 || Number(item1090.amount) !== 35000) {
      throw new Error(`Item 1090 debía ser $35,000 (10% de $350,000) pero dio: ${item1090?.amount}`);
    }
    if (!item1091 || Number(item1091.amount) !== 17500) {
      throw new Error(`Item 1091 debía ser $17,500 (5% de $350,000) pero dio: ${item1091?.amount}`);
    }
    console.log('     -> Resolución de Valores Fijos en fórmulas (explícito y directo) 100% verificada.');

    // 22.7 Intentar eliminar SMVM en uso (debe rechazar con 400)
    console.log('  -> 22.7: DELETE /api/v1/payroll/fixed-values/:id cuando está en uso (debe fallar 400)');
    const deleteSmvmInUseRes = await fetch(`${baseUrl}/payroll/fixed-values/${smvmId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const deleteSmvmInUseJson = await deleteSmvmInUseRes.json().catch(() => ({}));
    console.log('     Status Rechazo:', deleteSmvmInUseRes.status, deleteSmvmInUseJson.message);
    if (deleteSmvmInUseRes.status !== 400) {
      throw new Error('Se esperaba status 400 al intentar eliminar un valor fijo referenciado en fórmulas activas');
    }

    // 22.8 Crear y eliminar valor fijo temporal no referenciado
    console.log('  -> 22.8: POST y DELETE /api/v1/payroll/fixed-values (Valor temporal sin uso)');
    const createTempFvRes = await fetch(`${baseUrl}/payroll/fixed-values`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'VIATICO_TEMP',
        name: 'Viático de prueba temporal',
        value: 12500.00,
        unit: '$',
      }),
    });
    const createTempFvJson = await createTempFvRes.json();
    const tempFvId = createTempFvJson.data.id;

    const deleteTempFvRes = await fetch(`${baseUrl}/payroll/fixed-values/${tempFvId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    // 23. Test: Parámetros Horarios HH:MM, Valores Fijos por Empleado (Jornada, Básico, Conceptos Fijos) y Aumentos Masivos
    console.log('\n2️⃣3️⃣ Test: Parámetros Horarios HH:MM, Valores Fijos por Empleado (Jornada, Básico, Conceptos Fijos) y Aumentos Masivos');

    // 23.1 Actualizar Parámetros Patronales con Horas en Formato HH:MM
    console.log('  -> 23.1: PATCH /api/v1/payroll/settings (Configurar horas estándar de empresa en formato HH:MM)');
    const updateSettingsHoursRes = await fetch(`${baseUrl}/payroll/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        standardWeeklyHours: '44:00',
        standardMonthlyHours: '180:00',
      }),
    });
    const updateSettingsHoursJson = await updateSettingsHoursRes.json();
    console.log('     Status Settings HH:MM:', updateSettingsHoursRes.status, 'Horas Semanales:', updateSettingsHoursJson.data?.standardWeeklyHoursFormatted);
    if (updateSettingsHoursRes.status !== 200 || updateSettingsHoursJson.data?.standardWeeklyHoursFormatted !== '44:00' || updateSettingsHoursJson.data?.standardMonthlyHoursFormatted !== '180:00') {
      throw new Error(`Falló configuración de horas estándar en formato HH:MM: ${JSON.stringify(updateSettingsHoursJson)}`);
    }

    // 23.1b Validación de formato HH:MM inválido (debe dar 400)
    console.log('  -> 23.1b: PATCH /api/v1/payroll/settings con formato inválido "44:99" (debe dar 400)');
    const invalidSettingsRes = await fetch(`${baseUrl}/payroll/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        standardWeeklyHours: '44:99',
      }),
    });
    if (invalidSettingsRes.status !== 400) {
      throw new Error(`Se esperaba 400 con formato horario inválido pero dio: ${invalidSettingsRes.status}`);
    }
    console.log('     -> Validación de formato estricto HH:MM verificada.');

    // 23.2 Crear Empleado con Jornada Parcial (HH:MM), Sueldo Básico y Valor Hora Directos
    console.log('  -> 23.2: POST /api/v1/employees (Crear empleado con valores fijos directos y jornada HH:MM)');
    const createEmp23Res = await fetch(`${baseUrl}/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        fileNumber: 'LEG-2301',
        lastName: 'Gómez',
        firstName: 'Valeria',
        documentType: 'DNI',
        documentNumber: '34111222',
        cuil: '27341112228',
        gender: 'F',
        birthDate: '1992-04-12',
        hireDate: '2021-03-01',
        status: 'ACTIVE',
        street: 'Calle Falsa',
        streetNumber: '123',
        city: 'Rosario',
        postalCode: '2000',
        province: 'Santa Fe',
        departmentId,
        jobPositionId,
        healthInsuranceId,
        payrollGroup: 'MENSUAL',
        isPartTime: true,
        weeklyWorkingHours: '22:00',
        monthlyWorkingHours: '90:00',
        partTimePercentage: 50.00,
        basicSalary: 600000.00,
        hourlyRate: 3500.00,
      }),
    });
    const createEmp23Json = await createEmp23Res.json();
    console.log('     Status Crear Empleado:', createEmp23Res.status, 'ID:', createEmp23Json.data?.id);
    if (createEmp23Res.status !== 201) throw new Error(`Falló creación de empleado con jornada: ${JSON.stringify(createEmp23Json)}`);
    const emp23Id = createEmp23Json.data.id;

    if (createEmp23Json.data.weeklyWorkingHoursFormatted !== '22:00' || Number(createEmp23Json.data.basicSalary) !== 600000) {
      throw new Error(`Datos del empleado no coinciden con lo guardado: ${JSON.stringify(createEmp23Json.data)}`);
    }

    // 23.3 Crear Concepto 2150 y Asignarlo específicamente al Empleado
    console.log('  -> 23.3: POST /api/v1/payroll/concepts (Crear Concepto 2150 Adicional Fijo)');
    const createConcept2150Res = await fetch(`${baseUrl}/payroll/concepts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'SU2150',
        name: 'Adicional Especial por Título',
        type: 'REMUNERATIVE',
        scope: 'INDIVIDUAL',
        calculationType: 'FIXED',
        defaultValue: 0,
        arcaConceptCode: '110000',
        appliesSipaAporte: true,
        appliesSipaContrib: true,
        appliesInssjypAporte: true,
        appliesInssjypContrib: true,
        appliesOsAporte: true,
        appliesOsContrib: true,
        appliesFsrAporte: true,
        appliesFsrContrib: true,
        appliesLrtContrib: true,
      }),
    });
    const createConcept2150Json = await createConcept2150Res.json();
    console.log('     Status Concepto 2150:', createConcept2150Res.status);
    if (createConcept2150Res.status !== 201) throw new Error(`Falló creación de concepto 2150: ${JSON.stringify(createConcept2150Json)}`);
    const concept2150Id = createConcept2150Json.data.id;

    console.log('  -> 23.3b: POST /api/v1/employees/:id/concepts (Asignar Concepto 2150 por $75,000)');
    const assignConceptRes = await fetch(`${baseUrl}/employees/${emp23Id}/concepts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        conceptId: concept2150Id,
        amount: 75000.00,
        units: 1,
        notes: 'Licenciatura en Administración',
        isActive: true,
      }),
    });
    const assignConceptJson = await assignConceptRes.json();
    console.log('     Status Asignación Concepto:', assignConceptRes.status);
    if (assignConceptRes.status !== 201) throw new Error(`Falló asignación de concepto al empleado: ${JSON.stringify(assignConceptJson)}`);

    // 23.4 Liquidar Período y Verificar Resolución de Básico y Concepto Fijo Asignado
    console.log('  -> 23.4: POST /api/v1/payroll/periods/:id/calculate (Verificar básico $600k y adicional $75k)');
    const calcEmp23Res = await fetch(`${baseUrl}/payroll/periods/${periodId}/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        novedades: [
          {
            employeeId: emp23Id,
            workedDays: 30,
            customItems: [],
          },
        ],
      }),
    });
    const calcEmp23Json = await calcEmp23Res.json().catch(() => ({}));
    console.log('     Status Cálculo Liquidación:', calcEmp23Res.status);
    if (calcEmp23Res.status !== 200) throw new Error('Falló cálculo para empleado con valores fijos: ' + JSON.stringify(calcEmp23Json));

    const slipsList4Res = await fetch(`${baseUrl}/payroll/periods/${periodId}/slips`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const slipsList4Json = await slipsList4Res.json();
    const slipTarget4 = slipsList4Json.data.find((s) => s.employeeId === emp23Id);
    if (!slipTarget4) throw new Error('No se encontró recibo generado para emp23Id');

    const slip4DetailRes = await fetch(`${baseUrl}/payroll/slips/${slipTarget4.id}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const slip4DetailJson = await slip4DetailRes.json();
    const items4 = slip4DetailJson.data.items || [];

    const slipBasicItem = items4.find((i) => i.conceptCode === 'SU1000' || i.conceptCode === '1000');
    const slip2150Item = items4.find((i) => i.conceptCode === 'SU2150' || i.conceptCode === '2150');

    console.log('     Recibo Concepto 1000 (Sueldo Básico Empleado):', slipBasicItem ? `$${slipBasicItem.amount}` : 'NO ENCONTRADO');
    console.log('     Recibo Concepto 2150 (Adicional Fijo Asignado):', slip2150Item ? `$${slip2150Item.amount}` : 'NO ENCONTRADO');

    if (!slipBasicItem || Number(slipBasicItem.amount) !== 600000) {
      throw new Error(`Concepto 1000 debía ser $600,000 pero dio: ${slipBasicItem?.amount}`);
    }
    if (!slip2150Item || Number(slip2150Item.amount) !== 75000) {
      throw new Error(`Concepto 2150 debía ser $75,000 pero dio: ${slip2150Item?.amount}`);
    }
    console.log('     -> Liquidación con Sueldo Básico de Empleado y Concepto Fijo 100% verificada.');

    // 23.5 Previsualizar Aumento Generalizado Masivo del 10%
    console.log('  -> 23.5: POST /api/v1/employees/mass-wage-increase/preview (Simular 10% de aumento)');
    const previewRes = await fetch(`${baseUrl}/employees/mass-wage-increase/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        increaseType: 'PERCENTAGE',
        increaseValue: 10.0,
        applyToBasic: true,
        applyToHourlyRate: true,
        applyToConcepts: true,
        rounding: 'DECIMAL_2',
        filterStatus: 'ACTIVE',
      }),
    });
    const previewJson = await previewRes.json();
    console.log('     Status Preview Aumento:', previewRes.status, 'Afectados:', previewJson.data?.count);
    if (previewRes.status !== 200 || !previewJson.data?.preview) throw new Error('Falló previsualización de aumento masivo');

    const emp23Preview = previewJson.data.preview.find((p) => p.id === emp23Id);
    console.log('     Preview Empleada Gómez:', emp23Preview ? `Básico: $${emp23Preview.currentBasicSalary} -> $${emp23Preview.newBasicSalary}, Hora: $${emp23Preview.currentHourlyRate} -> $${emp23Preview.newHourlyRate}` : 'NO ENCONTRADO');

    if (!emp23Preview || Number(emp23Preview.newBasicSalary) !== 660000 || Number(emp23Preview.newHourlyRate) !== 3850) {
      throw new Error(`Valores calculados en preview erróneos: ${JSON.stringify(emp23Preview)}`);
    }

    // 23.6 Aplicar Aumento Generalizado Masivo
    console.log('  -> 23.6: POST /api/v1/employees/mass-wage-increase/apply (Aplicar aumento del 10%)');
    const applyRes = await fetch(`${baseUrl}/employees/mass-wage-increase/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        increaseType: 'PERCENTAGE',
        increaseValue: 10.0,
        applyToBasic: true,
        applyToHourlyRate: true,
        applyToConcepts: true,
        rounding: 'DECIMAL_2',
        filterStatus: 'ACTIVE',
      }),
    });
    const applyJson = await applyRes.json();
    console.log('     Status Aplicar Aumento:', applyRes.status, 'Empleados Actualizados:', applyJson.data?.updatedCount);
    if (applyRes.status !== 200 || applyJson.data?.updatedCount < 1) throw new Error('Falló aplicación de aumento masivo');

    // Verificar en base de datos que el básico, valor hora y concepto asignado se actualizaron
    const getEmp23UpdatedRes = await fetch(`${baseUrl}/employees/${emp23Id}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const getEmp23UpdatedJson = await getEmp23UpdatedRes.json();
    console.log('     Nuevo Básico Persistido:', getEmp23UpdatedJson.data?.basicSalary, 'Nuevo Valor Hora:', getEmp23UpdatedJson.data?.hourlyRate);
    if (Number(getEmp23UpdatedJson.data?.basicSalary) !== 660000 || Number(getEmp23UpdatedJson.data?.hourlyRate) !== 3850) {
      throw new Error(`Persistencia de aumento falló en empleado: ${JSON.stringify(getEmp23UpdatedJson.data)}`);
    }

    const assignedUpdated = (getEmp23UpdatedJson.data?.assignedConcepts || []).find((c) => c.conceptId === concept2150Id);
    console.log('     Concepto Fijo 2150 con Aumento (75,000 * 1.10 = 82,500):', assignedUpdated ? `$${assignedUpdated.amount}` : 'NO ENCONTRADO');
    if (!assignedUpdated || Number(assignedUpdated.amount) !== 82500) {
      throw new Error(`El concepto fijo asignado debía aumentar a $82,500 pero dio: ${assignedUpdated?.amount}`);
    }

    // 23.7 Asignar Concepto Masivamente a Nómina
    console.log('  -> 23.7: POST /api/v1/employees/mass-assign-concept (Asignar Concepto 2150 a toda la nómina mensual)');
    const massAssignRes = await fetch(`${baseUrl}/employees/mass-assign-concept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        conceptId: concept2150Id,
        amount: 90000.00,
        filterPayrollGroup: 'MENSUAL',
      }),
    });
    const massAssignJson = await massAssignRes.json();
    console.log('     Status Asignación Masiva:', massAssignRes.status, 'Asignados:', massAssignJson.data?.assignedCount);
    if (massAssignRes.status !== 200 || massAssignJson.data?.assignedCount < 1) {
      throw new Error('Falló asignación masiva de concepto: ' + JSON.stringify(massAssignJson));
    }

    // 23.8 Quitar Concepto Asignado Individualmente
    console.log('  -> 23.8: DELETE /api/v1/employees/:id/concepts/:conceptId (Quitar concepto asignado)');
    const deleteConceptRes = await fetch(`${baseUrl}/employees/${emp23Id}/concepts/${concept2150Id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    console.log('     Status Quitar Concepto:', deleteConceptRes.status);
    if (deleteConceptRes.status !== 200) throw new Error('Falló eliminación de concepto asignado a empleado');

    // =========================================================================
    // 24. NÓMINAS (SUELDOS BÁSICOS) & ACTUALIZACIÓN MASIVA
    // =========================================================================
    console.log('\n2️⃣4️⃣ Test: MÓDULO DE NÓMINAS (SUELDOS BÁSICOS) & AUMENTO MASIVO');

    // 24.1 Crear Nómina de Sueldo Básico
    console.log('  -> 24.1: POST /api/v1/payroll/salary-scales (Crear Nómina)');
    const createScaleRes = await fetch(`${baseUrl}/payroll/salary-scales`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Maestranza Categoría A',
        code: 'MAE-A',
        amount: 750000.00,
        description: 'Personal de limpieza y mantenimiento inicial',
      }),
    });
    const createScaleJson = await createScaleRes.json();
    console.log('     Status Crear Nómina:', createScaleRes.status, 'Nombre:', createScaleJson.data?.name);
    if (createScaleRes.status !== 201 || !createScaleJson.data?.id) {
      throw new Error('Falló creación de nómina: ' + JSON.stringify(createScaleJson));
    }
    const scaleId = createScaleJson.data.id;

    // 24.2 Listar Nóminas
    console.log('  -> 24.2: GET /api/v1/payroll/salary-scales (Listar Nóminas)');
    const listScalesRes = await fetch(`${baseUrl}/payroll/salary-scales`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const listScalesJson = await listScalesRes.json();
    console.log('     Status Listar Nóminas:', listScalesRes.status, 'Total:', listScalesJson.data?.length);
    if (listScalesRes.status !== 200 || !Array.isArray(listScalesJson.data) || listScalesJson.data.length === 0) {
      throw new Error('Falló listado de nóminas: ' + JSON.stringify(listScalesJson));
    }

    // 24.3 Asignar Nómina al Empleado en Ficha de Personal
    console.log('  -> 24.3: PUT /api/v1/employees/:id con salaryScaleId');
    const updateEmpScaleRes = await fetch(`${baseUrl}/employees/${emp23Id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        salaryScaleId: scaleId,
      }),
    });
    const updateEmpScaleJson = await updateEmpScaleRes.json();
    console.log('     Status Asignar Nómina:', updateEmpScaleRes.status, 'Básico sincronizado:', updateEmpScaleJson.data?.basicSalary);
    if (updateEmpScaleRes.status !== 200 || Number(updateEmpScaleJson.data?.basicSalary) !== 750000) {
      throw new Error('Falló sincronización de sueldo básico desde la nómina asignada: ' + JSON.stringify(updateEmpScaleJson));
    }

    // 24.4 Previsualizar Aumento Masivo (10% en porcentaje)
    console.log('  -> 24.4: POST /api/v1/payroll/salary-scales/mass-increase/preview (10%)');
    const previewScaleRes = await fetch(`${baseUrl}/payroll/salary-scales/mass-increase/preview`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        increaseType: 'PERCENTAGE',
        value: 10,
        rounding: 'DECIMAL_2',
      }),
    });
    const previewScaleJson = await previewScaleRes.json();
    console.log('     Status Previsualización:', previewScaleRes.status, 'Nóminas afectadas:', previewScaleJson.data?.totalScales, 'Colaboradores:', previewScaleJson.data?.totalEmployeesAffected);
    if (previewScaleRes.status !== 200 || previewScaleJson.data?.totalScales < 1) {
      throw new Error('Falló previsualización de aumento masivo: ' + JSON.stringify(previewScaleJson));
    }
    const scalePreviewItem = previewScaleJson.data.preview.find((p) => p.id === scaleId);
    if (!scalePreviewItem || scalePreviewItem.newAmount !== 825000) {
      throw new Error(`Cálculo de previsualización incorrecto. Esperado 825000, obtenido: ${scalePreviewItem?.newAmount}`);
    }

    // 24.5 Aplicar Aumento Masivo (10% en porcentaje)
    console.log('  -> 24.5: POST /api/v1/payroll/salary-scales/mass-increase/apply (10%)');
    const applyScaleRes = await fetch(`${baseUrl}/payroll/salary-scales/mass-increase/apply`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        increaseType: 'PERCENTAGE',
        value: 10,
        rounding: 'DECIMAL_2',
      }),
    });
    const applyScaleJson = await applyScaleRes.json();
    console.log('     Status Aplicar Aumento:', applyScaleRes.status, 'Nóminas actualizadas:', applyScaleJson.data?.totalScalesUpdated, 'Colaboradores:', applyScaleJson.data?.totalEmployeesUpdated);
    if (applyScaleRes.status !== 200 || applyScaleJson.data?.totalScalesUpdated < 1) {
      throw new Error('Falló aplicación de aumento masivo de nóminas: ' + JSON.stringify(applyScaleJson));
    }

    // 24.6 Verificar Sincronización en Cascada del Empleado
    console.log('  -> 24.6: GET /api/v1/employees/:id (Verificar nuevo básico en cascada)');
    const verifyEmpRes = await fetch(`${baseUrl}/employees/${emp23Id}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const verifyEmpJson = await verifyEmpRes.json();
    console.log('     Básico resultante del empleado:', verifyEmpJson.data?.basicSalary);
    if (Number(verifyEmpJson.data?.basicSalary) !== 825000) {
      throw new Error(`El empleado no se sincronizó en cascada a 825000. Valor: ${verifyEmpJson.data?.basicSalary}`);
    }

    // 24.7 Constraint de Borrado: No se puede eliminar si tiene empleados asignados
    console.log('  -> 24.7: DELETE /api/v1/payroll/salary-scales/:id (Debe rechazar por tener colaboradores)');
    const deleteFailRes = await fetch(`${baseUrl}/payroll/salary-scales/${scaleId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    console.log('     Status intento de borrado:', deleteFailRes.status);
    if (deleteFailRes.status !== 400) {
      throw new Error('Se esperaba status 400 al intentar eliminar nómina con colaboradores asignados');
    }

    // 24.8 Desasignar y Eliminar Nómina
    console.log('  -> 24.8: Desasignar nómina y DELETE /api/v1/payroll/salary-scales/:id');
    await fetch(`${baseUrl}/employees/${emp23Id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        salaryScaleId: null,
      }),
    });
    const deleteSuccessRes = await fetch(`${baseUrl}/payroll/salary-scales/${scaleId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    console.log('     Status borrado con nómina desasignada:', deleteSuccessRes.status);
    if (deleteSuccessRes.status !== 200) {
      throw new Error('Falló eliminación de nómina sin colaboradores asignados');
    }

    // =========================================================================
    // 25. SINDICATOS Y MUTUALES CON CONCEPTO DE DESCUENTO (NOVEDAD PERSISTENTE Y PROPAGACIÓN)
    // =========================================================================
    console.log('\n--- 25. SINDICATOS Y MUTUALES CON CONCEPTO DE DESCUENTO (NOVEDAD PERSISTENTE Y PROPAGACIÓN) ---');

    // 25.1 Crear Conceptos de Deducción (Cuota Sindical y Cuota Mutual)
    console.log('  -> 25.1: POST /api/v1/payroll/concepts (Crear conceptos DEDUCTION para Sindicato y Mutual)');
    const createUnionDedRes = await fetch(`${baseUrl}/payroll/concepts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'SU7001',
        name: 'Cuota Sindical Gremial 2%',
        type: 'DEDUCTION',
        periodType: 'MONTHLY',
        calculationType: 'PERCENTAGE',
        defaultValue: 2,
        arcaConceptCode: '310000',
      }),
    });
    const unionDedJson = await createUnionDedRes.json();
    if (createUnionDedRes.status !== 201) throw new Error('Falló creación de concepto de deducción sindical: ' + JSON.stringify(unionDedJson));
    const unionConceptId = unionDedJson.data.id;

    const createMutualDedRes = await fetch(`${baseUrl}/payroll/concepts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'SU7002',
        name: 'Aporte Mutual Personal',
        type: 'DEDUCTION',
        periodType: 'MONTHLY',
        calculationType: 'FIXED',
        defaultValue: 5000,
        arcaConceptCode: '320000',
      }),
    });
    const mutualDedJson = await createMutualDedRes.json();
    if (createMutualDedRes.status !== 201) throw new Error('Falló creación de concepto de deducción mutual: ' + JSON.stringify(mutualDedJson));
    const mutualConceptId = mutualDedJson.data.id;

    // 25.2 Crear Sindicato y Mutual con conceptId
    console.log('  -> 25.2: POST /api/v1/unions y POST /api/v1/mutuals (Crear con conceptId vinculado)');
    const createUnionRes = await fetch(`${baseUrl}/unions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        name: 'Sindicato Empleados de Comercio Test',
        code: 'SEC-TEST',
        conceptId: unionConceptId,
      }),
    });
    const unionCreatedJson = await createUnionRes.json();
    if (createUnionRes.status !== 201) throw new Error('Falló creación de sindicato con concepto: ' + JSON.stringify(unionCreatedJson));
    const testUnionId = unionCreatedJson.data.id;
    if (unionCreatedJson.data.conceptId !== unionConceptId) {
      throw new Error(`Sindicato creado no tiene conceptId esperado: ${unionCreatedJson.data.conceptId}`);
    }

    const createMutualRes = await fetch(`${baseUrl}/mutuals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        name: 'Mutual San Cayetano Test',
        code: 'MUT-TEST',
        conceptId: mutualConceptId,
      }),
    });
    const mutualCreatedJson = await createMutualRes.json();
    if (createMutualRes.status !== 201) throw new Error('Falló creación de mutual con concepto: ' + JSON.stringify(mutualCreatedJson));
    const testMutualId = mutualCreatedJson.data.id;
    if (mutualCreatedJson.data.conceptId !== mutualConceptId) {
      throw new Error(`Mutual creada no tiene conceptId esperado: ${mutualCreatedJson.data.conceptId}`);
    }

    // 25.3 Asignar Sindicato y Mutual a un Colaborador y verificar novedad persistente automática
    console.log(`  -> 25.3: PUT /api/v1/employees/${emp23Id} (Asignar sindicato y mutual)`);
    const updateEmpAffRes = await fetch(`${baseUrl}/employees/${emp23Id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        unionId: testUnionId,
        mutualId: testMutualId,
      }),
    });
    if (updateEmpAffRes.status !== 200) throw new Error('Falló actualización de afiliaciones de empleado');

    // Verificar novedades persistentes en /employees/:id/concepts
    console.log(`  -> 25.4: GET /api/v1/employees/${emp23Id}/concepts (Verificar auto-asignación de novedades)`);
    const empConceptsRes = await fetch(`${baseUrl}/employees/${emp23Id}/concepts`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const empConceptsJson = await empConceptsRes.json();
    const assignedConcepts = empConceptsJson.data || [];
    const hasUnionConcept = assignedConcepts.some((c) => c.conceptId === unionConceptId && c.isActive);
    const hasMutualConcept = assignedConcepts.some((c) => c.conceptId === mutualConceptId && c.isActive);
    console.log('     Novedad Sindical presente y activa:', hasUnionConcept);
    console.log('     Novedad Mutual presente y activa:', hasMutualConcept);
    if (!hasUnionConcept || !hasMutualConcept) {
      throw new Error('No se crearon automáticamente las novedades persistentes para sindicato y/o mutual');
    }

    // 25.5 Desafiliación (Opción B: eliminación física al no haber sido liquidado en un período cerrado)
    console.log(`  -> 25.5: PUT /api/v1/employees/${emp23Id} (Desafiliar sindicato -> Opción B eliminación física)`);
    await fetch(`${baseUrl}/employees/${emp23Id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        unionId: null,
      }),
    });
    const empConceptsAfterUnassignRes = await fetch(`${baseUrl}/employees/${emp23Id}/concepts`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const empConceptsAfterUnassignJson = await empConceptsAfterUnassignRes.json();
    const unionConceptStillPresent = (empConceptsAfterUnassignJson.data || []).some((c) => c.conceptId === unionConceptId);
    console.log('     Concepto sindical tras desafiliación (debe no existir en Opción B):', unionConceptStillPresent);
    if (unionConceptStillPresent) {
      throw new Error('El concepto de sindicato debería haberse eliminado físicamente según la Opción B');
    }

    // 25.6 Propagación Masiva Retroactiva (applyToEmployees: true)
    console.log('  -> 25.6: Reafiliar empleado a sindicato sin concepto, luego actualizar sindicato con applyToEmployees: true');
    // Desvincular concepto del sindicato
    await fetch(`${baseUrl}/unions/${testUnionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        conceptId: null,
      }),
    });
    // Afiliar empleado al sindicato (que no tiene concepto)
    await fetch(`${baseUrl}/employees/${emp23Id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        unionId: testUnionId,
      }),
    });
    // Actualizar sindicato vinculando el concepto y activando propagación masiva
    const patchUnionPropagateRes = await fetch(`${baseUrl}/unions/${testUnionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        conceptId: unionConceptId,
        applyToEmployees: true,
      }),
    });
    const patchUnionJson = await patchUnionPropagateRes.json();
    console.log('     Status PATCH sindicato con applyToEmployees:', patchUnionPropagateRes.status, patchUnionJson.message);
    if (patchUnionPropagateRes.status !== 200) throw new Error('Falló actualización de sindicato con propagación masiva');

    // Verificar que el empleado ahora tiene la novedad persistente asignada por propagación
    const empConceptsPropagatedRes = await fetch(`${baseUrl}/employees/${emp23Id}/concepts`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const empConceptsPropagatedJson = await empConceptsPropagatedRes.json();
    const hasUnionConceptPropagated = (empConceptsPropagatedJson.data || []).some((c) => c.conceptId === unionConceptId && c.isActive);
    console.log('     Novedad sindical propagada retroactivamente:', hasUnionConceptPropagated);
    if (!hasUnionConceptPropagated) {
      throw new Error('La propagación masiva retroactiva no asignó el concepto a los empleados afiliados');
    }

    // 25.7 Crear segundo concepto de sindicato (ej. Cuota Sindical SAC con periodType: SAC)
    console.log('  -> 25.7: Crear segundo concepto sindical para SAC');
    const createUnionSacConceptRes = await fetch(`${baseUrl}/payroll/concepts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        code: 'SU7003',
        name: 'Cuota Sindical SAC 2%',
        type: 'DEDUCTION',
        calculationType: 'PERCENTAGE',
        periodType: 'SAC',
        scope: 'GENERAL',
        defaultValue: 2.0,
        arcaConceptCode: '0401',
      }),
    });
    const unionSacConceptJson = await createUnionSacConceptRes.json();
    if (createUnionSacConceptRes.status !== 201) throw new Error('Falló creación de concepto sindical SAC: ' + JSON.stringify(unionSacConceptJson));
    const unionSacConceptId = unionSacConceptJson.data.id;

    // 25.8 Actualizar sindicato con array conceptIds: [unionConceptId, unionSacConceptId] y applyToEmployees: true
    console.log('  -> 25.8: PATCH /api/v1/unions/:id con múltiples conceptos (Mensual + SAC)');
    const patchMultiUnionRes = await fetch(`${baseUrl}/unions/${testUnionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        conceptIds: [unionConceptId, unionSacConceptId],
        applyToEmployees: true,
      }),
    });
    const patchMultiUnionJson = await patchMultiUnionRes.json();
    console.log('     Status PATCH múltiple conceptos:', patchMultiUnionRes.status, 'Conceptos vinculados:', patchMultiUnionJson.data?.conceptIds);
    if (patchMultiUnionRes.status !== 200 || patchMultiUnionJson.data?.conceptIds?.length !== 2) {
      throw new Error('Falló vinculación múltiple de conceptos en sindicato');
    }

    // 25.9 Verificar que el empleado tiene AMBOS conceptos sindicales activos
    console.log('  -> 25.9: GET /api/v1/employees/:id/concepts (Verificar auto-asignación múltiple)');
    const empMultiConceptsRes = await fetch(`${baseUrl}/employees/${emp23Id}/concepts`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const empMultiConceptsJson = await empMultiConceptsRes.json();
    const empAssigned = empMultiConceptsJson.data || [];
    const hasConcept1 = empAssigned.some((c) => c.conceptId === unionConceptId && c.isActive);
    const hasConceptSac = empAssigned.some((c) => c.conceptId === unionSacConceptId && c.isActive);
    console.log('     Concepto Mensual activo:', hasConcept1, '| Concepto SAC activo:', hasConceptSac);
    if (!hasConcept1 || !hasConceptSac) {
      throw new Error('El empleado no recibió ambos conceptos sindicales simultáneamente');
    }

    // 25.10 Desasociar uno de los conceptos del sindicato con applyToEmployees: true y verificar Opción B
    console.log('  -> 25.10: PATCH sindicato quitando el concepto mensual, dejando sólo SAC');
    await fetch(`${baseUrl}/unions/${testUnionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        conceptIds: [unionSacConceptId],
        applyToEmployees: true,
      }),
    });

    const empAfterRemoveOneRes = await fetch(`${baseUrl}/employees/${emp23Id}/concepts`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const empAfterRemoveOneJson = await empAfterRemoveOneRes.json();
    const empAfterAssigned = empAfterRemoveOneJson.data || [];
    const hasRemovedStill = empAfterAssigned.some((c) => c.conceptId === unionConceptId);
    const hasSacStill = empAfterAssigned.some((c) => c.conceptId === unionSacConceptId && c.isActive);
    console.log('     Concepto Mensual removido físicamente (Opción B):', !hasRemovedStill, '| Concepto SAC permanece activo:', hasSacStill);
    if (hasRemovedStill || !hasSacStill) {
      throw new Error('Falla en desasignación selectiva según Opción B');
    }

    // =========================================================================
    // 26. IMPRESIÓN POR LOTES DE RECIBOS Y PREVENCIÓN DE LIQUIDACIONES VACÍAS
    // =========================================================================
    console.log('\n--- 26. IMPRESIÓN POR LOTES Y PREVENCIÓN DE LIQUIDACIONES VACÍAS (SIN CONCEPTOS) ---');

    // 26.1: GET /api/v1/payroll/periods/:id/slips-batch-print
    console.log('  -> 26.1: GET /api/v1/payroll/periods/:id/slips-batch-print (Obtener lote completo para imprimir)');
    const batchPrintRes = await fetch(`${baseUrl}/payroll/periods/${periodId}/slips-batch-print`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    console.log('     Status Batch Print:', batchPrintRes.status);
    if (batchPrintRes.status !== 200) throw new Error('Fallo al obtener lote de recibos para imprimir');
    const batchPrintJson = await batchPrintRes.json();
    const batchData = batchPrintJson.data;

    console.log('     Recibos en lote:', batchData.slips?.length, '| Período:', batchData.period?.settlementName, '| Empresa:', batchData.company?.legalName || batchData.company?.name);
    if (!batchData.slips || batchData.slips.length === 0) {
      throw new Error('El lote de impresión debía devolver al menos 1 recibo');
    }
    const sampleSlip = batchData.slips[0];
    if (!sampleSlip.items || sampleSlip.items.length === 0) {
      throw new Error('Los recibos en el lote de impresión deben incluir sus items/conceptos');
    }

    // 26.2: Desactivar fórmulas y conceptos de prueba globales de tests anteriores para aislar colaboradores sin conceptos
    console.log('  -> 26.2: PATCH /api/v1/payroll/concepts/:id (Desactivar conceptos globales de prueba previa)');
    const conceptsListRes = await fetch(`${baseUrl}/payroll/concepts?limit=100`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'x-company-id': companyId },
    });
    const conceptsListJson = await conceptsListRes.json();
    const testConceptsToDeactivate = (conceptsListJson.data || []).filter((c) =>
      ['SU1050', 'SU1060', 'SU1070', 'SU1080', 'SU1090', 'SU1091', 'SU2150', 'SU2500', 'SU6005', 'SU7001', 'SU7002', 'SU7003'].includes(c.code)
    );
    for (const c of testConceptsToDeactivate) {
      await fetch(`${baseUrl}/payroll/concepts/${c.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          'x-company-id': companyId,
        },
        body: JSON.stringify({ isActive: false }),
      });
    }

    // 26.3: Crear un colaborador sin conceptos ni novedades y liquidarlo
    console.log('  -> 26.3: POST /api/v1/employees (Crear colaborador sin básico ni conceptos)');
    const emptyEmpRes = await fetch(`${baseUrl}/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        fileNumber: 'EMPTY-001',
        firstName: 'SinConceptos',
        lastName: 'Prueba',
        documentType: 'DNI',
        documentNumber: '40123456',
        cuil: '20401234560',
        gender: 'M',
        birthDate: '1998-01-01',
        hireDate: '2026-01-01',
        status: 'ACTIVE',
        departmentId: departmentId,
        jobPositionId: jobPositionId,
        healthInsuranceId: healthInsuranceId,
        payrollGroup: 'MENSUAL',
        basicSalary: 0,
        hourlyRate: 0,
      }),
    });
    const emptyEmpJson = await emptyEmpRes.json();
    if (emptyEmpRes.status !== 201) {
      throw new Error('Falló creación de empleado sin conceptos: ' + JSON.stringify(emptyEmpJson));
    }
    const emptyEmpId = emptyEmpJson.data.id;
    console.log('     Colaborador sin conceptos creado:', emptyEmpId);

    // 26.4: Liquidar a este colaborador
    console.log('  -> 26.4: POST /api/v1/payroll/periods/:id/calculate-single/:id (Debe omitirse y no generar recibo)');
    const singleEmptyRes = await fetch(`${baseUrl}/payroll/periods/${periodId}/calculate-single/${emptyEmpId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const singleEmptyJson = await singleEmptyRes.json();
    console.log('     Status:', singleEmptyRes.status, '| Omitidos:', singleEmptyJson.data.omittedEmployeesCount, '| Procesados:', singleEmptyJson.data.processedEmployees);
    if (singleEmptyJson.data.processedEmployees !== 0 || singleEmptyJson.data.omittedEmployeesCount !== 1) {
      throw new Error('El colaborador sin conceptos debió ser omitido con 0 recibos procesados');
    }
    if (!singleEmptyJson.data.omittedEmployees || singleEmptyJson.data.omittedEmployees.length === 0) {
      throw new Error('Debe devolver el detalle del colaborador omitido');
    }

    // 26.5: Verificar que NO exista un registro en paySlip para este colaborador
    const slipsAfterRes = await fetch(`${baseUrl}/payroll/periods/${periodId}/slips?search=EMPTY-001`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const slipsAfterJson = await slipsAfterRes.json();
    console.log('     Recibos encontrados para el colaborador sin conceptos:', slipsAfterJson.data?.length || 0);
    if (slipsAfterJson.data && slipsAfterJson.data.length > 0) {
      throw new Error('Se generó un recibo vacío indebido en la base de datos');
    }
    console.log('     -> Validación de no generación de liquidaciones vacías 100% exitosa.');

    // 26.6: Probar liquidación en un período donde el 100% de colaboradores son omitidos (debe permanecer en OPEN)
    console.log('  -> 26.6: Período con 100% omitidos debe permanecer en estado OPEN');
    const emptyPeriodRes = await fetch(`${baseUrl}/payroll/periods`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        periodType: 'VACATIONS',
        year: 2026,
        month: 10,
        settlementName: 'Vacaciones Octubre 2026 (Sin Novedades)',
        paymentDate: '2026-10-20',
      }),
    });
    const emptyPeriodJson = await emptyPeriodRes.json();
    const emptyPeriodId = emptyPeriodJson.data.id;

    const calcEmptyPeriodRes = await fetch(`${baseUrl}/payroll/periods/${emptyPeriodId}/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({}),
    });
    const calcEmptyPeriodJson = await calcEmptyPeriodRes.json();
    console.log('     Status Período 100% omitido:', calcEmptyPeriodRes.status, '| Omitidos:', calcEmptyPeriodJson.data.omittedEmployeesCount, '| Procesados:', calcEmptyPeriodJson.data.processedEmployees);
    if (calcEmptyPeriodJson.data.processedEmployees !== 0) {
      throw new Error('Todos los colaboradores debieron ser omitidos');
    }

    const checkPeriodRes = await fetch(`${baseUrl}/payroll/periods/${emptyPeriodId}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });
    const checkPeriodJson = await checkPeriodRes.json();
    console.log('     Estado final del período sin conceptos generados:', checkPeriodJson.data.status);
    if (checkPeriodJson.data.status !== 'OPEN') {
      throw new Error(`El período debió permanecer en OPEN y dio: ${checkPeriodJson.data.status}`);
    }
    console.log('     -> Preservación de estado OPEN con 100% omitidos 100% verificada.');

    // 26.5: Limpiar empleado de prueba
    await fetch(`${baseUrl}/employees/${emptyEmpId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
    });

    // 27. Test: Módulo Integral de Impuesto a las Ganancias Cuarta Categoría (Ley 27.743 & RG ARCA 4003/2017)
    console.log('\n2️⃣7️⃣ Test: Módulo Integral de Impuesto a las Ganancias Cuarta Categoría (Ley 27.743 & RG ARCA 4003/2017)');

    // 27.1 Consultar tablas oficiales Art. 30, Art. 94 y Límites Generales
    console.log('  -> 27.1: GET /api/v1/income-tax/tables, /scales, /limits (Verificar precarga oficial)');
    const itTablesRes = await fetch(`${baseUrl}/income-tax/tables?year=2024`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'x-company-id': companyId },
    });
    const itTablesJson = await itTablesRes.json();
    console.log('     Status Tablas Art. 30 (2024):', itTablesRes.status, '| Meses precargados:', itTablesJson.data?.length);
    if (itTablesRes.status !== 200 || !itTablesJson.data || itTablesJson.data.length !== 12) {
      throw new Error(`Se esperaban 12 meses de Art. 30 para 2024 y se obtuvieron: ${itTablesJson.data?.length}`);
    }

    const itScalesRes = await fetch(`${baseUrl}/income-tax/scales?year=2024&month=12`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'x-company-id': companyId },
    });
    const itScalesJson = await itScalesRes.json();
    console.log('     Status Escalas Art. 94 (2024):', itScalesRes.status, '| Tramos precargados:', itScalesJson.data?.length);
    if (itScalesRes.status !== 200 || !itScalesJson.data || itScalesJson.data.length < 5) {
      throw new Error(`Se esperaban tramos de escala progresiva Art. 94 y se obtuvieron: ${itScalesJson.data?.length}`);
    }

    const itLimitsRes = await fetch(`${baseUrl}/income-tax/limits?year=2024`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'x-company-id': companyId },
    });
    const itLimitsJson = await itLimitsRes.json();
    console.log('     Status Límites Deducciones:', itLimitsRes.status, '| Cantidad:', itLimitsJson.data?.length);
    if (itLimitsRes.status !== 200 || !itLimitsJson.data || itLimitsJson.data.length === 0) {
      throw new Error('No se cargaron los límites de deducciones generales');
    }

    // 27.2 Clonar y ajustar tablas por IPC (+10% para 2027)
    console.log('  -> 27.2: POST /api/v1/income-tax/clone-adjust (Ajuste por IPC +10% de 2024 a 2027)');
    const cloneIpcRes = await fetch(`${baseUrl}/income-tax/clone-adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        sourceYear: 2024,
        targetYear: 2027,
        ipcPercentage: 10.0,
      }),
    });
    const cloneIpcJson = await cloneIpcRes.json();
    console.log('     Status Clonar IPC:', cloneIpcRes.status, cloneIpcJson.message);
    if (cloneIpcRes.status !== 200) throw new Error('Falló clonación y ajuste por IPC: ' + JSON.stringify(cloneIpcJson));

    const check2027Res = await fetch(`${baseUrl}/income-tax/tables?year=2027`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'x-company-id': companyId },
    });
    const check2027Json = await check2027Res.json();
    if (check2027Res.status !== 200 || !check2027Json.data || check2027Json.data.length !== 12) {
      throw new Error('No se crearon las 12 tablas mensuales para el año 2027 ajustadas por IPC');
    }
    console.log('     -> Tablas de 2027 verificadas correctamente con ajuste IPC.');

    // 27.3 Validación de Cargas de Familia (Elegibilidad Fiscal s/Ley 27.743 Art. 30 Inc. b)
    console.log('  -> 27.3: Validación de límites de cargas de familia (Hijo >= 18 no discapacitado debe ser rechazado)');
    const invalidChildRes = await fetch(`${baseUrl}/employees/${empFamilyId}/relatives`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        kinshipId: conyugeKin.id,
        lastName: 'Martínez',
        firstName: 'Federico',
        documentType: 'DNI',
        documentNumber: '40111222',
        birthDate: '1998-05-10',
        appliesIncomeTax: true,
        incomeTaxDeductionType: 'CHILD',
        isDisability: false,
      }),
    });
    const invalidChildJson = await invalidChildRes.json();
    console.log('     Status Hijo >= 18 sin discapacidad (esperado 400):', invalidChildRes.status, invalidChildJson.message || invalidChildJson.error?.message);
    if (invalidChildRes.status !== 400) {
      throw new Error('Debió rechazarse la carga de hijo mayor de 18 años sin discapacidad para deducción de ganancias');
    }

    // Agregar carga válida: hijo menor de 18 años con deducción 100%
    console.log('  -> 27.3.b: Agregar hijo menor computable (< 18 años)');
    const validChildRes = await fetch(`${baseUrl}/employees/${empFamilyId}/relatives`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        kinshipId: hijoKin.id,
        lastName: 'Martínez',
        firstName: 'Camila',
        documentType: 'DNI',
        documentNumber: '55111333',
        birthDate: '2015-08-20',
        appliesIncomeTax: true,
        incomeTaxDeductionType: 'CHILD',
        deductionPercentage: 100,
        isDisability: false,
        hasNoIncomeOrBelowMni: true,
        validFromMonth: 1,
        validToMonth: 12,
      }),
    });
    const validChildJson = await validChildRes.json();
    console.log('     Status Hijo válido:', validChildRes.status, validChildJson.message);
    if (validChildRes.status !== 201) throw new Error('Falló creación de hijo computable para ganancias: ' + JSON.stringify(validChildJson));

    // 27.4 Importación de Archivo XML SiRADIG (F. 572 Web)
    console.log('  -> 27.4: POST /api/v1/income-tax/siradig/import (Importación de F. 572 Web)');
    const siradigXmlSample = `<?xml version="1.0" encoding="UTF-8"?>
<presentacion>
  <periodo>2026</periodo>
  <nroPresentacion>1</nroPresentacion>
  <fechaPresentacion>2026-03-01</fechaPresentacion>
  <empleado>
    <cuit>${empFamilyCuit}</cuit>
    <tipoDoc>DNI</tipoDoc>
    <nroDoc>36123456</nroDoc>
    <apellido>Martínez</apellido>
    <nombre>Carlos</nombre>
  </empleado>
  <cargasFamilia>
    <cargaFamilia>
      <tipo>HIJO</tipo>
      <tipoDoc>DNI</tipoDoc>
      <nroDoc>55111333</nroDoc>
      <apellido>Martínez</apellido>
      <nombre>Camila</nombre>
      <fechaNac>2015-08-20</fechaNac>
      <mesDesde>1</mesDesde>
      <mesHasta>12</mesHasta>
      <porcentajeDeduccion>100</porcentajeDeduccion>
    </cargaFamilia>
  </cargasFamilia>
  <deducciones>
    <deduccion>
      <tipo>CUOTA_MEDICO_ASISTENCIAL</tipo>
      <cuit>30500010912</cuit>
      <denominacion>OSDE Medicina Prepaga</denominacion>
      <mesDesde>1</mesDesde>
      <mesHasta>12</mesHasta>
      <montoTotal>1200000.00</montoTotal>
    </deduccion>
    <deduccion>
      <tipo>SEGURO_VIDA</tipo>
      <cuit>30500010913</cuit>
      <denominacion>Seguros La Segunda</denominacion>
      <mesDesde>1</mesDesde>
      <mesHasta>12</mesHasta>
      <montoTotal>450000.00</montoTotal>
    </deduccion>
  </deducciones>
  <otrosEmpleadores>
    <empresa>
      <cuit>30711122234</cuit>
      <denominacion>Servicios Profesionales SA</denominacion>
      <ingresosBrutos>45000000.00</ingresosBrutos>
      <retGanancias>0.00</retGanancias>
      <mesDesde>10</mesDesde>
      <mesHasta>10</mesHasta>
    </empresa>
  </otrosEmpleadores>
  <pagosACuenta>
    <pago>
      <tipo>PERCEPCION_TARJETA</tipo>
      <cuit>30500010914</cuit>
      <denominacion>Banco Santander RG 4815</denominacion>
      <mes>2</mes>
      <montoTotal>85000.00</montoTotal>
    </pago>
  </pagosACuenta>
</presentacion>`;

    const siradigRes = await fetch(`${baseUrl}/income-tax/siradig/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        filename: 'F572_2026_TEST.xml',
        xmlContent: siradigXmlSample,
      }),
    });
    const siradigJson = await siradigRes.json();
    console.log('     Status Importación SiRADIG:', siradigRes.status, siradigJson.message);
    if (siradigRes.status !== 200 || siradigJson.data?.processedEmployees !== 1) {
      throw new Error(`Falló importación SiRADIG: ${JSON.stringify(siradigJson)}`);
    }
    console.log(`     -> SiRADIG procesado: ${siradigJson.data?.deductionsCount} deducciones, ${siradigJson.data?.otherIncomesCount} pluriempleo.`);

    // 27.5 Verificar Legajo Fiscal 360°
    console.log(`  -> 27.5: GET /api/v1/income-tax/employees/${empFamilyId}/profile?year=2026 (Legajo Fiscal 360)`);
    const profileRes = await fetch(`${baseUrl}/income-tax/employees/${empFamilyId}/profile?year=2026`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'x-company-id': companyId },
    });
    const profileJson = await profileRes.json();
    console.log('     Status Legajo Fiscal:', profileRes.status, '| Deducciones generales registradas:', profileJson.data?.generalDeductions?.length);
    if (profileRes.status !== 200 || !profileJson.data?.generalDeductions || profileJson.data.generalDeductions.length === 0) {
      throw new Error('El legajo fiscal no muestra las deducciones importadas');
    }

    // 27.6 Cálculo Acumulativo de Liquidación Mensual de Ganancias (Octubre 2026)
    console.log('  -> 27.6: POST /api/v1/income-tax/settlements/calculate (Liquidación Mensual Acumulativa)');
    const calcItRes = await fetch(`${baseUrl}/income-tax/settlements/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        fiscalYear: 2026,
        month: 10,
        settlementType: 'MONTHLY',
      }),
    });
    const calcItJson = await calcItRes.json();
    const itSettlementId = calcItJson.data?.settlement?.id || calcItJson.data?.id;
    console.log('     Status Cálculo Ganancias:', calcItRes.status, calcItJson.message, '| ID:', itSettlementId);
    if (calcItRes.status !== 200 || !itSettlementId) {
      throw new Error(`Falló liquidación acumulativa de Ganancias: ${JSON.stringify(calcItJson)}`);
    }

    // Verificar detalle del empleado
    const itDetailRes = await fetch(`${baseUrl}/income-tax/settlements/${itSettlementId}`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'x-company-id': companyId },
    });
    const itDetailJson = await itDetailRes.json();
    const empItDetail = itDetailJson.data?.details?.find((d) => d.employeeId === empFamilyId);
    console.log('     Detalle Ganancias Empleado:', {
      remunBrutaAcum: empItDetail?.accumulatedGross,
      sacProyectado: empItDetail?.sacProjectedAccumulated,
      deduccionesPersonales: empItDetail?.personalDeductionsAccumulated,
      gananciaNetaSujetaImpuesto: empItDetail?.netTaxableIncomeAccumulated,
      impuestoDeterminado: empItDetail?.determinedTaxAccumulated,
      retencionNetaMes: empItDetail?.netMonthlyWithholding,
    });
    if (!empItDetail) {
      throw new Error('No se encontró el detalle de liquidación de Ganancias para el colaborador');
    }

    // 27.7 Exportar a Nómina con Selección de Conceptos y Validación ARCA
    console.log('  -> 27.7: Validación de códigos ARCA en exportación a nómina (820000 / 520002)');
    // A. Probar con un concepto inválido (ej. SU1000 que es 110000 Sueldo Básico)
    const allConceptsRes = await fetch(`${baseUrl}/payroll/concepts?limit=500`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'x-company-id': companyId },
    });
    const allConceptsJson = await allConceptsRes.json();
    const invalidConcept = allConceptsJson.data?.find((c) => c.code === 'SU1000') || allConceptsJson.data[0];
    const validWithholdingConcept = allConceptsJson.data?.find((c) => c.arcaConceptCode === '820000' || c.code === 'SU8200');
    const validRefundConcept = allConceptsJson.data?.find((c) => c.arcaConceptCode === '520002' || c.code === 'SU5200');

    if (!validWithholdingConcept || !validRefundConcept) {
      throw new Error('No se encontraron los conceptos oficiales SU8200 (ARCA 820000) o SU5200 (ARCA 520002)');
    }

    const invalidExportRes = await fetch(`${baseUrl}/income-tax/settlements/${itSettlementId}/export-to-payroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        periodId,
        withholdingConceptId: invalidConcept.id,
        refundConceptId: validRefundConcept.id,
      }),
    });
    const invalidExportJson = await invalidExportRes.json();
    console.log('     Status Exportación con Concepto Inválido (esperado 400):', invalidExportRes.status, invalidExportJson.message || invalidExportJson.error?.message);
    if (invalidExportRes.status !== 400) {
      throw new Error('Debió rechazarse la exportación por usar un concepto que no posee el código ARCA 820000');
    }

    // B. Exportar con los conceptos válidos oficiales
    console.log('  -> 27.7.b: Exportar a Nómina con conceptos oficiales validados por ARCA');
    const validExportRes = await fetch(`${baseUrl}/income-tax/settlements/${itSettlementId}/export-to-payroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({
        periodId,
        withholdingConceptId: validWithholdingConcept.id,
        refundConceptId: validRefundConcept.id,
      }),
    });
    const validExportJson = await validExportRes.json();
    console.log('     Status Exportación Válida:', validExportRes.status, validExportJson.message);
    if (validExportRes.status !== 200) {
      throw new Error(`Falló exportación a nómina con conceptos válidos: ${JSON.stringify(validExportJson)}`);
    }

    // C. Verificar que se haya creado la novedad en el período
    const periodNoveltiesRes = await fetch(`${baseUrl}/payroll/periods/${periodId}/novelties`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'x-company-id': companyId },
    });
    const periodNoveltiesJson = await periodNoveltiesRes.json();
    const itNovelty = periodNoveltiesJson.data?.find(
      (n) => n.employeeId === empFamilyId && (n.conceptId === validWithholdingConcept.id || n.conceptId === validRefundConcept.id)
    );
    console.log('     Novedad de Ganancias encontrada en período de nómina:', Boolean(itNovelty), itNovelty ? `Monto: $${itNovelty.amount}` : '');
    if (!itNovelty && Number(empItDetail.netMonthlyWithholding) !== 0) {
      throw new Error('No se generó la novedad de retención/reintegro de Ganancias en el período');
    }
    console.log('     -> Novedades en nómina y validación estricta de códigos ARCA 100% verificadas.');

    // 27.8 Liquidación Anual y Exportación de F. 1359 (ARCA)
    console.log('  -> 27.8: POST /api/v1/income-tax/annual/calculate & /f1359/export (Liquidación Anual)');
    const calcAnnualRes = await fetch(`${baseUrl}/income-tax/annual/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({ fiscalYear: 2026 }),
    });
    const calcAnnualJson = await calcAnnualRes.json();
    console.log('     Status Liquidación Anual:', calcAnnualRes.status, calcAnnualJson.message);
    if (calcAnnualRes.status !== 200) throw new Error('Falló cálculo de liquidación anual: ' + JSON.stringify(calcAnnualJson));

    const exportF1359Res = await fetch(`${baseUrl}/income-tax/f1359/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'x-company-id': companyId,
      },
      body: JSON.stringify({ fiscalYear: 2026, presentationType: 'ANNUAL' }),
    });
    const exportF1359Text = await exportF1359Res.text();
    console.log('     Status F.1359 Export:', exportF1359Res.status, '| Bytes generados:', exportF1359Text.length);
    if (exportF1359Res.status !== 200 || !exportF1359Text.includes('01')) {
      throw new Error('El archivo exportado F.1359 no posee la estructura de registros oficial de ARCA');
    }
    console.log('     -> Archivo F.1359 generado con registros oficiales de ARCA exitosamente.');

    console.log('\n🎉 ¡TODAS LAS PRUEBAS (1 a 27) PASARON EXITOSAMENTE!');
  } finally {
    // 🧹 Limpieza automática de recursos temporales creados exclusivamente por el test
    if (testDbName && testDbName.startsWith('sueldos_emp_30708381256_')) {
      try {
        await tenantConnectionManager.disconnectAll();
        await prismaMaster.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${testDbName}\``);
        console.log(`🧹 Base física de pruebas eliminada automáticamente: ${testDbName}`);
      } catch (cleanErr) {
        console.warn(`No se pudo eliminar la base temporal ${testDbName}:`, cleanErr.message);
      }
    }

    if (testAccountId) {
      try {
        await prismaMaster.account.delete({ where: { id: testAccountId } });
        console.log(`🧹 Cuenta y registros de prueba eliminados en sueldos_master: ${testAccountId}`);
      } catch (accCleanErr) {
        console.warn(`No se pudo eliminar la cuenta de prueba ${testAccountId}:`, accCleanErr.message);
      }
    }

    await new Promise((resolve) => server.close(resolve));
    await tenantConnectionManager.disconnectAll();
    await prismaMaster.$disconnect();
    console.log('🧹 Conexiones de prueba cerradas limpiamente.');
  }
}

runTests().catch((err) => {
  console.error('❌ Error en las pruebas:', err);
  process.exit(1);
});
