const { logDebugMessageToConsole, getNodeSettings, setNodeSettings, getAuthenticationStatus } = require('../utils/helpers');
const { isPublicNodeProtocolValid, isPublicNodeAddressValid, isPortValid } = require('../utils/validators');

function root_POST(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then((isAuthenticated) => {
        if(isAuthenticated) {
            const publicNodeProtocol = req.body.publicNodeProtocol;
            const publicNodeAddress = req.body.publicNodeAddress;
            const publicNodePort = req.body.publicNodePort;
            
            if(isPublicNodeProtocolValid(publicNodeProtocol) && isPublicNodeAddressValid(publicNodeAddress) && isPortValid(publicNodePort)) {
                const nodeSettings = getNodeSettings();

                nodeSettings.publicNodeProtocol = publicNodeProtocol;
                nodeSettings.publicNodeAddress = publicNodeAddress;
                nodeSettings.publicNodePort = publicNodePort;
                nodeSettings.isNodeConfigured = true;

                setNodeSettings(nodeSettings);
                
                res.send({ isError: false });
            }
            else {
                res.send({ isError: true, message: 'invalid parameters' });
            }
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
}

module.exports = {
    root_POST
};