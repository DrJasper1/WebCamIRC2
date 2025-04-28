const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Debug info
let connections = new Map();
let roomsInfo = new Map();
let waitingUsers = new Set();

// Connection handling
io.on('connection', (socket) => {
    console.log('User connected: ', socket.id);
    socket.emit('connected', { id: socket.id });
    
    // Keep-alive mechanism (Temporarily commented out for debugging)
    // setInterval(() => {
    //     socket.emit('ping');
    // }, 30000); // Send ping every 30 seconds

    connections.set(socket.id, { 
        id: socket.id, 
        room: null,
        connectedAt: new Date().toISOString() 
    });
    
    updateDebugInfo();
    
    // Looking for random chat partner
    socket.on('findPartner', () => {
        console.log(`[Server] Received 'findPartner' event from user ${socket.id}`);
        console.log(`[Server] User ${socket.id} is looking for a partner.`);
        console.log(`[Server] waitingUsers before add: [${Array.from(waitingUsers)}]`);

        if (waitingUsers.has(socket.id)) {
            console.log(`[Server] User ${socket.id} is already waiting.`);
            return; // Already waiting
        }

        waitingUsers.add(socket.id);
        console.log(`[Server] User ${socket.id} added to waiting list.`);
        console.log(`[Server] waitingUsers after add: [${Array.from(waitingUsers)}]`);

        if (waitingUsers.size >= 2) {
            console.log('[Server] Found potential pair!');
            // Find two users
            let partner1Id = null;
            let partner2Id = null;
            const users = Array.from(waitingUsers);
            partner1Id = users[0];
            partner2Id = users[1];

            // Remove them from waiting list
            waitingUsers.delete(partner1Id);
            waitingUsers.delete(partner2Id);
            console.log(`[Server] Removed ${partner1Id} and ${partner2Id} from waiting list.`);
            console.log(`[Server] waitingUsers after removal: [${Array.from(waitingUsers)}]`);

            // Create a room ID
            const roomId = uuidv4();
            console.log(`[Server] Creating room: ${roomId}`);

            // Notify both users
            if (io.sockets.sockets.get(partner1Id)) {
                io.sockets.sockets.get(partner1Id).emit('partnerFound', { roomId: roomId, initiator: true });
                console.log(`[Server] Emitted 'partnerFound' (initiator) to ${partner1Id} for room ${roomId}`);
            } else {
                console.error(`[Server] Error: Could not find socket for partner1Id: ${partner1Id}`);
            }
            
            if (io.sockets.sockets.get(partner2Id)) {
                io.sockets.sockets.get(partner2Id).emit('partnerFound', { roomId: roomId, initiator: false });
                console.log(`[Server] Emitted 'partnerFound' (non-initiator) to ${partner2Id} for room ${roomId}`);
            } else {
                 console.error(`[Server] Error: Could not find socket for partner2Id: ${partner2Id}`);
            }

            // Store room info (optional, for debug or other features)
            roomsInfo.set(roomId, { users: [partner1Id, partner2Id] });
            updateDebugInfo(); // Update debug info after pairing
        } else {
            console.log(`[Server] Not enough users waiting (${waitingUsers.size}). User ${socket.id} must wait.`);
        }
    });

    // Handle WebRTC signaling
    socket.on('signal', (data) => {
        const { roomId, signal } = data;
        
        if (!roomId || !connections.get(socket.id).room || connections.get(socket.id).room !== roomId) {
            socket.emit('debug', { message: 'Invalid room for signaling', roomId });
            return;
        }
        
        // Find the partner in the room
        const roomData = roomsInfo.get(roomId);
        if (!roomData) return;
        
        const partnerId = roomData.users.find(id => id !== socket.id);
        if (!partnerId) return;
        
        // Forward the signal
        io.to(partnerId).emit('signal', { signal, from: socket.id });
        socket.emit('debug', { message: 'Signal sent', to: partnerId });
    });

    // End chat
    socket.on('endChat', () => {
        const userInfo = connections.get(socket.id);
        if (userInfo && userInfo.room) {
            const roomId = userInfo.room;
            const roomData = roomsInfo.get(roomId);
            
            if (roomData) {
                // Notify the other user
                roomData.users.forEach(userId => {
                    if (userId !== socket.id) {
                        io.to(userId).emit('chatEnded');
                        io.to(userId).emit('debug', { message: 'Chat ended by partner' });
                        
                        // Update their connection info
                        if (connections.has(userId)) {
                            connections.get(userId).room = null;
                        }
                    }
                });
                
                // Remove room
                roomsInfo.delete(roomId);
            }
            
            // Update this user's connection info
            userInfo.room = null;
            socket.emit('debug', { message: 'You ended the chat' });
        }
        
        updateDebugInfo();
    });

    // Join specific room (for testing)
    socket.on('joinSpecificRoom', (roomId) => {
        console.log(`User ${socket.id} requesting to join specific room: ${roomId}`);
        
        // Create room if it doesn't exist
        if (!roomsInfo.has(roomId)) {
            roomsInfo.set(roomId, {
                id: roomId,
                users: [socket.id],
                createdAt: new Date().toISOString()
            });
            socket.join(roomId);
            connections.get(socket.id).room = roomId;
            socket.emit('waitingInRoom', { roomId });
            socket.emit('debug', { message: 'Created and joined specific room', roomId });
        } else {
            // Join existing room
            const room = roomsInfo.get(roomId);
            
            // Only allow two users per room
            if (room.users.length >= 2) {
                socket.emit('roomFull', { roomId });
                socket.emit('debug', { message: 'Room is full', roomId });
                return;
            }
            
            socket.join(roomId);
            room.users.push(socket.id);
            connections.get(socket.id).room = roomId;
            
            // Notify both users
            io.to(roomId).emit('chatStart', { roomId });
            io.to(roomId).emit('debug', { 
                message: 'Chat started in specific room', 
                roomId,
                users: room.users
            });
        }
        
        updateDebugInfo();
    });

    // Handle chat messages
    socket.on('chatMessage', (message) => {
        io.emit('chatMessage', message);
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected: ', socket.id);
        console.log('Reason: ', socket.disconnected);
        console.log('Was the socket closed by the client?', socket.client.conn.readyState === 3);
        console.log('Was the socket closed by the server?', socket.client.conn.readyState === 4);
        
        // Remove user from connections map
        connections.delete(socket.id);
        
        updateDebugInfo();
    });

    socket.on('joinRoom', (roomId) => {
        socket.join(roomId);
        console.log('User ', socket.id, ' joined room ', roomId);
        socket.to(roomId).emit('user-connected', socket.id);

        // Get the list of users in the room
        const room = io.sockets.adapter.rooms.get(roomId);
        const users = room ? Array.from(room) : [];
        io.to(roomId).emit('all_users', users)
    });
});

// Send debug info to all clients
function updateDebugInfo() {
    const debugData = {
        connections: Array.from(connections.entries()).map(([id, info]) => info),
        rooms: Array.from(roomsInfo.entries()).map(([id, info]) => info),
        timestamp: new Date().toISOString()
    };
    
    io.emit('debugInfo', debugData);
}

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`Network: Find your local IP address and use http://YOUR_IP:${PORT}`);
});
