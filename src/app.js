import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import routes from './routes/index.js';
import errorHandler from './middlewares/errorHandler.js';
import env from './config/env.js';

import path from 'path';

const app = express();

// Seguridad con Helmet (permitiendo assets locales y fuentes)
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

// CORS
app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  })
);

// Parseo de cuerpo JSON y urlencoded (límite ampliado a 50MB para importaciones masivas y fotos)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir archivos estáticos del frontend y dependencias de Tabler y utilidades
app.use(express.static('public'));
app.use('/vendor/tabler', express.static(path.join(import.meta.dirname, '../node_modules/@tabler/core/dist')));
app.use('/vendor/tabler-icons', express.static(path.join(import.meta.dirname, '../node_modules/@tabler/icons-webfont/dist')));
app.use('/vendor/xlsx', express.static(path.join(import.meta.dirname, '../node_modules/xlsx/dist')));

// Montaje de rutas con prefijo versionado
app.use('/api/v1', routes);

// Manejo de 404 para rutas inexistentes
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
      status: 404,
    },
  });
});

// Middleware centralizado de errores (Express 5)
app.use(errorHandler);

export default app;
