import prisma from '../database/prisma-client';

export const auditRepository = {
  async log(data: {
    userId?: string;
    action: string;
    entity: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        before: data.before as object | undefined,
        after: data.after as object | undefined,
        metadata: data.metadata as object | undefined,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  },
};
