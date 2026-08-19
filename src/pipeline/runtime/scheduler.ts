import { scheduler } from '../scheduler/scheduler';
import { createLogger } from '../logger/logger';

const logger = createLogger('scheduler-runtime');

export function startSchedulerRuntime() {
  scheduler.start();
}

export function stopSchedulerRuntime() {
  scheduler.stop();
}

if (typeof require !== 'undefined' && require.main === module) {
  try {
    startSchedulerRuntime();
  } catch (err) {
    logger.error({ err }, 'Scheduler process startup failed');
    process.exit(1);
  }
  const shutdown = () => {
    stopSchedulerRuntime();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
