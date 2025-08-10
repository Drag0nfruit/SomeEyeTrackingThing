import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Camera } from '@mediapipe/camera_utils';
import { FaceMesh } from '@mediapipe/face_mesh';
import { drawConnectors } from '@mediapipe/drawing_utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import axios from 'axios';

// ---- MediaPipe FaceMesh indices (refineLandmarks: true) ----
const LEFT_IRIS = [468, 469, 470, 471, 472];   // 472 ≈ center
const RIGHT_IRIS = [473, 474, 475, 476, 477];  // 477 ≈ center
const LEFT_EYE_INNER  = 263; // subject's left (nasal)
const LEFT_EYE_OUTER  = 362; // subject's left (temporal)
const RIGHT_EYE_INNER = 133; // subject's right (nasal)
const RIGHT_EYE_OUTER = 33;  // subject's right (temporal)

const SingleValueTooltip: React.FC<TooltipProps<ValueType, NameType>> = ({ active, label, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  // Prefer the main line; fall back to the first item if missing
  const main = payload.find(p => p.name === 'main') ?? payload[0];

  return (
    <div style={{ background: 'rgba(0,0,0,0.75)', color: '#fff', padding: 8, borderRadius: 4 }}>
      <div style={{ opacity: 0.8 }}>
        {new Date(label as number).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div><strong>Eye Position:</strong> {Number(main.value).toFixed(3)}</div>
    </div>
  );
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Classify iris position within an eye.
// Returns t in [0..1] where 0 = inner(nasal), 1 = outer(temporal)
function classifyIrisSide(
  landmarks: any[],
  irisCenterIdx: number,
  innerIdx: number,
  outerIdx: number
) {
  const center = landmarks[irisCenterIdx];
  const inner  = landmarks[innerIdx];
  const outer  = landmarks[outerIdx];
  if (!center || !inner || !outer) {
    return { ok: false as const, t: NaN, eyeSide: 'unknown', imageSide: 'unknown' };
  }
  const midX = (inner.x + outer.x) / 2;
  const imageSide = center.x < midX ? 'image-left' : 'image-right';
  const tRaw = (center.x - inner.x) / ((outer.x - inner.x) || 1e-6);
  const t = clamp(tRaw, 0, 1);
  const eyeSide = t < 0.5 ? 'toward-inner (nasal)' : 'toward-outer (temporal)';
  return { ok: true as const, t, eyeSide, imageSide };
}

interface Point {
  ts: number;
  x: number;
  confidence?: number;
}

interface EyeTrackerProps {
  sessionId?: string;
  onSessionCreated?: (sessionId: string) => void;
}

const EyeTracker: React.FC<EyeTrackerProps> = ({ sessionId, onSessionCreated }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const workerRef = useRef<Worker | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId || null);
  const [calibrationPoints, setCalibrationPoints] = useState<{ left: number; center: number; right: number }>({
    left: 0.1,
    center: 0.5,
    right: 0.9
  });
  const [liveData, setLiveData] = useState<Point[]>([]);
  const [uploadQueue, setUploadQueue] = useState<Point[]>([]);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState<'left' | 'center' | 'right' | null>(null);
  const [calibrationData, setCalibrationData] = useState<{
    left: { x: number; y: number } | null;
    center: { x: number; y: number } | null;
    right: { x: number; y: number } | null;
  }>({
    left: null,
    center: null,
    right: null
  });
  const [calibrationSamples, setCalibrationSamples] = useState<{
    left: { x: number; y: number }[];
    center: { x: number; y: number }[];
    right: { x: number; y: number }[];
  }>({
    left: [],
    center: [],
    right: []
  });
  const [calibrationCountdown, setCalibrationCountdown] = useState<number>(0);
  const [trackingStatus, setTrackingStatus] = useState<string>('Initializing...');
  const [lastRealDataTime, setLastRealDataTime] = useState<number>(0);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [showLandmarks, setShowLandmarks] = useState<boolean>(true);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [sessionStats, setSessionStats] = useState<{
    totalPoints: number;
    duration: number;
    uploadRate: number;
    lastUpload: number;
  } | null>(null);
  const [uploadStats, setUploadStats] = useState<{
    totalUploaded: number;
    totalFailed: number;
    averageBatchSize: number;
  }>({
    totalUploaded: 0,
    totalFailed: 0,
    averageBatchSize: 0
  });
  const showLandmarksRef = useRef(showLandmarks);
  const isRecordingRef = useRef(isRecording);
  const isPausedRef = useRef(isPaused);
  const [debugInfo, setDebugInfo] = useState<{
    leftEye: { x: number; y: number } | null;
    rightEye: { x: number; y: number } | null;
    averageEye: { x: number; y: number } | null;
    faceDetected: boolean;
    landmarksCount: number;
    leftEyeSide?: string;
    rightEyeSide?: string;
    leftT?: number;
    rightT?: number;
  }>({
    leftEye: null,
    rightEye: null,
    averageEye: null,
    faceDetected: false,
    landmarksCount: 0,
    leftEyeSide: 'unknown',
    rightEyeSide: 'unknown',
    leftT: NaN,
    rightT: NaN
  });

  const WINDOW_MS = 15_000;

  // If your ts ever comes in seconds, coerce to ms
  const toMs = (ts: number) => (ts < 1e12 ? ts * 1000 : ts);

  const latestTs = useMemo(() => {
    if (!liveData.length) return Date.now();
    return toMs(liveData[liveData.length - 1].ts);
  }, [liveData]);

  const windowedData = useMemo(() => {
    const end = latestTs;
    const start = end - WINDOW_MS;
    // normalize ts to ms and filter to the moving window
    return liveData
      .map(p => ({ ...p, ts: toMs(p.ts) }))
      .filter(p => p.ts >= start && p.ts <= end);
  }, [liveData, latestTs]);

  // (optional) keep memory under control
  useEffect(() => {
    if (liveData.length > 5000) {
      const cutoff = latestTs - 5 * 60_000;
      setLiveData(prev => prev.filter(p => toMs(p.ts) >= cutoff));
    }
  }, [liveData.length, latestTs]);

  // Update ref when showLandmarks changes
  useEffect(() => { 
    showLandmarksRef.current = showLandmarks; 
  }, [showLandmarks]);

  // Update refs when recording states change
  useEffect(() => { 
    isRecordingRef.current = isRecording; 
  }, [isRecording]);

  useEffect(() => { 
    isPausedRef.current = isPaused; 
  }, [isPaused]);

  // Debug logging for recording state changes
  useEffect(() => {
    console.log('Recording state changed:', { isRecording, isPaused, currentSessionId });
  }, [isRecording, isPaused, currentSessionId]);

  // Debug logging for live data changes
  useEffect(() => {
    console.log('Live data changed:', liveData.length, 'points');
  }, [liveData]);

  // Continuous live chart updates during recording
  useEffect(() => {
    if (!isRecording || isPaused) return;

    const updateInterval = setInterval(() => {
      const now = Date.now();
      
      // Check if we have recent real data
      const hasRecentRealData = now - lastRealDataTime < 1000;
      
      if (!hasRecentRealData) {
        // Only add placeholder if we haven't had real data for more than 2 seconds
        const timeSinceLastRealData = now - lastRealDataTime;
        if (timeSinceLastRealData > 2000) {
          console.log('Adding placeholder data - no real data for', timeSinceLastRealData, 'ms');
          const placeholderPoint: Point = {
            ts: now,
            x: 0.5, // Center position as placeholder
            confidence: 0.5
          };

          setLiveData(prev => {
            // When recording, keep all data but let the chart window control what's visible
            const newData = [...prev, placeholderPoint];
            
            // Quick sanity check
            if (newData.length % 30 === 0) {
              const w = windowedData;
              if (w.length) {
                console.log('window range (ms):', w[0].ts, '→', w[w.length-1].ts, 'Δ=', w[w.length-1].ts - w[0].ts);
              }
            }
            
            return newData;
          });
        }
      }
    }, 100); // Update every 100ms for smooth animation

    return () => clearInterval(updateInterval);
  }, [isRecording, isPaused, lastRealDataTime]);

  // Initialize MediaPipe Face Mesh
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const initializeFaceMesh = async () => {
      try {
        console.log('Initializing MediaPipe Face Mesh...');
        
        // Clean up any existing instances
        if (faceMeshRef.current) {
          faceMeshRef.current.close();
          faceMeshRef.current = null;
        }
        if (cameraRef.current) {
          cameraRef.current.stop();
          cameraRef.current = null;
        }
        
        faceMeshRef.current = new FaceMesh({
          locateFile: (file) => {
            console.log('Loading MediaPipe file:', file);
            // Try primary CDN first, fallback to alternative
            const primaryUrl = `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
            const fallbackUrl = `https://unpkg.com/@mediapipe/face_mesh/${file}`;
            
            // For WASM files, we'll use the primary CDN
            if (file.endsWith('.wasm') || file.endsWith('.wasm.bin')) {
              return primaryUrl;
            }
            
            return primaryUrl;
          }
        });

        faceMeshRef.current.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        faceMeshRef.current.onResults(onResults);

        // Initialize camera
        if (!videoRef.current) {
          throw new Error('Video element not available');
        }
        
        cameraRef.current = new Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && faceMeshRef.current) {
              try {
                await faceMeshRef.current.send({ image: videoRef.current });
              } catch (error) {
                console.error('Error sending frame to FaceMesh:', error);
              }
            }
          },
          width: 640,
          height: 480
        });

        await cameraRef.current.start();
        console.log('MediaPipe Face Mesh initialized successfully');
        setTrackingStatus('Initializing camera...');
        setIsInitializing(false);
        
      } catch (error) {
        console.error('Failed to initialize MediaPipe Face Mesh:', error);
        setTrackingStatus('Failed to initialize - please refresh the page');
        setIsInitializing(false);
        
        // Retry after 3 seconds
        setTimeout(() => {
          console.log('Retrying MediaPipe initialization...');
          initializeFaceMesh();
        }, 3000);
      }
    };

    initializeFaceMesh();

    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
    };
  }, []);

  // Initialize Web Worker for data processing
  useEffect(() => {
    const workerCode = `
      // Moving average filter for eye tracking data
      function applyMovingAverageFilter(points, windowSize = 5) {
        if (points.length === 0) return [];
        
        const filtered = [];
        
        for (let i = 0; i < points.length; i++) {
          const start = Math.max(0, i - Math.floor(windowSize / 2));
          const end = Math.min(points.length, i + Math.floor(windowSize / 2) + 1);
          
          const window = points.slice(start, end);
          const sum = window.reduce((acc, p) => acc + p.x, 0);
          const average = sum / window.length;
          
          filtered.push({
            ts: points[i].ts,
            x: average,
            confidence: points[i].confidence
          });
        }
        
        return filtered;
      }

      // Outlier detection and removal
      function removeOutliers(points, threshold = 0.1) {
        if (points.length < 3) return points;
        
        const filtered = [points[0]];
        
        for (let i = 1; i < points.length - 1; i++) {
          const prev = points[i - 1].x;
          const curr = points[i].x;
          const next = points[i + 1].x;
          
          const diff1 = Math.abs(curr - prev);
          const diff2 = Math.abs(curr - next);
          
          if (diff1 < threshold && diff2 < threshold) {
            filtered.push(points[i]);
          }
        }
        
        if (points.length > 1) {
          filtered.push(points[points.length - 1]);
        }
        
        return filtered;
      }

      // Calculate velocity
      function calculateVelocity(points) {
        if (points.length < 2) return [];
        
        const velocities = [];
        
        for (let i = 1; i < points.length; i++) {
          const dt = points[i].ts - points[i - 1].ts;
          const dx = points[i].x - points[i - 1].x;
          const velocity = dt > 0 ? dx / dt : 0;
          
          velocities.push({
            ts: points[i].ts,
            velocity: velocity
          });
        }
        
        return velocities;
      }

      self.onmessage = function(e) {
        const { type, data } = e.data;
        
        switch (type) {
          case 'process':
            const { points } = data;
            
            // Remove outliers
            const cleanedPoints = removeOutliers(points);
            
            // Apply moving average filter
            const filteredPoints = applyMovingAverageFilter(cleanedPoints);
            
            // Calculate velocity
            const velocities = calculateVelocity(filteredPoints);
            
            self.postMessage({
              type: 'processed',
              data: {
                filteredPoints,
                velocities
              }
            });
            break;
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    workerRef.current = new Worker(URL.createObjectURL(blob));

    workerRef.current.onmessage = (e) => {
      const { type, data } = e.data;
      
      if (type === 'processed') {
        const { filteredPoints } = data;
        
        // Only add to upload queue, live data is updated directly in onResults
        setUploadQueue(prev => [...prev, ...filteredPoints]);
      }
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  // Upload data to server every 200ms with enhanced streaming
  useEffect(() => {
    if (!currentSessionId || uploadQueue.length === 0) return;

    const uploadInterval = setInterval(async () => {
      if (uploadQueue.length > 0) {
        const pointsToUpload = [...uploadQueue];
        setUploadQueue([]);

        try {
          console.log('Uploading batch of', pointsToUpload.length, 'points to session', currentSessionId);
          
          const response = await axios.post(`http://localhost:3000/sessions/${currentSessionId}/points`, {
            points: pointsToUpload
          }, {
            timeout: 5000, // 5 second timeout
            headers: {
              'Content-Type': 'application/json'
            }
          });

          console.log('Upload successful:', response.data);
          
          // Update tracking status with upload info
          setTrackingStatus(prev => {
            if (prev.includes('Recording')) {
              return `Recording... Uploaded ${response.data.count} points`;
            }
            return prev;
          });

          updateUploadStats(response.data.count, 0, pointsToUpload.length); // Update stats

        } catch (error: any) {
          console.error('Failed to upload points:', error);
          
          // Re-add points to queue on failure
          setUploadQueue(prev => [...pointsToUpload, ...prev]);
          
          // Update upload stats with failure
          updateUploadStats(0, pointsToUpload.length, pointsToUpload.length);
          
          // Update tracking status with error
          setTrackingStatus(prev => {
            if (prev.includes('Recording')) {
              return `Recording... Upload failed - retrying`;
            }
            return prev;
          });

          // Log detailed error info
          if (error.response) {
            console.error('Server error:', error.response.data);
          } else if (error.request) {
            console.error('Network error:', error.request);
          } else {
            console.error('Error:', error.message);
          }
        }
      }
    }, 200);

    return () => clearInterval(uploadInterval);
  }, [currentSessionId, uploadQueue, isRecording, isPaused]);

  const onResults = useCallback((results: any) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvasCtx = canvasRef.current.getContext('2d');
    if (!canvasCtx) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

    const drawLandmarks = showLandmarksRef.current; // <-- latest value

    // Test canvas drawing - draw a test circle to verify canvas works
    if (debugMode && drawLandmarks) {
      canvasCtx.fillStyle = 'lime';
      canvasCtx.beginPath();
      canvasCtx.arc(30, 30, 15, 0, 2 * Math.PI);
      canvasCtx.fill();
      canvasCtx.strokeStyle = 'white';
      canvasCtx.lineWidth = 3;
      canvasCtx.stroke();
    }

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      setTrackingStatus('Face detected - Ready to record');
      
      for (const landmarks of results.multiFaceLandmarks) {
        // Extract more comprehensive eye landmarks for better tracking
        const leftEyeLandmarks = [
          landmarks[159], // Left eye center
          landmarks[145], // Left eye left corner
          landmarks[158], // Left eye right corner
          landmarks[153], // Left eye top
          landmarks[154]  // Left eye bottom
        ];
        
        const rightEyeLandmarks = [
          landmarks[386], // Right eye center
          landmarks[374], // Right eye left corner
          landmarks[387], // Right eye right corner
          landmarks[380], // Right eye top
          landmarks[381]  // Right eye bottom
        ];

        // Filter out null landmarks
        const validLeftEyeLandmarks = leftEyeLandmarks.filter(landmark => landmark);
        const validRightEyeLandmarks = rightEyeLandmarks.filter(landmark => landmark);

        if (validLeftEyeLandmarks.length > 0 && validRightEyeLandmarks.length > 0) {
          // Get iris centers directly
          const leftIrisCenter = landmarks[472]; // Left iris center
          const rightIrisCenter = landmarks[477]; // Right iris center
          
          if (leftIrisCenter && rightIrisCenter) {
            const leftEyeX = leftIrisCenter.x;
            const leftEyeY = leftIrisCenter.y;
            const rightEyeX = rightIrisCenter.x;
            const rightEyeY = rightIrisCenter.y;
            
            // Calculate eye position relative to eye socket (head-independent)
            // Use eye corner landmarks for socket reference
            const leftEyeCornerLeft = landmarks[145]; // Left eye left corner
            const leftEyeCornerRight = landmarks[158]; // Left eye right corner
            const rightEyeCornerLeft = landmarks[374]; // Right eye left corner  
            const rightEyeCornerRight = landmarks[387]; // Right eye right corner
            
            if (leftEyeCornerLeft && leftEyeCornerRight && rightEyeCornerLeft && rightEyeCornerRight) {
              // Calculate iris position relative to eye socket for left eye
              const leftEyeWidth = leftEyeCornerRight.x - leftEyeCornerLeft.x;
              const leftIrisPosition = leftEyeWidth > 0 ? (leftEyeX - leftEyeCornerLeft.x) / leftEyeWidth : 0.5;
              
              // Calculate iris position relative to eye socket for right eye
              const rightEyeWidth = rightEyeCornerRight.x - rightEyeCornerLeft.x;
              const rightIrisPosition = rightEyeWidth > 0 ? (rightEyeX - rightEyeCornerLeft.x) / rightEyeWidth : 0.5;
              
              // Average both eyes for final position
              const eyeX = (leftIrisPosition + rightIrisPosition) / 2;
              const eyeY = (leftEyeY + rightEyeY) / 2;
              
              // Classify iris side per eye (uses iris centers + corners)
              const leftClass  = classifyIrisSide(landmarks, 472, 145, 158);
              const rightClass = classifyIrisSide(landmarks, 477, 374, 387);
              
              // Get calibrated eye position
              const calibratedEyeX = getCalibratedEyePosition(eyeX);
              
              // Update debug info
              setDebugInfo({
                leftEye: { x: leftEyeX, y: leftEyeY },
                rightEye: { x: rightEyeX, y: rightEyeY },
                averageEye: { x: eyeX, y: eyeY },
                faceDetected: true,
                landmarksCount: landmarks.length,
                leftEyeSide: leftClass.eyeSide,
                rightEyeSide: rightClass.eyeSide,
                leftT: leftClass.t,
                rightT: rightClass.t
              });

              // Draw debug visualization if landmarks are enabled
              if (drawLandmarks) {
                // Draw left eye landmarks
                canvasCtx.fillStyle = 'rgba(255, 0, 0, 0.8)';
                validLeftEyeLandmarks.forEach((landmark, index) => {
                  const x = landmark.x * canvasRef.current!.width;
                  const y = landmark.y * canvasRef.current!.height;
                  canvasCtx.beginPath();
                  canvasCtx.arc(x, y, 2, 0, 2 * Math.PI);
                  canvasCtx.fill();
                  canvasCtx.strokeStyle = 'white';
                  canvasCtx.lineWidth = 1;
                  canvasCtx.stroke();
                  
                  // Add label for key landmarks
                  if (index === 0) { // Center
                    canvasCtx.fillStyle = 'white';
                    canvasCtx.font = '10px Arial';
                    canvasCtx.fillText('L', x + 8, y + 3);
                  }
                });
                
                // Draw right eye landmarks
                canvasCtx.fillStyle = 'rgba(0, 0, 255, 0.8)';
                validRightEyeLandmarks.forEach((landmark, index) => {
                  const x = landmark.x * canvasRef.current!.width;
                  const y = landmark.y * canvasRef.current!.height;
                  canvasCtx.beginPath();
                  canvasCtx.arc(x, y, 2, 0, 2 * Math.PI);
                  canvasCtx.fill();
                  canvasCtx.strokeStyle = 'white';
                  canvasCtx.lineWidth = 1;
                  canvasCtx.stroke();
                  
                  // Add label for key landmarks
                  if (index === 0) { // Center
                    canvasCtx.fillStyle = 'white';
                    canvasCtx.font = '10px Arial';
                    canvasCtx.fillText('R', x + 8, y + 3);
                  }
                });
                
                // Draw eye centers with smaller dots
                canvasCtx.fillStyle = 'rgba(0, 255, 0, 0.9)';
                const leftCenterX = leftEyeX * canvasRef.current!.width;
                const leftCenterY = leftEyeY * canvasRef.current!.height;
                const rightCenterX = rightEyeX * canvasRef.current!.width;
                const rightCenterY = rightEyeY * canvasRef.current!.height;
                
                canvasCtx.beginPath();
                canvasCtx.arc(leftCenterX, leftCenterY, 4, 0, 2 * Math.PI);
                canvasCtx.fill();
                canvasCtx.strokeStyle = 'white';
                canvasCtx.lineWidth = 2;
                canvasCtx.stroke();
                
                canvasCtx.beginPath();
                canvasCtx.arc(rightCenterX, rightCenterY, 4, 0, 2 * Math.PI);
                canvasCtx.fill();
                canvasCtx.strokeStyle = 'white';
                canvasCtx.lineWidth = 2;
                canvasCtx.stroke();
              }
              
              // Create data point with calibrated position
              const point: Point = {
                ts: Date.now(),
                x: calibratedEyeX,
                confidence: 0.8 // You could calculate this based on landmark confidence
              };

              console.log('Eye position detected:', { raw: eyeX, calibrated: calibratedEyeX }, 'Recording state:', { isRecording: isRecordingRef.current, isPaused: isPausedRef.current });

              // Update live data directly for immediate visualization
              if (isRecordingRef.current && !isPausedRef.current) {
                console.log('Recording is active, updating live data with eyeX:', eyeX);
                setTrackingStatus(`Recording... Eye position: ${eyeX.toFixed(3)}`);
                
                setLiveData(prev => [...prev, point]);

                // Quick sanity check
                if (liveData.length % 30 === 0) {
                  const w = windowedData;
                  if (w.length) {
                    console.log('window range (ms):', w[0].ts, '→', w[w.length-1].ts, 'Δ=', w[w.length-1].ts - w[0].ts);
                  }
                }

                // Send to worker for processing and upload
                if (workerRef.current) {
                  workerRef.current.postMessage({
                    type: 'process',
                    data: { points: [point] }
                  });
                }
                setLastRealDataTime(Date.now()); // Update last real data time
              } else {
                console.log('Not recording - isRecording:', isRecordingRef.current, 'isPaused:', isPausedRef.current);
                // Always update live data for chart visualization, regardless of any button states
                setLiveData(prev => [...prev, point]);

                // Quick sanity check
                if (liveData.length % 30 === 0) {
                  const w = windowedData;
                  if (w.length) {
                    console.log('window range (ms):', w[0].ts, '→', w[w.length-1].ts, 'Δ=', w[w.length-1].ts - w[0].ts);
                  }
                }
              }
            } else {
              console.log('Eye corner landmarks not found');
              setDebugInfo(prev => ({ ...prev, faceDetected: false }));
            }
          } else {
            console.log('Iris center landmarks not found');
            setDebugInfo(prev => ({ ...prev, faceDetected: false }));
          }
        } else {
          console.log('Eye landmarks not found:', { validLeftEyeLandmarks, validRightEyeLandmarks });
          setDebugInfo(prev => ({ ...prev, faceDetected: false }));
        }
      }
    } else {
      setTrackingStatus('No face detected - Please position yourself in front of the camera');
      console.log('No face landmarks detected');
      setDebugInfo(prev => ({ ...prev, faceDetected: false }));
    }

    canvasCtx.restore();
  }, []); // <-- no deps

  const createSession = async () => {
    try {
      const response = await axios.post('http://localhost:3000/sessions', {
        deviceInfo: 'Webcam Eye Tracker',
        samplingRate: 30,
        calibLeft: calibrationPoints.left,
        calibCenter: calibrationPoints.center,
        calibRight: calibrationPoints.right
      });

      const newSessionId = response.data.id;
      setCurrentSessionId(newSessionId);
      onSessionCreated?.(newSessionId);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const startRecording = async () => {
    console.log('Start recording clicked, current session:', currentSessionId);
    if (!currentSessionId) {
      console.log('No session ID, creating new session...');
      await createSession();
    }
    console.log('Setting recording to true...');
    setIsRecording(true);
    setIsPaused(false);
    
    console.log('Recording state should now be true');
    
    // Fetch initial session stats
    if (currentSessionId) {
      await fetchSessionStats(currentSessionId);
    }
  };

  const pauseRecording = () => {
    console.log('Pause recording clicked');
    setIsPaused(true);
  };

  const resumeRecording = () => {
    console.log('Resume recording clicked');
    setIsPaused(false);
  };

  const stopRecording = async () => {
    console.log('Stop recording clicked');
    setIsRecording(false);
    setIsPaused(false);
    
    // Upload any remaining points in the queue
    if (currentSessionId && uploadQueue.length > 0) {
      console.log('Uploading final batch of', uploadQueue.length, 'points');
      const pointsToUpload = [...uploadQueue];
      setUploadQueue([]);
      
      try {
        const response = await axios.post(`http://localhost:3000/sessions/${currentSessionId}/points`, {
          points: pointsToUpload
        }, {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        console.log('Final upload successful:', response.data);
        updateUploadStats(response.data.count, 0, pointsToUpload.length);
      } catch (error: any) {
        console.error('Failed to upload final points:', error);
        updateUploadStats(0, pointsToUpload.length, pointsToUpload.length);
      }
    }
    
    // Check if session has data, if not, clean it up
    if (currentSessionId && uploadStats.totalUploaded === 0) {
      console.log('Cleaning up empty session:', currentSessionId);
      cleanupEmptySession(currentSessionId);
    }
  };

  const cleanupEmptySession = async (sessionId: string) => {
    try {
      await axios.delete(`http://localhost:3000/sessions/${sessionId}`);
      console.log('Empty session cleaned up:', sessionId);
      setCurrentSessionId(null);
    } catch (error) {
      console.error('Failed to cleanup empty session:', error);
    }
  };

  const fetchSessionStats = async (sessionId: string) => {
    try {
      const response = await axios.get(`http://localhost:3000/sessions/${sessionId}/points/stats`);
      setSessionStats({
        totalPoints: response.data.totalPoints,
        duration: response.data.duration,
        uploadRate: response.data.totalPoints / Math.max(response.data.duration, 1),
        lastUpload: Date.now()
      });
      console.log('Session stats loaded:', response.data);
    } catch (error) {
      console.error('Failed to fetch session stats:', error);
    }
  };

  const updateUploadStats = (uploaded: number, failed: number, batchSize: number) => {
    setUploadStats(prev => {
      const newTotalUploaded = prev.totalUploaded + uploaded;
      const newTotalFailed = prev.totalFailed + failed;
      const newAverageBatchSize = (prev.averageBatchSize + batchSize) / 2;
      
      return {
        totalUploaded: newTotalUploaded,
        totalFailed: newTotalFailed,
        averageBatchSize: newAverageBatchSize
      };
    });
  };

  const calibrate = (position: 'left' | 'center' | 'right') => {
    setIsCalibrating(true);
    setCalibrationStep(position);
    setCalibrationCountdown(3);
    
    // Clear previous samples for this position
    setCalibrationSamples(prev => ({
      ...prev,
      [position]: []
    }));
    
    // Start countdown
    const countdownInterval = setInterval(() => {
      setCalibrationCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          // Start collecting samples
          startCalibrationSampling(position);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startCalibrationSampling = (position: 'left' | 'center' | 'right') => {
    const sampleDuration = 2000; // 2 seconds of sampling
    const sampleInterval = 100; // Sample every 100ms
    let samplesCollected = 0;
    
    const samplingInterval = setInterval(() => {
      // Get current eye position from debug info
      const currentEyePos = debugInfo.averageEye;
      
      if (currentEyePos) {
        setCalibrationSamples(prev => ({
          ...prev,
          [position]: [...prev[position], { x: currentEyePos.x, y: currentEyePos.y }]
        }));
        samplesCollected++;
      }
      
      if (samplesCollected >= sampleDuration / sampleInterval) {
        clearInterval(samplingInterval);
        finishCalibration(position);
      }
    }, sampleInterval);
  };

  const finishCalibration = (position: 'left' | 'center' | 'right') => {
    const samples = calibrationSamples[position];
    
    if (samples.length > 0) {
      // Calculate average position from samples
      const avgX = samples.reduce((sum, sample) => sum + sample.x, 0) / samples.length;
      const avgY = samples.reduce((sum, sample) => sum + sample.y, 0) / samples.length;
      
      setCalibrationData(prev => ({
        ...prev,
        [position]: { x: avgX, y: avgY }
      }));
      
      console.log(`Calibration ${position} completed:`, { x: avgX, y: avgY });
    }
    
    setCalibrationStep(null);
    setIsCalibrating(false);
  };

  const getCalibratedEyePosition = (rawX: number): number => {
    const { left, center, right } = calibrationData;
    
    // If we don't have all calibration points, return raw position
    if (!left || !center || !right) {
      return clamp(rawX, -1, 1);
    }
    
    // Map raw eye position to -1 to +1 scale
    let calibratedX: number;
    if (rawX <= center.x) {
      // Map from left to center (rawX: left.x -> center.x, output: -1 -> 0)
      const range = center.x - left.x;
      const position = rawX - left.x;
      calibratedX = -1 + (position / range);
    } else {
      // Map from center to right (rawX: center.x -> right.x, output: 0 -> +1)
      const range = right.x - center.x;
      const position = rawX - center.x;
      calibratedX = position / range;
    }
    
    // Clamp to ensure it stays within -1 to +1 range
    return clamp(calibratedX, -1, 1);
  };


  return (
    <div className="eye-tracker">
      <style>{`
        @keyframes pulse {
          0% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.2); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
      <div className="video-container">
        <video
          ref={videoRef}
          style={{ display: 'none' }}
          width={640}
          height={480}
        />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          style={{ border: '1px solid #ccc' }}
        />
        {isInitializing && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '20px',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div>Loading MediaPipe...</div>
            <div style={{ fontSize: '12px', marginTop: '10px' }}>
              This may take a few seconds
            </div>
          </div>
        )}
        {showLandmarks && (
          <div className="landmark-legend" style={{
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '10px',
            borderRadius: '4px',
            marginTop: '10px',
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Landmark Legend:</div>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '12px', height: '12px', backgroundColor: 'red', borderRadius: '50%', border: '2px solid white' }}></div>
                <span>Left Eye Landmarks</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '12px', height: '12px', backgroundColor: 'blue', borderRadius: '50%', border: '2px solid white' }}></div>
                <span>Right Eye Landmarks</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '12px', height: '12px', backgroundColor: 'green', borderRadius: '50%', border: '2px solid white' }}></div>
                <span>Eye Centers</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '12px', height: '12px', backgroundColor: 'yellow', borderRadius: '50%', border: '2px solid black' }}></div>
                <span>Average Position (Tracking)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="controls">
        <div className="debug-controls">
          <button 
            onClick={() => setDebugMode(!debugMode)}
            className={debugMode ? 'debug-active' : ''}
            style={{ 
              backgroundColor: debugMode ? '#ff6b6b' : '#6c757d',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '10px'
            }}
          >
            {debugMode ? 'Debug Mode ON' : 'Debug Mode OFF'}
          </button>
          
          <button 
            onClick={() => setShowLandmarks(!showLandmarks)}
            className={showLandmarks ? 'landmarks-active' : ''}
            style={{ 
              backgroundColor: showLandmarks ? '#51cf66' : '#6c757d',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '10px',
              marginLeft: '10px'
            }}
          >
            {showLandmarks ? 'Landmarks ON' : 'Landmarks OFF'}
          </button>
          
          {debugMode && (
            <div className="debug-info" style={{
              backgroundColor: '#f8f9fa',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              padding: '10px',
              marginBottom: '10px',
              fontSize: '12px',
              fontFamily: 'monospace'
            }}>
              <div><strong>Face Detected:</strong> {debugInfo.faceDetected ? 'Yes' : 'No'}</div>
              <div><strong>Landmarks:</strong> {debugInfo.landmarksCount}</div>
              {debugInfo.leftEye && (
                <div><strong>Left Eye:</strong> X: {debugInfo.leftEye.x.toFixed(3)}, Y: {debugInfo.leftEye.y.toFixed(3)}</div>
              )}
              {debugInfo.rightEye && (
                <div><strong>Right Eye:</strong> X: {debugInfo.rightEye.x.toFixed(3)}, Y: {debugInfo.rightEye.y.toFixed(3)}</div>
              )}
              {debugInfo.averageEye && (
                <div><strong>Average Eye:</strong> X: {debugInfo.averageEye.x.toFixed(3)}, Y: {debugInfo.averageEye.y.toFixed(3)}</div>
              )}
              <div><strong>Left Eye Side:</strong> {debugInfo.leftEyeSide} (t={Number.isFinite(debugInfo.leftT) ? debugInfo.leftT!.toFixed(3) : 'n/a'})</div>
              <div><strong>Right Eye Side:</strong> {debugInfo.rightEyeSide} (t={Number.isFinite(debugInfo.rightT) ? debugInfo.rightT!.toFixed(3) : 'n/a'})</div>
              {isCalibrating && (
                <div><strong>Calibrating:</strong> {calibrationStep} ({calibrationCountdown})</div>
              )}
              {calibrationData.left && (
                <div><strong>Calib Left:</strong> X: {calibrationData.left.x.toFixed(3)}, Y: {calibrationData.left.y.toFixed(3)}</div>
              )}
              {calibrationData.center && (
                <div><strong>Calib Center:</strong> X: {calibrationData.center.x.toFixed(3)}, Y: {calibrationData.center.y.toFixed(3)}</div>
              )}
              {calibrationData.right && (
                <div><strong>Calib Right:</strong> X: {calibrationData.right.x.toFixed(3)}, Y: {calibrationData.right.y.toFixed(3)}</div>
              )}
            </div>
          )}
        </div>

        <div className="calibration-controls">
          <button 
            onClick={() => calibrate('left')}
            disabled={isRecording}
            className={calibrationStep === 'left' ? 'calibrating' : ''}
          >
            Calibrate Left
          </button>
          <button 
            onClick={() => calibrate('center')}
            disabled={isRecording}
            className={calibrationStep === 'center' ? 'calibrating' : ''}
          >
            Calibrate Center
          </button>
          <button 
            onClick={() => calibrate('right')}
            disabled={isRecording}
            className={calibrationStep === 'right' ? 'calibrating' : ''}
          >
            Calibrate Right
          </button>
        </div>

        <div className="recording-controls">
          {!isRecording ? (
            <button onClick={startRecording} className="start-btn">
              Start Recording
            </button>
          ) : (
            <>
              {isPaused ? (
                <button onClick={resumeRecording} className="resume-btn">
                  Resume
                </button>
              ) : (
                <button onClick={pauseRecording} className="pause-btn">
                  Pause
                </button>
              )}
              <button onClick={stopRecording} className="stop-btn">
                Stop
              </button>
            </>
          )}
        </div>

        {currentSessionId && (
          <div className="session-info">
            Session ID: {currentSessionId}
          </div>
        )}

        {isRecording && sessionStats && (
          <div className="session-stats" style={{
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            padding: '10px',
            marginTop: '10px',
            fontSize: '12px',
            fontFamily: 'monospace'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Recording Statistics:</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
              <div>Total Points: {sessionStats.totalPoints}</div>
              <div>Duration: {sessionStats.duration}s</div>
              <div>Upload Rate: {sessionStats.uploadRate.toFixed(1)} pts/s</div>
              <div>Uploaded: {uploadStats.totalUploaded}</div>
              <div>Failed: {uploadStats.totalFailed}</div>
              <div>Avg Batch: {uploadStats.averageBatchSize.toFixed(1)}</div>
            </div>
          </div>
        )}
      </div>

      <div className={`live-chart ${isRecording && !isPaused ? 'live' : ''}`}>
        <h3>Live Eye Movement (Last 15s)</h3>
        <div className="tracking-status">
          Status: {trackingStatus}
        </div>
        <div className="chart-info">
          Data points: {liveData.length} | Recording: {isRecording ? 'Yes' : 'No'} | 
          Paused: {isPaused ? 'Yes' : 'No'} | Session: {currentSessionId ? 'Active' : 'None'} |
          {isRecording && !isPaused && (
            <span style={{ color: '#51cf66', animation: 'pulse 1s infinite' }}>
              LIVE
            </span>
          )}
          {isRecording && !isPaused && Date.now() - lastRealDataTime < 1000 && (
            <span style={{ color: '#ffd43b', marginLeft: '10px' }}>
              Real Data
            </span>
          )}
          {liveData.length > 0 && (
            <span style={{ color: '#ff6b6b', marginLeft: '10px' }}>
              Last X: {liveData[liveData.length - 1]?.x.toFixed(3)}
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={windowedData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              key={Math.floor(latestTs / 200)}         // forces rescale ~5x/sec
              dataKey="ts"
              type="number"
              domain={[latestTs - WINDOW_MS, latestTs]} // hard 15s window
              allowDataOverflow
              tickFormatter={(v) =>
                new Date(v).toLocaleTimeString('en-US', {
                  hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
                })
              }
            />
            <YAxis domain={[-1, 1]} tickFormatter={(v) => v.toFixed(2)} ticks={[-1,-0.5,0,0.5,1]} width={50}/>
            <Tooltip content={<SingleValueTooltip />} />
            <Line dataKey="x" name="main" stroke="#ff6b35" strokeWidth={2} dot={false} isAnimationActive={false}/>
            {isRecording && !isPaused && windowedData.length > 0 && (
              <Line
                dataKey="x"
                name="highlight"
                stroke="#51cf66"
                strokeWidth={3}
                dot={{ r: 3 }}
                isAnimationActive
                data={windowedData.slice(-5)}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {isCalibrating && (
        <div className="calibration-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {calibrationCountdown > 0 ? (
            <div className="calibration-countdown" style={{
              color: 'white',
              fontSize: '48px',
              fontWeight: 'bold',
              textAlign: 'center'
            }}>
              <div>Look at the dot in {calibrationCountdown}...</div>
            </div>
          ) : (
            <div className="calibration-dot" style={{
              position: 'absolute',
              width: '20px',
              height: '20px',
              backgroundColor: '#ff6b6b',
              borderRadius: '50%',
              border: '3px solid white',
              boxShadow: '0 0 20px rgba(255, 107, 107, 0.8)',
              left: calibrationStep === 'left' ? '10%' : calibrationStep === 'right' ? '90%' : '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              animation: 'pulse 1s infinite'
            }}>
              <div style={{
                position: 'absolute',
                top: '30px',
                left: '50%',
                transform: 'translateX(-50%)',
                color: 'white',
                fontSize: '16px',
                fontWeight: 'bold',
                textAlign: 'center',
                whiteSpace: 'nowrap'
              }}>
                Look Here
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EyeTracker; 