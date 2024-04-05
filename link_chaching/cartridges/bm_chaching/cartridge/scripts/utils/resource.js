/**
 * Resource helper
 *
 */
function ResourceHelper() {}

/**
 * Get the client-side resources of a given page
 * @returns {Object} An objects key key-value pairs holding the resources
 */
ResourceHelper.getResources = function () {
    var Resource = require('dw/web/Resource');

    // application resources
    var resources = {
        // Transaction operation messages
        LOGIN_SUCCESS: Resource.msg('chaching.login.success.message', 'chaching', null),
        CONNECT_SUCCESS: Resource.msg('chaching.account.connect.success.message', 'chaching', null),
        DISCONNECT_SUCCESS: Resource.msg('chaching.account.disconnect.success.message', 'chaching', null),
        DISCONNECT_FAIL: Resource.msg('chaching.account.disconnect.fail.message', 'chaching', null),
        REFRESH_FAIL: Resource.msg('chaching.account.refresh.fail.message', 'chaching', null)
    };
    return resources;
};

module.exports = ResourceHelper;
