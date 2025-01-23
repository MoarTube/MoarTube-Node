const express = require('express');

const { signIn_POST } = require('../controllers/account');
const { logDebugMessageToConsole } = require('../utils/logger');
const { performAuthenticationCheck } = require('../middleware/authentication');

const router = express.Router();

router.post('/signin', performAuthenticationCheck(false), (req, res) => {
    try {
        const username = req.body.username;
        const password = req.body.password;
        const moarTubeNodeHttpProtocol = req.body.moarTubeNodeHttpProtocol;
        const moarTubeNodeIp = req.body.moarTubeNodeIp;
        const moarTubeNodePort = req.body.moarTubeNodePort;
        const rememberMe = req.body.rememberMe;

        const data = signIn_POST(username, password, moarTubeNodeHttpProtocol, moarTubeNodeIp, moarTubeNodePort, rememberMe);

        res.send(data);
    }
    catch (error) {
        logDebugMessageToConsole(null, error, new Error().stack);

        res.send({ isError: true, message: 'error communicating with the MoarTube node' });
    }
});

router.get('/signout', performAuthenticationCheck(false), async (req, res) => {
    req.logout(function (error) {
        if (error) {
            logDebugMessageToConsole(error, new Error().stack);

            res.send({ isError: true, message: 'error communicating with the MoarTube node' });
        }
        else {
            res.send({ isError: false, wasAuthenticated: true });
        }
    });
});

router.get('/authenticated', performAuthenticationCheck(true), async (req, res) => {
    res.send({ isError: false, isAuthenticated: req.isAuthenticated });
});

module.exports = router;