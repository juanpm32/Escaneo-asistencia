const STORAGE_KEY = 'control-asistencia.v1';

function emptyState() {
    return {
        personas: [],
        asistencias: [],
        configuracion: [
            {
                clave: 'INTERVALO_DUPLICADO_MINUTOS',
                valor: '5',
            },
            {
                clave: 'TIPO_ASISTENCIA_DEFAULT',
                valor: 'ENTRADA',
            },
        ],
        nextPersonaId: 1,
        nextAsistenciaId: 1,
    };
}

export function attendanceError(message, status) {
    const error = new Error(message);
    error.isAttendance = true;
    error.status = status;
    return error;
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
        throw attendanceError(`${label} no puede pasar de ${maxLength} caracteres.`, 400);
    }
    if (!/^[\p{L}][\p{L} .'-]*$/u.test(text)) {
        throw attendanceError(`${label} solo puede contener letras, espacios, apóstrofos o guiones.`, 400);
    }
    return text;
}

function normalizePayload(input) {
    const numero_dni = cleanText(input.numero_dni) || '';
    if (!/^\d{8}$/.test(numero_dni) || numero_dni === '00000000') {
        throw attendanceError('El número de DNI debe tener 8 dígitos.', 400);
    }

    const dispositivo = cleanText(input.dispositivo);
    if (dispositivo && dispositivo.length > 150) {
        throw attendanceError('El identificador del dispositivo supera los 150 caracteres.', 400);
    }

    return {
        numero_dni,
        nombres: assertName(input.nombres, 'Nombres', 150),
        apellido_paterno: assertName(input.apellido_paterno, 'Apellido paterno', 100),
        apellido_materno: assertName(input.apellido_materno, 'Apellido materno', 100),
        dispositivo: dispositivo ? dispositivo.slice(0, 150) : null,
    };
}

function readConfig(state) {
    const intervaloRow = state.configuracion.find((item) => item.clave === 'INTERVALO_DUPLICADO_MINUTOS');
    const tipoRow = state.configuracion.find((item) => item.clave === 'TIPO_ASISTENCIA_DEFAULT');
    const intervaloParsed = intervaloRow ? Number(intervaloRow.valor) : NaN;
    const intervalo = Number.isInteger(intervaloParsed) && intervaloParsed >= 1 && intervaloParsed <= 1440
        ? intervaloParsed
        : 5;
    const tipo = tipoRow && /^[A-Z]{1,10}$/.test(tipoRow.valor) ? tipoRow.valor : 'ENTRADA';
    return { intervalo, tipo };
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function nowParts() {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date());
    const bag = {};
    parts.forEach((part) => {
        bag[part.type] = part.value;
    });
    const hour = bag.hour === '24' ? '00' : bag.hour;
    const fecha = `${bag.year}-${pad(bag.month)}-${pad(bag.day)}`;
    const hora = `${pad(hour)}:${pad(bag.minute)}:${pad(bag.second)}`;
    return {
        fecha,
        hora,
        fecha_hora: `${fecha} ${hora}`,
        epoch: Date.now(),
    };
}

function readState() {
    let raw;
    try {
        raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (_error) {
        throw attendanceError('Este navegador no permitió leer los datos guardados.', 500);
    }
    if (!raw) {
        return emptyState();
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.personas) || !Array.isArray(parsed.asistencias)) {
            return emptyState();
        }
        return {
            ...emptyState(),
            ...parsed,
            personas: parsed.personas,
            asistencias: parsed.asistencias,
        };
    } catch (_error) {
        return emptyState();
    }
}

function writeState(state) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_error) {
        throw attendanceError('No se pudo guardar en este navegador. El almacenamiento está lleno o bloqueado.', 500);
    }
}

function withPerson(state, asistencia) {
    const persona = state.personas.find((item) => item.id_persona === asistencia.id_persona);
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

export function localHealth() {
    return {
        ok: true,
        servidor: 'navegador',
        modo: 'localstorage',
        base_datos: 'localstorage',
        conectado: true,
        mensaje: 'Los registros se guardan en este navegador y se conservan al cerrarlo.',
    };
}

export function localList() {
    const state = readState();
    return sortRows(state.asistencias.map((item) => withPerson(state, item)));
}

export function localListToday() {
    const hoy = nowParts().fecha;
    return localList().filter((item) => item.fecha_asistencia === hoy);
}

export function localRegister(input) {
    const payload = normalizePayload(input || {});
    const state = readState();
    const { intervalo, tipo } = readConfig(state);
    const ahora = nowParts();
    const limite = intervalo * 60 * 1000;
    const duplicado = state.asistencias.some((item) => {
        if (item.numero_dni !== payload.numero_dni || !item.epoch) {
            return false;
        }
        return ahora.epoch - item.epoch <= limite;
    });

    if (duplicado) {
        const unidad = intervalo === 1 ? 'minuto' : 'minutos';
        throw attendanceError(`Este DNI ya registró asistencia en los últimos ${intervalo} ${unidad}.`, 409);
    }

    let persona = state.personas.find((item) => item.numero_dni === payload.numero_dni);
    if (!persona) {
        persona = {
            id_persona: state.nextPersonaId,
            numero_dni: payload.numero_dni,
            nombres: payload.nombres,
            apellido_paterno: payload.apellido_paterno,
            apellido_materno: payload.apellido_materno,
            estado: true,
            fecha_creacion: ahora.fecha_hora,
        };
        state.nextPersonaId += 1;
        state.personas.push(persona);
    }

    const asistencia = {
        id_asistencia: state.nextAsistenciaId,
        id_persona: persona.id_persona,
        numero_dni: payload.numero_dni,
        fecha_asistencia: ahora.fecha,
        hora_asistencia: ahora.hora,
        fecha_hora_registro: ahora.fecha_hora,
        epoch: ahora.epoch,
        tipo_asistencia: tipo,
        estado: 'REGISTRADO',
        dispositivo: payload.dispositivo,
    };
    state.nextAsistenciaId += 1;
    state.asistencias.push(asistencia);
    writeState(state);

    return {
        ok: true,
        message: 'Asistencia registrada.',
        registro: withPerson(state, asistencia),
    };
}
