import type { PrismaClient } from '@prisma/client';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { NotFoundError } from '../../lib/errors.js';
import type { CreateFaqBody, UpdateFaqBody, ListFaqsQuery } from './faq.schema.js';

/**
 * List all FAQ entries, optionally filtered by tag.
 * Returns entries ordered by createdAt ascending.
 */
export async function listFaqs(
  prisma: PrismaClient,
  query?: ListFaqsQuery,
): Promise<Array<{
  id: string;
  question: string;
  answer: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}>> {
  const where = query?.tag ? { tags: { has: query.tag } } : {};

  return prisma.faq.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Get a single FAQ entry by ID.
 * Throws NotFoundError if the FAQ does not exist.
 */
export async function getFaq(
  prisma: PrismaClient,
  id: string,
): Promise<{
  id: string;
  question: string;
  answer: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}> {
  const faq = await prisma.faq.findUnique({ where: { id } });
  if (!faq) throw new NotFoundError('FAQ', id);
  return faq;
}

/**
 * Create a new FAQ entry with audit logging.
 */
export async function createFaq(
  prisma: PrismaClient,
  data: CreateFaqBody,
  actorId?: string,
): Promise<{
  id: string;
  question: string;
  answer: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}> {
  return prisma.$transaction(async (tx) => {
    const faq = await tx.faq.create({
      data: {
        question: data.question,
        answer: data.answer,
        tags: data.tags,
      },
    });

    await writeAuditLog(tx, {
      entityType: 'faq',
      entityId: faq.id,
      action: 'create',
      changes: { question: data.question, answer: data.answer, tags: data.tags },
      actor: getActor(actorId),
    });

    return faq;
  });
}

/**
 * Update an existing FAQ entry with audit logging.
 * Records old vs new values in the audit log.
 */
export async function updateFaq(
  prisma: PrismaClient,
  id: string,
  data: UpdateFaqBody,
  actorId?: string,
): Promise<{
  id: string;
  question: string;
  answer: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.faq.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('FAQ', id);

    const faq = await tx.faq.update({
      where: { id },
      data: {
        ...(data.question !== undefined && { question: data.question }),
        ...(data.answer !== undefined && { answer: data.answer }),
        ...(data.tags !== undefined && { tags: data.tags }),
      },
    });

    // Build changes object with old vs new values
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (data.question !== undefined) {
      changes.question = { old: existing.question, new: data.question };
    }
    if (data.answer !== undefined) {
      changes.answer = { old: existing.answer, new: data.answer };
    }
    if (data.tags !== undefined) {
      changes.tags = { old: existing.tags, new: data.tags };
    }

    await writeAuditLog(tx, {
      entityType: 'faq',
      entityId: faq.id,
      action: 'update',
      changes,
      actor: getActor(actorId),
    });

    return faq;
  });
}

/**
 * Hard-delete a FAQ entry with audit logging.
 * FAQs are ephemeral content, not core business data -- hard delete is appropriate.
 */
export async function deleteFaq(
  prisma: PrismaClient,
  id: string,
  actorId?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.faq.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('FAQ', id);

    await tx.faq.delete({ where: { id } });

    await writeAuditLog(tx, {
      entityType: 'faq',
      entityId: id,
      action: 'delete',
      changes: { question: existing.question, answer: existing.answer, tags: existing.tags },
      actor: getActor(actorId),
    });
  });
}
