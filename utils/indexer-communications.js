const axios = require('axios');

const { getMoarTubeIndexerUrl } = require('./helpers');

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

function indexer_doNodePersonalizeUpdate(nodeIdentifier, nodeIdentifierProof, nodeName, nodeAbout, nodeId) {
    return new Promise(function(resolve, reject) {
        axios.post(getMoarTubeIndexerUrl() + '/index/node/personalize/update', {
            nodeIdentifier: nodeIdentifier,
            nodeIdentifierProof: nodeIdentifierProof,
            nodeName: nodeName,
            nodeAbout: nodeAbout,
            nodeId: nodeId,
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

function indexer_doNodeExternalNetworkUpdate(nodeIdentifier, nodeIdentifierProof, publicNodeProtocol, publicNodeAddress, publicNodePort) {
    return new Promise(function(resolve, reject) {
        axios.post(getMoarTubeIndexerUrl() + '/index/node/network/update', {
            nodeIdentifier: nodeIdentifier,
            nodeIdentifierProof: nodeIdentifierProof,
            publicNodeProtocol: publicNodeProtocol,
            publicNodeAddress: publicNodeAddress,
            publicNodePort: publicNodePort
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

function indexer_doNodeIdentificationRefresh(nodeIdentifier, nodeIdentifierProof) {
	return new Promise(function(resolve, reject) {
		axios.get(getMoarTubeIndexerUrl() + '/node/identification/refresh', {
		  params: {
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

function indexer_doIndexUpdate(nodeIdentifier, nodeIdentifierProof, videoId, title, tags, views, isStreaming, lengthSeconds, nodeIconBase64, videoPreviewImageBase64) {
	return new Promise(function(resolve, reject) {
		axios.post(getMoarTubeIndexerUrl() + '/index/video/update', {
			nodeIdentifier: nodeIdentifier,
			nodeIdentifierProof: nodeIdentifierProof,
			videoId: videoId,
			title: title,
			tags: tags,
			views: views,
			isStreaming: isStreaming,
			lengthSeconds: lengthSeconds,
			nodeIconBase64: nodeIconBase64,
			videoPreviewImageBase64: videoPreviewImageBase64
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

function indexer_getCaptcha(nodeIdentifier, nodeIdentifierProof) {
    return new Promise(function(resolve, reject) {
        axios.get(getMoarTubeIndexerUrl() + '/captcha', {
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
    indexer_addVideoToIndex,
    indexer_removeVideoFromIndex,
    indexer_doNodePersonalizeUpdate,
    indexer_doNodeExternalNetworkUpdate,
    indexer_getNodeIdentification,
    indexer_doNodeIdentificationRefresh,
    indexer_doIndexUpdate,
    indexer_getCaptcha
}