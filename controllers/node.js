const {
    getLastCheckedContentTracker, setLastCheckedContentTracker, getExternalVideosBaseUrl, getExternalResourcesBaseUrl
} = require('../utils/helpers');
const {
    isSearchTermValid, isSortTermValid, isTagTermValid
} = require('../utils/validators');
const {
    performDatabaseReadJob_ALL, performDatabaseReadJob_GET
} = require('../utils/database');
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
    tags_GET
} = require('../controllers/videos');

async function root_GET(searchTerm, sortTerm, tagTerm) {
    if (!isSearchTermValid(searchTerm)) {
        searchTerm = '';
    }

    if (!isSortTermValid(sortTerm)) {
        sortTerm = 'latest';
    }

    if (!isTagTermValid(tagTerm, true)) {
        tagTerm = '';
    }

    const informationData = await information_GET();
    const linksData = await linksAll_GET();
    const cryptoWalletAddressesData = await walletAddressAll_GET();
    const tagsData = await tags_GET();
    const searchResultsData = await search_GET(searchTerm, sortTerm, tagTerm);
    const externalVideosBaseUrl = getExternalVideosBaseUrl();
    const externalResourcesBaseUrl = getExternalResourcesBaseUrl();

    return {
        informationData: informationData,
        linksData: linksData,
        cryptoWalletAddressesData: cryptoWalletAddressesData,
        tagsData: tagsData,
        searchResultsData: searchResultsData,
        externalVideosBaseUrl: externalVideosBaseUrl,
        externalResourcesBaseUrl: externalResourcesBaseUrl
    };
}

async function search_GET(searchTerm, sortTerm, tagTerm) {
    if (isSearchTermValid(searchTerm) && isSortTermValid(sortTerm) && isTagTermValid(tagTerm, true)) {
        let query;
        let params;

        if (searchTerm.length === 0) {
            query = 'SELECT * FROM videos WHERE (is_published = ? OR is_live = ?)';
            params = [true, true];
        }
        else {
            query = 'SELECT * FROM videos WHERE (is_published = ? OR is_live = ?) AND title LIKE ?';
            params = [true, true, '%' + searchTerm + '%'];
        }

        const videos = await performDatabaseReadJob_ALL(query, params);

        if (sortTerm === 'latest') {
            videos.sort(function compareByTimestampDescending(a, b) {
                return b.creation_timestamp - a.creation_timestamp;
            });
        }
        else if (sortTerm === 'popular') {
            videos.sort(function compareByTimestampDescending(a, b) {
                return b.views - a.views;
            });
        }
        else if (sortTerm === 'oldest') {
            videos.sort(function compareByTimestampDescending(a, b) {
                return a.creation_timestamp - b.creation_timestamp;
            });
        }

        const tagLimitCounter = {};
        const searchResults = [];

        if (tagTerm.length === 0) {
            const tagLimit = 4;

            for (const video of videos) {
                const tagsArray = video.tags.split(',');

                let addVideo = false;

                for (let tag of tagsArray) {
                    if (!tagLimitCounter.hasOwnProperty(tag)) {
                        tagLimitCounter[tag] = 0;
                    }

                    if (tagLimitCounter[tag] < tagLimit) {
                        tagLimitCounter[tag]++;
                        addVideo = true;
                        break;
                    }
                }

                if (addVideo) {
                    searchResults.push(video);
                }
            }
        }
        else {
            for (const video of videos) {
                const tagsArray = video.tags.split(',');

                if (tagsArray.includes(tagTerm) && !searchResults.includes(video)) {
                    searchResults.push(video);
                }
            }
        }

        return { isError: false, searchResults: searchResults };
    }
    else {
        throw new Error('invalid parameters');
    }
}

async function newContentCounts_GET() {
    const lastCheckedContentTracker = getLastCheckedContentTracker();

    const lastCheckedCommentsTimestamp = lastCheckedContentTracker.lastCheckedCommentsTimestamp;
    const lastCheckedVideoReportsTimestamp = lastCheckedContentTracker.lastCheckedVideoReportsTimestamp;
    const lastCheckedCommentReportsTimestamp = lastCheckedContentTracker.lastCheckedCommentReportsTimestamp;

    try {
        const newCommentsCount = (await performDatabaseReadJob_GET('SELECT COUNT(*) AS "newCommentsCount" FROM comments WHERE timestamp > ?', [lastCheckedCommentsTimestamp])).newCommentsCount;
        const newVideoReportsCount = (await performDatabaseReadJob_GET('SELECT COUNT(*) AS "newVideoReportsCount" FROM videoreports WHERE timestamp > ?', [lastCheckedVideoReportsTimestamp])).newVideoReportsCount;
        const newCommentReportsCount = (await performDatabaseReadJob_GET('SELECT COUNT(*) AS "newCommentReportsCount" FROM commentreports WHERE timestamp > ?', [lastCheckedCommentReportsTimestamp])).newCommentReportsCount;

        return { isError: false, newContentCounts: { newCommentsCount: newCommentsCount, newVideoReportsCount: newVideoReportsCount, newCommentReportsCount: newCommentReportsCount } };
    }
    catch (error) {
        throw error;
    }
}

function contentChecked_POST(contentType) {
    const lastCheckedContentTracker = getLastCheckedContentTracker();

    const timestamp = Date.now();

    if (contentType === 'comments') {
        lastCheckedContentTracker.lastCheckedCommentsTimestamp = timestamp;
    }
    else if (contentType === 'videoReports') {
        lastCheckedContentTracker.lastCheckedVideoReportsTimestamp = timestamp;
    }
    else if (contentType === 'commentReports') {
        lastCheckedContentTracker.lastCheckedCommentReportsTimestamp = timestamp;
    }

    setLastCheckedContentTracker(lastCheckedContentTracker);

    return { isError: false };
}

module.exports = {
    root_GET,
    search_GET,
    newContentCounts_GET,
    contentChecked_POST
};