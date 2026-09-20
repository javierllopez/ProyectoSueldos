import * as affiliationService from './affiliation.service.js';

// --- OBRAS SOCIALES ---

export async function listHealthInsurances(req, res) {
  const list = await affiliationService.listHealthInsurances(req.tenantPrisma);
  return res.status(200).json({ data: list });
}

export async function getHealthInsuranceById(req, res) {
  const item = await affiliationService.getHealthInsuranceById(req.tenantPrisma, req.params.id);
  return res.status(200).json({ data: item });
}

export async function createHealthInsurance(req, res) {
  const item = await affiliationService.createHealthInsurance(req.tenantPrisma, req.body);
  return res.status(201).json({
    data: item,
    message: 'Obra Social creada exitosamente',
  });
}

export async function updateHealthInsurance(req, res) {
  const item = await affiliationService.updateHealthInsurance(req.tenantPrisma, req.params.id, req.body);
  return res.status(200).json({
    data: item,
    message: 'Obra Social actualizada exitosamente',
  });
}

export async function deleteHealthInsurance(req, res) {
  await affiliationService.deleteHealthInsurance(req.tenantPrisma, req.params.id);
  return res.status(200).json({ message: 'Obra Social eliminada exitosamente' });
}

// --- SINDICATOS ---

export async function listUnions(req, res) {
  const list = await affiliationService.listUnions(req.tenantPrisma);
  return res.status(200).json({ data: list });
}

export async function getUnionById(req, res) {
  const item = await affiliationService.getUnionById(req.tenantPrisma, req.params.id);
  return res.status(200).json({ data: item });
}

export async function createUnion(req, res) {
  const item = await affiliationService.createUnion(req.tenantPrisma, req.body);
  return res.status(201).json({
    data: item,
    message: 'Sindicato creado exitosamente',
  });
}

export async function updateUnion(req, res) {
  const item = await affiliationService.updateUnion(req.tenantPrisma, req.params.id, req.body);
  return res.status(200).json({
    data: item,
    message: 'Sindicato actualizado exitosamente',
  });
}

export async function deleteUnion(req, res) {
  await affiliationService.deleteUnion(req.tenantPrisma, req.params.id);
  return res.status(200).json({ message: 'Sindicato eliminado exitosamente' });
}

// --- MUTUALES ---

export async function listMutuals(req, res) {
  const list = await affiliationService.listMutuals(req.tenantPrisma);
  return res.status(200).json({ data: list });
}

export async function getMutualById(req, res) {
  const item = await affiliationService.getMutualById(req.tenantPrisma, req.params.id);
  return res.status(200).json({ data: item });
}

export async function createMutual(req, res) {
  const item = await affiliationService.createMutual(req.tenantPrisma, req.body);
  return res.status(201).json({
    data: item,
    message: 'Mutual creada exitosamente',
  });
}

export async function updateMutual(req, res) {
  const item = await affiliationService.updateMutual(req.tenantPrisma, req.params.id, req.body);
  return res.status(200).json({
    data: item,
    message: 'Mutual actualizada exitosamente',
  });
}

export async function deleteMutual(req, res) {
  await affiliationService.deleteMutual(req.tenantPrisma, req.params.id);
  return res.status(200).json({ message: 'Mutual eliminada exitosamente' });
}
