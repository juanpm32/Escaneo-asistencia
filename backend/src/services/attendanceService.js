const { getMemory, getPool, getPgPool, isLocalStorage, isMock, isPostgres } = require('../config/database');

const FECHA_SQL = `
    CONVERT(CHAR(4), YEAR(a.fecha_asistencia))
    + '-' + RIGHT('0' + CONVERT(VARCHAR(2), MONTH(a.fecha_asistencia)), 2)
    + '-' + RIGHT('0' + CONVERT(VARCHAR(2), DAY(a.fecha_asistencia)), 2)
`;

const SELECT_LIST = `
    a.id_asistencia,
    a.numero_dni,
    p.nombres,
    p.apellido_paterno,
    p.apellido_materno,
    ${FECHA_SQL} AS fecha_asistencia,
    LEFT(CONVERT(VARCHAR(8), a.hora_asistencia, 108), 8) AS hora_asistencia,
    CONVERT(VARCHAR(19), a.fecha_hora_registro, 120) AS fecha_hora_registro,
    a.tipo_asistencia,
    a.estado
`;

const LIST_SQL = `
    SELECT ${SELECT_LIST}
    FROM dbo.tbl_asistencias AS a
    INNER JOIN dbo.tbl_personas AS p ON p.id_persona = a.id_persona
    ORDER BY a.fecha_asistencia DESC, a.hora_asistencia DESC, a.id_asistencia DESC
`;

const TODAY_SQL = `
    SELECT ${SELECT_LIST}
    FROM dbo.tbl_asistencias AS a
    INNER JOIN dbo.tbl_personas AS p ON p.id_persona = a.id_persona
    WHERE a.fecha_asistencia = CAST(GETDATE() AS DATE)
    ORDER BY a.hora_asistencia DESC, a.id_asistencia DESC
`;

const REGISTER_SQL = `
    SET XACT_ABORT ON;
    SET NOCOUNT ON;

    DECLARE @intervalo_txt VARCHAR(250);
    DECLARE @tipo_txt VARCHAR(250);
    DECLARE @intervalo INT;
    DECLARE @tipo VARCHAR(10);
    DECLARE @id_persona INT;
    DECLARE @duplicado_id BIGINT;
    DECLARE @nuevo_id BIGINT;
    DECLARE @ahora DATETIME;

    SET @ahora = GETDATE();

    SELECT @intervalo_txt = valor
    FROM dbo.tbl_configuracion
    WHERE clave = 'INTERVALO_DUPLICADO_MINUTOS';

    SELECT @tipo_txt = valor
    FROM dbo.tbl_configuracion
    WHERE clave = 'TIPO_ASISTENCIA_DEFAULT';

    IF @intervalo_txt LIKE '[0-9]%'
       AND @intervalo_txt NOT LIKE '%[^0-9]%'
       AND LEN(@intervalo_txt) <= 4
    BEGIN
        SET @intervalo = CAST(@intervalo_txt AS INT);
    END

    IF @intervalo IS NULL OR @intervalo < 1 OR @intervalo > 1440
        SET @intervalo = 5;

    IF @tipo_txt IS NOT NULL
       AND LEN(LTRIM(RTRIM(@tipo_txt))) BETWEEN 1 AND 10
       AND LTRIM(RTRIM(@tipo_txt)) NOT LIKE '%[^A-Z]%'
    BEGIN
        SET @tipo = LTRIM(RTRIM(@tipo_txt));
    END

    IF @tipo IS NULL
        SET @tipo = 'ENTRADA';

    SELECT TOP 1 @duplicado_id = id_asistencia
    FROM dbo.tbl_asistencias WITH (UPDLOCK, HOLDLOCK)
    WHERE numero_dni = @numero_dni
      AND fecha_hora_registro >= DATEADD(MINUTE, -@intervalo, @ahora)
    ORDER BY fecha_hora_registro DESC;

    IF @duplicado_id IS NOT NULL
    BEGIN
        SELECT
            CAST(1 AS BIT) AS duplicado,
            @intervalo AS intervalo;
    END
    ELSE
    BEGIN
        SELECT @id_persona = id_persona
        FROM dbo.tbl_personas WITH (UPDLOCK, HOLDLOCK)
        WHERE numero_dni = @numero_dni;

        IF @id_persona IS NULL
        BEGIN
            INSERT INTO dbo.tbl_personas (
                numero_dni, nombres, apellido_paterno, apellido_materno, estado, fecha_creacion
            )
            VALUES (
                @numero_dni, @nombres, @apellido_paterno, @apellido_materno, 1, @ahora
            );

            SET @id_persona = CAST(SCOPE_IDENTITY() AS INT);
        END

        INSERT INTO dbo.tbl_asistencias (
            id_persona,
            numero_dni,
            fecha_asistencia,
            hora_asistencia,
            fecha_hora_registro,
            tipo_asistencia,
            estado,
            dispositivo
        )
        VALUES (
            @id_persona,
            @numero_dni,
            CAST(@ahora AS DATE),
            CAST(@ahora AS TIME(0)),
            @ahora,
            @tipo,
            'REGISTRADO',
            @dispositivo
        );

        SET @nuevo_id = CAST(SCOPE_IDENTITY() AS BIGINT);

        SELECT
            CAST(0 AS BIT) AS duplicado,
            @intervalo AS intervalo,
            ${SELECT_LIST}
        FROM dbo.tbl_asistencias AS a
        INNER JOIN dbo.tbl_personas AS p ON p.id_persona = a.id_persona
        WHERE a.id_asistencia = @nuevo_id;
    END
`;

