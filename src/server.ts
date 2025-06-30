import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';



dotenv.config();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Log requests in development


// Health check endpoint


// OpenMsg Protocol Routes

// Authentication routes

// Message routes  

// Setup routes (for testing and administration)

// Info endpoint


// Root endpoint


// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({
        error: true,
        error_message: 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: true,
        error_message: 'Endpoint not found'
    });
});

// Start server
// async function startServer(): Promise<void> {
//     try {
//         // Test database connection
//         const dbConnected = await testConnection();
//         if (!dbConnected) {
//             console.error('Failed to connect to database. Please check your configuration.');
//             process.exit(1);
//         }

//         app.listen(settings.port, () => {
//             console.log('🚀 OpenMsg Server Started (TypeScript)');
//             console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
//             console.log(`🌐 Server running on port: ${settings.port}`);
//             console.log(`🏠 Domain: ${settings.openmsgDomain}`);
//             console.log(`📦 Sandbox mode: ${settings.sandbox ? 'ON' : 'OFF'}`);
//             console.log(`🔗 Base URL: http://localhost:${settings.port}${baseUrl}`);
//             console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
//             console.log('');
//             console.log('Available endpoints:');
//             console.log(`  📊 Health: http://localhost:${settings.port}/health`);
//             console.log(`  ℹ️  Info: http://localhost:${settings.port}${baseUrl}/info`);
//             console.log(`  🔐 Auth: http://localhost:${settings.port}${baseUrl}/auth`);
//             console.log(`  📨 Messages: http://localhost:${settings.port}${baseUrl}/message`);
//             console.log(`  ⚙️  Setup: http://localhost:${settings.port}${baseUrl}/setup`);
//             console.log('');
//             if (settings.nodeEnv === 'development') {
//                 console.log('💡 Run "npm run setup" to initialize the database');
//                 console.log('🔧 Run "npm run typecheck" to check TypeScript types');
//                 console.log('');
//             }
//         });

//     } catch (error) {
//         console.error('Failed to start server:', error);
//         process.exit(1);
//     }
// }

startServer(); 