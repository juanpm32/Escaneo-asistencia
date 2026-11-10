const express = require('express');
const cors = require('cors');
const attendanceRoutes = require('./routes/attendanceRoutes');
const { initDatabase, getStatus, getMode, closeDatabase } = require('./config/database');

const app = express();

app.disable('x-powered-by');
const corsOrigin = (process.env.CORS_ORIGIN || '').trim();
app.use(cors(corsOrigin
    ? { origin: corsOrigin.split(',').map((item) => item.trim()).filter(Boolean) }
    : {}));
app.use(express.json({ limit: '20kb' }));

app.get('/api/health', async (_req, res) => {
    const status = await getStatus();
    res.status(status.ok ? 200 : 503).json(status);
});

app.use('/api/attendance', attendanceRoutes);

app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, message: 'Ruta no encontrada.' });
});

app.use((error, _req, res, _next) => {
    if (error && (error.type === 'entity.parse.failed' || error instanceof SyntaxError)) {
        res.status(400).json({ ok: false, message: 'El cuerpo de la solicitud no es JSON valido.' });
        return;
    }
    console.error(error);
    res.status(500).json({ ok: false, message: 'Error interno del servidor.' });
});

async function start() {
    await initDatabase();
    const port = Number(process.env.PORT || 3001);
    const host = process.env.HOST || '0.0.0.0';
    const server = app.listen(port, host);
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`El puerto ${port} ya esta en uso.`);
        } else {
            console.error(error);
        }
        process.exit(1);
    });
    server.on('listening', () => {
        const mode = getMode();
        console.log(`Control de Asistencia escuchando en ${host}:${port} (${mode.appMode}/${mode.dbType})`);
    });

    async function shutdown() {
        server.close();
        await closeDatabase();
        process.exit(0);
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

start().catch((error) => {
    console.error(error);
    process.exit(1);
});
