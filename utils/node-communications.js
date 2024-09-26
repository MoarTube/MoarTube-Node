const axios = require('axios').default;

const { getNodeSettings } = require('./helpers');

function node_getInformation() {
    return new Promise(function(resolve, reject) {
        const localhostBaseUrl = getLocalhostBaseUrl();

        axios.get(localhostBaseUrl + '/status/information')
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            resolve({isError: true, message: 'error'});
        });
    });
}

function node_getCryptoWalletAddresses() {
    return new Promise(function(resolve, reject) {
        const localhostBaseUrl = getLocalhostBaseUrl();

        axios.get(localhostBaseUrl + '/monetization/walletAddress/all')
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            resolve({isError: true, message: 'error'});
        });
    });
}

function node_getVideosTags() {
    return new Promise(function(resolve, reject) {
        const localhostBaseUrl = getLocalhostBaseUrl();

        axios.get(localhostBaseUrl + '/videos/tags')
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            resolve({isError: true, message: 'error'});
        });
    });
}

function node_getChannelSearch(searchTerm, sortTerm, tagTerm) {
    return new Promise(function(resolve, reject) {
        const localhostBaseUrl = getLocalhostBaseUrl();

        axios.get(localhostBaseUrl + '/node/search', {
            params: {
                searchTerm: searchTerm,
                sortTerm: sortTerm,
                tagTerm: tagTerm
            }
          })
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            resolve({isError: true, message: 'error'});
        });
    });
}

function node_getVideo(videoId) {
    return new Promise(function(resolve, reject) {
        const localhostBaseUrl = getLocalhostBaseUrl();

        axios.get(localhostBaseUrl + '/videos/' + videoId + '/watch')
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            resolve({isError: true, message: 'error'});
        });
    });
}

function node_getComments(videoId, timestamp, type, sort) {
    return new Promise(function(resolve, reject) {
        const localhostBaseUrl = getLocalhostBaseUrl();

        axios.get(localhostBaseUrl + '/videos/' + videoId + '/comments', {
            params: {
                timestamp: timestamp, 
                type: type,
                sort: sort
            }
        })
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            resolve({isError: true, message: 'error'});
        });
    });
}

function node_getRecommendedVideos() {
    return new Promise(function(resolve, reject) {
        const localhostBaseUrl = getLocalhostBaseUrl();

        axios.get(localhostBaseUrl + '/videos/recommended')
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            resolve({isError: true, message: 'error'});
        });
    });
}

function getLocalhostBaseUrl() {
    const nodeSettings = getNodeSettings();

    const nodeListeningPort = nodeSettings.nodeListeningPort;
    const isSecure = nodeSettings.isSecure;

    const protocol = isSecure ? 'https' : 'http';

    const localhostBaseUrl = protocol + '://localhost:' + nodeListeningPort;

    return localhostBaseUrl;
}

module.exports = {
    node_getInformation,
    node_getCryptoWalletAddresses,
    node_getVideosTags,
    node_getChannelSearch,
    node_getVideo,
    node_getComments,
    node_getRecommendedVideos
};