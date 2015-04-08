var website = {};
website.API_SERVICE_STATUS='http://api.dashcoin.ninja:18256/service_status/';
website.API_CREATE_ORDER='http://api.dashcoin.ninja:18256/api/order_request/';
website.API_ORDER_UPDATE='http://api.dashcoin.ninja:18256/api/order_status/';

website.API_CALL_NETWORK_TIMEOUT = 20000; // 20s
website.STATUS_UPDATE_INTERVAL = 5000;
website.GENERAL_ORDER_UPDATE_INTERVAL = 10000;
website.CREATE_ORDER_UPDATE_INTERVAL = 1000;
website.DEFAULT_MIXINS = 3;

website.previousOrderState = null;
website.orderTimeoutCountdown = null;
website.statusRefreshTimer = null;


/**
 * Loads on start
 */
$( window ).load(function() {
    // Start to automatically update price and service status
    website.startUpdateStatusTimer();

    // scroll animation when clicking on links of class 'page-scroll'
    $('body').on('click', '.page-scroll a', function(event) {
        var $anchor = $(this);
        var scrollOffset = -70;
        if ($anchor.text() === "Create") {
            scrollOffset = -100;
        }
        $('html, body').stop().animate({
            scrollTop: $($anchor.attr('href')).offset().top + scrollOffset
        }, 1200, 'easeInOutExpo');
        event.preventDefault();
    });

    // Highlight the top nav as scrolling occurs
    $('body').scrollspy({
        target: '.navbar-fixed-top',
        offset: 75 // + 5 to make sure active marking doesn't fuck up
    });

    // Closes the Responsive Menu on Menu Item Click
    $('.navbar-collapse ul li a').click(function() {
        $('.navbar-toggle:visible').click();
    });

    // always jump to top of page on reload
    $(window).on('beforeunload', function() {
          $(window).scrollTop(0);
    });
});


/**
 *
 */
website.startUpdateStatusTimer = function() {
    // if timer already running, don't start another one
    if (!website.statusRefreshTimer) {
        website.updateStatus();
    }
}


/**
 * Regularly polls /api/service_status and updates
 * website status accordingly.
 */
website.updateStatus = function() {
    $.ajax({ 
        url: website.API_SERVICE_STATUS,
        timeout: website.API_CALL_NETWORK_TIMEOUT,
        success: function(data) {
            // update price info in create form
            $('.data-current-price-btc-dsh').each(function() {
                $(this).text(data.price);
            });
            $('#data-min-order-amount-btc').val(website.satoshisToBtcString(data.lower_limit));
            $('#data-max-order-amount-btc').val(website.satoshisToBtcString(data.upper_limit));

            // allow to create new orders and show appropriate sections
            website.possibleToCreateNewOrders = true;
            website.showAppropriateSections();

            // restart timer for next update
            website.statusRefreshTimer = setTimeout( website.updateStatus, website.STATUS_UPDATE_INTERVAL );
        },
        error: function(jqXHR) {
            website.possibleToCreateNewOrders = false;
            website.showAppropriateSections();

            website.statusRefreshTimer = setTimeout( website.updateStatus, website.STATUS_UPDATE_INTERVAL );
        }
    });
};


/**
 * Format satoshis as bitcoins
 */
website.satoshisToBtcString = function(satoshis) {
    var string;
    btcAsFloat = (satoshis / (Math.pow(10, 8)));
    if (btcAsFloat === ~~btcAsFloat) {    // check if int
        // if int, add a .0 at end
        string = ~~btcAsFloat + ".0";
    } else {
        string = btcAsFloat.toFixed(8).toString().replace(/0*$/, '');
    }
    return string;
};


/**
 * Shows the "input" sections of the website.
 * That means, it hides the status section and displays the create and track form sections.
 * Also updates the 
 */
