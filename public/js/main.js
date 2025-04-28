// DOM Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const endBtn = document.getElementById('endBtn');
const muteAudioBtn = document.getElementById('muteAudioBtn');
const muteVideoBtn = document.getElementById('muteVideoBtn');
const roomIdInput = document.getElementById('roomIdInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomInfoElem = document.getElementById('roomInfo');
const toggleDebugBtn = document.getElementById('toggleDebugBtn');
const clearLogBtn = document.getElementById('clearLogBtn');

// Debug Elements
const connectionStatus = document.getElementById('connectionStatus');
const roomsDebug = document.getElementById('roomsDebug');
const connectionsDebug = document.getElementById('connectionsDebug');
const webrtcEvents = document.getElementById('webrtcEvents');
const webrtcStatus = document.getElementById('webrtcStatus');
const iceDebug = document.getElementById('iceDebug');
const signalingDebug = document.getElementById('signalingDebug');
const mediaStatus = document.getElementById('mediaStatus');
const mediaCapabilities = document.getElementById('mediaCapabilities');
const microphoneDetails = document.getElementById('microphoneDetails');
const eventLog = document.getElementById('eventLog');

// Visualizer Elements
const localAudioCanvas = document.getElementById('localAudioVisualizer');
const remoteAudioCanvas = document.getElementById('remoteAudioVisualizer');
const localAudioCtx = localAudioCanvas.getContext('2d');
const remoteAudioCtx = remoteAudioCanvas.getContext('2d');

// Connect to socket.io server
const socket = io();
let localStream = null;
let peerConnection = null;
let currentRoom = null;
let isAudioMuted = false;
let isVideoMuted = false;
let audioAnalyser = null;
let audioContext = null;

// Configuration for WebRTC
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// Debug helpers
function logEvent(category, message, data = null) {
    const timestamp = new Date().toISOString().slice(11, 23);
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'log-timestamp';
    timestampSpan.textContent = `[${timestamp}]`;
    
    logEntry.appendChild(timestampSpan);
    logEntry.appendChild(document.createTextNode(` [${category}] ${message}`));
    
    if (data) {
        try {
            const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : data.toString();
            if (dataStr.length > 100) {
                const detailsElem = document.createElement('details');
                const summaryElem = document.createElement('summary');
                summaryElem.textContent = 'Show details';
                const preElem = document.createElement('pre');
                preElem.textContent = dataStr;
                
                detailsElem.appendChild(summaryElem);
                detailsElem.appendChild(preElem);
                logEntry.appendChild(detailsElem);
            } else {
                logEntry.appendChild(document.createTextNode(`: ${dataStr}`));
            }
        } catch (error) {
            logEntry.appendChild(document.createTextNode(': [Data cannot be displayed]'));
        }
    }
    
    eventLog.prepend(logEntry);
    
    // Update specific debug panels
    updateSpecificDebugPanel(category, message, data);
}

function updateSpecificDebugPanel(category, message, data) {
    switch(category) {
        case 'WEBRTC':
            appendToElement(webrtcEvents, message, data);
            // Also update WebRTC status summary
            if (data && (message.includes('state changed') || message.includes('connection'))) {
                webrtcStatus.innerHTML = `<div class="status-indicator ${data === 'connected' ? 'success' : (data === 'failed' ? 'error' : 'pending')}">
                    ${message}: <strong>${data}</strong> - ${new Date().toLocaleTimeString()}
                </div>`;
            }
            break;
        case 'ICE':
            appendToElement(iceDebug, message, data);
            break;
        case 'SIGNALING':
            appendToElement(signalingDebug, message, data);
            break;
        case 'MEDIA':
            appendToElement(mediaStatus, message, data);
            break;
        case 'CONNECTION':
            // For connection status, replace content instead of append
            if (message.includes('Connected to signaling server')) {
                connectionStatus.innerHTML = `<div class="status-indicator success">${message}</div>`;
            } else if (message.includes('Disconnected')) {
                connectionStatus.innerHTML = `<div class="status-indicator error">${message}</div>`;
            } else {
                appendToElement(connectionStatus, message, data);
            }
            break;
        case 'MICROPHONE':
            // For microphone information, we want to display it prominently
            updateMicrophoneInfo(message, data);
            break;
    }
}

function updateMicrophoneInfo(message, data) {
    // Create nicely formatted microphone info
    const micInfo = document.createElement('div');
    micInfo.className = 'mic-info';
    
    if (data && data.label) {
        micInfo.innerHTML = `
            <div class="mic-status success">
                <h5>🎤 Microphone Detected</h5>
                <div><strong>Name:</strong> ${data.label}</div>
                <div><strong>ID:</strong> ${data.id || 'Unknown'}</div>
                <div><strong>State:</strong> ${data.enabled ? 'Enabled' : 'Disabled'}</div>
                <div><strong>Muted:</strong> ${data.muted ? 'Yes' : 'No'}</div>
                <div><strong>Last Updated:</strong> ${new Date().toLocaleTimeString()}</div>
            </div>
        `;
        
        // If we have constraints or settings, add them
        if (data.settings) {
            const settingsHtml = Object.entries(data.settings)
                .map(([key, value]) => `<div><strong>${key}:</strong> ${value}</div>`)
                .join('');
                
            micInfo.innerHTML += `
                <details>
                    <summary>Microphone Settings</summary>
                    <div class="mic-details">${settingsHtml}</div>
                </details>
            `;
        }
    } else {
        micInfo.innerHTML = `
            <div class="mic-status warning">
                <h5>⚠️ Microphone Issue</h5>
                <div>${message || 'No microphone detected or access denied'}</div>
                <div><strong>Last Checked:</strong> ${new Date().toLocaleTimeString()}</div>
            </div>
        `;
    }
    
    // Replace current microphone info
    microphoneDetails.innerHTML = '';
    microphoneDetails.appendChild(micInfo);
}

function appendToElement(element, message, data = null) {
    const line = document.createElement('div');
    line.textContent = message;
    
    if (data) {
        try {
            const pre = document.createElement('pre');
            pre.textContent = typeof data === 'object' ? JSON.stringify(data, null, 2) : data.toString();
            line.appendChild(pre);
        } catch (error) {
            // Ignore stringify errors
        }
    }
    
    element.prepend(line);
    
    // Keep only the last 10 items
    const items = element.querySelectorAll('div');
    if (items.length > 10) {
        for (let i = 10; i < items.length; i++) {
            element.removeChild(items[i]);
        }
    }
}

// Initialize media stream
async function initializeMediaStream() {
    try {
        // Request access to webcam and microphone
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        localStream = stream;
        localVideo.srcObject = stream;
        
        // Enable buttons
        startBtn.disabled = false;
        joinRoomBtn.disabled = false;
        
        logEvent('MEDIA', 'Local media stream initialized successfully');
        updateMediaDebugInfo();
        
        // Setup audio analyzer and visualizer
        setupAudioVisualizer(stream, 'local');
        
        return true;
    } catch (error) {
        logEvent('ERROR', 'Failed to access media devices', error.message);
        
        // Create a fallback for testing (canvas stream instead of camera)
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            
            // Draw something on the canvas
            ctx.fillStyle = '#333';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.font = '24px Arial';
            ctx.fillText('Camera Unavailable', 20, 240);
            ctx.fillText('Test Mode Active', 20, 270);
            
            // Add timestamp that updates
            setInterval(() => {
                ctx.fillStyle = '#333';
                ctx.fillRect(0, 300, canvas.width, 40);
                ctx.fillStyle = '#fff';
                ctx.fillText(new Date().toLocaleTimeString(), 20, 330);
            }, 1000);
            
            // Create a stream from the canvas
            const stream = canvas.captureStream(30);
            
            // Create audio track for testing
            try {
                logEvent('MEDIA', 'Attempting to get audio-only stream for fallback');
                
                // First try to get just audio, as this might work even if video is in use
                // Use specific constraints for better compatibility
                const audioStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    },
                    video: false
                });
                
                // Add the real audio track to our canvas stream
                const audioTrack = audioStream.getAudioTracks()[0];
                
                // Log detailed info about the audio track
                logEvent('MEDIA', 'Audio track details for fallback', {
                    id: audioTrack.id,
                    label: audioTrack.label,
                    constraints: audioTrack.getConstraints(),
                    settings: audioTrack.getSettings(),
                    capabilities: audioTrack.getCapabilities ? audioTrack.getCapabilities() : 'Not supported'
                });
                
                stream.addTrack(audioTrack);
                
                // Add audio debug indicator to video
                const audioIndicator = document.createElement('div');
                audioIndicator.textContent = '🎤 Real Microphone Active';
                audioIndicator.style.cssText = 'position:absolute; top:10px; left:10px; background:rgba(0,0,0,0.5); color:white; padding:5px; border-radius:5px; z-index:100;';
                localVideo.parentElement.appendChild(audioIndicator);
                
                logEvent('MEDIA', 'Using real audio with fallback video');
            } catch (audioError) {
                // If we can't get real audio, create a synthetic tone
                logEvent('MEDIA', 'Could not access microphone, using synthetic audio', audioError.message);
                
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioCtx.createOscillator();
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // A4 note
                
                // Add gain to control volume and make it very quiet by default
                const gainNode = audioCtx.createGain();
                gainNode.gain.value = 0.01; // Very quiet
                
                oscillator.connect(gainNode);
                const dst = gainNode.connect(audioCtx.createMediaStreamDestination());
                oscillator.start();
                
                const audioTrack = dst.stream.getAudioTracks()[0];
                stream.addTrack(audioTrack);
                
                // Add UI control to test audio
                const testAudioBtn = document.createElement('button');
                testAudioBtn.textContent = 'Test Audio Tone';
                testAudioBtn.style.position = 'absolute';
                testAudioBtn.style.bottom = '10px';
                testAudioBtn.style.left = '10px';
                testAudioBtn.style.zIndex = '10';
                localVideo.parentElement.appendChild(testAudioBtn);
                
                testAudioBtn.addEventListener('mousedown', () => {
                    gainNode.gain.value = 0.2; // Louder when pressed
                });
                
                testAudioBtn.addEventListener('mouseup', () => {
                    gainNode.gain.value = 0.01; // Back to quiet
                });
                
                testAudioBtn.addEventListener('mouseleave', () => {
                    gainNode.gain.value = 0.01; // Back to quiet
                });
            }
            
            localStream = stream;
            localVideo.srcObject = stream;
            
            // Enable buttons
            startBtn.disabled = false;
            joinRoomBtn.disabled = false;
            
            logEvent('MEDIA', 'Using fallback test stream (no camera)');
            updateMediaDebugInfo();
            
            return true;
        } catch (fallbackError) {
            logEvent('ERROR', 'Failed to create fallback stream', fallbackError.message);
            alert(`Error accessing your camera and microphone: ${error.message}\n\nFallback also failed: ${fallbackError.message}`);
            return false;
        }
    }
}

