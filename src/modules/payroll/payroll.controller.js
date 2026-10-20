import * as payrollService from './payroll.service.js';

// --- PERÍODOS FISCALES (MENSUALES) ---

export async function getActiveFiscalPeriod(req, res) {
  const active = await payrollService.getActiveFiscalPeriod(req.tenantPrisma);
  return res.status(200).json({ data: active });
}

export async function listFiscalPeriods(req, res) {
  const periods = await payrollService.listFiscalPeriods(req.tenantPrisma);
  return res.status(200).json({ data: periods });
}

export async function createFiscalPeriod(req, res) {
  const created = await payrollService.createFiscalPeriod(req.tenantPrisma, req.body);
  return res.status(201).json({
    message: 'Período fiscal creado exitosamente',
    data: created,
  });
}

export async function closeFiscalPeriod(req, res) {
  const closed = await payrollService.closeFiscalPeriod(req.tenantPrisma, req.params.id);
  return res.status(200).json({
    message: 'Período fiscal cerrado exitosamente',
    data: closed,
  });
}

// --- LIQUIDACIONES INDIVIDUALES ---

export async function getPeriods(req, res) {
  const result = await payrollService.getPeriods(req.tenantPrisma, req.query);
  return res.status(200).json(result);
}

export async function getPeriodById(req, res) {
  const period = await payrollService.getPeriodById(req.tenantPrisma, req.params.id);
  return res.status(200).json({ data: period });
}

export async function createPeriod(req, res) {
  const created = await payrollService.createPeriod(req.tenantPrisma, req.body);
  return res.status(201).json({
    message: 'Liquidación creada exitosamente',
    data: created,
  });
}

export async function updatePeriod(req, res) {
  const updated = await payrollService.updatePeriod(req.tenantPrisma, req.params.id, req.body);
  return res.status(200).json({
    message: 'Liquidación actualizada exitosamente',
    data: updated,
  });
}

export async function closePeriod(req, res) {
  const closed = await payrollService.closePeriod(req.tenantPrisma, req.params.id);
  return res.status(200).json({
    message: 'Liquidación cerrada exitosamente',
    data: closed,
  });
}

export async function deletePeriod(req, res) {
  await payrollService.deletePeriod(req.tenantPrisma, req.params.id);
  return res.status(200).json({
    message: 'Liquidación eliminada exitosamente',
  });
}

export async function getPeriodConceptsSummary(req, res) {
  const summary = await payrollService.getPeriodConceptsSummary(req.tenantPrisma, req.params.id);
  return res.status(200).json({ data: summary });
}

// --- CÁLCULO DE HABERES ---

export async function calculatePeriod(req, res) {
  const result = await payrollService.calculatePeriod(req.tenantPrisma, req.params.id, req.body);
  return res.status(200).json({
    message: `Cálculo de nómina completado para ${result.processedEmployees} empleado(s)`,
    data: result,
  });
}

// --- RECIBOS DE SUELDO ---

export async function getPaySlips(req, res) {
  const result = await payrollService.getPaySlips(req.tenantPrisma, req.params.periodId, req.query);
  return res.status(200).json(result);
}

export async function getPaySlipDetail(req, res) {
  const result = await payrollService.getPaySlipDetail(req.tenantPrisma, req.params.slipId);
  return res.status(200).json({ data: result });
}

// --- PARÁMETROS Y ALÍCUOTAS ---

export async function getPayrollSettings(req, res) {
  const settings = await payrollService.getPayrollSettings(req.tenantPrisma);
  return res.status(200).json({ data: settings });
}

export async function updatePayrollSettings(req, res) {
  const updated = await payrollService.updatePayrollSettings(req.tenantPrisma, req.body);
  return res.status(200).json({
    message: 'Parámetros y alícuotas patronales actualizados exitosamente',
    data: updated,
  });
}

// --- CONCEPTOS ---

export async function getConcepts(req, res) {
  const result = await payrollService.getConcepts(req.tenantPrisma, req.query);
  return res.status(200).json(result);
}

