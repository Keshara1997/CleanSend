/**
 * CleanSend - OpenMsg Protocol Server
 * 
 * This is the main server file that sets up an Express.js application implementing
 * the OpenMsg Protocol for secure, decentralized messaging between users across
 * different domains.
 * 
 * Features:
 * - RESTful API for authentication and messaging
 * - Cross-domain secure communication
 * - End-to-end encryption using AES-256-GCM
 * - Pass code-based handshake protocol
 * - Sandbox mode for development/testing
 * 
 * @author Keshara1997
 * @version 1.0.0
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import settings from './config/settings';

// Import route handlers for different protocol endpoints
import authRoutes from './setup/auth';
import messageRoutes from './setup/messages';
import setupRoutes from './setup/setup';
import { testConnection } from './config/database';

// Load environment variables from .env file
dotenv.config();

const app = express();

// Security middleware configuration
app.use(helmet());  // Adds various security headers (XSS protection, etc.)
app.use(cors());    // Enable Cross-Origin Resource Sharing for API access

// Body parsing middleware - handles JSON and URL-encoded data
// Set size limits to 10MB to accommodate encrypted message packages
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware (development only)
// Logs all incoming HTTP requests with timestamp, method, and path
if (settings.nodeEnv === 'development') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });
}

// Health check endpoint for monitoring and load balancer checks
// Returns server status, configuration, and version information
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        domain: settings.openmsgDomain,
        sandbox: settings.sandbox,
        version: '1.0.0'
    });
});

// OpenMsg Protocol Routes
// Base URL changes based on sandbox mode (production vs development)
const baseUrl = settings.sandbox ? '/openmsg/sandbox' : '/openmsg';

// Authentication routes - handles user authentication and connection establishment
// POST /auth - Authenticate with another OpenMsg user
// POST /auth/confirm - Confirm authentication request from another domain
app.use(`${baseUrl}/auth`, authRoutes);

// Message routes - handles encrypted message sending and receiving
// POST /message/receive - Receive encrypted messages from other domains
// POST /message/confirm - Confirm message delivery authenticity
app.use(`${baseUrl}/message`, messageRoutes);

// Setup routes - administrative and testing endpoints
// POST /setup/initiate-handshake - Start connection with another user
// POST /setup/send-message - Send message to connected user
// POST /setup/request-pass-code - Generate authentication pass code
app.use(`${baseUrl}/setup`, setupRoutes);

// Protocol information endpoint
// Returns OpenMsg protocol details and available API endpoints
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

// Root endpoint - provides basic server information and navigation
app.get('/', (req, res) => {
    res.json({
        message: 'OpenMsg Protocol Server (TypeScript)',
        version: '1.0.0',
        info: `${baseUrl}/info`,
        health: '/health'
    });
});

// Global error handling middleware
// Catches any unhandled errors and returns a standardized error response
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({
        error: true,
        error_message: 'Internal server error'
    });
});

// 404 handler for undefined routes
app.use((req, res) => {
    res.status(404).json({
        error: true,
        error_message: 'Endpoint not found'
    });
});

/**
 * Start the OpenMsg Protocol server
 * 
 * This function:
 * 1. Tests database connectivity
 * 2. Starts the Express server on configured port
 * 3. Displays startup information and available endpoints
 * 4. Handles startup errors gracefully
 */
async function startServer(): Promise<void> {
    try {
        // Test database connection before starting server
        // Exit if database is not accessible
        const dbConnected = await testConnection();
        if (!dbConnected) {
            console.error('Failed to connect to database. Please check your configuration.');
            process.exit(1);
        }

        // Start HTTP server on configured port
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

            // Development-specific help messages
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

// Initialize and start the server
startServer(); 