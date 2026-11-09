import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { resolveTenant } from '../../middlewares/tenant.middleware.js';
import * as disciplinaryController from './disciplinary.controller.js';

const router = Router();

router.use(authenticate, resolveTenant);

// 1. ABM de Tipos de Incidentes
router.get('/incident-types', disciplinaryController.getIncidentTypes);
router.post('/incident-types', disciplinaryController.createIncidentType);
router.put('/incident-types/:id', disciplinaryController.updateIncidentType);
router.patch('/incident-types/:id', disciplinaryController.updateIncidentType);
router.delete('/incident-types/:id', disciplinaryController.deleteIncidentType);

// 2. ABM de Tipos de Sanciones
router.get('/sanction-types', disciplinaryController.getSanctionTypes);
router.post('/sanction-types', disciplinaryController.createSanctionType);
router.put('/sanction-types/:id', disciplinaryController.updateSanctionType);
router.patch('/sanction-types/:id', disciplinaryController.updateSanctionType);
router.delete('/sanction-types/:id', disciplinaryController.deleteSanctionType);

// 3. Novedades: Registro de Incidentes
router.get('/incidents', disciplinaryController.getIncidents);
router.post('/incidents', disciplinaryController.createIncident);
router.put('/incidents/:id', disciplinaryController.updateIncident);
router.patch('/incidents/:id', disciplinaryController.updateIncident);
router.delete('/incidents/:id', disciplinaryController.deleteIncident);

// 4. Novedades: Registro de Sanciones
router.get('/sanctions', disciplinaryController.getSanctions);
router.post('/sanctions', disciplinaryController.createSanction);
router.put('/sanctions/:id', disciplinaryController.updateSanction);
router.patch('/sanctions/:id', disciplinaryController.updateSanction);
router.delete('/sanctions/:id', disciplinaryController.deleteSanction);

// 5. Historial por Empleado y PDF A4
router.get('/employees/:employeeId/history', disciplinaryController.getEmployeeHistory);
router.get('/employees/:employeeId/history/pdf', disciplinaryController.downloadEmployeeHistoryPdf);

// 6. Emisión y Exportación PDF A4 de Informes (1 al 4)
router.post('/reports/execute', disciplinaryController.executeReport);
router.post('/reports/export/pdf', disciplinaryController.exportReportPdf);

export default router;
