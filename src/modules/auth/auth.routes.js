import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from './auth.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from './auth.validation.js';

const router = Router();

const createAuthLimiter = ({ windowMs, limit, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        message: 'Demasiados intentos de autenticación desde esta IP. Por favor, reintentá en unos minutos.',
        status: 429,
      },
    },
  });

const registerLimiter = createAuthLimiter({ windowMs: 60 * 60 * 1000, limit: 15 });
const loginLimiter = createAuthLimiter({ windowMs: 15 * 60 * 1000, limit: 20, skipSuccessfulRequests: true });
const refreshLimiter = createAuthLimiter({ windowMs: 15 * 60 * 1000, limit: 60 });

router.post('/register', registerLimiter, validate(registerSchema), authController.register);
router.post('/login', loginLimiter, validate(loginSchema), authController.login);
router.post('/refresh', refreshLimiter, validate(refreshTokenSchema), authController.refresh);
router.post('/logout', validate(refreshTokenSchema), authController.logout);
router.get('/me', authenticate, authController.me);

export default router;
