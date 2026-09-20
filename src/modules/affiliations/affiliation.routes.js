import { Router } from 'express';
import * as affiliationController from './affiliation.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { resolveTenant } from '../../middlewares/tenant.middleware.js';
import { requireCompanyRole } from '../../middlewares/rbac.middleware.js';
import {
  createHealthInsuranceSchema,
  updateHealthInsuranceSchema,
  createUnionSchema,
  updateUnionSchema,
  createMutualSchema,
  updateMutualSchema,
} from './affiliation.validation.js';

const router = Router();

router.use(authenticate);
router.use(resolveTenant);

// --- Rutas de Obras Sociales ---
router.get('/health-insurances', affiliationController.listHealthInsurances);
router.get('/health-insurances/:id', affiliationController.getHealthInsuranceById);
router.post(
  '/health-insurances',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createHealthInsuranceSchema),
  affiliationController.createHealthInsurance
);
router.patch(
  '/health-insurances/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateHealthInsuranceSchema),
  affiliationController.updateHealthInsurance
);
router.delete(
  '/health-insurances/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  affiliationController.deleteHealthInsurance
);

// --- Rutas de Sindicatos ---
router.get('/unions', affiliationController.listUnions);
router.get('/unions/:id', affiliationController.getUnionById);
router.post(
  '/unions',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createUnionSchema),
  affiliationController.createUnion
);
router.patch(
  '/unions/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateUnionSchema),
  affiliationController.updateUnion
);
router.delete(
  '/unions/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  affiliationController.deleteUnion
);

// --- Rutas de Mutuales ---
router.get('/mutuals', affiliationController.listMutuals);
router.get('/mutuals/:id', affiliationController.getMutualById);
router.post(
  '/mutuals',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createMutualSchema),
  affiliationController.createMutual
);
router.patch(
  '/mutuals/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateMutualSchema),
  affiliationController.updateMutual
);
router.delete(
  '/mutuals/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  affiliationController.deleteMutual
);

export default router;
