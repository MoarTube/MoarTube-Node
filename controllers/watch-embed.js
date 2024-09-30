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

function chatVideoId_GET(videoId) {
    if(isVideoIdValid(videoId, false)) {
        return {videoId: videoId};
    }
    else {
        return null;
    }
}

module.exports = {
    videoVideoId_GET,
    chatVideoId_GET
};