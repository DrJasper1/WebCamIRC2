# P2P Webcam Chat

A simple peer-to-peer webcam chat application similar to Omegle but with more debug options. This application allows users to chat via webcam and microphone with random strangers or specific people using direct room IDs.

## Features

- Random matching with strangers (Omegle-style)
- Direct room connections for testing and private chats
- Webcam and microphone support
- Audio/video mute controls
- Comprehensive debug panel showing:
  - Connection status
  - WebRTC events
  - ICE candidate information
  - Media status
  - Detailed event log

## Local Development

### Prerequisites

- Node.js (version 14 or higher)
- NPM (comes with Node.js)

### Installation

1. Clone this repository or download the files
2. Navigate to the project directory
3. Install dependencies:

```bash
npm install
```

### Running the Application

Start the server:

```bash
npm start
```

The application will run on http://localhost:3000 by default.

### Testing Locally (on the same computer)

1. Open http://localhost:3000 in two different browser windows or tabs
2. In one window, click "Start Random Chat" to get a room ID
3. In the other window, enter the room ID and click "Join Room"
4. The two browser windows should connect to each other

### Testing with a Friend (across the internet)

#### Option 1: Using a deployed version
Deploy this app to a hosting service like Netlify or Heroku (see deployment instructions below).

#### Option 2: Using a tunnel service
1. Install a tunnel service like ngrok:
   ```bash
   npm install -g ngrok
   ```
2. Start your application: `npm start`
3. In a new terminal, create a tunnel:
   ```bash
   ngrok http 3000
   ```
4. Share the generated ngrok URL with your friend
5. You can both use the same URL to access the application

## Deployment

### Deploying to Netlify

1. Create a new site on Netlify
2. Connect your GitHub repository or upload the files directly
3. Use the following build settings:
   - Build command: `npm install`
   - Publish directory: `public`

### Deploying to GitHub Pages

1. Push your code to a GitHub repository
2. Enable GitHub Pages in the repository settings
3. Select the main branch as the source

## How It Works

This application uses:
- WebRTC for peer-to-peer audio/video streaming
- Socket.IO for signaling
- Express for the web server

The communication flow is:
1. Users connect to the signaling server
2. Users request to be matched randomly or join a specific room
3. When matched, users exchange WebRTC offers, answers, and ICE candidates
4. A direct peer-to-peer connection is established between browsers
5. Audio and video stream directly between peers without going through the server

## Limitations

- No encryption beyond what's built into WebRTC
- No moderation features
- Simple UI without chat text functionality
