/* global jQuery, Resources */
/* eslint-disable no-param-reassign */
/* eslint-disable new-cap */
'use strict';

/**
 * Toast notification
 * @param {string} message - error or success message
 * @param {string} className - class name for error and success
 * @returns {html} html to append
 */
function displayToastMessage(message, className) {
    var htmlToAppend = '';
    if (message) {
        htmlToAppend += `<div class="chaching-alert ${className}">
<span class="message">${message}</span>
<span class="close-btn">
    <svg  width="1.5em" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
</span>
</div>`;
    }

    return htmlToAppend;
}

/**
 * Generates the modal backdrop.
 * @returns {string} htmstring
 */
function getModalHtmlElement() {
    var htmlString = '<div class="modal-backdrop fade show" aria-hidden="true">'
        + '</div>';
    return htmlString;
}

(function ($) {
    $ = $.noConflict();
    var app = {
        init: function () {
            var accountStatus = $('#connect-status').val();
            if (accountStatus === 'Connected') {
                $('.last-sync').show();
                $('.refresh-button').show();
                $('.menu-button').show();
            } else {
                $('.last-sync').hide();
                $('.refresh-button').hide();
                $('.menu-button').hide();
            }
            if ($('.info-wrapper').length) {
                this.loginFormSubmit();
                this.connectAccount();
                this.displayDisconnectMenu();
                this.refresh();
                this.itemIssueListTable();
            }
        },
        loginFormSubmit: function () {
            $('form[name="chaching-login"]').on('submit', function (e) {
                e.preventDefault();
                window.sessionStorage.setItem('login-success', true);
                var button = $(this).find('.chaching-login');
                button.prop('disabled', true);
                var data = $(this).serialize();
                $.ajax({
                    type: 'POST',
                    url: $(this).attr('action'),
                    data: data
                })
                    .done(function (result) {
                        if (result.error) {
                            button.prop('disabled', false);
                            $('body').append(displayToastMessage(result.message, result.className));
                            app.closeToastNotificationSetup();
                            setTimeout(function () { $('.chaching-alert .close-btn').trigger('click'); }, 5000);
                        } else {
                            window.location.href = result.redirectUrl;
                        }
                    });
            });
        },
        connectAccount: function () {
            $('#account-selection-list').on('change', function () {
                var selectedValue = $('#account-selection-list').val();
                if (selectedValue) {
                    $('#connect-account-submit').prop('disabled', false);
                } else {
                    $('#connect-account-submit').prop('disabled', true);
                }
            });

            $('#connect-account-submit').on('click', function () {
                window.sessionStorage.setItem('connect-success', true);
                var accountId = $('#account-selection-list').val();
                $('#connect-account-submit').prop('disabled', true).val('Please wait...');
                $('#chaching-account-id').val(accountId);
                document.connectaccount.submit();
            });
        },

        displayDisconnectMenu: function () {
            $('.menu-button-dots').on('click', function () {
                $('.btnDisconnect').show();
            });

            $(document).on('mouseup', function (e) {
                var container = $('.menu-button.right svg.w-6.h-6');

                if (!container.is(e.target)) {
                    $('.btnDisconnect').hide();
                }
            });

            $('.chaching-disconnect-button').on('click', function (e) {
                e.preventDefault();
                $('.modal').show();
                $('body').append(getModalHtmlElement);
            });

            // Close modal
            $('#disconnect-cancel-btn').on('click', function (e) {
                e.preventDefault();
                $('.modal').hide();
                $('body > .modal-backdrop').remove();
            });

            // Confirm disconnect account
            $('#disconnect-confirmation-btn').on('click', function (e) {
                e.preventDefault();
                $('.image-loader').addClass('show');
                window.sessionStorage.setItem('disconnect-success', true);
                var url = $(this).data('action');

                $.ajax({
                    url: url,
                    type: 'GET',
                    dataType: 'json',
                    success: function (data) {
                        if (!data.error) {
                            window.location.href = data.redirectUrl;
                        } else {
                            $('.image-loader').removeClass('show');
                            window.sessionStorage.removeItem('disconnect-success');
                            $('body').append(displayToastMessage(data.message, data.className));
                            app.closeToastNotificationSetup();
                            setTimeout(function () { $('.chaching-alert .close-btn').trigger('click'); }, 5000);
                        }
                    },
                    error: function () {
                        $('.image-loader').removeClass('show');
                        window.sessionStorage.removeItem('disconnect-success');
                        $('body').append(displayToastMessage(Resources.DISCONNECT_FAIL, 'error-msg'));
                        app.closeToastNotificationSetup();
                        setTimeout(function () { $('.chaching-alert .close-btn').trigger('click'); }, 5000);
                    }
                });

                $('.modal').hide();
                $('body > .modal-backdrop').remove();
            });
        },

        // Refresh button
        refresh: function () {
            $('#overview-refresh').on('click', function (e) {
                var overviewButton = $(this);
                e.preventDefault();
                var url = overviewButton.data('action');
                overviewButton.prop('disabled', true);
                overviewButton.addClass('loading');

                $.ajax({
                    url: url,
                    type: 'GET',
                    dataType: 'json',
                    success: function (data) {
                        if (data.campaign && data.product) {
                            $('.last-sync-time-overview').html(data.overviewLastSync);
                            $('.last-sync-time-product-list').html(data.listedLastSync);
                            $('#campaign-active').html(data.campaign.active);
                            $('#product-listed').html(data.product.listed);
                            $('#product-errors').html(data.product.errors);
                            $('#product-pending').html(data.product.pending);
                            $('#itemIssuelevelTable').DataTable().ajax.reload();
                        } else {
                            $('body').append(displayToastMessage(Resources.REFRESH_FAIL, 'error-msg'));
                            app.closeToastNotificationSetup();
                            setTimeout(function () { $('.chaching-alert .close-btn').trigger('click'); }, 5000);
                        }

                        $('body').append(displayToastMessage('Data refreshed successfully', 'success-msg'));
                        overviewButton.prop('disabled', false);
                        overviewButton.removeClass('loading');
                        app.closeToastNotificationSetup();
                        setTimeout(function () { $('.chaching-alert .close-btn').trigger('click'); }, 5000);
                    },
                    error: function () {
                        $('body').append(displayToastMessage('Cannot update the campaign and product details. Please try after some time.', 'error-msg'));
                        overviewButton.prop('disabled', false);
                        overviewButton.removeClass('loading');
                        app.closeToastNotificationSetup();
                        setTimeout(function () { $('.chaching-alert .close-btn').trigger('click'); }, 5000);
                    }
                });

                $('.modal').hide();
                $('body > .modal-backdrop').remove();
            });
        },

        closeToastNotificationSetup: function () {
            $('.chaching-alert .close-btn').on('click', function (e) {
                e.preventDefault();
                $('body > .chaching-alert').remove();
            });
        },

        itemIssueListTable: function () {
            if ($('.item-level-issue-list').length > 0) {
                var url = $('#ajax-url').val();
                $('#itemIssuelevelTable').DataTable({
                    ajax: {
                        url: url,
                        dataSrc: 'itemList'
                    },
                    columns: [
                        {
                            data: 'name',
                            className: 'item_issue_body_name',
                            render: function (data) {
                                return data;
                            }
                        },
                        {
                            data: 'sku',
                            className: 'item_issue_body_sku',
                            render: function (data) {
                                return data;
                            }
                        },
                        {
                            data: 'description',
                            className: 'item_issue_body_description',
                            render: function (data) {
                                return data;
                            }
                        }
                    ]
                });
            }
        }
    };
    $(document).ready(function () {
        app.init();
        // Display success message after login
        var loginSuccess = window.sessionStorage.getItem('login-success');
        if (loginSuccess) {
            $('body').append(displayToastMessage(Resources.LOGIN_SUCCESS, 'success-msg'));
            app.closeToastNotificationSetup();
            setTimeout(function () { $('.chaching-alert .close-btn').trigger('click'); }, 5000);
            window.sessionStorage.removeItem('login-success');
        }

        // Display success message after connecting to Chaching account
        var connectSuccess = window.sessionStorage.getItem('connect-success');
        if (connectSuccess) {
            $('body').append(displayToastMessage(Resources.CONNECT_SUCCESS, 'success-msg'));
            app.closeToastNotificationSetup();
            setTimeout(function () { $('.chaching-alert .close-btn').trigger('click'); }, 5000);
            window.sessionStorage.removeItem('connect-success');
        }

        // Disconnect success message after disconnecting to Chaching account
        var disconnectSuccess = window.sessionStorage.getItem('disconnect-success');
        if (disconnectSuccess) {
            $('body').append(displayToastMessage(Resources.DISCONNECT_SUCCESS, 'success-msg'));
            app.closeToastNotificationSetup();
            setTimeout(function () { $('.chaching-alert .close-btn').trigger('click'); }, 5000);
            window.sessionStorage.removeItem('disconnect-success');
        }
    });
}(jQuery));
