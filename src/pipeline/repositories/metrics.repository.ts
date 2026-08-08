import prisma from '../database/prisma-client';

export const metricsRepository = {
  async record(name: string, value: number, labels?: Record<string, unknown>) {
    return prisma.metric.create({ data: { name, value, labels: labels as object | undefined } });
  },
  async getRecent(hours = 24) {
    const since = new Date(Date.now() - hours * 3600_000);
    return prisma.metric.findMany({ where: { recordedAt: { gte: since } }, orderBy: { recordedAt: 'desc' } });
  },
  async getSummary() {
    const rows = await prisma.metric.groupBy({ by: ['name'], _sum: { value: true }, _count: { _all: true } });
    return rows.map(r => ({ name: r.name, total: r._sum.value ?? 0, count: r._count._all }));
  },
};
