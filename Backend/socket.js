import http from 'http';

import { config } from './src/config/env.js';
import { validateConfig } from './src/config/validateEnv.js';
import { connectDB, disconnectDB } from './src/config/db.js';
import { connectRedis, closeRedis } from './src/config/redis.js';
import { initSocket } from './src/config/socket.js';
import { initializeQueues, closeBullMQConnection } from './src/queues/index.js';
import { initializeFirebaseRealtime } from './src/config/firebase.js';
import { logger } from './src/utils/logger.js';

// Standalone Socket.IO server (port SOCKET_PORT, default 5001).
// The API process (server.js) emits to it through Redis when SOCKET_STANDALONE=true.
const SHUTDOWN_TIMEOUT_MS = 10000;
let server = null;

const gracefulShutdown = async (signal) => {
    logger.info(`[socket] ${signal} received, shutting down`);
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    try {
        if (server) await new Promise((resolve) => server.close(resolve));
        await disconnectDB();
        await closeRedis();
        await closeBullMQConnection();
        process.exit(0);
    } catch (err) {
        logger.error(`[socket] Shutdown error: ${err.message}`);
        process.exit(1);
    }
};

const startSocketServer = async () => {
    try {
        validateConfig();
        initializeFirebaseRealtime();
        await connectDB();

        if (!config.redisEnabled) {
            throw new Error('Standalone socket server requires REDIS_ENABLED=true');
        }
        await connectRedis();

        const httpServer = http.createServer((req, res) => {
            if (req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', service: 'socket' }));
                return;
            }
            res.writeHead(404);
            res.end();
        });

        await initSocket(httpServer);

        // Socket handlers enqueue tracking jobs (producer side only).
        if (config.bullmqEnabled) {
            try {
                initializeQueues();
            } catch (err) {
                logger.error(`[socket] BullMQ initialization error (continuing): ${err.message}`);
            }
        }

        server = httpServer.listen(config.socketPort, config.host, () => {
            logger.info(`Socket.IO server running in ${config.nodeEnv} mode on ${config.host}:${config.socketPort}`);
        });

        server.on('error', (err) => {
            logger.error(`[socket] Server error: ${err.message}`);
            process.exit(1);
        });

        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('unhandledRejection', (err) => {
            logger.error(`[socket] Unhandled Rejection: ${err?.message || err}`);
        });
        process.on('uncaughtException', (err) => {
            logger.error(`[socket] Uncaught Exception: ${err?.message || err}`);
            if (config.nodeEnv === 'production') process.exit(1);
        });
    } catch (error) {
        logger.error(`[socket] Error starting socket server: ${error.message}`);
        process.exit(1);
    }
};

startSocketServer();
