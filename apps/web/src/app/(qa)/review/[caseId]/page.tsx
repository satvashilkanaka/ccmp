'use client';

import { useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  ComplianceFlag,
  COMPLIANCE_FLAG_LABELS,
  DEFAULT_QA_RUBRIC,
} from '@ccmp/shared';
import dynamic from 'next/dynamic';
import { PlayerSkeleton } from '../../../../components/PlayerSkeleton';

const RecordingPlayer = dynamic(() => import('../../../../components/RecordingPlayer'), {
  ssr: false,
  loading: () => <PlayerSkeleton />,
});

// ── Types ─────────────────────────────────────────────────────────────────────
interface RubricScore {
  key: string;
  score: number;
}

interface ReviewState {
  scores: Record<string, number>;
  complianceFlags: Set<ComplianceFlag>;
  coachingNotes: string;
  isSubmitting: boolean;
  submitSuccess: boolean;
  submitError: string | null;
}

// ── QA Review Page ────────────────────────────────────────────────────────────
export default function QaReviewPage({ params }: { params: { caseId: string } }) {
  const { caseId } = params;
  const { data: session } = useSession();
  const router = useRouter();

  const audioRef = useRef<HTMLAudioElement>(null);

  // Initialize scores to 0 for each rubric item
  const initialScores = Object.fromEntries(DEFAULT_QA_RUBRIC.map((r: any) => [r.key, 0]));

  const [state, setState] = useState<ReviewState>({
    scores: initialScores,
    complianceFlags: new Set(),
    coachingNotes: '',
    isSubmitting: false,
    submitSuccess: false,
    submitError: null,
  });

  // Optimistic UI: local submitted state before server confirms
  const [optimisticallySubmitted, setOptimisticallySubmitted] = useState(false);

  const setScore = useCallback((key: string, value: number) => {
    const rubricItem = DEFAULT_QA_RUBRIC.find((r: any) => r.key === key);
    if (!rubricItem) return;
    const clamped = Math.max(0, Math.min(value, rubricItem.maxScore));
    setState((prev) => ({
      ...prev,
      scores: { ...prev.scores, [key]: clamped },
    }));
  }, []);

  const toggleFlag = useCallback((flag: ComplianceFlag) => {
    setState((prev) => {
      const next = new Set(prev.complianceFlags);
      if (next.has(flag)) {
        next.delete(flag);
      } else {
        next.add(flag);
      }
      return { ...prev, complianceFlags: next };
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Optimistic UI: show success immediately
    setOptimisticallySubmitted(true);
    setState((prev) => ({ ...prev, isSubmitting: true, submitError: null }));

    const rubricScores: RubricScore[] = DEFAULT_QA_RUBRIC.map((item: any) => ({
      key: item.key,
      score: state.scores[item.key] ?? 0,
    }));

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/v1/qa/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(session as any)?.accessToken || ''}`,
        },
        body: JSON.stringify({
          caseId,
          scores: rubricScores,
          complianceFlags: Array.from(state.complianceFlags),
          coachingNotes: state.coachingNotes || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || 'Submission failed');
      }

      setState((prev) => ({ ...prev, isSubmitting: false, submitSuccess: true }));

      // Navigate back to dashboard after a moment
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (err: any) {
      // Revert optimistic update on error
      setOptimisticallySubmitted(false);
      setState((prev) => ({
        ...prev,
        isSubmitting: false,
        submitError: err.message || 'An error occurred. Please try again.',
      }));
    }
  };

  // Calculated preview
  const previewScore = DEFAULT_QA_RUBRIC.reduce((total: number, item: any) => {
    const s = state.scores[item.key] ?? 0;
    return total + (s / item.maxScore) * item.weightPct;
  }, 0);

  if (state.submitSuccess || optimisticallySubmitted) {
    return (
      <div style={styles.successContainer}>
        <div style={styles.successCard}>
          <div style={styles.successIcon}>✓</div>
          <h2 style={styles.successTitle}>Review Submitted</h2>
          <p style={styles.successText}>
            QA review for case <strong>{caseId}</strong> has been saved successfully.
          </p>
          <p style={styles.successSubtext}>Redirecting to dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>QA Review</h1>
          <p style={styles.subtitle}>Case: <code style={styles.code}>{caseId}</code></p>
        </div>
        <div style={styles.scorePreview}>
          <span style={styles.scoreLabel}>Projected Score</span>
          <span style={styles.scoreValue}>{previewScore.toFixed(1)}%</span>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── Audio Player ─────────────────────────────────────────────── */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>📼 Call Recording</h2>
          <RecordingPlayer
            src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/v1/recordings/${caseId}/playback-url`}
          />
        </section>

        {/* ── Rubric Score Sliders ──────────────────────────────────────── */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>📊 Rubric Scoring</h2>
          <div style={styles.rubricGrid}>
            {DEFAULT_QA_RUBRIC.map((item) => {
              const current = state.scores[item.key] ?? 0;
              const pct = (current / item.maxScore) * 100;
              const contribution = (current / item.maxScore) * item.weightPct;
              return (
                <div key={item.key} style={styles.rubricItem}>
                  <div style={styles.rubricHeader}>
                    <label htmlFor={`score-${item.key}`} style={styles.rubricLabel}>
                      {item.label}
                    </label>
                    <span style={styles.rubricMeta}>
                      Weight: {item.weightPct}% · Contribution: {contribution.toFixed(1)}pts
                    </span>
                  </div>
                  <div style={styles.sliderRow}>
                    <input
                      id={`score-${item.key}`}
                      type="range"
                      min={0}
                      max={item.maxScore}
                      step={0.5}
                      value={current}
                      onChange={(e) => setScore(item.key, parseFloat(e.target.value))}
                      style={styles.slider}
                      aria-label={`${item.label} score`}
                    />
                    <input
                      type="number"
                      min={0}
                      max={item.maxScore}
                      step={0.5}
                      value={current}
                      onChange={(e) => setScore(item.key, parseFloat(e.target.value))}
                      style={styles.numberInput}
                      aria-label={`${item.label} score number`}
                    />
                    <span style={styles.maxScore}>/ {item.maxScore}</span>
                  </div>
                  <div style={styles.progressBar}>
                    <div
                      style={{
                        ...styles.progressFill,
                        width: `${pct}%`,
                        backgroundColor: pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Compliance Flags ──────────────────────────────────────────── */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>🚨 Compliance Flags</h2>
          <p style={styles.sectionHint}>
            Check any compliance issues observed during this interaction.
          </p>
          <div style={styles.flagsGrid}>
            {Object.values(ComplianceFlag).map((flag) => {
              const isChecked = state.complianceFlags.has(flag);
              return (
                <label
                  key={flag}
                  htmlFor={`flag-${flag}`}
                  style={{ ...styles.flagLabel, ...(isChecked ? styles.flagLabelChecked : {}) }}
                >
                  <input
                    id={`flag-${flag}`}
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleFlag(flag)}
                    style={styles.checkbox}
                  />
                  <span style={styles.flagText}>{COMPLIANCE_FLAG_LABELS[flag]}</span>
                </label>
              );
            })}
          </div>
          {state.complianceFlags.size > 0 && (
            <div style={styles.flagWarning}>
              ⚠️ {state.complianceFlags.size} compliance flag{state.complianceFlags.size > 1 ? 's' : ''} selected.
              Compliance officer will be notified automatically.
            </div>
          )}
        </section>

        {/* ── Coaching Notes ────────────────────────────────────────────── */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>📝 Coaching Notes</h2>
          <textarea
            id="coaching-notes"
            value={state.coachingNotes}
            onChange={(e) => setState((prev) => ({ ...prev, coachingNotes: e.target.value }))}
            placeholder="Enter coaching feedback for the agent (optional)…"
            maxLength={4000}
            rows={6}
            style={styles.textarea}
            aria-label="Coaching notes"
          />
          <div style={styles.charCount}>
            {state.coachingNotes.length} / 4000 characters
          </div>
        </section>

        {/* ── Submit ────────────────────────────────────────────────────── */}
        {state.submitError && (
          <div style={styles.errorBanner} role="alert">
            ❌ {state.submitError}
          </div>
        )}

        <div style={styles.submitRow}>
          <button
            type="button"
            onClick={() => router.back()}
            style={styles.cancelButton}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={state.isSubmitting}
            style={{
              ...styles.submitButton,
              opacity: state.isSubmitting ? 0.6 : 1,
              cursor: state.isSubmitting ? 'not-allowed' : 'pointer',
            }}
          >
            {state.isSubmitting ? 'Submitting…' : `Submit Review (${previewScore.toFixed(1)}%)`}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Inline styles ─────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '2rem',
    fontFamily: "'Inter', -apple-system, sans-serif",
    color: '#1e293b',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '2rem',
    paddingBottom: '1.5rem',
    borderBottom: '2px solid #e2e8f0',
  },
  title: { fontSize: '1.75rem', fontWeight: 700, margin: 0, color: '#0f172a' },
  subtitle: { color: '#64748b', marginTop: '0.25rem', fontSize: '0.9rem' },
  code: { fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' },
  scorePreview: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    borderRadius: '12px',
    padding: '1rem 1.5rem',
    color: 'white',
  },
  scoreLabel: { fontSize: '0.75rem', opacity: 0.85, letterSpacing: '0.05em', textTransform: 'uppercase' },
  scoreValue: { fontSize: '2.25rem', fontWeight: 800, lineHeight: 1 },
  section: {
    background: 'white',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  sectionTitle: { fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem', color: '#374151' },
  sectionHint: { color: '#6b7280', fontSize: '0.875rem', margin: '-0.5rem 0 1rem' },
  audioPlayer: { width: '100%', borderRadius: '8px' },
  rubricGrid: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  rubricItem: { borderBottom: '1px solid #f1f5f9', paddingBottom: '1.25rem' },
  rubricHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' },
  rubricLabel: { fontWeight: 500, fontSize: '0.95rem', color: '#374151' },
  rubricMeta: { fontSize: '0.75rem', color: '#9ca3af' },
  sliderRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' },
  slider: { flex: 1, accentColor: '#6366f1' },
  numberInput: {
    width: '60px', padding: '4px 8px', border: '1px solid #d1d5db',
    borderRadius: '6px', fontSize: '0.875rem', textAlign: 'center',
  },
  maxScore: { color: '#9ca3af', fontSize: '0.875rem', whiteSpace: 'nowrap' },
  progressBar: { height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: '3px', transition: 'width 0.2s ease, background-color 0.2s ease' },
  flagsGrid: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  flagLabel: {
    display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
    padding: '0.75rem 1rem', border: '1px solid #e5e7eb',
    borderRadius: '8px', cursor: 'pointer', transition: 'border-color 0.15s',
  },
  flagLabelChecked: { borderColor: '#ef4444', background: '#fef2f2' },
  checkbox: { marginTop: '2px', accentColor: '#ef4444', width: '16px', height: '16px' },
  flagText: { fontSize: '0.9rem', color: '#374151', lineHeight: 1.5 },
  flagWarning: {
    marginTop: '1rem', padding: '0.75rem 1rem',
    background: '#fef3c7', border: '1px solid #fcd34d',
    borderRadius: '8px', fontSize: '0.875rem', color: '#92400e',
  },
  textarea: {
    width: '100%', padding: '0.75rem', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical',
    fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box',
  },
  charCount: { textAlign: 'right', fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' },
  errorBanner: {
    background: '#fef2f2', border: '1px solid #fca5a5',
    padding: '1rem', borderRadius: '8px', marginBottom: '1rem',
    color: '#b91c1c', fontSize: '0.9rem',
  },
  submitRow: { display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' },
  cancelButton: {
    padding: '0.75rem 1.5rem', border: '1px solid #d1d5db',
    borderRadius: '8px', background: 'white', cursor: 'pointer',
    fontSize: '0.9rem', color: '#374151',
  },
  submitButton: {
    padding: '0.75rem 1.75rem',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: 'white', border: 'none', borderRadius: '8px',
    fontSize: '0.95rem', fontWeight: 600,
  },
  successContainer: {
    minHeight: '100vh', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: '#f8fafc',
  },
  successCard: {
    background: 'white', borderRadius: '16px', padding: '3rem',
    textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    maxWidth: '400px',
  },
  successIcon: {
    width: '64px', height: '64px', borderRadius: '50%',
    background: '#d1fae5', display: 'flex', alignItems: 'center',
    justifyContent: 'center', margin: '0 auto 1.5rem',
    fontSize: '1.75rem', color: '#059669',
  },
  successTitle: { fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem' },
  successText: { color: '#475569', lineHeight: 1.6, margin: '0 0 0.5rem' },
  successSubtext: { color: '#94a3b8', fontSize: '0.875rem' },
};
