import { useCallback, useEffect, useState } from 'react';
import AttendanceTable from './components/AttendanceTable';
import Scanner from './components/Scanner';
import { getAttendance, getAttendanceToday, getErrorMessage, getHealth } from './services/api';
import { displayName, formatFecha } from './services/dniParser';

const dateFormatter = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
});

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

    const latest = today[0];
    const connected = Boolean(health && health.ok);
    const connectionText = connected
        ? (health.base_datos === 'mssql' ? 'SQL Server conectado' : 'Modo demo · memoria')
        : ((health && health.mensaje) || 'Sin conexión con el servidor');

    return (
        <div className="app">
            <div className="shell">
                <header className="topbar">
                    <div>
                        <p className="eyebrow">Registro de entrada</p>
                        <h1>Control de Asistencia</h1>
                    </div>
                    <div className="clock" aria-live="polite">
                        <span className="clock-date">{dateFormatter.format(now)}</span>
                        <span className="clock-time">{timeFormatter.format(now)}</span>
                    </div>
                </header>

                <main>
                    <div className="workspace">
                        <Scanner onRegistered={load} />
                        <aside className="panel summary" aria-label="Resumen de asistencias">
                            <p className="summary-label">Hoy</p>
                            <p className="summary-count">{connected ? today.length : '—'}</p>
                            <p className="summary-caption">
                                {!connected
                                    ? 'sin datos del servidor'
                                    : today.length === 1
                                        ? 'entrada registrada'
                                        : 'entradas registradas'}
                            </p>
                            <div className="summary-last">
                                <p>Última entrada</p>
                                {latest ? (
                                    <>
                                        <strong>{latest.numero_dni}</strong>
                                        <span>{displayName(latest) || 'Identificado por DNI'}</span>
                                        <span>{formatFecha(latest.fecha_asistencia)} · {latest.hora_asistencia}</span>
                                    </>
                                ) : (
                                    <span>Sin registros hoy</span>
                                )}
                            </div>
                            <p className={connected ? 'link-status ok' : 'link-status bad'}>{connectionText}</p>
                        </aside>
                    </div>
                    <AttendanceTable records={records} error={loadError} />
                </main>
            </div>
        </div>
    );
}
