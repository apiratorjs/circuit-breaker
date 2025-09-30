export interface ICircuitBreakerOptions {
  durationOfBreakInMs: number;
  failureThreshold: number;
  successThreshold: number;
}

export type TCircuitBreakerOperation = (...args: any[]) => Promise<any> | any;

export enum ECircuitBreakerState {
  CLOSED = "closed",
  OPEN = "open",
  HALF_OPEN = "half_open",
}

export type TErrorLike = Error & { code?: string | number; status?: number };
