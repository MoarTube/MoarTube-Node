const { isVideoIdValid } = require('../utils/validators');
const { videoIdWatch_GET } = require('../controllers/videos');
const { getExternalVideosBaseUrl, getExternalResourcesBaseUrl } = require('../utils/helpers');

async function videoVideoId_GET(videoId) {
    if (isVideoIdValid(videoId, false)) {
        const videoData = await videoIdWatch_GET(videoId);
        const externalVideosBaseUrl = getExternalVideosBaseUrl();
        const externalResourcesBaseUrl = getExternalResourcesBaseUrl();

        return { videoData: videoData, externalVideosBaseUrl: externalVideosBaseUrl, externalResourcesBaseUrl: externalResourcesBaseUrl };
    }
    else {
        return {};
    }
}

function chatVideoId_GET(videoId) {
    if (isVideoIdValid(videoId, false)) {
        const externalResourcesBaseUrl = getExternalResourcesBaseUrl();

        return { videoId: videoId, externalResourcesBaseUrl: externalResourcesBaseUrl };
    }
    else {
        return null;
    }
}

module.exports = {
    videoVideoId_GET,
    chatVideoId_GET
};