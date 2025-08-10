import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PrismaClient } from '../../../node_modules/@prisma/client';
import { analyzeEyeTrackingData, generateSummary } from '../processing/analytics';
import { smoothEyeTrackingData } from '../processing/smoothing';

const prisma = new PrismaClient();

interface SessionParams {
  id: string;
}

interface AnalyticsQuery {
  smoothing?: boolean;
  windowSize?: number;
  outlierThreshold?: number;
  minConfidence?: number;
}

export default async function analyticsRoutes(fastify: FastifyInstance) {
  // GET /sessions/:id/analytics - Get session analytics
  fastify.get<{ Params: SessionParams; Querystring: AnalyticsQuery }>('/sessions/:id/analytics', async (request: FastifyRequest<{ Params: SessionParams; Querystring: AnalyticsQuery }>, reply: FastifyReply) => {
    try {
      const { id: sessionId } = request.params;
      const { smoothing = true, windowSize = 5, outlierThreshold = 0.1, minConfidence = 0.5 } = request.query;
      
      // Check if session exists
      const session = await prisma.session.findUnique({
        where: { id: sessionId }
      });
      
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      
      // Get raw samples
      const samples = await prisma.sample.findMany({
        where: { sessionId },
        orderBy: { ts: 'asc' }
      });
      
      if (samples.length === 0) {
        return reply.status(404).send({ error: 'No data points found for this session' });
      }
      
      // Convert database samples to expected format
      const convertedSamples = samples.map(sample => ({
        ts: sample.ts.toString(),
        xRaw: sample.xRaw,
        xFiltered: sample.xFiltered || undefined,
        confidence: sample.confidence || undefined
      }));
      
      // Apply smoothing if requested
      let processedSamples = convertedSamples;
      if (smoothing) {
        processedSamples = smoothEyeTrackingData(convertedSamples, {
          windowSize,
          outlierThreshold,
          minConfidence
        });
      }
      
      // Calculate analytics
      const analytics = analyzeEyeTrackingData(processedSamples);
      const summary = generateSummary(analytics);
      
      return reply.send({
        session: {
          id: session.id,
          createdAt: session.createdAt,
          deviceInfo: session.deviceInfo,
          samplingRate: session.samplingRate
        },
        analytics,
        summary,
        processing: {
          smoothing,
          windowSize,
          outlierThreshold,
          minConfidence,
          originalPoints: samples.length,
          processedPoints: processedSamples.length
        }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to calculate analytics' });
    }
  });

  // GET /sessions/:id/analytics/raw - Get raw analytics without smoothing
  fastify.get<{ Params: SessionParams }>('/sessions/:id/analytics/raw', async (request: FastifyRequest<{ Params: SessionParams }>, reply: FastifyReply) => {
    try {
      const { id: sessionId } = request.params;
      
      // Check if session exists
      const session = await prisma.session.findUnique({
        where: { id: sessionId }
      });
      
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      
      // Get raw samples
      const samples = await prisma.sample.findMany({
        where: { sessionId },
        orderBy: { ts: 'asc' }
      });
      
      if (samples.length === 0) {
        return reply.status(404).send({ error: 'No data points found for this session' });
      }
      
      // Calculate analytics on raw data
      const analytics = analyzeEyeTrackingData(samples);
      const summary = generateSummary(analytics);
      
      return reply.send({
        session: {
          id: session.id,
          createdAt: session.createdAt,
          deviceInfo: session.deviceInfo,
          samplingRate: session.samplingRate
        },
        analytics,
        summary,
        processing: {
          smoothing: false,
          originalPoints: samples.length,
          processedPoints: samples.length
        }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to calculate raw analytics' });
    }
  });
} 