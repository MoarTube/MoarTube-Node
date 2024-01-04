const axios = require('axios').default;

function node_getInformation() {
    return new Promise(function(resolve, reject) {
        axios.get('/node/information')
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
        axios.get('/videos/tags')
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
        axios.get('/node/search', {
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
        axios.get('/videos/' + videoId + '/watch')
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            resolve({isError: true, message: 'error'});
        });
    });
}

function node_getComments(videoId, timestamp, type) {
    return new Promise(function(resolve, reject) {
        axios.get('/videos/' + videoId + '/comments', {
            params: {
                timestamp: timestamp, 
                type: type
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

function node_getAvailableVideos() {
    return new Promise(function(resolve, reject) {
        axios.get('/videos/available')
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            resolve({isError: true, message: 'error'});
        });
    });
}

function node_getVideoSegment(segmentFileUrl) {
    return new Promise(function(resolve, reject) {
        axios.get(segmentFileUrl)
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            resolve({isError: true, message: 'error'});
        });
    });
}

module.exports = {
    node_getInformation,
    node_getVideosTags,
    node_getChannelSearch,
    node_getVideo,
    node_getComments,
    node_getAvailableVideos,
    node_getVideoSegment
};