class AttendanceError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

function cleanText(value) {
    if (value == null) {
        return null;
    }
    const text = String(value).replace(/[\u0000-\u001F]/g, '').trim().replace(/\s+/g, ' ');
    return text || null;
}

function assertName(value, label, maxLength) {
    const text = cleanText(value);
    if (!text) {
        return null;
    }
    if (text.length > maxLength) {
        throw new AttendanceError(`${label} no puede pasar de ${maxLength} caracteres.`, 400);
    }
    if (!/^[\p{L}][\p{L} .'-]*$/u.test(text)) {
        throw new AttendanceError(`${label} solo puede contener letras, espacios, apóstrofos o guiones.`, 400);
    }
    return text;
}

function duplicateMessage(intervalo) {
    const unidad = Number(intervalo) === 1 ? 'minuto' : 'minutos';
    return `Este DNI ya registró asistencia en los últimos ${intervalo} ${unidad}.`;
}

function normalizePayload(input) {
    const numero_dni = cleanText(input.numero_dni) || '';
    if (!/^\d{8}$/.test(numero_dni) || numero_dni === '00000000') {
        throw new AttendanceError('El número de DNI debe tener 8 dígitos.', 400);
    }

    const dispositivo = cleanText(input.dispositivo);
    if (dispositivo && dispositivo.length > 150) {
        throw new AttendanceError('El identificador del dispositivo supera los 150 caracteres.', 400);
    }

    return {
        numero_dni,
        nombres: assertName(input.nombres, 'Nombres', 150),
        apellido_paterno: assertName(input.apellido_paterno, 'Apellido paterno', 100),
        apellido_materno: assertName(input.apellido_materno, 'Apellido materno', 100),
        dispositivo: dispositivo ? dispositivo.slice(0, 150) : null,
    };
}

function asNumber(value) {
    if (typeof value === 'number') {
        return value;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
}

function mapRow(row) {
    return {
        id_asistencia: asNumber(row.id_asistencia),
        numero_dni: String(row.numero_dni).trim(),
        nombres: row.nombres || null,
        apellido_paterno: row.apellido_paterno || null,
        apellido_materno: row.apellido_materno || null,
        fecha_asistencia: String(row.fecha_asistencia).trim(),
        hora_asistencia: String(row.hora_asistencia).trim(),
        fecha_hora_registro: String(row.fecha_hora_registro).trim(),
        tipo_asistencia: row.tipo_asistencia,
        estado: row.estado,
    };
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function nowParts(date = new Date()) {
    const fecha = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const hora = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    return {
        fecha,
        hora,
        fecha_hora: `${fecha} ${hora}`,
        date,
    };
}

function parseLocalDateTime(value) {
    const [datePart, timePart] = String(value).split(' ');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes, seconds] = timePart.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes, seconds);
}

function readMockConfig() {
    const memory = getMemory();
    const intervaloRow = memory.configuracion.find((item) => item.clave === 'INTERVALO_DUPLICADO_MINUTOS');
    const tipoRow = memory.configuracion.find((item) => item.clave === 'TIPO_ASISTENCIA_DEFAULT');
    const intervaloParsed = intervaloRow ? Number(intervaloRow.valor) : NaN;
    const intervalo = Number.isInteger(intervaloParsed) && intervaloParsed >= 1 && intervaloParsed <= 1440
        ? intervaloParsed
        : 5;
    const tipo = tipoRow && /^[A-Z]{1,10}$/.test(tipoRow.valor) ? tipoRow.valor : 'ENTRADA';
    return { intervalo, tipo };
}

function sortRows(rows) {
    return rows.slice().sort((a, b) => {
        const byFecha = b.fecha_asistencia.localeCompare(a.fecha_asistencia);
        if (byFecha !== 0) {
            return byFecha;
        }
        const byHora = b.hora_asistencia.localeCompare(a.hora_asistencia);
        if (byHora !== 0) {
            return byHora;
        }
        return b.id_asistencia - a.id_asistencia;
    });
}

function withPerson(asistencia) {
    const persona = getMemory().personas.find((item) => item.id_persona === asistencia.id_persona);
    return {
        id_asistencia: asistencia.id_asistencia,
        numero_dni: asistencia.numero_dni,
        nombres: persona ? persona.nombres : null,
        apellido_paterno: persona ? persona.apellido_paterno : null,
        apellido_materno: persona ? persona.apellido_materno : null,
        fecha_asistencia: asistencia.fecha_asistencia,
        hora_asistencia: asistencia.hora_asistencia,
        fecha_hora_registro: asistencia.fecha_hora_registro,
        tipo_asistencia: asistencia.tipo_asistencia,
        estado: asistencia.estado,
    };
}

function registerMock(payload) {
    const memory = getMemory();
    const { intervalo, tipo } = readMockConfig();
    const ahora = nowParts();
    const limite = intervalo * 60 * 1000;
    const duplicado = memory.asistencias.some((item) => {
        if (item.numero_dni !== payload.numero_dni) {
            return false;
        }
        return ahora.date.getTime() - parseLocalDateTime(item.fecha_hora_registro).getTime() <= limite;
    });

    if (duplicado) {
        throw new AttendanceError(duplicateMessage(intervalo), 409);
    }

    let persona = memory.personas.find((item) => item.numero_dni === payload.numero_dni);
    if (!persona) {
        persona = {
            id_persona: memory.nextPersonaId,
            numero_dni: payload.numero_dni,
            nombres: payload.nombres,
            apellido_paterno: payload.apellido_paterno,
            apellido_materno: payload.apellido_materno,
            estado: true,
            fecha_creacion: ahora.fecha_hora,
        };
        memory.nextPersonaId += 1;
        memory.personas.push(persona);
    }

    const asistencia = {
        id_asistencia: memory.nextAsistenciaId,
        id_persona: persona.id_persona,
        numero_dni: payload.numero_dni,
        fecha_asistencia: ahora.fecha,
        hora_asistencia: ahora.hora,
        fecha_hora_registro: ahora.fecha_hora,
        tipo_asistencia: tipo,
        estado: 'REGISTRADO',
        dispositivo: payload.dispositivo,
    };
    memory.nextAsistenciaId += 1;
    memory.asistencias.push(asistencia);
    return withPerson(asistencia);
}

async function registerSql(payload) {
    const sql = require('mssql');
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        const request = new sql.Request(transaction);
        request.input('numero_dni', sql.VarChar(8), payload.numero_dni);
        request.input('nombres', sql.NVarChar(150), payload.nombres);
        request.input('apellido_paterno', sql.NVarChar(100), payload.apellido_paterno);
        request.input('apellido_materno', sql.NVarChar(100), payload.apellido_materno);
        request.input('dispositivo', sql.NVarChar(150), payload.dispositivo);

        const result = await request.query(REGISTER_SQL);
        const row = result.recordset && result.recordset[0];
        if (!row) {
            throw new Error('SQL Server no devolvio el registro.');
        }

        if (row.duplicado === true || row.duplicado === 1) {
            await transaction.rollback();
            throw new AttendanceError(duplicateMessage(row.intervalo), 409);
        }

        await transaction.commit();
        return mapRow(row);
    } catch (error) {
        if (!error.status) {
            try {
                await transaction.rollback();
            } catch (_rollbackError) {
                /* La transaccion ya estaba cerrada. */
            }
        }
        throw error;
    }
}

