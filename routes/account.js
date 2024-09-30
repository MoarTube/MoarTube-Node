const express = require('express');

const { signIn_POST } = require('../controllers/account');
const { logDebugMessageToConsole } = require('../utils/logger');
const { getAuthenticationStatus } = require('../utils/helpers');

const router = express.Router();

router.post('/signin', (req, res) => {
    let username = req.body.username;
    let password = req.body.password;
    let moarTubeNodeHttpProtocol = req.body.moarTubeNodeHttpProtocol;
    let moarTubeNodeIp = req.body.moarTubeNodeIp;
    let moarTubeNodePort = req.body.moarTubeNodePort;
    let rememberMe = req.body.rememberMe;

    const data = signIn_POST(username, password, moarTubeNodeHttpProtocol, moarTubeNodeIp, moarTubeNodePort, rememberMe);

    res.send(data);
});

router.get('/signout', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            req.logout(function(error) {
                res.send({isError: false, wasAuthenticated: true});
            });
        }
        else {
            res.send({isError: false, wasAuthenticated: false});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

router.get('/authenticated', async (req, res) => {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        res.send({isError: false, isAuthenticated: isAuthenticated});
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
});

module.exports = router;