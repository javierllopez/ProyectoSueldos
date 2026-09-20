import { Router } from 'express';
import * as userController from './user.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requireAccountRole } from '../../middlewares/rbac.middleware.js';
import {
  createUserSchema,
  updateUserSchema,
} from './user.validation.js';

const router = Router();

// Todas las rutas de usuarios requieren autenticación y rol administrativo en la cuenta
router.use(authenticate);
router.use(requireAccountRole('OWNER', 'ADMIN'));

router.get('/', userController.list);
router.get('/:id', userController.getById);
router.post('/', validate(createUserSchema), userController.create);
router.patch('/:id', validate(updateUserSchema), userController.update);
router.delete('/:id', userController.remove);

export default router;
