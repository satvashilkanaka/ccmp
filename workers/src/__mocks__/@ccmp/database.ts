// Manual mock for @ccmp/database
// This file is used as a vitest alias to avoid resolving the real package
// which depends on generated Prisma client files

export const prismaWrite = {
  case: { findUnique: () => null, update: () => null },
  caseEvent: { create: () => null },
  auditLog: { create: () => null },
  slaPolicy: { findUnique: () => null },
  recording: { findUnique: () => null, create: () => null, delete: () => null },
  $transaction: async (fn: any) => fn(prismaWrite),
  $use: () => {},
};

export const prismaRead = {
  case: { findUnique: () => null, findMany: () => [] },
  user: { findUnique: () => null },
};

export const CaseStatus = {
  NEW: 'NEW', ASSIGNED: 'ASSIGNED', IN_PROGRESS: 'IN_PROGRESS',
  WAITING_ON_CUSTOMER: 'WAITING_ON_CUSTOMER', ESCALATED: 'ESCALATED',
  PENDING_CLOSURE: 'PENDING_CLOSURE', RESOLVED: 'RESOLVED', CLOSED: 'CLOSED',
};

export const CaseChannel = {
  PHONE: 'PHONE', EMAIL: 'EMAIL', CHAT: 'CHAT', PORTAL: 'PORTAL',
};

export const CasePriority = {
  LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', URGENT: 'URGENT',
};

export const UserRole = {
  AGENT: 'AGENT', SENIOR_AGENT: 'SENIOR_AGENT', SUPERVISOR: 'SUPERVISOR',
  QA_ANALYST: 'QA_ANALYST', OPERATIONS_MANAGER: 'OPERATIONS_MANAGER',
  COMPLIANCE_OFFICER: 'COMPLIANCE_OFFICER', ADMIN: 'ADMIN',
};

export const meiliClient = { index: () => ({}) };
export const indexCase = async () => {};
export const deleteIndex = async () => {};
export const setupIndexes = async () => {};
