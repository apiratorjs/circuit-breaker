export interface ICircuitBreakerOptions {
  durationOfBreakInMs: number;
  failureThreshold: number;
  successThreshold: number;
  onStateChange?: (state: ECircuitBreakerState, error?: Error) => void;
}


export enum ECircuitBreakerState {
  CLOSED = "closed",
  OPEN = "open",
  HALF_OPEN = "half_open",
}