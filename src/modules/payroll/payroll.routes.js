import { Router } from 'express';
import * as payrollController from './payroll.controller.js';
import * as salaryScaleController from './salaryScale.controller.js';
import { validate } from '../../middlewares/validate.js';
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

// --- Períodos / Liquidaciones ---
router.get('/periods', payrollController.getPeriods);
router.post('/periods', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.createPeriod);
router.get('/periods/:id', payrollController.getPeriodById);
router.patch('/periods/:id', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.updatePeriod);
router.post('/periods/:id/close', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.closePeriod);
router.delete('/periods/:id', requireCompanyRole('ADMIN'), payrollController.deletePeriod);

// --- Novedades de Período (No Persistentes) ---
router.get('/periods/:id/novelties', payrollController.getPeriodNovelties);
router.post('/periods/:id/novelties', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.upsertPeriodNovelty);
router.delete('/periods/:id/novelties/:noveltyId', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.deletePeriodNovelty);
router.post('/periods/:id/novelties/batch', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.batchPeriodNovelties);

// --- Cálculo de Nómina / Liquidación (General, Individual y Lote) ---
router.post('/periods/:id/calculate', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.calculatePeriod);
router.post('/periods/:id/calculate-single/:employeeId', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.calculateSingleEmployee);
router.post('/periods/:id/calculate-batch', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.calculateBatchEmployees);

// --- Recibos de Sueldo ---
router.get('/periods/:periodId/slips', payrollController.getPaySlips);
router.get('/slips/:slipId', payrollController.getPaySlipDetail);

// --- Parámetros y Alícuotas Patronales ---
router.get('/settings', payrollController.getPayrollSettings);
router.patch('/settings', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.updatePayrollSettings);

// --- Catálogo y Fórmulas de Conceptos ---
router.get('/concepts', payrollController.getConcepts);
router.post('/concepts', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.createConcept);
router.post('/concepts/validate-formula', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.validateFormula);
router.patch('/concepts/:id', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.updateConcept);
router.delete('/concepts/:id', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.deleteConcept);

// --- Matrices de Liquidación (Lookup Matrices) ---
router.get('/matrices', payrollController.getPayrollMatrices);
router.post('/matrices', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.createPayrollMatrix);
router.get('/matrices/:id', payrollController.getPayrollMatrixById);
router.patch('/matrices/:id', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.updatePayrollMatrix);
router.delete('/matrices/:id', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.deletePayrollMatrix);

// --- Valores Globales Fijos (Constantes de Liquidación) ---
router.get('/fixed-values', payrollController.getPayrollFixedValues);
router.post('/fixed-values', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.createPayrollFixedValue);
router.get('/fixed-values/:id', payrollController.getPayrollFixedValueById);
router.patch('/fixed-values/:id', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.updatePayrollFixedValue);
router.delete('/fixed-values/:id', requireCompanyRole('ADMIN', 'OPERATOR'), payrollController.deletePayrollFixedValue);

// --- Nóminas y Escalas Salariales (Sueldos Básicos) ---
router.get('/salary-scales', salaryScaleController.list);
router.post(
  '/salary-scales',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createSalaryScaleSchema),
  salaryScaleController.create
);
router.get('/salary-scales/:id', salaryScaleController.getById);
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

export default router;
