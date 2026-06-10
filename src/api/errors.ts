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

  return new ApiError("INTERNAL_ERROR", "Internal server error", 500);
}
