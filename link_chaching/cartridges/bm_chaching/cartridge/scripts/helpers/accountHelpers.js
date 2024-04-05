/* eslint-disable new-cap */
'use strict';

var utils = require('*/cartridge/scripts/utils/chachingHttpServiceUtils');

/**
 * Login Authentication
 * @param {string} email - account login email
 * @param {string} password - account login password
 * @returns {Object} access token object
 */
function loginAuth(email, password) {
    var Resource = require('dw/web/Resource');

    var token = utils.generateToken(email, password);

    if (token) {
        return {
            error: false,
            message: Resource.msg('chaching.login.success.message', 'chaching', null)
        };
    }
    return {
        error: true,
        message: Resource.msg('chaching.login.error.message', 'chaching', null)
    };
}

/**
 * Get assigned chaching account ids
 * @returns {Array} array of account IDs
 */
function getAssignedAccountIds() {
    var Site = require('dw/system/Site');
    var apiEnv = utils.config.apiEnv;
    var accountIdSitePreferenceName = apiEnv === 'live' ? 'chachingAPIAccountIDLive' : 'chachingAPIAccountIDDemo';
    var allSites = Site.getAllSites();
    var accountList = [];
    for (var i = 0; i < allSites.length; i++) {
        var sitePreferenceValue = allSites[i].preferences.custom[accountIdSitePreferenceName];
        if (sitePreferenceValue) {
            accountList.push(sitePreferenceValue);
        }
    }
    return accountList;
}

/**
 * Get available chaching account list
 * @param {string} token - access_token
 * @returns {Array} - array of account object
 */
function getAccountList() {
    var assignedAccounts = getAssignedAccountIds();
    var endPoint = utils.config.api.get.accounts;
    var result = utils.chachingPurchaseAPIClient('GET', endPoint);
    var accounts = [];
    if (result && result.accounts) {
        var accountList = result.accounts;
        for (var i = 0; i < accountList.length; i++) {
            var account = accountList[i];
            var accountId = account.id;
            if (assignedAccounts.indexOf(accountId) === -1) {
                accounts.push({
                    id: account.id,
                    name: account.name
                });
            }
        }
    }
    return accounts;
}

/**
 * Get account status
 * @returns {boolean} - Site is connected to ChaChing account or not
 */
function getAccountStatus() {
    var apiEnv = utils.config.apiEnv;
    var accountId = apiEnv === 'live' ? utils.config.apiAccountIDLive : utils.config.apiAccountIDDemo;
    var authData = utils.getAuthData();
    var accountStatus = false;
    if (authData && authData.access_token && accountId) {
        accountStatus = true;
    }

    return accountStatus;
}
/**
 * Get campaign status
 * @param {string} accountId - selected account ID
 * @returns {Object} campaign status object
 */
function getCampaignStatus(accountId) {
    var endPoint = utils.config.api.get.campaign_status;
    var result = utils.chachingAPIClient('GET', endPoint, '', accountId);
    var campaignStatus;
    if (result && result.status && result.status.counts) {
        campaignStatus = result.status.counts;
    }
    return campaignStatus;
}

/**
 * Get product status
 * @param {string} accountId - selected account ID
 * @returns {Object} product status object
 */
function getProductStatus(accountId) {
    var endPoint = utils.config.api.get.product_status;
    var result = utils.chachingAPIClient('GET', endPoint, '', accountId);
    var productStatus;
    if (result && result.status && result.status.counts) {
        productStatus = result.status.counts;
    }
    return productStatus;
}

/**
 * Get last product exported time
 * @returns {Object} formated date and time
 */
function getLastSyncTime() {
    var Calendar = require('dw/util/Calendar');
    var StringUtils = require('dw/util/StringUtils');
    var lastExported = require('~/cartridge/scripts/utils/getChachingLastExportedTime');
    var lastSyncTimeFromCache = lastExported.getLastExportedTime('product');
    var lastSyncTime;
    if (lastSyncTimeFromCache) {
        var calendarDate = new Date(lastSyncTimeFromCache);
        var overviewFormat = StringUtils.formatCalendar(Calendar(calendarDate), 'MM/dd/yyyy @ h:mm a');
        var listedFormat = StringUtils.formatCalendar(Calendar(calendarDate), 'MMMM d, h:mm a');
        lastSyncTime = {
            overviewFormat: overviewFormat,
            listedFormat: listedFormat
        };
    }

    return lastSyncTime;
}

module.exports = {
    loginAuth: loginAuth,
    getAssignedAccountIds: getAssignedAccountIds,
    getAccountList: getAccountList,
    getAccountStatus: getAccountStatus,
    getCampaignStatus: getCampaignStatus,
    getProductStatus: getProductStatus,
    getLastSyncTime: getLastSyncTime
};
