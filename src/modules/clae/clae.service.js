import prisma from '../../config/prisma.js';

/**
 * Consulta y busca actividades económicas CLAE (AFIP/ARCA).
 * @param {object} options
 * @param {string} [options.q] - Término de búsqueda (código numérico o palabras de la actividad).
 * @param {number} [options.limit=100] - Cantidad máxima de resultados a retornar.
 * @param {number} [options.page=1] - Página de resultados.
 */
export async function listClaeActivities({ q = '', limit = 100, page = 1 } = {}) {
  const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 1000);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

  const where = {};
  const query = (q || '').trim();

  if (query) {
    where.OR = [
      { code: { contains: query } },
      { description: { contains: query } },
      { groupDesc: { contains: query } },
      { divisionDesc: { contains: query } },
      { sectionDesc: { contains: query } },
    ];
  }

  const [activities, total] = await Promise.all([
    prisma.claeActivity.findMany({
      where,
      skip,
      take,
      orderBy: { code: 'asc' },
    }),
    prisma.claeActivity.count({ where }),
  ]);

  return {
    data: activities,
    meta: {
      total,
      page,
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}

/**
 * Obtiene una actividad CLAE puntual por código de 6 dígitos.
 * @param {string} code
 */
export async function getClaeByCode(code) {
  const cleanCode = (code || '').trim();
  const activity = await prisma.claeActivity.findUnique({
    where: { code: cleanCode },
  });

  if (!activity) {
    const error = new Error(`Actividad económica con código ${code} no encontrada`);
    error.status = 404;
    throw error;
  }

  return activity;
}
