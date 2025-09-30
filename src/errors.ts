import { TErrorLike } from "./types";

export class CircuitBreakerError extends Error {
  public readonly cause?: TErrorLike;

  constructor(message: string, cause?: TErrorLike) {
    super(message);
    this.name = this.constructor.name;
    this.cause = cause;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      cause: this.cause
        ? {
            name: this.cause.name ?? "Error",
            message: this.cause.message ?? String(this.cause),
            code: this.cause.code,
            status: this.cause.status,
          }
        : undefined,
    };
  }
}

export class CircuitArgumentError extends CircuitBreakerError {
  constructor(message: string) {
    super(message);
  }
}

export class CircuitOpenError extends CircuitBreakerError {
  constructor(cause?: TErrorLike) {
    const message = `Circuit breaker is open caused by: ${
      cause?.message ?? (cause ? String(cause) : "Service is not available")
    }`;
    super(message, cause);
  }
}
