/**
 * Normaliza una fecha al mediodía UTC (12:00:00Z) preservando el día calendario
 * para evitar corrimientos de -1 día en zonas horarias negativas (ej. UTC-3 Argentina).
 */
export function normalizeUtcNoonDate(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return new Date(`${match[1]}T12:00:00.000Z`);
  }
  const dateObj = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateObj.getTime())) return null;
  const isoDate = dateObj.toISOString().slice(0, 10);
  return new Date(`${isoDate}T12:00:00.000Z`);
}

