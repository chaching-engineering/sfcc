/**
* Chaching backoffice features controllers
*
* @module  controllers/Chaching
*/

/* global request, response */
'use strict';

/* API Includes */
var ISML = require('dw/template/ISML');
var Site = require('dw/system/Site');
var Transaction = require('dw/system/Transaction');
var Resource = require('dw/web/Resource');
var URLUtils = require('dw/web/URLUtils');

var r = require('~/cartridge/scripts/utils/response');
var utils = require('*/cartridge/scripts/utils/chachingHttpServiceUtils');
var accountHelpers = require('~/cartridge/scripts/helpers/accountHelpers');
var accountStatus = accountHelpers.getAccountStatus();

/**
 * Chaching backoffice landing page
 */
function show() {
    var authData = utils.getAuthData();
    var apiEnv = utils.config.apiEnv;

    if (authData && authData.access_token && accountStatus) {
        var campaignStatus = accountHelpers.getCampaignStatus();
        var productStatus = accountHelpers.getProductStatus();
        var accountId = apiEnv === 'live' ? utils.config.apiAccountIDLive : utils.config.apiAccountIDDemo;
        var lastSync = accountHelpers.getLastSyncTime();
        ISML.renderTemplate('chaching/chachingaccountdashboard', {
            apiEnv: apiEnv,
            overviewLastSync: lastSync ? lastSync.overviewFormat : '--',
            listedLastSync: lastSync ? lastSync.listedFormat : '--',
            status: accountStatus,
            accountId: accountId,
            campaign: campaignStatus,
            product: productStatus
        });
    } else if (authData && authData.access_token) {
        var accounts = accountHelpers.getAccountList();
        ISML.renderTemplate('chaching/chachingaccountlist', {
            accounts: accounts,
            status: accountStatus
        });
    } else {
        ISML.renderTemplate('chaching/chachinglandingpage');
    }
}

/**
 * Signup page display
 */
function signUp() {
    var apiEnv = utils.config.apiEnv;
    var accountUrl = apiEnv === 'live' ? Resource.msg('chaching.live.account.signup.url', 'chaching', null) : Resource.msg('chaching.demo.account.signup.url', 'chaching', null);
    ISML.renderTemplate('chaching/chachingsignuppage', {
        status: accountStatus,
        accountUrl: accountUrl
    });
}

/**
 * Chahcing login page
 */
function login() {
    var authData = utils.getAuthData();
    if (authData && authData.access_token) {
        var accounts = accountHelpers.getAccountList();
        ISML.renderTemplate('chaching/chachingaccountlist', {
            accounts: accounts,
            status: accountStatus
        });
    } else {
        ISML.renderTemplate('chaching/chachingloginpage', {
            status: accountStatus
        });
    }
}

/**
 * Login form submit
 */
function submitLoginForm() {
    var email = request.httpParameterMap.loginEmail.stringValue;
    var password = request.httpParameterMap.loginPassword.stringValue;
    var loginResult = accountHelpers.loginAuth(email, password);
    accountStatus = accountHelpers.getAccountStatus();

    var output;
    if (loginResult.error) {
        output = {
            error: true,
            className: 'error-msg',
            message: loginResult.message
        };
    } else {
        output = {
            error: false,
            redirectUrl: accountStatus === true ? URLUtils.url('Chaching-AccountConnect').toString() : URLUtils.url('Chaching-AccountList').toString()
        };
    }

    r.renderJSON(output);
}
/**
 * Display after login, get account list
 */
function accountList() {
    var accounts = accountHelpers.getAccountList();
    ISML.renderTemplate('chaching/chachingaccountlist', {
        accounts: accounts,
        status: accountStatus
    });
}

/**
 * Connect to chaching account
 */
function accountConnect() {
    var apiEnv = utils.config.apiEnv;
    var accountIdSitePreferenceName = apiEnv === 'live' ? 'chachingAPIAccountIDLive' : 'chachingAPIAccountIDDemo';
    var accountId = request.httpParameterMap.get('account-id').stringValue;
    if (accountId) {
        Transaction.wrap(function () {
            Site.current.setCustomPreferenceValue(accountIdSitePreferenceName, accountId);
        });
    }

    var campaignStatus = accountHelpers.getCampaignStatus(accountId);
    var productStatus = accountHelpers.getProductStatus(accountId);
    var lastSync = accountHelpers.getLastSyncTime();
    ISML.renderTemplate('chaching/chachingaccountdashboard', {
        apiEnv: apiEnv,
        overviewLastSync: lastSync ? lastSync.overviewFormat : '--',
        listedLastSync: lastSync ? lastSync.listedFormat : '--',
        accountId: accountId,
        campaign: campaignStatus,
        product: productStatus,
        status: true
    });
}
/**
 * Disconnect from chaching Account
 */
