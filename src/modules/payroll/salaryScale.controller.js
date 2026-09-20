import * as salaryScaleService from './salaryScale.service.js';

export async function list(req, res) {
  const result = await salaryScaleService.listSalaryScales(req.tenantPrisma, req.query);
  res.status(200).json({ data: result });
}

export async function getById(req, res) {
  const result = await salaryScaleService.getSalaryScaleById(req.tenantPrisma, req.params.id);
  res.status(200).json({ data: result });
}

export async function create(req, res) {
  const result = await salaryScaleService.createSalaryScale(req.tenantPrisma, req.body);
  res.status(201).json({
    data: result,
    message: 'Nómina creada exitosamente',
  });
}

export async function update(req, res) {
  const result = await salaryScaleService.updateSalaryScale(req.tenantPrisma, req.params.id, req.body);
  res.status(200).json({
    data: result,
    message: 'Nómina actualizada exitosamente',
  });
}

export async function remove(req, res) {
  const result = await salaryScaleService.deleteSalaryScale(req.tenantPrisma, req.params.id);
  res.status(200).json(result);
}

export async function previewMassIncrease(req, res) {
  const result = await salaryScaleService.previewMassScaleIncrease(req.tenantPrisma, req.body);
  res.status(200).json({ data: result });
}

export async function applyMassIncrease(req, res) {
  const result = await salaryScaleService.applyMassScaleIncrease(req.tenantPrisma, req.body);
  res.status(200).json({
    data: result,
    message: `Aumento masivo aplicado con éxito a ${result.updatedScalesCount} nómina(s) y ${result.totalEmployeesUpdated} colaborador(es)`,
  });
}
