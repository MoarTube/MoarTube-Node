
const path = require('path');
const fs = require('fs');

const { 
	setPublicDirectoryPath, setPagesDirectoryPath, getPublicDirectoryPath, getPagesDirectoryPath
} = require('../utils/helpers');

function root_GET(req, res) {
    const pagePath = path.join(getPagesDirectoryPath(), 'channel.html');
    const fileStream = fs.createReadStream(pagePath);
    res.setHeader('Content-Type', 'text/html');
    fileStream.pipe(res);
}

function information_GET(req, res) {
    database.get('SELECT COUNT(*) AS videoCount FROM videos WHERE (is_published = 1 OR is_live = 1)', function(error, result) {
        if(error) {
            logDebugMessageToConsole(null, error, new Error().stack, true);
            
            res.send({isError: true, message: 'error communicating with the MoarTube node'});
        }
        else {
            if(result != null) {
                const nodeSettings = getNodeSettings();
                
                const nodeId = nodeSettings.nodeId;
                const publicNodeProtocol = nodeSettings.publicNodeProtocol;
                const publicNodeAddress = nodeSettings.publicNodeAddress;
                const publicNodePort = nodeSettings.publicNodePort;
                const nodeName = nodeSettings.nodeName;
                const nodeAbout = nodeSettings.nodeAbout;
                const nodeVideoCount = result.videoCount;
                
                res.send({isError: false, nodeId: nodeId, publicNodeProtocol: publicNodeProtocol, publicNodeAddress: publicNodeAddress, publicNodePort: publicNodePort, nodeName: nodeName, nodeVideoCount: nodeVideoCount, nodeAbout: nodeAbout});
            }
            else {
                res.send({isError: true, message: 'error communicating with the MoarTube node'});
            }
        }
    });
}

function heartbeat_GET(req, res) {
    res.send({isError: false, timestamp: Date.now()});
}

function watch_GET(req, res) {
    const videoId = req.query.v;
    
    if(isVideoIdValid(videoId)) {
        const pagePath = path.join(PAGES_DIRECTORY_PATH, 'watch.html');
        
        const fileStream = fs.createReadStream(pagePath);
        
        res.setHeader('Content-Type', 'text/html');
        
        fileStream.pipe(res);
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
}

module.exports = {
    root_GET,
    information_GET,
    heartbeat_GET,
    watch_GET
};