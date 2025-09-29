export interface ICircuitBreakerOptions {
  durationOfBreakInMs: number;
  failureThreshold: number;
  successThreshold: number;
  onStateChange?: (state: ECircuitBreakerState, error?: Error) => void;
}

export interface ICircuitBreakerMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  rejectedCalls: number;
  currentState: ECircuitBreakerState;
  lastFailureTime?: Date;
  lastStateChangeTime: Date;
}

export enum ECircuitBreakerState {
  CLOSED = "closed",
  OPEN = "open",
  HALF_OPEN = "half_open",
}