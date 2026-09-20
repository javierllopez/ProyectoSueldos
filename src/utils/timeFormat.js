/**
 * Utilidades para conversión y validación de horas en formato horario HH:MM
 * y decimal para almacenamiento en base de datos.
 */

/**
 * Valida si un string tiene formato HH:MM (permite hasta 3 dígitos de horas y minutos entre 00 y 59)
 * @param {string} val
 * @returns {boolean}
 */
export function isValidTimeFormat(val) {
  if (val === null || val === undefined) return false;
  const str = String(val).trim();
  return /^\d{1,3}:[0-5]\d$/.test(str);
}

/**
 * Convierte un string en formato "HH:MM" (o un número existente) a número decimal de horas con hasta 2 decimales.
 * Ej: "44:30" -> 44.50, "48:00" -> 48.00, "200:00" -> 200.00, "20:15" -> 20.25
 * @param {string|number|null} val
 * @param {number|null} [defaultValue=null]
 * @returns {number|null}
 */
export function hoursToDecimal(val, defaultValue = null) {
  if (val === null || val === undefined || val === '') return defaultValue;
  if (typeof val === 'number') return Math.round(val * 100) / 100;
  const str = String(val).trim();
  if (isValidTimeFormat(str)) {
    const [h, m] = str.split(':').map(Number);
    return Math.round((h + m / 60) * 100) / 100;
  }
  const parsed = parseFloat(str);
  return !isNaN(parsed) ? Math.round(parsed * 100) / 100 : defaultValue;
}

/**
 * Convierte un número decimal de horas a un string en formato horario "HH:MM".
 * Ej: 44.50 -> "44:30", 48 -> "48:00", 200 -> "200:00", 20.25 -> "20:15"
 * @param {number|string|null} val
 * @param {string} [defaultValue="00:00"]
 * @returns {string}
 */
export function decimalToHours(val, defaultValue = '00:00') {
  if (val === null || val === undefined || val === '') return defaultValue;
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num) || num < 0) return defaultValue;

  const totalMinutes = Math.round(num * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const formattedHours = hours < 10 ? `0${hours}` : `${hours}`;
  const formattedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;

  return `${formattedHours}:${formattedMinutes}`;
}
