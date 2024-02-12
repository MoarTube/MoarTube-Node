const { logDebugMessageToConsole, getLastCheckedContentTracker, setLastCheckedContentTracker, getAuthenticationStatus } = require('../utils/helpers');
const { isSearchTermValid, isSortTermValid, isTagTermValid } = require('../utils/validators');
const { performDatabaseReadJob_ALL, performDatabaseReadJob_GET } = require('../utils/database');
const { node_getInformation, node_getVideosTags, node_getChannelSearch } = require('../utils/node-communications');

async function root_GET(req, res) {
    let searchTerm = req.query.searchTerm;
    let sortTerm = req.query.sortTerm;
    let tagTerm = req.query.tagTerm;

    if(!isSearchTermValid(searchTerm)) {
        searchTerm = '';
    }
    
    if(!isSortTermValid(sortTerm)) {
        sortTerm = 'latest';
    }
    
    if(!isTagTermValid(tagTerm, true)) {
        tagTerm = '';
    }

    const informationData = await node_getInformation();
    const tagsData = await node_getVideosTags();
    const searchResultsData = await node_getChannelSearch(searchTerm, sortTerm, tagTerm);

    res.render('node', {informationData: informationData, tagsData: tagsData, searchResultsData: searchResultsData});
}

function search_GET(req, res) {
    const searchTerm = req.query.searchTerm;
    const sortTerm = req.query.sortTerm;
    const tagTerm = req.query.tagTerm;
    
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
            
            res.send({isError: false, searchResults: rowsToSend});
        })
        .catch(error => {
            res.send({isError: true});
        });
    }
    else {
        res.send({isError: true, message: 'invalid parameters'});
    }
}

async function newContentCounts_GET(req, res) {
    getAuthenticationStatus(req.headers.authorization)
    .then(async (isAuthenticated) => {
        if(isAuthenticated) {
            const lastCheckedContentTracker = getLastCheckedContentTracker();

            const lastCheckedCommentsTimestamp = lastCheckedContentTracker.lastCheckedCommentsTimestamp;
            const lastCheckedVideoReportsTimestamp = lastCheckedContentTracker.lastCheckedVideoReportsTimestamp;
            const lastCheckedCommentReportsTimestamp = lastCheckedContentTracker.lastCheckedCommentReportsTimestamp;

            try {
                const newCommentsCount = (await performDatabaseReadJob_GET('SELECT COUNT(*) AS newCommentsCount FROM comments WHERE timestamp > ?', [lastCheckedCommentsTimestamp])).newCommentsCount;
                const newVideoReportsCount = (await performDatabaseReadJob_GET('SELECT COUNT(*) AS newVideoReportsCount FROM videoReports WHERE timestamp > ?', [lastCheckedVideoReportsTimestamp])).newVideoReportsCount;
                const newCommentReportsCount = (await performDatabaseReadJob_GET('SELECT COUNT(*) AS newCommentReportsCount FROM commentReports WHERE timestamp > ?', [lastCheckedCommentReportsTimestamp])).newCommentReportsCount;

                res.send({isError: false, newContentCounts: {newCommentsCount: newCommentsCount, newVideoReportsCount: newVideoReportsCount, newCommentReportsCount: newCommentReportsCount}});
            }
            catch(error) {
                logDebugMessageToConsole(null, error, new Error().stack, true);

                res.send({isError: true, message: 'error communicating with the MoarTube node'});
            }
        }
        else {
            logDebugMessageToConsole('unauthenticated communication was rejected', null, new Error().stack, true);

            res.send({isError: true, message: 'you are not logged in'});
        }
    })
    .catch(error => {
        logDebugMessageToConsole(null, error, new Error().stack, true);
        
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
}

function contentChecked_POST(req, res) {
    const contentType = req.body.contentType;

    //validate here

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

    res.send({isError: false});
}

module.exports = {
    root_GET,
    search_GET,
    newContentCounts_GET,
    contentChecked_POST
};