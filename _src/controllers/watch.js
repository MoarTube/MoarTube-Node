const { 
    isVideoIdValid 
} = require('../utils/validators');
const { 
    getExternalVideosBaseUrl, getExternalResourcesBaseUrl 
} = require('../utils/helpers');
const { 
    information_GET 
} = require('../controllers/status');
const { 
    linksAll_GET 
} = require('./links');
const { 
    walletAddressAll_GET 
} = require('../controllers/monetization');
const { 
    videoIdWatch_GET, recommended_GET, videoIdComments_GET 
} = require('../controllers/videos');

async function root_GET(videoId) {
    if (isVideoIdValid(videoId, false)) {
        const informationData = await information_GET();
        const linksData = await linksAll_GET();
        const cryptoWalletAddressesData = await walletAddressAll_GET();
        const videoData = await videoIdWatch_GET(videoId);
        const recommendedVideosData = await recommended_GET();
        const commentsData = await videoIdComments_GET(videoId, 'before', 'ascending', Date.now());
        const externalVideosBaseUrl = getExternalVideosBaseUrl();
        const externalResourcesBaseUrl = getExternalResourcesBaseUrl();

        if (informationData.isError) {
            throw new Error('error retrieving node information data');
        }
        else if (linksData.isError) {
            throw new Error('error retrieving links data');
        }
        else if (cryptoWalletAddressesData.isError) {
            throw new Error('error retrieving crypto wallet address data');
        }
        else if (videoData.isError) {
            throw new Error('error retrieving node video data');
        }
        else if (recommendedVideosData.isError) {
            throw new Error('error retrieving node recommended videos data');
        }
        else if (commentsData.isError) {
            throw new Error('error retrieving node comments data');
        }
        else {
            return {
                informationData: informationData,
                linksData: linksData,
                cryptoWalletAddressesData: cryptoWalletAddressesData,
                videoData: videoData,
                recommendedVideosData: recommendedVideosData,
                commentsData: commentsData,
                externalVideosBaseUrl: externalVideosBaseUrl,
                externalResourcesBaseUrl: externalResourcesBaseUrl
            };
        }
    }
    else {
        throw new Error('invalid parameters');
    }
}

module.exports = {
    root_GET
};