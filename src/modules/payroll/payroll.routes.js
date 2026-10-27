import { Router } from 'express';
import * as payrollController from './payroll.controller.js';
import * as salaryScaleController from './salaryScale.controller.js';
import { validate } from '../../middlewares/validate.js';
import {
  createFiscalPeriodSchema,
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
  batchPeriodNoveltiesSchema,
  calculateBatchSchema,
  updatePaySlipWorkedDaysSchema,
} from './payroll.validation.js';
import {
  createSalaryScaleSchema,
  updateSalaryScaleSchema,
  massScaleIncreaseSchema,
} from './salaryScale.validation.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { resolveTenant } from '../../middlewares/tenant.middleware.js';
import { requireCompanyRole } from '../../middlewares/rbac.middleware.js';

const router = Router();

// Todas las rutas de liquidación requieren autenticación y resolución de tenant activo
router.use(authenticate);
router.use(resolveTenant);

// --- Períodos Fiscales (Mensuales) ---
router.get('/fiscal-periods', payrollController.listFiscalPeriods);
router.get('/fiscal-periods/active', payrollController.getActiveFiscalPeriod);
router.post(
  '/fiscal-periods',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createFiscalPeriodSchema),
  payrollController.createFiscalPeriod
);
router.post(
  '/fiscal-periods/:id/close',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  payrollController.closeFiscalPeriod
);

// --- Liquidaciones Individuales ---
router.get('/periods', payrollController.getPeriods);
router.post(
  '/periods',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createPeriodSchema),
  payrollController.createPeriod
);
router.get('/periods/:id', payrollController.getPeriodById);
router.patch(
  '/periods/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createPeriodSchema.partial()),
  payrollController.updatePeriod
);
router.post(
  '/periods/:id/close',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  payrollController.closePeriod
);
router.delete(
  '/periods/:id',
  requireCompanyRole('ADMIN'),
  payrollController.deletePeriod
);
router.get('/periods/:id/summary', payrollController.getPeriodConceptsSummary);

// --- Novedades de Período (No Persistentes) ---
router.get('/periods/:id/novelties', payrollController.getPeriodNovelties);
router.post(
  '/periods/:id/novelties',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createPeriodNoveltySchema),
  payrollController.upsertPeriodNovelty
);
router.delete(
  '/periods/:id/novelties/:noveltyId',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  payrollController.deletePeriodNovelty
);
router.post(
  '/periods/:id/novelties/batch',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(batchPeriodNoveltiesSchema),
  payrollController.batchPeriodNovelties
);

// --- Cálculo de Nómina / Liquidación (General, Individual y Lote) ---
router.post(
  '/periods/:id/calculate',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(calculatePeriodSchema),
  payrollController.calculatePeriod
);
router.post(
  '/periods/:id/calculate-single/:employeeId',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  payrollController.calculateSingleEmployee
);
router.post(
  '/periods/:id/calculate-batch',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(calculateBatchSchema),
  payrollController.calculateBatchEmployees
);

// --- Recibos de Sueldo ---
router.get('/periods/:periodId/slips', payrollController.getPaySlips);
router.get('/periods/:periodId/slips-batch-print', payrollController.getBatchPaySlipsForPrint);
router.get('/slips/:slipId', payrollController.getPaySlipDetail);
router.patch(
  '/slips/:slipId/worked-days',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updatePaySlipWorkedDaysSchema),
  payrollController.updatePaySlipWorkedDays
);
router.delete(
  '/slips/:slipId',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  payrollController.deletePaySlip
);

// --- Parámetros y Alícuotas Patronales ---
router.get('/settings', payrollController.getPayrollSettings);
router.patch(
  '/settings',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateSettingsSchema),
  payrollController.updatePayrollSettings
);

// --- Catálogo y Fórmulas de Conceptos ---
router.get('/concepts', payrollController.getConcepts);
router.post(
  '/concepts',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createConceptSchema),
  payrollController.createConcept
);
router.post(
  '/concepts/validate-formula',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  payrollController.validateFormula
);
router.put(
  '/concepts/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateConceptSchema),
  payrollController.updateConcept
);
router.patch(
  '/concepts/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateConceptSchema),
  payrollController.updateConcept
);
router.delete(
  '/concepts/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  payrollController.deleteConcept
);

// --- Matrices de Liquidación (Lookup Matrices) ---
router.get('/matrices', payrollController.getPayrollMatrices);
router.post(
  '/matrices',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createPayrollMatrixSchema),
  payrollController.createPayrollMatrix
);
router.get('/matrices/:id', payrollController.getPayrollMatrixById);
router.put(
  '/matrices/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updatePayrollMatrixSchema),
  payrollController.updatePayrollMatrix
);
router.patch(
  '/matrices/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updatePayrollMatrixSchema),
  payrollController.updatePayrollMatrix
);
router.delete(
  '/matrices/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  payrollController.deletePayrollMatrix
);

// --- Valores Globales Fijos (Constantes de Liquidación) ---
router.get('/fixed-values', payrollController.getPayrollFixedValues);
router.post(
  '/fixed-values',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createPayrollFixedValueSchema),
  payrollController.createPayrollFixedValue
);
router.get('/fixed-values/:id', payrollController.getPayrollFixedValueById);
router.put(
  '/fixed-values/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updatePayrollFixedValueSchema),
  payrollController.updatePayrollFixedValue
);
router.patch(
  '/fixed-values/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updatePayrollFixedValueSchema),
  payrollController.updatePayrollFixedValue
);
router.delete(
  '/fixed-values/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  payrollController.deletePayrollFixedValue
);

// --- Nóminas y Escalas Salariales (Sueldos Básicos) ---
router.get('/salary-scales', salaryScaleController.list);
router.post(
  '/salary-scales',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createSalaryScaleSchema),
  salaryScaleController.create
);
router.get('/salary-scales/:id', salaryScaleController.getById);
router.put(
  '/salary-scales/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateSalaryScaleSchema),
  salaryScaleController.update
);
router.patch(
  '/salary-scales/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateSalaryScaleSchema),
  salaryScaleController.update
);
router.delete(
  '/salary-scales/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  salaryScaleController.remove
);
router.post(
  '/salary-scales/mass-increase/preview',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(massScaleIncreaseSchema),
  salaryScaleController.previewMassIncrease
);
router.post(
  '/salary-scales/mass-increase/apply',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(massScaleIncreaseSchema),
  salaryScaleController.applyMassIncrease
);

// --- Exportación y Validación Libro de Sueldos Digital (ARCA) ---
router.get('/lsd/concepts', payrollController.exportLsdConcepts);
router.get('/periods/:periodId/lsd/payroll', payrollController.exportLsdPayroll);
router.get('/periods/:periodId/lsd/validate', payrollController.validateLsd);

// --- Libro de Sueldos Digital Unificado Mensual (ARCA) ---
router.get('/lsd/monthly-periods', payrollController.getMonthlyLsdPeriods);
router.get('/lsd/monthly/:year/:month/preview', payrollController.getMonthlyLsdPreview);
router.get('/lsd/monthly/:year/:month/validate', payrollController.validateMonthlyLsd);
router.get('/lsd/monthly/:year/:month/export', payrollController.exportMonthlyLsdPayroll);

export default router;
