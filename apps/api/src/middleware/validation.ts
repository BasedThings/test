import type { RequestHandler } from 'express';
import { z } from 'zod';

export function validateQuery<T extends z.ZodType>(
  schema: T
): RequestHandler<unknown, unknown, unknown, z.infer<T>> {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.query = result.data;
    next();
  };
}

export function validateBody<T extends z.ZodType>(
  schema: T
): RequestHandler<unknown, unknown, z.infer<T>> {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateParams<T extends z.ZodType>(
  schema: T
): RequestHandler<z.infer<T>> {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.params = result.data;
    next();
  };
}
