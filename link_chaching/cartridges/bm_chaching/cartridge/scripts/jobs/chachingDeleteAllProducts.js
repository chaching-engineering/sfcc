'use strict';

var utils = require('*/cartridge/scripts/utils/chachingHttpServiceUtils');

/**
 * Delete products from chaching
 * @param {array} products - array of product objects
 * @param {string} apiEndPoint - API endpoint
 * @returns {boolean} result - delete product success or not.
 */
function deleteProducts(products, apiEndPoint) {
    var result = true;
    for (var i = 0; i < products.length; i++) {
        var productId = products[i].id;
        var deleteProductApiEndPoint = apiEndPoint + '/' + productId;
        var deleteApiResponse = utils.chachingAPIClient('DELETE', deleteProductApiEndPoint);
        if (deleteApiResponse && !deleteApiResponse.product) {
            result = false;
            break;
        }
    }

    return result;
}

/**
 * Execute delete all products code
 * @returns {boolean} result product deleted true or false
 */
function execute() {
    var page = 1;
    var limit = 200;
    var nextPage = true;
    var result = true;
    var apiEndPoint = utils.config.api.get.products;

    var getProductApiEndPoint = apiEndPoint + '?limit=' + limit + '&page=' + page;
    var apiResponse = utils.chachingAPIClient('GET', getProductApiEndPoint);
    if (apiResponse && !apiResponse.products) {
        result = false;
        return result;
    }
    var totalPage = apiResponse.pages;

    if (totalPage === 0) {
        return result;
    }

    while (nextPage && page <= totalPage) {
        getProductApiEndPoint = apiEndPoint + '?limit=' + limit + '&page=1';
        apiResponse = utils.chachingAPIClient('GET', getProductApiEndPoint);

        var products = apiResponse.products;
        var isProductDeleted = deleteProducts(products, apiEndPoint);

        if (isProductDeleted) {
            page++;
        } else {
            result = false;
            nextPage = false;
        }
    }

    return result;
}

module.exports = {
    execute: execute
};
