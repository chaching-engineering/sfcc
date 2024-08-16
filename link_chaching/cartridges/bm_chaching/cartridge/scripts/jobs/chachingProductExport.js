'use strict';

/* global session */

/**
 * Exports products to Chaching API
 */

/**
 Global variables
 */
var File;
var Site;
var ProductMgr;
var LogUtils;
var chachingUtils;
var ociUtils;
var productExportUtils;
var customLog;
var customAttrNames;
var variationModel;
var variationAttributes;
var customCacheWebdav;
var exportedMasterIDs;
var imageViewTypes;
var consecutiveAPIErrorCount;
var SEP;

/**
 * Gets attributes field of API Request
 * @param {Object} variant - variant product
 * @returns {Object} attributesRequest
 */
function getAttributesRequest(variant) {
    var customAttributes = variant.getCustom();
    var attributesRequest = [];
    var attributeRequest;

    // eslint-disable-next-line no-restricted-syntax
    for (var attrID in customAttributes) {
        if (attrID) {
            attributeRequest = productExportUtils.getVariationAttributeRequest(variant, variationModel, variationAttributes, attrID, customAttrNames[attrID]);

            if (attributeRequest) {
                attributesRequest.push(attributeRequest);
            }
        }
    }

    return attributesRequest;
}

/**
 * Populate request payload for variation products
 * For Chaching for simple products, the same product must be considered as variant to create a master variant structure
 * @param {Object} variant - Variant product
 * @param {Object} masterProduct - Master product
 * @param {Object} masterTaxonomy - Master Request Taxonomy
 * @param {Object} availabilityModel - Availability Model
 * @param {Object} priceObject - Price Model Object
 * @returns {Object} variantRequest
 */
function populateVariantPayload(variant, masterProduct, masterTaxonomy, availabilityModel, priceObject) {
    var variantRequest = {};

    variantRequest.external_id = variant.ID;
    variantRequest.name = variant.name;
    variantRequest.sku = variant.manufacturerSKU ? variant.manufacturerSKU : variant.ID;
    variantRequest.external_parent_id = masterProduct.ID;
    variantRequest.external_source_id = chachingUtils.config.external_source_id;
    variantRequest.account_id = chachingUtils.config.apiEnv === 'live' ? chachingUtils.config.apiAccountIDLive : chachingUtils.config.apiAccountIDDemo;
    variantRequest.brand_name = variant.brand ? variant.brand : '';

    var description = '';

    if (variant.shortDescription) {
        description = variant.shortDescription.source;
    } else if (variant.longDescription) {
        description = variant.longDescription.source;
    }

    variantRequest.description = description;
    variantRequest.currency = priceObject.currencyCode;
    variantRequest.price = priceObject.value;
    variantRequest.purchase_url = require('dw/web/URLUtils').https('Product-Show', 'pid', variant.ID).toString();
    variantRequest.image_url = productExportUtils.getVariantImage(variant, imageViewTypes);

    var keywords = variant.pageKeywords ? variant.pageKeywords.split(',') : [variant.name];
    variantRequest.keywords = [keywords]; // array of arrays
    variantRequest.attributes = getAttributesRequest(variant); // array of objects
    variantRequest.is_valid = masterProduct.online; // master online
    variantRequest.is_in_stock = availabilityModel.inStock;

    var inventoryLevel = 0;

    if (availabilityModel && availabilityModel.inventoryRecord && availabilityModel.inventoryRecord.ATS) {
        inventoryLevel = availabilityModel.inventoryRecord.ATS.value;
    }

    variantRequest.inventory_level = inventoryLevel;

    variantRequest.errors = [[(variant.name ? variant.name : variant.ID) + ' Error']]; // array of arrays

    var categoriesCollection = variant.categories;
    var categoriesIterator = !categoriesCollection.empty ? categoriesCollection.iterator() : null;
    var categories = masterTaxonomy;
    var category;

    if (categoriesIterator) {
        categories = [];

        while (categoriesIterator.hasNext()) {
            category = categoriesIterator.next();
            categories.push(category.displayName);
        }
    }

    variantRequest.taxonomy = categories;
    variantRequest.created_at = variant.getCreationDate().toISOString();
    variantRequest.updated_at = variant.getLastModified().toISOString();

    return variantRequest;
}

