'use strict';

var Site = require('dw/system/Site');
var File = require('dw/io/File');
var ProductMgr = require('dw/catalog/ProductMgr');

const SEP = File.SEPARATOR;

var LogUtils = require('*/cartridge/scripts/utils/chachingLogUtils');
var customCacheWebdav = require('*/cartridge/scripts/utils/customCacheWebdav');
var chachingUtils = require('*/cartridge/scripts/utils/chachingHttpServiceUtils');
var ociUtils = require('*/cartridge/scripts/utils/chachingOCIServiceUtils');
var customLog = LogUtils.getLogger('chachingPreparePricebookCache');
var csvFolderPath = File.IMPEX + SEP + 'customcache' + SEP + 'chaching' + SEP + Site.current.ID + SEP + 'exported_products';
var exportedMasterProductsCsvName = 'exported_master_ids.csv';
var deletedMasterIDs;

var Utils = {
    /**
     * Unzip Delta exported file
     */
    unzipDelta: function () {
        var deltaFolderPath = File.IMPEX + SEP + 'src' + SEP + 'platform' + SEP + 'outbox' + SEP + 'Everyone' + SEP + 'chaching' + SEP + 'export' + SEP + Site.current.ID + SEP + 'catalog';
        var deltaFolder = new File(deltaFolderPath);

        if (deltaFolder.exists()) {
            var fileList = deltaFolder.listFiles();

            if (fileList.size()) {
                var fileListArray = fileList.toArray();
                var fileName;

                for (var i = 0; i < fileListArray.length; i++) {
                    fileName = fileListArray[i].name;

                    if (fileName.split('.').pop() === 'zip') {
                        fileListArray[i].unzip(deltaFolder);
                    }
                }
            }
        }
    },
    /**
     *  Write Inventory XML of single product to custom cache
     * @param {string} productID - Product ID
     * @param {string} contentXML - Price Content XML
     * @param {string} dataType - priecbook or inventory
     */
    writePriceInventoryInCache: function (productID, contentXML, dataType) {
        var product = ProductMgr.getProduct(productID);

        if (product && !product.variationGroup && !product.optionProduct && !product.bundle && !product.productSet && product.online && product.assignedToSiteCatalog) {
            var cachePath = '/' + Site.current.ID + '/' + dataType + '/' + productID;
            customCacheWebdav.setCache(cachePath, { xmlData: contentXML.toString() });
        }
    },
    /**
     * Remove all exported product IDs from cache
     */
    resetExportedMasterIDsInCache: function () {
        // Variants folder
        var csvVariantsFolder = new File(csvFolderPath + SEP + 'variants');

        if (csvVariantsFolder.exists() && csvVariantsFolder.directory) {
            var variantCSVList = csvVariantsFolder.listFiles();
            var variantCSVs = variantCSVList.size() ? variantCSVList.toArray() : [];

            for (var i = 0; i < variantCSVs.length; i++) {
                variantCSVs[i].remove();
            }

            csvVariantsFolder.remove();
        }

        csvVariantsFolder.mkdirs();

        // Master csv file
        var masterCSVFile = new File(csvFolderPath + SEP + exportedMasterProductsCsvName);

        if (masterCSVFile.exists()) {
            masterCSVFile.remove();
        }
    },
    /**
     * Sets Exported Master IDs in Cache
     * @param {Object} exportedMasterIDs - Exported Master Product IDs as array
     */
    setExportedMasterIDsInCache: function (exportedMasterIDs) {
        var csvFileProductsPath = csvFolderPath + SEP + exportedMasterProductsCsvName;
        var csvFileProducts = new File(csvFileProductsPath);

        if (!csvFileProducts.exists()) {
            csvFileProducts.createNewFile();
        }

        var originalFileName = csvFileProducts.fullPath;
        var tempFileName = originalFileName.replace('.csv', '-chaching-temp-file.csv');
        var tempFile = new File(tempFileName);

        var FileReader = require('dw/io/FileReader');
        var CSVStreamReader = require('dw/io/CSVStreamReader');
        var csvFileReaderProducts = new FileReader(csvFileProducts, 'UTF-8');
        var csvStreamReaderProducts = new CSVStreamReader(csvFileReaderProducts, ',');

        var FileWriter = require('dw/io/FileWriter');
        var CSVStreamWriter = require('dw/io/CSVStreamWriter');
        var csvFileWriterProducts = new FileWriter(tempFile, 'UTF-8');
        var csvStreamWriterProducts = new CSVStreamWriter(csvFileWriterProducts, ',');

        var arrIndex;
        var i;
        var readLine = csvStreamReaderProducts.readNext();

        while (readLine) {
            arrIndex = exportedMasterIDs.indexOf(readLine[0]);

            if (arrIndex > -1) {
                exportedMasterIDs.splice(arrIndex, 1);
            }

            csvStreamWriterProducts.writeNext(readLine);
            readLine = csvStreamReaderProducts.readNext();
        }

        for (i = 0; i < exportedMasterIDs.length; i++) {
            csvStreamWriterProducts.writeNext(exportedMasterIDs[i]);
        }

        csvStreamWriterProducts.close();
        csvFileWriterProducts.close();

        csvStreamReaderProducts.close();
        csvFileReaderProducts.close();

        tempFile.renameTo(csvFileProducts);
        tempFile.remove();
    },
    /**
     * Sets Exported Variant IDs in Cache
     * @param {string} masterID - Master Product ID
     * @param {Object} exportedVariantIDs - Exported Variant IDs Array
     */
    setExportedVariantIDsInCache: function (masterID, exportedVariantIDs) {
        var csvFileProductsPath = csvFolderPath + SEP + 'variants' + SEP + masterID + '.csv';
        var csvFileProducts = new File(csvFileProductsPath);

        if (!csvFileProducts.exists()) {
            csvFileProducts.createNewFile();
        }

        var FileWriter = require('dw/io/FileWriter');
        var CSVStreamWriter = require('dw/io/CSVStreamWriter');
        var csvFileWriterProducts = new FileWriter(csvFileProducts, 'UTF-8');
        var csvStreamWriterProducts = new CSVStreamWriter(csvFileWriterProducts, ',');
        var i;

        for (i = 0; i < exportedVariantIDs.length; i++) {
            csvStreamWriterProducts.writeNext(exportedVariantIDs[i]);
        }

        csvStreamWriterProducts.close();
        csvFileWriterProducts.close();
    },
    /**
     * Gets variant image
     * @param {Object} variant - Variant Product
     * @param {Object} imageViewTypes - image View Types as array
     * @returns {string} imageURL
     */
    getVariantImage: function (variant, imageViewTypes) {
        var imageURL = '';
        var images;
        var viewTypeImages = variant.getImages(chachingUtils.config.imageViewType);

        if (viewTypeImages && viewTypeImages.length && viewTypeImages.length > chachingUtils.config.imageIndex) {
            imageURL = viewTypeImages[chachingUtils.config.imageIndex].getHttpsURL().toString();

            return imageURL;
        }

        for (var i = 0; i < imageViewTypes.length; i++) {
            images = variant.getImages(imageViewTypes[i]);

            if (images && images.length) {
                for (var j = 0; j < images.length; j++) {
                    if (images[j] && images[j].getHttpsURL()) {
                        imageURL = images[j].getHttpsURL().toString();
                        break;
                    }
                }
            }

            if (imageURL) {
                break;
            }
        }

        return imageURL;
    },
    /**
     * Gets Image View Types from Cache
     * @returns {Object} imageViewTypes
     */
    getImageViewTypesFromCache: function () {
        var customCacheEndPoint = '/' + Site.current.ID + '/image-view-types';
        var imageViewTypes = customCacheWebdav.getCache(customCacheEndPoint);
        imageViewTypes = !imageViewTypes ? [] : imageViewTypes;

        return imageViewTypes;
    },
    /**
     * Get Custom Attribute Definitions of product object
     * @returns {Object} attrDefinitions
     */
    getCustomAttrNames: function () {
        var productAttrs = require('dw/object/SystemObjectMgr').describe('Product').getAttributeDefinitions().toArray();
        var attrDefinitions = {};

        for (var i = 0; i < productAttrs.length; i++) {
            if (!productAttrs[i].system) {
                attrDefinitions[productAttrs[i].ID] = productAttrs[i].displayName;
            }
        }

        return attrDefinitions;
    },
    /**
     * Gets variation attribute value
     * @param {Object} variant - Variant product
     * @param {Object} variationModel - Variation Model
     * @param {Object} variationAttributes - Variation Attributes
     * @param {string} attrID - Custom Attribute ID
     * @param {string} customAttrName - Custom Attribute Name
     * @returns {Object} attributeRequest
     */
    getVariationAttributeRequest: function (variant, variationModel, variationAttributes, attrID, customAttrName) {
        var attributeRequest;

        if (variationAttributes && variationAttributes.length) {
            var variationAttribute;
            var variationAttributeValue;

            for (var i = 0; i < variationAttributes.length; i++) {
                variationAttribute = variationAttributes[i];

                if (attrID === variationAttribute.attributeID) {
                    variationAttributeValue = variationModel.getVariationValue(variant, variationAttribute);

                    if (variationAttributeValue) {
                        attributeRequest = {
                            id: attrID,
                            name: customAttrName,
                            value: variationAttributeValue.displayValue
                        };
                    }

                    break;
                }
            }
        }

        return attributeRequest;
    },
    /**
     * Process Deleted Variant product
     * @param {string} variantID - Variant Product ID
     * @returns {boolean} isDeleted
     */
    processDeletedVariant: function (variantID) {
        var ociStatus = ociUtils.ociConfig.ociStatus;
        var isDeleted = false;

        var variant = ProductMgr.getProduct(variantID);

        if (variant) {
            var availabilityModel = ociStatus === 'enabled' ? ociUtils.getOmniChannelInventory(variantID) : variant.getAvailabilityModel();
            var priceObject = variant.getPriceModel().price;

            if (!variant.online || !availabilityModel.orderable || priceObject.value === 0) {
                isDeleted = true;
            }
        } else {
            isDeleted = true;
        }

        return isDeleted;
    },
    /**
     * Checks if Variant  to be Deleted
     * @param {string} productID - Product ID
     * @returns {boolean} variantDeleted
     */
    isVariantDeleted: function (productID) {
        var variantDeleted = false;

        var variantCSVFile = new File(csvFolderPath + SEP + 'variants' + SEP + productID + '.csv');

        if (variantCSVFile.exists()) {
            var FileReader = require('dw/io/FileReader');
            var CSVStreamReader = require('dw/io/CSVStreamReader');
            var csvFileReaderProducts = new FileReader(variantCSVFile, 'UTF-8');
            var csvStreamReaderProducts = new CSVStreamReader(csvFileReaderProducts, ',');

            var readLine = csvStreamReaderProducts.readNext();

            while (readLine) {
                variantDeleted = Utils.processDeletedVariant(readLine[0]);

                if (variantDeleted) {
                    break; // atleast one variant is to be deleted
                }

                readLine = csvStreamReaderProducts.readNext();
            }

            csvStreamReaderProducts.close();
            csvFileReaderProducts.close();
        }

        return variantDeleted;
    },
    /**
     * Gets Orderable Variant Count
     * @param {Object} product - Product
     * @returns {boolean} count
     */
    checkForOrderableVariant: function (product) {
        var hasOrderableVariant = false;
        var variants;
        var variantsIterator;
        var ociStatus = ociUtils.ociConfig.ociStatus;

        if (product.master) {
            variants = product.getVariants();
            variantsIterator = !variants.empty ? variants.iterator() : null;
        } else {
            var ArrayList = require('dw/util/ArrayList');
            variants = new ArrayList([product]);
            variantsIterator = variants.iterator();
        }
        var variant;

        if (variantsIterator) {
            while (variantsIterator.hasNext()) {
                variant = variantsIterator.next();

                var availabilityModel = ociStatus === 'enabled' ? ociUtils.getOmniChannelInventory(variant.ID) : variant.getAvailabilityModel();
                var priceObject = variant.getPriceModel().price;

                if (variant.online && availabilityModel.orderable && priceObject.value > 0) {
                    hasOrderableVariant = true;
                    break; // break if atleast 1 orderable variant is found
                }
            }
        }

        return hasOrderableVariant;
    },
    /**
     * Delete Master from Chaching
     * @param {string} productID - Product ID
     * @returns {boolean} result
     */
    deleteMasterFromChaching: function (productID) {
        var result = false;
        var apiMethod = 'DELETE';
        var apiEndPoint = chachingUtils.config.api.delete.delete_product_by_sfcc_id;
        var apiRequest = {
            external_source_id: chachingUtils.config.external_source_id,
            external_id: productID
        };
        var apiResponse = chachingUtils.chachingAPIClient(apiMethod, apiEndPoint, JSON.stringify(apiRequest));

        if (apiResponse && apiResponse.product && apiResponse.product.id) {
            customLog.debug('Product Delete operation success for product: ' + productID);

            result = true;
        } else {
            customLog.debug('Product Delete operation failed for product: ' + productID);
            customLog.debug('API Response: ' + JSON.stringify(apiResponse));

            if (apiResponse && apiResponse.indexOf('not find product') > -1) {
                // product was not found on Chaching returning true because this product ID has to be deleted from CSV
                result = true;
            }
        }

        return result;
    },
    /**
     * Process Deleted Master product
     * @param {string} productID - Product ID
     * @returns {Object} masterDeleteResult
     */
    processDeletedMaster: function (productID) {
        var masterDeleteResult = {
            deleted: false,
            variantDeleted: false
        };

        var product = ProductMgr.getProduct(productID);

        if (!(product && !product.variant && !product.variationGroup && !product.optionProduct && !product.bundle && !product.productSet && product.online && product.assignedToSiteCatalog)) {
            // Negating the export condition to delete products from Chaching
            masterDeleteResult.deleted = Utils.deleteMasterFromChaching(productID);
        } else {
            // If master level not required to delete then check on variants level
            var hasOrderableVariant = Utils.checkForOrderableVariant(product);

            if (!hasOrderableVariant) {
                masterDeleteResult.deleted = Utils.deleteMasterFromChaching(productID);
            }
        }

        if (!masterDeleteResult.deleted) {
            masterDeleteResult.variantDeleted = Utils.isVariantDeleted(productID);
        }

        return masterDeleteResult;
    },
    /**
     * Rewrite Exported Master CSV and Variants CSV
     * @param {Object} deletedProductIDs - Deleted Master Product IDs
     */
    rewriteExportedMasterCSV: function (deletedProductIDs) {
        deletedMasterIDs = deletedProductIDs;
        var variantCSVFile;
        var i;

        for (i = 0; i < deletedMasterIDs.length; i++) {
            variantCSVFile = new File(csvFolderPath + SEP + 'variants' + SEP + deletedMasterIDs[i] + '.csv');

            if (variantCSVFile.exists()) {
                variantCSVFile.remove();
            }
        }

        var csvFileProductsPath = csvFolderPath + SEP + exportedMasterProductsCsvName;
        var csvFileProducts = new File(csvFileProductsPath);

        if (csvFileProducts.exists()) {
            var originalFileName = csvFileProducts.fullPath;
            var tempFileName = originalFileName.replace('.csv', '-chaching-temp-file.csv');
            var tempFile = new File(tempFileName);

            var FileReader = require('dw/io/FileReader');
            var CSVStreamReader = require('dw/io/CSVStreamReader');
            var csvFileReaderProducts = new FileReader(csvFileProducts, 'UTF-8');
            var csvStreamReaderProducts = new CSVStreamReader(csvFileReaderProducts, ',');

            var FileWriter = require('dw/io/FileWriter');
            var CSVStreamWriter = require('dw/io/CSVStreamWriter');
            var csvFileWriterProducts = new FileWriter(tempFile, 'UTF-8');
            var csvStreamWriterProducts = new CSVStreamWriter(csvFileWriterProducts, ',');

            var arrIndex;
            var readline = csvStreamReaderProducts.readNext();

            while (readline) {
                arrIndex = deletedMasterIDs.indexOf(readline[0]);

                if (arrIndex < 0) {
                    csvStreamWriterProducts.writeNext(readline);
                }

                readline = csvStreamReaderProducts.readNext();
            }

            csvStreamWriterProducts.close();
            csvFileWriterProducts.close();

            csvStreamReaderProducts.close();
            csvFileReaderProducts.close();

            tempFile.renameTo(csvFileProducts);
            tempFile.remove();
        }
    },
    /**
     * Delta Deleted Master Products
     * @returns {Object} updateMasterIDs
     */
    deltaDeletedMasterProducts: function () {
        deletedMasterIDs = [];
        var updateMasterIDs = [];
        var masterCSVFile = new File(csvFolderPath + SEP + exportedMasterProductsCsvName);

        if (masterCSVFile.exists()) {
            var FileReader = require('dw/io/FileReader');
            var CSVStreamReader = require('dw/io/CSVStreamReader');
            var csvFileReaderProducts = new FileReader(masterCSVFile, 'UTF-8');
            var csvStreamReaderProducts = new CSVStreamReader(csvFileReaderProducts, ',');
            var masterDeleteResult;

            var readLine = csvStreamReaderProducts.readNext();

            while (readLine) {
                masterDeleteResult = Utils.processDeletedMaster(readLine[0]);

                if (masterDeleteResult && masterDeleteResult.deleted) {
                    deletedMasterIDs.push(readLine[0]);
                }

                if (masterDeleteResult && masterDeleteResult.variantDeleted) {
                    updateMasterIDs.push(readLine[0]);
                }

                readLine = csvStreamReaderProducts.readNext();
            }

            csvStreamReaderProducts.close();
            csvFileReaderProducts.close();

            if (deletedMasterIDs.length) {
                Utils.rewriteExportedMasterCSV(deletedMasterIDs);
            }
        }

        return updateMasterIDs;
    },
    /**
     * Checks if the master product ID exists in exported master ID CSV file
     * @param {string} productID - Product ID
     * @returns {boolean} isMasterFound
     * */
    isMasterAlreadyExported: function (productID) {
        var masterCSVFile = new File(csvFolderPath + SEP + exportedMasterProductsCsvName);
        var isMasterFound = false;

        if (masterCSVFile.exists()) {
            var FileReader = require('dw/io/FileReader');
            var CSVStreamReader = require('dw/io/CSVStreamReader');
            var csvFileReaderProducts = new FileReader(masterCSVFile, 'UTF-8');
            var csvStreamReaderProducts = new CSVStreamReader(csvFileReaderProducts, ',');

            var readLine = csvStreamReaderProducts.readNext();

            while (readLine) {
                if (readLine[0] === productID) {
                    isMasterFound = true;
                    break;
                }

                readLine = csvStreamReaderProducts.readNext();
            }
        }

        return isMasterFound;
    }
};

module.exports = Utils;
