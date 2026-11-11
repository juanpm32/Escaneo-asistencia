const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const REQUIRED_TABLES = ['tbl_personas', 'tbl_asistencias', 'tbl_configuracion'];

const memory = {
    personas: [],
    asistencias: [],
    configuracion: [
        {
            id_configuracion: 1,
            clave: 'INTERVALO_DUPLICADO_MINUTOS',
            valor: '5',
            descripcion: 'Minutos durante los cuales el mismo DNI no puede volver a registrar asistencia',
        },
        {
            id_configuracion: 2,
            clave: 'TIPO_ASISTENCIA_DEFAULT',
            valor: 'ENTRADA',
            descripcion: 'Tipo de asistencia que graba el sistema',
        },
    ],
    nextPersonaId: 1,
    nextAsistenciaId: 1,
};

let pool = null;
let driver = null;
let dbError = null;
let tablesWarning = null;
let tables = [];

function envFlag(name, defaultValue) {
    const value = process.env[name];
    if (value == null || String(value).trim() === '') {
        return defaultValue;
    }
    return String(value).trim().toLowerCase() === 'true';
}

function canonicalDbType(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'postgresql') {
        return 'postgres';
    }
    if (value === 'sqlserver' || value === 'sql_server' || value === 'mssql') {
        return 'sqlserver';
    }
    if (value === 'localstorage' || value === 'local-storage') {
        return 'localstorage';
    }
    if (value === 'mock' || value === 'memory' || value === 'demo') {
        return 'mock';
    }
    return value;
}

function getMode() {
    const raw = (process.env.DB_TYPE || '').trim().toLowerCase();
    if (!raw) {
        const appMode = (process.env.APP_MODE || 'demo').trim().toLowerCase();
        if (appMode === 'production') {
            return { appMode: 'production', dbType: '' };
        }
        return { appMode: 'demo', dbType: 'mock' };
    }

    const dbType = canonicalDbType(raw);
    if (dbType === 'postgres' || dbType === 'sqlserver') {
        return { appMode: 'production', dbType };
    }
    if (dbType === 'localstorage') {
        return { appMode: 'localstorage', dbType: 'localstorage' };
    }
    if (dbType === 'mock') {
        return { appMode: 'demo', dbType: 'mock' };
    }
    return {
        appMode: (process.env.APP_MODE || 'demo').trim().toLowerCase(),
        dbType: raw,
    };
}

function isSqlMode() {
    return getMode().dbType === 'sqlserver';
}

function isPostgres() {
    return getMode().dbType === 'postgres';
}

function isMock() {
    return getMode().dbType === 'mock';
}

function isLocalStorage() {
    return getMode().dbType === 'localstorage';
}

function getMemory() {
    return memory;
}

function buildMssqlConfig() {
    return {
        server: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 1433),
        database: process.env.DB_NAME || 'DB_CONTROL_ASISTENCIA',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        connectionTimeout: 15000,
        requestTimeout: 15000,
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000,
        },
        options: {
            encrypt: envFlag('DB_ENCRYPT', false),
            trustServerCertificate: envFlag('DB_TRUST_SERVER_CERTIFICATE', true),
            enableArithAbort: true,
            // SQL Server 2008 R2 habla TDS 7.3.B. El default del driver es 7.4 (2012+).
            tdsVersion: '7_3_B',
            useUTC: false,
            appName: 'control-asistencia',
        },
    };
}

function postgresSsl(connectionString) {
    const flag = process.env.DB_SSL;
    if (flag != null && String(flag).trim() !== '') {
        return envFlag('DB_SSL', false) ? { rejectUnauthorized: false } : false;
    }
    if (connectionString && /sslmode=require|render\.com/i.test(connectionString)) {
        return { rejectUnauthorized: false };
    }
    return false;
}

function buildPgConfig() {
    const connectionString = (process.env.DATABASE_URL || '').trim();
    const ssl = postgresSsl(connectionString);
    if (connectionString) {
        return {
            connectionString,
            ssl,
            max: 10,
            connectionTimeoutMillis: 15000,
        };
    }
    return {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl,
        max: 10,
        connectionTimeoutMillis: 15000,
    };
}

function rememberTables(found) {
    tables = found;
    const missing = REQUIRED_TABLES.filter((name) => !tables.includes(name));
    tablesWarning = missing.length > 0
        ? `Faltan tablas: ${missing.join(', ')}. Ejecute el script de la base correspondiente.`
        : null;
}

