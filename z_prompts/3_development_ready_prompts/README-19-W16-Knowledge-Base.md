# WEEK 16 — Knowledge Base
## Search + CRUD + Agent Desktop Integration · Phase 3 · CCMP

> **Prerequisite:** Week 15 complete.
> **Paste this entire file into your AI IDE.**

---

## 📋 TASK

**Files to create:**
- Full `kb.router.ts` with: `GET /kb/search?q=&category=`, `GET /kb/articles/:id`, `POST /kb/articles` (SUPERVISOR+), `PATCH /kb/articles/:id` (SUPERVISOR+), `DELETE /kb/articles/:id` (ADMIN).
- Meilisearch `kb_articles` index in `setupIndexes()`: searchable on `title, content, tags`, filterable on `category, isPublished`.
- `apps/web/src/components/KbPanel.tsx` — slide-out panel on agent desktop. Auto-suggests articles based on case `subject` (debounced search on mount). Click to insert article link into CaseNote.
**Constraints:**
- `viewCount` increment: atomic Prisma increment — not read-then-write
- KB search must filter `isPublished: true` for AGENT role
- SUPERVISOR+ can see unpublished drafts

---

## ✅ VERIFICATION STEP

```bash
# Run tests and verify output for this week
pnpm test

# Then commit:
git add . && git commit -m "feat: w16 knowledge base complete"
```

**Next:** `README-20-W17-Observability.md`
