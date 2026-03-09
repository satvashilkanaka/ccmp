import { z } from 'zod';

export const CreateArticleSchema = z.object({
  title: z.string().min(5).max(255),
  content: z.string().min(10),
  category: z.string().min(1).max(100),
  tags: z.array(z.string()).max(20).optional(),
  isPublished: z.boolean().default(false),
});

export const UpdateArticleSchema = CreateArticleSchema.partial();

