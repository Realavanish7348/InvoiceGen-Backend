export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;
  readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
    this.isOperational = true;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function notFound(message = "Resource not found"): AppError {
  return new AppError(404, "NOT_FOUND", message);
}

export function unauthorized(
  code: string,
  message: string,
): AppError {
  return new AppError(401, code, message);
}

export function conflict(message: string): AppError {
  return new AppError(409, "CONFLICT", message);
}

export function forbidden(message = "Insufficient permissions"): AppError {
  return new AppError(403, "FORBIDDEN", message);
}

export function badRequest(
  message: string,
  code = "INVALID_REQUEST",
  fields?: Record<string, string[]>,
): AppError {
  return new AppError(400, code, message, fields);
}
