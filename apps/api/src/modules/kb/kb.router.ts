import { Router } from 'express';
import { prismaRead, prismaWrite, indexArticle, deleteArticleIndex } from '@ccmp/database';
import { requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { CreateArticleSchema, UpdateArticleSchema } from './kb.dto.js';
import { NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export const kbRouter = Router();

const AUTHOR_ROLES = ['SUPERVISOR', 'OPERATIONS_MANAGER', 'ADMIN'];

// ── GET /kb/search ────────────────────────────────────────────────────────────
// AGENT: isPublished=true enforced. SUPERVISOR+: can see drafts.
kbRouter.get('/search', async (req, res) => {
  const { q, category } = req.query;
  const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 50);

  const isAuthor = req.user && AUTHOR_ROLES.includes(req.user.role);

  const where: any = {};
  if (!isAuthor) {
    where.isPublished = true; // AGENT role: only published
  }

  if (category) {
    where.category = category as string;
  }

  if (q) {
    const query = q as string;
    where.OR = [
      { title: { contains: query, mode: 'insensitive' } },
      { content: { contains: query, mode: 'insensitive' } },
      { tags: { has: query } },
    ];
  }

  const articles = await prismaRead.kbArticle.findMany({
    where,
    select: {
      id: true,
      title: true,
      category: true,
      tags: true,
      viewCount: true,
      isPublished: true,
      updatedAt: true,
    },
    orderBy: { viewCount: 'desc' },
    take: limit,
  });

  res.json({ items: articles });
});

// ── GET /kb/articles/:id ──────────────────────────────────────────────────────
// Atomic viewCount increment — NOT read-then-write
kbRouter.get('/articles/:id', async (req, res) => {
  const { id } = req.params;

  const isAuthor = req.user && AUTHOR_ROLES.includes(req.user.role);

  try {
    const article = await prismaWrite.kbArticle.update({
      where: {
        id,
        ...(!isAuthor ? { isPublished: true } : {}), // AGENT cannot fetch drafts
      },
      data: {
        viewCount: { increment: 1 }, // ← atomic, single SQL UPDATE
      },
      include: {
        author: { select: { firstName: true, lastName: true } },
      },
    });

    res.json(article);
  } catch (err: any) {
    if (err.code === 'P2025') {
      throw new NotFoundError(`Knowledge Base article ${id} not found`);
    }
    throw err;
  }
});

// ── POST /kb/articles (SUPERVISOR+) ──────────────────────────────────────────
kbRouter.post('/articles', requireRole(AUTHOR_ROLES), validateBody(CreateArticleSchema), async (req, res) => {
  const { title, content, category, tags, isPublished } = req.body;

  const article = await prismaWrite.kbArticle.create({
    data: {
      title,
      content,
      category,
      tags: tags ?? [],
      isPublished,
      publishedAt: isPublished ? new Date() : null,
      authorId: req.user!.id,
    },
  });

  indexArticle(article).catch(err => logger.error({ err, id: article.id }, 'Meilisearch indexArticle failed'));
  logger.info({ articleId: article.id, authorId: req.user!.id }, 'KB Article created');
  res.status(201).json(article);
});

// ── PATCH /kb/articles/:id (SUPERVISOR+) ─────────────────────────────────────
kbRouter.patch('/articles/:id', requireRole(AUTHOR_ROLES), validateBody(UpdateArticleSchema), async (req, res) => {
  const { id } = req.params;
  const payload: any = { ...req.body };

  if (payload.isPublished === true) {
    payload.publishedAt = new Date();
  } else if (payload.isPublished === false) {
    payload.publishedAt = null;
  }

  try {
    const article = await prismaWrite.kbArticle.update({
      where: { id },
      data: payload,
    });

    indexArticle(article).catch(err => logger.error({ err, id }, 'Meilisearch indexArticle failed'));
    logger.info({ articleId: id, editorId: req.user!.id }, 'KB Article updated');
    res.json(article);
  } catch (err: any) {
    if (err.code === 'P2025') {
      throw new NotFoundError(`Knowledge Base article ${id} not found`);
    }
    throw err;
  }
});

// ── DELETE /kb/articles/:id (ADMIN only) ─────────────────────────────────────
kbRouter.delete('/articles/:id', requireRole(['ADMIN']), async (req, res) => {
  const { id } = req.params;

  try {
    await prismaWrite.kbArticle.delete({ where: { id } });

    deleteArticleIndex(id).catch(err => logger.error({ err, id }, 'Meilisearch deleteArticleIndex failed'));
    logger.info({ articleId: id, actorId: req.user!.id }, 'KB Article deleted');
    res.status(204).end();
  } catch (err: any) {
    if (err.code === 'P2025') {
      throw new NotFoundError(`Knowledge Base article ${id} not found`);
    }
    throw err;
  }
});