function setupAudioVisualizer(stream, type = 'local') {
    try {
        // Check if stream has audio tracks before setting up analyzer
        const audioTracks = stream.getAudioTracks();
        
        if (audioTracks.length > 0) {
            // If we found audio tracks, log detailed information about the microphone
            const audioTrack = audioTracks[0];
            logEvent('MICROPHONE', `${type.toUpperCase()} Microphone detected`, {
                id: audioTrack.id,
                label: audioTrack.label,
                enabled: audioTrack.enabled,
                muted: audioTrack.muted,
                settings: audioTrack.getSettings ? audioTrack.getSettings() : 'Not available',
                readyState: audioTrack.readyState
            });
        } else {
            logEvent('MICROPHONE', `No ${type} microphone available`, { streamHasAudio: false });
            return;
        }
        
        // Set up audio context and analyzer
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024; // Larger FFT size for more detailed visualization
        
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        
        // Create data array for visualization
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        // Select the right canvas for visualization
        const canvas = type === 'local' ? localAudioCanvas : remoteAudioCanvas;
        const canvasCtx = canvas.getContext('2d');
        
        // Variables for the visualizer
        const WIDTH = canvas.width;
        const HEIGHT = canvas.height;
        let animationId;
        
        // Function to draw the visualization
        function draw() {
            animationId = requestAnimationFrame(draw);
            
            // Get frequency data
            analyser.getByteFrequencyData(dataArray);
            
            // Clear canvas
            canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
            canvasCtx.fillStyle = '#f0f0f0';
            canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
            
            // Draw frequency bars
            const barWidth = (WIDTH / bufferLength) * 2.5;
            let barHeight;
            let x = 0;
            
            // Calculate overall volume for display
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            const volume = Math.min(100, Math.round((average / 256) * 100));
            
            // Draw volume indicator text
            canvasCtx.fillStyle = volume > 5 ? '#4CAF50' : '#999';
            canvasCtx.font = '12px Arial';
            canvasCtx.fillText(`Volume: ${volume}%`, 10, 20);
            
            // Draw activity indicator
            const indicatorSize = 10;
            canvasCtx.beginPath();
            canvasCtx.arc(WIDTH - 20, 15, indicatorSize, 0, Math.PI * 2);
            canvasCtx.fillStyle = volume > 5 ? '#4CAF50' : '#999';
            canvasCtx.fill();
            
            // Only draw bars if there's some audio activity
            if (volume > 2) {
                for (let i = 0; i < bufferLength; i++) {
                    barHeight = dataArray[i] / 2;
                    
                    // Use a gradient color based on frequency
                    const hue = (i / bufferLength) * 180 + 180; // 180-360 range (cyan to blue)
                    canvasCtx.fillStyle = `hsl(${hue}, 70%, 60%)`;
                    canvasCtx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);
                    
                    x += barWidth + 1;
                    if (x > WIDTH) break;
                }
            }
            
            // Update debug display
            if (type === 'local' && volume > 5) {
                // Update microphone status to show it's active
                const micInfo = microphoneDetails.querySelector('.mic-status');
                if (micInfo && micInfo.classList.contains('warning')) {
                    micInfo.classList.remove('warning');
                    micInfo.classList.add('success');
                    micInfo.querySelector('h5').innerHTML = '🎤 Microphone Active';
                }
            }
        }
        
        // Start the visualization
        draw();
        
        // Store context and animation ID for cleanup
        if (type === 'local') {
            window._localAudioContext = { ctx, animationId };
        } else {
            window._remoteAudioContext = { ctx, animationId };
        }
        
        return { ctx, analyser };
    } catch (error) {
        logEvent('ERROR', `Failed to setup ${type} audio visualizer`, error.message);
        
        // Draw error message on canvas
        const canvas = type === 'local' ? localAudioCanvas : remoteAudioCanvas;
        const canvasCtx = canvas.getContext('2d');
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        canvasCtx.fillStyle = '#f8d7da';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        canvasCtx.fillStyle = '#721c24';
        canvasCtx.font = '12px Arial';
        canvasCtx.fillText(`Error: ${error.message}`, 10, 30);
        
        return null;
    }
}

