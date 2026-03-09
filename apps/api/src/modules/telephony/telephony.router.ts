import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { TelephonyActionSchema } from './telephony.dto.js';
import { EslAdapter } from './esl.adapter.js';
import { logger } from '../../lib/logger.js';

export const telephonyRouter = Router();

export let activeEslAdapter: EslAdapter | null = null;
export const setActiveEslAdapter = (adapter: EslAdapter) => {
  activeEslAdapter = adapter;
};

// ── GET /credentials ──────────────────────────────────────────────────────────
// Returns short-lived SIP credentials for the authenticated agent.
// NEVER exposes FreeSWITCH ESL password to the browser.
telephonyRouter.get('/credentials', authenticate, (req: any, res) => {
  const agentId: string = req.user?.id || 'unknown';
  const freeswitchHost = process.env.FREESWITCH_HOST || 'localhost';
  const sipDomain = process.env.SIP_DOMAIN || freeswitchHost;
  const wssPort = process.env.FREESWITCH_WSS_PORT || '7443';

  // Per-agent SIP password derived from a separate secret — never the ESL password
  const sipSecret = process.env.SIP_AGENT_SECRET || 'sip_agent_secret_change_me';
  const sipPassword = jwt.sign({ agentId }, sipSecret, { expiresIn: '15m' });

  return res.json({
    sipUri: `sip:agent-${agentId}@${sipDomain}`,
    wsUri: `wss://${freeswitchHost}:${wssPort}`,
    password: sipPassword,
    expiresIn: 900,
  });
});

// ── POST /pause ───────────────────────────────────────────────────────────────
telephonyRouter.post('/pause', authenticate, validateBody(TelephonyActionSchema), async (req: any, res) => {
  const { callUuid } = req.body;
  if (!activeEslAdapter) return res.status(500).json({ error: 'ESL Adapter not initialized' });

  try {
    await activeEslAdapter.pauseRecording(callUuid, req.user?.id || 'system');
    return res.status(200).json({ status: 'paused', callUuid });
  } catch (err: any) {
    logger.error({ err, callUuid }, 'Failed to pause recording');
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /resume ──────────────────────────────────────────────────────────────
telephonyRouter.post('/resume', authenticate, validateBody(TelephonyActionSchema), async (req: any, res) => {
  const { callUuid } = req.body;
  if (!activeEslAdapter) return res.status(500).json({ error: 'ESL Adapter not initialized' });

  try {
    await activeEslAdapter.resumeRecording(callUuid, req.user?.id || 'system');
    return res.status(200).json({ status: 'resumed', callUuid });
  } catch (err: any) {
    logger.error({ err, callUuid }, 'Failed to resume recording');
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /hold ────────────────────────────────────────────────────────────────
// Browser notifies server when agent puts call on hold (for audit logging).
telephonyRouter.post('/hold', authenticate, validateBody(TelephonyActionSchema), async (req: any, res) => {
  const { callUuid } = req.body;

  try {
    const { prismaWrite } = await import('@ccmp/database');
    await prismaWrite.auditLog.create({
      data: {
        action: 'call_held',
        resourceType: 'TELEPHONY',
        resourceId: callUuid,
        actorId: req.user?.id,
        payload: { callUuid },
      },
    });
    return res.status(200).json({ status: 'held', callUuid });
  } catch (err: any) {
    logger.error({ err, callUuid }, 'Failed to create hold AuditLog');
    return res.status(500).json({ error: err.message });
  }
});
