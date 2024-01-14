var liveStreamManifestTracker = {};

function updateLiveStreamManifestTracker(dynamicManifestFilePath, dynamicManifest, dynamicMasterManifestFilePath, dynamicMasterManifest) {
    liveStreamManifestTracker[dynamicManifestFilePath] = dynamicManifest;
    liveStreamManifestTracker[dynamicMasterManifestFilePath] = dynamicMasterManifest;
}

function getLiveStreamManifest(manifestPath) {
    return liveStreamManifestTracker[manifestPath];
}

module.exports = {
    updateLiveStreamManifestTracker,
    getLiveStreamManifest
}