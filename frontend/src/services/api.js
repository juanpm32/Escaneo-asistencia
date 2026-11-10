import axios from 'axios';

const client = axios.create({
    baseURL: (import.meta.env.VITE_API_URL || '').replace(/\/$/, ''),
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
    },
});

export function getErrorMessage(error) {
    if (error && error.response && error.response.data && error.response.data.message) {
        return error.response.data.message;
    }
    return 'No se pudo conectar con el servidor.';
}

export async function getHealth() {
    try {
        const response = await client.get('/api/health');
        return response.data;
    } catch (error) {
        if (error.response && error.response.data && typeof error.response.data === 'object') {
            return error.response.data;
        }
        throw error;
    }
}

export async function getAttendance() {
    const response = await client.get('/api/attendance');
    return response.data;
}

export async function getAttendanceToday() {
    const response = await client.get('/api/attendance/today');
    return response.data;
}

export async function registerAttendance(payload) {
    const response = await client.post('/api/attendance/register', payload);
    return response.data;
}
