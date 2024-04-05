'use strict';

/* API Includes */
var File = require('dw/io/File');
var Site = require('dw/system/Site');

/* Script Includes*/
var customCache = require('*/cartridge/scripts/utils/customCacheWebdav');
const LogUtils = require('*/cartridge/scripts/utils/chachingLogUtils');
const Logger = LogUtils.getLogger('getLastExportedTime');
/**
 * @desc gets last exported time from custom cache for each exported job
 * @param {string} objectTypeName - type of object name to be created in custom cache.
 * @returns {string} last exported time
 */
function getLastExportedTime(objectTypeName) {
    var SEP = File.SEPARATOR;
    var customCacheWrapper;
    try {
        var endPoint = Site.getCurrent().getID() ? SEP + Site.getCurrent().getID() + SEP + 'export_time' + SEP + objectTypeName : 'export_time' + SEP + objectTypeName;
        customCacheWrapper = customCache.getCache(endPoint);

        if (customCacheWrapper) {
            return customCacheWrapper.lastExportedTime;
        }
    } catch (e) {
        Logger.error('Error to get last expoted time:' + e.toString());
    }

    return '';
}


module.exports = {
    getLastExportedTime: getLastExportedTime
};
