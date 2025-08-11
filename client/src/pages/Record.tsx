import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EyeTracker from '../components/EyeTracker'

const Record: React.FC = () => {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionSaved, setSessionSaved] = useState(false);
  const navigate = useNavigate();

  const handleSessionCreated = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setSessionSaved(false); // Reset saved status when new session starts
  };

  const handleSessionSaved = (sessionId: string, totalPoints: number) => {
    setSessionSaved(true);
  };

  const handleViewSession = () => {
    if (currentSessionId) {
      navigate(`/sessions/${currentSessionId}`);
    }
  };

  return (
    <div className="record-page">
      <div className="page-header">
        <h1>Eye Tracking Recorder</h1>
        <p>Start a new eye tracking recording session using your webcam</p>
      </div>

      <div className="recorder-section">
        <EyeTracker onSessionCreated={handleSessionCreated} onSessionSaved={handleSessionSaved} />
      </div>

      {currentSessionId && sessionSaved && (
        <div className="session-created">
          <h3>Session Saved Successfully</h3>
          <p>Your recording session has been saved. You can now view and analyze it.</p>
          <button onClick={handleViewSession} className="primary-btn">
            View Session
          </button>
        </div>
      )}
    </div>
  )
}

export default Record 