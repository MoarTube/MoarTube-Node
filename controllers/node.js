const { getNodeSettings } = require('../utils/helpers');
const { isSearchTermValid, isSortTermValid, isTagTermValid } = require('../utils/validators');
const { performDatabaseReadJob_GET, performDatabaseReadJob_ALL } = require('../utils/database');
const { node_getInformation, node_getVideosTags, node_getChannelSearch } = require('../utils/node-communications');

async function root_GET(req, res) {
    var searchTerm = req.query.se;
    var sortTerm = req.query.so;
    var tagTerm = req.query.ta;

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
        var query;
        var params;

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
            var rowsToSend = [];
            
            if(tagTerm.length === 0) {
                const tagLimit = 4;

                rows.forEach(function(row) {
                    const tagsArray = row.tags.split(',');
                    
                    var addRow = false;
                    
                    for (var tag of tagsArray) {
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

function information_GET(req, res) {
    performDatabaseReadJob_GET('SELECT COUNT(*) AS videoCount FROM videos WHERE (is_published = 1 OR is_live = 1)', [])
    .then(row => {
        if(row != null) {
            const nodeVideoCount = row.videoCount;

            const nodeSettings = getNodeSettings();
            
            const nodeId = nodeSettings.nodeId;
            const nodeName = nodeSettings.nodeName;
            const nodeAbout = nodeSettings.nodeAbout;
            const publicNodeProtocol = nodeSettings.publicNodeProtocol;
            const publicNodeAddress = nodeSettings.publicNodeAddress;
            const publicNodePort = nodeSettings.publicNodePort;

            const information = {
                nodeVideoCount: nodeVideoCount,
                nodeId: nodeId, 
                nodeName: nodeName, 
                nodeAbout: nodeAbout, 
                publicNodeProtocol: publicNodeProtocol, 
                publicNodeAddress: publicNodeAddress, 
                publicNodePort: publicNodePort
            };
            
            res.send({isError: false, information: information});
        }
        else {
            res.send({isError: true, message: 'error communicating with the MoarTube node'});
        }
    })
    .catch(error => {
        res.send({isError: true, message: 'error communicating with the MoarTube node'});
    });
}

function heartbeat_GET(req, res) {
    res.send({isError: false, timestamp: Date.now()});
}

module.exports = {
    root_GET,
    search_GET,
    information_GET,
    heartbeat_GET
};