import * as incomeTaxService from './incomeTax.service.js';
import * as employeeTaxProfileService from './employeeTaxProfile.service.js';
import * as siradigParserService from './siradigParser.service.js';
import * as f1359ExporterService from './f1359Exporter.service.js';

// --- LIQUIDACIONES ---

export async function calculateSettlement(req, res) {
  const result = await incomeTaxService.calculateMonthlyIncomeTax(req.tenantPrisma, req.body);
  res.status(200).json({
    data: result,
    message: `Liquidación de Ganancias calculada: ${result.evaluatedEmployeesCount} colaborador(es) evaluado(s), retenciones: $${result.totalWithheldAmount}, reintegros: $${result.totalRefundAmount}`,
  });
}

export async function listSettlements(req, res) {
  const result = await incomeTaxService.listSettlements(req.tenantPrisma, req.query);
  res.status(200).json({ data: result });
}

export async function getSettlementById(req, res) {
  const result = await incomeTaxService.getSettlementById(req.tenantPrisma, req.params.id);
  res.status(200).json({ data: result });
}

export async function exportToPayroll(req, res) {
  const result = await incomeTaxService.exportSettlementToPayroll(req.tenantPrisma, req.params.id, req.body);
  res.status(200).json({
    data: result,
    message: result.message,
  });
}

// --- LEGAJO FISCAL DEL EMPLEADO ---

export async function getEmployeeTaxProfile(req, res) {
  const { employeeId } = req.params;
  const { year } = req.query;
  const result = await employeeTaxProfileService.getEmployeeTaxProfile(req.tenantPrisma, employeeId, year);
  res.status(200).json({ data: result });
}

export async function createEmployeeDeduction(req, res) {
  const { employeeId } = req.params;
  const result = await employeeTaxProfileService.createEmployeeDeduction(req.tenantPrisma, employeeId, req.body);
  res.status(201).json({
    data: result,
    message: 'Deducción general registrada exitosamente',
  });
}

export async function deleteEmployeeDeduction(req, res) {
  const { deductionId } = req.params;
  await employeeTaxProfileService.deleteEmployeeDeduction(req.tenantPrisma, deductionId);
  res.status(200).json({ message: 'Deducción eliminada exitosamente' });
}

export async function createEmployeeOtherIncome(req, res) {
  const { employeeId } = req.params;
  const result = await employeeTaxProfileService.createEmployeeOtherIncome(req.tenantPrisma, employeeId, req.body);
  res.status(201).json({
    data: result,
    message: 'Ingreso de otro empleador registrado exitosamente',
  });
}

export async function deleteEmployeeOtherIncome(req, res) {
  const { otherIncomeId } = req.params;
  await employeeTaxProfileService.deleteEmployeeOtherIncome(req.tenantPrisma, otherIncomeId);
  res.status(200).json({ message: 'Ingreso de otro empleador eliminado exitosamente' });
}

export async function createEmployeePaymentOnAccount(req, res) {
  const { employeeId } = req.params;
  const result = await employeeTaxProfileService.createEmployeePaymentOnAccount(req.tenantPrisma, employeeId, req.body);
  res.status(201).json({
    data: result,
    message: 'Percepción / pago a cuenta registrado exitosamente',
  });
}

export async function deleteEmployeePaymentOnAccount(req, res) {
  const { paymentId } = req.params;
  await employeeTaxProfileService.deleteEmployeePaymentOnAccount(req.tenantPrisma, paymentId);
  res.status(200).json({ message: 'Percepción eliminada exitosamente' });
}

// --- SIRADIG ---

export async function previewSiradig(req, res) {
  const result = await siradigParserService.previewSiradigPresentation(req.tenantPrisma, req.body);
  res.status(200).json({
    data: result,
    message: result.hasUnregisteredRelatives
      ? `Se detectaron ${result.unregisteredRelatives.length} pariente(s) en SiRADIG no empadronados en Personal.`
      : 'Archivo SiRADIG validado correctamente.',
  });
}

export async function importSiradig(req, res) {
  const result = await siradigParserService.importSiradigPresentation(req.tenantPrisma, req.body);
  res.status(200).json({
    data: result,
    message: result.message,
  });
}

export async function listSiradigImports(req, res) {
  const result = await siradigParserService.listSiradigImports(req.tenantPrisma, req.query);
  res.status(200).json({ data: result });
}

// --- LIQUIDACIÓN ANUAL Y F.1359 ---

export async function calculateAnnual(req, res) {
  const result = await f1359ExporterService.calculateAnnualSettlement(req.tenantPrisma, req.body);
  res.status(200).json({
    data: result,
    message: 'Liquidación anual F.1359 generada exitosamente',
  });
}

export async function exportF1359(req, res) {
  const result = await f1359ExporterService.generateF1359File(req.tenantPrisma, req.body);
  res.status(200).json({
    data: result,
    message: `Archivo oficial ARCA F.1359 generado con éxito (${result.employeesCount} colaboradores)`,
  });
}
