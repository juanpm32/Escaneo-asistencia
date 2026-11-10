const attendanceService = require('../services/attendanceService');

function sendError(res, error) {
    if (error.status) {
        res.status(error.status).json({ ok: false, message: error.message });
        return;
    }
    console.error(error);
    res.status(500).json({ ok: false, message: 'No se pudo completar la operacion.' });
}

async function register(req, res) {
    try {
        const registro = await attendanceService.register(req.body);
        res.status(201).json({
            ok: true,
            message: 'Asistencia registrada.',
            registro,
        });
    } catch (error) {
        sendError(res, error);
    }
}

async function list(req, res) {
    try {
        const asistencias = await attendanceService.list();
        res.json({ ok: true, asistencias });
    } catch (error) {
        sendError(res, error);
    }
}

async function today(req, res) {
    try {
        const asistencias = await attendanceService.listToday();
        res.json({ ok: true, asistencias });
    } catch (error) {
        sendError(res, error);
    }
}

module.exports = {
    register,
    list,
    today,
};