// We've replaced monitorAudioLevels with the more comprehensive setupAudioVisualizer

function updateMediaDebugInfo() {
    if (!localStream) return;
    
    const videoTracks = localStream.getVideoTracks();
    const audioTracks = localStream.getAudioTracks();
    
    const videoInfo = videoTracks.length > 0 ? {
        label: videoTracks[0].label,
        enabled: videoTracks[0].enabled,
        muted: isVideoMuted,
        settings: videoTracks[0].getSettings()
    } : 'No video track';
    
    const audioInfo = audioTracks.length > 0 ? {
        label: audioTracks[0].label,
        enabled: audioTracks[0].enabled,
        muted: isAudioMuted,
        settings: audioTracks[0].getSettings()
    } : 'No audio track';
    
    // Display media capabilities
    navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            const deviceInfo = devices.map(device => ({
                deviceId: device.deviceId.substring(0, 8) + '...',
                kind: device.kind,
                label: device.label
            }));
            
            mediaCapabilities.innerHTML = `<pre>${JSON.stringify(deviceInfo, null, 2)}</pre>`;
        })
        .catch(error => {
            mediaCapabilities.innerHTML = `Error getting devices: ${error.message}`;
        });
    
    // Update media status
    mediaStatus.innerHTML = `
        <div>Video: <pre>${JSON.stringify(videoInfo, null, 2)}</pre></div>
        <div>Audio: <pre>${JSON.stringify(audioInfo, null, 2)}</pre></div>
    `;
}

