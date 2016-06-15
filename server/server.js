// ==========================================================================
// Project: Alto Server - JavaScript Application Framework
// Copyright: @2016 The Code Boutique, LLC
// License:   Intellectual property of The Code Boutique. LLC
// ==========================================================================

var http = require('http')
    , server = new http.Server();

/*
 Expose Alto namespace
 */
exports = Alto.Server;


Alto.Server = Alto.Object.extend({

    router: null,

    requestBodyBuffer: [],

    origin: null,

    response: null,

    init: function () {
        this.setupConncection();
    },

    setupConncection: function () {
        var that = this,
            router = this.get('router');

        console.log('Server is running %@'.fmt('at %@'.fmt(process.env.PORT ? process.env.PORT : 'on port:8080')));

        server.on('connection', function (socket) {
            that.connectionDidOccur();

            socket.on('end', function () {
                that.connectionDidEnd();
            });
        });


        server.on("request", function (request, response) {
            that.set('origin', request.headers.origin || "*")

            if (request.method.toUpperCase() === "OPTIONS") {
                return (that.enableCors(request, response));
            }

            request.on("data", function (chunk) {
                    that.requestDidRecieveData(chunk);
                }
            );

            request.on("end", function () {
                    return (that.requestDidEnd(request, response));
                }
            );

        })

    },

    connectionDidOccur: function () {
        console.log('Client arrived: ' + new Date());
    },

    connectionDidEnd: function () {
        console.log('Client left: ' + new Date());
    },

    enableCors: function (request, response) {
        var origin = this.get('origin');

        response.writeHead(
            "204",
            "No Content",
            {
                "access-control-allow-origin": origin,
                "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
                "access-control-allow-headers": "content-type, accept, AUTH-TOKEN, INSURANCE-TOKEN",
                "access-control-max-age": 10, // Seconds.
                "content-length": 0
            }
        );

        // End the response - we're not sending back any content.
        return (response.end());
    },

    requestDidRecieveData: function (data) {
        this.get('requestBodyBuffer').addObject(data);
    },

    resolveResponse: function (headers, data) {
        var responseBody = (data), response = this.get('response');

        // Send the headers back. Notice that even though we
        // had our OPTIONS request at the top, we still need
        // echo back the ORIGIN in order for the request to
        // be processed on the client.

        response.setHeader('Access-Control-Allow-Origin', this.get('origin'));
        response.setHeader('Content-Type', "application/json");
        response.setHeader('Content-Length', data ? responseBody.length : 0);
        response.writeHead(headers[0], headers[1]);

        // Reset requestBuffer
        this.set('requestBodyBuffer', []);

        // Close out the response.
        return (response.end(responseBody));
    },

    resolveDownload: function (data) {
        var response = this.get('response');

        response.setHeader('Content-disposition', 'attachment; filename=testing.csv');
        response.setHeader('Content-Type', 'text/csv');
        response.write(JSON.stringify(data).slice(2,-2));

        // Reset requestBuffer
        this.set('requestBodyBuffer', []);

        // Close out the response.
        return (response.end());
    },

    requestDidEnd: function (request, response) {
        this.router.set('headers', request.headers);
        this.router.set('route', request.url);
        this.router.set('requestMethod', request.method);
        this.router.set('data', this.get('requestBodyBuffer').join(""));
        this.set('response', response);
        this.router.incomingRequestDidOccur();
    }

});

server.listen(process.env.PORT || 8080);