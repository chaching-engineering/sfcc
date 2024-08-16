'use strict';

/* global session*/
/* eslint-disable no-param-reassign */

/* API Includes */
var Site = require('dw/system/Site');
var StringUtils = require('dw/util/StringUtils');


/* Script Includes */
var LogUtils = require('./chachingLogUtils');
var ServiceUtils = require('./chachingHttpServiceUtils');
var customCache = require('./customCacheWebdav');

// Global Variables
var Utils = {};

Utils.log = LogUtils.getLogger('chachingOCIUtils');


/**
 * OCI configurations
 */
Utils.ociConfig = {
    ociStatus: Site.current.getCustomPreferenceValue('chachingOCIStatus').value || 'disabled',
    tenantId: Site.current.getCustomPreferenceValue('chachingOCITenantId') || '',
    apiClientId: Site.current.getCustomPreferenceValue('chachingOCIApiClientId') || '',
    apiClientSecret: Site.current.getCustomPreferenceValue('chachingOCIApiClientSecret') || '',
    tenantGroupId: Site.current.getCustomPreferenceValue('chachingOCITenantGroupId') || '',
    ociBaseUrl: Site.current.getCustomPreferenceValue('chachingOCIBaseUrl') || '',
    locationGroups: Site.current.getCustomPreferenceValue('chachingOCILocationGroups') || [],
    inventoryLevelField: Site.current.getCustomPreferenceValue('chachingOCIInventoryLevelField').value || 'ato'
};

/**
 * OCI API configurations
 */
Utils.apiConfig = {
    api: {
        post: {
            access_token: 'https://account.demandware.com/dwsso/oauth2/access_token?grant_type=client_credentials&scope=SALESFORCE_COMMERCE_API:' + Utils.ociConfig.tenantId,
            initiate_availability_export: '/inventory/impex/v1/organizations/' + Utils.ociConfig.tenantGroupId + '/availability-records/exports',
            get_availability_deltas: '/inventory/availability/v1/organizations/' + Utils.ociConfig.tenantGroupId + '/availability-records/actions/get-deltas',
            sku_availability_by_location_and_or_group: '/inventory/availability/v1/organizations/' + Utils.ociConfig.tenantGroupId + '/availability-records/actions/get-availability'
        }
    },
    cache: {
        url: {
            authentication: '/' + Site.current.ID + '/omnichannel-inventory/authentication/auth-data',
            delta_token: '/' + Site.current.ID + '/omnichannel-inventory/authentication/delta-token',
            inventory_records: '/' + Site.current.ID + '/omnichannel-inventory/inventory-records'
        }
    }
};

/**
 * Get service configuration for access token
 * @returns {Object} - service callbacks
 */
Utils.getTokenServiceCallbacks = function () {
    return {
        createRequest: function (service, args) {
            service.URL = args.endPointUrl;
            service.setRequestMethod(args.method);
            service.addHeader('Content-Type', 'application/x-www-form-urlencoded');
            service.addHeader('Authorization', args.auth);

            return args.request;
        },

        parseResponse: ServiceUtils.serviceParseResponse,

        getRequestLogMessage: function (request) {
            return ServiceUtils.filterLogData(request);
        },

        getResponseLogMessage: function (response) {
            return ServiceUtils.filterLogData(response.text);
        }
    };
};

/**
 * Call HTTP service for OCI API
 * @param {string} method - HTTP method
 * @param {string} endPoint - API endpoint
 * @param {string} requestBody - request body sring
 * @param {string} token -token
 * @returns {Object} service response object
 */
Utils.ociServiceCall = function (method, endPoint, requestBody, token) {
    var apiBaseUrl = Utils.ociConfig.ociBaseUrl;
    var endPointUrl = apiBaseUrl + endPoint;
    var serviceArgs = {
        token: token,
        method: method,
        endPointUrl: endPointUrl,
        request: requestBody || ''
    };
    var serviceCallbacks = ServiceUtils.getServiceCallbacks();
    var service = ServiceUtils.setServiceRegistry(serviceCallbacks);
    var result = service.call(serviceArgs);

    if (result.status !== 'OK') {
        Utils.log.error('Error on Service call to endpoint: ' + method + ' ' + endPointUrl);
        Utils.log.error('Error message: ' + result.msg);
    }

    return result.status === 'OK' ? result.object : result.errorMessage;
};

/**
 * Get token from session
 * @returns {string} - access token
 */
Utils.getSavedAccessToken = function () {
    var authData = customCache.getCache(Utils.apiConfig.cache.url.authentication);
    var token;

    if (authData) {
        var currentTimeStamp = new Date().getTime();
        var authCreatedTime = authData.created_at;

        if (currentTimeStamp - authCreatedTime < authData.expires_in * 1000) {
            token = authData.access_token;
        }
    }

    return token;
};

/**
 * Generate access token for OCI API calls
 * @returns {string} - access token
 */
