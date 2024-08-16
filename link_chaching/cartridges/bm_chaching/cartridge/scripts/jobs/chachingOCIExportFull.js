'use strict';

var ociUtils = require('*/cartridge/scripts/utils/chachingOCIServiceUtils');
var LogUtils = require('*/cartridge/scripts/utils/chachingLogUtils');
var Logger = LogUtils.getLogger('chachingOCIExport');

/**
 * Initiates an export of the Product Segmentation rules that have been loaded into the system.
 * @returns {Object} - exportId and exportStatusLink
 */
function initiateAvailabilityExport() {
    var endpoint = ociUtils.apiConfig.api.post.initiate_availability_export;
    var locationGroups = ociUtils.ociConfig.locationGroups;
    var groups = [];
    var i;
    var token = ociUtils.getAccessToken();

    for (i = 0; i < locationGroups.length; i++) {
        groups.push(locationGroups[i]);
    }

    var requestBody = {
        objects: {
            groups: groups
        }
    };

    var result = ociUtils.ociServiceCall('POST', endpoint, JSON.stringify(requestBody), token);

    return result;
}

/**
 * Custom sleep function
 * @param {number} milliseconds - milliseconds to sleep
 * */
function sleep(milliseconds) {
    var startTime = new Date().getTime();
    var currentTime;
    var retry = true;

    while (retry) {
        currentTime = new Date().getTime();

        if (currentTime - startTime > milliseconds) {
            retry = false;
        }
    }
}

/**
 * Get the status of the export
 * @param {string} exportStatusLink - export status link
 * @param {number} retryParam - count of retry
 * @returns {Object} - export status
 */
function getExportStatus(exportStatusLink, retryParam) {
    var retryCount = retryParam || 0;
    var retryFrequency = 60;
    var retryInterval = 1000;
    var token = ociUtils.getAccessToken();
    var result = ociUtils.ociServiceCall('GET', exportStatusLink, null, token);

    if (result && result.status && (result.status.toUpperCase() === 'PENDING' || result.status.toUpperCase() === 'RUNNING')) {
        retryCount++;

        if (retryCount < retryFrequency) {
            Logger.debug('Status of API ' + exportStatusLink + ' is ' + result.status.toUpperCase() + '. Retrying count: ' + retryCount);
            sleep(retryInterval);

            return getExportStatus(exportStatusLink, retryCount);
        }

        Logger.debug('Status of API ' + exportStatusLink + ' is ' + result.status.toUpperCase() + '. Retried ' + retryFrequency + ' times and stopping');
    } else if (result && result.status) {
        Logger.debug('Status of API ' + exportStatusLink + ' is ' + result.status.toUpperCase());
    }

    return result;
}

/**
 * Download the generated inventory availability export file
 * @param {string} downloadLink - download link
 * @returns {file}     - file content
 */
function downloadAvailabilityExportFile(downloadLink) {
    var token = ociUtils.getAccessToken();
    var result = ociUtils.ociServiceCall('GET', downloadLink, null, token);

    return result;
}

/**
 * Reads inventory record data from saved OCI response and save into custom cache as separate JSON for each SKU
 * @param {Object} file - OCI records file
 */
function generateInventoryRecords(file) {
    var FileReader = require('dw/io/FileReader');
    var readingFile = new FileReader(file);
    var singleLine;
    var lineObj;

    // eslint-disable-next-line no-cond-assign
    while (singleLine = readingFile.readLine()) {
        lineObj = {};

        try {
            lineObj = JSON.parse(singleLine);

            if (lineObj && lineObj.sku) {
                ociUtils.saveInventoryRecord(lineObj);
            } else if (lineObj && lineObj.deltaToken) {
                ociUtils.saveDeltaToken(lineObj);
            }
        } catch (e) {
            Logger.debug('While reading OCI records, non-JSON content found, so Skipping it');
        }
    }

    readingFile.close();
    file.remove();
}

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

    var File = require('dw/io/File');
    var FileWriter = require('dw/io/FileWriter');
    var Site = require('dw/system/Site');

    var exportStatusLink;
    var availabilityExport = initiateAvailabilityExport();

    if (availabilityExport && availabilityExport.exportStatusLink) {
        exportStatusLink = availabilityExport.exportStatusLink;
    } else {
        Logger.error('Availability export API call failed: ' + ociUtils.apiConfig.api.post.initiate_availability_export);
        Logger.error('Check that valid Tenant Group ID, correct API Base URL at least one Location Group under Location Groups are set in Site Preferences - Chaching Omnichannel Inventory Configurations');

        return new Status(Status.ERROR);
    }

    var exportStatus = getExportStatus(exportStatusLink);
    var exportFile;

    if (exportStatus && exportStatus.status === 'COMPLETED' && exportStatus.download && exportStatus.download.downloadLink) {
        var downloadLink = exportStatus.download.downloadLink;
        exportFile = downloadAvailabilityExportFile(downloadLink);

        if (!exportFile) {
            Logger.error('Availability export download API call failed: ' + downloadLink);

            return new Status(Status.ERROR);
        }
    } else {
        Logger.error('Availability export status API call failed: ' + exportStatusLink);

        return new Status(Status.ERROR);
    }

    if (exportFile) {
        try {
            var baseFolder = File.IMPEX + File.SEPARATOR + 'src';
            var relativeFolder = 'chaching' + File.SEPARATOR + 'export' + File.SEPARATOR + Site.current.ID + File.SEPARATOR + 'OCI';
            var fileName = 'chaching-oci-export-full.txt';
            var writeDir = new File(baseFolder + File.SEPARATOR + relativeFolder);

            if (!writeDir.exists()) {
                writeDir.mkdirs();
            }

            var writeFile = writeDir.getFullPath() + File.SEPARATOR + fileName;
            var file = new File(writeFile);

            if (file.exists()) {
                file.remove();
            }

            var writer = new FileWriter(file);
            writer.write(exportFile);
            writer.close();
            generateInventoryRecords(file);

            return new Status(Status.OK);
        } catch (e) {
            Logger.error('Error writing file: ' + e.message);
            return new Status(Status.ERROR);
        }
    }

    return new Status(Status.OK);
}

module.exports = {
    exportOCI: exportOCI
};
