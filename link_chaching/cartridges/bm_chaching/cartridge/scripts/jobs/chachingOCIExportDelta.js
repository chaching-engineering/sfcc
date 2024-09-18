'use strict';

/* eslint-disable no-else-return */
/* global session */
/* eslint-disable  no-lonely-if */

var ociUtils = require('*/cartridge/scripts/utils/chachingOCIServiceUtils');
var LogUtils = require('*/cartridge/scripts/utils/chachingLogUtils');
var productExport = require('./chachingProductExport');
var Logger = LogUtils.getLogger('chachingOCIExport');
var deltaMasterProductIDs = [];

/**
 * Process delta record object
 * @param {Object} recordObject - delta record object
 */
function processDeltaRecordObject(recordObject) {
    var ProductMgr = require('dw/catalog/ProductMgr');
    var product;
    var masterProduct;

    if (recordObject.sku) {
        ociUtils.saveInventoryRecord(recordObject);
        product = ProductMgr.getProduct(recordObject.sku);

        if (product && !product.variationGroup && !product.optionProduct && !product.bundle && !product.productSet && product.online && product.assignedToSiteCatalog) {
            if (product.variant) {
                masterProduct = product.variationModel ? product.variationModel.master : null;

                if (masterProduct && deltaMasterProductIDs.indexOf(masterProduct.ID) < 0) {
                    deltaMasterProductIDs.push(masterProduct.ID);
                }
            } else if (deltaMasterProductIDs.indexOf(product.ID) < 0) {
                deltaMasterProductIDs.push(product.ID);
            }
        }
    }
}

/**
 * Extract delta token from the populated string
 * @param {string} populatingString - populated string from the oci delta file
 * @param {string} delimiter - delimiter to extract the delta token
 * @returns {string} - new populated string
 */
function extractDeltaToken(populatingString, delimiter) {
    var tokenString = populatingString.substring(0, populatingString.indexOf(delimiter));
    var lastIndexOfComma = tokenString.lastIndexOf(',');
    tokenString = tokenString.substring(0, lastIndexOfComma);
    tokenString += '}';

    try {
        var tokenObject = JSON.parse(tokenString);
        tokenObject = {
            deltaToken: tokenObject.nextDeltaToken
        };
        ociUtils.saveDeltaToken(tokenObject);
    } catch (e) {
        Logger.debug('Error on parsing tokenString');
        Logger.debug('-' + tokenString + '-');
    }

    var newPopulatingString = populatingString.substring(tokenString.length - 1); // remove all part which is already considered

    return newPopulatingString;
}

/**
 * Extract inventory records from the populated string
 * @param {string} populatingString - populated string from the oci delta file
 * @param {string} delimiter - delimiter to extract the inventory records
 * @returns {string} - new populated string
 */
function extractInventoryRecords(populatingString, delimiter) {
    var newPopulatingString = '{' + populatingString.substring(populatingString.indexOf(delimiter));
    var postSkuPartString = newPopulatingString.substring(delimiter.length + 1); // remove delimiter part from the string

    if (postSkuPartString.indexOf(delimiter) > -1) { // if delimiter is again found, then record is found in string
        var nextIndexOfDelimiter = postSkuPartString.indexOf(delimiter);
        var recordString = newPopulatingString.substring(0, delimiter.length + nextIndexOfDelimiter);
        var lastIndexOfComma = recordString.lastIndexOf(',');
        recordString = recordString.substring(0, lastIndexOfComma);

        try {
            var recordObject = JSON.parse(recordString);
            processDeltaRecordObject(recordObject);
        } catch (e) {
            Logger.debug('Error on parsing recordString');
            Logger.debug('-' + recordString + '-');
        }

        newPopulatingString = newPopulatingString.substring(recordString.length);

        if (newPopulatingString.indexOf(delimiter) > -1) {
            return extractInventoryRecords(newPopulatingString, delimiter);
        } else {
            return newPopulatingString;
        }
    } else { // no record data in the string
        return newPopulatingString;
    }
}

/**
 * Generate inventory records from delta response
 * @param {File} file - delta status file from IMPEX folder
 */
