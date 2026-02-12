import type { Request, Response, NextFunction } from 'express';
import type { APIResponse } from '../../../types/foundation';

// ---------------------------------------------------------------------------
// Custom Error Classes
// ---------------------------------------------------------------------------

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400);
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
  }
}

// ---------------------------------------------------------------------------
// Status code mapping for errors that are not subclasses of AppError
// ---------------------------------------------------------------------------

const ERROR_NAME_TO_STATUS: Record<string, number> = {
  ValidationError: 400,
  AuthError: 401,
  UnauthorizedError: 401,
  ForbiddenError: 403,
  NotFoundError: 404,
  ConflictError: 409,
  RateLimitError: 429,
};

function resolveStatusCode(err: Error & { statusCode?: number }): number {
  if (typeof err.statusCode === 'number' && err.statusCode >= 400) {
    return err.statusCode;
  }
  if (err.name in ERROR_NAME_TO_STATUS) {
    return ERROR_NAME_TO_STATUS[err.name];
  }
  return 500;
}

// ---------------------------------------------------------------------------
// Express Error Handler
// ---------------------------------------------------------------------------

/**
 * Central error-handling middleware.
 *
 * Maps known error classes to their HTTP status codes and returns
 * a standardised `APIResponse` envelope. Unknown / unexpected errors
 * are logged and returned as 500 without leaking stack traces in
 * production.
 */
export function errorHandler(
  err: Error & { statusCode?: number },
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = resolveStatusCode(err);
  const isServerError = statusCode >= 500;

  // Always log server errors; optionally log client errors in dev
  if (isServerError || process.env.NODE_ENV !== 'production') {
    console.error(
      `[ErrorHandler] ${statusCode} — ${err.message}`,
      isServerError ? err.stack : '',
    );
  }

  const body: APIResponse<null> = {
    success: false,
    data: null,
    error:
      isServerError && process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
  };

  res.status(statusCode).json(body);
}

// ---------------------------------------------------------------------------
// 404 catch-all (mount after all other routes)
// ---------------------------------------------------------------------------

/**
 * Middleware that returns a 404 for any unmatched route.
 * Mount this after all application routes, before the `errorHandler`.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
}