website.showAppropriateSections = function() {
    if (website.trackingOrder) {
        // hide create/track section and show order status section
        $('section#create').hide();
        $('section#track').hide();
        $('section#status').show();
        // disable create/track section menu items
        $('#menu-item-create').addClass('disabled');
        $('#menu-item-track').addClass('disabled');

        if (website.possibleToCreateNewOrders) {
            $('section#offline').hide();
        }
        else {
            $('section#offline').show();
        }
    }
    else {
        // show create/track section and hide order status section
        $('section#track').show();
        $('section#status').hide();
        // enable menu items
        $('#menu-item-track').removeClass('disabled');

        if (website.possibleToCreateNewOrders) {
            $('section#create').show();
            $('#menu-item-create').removeClass('disabled');
            $('section#offline').hide();
        }
        else {
            $('section#create').hide();
            $('#menu-item-create').addClass('disabled');
            $('section#offline').show();
        }
    }
};


/**
 * Handle order creation attempt.
 * Takes user inputs and posts it to api endpoint.
 */
website.createOrderButtonHandler = function() {
    var btcAmount = $('#input-btc-amount').val().trim();
    var btcDestAddress = $('#input-btc-dest-address').val().trim();


    /* Hide the comment field */
    $('#create-order-message').text('');

    website.fillOrderInfo({
        btc_amount: btcAmount,
        btc_dest_address: btcDestAddress
    });

    /* Ajax call to API */
    $.ajax({
        type: "POST",
        url: website.API_CREATE_ORDER,
        timeout: website.API_CALL_NETWORK_TIMEOUT,
        data: {
            'btc_amount': btcAmount,
            'btc_dest_address': btcDestAddress
        },
        success: function(data){
            // console.log(data);
            
            // Start to update regularly
            website.startOrderTracking(data.uuid);
        },
        error: function(jqXHR){
            // console.log(jqXHR);
            $('#create-order-message').text('Could not create your order. ' + 
                'Check your input values! Is this a valid bitcoin address? ' +
                'Is the amount chosen maybe too high or too low?');
        }
    });
};


/**
 * Starts order tracking on user input.
 */
website.trackOrderButtonHandler = function() {
    // fetch secret key from input field and start querying the order status
    website.startOrderTracking($('#input-order-secret-key').val());
};


/**
 * Cancels order tracking on user input.
 */
website.stopOrderTrackingButtonHandler = function() {
    $('#input-order-secret-key').val('');
    $('#input-btc-dest-address').val('');
    $('#input-btc-amount').val('');

    website.stopOrderTracking(true);
};


/**
 *
 */
website.stopOrderTracking = function(scroll_to_create) {
    // stop tracking and update display
    website.trackingOrder = null;
    website.previousOrderState = null;
    website.resetOrderInfo(true);
    website.showAppropriateSections();

    // remove the update timer for this order
    clearTimeout(website.orderRefreshTimer);
    website.orderRefreshTimer = null;

    // scroll to create again
    if (scroll_to_create)
        $('a[href=#create]').click();
};


/**
 * Check order status regularly to notify we got the payment
 */
website.startOrderTracking = function(uuid) {
    // if already running, do nothing
    if (!website.orderRefreshTimer) {
        website.updateOrder(uuid);
    }

    // scroll to top (use create anchor, as status doesn't have one)
    $('a[href=#create]').click();
};
    

/**
 * Check order status regularly to notify we got the payment
 */
website.updateOrder = function(uuid) {
    /* Ajax call to API */
    $.ajax({
        type: "POST",
        url: website.API_ORDER_UPDATE,
        timeout: website.API_CALL_NETWORK_TIMEOUT,
        data: {
            'uuid': uuid
        },
        success: function(data) {
           // console.log(data);

            /* If previously there was no tracking (first call for this tracking), 
               set up things */
            if (!website.trackingOrder) {
                // hide all order status rows (= reset display)
                website.resetOrderInfo(true);

                website.trackingOrder = uuid;
                website.showAppropriateSections();
            }
            website.fillOrderInfo(data);

            if (data.state_str === 'TO_BE_CREATED') {
                update_interval = website.CREATE_ORDER_UPDATE_INTERVAL;
            }
            else {
                update_interval = website.GENERAL_ORDER_UPDATE_INTERVAL;
            }

            /* Keep checking */
            website.orderRefreshTimer = setTimeout(function() {
                    website.updateOrder(uuid);
                }, update_interval);
        },
        error: function(jqXHR) {
           // console.log(jqXHR);

            // hide all order status rows (= reset display)
            website.resetOrderInfo(true);
            website.stopOrderTracking(false);

            if ('statusText' in jqXHR && jqXHR.statusText == 'timeout') {
                $('#track-order-message').text('Could not contact to our API.' + 
                        'Either our service or the network might be down. Please check again later.');
            }
            else if (jqXHR.status === 404) {
                $('#track-order-message').text('Sorry, no order found order with this secret key. Either you mistyped it, or your order was already processed and purged from our system.');
            }
            else {
                /* For all other errors (40x, 500), we'll end up here */
                $('#track-order-message').text('Could not contact our API.' + 
                        'Either our service or the network might be down. Please check again later.');
            }
        }
    });
};


