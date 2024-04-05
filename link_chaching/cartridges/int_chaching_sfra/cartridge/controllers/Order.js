'use strict';
/* global session */

var server = require('server');
server.extend(module.superModule);
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');

server.prepend('Confirm',
    consentTracking.consent,
    server.middleware.https,
    csrfProtection.generateToken,
    function (req, res, next) {
        var OrderMgr = require('dw/order/OrderMgr');
        var Transaction = require('dw/system/Transaction');
        var utils = require('*/cartridge/scripts/utils/chachingHttpServiceUtils');

        var order;
        var orderId = req.form && req.form.orderID ? req.form.orderID : req.querystring.ID;
        var orderToken = req.form && req.form.orderToken ? req.form.orderToken : req.querystring.token;
        if (orderId && orderToken) {
            order = OrderMgr.getOrder(orderId, orderToken);
        }
        var clickId = session.privacy.clickId;

        if (order && clickId) {
            Transaction.wrap(function () {
                order.custom.isChachingOrder = true;
                order.custom.chachingClickId = session.privacy.clickId;
            });
            utils.createVerificationOrder(order, clickId);
        }

        next();
    }
);

module.exports = server.exports();
