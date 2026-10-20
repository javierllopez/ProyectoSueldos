import { Router } from 'express';
import * as embargoController from './embargo.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { resolveTenant } from '../../middlewares/tenant.middleware.js';
import { requireCompanyRole } from '../../middlewares/rbac.middleware.js';
import { createEmbargoSchema, updateEmbargoSchema } from './embargo.validation.js';

const router = Router();

router.use(authenticate);
router.use(resolveTenant);

router.get('/', embargoController.list);
router.get('/:id', embargoController.getById);
router.get('/:id/history', embargoController.getHistory);

router.post(
  '/',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(createEmbargoSchema),
  embargoController.create
);

router.put(
  '/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  validate(updateEmbargoSchema),
  embargoController.update
);

router.delete(
  '/:id',
  requireCompanyRole('ADMIN', 'OPERATOR'),
  embargoController.remove
);

export default router;