async function initDatabase() {
    dbError = null;
    tablesWarning = null;
    tables = [];
    driver = null;

    if (isMock() || isLocalStorage()) {
        return;
    }

    if (isPostgres()) {
        await initPostgres();
        return;
    }

    if (!isSqlMode()) {
        const mode = getMode();
        dbError = `DB_TYPE no reconocido (${mode.dbType || 'vacio'}). Use mock, localstorage, sqlserver o postgres.`;
        return;
    }

    const sql = require('mssql');
    const config = buildMssqlConfig();

    if (!config.user || !config.password) {
        dbError = 'Faltan DB_USER o DB_PASSWORD en el archivo .env.';
        return;
    }

    try {
        pool = new sql.ConnectionPool(config);
        await pool.connect();
        const result = await pool.request().query(`
            SELECT name
            FROM sys.tables
            WHERE name IN (N'tbl_personas', N'tbl_asistencias', N'tbl_configuracion')
        `);
        driver = 'mssql';
        rememberTables(result.recordset.map((row) => row.name));
    } catch (error) {
        pool = null;
        driver = null;
        dbError = error.message || 'No se pudo conectar con SQL Server.';
    }
}

async function initPostgres() {
    const { Pool } = require('pg');
    const config = buildPgConfig();
    const hasUrl = Boolean((process.env.DATABASE_URL || '').trim());
    if (!hasUrl && (!config.host || !config.database || !config.user)) {
        dbError = 'Falta DATABASE_URL, o DB_HOST, DB_NAME y DB_USER, para PostgreSQL.';
        return;
    }

    try {
        pool = new Pool(config);
        await pool.query('SELECT 1 AS ok');
        driver = 'pg';
        const result = await pool.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('tbl_personas', 'tbl_asistencias', 'tbl_configuracion')
        `);
        rememberTables(result.rows.map((row) => row.table_name));
    } catch (error) {
        if (pool) {
            await pool.end().catch(() => {});
        }
        pool = null;
        driver = null;
        dbError = error.message || 'No se pudo conectar con PostgreSQL.';
    }
}

function assertPool(expectedDriver, label) {
    if (driver !== expectedDriver || !pool || dbError || tablesWarning) {
        const error = new Error(dbError || tablesWarning || `${label} no esta conectado.`);
        error.status = 503;
        throw error;
    }
    return pool;
}

function getPool() {
    if (isMock()) {
        return null;
    }
    return assertPool('mssql', 'SQL Server');
}

function getPgPool() {
    return assertPool('pg', 'PostgreSQL');
}

async function getStatus() {
    const mode = getMode();

    if (isMock()) {
        return {
            ok: true,
            servidor: 'en linea',
            modo: mode.appMode,
            base_datos: mode.dbType,
            conectado: true,
            mensaje: 'Modo DEMO. Los registros se guardan en memoria y se pierden al detener el servidor.',
        };
    }

    if (isLocalStorage()) {
        return {
            ok: true,
            servidor: 'en linea',
            modo: mode.appMode,
            base_datos: 'localstorage',
            conectado: true,
            mensaje: 'Modo navegador. Las asistencias se guardan en este navegador.',
        };
    }

    if (!isSqlMode() && !isPostgres()) {
        return {
            ok: false,
            servidor: 'en linea',
            modo: mode.appMode,
            base_datos: mode.dbType,
            conectado: false,
            mensaje: dbError || 'Configuracion de base de datos no reconocida.',
        };
    }

    const label = isPostgres() ? 'PostgreSQL' : 'SQL Server';

    if (!pool || dbError) {
        return {
            ok: false,
            servidor: 'en linea',
            modo: mode.appMode,
            base_datos: mode.dbType,
            conectado: false,
            mensaje: dbError || `Sin conexion con ${label}.`,
        };
    }

    try {
        if (driver === 'pg') {
            await pool.query('SELECT 1 AS ok');
        } else {
            await pool.request().query('SELECT 1 AS ok');
        }
        return {
            ok: true,
            servidor: 'en linea',
            modo: mode.appMode,
            base_datos: mode.dbType,
            conectado: true,
            tablas: tables,
            mensaje: tablesWarning || `Conexion con ${label} correcta.`,
        };
    } catch (error) {
        return {
            ok: false,
            servidor: 'en linea',
            modo: mode.appMode,
            base_datos: mode.dbType,
            conectado: false,
            mensaje: error.message || `La conexion con ${label} fallo.`,
        };
    }
}

async function closeDatabase() {
    if (!pool) {
        return;
    }
    if (driver === 'pg') {
        await pool.end();
    } else {
        await pool.close();
    }
    pool = null;
    driver = null;
}

module.exports = {
    initDatabase,
    getStatus,
    getPool,
    getPgPool,
    getMemory,
    getMode,
    isMock,
    isLocalStorage,
    isPostgres,
    closeDatabase,
    buildMssqlConfig,
};
