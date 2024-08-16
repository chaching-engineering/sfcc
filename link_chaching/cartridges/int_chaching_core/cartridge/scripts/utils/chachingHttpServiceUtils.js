'use strict';

/*
 *    Utility functions for the cartridge
 */

/* eslint-disable no-param-reassign */
/* eslint-disable no-unneeded-ternary */
/* eslint-disable no-nested-ternary */
/* eslint-disable no-undef */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
/* eslint-disable default-case */


/* API Includes */
var Site = require('dw/system/Site');
var Transaction = require('dw/system/Transaction');

/* Script Includes */
var LogUtils = require('./chachingLogUtils');

// Global Variables
var Utils = {};

Utils.log = LogUtils.getLogger('chachingUtils');

/**
 * Common configurations
 */
Utils.config = {
    apiEnv: Site.current.getCustomPreferenceValue('chachingAPIEnvironment').value || 'demo',
    apiBaseUrlDemo: Site.current.getCustomPreferenceValue('chachingAPIBaseUrlDemo') || '',
    apiBaseUrlLive: Site.current.getCustomPreferenceValue('chachingAPIBaseUrlLive') || '',
    apiVersionDemo: Site.current.getCustomPreferenceValue('chachingAPIVersionDemo') || '',
    apiVersionLive: Site.current.getCustomPreferenceValue('chachingAPIVersionLive') || '',
    apiAccountIDDemo: Site.current.getCustomPreferenceValue('chachingAPIAccountIDDemo') || '',
    apiAccountIDLive: Site.current.getCustomPreferenceValue('chachingAPIAccountIDLive') || '',
    imageViewType: Site.current.getCustomPreferenceValue('chachingImageViewType') || 'large',
    imageIndex: Site.current.getCustomPreferenceValue('chachingImageIndex') || 0,
    paymetProviderSetting: Site.current.getCustomPreferenceValue('chachingPaymentProviderSettings') || '[]',
    authorization: Site.current.getCustomPreferenceValue('chachingAuthorization') || '{}',
    external_source_id: 'SFCC',
    api: {
        get: {
            products: 'products',
            accounts: 'advertisers/accounts',
            campaign_status: 'campaigns-status',
            product_status: 'products-status'
        },
        post: {
            auth: {
                request: 'auth/session',
                refresh: 'auth/session/refresh'
            },
            purchase: {
                create_order_verification: 'purchase-verifications/order',
                create_purchase_return: 'purchase-return'
            },
            create_single_product: 'products'
        },
        put: {
            update_product_by_sfcc_id: 'products/external',
            update_variant_product: 'products/{product_id}/variants/{variant_id}'
        },
        delete: {
            delete_product_by_sfcc_id: 'products/external'
        }
    }
};

/**
 * HTTPService configuration parseResponse
 * @param {Object} service - service
 * @param {Object} httpClient - httpClient
 * @returns {Object} response
 */
Utils.serviceParseResponse = function (service, httpClient) {
    var resp;
    var contentType = httpClient.responseHeaders.get('Content-Type') ? httpClient.responseHeaders.get('Content-Type')[0] : '';

    if (httpClient.statusCode === 200 || httpClient.statusCode === 201) {
        if (contentType === 'application/octet-stream') {
            resp = httpClient.getText();
        } else {
            resp = JSON.parse(httpClient.getText());
        }
    } else {
        Utils.log.error('Error on http request: ' + httpClient.getErrorText());
        resp = null;
    }

    return resp;
};

/**
 * Sets service registry for ChachingClient
 * @param {Object} config - configuration
 * @returns {Object} service
 */
Utils.setServiceRegistry = function (config) {
    var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
    var service = LocalServiceRegistry.createService('chaching.http', config);

    return service;
};

/**
 * Masked sensitive data
 * @param {Object} data - requestObject
 * @returns {Object} masked data
 */
Utils.filterLogData = function (data) {
    var Resource = require('dw/web/Resource');

    if (data === null) {
        return Resource.msg('data.empty', 'chaching', null);
    }

    var result = '\n';
    var value = '';

    if (!empty(data)) {
        var credentialsObject = JSON.parse(data);

        for (var key in credentialsObject) {
            value = credentialsObject[key];

            if (key === 'client_id' || key === 'access_token') {
                value = '*****';
            }

            try {
                result += decodeURIComponent(key + '=' + value) + '\n';
            } catch (e) {
                result += (key + '=' + value) + '\n';
            }
        }
    }

    return result;
};

