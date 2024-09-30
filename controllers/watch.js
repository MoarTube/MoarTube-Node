const { isVideoIdValid } = require('../utils/validators');
const { information_GET } = require('../controllers/status');
const { socialmediaAll_GET } = require('../controllers/socials');
const { walletAddressAll_GET } = require('../controllers/monetization');
const { videoIdWatch_GET, recommended_GET, videoIdComments_GET} = require('../controllers/videos');

async function root_GET(req, res) {
    const videoId = req.query.v;
    
    if(isVideoIdValid(videoId, false)) {
        const informationData = await information_GET();
        const socialMediasData = await socialmediaAll_GET();
        const cryptoWalletAddressesData = await walletAddressAll_GET();
        const videoData = await videoIdWatch_GET(videoId);
        const recommendedVideosData = await recommended_GET();
        const commentsData = await videoIdComments_GET(videoId, 'before', 'ascending', Date.now());

        if(informationData.isError) {
            res.send({isError: true, message: 'error retrieving node information data'});
        }
        else if(cryptoWalletAddressesData.isError) {
            res.send({isError: true, message: 'error retrieving crypto wallet address data'});
        }
        else if(videoData.isError) {
            res.send({isError: true, message: 'error retrieving node video data'});
        }
        else if(recommendedVideosData.isError) {
            res.send({isError: true, message: 'error retrieving node recommended videos data'});
        }
        else if(commentsData.isError) {
            res.send({isError: true, message: 'error retrieving node comments data'});
        }
        else {
            const adaptiveSources = videoData.video.adaptiveSources;
            const progressiveSources = videoData.video.progressiveSources;
            const isPublished = videoData.video.isPublished;
            const isStreaming = videoData.video.isStreaming;
            const isStreamed = videoData.video.isStreamed;

            if((adaptiveSources.length === 0 && progressiveSources.length === 0) || (!isPublished && !isStreaming)) {
                if(isStreamed) {
                    res.set('Cache-Control', 'public, s-maxage=86400');
                }
                else {
                    res.set('Cache-Control', 'no-store');
                }
            }
            else {
                res.set('Cache-Control', 'public, s-maxage=86400');
            }

            res.render('watch', {
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
        res.send({isError: true, message: 'invalid parameters'});
    }
}

module.exports = {
    root_GET
};