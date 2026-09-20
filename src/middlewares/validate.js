import { z } from 'zod';

/**
 * Middleware para validar datos de entrada (body, query, params) usando esquemas Zod.
 * @param {object|z.ZodType} schema - Objeto { body, query, params } o esquema Zod directo para el body.
 */
export function validate(schema) {
  return async (req, res, next) => {
    try {
      if (schema instanceof z.ZodType) {
        req.body = await schema.parseAsync(req.body);
        return next();
      }

      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      if (schema.query) {
        req.query = await schema.query.parseAsync(req.query);
      }
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params);
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
