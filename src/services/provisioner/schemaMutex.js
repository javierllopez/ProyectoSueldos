// Caché y mutex asíncrono en memoria para evitar sentencias DDL concurrentes y repetitivas por tenant
export const verifiedPersonnelClients = new WeakSet();
export const pendingPersonnelClients = new WeakMap();
export const verifiedPayrollClients = new WeakSet();
export const pendingPayrollClients = new WeakMap();
export const verifiedProfileClients = new WeakSet();
export const pendingProfileClients = new WeakMap();
export const verifiedIncomeTaxClients = new WeakSet();
export const pendingIncomeTaxClients = new WeakMap();
export const verifiedReportsClients = new WeakSet();
export const pendingReportsClients = new WeakMap();
export const verifiedDisciplinaryClients = new WeakSet();
export const pendingDisciplinaryClients = new WeakMap();

/**
 * Serializa la verificación DDL por cliente Prisma evitando ejecuciones paralelas en cold-start
 * y evitando cachear verificaciones fallidas.
 */
export async function ensureSchemaWithMutex(verifiedSet, pendingMap, tenantClient, force, workFn) {
  if (!tenantClient) return;
  if (!force && verifiedSet.has(tenantClient)) return;
  if (!force && pendingMap.has(tenantClient)) {
    return pendingMap.get(tenantClient);
  }

  const promise = (async () => {
    try {
      const ok = await workFn();
      if (ok !== false) {
        verifiedSet.add(tenantClient);
      }
    } finally {
      if (pendingMap.get(tenantClient) === promise) {
        pendingMap.delete(tenantClient);
      }
    }
  })();

  pendingMap.set(tenantClient, promise);
  return promise;
}
