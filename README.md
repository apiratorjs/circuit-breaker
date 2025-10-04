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
import { CircuitBreaker, CircuitOpenError } from '@apiratorjs/circuit-breaker';

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
  if (error instanceof CircuitOpenError) {
    console.error('Circuit is open - service temporarily unavailable');
  } else {
    console.error('Service call failed:', error.message);
  }
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

## Error Handling

The circuit breaker throws specific error types that you can catch and handle appropriately:

### Error Types

#### CircuitOpenError
Thrown when the circuit breaker is in the **OPEN** state and prevents execution of the wrapped function.

```typescript
import { CircuitBreaker, CircuitOpenError } from '@apiratorjs/circuit-breaker';

const circuitBreaker = new CircuitBreaker(riskyOperation, {
  failureThreshold: 3,
  durationOfBreakInMs: 30000,
  successThreshold: 2
});

try {
  await circuitBreaker.execute();
} catch (error) {
  if (error instanceof CircuitOpenError) {
    console.log('Circuit is open, service is temporarily unavailable');
    console.log('Original cause:', error.cause?.message);
  }
}
```

#### CircuitArgumentError
Thrown when invalid configuration options are provided to the circuit breaker constructor.

```typescript
try {
  // This will throw CircuitArgumentError
  const circuitBreaker = new CircuitBreaker(myFunction, {
    failureThreshold: 0, // Invalid: must be > 0
    durationOfBreakInMs: 30000,
    successThreshold: 2
  });
} catch (error) {
  if (error instanceof CircuitArgumentError) {
    console.log('Invalid configuration:', error.message);
  }
}
```

#### CircuitBreakerError
Base class for all circuit breaker errors. Contains additional error information:

```typescript
import { CircuitBreakerError } from '@apiratorjs/circuit-breaker';

try {
  await circuitBreaker.execute();
} catch (error) {
  if (error instanceof CircuitBreakerError) {
    console.log('Circuit breaker error:', error.toJSON());
    // Output includes: name, message, cause (if available)
  }
}
```

## State Change Monitoring

You can subscribe to state changes to monitor your circuit breaker's behavior and implement custom logging, metrics, or alerting.

### onStateChange Method

The `onStateChange` method allows you to register a callback that will be called whenever the circuit breaker changes state:

```typescript
import { CircuitBreaker, ECircuitBreakerState } from '@apiratorjs/circuit-breaker';

const circuitBreaker = new CircuitBreaker(riskyOperation, {
  failureThreshold: 3,
  durationOfBreakInMs: 30000,
  successThreshold: 2
});

// Subscribe to state changes
circuitBreaker.onStateChange((newState, error) => {
  console.log(`Circuit breaker state changed to: ${newState}`);
  
  switch (newState) {
    case ECircuitBreakerState.OPEN:
      console.log('⚠️  Circuit opened due to failures');
      if (error) {
        console.log('Last error:', error.message);
      }
      // Send alert, update metrics, etc.
      break;
      
    case ECircuitBreakerState.HALF_OPEN:
      console.log('🔄 Circuit is testing recovery');
      // Log recovery attempt
      break;
      
    case ECircuitBreakerState.CLOSED:
      console.log('✅ Circuit closed - service is healthy');
      // Log successful recovery
      break;
  }
});
```

### Advanced State Monitoring Example

```typescript
class CircuitBreakerMonitor {
  private metrics = {
    stateChanges: 0,
    totalFailures: 0,
    recoveryAttempts: 0
  };

  constructor(private circuitBreaker: CircuitBreaker) {
    this.setupMonitoring();
  }

  private setupMonitoring() {
    this.circuitBreaker.onStateChange((state, error) => {
      this.metrics.stateChanges++;
      
      switch (state) {
        case ECircuitBreakerState.OPEN:
          this.metrics.totalFailures++;
          this.onCircuitOpened(error);
          break;
          
        case ECircuitBreakerState.HALF_OPEN:
          this.metrics.recoveryAttempts++;
          this.onRecoveryAttempt();
          break;
          
        case ECircuitBreakerState.CLOSED:
          this.onCircuitClosed();
          break;
      }
    });
  }

  private onCircuitOpened(error?: Error) {
    console.log('🚨 ALERT: Circuit breaker opened');
    console.log('Error details:', error?.message);
    
    // Send to monitoring system
    // this.sendAlert('circuit_breaker_opened', { error: error?.message });
  }

  private onRecoveryAttempt() {
    console.log('🔄 Circuit breaker attempting recovery');
    
    // Log recovery attempt
    // this.logMetric('circuit_breaker_recovery_attempt');
  }

  private onCircuitClosed() {
    console.log('✅ Circuit breaker recovered successfully');
    
    // Log successful recovery
    // this.logMetric('circuit_breaker_recovered');
  }

  public getMetrics() {
    return {
      ...this.metrics,
      currentState: this.circuitBreaker.state
    };
  }
}

// Usage
const monitor = new CircuitBreakerMonitor(circuitBreaker);

// Check metrics
console.log(monitor.getMetrics());
```


### Complete Example with Error Handling and State Monitoring

```typescript
import { 
  CircuitBreaker, 
  ECircuitBreakerState, 
  CircuitOpenError,
  CircuitBreakerError 
} from '@apiratorjs/circuit-breaker';

// Define your risky operation
async function riskyOperation(data: any) {
  // Simulate a service that fails sometimes
  if (Math.random() < 0.7) {
    throw new Error('Service temporarily unavailable');
  }
  return { success: true, data };
}

const circuitBreaker = new CircuitBreaker(riskyOperation, {
  failureThreshold: 3,
  durationOfBreakInMs: 30000,
  successThreshold: 2
});

// Set up comprehensive state change monitoring
circuitBreaker.onStateChange((state, error) => {
  console.log(`🔄 Circuit breaker state changed to: ${state}`);
  if (error) {
    console.log(`Triggered by error: ${error.message}`);
  }
});

// Example usage with proper error handling
async function makeServiceCall(data: any) {
  try {
    const result = await circuitBreaker.execute(data);
    console.log('✅ Service call successful:', result);
    return result;
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      console.log('⚠️  Circuit is open - service temporarily unavailable');
      console.log('Original cause:', error.cause?.message);
      // Handle circuit open scenario (e.g., return cached data, show user message)
    } else if (error instanceof CircuitBreakerError) {
      console.log('🔧 Circuit breaker error:', error.toJSON());
    } else {
      console.log('❌ Service call failed:', error.message);
      // Handle other service errors
    }
    throw error;
  }
}

// Check current state
console.log('Current state:', circuitBreaker.state);

// Example of multiple calls to demonstrate state changes
async function demonstrateCircuitBreaker() {
  for (let i = 0; i < 10; i++) {
    try {
      await makeServiceCall({ attempt: i + 1 });
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    } catch (error) {
      // Continue with next attempt
    }
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
