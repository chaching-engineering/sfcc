'use strict';

/* eslint-disable no-else-return */

var ociUtils = require('*/cartridge/scripts/utils/chachingOCIServiceUtils');
var LogUtils = require('*/cartridge/scripts/utils/chachingLogUtils');
var Logger = LogUtils.getLogger('chachingOCIExport');

/**
 * Export OCI inventory
 * @returns {Object} - status
 */
function exportOCI() {
    var Status = require('dw/system/Status');

    if (ociUtils.ociConfig.ociStatus === 'disabled') {
        Logger.debug('Skipping the Omnichannel full export');
        Logger.debug('Reason: Omnichannel Inventory is Disabled on configuration under configuration group - Chaching Onmichannel Inventory Configurations');

        return new Status(Status.OK);
    }

    ociUtils.deleteInventoryCache();

    Logger.debug('Omnichannel inventory records full export starts');

    var deltaToken = ociUtils.getDeltaTokenFromCache();

    if (!deltaToken) {
        var tokenObj = ociUtils.createNewDeltaToken();
        if (tokenObj.deltaToken) {
            ociUtils.saveDeltaToken(tokenObj);
        }
    }

    var File = require('dw/io/File');
    var SEP = File.SEPARATOR;
    var Site = require('dw/system/Site');
    var ProductMgr = require('dw/catalog/ProductMgr');
    var readFilePath = File.IMPEX + SEP + 'src' + SEP + 'chaching' + SEP + 'export' + SEP + Site.current.ID + SEP + 'chaching-export-catalog.xml';
    var readXmlFile = new File(readFilePath);

    if (readXmlFile.exists()) {
        var FileReader = require('dw/io/FileReader');
        var XMLStreamReader = require('dw/io/XMLStreamReader');
        var xmlFileReader = new FileReader(readXmlFile);
        var xmlStreamReader = new XMLStreamReader(xmlFileReader);
        var StreamConstants = require('dw/io/XMLStreamConstants');
        var productID;
        var localElementName;
        var product;
        var skus = [];
        var skuLimit = 100;
        var mastersForLog = [];
        var totalMastersSent = 0;
        var totalVariantsSent = 0;
        var totalHundredBatchesSent = 0;

        while (xmlStreamReader.hasNext()) {
            if (xmlStreamReader.next() === StreamConstants.START_ELEMENT) {
                localElementName = xmlStreamReader.getLocalName();

                if (localElementName === 'product') {
                    var attrCount = xmlStreamReader.getAttributeCount();

                    for (var i = 0; i < attrCount; i++) {
                        if (xmlStreamReader.getAttributeLocalName(i) === 'product-id') {
                            productID = xmlStreamReader.getAttributeValue(i);
                            break;
                        }
                    }

                    product = ProductMgr.getProduct(productID);

                    if (product && !product.variant && !product.variationGroup && !product.optionProduct && !product.bundle && !product.productSet) {
                        if (product.master) {
                            mastersForLog.push(product.ID);
                            var variants = product.getVariants();
                            var variantsIterator = !variants.empty ? variants.iterator() : null;
                            var variant;

                            if (variantsIterator) {
                                while (variantsIterator.hasNext()) {
                                    variant = variantsIterator.next();
                                    skus.push(variant.ID);

                                    if (skus.length === skuLimit) {
                                        Logger.debug('OCI API call for 100 SKUs for masters and simple products: ' + JSON.stringify(mastersForLog));
                                        totalMastersSent += mastersForLog.length;
                                        totalVariantsSent += 100;
                                        totalHundredBatchesSent++;
                                        mastersForLog = [];
                                        ociUtils.setOciSkusInventoryInCache(skus);
                                        skus = [];
                                    }
                                }
                            }
                        } else { // simple product
                            mastersForLog.push(product.ID);
                            skus.push(product.ID);

                            if (skus.length === skuLimit) {
                                Logger.debug('OCI API call for 100 SKUs for masters and simple products: ' + JSON.stringify(mastersForLog));
                                totalMastersSent += mastersForLog.length;
                                totalVariantsSent += 100;
                                totalHundredBatchesSent++;
                                mastersForLog = [];
                                ociUtils.setOciSkusInventoryInCache(skus);
                                skus = [];
                            }
                        }
                    }
                }
            }
        }

        if (skus.length) {
            Logger.debug('OCI API call for ' + skus.length + ' SKUs for masters and simple products: ' + JSON.stringify(mastersForLog));
            totalMastersSent += mastersForLog.length;
            totalVariantsSent += skus.length;
            totalHundredBatchesSent++;
            ociUtils.setOciSkusInventoryInCache(skus);
        }

        Logger.debug('***************************');
        Logger.debug('Total Masters and simple products considered: ' + totalMastersSent);
        Logger.debug('Total Variants sent: ' + totalVariantsSent);
        Logger.debug('Total Batch calls: ' + totalHundredBatchesSent);

        xmlStreamReader.close();
        xmlFileReader.close();

        return new Status(Status.OK);
    } else {
        Logger.error('chaching-export-catalog.xml file not found');
        return new Status(Status.ERROR);
    }
}

module.exports = {
    exportOCI: exportOCI
};