/**
 * Populate request Payload with general fields for all types of products
 * @param {Object} product - Product
 * @returns {Object} payload
 */
function populateMasterOrStandardPayload(product) {
    var payload = {};

    payload.external_source_id = chachingUtils.config.external_source_id;
    payload.external_id = product.ID;
    payload.name = product.name;
    payload.published = product.online;

    var description = '';

    if (product.shortDescription) {
        description = product.shortDescription.source;
    } else if (product.longDescription) {
        description = product.longDescription.source;
    }

    payload.description = description;

    var priceObject = product.getPriceModel().price;
    payload.price = priceObject.value;
    payload.sku = product.manufacturerSKU ? product.manufacturerSKU : product.ID;

    var variants;
    var variantsIterator;

    variationAttributes = null;

    if (product.master) {
        variants = product.getVariants();
        variantsIterator = !variants.empty ? variants.iterator() : null;
        variationModel = product.variationModel;
        var variationAttributesCollection = variationModel ? variationModel.getProductVariationAttributes() : null;
        variationAttributes = !variationAttributesCollection.empty ? variationAttributesCollection.iterator().asList().toArray() : null;
    } else {
        var ArrayList = require('dw/util/ArrayList');
        variants = new ArrayList([product]);
        variantsIterator = variants.iterator();
    }

    var variant;
    var allVariantsRequest = [];
    var variantRequest;
    var categoriesCollection = product.categories;
    var categoriesIterator = !categoriesCollection.empty ? categoriesCollection.iterator() : null;
    var category;
    var categories = [];
    var keywords;
    var ociStatus = ociUtils.ociConfig.ociStatus;

    if (categoriesIterator) {
        while (categoriesIterator.hasNext()) {
            category = categoriesIterator.next();
            categories.push(category.displayName);
        }
    }

    payload.taxonomy = categories;

    if (variantsIterator) {
        var exportedVariantIDs = [];

        while (variantsIterator.hasNext()) {
            variant = variantsIterator.next();
            var availabilityModel = ociStatus === 'enabled' ? ociUtils.getOmniChannelInventory(variant.ID) : variant.getAvailabilityModel();
            priceObject = variant.getPriceModel().price;

            if (variant.online && availabilityModel.orderable && priceObject.value > 0) {
                exportedVariantIDs.push(variant.ID);
                variantRequest = populateVariantPayload(variant, product, payload.taxonomy, availabilityModel, priceObject);
                allVariantsRequest.push(variantRequest);
            }
        }

        productExportUtils.setExportedVariantIDsInCache(product.ID, exportedVariantIDs);
    }

    payload.variants = allVariantsRequest;
    keywords = product.pageKeywords ? product.pageKeywords.split(',') : [product.name];
    payload.keywords = [keywords]; // array of strings

    return payload;
}

/**
 * Initiate Export of single product
 * @param {Object} product - Product
 * @returns {boolean} boolean
 */
function initExportSingleProduct(product) {
    // if the product is not a variant then create the api request payload. Variant products will be considered under masters
    if (product && !product.variant && !product.variationGroup && !product.optionProduct && !product.bundle && !product.productSet && product.online && product.assignedToSiteCatalog) {
        if (ociUtils.ociConfig.ociStatus === 'enabled' && session.privacy.renewSkuLevelOciCache) {
            ociUtils.updateSkuLevelDeltaOciRecordsInCache(product);
        }

        var apiMethod = 'POST';
        var apiEndPoint = chachingUtils.config.api.post.create_single_product;
        var productRequest = populateMasterOrStandardPayload(product);

        if (productRequest && productRequest.variants && productRequest.variants.length) {
            customLog.debug('productRequest: ' + JSON.stringify(productRequest));
            var apiResponse = chachingUtils.chachingAPIClient(apiMethod, apiEndPoint, JSON.stringify(productRequest));

            if (!(apiResponse && apiResponse.product && apiResponse.product.id)) {
                customLog.debug('Error on hitting API');
                customLog.debug('productResponse: ' + JSON.stringify(apiResponse));

                consecutiveAPIErrorCount++;

                if (consecutiveAPIErrorCount > 4) {
                    var errorMessage = 'Error on 5 consecutive API calls. Aborting the process. Please ensure that you have connected the integration to ChaChing. OR check the API related settings in custom site preferences. Please trigger the job after some time.';
                    customLog.error(errorMessage);
                    throw errorMessage;
                }
            } else {
                consecutiveAPIErrorCount = 0;
            }

            if (exportedMasterIDs.indexOf(product.ID) < 0) {
                exportedMasterIDs.push(product.ID);
            }

            return true;
        } else if (session.privacy.isChachingFullExport && productExportUtils.isMasterAlreadyExported(product.ID)) { // Full export and previously exported master product
            customLog.debug('During the full export this product is found for deleting on Chaching: ' + product.ID);
            productExportUtils.deleteMasterFromChaching(product.ID);
            productExportUtils.rewriteExportedMasterCSV([product.ID]);
        } else if (!session.privacy.isChachingFullExport) { // Delta export
            customLog.debug('During the delta export this product is found for deleting on Chaching: ' + product.ID);
            productExportUtils.deleteMasterFromChaching(product.ID);
            productExportUtils.rewriteExportedMasterCSV([product.ID]);
        }
    }

    return false;
}