/**
 *
 */
website.resetOrderInfo = function(reset_data) {
    // hide all order status rows (= reset display)
    $('.order-current-status').each(function() {
        $(this).hide();
    });
    $('#order-current-status-updating').show();
    $('#order-summary-dsh').hide();
    $('#partial-payment').hide();
    $('#track-order-message').text('');

    if (reset_data) {
        $('.data-btc-amount').each(function() {
            $(this).text("(updating…)");
        });
        $('.data-btc-dest-address').each(function() {
            $(this).text("(updating…)");
        });
        $('#data-order-secret-key').text('(updating…)');
        $('#data-order-secret-key').text('(updating…)');
        $('#data-dsh-price-btc').text('(updating…)');
        $('#order-summary-dsh').show('(updating…)');
        $('#data-dsh-receiving-address').text('(updating…)');
        $('#data-dsh-total-amount').text('(updating…)');
        $('#data-dsh-amount-remaining').text('(updating…)');
        $('#data-dsh-required-payment-id').text('(updating…)');
        $('#data-simplewallet').text('(updating…)');
        $('#data-dsh-num-confirmations-remaining').text('(updating…)');
        $('#data-btc-transaction-id').text('(updating…)');
        $('#data-btc-num-confirmations').text('(updating…)');
        $('#data-btc-num-confirmations-before-purge').text('(updating…)');
    }
};


/**
 * 
 *
 */
