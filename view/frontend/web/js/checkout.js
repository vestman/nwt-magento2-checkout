/**
 * Copyright © 2015 Magento. All rights reserved.
 * See COPYING.txt for license details.
 */
/*jshint browser:true jquery:true*/
/*global alert*/
define([
    "jquery",
    'Magento_Ui/js/modal/alert',
    "uiRegistry",
    'mage/url',
    "Svea_Checkout/js/model/bind-select-shipping",
    "Svea_Checkout/js/action/reload-shipping-methods",
    'jquery-ui-modules/widget',
    "mage/translate",
    "mage/mage",
    "mage/validation",
    "Magento_Customer/js/customer-data"
], function (jQuery, alert, uiRegistry, mageurl, bindSelectShipping, reloadShippingMethods) {
    "use strict";
    jQuery.widget('mage.nwtsveaCheckout', {
        options: {
            shippingMethodFormSelector: '#shipping-method-form',
            shippingMethodLoaderSelector: '#shipping-method-loader',
            shippingMethodsListSelector: '#svea-checkout_shipping_method',
            shippingMethodCheckBoxHolder: '.svea-checkout-radio-row',
            getShippingMethodButton: '#shipping-method-button',
            newsletterFormSelector: '#svea-checkout-newsletter-form',
            couponFormSelector: '#discount-coupon-form',
            giftcardFormSelector: '#giftcard-coupon-form',
            cartContainerSelector: '#details-table',
            waitLoadingContainer: '#review-please-wait',
            couponToggler: '#svea_coupon_toggle input',
            giftcardToggler: '#svea_giftcard_toggle input',
            couponFormContainer: '#svea-checkout_coupon',
            giftcardFormContainer: '#svea-checkout_giftcard',
            commentFormSelector: '#svea-checkout-comment',
            commentTextAreaSelector: '#svea-checkout-comment .fieldset.comment',
            commentTextAreaToggler: '#svea-checkout-comment .svea-btn.show-more',
            commentTextAreaTogglerLess: '#svea-checkout-comment .svea-btn.show-less',
            ctrlkey: null,
            ctrlcookie: 'svea-checkoutCartCtrlKey',
            ctrkeyCheck: true,
            sveaCountryChange: false,
            sveaShippingChange: false,
            hasInitFlag: false,
            shippingAjaxInProgress: false,
            iframeOverlay: '#iframe-overlay',
            sveaShippingActive: false,
            sveaCreatedAt: 0,
            sessionLifetimeSeconds: 172800
        },
        _create: function () {
            jQuery.mage.cookies.set(this.options.ctrlcookie, this.options.ctrlkey);
            this._checkIfCartWasUpdated();
            this._expiryCheck();
            this._bindEvents();
            this._bindShipping();
            this.uiManipulate();
            this.toggleCouponContainer();
            this.toggleGiftCardContainer();
            this.toggleOrderCommentTextArea();
            uiRegistry.set('sveaCheckout', this);
        },

        _checkIfCartWasUpdated: function () {
            var checkIfCartWasUpdated = setInterval((function () {
                if (!this.options.ctrkeyCheck) {
                    return true;
                }
                var ctrlkey = jQuery.mage.cookies.get(this.options.ctrlcookie);
                if (ctrlkey && ctrlkey !== this.options.ctrlkey) {

                    // clear the interval
                    clearInterval(checkIfCartWasUpdated);


                    // msg popup, then reload!
                    jQuery(this.options.waitLoadingContainer).html('<span class="error">Cart was updated, please wait for the Checkout to reload...</span>').show();
                    window.location.reload();

                }
            }).bind(this), 1000);
        },

        /**
         * Checks every 5 seconds if payment session is expired
         */
        _expiryCheck: function () {
            const expiryCheck = setInterval((function () {
                const sveaCreatedAt = new Date(this.options.sveaCreatedAt * 1000);
                const expiresAt = new Date(sveaCreatedAt.getTime() + (this.options.sessionLifetimeSeconds * 1000));
                if (new Date().getTime() >= expiresAt.getTime()) {
                    clearInterval(expiryCheck);
                    alert({
                        content: jQuery.mage.__('Your payment session has expired. The checkout will reload.'),
                        actions: {
                            always: function () {
                                location.reload();
                            }
                        }
                    });
                }
            }).bind(this), 5000);
        },

        _bindCartAjax: function () {
            var cart = this.options.cartContainerSelector;
            var inputs = jQuery(cart).find('.ajax-qty-change');
            var _this = this;
            jQuery.each(inputs, function (i, input) {
                var inputQty = jQuery(input);
                var data_submit_url = inputQty.data('cart-url-submit');
                var data_refresh_url = inputQty.data('cart-url-update');
                var data_remove_url = inputQty.data('cart-url-remove');
                const qtyIncrements = inputQty.data('qty-increments');
                var increment = inputQty.siblings('.input-number-increment');
                var decrement = inputQty.siblings('.input-number-decrement');
                var remove = inputQty.closest('tr').find('td.subtotal .remove-product');
                var prevVal = false;

                if (increment.data('binded')) return;
                if (decrement.data('binded')) return;
                if (remove.data('binded')) return;

                increment.data('binded', true);
                decrement.data('binded', true);
                remove.data('binded', true);

                increment.on('click', function () {
                    inputQty.val(parseFloat(inputQty.val()) + qtyIncrements);
                    if (typeof ajaxActionTriggerTimeout !== "undefined") {
                        clearTimeout(ajaxActionTriggerTimeout);
                    }
                    window.ajaxActionTriggerTimeout = setTimeout(function () {
                        inputQty.trigger('change');
                    }, 1000);
                });
                decrement.on('click', function () {
                    var v = parseFloat(inputQty.val());
                    if (v < 2 * qtyIncrements) {
                        return;
                    }
                    inputQty.val(v - qtyIncrements);
                    if (typeof ajaxActionTriggerTimeout !== "undefined") {
                        clearTimeout(ajaxActionTriggerTimeout);
                    }
                    window.ajaxActionTriggerTimeout = setTimeout(function () {
                        inputQty.trigger('change');
                    }, 1000);
                });
                remove.on('click', function () {
                    var c = confirm(jQuery.mage.__('Are you sure you want to remove this?'));
                    if (c == true) {
                        var data = {
                            item_id: inputQty.data('cart-product-id'),
                            form_key: inputQty.data('cart-form-key')
                        };
                        jQuery.ajax({
                            type: "POST",
                            url: data_remove_url,
                            data: data,
                            beforeSend: function () {
                                _this._ajaxBeforeSend();
                            },
                            complete: function () {
                            },
                            success: function (data) {
                                if (!data.success) {
                                    if (data.error_message) {
                                        var errHtml = '<div class="message-error error message"><div>' + data.error_message + '</div></div>';
                                        jQuery('.page.messages').append(errHtml);
                                    }
                                }
                                _this._ajaxSubmit(mageurl.build('sveacheckout/order/cart'), {}, 'post', false, function () {
                                    if (!this.options.sveaShippingActive) {
                                        reloadShippingMethods(this.options.shippingMethodFormSelector);
                                    }
                                }.bind(_this));
                            }
                        });
                    }
                });
                inputQty.on('keypress', function (e) {
                    if (e.keyCode == "1") {
                        inputQty.trigger('change');
                        return false;
                    }
                    ;
                }).on('focus', function () {
                    prevVal = jQuery(inputQty).val();
                }).on('change', function () {
                    var data = {
                        item_id: inputQty.data('cart-product-id'),
                        form_key: inputQty.data('cart-form-key'),
                        item_qty: inputQty.val()
                    };
                    if (data.item_qty == 0) {
                        jQuery(inputQty).val(prevVal);
                        return false;
                    }
                    jQuery.ajax({
                        type: "POST",
                        url: data_submit_url,
                        data: data,
                        beforeSend: function () {
                            _this._ajaxBeforeSend();
                        },
                        complete: function () {
                        },
                        success: function (data) {
                            if (!data.success) {
                                if (data.error_message) {
                                    var errHtml = '<div class="message-error error message"><div>' + data.error_message + '</div></div>';
                                    jQuery('.page.messages').append(errHtml);
                                }
                            }
                            _this._ajaxSubmit(data_refresh_url);
                        }
                    });
                });
            });
        },

        _bindEvents: function (block) {
            //$blocks = ['shipping_method','cart','coupon','messages', 'svea','newsletter'];

            block = block ? block : null;
            if (!block || block == 'shipping') {
                bindSelectShipping.setCallback(jQuery.proxy(this._changeShippingMethod, this));
                jQuery(this.options.shippingMethodLoaderSelector).on('submit', jQuery.proxy(this._loadShippingMethod, this));
            }
            if (!block || block == 'shipping_method') {
                bindSelectShipping.setCallback(jQuery.proxy(this._changeShippingMethod, this));
                bindSelectShipping.execute();
            }
            if (!block || block == 'newsletter') {
                jQuery(this.options.newsletterFormSelector).find('input[type=checkbox]').on('change',function(){
                    if(jQuery(this).is(":checked")) {
                        jQuery(this).val("1");
                    } else {
                        jQuery(this).val("0");
                    }
                });
                jQuery(this.options.newsletterFormSelector).find('input[type=checkbox]').on('change', jQuery.proxy(this._changeSubscriptionStatus, this));
            }
            if (!block || block == 'cart') {
                this._bindCartAjax();
            }
            if (!block || block == 'coupon') {
                jQuery(this.options.couponFormSelector).on('submit', jQuery.proxy(this._applyCoupon, this));
                this.checkValueOfInputs(jQuery(this.options.couponFormSelector));
            }
            if (!block || block == 'giftcard') {
                jQuery(this.options.giftcardFormSelector).on('submit', jQuery.proxy(this._applyGiftcard, this));
                this.checkValueOfInputs(jQuery(this.options.giftcardFormSelector));
            }
            if (!block || block == 'comment') {
                jQuery(this.options.commentFormSelector).on('submit', jQuery.proxy(this._saveComment, this));
                this.checkValueOfInputs(jQuery(this.options.commentFormSelector));
            }

            if (!block || block == 'svea') {
                this.sveaApiChanges();
            }

        },

        _bindShipping: function () {
            if (!this.options.sveaShippingActive) {
                return;
            }

            document.addEventListener('sveaCheckout:shippingConfirmed', function (data) {
                this._ajaxSubmit(mageurl.build('sveacheckout/order/confirmshipping'), jQuery.param(data.detail));
            }.bind(this));
        },

        checkValueOfInputs: function (form) {
            var checkValue = function (elem) {
                if (jQuery(elem).val()) {
                    form.find('.primary').show();
                } else {
                    form.find('.primary').hide();
                }
            }
            var field = jQuery(form).find('.svea-checkout-show-on-focus').get(0);
            jQuery(field).on("keyup", function () {
                checkValue(this)
            });
            jQuery(field).on("change", function () {
                checkValue(this)
            });
        },


        /**
         * show ajax loader
         */
        _ajaxBeforeSend: function () {
            this.options.ctrkeyCheck = false;
            this._hideSveaCheckout()
            jQuery(this.options.waitLoadingContainer).show();
        },

        /**
         * hide ajax loader
         */
        _ajaxComplete: function (dontHidePayment) {
            this._showSveaCheckout();
            jQuery(this.options.waitLoadingContainer).hide();
            this.sveaApiChanges();
            this.toggleCouponContainer();
            this.toggleGiftCardContainer();
        },

        _showSveaCheckout: function () {
            if (window.scoApi) {
                try {
                    window.scoApi.setCheckoutEnabled(true);
                } catch (err) {
                }
            }
        },

        _hideSveaCheckout: function () {
            if (window.scoApi) {
                try {
                    window.scoApi.setCheckoutEnabled(false);
                } catch (err) {
                }
            }
        },

        _changeShippingMethod: function () {
            this._ajaxFormSubmit(jQuery(this.options.shippingMethodFormSelector));
        },

        _loadShippingMethod: function () {
            this._ajaxFormSubmit(jQuery(this.options.shippingMethodLoaderSelector));
            return false;
        },

        _changeSubscriptionStatus: function () {
            this._ajaxFormSubmit(jQuery(this.options.newsletterFormSelector));
        },

        _applyCoupon: function () {
            const form = jQuery(this.options.couponFormSelector);
            const formAction = form.prop('action');
            const formData = form.serialize();
            this._ajaxSubmit(formAction, formData, 'post', false, function () {
                if (!this.options.sveaShippingActive) {
                    reloadShippingMethods(this.options.shippingMethodFormSelector);
                }
            }.bind(this));
            return false;
        },
        _applyGiftcard: function () {
            this._ajaxFormSubmit(jQuery(this.options.giftcardFormSelector));
            return false;
        },

        _saveComment: function () {
            var form = jQuery(this.options.commentFormSelector);
            this._ajaxSubmit(form.prop('action'), form.serialize(), "post", false, function () {

                jQuery("#svea-submit").addClass('success-save');
            });
            return false;
        },

        _ajaxFormSubmit: function (form) {
            return this._ajaxSubmit(form.prop('action'), form.serialize());
        },
        /**
         * Attempt to ajax submit order
         */
        _ajaxSubmit: function (url, data, method, beforeSVEAAjax, afterSVEAAjax) {
            if (!method) method = 'post';
            var _this = this;
            if (this.options.shippingAjaxInProgress === true) {
                return false;
            }
            jQuery.ajax({
                url: url,
                type: method,
                context: this,
                data: data,
                dataType: 'json',
                beforeSend: function () {
                    _this.options.ctrkeyCheck = false;
                    _this.options.shippingAjaxInProgress = true;
                    _this._ajaxBeforeSend();
                    if (typeof beforeSVEAAjax === 'function') {
                        beforeSVEAAjax();
                    }
                },
                complete: function () {
                    _this.options.shippingAjaxInProgress = false;
                    _this._ajaxComplete();
                },
                success: function (response) {
                    if (typeof response === 'object' && !jQuery.isEmptyObject(response)) {

                        if (response.reload || response.redirect) {
                            this.loadWaiting = false; //prevent that resetLoadWaiting hiding loader
                            if (response.messages) {
                                //alert({content: response.messages});
                                jQuery(this.options.waitLoadingContainer).html('<span class="error">' + response.messages + ' Reloading...</span>');
                            } else {
                                jQuery(this.options.waitLoadingContainer).html('<span class="error">Reloading...</span>');
                            }

                            if (response.redirect) {
                                window.location.href = mageurl.build(response.redirect);
                            } else {
                                alert({
                                    content: jQuery.mage.__('We need to reload the checkout, excuse us just a moment') + '…',
                                    actions: {
                                        always: function () {
                                            window.location.reload();
                                        }
                                    }
                                });
                            }
                            return true;
                        } //end redirect   

                        //ctlKeyy Cookie
                        if (response.ctrlkey) {
                            _this.options.ctrlkey = response.ctrlkey;
                            jQuery.mage.cookies.set(_this.options.ctrlcookie, response.ctrlkey);
                        }


                        if (response.updates) {

                            var blocks = response.updates;
                            var div = null;

                            for (var block in blocks) {
                                if (blocks.hasOwnProperty(block)) {
                                    div = jQuery('#svea-checkout_' + block);
                                    if (div.length > 0) {
                                        div.replaceWith(blocks[block]);
                                        this._bindEvents(block);
                                    }
                                    if (block === 'shipping_method') {
                                        jQuery(this.options.shippingMethodsListSelector).show();
                                    }
                                    if (block === 'cart') {
                                        jQuery('#svea-checkout_cart_totals').trigger('contentUpdated');
                                    }
                                }

                            }
                        }

                        if (typeof afterSVEAAjax === 'function') {
                            afterSVEAAjax();
                        }

                        if (response.messages) {
                            alert({
                                content: response.messages
                            });
                        }

                    } else {
                        alert({
                            content: jQuery.mage.__('Sorry, something went wrong. Please try again (reload this page)')
                        });
                        // window.location.reload();
                    }

                    // after we loaded the new ctrlkey we now can compare the keys again!
                    _this.options.ctrkeyCheck = true;

                },
                error: function () {
                    this.options.ctrkeyCheck = true;
                    alert({
                        content: jQuery.mage.__('Sorry, something went wrong. Please try again later.')
                    });
                    //window.location.reload();
//                     this._ajaxComplete();
                }
            });
        },

        sveaApiChanges: function () {
            if (!window.scoApi) {
                return
            }

            window.scoApi.observeEvent("identity.postalCode", function (data) {
                // Will check for updated Tax and Totals due to changed postal code
                this._ajaxSubmit(mageurl.build('sveacheckout/order/updatePostcode'), {postcode: data.value}, 'post');
            }.bind(this));
        },

        /**
         * UI Stuff
         */
        getViewport: function () {
            var e = window, a = 'inner';
            if (!('innerWidth' in window)) {
                a = 'client';
                e = document.documentElement || document.body;
            }
            return {width: e[a + 'Width'], height: e[a + 'Height']};
        },
        sidebarFiddled: false,
        fiddleSidebar: function () {
            var t = this;
            if ((this.getViewport().width <= 960) && !this.sidebarFiddled) {
                jQuery('.mobile-collapse').each(function () {
                    jQuery(this).collapsible('deactivate');
                    t.sidebarFiddled = true;
                });
            }
        },
        uiManipulate: function () {
            var t = this;
            jQuery(window).on('resize', function () {
                t.fiddleSidebar();
            });
            jQuery(document).ready(function () {
                t.fiddleSidebar();
            });
        },

        toggleCouponContainer: function () {
            var target = this.options.couponFormContainer,
                toggler = this.options.couponToggler;

            jQuery(toggler).on('change', function () {
                if (this.checked)
                    jQuery(target).addClass('visible');
                else
                    jQuery(target).removeClass('visible');
            });
        },

        toggleGiftCardContainer: function () {
            var target = this.options.giftcardFormContainer,
                toggler = this.options.giftcardToggler;

            jQuery(toggler).on('change', function () {
                if (this.checked)
                    jQuery(target).addClass('visible');
                else
                    jQuery(target).removeClass('visible');
            });
        },

        toggleOrderCommentTextArea: function () {
            var target = this.options.commentTextAreaSelector,
                toggler = this.options.commentTextAreaToggler,
                togglerLess = this.options.commentTextAreaTogglerLess;


            jQuery(toggler).on('click', function () {
                jQuery(target).slideDown(function () {
                    jQuery(toggler).hide();
                    jQuery(togglerLess).show();
                });
            });

            jQuery(togglerLess).on('click', function () {
                jQuery(target).slideUp(function () {
                    jQuery(togglerLess).hide();
                    jQuery(toggler).show();

                });

            });


        }
    });

    return jQuery.mage.nwtsveaCheckout;
});
