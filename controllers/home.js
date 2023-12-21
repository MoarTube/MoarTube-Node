const path = require('path');
const fs = require('fs');

const { logDebugMessageToConsole, getPagesDirectoryPath, getNodeSettings } = require('../utils/helpers');
const { isVideoIdValid } = require('../utils/validators');
const { performDatabaseReadJob_GET } = require('../utils/database');

function root_GET(req, res) {
    const pagePath = path.join(getPagesDirectoryPath(), 'channel.html');
    const fileStream = fs.createReadStream(pagePath);
    res.setHeader('Content-Type', 'text/html');
    fileStream.pipe(res);
}

function information_GET(req, res) {
    performDatabaseReadJob_GET('SELECT COUNT(*) AS videoCount FROM videos WHERE (is_published = 1 OR is_live = 1)', [])
    .then(row => {
        if(row != null) {
            const nodeVideoCount = row.videoCount;

            const nodeSettings = getNodeSettings();
            
            const nodeId = nodeSettings.nodeId;
            const publicNodeProtocol = nodeSettings.publicNodeProtocol;
            const publicNodeAddress = nodeSettings.publicNodeAddress;
            const publicNodePort = nodeSettings.publicNodePort;
            const nodeName = nodeSettings.nodeName;
            const nodeAbout = nodeSettings.nodeAbout;
            
            res.send({isError: false, nodeId: nodeId, publicNodeProtocol: publicNodeProtocol, publicNodeAddress: publicNodeAddress, publicNodePort: publicNodePort, nodeName: nodeName, nodeVideoCount: nodeVideoCount, nodeAbout: nodeAbout});
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

function watch_GET(req, res) {
    const videoId = req.query.v;
    
    if(isVideoIdValid(videoId)) {
        const pagePath = path.join(getPagesDirectoryPath(), 'watch.html');
        
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