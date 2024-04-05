'use strict';

/* eslint-disable no-param-reassign */

/**
 * Search order for the Order Feed Export
 */

/* API Includes*/
const OrderMgr = require('dw/order/OrderMgr');

/* Script Includes*/
const lastExported = require('~/cartridge/scripts/utils/getChachingLastExportedTime');
const LogUtils = require('*/cartridge/scripts/utils/chachingLogUtils');
const Logger = LogUtils.getLogger('chachingOrderSearch');

/**
 * Object implements default searchModel interface
 * @param {Object} parameters - params for searchModel
 * @return {Object} public api methods
 */
var searchModel = function () {
    Logger.info('Starting order export data');
    var lastOrderSyncTime = lastExported.getLastExportedTime('order');
    var orderCount = 0;
    var allOrders = [];

    /**
     * Function that stores the orders
     * @param {dw.order.Order} order - object
     */
    function callback(order) {
        allOrders.push(order);
        orderCount++;
    }

    try {
        var query = 'custom.isChachingOrder = {0}';
        var queryParams = [];
        queryParams.push(true);

        if (lastOrderSyncTime) {
            query += ' AND lastModified >= {1}';
            queryParams.push(lastOrderSyncTime);
        }
        OrderMgr.processOrders(callback, query, queryParams);
    } catch (e) {
        Logger.error('Error occurred while searching for orders {0}', e.message);
        return false;
    }
    Logger.info('Found {0} orders', orderCount);
    return {
        getNext: function (counter) {
            var order = null;
            counter = (counter && counter >= 0) ? counter : 0;
            if (allOrders.length) {
                order = allOrders.pop();
            }
            counter++;

            var response = {
                order: order,
                count: counter
            };
            return order ? response : null;
        }
    };
};

module.exports = searchModel;
