# Eye Tracking Application

A professional eye tracking application for assessment and evaluation purposes. Uses webcam-based eye tracking with MediaPipe face mesh detection and real-time data processing.

**WARNING: Commercial use is strictly prohibited.**

## Features

### Real-time Eye Tracking
- Webcam integration with MediaPipe Face Mesh
- Real-time visualization and data processing
- Calibration system for accurate tracking
- High-performance capture and processing

### Data Analysis
- Session recording and playback
- Data export capabilities (CSV/JSON)
- Basic analytics and metrics
- Session management

### Technical Stack
- **Frontend**: React, TypeScript, Vite
- **Backend**: Fastify, Prisma, SQLite
- **Eye Tracking**: MediaPipe Face Mesh

## Quick Start

### Prerequisites
- Node.js 18+
- Modern browser with webcam access

### Installation

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd SomeEyeTrackingThing
   npm install
   cd server && npm install
   cd ../client && npm install
   ```

2. **Set up database**
   ```bash
   cd ..
   npx prisma generate
   npx prisma migrate dev
   ```

3. **Start the application**
   ```bash
   # Terminal 1: Backend
   cd server && npm run dev
   
   # Terminal 2: Frontend
   cd client && npm run dev
   ```

4. **Access the application**
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:3000

## Usage

### Basic Workflow
1. Navigate to the home page
2. Calibrate the eye tracking system
3. Start recording your session
4. View and analyze recorded sessions
5. Export data as needed

## API Overview

### Core Endpoints
- `POST /sessions` - Create new session
- `GET /sessions` - List all sessions
- `GET /sessions/:id` - Get session details
- `POST /sessions/:id/points` - Add data points
- `GET /sessions/:id/export.csv` - Export as CSV

## Project Structure

```
SomeEyeTrackingThing/
├── prisma/           # Database schema
├── server/           # Fastify backend API
└── client/           # React frontend
```

## Development

### TODO
- [ ] Add comprehensive error handling
- [ ] Implement user authentication
- [ ] Add advanced analytics features
- [ ] Optimize performance for large datasets
- [ ] Add unit and integration tests
- [ ] Implement data validation and sanitization
- [ ] Add logging and monitoring
- [ ] Create deployment documentation

## License

This application is designed for assessment and evaluation purposes only. Commercial use is strictly prohibited.

## Contributing

This is a research and evaluation tool. Please ensure compliance with local regulations and ethical guidelines when using this software.

