const { getNodeSettings } = require('../utils/helpers');
const { performDatabaseReadJob_GET } = require('../utils/database');

function information_GET(req, res) {
    performDatabaseReadJob_GET('SELECT COUNT(*) AS videoCount FROM videos WHERE (is_published = 1 OR is_live = 1)', [])
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

            const information = {
                nodeVideoCount: nodeVideoCount,
                nodeId: nodeId, 
                nodeName: nodeName, 
                nodeAbout: nodeAbout, 
                publicNodeProtocol: publicNodeProtocol, 
                publicNodeAddress: publicNodeAddress, 
                publicNodePort: publicNodePort
            };
            
            res.send({isError: false, information: information});
        }
        else {
            res.send({isError: true, message: 'error communicating with the MoarTube node'});
        }
    })
    .catch(error => {
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
}

function heartbeat_GET(req, res) {
    res.send({isError: false, timestamp: Date.now()});
}

module.exports = {
    information_GET,
    heartbeat_GET
};