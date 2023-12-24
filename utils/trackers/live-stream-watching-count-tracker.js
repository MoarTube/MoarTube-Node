var liveStreamWatchingCountTracker = {};

function getLiveStreamWatchingCountTracker() {
    return liveStreamWatchingCountTracker;

}

function updateLiveStreamWatchingCountForWorker(workerId, liveStreamWatchingCounts) {
    liveStreamWatchingCountTracker[workerId] = liveStreamWatchingCounts;
}

module.exports = {
    getLiveStreamWatchingCountTracker,
    updateLiveStreamWatchingCountForWorker
}