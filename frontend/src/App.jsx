import { useCallback, useEffect, useState } from 'react';
import AttendanceTable from './components/AttendanceTable';
import Scanner from './components/Scanner';
import { getAttendance, getAttendanceToday, getErrorMessage, getHealth } from './services/api';

const dateFormatter = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
});

const timeFormatter = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
});

function connectionLabel(health) {
    if (!health || !health.ok) {
        return (health && health.mensaje) || 'Sin conexión';
    }
    if (health.base_datos === 'localstorage') {
        return 'Guardado en este teléfono';
    }
    if (health.base_datos === 'postgres') {
        return 'PostgreSQL';
    }
    if (health.base_datos === 'sqlserver' || health.base_datos === 'mssql') {
        return 'SQL Server';
    }
    return 'Solo en esta sesión';
}

export default function App() {
    const [now, setNow] = useState(() => new Date());
    const [records, setRecords] = useState([]);
    const [today, setToday] = useState([]);
    const [health, setHealth] = useState(null);
    const [loadError, setLoadError] = useState('');

    const load = useCallback(async () => {
        try {
            const healthResult = await getHealth();
            setHealth(healthResult);
            if (!healthResult.ok) {
                setLoadError(healthResult.mensaje || 'La base de datos no está disponible.');
                setRecords([]);
                setToday([]);
                return;
            }
            const [allResult, todayResult] = await Promise.all([
                getAttendance(),
                getAttendanceToday(),
            ]);
            setRecords(allResult.asistencias || []);
            setToday(todayResult.asistencias || []);
            setLoadError('');
        } catch (error) {
            setLoadError(getErrorMessage(error));
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const connected = Boolean(health && health.ok);
    const todayCount = connected ? today.length : null;

    return (
        <div className="app">
            <header className="bar">
                <div>
                    <h1>Control de asistencia</h1>
                    <p className="bar-date">{dateFormatter.format(now)}</p>
                </div>
                <div className="bar-meta">
                    <time className="bar-time" aria-live="polite">{timeFormatter.format(now)}</time>
                    <p className="bar-count">
                        <strong>{todayCount == null ? '–' : todayCount}</strong>
                        <span> hoy</span>
                    </p>
                </div>
            </header>
            <p className={connected ? 'status ok' : 'status bad'}>{connectionLabel(health)}</p>
            <main className="layout">
                <Scanner onRegistered={load} />
                <AttendanceTable records={records} error={loadError} />
            </main>
        </div>
    );
}