// Create and manage WebRTC peer connection
function createPeerConnection() {
    logEvent('WEBRTC', 'Creating RTCPeerConnection');
    
    // Create new RTCPeerConnection with modified config for better compatibility
    const config = {
        ...rtcConfig,
        sdpSemantics: 'unified-plan',  // Ensure modern SDP handling
        iceTransportPolicy: 'all'      // Try all methods to establish connection
    };
    
    peerConnection = new RTCPeerConnection(config);
    
    // Log the audio and video tracks we have available
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        const videoTracks = localStream.getVideoTracks();
        
        logEvent('WEBRTC', 'Local tracks available', {
            audio: audioTracks.length,
            video: videoTracks.length,
            audioDetails: audioTracks.map(track => ({
                id: track.id,
                label: track.label,
                enabled: track.enabled,
                muted: track.muted,
                readyState: track.readyState
            })),
            videoDetails: videoTracks.map(track => ({
                id: track.id,
                label: track.label,
                enabled: track.enabled,
                muted: track.muted,
                readyState: track.readyState
            }))
        });
        
        // Add all local tracks to the peer connection
        const senders = localStream.getTracks().map(track => {
            const sender = peerConnection.addTrack(track, localStream);
            logEvent('WEBRTC', `Added local track: ${track.kind}`, { trackId: track.id });
            return sender;
        });
        
        // Store sender references for potential debug/modification needs
        window._rtpSenders = senders;
    } else {
        logEvent('ERROR', 'No local stream available when creating peer connection');
    }
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            // Extract useful debug info from candidate
            const candidateInfo = {
                foundation: event.candidate.candidate.split(' ')[0],
                component: event.candidate.candidate.split(' ')[1],
                protocol: event.candidate.candidate.split(' ')[2],
                priority: event.candidate.candidate.split(' ')[3],
                ip: event.candidate.candidate.split(' ')[4],
                port: event.candidate.candidate.split(' ')[5],
                type: event.candidate.candidate.split(' ')[7]
            };
            
            logEvent('ICE', 'New ICE candidate', candidateInfo);
            
            // Send the ICE candidate to the remote peer via the signaling server
            socket.emit('signal', {
                roomId: currentRoom,
                signal: {
                    type: 'ice-candidate',
                    candidate: event.candidate
                }
            });
        } else {
            logEvent('ICE', 'ICE gathering complete');
        }
    };
    
    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        logEvent('ICE', 'ICE connection state changed', peerConnection.iceConnectionState);
        
        // Add detailed diagnostics for failed connections
        if (peerConnection.iceConnectionState === 'failed') {
            logEvent('ERROR', 'ICE connection failed - detailed diagnostics', {
                iceGatheringState: peerConnection.iceGatheringState,
                signalingState: peerConnection.signalingState,
                connectionState: peerConnection.connectionState,
                timestamp: new Date().toISOString()
            });
        }
    };
    
    // Handle signaling state changes
    peerConnection.onsignalingstatechange = () => {
        logEvent('SIGNALING', 'Signaling state changed', peerConnection.signalingState);
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        logEvent('WEBRTC', 'Connection state changed', peerConnection.connectionState);
        
        if (peerConnection.connectionState === 'connected') {
            logEvent('CONNECTION', 'Peer connection established successfully');
            
            // Once connected, add diagnostic info to the UI
            const diagInfo = document.createElement('div');
            diagInfo.className = 'connection-info';
            diagInfo.textContent = 'Connection established! 🎉';
            diagInfo.style.cssText = 'position:absolute; top:10px; left:10px; background:rgba(0,0,0,0.5); color:white; padding:5px; border-radius:5px; z-index:100;';
            remoteVideo.parentElement.appendChild(diagInfo);
            
            // Check for active audio track in remote stream
            setTimeout(checkRemoteAudio, 1000);
            
        } else if (peerConnection.connectionState === 'failed' || 
                  peerConnection.connectionState === 'disconnected' || 
                  peerConnection.connectionState === 'closed') {
            logEvent('CONNECTION', 'Peer connection closed or failed', peerConnection.connectionState);
        }
    };
    
    // Handle incoming remote tracks
    peerConnection.ontrack = (event) => {
        const trackInfo = {
            kind: event.track.kind,
            id: event.track.id,
            label: event.track.label,
            enabled: event.track.enabled,
            muted: event.track.muted,
            readyState: event.track.readyState
        };
        
        logEvent('WEBRTC', 'Received remote track', trackInfo);
        
        // For audio tracks, add special monitoring
        if (event.track.kind === 'audio') {
            event.track.onmute = () => logEvent('MEDIA', 'Remote audio track muted');
            event.track.onunmute = () => logEvent('MEDIA', 'Remote audio track unmuted');
            event.track.onended = () => logEvent('MEDIA', 'Remote audio track ended');
            
            // Add debug info to UI about audio track
            const audioInfo = document.createElement('div');
            audioInfo.className = 'audio-track-info';
            audioInfo.textContent = `Audio track connected: ${event.track.label || 'Unnamed track'}`;
            audioInfo.style.cssText = 'position:absolute; bottom:10px; right:10px; background:rgba(0,0,0,0.5); color:white; padding:5px; border-radius:5px; z-index:100;';
            remoteVideo.parentElement.appendChild(audioInfo);
        }
        
        // Display the remote video stream
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            
            // Log information about the received stream
            const remoteStream = event.streams[0];
            logEvent('MEDIA', 'Remote stream details', {
                audio: remoteStream.getAudioTracks().length,
                video: remoteStream.getVideoTracks().length,
                id: remoteStream.id
            });
            
            // Add audio visualizer for remote stream
            if (remoteStream.getAudioTracks().length > 0) {
                setupAudioVisualizer(remoteStream, 'remote');
            }
        }
    };
    
    return peerConnection;
}

