import { PrismaClient } from '../../../generated/prisma';

const globalForPrisma = globalThis as typeof globalThis & {
  __pipelinePrismaClient?: PrismaClient;
};

export const prisma =
  globalForPrisma.__pipelinePrismaClient ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__pipelinePrismaClient = prisma;
}

export default prisma;
