import { CircuitBreaker } from "./circuit-breaker";
import { ICircuitBreakerOptions } from "./types";

export function WithCircuitBreaker(
  circuitBreakerOptions: ICircuitBreakerOptions
) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const circuitBreaker = new CircuitBreaker(
        () => originalMethod.apply(this, args),
        circuitBreakerOptions
      );
      return circuitBreaker.execute(...args);
    };
  };
}