export async function createConcept(req, res) {
  const created = await payrollService.createConcept(req.tenantPrisma, req.body);
  return res.status(201).json({
    message: 'Concepto creado exitosamente',
    data: created,
  });
}

export async function updateConcept(req, res) {
  const updated = await payrollService.updateConcept(req.tenantPrisma, req.params.id, req.body);
  return res.status(200).json({
    message: 'Concepto actualizado exitosamente',
    data: updated,
  });
}

export async function deleteConcept(req, res) {
  await payrollService.deleteConcept(req.tenantPrisma, req.params.id);
  return res.status(200).json({
    message: 'Concepto eliminado exitosamente',
  });
}

export async function validateFormula(req, res) {
  const { formula, conceptCode, calculationOrder } = req.body;
  const result = await payrollService.validateFormula(req.tenantPrisma, {
    formula,
    conceptCode,
    calculationOrder,
  });
  return res.status(200).json({ data: result });
}

// --- EXPORTACIÓN LIBRO DE SUELDOS DIGITAL (ARCA) ---

export async function exportLsdConcepts(req, res) {
  const fileContent = await payrollService.exportLsdConcepts(req.tenantPrisma);
  const buffer = Buffer.from(fileContent, 'latin1');
  res.setHeader('Content-Type', 'text/plain; charset=windows-1252');
  res.setHeader('Content-Disposition', 'attachment; filename="LSD_Conceptos_ARCA.txt"');
  res.setHeader('Content-Length', buffer.length);
  return res.status(200).send(buffer);
}

export async function exportLsdPayroll(req, res) {
  const company = req.company || {};
  const fileContent = await payrollService.exportLsdPayroll(req.tenantPrisma, req.params.periodId, company);
  const filename = `LSD_Liquidacion_${company.cuit || 'ARCA'}_${req.params.periodId.substring(0, 8)}.txt`;
  const buffer = Buffer.from(fileContent, 'latin1');
  res.setHeader('Content-Type', 'text/plain; charset=windows-1252');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  return res.status(200).send(buffer);
}

export async function validateLsd(req, res) {
  const validation = await payrollService.validateLsd(req.tenantPrisma, req.params.periodId);
  return res.status(200).json({ data: validation });
}

// --- LIBRO DE SUELDOS DIGITAL UNIFICADO MENSUAL (ARCA F.931) ---

export async function getMonthlyLsdPeriods(req, res) {
  const periods = await payrollService.getMonthlyLsdPeriods(req.tenantPrisma);
  return res.status(200).json({ data: periods });
}

export async function getMonthlyLsdPreview(req, res) {
  const { year, month } = req.params;
  const preview = await payrollService.getMonthlyLsdPreview(req.tenantPrisma, year, month);
  return res.status(200).json({ data: preview });
}

export async function validateMonthlyLsd(req, res) {
  const { year, month } = req.params;
  const validation = await payrollService.validateMonthlyLsd(req.tenantPrisma, year, month);
  return res.status(200).json({ data: validation });
}

export async function exportMonthlyLsdPayroll(req, res) {
  const company = req.company || {};
  const { year, month } = req.params;
  const fileContent = await payrollService.exportMonthlyLsdPayroll(req.tenantPrisma, year, month, company);
  const cuitClean = (company.cuit || 'ARCA').replace(/\D/g, '');
  const filename = `LSD_Mensual_${cuitClean}_${year}${String(month).padStart(2, '0')}.txt`;
  const buffer = Buffer.from(fileContent, 'latin1');
  res.setHeader('Content-Type', 'text/plain; charset=windows-1252');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  return res.status(200).send(buffer);
}

// --- MATRICES DE LIQUIDACIÓN ---

export async function getPayrollMatrices(req, res) {
  const result = await payrollService.getPayrollMatrices(req.tenantPrisma, req.query);
  return res.status(200).json(result);
}

export async function getPayrollMatrixById(req, res) {
  const matrix = await payrollService.getPayrollMatrixById(req.tenantPrisma, req.params.id);
  return res.status(200).json({ data: matrix });
}