function generateInventoryRecordsFromDeltaResponse(file) {
    var FileReader = require('dw/io/FileReader');
    var readingFile = new FileReader(file);
    var populatingString = '';
    var chunk;
    var deltaTokenFetched = false;
    var deltaTokenKeyFound = false;
    var tokenEndDelimiter = '"shouldQueryAgain"';
    var recordDelimiter = '"sku"';

    // eslint-disable-next-line no-cond-assign
    while (chunk = readingFile.readN(10000)) {
        populatingString += chunk;

        if (!deltaTokenFetched) { // deltaToken not fetched
            if (!deltaTokenKeyFound) { // deltaTokenKey not found
                if (populatingString.indexOf('"nextDeltaToken"') > -1) {
                    deltaTokenKeyFound = true;

                    if (populatingString.indexOf(tokenEndDelimiter) > -1) {
                        populatingString = extractDeltaToken(populatingString, tokenEndDelimiter);
                        deltaTokenFetched = true;
                    }
                }
            } else { // deltaTokenKey found
                if (populatingString.indexOf(tokenEndDelimiter) > -1) {
                    populatingString = extractDeltaToken(populatingString, tokenEndDelimiter);
                    deltaTokenFetched = true;
                }
            }

            // after fetching the token, rest of the string may have inventory records in it
            if (populatingString.indexOf(recordDelimiter) > -1) {
                populatingString = extractInventoryRecords(populatingString, recordDelimiter);
            }
        } else { // deltaToken fetched, checking for inventory records
            if (populatingString.indexOf(recordDelimiter) > -1) {
                populatingString = extractInventoryRecords(populatingString, recordDelimiter);
            }
        }
    }

    // Rest of the populatingString will have last record
    populatingString = populatingString.substring(0, populatingString.lastIndexOf(']'));

    try {
        var recordObject = JSON.parse(populatingString);
        processDeltaRecordObject(recordObject);
    } catch (e) {
        Logger.debug('Error on parsing populatingString' + e.message);
        Logger.debug('-' + populatingString + '-');
    }

    readingFile.close();
    file.remove();
}

/**
 * Delta process of OmniChannel Inventory
 */
function deltaOmniChannelInventory() {
    var File = require('dw/io/File');
    var FileReader = require('dw/io/FileReader');
    var Site = require('dw/system/Site');

    if (ociUtils.ociConfig.ociStatus === 'enabled') { // Omnichannel inventory
        Logger.debug('Setting the Omnichannel inventory delta records in custom cache');

        session.privacy.isChachingFullExport = false;
        session.privacy.renewSkuLevelOciCache = false;
        var result = ociUtils.getAvailabilityDeltas();

        if (result) {
            var baseFolder = File.IMPEX + File.SEPARATOR + 'src';
            var relativeFolder = 'chaching' + File.SEPARATOR + 'export' + File.SEPARATOR + Site.current.ID + File.SEPARATOR + 'OCI';
            var fileName = 'chaching-oci-export-delta.txt';
            var filePath = baseFolder + File.SEPARATOR + relativeFolder + File.SEPARATOR + fileName;

            var readingFile = new File(filePath);
            if (readingFile.exists()) {
                var fileLength = readingFile.length();

                if (fileLength > 900000) {
                    generateInventoryRecordsFromDeltaResponse(readingFile);
                } else {
                    var fileReader = new FileReader(readingFile);
                    var jsonString = fileReader.readString();
                    // Close the reader
                    fileReader.close();
                    // Parse the JSON string
                    var availableDeltas = JSON.parse(jsonString);
                    if (availableDeltas && availableDeltas.nextDeltaToken) {
                        try {
                            var deltaTokenData = {
                                deltaToken: availableDeltas.nextDeltaToken
                            };
                            ociUtils.saveDeltaToken(deltaTokenData);
                        } catch (e) {
                            Logger.error('Error trying to save delta token: ' + e.message);
                        }
                    }

                    if (availableDeltas && availableDeltas.records && availableDeltas.records.length > 0) {
                        var records = availableDeltas.records;
                        for (var i = 0; i < records.length; i++) {
                            var record = records[i];
                            processDeltaRecordObject(record);
                        }
                    }
                }

                if (deltaMasterProductIDs.length > 0) {
                    Logger.debug('deltaMasterProductIDs: ' + JSON.stringify(deltaMasterProductIDs));
                    productExport.processOmniChannelInventory(deltaMasterProductIDs);
                } else {
                    Logger.debug('Delta master product IDs not found');
                }
            } else {
                Logger.debug('File does not exist at path: ' + filePath);
            }
        } else {
            Logger.debug('Error to get OCI delta status.');
        }
    } else { // default SFCC inventory will be processed in another job step
        Logger.debug('Skipping the Omnichannel delta export, because Omnichannel Inventory switch is Disabled in custom site preferences');
    }
}

module.exports = {
    deltaOmniChannelInventory: deltaOmniChannelInventory
};
