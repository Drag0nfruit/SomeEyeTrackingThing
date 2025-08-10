import React from 'react'
import { Link, useLocation } from 'react-router-dom'

const Sidebar: React.FC = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>SomeEyeTrackingThing</h2>
      </div>
      
      <nav className="sidebar-nav">
        <Link 
          to="/" 
          className={`nav-item ${isActive('/') ? 'active' : ''}`}
        >
          <span className="nav-text">Home</span>
        </Link>
        
        <Link 
          to="/record" 
          className={`nav-item ${isActive('/record') ? 'active' : ''}`}
        >
          <span className="nav-text">Record</span>
        </Link>
        
        <Link 
          to="/sessions" 
          className={`nav-item ${isActive('/sessions') ? 'active' : ''}`}
        >
          <span className="nav-text">Sessions</span>
        </Link>
      </nav>
    </div>
  )
}

export default Sidebar 