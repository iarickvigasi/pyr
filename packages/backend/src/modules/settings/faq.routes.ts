import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createFaqSchema,
  updateFaqSchema,
  listFaqsQuerySchema,
  faqIdParamSchema,
  faqResponseSchema,
  faqListResponseSchema,
} from './faq.schema.js';
import {
  listFaqs,
  getFaq,
  createFaq,
  updateFaq,
  deleteFaq,
} from './faq.service.js';

export default async function faqRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.addHook('onRequest', app.authenticate);

  // GET / -- List all FAQs (optional tag filter via query)
  server.get('/', {
    schema: {
      tags: ['FAQ'],
      summary: 'List all FAQ entries',
      querystring: listFaqsQuerySchema,
      response: { 200: faqListResponseSchema },
    },
  }, async (request) => {
    const query = request.query as { tag?: string };
    const faqs = await listFaqs(app.prisma, query);
    return { data: faqs };
  });

  // GET /:id -- Get single FAQ
  server.get('/:id', {
    schema: {
      tags: ['FAQ'],
      summary: 'Get a single FAQ entry',
      params: faqIdParamSchema,
      response: { 200: faqResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const faq = await getFaq(app.prisma, id);
    return { data: faq };
  });

  // POST / -- Create FAQ
  server.post('/', {
    schema: {
      tags: ['FAQ'],
      summary: 'Create a new FAQ entry',
      body: createFaqSchema,
      response: { 201: faqResponseSchema },
    },
  }, async (request, reply) => {
    const body = request.body as { question: string; answer: string; tags: string[] };
    const faq = await createFaq(app.prisma, body, request.user?.sub);
    return reply.code(201).send({ data: faq });
  });

  // PATCH /:id -- Update FAQ
  server.patch('/:id', {
    schema: {
      tags: ['FAQ'],
      summary: 'Update an existing FAQ entry',
      params: faqIdParamSchema,
      body: updateFaqSchema,
      response: { 200: faqResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { question?: string; answer?: string; tags?: string[] };
    const faq = await updateFaq(app.prisma, id, body, request.user?.sub);
    return { data: faq };
  });

  // DELETE /:id -- Delete FAQ
  server.delete('/:id', {
    schema: {
      tags: ['FAQ'],
      summary: 'Delete a FAQ entry',
      params: faqIdParamSchema,
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await deleteFaq(app.prisma, id, request.user?.sub);
    return reply.code(204).send();
  });
}