Utils.generateOCIAccessToken = function () {
    Utils.log.debug('Generating OCI API access token');

    var url = Utils.apiConfig.api.post.access_token;
    var apiClientId = Utils.ociConfig.apiClientId;
    var apiClietSecret = Utils.ociConfig.apiClientSecret;
    var auth = 'Basic ' + StringUtils.encodeBase64(apiClientId + ':' + apiClietSecret);
    var serviceArgs = {
        auth: auth,
        method: 'POST',
        endPointUrl: url
    };

    var serviceCallbacks = Utils.getTokenServiceCallbacks();
    var service = ServiceUtils.setServiceRegistry(serviceCallbacks);
    var result = service.call(serviceArgs);

    if (result.status !== 'OK') {
        Utils.log.error('Error message: ' + result.msg);
        Utils.log.error('Check if valid Tenant ID, API Client ID and API Client Secret are set in Site Preferences - Chaching Omnichannel Inventory Configurations');

        return null;
    }

    var accessToken;
    var response = result.status === 'OK' ? result.object : null;

    if (response && response.access_token) {
        accessToken = response.access_token;
        // saving token details into custom cache
        response.created_at = new Date().getTime();
        customCache.setCache(Utils.apiConfig.cache.url.authentication, response);
    } else {
        Utils.log.error('OCI API access token was not generated');
    }

    return accessToken;
};

/**
 * Get access token for OCI API calls
 * @returns {string} - access token
 */
Utils.getAccessToken = function () {
    var accessToken = '';

    accessToken = Utils.getSavedAccessToken();

    if (accessToken) {
        return accessToken;
    }

    accessToken = Utils.generateOCIAccessToken();

    return accessToken;
};

/**
 * Saves Omnichannel inventory record to custom cache
 * @param {Object} inventoryRecord - Inventory record
 */
Utils.saveInventoryRecord = function (inventoryRecord) {
    customCache.setCache(Utils.apiConfig.cache.url.inventory_records + '/' + inventoryRecord.sku, inventoryRecord);
};

/**
 * Saves Omnichannel delta token to custom cache
 * @param {Object} deltaTokenObj - Delta token object
 */
Utils.saveDeltaToken = function (deltaTokenObj) {
    customCache.setCache(Utils.apiConfig.cache.url.delta_token, deltaTokenObj);
};

/**
 * Get product omnichannel inventory level from custom cache
 * @param {string} productId - Product ID
 * @returns {Object} - inventory level and in stock status
 */
Utils.getOmniChannelInventory = function (productId) {
    var inventoryLevelField = Utils.ociConfig.inventoryLevelField;
    var ociCustomCacheUrl = Utils.apiConfig.cache.url.inventory_records + '/' + productId;
    var inventory = customCache.getCache(ociCustomCacheUrl);
    var inventoryLevel = 0;
    var inStock = false;

    var availabilityModel = {
        inStock: inStock,
        orderable: inStock,
        inventoryRecord: {
            ATS: {
                value: inventoryLevel
            }
        }
    };

    if (inventory && inventory[inventoryLevelField]) {
        inventoryLevel = inventory[inventoryLevelField];
        inStock = inventory[inventoryLevelField] > 0;
        availabilityModel.inventoryRecord.ATS.value = inventoryLevel;
        availabilityModel.inStock = inStock;
        availabilityModel.orderable = inStock;
    }

    return availabilityModel;
};

/**
 * Call OCI SKU level Delta API and update latest inventory records in cache
 * @param {Object} product - Product
 * */
Utils.updateSkuLevelDeltaOciRecordsInCache = function (product) {
    var endpoint = Utils.apiConfig.api.post.sku_availability_by_location_and_or_group;
    var locationGroups = Utils.ociConfig.locationGroups;
    var skus = [product.ID];
    var groups = [];
    var i;

    if (product.master) {
        var variants = product.getVariants();
        var variantsIterator = !variants.empty ? variants.iterator() : null;
        var variant;

        if (variantsIterator) {
            while (variantsIterator.hasNext()) {
                variant = variantsIterator.next();
                skus.push(variant.ID);
            }
        }
    }

    for (i = 0; i < locationGroups.length; i++) {
        groups.push(locationGroups[i]);
    }

    var token = Utils.getAccessToken();
    var requestBody = {
        skus: skus,
        groups: groups
    };

    var result = Utils.ociServiceCall('POST', endpoint, JSON.stringify(requestBody), token);

    if (result && result.groups && Array.isArray(result.groups)) {
        var group;
        var record;
        var ociCustomCacheUrl;

        for (i = 0; i < result.groups.length; i++) {
            group = result.groups[i];

            if (group.records && Array.isArray(group.records)) {
                for (var j = 0; j < group.records.length; j++) {
                    record = group.records[j];

                    if (record.sku) {
                        ociCustomCacheUrl = Utils.apiConfig.cache.url.inventory_records + '/' + record.sku;
                        customCache.setCache(ociCustomCacheUrl, record);
                    }
                }
            }
        }
    } else {
        Utils.log.debug('sku_availability_by_location_and_or_group API call hits on error for Product: ' + product.ID);
        Utils.log.debug('API Response: ' + JSON.stringify(result));
    }
};

/**
 * Get Delta token from custom cache
 * @returns {Object} - delta token object
 */
Utils.getDeltaTokenFromCache = function () {
    return customCache.getCache(Utils.apiConfig.cache.url.delta_token);
};

/**
 * Get changes in availability records
 * @returns {Object} - availability deltas
 */
Utils.getAvailabilityDeltas = function () {
    var token = Utils.getAccessToken();
    var deltaToken = Utils.getDeltaTokenFromCache();
    var endPoint = Utils.apiConfig.api.post.get_availability_deltas;
    var requestBody = JSON.stringify(deltaToken);
    var result = Utils.ociServiceCall('Post', endPoint, requestBody, token);

    return result;
};

/**
 * Deletes Omnichannel inventory cache
 * */
Utils.deleteInventoryCache = function () {
    customCache.clearCache(Utils.apiConfig.cache.url.inventory_records);
};

module.exports = Utils;
