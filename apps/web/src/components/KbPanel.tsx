'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface KbArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  viewCount: number;
  isPublished: boolean;
  author?: { firstName: string; lastName: string };
}

interface KbPanelProps {
  /** The case subject used for auto-suggest on mount */
  caseSubject?: string;
  /** Called when user clicks "Insert Link" — receives the article URL */
  onInsertLink?: (link: string) => void;
  /** Whether this panel is currently visible */
  isOpen: boolean;
  onClose: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const DEBOUNCE_MS = 350;

export default function KbPanel({ caseSubject, onInsertLink, isOpen, onClose }: KbPanelProps) {
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Performs the KB search against the backend. */
  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      const res = await fetch(`${API_BASE}/api/v1/kb/search?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Search failed');
      const data: KbArticle[] = await res.json();
      setArticles(data);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  /** Debounced search invoked on every query keystroke. */
  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), DEBOUNCE_MS);
  };

  /** Auto-suggest on mount: pre-populate with results based on the case subject. */
  useEffect(() => {
    if (isOpen) {
      const initial = caseSubject ?? '';
      setQuery(initial);
      search(initial);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, caseSubject]);

  const handleInsertLink = (article: KbArticle) => {
    const link = `${API_BASE}/api/v1/kb/articles/${article.id}`;
    onInsertLink?.(link);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '400px',
        height: '100vh',
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        borderLeft: '1px solid rgba(99,102,241,.4)',
        boxShadow: '-4px 0 32px rgba(0,0,0,.5)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        color: '#e2e8f0',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid rgba(99,102,241,.3)',
          background: 'rgba(99,102,241,.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>📚</span>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#a5b4fc' }}>
            Knowledge Base
          </h2>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '20px',
            lineHeight: 1,
            padding: '2px 6px',
            borderRadius: '4px',
          }}
          aria-label="Close KB Panel"
        >
          ×
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(99,102,241,.2)' }}>
        <input
          type="search"
          placeholder="Search articles…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(99,102,241,.4)',
            background: 'rgba(15,23,42,.8)',
            color: '#e2e8f0',
            fontSize: '14px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {caseSubject && (
          <p
            style={{
              margin: '8px 0 0',
              fontSize: '11px',
              color: '#64748b',
            }}
          >
            Auto-suggested for: <em style={{ color: '#818cf8' }}>{caseSubject}</em>
          </p>
        )}
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {loading && (
          <p style={{ textAlign: 'center', color: '#64748b', marginTop: '40px' }}>
            Searching…
          </p>
        )}
        {error && (
          <p style={{ textAlign: 'center', color: '#f87171', marginTop: '40px' }}>
            {error}
          </p>
        )}
        {!loading && !error && articles.length === 0 && (
          <p style={{ textAlign: 'center', color: '#64748b', marginTop: '40px' }}>
            No articles found.
          </p>
        )}
        {!loading && articles.map((article) => (
          <div
            key={article.id}
            style={{
              background: 'rgba(30,41,59,.7)',
              border: '1px solid rgba(99,102,241,.25)',
              borderRadius: '10px',
              padding: '14px 16px',
              marginBottom: '12px',
              transition: 'border-color .2s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,.7)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,.25)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#c7d2fe',
                  flex: 1,
                }}
              >
                {article.title}
              </h3>
              {!article.isPublished && (
                <span
                  style={{
                    fontSize: '10px',
                    background: 'rgba(251,191,36,.15)',
                    color: '#fbbf24',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    marginLeft: '8px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Draft
                </span>
              )}
            </div>
            <p
              style={{
                margin: '0 0 10px',
                fontSize: '12px',
                color: '#94a3b8',
                lineHeight: 1.5,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {article.content}
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  background: 'rgba(99,102,241,.2)',
                  color: '#818cf8',
                  borderRadius: '4px',
                  padding: '2px 8px',
                }}
              >
                {article.category}
              </span>
              <button
                onClick={() => handleInsertLink(article)}
                style={{
                  fontSize: '12px',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(99,102,241,.5)',
                  background: 'rgba(99,102,241,.2)',
                  color: '#a5b4fc',
                  cursor: 'pointer',
                  transition: 'background .15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,.4)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,.2)';
                }}
              >
                Insert Link
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
