export interface Sample {
  ts: string | number;
  xRaw: number;
  xFiltered?: number;
  confidence?: number;
}

export interface SmoothingOptions {
  windowSize?: number;
  outlierThreshold?: number;
  minConfidence?: number;
}

/**
 * Apply moving average filter to smooth eye tracking data
 */
export function applyMovingAverageFilter(samples: Sample[], windowSize: number = 5): Sample[] {
  if (samples.length === 0) return [];
  
  const filtered: Sample[] = [];
  
  for (let i = 0; i < samples.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(samples.length, i + Math.floor(windowSize / 2) + 1);
    
    const window = samples.slice(start, end);
    const sum = window.reduce((acc, s) => acc + s.xRaw, 0);
    const average = sum / window.length;
    
    filtered.push({
      ...samples[i],
      xFiltered: average
    });
  }
  
  return filtered;
}

/**
 * Remove outliers based on velocity threshold
 */
export function removeOutliers(samples: Sample[], threshold: number = 0.1): Sample[] {
  if (samples.length < 3) return samples;
  
  const filtered: Sample[] = [samples[0]];
  
  for (let i = 1; i < samples.length - 1; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const next = samples[i + 1];
    
    const prevX = prev.xFiltered !== undefined ? prev.xFiltered : prev.xRaw;
    const currX = curr.xFiltered !== undefined ? curr.xFiltered : curr.xRaw;
    const nextX = next.xFiltered !== undefined ? next.xFiltered : next.xRaw;
    
    const diff1 = Math.abs(currX - prevX);
    const diff2 = Math.abs(currX - nextX);
    
    if (diff1 < threshold && diff2 < threshold) {
      filtered.push(samples[i]);
    }
  }
  
  if (samples.length > 1) {
    filtered.push(samples[samples.length - 1]);
  }
  
  return filtered;
}

/**
 * Apply confidence-based filtering
 */
export function filterByConfidence(samples: Sample[], minConfidence: number = 0.5): Sample[] {
  return samples.filter(sample => (sample.confidence || 1) >= minConfidence);
}

/**
 * Apply comprehensive smoothing pipeline
 */
export function smoothEyeTrackingData(samples: Sample[], options: SmoothingOptions = {}): Sample[] {
  const {
    windowSize = 5,
    outlierThreshold = 0.1,
    minConfidence = 0.5
  } = options;
  
  if (samples.length === 0) return samples;
  
  // Step 1: Filter by confidence
  let filtered = filterByConfidence(samples, minConfidence);
  
  // Step 2: Remove outliers
  filtered = removeOutliers(filtered, outlierThreshold);
  
  // Step 3: Apply moving average
  filtered = applyMovingAverageFilter(filtered, windowSize);
  
  return filtered;
}

/**
 * Calculate velocity between consecutive points
 */
export function calculateVelocity(samples: Sample[]): Array<{ts: number, velocity: number}> {
  if (samples.length < 2) return [];
  
  const velocities: Array<{ts: number, velocity: number}> = [];
  
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    
    const prevTs = typeof prev.ts === 'string' ? parseInt(prev.ts) : prev.ts;
    const currTs = typeof curr.ts === 'string' ? parseInt(curr.ts) : curr.ts;
    
    const dt = currTs - prevTs;
    const prevX = prev.xFiltered !== undefined ? prev.xFiltered : prev.xRaw;
    const currX = curr.xFiltered !== undefined ? curr.xFiltered : curr.xRaw;
    const dx = currX - prevX;
    
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
 * Adaptive smoothing based on velocity
 */
export function adaptiveSmoothing(samples: Sample[]): Sample[] {
  if (samples.length === 0) return samples;
  
  const velocities = calculateVelocity(samples);
  const avgVelocity = velocities.length > 0 
    ? velocities.reduce((sum, v) => sum + v.velocity, 0) / velocities.length 
    : 0;
  
  // Use smaller window for high velocity (more smoothing)
  // Use larger window for low velocity (less smoothing)
  const adaptiveWindowSize = Math.max(3, Math.min(15, Math.floor(20 / (avgVelocity + 0.01))));
  
  return smoothEyeTrackingData(samples, {
    windowSize: adaptiveWindowSize,
    outlierThreshold: 0.1,
    minConfidence: 0.5
  });
}

/**
 * Kalman filter for eye tracking (simplified implementation)
 */
export function kalmanFilter(samples: Sample[], processNoise: number = 0.01, measurementNoise: number = 0.1): Sample[] {
  if (samples.length === 0) return samples;
  
  const filtered: Sample[] = [];
  let x = samples[0].xRaw; // Initial state
  let P = 1; // Initial uncertainty
  
  for (const sample of samples) {
    // Prediction step
    const xPred = x;
    const PPred = P + processNoise;
    
    // Update step
    const K = PPred / (PPred + measurementNoise); // Kalman gain
    x = xPred + K * (sample.xRaw - xPred);
    P = (1 - K) * PPred;
    
    filtered.push({
      ...sample,
      xFiltered: x
    });
  }
  
  return filtered;
} 