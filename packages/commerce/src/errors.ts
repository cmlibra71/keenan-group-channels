/**
 * Base API Error class following BigCommerce error format.
 * Framework-agnostic - no Next.js dependencies.
 */
export class ApiError extends Error {
  status: number;
  title: string;
  detail: string;
  errors?: Record<string, string>;
  code: string;

  constructor(
    status: number,
    title: string,
    detail: string,
    errors?: Record<string, string>
  ) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.errors = errors;
    this.code = this.getCodeFromStatus(status);
  }

  private getCodeFromStatus(status: number): string {
    switch (status) {
      case 400: return "BAD_REQUEST";
      case 401: return "UNAUTHORIZED";
      case 403: return "FORBIDDEN";
      case 404: return "NOT_FOUND";
      case 409: return "CONFLICT";
      case 422: return "UNPROCESSABLE_ENTITY";
      case 429: return "RATE_LIMITED";
      default: return "INTERNAL_ERROR";
    }
  }

  toJSON() {
    return {
      status: this.status,
      title: this.title,
      detail: this.detail,
      ...(this.errors && Object.keys(this.errors).length > 0 && { errors: this.errors }),
      request_id: `req_${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
    };
  }
}

export class BadRequestError extends ApiError {
  constructor(detail: string, errors?: Record<string, string>) {
    super(400, "Bad Request", detail, errors);
    this.name = "BadRequestError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(detail: string = "Missing or invalid API key.") {
    super(401, "Unauthorized", detail);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(detail: string) {
    super(403, "Forbidden", detail);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends ApiError {
  constructor(resourceType: string, resourceId: string | number) {
    super(404, "Not Found", `${resourceType} with ID ${resourceId} does not exist.`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends ApiError {
  constructor(detail: string) {
    super(409, "Conflict", detail);
    this.name = "ConflictError";
  }
}

export class ValidationError extends ApiError {
  constructor(detail: string, errors: Record<string, string>) {
    super(422, "Validation Error", detail, errors);
    this.name = "ValidationError";
  }
}

export class RateLimitError extends ApiError {
  retryAfter: number;

  constructor(retryAfter: number = 60) {
    super(
      429,
      "Rate Limited",
      `Rate limit exceeded. Retry after ${retryAfter} seconds.`
    );
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      retry_after: this.retryAfter,
    };
  }
}

export class InternalError extends ApiError {
  constructor(detail: string = "An unexpected error occurred.") {
    super(500, "Internal Server Error", detail);
    this.name = "InternalError";
  }
}

export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) {
    console.error("Unhandled error:", error);
    return new InternalError("An unexpected error occurred. Please try again later.");
  }
  return new InternalError("An unknown error occurred.");
}
