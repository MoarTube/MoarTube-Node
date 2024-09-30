const { isVideoIdValid } = require('../utils/validators');
const { videoIdWatch_GET } = require('../controllers/videos');

async function videoVideoId_GET(videoId) {
    if(isVideoIdValid(videoId, false)) {
        const videoData = await videoIdWatch_GET(videoId);

        return {videoData: videoData};
    }
    else {
        return {};
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