/**
 * Get service configuration for ChachingClient and ChachingTest
 * @returns {Object} request
 */
Utils.getServiceCallbacks = function () {
    return {
        createRequest: function (service, args) {
            service.URL = args.endPointUrl;
            service.setRequestMethod(args.method);
            if (args.token) {
                service.addHeader('Authorization', 'Bearer ' + args.token);
            }
            service.addHeader('Content-Type', 'application/json');

            return args.request;
        },

        parseResponse: Utils.serviceParseResponse,

        getRequestLogMessage: function (request) {
            return Utils.filterLogData(request);
        },

        getResponseLogMessage: function (response) {
            return Utils.filterLogData(response.text);
        }
    };
};

/**
 * Call HTTP srvice
 * @param {string} method - HTTP method
 * @param {string} endPoint - API endpoint
 * @param {string} requestBody - request body sring
 * @param {string} token -token
 * @returns {Object} service response object
 */
Utils.serviceCall = function (method, endPoint, requestBody, token) {
    var apiBaseUrl = Utils.config.apiEnv === 'live' ? Utils.config.apiBaseUrlLive : Utils.config.apiBaseUrlDemo;
    var endPointUrl = apiBaseUrl + '/' + endPoint;
    var serviceArgs = {
        token: token,
        method: method,
        endPointUrl: endPointUrl,
        request: requestBody || ''
    };
    var serviceCallbacks = Utils.getServiceCallbacks();
    var service = Utils.setServiceRegistry(serviceCallbacks);
    var result = service.call(serviceArgs);

    if (result.status !== 'OK') {
        Utils.log.error('Error on Service call to endpoint: ' + method + ' ' + endPointUrl);
        Utils.log.error('Error message: ' + result.msg);
    }

    return result.status === 'OK' ? result.object : result.errorMessage;
};

/**
 * Get autorization data from custom site preference
 * @returns {Object} auth data
 */
Utils.getAuthData = function () {
    var authData = Utils.config.authorization;

    if (authData) {
        try {
            return JSON.parse(authData);
        } catch (e) {
            Utils.log.error('Error while parsing the authData: ' + e.message);
        }
    }
    return null;
};

/**
 * Get refreshed token
 * @param {Object} authData - authorization data in custom cache
 * @returns {string} token - token
 * */
Utils.refreshedToken = function (authData) {
    var endPoint = Utils.config.api.post.auth.refresh;
    var requestBody = {
        access_token: authData.access_token,
        refresh_token: authData.refresh_token
    };

    var result = Utils.serviceCall('POST', endPoint, JSON.stringify(requestBody));

    if (result.access_token) {
        // Keep data in custom cache
        result.created_at = new Date().getTime();
        Transaction.wrap(function () {
            Site.current.setCustomPreferenceValue('chachingAuthorization', JSON.stringify(result));
        });
        Utils.log.debug('Token refreshed and kept in site preference');

        return result.access_token;
    }

    Utils.log.error('Failed to refresh token. Below is the response.');
    Utils.log.debug('Response: ' + JSON.stringify(result));

    return null;
};

/**
 * Generates authorization token
 * @param {string} email - login email id
 * @param {string} password - login password
 * @returns {Object} response body
 */
Utils.generateToken = function (email, password) {
    var endPoint = Utils.config.api.post.auth.request;

    var requestBody = {
        email: email,
        password: password
    };

    var result = Utils.serviceCall('POST', endPoint, JSON.stringify(requestBody));

    if (result.access_token) {
        // Keep data in custom cache
        result.created_at = new Date().getTime();
        Transaction.wrap(function () {
            Site.current.setCustomPreferenceValue('chachingAuthorization', JSON.stringify(result));
        });
        Utils.log.debug('Token generated and kept in site preference');

        return result.access_token;
    }
    Utils.log.error('Failed to generate token. Below is the response.');
    Utils.log.debug('Response: ' + JSON.stringify(result));


    return null;
};

/**
 * Get saved token from custom cache
 * @returns {string} token - token
 * */
