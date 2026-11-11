import { Router } from 'express';
import * as reportsController from './reports.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { resolveTenant } from '../../middlewares/tenant.middleware.js';
import { requireCompanyRole } from '../../middlewares/rbac.middleware.js';
import {
  createTemplateSchema,
  updateTemplateSchema,
  executeReportSchema,
  exportReportSchema,
} from './reports.schema.js';

const router = Router();
const canOperate = requireCompanyRole('ADMIN', 'OPERATOR');

// Todas las rutas requieren sesión activa y tenant resuelto
router.use(authenticate);
router.use(resolveTenant);

// Catálogo de Metadatos
router.get('/metadata/fields', reportsController.getMetadata);
router.get('/metadata', reportsController.getMetadata);

// CRUD de Plantillas de Informes
router.get('/templates', reportsController.listTemplates);
router.get('/templates/:id', reportsController.getTemplateById);
router.post('/templates', canOperate, validate(createTemplateSchema), reportsController.createTemplate);
router.put('/templates/:id', canOperate, validate(updateTemplateSchema), reportsController.updateTemplate);
router.delete('/templates/:id', canOperate, reportsController.deleteTemplate);

// Ejecución y Emisión
router.post('/execute', validate(executeReportSchema), reportsController.executeReport);

// Exportación (Excel / PDF)
router.post('/export', validate(exportReportSchema), reportsController.exportReport);

export default router;

