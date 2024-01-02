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

module.exports = {
    node_getInformation,
    node_getVideosTags,
    node_getChannelSearch
};