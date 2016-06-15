// ==========================================================================
// Project: Alto Server - JavaScript Application Framework
// Copyright: @2016 The Code Boutique, LLC
// License:   Intellectual property of The Code Boutique. LLC
// ==========================================================================

/*
 Expose Alto.CassandraQueryObject namespace
 */
exports = Alto.responseHeaders;

Alto.responseHeaders = Alto.Object.createWithMixins({

    // 200's
    ok: Alto.computed(function () {
        var args = [
            '200',
            'OK'
        ];

        return args
    }),

    created: Alto.computed(function () {
        var args = [
            '201',
            'Created'
        ];

        return args
    }),

    accepted: Alto.computed(function () {
        var args = [
            '202',
            'Accepted'
        ];

        return args
    }),

    noContent: Alto.computed(function () {
        var args = [
            '204',
            'No Content'
        ];

        return args
    }),

    // 400's
    unauthorized: Alto.computed(function () {
        var args = [
            '401',
            'Unauthorized'
        ];

        return args
    }),

    forbidden: Alto.computed(function () {
        var args = [
            '403',
            'Forbidden'
        ];

        return args
    }),

    notFound: Alto.computed(function () {
        var args = [
            '404',
            'Not Found'
        ];

        return args
    }),

    methodNotAllowed: Alto.computed(function () {
        var args = [
            '405',
            'Method Not Allowed'
        ];

        return args
    }),

    imATeapot: Alto.computed(function () {
        var args = [
            '418',
            "I'm a teapot"
        ];

        return args
    }),

    internalServerError: Alto.computed(function () {
        var args = [
            '500',
            'Internal Server Error'
        ];

        return args
    }),

});