'use strict';

/* eslint-disable new-cap */
/* global empty */

/**
 * Base Order Export Module Implementation
 * @module
 */

var searchFactory = {
    orderSearchModel: require('~/cartridge/scripts/models/order/chachingOrderSearch')
};

/**
 *@return {Object} order - order object to be sent to ChaChing
 */
var ExportModel = function () {
    var searchModel = !empty(searchFactory.orderSearchModel) ? new searchFactory.orderSearchModel() : null;

    return {
        getNextItem: function (counter) {
            return searchModel ? searchModel.getNext(counter) : undefined;
        }
    };
};

module.exports = ExportModel;