/**
 * Process XML of fulll and delta exports
 * @param {Object} xmlFile - XML file
 */
function processXML(xmlFile) {
    var FileReader = require('dw/io/FileReader');
    var XMLStreamReader = require('dw/io/XMLStreamReader');

    var xmlFileReader = new FileReader(xmlFile);
    var xmlStreamReader = new XMLStreamReader(xmlFileReader);
    var StreamConstants = require('dw/io/XMLStreamConstants');

    var productID;
    var localElementName;
    var product;

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
                initExportSingleProduct(product);
            }
        }
    }

    productExportUtils.setExportedMasterIDsInCache(exportedMasterIDs);

    xmlStreamReader.close();
    xmlFileReader.close();

    xmlFile.remove();
}

/**
 * Initialize global variables
 */
function initGlobalVariables() {
    chachingUtils = require('*/cartridge/scripts/utils/chachingHttpServiceUtils');
    productExportUtils = require('~/cartridge/scripts/utils/chachingProductExportUtils');
    customCacheWebdav = require('*/cartridge/scripts/utils/customCacheWebdav');
    ociUtils = require('*/cartridge/scripts/utils/chachingOCIServiceUtils');
    LogUtils = require('*/cartridge/scripts/utils/chachingLogUtils');
    customLog = LogUtils.getLogger('chachingProductExport');

    ProductMgr = require('dw/catalog/ProductMgr');
    File = require('dw/io/File');
    Site = require('dw/system/Site');
    SEP = File.SEPARATOR;

    customAttrNames = productExportUtils.getCustomAttrNames();
    imageViewTypes = productExportUtils.getImageViewTypesFromCache();
    exportedMasterIDs = [];
    consecutiveAPIErrorCount = 0;
}

/**
 * Execution starting of the product full export module
 */
function fullExport() {
    session.privacy.isChachingFullExport = true;
    session.privacy.renewSkuLevelOciCache = false;
    initGlobalVariables();
    productExportUtils.resetExportedMasterIDsInCache();

    var readFilePath = File.IMPEX + SEP + 'src' + SEP + 'chaching' + SEP + 'export' + SEP + Site.current.ID + SEP + 'chaching-export-catalog.xml';
    var readXmlFile = new File(readFilePath);

    if (readXmlFile.exists()) {
        var FileReader = require('dw/io/FileReader');
        var XMLStreamReader = require('dw/io/XMLStreamReader');

        var xmlFileReader = new FileReader(readXmlFile);
        var xmlStreamReader = new XMLStreamReader(xmlFileReader);
        var StreamConstants = require('dw/io/XMLStreamConstants');

        var localElementName;
        var streamReaderNextValue;
        imageViewTypes = [];

        while (xmlStreamReader.hasNext()) {
            streamReaderNextValue = xmlStreamReader.next();

            if (streamReaderNextValue === StreamConstants.START_ELEMENT) {
                localElementName = xmlStreamReader.getLocalName();

                if (localElementName === 'view-type') {
                    imageViewTypes.push(xmlStreamReader.readElementText());
                }
            } else if (streamReaderNextValue === StreamConstants.END_ELEMENT) {
                localElementName = xmlStreamReader.getLocalName();

                if (localElementName === 'view-types') {
                    break;
                }
            }
        }

        xmlStreamReader.close();
        xmlFileReader.close();

        var customCacheEndPoint = '/' + Site.current.ID + '/image-view-types';
        customCacheWebdav.setCache(customCacheEndPoint, imageViewTypes);

        processXML(readXmlFile);
    }
}

