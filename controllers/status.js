const { getNodeSettings } = require('../utils/helpers');
const { performDatabaseReadJob_GET } = require('../utils/database');

async function information_GET() {
    const nodeVideoCount = (await performDatabaseReadJob_GET('SELECT COUNT(*) AS "videoCount" FROM videos WHERE (is_published = ? OR is_live = ?)', [true, true])).videoCount;

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
    
    return {isError: false, information: information};
}

function heartbeat_GET() {
    return {isError: false, timestamp: Date.now()};
}

module.exports = {
    information_GET,
    heartbeat_GET
};