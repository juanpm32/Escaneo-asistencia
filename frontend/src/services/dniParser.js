/**
 * Formatos verificados del codigo de barras del DNI peruano:
 *
 * 1. Code39 del DNI convencional (RENIEC): el codigo lineal del reverso
 *    contiene solo el CUI, que es el numero de DNI de 8 digitos.
 *    El PDF417 del mismo documento guarda la huella, no el nombre.
 * 2. PDF417 del DNI adulto de 1997: campos de ancho fijo.
 *    0-1 NI, 2-9 DNI, 10-49 apellido paterno, 50-89 apellido materno,
 *    90-124 nombres, 125 sexo (1 masculino, 2 femenino).
 *
 * Si el codigo no trae nombres, el DNI queda como identificador.
 */

const NAME_PATTERN = /^[\p{L}][\p{L} .'-]*$/u;

function collapse(value) {
    return String(value).replace(/\0/g, ' ').replace(/\s+/g, ' ').trim();
}

function readName(raw, required) {
    const cleaned = collapse(raw);
    if (!cleaned) {
        return required ? undefined : null;
    }
    const letters = cleaned.match(/\p{L}/gu) || [];
    if (!NAME_PATTERN.test(cleaned) || cleaned.length > 80 || letters.length < 2) {
        return undefined;
    }
    return cleaned;
}

function parsePdf417Dni1997(text) {
    if (!text || text.length < 126) {
        return null;
    }

    const header = text.slice(0, 126);
    if (/[\r\n]/.test(header) || !/^\d{2}$/.test(header.slice(0, 2))) {
        return null;
    }

    const numeroDni = header.slice(2, 10);
    if (!/^\d{8}$/.test(numeroDni) || numeroDni === '00000000') {
        return null;
    }

    const apellidoPaterno = readName(header.slice(10, 50), true);
    const apellidoMaterno = readName(header.slice(50, 90), false);
    const nombres = readName(header.slice(90, 125), true);
    const sexo = header.slice(125, 126);

    if (
        apellidoPaterno === undefined
        || apellidoMaterno === undefined
        || nombres === undefined
        || (sexo !== '1' && sexo !== '2')
    ) {
        return null;
    }

    return {
        ok: true,
        formato: 'PDF417_1997',
        numero_dni: numeroDni,
        nombres,
        apellido_paterno: apellidoPaterno,
        apellido_materno: apellidoMaterno,
    };
}

function parseCui(text) {
    const clean = String(text || '').trim().replace(/^\*+|\*+$/g, '').trim();
    if (!/^\d{8}$/.test(clean) || clean === '00000000') {
        return null;
    }

    return {
        ok: true,
        formato: 'CUI',
        numero_dni: clean,
        nombres: null,
        apellido_paterno: null,
        apellido_materno: null,
    };
}

export function parseDniBarcode(rawText, barcodeFormat) {
    const text = String(rawText ?? '').replace(/^\uFEFF/, '');
    const format = String(barcodeFormat || '').toUpperCase();
    const fixed = parsePdf417Dni1997(text);

    if (fixed) {
        return fixed;
    }

    const cui = parseCui(text);
    if (cui) {
        return cui;
    }

    if (format.includes('PDF_417') || format.includes('PDF417')) {
        return {
            ok: false,
            formato: 'PDF417_BIOMETRICO',
            message: 'Se leyó el PDF417 biométrico. Ese código no trae el número en claro. Escanee el código de barras lineal del reverso.',
        };
    }

    return {
        ok: false,
        formato: 'DESCONOCIDO',
        message: 'El código no contiene un DNI de 8 dígitos.',
    };
}

export function displayName(person) {
    if (!person) {
        return '';
    }

    const apellidos = [person.apellido_paterno, person.apellido_materno].filter(Boolean).join(' ');
    if (apellidos && person.nombres) {
        return `${apellidos}, ${person.nombres}`;
    }
    if (apellidos) {
        return apellidos;
    }
    if (person.nombres) {
        return person.nombres;
    }
    return '';
}

export function formatFecha(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        return iso || '';
    }
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
}