website.fillOrderInfo = function(order) {
   // console.log("Filling in order:");
   // console.log(order);

    if (website.previousOrderState != order.state_str) {
        website.resetOrderInfo(false);
        website.previousOrderState = order.state_str;
    }

    // hide update block
    $('#order-current-status-updating').hide();

    /**************************************************************
     *
     * Update order on-site, depending on what's in the order object
     *
     *************************************************************/

    /*
    if (order.) {
        $('.').each(function() {
            $(this).text(order.);
        });
    }
    */

    /*
     * general order info
     */
    if (typeof order.btc_amount !== 'undefined') {
        $('.data-btc-amount').each(function() {
            $(this).text(order.btc_amount);
        });
    }
    if (typeof order.btc_dest_address !== 'undefined') {
        $('.data-btc-dest-address').each(function() {
            $(this).text(order.btc_dest_address);
        });
    }
    if (typeof order.uuid !== 'undefined') {
        $('#data-order-secret-key').text(order.uuid);
    }
    if (typeof order.dsh_price_btc !== 'undefined') {
        $('#data-dsh-price-btc').text(order.dsh_price_btc);
    }
    if (typeof order.dsh_price_btc !== 'undefined' && 
        typeof order.dsh_required_amount !== 'undefined') {
        $('#order-summary-dsh').show();
    }

    /*
     * payment data
     */
    if (typeof order.dsh_receiving_address !== 'undefined') {
        $('#data-dsh-receiving-address').text(order.dsh_receiving_address);
    }
    if (typeof order.dsh_required_amount !== 'undefined' ) {
        $('#data-dsh-total-amount').text(order.dsh_required_amount);
    }
    if (typeof order.dsh_amount_remaining !== 'undefined') {
        $('#data-dsh-amount-remaining').text(order.dsh_amount_remaining);
    }
    if (typeof order.dsh_required_payment_id !== 'undefined') {
        $('#data-dsh-required-payment-id').text(order.dsh_required_payment_id);
    }
    // update simplewallet and qr code
    if (typeof order.dsh_receiving_address !== 'undefined' && 
        typeof order.dsh_required_amount !== 'undefined' && 
        typeof order.dsh_required_payment_id !== 'undefined') {
       $('#data-simplewallet').text("transfer " + website.DEFAULT_MIXINS + " " + 
               order.dsh_receiving_address + " " + order.dsh_amount_remaining + " " + 
               order.dsh_required_payment_id);

       // construct url
       var url = 'https://chart.googleapis.com/chart?cht=qr&chs=400x400&chl=monero%3A' + 
           order.dsh_receiving_address +
           '%3Ftx_amount%3D' +
           order.dsh_amount_remaining +
           '%26tx_payment_id%3D' +
           order.dsh_required_payment_id +
           '%26tx_description%3DXMR.TO%20payment';
       $('#order-qr-code').attr("src", url);
    }


    /*
     *
     */
    if (typeof order.dsh_num_confirmations_remaining !== 'undefined') {
        $('#data-dsh-num-confirmations-remaining').text(order.dsh_num_confirmations_remaining);
    }
    if (typeof order.btc_transaction_id !== 'undefined') {
        $('#data-btc-transaction-id').text(order.btc_transaction_id);
    }
    if (typeof order.btc_num_confirmations !== 'undefined') {
        $('#data-btc-num-confirmations').text(order.btc_num_confirmations);
    }
    if (typeof order.btc_num_confirmations_before_purge !== 'undefined') {
        $('#data-btc-num-confirmations-before-purge').text(order.btc_num_confirmations_before_purge);
    }


    /**************************************************************
     *
     * Set correct visible blocks according to state.
     *
     *************************************************************/

    $('#order-current-status-updating').hide();

    if (order.state_str === 'TIMED_OUT' || (order.seconds_till_timeout <= 0 && 
        (order.state_str === 'TO_BE_CREATED' || order.state_str === 'UNPAID' || order.state_str === 'UNDERPAID'))) {
        $('#order-current-status-timeout').show();
        return
    }

    if (order.state_str === 'TO_BE_CREATED') {
        $('#order-current-status-waiting-create').show();
        return
    } 

    if (order.state_str === 'UNDERPAID' || order.state_str === 'UNPAID') {        
        // remove any running timer
        if (website.orderTimeoutCountdown) {
            clearInterval(website.orderTimeoutCountdown);
        }

        // Set countdown to correct value if relevant
        secondsBeforeTimeOut = order.seconds_till_timeout;
        if (order.seconds_till_timeout > 0) {
            // compute deadline
            var deadline = new Date();
            deadline.setSeconds(deadline.getSeconds() + secondsBeforeTimeOut);

            // set countdown timer using countdownjs.org lib
            // this countdowns automatically the order timeout and updates the website
            website.orderTimeoutCountdown = countdown(
                deadline,
                function(ts) {
                    // ts.value is millisecond till deadline
                    // (goes positive when countdown goes negative)
                    if (ts.value > 0) {
                        // timeout, don't go negative.
                        // note that timerId will be cleared soon, on next order update
                        $('#countdown-holder').text('');
                    } else {
                        $('#countdown-holder').text(ts.toString());
                    }
                    if (ts.value > -60000 && ts.value < 0) {
                        // only one minute left, warning visible
                        if (! $('#little-time-remaining').is(':visible'))
                            $('#little-time-remaining').show();
                    } else {
                        // hide it if enough time left. Required in case suddenly
                        // tracking a different order.
                        if ($('#little-time-remaining').is(':visible'))
                            $('#little-time-remaining').hide();
                    }
                },
                countdown.MINUTES|countdown.SECONDS);
        }
        
        $('#order-current-status-waiting-dsh').show();
        if (order.state_str === 'UNDERPAID') {
            $('#partial-payment').show();
        }

        return
    }

    //if (order.state_str === 'PAID' || order.dsh_num_confirmations_remaining === -1) {
    if (order.state_str === 'PAID') {
        $('#order-current-status-sending-btc').show();
        
        return
    }
    
    if (order.state_str === 'PAID_UNCONFIRMED') {
        $('#order-current-status-dsh-received').show();
        
        return
    }

    if (order.state_str === 'BTC_SENT') {
        $('#order-current-status-btc-sent').show();
        
        return
    }
};

