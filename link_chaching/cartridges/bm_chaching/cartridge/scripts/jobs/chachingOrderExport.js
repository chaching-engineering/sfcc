/* eslint-disable no-undef */
'use strict';

/* Global Variables*/
var exportModel;
var counter;


/**
 * beforeStep. Creation of the file and initialization XML file
 */
function beforeStep() {
    var ExportModel = require('~/cartridge/scripts/models/order/chachingOrderExportModel');
    exportModel = new ExportModel();
}

/**
 * read. Read all the order
 * @returns {Array} Array of product objects
 */
function read() {
    var output = exportModel.getNextItem(counter);
    counter = (output && output.count) > 0 ? output.count : 0;
    var orderObject = !empty(output) ? output.order : null;
    return orderObject;
}

/**
 * process. Retrieve all the needed data for http service call
 * @param {Object} order - object
 * @returns {Object} Array of order fields
 */
function process(order) {
    var orderUtils = require('~/cartridge/scripts/utils/chachingOrderUtils');
    return orderUtils.getOrders(order);
}

/**
 * write. Write the data in the file
 * @param {Object} orderLists - List of orders
 */
function write(orderLists) {
    var utils = require('*/cartridge/scripts/utils/chachingHttpServiceUtils');

    if (orderLists) {
        for (var i = 0; i < orderLists.size(); i++) {
            var orderList = orderLists.get(i);
            var verifyOrderList = orderList.verifyOrder;
            var returnOrderList = orderList.returnOrder;

            if (verifyOrderList) {
                for (var j = 0; j < verifyOrderList.length; j++) {
                    var verifyOrder = verifyOrderList[j];
                    var verifyOrderClickId = verifyOrder.custom.chachingClickId;
                    if (verifyOrderClickId) {
                        utils.createVerificationOrder(verifyOrder, verifyOrderClickId);
                    }
                }
            }

            if (returnOrderList) {
                for (var k = 0; k < returnOrderList.length; k++) {
                    var returnOrder = returnOrderList[k].order;
                    var providerReference = returnOrderList[k].providerReference;
                    if (returnOrder) {
                        utils.createPurchaseReturn(returnOrder, providerReference);
                    }
                }
            }
        }
    }
}

module.exports = {
    beforeStep: beforeStep,
    read: read,
    process: process,
    write: write
};
