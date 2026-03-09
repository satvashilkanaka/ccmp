import { MeiliSearch } from 'meilisearch';

const MEILI_HOST = process.env.MEILI_HOST || 'http://localhost:7700';
const MEILI_MASTER_KEY = process.env.MEILI_MASTER_KEY || 'ccmp_master_key';

export const meiliClient = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_MASTER_KEY,
});

/**
 * Ensures the `cases` and `kb_articles` indexes exist with proper attributes.
 */
export async function setupIndexes() {
  try {
    // ── Cases Index ──────────────────────────────────────────────────────────
    const index = meiliClient.index('cases');

    await index.updateFilterableAttributes([
      'status',
      'priority',
      'channel',
      'assignedToId',
      'teamId',
      'queueId',
    ]);

    await index.updateSearchableAttributes([
      'subject',
      'description',
      'caseNumber',
      'customerEmail',
      'customerPhone',
    ]);

    await index.updateSortableAttributes(['createdAt', 'updatedAt', 'slaDueAt']);

    console.log('✅ MeiliSearch: `cases` index configured successfully');

    // ── Knowledge Base Index ─────────────────────────────────────────────────
    const kbIndex = meiliClient.index('kb_articles');

    await kbIndex.updateFilterableAttributes([
      'category',
      'isPublished',
      'authorId',
    ]);

    await kbIndex.updateSearchableAttributes([
      'title',
      'content',
      'tags',
    ]);

    await kbIndex.updateSortableAttributes(['createdAt', 'updatedAt', 'publishedAt', 'viewCount']);

    console.log('✅ MeiliSearch: `kb_articles` index configured successfully');
  } catch (error: any) {
    console.warn(`⚠️ MeiliSearch: Failed to setup indexes (${error.message}). Is Meilisearch running?`);
  }
}

/**
 * Upserts a Case document into Meilisearch.
 */
export async function indexCase(caseData: any) {
  try {
    await meiliClient.index('cases').addDocuments([caseData]);
  } catch (error: any) {
    console.warn(`⚠️ MeiliSearch: Failed to index case ${caseData.id} (${error.message})`);
  }
}

/**
 * Removes a Case document from Meilisearch.
 */
export async function deleteIndex(caseId: string) {
  try {
    await meiliClient.index('cases').deleteDocument(caseId);
  } catch (error: any) {
    console.warn(`⚠️ MeiliSearch: Failed to delete index for case ${caseId} (${error.message})`);
  }
}

/**
 * Upserts a KB Article document into Meilisearch.
 */
export async function indexArticle(article: any) {
  try {
    await meiliClient.index('kb_articles').addDocuments([article]);
  } catch (error: any) {
    console.warn(`⚠️ MeiliSearch: Failed to index article ${article.id} (${error.message})`);
  }
}

/**
 * Removes a KB Article document from Meilisearch.
 */
export async function deleteArticleIndex(articleId: string) {
  try {
    await meiliClient.index('kb_articles').deleteDocument(articleId);
  } catch (error: any) {
    console.warn(`⚠️ MeiliSearch: Failed to delete index for article ${articleId} (${error.message})`);
  }
}
