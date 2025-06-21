import { ServiceRegistration, ServiceFactory } from "./ContainerFactory";

/**
 * Simple but powerful Dependency Injection Container
 * Supports async factories, singletons, and circular dependency detection
 */

export class DIContainer {
  private services = new Map<symbol | string, ServiceRegistration>();
  private resolving = new Set<symbol | string>();

  /**
   * Register a service factory
   */
  register<T>(
    identifier: symbol | string,
    factory: ServiceFactory<T>,
    options: { singleton?: boolean; } = {}
  ): void {
    this.services.set(identifier, {
      factory,
      singleton: options.singleton ?? true,
    });
  }

  /**
   * Register a singleton value
   */
  registerValue<T>(identifier: symbol | string, value: T): void {
    this.services.set(identifier, {
      factory: () => value,
      singleton: true,
      instance: value,
    });
  }

  /**
   * Resolve a service
   */
  async resolve<T>(identifier: symbol | string): Promise<T> {
    const registration = this.services.get(identifier);

    if (!registration) {
      throw new Error(`Service not registered: ${String(identifier)}`);
    }

    // Check for circular dependencies
    if (this.resolving.has(identifier)) {
      throw new Error(`Circular dependency detected: ${String(identifier)}`);
    }

    // Return existing singleton instance if available
    if (registration.singleton && registration.instance) {
      return registration.instance as T;
    }

    try {
      this.resolving.add(identifier);

      // Create new instance
      const instance = await registration.factory(this);

      // Store singleton instance
      if (registration.singleton) {
        registration.instance = instance;
      }

      return instance as T;
    } finally {
      this.resolving.delete(identifier);
    }
  }

  /**
   * Check if a service is registered
   */
  has(identifier: symbol | string): boolean {
    return this.services.has(identifier);
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.services.clear();
    this.resolving.clear();
  }

  /**
   * Create a child container with inherited registrations
   */
  createChildContainer(): DIContainer {
    const child = new DIContainer();

    // Copy all registrations (but not instances)
    for (const [key, registration] of this.services) {
      child.services.set(key, {
        factory: registration.factory,
        singleton: registration.singleton,
      });
    }

    return child;
  }
}
