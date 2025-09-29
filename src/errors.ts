class CircuitBreakerError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    this.cause = cause;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
      cause: this.cause,
    };
  }
}

export class CircuitArgumentError extends CircuitBreakerError {
  constructor(message: string) {
    super(message);
  }
}

export class CircuitOpenError extends CircuitBreakerError {
  constructor(cause?: Error) {
    const message = cause
      ? `Circuit breaker is open caused by: ${cause.message}`
      : "Circuit breaker is open caused by: Service is not available";
    super(message, cause);
  }
}
