import { Router } from 'express';
import * as organizationController from './organization.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { resolveTenant } from '../../middlewares/tenant.middleware.js';
import { requireCompanyRole } from '../../middlewares/rbac.middleware.js';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  importDepartmentsSchema,
  createJobPositionSchema,
  updateJobPositionSchema,
  importJobPositionsSchema,
} from './organization.validation.js';

const router = Router();

router.use(authenticate);
router.use(resolveTenant);

// --- Rutas de Sectores ---
router.get('/departments', organizationController.listDepartments);
router.post(
  '/departments/import',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(importDepartmentsSchema),
  organizationController.importDepartments
);
router.get('/departments/:id', organizationController.getDepartmentById);
router.post(
  '/departments',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createDepartmentSchema),
  organizationController.createDepartment
);
router.patch(
  '/departments/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateDepartmentSchema),
  organizationController.updateDepartment
);
router.delete(
  '/departments/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  organizationController.deleteDepartment
);

// --- Rutas de Puestos de Trabajo ---
router.get('/job-positions', organizationController.listJobPositions);
router.post(
  '/job-positions/import',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(importJobPositionsSchema),
  organizationController.importJobPositions
);
router.get('/job-positions/:id', organizationController.getJobPositionById);
router.post(
  '/job-positions',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createJobPositionSchema),
  organizationController.createJobPosition
);
router.patch(
  '/job-positions/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateJobPositionSchema),
  organizationController.updateJobPosition
);
router.delete(
  '/job-positions/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  organizationController.deleteJobPosition
);

// --- Rutas de Catálogos Oficiales ARCA ---
router.get('/arca-ccts', organizationController.listArcaCcts);
router.get('/arca-categories', organizationController.listArcaCategories);
router.get('/arca-positions', organizationController.listArcaPositions);
router.get('/arca-service-types', organizationController.listArcaServiceTypes);
router.get('/arca-contract-modalities', organizationController.listArcaContractModalities);

export default router;
