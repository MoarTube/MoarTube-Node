const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { logDebugMessageToConsole } = require('../utils/logger');
const { getNodeSettings, setNodeSettings, getJwtSecret } = require('../utils/helpers');
const { isUsernameValid, isPasswordValid, isPublicNodeProtocolValid, isPublicNodeAddressValid, isPortValid, isBooleanValid } = require('../utils/validators');

function signIn_POST(username, password, moarTubeNodeHttpProtocol, moarTubeNodeIp, moarTubeNodePort, rememberMe) {
    if(!isUsernameValid(username)) {
        throw new Error('username was not valid');
    }
    else if(!isPasswordValid(password)) {
        throw new Error('password was not valid');
    }
    else if(!isPublicNodeProtocolValid(moarTubeNodeHttpProtocol)) {
        throw new Error('protocol was not valid');
    }
    else if(!isPublicNodeAddressValid(moarTubeNodeIp)) {
        throw new Error('ip address or domain name was not valid');
    }
    else if(!isPortValid(moarTubeNodePort)) {
        throw new Error('port was not valid');
    }
    else if(!isBooleanValid(rememberMe)) {
        throw new Error('rememberMe was not valid');
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
            logDebugMessageToConsole('user logged in: ' + username, null, null);

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