const { isVideoIdValid } = require('../utils/validators');
const { node_getInformation, node_getSocialMedias, node_getCryptoWalletAddresses, node_getVideo, node_getComments, node_getRecommendedVideos } = require('../utils/node-communications');

async function root_GET(req, res) {
    const videoId = req.query.v;
    
    if(isVideoIdValid(videoId, false)) {
        const informationData = await node_getInformation();
        const socialMediasData = await node_getSocialMedias();
        const cryptoWalletAddressesData = await node_getCryptoWalletAddresses();
        const videoData = await node_getVideo(videoId);
        const recommendedVideosData = await node_getRecommendedVideos();
        const commentsData = await node_getComments(videoId, Date.now(), 'before', 'ascending');

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