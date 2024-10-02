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
            logDebugMessageToConsole(null, error, new Error().stack);

            if(error.response.status === 413) {
                const kilobytes = Math.ceil(error.request._contentLength / 1024);

                resolve({isError: true, message: `your request size (<b>${kilobytes}kb</b>) exceeds the maximum allowed size (<b>1mb</b>)<br>try using smaller node and video images`});
            }
            else {
                resolve({isError: true, message: 'an error occurred while adding to the MoarTube Indexer'});
            }
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
            logDebugMessageToConsole(null, error, new Error().stack);

            resolve({isError: true, message: 'an error occurred while removing from the MoarTube Indexer'});
        });
    });
}

function indexer_doIndexUpdate(data) {
	return new Promise(function(resolve, reject) {
		axios.post(getMoarTubeIndexerUrl() + '/index/video/update', data)
		.then(response => {
			const data = response.data;
			
			resolve(data);
		})
		.catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack);

            if(error.response.status === 413) {
                const kilobytes = Math.ceil(error.request._contentLength / 1024);

                resolve({isError: true, message: `your request size (<b>${kilobytes}kb</b>) exceeds the maximum allowed size (<b>1mb</b>)<br>try using smaller node and video images`});
            }
            else {
                resolve({isError: true, message: 'an error occurred while updating the MoarTube Indexer'});
            }
		});
	});
}

function indexer_doNodePersonalizeNodeNameUpdate(moarTubeTokenProof, nodeName) {
    return new Promise(function(resolve, reject) {
        axios.post(getMoarTubeIndexerUrl() + '/index/node/personalize/nodeName', {
            nodeName: nodeName,
            moarTubeTokenProof: moarTubeTokenProof
        })
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack);

            resolve({isError: true, message: 'an error occurred while updating the personalize settings'});
        });
    });
}

function indexer_doNodePersonalizeNodeAboutUpdate(moarTubeTokenProof, nodeAbout) {
    return new Promise(function(resolve, reject) {
        axios.post(getMoarTubeIndexerUrl() + '/index/node/personalize/nodeAbout', {
            nodeAbout: nodeAbout,
            moarTubeTokenProof: moarTubeTokenProof
        })
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack);

            resolve({isError: true, message: 'an error occurred while updating the personalize settings'});
        });
    });
}

function indexer_doNodePersonalizeNodeIdUpdate(moarTubeTokenProof, nodeId) {
    return new Promise(function(resolve, reject) {
        axios.post(getMoarTubeIndexerUrl() + '/index/node/personalize/nodeId', {
            nodeId: nodeId,
            moarTubeTokenProof: moarTubeTokenProof
        })
        .then(response => {
            const data = response.data;
            
            resolve(data);
        })
        .catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack);

            resolve({isError: true, message: 'an error occurred while updating the personalize settings'});
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
            logDebugMessageToConsole(null, error, new Error().stack);

            resolve({isError: true, message: 'an error occurred while updating the network settings'});
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
			logDebugMessageToConsole(null, error, new Error().stack);

            resolve({isError: true, message: 'an error occurred while identifying the node with the MoarTube Indexer'});
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
            logDebugMessageToConsole(null, error, new Error().stack);

			resolve({isError: true, message: 'an error occurred while refreshing the node with the MoarTube Indexer'});
		});
	});
}

module.exports = {
    indexer_addVideoToIndex,
    indexer_removeVideoFromIndex,
    indexer_doNodePersonalizeNodeNameUpdate,
    indexer_doNodePersonalizeNodeAboutUpdate,
    indexer_doNodePersonalizeNodeIdUpdate,
    indexer_doNodeExternalNetworkUpdate,
    indexer_getNodeIdentification,
    indexer_doNodeIdentificationRefresh,
    indexer_doIndexUpdate
}