import robotsParser from 'robots-parser';
import axios from 'axios';
import { createLogger } from '../logger/logger';

const logger = createLogger('robots-service');

interface RobotsEntry {
  robots: ReturnType<typeof robotsParser>;
  fetchedAt: number;
}

const cache = new Map<string, RobotsEntry>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export class RobotsService {
  async isAllowed(url: string, userAgent = '*'): Promise<boolean> {
    try {
      const parsed = new URL(url);
      const origin = parsed.origin;
      const robotsUrl = `${origin}/robots.txt`;

      const robots = await this.fetchRobots(origin, robotsUrl);
      if (!robots) return true; // Allow if can't fetch

      return robots.isAllowed(url, userAgent) ?? true;
    } catch {
      return true; // Allow on error
    }
  }

  private async fetchRobots(
    origin: string,
    robotsUrl: string
  ): Promise<ReturnType<typeof robotsParser> | null> {
    const cached = cache.get(origin);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return cached.robots;
    }

    try {
      const res = await axios.get<string>(robotsUrl, {
        timeout: 10000,
        headers: { 'User-Agent': 'ScholarshipBot/1.0' },
        validateStatus: (s) => s < 500,
      });

      const content = res.status === 200 ? res.data : '';
      const robots = robotsParser(robotsUrl, content);
      cache.set(origin, { robots, fetchedAt: Date.now() });
      return robots;
    } catch (err) {
      logger.warn({ err, robotsUrl }, 'Failed to fetch robots.txt');
      return null;
    }
  }

  clearCache(): void {
    cache.clear();
  }
}

export const robotsService = new RobotsService();
export default robotsService;