/**
 * Unzip Delta exported file
 */
function unzipDelta() {
    productExportUtils = require('~/cartridge/scripts/utils/chachingProductExportUtils');
    productExportUtils.unzipDelta();
}

/**
 * Find and process Delta XML
 * @param {string} metaFile - Meta File name
 * @param {string} deltaFolderPath - Delta Folder Path
 */
function findProcessXML(metaFile, deltaFolderPath) {
    var FileReader = require('dw/io/FileReader');
    var metaFileReader = new FileReader(metaFile);
    var metaLine = metaFileReader.readLine();
    var zipFileName;
    var unzipFolderName;
    var i;

    while (metaLine) {
        if (metaLine.indexOf('delta.file.prefix') > -1) {
            zipFileName = metaLine.split('delta.file.prefix=').pop() + '.zip';
            var zipFile = new File(deltaFolderPath + SEP + zipFileName);

            if (zipFile.exists()) {
                zipFile.remove();
            }
        }

        if (metaLine.indexOf('filename') > -1) {
            unzipFolderName = metaLine.split('filename=').pop();
            break;
        }

        metaLine = metaFileReader.readLine();
    }

    var catalogsFolderPath = deltaFolderPath + SEP + unzipFolderName + SEP + 'catalogs';
    var catalogsFolder = new File(catalogsFolderPath);

    if (catalogsFolder.exists() && catalogsFolder.directory) {
        var catalogFoldersList = catalogsFolder.listFiles();
        var catalogFolders = catalogFoldersList.size() ? catalogFoldersList.toArray() : [];
        var xmlFilePath;
        var xmlFile;

        for (i = 0; i < catalogFolders.length; i++) {
            if (catalogFolders[i].directory) {
                xmlFilePath = catalogFolders[i].fullPath + SEP + 'catalog.xml';
                xmlFile = new File(xmlFilePath);

                if (xmlFile.exists()) {
                    processXML(xmlFile);
                }

                catalogFolders[i].remove();
            }
        }

        catalogsFolder.remove();
    }

    metaFile.remove();

    var unzipFolder = new File(deltaFolderPath + SEP + unzipFolderName);

    if (unzipFolder.exists()) {
        var unzipFolderFilesList = unzipFolder.listFiles();
        var unzipFolderFiles = unzipFolderFilesList.size() ? unzipFolderFilesList.toArray() : [];

        for (i = 0; i < unzipFolderFiles.length; i++) {
            if (unzipFolderFiles[i].exists()) {
                unzipFolderFiles[i].remove();
            }
        }

        unzipFolder.remove();
    }
}

/**
 * Read delta XML
 */
function readDeltaXML() {
    session.privacy.isChachingFullExport = false;
    session.privacy.renewSkuLevelOciCache = true;
    initGlobalVariables();

    var i;

    var deltaFolderPath = File.IMPEX + SEP + 'src' + SEP + 'platform' + SEP + 'outbox' + SEP + 'Everyone' + SEP + 'chaching' + SEP + 'export' + SEP + Site.current.ID + SEP + 'catalog';
    var deltaFolder = new File(deltaFolderPath);

    if (deltaFolder.exists()) {
        var fileList = deltaFolder.listFiles();

        if (fileList.size()) {
            var fileListArray = fileList.toArray();
            var fileName;
            var metaFile;

            for (i = 0; i < fileListArray.length; i++) {
                fileName = fileListArray[i].name;

                if (fileName.split('.').pop() === 'meta') {
                    metaFile = fileListArray[i];
                    findProcessXML(metaFile, deltaFolderPath, SEP);
                }
            }
        }
    }
}