// Check remote audio after connection is established
function checkRemoteAudio() {
    if (!remoteVideo.srcObject) {
        logEvent('ERROR', 'No remote stream available after connection');
        return;
    }
    
    const audioTracks = remoteVideo.srcObject.getAudioTracks();
    logEvent('MEDIA', 'Remote audio check', {
        audioTracks: audioTracks.length,
        details: audioTracks.map(track => ({
            id: track.id,
            label: track.label,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState
        }))
    });
    
    if (audioTracks.length === 0) {
        const noAudioWarning = document.createElement('div');
        noAudioWarning.className = 'no-audio-warning';
        noAudioWarning.textContent = 'No audio track detected in remote stream';
        noAudioWarning.style.cssText = 'position:absolute; top:40px; left:10px; background:rgba(255,0,0,0.7); color:white; padding:5px; border-radius:5px; z-index:100;';
        remoteVideo.parentElement.appendChild(noAudioWarning);
    }
}

// This function has been replaced by the more comprehensive setupAudioVisualizer

// Handle incoming WebRTC signals
async function handleSignal(data) {
    const { signal } = data;
    
    if (!peerConnection) {
        createPeerConnection();
    }
    
    if (signal.type === 'offer') {
        logEvent('SIGNALING', 'Received offer signal');
        logEvent('WEBRTC', 'Offer SDP details', analyzeSessionDescription(signal));
        
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
            logEvent('WEBRTC', 'Set remote description from offer');
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            logEvent('WEBRTC', 'Created and set local description (answer)');
            logEvent('WEBRTC', 'Answer SDP details', analyzeSessionDescription(answer));
            
            socket.emit('signal', {
                roomId: currentRoom,
                signal: peerConnection.localDescription
            });
            logEvent('SIGNALING', 'Sent answer signal');
        } catch (error) {
            logEvent('ERROR', 'Error handling offer signal', error.message);
        }
    } else if (signal.type === 'answer') {
        logEvent('SIGNALING', 'Received answer signal');
        logEvent('WEBRTC', 'Answer SDP details', analyzeSessionDescription(signal));
        
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
            logEvent('WEBRTC', 'Set remote description from answer');
        } catch (error) {
            logEvent('ERROR', 'Error handling answer signal', error.message);
        }
    } else if (signal.type === 'ice-candidate') {
        logEvent('SIGNALING', 'Received ICE candidate signal');
        
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
            logEvent('ICE', 'Added received ICE candidate', {
                type: signal.candidate.candidate.split(' ')[7], // Extract candidate type (host, srflx, etc.)
                protocol: signal.candidate.candidate.includes('UDP') ? 'UDP' : 'TCP',
                component: signal.candidate.candidate.split(' ')[1] // RTP or RTCP
            });
        } catch (error) {
            logEvent('ERROR', 'Error adding received ICE candidate', error.message);
        }
    }
}

