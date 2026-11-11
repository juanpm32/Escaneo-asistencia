import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Search } from 'lucide-react';
import { displayName, formatFecha } from '../services/dniParser';

const PAGE_SIZE = 10;

function useNarrowScreen() {
    const query = '(max-width: 800px)';
    const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);

    useEffect(() => {
        const media = window.matchMedia(query);
        const onChange = () => setNarrow(media.matches);
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, []);

    return narrow;
}

function compareRows(a, b, sort) {
    const fecha = a.fecha_asistencia.localeCompare(b.fecha_asistencia);
    const hora = a.hora_asistencia.localeCompare(b.hora_asistencia);
    const id = a.id_asistencia - b.id_asistencia;
    const primary = sort.key === 'hora' ? hora : fecha;
    const secondary = sort.key === 'hora' ? fecha : hora;
    const value = primary || secondary || id;
    return sort.dir === 'asc' ? value : -value;
}

export default function AttendanceTable({ records, error }) {
    const narrow = useNarrowScreen();
    const [dni, setDni] = useState('');
    const [fecha, setFecha] = useState('');
    const [sort, setSort] = useState({ key: 'fecha', dir: 'desc' });
    const [page, setPage] = useState(1);

    useEffect(() => {
        setPage(1);
    }, [dni, fecha, sort, records]);

    const filtered = useMemo(() => {
        const query = dni.trim();
        return records
            .filter((row) => (query ? String(row.numero_dni).includes(query) : true))
            .filter((row) => (fecha ? row.fecha_asistencia === fecha : true))
            .slice()
            .sort((a, b) => compareRows(a, b, sort))
            .map((row, index) => ({ ...row, numero: index + 1 }));
    }, [records, dni, fecha, sort]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAGE_SIZE);

    function toggleSort(key) {
        setSort((current) => {
            if (current.key === key) {
                return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
            }
            return { key, dir: 'desc' };
        });
    }

    function sortLabel(key, label) {
        if (sort.key !== key) {
            return label;
        }
        return `${label} ${sort.dir === 'asc' ? '↑' : '↓'}`;
    }

    return (
        <section className="panel records" aria-label="Asistencias registradas">
            <div className="records-head">
                <h2>Asistencias registradas</h2>
                <p>{filtered.length === 1 ? '1 asistencia' : `${filtered.length} asistencias`}</p>
            </div>

            <div className="filters">
                <label className="field">
                    <span><Search size={16} strokeWidth={1.75} aria-hidden="true" /> DNI</span>
                    <input
                        type="search"
                        inputMode="numeric"
                        autoComplete="off"
                        spellCheck="false"
                        placeholder="Buscar DNI"
                        value={dni}
                        onChange={(event) => setDni(event.target.value)}
                    />
                </label>
                <label className="field">
                    <span><CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" /> Fecha</span>
                    <input
                        type="date"
                        value={fecha}
                        onChange={(event) => setFecha(event.target.value)}
                    />
                </label>
                {dni || fecha ? (
                    <button type="button" className="text-button" onClick={() => { setDni(''); setFecha(''); }}>
                        Limpiar
                    </button>
                ) : null}
            </div>

            {narrow && records.length > 0 ? (
                <div className="sort-row">
                    <button type="button" className="sort-button" onClick={() => toggleSort('fecha')}>
                        {sortLabel('fecha', 'Fecha')}
                    </button>
                    <button type="button" className="sort-button" onClick={() => toggleSort('hora')}>
                        {sortLabel('hora', 'Hora')}
                    </button>
                </div>
            ) : null}

            {error ? <p className="load-error">{error}</p> : null}

            {!error && records.length === 0 ? (
                <p className="empty">No hay entradas. Lea un DNI para registrar la primera.</p>
            ) : null}

            {!error && records.length > 0 && filtered.length === 0 ? (
                <p className="empty">Ninguna asistencia coincide con la búsqueda.</p>
            ) : null}

            {pageRows.length > 0 && narrow ? (
                <div className="cards">
                    {pageRows.map((row) => (
                        <article className="card" key={row.id_asistencia}>
                            <p className="card-dni">{row.numero_dni}</p>
                            <p className="card-time">{row.hora_asistencia}</p>
                            <p className="card-name">{displayName(row) || 'Identificado por DNI'}</p>
                            <p className="card-meta">{formatFecha(row.fecha_asistencia)} · {row.tipo_asistencia}</p>
                        </article>
                    ))}
                </div>
            ) : null}

            {pageRows.length > 0 && !narrow ? (
                <div className="table-scroll">
                    <table>
                        <caption className="visually-hidden">Asistencias ordenadas por fecha y hora</caption>
                        <thead>
                            <tr>
                                <th scope="col">Número</th>
                                <th scope="col">DNI</th>
                                <th scope="col">Apellidos y nombres</th>
                                <th scope="col">
                                    <button type="button" className="sort-button" onClick={() => toggleSort('fecha')}>
                                        {sortLabel('fecha', 'Fecha')}
                                    </button>
                                </th>
                                <th scope="col">
                                    <button type="button" className="sort-button" onClick={() => toggleSort('hora')}>
                                        {sortLabel('hora', 'Hora')}
                                    </button>
                                </th>
                                <th scope="col">Tipo</th>
                                <th scope="col">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageRows.map((row) => (
                                <tr key={row.id_asistencia}>
                                    <td>{row.numero}</td>
                                    <td className="dni-cell">{row.numero_dni}</td>
                                    <td>{displayName(row) || row.numero_dni}</td>
                                    <td>{formatFecha(row.fecha_asistencia)}</td>
                                    <td>{row.hora_asistencia}</td>
                                    <td>{row.tipo_asistencia}</td>
                                    <td className="estado">{row.estado}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}

            {filtered.length > PAGE_SIZE ? (
                <div className="pager">
                    <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>
                        Anterior
                    </button>
                    <span>Página {currentPage} de {pageCount}</span>
                    <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount}>
                        Siguiente
                    </button>
                </div>
            ) : null}
        </section>
    );
}
