const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { logDebugMessageToConsole } = require('../utils/logger');
const { getNodeSettings, getAuthenticationStatus, getJwtSecret } = require('../utils/helpers');
const { isUsernameValid, isPasswordValid, isBooleanValid } = require('../utils/validators');

function signIn_POST(req, res) {
    let username = req.body.username;
    let password = req.body.password;
    let rememberMe = req.body.rememberMe;
    
    if(!isUsernameValid(username)) {
        logDebugMessageToConsole('attempted to sign in with invalid username: ' + username, null, new Error().stack, true);

        res.send({isError: true, message: 'usernames can contain letters aA-zZ, digits, symbols !@#$%^&*()-_=+[], and can be up to 100 characters long'});
    }
    else if(!isPasswordValid(password)) {
        logDebugMessageToConsole('attempted to sign in with invalid password: ' + password, null, new Error().stack, true);

        res.send({isError: true, message: 'passwords can contain letters aA-zZ, digits, symbols !@#$%^&*()-_=+[], and can be up to 100 characters long'});
    }
    else if(!isBooleanValid(rememberMe)) {
        logDebugMessageToConsole('attempted to sign in with invalid rememberMe: ' + rememberMe, null, new Error().stack, true);

        res.send({isError: true, message: 'invalid parameter: rememberMe value was ' + rememberMe + ', expected "on" or "off"'});
    }
    else {
        let expiresIn;
        
        if(rememberMe) {
            expiresIn = '30d'; // 30 days
        }
        else {
            expiresIn = '1d'; // 1 day
        }
        
        const nodeSettings = getNodeSettings();
        
        const usernameHash = Buffer.from(decodeURIComponent(nodeSettings.username), 'base64').toString('utf8');
        const passwordHash = Buffer.from(decodeURIComponent(nodeSettings.password), 'base64').toString('utf8');
        
        const isUsernameValid = bcryptjs.compareSync(username, usernameHash);
        const isPasswordValid = bcryptjs.compareSync(password, passwordHash);
        
        if(isUsernameValid && isPasswordValid) {
            logDebugMessageToConsole('user logged in: ' + username, null, null, true);
            
            const token = jwt.sign({ username }, getJwtSecret(), { expiresIn: expiresIn });
            
            res.send({isError: false, isAuthenticated: true, token: token});
        }
        else {
            res.send({isError: false, isAuthenticated: false});
        }
    }
}

function signOut_GET(req, res) {
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
}

function authenticated_GET(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        res.send({isError: false, isAuthenticated: isAuthenticated});
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
}

module.exports = {
    signIn_POST,
    signOut_GET,
    authenticated_GET
};