// Analyze SDP to extract audio/video information
function analyzeSessionDescription(sdp) {
    const result = {
        hasAudio: false,
        hasVideo: false,
        audioCodecs: [],
        videoCodecs: [],
        rtpExtensions: []
    };
    
    if (!sdp || !sdp.sdp) return result;
    
    const sdpString = sdp.sdp;
    const lines = sdpString.split('\r\n');
    
    let currentMedia = '';
    
    for (const line of lines) {
        // Check media types
        if (line.startsWith('m=')) {
            currentMedia = line.split(' ')[0].substr(2);
            if (currentMedia === 'audio') result.hasAudio = true;
            if (currentMedia === 'video') result.hasVideo = true;
        }
        
        // Get codec info
        if (line.startsWith('a=rtpmap:') && currentMedia) {
            const codec = line.split(' ')[1].split('/')[0];
            if (currentMedia === 'audio') result.audioCodecs.push(codec);
            if (currentMedia === 'video') result.videoCodecs.push(codec);
        }
        
        // Get RTP extensions
        if (line.startsWith('a=extmap:')) {
            const ext = line.split(' ')[1];
            result.rtpExtensions.push(ext);
        }
    }
    
    return result;
}

// Start random chat
async function startRandomChat() {
    if (!localStream) {
        // Try initializing with fallback for testing
        const success = await initializeMediaStream();
        if (!success) {
            alert('Failed to initialize media stream. Please try again or check console for errors.');
            return;
        }
    }
    
    // Reset any existing connections
    resetConnection();
    
    // Enable/disable buttons
    startBtn.disabled = true;
    joinRoomBtn.disabled = true;
    
    // Find a random chat partner
    socket.emit('findPartner');
    logEvent('CONNECTION', 'Looking for a random chat partner');
    
    updateUIForWaiting();
}

