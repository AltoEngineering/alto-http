// ==========================================================================
// Project: Alto Server - JavaScript Application Framework
// Copyright: @2016 The Code Boutique, LLC
// License:   Intellectual property of The Code Boutique. LLC
// ==========================================================================

/*
 Expose Alto namespace
 */
exports = Alto.Application;

Alto.Application = Alto.Object.extend({

    init: function () {
      this.applicationWillLoad();
    },

    applicationWillLoad: function () {
        console.log('applicationWillLoad');
    },

    applicationDidLoad: function () {
        console.log('applicationDidLoad');
    }

});