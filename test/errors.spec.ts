import { describe, it } from "node:test";
import assert from "node:assert";
import { CircuitOpenError } from "../src";

describe("Error Classes", () => {
  describe("CircuitOpenError", () => {
    it("should create error with default message when no cause provided", () => {
      const error = new CircuitOpenError();

      assert(error instanceof Error);
      assert(error instanceof CircuitOpenError);
      assert.strictEqual(error.name, "CircuitOpenError");
      assert.strictEqual(
        error.message,
        "Circuit breaker is open caused by: Service is not available"
      );
      assert.strictEqual(error.cause, undefined);
    });

    it("should create error with cause error message", () => {
      const causeError = new Error("Database connection failed");
      const circuitError = new CircuitOpenError(causeError);

      assert(circuitError instanceof Error);
      assert(circuitError instanceof CircuitOpenError);
      assert.strictEqual(circuitError.name, "CircuitOpenError");
      assert.strictEqual(circuitError.message, "Circuit breaker is open caused by: Database connection failed");
      assert.strictEqual(circuitError.cause, causeError);
    });

    it("should preserve cause error properties", () => {
      const causeError = new Error("Original error") as any;
      causeError.code = "ECONNREFUSED";
      causeError.customProperty = "test";

      const circuitError = new CircuitOpenError(causeError);

      assert.strictEqual(circuitError.cause, causeError);
      assert.strictEqual((circuitError.cause as any).code, "ECONNREFUSED");
      assert.strictEqual((circuitError.cause as any).customProperty, "test");
    });

    it("should work correctly with instanceof checks", () => {
      const error = new CircuitOpenError();

      assert(error instanceof Error);
      assert(error instanceof CircuitOpenError);
      assert.strictEqual(error.constructor.name, "CircuitOpenError");
    });

    it("should include stack trace", () => {
      const error = new CircuitOpenError();

      assert(error.stack);
      assert(error.stack!.includes("CircuitOpenError"));
    });

    it("should handle null and undefined cause gracefully", () => {
      const errorWithNull = new CircuitOpenError(null as any);
      const errorWithUndefined = new CircuitOpenError(undefined);

      assert.strictEqual(errorWithNull.message, "Circuit breaker is open caused by: Service is not available");
      assert.strictEqual(errorWithUndefined.message, "Circuit breaker is open caused by: Service is not available");
      assert.strictEqual(errorWithNull.cause, null);
      assert.strictEqual(errorWithUndefined.cause, undefined);
    });

    it("should handle cause with empty message", () => {
      const causeError = new Error("");
      const circuitError = new CircuitOpenError(causeError);

      assert.strictEqual(circuitError.message, "Circuit breaker is open caused by: ");
      assert.strictEqual(circuitError.cause, causeError);
    });

    it("should be serializable to JSON", () => {
      const causeError = new Error("Test cause");
      const circuitError = new CircuitOpenError(causeError);

      const serialized = JSON.stringify(circuitError);
      const parsed = JSON.parse(serialized);

      assert.strictEqual(parsed.name, "CircuitOpenError");
      assert.strictEqual(parsed.message, "Circuit breaker is open caused by: Test cause");
    });
  });
});
