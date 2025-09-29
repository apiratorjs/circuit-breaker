import { describe, it } from "node:test";
import assert from "node:assert";
import { CircuitBreaker, CircuitOpenError, ECircuitBreakerState } from "../src";

class MockService {
  private callCount = 0;
  private shouldFail = false;
  private failureCount = 0;
  private delay = 0;

  async call(data?: string): Promise<string> {
    this.callCount++;

    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    if (this.shouldFail) {
      this.failureCount++;
      throw new Error(
        `Service failure #${this.failureCount}: ${data || "operation failed"}`
      );
    }

    return `Success: ${data || "default"} (call #${this.callCount})`;
  }

  setFailureMode(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setDelay(ms: number): void {
    this.delay = ms;
  }

  reset(): void {
    this.callCount = 0;
    this.failureCount = 0;
    this.shouldFail = false;
    this.delay = 0;
  }
}

describe("Integration Tests", () => {
  describe("Real-world Service Scenarios", () => {
    it("should handle database service outage scenario", async () => {
      const mockDB = new MockService();
      const stateChanges: Array<{
        state: ECircuitBreakerState;
        error?: string;
        timestamp: number;
      }> = [];

      const circuitBreaker = new CircuitBreaker({
        durationOfBreakInMs: 200,
        failureThreshold: 3,
        successThreshold: 2,
        onStateChange: (state: ECircuitBreakerState, error?: Error) => {
          stateChanges.push({
            state,
            error: error?.message,
            timestamp: Date.now(),
          });
        },
      });

      let result = await circuitBreaker.execute(() => mockDB.call("user-123"));
      assert(result.includes("Success"));
      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);

      mockDB.setFailureMode(true);

      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(() => mockDB.call(`request-${i}`));
          assert.fail("Should have failed");
        } catch (error) {
          if (i < 2) {
            assert.strictEqual(
              circuitBreaker.state,
              ECircuitBreakerState.CLOSED
            );
          }
        }
      }

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);
      assert.strictEqual(stateChanges.length, 1);
      assert.strictEqual(stateChanges[0].state, ECircuitBreakerState.OPEN);

      try {
        await circuitBreaker.execute(() => mockDB.call("rejected-request"));
        assert.fail("Should have been rejected");
      } catch (error) {
        assert(error instanceof CircuitOpenError);
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
      mockDB.setFailureMode(false); // Service recovers

      result = await circuitBreaker.execute(() =>
        mockDB.call("recovery-test-1")
      );
      assert(result.includes("Success"));
      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.HALF_OPEN);

      result = await circuitBreaker.execute(() =>
        mockDB.call("recovery-test-2")
      );
      assert(result.includes("Success"));
      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);

      assert.strictEqual(stateChanges.length, 3);
      assert.strictEqual(stateChanges[1].state, ECircuitBreakerState.HALF_OPEN);
      assert.strictEqual(stateChanges[2].state, ECircuitBreakerState.CLOSED);

      const metrics = circuitBreaker.metrics;
      assert(metrics.totalCalls > 0);
      assert(metrics.successfulCalls > 0);
      assert(metrics.failedCalls > 0);
      assert(metrics.rejectedCalls > 0);
    });

    it("should handle intermittent failures correctly", async () => {
      const mockAPI = new MockService();

      const circuitBreaker = new CircuitBreaker({
        durationOfBreakInMs: 100,
        failureThreshold: 5,
        successThreshold: 3,
      });

      const operations = [
        { shouldFail: false, data: "req-1" },
        { shouldFail: true, data: "req-2" },
        { shouldFail: false, data: "req-3" },
        { shouldFail: true, data: "req-4" },
        { shouldFail: false, data: "req-5" },
        { shouldFail: false, data: "req-6" },
        { shouldFail: true, data: "req-7" },
      ];

      for (const op of operations) {
        mockAPI.setFailureMode(op.shouldFail);

        try {
          const result = await circuitBreaker.execute(() =>
            mockAPI.call(op.data)
          );
          assert(
            !op.shouldFail,
            "Expected success but operation was marked to fail"
          );
          assert(result.includes("Success"));
        } catch (error) {
          assert(
            op.shouldFail,
            "Expected failure but operation was marked to succeed"
          );
          assert(
            !(error instanceof CircuitOpenError),
            "Should not be circuit open error for intermittent failures"
          );
        }
      }

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);

      const metrics = circuitBreaker.metrics;
      assert.strictEqual(metrics.totalCalls, 7);
      assert.strictEqual(metrics.successfulCalls, 4);
      assert.strictEqual(metrics.failedCalls, 3);
      assert.strictEqual(metrics.rejectedCalls, 0);
    });

    it("should handle quick recovery attempts correctly", async () => {
      const mockService = new MockService();

      const circuitBreaker = new CircuitBreaker({
        durationOfBreakInMs: 100,
        failureThreshold: 2,
        successThreshold: 3,
      });

      mockService.setFailureMode(true);

      try {
        await circuitBreaker.execute(() => mockService.call("fail-1"));
      } catch (e) {}

      try {
        await circuitBreaker.execute(() => mockService.call("fail-2"));
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);

      await new Promise((resolve) => setTimeout(resolve, 150));

      try {
        await circuitBreaker.execute(() => mockService.call("recovery-fail"));
        assert.fail("Should have failed");
      } catch (error) {
        assert(!(error instanceof CircuitOpenError));
      }

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);

      await new Promise((resolve) => setTimeout(resolve, 150));
      mockService.setFailureMode(false);

      for (let i = 0; i < 3; i++) {
        const result = await circuitBreaker.execute(() =>
          mockService.call(`recovery-${i}`)
        );
        assert(result.includes("Success"));
      }

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);
    });
  });

  describe("Performance and Load Testing", () => {
    it("should handle high-frequency operations", async () => {
      const mockService = new MockService();

      const circuitBreaker = new CircuitBreaker({
        durationOfBreakInMs: 1000,
        failureThreshold: 10,
        successThreshold: 5,
      });

      const operations: Promise<string>[] = [];
      const operationCount = 100;

      for (let i = 0; i < operationCount; i++) {
        operations.push(
          circuitBreaker.execute(() => mockService.call(`high-freq-${i}`))
        );
      }

      const results = await Promise.allSettled(operations);

      const successful = results.filter((r) => r.status === "fulfilled");
      assert.strictEqual(successful.length, operationCount);

      const metrics = circuitBreaker.metrics;
      assert.strictEqual(metrics.totalCalls, operationCount);
      assert.strictEqual(metrics.successfulCalls, operationCount);
      assert.strictEqual(metrics.failedCalls, 0);
    });

    it("should handle slow operations with timeouts", async () => {
      const slowService = new MockService();
      slowService.setDelay(50); // 50ms delay per operation

      const circuitBreaker = new CircuitBreaker({
        durationOfBreakInMs: 200,
        failureThreshold: 3,
        successThreshold: 2,
      });

      const startTime = Date.now();

      const operations: Promise<string>[] = [];
      for (let i = 0; i < 5; i++) {
        operations.push(
          circuitBreaker.execute(() => slowService.call(`slow-${i}`))
        );
      }

      const results = await Promise.all(operations);
      const endTime = Date.now();

      assert.strictEqual(results.length, 5);
      results.forEach((result) => assert(result.includes("Success")));

      assert(endTime - startTime >= 50);

      const metrics = circuitBreaker.metrics;
      assert.strictEqual(metrics.successfulCalls, 5);
    });
  });

  describe("Error Propagation and Recovery", () => {
    it("should preserve error details through circuit breaker", async () => {
      const mockService = new MockService();

      const circuitBreaker = new CircuitBreaker({
        durationOfBreakInMs: 1000,
        failureThreshold: 5,
        successThreshold: 3,
      });

      mockService.setFailureMode(true);

      try {
        await circuitBreaker.execute(() => mockService.call("error-test"));
        assert.fail("Should have thrown error");
      } catch (error) {
        assert((error as Error).message.includes("Service failure #1"));
        assert((error as Error).message.includes("error-test"));
        assert(!(error instanceof CircuitOpenError));
      }
    });

    it("should maintain error context across state transitions", async () => {
      const mockService = new MockService();
      let lastCapturedError: Error | null = null;

      const circuitBreaker = new CircuitBreaker({
        durationOfBreakInMs: 100,
        failureThreshold: 2,
        successThreshold: 2,
        onStateChange: (state: ECircuitBreakerState, error?: Error) => {
          if (error) {
            lastCapturedError = error;
          }
        },
      });

      mockService.setFailureMode(true);
      const customError = new Error("Critical system failure");

      try {
        await circuitBreaker.execute(() => Promise.reject(customError));
      } catch (e) {}

      try {
        await circuitBreaker.execute(() => Promise.reject(customError));
      } catch (e) {}

      assert.strictEqual(lastCapturedError, customError);

      try {
        await circuitBreaker.execute(() =>
          mockService.call("should-be-rejected")
        );
        assert.fail("Should have been rejected");
      } catch (error) {
        assert(error instanceof CircuitOpenError);
        assert.strictEqual((error as CircuitOpenError).cause, customError);
        assert(
          (error as CircuitOpenError).message.includes(
            "Critical system failure"
          )
        );
      }
    });
  });

  describe("Configuration Edge Cases", () => {
    it("should work with minimal thresholds", async () => {
      const mockService = new MockService();

      const circuitBreaker = new CircuitBreaker({
        durationOfBreakInMs: 50,
        failureThreshold: 1,
        successThreshold: 1,
      });

      mockService.setFailureMode(true);
      try {
        await circuitBreaker.execute(() => mockService.call("single-fail"));
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);

      await new Promise((resolve) => setTimeout(resolve, 75));
      mockService.setFailureMode(false);

      await circuitBreaker.execute(() => mockService.call("single-success"));
      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.CLOSED);
    });

    it("should handle very short timeout durations", async () => {
      const mockService = new MockService();

      const circuitBreaker = new CircuitBreaker({
        durationOfBreakInMs: 1, // Very short timeout
        failureThreshold: 2,
        successThreshold: 2,
      });

      mockService.setFailureMode(true);

      try {
        await circuitBreaker.execute(() => mockService.call("fail-1"));
      } catch (e) {}

      try {
        await circuitBreaker.execute(() => mockService.call("fail-2"));
      } catch (e) {}

      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.OPEN);

      await new Promise((resolve) => setTimeout(resolve, 5));
      mockService.setFailureMode(false);

      await circuitBreaker.execute(() => mockService.call("quick-recovery"));
      assert.strictEqual(circuitBreaker.state, ECircuitBreakerState.HALF_OPEN);
    });
  });
});
