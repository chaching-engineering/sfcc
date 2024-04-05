'use strict';

var LogUtils = require('*/cartridge/scripts/utils/chachingLogUtils');
var log = LogUtils.getLogger('chachingOrderUtils');

/**
 * Get list of orders to send chaching for order verification or purchase return
 * @param {Object} order - order Object
 * @returns {list} - list of orders
 */
function getOrders(order) {
    var utils = require('*/cartridge/scripts/utils/chachingHttpServiceUtils');
    var orderLists = {};
    var verifyOrder = [];
    var returnOrder = [];
    var isSendToChaching = order.custom.isSendToChaching;

    if (!isSendToChaching) {
        verifyOrder.push(order);
        orderLists.verifyOrder = verifyOrder;
    }
    var customPaymentProviderSetting = utils.config.paymetProviderSetting;
    var providerSetting;
    try {
        providerSetting = JSON.parse(customPaymentProviderSetting);
    } catch (e) {
        log.error('Invalid custom Payment Provider Setting in site preferences:' + e.message);
    }
    for (var i = 0; i < providerSetting.length; i++) {
        var providerOrderStatusAttrId = providerSetting[i].providerOrderStatusAttrId;
        var orderCustomStatusAttrValue = order.custom[providerOrderStatusAttrId];
        if (orderCustomStatusAttrValue) {
            var providerOrderStatusFromSetting = providerSetting[i].providerCustomOrderStatus;
            var providerReferenceAttrId = providerSetting[i].providerReferenceAttrId;
            var providerReference = order.custom[providerReferenceAttrId];
            if (!(order.custom.isChachingReturnSuccess) && (orderCustomStatusAttrValue === providerOrderStatusFromSetting)) {
                returnOrder.push({
                    order: order,
                    providerReference: providerReference
                });
                orderLists.returnOrder = returnOrder;
            }
        }
    }

    return orderLists;
}

module.exports = {
    getOrders: getOrders
};
