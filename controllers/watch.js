const fs = require('fs');
const path = require('path');

const { getPagesDirectoryPath } = require('../utils/paths');
const { isVideoIdValid } = require('../utils/validators');

function root_GET(req, res) {
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
    root_GET
};