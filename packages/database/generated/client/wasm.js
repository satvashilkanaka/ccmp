
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  firstName: 'firstName',
  lastName: 'lastName',
  role: 'role',
  teamId: 'teamId',
  isActive: 'isActive',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TeamScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  supervisorId: 'supervisorId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CaseScalarFieldEnum = {
  id: 'id',
  caseNumber: 'caseNumber',
  subject: 'subject',
  description: 'description',
  status: 'status',
  priority: 'priority',
  channel: 'channel',
  customerId: 'customerId',
  customerEmail: 'customerEmail',
  customerPhone: 'customerPhone',
  assignedToId: 'assignedToId',
  teamId: 'teamId',
  queueId: 'queueId',
  slaPolicyId: 'slaPolicyId',
  slaDueAt: 'slaDueAt',
  slaBreachedAt: 'slaBreachedAt',
  metadata: 'metadata',
  version: 'version',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CaseEventScalarFieldEnum = {
  id: 'id',
  caseId: 'caseId',
  eventType: 'eventType',
  payload: 'payload',
  actorId: 'actorId',
  createdAt: 'createdAt'
};

exports.Prisma.CaseNoteScalarFieldEnum = {
  id: 'id',
  caseId: 'caseId',
  content: 'content',
  authorId: 'authorId',
  isInternal: 'isInternal',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AttachmentScalarFieldEnum = {
  id: 'id',
  caseId: 'caseId',
  filename: 'filename',
  mimeType: 'mimeType',
  sizeBytes: 'sizeBytes',
  storageKey: 'storageKey',
  uploadedById: 'uploadedById',
  createdAt: 'createdAt'
};

exports.Prisma.QueueScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SlaPolicyScalarFieldEnum = {
  id: 'id',
  name: 'name',
  priority: 'priority',
  channel: 'channel',
  responseTimeMinutes: 'responseTimeMinutes',
  resolutionTimeMinutes: 'resolutionTimeMinutes',
  warningThresholdPct: 'warningThresholdPct',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RoutingRuleScalarFieldEnum = {
  id: 'id',
  name: 'name',
  conditions: 'conditions',
  actions: 'actions',
  priorityOrder: 'priorityOrder',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RecordingScalarFieldEnum = {
  id: 'id',
  caseId: 'caseId',
  callUuid: 'callUuid',
  filename: 'filename',
  storageKey: 'storageKey',
  durationSeconds: 'durationSeconds',
  fileSizeBytes: 'fileSizeBytes',
  encryptionAlgorithm: 'encryptionAlgorithm',
  isPaused: 'isPaused',
  retentionExpiresAt: 'retentionExpiresAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.QaReviewScalarFieldEnum = {
  id: 'id',
  caseId: 'caseId',
  reviewerId: 'reviewerId',
  scores: 'scores',
  totalScore: 'totalScore',
  complianceFlags: 'complianceFlags',
  coachingNotes: 'coachingNotes',
  reviewedAt: 'reviewedAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  actorId: 'actorId',
  actorEmail: 'actorEmail',
  action: 'action',
  resourceType: 'resourceType',
  resourceId: 'resourceId',
  payload: 'payload',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent',
  createdAt: 'createdAt'
};

exports.Prisma.CsatResponseScalarFieldEnum = {
  id: 'id',
  caseId: 'caseId',
  token: 'token',
  score: 'score',
  feedback: 'feedback',
  submittedAt: 'submittedAt',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt'
};

exports.Prisma.KbArticleScalarFieldEnum = {
  id: 'id',
  title: 'title',
  content: 'content',
  category: 'category',
  tags: 'tags',
  authorId: 'authorId',
  viewCount: 'viewCount',
  isPublished: 'isPublished',
  publishedAt: 'publishedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.NotificationPreferenceScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  emailOnAssign: 'emailOnAssign',
  emailOnSlaWarning: 'emailOnSlaWarning',
  emailOnSlaBreach: 'emailOnSlaBreach',
  emailOnQaReview: 'emailOnQaReview',
  emailDailySummary: 'emailDailySummary',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.UserRole = exports.$Enums.UserRole = {
  AGENT: 'AGENT',
  SENIOR_AGENT: 'SENIOR_AGENT',
  SUPERVISOR: 'SUPERVISOR',
  QA_ANALYST: 'QA_ANALYST',
  OPERATIONS_MANAGER: 'OPERATIONS_MANAGER',
  COMPLIANCE_OFFICER: 'COMPLIANCE_OFFICER',
  ADMIN: 'ADMIN'
};

exports.CaseStatus = exports.$Enums.CaseStatus = {
  NEW: 'NEW',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_ON_CUSTOMER: 'WAITING_ON_CUSTOMER',
  ESCALATED: 'ESCALATED',
  PENDING_CLOSURE: 'PENDING_CLOSURE',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED'
};

exports.CasePriority = exports.$Enums.CasePriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

exports.CaseChannel = exports.$Enums.CaseChannel = {
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
  CHAT: 'CHAT',
  SOCIAL: 'SOCIAL',
  WALK_IN: 'WALK_IN'
};

exports.Prisma.ModelName = {
  User: 'User',
  Team: 'Team',
  Case: 'Case',
  CaseEvent: 'CaseEvent',
  CaseNote: 'CaseNote',
  Attachment: 'Attachment',
  Queue: 'Queue',
  SlaPolicy: 'SlaPolicy',
  RoutingRule: 'RoutingRule',
  Recording: 'Recording',
  QaReview: 'QaReview',
  AuditLog: 'AuditLog',
  CsatResponse: 'CsatResponse',
  KbArticle: 'KbArticle',
  NotificationPreference: 'NotificationPreference'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
