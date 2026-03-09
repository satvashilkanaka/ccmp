export interface CaseNewEvent {
  caseId: string;
  queueId?: string | null;
  priority: string;
  channel: string;
}

export interface CaseAssignedEvent {
  caseId: string;
  agentId: string;
  ruleId?: string;
}

export interface CaseStatusChangedEvent {
  caseId: string;
  oldStatus: string;
  newStatus: string;
}

export interface CaseReassignedEvent {
  caseId: string;
  oldAgentId: string;
  newAgentId: string;
}

export interface SlaWarningEvent {
  caseId: string;
  dueDate: string;
}

export interface SlaBreachedEvent {
  caseId: string;
  breachedAt: string;
}

export interface QueueBacklogEvent {
  queueId?: string | null;
  caseId: string;
}

export interface ServerToClientEvents {
  'case:new': (payload: CaseNewEvent) => void;
  'case:assigned': (payload: CaseAssignedEvent) => void;
  'case:removed': (payload: CaseReassignedEvent) => void;
  'case:status_changed': (payload: CaseStatusChangedEvent) => void;
  'sla:warning': (payload: SlaWarningEvent) => void;
  'sla:breached': (payload: SlaBreachedEvent) => void;
  'queue:backlog': (payload: QueueBacklogEvent) => void;
}

export interface ClientToServerEvents {
  'agent:join': (agentId: string) => void;
  'agent:heartbeat': (payload: { agentId: string; ts: number }) => void;
  'presence:update': (payload: { agentId: string; status: 'ONLINE' | 'OFFLINE' }) => void;
  'case:watch': (caseId: string) => void;
  'supervisor:join': () => void;
}
