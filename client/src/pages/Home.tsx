import React from 'react'
import { Link } from 'react-router-dom'

const Home: React.FC = () => {
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
          <Link to="/record">
            <button className="primary-btn">Start Recording</button>
          </Link>
        </div>

        <div className="action-card">
          <h3>View Sessions</h3>
          <p>Browse and analyze previously recorded sessions</p>
          <Link to="/sessions">
            <button className="secondary-btn">Browse Sessions</button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Home 