import * as embargoService from './embargo.service.js';

export async function list(req, res, next) {
  try {
    const { employeeId, status, search, page, limit } = req.query;
    const result = await embargoService.listEmbargoes(req.tenantPrisma, {
      employeeId,
      status,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const embargo = await embargoService.getEmbargoById(req.tenantPrisma, req.params.id);
    return res.status(200).json({ data: embargo });
  } catch (err) {
    return next(err);
  }
}

export async function create(req, res, next) {
  try {
    const created = await embargoService.createEmbargo(req.tenantPrisma, req.body);
    return res.status(201).json({
      message: 'Embargo judicial registrado correctamente',
      data: created,
    });
  } catch (err) {
    return next(err);
  }
}

export async function update(req, res, next) {
  try {
    const updated = await embargoService.updateEmbargo(req.tenantPrisma, req.params.id, req.body);
    return res.status(200).json({
      message: 'Embargo judicial actualizado correctamente',
      data: updated,
    });
  } catch (err) {
    return next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const result = await embargoService.deleteEmbargo(req.tenantPrisma, req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getHistory(req, res, next) {
  try {
    const history = await embargoService.getEmbargoDeductionHistory(req.tenantPrisma, req.params.id);
    return res.status(200).json({ data: history });
  } catch (err) {
    return next(err);
  }
}
