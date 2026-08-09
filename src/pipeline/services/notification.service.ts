import axios from 'axios';
import prisma from '../database/prisma-client';
import { createLogger } from '../logger/logger';

const logger = createLogger('notification-service');

export interface NotificationPayload {
  event: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface NotificationChannel {
  name: string;
  send(payload: NotificationPayload): Promise<boolean>;
}

class WebhookChannel implements NotificationChannel {
  name = 'webhook';
  async send(payload: NotificationPayload) {
    const url = process.env.NOTIFICATION_WEBHOOK_URL;
    if (!url) return false;
    try {
      await axios.post(url, payload, { timeout: 10000 });
      return true;
    } catch (err) {
      logger.warn({ err }, 'Webhook notification failed');
      return false;
    }
  }
}

class TelegramChannel implements NotificationChannel {
  name = 'telegram';
  async send(payload: NotificationPayload) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return false;
    try {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: `*${payload.title}*\n${payload.message}`,
        parse_mode: 'Markdown',
      }, { timeout: 10000 });
      return true;
    } catch (err) {
      logger.warn({ err }, 'Telegram notification failed');
      return false;
    }
  }
}

export const notificationService = {
  async send(payload: NotificationPayload): Promise<void> {
    const channels: NotificationChannel[] = [new WebhookChannel(), new TelegramChannel()];
    await Promise.allSettled(channels.map(async (channel) => {
      let success = false;
      let error: string | undefined;
      try {
        success = await channel.send(payload);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      await prisma.notification.create({
        data: {
          event: payload.event as any,
          channel: channel.name,
          payload: payload as object,
          status: success ? 'sent' : 'failed',
          sentAt: success ? new Date() : undefined,
          error,
        },
      }).catch((dbErr) => logger.warn({ dbErr }, 'Failed to persist notification result'));
    }));
  },
};
