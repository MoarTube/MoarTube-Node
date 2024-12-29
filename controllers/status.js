const { logDebugMessageToConsole } = require('../utils/logger');
const { getNodeSettings } = require('../utils/helpers');
const { performDatabaseReadJob_GET, performDatabaseReadJob_ALL } = require('../utils/database');

function information_GET() {
    return new Promise(function(resolve, reject) {
        performDatabaseReadJob_GET('SELECT COUNT(*) AS "videoCount" FROM videos WHERE (is_published = ? OR is_live = ?)', [true, true])
        .then(row => {
            if(row != null) {
                const nodeVideoCount = row.videoCount;

                const nodeSettings = getNodeSettings();
                
                const nodeId = nodeSettings.nodeId;
                const nodeName = nodeSettings.nodeName;
                const nodeAbout = nodeSettings.nodeAbout;
                const publicNodeProtocol = nodeSettings.publicNodeProtocol;
                const publicNodeAddress = nodeSettings.publicNodeAddress;
                const publicNodePort = nodeSettings.publicNodePort;
                const cloudflareTurnstileSiteKey = nodeSettings.cloudflareTurnstileSiteKey;

                const information = {
                    nodeVideoCount: nodeVideoCount,
                    nodeId: nodeId, 
                    nodeName: nodeName, 
                    nodeAbout: nodeAbout, 
                    publicNodeProtocol: publicNodeProtocol, 
                    publicNodeAddress: publicNodeAddress, 
                    publicNodePort: publicNodePort,
                    cloudflareTurnstileSiteKey: cloudflareTurnstileSiteKey
                };
                
                resolve({isError: false, information: information});
            }
            else {
                resolve({isError: true, message: 'error communicating with the MoarTube node'});
            }
        })
        .catch(error => {
            reject(error);
        });
    });
}

function heartbeat_GET() {
    return new Promise(function(resolve, reject) {
        resolve({isError: false, timestamp: Date.now()});
    });
}

module.exports = {
    information_GET,
    heartbeat_GET
};