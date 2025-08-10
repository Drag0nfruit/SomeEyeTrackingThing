import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PrismaClient } from '../../../node_modules/@prisma/client';

const prisma = new PrismaClient();

interface CreateSessionBody {
  deviceInfo?: string;
  samplingRate: number;
  calibLeft: number;
  calibCenter: number;
  calibRight: number;
}

interface SessionParams {
  id: string;
}

export default async function sessionRoutes(fastify: FastifyInstance) {
  // POST /sessions - Create a new session
  fastify.post<{ Body: CreateSessionBody }>('/', async (request: FastifyRequest<{ Body: CreateSessionBody }>, reply: FastifyReply) => {
    try {
      const { deviceInfo, samplingRate, calibLeft, calibCenter, calibRight } = request.body;
      
      const session = await prisma.session.create({
        data: {
          deviceInfo,
          samplingRate,
          calibLeft,
          calibCenter,
          calibRight
        }
      });
      
      // Return only {id} as requested
      return reply.status(201).send({ id: session.id });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to create session' });
    }
  });

  // GET /sessions/:id - Get a specific session
  fastify.get<{ Params: SessionParams }>('/:id', async (request: FastifyRequest<{ Params: SessionParams }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      
      const session = await prisma.session.findUnique({
        where: { id },
        include: {
          samples: true
        }
      });
      
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      
      return reply.send(session);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to retrieve session' });
    }
  });

  // GET /sessions - List all sessions
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessions = await prisma.session.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { samples: true }
          }
        }
      });
      
      return reply.send(sessions);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to retrieve sessions' });
    }
  });
} 