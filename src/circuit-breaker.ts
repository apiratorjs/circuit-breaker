import assert from "node:assert";
import { CircuitArgumentError, CircuitOpenError } from "./errors.js";
import {
  ECircuitBreakerState,
  ICircuitBreakerOptions,
  ICircuitBreakerMetrics,
} from "./types.js";

export class CircuitBreaker {
  private _state: ECircuitBreakerState;
  private _failureCount: number;
  private _successCount: number;
  private _lastFailureTime: Date;
  private _lastStateChangeTime: Date;
  private _successThreshold: number;
  private _durationOfBreakInMs: number;
  private _failureThreshold: number;
  private _lastError?: Error;
  private _onStateChange?: (state: ECircuitBreakerState, error?: Error) => void;

  private _totalCalls: number;
  private _successfulCalls: number;
  private _failedCalls: number;
  private _rejectedCalls: number;

  constructor(options: ICircuitBreakerOptions) {
    this._state = ECircuitBreakerState.CLOSED;
    this._failureCount = 0;
    this._successCount = 0;
    this._lastFailureTime = new Date();
    this._lastStateChangeTime = new Date();

    assert(
      options.successThreshold > 0,
      new CircuitArgumentError("successThreshold must be greater than 0")
    );
    assert(
      options.durationOfBreakInMs > 0,
      new CircuitArgumentError("durationOfBreakInMs must be greater than 0")
    );
    assert(
      options.failureThreshold > 0,
      new CircuitArgumentError("failureThreshold must be greater than 0")
    );

    this._successThreshold = options.successThreshold;
    this._durationOfBreakInMs = options.durationOfBreakInMs;
    this._failureThreshold = options.failureThreshold;
    this._onStateChange = options.onStateChange;

    this._totalCalls = 0;
    this._successfulCalls = 0;
    this._failedCalls = 0;
    this._rejectedCalls = 0;
  }

  public execute<T>(fn: () => Promise<T>): Promise<T> {
    if (
      this._state === ECircuitBreakerState.OPEN &&
      this._lastFailureTime.getTime() + this._durationOfBreakInMs <= Date.now()
    ) {
      this.setState(ECircuitBreakerState.HALF_OPEN);
      this._successCount = 0;
    }

    if (this._state === ECircuitBreakerState.OPEN) {
      this._rejectedCalls++;
      this._totalCalls++;
      throw new CircuitOpenError(this._lastError);
    }

    this._totalCalls++;

    return this.attemptToExecute(fn);
  }

  public get state(): ECircuitBreakerState {
    return this._state;
  }

  public get metrics(): ICircuitBreakerMetrics {
    return {
      totalCalls: this._totalCalls,
      successfulCalls: this._successfulCalls,
      failedCalls: this._failedCalls,
      rejectedCalls: this._rejectedCalls,
      currentState: this._state,
      lastFailureTime: this._lastFailureTime,
      lastStateChangeTime: this._lastStateChangeTime,
    };
  }

  private async attemptToExecute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error: any) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess() {
    this._successfulCalls++;

    if (this._state === ECircuitBreakerState.CLOSED) {
      return;
    }

    if (this._state === ECircuitBreakerState.HALF_OPEN) {
      this._successCount++;
      if (this._successCount >= this._successThreshold) {
        this.setState(ECircuitBreakerState.CLOSED);
        this.reset();
      }
    }
  }

  private onFailure(error: Error) {
    this._failedCalls++;
    this._lastError = error;
    this._lastFailureTime = new Date();

    if (this._state === ECircuitBreakerState.CLOSED) {
      this._failureCount++;

      if (this._failureCount >= this._failureThreshold) {
        this.setState(ECircuitBreakerState.OPEN, error);
        this._failureCount = 0;
      }
    } else if (this._state === ECircuitBreakerState.HALF_OPEN) {
      this.setState(ECircuitBreakerState.OPEN, error);
      this._failureCount = 0;
      this._successCount = 0;
    }
  }

  private setState(newState: ECircuitBreakerState, error?: Error) {
    if (this._state !== newState) {
      this._state = newState;
      this._lastStateChangeTime = new Date();
      this._onStateChange?.(newState, error);
    }
  }

  private reset() {
    this._failureCount = 0;
    this._successCount = 0;
    this._lastError = undefined;
  }
}
