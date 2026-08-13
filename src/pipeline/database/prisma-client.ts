import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';



const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/scholarship_pipeline?schema=public';

const pool = new Pool({ connectionString, allowExitOnIdle: true });
const adapter = new PrismaPg(pool);


const globalForPrisma = globalThis as typeof globalThis & {
  __pipelinePrismaClient?: PrismaClient;
};

export const prisma =
  globalForPrisma.__pipelinePrismaClient ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__pipelinePrismaClient = prisma;
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  await pool.end();
}

export default prisma;


