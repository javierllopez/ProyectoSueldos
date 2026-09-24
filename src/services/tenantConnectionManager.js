import { PrismaClient as TenantPrismaClient } from '../generated/tenant-client/index.js';
import env from '../config/env.js';

class TenantConnectionManager {
  constructor(maxClients = 20) {
    this.maxClients = maxClients;
    /** @type {Map<string, { client: TenantPrismaClient, lastAccessed: number, inUseCount: number }>} */
    this.pool = new Map();
    /** @type {Map<string, Promise<TenantPrismaClient>>} */
    this.pendingConnections = new Map();
  }

  /**
   * Construye la URL de conexión a la base de datos del tenant en runtime.
   * Agrega parámetros de pool para prevenir agotamiento de conexiones en MySQL.
   * @param {object} company - Datos de la empresa (dbName, dbHost, dbPort).
   * @returns {string} Connection string para MySQL.
   */
  buildConnectionString(company) {
    const user = encodeURIComponent(env.TENANT_DB_USER);
    const password = encodeURIComponent(env.TENANT_DB_PASSWORD);
    const host = company.dbHost || 'localhost';
    const port = company.dbPort || 3306;
    const dbName = company.dbName;

    return `mysql://${user}:${password}@${host}:${port}/${dbName}?connection_limit=5&pool_timeout=15`;
  }

  /**
   * Obtiene o inicializa una instancia de PrismaClient para la empresa solicitada.
   * Utiliza Mutex con Promesas para evitar condiciones de carrera y política LRU segura.
   * @param {object} company - Registro de la empresa desde CompanyRegistry.
   * @returns {Promise<TenantPrismaClient>} Instancia de PrismaClient para el tenant.
   */
  async getTenantClient(company) {
    const { dbName } = company;

    // 1. Si ya existe en el pool, refrescar timestamp, incrementar uso y retornar
    if (this.pool.has(dbName)) {
      const entry = this.pool.get(dbName);
      entry.lastAccessed = Date.now();
      entry.inUseCount++;
      return entry.client;
    }

    // 2. Si ya hay una inicialización en curso para este tenant (race condition), esperar la misma promesa
    if (this.pendingConnections.has(dbName)) {
      const client = await this.pendingConnections.get(dbName);
      const entry = this.pool.get(dbName);
      if (entry) {
        entry.lastAccessed = Date.now();
        entry.inUseCount++;
      }
      return client;
    }

    // 3. Crear promesa atómica de inicialización
    const connectionPromise = (async () => {
      // Si el pool alcanzó el límite, desalojar el más antiguo que NO esté en uso
      if (this.pool.size >= this.maxClients) {
        await this.evictOldestIdle();
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
        inUseCount: 1,
      });

      return client;
    })();

    this.pendingConnections.set(dbName, connectionPromise);

    try {
      return await connectionPromise;
    } finally {
      this.pendingConnections.delete(dbName);
    }
  }

  /**
   * Libera una referencia de uso del cliente tenant cuando termina una petición HTTP.
   * @param {string} dbName - Nombre de la base de datos del tenant.
   */
  releaseClient(dbName) {
    if (dbName && this.pool.has(dbName)) {
      const entry = this.pool.get(dbName);
      entry.inUseCount = Math.max(0, entry.inUseCount - 1);
      entry.lastAccessed = Date.now();
    }
  }

  /**
   * Desaloja únicamente el cliente tenant más antiguo que esté INACTIVO (inUseCount === 0),
   * garantizando que nunca se interrumpa una transacción o consulta activa en vuelo.
   */
  async evictOldestIdle() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, value] of this.pool.entries()) {
      if (value.inUseCount === 0 && value.lastAccessed < oldestTime) {
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
        console.error(`Error al desconectar cliente tenant inactivo para ${oldestKey}:`, err);
      }
    }
  }

  /**
   * Desconecta todas las conexiones activas en el pool (para graceful shutdown).
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
    this.pendingConnections.clear();
  }
}

const tenantConnectionManager = new TenantConnectionManager();
export default tenantConnectionManager;
