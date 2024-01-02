const path = require('path');
const fs = require('fs');

const { getPagesDirectoryPath } = require('../utils/paths');
const { getNodeSettings } = require('../utils/helpers');
const { isVideoIdValid, isSearchTermValid, isSortTermValid, isTagTermValid } = require('../utils/validators');
const { performDatabaseReadJob_GET } = require('../utils/database');
const { node_getInformation, node_getVideosTags, node_getChannelSearch } = require('../utils/node-communications');

function root_GET(req, res) {
    /*
    const pagePath = path.join(getPagesDirectoryPath(), 'channel.html');
    const fileStream = fs.createReadStream(pagePath);
    res.setHeader('Content-Type', 'text/html');
    fileStream.pipe(res);
    */

    const url = '/home/' + req.originalUrl.substring(req.path.length);
    
    res.redirect(url);
}

async function home_GET(req, res) {
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

    res.render('channel', {informationData: informationData, tagsData: tagsData, searchResultsData: searchResultsData});
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
    home_GET,
    root_GET,
    information_GET,
    heartbeat_GET
};