import * as companyService from './company.service.js';

export async function list(req, res) {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;

  const result = await companyService.listCompanies(req.user, { page, limit });
  return res.status(200).json(result);
}

export async function getById(req, res) {
  const company = await companyService.getCompanyById(req.user.accountId, req.params.id);
  return res.status(200).json({ data: company });
}

export async function create(req, res) {
  const company = await companyService.createCompany({
    accountId: req.user.accountId,
    userId: req.user.id,
    ...req.body,
  });

  return res.status(201).json({
    data: company,
    message: 'Empresa creada y aprovisionada con éxito',
  });
}

export async function update(req, res) {
  const company = await companyService.updateCompany(
    req.user.accountId,
    req.params.id,
    req.body
  );

  return res.status(200).json({
    data: company,
    message: 'Empresa actualizada correctamente',
  });
}

export async function remove(req, res) {
  await companyService.deleteCompany(req.user.accountId, req.params.id, req.user.id);
  return res.status(204).send();
}

export async function assignUser(req, res) {
  const access = await companyService.assignUserToCompany({
    accountId: req.user.accountId,
    companyId: req.params.id,
    targetUserId: req.body.userId,
    role: req.body.role,
  });

  return res.status(200).json({
    data: access,
    message: 'Permiso asignado correctamente',
  });
}

export async function removeUser(req, res) {
  await companyService.removeUserFromCompany({
    companyId: req.params.id,
    targetUserId: req.params.userId,
  });

  return res.status(204).send();
}

export async function getProfile(req, res) {
  const profile = await companyService.getCompanyProfile(req.tenantPrisma, req.company);
  return res.status(200).json({ data: profile });
}

export async function updateProfile(req, res) {
  const profile = await companyService.updateCompanyProfile(
    req.tenantPrisma,
    req.user.accountId,
    req.company,
    req.body
  );

  return res.status(200).json({
    data: profile,
    message: 'Datos de la empresa actualizados con éxito',
  });
}
