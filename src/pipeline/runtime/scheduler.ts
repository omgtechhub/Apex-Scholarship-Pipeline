import { scheduler } from '../scheduler/scheduler';

export function startSchedulerRuntime() {
  scheduler.start();
}

export function stopSchedulerRuntime() {
  scheduler.stop();
}

if (typeof require !== 'undefined' && require.main === module) {
  startSchedulerRuntime();
  const shutdown = () => {
    stopSchedulerRuntime();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
