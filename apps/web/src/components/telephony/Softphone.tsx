'use client';

import React from 'react';
import { useSoftphone, SoftphoneState } from '../../hooks/useSoftphone';
import { useSession } from 'next-auth/react';

const STATE_COLORS: Record<SoftphoneState, string> = {
  idle: '#6b7280',
  ringing: '#f59e0b',
  connecting: '#3b82f6',
  connected: '#10b981',
  ended: '#ef4444',
};

const STATE_LABELS: Record<SoftphoneState, string> = {
  idle: 'Ready',
  ringing: '📞 Incoming Call...',
  connecting: 'Connecting...',
  connected: '🟢 Connected',
  ended: 'Call Ended',
};

export default function Softphone() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken ?? '';

  const {
    state,
    isMuted,
    isOnHold,
    answer,
    hangup,
    mute,
    unmute,
    hold,
    unhold,
    pauseRecording,
    resumeRecording,
  } = useSoftphone(token);

  const stateColor = STATE_COLORS[state];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '280px',
        background: '#1f2937',
        border: `2px solid ${stateColor}`,
        borderRadius: '16px',
        padding: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        zIndex: 9999,
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#f9fafb',
        transition: 'border-color 0.3s ease',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: stateColor,
            boxShadow: state !== 'idle' ? `0 0 8px ${stateColor}` : 'none',
            animation: state === 'ringing' ? 'pulse 1s infinite' : 'none',
          }}
        />
        <span style={{ fontSize: '14px', fontWeight: 600 }}>{STATE_LABELS[state]}</span>
      </div>

      {/* Call Controls */}
      {state === 'ringing' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button
            onClick={answer}
            style={btnStyle('#10b981')}
            aria-label="Answer call"
          >
            ✅ Answer
          </button>
          <button
            onClick={hangup}
            style={btnStyle('#ef4444')}
            aria-label="Decline call"
          >
            ❌ Decline
          </button>
        </div>
      )}

      {state === 'connected' && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <button onClick={hangup} style={btnStyle('#ef4444')} aria-label="Hang up">
              📵 Hang Up
            </button>
            <button
              onClick={isMuted ? unmute : mute}
              style={btnStyle(isMuted ? '#f59e0b' : '#6b7280')}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇 Unmute' : '🎤 Mute'}
            </button>
            <button
              onClick={isOnHold ? unhold : hold}
              style={btnStyle(isOnHold ? '#3b82f6' : '#6b7280')}
              aria-label={isOnHold ? 'Resume' : 'Hold'}
            >
              {isOnHold ? '▶ Resume' : '⏸ Hold'}
            </button>
          </div>

          {/* Recording controls */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={pauseRecording}
              style={{ ...btnStyle('#6b7280'), fontSize: '11px' }}
              aria-label="Pause recording"
            >
              ⏸ Pause Rec
            </button>
            <button
              onClick={resumeRecording}
              style={{ ...btnStyle('#6b7280'), fontSize: '11px' }}
              aria-label="Resume recording"
            >
              ▶ Resume Rec
            </button>
          </div>
        </>
      )}

      {(state === 'idle' || state === 'ended') && (
        <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
          Waiting for incoming calls...
        </p>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    flex: 1,
    padding: '8px 10px',
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    whiteSpace: 'nowrap',
  };
}
