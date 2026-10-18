// PM2 process file. Backend is ESM ("type": "module"), so this must stay .cjs.
// Start:   pm2 start ecosystem.config.cjs
// Reload:  pm2 reload ecosystem.config.cjs --update-env
const path = require('path');

const backendDir = path.join(__dirname, 'Backend');

const base = {
  cwd: backendDir,
  env: { NODE_ENV: 'production' },
  autorestart: true,
  max_restarts: 10,
  restart_delay: 3000,
  time: true,
};

const worker = (name) => ({
  ...base,
  name: `eqosy-worker-${name}`,
  script: `src/queues/workers/${name}.worker.js`,
  max_memory_restart: '300M',
});

module.exports = {
  apps: [
    // API (Backend/.env PORT=5000). Needs SOCKET_STANDALONE=true to emit to the socket process.
    {
      ...base,
      name: 'eqosy-api',
      script: 'server.js',
      max_memory_restart: '700M',
      kill_timeout: 12000, // server.js graceful shutdown allows 10s
    },
    // Standalone Socket.IO server (Backend/.env SOCKET_PORT=5001, SOCKET_STANDALONE=true)
    {
      ...base,
      name: 'eqosy-socket',
      script: 'socket.js',
      max_memory_restart: '700M',
      kill_timeout: 12000,
    },
    // BullMQ workers (separate processes, need REDIS_ENABLED=true & BULLMQ_ENABLED=true)
    worker('otp'),
    worker('notification'),
    worker('order'),
    worker('tracking'),
    worker('payment'),
    worker('maintenance'),
  ],
};
