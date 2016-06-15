var prettyjson = require('prettyjson');

// ==========================================================================
// Project: Alto Server - JavaScript Application Framework
// Copyright: @2016 The Code Boutique, LLC
// License:   Intellectual property of The Code Boutique. LLC
// ==========================================================================

/*
 Expose Alto namespace
 */
exports = Alto.Router;

Alto.Router = Alto.Object.extend({

    route: null,

    requestMethod: null,

    data: null,

    routeObject: null,

    routeHasDataStore: false,

    routePotentiallySecure: false,

    headers: null,

    incomingRequestDidOccur: function () {
        console.log(clc.xterm(45)('Route: %@'.fmt(this.get('route'))));
        console.log(clc.xterm(45)('Method: %@'.fmt(this.get('requestMethod'))));
        this.checkIncomingRoutePairsWithRouteObject();
    },

    checkIncomingRoutePairsWithRouteObject: function () {
        var path = this.get('_route').split('/'),
            routeObject,
            count = 0;

        while (count < path.length) {
            // (if) the first iteration: no route object... so lets assign one
            // (else if) continue walking the route object path
            // (else if) route not found... but we did find a potential path... lets assume it is a unique_id being passed in
            if (count === 0) {
                routeObject = this[path[count]];
            } else if (routeObject && routeObject[path[count]]) {
                routeObject = routeObject[path[count]];
            } else if (routeObject && !this[path[count]] && !routeObject[path[count]]) {
                routeObject = routeObject['unique_id'];
            }

            count++;
        }

        // when the above did resolve route... parse it
        // else assume it is a route that matches an internal route on a sandboxed application (pass it to the sandbox router)
        if (Alto.isPresent(routeObject)) {
            this.set('routeObject', routeObject);
            this.parseRouteObject(this.get('routeObject'));
        } else {
            console.log('Incoming route \'%@\', is unknown.'.fmt(this.get('_route')));
            LWInsurance.server.resolveResponse(Alto.responseHeaders.get('notFound'), null);
        }

    },

    parseRouteObject: function (routeObject) {
        routeObject.datastore ? this.set('routeHasDataStore', true) : this.set('routeHasDataStore', false);
        routeObject.secure ? this.set('routePotentiallySecure', true) : this.set('routePotentiallySecure', false);

        this.checkForPotentiallySecureRoute(this.get('routePotentiallySecure'));
    },

    checkForPotentiallySecureRoute: function (routePotentiallySecure) {
        if (routePotentiallySecure) {
            this.checkForLockedRoute();
        } else {
            this.verifyRouteHasDataStore(this.get('routeHasDataStore'));
        }
    },

    checkForLockedRoute: function () {
        var secureMethods = this.get('routeObject').secure,
            routeIsLocked = Alto.isArray(secureMethods) ? false : true;

        if (routeIsLocked) {
            this.checkForAuthToken();
        } else {
            this.checkForSecureRouteMethod(secureMethods);
        }
    },

    checkForSecureRouteMethod: function (secureMethods) {
        if (secureMethods.contains(this.get('requestMethod'))) {
            this.checkForAuthToken();
        } else {
            this.verifyRouteHasDataStore(this.get('routeHasDataStore'));
        }
    },

    checkForAuthToken: function () {
        var that = this;
        this.roles.datastore.read(this.get('headers.auth-token')).then(function () {
            that.verifySessionIsValid();
        }, function () {
            that.malformedSession();
        });
    },

    malformedSession: function () {
        LWInsurance.server.resolveResponse(Alto.responseHeaders.get('unauthorized'), JSON.stringify({error: 'Unauthorized'}));
    },

    verifySessionIsValid: function () {

        if (true) {
            this.verifyRouteHasDataStore(this.get('routeHasDataStore'));
        } else {
            this.malformedSession();
        }

    },

    verifyRouteHasDataStore: function (routeHasDataStore) {

        if (routeHasDataStore) {
            this.verifyAccessIsGranted(this.get('routeObject'));
        } else {
            var message = 'Incoming route \'%@\', does not have a datastore associted to it.'.fmt(this.get('_route'));
            LWInsurance.server.resolveResponse(Alto.responseHeaders.get('internalServerError'), JSON.stringify({error: message}));
        }
    },

    verifyAccessIsGranted: function (routeObject) {
        var that = this,
            route = this.get('route');

        if (routeObject.datastore.accessControl) {
            routeObject.datastore.accessControl(route).then(function () {
                that.dispatchRequestToDataStore(routeObject);
            }, function () {
                that.forbiddenRequest();
            });
        } else {
            that.dispatchRequestToDataStore(routeObject);
        }
    },

    forbiddenRequest: function () {
        LWInsurance.server.resolveResponse(Alto.responseHeaders.get('forbidden'), JSON.stringify({error: 'Forbidden'}));
    },

    dispatchRequestToDataStore: function (routeObject) {
        var requestMethod = this.get('requestMethod');

        if (Alto.isEqual(requestMethod, 'GET')) {
            routeObject.datastore.read(this.get('route'));
        } else if (Alto.isEqual(requestMethod, 'PUT')) {
            routeObject.datastore.update(this.get('data'), this.get('route'));
        } else if (Alto.isEqual(requestMethod, 'POST')) {
            routeObject.datastore.create(this.get('data'), this.get('route'));
        } else if (Alto.isEqual(requestMethod, 'DELETE')) {
            routeObject.datastore.remove(this.get('route'));
        } else {
            console.log('Can not handle incoming request method:  %@'.fmt(requestMethod));
        }

    },

    // internal use only
    _route: Alto.computed('route', function () {
        var route = this.get('route');

        return route.slice(1, route.length);
    })

});