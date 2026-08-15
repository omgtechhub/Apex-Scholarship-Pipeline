export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.ENABLE_BACKGROUND_PIPELINE !== 'false') {
      setImmediate(async () => {
        try {
          const { startWorkers } = await import('./pipeline/runtime/worker');
          const { startSchedulerRuntime } = await import('./pipeline/runtime/scheduler');
          startWorkers();
          startSchedulerRuntime();
        } catch (err) {
          console.error('[INSTRUMENTATION ERROR] Failed to start background pipeline:', err);
        }
      });
    }
  }
}