// Join specific room (for testing)
async function joinSpecificRoom() {
    const roomId = roomIdInput.value.trim();
    
    if (!roomId) {
        alert('Please enter a room ID');
        return;
    }
    
    if (!localStream) {
        // Try initializing with fallback for testing
        const success = await initializeMediaStream();
        if (!success) {
            alert('Failed to initialize media stream. Please try again or check console for errors.');
            return;
        }
    }
    
    // Reset any existing connections
    resetConnection();
    
    // Enable/disable buttons
    startBtn.disabled = true;
    joinRoomBtn.disabled = true;
    
    // Join the specific room
    socket.emit('joinSpecificRoom', roomId);
    logEvent('CONNECTION', `Joining specific room: ${roomId}`);
    
    updateUIForWaiting();
}

// End current chat
function endCurrentChat() {
    if (currentRoom) {
        socket.emit('endChat');
        logEvent('CONNECTION', 'Ending current chat');
        resetConnection();
    }
}

// Reset connection and UI
function resetConnection() {
    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Reset remote video
    if (remoteVideo.srcObject) {
        const tracks = remoteVideo.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    
    // Reset current room
    currentRoom = null;
    
    // Reset UI
    startBtn.disabled = false;
    joinRoomBtn.disabled = false;
    endBtn.disabled = true;
    muteAudioBtn.disabled = true;
    muteVideoBtn.disabled = true;
    
    roomInfoElem.textContent = '';
    
    logEvent('CONNECTION', 'Connection reset');
}

// Update UI for waiting state
function updateUIForWaiting() {
    endBtn.disabled = false;
    roomInfoElem.textContent = 'Waiting for a connection...';
}

// Update UI for connected state
function updateUIForConnected(roomId) {
    startBtn.disabled = true;
    joinRoomBtn.disabled = true;
    endBtn.disabled = false;
    muteAudioBtn.disabled = false;
    muteVideoBtn.disabled = false;
    
    roomInfoElem.textContent = `Connected in room: ${roomId}`;
    currentRoom = roomId;
}

// Toggle audio mute
function toggleAudioMute() {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            isAudioMuted = !isAudioMuted;
            audioTracks[0].enabled = !isAudioMuted;
            
            muteAudioBtn.innerHTML = isAudioMuted ? 
                '<span class="icon">🔇</span>' : 
                '<span class="icon">🎤</span>';
                
            logEvent('MEDIA', `Audio ${isAudioMuted ? 'muted' : 'unmuted'}`);
            updateMediaDebugInfo();
        } else {
            alert('No audio track available to mute/unmute');
        }
    }
}

// Toggle video mute
function toggleVideoMute() {
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            isVideoMuted = !isVideoMuted;
            videoTracks[0].enabled = !isVideoMuted;
            
            muteVideoBtn.innerHTML = isVideoMuted ? 
                '<span class="icon">🚫</span>' : 
                '<span class="icon">📹</span>';
                
            logEvent('MEDIA', `Video ${isVideoMuted ? 'muted' : 'unmuted'}`);
            updateMediaDebugInfo();
        }
    }
}

// Socket.io event handlers
socket.on('connect', () => {
    logEvent('CONNECTION', 'Connected to signaling server', { socketId: socket.id });
    connectionStatus.textContent = `Connected to server with ID: ${socket.id}`;
});

socket.on('disconnect', () => {
    logEvent('CONNECTION', 'Disconnected from signaling server');
    connectionStatus.textContent = 'Disconnected from server';
    resetConnection();
});

socket.on('waiting', () => {
    logEvent('CONNECTION', 'Waiting for a partner');
});

socket.on('chatStart', async (data) => {
    logEvent('CONNECTION', 'Chat started', data);
    updateUIForConnected(data.roomId);
    
    // Create peer connection if not exists
    if (!peerConnection) {
        createPeerConnection();
    }
    
    // If we are the initiator, create and send an offer
    if (socket.id === data.users?.[0]) {
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            logEvent('WEBRTC', 'Created and set local description (offer)');
            
            socket.emit('signal', {
                roomId: data.roomId,
                signal: peerConnection.localDescription
            });
            logEvent('SIGNALING', 'Sent offer signal');
        } catch (error) {
            logEvent('ERROR', 'Error creating offer', error.message);
        }
    }
});

socket.on('chatEnded', () => {
    logEvent('CONNECTION', 'Chat ended by partner or server');
    resetConnection();
});

socket.on('waitingInRoom', (data) => {
    logEvent('CONNECTION', 'Waiting in specific room', data);
    roomInfoElem.textContent = `Waiting in room: ${data.roomId}. Share this ID with your friend.`;
    currentRoom = data.roomId;
});

