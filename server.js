const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3003;

app.use(express.static('public'));

app.get('/', (req, res) => {
  console.log('Serving index.html');
  res.sendFile(__dirname + '/public/index.html');
});

let userCount = 0;
const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
const users = new Map();
const messages = new Map();

function getNextAvailableUserId() {
  let id = 1;
  while (Array.from(users.values()).some(user => user.id === `User ${id}`)) {
    id++;
  }
  return `User ${id}`;
}

io.on('connection', (socket) => {
  try {
    const userId = getNextAvailableUserId();
    const userColor = colors[(userCount % colors.length)];
    users.set(socket.id, { id: userId, color: userColor, nickname: '' });
    userCount++;
    
    console.log(`New user connected: ${userId}`);
    
    socket.on('set nickname', (nickname) => {
      const user = users.get(socket.id);
      if (user) {
        user.nickname = nickname;
        socket.emit('user info', { id: user.id, color: user.color, nickname: user.nickname });
        io.emit('user event', `${nickname} (${user.id}) has joined the chat`);
      }
    });

    socket.on('chat message', (data) => {
      const user = users.get(socket.id);
      if (user) {
        const messageId = Date.now().toString();
        const message = {
          id: messageId,
          userId: user.id,
          nickname: user.nickname,
          color: user.color,
          text: data.text,
          style: data.style,
          reactions: {}
        };
        messages.set(messageId, message);
        console.log(`Received message from ${user.nickname} (${user.id}): ${data.text}`);
        io.emit('chat message', message);
      }
    });

    socket.on('typing', (data) => {
      const user = users.get(socket.id);
      if (user) {
        socket.broadcast.emit('typing', { userId: user.id, nickname: user.nickname });
      }
    });

    socket.on('edit message', (data) => {
      const user = users.get(socket.id);
      const message = messages.get(data.id);
      if (user && message && message.userId === user.id) {
        message.text = data.text;
        message.style = data.style;
        io.emit('message edited', message);
      }
    });

    socket.on('delete message', (messageId) => {
      const user = users.get(socket.id);
      const message = messages.get(messageId);
      if (user && message && message.userId === user.id) {
        messages.delete(messageId);
        io.emit('message deleted', messageId);
      }
    });

    socket.on('add reaction', (data) => {
      const message = messages.get(data.messageId);
      if (message) {
        if (!message.reactions[data.reaction]) {
          message.reactions[data.reaction] = new Set();
        }
        const userReacted = message.reactions[data.reaction].has(socket.id);
        if (userReacted) {
          message.reactions[data.reaction].delete(socket.id);
        } else {
          message.reactions[data.reaction].add(socket.id);
        }
        const count = message.reactions[data.reaction].size;
        io.emit('reaction added', {
          messageId: data.messageId,
          reaction: data.reaction,
          count: count
        });
      }
    });

    socket.on('disconnect', () => {
      const user = users.get(socket.id);
      if (user) {
        console.log(`User disconnected: ${user.nickname} (${user.id})`);
        io.emit('user event', `${user.nickname} (${user.id}) has left the chat`);
        users.delete(socket.id);
        userCount--;
      }
    });
  } catch (error) {
    console.error('An error occurred in socket connection:', error);
  }
});

http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});