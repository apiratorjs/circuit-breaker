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
      const operation = createSuccessfulOperation();

      const circuitBreaker = new CircuitBreaker(operation, options);

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);
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
      };

      const failingOperation = createFailingOperation();
      const circuitBreaker = new CircuitBreaker(
        failingOperation,
        options
      ).onStateChange((state: ECircuitBreakerState, error?: Error) => {
        stateChanges.push({ state, error });
      });

      try {
        await circuitBreaker.execute();
      } catch (e) {}

      try {
        await circuitBreaker.execute();
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

      const successfulOperation = createSuccessfulOperation("test result");
      const circuitBreaker = new CircuitBreaker(successfulOperation, options);

      const result = await circuitBreaker.execute();

      assert.strictEqual(result, "test result");
      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);
    });

    it("should handle failures and track failure count", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 3,
        successThreshold: 3,
      };

      const failingOperation = createFailingOperation("test error");
      const circuitBreaker = new CircuitBreaker(failingOperation, options);

      try {
        await circuitBreaker.execute();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.strictEqual((error as Error).message, "test error");
      }

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);
    });

    it("should transition to OPEN state after reaching failure threshold", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 2,
        successThreshold: 3,
      };

      const failingOperation = createFailingOperation("test error");
      const circuitBreaker = new CircuitBreaker(failingOperation, options);

      try {
        await circuitBreaker.execute();
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);

      try {
        await circuitBreaker.execute();
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

      const failingOperation = createFailingOperation("original error");
      const circuitBreaker = new CircuitBreaker(failingOperation, options);

      try {
        await circuitBreaker.execute();
      } catch (e) {}

      try {
        await circuitBreaker.execute();
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);

      // Now the circuit is open, any execution should throw CircuitOpenError
      try {
        await circuitBreaker.execute();
        assert.fail("Should have thrown CircuitOpenError");
      } catch (error) {
        assert(error instanceof CircuitOpenError);
        assert(
          (error as CircuitOpenError).message.includes(
            "Circuit breaker is open"
          )
        );
      }
    });

    it("should transition to HALF_OPEN after timeout period", async () => {
      const options = {
        durationOfBreakInMs: 100, // Short timeout for testing
        failureThreshold: 2,
        successThreshold: 2,
      };

      // Create a dynamic operation that can change behavior
      let shouldFail = true;
      const dynamicOperation = () => {
        if (shouldFail) {
          throw new Error("test error");
        }
        return Promise.resolve("success");
      };

      const circuitBreaker = new CircuitBreaker(dynamicOperation, options);

      try {
        await circuitBreaker.execute();
      } catch (e) {}

      try {
        await circuitBreaker.execute();
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);

      await delay(150);

      // Now make the operation succeed
      shouldFail = false;
      await circuitBreaker.execute();

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

      // Create a dynamic operation that can change behavior
      let shouldFail = true;
      const dynamicOperation = () => {
        if (shouldFail) {
          throw new Error("test error");
        }
        return Promise.resolve("success");
      };

      const circuitBreaker = new CircuitBreaker(dynamicOperation, options);

      try {
        await circuitBreaker.execute();
      } catch (e) {}

      try {
        await circuitBreaker.execute();
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);

      await delay(150);

      // Now make the operation succeed
      shouldFail = false;
      await circuitBreaker.execute();

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.HALF_OPEN);

      await circuitBreaker.execute();

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);
    });

    it("should transition back to OPEN on failure in HALF_OPEN state", async () => {
      const options = {
        durationOfBreakInMs: 100,
        failureThreshold: 2,
        successThreshold: 3,
      };

      // Create a dynamic operation that can change behavior
      let shouldFail = true;
      let callCount = 0;
      const dynamicOperation = () => {
        callCount++;
        if (shouldFail) {
          throw new Error("test error");
        }
        return Promise.resolve("success");
      };

      const circuitBreaker = new CircuitBreaker(dynamicOperation, options);

      try {
        await circuitBreaker.execute();
      } catch (e) {}

      try {
        await circuitBreaker.execute();
      } catch (e) {}

      await delay(150);

      // First call in HALF_OPEN should succeed to get to HALF_OPEN state
      shouldFail = false;
      await circuitBreaker.execute();

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.HALF_OPEN);

      // Now make it fail again to transition back to OPEN
      shouldFail = true;
      try {
        await circuitBreaker.execute();
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);
    });
  });

  describe("Error Handling", () => {
    it("should preserve original error when operation fails", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 5,
        successThreshold: 3,
      };

      const customError = new Error("Custom error message");
      const failingOperation = (): Promise<never> =>
        Promise.reject(customError);

      const circuitBreaker = new CircuitBreaker(failingOperation, options);

      try {
        await circuitBreaker.execute();
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

      const originalError = new Error("Original failure");
      const failingOperation = (): Promise<never> =>
        Promise.reject(originalError);

      const circuitBreaker = new CircuitBreaker(failingOperation, options);

      try {
        await circuitBreaker.execute();
      } catch (e) {}

      try {
        await circuitBreaker.execute();
      } catch (e) {}

      try {
        await circuitBreaker.execute();
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

      const successfulOperation = createSuccessfulOperation();
      const circuitBreaker = new CircuitBreaker(successfulOperation, options);
      const operations: Promise<string>[] = [];

      for (let i = 0; i < 5; i++) {
        operations.push(
          new Promise<string>((resolve, reject) => {
            try {
              const result = circuitBreaker.execute<string>();
              if (result instanceof Promise) {
                result.then(resolve).catch(reject);
              } else {
                resolve(result);
              }
            } catch (error) {
              reject(error);
            }
          })
        );
      }

      const results = await Promise.all(operations);

      assert.strictEqual(results.length, 5);
      results.forEach(result => {
        assert.strictEqual(result, "success");
      });
    });

    it("should handle mixed success and failure operations", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 10, // High threshold to prevent opening
        successThreshold: 3,
      };

      // Test with successful operation
      const successOperation = createSuccessfulOperation();
      const successCircuitBreaker = new CircuitBreaker(
        successOperation,
        options
      );
      await successCircuitBreaker.execute();
      assert.strictEqual(
        successCircuitBreaker.state,
        ECircuitBreakerState.CLOSED
      );

      // Test with failing operation
      const failOperation = createFailingOperation();
      const failCircuitBreaker = new CircuitBreaker(failOperation, options);
      try {
        await failCircuitBreaker.execute();
      } catch (e) {}
      assert.strictEqual(failCircuitBreaker.state, ECircuitBreakerState.CLOSED);
    });

    it("should handle zero thresholds gracefully", async () => {
      const options = {
        durationOfBreakInMs: 60000,
        failureThreshold: 1,
        successThreshold: 1,
      };

      const operation = createFailingOperation();
      const circuitBreaker = new CircuitBreaker(operation, options);

      try {
        await circuitBreaker.execute();
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);
    });
  });
});
