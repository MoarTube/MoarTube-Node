const axios = require('axios').default;
const { logDebugMessageToConsole } = require('./logger');

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

function cloudflare_purge(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey, files) {
    return new Promise(function(resolve, reject) {
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

            if(data.success) {
                resolve();
            }
            else {
                reject('could not purge the cloudflare cache: ' + JSON.stringify(data.errors));
            }
        })
        .catch(error => {
            logDebugMessageToConsole(null, error, new Error().stack, true);
            
            reject('an error occurred while purging the cloudflare cache');
        });
    });
}

function cloudflare_setDefaultConfiguration(cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey) {
    return new Promise(async function(resolve, reject) {
        try {
            logDebugMessageToConsole('setting Cloudflare configuration for MoarTube Node', null, null, true);

            const headers = {
                'X-Auth-Email': cloudflareEmailAddress,
                'X-Auth-Key': cloudflareGlobalApiKey
            };

            
            // step 1: get all rule sets in the zone

            logDebugMessageToConsole('retrieving zone rule sets', null, null, true);

            const response_ruleSets = await axios.get(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/rulesets`, { headers });

            if(!response_ruleSets.data.success) {
                throw new Error('failed to retrieve zone rule sets');
            }

            const response_ruleSets_result = response_ruleSets.data.result;

            logDebugMessageToConsole('discovered zone rule sets: ' + JSON.stringify(response_ruleSets.data), null, null, true);

            
            // step 2: delete all http_request_cache_settings phase rule sets in the zone

            logDebugMessageToConsole('deleting zone http_request_cache_settings phase rule set if discovered', null, null, true);

            for(const ruleSet of response_ruleSets_result) {
                if(ruleSet.phase === 'http_request_cache_settings') {
                    logDebugMessageToConsole('deleting discovered zone http_request_cache_settings phase rule set: ' + ruleSet.id, null, null, true);

                    const response_deleteRuleSet = await axios.delete(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/rulesets/${ruleSet.id}`, { headers });

                    if(response_deleteRuleSet.status === 204) {
                        logDebugMessageToConsole('deleted discovered zone http_request_cache_settings phase rule set: ' + ruleSet.id, null, null, true);
                    }
                    else {
                        throw new Error('failed to delete zone http_request_cache_settings phase rule set');
                    }
                }
            }

            
            // step 3: create new http_request_cache_settings phase rule set in the zone and initialize it with rules

            logDebugMessageToConsole('creating zone http_request_cache_settings phase rule set', null, null, true);

            const newZoneRuleSet = {
                "rules": [
                    {
                        "description": "MoarTube Node - Cache Bypass for Live (dynamic) HLS streams",
                        "action": "set_cache_settings",
                        "enabled": true,
                        "expression": "(http.request.uri.path contains \"/javascript\")",
                        "action_parameters": {
                            "cache": false
                        }
                    }
                ]
            }

            const response_newZoneRuleSet = await axios.put(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/rulesets/phases/http_request_cache_settings/entrypoint`, newZoneRuleSet, { headers });

            if(!response_newZoneRuleSet.data.success) {
                throw new Error('failed to create zone http_request_cache_settings phase rule set');
            }

            const response_newZoneRuleSet_result = response_newZoneRuleSet.data.result;

            logDebugMessageToConsole('created zone http_request_cache_settings phase rule set: ' + JSON.stringify(response_newZoneRuleSet_result), null, null, true);

            
            // step 4: get all current page rules

            logDebugMessageToConsole('retrieving existing page rules', null, null, true);

            const response_pageRules = await axios.get(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/pagerules`, { headers });

            if(!response_pageRules.data.success) {
                throw new Error('failed to retrieve page rule(s)');
            }

            const pageRules = response_pageRules.data.result;

            logDebugMessageToConsole('discovered existing pages rules: ' + JSON.stringify(response_pageRules.data), null, null, true);

           
            // step 5: delete all current page rules

            logDebugMessageToConsole('deleting existing page rules', null, null, true);

            for(const pageRule of pageRules) {
                const response = await axios.delete(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/pagerules/${pageRule.id}`, { headers });

                if(!response.data.success) {
                    throw new Error('Failed to delete page rule(s)');
                }

                logDebugMessageToConsole('deleted existing page rule: ' + JSON.stringify(response.data), null, null, true);
            }

            
            // step 6: create new page rules

            logDebugMessageToConsole('creating new page rules', null, null, true);

            const newPageRules = [
                { "status": "active", "priority": 1, "actions": [ { "id": "cache_level", "value": "cache_everything" }, { "id": "edge_cache_ttl", "value": 7200 } ], "targets": [ { "target": "url", "constraint": { "operator": "matches", "value": "https://*moartube-node-chris.com/node" } } ] },
                { "status": "active", "priority": 2, "actions": [ { "id": "cache_level", "value": "cache_everything" }, { "id": "edge_cache_ttl", "value": 7200 } ], "targets": [ { "target": "url", "constraint": { "operator": "matches", "value": "https://*moartube-node-chris.com/watch*" } } ] },
                { "status": "active", "priority": 3, "actions": [ { "id": "cache_level", "value": "cache_everything" }, { "id": "edge_cache_ttl", "value": 7200 } ], "targets": [ { "target": "url", "constraint": { "operator": "matches", "value": "https://*moartube-node-chris.com/assets/*" } } ] }
            ];

            for(const newPageRule of newPageRules) {
                const response = await axios.post(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/pagerules`, newPageRule, { headers });

                if(!response.data.success) {
                    throw new Error('failed to create new page rule(s)');
                }

                logDebugMessageToConsole('created new page rule: ' + JSON.stringify(response.data), null, null, true);
            }

            
            // step 7: enable Tiered Caching

            logDebugMessageToConsole('enabling Argo Tiered Caching', null, null, true);

            const tieredCachingData = {
                value: 'on'
            };

            const response_tieredCache = await axios.patch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/argo/tiered_caching`, tieredCachingData, { headers });

            if(!response_tieredCache.data.success) {
                throw new Error('failed to enable Argo Tiered Caching');
            }

            logDebugMessageToConsole('enabled Argo Tiered Caching: ' + JSON.stringify(response_tieredCache.data), null, null, true);
            
            
            // step 8: enable Tiered Cache Smart Topology

            logDebugMessageToConsole('enabling Tiered Cache Smart Topology', null, null, true);

            const tieredCacheSmartTopologyData = {
                value: 'on'
            };

            const response_tieredCacheSmartTopology = await axios.patch(`https://api.cloudflare.com/client/v4/zones/${cloudflareZoneId}/cache/tiered_cache_smart_topology_enable`, tieredCacheSmartTopologyData, { headers });

            if(!response_tieredCacheSmartTopology.data.success) {
                throw new Error('failed to enable Tiered Cache Smart Topology');
            }

            logDebugMessageToConsole('enabled Tiered Cache Smart Topology: ' + JSON.stringify(response_tieredCacheSmartTopology.data), null, null, true);

            
            // step 9: ...

            
            // step 10: profit


            logDebugMessageToConsole('successfully set Cloudflare configuration for MoarTube Node', null, null, true);

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
    cloudflare_setDefaultConfiguration
};