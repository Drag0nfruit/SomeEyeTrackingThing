import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import './App.css'
import Home from './pages/Home'
import Session from './pages/Session'
import Sessions from './pages/Sessions'

function App() {
  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <h1>SomeEyeTrackingThing</h1>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/sessions/:id" element={<Session />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App 