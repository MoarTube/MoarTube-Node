const { isVideoIdValid } = require('../utils/validators');
const { node_getInformation, node_getVideo, node_getComments, node_getAvailableVideos } = require('../utils/node-communications');

async function root_GET(req, res) {
    const videoId = req.query.v;
    
    if(isVideoIdValid(videoId)) {
        const informationData = await node_getInformation();
        const videoData = await node_getVideo(videoId);
        const availableVideosData = await node_getAvailableVideos();
        const commentsData = await node_getComments(videoId, Date.now(), 'after', 0, 0);

        res.render('watch', {informationData: informationData, videoData: videoData, availableVideosData: availableVideosData, commentsData: commentsData});
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
}

module.exports = {
    root_GET
};