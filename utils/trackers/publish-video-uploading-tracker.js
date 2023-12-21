const publishVideoUploadingTracker = {};

function addToPublishVideoUploadingTracker(videoId) {
    if(!publishVideoUploadingTracker.hasOwnProperty(videoId)) {
        publishVideoUploadingTracker[videoId] = {uploadRequests: [], stopping: false};
    }
}

function addToPublishVideoUploadingTrackerUploadRequests(videoId, req) {
    if(publishVideoUploadingTracker.hasOwnProperty(videoId)) {
        publishVideoUploadingTracker[videoId].uploadRequests.push(req);
    }
}

function stoppingPublishVideoUploading(videoId) {
    if(publishVideoUploadingTracker.hasOwnProperty(videoId)) {
        publishVideoUploadingTracker[videoId].stopping = true;
    }
    
    websocketNodeBroadcast(parsedMessage);
}

function stoppedPublishVideoUploading(videoId) {
    if(publishVideoUploadingTracker.hasOwnProperty(videoId)) {
        const uploadRequests = publishVideoUploadingTracker[videoId].uploadRequests;
        
        uploadRequests.forEach(function(uploadRequest) {
            uploadRequest.destroy();
        });
        
        delete publishVideoUploadingTracker[videoId];
    }
    
    websocketNodeBroadcast(parsedMessage);
}

function isPublishVideoUploading(videoId) {
    if(publishVideoUploadingTracker.hasOwnProperty(videoId)) {
        return publishVideoUploadingTracker[videoId].stopping;
    }
    else {
        throw new Error('video id not found in publish video uploading tracker');
    }
}

module.exports = {
    addToPublishVideoUploadingTracker,
    addToPublishVideoUploadingTrackerUploadRequests,
    stoppingPublishVideoUploading,
    stoppedPublishVideoUploading,
    isPublishVideoUploading
}