function accountDisconnect() {
    var productExportUtils = require('~/cartridge/scripts/utils/chachingProductExportUtils');
    var deleteAllProducts = require('~/cartridge/scripts/jobs/chachingDeleteAllProducts');
    var apiEnv = utils.config.apiEnv;
    var accountIdSitePreferenceName = apiEnv === 'live' ? 'chachingAPIAccountIDLive' : 'chachingAPIAccountIDDemo';
    var output;
    var error = false;

    var isProductDeleted = deleteAllProducts.execute();

    if (isProductDeleted) {
        try {
            Transaction.wrap(function () {
                Site.current.setCustomPreferenceValue(accountIdSitePreferenceName, '');
                Site.current.setCustomPreferenceValue('chachingAuthorization', '');
            });
            productExportUtils.resetExportedMasterIDsInCache();
        } catch (e) {
            error = true;
        }
    } else {
        error = true;
    }

    if (error) {
        output = {
            error: error,
            className: 'error-msg',
            message: Resource.msg('disconnect.account.error.msg', 'chaching', null)
        };
    } else {
        output = {
            error: error,
            redirectUrl: URLUtils.url('Chaching-SignUp').toString()
        };
    }

    r.renderJSON(output);
}

/**
 * Refresh the dashboard campaign and product section
 */
function refresh() {
    var lastSync = accountHelpers.getLastSyncTime();
    var campaignStatus = accountHelpers.getCampaignStatus();
    var productStatus = accountHelpers.getProductStatus();
    r.renderJSON({
        overviewLastSync: lastSync ? lastSync.overviewFormat : '--',
        listedLastSync: lastSync ? lastSync.listedFormat : '--',
        campaign: campaignStatus,
        product: productStatus
    });
}

/**
 * Create json object for error list of item creation
 */
function createJson() {
    var accountId = request.httpParameterMap.get('accountId').stringValue;
    var page = 1;
    var limit = 200;
    var nextPage = true;
    var apiEndPoint = utils.config.api.get.products;
    var itemList = [];

    while (nextPage) {
        var getProductApiEndPoint = apiEndPoint + '?limit=' + limit + '&page=' + page;
        var apiResponse = utils.chachingAPIClient('GET', getProductApiEndPoint, '', accountId);
        if (apiResponse && !apiResponse.products) {
            nextPage = false;
        } else {
            var products = apiResponse.products;
            for (var i = 0; i < products.length; i++) {
                var product = products[i];
                if (!product.is_valid) {
                    itemList.push({
                        name: product.name,
                        sku: product.sku,
                        description: product.errors
                    });
                }
                var variants = product.variants;
                for (var j = 0; j < variants.length; j++) {
                    var errorList = [];
                    var isError = variants[j].errors.length > 0;
                    if (isError) {
                        for (var e = 0; e < variants[j].errors.length; e++) {
                            errorList.push(variants[j].errors[e].name);
                        }
                        itemList.push({
                            name: variants[j].name,
                            sku: variants[j].sku,
                            description: errorList.join()
                        });
                    }
                }
            }
            page++;
            if (page > apiResponse.pages) {
                nextPage = false;
            }
        }
    }

    r.renderJSON({ itemList: itemList });
}

show.public = true;
exports.Show = show;
signUp.public = true;
exports.SignUp = signUp;
login.public = true;
exports.Login = login;
submitLoginForm.public = true;
exports.SubmitLoginForm = submitLoginForm;
accountList.public = true;
exports.AccountList = accountList;
accountConnect.public = true;
exports.AccountConnect = accountConnect;
accountDisconnect.public = true;
exports.AccountDisconnect = accountDisconnect;
refresh.public = true;
exports.Refresh = refresh;
createJson.public = true;
exports.CreateJson = createJson;

