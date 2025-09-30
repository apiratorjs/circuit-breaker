import { describe, it } from "node:test";
import assert from "node:assert";
import { WithCircuitBreaker } from "../src";

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
