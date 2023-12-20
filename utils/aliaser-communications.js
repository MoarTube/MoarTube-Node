const axios = require('axios');

const { getMoarTubeAliaserUrl } = require('./helpers');

function aliaser_getVideoAlias(videoId, nodeIdentifier, nodeIdentifierProof) {
    return new Promise(function(resolve, reject) {
        axios.get(getMoarTubeAliaserUrl() + '/alias/video', {
          params: {
              videoId: videoId,
              nodeIdentifier: nodeIdentifier,
              nodeIdentifierProof: nodeIdentifierProof
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

function aliaser_doAliasVideo(data) {
    return new Promise(function(resolve, reject) {
        axios.post(getMoarTubeAliaserUrl() + '/alias/video', data)
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            resolve({isError: true, message: 'error'});
        });
    });
}

function aliaser_getCaptcha(nodeIdentifier, nodeIdentifierProof) {
    return new Promise(function(resolve, reject) {
        axios.get(MOARTUBE_ALIASER_HTTP_PROTOCOL + '://' + MOARTUBE_ALIASER_IP + ':' + MOARTUBE_ALIASER_PORT + '/captcha', {
          params: {
              nodeIdentifier: nodeIdentifier,
              nodeIdentifierProof: nodeIdentifierProof
          },
          responseType: 'stream'
        })
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack, true);

            resolve({isError: true, message: 'error'});
        });
    });
}

module.exports = {
    aliaser_getVideoAlias,
    aliaser_doAliasVideo,
    aliaser_getCaptcha
}