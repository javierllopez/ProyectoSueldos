import { Router } from 'express';
import * as companyController from './company.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { resolveTenant } from '../../middlewares/tenant.middleware.js';
import { requireAccountRole, requireCompanyRole } from '../../middlewares/rbac.middleware.js';
import {
  createCompanySchema,
  updateCompanySchema,
  assignUserSchema,
} from './company.validation.js';
import { updateCompanyProfileSchema } from './profile.validation.js';

const router = Router();

// Todas las rutas de empresas requieren autenticación
router.use(authenticate);

// Rutas de ficha y configuración operativa de la empresa activa (Tenant)
router.get('/profile', resolveTenant, companyController.getProfile);
router.put(
  '/profile',
  resolveTenant,
  requireAccountRole('OWNER'),
  validate(updateCompanyProfileSchema),
  companyController.updateProfile
);

router.get('/', companyController.list);
router.get('/:id', companyController.getById);

// Rutas de administración (crear, modificar, borrar empresa y asignar usuarios) - Solo OWNER
router.post(
  '/',
  requireAccountRole('OWNER'),
  validate(createCompanySchema),
  companyController.create
);

router.patch(
  '/:id',
  requireAccountRole('OWNER'),
  validate(updateCompanySchema),
  companyController.update
);

router.delete(
  '/:id',
  requireAccountRole('OWNER'),
  companyController.remove
);

router.post(
  '/:id/users',
  requireAccountRole('OWNER', 'ADMIN'),
  validate(assignUserSchema),
  companyController.assignUser
);

router.delete(
  '/:id/users/:userId',
  requireAccountRole('OWNER', 'ADMIN'),
  companyController.removeUser
);

export default router;
