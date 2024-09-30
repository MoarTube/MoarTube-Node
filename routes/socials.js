const express = require('express');

const { socialMediaAll_GET, socialMediaAdd_POST, socialMediaDelete_POST } = require('../controllers/socials.js');
const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus } = require('../utils/helpers');

const router = express.Router();

router.get('/socialMedia/all', async (req, res) => {
    const data = await socialMediaAll_GET();

    res.send(data);
});

router.post('/socialMedia/add', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const link = req.body.link;
            const svgGraphic = req.body.svgGraphic;

            const data = await socialMediaAdd_POST(link, svgGraphic);

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

router.post('/socialMedia/delete', (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const socialMediaId = req.body.socialMediaId;

            const data = await socialMediaDelete_POST(socialMediaId);

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