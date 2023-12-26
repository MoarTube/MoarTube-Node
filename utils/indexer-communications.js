const axios = require('axios').default;

const { logDebugMessageToConsole } = require('./logger');
const { getMoarTubeIndexerUrl } = require('./urls');

function indexer_addVideoToIndex(data) {
    return new Promise(function(resolve, reject) {
        axios.post(getMoarTubeIndexerUrl() + '/index/video/add', data)
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            resolve({isError: true, message: 'error'});
        });
    });
}

function indexer_removeVideoFromIndex(data) {
    return new Promise(function(resolve, reject) {
        axios.post(getMoarTubeIndexerUrl() + '/index/video/remove', data)
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            resolve({isError: true, message: 'error'});
        });
    });
}

function indexer_doNodePersonalizeUpdate(moarTubeTokenProof, nodeName, nodeAbout, nodeId) {
    return new Promise(function(resolve, reject) {
        axios.post(getMoarTubeIndexerUrl() + '/index/node/personalize/update', {
            nodeName: nodeName,
            nodeAbout: nodeAbout,
            nodeId: nodeId,
            moarTubeTokenProof: moarTubeTokenProof
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

function indexer_doNodeExternalNetworkUpdate(moarTubeTokenProof, publicNodeProtocol, publicNodeAddress, publicNodePort) {
    return new Promise(function(resolve, reject) {
        axios.post(getMoarTubeIndexerUrl() + '/index/node/network/update', {
            publicNodeProtocol: publicNodeProtocol,
            publicNodeAddress: publicNodeAddress,
            publicNodePort: publicNodePort,
            moarTubeTokenProof: moarTubeTokenProof
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

function indexer_getNodeIdentification() {
	return new Promise(function(resolve, reject) {
		axios.get(getMoarTubeIndexerUrl() + '/node/identification')
		.then(response => {
			const data = response.data;
			
			resolve(data);
		})
		.catch(error => {
			resolve({isError: true, message: 'error'});
		});
	});
}

function indexer_doNodeIdentificationRefresh(moarTubeTokenProof) {
	return new Promise(function(resolve, reject) {
		axios.get(getMoarTubeIndexerUrl() + '/node/identification/refresh', {
		  params: {
            moarTubeTokenProof: moarTubeTokenProof
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

function indexer_doIndexUpdate(moarTubeTokenProof, videoId, title, tags, views, isStreaming, lengthSeconds, nodeIconBase64, videoPreviewImageBase64) {
	return new Promise(function(resolve, reject) {
		axios.post(getMoarTubeIndexerUrl() + '/index/video/update', {
			videoId: videoId,
			title: title,
			tags: tags,
			views: views,
			isStreaming: isStreaming,
			lengthSeconds: lengthSeconds,
			nodeIconBase64: nodeIconBase64,
			videoPreviewImageBase64: videoPreviewImageBase64,
            moarTubeTokenProof: moarTubeTokenProof
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

function indexer_getCaptcha(moarTubeTokenProof) {
    return new Promise(function(resolve, reject) {
        axios.get(getMoarTubeIndexerUrl() + '/captcha', {
          params: {
            moarTubeTokenProof: moarTubeTokenProof
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
    indexer_addVideoToIndex,
    indexer_removeVideoFromIndex,
    indexer_doNodePersonalizeUpdate,
    indexer_doNodeExternalNetworkUpdate,
    indexer_getNodeIdentification,
    indexer_doNodeIdentificationRefresh,
    indexer_doIndexUpdate,
    indexer_getCaptcha
}