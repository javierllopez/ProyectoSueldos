import { PrismaClient as TenantPrismaClient } from '../generated/tenant-client/index.js';
import env from '../config/env.js';

class TenantConnectionManager {
  constructor(maxClients = 20) {
    this.maxClients = maxClients;
    /** @type {Map<string, { client: TenantPrismaClient, lastAccessed: number }>} */
    this.pool = new Map();
  }

  /**
   * Construye la URL de conexión a la base de datos del tenant en runtime.
   * @param {object} company - Datos de la empresa (dbName, dbHost, dbPort).
   * @returns {string} Connection string para MySQL/PostgreSQL.
   */
  buildConnectionString(company) {
    const user = encodeURIComponent(env.TENANT_DB_USER);
    const password = encodeURIComponent(env.TENANT_DB_PASSWORD);
    const host = company.dbHost || 'localhost';
    const port = company.dbPort || 3306;
    const dbName = company.dbName;

    return `mysql://${user}:${password}@${host}:${port}/${dbName}`;
  }

  /**
   * Obtiene o inicializa una instancia de PrismaClient para la empresa solicitada.
   * Utiliza una política LRU (Least Recently Used) con desconexión segura al desalojar.
   * @param {object} company - Registro de la empresa desde CompanyRegistry.
   * @returns {Promise<TenantPrismaClient>} Instancia de PrismaClient para el tenant.
   */
  async getTenantClient(company) {
    const { dbName } = company;

    // Si ya existe en el pool, refrescar timestamp y retornar
    if (this.pool.has(dbName)) {
      const entry = this.pool.get(dbName);
      entry.lastAccessed = Date.now();
      return entry.client;
    }

    // Si el pool alcanzó el límite, desalojar el más antiguo (LRU)
    if (this.pool.size >= this.maxClients) {
      await this.evictOldest();
    }

    const connectionUrl = this.buildConnectionString(company);

    const client = new TenantPrismaClient({
      datasources: {
        db: {
          url: connectionUrl,
        },
      },
      log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });

    await client.$connect();

    this.pool.set(dbName, {
      client,
      lastAccessed: Date.now(),
    });

    return client;
  }

  /**
   * Desaloja el cliente de tenant que lleva más tiempo sin usarse y cierra su socket.
   */
  async evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, value] of this.pool.entries()) {
      if (value.lastAccessed < oldestTime) {
        oldestTime = value.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.pool.get(oldestKey);
      this.pool.delete(oldestKey);
      try {
        await entry.client.$disconnect();
      } catch (err) {
        console.error(`Error al desconectar cliente tenant para ${oldestKey}:`, err);
      }
    }
  }

  /**
   * Desconecta todas las conexiones activas en el pool (ideal para graceful shutdown).
   */
  async disconnectAll() {
    for (const [key, value] of this.pool.entries()) {
      try {
        await value.client.$disconnect();
      } catch (err) {
        console.error(`Error cerrando conexión de tenant ${key}:`, err);
      }
    }
    this.pool.clear();
  }
}

const tenantConnectionManager = new TenantConnectionManager();
export default tenantConnectionManager;
