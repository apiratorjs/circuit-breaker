import { describe, it } from "node:test";
import assert from "node:assert";
import {
  withCircuitBreaker,
  WithCircuitBreaker,
  ECircuitBreakerState,
} from "../src";

class TestService {
  private callCount = 0;
  private shouldFail = false;

  async performOperation(data: string): Promise<string> {
    this.callCount++;
    if (this.shouldFail) {
      throw new Error(`Operation failed for: ${data}`);
    }
    return `Success: ${data} (call #${this.callCount})`;
  }

  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.callCount = 0;
    this.shouldFail = false;
  }
}

describe("withCircuitBreaker", () => {
  it("should wrap a function with circuit breaker functionality", async () => {
    const service = new TestService();
    const wrapper = withCircuitBreaker({
      durationOfBreakInMs: 100,
      failureThreshold: 2,
      successThreshold: 1,
    });

    const wrappedMethod = wrapper(service.performOperation.bind(service));

    const result = await wrappedMethod("test-data");
    assert.strictEqual(result, "Success: test-data (call #1)");
    assert.strictEqual(service.getCallCount(), 1);
  });

  it("should open circuit after failure threshold is reached", async () => {
    const service = new TestService();
    let circuitState: ECircuitBreakerState | undefined;

    const wrapper = withCircuitBreaker({
      durationOfBreakInMs: 100,
      failureThreshold: 2,
      successThreshold: 1,
      onStateChange: (state) => {
        circuitState = state;
      },
    });

    const wrappedMethod = wrapper(service.performOperation.bind(service));
    service.setShouldFail(true);

    try {
      await wrappedMethod("test-1");
      assert.fail("Should have failed");
    } catch (error) {
      assert.strictEqual(
        (error as Error).message,
        "Operation failed for: test-1"
      );
    }

    try {
      await wrappedMethod("test-2");
      assert.fail("Should have failed");
    } catch (error) {
      assert.strictEqual(
        (error as Error).message,
        "Operation failed for: test-2"
      );
    }

    assert.strictEqual(circuitState, ECircuitBreakerState.OPEN);
  });
});

describe("WithCircuitBreaker decorator", () => {
  it("should work as a method decorator", async () => {
    class DecoratedService {
      private callCount = 0;
      private shouldFail = false;

      @WithCircuitBreaker({
        durationOfBreakInMs: 100,
        failureThreshold: 2,
        successThreshold: 1,
      })
      async performOperation(data: string): Promise<string> {
        this.callCount++;
        if (this.shouldFail) {
          throw new Error(`Decorated operation failed for: ${data}`);
        }
        return `Decorated success: ${data} (call #${this.callCount})`;
      }

      setShouldFail(fail: boolean): void {
        this.shouldFail = fail;
      }

      getCallCount(): number {
        return this.callCount;
      }
    }

    const service = new DecoratedService();

    const result = await service.performOperation("test-data");
    assert.strictEqual(result, "Decorated success: test-data (call #1)");
    assert.strictEqual(service.getCallCount(), 1);

    service.setShouldFail(true);
    try {
      await service.performOperation("failing-test");
      assert.fail("Should have failed");
    } catch (error) {
      assert.strictEqual(
        (error as Error).message,
        "Decorated operation failed for: failing-test"
      );
    }
  });
});
