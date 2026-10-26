import * as incomeTaxTableService from './incomeTaxTable.service.js';

export async function listTables(req, res) {
  const result = await incomeTaxTableService.listIncomeTaxTables(req.tenantPrisma, req.query);
  res.status(200).json({ data: result });
}

export async function getTableByPeriod(req, res) {
  const { year, month } = req.params;
  const result = await incomeTaxTableService.getIncomeTaxTableByPeriod(req.tenantPrisma, year, month);
  if (!result) {
    return res.status(404).json({ error: { message: 'Tabla no encontrada para el período especificado' } });
  }
  res.status(200).json({ data: result });
}

export async function updateTable(req, res) {
  const result = await incomeTaxTableService.updateIncomeTaxTable(req.tenantPrisma, req.params.id, req.body);
  res.status(200).json({ data: result, message: 'Deducciones del Art. 30 actualizadas exitosamente' });
}

export async function listScales(req, res) {
  const result = await incomeTaxTableService.listIncomeTaxScales(req.tenantPrisma, req.query);
  res.status(200).json({ data: result });
}

export async function updateScale(req, res) {
  const result = await incomeTaxTableService.updateIncomeTaxScale(req.tenantPrisma, req.params.id, req.body);
  res.status(200).json({ data: result, message: 'Escala del Art. 94 actualizada exitosamente' });
}

export async function listLimits(req, res) {
  const result = await incomeTaxTableService.listGeneralDeductionLimits(req.tenantPrisma, req.query);
  res.status(200).json({ data: result });
}

export async function updateLimit(req, res) {
  const result = await incomeTaxTableService.updateGeneralDeductionLimit(req.tenantPrisma, req.params.id, req.body);
  res.status(200).json({ data: result, message: 'Límite de deducción general actualizado exitosamente' });
}

export async function cloneAndAdjust(req, res) {
  const result = await incomeTaxTableService.cloneAndAdjustYear(req.tenantPrisma, req.body);
  res.status(200).json({ data: result, message: result.message });
}
