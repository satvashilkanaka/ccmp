// ── Compliance Flags ──────────────────────────────────────────────────────────

export enum ComplianceFlag {
  PCI_DTMF_PAUSE_NOT_USED = 'PCI_DTMF_PAUSE_NOT_USED',
  AGENT_ID_NOT_VERIFIED = 'AGENT_ID_NOT_VERIFIED',
  SENSITIVE_DATA_SPOKEN = 'SENSITIVE_DATA_SPOKEN',
  CALL_ABRUPTLY_ENDED = 'CALL_ABRUPTLY_ENDED',
  SLA_MISREPRESENTED = 'SLA_MISREPRESENTED',
}

export const COMPLIANCE_FLAG_LABELS: Record<ComplianceFlag, string> = {
  [ComplianceFlag.PCI_DTMF_PAUSE_NOT_USED]: 'PCI: DTMF pause not used for card capture',
  [ComplianceFlag.AGENT_ID_NOT_VERIFIED]: 'Agent identity not verified at call start',
  [ComplianceFlag.SENSITIVE_DATA_SPOKEN]: 'Sensitive data spoken aloud (card/SSN/DOB)',
  [ComplianceFlag.CALL_ABRUPTLY_ENDED]: 'Call ended abruptly without proper close',
  [ComplianceFlag.SLA_MISREPRESENTED]: 'SLA timing misrepresented to customer',
};

// ── Rubric Item ───────────────────────────────────────────────────────────────

export interface QaRubricItem {
  /** Unique key for this criterion */
  key: string;
  /** Human-readable label */
  label: string;
  /** Weight as a percentage (all items must sum to 100) */
  weightPct: number;
  /** Maximum achievable score for this item */
  maxScore: number;
}

export interface QaRubricScore {
  /** Must match a QaRubricItem key */
  key: string;
  /** Score achieved — must be ≤ maxScore */
  score: number;
}

// ── Standard CCMP QA Rubric ───────────────────────────────────────────────────

export const DEFAULT_QA_RUBRIC: QaRubricItem[] = [
  { key: 'greeting',        label: 'Professional Greeting',     weightPct: 10, maxScore: 10 },
  { key: 'verification',    label: 'Customer Verification',      weightPct: 15, maxScore: 10 },
  { key: 'empathy',         label: 'Empathy & Active Listening', weightPct: 20, maxScore: 10 },
  { key: 'resolution',      label: 'Resolution Quality',         weightPct: 25, maxScore: 10 },
  { key: 'compliance',      label: 'Compliance Adherence',       weightPct: 20, maxScore: 10 },
  { key: 'close',           label: 'Call Close',                 weightPct: 10, maxScore: 10 },
];

// ── Review Input/Output ───────────────────────────────────────────────────────

export interface CreateQaReviewInput {
  caseId: string;
  reviewerId: string;
  rubric: QaRubricItem[];
  scores: QaRubricScore[];
  complianceFlags: ComplianceFlag[];
  coachingNotes?: string;
}

export interface QaReviewResult {
  id: string;
  caseId: string;
  reviewerId: string;
  totalScore: number;
  complianceFlags: ComplianceFlag[];
  coachingNotes?: string | null;
  reviewedAt: Date;
}
