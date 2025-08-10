export interface Sample {
  ts: string | number;
  xRaw: number;
  xFiltered?: number;
  confidence?: number;
}

export interface VelocityPoint {
  ts: number;
  velocity: number;
}

export interface AnalyticsResult {
  totalPoints: number;
  duration: number;
  avgVelocity: number;
  maxVelocity: number;
  saccadeFrequency: number;
  avgConfidence: number;
  velocities: VelocityPoint[];
  saccades: number[];
}

/**
 * Calculate velocity between consecutive points
 */
export function calculateVelocity(samples: Sample[]): VelocityPoint[] {
  if (samples.length < 2) return [];

  const velocities: VelocityPoint[] = [];
  
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    
    const prevTs = typeof prev.ts === 'string' ? parseInt(prev.ts) : prev.ts;
    const currTs = typeof curr.ts === 'string' ? parseInt(curr.ts) : curr.ts;
    
    const dt = currTs - prevTs;
    const dx = (curr.xFiltered !== undefined ? curr.xFiltered : curr.xRaw) - (prev.xFiltered !== undefined ? prev.xFiltered : prev.xRaw);
    
    if (dt > 0) {
      velocities.push({
        ts: currTs,
        velocity: Math.abs(dx / dt)
      });
    }
  }
  
  return velocities;
}

/**
 * Detect saccades (rapid eye movements) based on velocity threshold
 */
export function detectSaccades(velocities: VelocityPoint[], threshold: number = 0.05): number[] {
  return velocities
    .filter(v => v.velocity > threshold)
    .map(v => v.ts);
}

/**
 * Calculate saccade frequency (saccades per second)
 */
export function calculateSaccadeFrequency(saccades: number[], duration: number): number {
  if (duration <= 0) return 0;
  return saccades.length / duration;
}

/**
 * Calculate comprehensive analytics for eye tracking data
 */
export function analyzeEyeTrackingData(samples: Sample[]): AnalyticsResult {
  if (samples.length === 0) {
    return {
      totalPoints: 0,
      duration: 0,
      avgVelocity: 0,
      maxVelocity: 0,
      saccadeFrequency: 0,
      avgConfidence: 0,
      velocities: [],
      saccades: []
    };
  }

  // Calculate duration
  const firstTs = typeof samples[0].ts === 'string' ? parseInt(samples[0].ts) : Number(samples[0].ts);
  const lastTs = typeof samples[samples.length - 1].ts === 'string' ? parseInt(samples[samples.length - 1].ts) : Number(samples[samples.length - 1].ts);
  const duration = (lastTs - firstTs) / 1000; // Convert to seconds

  // Calculate velocities
  const velocities = calculateVelocity(samples);
  
  // Calculate average and max velocity
  const avgVelocity = velocities.length > 0 
    ? velocities.reduce((sum, v) => sum + v.velocity, 0) / velocities.length 
    : 0;
  const maxVelocity = velocities.length > 0 
    ? Math.max(...velocities.map(v => v.velocity)) 
    : 0;

  // Detect saccades
  const saccades = detectSaccades(velocities);
  const saccadeFrequency = calculateSaccadeFrequency(saccades, duration);

  // Calculate average confidence
  const avgConfidence = samples.reduce((sum, s) => sum + (s.confidence || 0), 0) / samples.length;

  return {
    totalPoints: samples.length,
    duration,
    avgVelocity,
    maxVelocity,
    saccadeFrequency,
    avgConfidence,
    velocities,
    saccades: saccades
  };
}

/**
 * Generate summary statistics for display
 */
export function generateSummary(analytics: AnalyticsResult): Record<string, string> {
  return {
    'Total Points': analytics.totalPoints.toString(),
    'Duration': `${analytics.duration.toFixed(2)}s`,
    'Avg Velocity': `${(analytics.avgVelocity * 1000).toFixed(2)} px/s`,
    'Max Velocity': `${(analytics.maxVelocity * 1000).toFixed(2)} px/s`,
    'Saccade Frequency': `${analytics.saccadeFrequency.toFixed(2)} saccades/s`,
    'Avg Confidence': `${(analytics.avgConfidence * 100).toFixed(1)}%`
  };
}

/**
 * Calculate fixation points (periods of stable gaze)
 */
export function calculateFixations(samples: Sample[], velocityThreshold: number = 0.01, minDuration: number = 100): Array<{start: number, end: number, duration: number}> {
  const velocities = calculateVelocity(samples);
  const fixations: Array<{start: number, end: number, duration: number}> = [];
  
  let fixationStart: number | null = null;
  
  for (let i = 0; i < velocities.length; i++) {
    const velocity = velocities[i];
    
    if (velocity.velocity < velocityThreshold) {
      if (fixationStart === null) {
        fixationStart = velocity.ts;
      }
    } else {
      if (fixationStart !== null) {
        const duration = velocity.ts - fixationStart;
        if (duration >= minDuration) {
          fixations.push({
            start: fixationStart,
            end: velocity.ts,
            duration
          });
        }
        fixationStart = null;
      }
    }
  }
  
  // Handle fixation that extends to the end
  if (fixationStart !== null) {
    const lastSample = samples[samples.length - 1];
    const lastTs = typeof lastSample.ts === 'string' ? parseInt(lastSample.ts) : lastSample.ts;
    const duration = lastTs - fixationStart;
    if (duration >= minDuration) {
      fixations.push({
        start: fixationStart,
        end: lastTs,
        duration
      });
    }
  }
  
  return fixations;
} 