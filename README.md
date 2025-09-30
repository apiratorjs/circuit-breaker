# @apiratorjs/circuit-breaker

[![NPM version](https://img.shields.io/npm/v/@apiratorjs/circuit-breaker.svg)](https://www.npmjs.com/package/@apiratorjs/circuit-breaker)
[![License: MIT](https://img.shields.io/npm/l/@apiratorjs/circuit-breaker.svg)](https://github.com/apiratorjs/circuit-breaker/blob/main/LICENSE)

A robust and lightweight TypeScript circuit breaker implementation for Node.js applications. Provides fault tolerance and stability by preventing cascading failures in distributed systems with configurable thresholds and automatic recovery.

> **Note:** Requires Node.js version **>=16.4.0**

## What is a Circuit Breaker and Why Use It?

A **Circuit Breaker** is a design pattern used in distributed systems to provide fault tolerance and prevent cascading failures. Just like an electrical circuit breaker that protects your home's electrical system from overload, a software circuit breaker protects your application from failing services.

### How It Works

The circuit breaker monitors calls to external services and tracks failures. It has three states:

- **🟢 CLOSED**: Normal operation - requests pass through and are monitored
- **🔴 OPEN**: Failure threshold exceeded - requests fail fast without calling the service
- **🟡 HALF_OPEN**: Testing phase - allows limited requests to check if service has recovered

### Why You Need It

**Without a Circuit Breaker:**
```
Service A → Service B (failing) → Timeout after 30s → Retry → Another 30s timeout → Cascade failure
```

**With a Circuit Breaker:**
```
Service A → Circuit Breaker → Service B (failing) → Fast fail after threshold → System remains stable
```

### Key Benefits

- **Fast Failure**: Stop wasting time on calls to failing services
- **System Stability**: Prevent one failing service from bringing down your entire system
- **Automatic Recovery**: Automatically retry when services become healthy again
- **Observability**: Get insights into service health and failure patterns
- **Performance**: Reduce resource consumption and improve response times

---

## Installation

```bash
npm install @apiratorjs/circuit-breaker
```

```bash
yarn add @apiratorjs/circuit-breaker
```

```bash
pnpm add @apiratorjs/circuit-breaker
```

## Quick Start

```typescript
import { CircuitBreaker } from '@apiratorjs/circuit-breaker';

// Define your service call function
async function callExternalService(data: any) {
  // Your external service call here
  const response = await fetch('https://api.example.com/data', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    throw new Error(`Service responded with ${response.status}`);
  }
  
  return response.json();
}

// Create a circuit breaker with your operation and settings
const circuitBreaker = new CircuitBreaker(callExternalService, {
  failureThreshold: 5,        // Open circuit after 5 failures
  durationOfBreakInMs: 60000, // Keep circuit open for 60 seconds
  successThreshold: 2         // Close circuit after 2 successful calls in half-open state
});

// Use it in your application
try {
  const result = await circuitBreaker.execute({ id: 123 });
  console.log('Success:', result);
} catch (error) {
  console.error('Circuit breaker prevented call or service failed:', error);
}
```

## Interface and options

### ICircuitBreakerOptions

Configuration options for creating a circuit breaker instance:

```typescript
interface ICircuitBreakerOptions {
  failureThreshold: number;       // Number of failures before opening the circuit
  durationOfBreakInMs: number;    // How long to keep circuit open (milliseconds)
  successThreshold: number;       // Successful calls needed to close circuit from half-open
}
```

#### Options Details

- **`failureThreshold`** (required): Number of consecutive failures that will trigger the circuit to open
- **`durationOfBreakInMs`** (required): Duration in milliseconds to keep the circuit open before attempting recovery
- **`successThreshold`** (required): Number of successful calls needed in half-open state to close the circuit

### Circuit Breaker States

```typescript
enum ECircuitBreakerState {
  CLOSED = "closed",      // Normal operation, calls pass through
  OPEN = "open",         // Circuit is open, calls are rejected immediately
  HALF_OPEN = "half_open" // Testing recovery, limited calls allowed
}
```


### Usage Example with State Monitoring

```typescript
import { CircuitBreaker, ECircuitBreakerState } from '@apiratorjs/circuit-breaker';

// Define your risky operation
async function riskyOperation() {
  // Your risky operation here
  throw new Error('Service unavailable');
}

const circuitBreaker = new CircuitBreaker(riskyOperation, {
  failureThreshold: 3,
  durationOfBreakInMs: 30000,
  successThreshold: 2
});

// Set up state change monitoring
circuitBreaker.onStateChange((state, error) => {
  console.log(`Circuit breaker state changed to: ${state}`);
  if (error) {
    console.log(`Triggered by error: ${error.message}`);
  }
});

// Check current state
console.log('Current state:', circuitBreaker.state);

// Example usage
async function makeCall() {
  try {
    return await circuitBreaker.execute();
  } catch (error) {
    console.log('Call failed:', error.message);
  }
}
```

## Using decorator (for typescript projects)

### Method Decorator (@WithCircuitBreaker)

Protect class methods using TypeScript decorators:

```typescript
import { WithCircuitBreaker } from '@apiratorjs/circuit-breaker';

class UserService {
  @WithCircuitBreaker({
    failureThreshold: 5,
    durationOfBreakInMs: 60000,
    successThreshold: 2
  })
  async fetchUser(id: string) {
    const response = await fetch(`https://api.example.com/users/${id}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  @WithCircuitBreaker({
    failureThreshold: 3,
    durationOfBreakInMs: 45000,
    successThreshold: 1
  })
  async updateUser(id: string, data: any) {
    const response = await fetch(`https://api.example.com/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
}

// Usage
const userService = new UserService();

try {
  const user = await userService.fetchUser('123');
  await userService.updateUser('123', { name: 'John Doe' });
} catch (error) {
  console.error('Service call failed:', error.message);
}
```

> **Note:** To use decorators, ensure your `tsconfig.json` has `"experimentalDecorators": true` and `"emitDecoratorMetadata": true` enabled.

## Contributing

Contributions, issues, and feature requests are welcome! Feel free to check [issues page](https://github.com/apiratorjs/circuit-breaker/issues).

## License

This project is [MIT](./LICENSE) licensed.