Utils.getToken = function () {
    var authData = Utils.getAuthData();
    var token;

    if (authData) {
        var currentTimeStamp = new Date().getTime();
        var authCreatedTime = authData.created_at;

        if (currentTimeStamp - authCreatedTime < ((authData.expires_in * 1000) - 60000)) { // refresh token 1 minute prior to expiry
            // Token taken from cache
            token = authData.access_token;
        } else {
            // Refreshing token
            Utils.log.debug('Refreshing token');
            token = Utils.refreshedToken(authData);
        }
    }

    return token;
};

/**
 * Communicates with Chaching clients APIs
 * @param {string} method - method
 * @param {string} endPoint - endPoint Url
 * @param {string} requestBody - request body
 * @param {string} accountId - selected accountId or undefined
 * @returns {Object} response object
 */
Utils.chachingAPIClient = function (method, endPoint, requestBody, accountId) {
    var apiVersion = Utils.config.apiEnv === 'live' ? Utils.config.apiVersionLive : Utils.config.apiVersionDemo;
    var apiAccountID = (Utils.config.apiEnv === 'live' ? Utils.config.apiAccountIDLive : Utils.config.apiAccountIDDemo) || accountId;
    var endPointUrl = 'api/' + apiVersion + '/accounts/' + apiAccountID + '/' + endPoint;
    var requestParam = requestBody || '';

    var token = Utils.getToken();

    var result = Utils.serviceCall(method, endPointUrl, requestParam, token);

    return result;
};

/**
 * Communicates with Chaching clients Purchase APIs and account list API
 * @param {string} method - method
 * @param {string} endPoint - endPoint Url
 * @param {string} requestBody - request body
 * @returns {Object} response object
 */
Utils.chachingPurchaseAPIClient = function (method, endPoint, requestBody) {
    var apiVersion = Utils.config.apiEnv === 'live' ? Utils.config.apiVersionLive : Utils.config.apiVersionDemo;
    var endPointUrl = 'api/' + apiVersion + '/' + endPoint;
    var token = Utils.getToken();

    var result = Utils.serviceCall(method, endPointUrl, requestBody, token);

    return result;
};

/**
 * Add product line items to request
 * @param {Object} requestBody - request object
 * @param {Object} order - Order object
 */
Utils.addproductLineitems = function (requestBody, order) {
    var ProductMgr = require('dw/catalog/ProductMgr');
    var productLineItems = order.productLineItems;
    var lineItems = [];
    for (var i = 0; i < productLineItems.length; i++) {
        var item = productLineItems[i];
        var product = ProductMgr.getProduct(item.productID);
        var quantity = item.quantityValue;
        var lineItemTotalPrice = item.priceAdjustments.getLength() > 0 ? item.adjustedPrice.value : item.price.value;
        var lineItemUnitPrice = item.priceAdjustments.getLength() > 0 ? (item.adjustedPrice.value / quantity).toFixed(2) : item.basePrice.value;
        var sku = product.manufacturerSKU ? product.manufacturerSKU : product.ID;
        lineItems.push({
            external_product_variant_id: item.productID,
            sku: sku,
            total_price: lineItemTotalPrice,
            unit_price: Number(lineItemUnitPrice),
            quantity: quantity,
            name: item.productName
        });
    }

    requestBody.line_items = lineItems;
};

/**
 * Prepare request body for purchase verification order API
 * @param {Object} order - Order object
 * @param {string} clickId - chaching click id
 * @returns {Object} request object
 */
Utils.prepareVerificationOrderReq = function (order, clickId) {
    var accountId = Utils.config.apiEnv === 'live' ? Utils.config.apiAccountIDLive : Utils.config.apiAccountIDDemo;
    var orderCreationDate = order.creationDate;
    var orderNo = order.orderNo;
    var externalSourceId = Utils.config.external_source_id;
    var orderTotal = order.totalGrossPrice.value;
    var currency = order.currencyCode;

    var requestBody = {
        date: orderCreationDate,
        external_id: orderNo,
        external_source_id: externalSourceId,
        account_id: accountId,
        total: orderTotal,
        currency: currency,
        click_id: clickId
    };

    Utils.addproductLineitems(requestBody, order);

    return requestBody;
};