/**
 * Compare inventory XML of single product in custom cache
 * @param {string} productID - Product ID
 * @param {string} contentXML - Price Content XML
 * @param {string} dataType - priecbook or inventory
 */
function comparePriceInventoryInCache(productID, contentXML, dataType) {
    var product = ProductMgr.getProduct(productID);
    var masterProduct;

    if (product && !product.variationGroup && !product.optionProduct && !product.bundle && !product.productSet && product.online && product.assignedToSiteCatalog) {
        var cachePath = '/' + Site.current.ID + '/' + dataType + '/' + productID;
        var cacheData = customCacheWebdav.getCache(cachePath);

        if (!cacheData || (cacheData && cacheData.xmlData !== contentXML.toString())) {
            if (product.variant) {
                masterProduct = product.variationModel ? product.variationModel.master : null;

                if (masterProduct && exportedMasterIDs.indexOf(masterProduct.ID) < 0) {
                    initExportSingleProduct(masterProduct);
                }
            } else {
                initExportSingleProduct(product);
            }

            productExportUtils.writePriceInventoryInCache(productID, contentXML, dataType);
        }
    }
}

/**
 * Process XML of fulll and delta exports for inventory
 * @param {Object} xmlFile - XML File
 * @param {string} dataType - pricebook or inventory
 * @param {boolean} isCacheGenerate - is this method to generate cache or delta process
 */
function processPriceInventoryXML(xmlFile, dataType, isCacheGenerate) {
    var FileReader = require('dw/io/FileReader');
    var XMLStreamReader = require('dw/io/XMLStreamReader');

    var xmlFileReader = new FileReader(xmlFile);
    var xmlStreamReader = new XMLStreamReader(xmlFileReader);
    var StreamConstants = require('dw/io/XMLStreamConstants');

    var productID;
    var localElementName;
    var contentXML;
    var xmlTagName = (dataType === 'listpricebook' || dataType === 'salepricebook') ? 'price-table' : 'record';

    while (xmlStreamReader.hasNext()) {
        if (xmlStreamReader.next() === StreamConstants.START_ELEMENT) {
            localElementName = xmlStreamReader.getLocalName();

            if (localElementName === xmlTagName) {
                var attrCount = xmlStreamReader.getAttributeCount();

                for (var i = 0; i < attrCount; i++) {
                    if (xmlStreamReader.getAttributeLocalName(i) === 'product-id') {
                        productID = xmlStreamReader.getAttributeValue(i);
                        break;
                    }
                }

                contentXML = xmlStreamReader.readXMLObject();

                if (contentXML) {
                    if (isCacheGenerate) {
                        productExportUtils.writePriceInventoryInCache(productID, contentXML, dataType);
                    } else {
                        comparePriceInventoryInCache(productID, contentXML, dataType);
                    }
                }
            }
        }
    }

    if (!isCacheGenerate) {
        productExportUtils.setExportedMasterIDsInCache(exportedMasterIDs);
    }

    xmlStreamReader.close();
    xmlFileReader.close();

    xmlFile.remove();
}

/**
 * Common function for pricebook and inventory cache set and delta process
 * @param {string} dataType - price or inventory
 * @param {boolean} isCacheGenerate - is this method to generate cache or delta process
 */
function priceInventoryRoute(dataType, isCacheGenerate) {
    var readFilePath = File.IMPEX + SEP + 'src' + SEP + 'chaching' + SEP + 'export' + SEP + Site.current.ID + SEP + 'chaching-export-' + dataType + '-' + (isCacheGenerate ? 'full' : 'delta') + '.xml';

    var readXmlFile = new File(readFilePath);

    if (readXmlFile.exists()) {
        processPriceInventoryXML(readXmlFile, dataType, isCacheGenerate);
    }
}

/**
 * Execution starting of the list pricebook set to cache
 */
function setListPriceCache() {
    initGlobalVariables();
    priceInventoryRoute('listpricebook', true);
}

/**
 * Execution starting of the list pricebook set to cache
 */
function setSalePriceCache() {
    initGlobalVariables();
    priceInventoryRoute('salepricebook', true);
}

/**
 * Execution starting of the inventory set to cache
 */
