const fs = require('fs');
const path = require('path');

const { getPagesDirectoryPath } = require('../utils/helpers');
const { isVideoIdValid } = require('../utils/validators');

function videoVideoId_GET(req, res) {
    const videoId = req.params.videoId;
    
    if(isVideoIdValid(videoId)) {
        const pagePath = path.join(getPagesDirectoryPath(), 'embed-video.html');
        
        const fileStream = fs.createReadStream(pagePath);
        
        res.setHeader('Content-Type', 'text/html');
        
        fileStream.pipe(res);
    }
    else {
        res.status(404).send('embed video not found');
    }
}

function chatVideoId_GET(req, res) {
    const videoId = req.params.videoId;
    
    if(isVideoIdValid(videoId)) {
        const pagePath = path.join(getPagesDirectoryPath(), 'embed-chat.html');
        
        const fileStream = fs.createReadStream(pagePath);
        
        res.setHeader('Content-Type', 'text/html');
        
        fileStream.pipe(res);
    }
    else {
        res.status(404).send('embed chat not found');
    }
}

module.exports = {
    videoVideoId_GET,
    chatVideoId_GET
};