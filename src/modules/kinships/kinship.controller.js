import * as kinshipService from './kinship.service.js';

export async function listKinships(req, res) {
  const kinships = await kinshipService.listKinships(req.tenantPrisma);
  return res.status(200).json({ data: kinships });
}

export async function getKinshipById(req, res) {
  const kinship = await kinshipService.getKinshipById(req.tenantPrisma, req.params.id);
  return res.status(200).json({ data: kinship });
}

export async function createKinship(req, res) {
  const kinship = await kinshipService.createKinship(req.tenantPrisma, req.body);
  return res.status(201).json({
    data: kinship,
    message: 'Parentesco registrado exitosamente',
  });
}

export async function updateKinship(req, res) {
  const kinship = await kinshipService.updateKinship(req.tenantPrisma, req.params.id, req.body);
  return res.status(200).json({
    data: kinship,
    message: 'Parentesco actualizado exitosamente',
  });
}

export async function deleteKinship(req, res) {
  await kinshipService.deleteKinship(req.tenantPrisma, req.params.id);
  return res.status(200).json({ message: 'Parentesco eliminado exitosamente' });
}
