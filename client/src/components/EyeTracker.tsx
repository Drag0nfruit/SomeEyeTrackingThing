import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera } from '@mediapipe/camera_utils';
import { FaceMesh } from '@mediapipe/face_mesh';
import { drawConnectors } from '@mediapipe/drawing_utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';

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
  const [trackingStatus, setTrackingStatus] = useState<string>('Initializing...');
  const [lastRealDataTime, setLastRealDataTime] = useState<number>(0);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [showLandmarks, setShowLandmarks] = useState<boolean>(true);
  const [debugInfo, setDebugInfo] = useState<{
    leftEye: { x: number; y: number } | null;
    rightEye: { x: number; y: number } | null;
    averageEye: { x: number; y: number } | null;
    faceDetected: boolean;
    landmarksCount: number;
  }>({
    leftEye: null,
    rightEye: null,
    averageEye: null,
    faceDetected: false,
    landmarksCount: 0
  });

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
            const fifteenSecondsAgo = now - 15000;
            const filtered = prev.filter(point => point.ts > fifteenSecondsAgo);
            return [...filtered, placeholderPoint];
          });
        }
      }
    }, 100); // Update every 100ms for smooth animation

    return () => clearInterval(updateInterval);
  }, [isRecording, isPaused, lastRealDataTime]);

  // Initialize MediaPipe Face Mesh
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;

    faceMeshRef.current = new FaceMesh({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
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
    cameraRef.current = new Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current && faceMeshRef.current) {
          await faceMeshRef.current.send({ image: videoRef.current });
        }
      },
      width: 640,
      height: 480
    });

    cameraRef.current.start();

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

  // Upload data to server every 200ms
  useEffect(() => {
    if (!currentSessionId || uploadQueue.length === 0) return;

    const uploadInterval = setInterval(async () => {
      if (uploadQueue.length > 0 && isRecording && !isPaused) {
        const pointsToUpload = [...uploadQueue];
        setUploadQueue([]);

        try {
          await axios.post(`http://localhost:3000/sessions/${currentSessionId}/points`, {
            points: pointsToUpload
          });
        } catch (error) {
          console.error('Failed to upload points:', error);
          // Re-add points to queue on failure
          setUploadQueue(prev => [...pointsToUpload, ...prev]);
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

    // Test canvas drawing - draw a test circle to verify canvas works
    if (debugMode) {
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
          // Calculate left eye center (average of all left eye landmarks)
          const leftEyeX = validLeftEyeLandmarks.reduce((sum, landmark) => sum + landmark.x, 0) / validLeftEyeLandmarks.length;
          const leftEyeY = validLeftEyeLandmarks.reduce((sum, landmark) => sum + landmark.y, 0) / validLeftEyeLandmarks.length;
          
          // Calculate right eye center (average of all right eye landmarks)
          const rightEyeX = validRightEyeLandmarks.reduce((sum, landmark) => sum + landmark.x, 0) / validRightEyeLandmarks.length;
          const rightEyeY = validRightEyeLandmarks.reduce((sum, landmark) => sum + landmark.y, 0) / validRightEyeLandmarks.length;
          
          // Calculate overall eye position (average of both eyes)
          const eyeX = (leftEyeX + rightEyeX) / 2;
          const eyeY = (leftEyeY + rightEyeY) / 2;
          
          // Update debug info
          setDebugInfo({
            leftEye: { x: leftEyeX, y: leftEyeY },
            rightEye: { x: rightEyeX, y: rightEyeY },
            averageEye: { x: eyeX, y: eyeY },
            faceDetected: true,
            landmarksCount: landmarks.length
          });

          // Draw debug visualization if debug mode is enabled
          if (showLandmarks) {
            // Draw left eye landmarks
            canvasCtx.fillStyle = 'rgba(255, 0, 0, 0.8)';
            validLeftEyeLandmarks.forEach((landmark, index) => {
              const x = landmark.x * canvasRef.current!.width;
              const y = landmark.y * canvasRef.current!.height;
              canvasCtx.beginPath();
              canvasCtx.arc(x, y, 8, 0, 2 * Math.PI);
              canvasCtx.fill();
              canvasCtx.strokeStyle = 'white';
              canvasCtx.lineWidth = 3;
              canvasCtx.stroke();
              
              // Add label for key landmarks
              if (index === 0) { // Center
                canvasCtx.fillStyle = 'white';
                canvasCtx.font = '12px Arial';
                canvasCtx.fillText('L', x + 12, y + 4);
              }
            });
            
            // Draw right eye landmarks
            canvasCtx.fillStyle = 'rgba(0, 0, 255, 0.8)';
            validRightEyeLandmarks.forEach((landmark, index) => {
              const x = landmark.x * canvasRef.current!.width;
              const y = landmark.y * canvasRef.current!.height;
              canvasCtx.beginPath();
              canvasCtx.arc(x, y, 8, 0, 2 * Math.PI);
              canvasCtx.fill();
              canvasCtx.strokeStyle = 'white';
              canvasCtx.lineWidth = 3;
              canvasCtx.stroke();
              
              // Add label for key landmarks
              if (index === 0) { // Center
                canvasCtx.fillStyle = 'white';
                canvasCtx.font = '12px Arial';
                canvasCtx.fillText('R', x + 12, y + 4);
              }
            });
            
            // Draw eye centers with larger, more prominent dots
            canvasCtx.fillStyle = 'rgba(0, 255, 0, 0.9)';
            const leftCenterX = leftEyeX * canvasRef.current!.width;
            const leftCenterY = leftEyeY * canvasRef.current!.height;
            const rightCenterX = rightEyeX * canvasRef.current!.width;
            const rightCenterY = rightEyeY * canvasRef.current!.height;
            
            canvasCtx.beginPath();
            canvasCtx.arc(leftCenterX, leftCenterY, 12, 0, 2 * Math.PI);
            canvasCtx.fill();
            canvasCtx.strokeStyle = 'white';
            canvasCtx.lineWidth = 3;
            canvasCtx.stroke();
            
            canvasCtx.beginPath();
            canvasCtx.arc(rightCenterX, rightCenterY, 12, 0, 2 * Math.PI);
            canvasCtx.fill();
            canvasCtx.strokeStyle = 'white';
            canvasCtx.lineWidth = 3;
            canvasCtx.stroke();
            
            // Draw average eye position with the most prominent visualization
            canvasCtx.fillStyle = 'rgba(255, 255, 0, 0.9)';
            const avgX = eyeX * canvasRef.current!.width;
            const avgY = eyeY * canvasRef.current!.height;
            canvasCtx.beginPath();
            canvasCtx.arc(avgX, avgY, 15, 0, 2 * Math.PI);
            canvasCtx.fill();
            canvasCtx.strokeStyle = 'black';
            canvasCtx.lineWidth = 4;
            canvasCtx.stroke();
            
            // Draw crosshair at average position
            canvasCtx.strokeStyle = 'black';
            canvasCtx.lineWidth = 4;
            canvasCtx.beginPath();
            canvasCtx.moveTo(avgX - 20, avgY);
            canvasCtx.lineTo(avgX + 20, avgY);
            canvasCtx.moveTo(avgX, avgY - 20);
            canvasCtx.lineTo(avgX, avgY + 20);
            canvasCtx.stroke();
            
            // Add label for average position
            canvasCtx.fillStyle = 'black';
            canvasCtx.font = 'bold 14px Arial';
            canvasCtx.fillText('AVG', avgX + 20, avgY - 20);
          }
          
          // Create data point
          const point: Point = {
            ts: Date.now(),
            x: eyeX,
            confidence: 0.8 // You could calculate this based on landmark confidence
          };

          console.log('Eye position detected:', eyeX, 'Recording state:', { isRecording, isPaused });

          // Update live data directly for immediate visualization
          if (isRecording && !isPaused) {
            console.log('Recording is active, updating live data with eyeX:', eyeX);
            setTrackingStatus(`Recording... Eye position: ${eyeX.toFixed(3)}`);
            
            setLiveData(prev => {
              const now = Date.now();
              const fifteenSecondsAgo = now - 15000;
              const filtered = prev.filter(point => point.ts > fifteenSecondsAgo);
              const newData = [...filtered, point];
              console.log('Live data updated:', newData.length, 'points, latest eyeX:', point.x);
              return newData;
            });

            // Send to worker for processing and upload
            if (workerRef.current) {
              workerRef.current.postMessage({
                type: 'process',
                data: { points: [point] }
              });
            }
            setLastRealDataTime(Date.now()); // Update last real data time
          } else {
            console.log('Not recording - isRecording:', isRecording, 'isPaused:', isPaused);
            // Even when not recording, update debug info for visualization
            if (showLandmarks) {
              setLiveData(prev => {
                const now = Date.now();
                const fifteenSecondsAgo = now - 15000;
                const filtered = prev.filter(point => point.ts > fifteenSecondsAgo);
                const newData = [...filtered, point];
                return newData;
              });
            }
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
  }, [isRecording, isPaused, showLandmarks]);

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
  };

  const pauseRecording = () => {
    console.log('Pause recording clicked');
    setIsPaused(true);
  };

  const resumeRecording = () => {
    console.log('Resume recording clicked');
    setIsPaused(false);
  };

  const stopRecording = () => {
    console.log('Stop recording clicked');
    setIsRecording(false);
    setIsPaused(false);
  };

  const calibrate = (position: 'left' | 'center' | 'right') => {
    setIsCalibrating(true);
    setCalibrationStep(position);
    
    // In a real implementation, you'd capture the current eye position
    // For now, we'll use preset values
    setTimeout(() => {
      setCalibrationStep(null);
      setIsCalibrating(false);
    }, 2000);
  };

  return (
    <div className="eye-tracker">
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
            {debugMode ? '🔴 Debug Mode ON' : '🔵 Debug Mode OFF'}
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
            {showLandmarks ? '👁️ Landmarks ON' : '👁️ Landmarks OFF'}
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
              ● LIVE
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
          <LineChart data={liveData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="ts" 
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleTimeString('en-US', { 
                  hour12: false, 
                  hour: '2-digit', 
                  minute: '2-digit', 
                  second: '2-digit' 
                });
              }}
            />
            <YAxis domain={[0, 1]} />
            <Tooltip 
              labelFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleTimeString('en-US', { 
                  hour12: false, 
                  hour: '2-digit', 
                  minute: '2-digit', 
                  second: '2-digit'
                });
              }}
              formatter={(value: any) => [value, 'Eye Position']}
            />
            <Line 
              type="monotone" 
              dataKey="x" 
              stroke="#8884d8" 
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            {isRecording && !isPaused && liveData.length > 0 && (
              <Line 
                type="monotone" 
                dataKey="x" 
                stroke="#51cf66" 
                strokeWidth={3}
                dot={{ fill: '#51cf66', strokeWidth: 2, r: 3 }}
                isAnimationActive={true}
                connectNulls={false}
                data={liveData.slice(-5)} // Show last 5 points with dots
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {isCalibrating && (
        <div className="calibration-overlay">
          <div className="calibration-message">
            Look at the {calibrationStep} position...
          </div>
        </div>
      )}
    </div>
  );
};

export default EyeTracker; 