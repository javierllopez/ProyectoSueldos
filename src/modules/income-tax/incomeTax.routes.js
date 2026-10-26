import { Router } from 'express';
import * as incomeTaxController from './incomeTax.controller.js';
import * as incomeTaxTableController from './incomeTaxTable.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { resolveTenant } from '../../middlewares/tenant.middleware.js';
import { requireCompanyRole } from '../../middlewares/rbac.middleware.js';
import {
  calculateSettlementSchema,
  exportToPayrollSchema,
  createEmployeeDeductionSchema,
  createEmployeeOtherIncomeSchema,
  createEmployeePaymentOnAccountSchema,
  importSiradigSchema,
  generateF1359Schema,
} from './incomeTax.validation.js';
import {
  updateIncomeTaxTableSchema,
  updateIncomeTaxScaleSchema,
  updateGeneralDeductionLimitSchema,
  cloneAndAdjustYearSchema,
} from './incomeTaxTable.validation.js';

const router = Router();

// Todas las rutas requieren usuario autenticado y tenant resuelto
router.use(authenticate);
router.use(resolveTenant);

// --- TABLAS IMPOSITIVAS (ART. 30, ART. 94, LÍMITES GENERALES, AJUSTE IPC) ---
router.get('/tables', incomeTaxTableController.listTables);
router.get('/tables/:year/:month', incomeTaxTableController.getTableByPeriod);
router.patch(
  '/tables/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateIncomeTaxTableSchema),
  incomeTaxTableController.updateTable
);

router.get('/scales', incomeTaxTableController.listScales);
router.patch(
  '/scales/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateIncomeTaxScaleSchema),
  incomeTaxTableController.updateScale
);

router.get('/limits', incomeTaxTableController.listLimits);
router.patch(
  '/limits/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateGeneralDeductionLimitSchema),
  incomeTaxTableController.updateLimit
);

router.post(
  '/clone-adjust',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(cloneAndAdjustYearSchema),
  incomeTaxTableController.cloneAndAdjust
);

// --- LIQUIDACIONES MENSUALES DE GANANCIAS ---
router.get('/settlements', incomeTaxController.listSettlements);
router.get('/settlements/:id', incomeTaxController.getSettlementById);
router.post(
  '/settlements/calculate',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(calculateSettlementSchema),
  incomeTaxController.calculateSettlement
);
router.post(
  '/settlements/:id/export-to-payroll',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(exportToPayrollSchema),
  incomeTaxController.exportToPayroll
);

// --- LEGAJO FISCAL DEL EMPLEADO (360°) ---
router.get('/employees/:employeeId/tax-profile', incomeTaxController.getEmployeeTaxProfile);
router.get('/employees/:employeeId/profile', incomeTaxController.getEmployeeTaxProfile);
router.post(
  '/employees/:employeeId/deductions',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createEmployeeDeductionSchema),
  incomeTaxController.createEmployeeDeduction
);
router.delete(
  '/employees/:employeeId/deductions/:deductionId',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  incomeTaxController.deleteEmployeeDeduction
);

router.post(
  '/employees/:employeeId/other-incomes',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createEmployeeOtherIncomeSchema),
  incomeTaxController.createEmployeeOtherIncome
);
router.delete(
  '/employees/:employeeId/other-incomes/:otherIncomeId',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  incomeTaxController.deleteEmployeeOtherIncome
);

router.post(
  '/employees/:employeeId/payments-on-account',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createEmployeePaymentOnAccountSchema),
  incomeTaxController.createEmployeePaymentOnAccount
);
router.delete(
  '/employees/:employeeId/payments-on-account/:paymentId',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  incomeTaxController.deleteEmployeePaymentOnAccount
);

// --- SIRADIG (F. 572 WEB) ---
router.post(
  '/siradig/preview',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(importSiradigSchema),
  incomeTaxController.previewSiradig
);
router.post(
  '/siradig/import',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(importSiradigSchema),
  incomeTaxController.importSiradig
);
router.get('/siradig/imports', incomeTaxController.listSiradigImports);

// --- LIQUIDACIÓN ANUAL Y EXPORTACIÓN F.1359 ---
router.post(
  '/annual/calculate',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  incomeTaxController.calculateAnnual
);
router.post(
  '/f1359/export',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(generateF1359Schema),
  incomeTaxController.exportF1359
);

export default router;
