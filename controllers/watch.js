const { isVideoIdValid } = require('../utils/validators');
const { information_GET } = require('../controllers/status');
const { socialMediaAll_GET } = require('../controllers/socials');
const { walletAddressAll_GET } = require('../controllers/monetization');
const { videoIdWatch_GET, recommended_GET, videoIdComments_GET} = require('../controllers/videos');

function root_GET(videoId) {
    return new Promise(async function(resolve, reject) {
        if(isVideoIdValid(videoId, false)) {
            const informationData = await information_GET();
            const socialMediasData = await socialMediaAll_GET();
            const cryptoWalletAddressesData = await walletAddressAll_GET();
            const videoData = await videoIdWatch_GET(videoId);
            const recommendedVideosData = await recommended_GET();
            const commentsData = await videoIdComments_GET(videoId, 'before', 'ascending', Date.now());

            if(informationData.isError) {
                resolve({isError: true, message: 'error retrieving node information data'});
            }
            else if(socialMediasData.isError) {
                resolve({isError: true, message: 'error retrieving social media data'});
            }
            else if(cryptoWalletAddressesData.isError) {
                resolve({isError: true, message: 'error retrieving crypto wallet address data'});
            }
            else if(videoData.isError) {
                resolve({isError: true, message: 'error retrieving node video data'});
            }
            else if(recommendedVideosData.isError) {
                resolve({isError: true, message: 'error retrieving node recommended videos data'});
            }
            else if(commentsData.isError) {
                resolve({isError: true, message: 'error retrieving node comments data'});
            }
            else {
                resolve({
                    informationData: informationData,
                    socialMediasData: socialMediasData,
                    cryptoWalletAddressesData: cryptoWalletAddressesData, 
                    videoData: videoData, 
                    recommendedVideosData: recommendedVideosData, 
                    commentsData: commentsData
                });
            }
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

module.exports = {
    root_GET
};