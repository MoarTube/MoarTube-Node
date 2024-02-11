const { isVideoIdValid } = require('../utils/validators');
const { node_getVideo } = require('../utils/node-communications');

async function videoVideoId_GET(req, res) {
    const videoId = req.params.videoId;
    
    if(isVideoIdValid(videoId, false)) {
        const videoData = await node_getVideo(videoId);

        res.render('embed-video', {videoData: videoData});
    }
    else {
        res.status(404).send('embed video not found');
    }
}

function chatVideoId_GET(req, res) {
    const videoId = req.params.videoId;
    
    if(isVideoIdValid(videoId, false)) {
        res.render('embed-chat', {videoId: videoId});
    }
    else {
        res.status(404).send('embed chat not found');
    }
}

module.exports = {
    videoVideoId_GET,
    chatVideoId_GET
};