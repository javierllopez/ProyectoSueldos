import app from './app.js';
import env from './config/env.js';
import prisma from './config/prisma.js';
import tenantConnectionManager from './services/tenantConnectionManager.js';

async function bootstrap() {
  try {
    // 1. Probar conectividad con la base MASTER
    await prisma.$connect();
    console.log('✅ Conexión establecida exitosamente con la base MASTER');

    // 2. Levantar el servidor HTTP
    const server = app.listen(env.PORT, () => {
      console.log(`🚀 Servidor ejecutándose en http://localhost:${env.PORT}`);
      console.log(`📡 Endpoints disponibles bajo http://localhost:${env.PORT}/api/v1`);
      console.log(`🌍 Entorno: ${env.NODE_ENV}`);
    });

    // 3. Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n🛑 Recibida señal ${signal}. Cerrando servidor limpiamente...`);
      server.close(async () => {
        try {
          await tenantConnectionManager.disconnectAll();
          await prisma.$disconnect();
          console.log('🔌 Conexiones de base de datos cerradas con éxito.');
          process.exit(0);
        } catch (err) {
          console.error('Error durante el cierre:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // 4. Manejadores globales para resiliencia del proceso Node.js
    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Promesa rechazada no capturada (unhandledRejection):', promise, 'Motivo:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('💥 Excepción no capturada crítica (uncaughtException):', error);
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

bootstrap();
