const axios = require('axios').default;
const { logDebugMessageToConsole } = require('./logger');
const { getNodeSettings } = require('./helpers');

function cloudflare_validate(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey) {
    return new Promise(function(resolve, reject) {
        axios.get('https://api.cloudflare.com/client/v4/zones/' + cloudflareZoneId, {
            headers: {
                'X-Auth-Email': cloudflareEmailAddress,
                'X-Auth-Key': cloudflareGlobalApiKey
            }
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

function cloudflare_purge(files) {
    return new Promise(function(resolve, reject) {
        const nodeSettings = getNodeSettings();

        const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
        const cloudflareZoneId = nodeSettings.cloudflareZoneId;
        const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

        axios.post('https://api.cloudflare.com/client/v4/zones/' + cloudflareZoneId + '/purge_cache', {
            files: files
        }, {
            headers: {
                'X-Auth-Email': cloudflareEmailAddress,
                'X-Auth-Key': cloudflareGlobalApiKey
            }
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

function cloudflare_setDefaultPageRules() {
    return new Promise(async function(resolve, reject) {
        const nodeSettings = getNodeSettings();

        const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
        const cloudflareZoneId = nodeSettings.cloudflareZoneId;
        const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

        try {
            // get all current page rules
            const response = await axios.get(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/pagerules`, {
                headers: {
                    'X-Auth-Email': cloudflareEmailAddress,
                    'X-Auth-Key': cloudflareGlobalApiKey
                }
            });

            if(!response.data.success) {
                throw new Error('Failed to retrieve page rule(s)');
            }

            const pageRules = response.data.result;

            logDebugMessageToConsole('discovered pages rules: ' + JSON.stringify(response.data), null, null, true);

            // delete all current page rules
            for(const pageRule of pageRules) {
                const response = await axios.delete(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/pagerules/${pageRule.id}`, {
                    headers: {
                        'X-Auth-Email': cloudflareEmailAddress,
                        'X-Auth-Key': cloudflareGlobalApiKey
                    }
                });

                if(!response.data.success) {
                    throw new Error('Failed to delete page rule(s)');
                }

                logDebugMessageToConsole('Deleted page rule: ' + JSON.stringify(response.data), null, null, true);
            }

            const newPageRules = [];

            newPageRules.push({
                "status": "active",
                "priority": 1,
                "actions": [
                    {
                        "id": "cache_level",
                        "value": "cache_everything"
                    },
                    {
                        "id": "edge_cache_ttl",
                        "value": 7200
                    }
                ],
                "targets": [
                    {
                        "target": "url",
                        "constraint": {
                            "operator": "matches",
                            "value": "https://*moartube-node-chris.com/node"
                        }
                    }
                ]
            });

            newPageRules.push({
                "status": "active",
                "priority": 2,
                "actions": [
                    {
                        "id": "cache_level",
                        "value": "cache_everything"
                    },
                    {
                        "id": "edge_cache_ttl",
                        "value": 7200
                    }
                ],
                "targets": [
                    {
                        "target": "url",
                        "constraint": {
                            "operator": "matches",
                            "value": "https://*moartube-node-chris.com/watch*"
                        }
                    }
                ]
            });

            newPageRules.push({
                "status": "active",
                "priority": 3,
                "actions": [
                    {
                        "id": "cache_level",
                        "value": "cache_everything"
                    },
                    {
                        "id": "edge_cache_ttl",
                        "value": 7200
                    }
                ],
                "targets": [
                    {
                        "target": "url",
                        "constraint": {
                            "operator": "matches",
                            "value": "https://*moartube-node-chris.com/assets/*"
                        }
                    }
                ]
            });

            // create new page rules
            for(const newPageRule of newPageRules) {
                const response = await axios.post(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/pagerules`, newPageRule, {
                    headers: {
                        'X-Auth-Email': cloudflareEmailAddress,
                        'X-Auth-Key': cloudflareGlobalApiKey
                    }
                });

                if(!response.data.success) {
                    throw new Error('Failed to create new page rule(s)');
                }

                logDebugMessageToConsole('Created page rule: ' + JSON.stringify(response.data), null, null, true);
            }

            resolve({isError: false});
        }
        catch (error) {
            logDebugMessageToConsole(null, error, new Error().stack, true);
            
            resolve({isError: true, message: error.message});
        }
    });
}

module.exports = {
    cloudflare_validate,
    cloudflare_purge,
    cloudflare_setDefaultPageRules
};