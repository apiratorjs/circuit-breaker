import { CircuitBreaker } from "./circuit-breaker";
import { ICircuitBreakerOptions } from "./types";

export const withCircuitBreaker = (
  circuitBreakerOptions: ICircuitBreakerOptions
) => {
  const circuitBreaker = new CircuitBreaker(circuitBreakerOptions);

  return (originalMethod: (...args: any[]) => Promise<any>) => {
    return (...args: any[]) => {
      return circuitBreaker.execute(() => originalMethod.apply(this, args));
    };
  };
};

export function WithCircuitBreaker(
  circuitBreakerOptions: ICircuitBreakerOptions
) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const circuitBreaker = new CircuitBreaker(circuitBreakerOptions);

    descriptor.value = function (...args: any[]) {
      return circuitBreaker.execute(() => originalMethod.apply(this, args));
    };
  };
}
