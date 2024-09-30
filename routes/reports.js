const express = require('express');

const { reportsCount_GET } = require('../controllers/reports');
const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus } = require('../utils/helpers');

const router = express.Router();

router.get('/count', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const data = await reportsCount_GET();

            res.send(data);
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
    
});

module.exports = router;