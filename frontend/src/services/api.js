import axios from 'axios';
import dataStore from '../config/dataStore.json';
import { localHealth, localList, localListToday, localRegister } from './localStore';

const localMode = String(dataStore.store || '').trim().toLowerCase() === 'localstorage';

const client = axios.create({
    baseURL: (import.meta.env.VITE_API_URL || '').replace(/\/$/, ''),
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
    },
});

let healthRequest = null;

function fetchHealth() {
    if (!healthRequest) {
        healthRequest = client.get('/api/health').then((response) => response.data).catch((error) => {
            if (error.response && error.response.data && typeof error.response.data === 'object') {
                return error.response.data;
            }
            healthRequest = null;
            throw error;
        });
    }
    return healthRequest;
}

function usesLocalStorage() {
    return localMode;
}

export function getErrorMessage(error) {
    if (error && error.response && error.response.data && error.response.data.message) {
        return error.response.data.message;
    }
    if (error && error.isAttendance) {
        return error.message;
    }
    if (localMode) {
        return (error && error.message) || 'No se pudo guardar en este navegador.';
    }
    return 'No se pudo conectar con el servidor.';
}

export async function getHealth() {
    if (usesLocalStorage()) {
        return localHealth();
    }
    return fetchHealth();
}

export async function getAttendance() {
    if (usesLocalStorage()) {
        return { ok: true, asistencias: localList() };
    }
    const response = await client.get('/api/attendance');
    return response.data;
}

export async function getAttendanceToday() {
    if (usesLocalStorage()) {
        return { ok: true, asistencias: localListToday() };
    }
    const response = await client.get('/api/attendance/today');
    return response.data;
}

export async function registerAttendance(payload) {
    if (usesLocalStorage()) {
        return localRegister(payload);
    }
    const response = await client.post('/api/attendance/register', payload);
    return response.data;
}
