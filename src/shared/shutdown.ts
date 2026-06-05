/**
 * Process-wide cooperative shutdown flag for graceful interrupts (Ctrl+C / Ctrl+D).
 *
 * The long-running processing loops poll `isRequested()` between units of work
 * (between files in DirectoryProcessor, between chunks in KnowledgeGraphBuilder)
 * and stop cleanly — finishing the in-flight chunk, checkpointing it, and flushing
 * a partial graph — instead of being killed mid-chunk and wasting a paid LLM call.
 *
 * A module singleton keeps this low-ceremony for a single-run CLI: the signal
 * handlers in the CLI flip the flag, the loops read it. No DI plumbing.
 */
class ShutdownController {
  private requested = false;

  isRequested(): boolean {
    return this.requested;
  }

  request(): void {
    this.requested = true;
  }

  reset(): void {
    this.requested = false;
  }
}

export const shutdown = new ShutdownController();
