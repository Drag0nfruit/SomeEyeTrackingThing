import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PrismaClient } from '../../../node_modules/@prisma/client';

const prisma = new PrismaClient();

interface SessionParams {
  id: string;
}

export default async function exportRoutes(fastify: FastifyInstance) {
  // GET /sessions/:id/export.csv - Export session data as CSV
  fastify.get<{ Params: SessionParams }>('/sessions/:id/export.csv', async (request: FastifyRequest<{ Params: SessionParams }>, reply: FastifyReply) => {
    try {
      const { id: sessionId } = request.params;
      
      // Check if session exists
      const session = await prisma.session.findUnique({
        where: { id: sessionId }
      });
      
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      
      const samples = await prisma.sample.findMany({
        where: { sessionId },
        orderBy: { ts: 'asc' }
      });
      
      // Generate CSV content with proper headers
      const csvHeader = 'timestamp,xRaw,xFiltered,confidence\n';
      const csvRows = samples.map((sample: any) => 
        `${sample.ts},${sample.xRaw},${sample.xFiltered || ''},${sample.confidence || ''}`
      ).join('\n');
      
      const csvContent = csvHeader + csvRows;
      
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="session-${sessionId}.csv"`);
      return reply.send(csvContent);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to export CSV' });
    }
  });

  // GET /sessions/:id/export.json - Export session data as JSON
  fastify.get<{ Params: SessionParams }>('/sessions/:id/export.json', async (request: FastifyRequest<{ Params: SessionParams }>, reply: FastifyReply) => {
    try {
      const { id: sessionId } = request.params;
      
      // Check if session exists
      const session = await prisma.session.findUnique({
        where: { id: sessionId }
      });
      
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      
      const samples = await prisma.sample.findMany({
        where: { sessionId },
        orderBy: { ts: 'asc' }
      });
      
      const exportData = {
        session: {
          id: session.id,
          createdAt: session.createdAt,
          deviceInfo: session.deviceInfo,
          samplingRate: session.samplingRate,
          calibLeft: session.calibLeft,
          calibCenter: session.calibCenter,
          calibRight: session.calibRight
        },
        samples: samples.map((sample: any) => ({
          ts: sample.ts.toString(),
          xRaw: sample.xRaw,
          xFiltered: sample.xFiltered,
          confidence: sample.confidence
        }))
      };
      
      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', `attachment; filename="session-${sessionId}.json"`);
      return reply.send(exportData);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to export JSON' });
    }
  });
} 