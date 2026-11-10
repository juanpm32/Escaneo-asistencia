import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { ScanLine } from 'lucide-react';
import { getErrorMessage, registerAttendance } from '../services/api';
import { displayName, formatFecha, parseDniBarcode } from '../services/dniParser';

const CONSTRAINTS = [
    {
        audio: false,
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
        },
    },
    { audio: false, video: { facingMode: 'environment' } },
    { audio: false, video: true },
];

function createReader() {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_128,
        BarcodeFormat.ITF,
        BarcodeFormat.PDF_417,
        BarcodeFormat.QR_CODE,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 250 });
}

function cameraMessage(error) {
    const name = error && error.name;
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return 'El navegador bloqueó la cámara. Permita el acceso para leer el DNI.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return 'No se encontró una cámara en este dispositivo.';
    }
    if (name === 'NotReadableError') {
        return 'La cámara está en uso por otra aplicación.';
    }
    return 'No se pudo abrir la cámara trasera. Revise el permiso e intente de nuevo.';
}

export default function Scanner({ onRegistered }) {
    const videoRef = useRef(null);
    const controlsRef = useRef(null);
    const sessionRef = useRef(0);
    const [phase, setPhase] = useState('idle');
    const [notice, setNotice] = useState(null);

    useEffect(() => {
        return () => {
            sessionRef.current += 1;
            if (controlsRef.current) {
                controlsRef.current.stop();
                controlsRef.current = null;
            }
        };
    }, []);

    function stopCamera() {
        const controls = controlsRef.current;
        controlsRef.current = null;
        if (controls) {
            controls.stop();
        }
    }

    function resetSession() {
        sessionRef.current += 1;
        stopCamera();
    }

    async function handleDecode(sessionId, result) {
        if (sessionRef.current !== sessionId) {
            return;
        }

        sessionRef.current += 1;
        stopCamera();
        setPhase('busy');

        const formatName = BarcodeFormat[result.getBarcodeFormat()] || '';
        const parsed = parseDniBarcode(result.getText(), formatName);

        if (!parsed.ok) {
            setPhase('done');
            setNotice({
                ok: false,
                numero_dni: '',
                title: 'No se pudo leer el DNI',
                message: parsed.message,
            });
            return;
        }

        try {
            const response = await registerAttendance({
                numero_dni: parsed.numero_dni,
                nombres: parsed.nombres,
                apellido_paterno: parsed.apellido_paterno,
                apellido_materno: parsed.apellido_materno,
                dispositivo: navigator.userAgent.slice(0, 150),
            });
            const registro = response.registro;
            const name = displayName(registro);
            setNotice({
                ok: true,
                numero_dni: registro.numero_dni,
                title: name || 'Identificado por DNI',
                message: response.message,
                detail: name ? '' : 'Este código no incluye apellidos ni nombres.',
                meta: `${formatFecha(registro.fecha_asistencia)} · ${registro.hora_asistencia} · ${registro.tipo_asistencia}`,
            });
            setPhase('done');
            if (onRegistered) {
                await onRegistered(registro);
            }
        } catch (error) {
            setNotice({
                ok: false,
                numero_dni: parsed.numero_dni,
                title: displayName(parsed) || 'DNI leído',
                message: getErrorMessage(error),
            });
            setPhase('done');
        }
    }

    async function start() {
        resetSession();
        const sessionId = sessionRef.current;
        setNotice(null);
        setPhase('scanning');
        let lastError = null;

        for (const constraints of CONSTRAINTS) {
            if (sessionRef.current !== sessionId) {
                return;
            }

            const reader = createReader();
            try {
                let accepted = false;
                const controls = await reader.decodeFromConstraints(
                    constraints,
                    videoRef.current,
                    (result) => {
                        if (!result || accepted || sessionRef.current !== sessionId) {
                            return;
                        }
                        const text = result.getText ? result.getText() : '';
                        if (!text) {
                            return;
                        }
                        accepted = true;
                        handleDecode(sessionId, result);
                    }
                );

                if (sessionRef.current !== sessionId) {
                    controls.stop();
                    return;
                }

                controlsRef.current = controls;
                return;
            } catch (error) {
                lastError = error;
            }
        }

        if (sessionRef.current !== sessionId) {
            return;
        }

        setPhase('done');
        setNotice({
            ok: false,
            numero_dni: '',
            title: 'Cámara no disponible',
            message: cameraMessage(lastError),
        });
    }

    function stop() {
        resetSession();
        setPhase('idle');
    }

    const scanning = phase === 'scanning';
    const busy = phase === 'busy';

    return (
        <section className="panel scanner" aria-label="Escáner de DNI">
            <div className="viewport">
                <video ref={videoRef} muted autoPlay playsInline aria-label="Visor de la cámara" />
                {scanning ? <div className="finder" aria-hidden="true" /> : null}
                {phase === 'idle' ? (
                    <p className="viewport-note">La cámara se activa al iniciar la lectura.</p>
                ) : null}
            </div>

            {scanning ? (
                <button type="button" className="scan-button scan-button-stop" onClick={stop}>
                    Detener
                </button>
            ) : (
                <button type="button" className="scan-button" onClick={start} disabled={busy}>
                    <ScanLine size={20} strokeWidth={1.75} aria-hidden="true" />
                    {busy ? 'Registrando…' : phase === 'done' ? 'Volver a escanear' : 'Iniciar lectura'}
                </button>
            )}

            <p className="hint">Apunte al código lineal del reverso del DNI. Ahí está el número.</p>

            {notice ? (
                <div className={notice.ok ? 'result result-ok' : 'result result-bad'} role="status">
                    {notice.numero_dni ? <p className="dni-stamp">{notice.numero_dni}</p> : null}
                    <p className="result-title">{notice.title}</p>
                    <p className="result-message">{notice.message}</p>
                    {notice.detail ? <p className="result-detail">{notice.detail}</p> : null}
                    {notice.meta ? <p className="result-meta">{notice.meta}</p> : null}
                </div>
            ) : null}
        </section>
    );
}
