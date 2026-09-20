import * as payrollService from './payroll.service.js';
import {
  createPeriodSchema,
  calculatePeriodSchema,
  updateSettingsSchema,
  createConceptSchema,
  updateConceptSchema,
  createPayrollMatrixSchema,
  updatePayrollMatrixSchema,
  createPayrollFixedValueSchema,
  updatePayrollFixedValueSchema,
  createPeriodNoveltySchema,
  updatePeriodNoveltySchema,
  batchPeriodNoveltiesSchema,
  calculateBatchSchema,
} from './payroll.validation.js';

// --- PERIODOS / LIQUIDACIONES ---

export async function getPeriods(req, res, next) {
  try {
    const result = await payrollService.getPeriods(req.tenantPrisma, req.query);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getPeriodById(req, res, next) {
  try {
    const period = await payrollService.getPeriodById(req.tenantPrisma, req.params.id);
    return res.status(200).json({ data: period });
  } catch (err) {
    return next(err);
  }
}

export async function createPeriod(req, res, next) {
  try {
    const validated = createPeriodSchema.parse(req.body);
    const created = await payrollService.createPeriod(req.tenantPrisma, validated);
    return res.status(201).json({
      message: 'Liquidación creada exitosamente',
      data: created,
    });
  } catch (err) {
    return next(err);
  }
}

export async function updatePeriod(req, res, next) {
  try {
    const validated = createPeriodSchema.partial().parse(req.body);
    const updated = await payrollService.updatePeriod(req.tenantPrisma, req.params.id, validated);
    return res.status(200).json({
      message: 'Liquidación actualizada exitosamente',
      data: updated,
    });
  } catch (err) {
    return next(err);
  }
}

export async function closePeriod(req, res, next) {
  try {
    const closed = await payrollService.closePeriod(req.tenantPrisma, req.params.id);
    return res.status(200).json({
      message: 'Liquidación cerrada exitosamente',
      data: closed,
    });
  } catch (err) {
    return next(err);
  }
}

export async function deletePeriod(req, res, next) {
  try {
    await payrollService.deletePeriod(req.tenantPrisma, req.params.id);
    return res.status(200).json({
      message: 'Liquidación eliminada exitosamente',
    });
  } catch (err) {
    return next(err);
  }
}

// --- CÁLCULO DE HABERES ---

export async function calculatePeriod(req, res, next) {
  try {
    const validated = calculatePeriodSchema.parse(req.body);
    const result = await payrollService.calculatePeriod(req.tenantPrisma, req.params.id, validated);
    return res.status(200).json({
      message: `Cálculo de nómina completado para ${result.processedEmployees} empleado(s)`,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

// --- RECIBOS DE SUELDO ---

export async function getPaySlips(req, res, next) {
  try {
    const result = await payrollService.getPaySlips(req.tenantPrisma, req.params.periodId, req.query);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getPaySlipDetail(req, res, next) {
  try {
    const result = await payrollService.getPaySlipDetail(req.tenantPrisma, req.params.slipId);
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
}

// --- PARÁMETROS Y ALÍCUOTAS ---

export async function getPayrollSettings(req, res, next) {
  try {
    const settings = await payrollService.getPayrollSettings(req.tenantPrisma);
    return res.status(200).json({ data: settings });
  } catch (err) {
    return next(err);
  }
}

export async function updatePayrollSettings(req, res, next) {
  try {
    const validated = updateSettingsSchema.parse(req.body);
    const updated = await payrollService.updatePayrollSettings(req.tenantPrisma, validated);
    return res.status(200).json({
      message: 'Parámetros y alícuotas patronales actualizados exitosamente',
      data: updated,
    });
  } catch (err) {
    return next(err);
  }
}

// --- CONCEPTOS ---

export async function getConcepts(req, res, next) {
  try {
    const result = await payrollService.getConcepts(req.tenantPrisma, req.query);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function createConcept(req, res, next) {
  try {
    const validated = createConceptSchema.parse(req.body);
    const created = await payrollService.createConcept(req.tenantPrisma, validated);
    return res.status(201).json({
      message: 'Concepto creado exitosamente',
      data: created,
    });
  } catch (err) {
    return next(err);
  }
}

export async function updateConcept(req, res, next) {
  try {
    const validated = updateConceptSchema.parse(req.body);
    const updated = await payrollService.updateConcept(req.tenantPrisma, req.params.id, validated);
    return res.status(200).json({
      message: 'Concepto actualizado exitosamente',
      data: updated,
    });
  } catch (err) {
    return next(err);
  }
}

export async function deleteConcept(req, res, next) {
  try {
    await payrollService.deleteConcept(req.tenantPrisma, req.params.id);
    return res.status(200).json({
      message: 'Concepto eliminado exitosamente',
    });
  } catch (err) {
    return next(err);
  }
}

export async function validateFormula(req, res, next) {
  try {
    const { formula, conceptCode, calculationOrder } = req.body;
    const result = await payrollService.validateFormula(req.tenantPrisma, {
      formula,
      conceptCode,
      calculationOrder,
    });
    return res.status(200).json({ data: result });
  } catch (err) {
    return next(err);
  }
}


// --- EXPORTACIÓN LIBRO DE SUELDOS DIGITAL (ARCA) ---

export async function exportLsdConcepts(req, res, next) {
  try {
    const fileContent = await payrollService.exportLsdConcepts(req.tenantPrisma);
    res.setHeader('Content-Type', 'text/plain; charset=windows-1252');
    res.setHeader('Content-Disposition', 'attachment; filename="LSD_Conceptos_ARCA.txt"');
    return res.status(200).send(fileContent);
  } catch (err) {
    return next(err);
  }
}

export async function exportLsdPayroll(req, res, next) {
  try {
    const company = req.company || {};
    const fileContent = await payrollService.exportLsdPayroll(req.tenantPrisma, req.params.periodId, company);
    const filename = `LSD_Liquidacion_${company.cuit || 'ARCA'}_${req.params.periodId.substring(0, 8)}.txt`;
    res.setHeader('Content-Type', 'text/plain; charset=windows-1252');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(fileContent);
  } catch (err) {
    return next(err);
  }
}

export async function validateLsd(req, res, next) {
  try {
    const validation = await payrollService.validateLsd(req.tenantPrisma, req.params.periodId);
    return res.status(200).json({ data: validation });
  } catch (err) {
    return next(err);
  }
}

// --- MATRICES DE LIQUIDACIÓN ---

export async function getPayrollMatrices(req, res, next) {
  try {
    const result = await payrollService.getPayrollMatrices(req.tenantPrisma, req.query);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getPayrollMatrixById(req, res, next) {
  try {
    const matrix = await payrollService.getPayrollMatrixById(req.tenantPrisma, req.params.id);
    return res.status(200).json({ data: matrix });
  } catch (err) {
    return next(err);
  }
}

export async function createPayrollMatrix(req, res, next) {
  try {
    const validated = createPayrollMatrixSchema.parse(req.body);
    const created = await payrollService.createPayrollMatrix(req.tenantPrisma, validated);
    return res.status(201).json({
      message: 'Matriz de liquidación creada exitosamente',
      data: created,
    });
  } catch (err) {
    return next(err);
  }
}

export async function updatePayrollMatrix(req, res, next) {
  try {
    const validated = updatePayrollMatrixSchema.parse(req.body);
    const updated = await payrollService.updatePayrollMatrix(req.tenantPrisma, req.params.id, validated);
    return res.status(200).json({
      message: 'Matriz de liquidación actualizada exitosamente',
      data: updated,
    });
  } catch (err) {
    return next(err);
  }
}

export async function deletePayrollMatrix(req, res, next) {
  try {
    const deleted = await payrollService.deletePayrollMatrix(req.tenantPrisma, req.params.id);
    return res.status(200).json({
      message: 'Matriz de liquidación eliminada exitosamente',
      data: deleted,
    });
  } catch (err) {
    return next(err);
  }
}

// --- VALORES GLOBALES FIJOS (CONSTANTES DE LIQUIDACIÓN) ---

export async function getPayrollFixedValues(req, res, next) {
  try {
    const result = await payrollService.getPayrollFixedValues(req.tenantPrisma, req.query);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getPayrollFixedValueById(req, res, next) {
  try {
    const fixedValue = await payrollService.getPayrollFixedValueById(req.tenantPrisma, req.params.id);
    return res.status(200).json({ data: fixedValue });
  } catch (err) {
    return next(err);
  }
}

export async function createPayrollFixedValue(req, res, next) {
  try {
    const validated = createPayrollFixedValueSchema.parse(req.body);
    const created = await payrollService.createPayrollFixedValue(req.tenantPrisma, validated);
    return res.status(201).json({
      message: 'Valor fijo registrado exitosamente',
      data: created,
    });
  } catch (err) {
    return next(err);
  }
}

export async function updatePayrollFixedValue(req, res, next) {
  try {
    const validated = updatePayrollFixedValueSchema.parse(req.body);
    const updated = await payrollService.updatePayrollFixedValue(req.tenantPrisma, req.params.id, validated);
    return res.status(200).json({
      message: 'Valor fijo actualizado exitosamente',
      data: updated,
    });
  } catch (err) {
    return next(err);
  }
}

export async function deletePayrollFixedValue(req, res, next) {
  try {
    const deleted = await payrollService.deletePayrollFixedValue(req.tenantPrisma, req.params.id);
    return res.status(200).json({
      message: 'Valor fijo eliminado exitosamente',
      data: deleted,
    });
  } catch (err) {
    return next(err);
  }
}

// --- NOVEDADES DE PERÍODO (NO PERSISTENTES) ---

export async function getPeriodNovelties(req, res, next) {
  try {
    const novelties = await payrollService.listPeriodNovelties(req.tenantPrisma, req.params.id, req.query);
    return res.status(200).json({ data: novelties });
  } catch (err) {
    return next(err);
  }
}

export async function upsertPeriodNovelty(req, res, next) {
  try {
    const validated = createPeriodNoveltySchema.parse(req.body);
    const result = await payrollService.upsertPeriodNovelty(req.tenantPrisma, req.params.id, validated);
    return res.status(200).json({
      message: 'Novedad guardada exitosamente',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

export async function deletePeriodNovelty(req, res, next) {
  try {
    const result = await payrollService.deletePeriodNovelty(req.tenantPrisma, req.params.id, req.params.noveltyId);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function batchPeriodNovelties(req, res, next) {
  try {
    const validated = batchPeriodNoveltiesSchema.parse(req.body);
    const result = await payrollService.batchUpsertPeriodNovelties(req.tenantPrisma, req.params.id, validated.items);
    return res.status(200).json({
      message: `Se guardaron ${result.savedCount} novedades correctamente`,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

// --- LIQUIDACIÓN INDIVIDUAL Y POR LOTE ---

export async function calculateSingleEmployee(req, res, next) {
  try {
    const result = await payrollService.calculateSingleEmployee(req.tenantPrisma, req.params.id, req.params.employeeId);
    return res.status(200).json({
      message: 'Colaborador liquidado exitosamente',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

export async function calculateBatchEmployees(req, res, next) {
  try {
    const validated = calculateBatchSchema.parse(req.body);
    const result = await payrollService.calculateBatchEmployees(req.tenantPrisma, req.params.id, validated.employeeIds);
    return res.status(200).json({
      message: `Liquidación procesada para ${result.processedEmployees} colaboradores`,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}