async function queryRows(sqlText) {
    const pool = getPool();
    const result = await pool.request().query(sqlText);
    return result.recordset.map(mapRow);
}

const LIMA_NOW = `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')`;

const PG_SELECT_LIST = `
    a.id_asistencia,
    a.numero_dni,
    p.nombres,
    p.apellido_paterno,
    p.apellido_materno,
    TO_CHAR(a.fecha_asistencia, 'YYYY-MM-DD') AS fecha_asistencia,
    TO_CHAR(a.hora_asistencia, 'HH24:MI:SS') AS hora_asistencia,
    TO_CHAR(a.fecha_hora_registro, 'YYYY-MM-DD HH24:MI:SS') AS fecha_hora_registro,
    a.tipo_asistencia,
    a.estado
`;

const PG_LIST_SQL = `
    SELECT ${PG_SELECT_LIST}
    FROM tbl_asistencias AS a
    INNER JOIN tbl_personas AS p ON p.id_persona = a.id_persona
    ORDER BY a.fecha_asistencia DESC, a.hora_asistencia DESC, a.id_asistencia DESC
`;

const PG_TODAY_SQL = `
    SELECT ${PG_SELECT_LIST}
    FROM tbl_asistencias AS a
    INNER JOIN tbl_personas AS p ON p.id_persona = a.id_persona
    WHERE a.fecha_asistencia = ${LIMA_NOW}::date
    ORDER BY a.hora_asistencia DESC, a.id_asistencia DESC
`;

