const { logDebugMessageToConsole } = require('../utils/logger');
const { isSearchTermValid, isSortTermValid, isTagTermValid } = require('../utils/validators');
const { performDatabaseReadJob_ALL } = require('../utils/database');

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

module.exports = {
    search_GET
}