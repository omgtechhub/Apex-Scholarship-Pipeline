import { Worker, Job } from 'bullmq';
import axios from 'axios';
import { createRedisConnection } from '../queue/redis-client';
import { QUEUES } from '../queue/queue-names';
import { createLogger } from '../logger/logger';
import prisma from '../database/prisma-client';

const logger = createLogger('notification-worker');

interface NotificationPayload {
  event: string;
  channel?: 'webhook' | 'telegram' | 'email';
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export function createNotificationWorker(): Worker {
  const worker = new Worker(QUEUES.NOTIFICATION, async (job: Job) => {
    const payload = job.data as NotificationPayload;
    const channel = payload.channel ?? 'webhook';
    try {
      if (channel === 'webhook') await sendWebhook(payload);
      else if (channel === 'telegram') await sendTelegram(payload);
      else if (channel === 'email') await sendEmail(payload);
      await prisma.notification.create({
        data: { event: payload.event as any, channel, payload: payload as any, status: 'sent', sentAt: new Date() },
      });
    } catch (error) {
      await prisma.notification.create({
        data: { event: payload.event as any, channel, payload: payload as any, status: 'failed', error: String(error) },
      }).catch(() => undefined);
      throw error;
    }
  }, { connection: createRedisConnection(), concurrency: 3 });
  worker.on('failed', (job, error) => logger.error({ jobId: job?.id, error }, 'Notification failed'));
  return worker;
}

async function sendWebhook(payload: NotificationPayload): Promise<void> {
  const url = process.env.NOTIFICATION_WEBHOOK_URL;
  if (!url) return;
  await axios.post(url, payload, { timeout: 10_000, headers: process.env.PUBLISHING_WEBHOOK_SECRET ? { 'X-Webhook-Secret': process.env.PUBLISHING_WEBHOOK_SECRET } : undefined });
}

async function sendTelegram(payload: NotificationPayload): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: chatId, text: `*${payload.subject ?? payload.event}*\n\n${payload.body}`, parse_mode: 'Markdown' }, { timeout: 10_000 });
}

async function sendEmail(payload: NotificationPayload): Promise<void> {
  // Provider abstraction point. SMTP transport can be added without changing the worker contract.
  logger.info({ subject: payload.subject }, 'Email notification queued; SMTP provider not configured');
}
