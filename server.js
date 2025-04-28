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

// Connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    connections.set(socket.id, { 
        id: socket.id, 
        room: null,
        connectedAt: new Date().toISOString() 
    });
    
    updateDebugInfo();
    
    // Looking for random chat partner
    socket.on('findPartner', () => {
        console.log(`User ${socket.id} looking for partner`);
        
        // Check if user is already in a room
        if (connections.get(socket.id).room) {
            socket.emit('debug', { message: 'Already in a room', roomId: connections.get(socket.id).room });
            return;
        }
        
        // Find another user waiting for a match
        const waitingSockets = Array.from(connections.entries())
            .filter(([id, info]) => !info.room && id !== socket.id);
        
        if (waitingSockets.length > 0) {
            // Match with the first waiting user
            const partnerId = waitingSockets[0][0];
            const roomId = uuidv4();
            
            // Join both users to the room
            socket.join(roomId);
            io.sockets.sockets.get(partnerId).join(roomId);
            
            // Update connection info
            connections.get(socket.id).room = roomId;
            connections.get(partnerId).room = roomId;
            
            // Create room info
            roomsInfo.set(roomId, {
                id: roomId,
                users: [socket.id, partnerId],
                createdAt: new Date().toISOString()
            });
            
            // Notify both users
            io.to(roomId).emit('chatStart', { roomId });
            io.to(roomId).emit('debug', { 
                message: 'Chat started', 
                roomId,
                users: [socket.id, partnerId]
            });
            
            console.log(`Match created: ${socket.id} with ${partnerId} in room ${roomId}`);
        } else {
            socket.emit('waiting');
            socket.emit('debug', { message: 'Waiting for partner' });
        }
        
        updateDebugInfo();
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

    // Disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        
        const userInfo = connections.get(socket.id);
        if (userInfo && userInfo.room) {
            const roomId = userInfo.room;
            const roomData = roomsInfo.get(roomId);
            
            if (roomData) {
                // Notify the other user
                roomData.users.forEach(userId => {
                    if (userId !== socket.id) {
                        io.to(userId).emit('chatEnded');
                        io.to(userId).emit('debug', { message: 'Partner disconnected' });
                        
                        // Update their connection info
                        if (connections.has(userId)) {
                            connections.get(userId).room = null;
                        }
                    }
                });
                
                // Remove room
                roomsInfo.delete(roomId);
            }
        }
        
        connections.delete(socket.id);
        updateDebugInfo();
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
