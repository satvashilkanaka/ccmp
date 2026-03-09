import { PrismaClient } from '../generated/client/index.js';

const globalForPrisma = globalThis as unknown as {
  prismaWrite: PrismaClient | undefined;
  prismaRead: PrismaClient | undefined;
};

export const prismaWrite =
  globalForPrisma.prismaWrite ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

export const prismaRead =
  globalForPrisma.prismaRead ??
  new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_READ_URL || process.env.DATABASE_URL },
    },
    log: ['error'],
  });

// Soft-delete middleware — auto-filter deletedAt records on prismaWrite only

prismaWrite.$use(async (params, next) => {
  // 1. Transform hard deletes into soft deletes
  if (params.model === 'Case' || params.model === 'User') {
    if (params.action === 'delete') {
      params.action = 'update';
      params.args.data = { deletedAt: new Date() };
    }
    if (params.action === 'deleteMany') {
      params.action = 'updateMany';
      if (params.args.data !== undefined) {
        params.args.data.deletedAt = new Date();
      } else {
        params.args.data = { deletedAt: new Date() };
      }
    }
  }

  // 2. Filter out soft-deleted records for find operations
  if (
    ['findMany', 'findFirst', 'findUnique'].includes(params.action ?? '')
  ) {
    if (params.model === 'Case' || params.model === 'User') {
      params.args = params.args ?? {};
      params.args.where = { ...params.args.where, deletedAt: null };
    }
  }

  const result = await next(params);

  // 3. Sync with Meilisearch if a Case was soft-deleted
  if (
    params.model === 'Case' &&
    (params.action === 'update' || params.action === 'updateMany') &&
    params.args.data?.deletedAt
  ) {
    const { deleteIndex } = await import('./search/meilisearch.js');
    if (params.action === 'update' && params.args.where?.id) {
      deleteIndex(params.args.where.id).catch(console.error);
    }
  }

  return result;
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaWrite = prismaWrite;
  globalForPrisma.prismaRead = prismaRead;
}


export * from '../generated/client/index.js';
export * from './search/meilisearch.js';
