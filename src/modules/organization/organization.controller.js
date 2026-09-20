import * as organizationService from './organization.service.js';

// --- SECTORES ---

export async function listDepartments(req, res) {
  const departments = await organizationService.listDepartments(req.tenantPrisma);
  return res.status(200).json({ data: departments });
}

export async function getDepartmentById(req, res) {
  const department = await organizationService.getDepartmentById(req.tenantPrisma, req.params.id);
  return res.status(200).json({ data: department });
}

export async function createDepartment(req, res) {
  const department = await organizationService.createDepartment(req.tenantPrisma, req.body);
  return res.status(201).json({
    data: department,
    message: 'Sector creado exitosamente',
  });
}

export async function importDepartments(req, res) {
  const result = await organizationService.importDepartments(req.tenantPrisma, req.body.departments);
  return res.status(200).json({
    data: result,
    message: result.createdCount > 0
      ? `Se importaron ${result.createdCount} sector(es) exitosamente`
      : 'No se agregaron nuevos sectores',
  });
}

export async function updateDepartment(req, res) {
  const department = await organizationService.updateDepartment(req.tenantPrisma, req.params.id, req.body);
  return res.status(200).json({
    data: department,
    message: 'Sector actualizado exitosamente',
  });
}

export async function deleteDepartment(req, res) {
  await organizationService.deleteDepartment(req.tenantPrisma, req.params.id);
  return res.status(200).json({ message: 'Sector eliminado exitosamente' });
}

// --- PUESTOS DE TRABAJO ---

export async function listJobPositions(req, res) {
  const positions = await organizationService.listJobPositions(req.tenantPrisma);
  return res.status(200).json({ data: positions });
}

export async function getJobPositionById(req, res) {
  const position = await organizationService.getJobPositionById(req.tenantPrisma, req.params.id);
  return res.status(200).json({ data: position });
}

export async function createJobPosition(req, res) {
  const position = await organizationService.createJobPosition(req.tenantPrisma, req.body);
  return res.status(201).json({
    data: position,
    message: 'Puesto de trabajo creado exitosamente',
  });
}

export async function importJobPositions(req, res) {
  const result = await organizationService.importJobPositions(req.tenantPrisma, req.body.jobPositions);
  return res.status(200).json({
    data: result,
    message: result.createdCount > 0
      ? `Se importaron ${result.createdCount} puesto(s) exitosamente`
      : 'No se agregaron nuevos puestos',
  });
}

export async function updateJobPosition(req, res) {
  const position = await organizationService.updateJobPosition(req.tenantPrisma, req.params.id, req.body);
  return res.status(200).json({
    data: position,
    message: 'Puesto de trabajo actualizado exitosamente',
  });
}

export async function deleteJobPosition(req, res) {
  await organizationService.deleteJobPosition(req.tenantPrisma, req.params.id);
  return res.status(200).json({ message: 'Puesto de trabajo eliminado exitosamente' });
}

// --- CATÁLOGOS ARCA ---

export async function listArcaCcts(req, res) {
  const { search, limit } = req.query;
  const ccts = await organizationService.listArcaCcts(req.tenantPrisma, { search, limit });
  return res.status(200).json({ data: ccts });
}

export async function listArcaCategories(req, res) {
  const { search, limit, cctCode } = req.query;
  const categories = await organizationService.listArcaCategories(req.tenantPrisma, { search, limit, cctCode });
  return res.status(200).json({ data: categories });
}

export async function listArcaPositions(req, res) {
  const { search, limit, cctCode } = req.query;
  const positions = await organizationService.listArcaPositions(req.tenantPrisma, { search, limit, cctCode });
  return res.status(200).json({ data: positions });
}

export async function listArcaServiceTypes(req, res) {
  const serviceTypes = await organizationService.listArcaServiceTypes(req.tenantPrisma);
  return res.status(200).json({ data: serviceTypes });
}

export async function listArcaContractModalities(req, res) {
  const { search, onlyActive } = req.query;
  const modalities = await organizationService.listArcaContractModalities(req.tenantPrisma, {
    search,
    onlyActive: onlyActive === 'true' || onlyActive === '1',
  });
  return res.status(200).json({ data: modalities });
}