socket.on('roomFull', (data) => {
    logEvent('CONNECTION', 'Room is full', data);
    alert(`Room ${data.roomId} is full. Please try another room ID.`);
    resetConnection();
});

socket.on('signal', (data) => {
    logEvent('SIGNALING', 'Received signal', { from: data.from, type: data.signal.type });
    handleSignal(data);
});

socket.on('debug', (data) => {
    logEvent('DEBUG', data.message, data);
});

socket.on('debugInfo', (data) => {
    // Update connections debug panel
    const connectionsHtml = `<pre>${JSON.stringify(data.connections, null, 2)}</pre>`;
    connectionsDebug.innerHTML = connectionsHtml;
    
    // Update rooms debug panel
    const roomsHtml = `<pre>${JSON.stringify(data.rooms, null, 2)}</pre>`;
    roomsDebug.innerHTML = roomsHtml;
});

// UI Event Listeners
startBtn.addEventListener('click', startRandomChat);
endBtn.addEventListener('click', endCurrentChat);
joinRoomBtn.addEventListener('click', joinSpecificRoom);
muteAudioBtn.addEventListener('click', toggleAudioMute);
muteVideoBtn.addEventListener('click', toggleVideoMute);

toggleDebugBtn.addEventListener('click', () => {
    const debugContent = document.getElementById('debugContent');
    debugContent.style.display = debugContent.style.display === 'none' ? 'block' : 'none';
});

clearLogBtn.addEventListener('click', () => {
    eventLog.innerHTML = '';
});

// Debug panel is now always visible, no need for tab switching code

// Initialize the application
(async function init() {
    logEvent('SYSTEM', 'Application initializing');
    
    // Add browser info to help with debugging
    logEvent('SYSTEM', 'Browser information', {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        vendor: navigator.vendor,
        language: navigator.language
    });
    
    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        logEvent('ERROR', 'getUserMedia is not supported in this browser');
        alert('Your browser does not support the required media features. Please use a modern browser like Chrome, Firefox, or Edge.');
        return;
    }
    
    // Check WebRTC support
    const webrtcSupport = {
        RTCPeerConnection: !!window.RTCPeerConnection,
        RTCSessionDescription: !!window.RTCSessionDescription,
        RTCIceCandidate: !!window.RTCIceCandidate,
        mediaDevices: !!navigator.mediaDevices,
        mediaRecorder: !!window.MediaRecorder,
        audioContext: !!(window.AudioContext || window.webkitAudioContext)
    };
    logEvent('SYSTEM', 'WebRTC support', webrtcSupport);
    
    // Test audio context before we even start
    try {
        const testAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        logEvent('SYSTEM', 'Audio context created successfully', {
            sampleRate: testAudioCtx.sampleRate,
            state: testAudioCtx.state
        });
        // Resume audio context (needed in some browsers)
        if (testAudioCtx.state === 'suspended') {
            await testAudioCtx.resume();
            logEvent('SYSTEM', 'Audio context resumed from suspended state');
        }
        testAudioCtx.close();
    } catch (error) {
        logEvent('ERROR', 'Audio context test failed', error.message);
    }
    
    // Initialize media stream
    await initializeMediaStream();
    
    // Show debug content by default
    document.getElementById('debugContent').style.display = 'block';
    
    // Add a browser-specific audio test button
    const audioTestBtn = document.createElement('button');
    audioTestBtn.textContent = 'Test Browser Audio';
    audioTestBtn.style.cssText = 'position:fixed; bottom:10px; right:10px; z-index:9999; background:#4CAF50; color:white; border:none; padding:10px; border-radius:5px;';
    document.body.appendChild(audioTestBtn);
    
    audioTestBtn.addEventListener('click', () => {
        // Create a simple audio test
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // A4 note
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            // Short beep
            gainNode.gain.value = 0.1;
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.5);
            
            logEvent('SYSTEM', 'Browser audio test successful');
            audioTestBtn.textContent = 'Audio Works! ✓';
            audioTestBtn.style.background = '#2E7D32';
            
            // Reset after 2 seconds
            setTimeout(() => {
                audioTestBtn.textContent = 'Test Browser Audio';
                audioTestBtn.style.background = '#4CAF50';
            }, 2000);
            
        } catch (error) {
            logEvent('ERROR', 'Browser audio test failed', error.message);
            audioTestBtn.textContent = 'Audio Failed! ✗';
            audioTestBtn.style.background = '#C62828';
        }
    });
    
    logEvent('SYSTEM', 'Application initialized successfully');
})();
