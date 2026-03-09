export const ROLE_PERMISSIONS = {
  AGENT: [
    'case:read:own', 'case:create', 'case:update:own', 'note:create',
    'attachment:upload', 'presence:update', 'kb:read',
  ],
  SENIOR_AGENT: [
    'case:read:own', 'case:read:team', 'case:create', 'case:update:own',
    'note:create', 'attachment:upload', 'presence:update', 'kb:read',
  ],
  SUPERVISOR: [
    'case:read:all', 'case:create', 'case:update:all', 'case:reassign',
    'case:escalate', 'case:sla:override', 'note:create', 'attachment:upload',
    'presence:update', 'kb:read', 'kb:write', 'queue:read', 'routing:read',
    'routing:dry-run', 'reports:read',
  ],
  QA_ANALYST: [
    'case:read:all', 'qa:read', 'qa:write', 'recording:playback',
    'audit:read', 'kb:read',
  ],
  OPERATIONS_MANAGER: [
    'case:read:all', 'case:update:all', 'case:reassign', 'case:escalate',
    'reports:read', 'reports:export', 'queue:read', 'sla:read', 'kb:read', 'kb:write',
  ],
  COMPLIANCE_OFFICER: [
    'audit:read', 'audit:export', 'case:read:all', 'recording:playback',
    'compliance:read',
  ],
  ADMIN: ['*'], // wildcard — all permissions
} as const;

export type UserRole = keyof typeof ROLE_PERMISSIONS;

export function hasPermission(role: UserRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role] as readonly string[];
  return perms.includes('*') || perms.includes(permission);
}
