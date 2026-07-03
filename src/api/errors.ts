export type ErrorDetails = Record<string, unknown>;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: ErrorDetails;

  constructor(code: string, message: string, status: number, details?: ErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: ErrorDetails) {
    super("VALIDATION_ERROR", message, 400, details);
    this.name = "ValidationError";
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  const message = errorMessage(error);
  if (isUniqueConstraintError(message)) {
    return new ApiError("DUPLICATE_RECORD", "A record with that unique value already exists", 409);
  }
  if (isForeignKeyConstraintError(message)) {
    return new ApiError("INVALID_REFERENCE", "A referenced record does not exist or is no longer available", 400);
  }

  return new ApiError("INTERNAL_ERROR", "Internal server error", 500);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function isUniqueConstraintError(message: string) {
  return /unique constraint failed/i.test(message);
}

function isForeignKeyConstraintError(message: string) {
  return /foreign key constraint failed/i.test(message);
}