function readPgConfig(rows) {
    const values = {};
    rows.forEach((row) => {
        values[row.clave] = row.valor;
    });
    const parsed = Number(values.INTERVALO_DUPLICADO_MINUTOS);
    const intervalo = Number.isInteger(parsed) && parsed >= 1 && parsed <= 1440 ? parsed : 5;
    const tipo = values.TIPO_ASISTENCIA_DEFAULT && /^[A-Z]{1,10}$/.test(values.TIPO_ASISTENCIA_DEFAULT)
        ? values.TIPO_ASISTENCIA_DEFAULT
        : 'ENTRADA';
    return { intervalo, tipo };
}

async function registerPostgresOnce(payload) {
    const pool = getPgPool();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const config = await client.query(`
            SELECT clave, valor
            FROM tbl_configuracion
            WHERE clave IN ('INTERVALO_DUPLICADO_MINUTOS', 'TIPO_ASISTENCIA_DEFAULT')
        `);
        const { intervalo, tipo } = readPgConfig(config.rows);

        const existing = await client.query(`
            SELECT id_persona
            FROM tbl_personas
            WHERE numero_dni = $1
            FOR UPDATE
        `, [payload.numero_dni]);

        let idPersona;
        if (existing.rowCount > 0) {
            idPersona = existing.rows[0].id_persona;
        } else {
            const insertedPerson = await client.query(`
                INSERT INTO tbl_personas (
                    numero_dni, nombres, apellido_paterno, apellido_materno, estado, fecha_creacion
                )
                VALUES ($1, $2, $3, $4, TRUE, ${LIMA_NOW})
                RETURNING id_persona
            `, [
                payload.numero_dni,
                payload.nombres,
                payload.apellido_paterno,
                payload.apellido_materno,
            ]);
            idPersona = insertedPerson.rows[0].id_persona;
        }

        const duplicate = await client.query(`
            SELECT id_asistencia
            FROM tbl_asistencias
            WHERE numero_dni = $1
              AND fecha_hora_registro >= ${LIMA_NOW} - ($2::int * INTERVAL '1 minute')
            ORDER BY fecha_hora_registro DESC
            LIMIT 1
            FOR UPDATE
        `, [payload.numero_dni, intervalo]);

        if (duplicate.rowCount > 0) {
            await client.query('ROLLBACK');
            throw new AttendanceError(duplicateMessage(intervalo), 409);
        }

        const inserted = await client.query(`
            INSERT INTO tbl_asistencias (
                id_persona,
                numero_dni,
                fecha_asistencia,
                hora_asistencia,
                fecha_hora_registro,
                tipo_asistencia,
                estado,
                dispositivo
            )
            VALUES (
                $1,
                $2,
                ${LIMA_NOW}::date,
                ${LIMA_NOW}::time(0),
                ${LIMA_NOW},
                $3,
                'REGISTRADO',
                $4
            )
            RETURNING id_asistencia
        `, [idPersona, payload.numero_dni, tipo, payload.dispositivo]);

        const result = await client.query(`
            SELECT ${PG_SELECT_LIST}
            FROM tbl_asistencias AS a
            INNER JOIN tbl_personas AS p ON p.id_persona = a.id_persona
            WHERE a.id_asistencia = $1
        `, [inserted.rows[0].id_asistencia]);

        await client.query('COMMIT');
        return mapRow(result.rows[0]);
    } catch (error) {
        if (!error.status) {
            try {
                await client.query('ROLLBACK');
            } catch (_rollbackError) {
                /* La transaccion ya estaba cerrada. */
            }
        }
        throw error;
    } finally {
        client.release();
    }
}

