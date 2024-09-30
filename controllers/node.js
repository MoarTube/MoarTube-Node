const { logDebugMessageToConsole, getLastCheckedContentTracker, setLastCheckedContentTracker, getAuthenticationStatus } = require('../utils/helpers');
const { isSearchTermValid, isSortTermValid, isTagTermValid } = require('../utils/validators');
const { performDatabaseReadJob_ALL, performDatabaseReadJob_GET } = require('../utils/database');
const { information_GET } = require('../controllers/status');
const { linksAll_GET } = require('./links');
const { walletAddressAll_GET } = require('../controllers/monetization');
const { tags_GET } = require('../controllers/videos');

async function root_GET(searchTerm, sortTerm, tagTerm) {
    if(!isSearchTermValid(searchTerm)) {
        searchTerm = '';
    }
    
    if(!isSortTermValid(sortTerm)) {
        sortTerm = 'latest';
    }
    
    if(!isTagTermValid(tagTerm, true)) {
        tagTerm = '';
    }

    const informationData = await information_GET();
    const linksData = await linksAll_GET();
    const cryptoWalletAddressesData = await walletAddressAll_GET();
    const tagsData = await tags_GET();
    const searchResultsData = await search_GET(searchTerm, sortTerm, tagTerm);

    return {informationData: informationData, linksData: linksData, cryptoWalletAddressesData: cryptoWalletAddressesData, tagsData: tagsData, searchResultsData: searchResultsData};
}

function search_GET(searchTerm, sortTerm, tagTerm) {
    return new Promise(function(resolve, reject) {
        if(isSearchTermValid(searchTerm) && isSortTermValid(sortTerm) && isTagTermValid(tagTerm, true)) {
            let query;
            let params;

            if(searchTerm.length === 0) {
                query = 'SELECT * FROM videos WHERE (is_published = 1 OR is_live = 1)';
                params = [];
            }
            else {
                query = 'SELECT * FROM videos WHERE (is_published = 1 OR is_live = 1) AND title LIKE ?';
                params = ['%' + searchTerm + '%'];
            }

            performDatabaseReadJob_ALL(query, params)
            .then(rows => {
                if(sortTerm === 'latest') {
                    rows.sort(function compareByTimestampDescending(a, b) {
                        return b.creation_timestamp - a.creation_timestamp;
                    });
                }
                else if(sortTerm === 'popular') {
                    rows.sort(function compareByTimestampDescending(a, b) {
                        return b.views - a.views;
                    });
                }
                else if(sortTerm === 'oldest') {
                    rows.sort(function compareByTimestampDescending(a, b) {
                        return a.creation_timestamp - b.creation_timestamp;
                    });
                }
                
                const tagLimitCounter = {};
                let rowsToSend = [];
                
                if(tagTerm.length === 0) {
                    const tagLimit = 4;

                    rows.forEach(function(row) {
                        const tagsArray = row.tags.split(',');
                        
                        let addRow = false;
                        
                        for (let tag of tagsArray) {
                            if(!tagLimitCounter.hasOwnProperty(tag)) {
                                tagLimitCounter[tag] = 0;
                            }
                            
                            if(tagLimitCounter[tag] < tagLimit) {
                                tagLimitCounter[tag]++;
                                addRow = true;
                                break;
                            }
                        }
                        
                        if(addRow) {
                            rowsToSend.push(row);
                        }
                    });
                }
                else {
                    rows.forEach(function(row) {
                        const tagsArray = row.tags.split(',');

                        if(tagsArray.includes(tagTerm) && !rowsToSend.includes(row)) {
                            rowsToSend.push(row);
                        }
                    });
                }
                
                resolve({isError: false, searchResults: rowsToSend});
            })
            .catch(error => {
                resolve({isError: true});
            });
        }
        else {
            resolve({isError: true, message: 'invalid parameters'});
        }
    });
}

async function newContentCounts_GET() {
    const lastCheckedContentTracker = getLastCheckedContentTracker();

    const lastCheckedCommentsTimestamp = lastCheckedContentTracker.lastCheckedCommentsTimestamp;
    const lastCheckedVideoReportsTimestamp = lastCheckedContentTracker.lastCheckedVideoReportsTimestamp;
    const lastCheckedCommentReportsTimestamp = lastCheckedContentTracker.lastCheckedCommentReportsTimestamp;

    try {
        const newCommentsCount = (await performDatabaseReadJob_GET('SELECT COUNT(*) AS newCommentsCount FROM comments WHERE timestamp > ?', [lastCheckedCommentsTimestamp])).newCommentsCount;
        const newVideoReportsCount = (await performDatabaseReadJob_GET('SELECT COUNT(*) AS newVideoReportsCount FROM videoReports WHERE timestamp > ?', [lastCheckedVideoReportsTimestamp])).newVideoReportsCount;
        const newCommentReportsCount = (await performDatabaseReadJob_GET('SELECT COUNT(*) AS newCommentReportsCount FROM commentReports WHERE timestamp > ?', [lastCheckedCommentReportsTimestamp])).newCommentReportsCount;

        return {isError: false, newContentCounts: {newCommentsCount: newCommentsCount, newVideoReportsCount: newVideoReportsCount, newCommentReportsCount: newCommentReportsCount}};
    }
    catch(error) {
        logDebugMessageToConsole(null, error, new Error().stack, true);

        return {isError: true, message: 'error communicating with the MoarTube node'};
    }
}

function contentChecked_POST(contentType) {
    const lastCheckedContentTracker = getLastCheckedContentTracker();

    const timestamp = Date.now();

    if(contentType === 'comments') {
        lastCheckedContentTracker.lastCheckedCommentsTimestamp = timestamp;
    }
    else if(contentType === 'videoReports') {
        lastCheckedContentTracker.lastCheckedVideoReportsTimestamp = timestamp;
    }
    else if(contentType === 'commentReports') {
        lastCheckedContentTracker.lastCheckedCommentReportsTimestamp = timestamp;
    }

    setLastCheckedContentTracker(lastCheckedContentTracker);

    return {isError: false};
}

module.exports = {
    root_GET,
    search_GET,
    newContentCounts_GET,
    contentChecked_POST
};