function setInventoryCache() {
    initGlobalVariables();

    if (ociUtils.ociConfig.ociStatus === 'disabled') { // default SFCC inventory
        customLog.debug('Setting default SFCC inventory records in cache');
        priceInventoryRoute('inventory', true);
    } else {
        customLog.debug('Omnichannel inventory switch is enabled in Custom Site Preferences, so skipping default SFCC inventory records');
    }
}

/**
 * Execution starting of the compare list pricebook date from cache
 */
function deltaListPrice() {
    initGlobalVariables();
    priceInventoryRoute('listpricebook', false);
}

/**
 * Execution starting of the compare sale pricebook date from cache
 */
function deltaSalePrice() {
    initGlobalVariables();
    priceInventoryRoute('salepricebook', false);
}

/**
 * Execution starting of the compare pricebook date from cache
 */
function deltaInventory() {
    initGlobalVariables();

    if (ociUtils.ociConfig.ociStatus === 'disabled') { // default SFCC inventory
        priceInventoryRoute('inventory', false);
    }
}

/**
 * Process delta data for OmniChannel Inventory
 * @param {Object} deltaMasterProductIDs - Delta Master Product IDs
 */
function processOmniChannelInventory(deltaMasterProductIDs) {
    if (deltaMasterProductIDs.length) {
        var product;

        for (var i = 0; i < deltaMasterProductIDs.length; i++) {
            product = ProductMgr.getProduct(deltaMasterProductIDs[i]);
            initExportSingleProduct(product);
        }

        productExportUtils.setExportedMasterIDsInCache(deltaMasterProductIDs);
    }
}

/**
 * Delta process of OmniChannel Inventory
 */
function deltaOmniChannelInventory() {
    initGlobalVariables();

    if (ociUtils.ociConfig.ociStatus === 'enabled') { // Omnichannel inventory
        customLog.debug('Setting the Omnichannel inventory delta records in custom cache');

        session.privacy.isChachingFullExport = false;
        session.privacy.renewSkuLevelOciCache = false;
        var availableDeltas = ociUtils.getAvailabilityDeltas();

        if (availableDeltas && availableDeltas.nextDeltaToken) {
            try {
                var deltaTokenData = {
                    deltaToken: availableDeltas.nextDeltaToken
                };
                ociUtils.saveDeltaToken(deltaTokenData);
            } catch (e) {
                customLog.error('Error trying to save delta token: ' + e.message);
            }

            var records = availableDeltas.records;

            if (records.length > 0) {
                customLog.debug('Delta OCI records: ' + JSON.stringify(records));
                var deltaMasterProductIDs = [];
                var product;
                var masterProduct;

                for (var i = 0; i < records.length; i++) {
                    var record = records[i];

                    if (record.sku) {
                        ociUtils.saveInventoryRecord(record);
                        product = ProductMgr.getProduct(record.sku);

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

                customLog.debug('deltaMasterProductIDs: ' + JSON.stringify(deltaMasterProductIDs));
                processOmniChannelInventory(deltaMasterProductIDs);
            } else {
                customLog.debug('Omnichannel inventory delta records not found');
            }
        } else {
            customLog.error(availableDeltas.message);
        }
    } else { // default SFCC inventory will be processed in another job step
        customLog.debug('Skipping the Omnichannel delta export, because Omnichannel Inventory switch is Disabled in custom site preferences');
    }
}

/**
 * Delta process deleted products to delete them from Chaching API
 */
function deltaDeletedProducts() {
    initGlobalVariables();

    var updateMasterIDs = productExportUtils.deltaDeletedMasterProducts();
    var product;

    for (var i = 0; i < updateMasterIDs.length; i++) {
        product = ProductMgr.getProduct(updateMasterIDs[i]);
        initExportSingleProduct(product);
    }
}

module.exports = {
    fullExport: fullExport,
    unzipDelta: unzipDelta,
    readDeltaXML: readDeltaXML,
    setListPriceCache: setListPriceCache,
    deltaListPrice: deltaListPrice,
    setSalePriceCache: setSalePriceCache,
    deltaSalePrice: deltaSalePrice,
    setInventoryCache: setInventoryCache,
    deltaInventory: deltaInventory,
    deltaOmniChannelInventory: deltaOmniChannelInventory,
    deltaDeletedProducts: deltaDeletedProducts
};
