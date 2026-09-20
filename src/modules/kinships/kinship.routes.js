import { Router } from 'express';
import * as kinshipController from './kinship.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { resolveTenant } from '../../middlewares/tenant.middleware.js';
import { requireCompanyRole } from '../../middlewares/rbac.middleware.js';
import {
  createKinshipSchema,
  updateKinshipSchema,
} from './kinship.validation.js';

const router = Router();

router.use(authenticate);
router.use(resolveTenant);

router.get('/kinships', kinshipController.listKinships);
router.get('/kinships/:id', kinshipController.getKinshipById);
router.post(
  '/kinships',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createKinshipSchema),
  kinshipController.createKinship
);
router.patch(
  '/kinships/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateKinshipSchema),
  kinshipController.updateKinship
);
router.delete(
  '/kinships/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  kinshipController.deleteKinship
);

export default router;
