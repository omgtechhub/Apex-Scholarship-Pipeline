/*
 * Load .env before anything else imports a client that reads it.
 *
 * This file is a process entry point: `npx tsx src/pipeline/runtime/worker.ts`
 * and the WORKER/SCHEDULER legs of `npm run start:all` each boot their own
 * Node process, and nothing in the import chain called dotenv. Next.js loads
 * .env for the web process only, so these two got an empty environment - no
 * DATABASE_URL, no REDIS_URL, no GROQ_API_KEY.
 *
 * The failure mode is the dangerous kind: node-cron still schedules, the
 * process stays alive, and every tick fails silently against a database it
 * cannot reach. It looks like it is running.
 */
import 'dotenv/config';
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
