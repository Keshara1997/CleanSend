import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';


import authRoutes from './routes/auth';
import messageRoutes from './routes/messages';
import setupRoutes from './routes/setup';
import { testConnection } from './config/database';
import settings from './config/settings';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (settings.nodeEnv === 'development') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });
}

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        domain: settings.openmsgDomain,
        sandbox: settings.sandbox,
        version: '1.0.0'
    });
});

const baseUrl = settings.sandbox ? '/openmsg/sandbox' : '/openmsg';

app.use(`${baseUrl}/auth`, authRoutes);

app.use(`${baseUrl}/message`, messageRoutes);

app.use(`${baseUrl}/setup`, setupRoutes);

app.get(`${baseUrl}/info`, (req, res) => {
    res.json({
        protocol: 'OpenMsg',
        version: '1.0.0',
        domain: settings.openmsgDomain,
        sandbox: settings.sandbox,
        endpoints: {
            auth: `${baseUrl}/auth`,
            auth_confirm: `${baseUrl}/auth/confirm`,
            message_receive: `${baseUrl}/message/receive`,
            message_confirm: `${baseUrl}/message/confirm`,
            setup: `${baseUrl}/setup`
        }
    });
});

app.get('/', (req, res) => {
    res.json({
        message: 'OpenMsg Protocol Server (TypeScript)',
        version: '1.0.0',
        info: `${baseUrl}/info`,
        health: '/health'
    });
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({
        error: true,
        error_message: 'Internal server error'
    });
});

app.use((req, res) => {
    res.status(404).json({
        error: true,
        error_message: 'Endpoint not found'
    });
});

async function startServer(): Promise<void> {
    try {
        const dbConnected = await testConnection();
        if (!dbConnected) {
            console.error('Failed to connect to database. Please check your configuration.');
            process.exit(1);
        }

        app.listen(settings.port, () => {
            console.log('🚀 OpenMsg Server Started (TypeScript)');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`🌐 Server running on port: ${settings.port}`);
            console.log(`🏠 Domain: ${settings.openmsgDomain}`);
            console.log(`📦 Sandbox mode: ${settings.sandbox ? 'ON' : 'OFF'}`);
            console.log(`🔗 Base URL: http://localhost:${settings.port}${baseUrl}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('');
            console.log('Available endpoints:');
            console.log(`  📊 Health: http://localhost:${settings.port}/health`);
            console.log(`  ℹ️  Info: http://localhost:${settings.port}${baseUrl}/info`);
            console.log(`  🔐 Auth: http://localhost:${settings.port}${baseUrl}/auth`);
            console.log(`  📨 Messages: http://localhost:${settings.port}${baseUrl}/message`);
            console.log(`  ⚙️  Setup: http://localhost:${settings.port}${baseUrl}/setup`);
            console.log('');
            if (settings.nodeEnv === 'development') {
                console.log('💡 Run "npm run setup" to initialize the database');
                console.log('🔧 Run "npm run typecheck" to check TypeScript types');
                console.log('');
            }
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

export default app;

if (require.main === module) {
    startServer();
} 