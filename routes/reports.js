const express = require('express');

const { reportsCount_GET } = require('../controllers/reports');
const { logDebugMessageToConsole } = require('../utils/logger');
const { performAuthenticationCheck } = require('../middleware/authentication');

const router = express.Router();

router.get('/count', performAuthenticationCheck(true), async (req, res) => {
    try {
        const data = await reportsCount_GET();

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

module.exports = router;