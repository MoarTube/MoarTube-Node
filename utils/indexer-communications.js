const axios = require('axios').default;

const { getMoarTubeIndexerUrl } = require('./urls');

async function indexer_addVideoToIndex(data) {
    const response = await axios.post(getMoarTubeIndexerUrl() + '/index/video/add', data);

    return response.data;
}

async function indexer_removeVideoFromIndex(data) {
    const response = await axios.post(getMoarTubeIndexerUrl() + '/index/video/remove', data);
    
    return response.data;
}

async function indexer_doIndexUpdate(data) {
    const response = await axios.post(getMoarTubeIndexerUrl() + '/index/video/update', data);

    return response.data;
}

async function indexer_doNodePersonalizeNodeNameUpdate(moarTubeTokenProof, nodeName) {
    const data = { 
        nodeName: nodeName, 
        moarTubeTokenProof: moarTubeTokenProof 
    };

    const response = await axios.post(getMoarTubeIndexerUrl() + '/index/node/personalize/nodeName', data);

    return response.data;
}

async function indexer_doNodePersonalizeNodeAboutUpdate(moarTubeTokenProof, nodeAbout) {
    const data = { 
        nodeAbout: nodeAbout, 
        moarTubeTokenProof: moarTubeTokenProof 
    };

    const response = await axios.post(getMoarTubeIndexerUrl() + '/index/node/personalize/nodeAbout', data);

    return response.data;
}

async function indexer_doNodePersonalizeNodeIdUpdate(moarTubeTokenProof, nodeId) {
    const data = { 
        nodeId: nodeId, 
        moarTubeTokenProof: moarTubeTokenProof 
    };

    const response = await axios.post(getMoarTubeIndexerUrl() + '/index/node/personalize/nodeId', data);

    return response.data;
}

async function indexer_doNodeExternalNetworkUpdate(moarTubeTokenProof, publicNodeProtocol, publicNodeAddress, publicNodePort) {
    const data = {
        publicNodeProtocol: publicNodeProtocol,
        publicNodeAddress: publicNodeAddress,
        publicNodePort: publicNodePort,
        moarTubeTokenProof: moarTubeTokenProof
    };

    const response = await axios.post(getMoarTubeIndexerUrl() + '/index/node/network/update', data);

    return response.data;
}

async function indexer_getNodeIdentification() {
    const response = await axios.get(getMoarTubeIndexerUrl() + '/node/identification');

	return response.data;
}

async function indexer_doNodeIdentificationRefresh(moarTubeTokenProof) {
    const data = {
        params: {
            moarTubeTokenProof: moarTubeTokenProof
        }
    };

    const response = await axios.get(getMoarTubeIndexerUrl() + '/node/identification/refresh', data);

	return response.data;
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