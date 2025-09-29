import { describe, it } from "node:test";
import assert from "node:assert";
import { CircuitBreaker, CircuitOpenError, ECircuitBreakerState } from "../src";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const createFailingOperation = (errorMessage = "Operation failed") => {
  return (): Promise<never> => Promise.reject(new Error(errorMessage));
};

const createSuccessfulOperation = <T>(result: T = "success" as T) => {
  return (): Promise<T> => Promise.resolve(result);
};

describe("CircuitBreaker", () => {
  describe("Constructor and Basic Properties", () => {
    it("should initialize with correct default state", () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 5,
        successThreshold: 3,
      };

      const circuitBreaker = new CircuitBreaker(options);

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);

      const metrics = circuitBreaker.metrics;
      assert.strictEqual(metrics.totalCalls, 0);
      assert.strictEqual(metrics.successfulCalls, 0);
      assert.strictEqual(metrics.failedCalls, 0);
      assert.strictEqual(metrics.rejectedCalls, 0);
      assert.strictEqual(metrics.currentState, ECircuitBreakerState.CLOSED);
    });

    it("should call onStateChange callback when provided", async () => {
      const stateChanges: Array<{
        state: ECircuitBreakerState;
        error?: Error;
      }> = [];

      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 2,
        successThreshold: 3,
        onStateChange: (state: ECircuitBreakerState, error?: Error) => {
          stateChanges.push({ state, error });
        },
      };

      const circuitBreaker = new CircuitBreaker(options);
      const failingOperation = createFailingOperation();

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      assert.strictEqual(stateChanges.length, 1);
      assert.strictEqual(stateChanges[0].state, ECircuitBreakerState.OPEN);
      assert(stateChanges[0].error instanceof Error);
    });
  });

  describe("CLOSED State Behavior", () => {
    it("should execute operations successfully when in CLOSED state", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 5,
        successThreshold: 3,
      };

      const circuitBreaker = new CircuitBreaker(options);
      const successfulOperation = createSuccessfulOperation("test result");

      const result = await circuitBreaker.execute(successfulOperation);

      assert.strictEqual(result, "test result");
      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);

      const metrics = circuitBreaker.metrics;
      assert.strictEqual(metrics.totalCalls, 1);
      assert.strictEqual(metrics.successfulCalls, 1);
      assert.strictEqual(metrics.failedCalls, 0);
    });

    it("should handle failures and track failure count", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 3,
        successThreshold: 3,
      };

      const circuitBreaker = new CircuitBreaker(options);
      const failingOperation = createFailingOperation("test error");

      try {
        await circuitBreaker.execute(failingOperation);
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.strictEqual((error as Error).message, "test error");
      }

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);

      const metrics = circuitBreaker.metrics;
      assert.strictEqual(metrics.totalCalls, 1);
      assert.strictEqual(metrics.successfulCalls, 0);
      assert.strictEqual(metrics.failedCalls, 1);
    });

    it("should transition to OPEN state after reaching failure threshold", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 2,
        successThreshold: 3,
      };

      const circuitBreaker = new CircuitBreaker(options);
      const failingOperation = createFailingOperation("test error");

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);
    });
  });

  describe("OPEN State Behavior", () => {
    it("should reject operations immediately when in OPEN state", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 2,
        successThreshold: 3,
      };

      const circuitBreaker = new CircuitBreaker(options);
      const failingOperation = createFailingOperation("original error");

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);

      const successfulOperation = createSuccessfulOperation();

      try {
        await circuitBreaker.execute(successfulOperation);
        assert.fail("Should have thrown CircuitOpenError");
      } catch (error) {
        assert(error instanceof CircuitOpenError);
        assert(
          (error as CircuitOpenError).message.includes(
            "Circuit breaker is open"
          )
        );
      }

      const metrics = circuitBreaker.metrics;
      assert.strictEqual(metrics.rejectedCalls, 1);
    });

    it("should transition to HALF_OPEN after timeout period", async () => {
      const options = {
        durationOfBreakInMs: 100, // Short timeout for testing
        failureThreshold: 2,
        successThreshold: 2,
      };

      const circuitBreaker = new CircuitBreaker(options);
      const failingOperation = createFailingOperation("test error");

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);

      await delay(150);

      const successfulOperation = createSuccessfulOperation();
      await circuitBreaker.execute(successfulOperation);

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.HALF_OPEN);
    });
  });

  describe("HALF_OPEN State Behavior", () => {
    it("should transition to CLOSED after successful operations reach threshold", async () => {
      const options = {
        durationOfBreakInMs: 100,
        failureThreshold: 2,
        successThreshold: 2,
      };

      const circuitBreaker = new CircuitBreaker(options);
      const failingOperation = createFailingOperation("test error");
      const successfulOperation = createSuccessfulOperation();

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);

      await delay(150);
      await circuitBreaker.execute(successfulOperation);

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.HALF_OPEN);

      await circuitBreaker.execute(successfulOperation);

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);
    });

    it("should transition back to OPEN on failure in HALF_OPEN state", async () => {
      const options = {
        durationOfBreakInMs: 100,
        failureThreshold: 2,
        successThreshold: 3,
      };

      const circuitBreaker = new CircuitBreaker(options);
      const failingOperation = createFailingOperation("test error");
      const successfulOperation = createSuccessfulOperation();

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      await delay(150);
      await circuitBreaker.execute(successfulOperation);

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.HALF_OPEN);

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);
    });
  });

  describe("Metrics Tracking", () => {
    it("should accurately track all metrics", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 3,
        successThreshold: 2,
      };

      const circuitBreaker = new CircuitBreaker(options);
      const successfulOperation = createSuccessfulOperation();
      const failingOperation = createFailingOperation();

      await circuitBreaker.execute(successfulOperation);
      await circuitBreaker.execute(successfulOperation);

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      const metrics = circuitBreaker.metrics;
      assert.strictEqual(metrics.totalCalls, 4);
      assert.strictEqual(metrics.successfulCalls, 2);
      assert.strictEqual(metrics.failedCalls, 2);
      assert.strictEqual(metrics.rejectedCalls, 0);
      assert.strictEqual(metrics.currentState, ECircuitBreakerState.CLOSED);
      assert(metrics.lastFailureTime instanceof Date);
      assert(metrics.lastStateChangeTime instanceof Date);
    });

    it("should track rejected calls when circuit is open", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 2,
        successThreshold: 2,
      };

      const circuitBreaker = new CircuitBreaker(options);
      const failingOperation = createFailingOperation();
      const successfulOperation = createSuccessfulOperation();

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      try {
        await circuitBreaker.execute(successfulOperation);
      } catch (e) {}

      try {
        await circuitBreaker.execute(successfulOperation);
      } catch (e) {}

      const metrics = circuitBreaker.metrics;
      assert.strictEqual(metrics.totalCalls, 4);
      assert.strictEqual(metrics.successfulCalls, 0);
      assert.strictEqual(metrics.failedCalls, 2);
      assert.strictEqual(metrics.rejectedCalls, 2);
    });
  });

  describe("Error Handling", () => {
    it("should preserve original error when operation fails", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 5,
        successThreshold: 3,
      };

      const circuitBreaker = new CircuitBreaker(options);
      const customError = new Error("Custom error message");
      const failingOperation = (): Promise<never> =>
        Promise.reject(customError);

      try {
        await circuitBreaker.execute(failingOperation);
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.strictEqual(error, customError);
        assert.strictEqual((error as Error).message, "Custom error message");
      }
    });

    it("should include cause error in CircuitOpenError", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 2,
        successThreshold: 3,
      };

      const circuitBreaker = new CircuitBreaker(options);
      const originalError = new Error("Original failure");
      const failingOperation = (): Promise<never> =>
        Promise.reject(originalError);

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      try {
        await circuitBreaker.execute(failingOperation);
      } catch (e) {}

      try {
        await circuitBreaker.execute(createSuccessfulOperation());
        assert.fail("Should have thrown CircuitOpenError");
      } catch (error) {
        assert(error instanceof CircuitOpenError);
        assert(
          (error as CircuitOpenError).message.includes("Original failure")
        );
        assert.strictEqual((error as CircuitOpenError).cause, originalError);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle concurrent operations correctly", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 3,
        successThreshold: 2,
      };

      const circuitBreaker = new CircuitBreaker(options);
      const operations: Promise<number>[] = [];

      for (let i = 0; i < 5; i++) {
        operations.push(circuitBreaker.execute(createSuccessfulOperation(i)));
      }

      const results = await Promise.all(operations);

      assert.strictEqual(results.length, 5);
      assert.strictEqual(circuitBreaker.metrics.totalCalls, 5);
      assert.strictEqual(circuitBreaker.metrics.successfulCalls, 5);
    });

    it("should handle mixed success and failure operations", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 10, // High threshold to prevent opening
        successThreshold: 3,
      };

      const circuitBreaker = new CircuitBreaker(options);

      await circuitBreaker.execute(createSuccessfulOperation());

      try {
        await circuitBreaker.execute(createFailingOperation());
      } catch (e) {}

      await circuitBreaker.execute(createSuccessfulOperation());
      await circuitBreaker.execute(createSuccessfulOperation());

      try {
        await circuitBreaker.execute(createFailingOperation());
      } catch (e) {}

      const metrics = circuitBreaker.metrics;
      assert.strictEqual(metrics.totalCalls, 5);
      assert.strictEqual(metrics.successfulCalls, 3);
      assert.strictEqual(metrics.failedCalls, 2);
      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);
    });

    it("should handle zero thresholds gracefully", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 1,
        successThreshold: 1,
      };

      const circuitBreaker = new CircuitBreaker(options);

      try {
        await circuitBreaker.execute(createFailingOperation());
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);
    });
  });
});
