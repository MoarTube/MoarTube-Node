const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { logDebugMessageToConsole } = require('../utils/logger');
const { getNodeSettings, setNodeSettings, getJwtSecret } = require('../utils/helpers');
const { isUsernameValid, isPasswordValid, isPublicNodeProtocolValid, isPublicNodeAddressValid, isPortValid, isBooleanValid } = require('../utils/validators');

function signIn_POST(username, password, moarTubeNodeHttpProtocol, moarTubeNodeIp, moarTubeNodePort, rememberMe) {
    if(!isUsernameValid(username)) {
        logDebugMessageToConsole('attempted to sign in with invalid username: ' + username, null, new Error().stack, true);

        return {isError: true, message: 'usernames can contain letters aA-zZ, digits, symbols !@#$%^&*()-_=+[], and can be up to 100 characters long'};
    }
    else if(!isPasswordValid(password)) {
        logDebugMessageToConsole('attempted to sign in with invalid password: ' + password, null, new Error().stack, true);

        return {isError: true, message: 'passwords can contain letters aA-zZ, digits, symbols !@#$%^&*()-_=+[], and can be up to 100 characters long'};
    }
    else if(!isPublicNodeProtocolValid(moarTubeNodeHttpProtocol)) {
        logDebugMessageToConsole('attempted to sign in with invalid protocol: ' + moarTubeNodeHttpProtocol, null, null, true);
        
        return {isError: true, message: 'ip address or domain name is not valid'};
    }
    else if(!isPublicNodeAddressValid(moarTubeNodeIp)) {
        logDebugMessageToConsole('attempted to sign in with invalid ip address or domian name: ' + moarTubeNodeIp, null, null, true);
        
        return {isError: true, message: 'ip address or domain name is not valid'};
    }
    else if(!isPortValid(moarTubeNodePort)) {
        logDebugMessageToConsole('attempted to sign in with invalid port: ' + moarTubeNodePort, null, null, true);
        
        return {isError: true, message: 'port is not valid'};
    }
    else if(!isBooleanValid(rememberMe)) {
        logDebugMessageToConsole('attempted to sign in with invalid rememberMe: ' + rememberMe, null, new Error().stack, true);

        return {isError: true, message: 'invalid parameter: rememberMe value was ' + rememberMe + ', expected "on" or "off"'};
    }
    else {
        let options = {};
        
        if(!rememberMe) {
            options.expiresIn = '1d'; // 1 day
        }
        
        const nodeSettings = getNodeSettings();
        
        const usernameHash = Buffer.from(decodeURIComponent(nodeSettings.username), 'base64').toString('utf8');
        const passwordHash = Buffer.from(decodeURIComponent(nodeSettings.password), 'base64').toString('utf8');
        
        const isUsernameValid = bcryptjs.compareSync(username, usernameHash);
        const isPasswordValid = bcryptjs.compareSync(password, passwordHash);
        
        if(isUsernameValid && isPasswordValid) {
            logDebugMessageToConsole('user logged in: ' + username, null, null, true);

            if(nodeSettings.publicNodeProtocol === "" && nodeSettings.publicNodeAddress === "" && nodeSettings.publicNodePort === "") {
                nodeSettings.publicNodeProtocol = moarTubeNodeHttpProtocol;
                nodeSettings.publicNodeAddress = moarTubeNodeIp;
                nodeSettings.publicNodePort = moarTubeNodePort;

                setNodeSettings(nodeSettings);
            }

            const token = jwt.sign({ username }, getJwtSecret(), options);
            
            return {isError: false, isAuthenticated: true, token: token};
        }
        else {
            return {isError: false, isAuthenticated: false};
        }
    }
}

module.exports = {
    signIn_POST
};