/**
 * Call purchase verification order API
 * @param {Object} order - Order object
 * @param {string} clickId - chaching click id
 */
Utils.createVerificationOrder = function (order, clickId) {
    var requestBody = Utils.prepareVerificationOrderReq(order, clickId);
    var endPoint = Utils.config.api.post.purchase.create_order_verification;

    var apiResponse = Utils.chachingPurchaseAPIClient('POST', endPoint, JSON.stringify(requestBody));

    if (apiResponse && apiResponse.verification) {
        Transaction.wrap(function () {
            order.custom.isSendToChaching = true;
        });

        delete session.privacy.clickId;

        Utils.log.debug('Verification order is created for ' + clickId);
    } else {
        Utils.log.error('Failed to create verification order.');
    }
};

/**
 * Add return order lineitems in purchase return API request body
 * @param {Object} requestBody - request object
 * @param {Object} order - order object
 * @param {string} returnItems - return lineitems details in string format
 */
Utils.addReturnedOrderLineItems = function (requestBody, order, returnItems) {
    var ProductMgr = require('dw/catalog/ProductMgr');
    var returnLineItems;
    try {
        returnLineItems = JSON.parse(returnItems);
    } catch (e) {
        Utils.log.error('Invalid lineitem deatials in order custom attribute:' + e.message);
    }

    var lineItems = [];
    var productLineItems = order.productLineItems;
    for (var i = 0; i < productLineItems.length; i++) {
        var item = productLineItems[i];
        for (var j = 0; j < returnLineItems.length; j++) {
            if (item.productID === returnLineItems[j].id) {
                var product = ProductMgr.getProduct(item.productID);
                var quantity = returnLineItems[j].quantity;
                var lineItemTotalPrice = item.priceAdjustments.getLength() > 0 ? item.adjustedPrice.value : item.price.value;
                var lineItemUnitPrice = item.priceAdjustments.getLength() > 0 ? (item.adjustedPrice.value / quantity).toFixed(2) : item.basePrice.value;
                var sku = product.manufacturerSKU ? product.manufacturerSKU : product.ID;
                lineItems.push({
                    external_product_variant_id: item.productID,
                    sku: sku,
                    total_price: lineItemTotalPrice,
                    unit_price: Number(lineItemUnitPrice),
                    quantity: quantity,
                    name: item.productName
                });
            }
        }
    }

    requestBody.line_items = lineItems;
};

/**
 * Prepare request for Create Purchase return API call
 * @param {Object} order - order object
 * @param {string} providerReference - payment provider reference
 * @returns {Object} request JSON object
 */
Utils.preparePurchaseReturnReq = function (order, providerReference) {
    var accountId = Utils.config.apiEnv === 'live' ? Utils.config.apiAccountIDLive : Utils.config.apiAccountIDDemo;
    var orderNo = order.orderNo;

    var requestBody = {
        external_order_id: orderNo,
        external_id: providerReference,
        account_id: accountId
    };

    var returnLineItems = order.custom.chachingReturnLineItems;
    if (returnLineItems) {
        Utils.addReturnedOrderLineItems(requestBody, order, returnLineItems);
    } else {
        Utils.addproductLineitems(requestBody, order);
    }

    return requestBody;
};

/**
 * Call create purchase return API
 * @param {Object} order - order object
 * @param {string} providerReference - payment provider reference
 */
Utils.createPurchaseReturn = function (order, providerReference) {
    var requestBody = Utils.preparePurchaseReturnReq(order, providerReference);
    var endPoint = Utils.config.api.post.purchase.create_purchase_return;

    var apiResponse = Utils.chachingPurchaseAPIClient('POST', endPoint, JSON.stringify(requestBody));

    if (apiResponse && apiResponse.purchase_return) {
        Transaction.wrap(function () {
            order.custom.isChachingReturnSuccess = true;
            order.custom.isChachingPurchaseReturnAPIError = false;
        });
        Utils.log.error('Purchase return for order No ' + order.orderNo);
    } else {
        Transaction.wrap(function () {
            order.custom.isChachingPurchaseReturnAPIError = true;
        });
        Utils.log.error('Failed to purchase return for order No ' + order.orderNo);
    }
};

module.exports = Utils;
