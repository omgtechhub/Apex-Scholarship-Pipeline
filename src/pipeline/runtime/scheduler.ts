import { scheduler } from '../scheduler/scheduler';
scheduler.start();
const shutdown = () => { scheduler.stop(); process.exit(0); };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
