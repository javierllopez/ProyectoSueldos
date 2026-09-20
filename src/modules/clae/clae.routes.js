import { Router } from 'express';
import * as claeController from './clae.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';

const router = Router();

// Consultar el catálogo de actividades CLAE requiere autenticación de usuario
router.use(authenticate);

router.get('/', claeController.list);
router.get('/:code', claeController.getByCode);

export default router;