async function registerPostgres(payload) {
    try {
        return await registerPostgresOnce(payload);
    } catch (error) {
        if (error.code !== '23505') {
            throw error;
        }
        try {
            return await registerPostgresOnce(payload);
        } catch (retryError) {
            if (retryError.code === '23505') {
                throw new AttendanceError('No se pudo registrar el DNI. Intente de nuevo.', 409);
            }
            throw retryError;
        }
    }
}

async function queryPg(sqlText) {
    const pool = getPgPool();
    const result = await pool.query(sqlText);
    return result.rows.map(mapRow);
}

function assertServerStore() {
    if (isLocalStorage()) {
        throw new AttendanceError('Las asistencias de este modo se guardan en el navegador, no en el servidor.', 400);
    }
}

async function register(input) {
    assertServerStore();
    const payload = normalizePayload(input || {});
    if (isMock()) {
        return registerMock(payload);
    }
    if (isPostgres()) {
        return registerPostgres(payload);
    }
    return registerSql(payload);
}

async function list() {
    assertServerStore();
    if (isMock()) {
        return sortRows(getMemory().asistencias.map(withPerson));
    }
    if (isPostgres()) {
        return queryPg(PG_LIST_SQL);
    }
    return queryRows(LIST_SQL);
}

async function listToday() {
    assertServerStore();
    if (isMock()) {
        const hoy = nowParts().fecha;
        return sortRows(getMemory().asistencias.map(withPerson))
            .filter((item) => item.fecha_asistencia === hoy);
    }
    if (isPostgres()) {
        return queryPg(PG_TODAY_SQL);
    }
    return queryRows(TODAY_SQL);
}

module.exports = {
    register,
    list,
    listToday,
    AttendanceError,
};
