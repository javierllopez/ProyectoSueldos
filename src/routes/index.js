import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import companyRoutes from '../modules/companies/company.routes.js';
import userRoutes from '../modules/users/user.routes.js';
import employeeRoutes from '../modules/employees/employee.routes.js';
import organizationRoutes from '../modules/organization/organization.routes.js';
import affiliationRoutes from '../modules/affiliations/affiliation.routes.js';
import kinshipRoutes from '../modules/kinships/kinship.routes.js';
import claeRoutes from '../modules/clae/clae.routes.js';
import payrollRoutes from '../modules/payroll/payroll.routes.js';

const router = Router();

// Estado y verificación de salud de la API
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'ProyectoSueldos API',
    version: '1.0.0',
  });
});

// Módulos de dominio
router.use('/auth', authRoutes);
router.use('/companies', companyRoutes);
router.use('/users', userRoutes);
router.use('/employees', employeeRoutes);
router.use('/clae', claeRoutes);
router.use('/payroll', payrollRoutes);
router.use('/', organizationRoutes);
router.use('/', affiliationRoutes);
router.use('/', kinshipRoutes);

export default router;
