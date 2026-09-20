import { Router } from 'express';
import * as employeeController from './employee.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { resolveTenant } from '../../middlewares/tenant.middleware.js';
import { requireCompanyRole } from '../../middlewares/rbac.middleware.js';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  createRelativeSchema,
  updateRelativeSchema,
  importEmployeesSchema,
  assignEmployeeConceptSchema,
  updateEmployeeConceptSchema,
  massWageIncreaseSchema,
} from './employee.validation.js';

const router = Router();

// Todas las rutas de empleados requieren autenticación y resolución de tenant activo
router.use(authenticate);
router.use(resolveTenant);

router.get('/', employeeController.list);

// Aumentos masivos / generalizados
router.post(
  ['/mass-wage-increase/preview', '/mass-increase/preview'],
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(massWageIncreaseSchema),
  employeeController.previewMassWageIncrease
);

router.post(
  ['/mass-wage-increase/apply', '/mass-increase/apply'],
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(massWageIncreaseSchema),
  employeeController.applyMassWageIncrease
);

// Asignación masiva de conceptos
router.post(
  '/mass-assign-concept',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  employeeController.massAssign
);

// Asignación inversa: Empleados por Concepto persistente
router.get('/by-concept/:conceptId', employeeController.listEmployeesByConcept);
router.post(
  '/by-concept/:conceptId',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  employeeController.assignEmployeesToConcept
);
router.delete(
  '/by-concept/:conceptId/:assignmentId',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  employeeController.removeEmployeeFromConcept
);

router.post(
  '/import',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(importEmployeesSchema),
  employeeController.importEmployees
);
router.get('/:id', employeeController.getById);

router.post(
  '/',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createEmployeeSchema),
  employeeController.create
);

router.patch(
  '/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateEmployeeSchema),
  employeeController.update
);

router.put(
  '/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateEmployeeSchema),
  employeeController.update
);

router.delete(
  '/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  employeeController.remove
);

// --- Rutas de Familiares de Empleados ---

router.get('/:id/relatives', employeeController.listRelatives);

router.post(
  '/:id/relatives',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createRelativeSchema),
  employeeController.createRelative
);

router.patch(
  '/:id/relatives/:relativeId',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateRelativeSchema),
  employeeController.updateRelative
);

router.delete(
  '/:id/relatives/:relativeId',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  employeeController.deleteRelative
);

// --- Rutas de Conceptos Fijos / Recurrentes de Empleados ---

router.get('/:id/concepts', employeeController.listConcepts);

router.post(
  '/:id/concepts',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(assignEmployeeConceptSchema),
  employeeController.assignConcept
);

router.patch(
  '/:id/concepts/:conceptAssignmentId',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateEmployeeConceptSchema),
  employeeController.updateConcept
);

router.delete(
  '/:id/concepts/:conceptAssignmentId',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  employeeController.removeConcept
);

export default router;
