import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import EyeTracker from '../components/EyeTracker'

const Home: React.FC = () => {
  const [showRecorder, setShowRecorder] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSessionCreated = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  const handleViewSession = () => {
    if (currentSessionId) {
      navigate(`/sessions/${currentSessionId}`);
    }
  };

  return (
    <div className="home">
      <div className="hero-section">
        <h1>SomeEyeTrackingThing</h1>
        <p>
          Professional eye tracking application for assessment and evaluation purposes only.
          Commercial use is strictly prohibited.
        </p>
      </div>

      <div className="main-actions">
        <div className="action-card">
          <h3>Record New Session</h3>
          <p>Start a new eye tracking recording session using your webcam</p>
          <button 
            onClick={() => setShowRecorder(!showRecorder)}
            className="primary-btn"
          >
            {showRecorder ? 'Hide Recorder' : 'Start Recording'}
          </button>
        </div>

        <div className="action-card">
          <h3>View Sessions</h3>
          <p>Browse and analyze previously recorded sessions</p>
          <Link to="/sessions">
            <button className="secondary-btn">Browse Sessions</button>
          </Link>
        </div>

        {currentSessionId && (
          <div className="action-card">
            <h3>View Current Session</h3>
            <p>Analyze the session you just recorded</p>
            <button onClick={handleViewSession} className="secondary-btn">
              View Session
            </button>
          </div>
        )}
      </div>

      {showRecorder && (
        <div className="recorder-section">
          <h2>Eye Tracking Recorder</h2>
          <EyeTracker onSessionCreated={handleSessionCreated} />
        </div>
      )}
    </div>
  )
}

export default Home 