export async function createPayrollMatrix(req, res) {
  const created = await payrollService.createPayrollMatrix(req.tenantPrisma, req.body);
  return res.status(201).json({
    message: 'Matriz de liquidación creada exitosamente',
    data: created,
  });
}

export async function updatePayrollMatrix(req, res) {
  const updated = await payrollService.updatePayrollMatrix(req.tenantPrisma, req.params.id, req.body);
  return res.status(200).json({
    message: 'Matriz de liquidación actualizada exitosamente',
    data: updated,
  });
}

export async function deletePayrollMatrix(req, res) {
  const deleted = await payrollService.deletePayrollMatrix(req.tenantPrisma, req.params.id);
  return res.status(200).json({
    message: 'Matriz de liquidación eliminada exitosamente',
    data: deleted,
  });
}

// --- VALORES GLOBALES FIJOS (CONSTANTES DE LIQUIDACIÓN) ---

export async function getPayrollFixedValues(req, res) {
  const result = await payrollService.getPayrollFixedValues(req.tenantPrisma, req.query);
  return res.status(200).json(result);
}

export async function getPayrollFixedValueById(req, res) {
  const fixedValue = await payrollService.getPayrollFixedValueById(req.tenantPrisma, req.params.id);
  return res.status(200).json({ data: fixedValue });
}

export async function createPayrollFixedValue(req, res) {
  const created = await payrollService.createPayrollFixedValue(req.tenantPrisma, req.body);
  return res.status(201).json({
    message: 'Valor fijo registrado exitosamente',
    data: created,
  });
}

export async function updatePayrollFixedValue(req, res) {
  const updated = await payrollService.updatePayrollFixedValue(req.tenantPrisma, req.params.id, req.body);
  return res.status(200).json({
    message: 'Valor fijo actualizado exitosamente',
    data: updated,
  });
}

export async function deletePayrollFixedValue(req, res) {
  const deleted = await payrollService.deletePayrollFixedValue(req.tenantPrisma, req.params.id);
  return res.status(200).json({
    message: 'Valor fijo eliminado exitosamente',
    data: deleted,
  });
}

// --- NOVEDADES DE PERÍODO (NO PERSISTENTES) ---

export async function getPeriodNovelties(req, res) {
  const novelties = await payrollService.listPeriodNovelties(req.tenantPrisma, req.params.id, req.query);
  return res.status(200).json({ data: novelties });
}

export async function upsertPeriodNovelty(req, res) {
  const result = await payrollService.upsertPeriodNovelty(req.tenantPrisma, req.params.id, req.body);
  return res.status(200).json({
    message: 'Novedad guardada exitosamente',
    data: result,
  });
}

export async function deletePeriodNovelty(req, res) {
  const result = await payrollService.deletePeriodNovelty(req.tenantPrisma, req.params.id, req.params.noveltyId);
  return res.status(200).json(result);
}

export async function batchPeriodNovelties(req, res) {
  const result = await payrollService.batchUpsertPeriodNovelties(req.tenantPrisma, req.params.id, req.body.items);
  return res.status(200).json({
    message: `Se guardaron ${result.savedCount} novedades correctamente`,
    data: result,
  });
}

// --- LIQUIDACIÓN INDIVIDUAL Y POR LOTE ---

export async function calculateSingleEmployee(req, res) {
  const result = await payrollService.calculateSingleEmployee(req.tenantPrisma, req.params.id, req.params.employeeId);
  return res.status(200).json({
    message: 'Colaborador liquidado exitosamente',
    data: result,
  });
}

export async function calculateBatchEmployees(req, res) {
  const result = await payrollService.calculateBatchEmployees(req.tenantPrisma, req.params.id, req.body.employeeIds);
  return res.status(200).json({
    message: `Liquidación procesada para ${result.processedEmployees} colaboradores`,
    data: result,
  });
}

export async function updatePaySlipWorkedDays(req, res) {
  const { workedDays } = req.body;
  const updated = await payrollService.updatePaySlipWorkedDays(req.tenantPrisma, req.params.slipId, workedDays);
  return res.status(200).json({
    message: 'Días trabajados actualizados correctamente',
    data: updated,
  });
}
