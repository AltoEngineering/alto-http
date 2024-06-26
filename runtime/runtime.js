/*!
 * @overview  Alto - JavaScript Application Framework
 * @copyright Copyright 2011-2014 Tilde Inc. and contributors
 *            Portions Copyright 2006-2011 Strobe Inc.
 *            Portions Copyright 2008-2011 Apple Inc. All rights reserved.
 * @license   Licensed under MIT license
 *            See https://raw.github.com/emberjs/ember.js/master/LICENSE
 * @version   1.9.1
 */

(function() {
    var enifed, requireModule, eriuqer, requirejs, Alto;

    (function() {
        Alto = this.Alto = this.Alto || {};
        alto_require = function() {};

        if (typeof Alto === 'undefined') { Alto = {}; };
        function UNDEFINED() { }

        if (typeof Alto.__loader === 'undefined') {
            var registry = {}, seen = {};

            enifed = function(name, deps, callback) {
                registry[name] = { deps: deps, callback: callback };
            };

            requirejs = eriuqer = requireModule = function(name) {
                var s = seen[name];

                if (s !== undefined) { return seen[name]; }
                if (s === UNDEFINED) { return undefined;  }

                seen[name] = {};

                if (!registry[name]) {
                    throw new Error("Could not find module " + name);
                }

                var mod = registry[name];
                var deps = mod.deps;
                var callback = mod.callback;
                var reified = [];
                var exports;
                var length = deps.length;

                for (var i=0; i<length; i++) {
                    if (deps[i] === 'exports') {
                        reified.push(exports = {});
                    } else {
                        reified.push(requireModule(resolve(deps[i], name)));
                    }
                }

                var value = length === 0 ? callback.call(this) : callback.apply(this, reified);

                return seen[name] = exports || (value === undefined ? UNDEFINED : value);
            };

            function resolve(child, name) {
                if (child.charAt(0) !== '.') { return child; }
                var parts = child.split("/");
                var parentBase = name.split("/").slice(0, -1);

                for (var i=0, l=parts.length; i<l; i++) {
                    var part = parts[i];

                    if (part === '..') { parentBase.pop(); }
                    else if (part === '.') { continue; }
                    else { parentBase.push(part); }
                }

                return parentBase.join("/");
            }

            requirejs._eak_seen = registry;

            Alto.__loader = {define: enifed, require: eriuqer, registry: registry};
        } else {
            enifed = Alto.__loader.define;
            requirejs = eriuqer = requireModule = Alto.__loader.require;
        }
    })();

    enifed("backburner",
        ["backburner/utils","backburner/platform","backburner/binary-search","backburner/deferred-action-queues","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            var each = __dependency1__.each;
            var isString = __dependency1__.isString;
            var isFunction = __dependency1__.isFunction;
            var isNumber = __dependency1__.isNumber;
            var isCoercableNumber = __dependency1__.isCoercableNumber;
            var wrapInTryCatch = __dependency1__.wrapInTryCatch;
            var now = __dependency1__.now;

            var needsIETryCatchFix = __dependency2__.needsIETryCatchFix;

            var searchTimer = __dependency3__["default"];

            var DeferredActionQueues = __dependency4__["default"];

            var slice = [].slice;
            var pop = [].pop;
            var global = this;

            function Backburner(queueNames, options) {
                this.queueNames = queueNames;
                this.options = options || {};
                if (!this.options.defaultQueue) {
                    this.options.defaultQueue = queueNames[0];
                }
                this.instanceStack = [];
                this._debouncees = [];
                this._throttlers = [];
                this._timers = [];
            }

            Backburner.prototype = {
                begin: function() {
                    var options = this.options;
                    var onBegin = options && options.onBegin;
                    var previousInstance = this.currentInstance;

                    if (previousInstance) {
                        this.instanceStack.push(previousInstance);
                    }

                    this.currentInstance = new DeferredActionQueues(this.queueNames, options);
                    if (onBegin) {
                        onBegin(this.currentInstance, previousInstance);
                    }
                },

                end: function() {
                    var options = this.options;
                    var onEnd = options && options.onEnd;
                    var currentInstance = this.currentInstance;
                    var nextInstance = null;

                    // Prevent double-finally bug in Safari 6.0.2 and iOS 6
                    // This bug appears to be resolved in Safari 6.0.5 and iOS 7
                    var finallyAlreadyCalled = false;
                    try {
                        currentInstance.flush();
                    } finally {
                        if (!finallyAlreadyCalled) {
                            finallyAlreadyCalled = true;

                            this.currentInstance = null;

                            if (this.instanceStack.length) {
                                nextInstance = this.instanceStack.pop();
                                this.currentInstance = nextInstance;
                            }

                            if (onEnd) {
                                onEnd(currentInstance, nextInstance);
                            }
                        }
                    }
                },

                run: function(target, method /*, args */) {
                    var onError = getOnError(this.options);

                    this.begin();

                    if (!method) {
                        method = target;
                        target = null;
                    }

                    if (isString(method)) {
                        method = target[method];
                    }

                    var args = slice.call(arguments, 2);

                    // guard against Safari 6's double-finally bug
                    var didFinally = false;

                    if (onError) {
                        try {
                            return method.apply(target, args);
                        } catch(error) {
                            onError(error);
                        } finally {
                            if (!didFinally) {
                                didFinally = true;
                                this.end();
                            }
                        }
                    } else {
                        try {
                            return method.apply(target, args);
                        } finally {
                            if (!didFinally) {
                                didFinally = true;
                                this.end();
                            }
                        }
                    }
                },

                join: function(target, method /*, args */) {
                    if (this.currentInstance) {
                        if (!method) {
                            method = target;
                            target = null;
                        }

                        if (isString(method)) {
                            method = target[method];
                        }

                        return method.apply(target, slice.call(arguments, 2));
                    } else {
                        return this.run.apply(this, arguments);
                    }
                },

                defer: function(queueName, target, method /* , args */) {
                    if (!method) {
                        method = target;
                        target = null;
                    }

                    if (isString(method)) {
                        method = target[method];
                    }

                    var stack = this.DEBUG ? new Error() : undefined;
                    var length = arguments.length;
                    var args;

                    if (length > 3) {
                        args = new Array(length - 3);
                        for (var i = 3; i < length; i++) {
                            args[i-3] = arguments[i];
                        }
                    } else {
                        args = undefined;
                    }

                    if (!this.currentInstance) { createAutorun(this); }
                    return this.currentInstance.schedule(queueName, target, method, args, false, stack);
                },

                deferOnce: function(queueName, target, method /* , args */) {
                    if (!method) {
                        method = target;
                        target = null;
                    }

                    if (isString(method)) {
                        method = target[method];
                    }

                    var stack = this.DEBUG ? new Error() : undefined;
                    var length = arguments.length;
                    var args;

                    if (length > 3) {
                        args = new Array(length - 3);
                        for (var i = 3; i < length; i++) {
                            args[i-3] = arguments[i];
                        }
                    } else {
                        args = undefined;
                    }

                    if (!this.currentInstance) {
                        createAutorun(this);
                    }
                    return this.currentInstance.schedule(queueName, target, method, args, true, stack);
                },

                setTimeout: function() {
                    var l = arguments.length;
                    var args = new Array(l);

                    for (var x = 0; x < l; x++) {
                        args[x] = arguments[x];
                    }

                    var length = args.length,
                        method, wait, target,
                        methodOrTarget, methodOrWait, methodOrArgs;

                    if (length === 0) {
                        return;
                    } else if (length === 1) {
                        method = args.shift();
                        wait = 0;
                    } else if (length === 2) {
                        methodOrTarget = args[0];
                        methodOrWait = args[1];

                        if (isFunction(methodOrWait) || isFunction(methodOrTarget[methodOrWait])) {
                            target = args.shift();
                            method = args.shift();
                            wait = 0;
                        } else if (isCoercableNumber(methodOrWait)) {
                            method = args.shift();
                            wait = args.shift();
                        } else {
                            method = args.shift();
                            wait =  0;
                        }
                    } else {
                        var last = args[args.length - 1];

                        if (isCoercableNumber(last)) {
                            wait = args.pop();
                        } else {
                            wait = 0;
                        }

                        methodOrTarget = args[0];
                        methodOrArgs = args[1];

                        if (isFunction(methodOrArgs) || (isString(methodOrArgs) &&
                            methodOrTarget !== null &&
                            methodOrArgs in methodOrTarget)) {
                            target = args.shift();
                            method = args.shift();
                        } else {
                            method = args.shift();
                        }
                    }

                    var executeAt = now() + parseInt(wait, 10);

                    if (isString(method)) {
                        method = target[method];
                    }

                    var onError = getOnError(this.options);

                    function fn() {
                        if (onError) {
                            try {
                                method.apply(target, args);
                            } catch (e) {
                                onError(e);
                            }
                        } else {
                            method.apply(target, args);
                        }
                    }

                    // find position to insert
                    var i = searchTimer(executeAt, this._timers);

                    this._timers.splice(i, 0, executeAt, fn);

                    updateLaterTimer(this, executeAt, wait);

                    return fn;
                },

                throttle: function(target, method /* , args, wait, [immediate] */) {
                    var backburner = this;
                    var args = arguments;
                    var immediate = pop.call(args);
                    var wait, throttler, index, timer;

                    if (isNumber(immediate) || isString(immediate)) {
                        wait = immediate;
                        immediate = true;
                    } else {
                        wait = pop.call(args);
                    }

                    wait = parseInt(wait, 10);

                    index = findThrottler(target, method, this._throttlers);
                    if (index > -1) { return this._throttlers[index]; } // throttled

                    timer = global.setTimeout(function() {
                        if (!immediate) {
                            backburner.run.apply(backburner, args);
                        }
                        var index = findThrottler(target, method, backburner._throttlers);
                        if (index > -1) {
                            backburner._throttlers.splice(index, 1);
                        }
                    }, wait);

                    if (immediate) {
                        this.run.apply(this, args);
                    }

                    throttler = [target, method, timer];

                    this._throttlers.push(throttler);

                    return throttler;
                },

                debounce: function(target, method /* , args, wait, [immediate] */) {
                    var backburner = this;
                    var args = arguments;
                    var immediate = pop.call(args);
                    var wait, index, debouncee, timer;

                    if (isNumber(immediate) || isString(immediate)) {
                        wait = immediate;
                        immediate = false;
                    } else {
                        wait = pop.call(args);
                    }

                    wait = parseInt(wait, 10);
                    // Remove debouncee
                    index = findDebouncee(target, method, this._debouncees);

                    if (index > -1) {
                        debouncee = this._debouncees[index];
                        this._debouncees.splice(index, 1);
                        clearTimeout(debouncee[2]);
                    }

                    timer = global.setTimeout(function() {
                        if (!immediate) {
                            backburner.run.apply(backburner, args);
                        }
                        var index = findDebouncee(target, method, backburner._debouncees);
                        if (index > -1) {
                            backburner._debouncees.splice(index, 1);
                        }
                    }, wait);

                    if (immediate && index === -1) {
                        backburner.run.apply(backburner, args);
                    }

                    debouncee = [
                        target,
                        method,
                        timer
                    ];

                    backburner._debouncees.push(debouncee);

                    return debouncee;
                },

                cancelTimers: function() {
                    var clearItems = function(item) {
                        clearTimeout(item[2]);
                    };

                    each(this._throttlers, clearItems);
                    this._throttlers = [];

                    each(this._debouncees, clearItems);
                    this._debouncees = [];

                    if (this._laterTimer) {
                        clearTimeout(this._laterTimer);
                        this._laterTimer = null;
                    }
                    this._timers = [];

                    if (this._autorun) {
                        clearTimeout(this._autorun);
                        this._autorun = null;
                    }
                },

                hasTimers: function() {
                    return !!this._timers.length || !!this._debouncees.length || !!this._throttlers.length || this._autorun;
                },

                cancel: function(timer) {
                    var timerType = typeof timer;

                    if (timer && timerType === 'object' && timer.queue && timer.method) { // we're cancelling a deferOnce
                        return timer.queue.cancel(timer);
                    } else if (timerType === 'function') { // we're cancelling a setTimeout
                        for (var i = 0, l = this._timers.length; i < l; i += 2) {
                            if (this._timers[i + 1] === timer) {
                                this._timers.splice(i, 2); // remove the two elements
                                if (i === 0) {
                                    if (this._laterTimer) { // Active timer? Then clear timer and reset for future timer
                                        clearTimeout(this._laterTimer);
                                        this._laterTimer = null;
                                    }
                                    if (this._timers.length > 0) { // Update to next available timer when available
                                        updateLaterTimer(this, this._timers[0], this._timers[0] - now());
                                    }
                                }
                                return true;
                            }
                        }
                    } else if (Object.prototype.toString.call(timer) === "[object Array]"){ // we're cancelling a throttle or debounce
                        return this._cancelItem(findThrottler, this._throttlers, timer) ||
                            this._cancelItem(findDebouncee, this._debouncees, timer);
                    } else {
                        return; // timer was null or not a timer
                    }
                },

                _cancelItem: function(findMethod, array, timer){
                    var item, index;

                    if (timer.length < 3) { return false; }

                    index = findMethod(timer[0], timer[1], array);

                    if (index > -1) {

                        item = array[index];

                        if (item[2] === timer[2]) {
                            array.splice(index, 1);
                            clearTimeout(timer[2]);
                            return true;
                        }
                    }

                    return false;
                }
            };

            Backburner.prototype.schedule = Backburner.prototype.defer;
            Backburner.prototype.scheduleOnce = Backburner.prototype.deferOnce;
            Backburner.prototype.later = Backburner.prototype.setTimeout;

            if (needsIETryCatchFix) {
                var originalRun = Backburner.prototype.run;
                Backburner.prototype.run = wrapInTryCatch(originalRun);

                var originalEnd = Backburner.prototype.end;
                Backburner.prototype.end = wrapInTryCatch(originalEnd);
            }

            function getOnError(options) {
                return options.onError || (options.onErrorTarget && options.onErrorTarget[options.onErrorMethod]);
            }

            function createAutorun(backburner) {
                backburner.begin();
                backburner._autorun = global.setTimeout(function() {
                    backburner._autorun = null;
                    backburner.end();
                });
            }

            function updateLaterTimer(backburner, executeAt, wait) {
                var n = now();
                if (!backburner._laterTimer || executeAt < backburner._laterTimerExpiresAt || backburner._laterTimerExpiresAt < n) {

                    if (backburner._laterTimer) {
                        // Clear when:
                        // - Already expired
                        // - New timer is earlier
                        clearTimeout(backburner._laterTimer);

                        if (backburner._laterTimerExpiresAt < n) { // If timer was never triggered
                            // Calculate the left-over wait-time
                            wait = Math.max(0, executeAt - n);
                        }
                    }

                    backburner._laterTimer = global.setTimeout(function() {
                        backburner._laterTimer = null;
                        backburner._laterTimerExpiresAt = null;
                        executeTimers(backburner);
                    }, wait);

                    backburner._laterTimerExpiresAt = n + wait;
                }
            }

            function executeTimers(backburner) {
                var n = now();
                var fns, i, l;

                backburner.run(function() {
                    i = searchTimer(n, backburner._timers);

                    fns = backburner._timers.splice(0, i);

                    for (i = 1, l = fns.length; i < l; i += 2) {
                        backburner.schedule(backburner.options.defaultQueue, null, fns[i]);
                    }
                });

                if (backburner._timers.length) {
                    updateLaterTimer(backburner, backburner._timers[0], backburner._timers[0] - n);
                }
            }

            function findDebouncee(target, method, debouncees) {
                return findItem(target, method, debouncees);
            }

            function findThrottler(target, method, throttlers) {
                return findItem(target, method, throttlers);
            }

            function findItem(target, method, collection) {
                var item;
                var index = -1;

                for (var i = 0, l = collection.length; i < l; i++) {
                    item = collection[i];
                    if (item[0] === target && item[1] === method) {
                        index = i;
                        break;
                    }
                }

                return index;
            }

            __exports__["default"] = Backburner;
        });
    enifed("backburner.umd",
        ["./backburner"],
        function(__dependency1__) {
            "use strict";
            var Backburner = __dependency1__["default"];

            /* global define:true module:true window: true */
            if (typeof enifed === 'function' && enifed.amd) {
                enifed(function() { return Backburner; });
            } else if (typeof module !== 'undefined' && module.exports) {
                module.exports = Backburner;
            } else if (typeof this !== 'undefined') {
                this['Backburner'] = Backburner;
            }
        });
    enifed("backburner/binary-search",
        ["exports"],
        function(__exports__) {
            "use strict";
            __exports__["default"] = function binarySearch(time, timers) {
                var start = 0;
                var end = timers.length - 2;
                var middle, l;

                while (start < end) {
                    // since timers is an array of pairs 'l' will always
                    // be an integer
                    l = (end - start) / 2;

                    // compensate for the index in case even number
                    // of pairs inside timers
                    middle = start + l - (l % 2);

                    if (time >= timers[middle]) {
                        start = middle + 2;
                    } else {
                        end = middle;
                    }
                }

                return (time >= timers[start]) ? start + 2 : start;
            }
        });
    enifed("backburner/deferred-action-queues",
        ["./utils","./queue","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var each = __dependency1__.each;
            var Queue = __dependency2__["default"];

            function DeferredActionQueues(queueNames, options) {
                var queues = this.queues = Object.create(null);
                this.queueNames = queueNames = queueNames || [];

                this.options = options;

                each(queueNames, function(queueName) {
                    queues[queueName] = new Queue(queueName, options[queueName], options);
                });
            }

            function noSuchQueue(name) {
                throw new Error("You attempted to schedule an action in a queue (" + name + ") that doesn't exist");
            }

            DeferredActionQueues.prototype = {
                schedule: function(name, target, method, args, onceFlag, stack) {
                    var queues = this.queues;
                    var queue = queues[name];

                    if (!queue) {
                        noSuchQueue(name);
                    }

                    if (onceFlag) {
                        return queue.pushUnique(target, method, args, stack);
                    } else {
                        return queue.push(target, method, args, stack);
                    }
                },

                flush: function() {
                    var queues = this.queues;
                    var queueNames = this.queueNames;
                    var queueName, queue, queueItems, priorQueueNameIndex;
                    var queueNameIndex = 0;
                    var numberOfQueues = queueNames.length;
                    var options = this.options;

                    while (queueNameIndex < numberOfQueues) {
                        queueName = queueNames[queueNameIndex];
                        queue = queues[queueName];

                        var numberOfQueueItems = queue._queue.length;

                        if (numberOfQueueItems === 0) {
                            queueNameIndex++;
                        } else {
                            queue.flush(false /* async */);
                            queueNameIndex = 0;
                        }
                    }
                }
            };

            __exports__["default"] = DeferredActionQueues;
        });
    enifed("backburner/platform",
        ["exports"],
        function(__exports__) {
            "use strict";
            // In IE 6-8, try/finally doesn't work without a catch.
            // Unfortunately, this is impossible to test for since wrapping it in a parent try/catch doesn't trigger the bug.
            // This tests for another broken try/catch behavior that only exhibits in the same versions of IE.
            var needsIETryCatchFix = (function(e,x){
                try{ x(); }
                catch(e) { } // jshint ignore:line
                return !!e;
            })();
            __exports__.needsIETryCatchFix = needsIETryCatchFix;
        });
    enifed("backburner/queue",
        ["./utils","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var isString = __dependency1__.isString;

            function Queue(name, options, globalOptions) {
                this.name = name;
                this.globalOptions = globalOptions || {};
                this.options = options;
                this._queue = [];
                this.targetQueues = Object.create(null);
                this._queueBeingFlushed = undefined;
            }

            Queue.prototype = {
                push: function(target, method, args, stack) {
                    var queue = this._queue;
                    queue.push(target, method, args, stack);

                    return {
                        queue: this,
                        target: target,
                        method: method
                    };
                },

                pushUniqueWithoutGuid: function(target, method, args, stack) {
                    var queue = this._queue;

                    for (var i = 0, l = queue.length; i < l; i += 4) {
                        var currentTarget = queue[i];
                        var currentMethod = queue[i+1];

                        if (currentTarget === target && currentMethod === method) {
                            queue[i+2] = args;  // replace args
                            queue[i+3] = stack; // replace stack
                            return;
                        }
                    }

                    queue.push(target, method, args, stack);
                },

                targetQueue: function(targetQueue, target, method, args, stack) {
                    var queue = this._queue;

                    for (var i = 0, l = targetQueue.length; i < l; i += 4) {
                        var currentMethod = targetQueue[i];
                        var currentIndex  = targetQueue[i + 1];

                        if (currentMethod === method) {
                            queue[currentIndex + 2] = args;  // replace args
                            queue[currentIndex + 3] = stack; // replace stack
                            return;
                        }
                    }

                    targetQueue.push(
                        method,
                        queue.push(target, method, args, stack) - 4
                    );
                },

                pushUniqueWithGuid: function(guid, target, method, args, stack) {
                    var hasLocalQueue = this.targetQueues[guid];

                    if (hasLocalQueue) {
                        this.targetQueue(hasLocalQueue, target, method, args, stack);
                    } else {
                        this.targetQueues[guid] = [
                            method,
                            this._queue.push(target, method, args, stack) - 4
                        ];
                    }

                    return {
                        queue: this,
                        target: target,
                        method: method
                    };
                },

                pushUnique: function(target, method, args, stack) {
                    var queue = this._queue, currentTarget, currentMethod, i, l;
                    var KEY = this.globalOptions.GUID_KEY;

                    if (target && KEY) {
                        var guid = target[KEY];
                        if (guid) {
                            return this.pushUniqueWithGuid(guid, target, method, args, stack);
                        }
                    }

                    this.pushUniqueWithoutGuid(target, method, args, stack);

                    return {
                        queue: this,
                        target: target,
                        method: method
                    };
                },

                invoke: function(target, method, args, _, _errorRecordedForStack) {
                    if (args && args.length > 0) {
                        method.apply(target, args);
                    } else {
                        method.call(target);
                    }
                },

                invokeWithOnError: function(target, method, args, onError, errorRecordedForStack) {
                    try {
                        if (args && args.length > 0) {
                            method.apply(target, args);
                        } else {
                            method.call(target);
                        }
                    } catch(error) {
                        onError(error, errorRecordedForStack);
                    }
                },

                flush: function(sync) {
                    var queue = this._queue;
                    var length = queue.length;

                    if (length === 0) {
                        return;
                    }

                    var globalOptions = this.globalOptions;
                    var options = this.options;
                    var before = options && options.before;
                    var after = options && options.after;
                    var onError = globalOptions.onError || (globalOptions.onErrorTarget &&
                        globalOptions.onErrorTarget[globalOptions.onErrorMethod]);
                    var target, method, args, errorRecordedForStack;
                    var invoke = onError ? this.invokeWithOnError : this.invoke;

                    this.targetQueues = Object.create(null);
                    var queueItems = this._queueBeingFlushed = this._queue.slice();
                    this._queue = [];

                    if (before) {
                        before();
                    }

                    for (var i = 0; i < length; i += 4) {
                        target                = queueItems[i];
                        method                = queueItems[i+1];
                        args                  = queueItems[i+2];
                        errorRecordedForStack = queueItems[i+3]; // Debugging assistance

                        if (isString(method)) {
                            method = target[method];
                        }

                        // method could have been nullified / canceled during flush
                        if (method) {
                            //
                            //    ** Attention intrepid developer **
                            //
                            //    To find out the stack of this task when it was scheduled onto
                            //    the run loop, add the following to your app.js:
                            //
                            //    Alto.run.backburner.DEBUG = true; // NOTE: This slows your app, don't leave it on in production.
                            //
                            //    Once that is in place, when you are at a breakpoint and navigate
                            //    here in the stack explorer, you can look at `errorRecordedForStack.stack`,
                            //    which will be the captured stack when this job was scheduled.
                            //
                            invoke(target, method, args, onError, errorRecordedForStack);
                        }
                    }

                    if (after) {
                        after();
                    }

                    this._queueBeingFlushed = undefined;

                    if (sync !== false &&
                        this._queue.length > 0) {
                        // check if new items have been added
                        this.flush(true);
                    }
                },

                cancel: function(actionToCancel) {
                    var queue = this._queue, currentTarget, currentMethod, i, l;
                    var target = actionToCancel.target;
                    var method = actionToCancel.method;
                    var GUID_KEY = this.globalOptions.GUID_KEY;

                    if (GUID_KEY && this.targetQueues && target) {
                        var targetQueue = this.targetQueues[target[GUID_KEY]];

                        if (targetQueue) {
                            for (i = 0, l = targetQueue.length; i < l; i++) {
                                if (targetQueue[i] === method) {
                                    targetQueue.splice(i, 1);
                                }
                            }
                        }
                    }

                    for (i = 0, l = queue.length; i < l; i += 4) {
                        currentTarget = queue[i];
                        currentMethod = queue[i+1];

                        if (currentTarget === target &&
                            currentMethod === method) {
                            queue.splice(i, 4);
                            return true;
                        }
                    }

                    // if not found in current queue
                    // could be in the queue that is being flushed
                    queue = this._queueBeingFlushed;

                    if (!queue) {
                        return;
                    }

                    for (i = 0, l = queue.length; i < l; i += 4) {
                        currentTarget = queue[i];
                        currentMethod = queue[i+1];

                        if (currentTarget === target &&
                            currentMethod === method) {
                            // don't mess with array during flush
                            // just nullify the method
                            queue[i+1] = null;
                            return true;
                        }
                    }
                }
            };

            __exports__["default"] = Queue;
        });
    enifed("backburner/utils",
        ["exports"],
        function(__exports__) {
            "use strict";
            var NUMBER = /\d+/;

            function each(collection, callback) {
                for (var i = 0; i < collection.length; i++) {
                    callback(collection[i]);
                }
            }

            __exports__.each = each;// Date.now is not available in browsers < IE9
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now#Compatibility
            var now = Date.now || function() { return new Date().getTime(); };
            __exports__.now = now;
            function isString(suspect) {
                return typeof suspect === 'string';
            }

            __exports__.isString = isString;function isFunction(suspect) {
                return typeof suspect === 'function';
            }

            __exports__.isFunction = isFunction;function isNumber(suspect) {
                return typeof suspect === 'number';
            }

            __exports__.isNumber = isNumber;function isCoercableNumber(number) {
                return isNumber(number) || NUMBER.test(number);
            }

            __exports__.isCoercableNumber = isCoercableNumber;function wrapInTryCatch(func) {
                return function () {
                    try {
                        return func.apply(this, arguments);
                    } catch (e) {
                        throw e;
                    }
                };
            }

            __exports__.wrapInTryCatch = wrapInTryCatch;
        });
    enifed("calculateVersion",
        [],
        function() {
            "use strict";
            'use strict';

            var fs   = eriuqer('fs');
            var path = eriuqer('path');

            module.exports = function () {
                var packageVersion = eriuqer('../package.json').version;
                var output         = [packageVersion];
                var gitPath        = path.join(__dirname,'..','.git');
                var headFilePath   = path.join(gitPath, 'HEAD');

                if (packageVersion.indexOf('+') > -1) {
                    try {
                        if (fs.existsSync(headFilePath)) {
                            var headFile = fs.readFileSync(headFilePath, {encoding: 'utf8'});
                            var branchName = headFile.split('/').slice(-1)[0].trim();
                            var refPath = headFile.split(' ')[1];
                            var branchSHA;

                            if (refPath) {
                                var branchPath = path.join(gitPath, refPath.trim());
                                branchSHA  = fs.readFileSync(branchPath);
                            } else {
                                branchSHA = branchName;
                            }

                            output.push(branchSHA.slice(0,10));
                        }
                    } catch (err) {
                        console.error(err.stack);
                    }
                    return output.join('.');
                } else {
                    return packageVersion;
                }
            };
        });
    enifed("container",
        ["container/container","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            /*
             Public api for the container is still in flux.
             The public api, specified on the application namespace should be considered the stable api.
             // @module container
             @private
             */

            /*
             Flag to enable/disable model factory injections (disabled by default)
             If model factory injections are enabled, models should not be
             accessed globally (only through `container.lookupFactory('model:modelName'))`);
             */
            Alto.MODEL_FACTORY_INJECTIONS = false;

            if (Alto.ENV && typeof Alto.ENV.MODEL_FACTORY_INJECTIONS !== 'undefined') {
                Alto.MODEL_FACTORY_INJECTIONS = !!Alto.ENV.MODEL_FACTORY_INJECTIONS;
            }


            var Container = __dependency1__["default"];

            __exports__["default"] = Container;
        });
    enifed("container/container",
        ["ember-metal/core","ember-metal/keys","ember-metal/dictionary","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            // Alto.assert
            var emberKeys = __dependency2__["default"];
            var dictionary = __dependency3__["default"];

            // A lightweight container that helps to assemble and decouple components.
            // Public api for the container is still in flux.
            // The public api, specified on the application namespace should be considered the stable api.
            function Container(parent) {
                this.parent = parent;
                this.children = [];

                this.resolver = parent && parent.resolver || function() {};

                this.registry       = dictionary(parent ? parent.registry : null);
                this.cache          = dictionary(parent ? parent.cache : null);
                this.factoryCache   = dictionary(parent ? parent.factoryCache : null);
                this.resolveCache   = dictionary(parent ? parent.resolveCache : null);
                this.typeInjections = dictionary(parent ? parent.typeInjections : null);
                this.injections     = dictionary(null);
                this.normalizeCache = dictionary(null);

                this.factoryTypeInjections = dictionary(parent ? parent.factoryTypeInjections : null);
                this.factoryInjections     = dictionary(null);

                this._options     = dictionary(parent ? parent._options : null);
                this._typeOptions = dictionary(parent ? parent._typeOptions : null);
            }

            Container.prototype = {

                /**
                 @property parent
                 @type Container
                 @default null
                 */
                parent: null,

                /**
                 @property children
                 @type Array
                 @default []
                 */
                children: null,

                /**
                 @property resolver
                 @type function
                 */
                resolver: null,

                /**
                 @property registry
                 @type InheritingDict
                 */
                registry: null,

                /**
                 @property cache
                 @type InheritingDict
                 */
                cache: null,

                /**
                 @property typeInjections
                 @type InheritingDict
                 */
                typeInjections: null,

                /**
                 @property injections
                 @type Object
                 @default {}
                 */
                injections: null,

                /**
                 @private

                 @property _options
                 @type InheritingDict
                 @default null
                 */
                _options: null,

                /**
                 @private

                 @property _typeOptions
                 @type InheritingDict
                 */
                _typeOptions: null,

                /**
                 Returns a new child of the current container. These children are configured
                 to correctly inherit from the current container.

                 @method child
                 @return {Container}
                 */
                child: function() {
                    var container = new Container(this);
                    this.children.push(container);
                    return container;
                },

                /**
                 Registers a factory for later injection.

                 Example:

                 ```javascript
                 var container = new Container();

                 container.register('model:user', Person, {singleton: false });
                 container.register('fruit:favorite', Orange);
                 container.register('communication:main', Altoail, {singleton: false});
                 ```

                 @method register
                 @param {String} fullName
                 @param {Function} factory
                 @param {Object} options
                 */
                register: function(fullName, factory, options) {
                    Alto.assert('fullName must be a proper full name', validateFullName(fullName));

                    if (factory === undefined) {
                        throw new TypeError('Attempting to register an unknown factory: `' + fullName + '`');
                    }

                    var normalizedName = this.normalize(fullName);

                    if (normalizedName in this.cache) {
                        throw new Error('Cannot re-register: `' + fullName +'`, as it has already been looked up.');
                    }

                    this.registry[normalizedName] = factory;
                    this._options[normalizedName] = (options || {});
                },

                /**
                 Unregister a fullName

                 ```javascript
                 var container = new Container();
                 container.register('model:user', User);

                 container.lookup('model:user') instanceof User //=> true

                 container.unregister('model:user')
                 container.lookup('model:user') === undefined //=> true
                 ```

                 @method unregister
                 @param {String} fullName
                 */
                unregister: function(fullName) {
                    Alto.assert('fullName must be a proper full name', validateFullName(fullName));

                    var normalizedName = this.normalize(fullName);

                    delete this.registry[normalizedName];
                    delete this.cache[normalizedName];
                    delete this.factoryCache[normalizedName];
                    delete this.resolveCache[normalizedName];
                    delete this._options[normalizedName];
                },

                /**
                 Given a fullName return the corresponding factory.

                 By default `resolve` will retrieve the factory from
                 its container's registry.

                 ```javascript
                 var container = new Container();
                 container.register('api:twitter', Twitter);

                 container.resolve('api:twitter') // => Twitter
                 ```

                 Optionally the container can be provided with a custom resolver.
                 If provided, `resolve` will first provide the custom resolver
                 the opportunity to resolve the fullName, otherwise it will fallback
                 to the registry.

                 ```javascript
                 var container = new Container();
                 container.resolver = function(fullName) {
          // lookup via the module system of choice
        };

                 // the twitter factory is added to the module system
                 container.resolve('api:twitter') // => Twitter
                 ```

                 @method resolve
                 @param {String} fullName
                 @return {Function} fullName's factory
                 */
                resolve: function(fullName) {
                    Alto.assert('fullName must be a proper full name', validateFullName(fullName));
                    return resolve(this, this.normalize(fullName));
                },

                /**
                 A hook that can be used to describe how the resolver will
                 attempt to find the factory.

                 For example, the default Alto `.describe` returns the full
                 class name (including namespace) where Alto's resolver expects
                 to find the `fullName`.

                 @method describe
                 @param {String} fullName
                 @return {string} described fullName
                 */
                describe: function(fullName) {
                    return fullName;
                },

                /**
                 A hook to enable custom fullName normalization behaviour

                 @method normalizeFullName
                 @param {String} fullName
                 @return {string} normalized fullName
                 */
                normalizeFullName: function(fullName) {
                    return fullName;
                },

                /**
                 normalize a fullName based on the applications conventions

                 @method normalize
                 @param {String} fullName
                 @return {string} normalized fullName
                 */
                normalize: function(fullName) {
                    return this.normalizeCache[fullName] || (
                            this.normalizeCache[fullName] = this.normalizeFullName(fullName)
                        );
                },

                /**
                 @method makeToString

                 @param {any} factory
                 @param {string} fullName
                 @return {function} toString function
                 */
                makeToString: function(factory, fullName) {
                    return factory.toString();
                },

                /**
                 Given a fullName return a corresponding instance.

                 The default behaviour is for lookup to return a singleton instance.
                 The singleton is scoped to the container, allowing multiple containers
                 to all have their own locally scoped singletons.

                 ```javascript
                 var container = new Container();
                 container.register('api:twitter', Twitter);

                 var twitter = container.lookup('api:twitter');

                 twitter instanceof Twitter; // => true

                 // by default the container will return singletons
                 var twitter2 = container.lookup('api:twitter');
                 twitter2 instanceof Twitter; // => true

                 twitter === twitter2; //=> true
                 ```

                 If singletons are not wanted an optional flag can be provided at lookup.

                 ```javascript
                 var container = new Container();
                 container.register('api:twitter', Twitter);

                 var twitter = container.lookup('api:twitter', { singleton: false });
                 var twitter2 = container.lookup('api:twitter', { singleton: false });

                 twitter === twitter2; //=> false
                 ```

                 @method lookup
                 @param {String} fullName
                 @param {Object} options
                 @return {any}
                 */
                lookup: function(fullName, options) {
                    Alto.assert('fullName must be a proper full name', validateFullName(fullName));
                    return lookup(this, this.normalize(fullName), options);
                },

                /**
                 Given a fullName return the corresponding factory.

                 @method lookupFactory
                 @param {String} fullName
                 @return {any}
                 */
                lookupFactory: function(fullName) {
                    Alto.assert('fullName must be a proper full name', validateFullName(fullName));
                    return factoryFor(this, this.normalize(fullName));
                },

                /**
                 Given a fullName check if the container is aware of its factory
                 or singleton instance.

                 @method has
                 @param {String} fullName
                 @return {Boolean}
                 */
                has: function(fullName) {
                    Alto.assert('fullName must be a proper full name', validateFullName(fullName));
                    return has(this, this.normalize(fullName));
                },

                /**
                 Allow registering options for all factories of a type.

                 ```javascript
                 var container = new Container();

                 // if all of type `connection` must not be singletons
                 container.optionsForType('connection', { singleton: false });

                 container.register('connection:twitter', TwitterConnection);
                 container.register('connection:facebook', FacebookConnection);

                 var twitter = container.lookup('connection:twitter');
                 var twitter2 = container.lookup('connection:twitter');

                 twitter === twitter2; // => false

                 var facebook = container.lookup('connection:facebook');
                 var facebook2 = container.lookup('connection:facebook');

                 facebook === facebook2; // => false
                 ```

                 @method optionsForType
                 @param {String} type
                 @param {Object} options
                 */
                optionsForType: function(type, options) {
                    if (this.parent) { illegalChildOperation('optionsForType'); }

                    this._typeOptions[type] = options;
                },

                /**
                 @method options
                 @param {String} fullName
                 @param {Object} options
                 */
                options: function(fullName, options) {
                    options = options || {};
                    var normalizedName = this.normalize(fullName);
                    this._options[normalizedName] = options;
                },

                /**
                 Used only via `injection`.

                 Provides a specialized form of injection, specifically enabling
                 all objects of one type to be injected with a reference to another
                 object.

                 For example, provided each object of type `controller` needed a `router`.
                 one would do the following:

                 ```javascript
                 var container = new Container();

                 container.register('router:main', Router);
                 container.register('controller:user', UserController);
                 container.register('controller:post', PostController);

                 container.typeInjection('controller', 'router', 'router:main');

                 var user = container.lookup('controller:user');
                 var post = container.lookup('controller:post');

                 user.router instanceof Router; //=> true
                 post.router instanceof Router; //=> true

                 // both controllers share the same router
                 user.router === post.router; //=> true
                 ```

                 @private
                 @method typeInjection
                 @param {String} type
                 @param {String} property
                 @param {String} fullName
                 */
                typeInjection: function(type, property, fullName) {
                    Alto.assert('fullName must be a proper full name', validateFullName(fullName));

                    if (this.parent) { illegalChildOperation('typeInjection'); }

                    var fullNameType = fullName.split(':')[0];
                    if (fullNameType === type) {
                        throw new Error('Cannot inject a `' + fullName +
                            '` on other ' + type +
                            '(s). Register the `' + fullName +
                            '` as a different type and perform the typeInjection.');
                    }

                    addTypeInjection(this.typeInjections, type, property, fullName);
                },

                /**
                 Defines injection rules.

                 These rules are used to inject dependencies onto objects when they
                 are instantiated.

                 Two forms of injections are possible:

                 * Injecting one fullName on another fullName
                 * Injecting one fullName on a type

                 Example:

                 ```javascript
                 var container = new Container();

                 container.register('source:main', Source);
                 container.register('model:user', User);
                 container.register('model:post', Post);

                 // injecting one fullName on another fullName
                 // eg. each user model gets a post model
                 container.injection('model:user', 'post', 'model:post');

                 // injecting one fullName on another type
                 container.injection('model', 'source', 'source:main');

                 var user = container.lookup('model:user');
                 var post = container.lookup('model:post');

                 user.source instanceof Source; //=> true
                 post.source instanceof Source; //=> true

                 user.post instanceof Post; //=> true

                 // and both models share the same source
                 user.source === post.source; //=> true
                 ```

                 @method injection
                 @param {String} factoryName
                 @param {String} property
                 @param {String} injectionName
                 */
                injection: function(fullName, property, injectionName) {
                    if (this.parent) { illegalChildOperation('injection'); }

                    validateFullName(injectionName);
                    var normalizedInjectionName = this.normalize(injectionName);

                    if (fullName.indexOf(':') === -1) {
                        return this.typeInjection(fullName, property, normalizedInjectionName);
                    }

                    Alto.assert('fullName must be a proper full name', validateFullName(fullName));
                    var normalizedName = this.normalize(fullName);

                    if (this.cache[normalizedName]) {
                        throw new Error("Attempted to register an injection for a type that has already been looked up. ('" +
                            normalizedName + "', '" +
                            property + "', '" +
                            injectionName + "')");
                    }

                    addInjection(initRules(this.injections, normalizedName), property, normalizedInjectionName);
                },


                /**
                 Used only via `factoryInjection`.

                 Provides a specialized form of injection, specifically enabling
                 all factory of one type to be injected with a reference to another
                 object.

                 For example, provided each factory of type `model` needed a `store`.
                 one would do the following:

                 ```javascript
                 var container = new Container();

                 container.register('store:main', SomeStore);

                 container.factoryTypeInjection('model', 'store', 'store:main');

                 var store = container.lookup('store:main');
                 var UserFactory = container.lookupFactory('model:user');

                 UserFactory.store instanceof SomeStore; //=> true
                 ```

                 @private
                 @method factoryTypeInjection
                 @param {String} type
                 @param {String} property
                 @param {String} fullName
                 */
                factoryTypeInjection: function(type, property, fullName) {
                    if (this.parent) { illegalChildOperation('factoryTypeInjection'); }

                    addTypeInjection(this.factoryTypeInjections, type, property, this.normalize(fullName));
                },

                /**
                 Defines factory injection rules.

                 Similar to regular injection rules, but are run against factories, via
                 `Container#lookupFactory`.

                 These rules are used to inject objects onto factories when they
                 are looked up.

                 Two forms of injections are possible:

                 * Injecting one fullName on another fullName
                 * Injecting one fullName on a type

                 Example:

                 ```javascript
                 var container = new Container();

                 container.register('store:main', Store);
                 container.register('store:secondary', OtherStore);
                 container.register('model:user', User);
                 container.register('model:post', Post);

                 // injecting one fullName on another type
                 container.factoryInjection('model', 'store', 'store:main');

                 // injecting one fullName on another fullName
                 container.factoryInjection('model:post', 'secondaryStore', 'store:secondary');

                 var UserFactory = container.lookupFactory('model:user');
                 var PostFactory = container.lookupFactory('model:post');
                 var store = container.lookup('store:main');

                 UserFactory.store instanceof Store; //=> true
                 UserFactory.secondaryStore instanceof OtherStore; //=> false

                 PostFactory.store instanceof Store; //=> true
                 PostFactory.secondaryStore instanceof OtherStore; //=> true

                 // and both models share the same source instance
                 UserFactory.store === PostFactory.store; //=> true
                 ```

                 @method factoryInjection
                 @param {String} factoryName
                 @param {String} property
                 @param {String} injectionName
                 */
                factoryInjection: function(fullName, property, injectionName) {
                    if (this.parent) { illegalChildOperation('injection'); }

                    var normalizedName = this.normalize(fullName);
                    var normalizedInjectionName = this.normalize(injectionName);

                    validateFullName(injectionName);

                    if (fullName.indexOf(':') === -1) {
                        return this.factoryTypeInjection(normalizedName, property, normalizedInjectionName);
                    }

                    Alto.assert('fullName must be a proper full name', validateFullName(fullName));

                    if (this.factoryCache[normalizedName]) {
                        throw new Error('Attempted to register a factoryInjection for a type that has already ' +
                            'been looked up. (\'' + normalizedName + '\', \'' + property + '\', \'' + injectionName + '\')');
                    }

                    addInjection(initRules(this.factoryInjections, normalizedName), property, normalizedInjectionName);
                },

                /**
                 A depth first traversal, destroying the container, its descendant containers and all
                 their managed objects.

                 @method destroy
                 */
                destroy: function() {
                    for (var i = 0, length = this.children.length; i < length; i++) {
                        this.children[i].destroy();
                    }

                    this.children = [];

                    eachDestroyable(this, function(item) {
                        item.destroy();
                    });

                    this.parent = undefined;
                    this.isDestroyed = true;
                },

                /**
                 @method reset
                 */
                reset: function() {
                    for (var i = 0, length = this.children.length; i < length; i++) {
                        resetCache(this.children[i]);
                    }

                    resetCache(this);
                }
            };

            function resolve(container, normalizedName) {
                var cached = container.resolveCache[normalizedName];
                if (cached) { return cached; }

                var resolved = container.resolver(normalizedName) || container.registry[normalizedName];
                container.resolveCache[normalizedName] = resolved;

                return resolved;
            }

            function has(container, fullName){
                if (container.cache[fullName]) {
                    return true;
                }

                return container.resolve(fullName) !== undefined;
            }

            function lookup(container, fullName, options) {
                options = options || {};

                if (container.cache[fullName] && options.singleton !== false) {
                    return container.cache[fullName];
                }

                var value = instantiate(container, fullName);

                if (value === undefined) { return; }

                if (isSingleton(container, fullName) && options.singleton !== false) {
                    container.cache[fullName] = value;
                }

                return value;
            }

            function illegalChildOperation(operation) {
                throw new Error(operation + ' is not currently supported on child containers');
            }

            function isSingleton(container, fullName) {
                var singleton = option(container, fullName, 'singleton');

                return singleton !== false;
            }

            function buildInjections(container, injections) {
                var hash = {};

                if (!injections) { return hash; }

                validateInjections(container, injections);

                var injection;

                for (var i = 0, length = injections.length; i < length; i++) {
                    injection = injections[i];
                    hash[injection.property] = lookup(container, injection.fullName);
                }

                return hash;
            }

            function validateInjections(container, injections) {
                if (!injections) { return; }

                var fullName;

                for (var i = 0, length = injections.length; i < length; i++) {
                    fullName = injections[i].fullName;

                    if (!container.has(fullName)) {
                        throw new Error('Attempting to inject an unknown injection: `' + fullName + '`');
                    }
                }
            }

            function option(container, fullName, optionName) {
                var options = container._options[fullName];

                if (options && options[optionName] !== undefined) {
                    return options[optionName];
                }

                var type = fullName.split(':')[0];
                options = container._typeOptions[type];

                if (options) {
                    return options[optionName];
                }
            }

            function factoryFor(container, fullName) {
                var cache = container.factoryCache;
                if (cache[fullName]) {
                    return cache[fullName];
                }
                var factory = container.resolve(fullName);
                if (factory === undefined) { return; }

                var type = fullName.split(':')[0];
                if (!factory || typeof factory.extend !== 'function' || (!Alto.MODEL_FACTORY_INJECTIONS && type === 'model')) {
                    // TODO: think about a 'safe' merge style extension
                    // for now just fallback to create time injection
                    cache[fullName] = factory;
                    return factory;
                } else {
                    var injections = injectionsFor(container, fullName);
                    var factoryInjections = factoryInjectionsFor(container, fullName);

                    factoryInjections._toString = container.makeToString(factory, fullName);

                    var injectedFactory = factory.extend(injections);
                    injectedFactory.reopenClass(factoryInjections);

                    cache[fullName] = injectedFactory;

                    return injectedFactory;
                }
            }

            function injectionsFor(container, fullName) {
                var splitName = fullName.split(':');
                var type = splitName[0];
                var injections = [];

                injections = injections.concat(container.typeInjections[type] || []);
                injections = injections.concat(container.injections[fullName] || []);

                injections = buildInjections(container, injections);
                injections._debugContainerKey = fullName;
                injections.container = container;

                return injections;
            }

            function factoryInjectionsFor(container, fullName) {
                var splitName = fullName.split(':');
                var type = splitName[0];
                var factoryInjections = [];

                factoryInjections = factoryInjections.concat(container.factoryTypeInjections[type] || []);
                factoryInjections = factoryInjections.concat(container.factoryInjections[fullName] || []);

                factoryInjections = buildInjections(container, factoryInjections);
                factoryInjections._debugContainerKey = fullName;

                return factoryInjections;
            }

            function normalizeInjectionsHash(hash) {
                var injections = [];

                for (var key in hash) {
                    if (hash.hasOwnProperty(key)) {
                        Alto.assert("Expected a proper full name, given '" + hash[key] + "'", validateFullName(hash[key]));

                        addInjection(injections, key, hash[key]);
                    }
                }

                return injections;
            }

            function instantiate(container, fullName) {
                var factory = factoryFor(container, fullName);
                var lazyInjections;

                if (option(container, fullName, 'instantiate') === false) {
                    return factory;
                }

                if (factory) {
                    if (typeof factory.create !== 'function') {
                        throw new Error('Failed to create an instance of \'' + fullName + '\'. ' +
                            'Most likely an improperly defined class or an invalid module export.');
                    }


                    if (typeof factory.extend === 'function') {
                        // assume the factory was extendable and is already injected
                        return factory.create();
                    } else {
                        // assume the factory was extendable
                        // to create time injections
                        // TODO: support new'ing for instantiation and merge injections for pure JS Functions
                        return factory.create(injectionsFor(container, fullName));
                    }
                }
            }

            function eachDestroyable(container, callback) {
                var cache = container.cache;
                var keys = emberKeys(cache);
                var key, value;

                for (var i = 0, l = keys.length; i < l; i++) {
                    key = keys[i];
                    value = cache[key];

                    if (option(container, key, 'instantiate') !== false) {
                        callback(value);
                    }
                }
            }

            function resetCache(container) {
                eachDestroyable(container, function(value) {
                    value.destroy();
                });

                container.cache.dict = dictionary(null);
            }

            function addTypeInjection(rules, type, property, fullName) {
                var injections = rules[type];

                if (!injections) {
                    injections = [];
                    rules[type] = injections;
                }

                injections.push({
                    property: property,
                    fullName: fullName
                });
            }

            var VALID_FULL_NAME_REGEXP = /^[^:]+.+:[^:]+$/;
            function validateFullName(fullName) {
                if (!VALID_FULL_NAME_REGEXP.test(fullName)) {
                    throw new TypeError('Invalid Fullname, expected: `type:name` got: ' + fullName);
                }
                return true;
            }

            function initRules(rules, factoryName) {
                return rules[factoryName] || (rules[factoryName] = []);
            }

            function addInjection(injections, property, injectionName) {
                injections.push({
                    property: property,
                    fullName: injectionName
                });
            }

            __exports__["default"] = Container;
        });
    enifed("ember-metal",
        ["ember-metal/core","ember-metal/merge","ember-metal/instrumentation","ember-metal/utils","ember-metal/error","ember-metal/enumerable_utils","ember-metal/cache","ember-metal/platform","ember-metal/array","ember-metal/logger","ember-metal/property_get","ember-metal/events","ember-metal/observer_set","ember-metal/property_events","ember-metal/properties","ember-metal/property_set","ember-metal/map","ember-metal/get_properties","ember-metal/set_properties","ember-metal/watch_key","ember-metal/chains","ember-metal/watch_path","ember-metal/watching","ember-metal/expand_properties","ember-metal/computed","ember-metal/computed_macros","ember-metal/observer","ember-metal/mixin","ember-metal/binding","ember-metal/run_loop","ember-metal/libraries","ember-metal/is_none","ember-metal/is_empty","ember-metal/is_blank","ember-metal/is_present","ember-metal/keys","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __dependency11__, __dependency12__, __dependency13__, __dependency14__, __dependency15__, __dependency16__, __dependency17__, __dependency18__, __dependency19__, __dependency20__, __dependency21__, __dependency22__, __dependency23__, __dependency24__, __dependency25__, __dependency26__, __dependency27__, __dependency28__, __dependency29__, __dependency30__, __dependency31__, __dependency32__, __dependency33__, __dependency34__, __dependency35__, __dependency36__, __exports__) {
            "use strict";
            /**
             Alto Metal

             @module ember
             @submodule ember-metal
             */

            // BEGIN IMPORTS
            var Alto = __dependency1__["default"];
            var merge = __dependency2__["default"];
            var instrument = __dependency3__.instrument;
            var reset = __dependency3__.reset;
            var subscribe = __dependency3__.subscribe;
            var unsubscribe = __dependency3__.unsubscribe;
            var EMPTY_META = __dependency4__.EMPTY_META;
            var GUID_KEY = __dependency4__.GUID_KEY;
            var META_DESC = __dependency4__.META_DESC;
            var apply = __dependency4__.apply;
            var applyStr = __dependency4__.applyStr;
            var canInvoke = __dependency4__.canInvoke;
            var generateGuid = __dependency4__.generateGuid;
            var getMeta = __dependency4__.getMeta;
            var guidFor = __dependency4__.guidFor;
            var inspect = __dependency4__.inspect;
            var isArray = __dependency4__.isArray;
            var makeArray = __dependency4__.makeArray;
            var meta = __dependency4__.meta;
            var metaPath = __dependency4__.metaPath;
            var setMeta = __dependency4__.setMeta;
            var tryCatchFinally = __dependency4__.tryCatchFinally;
            var tryFinally = __dependency4__.tryFinally;
            var tryInvoke = __dependency4__.tryInvoke;
            var typeOf = __dependency4__.typeOf;
            var uuid = __dependency4__.uuid;
            var wrap = __dependency4__.wrap;
            var AltoError = __dependency5__["default"];
            var EnumerableUtils = __dependency6__["default"];
            var Cache = __dependency7__["default"];
            var create = __dependency8__.create;
            var hasPropertyAccessors = __dependency8__.hasPropertyAccessors;
            var filter = __dependency9__.filter;
            var forEach = __dependency9__.forEach;
            var indexOf = __dependency9__.indexOf;
            var map = __dependency9__.map;
            var Logger = __dependency10__["default"];

            var _getPath = __dependency11__._getPath;
            var get = __dependency11__.get;
            var getWithDefault = __dependency11__.getWithDefault;
            var normalizeTuple = __dependency11__.normalizeTuple;

            var addListener = __dependency12__.addListener;
            var hasListeners = __dependency12__.hasListeners;
            var listenersDiff = __dependency12__.listenersDiff;
            var listenersFor = __dependency12__.listenersFor;
            var listenersUnion = __dependency12__.listenersUnion;
            var on = __dependency12__.on;
            var removeListener = __dependency12__.removeListener;
            var sendEvent = __dependency12__.sendEvent;
            var suspendListener = __dependency12__.suspendListener;
            var suspendListeners = __dependency12__.suspendListeners;
            var watchedEvents = __dependency12__.watchedEvents;

            var ObserverSet = __dependency13__["default"];

            var beginPropertyChanges = __dependency14__.beginPropertyChanges;
            var changeProperties = __dependency14__.changeProperties;
            var endPropertyChanges = __dependency14__.endPropertyChanges;
            var overrideChains = __dependency14__.overrideChains;
            var propertyDidChange = __dependency14__.propertyDidChange;
            var propertyWillChange = __dependency14__.propertyWillChange;

            var Descriptor = __dependency15__.Descriptor;
            var defineProperty = __dependency15__.defineProperty;
            var set = __dependency16__.set;
            var trySet = __dependency16__.trySet;

            var Map = __dependency17__.Map;
            var MapWithDefault = __dependency17__.MapWithDefault;
            var OrderedSet = __dependency17__.OrderedSet;
            var getProperties = __dependency18__["default"];
            var setProperties = __dependency19__["default"];
            var watchKey = __dependency20__.watchKey;
            var unwatchKey = __dependency20__.unwatchKey;
            var ChainNode = __dependency21__.ChainNode;
            var finishChains = __dependency21__.finishChains;
            var flushPendingChains = __dependency21__.flushPendingChains;
            var removeChainWatcher = __dependency21__.removeChainWatcher;
            var watchPath = __dependency22__.watchPath;
            var unwatchPath = __dependency22__.unwatchPath;
            var destroy = __dependency23__.destroy;
            var isWatching = __dependency23__.isWatching;
            var rewatch = __dependency23__.rewatch;
            var unwatch = __dependency23__.unwatch;
            var watch = __dependency23__.watch;
            var expandProperties = __dependency24__["default"];
            var ComputedProperty = __dependency25__.ComputedProperty;
            var computed = __dependency25__.computed;
            var cacheFor = __dependency25__.cacheFor;

            // side effect of defining the computed.* macros

            var _suspendBeforeObserver = __dependency27__._suspendBeforeObserver;
            var _suspendBeforeObservers = __dependency27__._suspendBeforeObservers;
            var _suspendObserver = __dependency27__._suspendObserver;
            var _suspendObservers = __dependency27__._suspendObservers;
            var addBeforeObserver = __dependency27__.addBeforeObserver;
            var addObserver = __dependency27__.addObserver;
            var beforeObserversFor = __dependency27__.beforeObserversFor;
            var observersFor = __dependency27__.observersFor;
            var removeBeforeObserver = __dependency27__.removeBeforeObserver;
            var removeObserver = __dependency27__.removeObserver;
            var IS_BINDING = __dependency28__.IS_BINDING;
            var Mixin = __dependency28__.Mixin;
            var aliasMethod = __dependency28__.aliasMethod;
            var beforeObserver = __dependency28__.beforeObserver;
            var immediateObserver = __dependency28__.immediateObserver;
            var mixin = __dependency28__.mixin;
            var observer = __dependency28__.observer;
            var required = __dependency28__.required;
            var Binding = __dependency29__.Binding;
            var bind = __dependency29__.bind;
            var isGlobalPath = __dependency29__.isGlobalPath;
            var oneWay = __dependency29__.oneWay;
            var run = __dependency30__["default"];
            var libraries = __dependency31__["default"];
            var isNone = __dependency32__["default"];
            var isEmpty = __dependency33__["default"];
            var isBlank = __dependency34__["default"];
            var isPresent = __dependency35__["default"];
            var keys = __dependency36__["default"];

            // END IMPORTS

            // BEGIN EXPORTS
            var AltoInstrumentation = Alto.Instrumentation = {};
            AltoInstrumentation.instrument = instrument;
            AltoInstrumentation.subscribe = subscribe;
            AltoInstrumentation.unsubscribe = unsubscribe;
            AltoInstrumentation.reset  = reset;

            Alto.instrument = instrument;
            Alto.subscribe = subscribe;

            Alto._Cache = Cache;

            Alto.generateGuid    = generateGuid;
            Alto.GUID_KEY        = GUID_KEY;
            Alto.create          = create;
            Alto.keys            = keys;
            Alto.platform        = {
                defineProperty: defineProperty,
                hasPropertyAccessors: hasPropertyAccessors
            };

            var AltoArrayPolyfills = Alto.ArrayPolyfills = {};

            AltoArrayPolyfills.map = map;
            AltoArrayPolyfills.forEach = forEach;
            AltoArrayPolyfills.filter = filter;
            AltoArrayPolyfills.indexOf = indexOf;

            Alto.Error           = AltoError;
            Alto.guidFor         = guidFor;
            Alto.META_DESC       = META_DESC;
            Alto.EMPTY_META      = EMPTY_META;
            Alto.meta            = meta;
            Alto.getMeta         = getMeta;
            Alto.setMeta         = setMeta;
            Alto.metaPath        = metaPath;
            Alto.inspect         = inspect;
            Alto.typeOf          = typeOf;
            Alto.tryCatchFinally = tryCatchFinally;
            Alto.isArray         = isArray;
            Alto.makeArray       = makeArray;
            Alto.canInvoke       = canInvoke;
            Alto.tryInvoke       = tryInvoke;
            Alto.tryFinally      = tryFinally;
            Alto.wrap            = wrap;
            Alto.apply           = apply;
            Alto.applyStr        = applyStr;
            Alto.uuid            = uuid;

            Alto.Logger = Logger;

            Alto.get            = get;
            Alto.getWithDefault = getWithDefault;
            Alto.normalizeTuple = normalizeTuple;
            Alto._getPath       = _getPath;

            Alto.EnumerableUtils = EnumerableUtils;

            Alto.on                = on;
            Alto.addListener       = addListener;
            Alto.removeListener    = removeListener;
            Alto._suspendListener  = suspendListener;
            Alto._suspendListeners = suspendListeners;
            Alto.sendEvent         = sendEvent;
            Alto.hasListeners      = hasListeners;
            Alto.watchedEvents     = watchedEvents;
            Alto.listenersFor      = listenersFor;
            Alto.listenersDiff     = listenersDiff;
            Alto.listenersUnion    = listenersUnion;

            Alto._ObserverSet = ObserverSet;

            Alto.propertyWillChange = propertyWillChange;
            Alto.propertyDidChange = propertyDidChange;
            Alto.overrideChains = overrideChains;
            Alto.beginPropertyChanges = beginPropertyChanges;
            Alto.endPropertyChanges = endPropertyChanges;
            Alto.changeProperties = changeProperties;

            Alto.Descriptor     = Descriptor;
            Alto.defineProperty = defineProperty;

            Alto.set    = set;
            Alto.trySet = trySet;

            Alto.OrderedSet = OrderedSet;
            Alto.Map = Map;
            Alto.MapWithDefault = MapWithDefault;

            Alto.getProperties = getProperties;
            Alto.setProperties = setProperties;

            Alto.watchKey   = watchKey;
            Alto.unwatchKey = unwatchKey;

            Alto.flushPendingChains = flushPendingChains;
            Alto.removeChainWatcher = removeChainWatcher;
            Alto._ChainNode = ChainNode;
            Alto.finishChains = finishChains;

            Alto.watchPath = watchPath;
            Alto.unwatchPath = unwatchPath;

            Alto.watch = watch;
            Alto.isWatching = isWatching;
            Alto.unwatch = unwatch;
            Alto.rewatch = rewatch;
            Alto.destroy = destroy;

            Alto.expandProperties = expandProperties;

            Alto.ComputedProperty = ComputedProperty;
            Alto.computed = computed;
            Alto.cacheFor = cacheFor;

            Alto.addObserver = addObserver;
            Alto.observersFor = observersFor;
            Alto.removeObserver = removeObserver;
            Alto.addBeforeObserver = addBeforeObserver;
            Alto._suspendBeforeObserver = _suspendBeforeObserver;
            Alto._suspendBeforeObservers = _suspendBeforeObservers;
            Alto._suspendObserver = _suspendObserver;
            Alto._suspendObservers = _suspendObservers;
            Alto.beforeObserversFor = beforeObserversFor;
            Alto.removeBeforeObserver = removeBeforeObserver;

            Alto.IS_BINDING = IS_BINDING;
            Alto.required = required;
            Alto.aliasMethod = aliasMethod;
            Alto.observer = observer;
            Alto.immediateObserver = immediateObserver;
            Alto.beforeObserver = beforeObserver;
            Alto.mixin = mixin;
            Alto.Mixin = Mixin;

            Alto.oneWay = oneWay;
            Alto.bind = bind;
            Alto.Binding = Binding;
            Alto.isGlobalPath = isGlobalPath;

            Alto.run = run;

            Alto.libraries = libraries;
            Alto.libraries.registerCoreLibrary('Alto', Alto.VERSION);

            Alto.isNone = isNone;
            Alto.isEmpty = isEmpty;
            Alto.isBlank = isBlank;


            Alto.isPresent = isPresent;


            Alto.merge = merge;

            /**
             A function may be assigned to `Alto.onerror` to be called when Alto
             internals encounter an error. This is useful for specialized error handling
             and reporting code.

             ```javascript
             Alto.onerror = function(error) {
        Alto.$.ajax('/report-error', 'POST', {
          stack: error.stack,
          otherInformation: 'whatever app state you want to provide'
        });
      };
             ```

             Internally, `Alto.onerror` is used as Backburner's error handler.

             @event onerror
             @for Alto
             @param {Exception} error the error object
             */
            Alto.onerror = null;
            // END EXPORTS

            // do this for side-effects of updating Alto.assert, warn, etc when
            // ember-debug is present
            if (Alto.__loader.registry['ember-debug']) {
                requireModule('ember-debug');
            }

            __exports__["default"] = Alto;
        });
    enifed("ember-metal/alias",
        ["ember-metal/property_get","ember-metal/property_set","ember-metal/core","ember-metal/error","ember-metal/properties","ember-metal/computed","ember-metal/platform","ember-metal/utils","ember-metal/dependent_keys","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __exports__) {
            "use strict";
            var get = __dependency1__.get;
            var set = __dependency2__.set;
            var Alto = __dependency3__["default"];
            // Alto.assert
            var AltoError = __dependency4__["default"];
            var Descriptor = __dependency5__.Descriptor;
            var defineProperty = __dependency5__.defineProperty;
            var ComputedProperty = __dependency6__.ComputedProperty;
            var create = __dependency7__.create;
            var meta = __dependency8__.meta;
            var inspect = __dependency8__.inspect;
            var addDependentKeys = __dependency9__.addDependentKeys;
            var removeDependentKeys = __dependency9__.removeDependentKeys;

            __exports__["default"] = function alias(altKey) {
                return new AliasedProperty(altKey);
            }

            function AliasedProperty(altKey) {
                this.altKey = altKey;
                this._dependentKeys = [ altKey ];
            }

            __exports__.AliasedProperty = AliasedProperty;AliasedProperty.prototype = create(Descriptor.prototype);

            AliasedProperty.prototype.get = function AliasedProperty_get(obj, keyName) {
                return get(obj, this.altKey);
            };

            AliasedProperty.prototype.set = function AliasedProperty_set(obj, keyName, value) {
                return set(obj, this.altKey, value);
            };

            AliasedProperty.prototype.willWatch = function(obj, keyName) {
                addDependentKeys(this, obj, keyName, meta(obj));
            };

            AliasedProperty.prototype.didUnwatch = function(obj, keyName) {
                removeDependentKeys(this, obj, keyName, meta(obj));
            };

            AliasedProperty.prototype.setup = function(obj, keyName) {
                Alto.assert("Setting alias '" + keyName + "' on self", this.altKey !== keyName);
                var m = meta(obj);
                if (m.watching[keyName]) {
                    addDependentKeys(this, obj, keyName, m);
                }
            };

            AliasedProperty.prototype.teardown = function(obj, keyName) {
                var m = meta(obj);
                if (m.watching[keyName]) {
                    removeDependentKeys(this, obj, keyName, m);
                }
            };

            AliasedProperty.prototype.readOnly = function() {
                this.set = AliasedProperty_readOnlySet;
                return this;
            };

            function AliasedProperty_readOnlySet(obj, keyName, value) {
                throw new AltoError('Cannot set read-only property "' + keyName + '" on object: ' + inspect(obj));
            }

            AliasedProperty.prototype.oneWay = function() {
                this.set = AliasedProperty_oneWaySet;
                return this;
            };

            function AliasedProperty_oneWaySet(obj, keyName, value) {
                defineProperty(obj, keyName, null);
                return set(obj, keyName, value);
            }

            // Backwards compatibility with Alto Data
            AliasedProperty.prototype._meta = undefined;
            AliasedProperty.prototype.meta = ComputedProperty.prototype.meta;
        });
    enifed("ember-metal/array",
        ["exports"],
        function(__exports__) {
            "use strict";
            /**
             @module ember-metal
             */

            var ArrayPrototype = Array.prototype;

            // Testing this is not ideal, but we want to use native functions
            // if available, but not to use versions created by libraries like Prototype
            var isNativeFunc = function(func) {
                // This should probably work in all browsers likely to have ES5 array methods
                return func && Function.prototype.toString.call(func).indexOf('[native code]') > -1;
            };

            var defineNativeShim = function(nativeFunc, shim) {
                if (isNativeFunc(nativeFunc)) {
                    return nativeFunc;
                }
                return shim;
            };

            // From: https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/array/map
            var map = defineNativeShim(ArrayPrototype.map, function(fun /*, thisp */) {
                //"use strict";

                if (this === void 0 || this === null || typeof fun !== "function") {
                    throw new TypeError();
                }

                var t = Object(this);
                var len = t.length >>> 0;
                var res = new Array(len);
                var thisp = arguments[1];

                for (var i = 0; i < len; i++) {
                    if (i in t) {
                        res[i] = fun.call(thisp, t[i], i, t);
                    }
                }

                return res;
            });

            // From: https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/array/foreach
            var forEach = defineNativeShim(ArrayPrototype.forEach, function(fun /*, thisp */) {
                //"use strict";

                if (this === void 0 || this === null || typeof fun !== "function") {
                    throw new TypeError();
                }

                var t = Object(this);
                var len = t.length >>> 0;
                var thisp = arguments[1];

                for (var i = 0; i < len; i++) {
                    if (i in t) {
                        fun.call(thisp, t[i], i, t);
                    }
                }
            });

            var indexOf = defineNativeShim(ArrayPrototype.indexOf, function (obj, fromIndex) {
                if (fromIndex === null || fromIndex === undefined) {
                    fromIndex = 0;
                }
                else if (fromIndex < 0) {
                    fromIndex = Math.max(0, this.length + fromIndex);
                }

                for (var i = fromIndex, j = this.length; i < j; i++) {
                    if (this[i] === obj) {
                        return i;
                    }
                }
                return -1;
            });

            var lastIndexOf = defineNativeShim(ArrayPrototype.lastIndexOf, function(obj, fromIndex) {
                var len = this.length;
                var idx;

                if (fromIndex === undefined) fromIndex = len-1;
                else fromIndex = (fromIndex < 0) ? Math.ceil(fromIndex) : Math.floor(fromIndex);
                if (fromIndex < 0) fromIndex += len;

                for(idx = fromIndex;idx>=0;idx--) {
                    if (this[idx] === obj) return idx ;
                }
                return -1;
            });

            var filter = defineNativeShim(ArrayPrototype.filter, function (fn, context) {
                var i, value;
                var result = [];
                var length = this.length;

                for (i = 0; i < length; i++) {
                    if (this.hasOwnProperty(i)) {
                        value = this[i];
                        if (fn.call(context, value, i, this)) {
                            result.push(value);
                        }
                    }
                }
                return result;
            });

            if (Alto.SHIM_ES5) {
                ArrayPrototype.map = ArrayPrototype.map || map;
                ArrayPrototype.forEach = ArrayPrototype.forEach || forEach;
                ArrayPrototype.filter = ArrayPrototype.filter || filter;
                ArrayPrototype.indexOf = ArrayPrototype.indexOf || indexOf;
                ArrayPrototype.lastIndexOf = ArrayPrototype.lastIndexOf || lastIndexOf;
            }

            /**
             Array polyfills to support ES5 features in older browsers.

             @namespace Alto
             @property ArrayPolyfills
             */
            __exports__.map = map;
            __exports__.forEach = forEach;
            __exports__.filter = filter;
            __exports__.indexOf = indexOf;
            __exports__.lastIndexOf = lastIndexOf;
        });
    enifed("ember-metal/binding",
        ["ember-metal/core","ember-metal/property_get","ember-metal/property_set","ember-metal/utils","ember-metal/observer","ember-metal/run_loop","ember-metal/path_cache","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            // Alto.Logger, Alto.LOG_BINDINGS, assert
            var get = __dependency2__.get;
            var trySet = __dependency3__.trySet;
            var guidFor = __dependency4__.guidFor;
            var addObserver = __dependency5__.addObserver;
            var removeObserver = __dependency5__.removeObserver;
            var _suspendObserver = __dependency5__._suspendObserver;
            var run = __dependency6__["default"];
            var isGlobalPath = __dependency7__.isGlobal;


            // ES6TODO: where is Alto.lookup defined?
            /**
             @module ember-metal
             */

            // ..........................................................
            // CONSTANTS
            //

            /**
             Debug parameter you can turn on. This will log all bindings that fire to
             the console. This should be disabled in production code. Note that you
             can also enable this from the console or temporarily.

             @property LOG_BINDINGS
             @for Alto
             @type Boolean
             @default false
             */
            Alto.LOG_BINDINGS = false || !!Alto.ENV.LOG_BINDINGS;

            /**
             Returns true if the provided path is global (e.g., `MyApp.fooController.bar`)
             instead of local (`foo.bar.baz`).

             @method isGlobalPath
             @for Alto
             @private
             @param {String} path
             @return Boolean
             */

            function getWithGlobals(obj, path) {
                return get(isGlobalPath(path) ? Alto.lookup : obj, path);
            }

            // ..........................................................
            // BINDING
            //

            function Binding(toPath, fromPath) {
                this._direction = undefined;
                this._from = fromPath;
                this._to   = toPath;
                this._readyToSync = undefined;
                this._oneWay = undefined;
            }

            /**
             @class Binding
             @namespace Alto
             */

            Binding.prototype = {
                /**
                 This copies the Binding so it can be connected to another object.

                 @method copy
                 @return {Alto.Binding} `this`
                 */
                copy: function () {
                    var copy = new Binding(this._to, this._from);
                    if (this._oneWay) { copy._oneWay = true; }
                    return copy;
                },

                // ..........................................................
                // CONFIG
                //

                /**
                 This will set `from` property path to the specified value. It will not
                 attempt to resolve this property path to an actual object until you
                 connect the binding.

                 The binding will search for the property path starting at the root object
                 you pass when you `connect()` the binding. It follows the same rules as
                 `get()` - see that method for more information.

                 @method from
                 @param {String} path the property path to connect to
                 @return {Alto.Binding} `this`
                 */
                from: function(path) {
                    this._from = path;
                    return this;
                },

                /**
                 This will set the `to` property path to the specified value. It will not
                 attempt to resolve this property path to an actual object until you
                 connect the binding.

                 The binding will search for the property path starting at the root object
                 you pass when you `connect()` the binding. It follows the same rules as
                 `get()` - see that method for more information.

                 @method to
                 @param {String|Tuple} path A property path or tuple
                 @return {Alto.Binding} `this`
                 */
                to: function(path) {
                    this._to = path;
                    return this;
                },

                /**
                 Configures the binding as one way. A one-way binding will relay changes
                 on the `from` side to the `to` side, but not the other way around. This
                 means that if you change the `to` side directly, the `from` side may have
                 a different value.

                 @method oneWay
                 @return {Alto.Binding} `this`
                 */
                oneWay: function() {
                    this._oneWay = true;
                    return this;
                },

                /**
                 @method toString
                 @return {String} string representation of binding
                 */
                toString: function() {
                    var oneWay = this._oneWay ? '[oneWay]' : '';
                    return "Alto.Binding<" + guidFor(this) + ">(" + this._from + " -> " + this._to + ")" + oneWay;
                },

                // ..........................................................
                // CONNECT AND SYNC
                //

                /**
                 Attempts to connect this binding instance so that it can receive and relay
                 changes. This method will raise an exception if you have not set the
                 from/to properties yet.

                 @method connect
                 @param {Object} obj The root object for this binding.
                 @return {Alto.Binding} `this`
                 */
                connect: function(obj) {
                    Alto.assert('Must pass a valid object to Alto.Binding.connect()', !!obj);

                    var fromPath = this._from;
                    var toPath = this._to;
                    trySet(obj, toPath, getWithGlobals(obj, fromPath));

                    // add an observer on the object to be notified when the binding should be updated
                    addObserver(obj, fromPath, this, this.fromDidChange);

                    // if the binding is a two-way binding, also set up an observer on the target
                    if (!this._oneWay) {
                        addObserver(obj, toPath, this, this.toDidChange);
                    }

                    this._readyToSync = true;

                    return this;
                },

                /**
                 Disconnects the binding instance. Changes will no longer be relayed. You
                 will not usually need to call this method.

                 @method disconnect
                 @param {Object} obj The root object you passed when connecting the binding.
                 @return {Alto.Binding} `this`
                 */
                disconnect: function(obj) {
                    Alto.assert('Must pass a valid object to Alto.Binding.disconnect()', !!obj);

                    var twoWay = !this._oneWay;

                    // remove an observer on the object so we're no longer notified of
                    // changes that should update bindings.
                    removeObserver(obj, this._from, this, this.fromDidChange);

                    // if the binding is two-way, remove the observer from the target as well
                    if (twoWay) {
                        removeObserver(obj, this._to, this, this.toDidChange);
                    }

                    this._readyToSync = false; // disable scheduled syncs...
                    return this;
                },

                // ..........................................................
                // PRIVATE
                //

                /* called when the from side changes */
                fromDidChange: function(target) {
                    this._scheduleSync(target, 'fwd');
                },

                /* called when the to side changes */
                toDidChange: function(target) {
                    this._scheduleSync(target, 'back');
                },

                _scheduleSync: function(obj, dir) {
                    var existingDir = this._direction;

                    // if we haven't scheduled the binding yet, schedule it
                    if (existingDir === undefined) {
                        run.schedule('sync', this, this._sync, obj);
                        this._direction  = dir;
                    }

                    // If both a 'back' and 'fwd' sync have been scheduled on the same object,
                    // default to a 'fwd' sync so that it remains deterministic.
                    if (existingDir === 'back' && dir === 'fwd') {
                        this._direction = 'fwd';
                    }
                },

                _sync: function(obj) {
                    var log = Alto.LOG_BINDINGS;

                    // don't synchronize destroyed objects or disconnected bindings
                    if (obj.isDestroyed || !this._readyToSync) { return; }

                    // get the direction of the binding for the object we are
                    // synchronizing from
                    var direction = this._direction;

                    var fromPath = this._from;
                    var toPath = this._to;

                    this._direction = undefined;

                    // if we're synchronizing from the remote object...
                    if (direction === 'fwd') {
                        var fromValue = getWithGlobals(obj, this._from);
                        if (log) {
                            Alto.Logger.log(' ', this.toString(), '->', fromValue, obj);
                        }
                        if (this._oneWay) {
                            trySet(obj, toPath, fromValue);
                        } else {
                            _suspendObserver(obj, toPath, this, this.toDidChange, function () {
                                trySet(obj, toPath, fromValue);
                            });
                        }
                        // if we're synchronizing *to* the remote object
                    } else if (direction === 'back') {
                        var toValue = get(obj, this._to);
                        if (log) {
                            Alto.Logger.log(' ', this.toString(), '<-', toValue, obj);
                        }
                        _suspendObserver(obj, fromPath, this, this.fromDidChange, function () {
                            trySet(isGlobalPath(fromPath) ? Alto.lookup : obj, fromPath, toValue);
                        });
                    }
                }

            };

            function mixinProperties(to, from) {
                for (var key in from) {
                    if (from.hasOwnProperty(key)) {
                        to[key] = from[key];
                    }
                }
            }

            mixinProperties(Binding, {

                /*
                 See `Alto.Binding.from`.

                 @method from
                 @static
                 */
                from: function(from) {
                    var C = this;
                    return new C(undefined, from);
                },

                /*
                 See `Alto.Binding.to`.

                 @method to
                 @static
                 */
                to: function(to) {
                    var C = this;
                    return new C(to, undefined);
                },

                /**
                 Creates a new Binding instance and makes it apply in a single direction.
                 A one-way binding will relay changes on the `from` side object (supplied
                 as the `from` argument) the `to` side, but not the other way around.
                 This means that if you change the "to" side directly, the "from" side may have
                 a different value.

                 See `Binding.oneWay`.

                 @method oneWay
                 @param {String} from from path.
                 @param {Boolean} [flag] (Optional) passing nothing here will make the
                 binding `oneWay`. You can instead pass `false` to disable `oneWay`, making the
                 binding two way again.
                 @return {Alto.Binding} `this`
                 */
                oneWay: function(from, flag) {
                    var C = this;
                    return new C(undefined, from).oneWay(flag);
                }

            });
            /**
             An `Alto.Binding` connects the properties of two objects so that whenever
             the value of one property changes, the other property will be changed also.

             ## Automatic Creation of Bindings with `/^*Binding/`-named Properties

             You do not usually create Binding objects directly but instead describe
             bindings in your class or object definition using automatic binding
             detection.

             Properties ending in a `Binding` suffix will be converted to `Alto.Binding`
             instances. The value of this property should be a string representing a path
             to another object or a custom binding instance created using Binding helpers
             (see "One Way Bindings"):

             ```
             valueBinding: "MyApp.someController.title"
             ```

             This will create a binding from `MyApp.someController.title` to the `value`
             property of your object instance automatically. Now the two values will be
             kept in sync.

             ## One Way Bindings

             One especially useful binding customization you can use is the `oneWay()`
             helper. This helper tells Alto that you are only interested in
             receiving changes on the object you are binding from. For example, if you
             are binding to a preference and you want to be notified if the preference
             has changed, but your object will not be changing the preference itself, you
             could do:

             ```
             bigTitlesBinding: Alto.Binding.oneWay("MyApp.preferencesController.bigTitles")
             ```

             This way if the value of `MyApp.preferencesController.bigTitles` changes the
             `bigTitles` property of your object will change also. However, if you
             change the value of your `bigTitles` property, it will not update the
             `preferencesController`.

             One way bindings are almost twice as fast to setup and twice as fast to
             execute because the binding only has to worry about changes to one side.

             You should consider using one way bindings anytime you have an object that
             may be created frequently and you do not intend to change a property; only
             to monitor it for changes (such as in the example above).

             ## Adding Bindings Manually

             All of the examples above show you how to configure a custom binding, but the
             result of these customizations will be a binding template, not a fully active
             Binding instance. The binding will actually become active only when you
             instantiate the object the binding belongs to. It is useful however, to
             understand what actually happens when the binding is activated.

             For a binding to function it must have at least a `from` property and a `to`
             property. The `from` property path points to the object/key that you want to
             bind from while the `to` path points to the object/key you want to bind to.

             When you define a custom binding, you are usually describing the property
             you want to bind from (such as `MyApp.someController.value` in the examples
             above). When your object is created, it will automatically assign the value
             you want to bind `to` based on the name of your binding key. In the
             examples above, during init, Alto objects will effectively call
             something like this on your binding:

             ```javascript
             binding = Alto.Binding.from("valueBinding").to("value");
             ```

             This creates a new binding instance based on the template you provide, and
             sets the to path to the `value` property of the new object. Now that the
             binding is fully configured with a `from` and a `to`, it simply needs to be
             connected to become active. This is done through the `connect()` method:

             ```javascript
             binding.connect(this);
             ```

             Note that when you connect a binding you pass the object you want it to be
             connected to. This object will be used as the root for both the from and
             to side of the binding when inspecting relative paths. This allows the
             binding to be automatically inherited by subclassed objects as well.

             This also allows you to bind between objects using the paths you declare in
             `from` and `to`:

             ```javascript
             // Example 1
             binding = Alto.Binding.from("App.someObject.value").to("value");
             binding.connect(this);

             // Example 2
             binding = Alto.Binding.from("parentView.value").to("App.someObject.value");
             binding.connect(this);
             ```

             Now that the binding is connected, it will observe both the from and to side
             and relay changes.

             If you ever needed to do so (you almost never will, but it is useful to
             understand this anyway), you could manually create an active binding by
             using the `Alto.bind()` helper method. (This is the same method used by
             to setup your bindings on objects):

             ```javascript
             Alto.bind(MyApp.anotherObject, "value", "MyApp.someController.value");
             ```

             Both of these code fragments have the same effect as doing the most friendly
             form of binding creation like so:

             ```javascript
             MyApp.anotherObject = Alto.Object.create({
        valueBinding: "MyApp.someController.value",

        // OTHER CODE FOR THIS OBJECT...
      });
             ```

             Alto's built in binding creation method makes it easy to automatically
             create bindings for you. You should always use the highest-level APIs
             available, even if you understand how it works underneath.

             @class Binding
             @namespace Alto
             @since Alto 0.9
             */
            // Alto.Binding = Binding; ES6TODO: where to put this?


            /**
             Global helper method to create a new binding. Just pass the root object
             along with a `to` and `from` path to create and connect the binding.

             @method bind
             @for Alto
             @param {Object} obj The root object of the transform.
             @param {String} to The path to the 'to' side of the binding.
             Must be relative to obj.
             @param {String} from The path to the 'from' side of the binding.
             Must be relative to obj or a global path.
             @return {Alto.Binding} binding instance
             */
            function bind(obj, to, from) {
                return new Binding(to, from).connect(obj);
            }

            __exports__.bind = bind;/**
             @method oneWay
             @for Alto
             @param {Object} obj The root object of the transform.
             @param {String} to The path to the 'to' side of the binding.
             Must be relative to obj.
             @param {String} from The path to the 'from' side of the binding.
             Must be relative to obj or a global path.
             @return {Alto.Binding} binding instance
             */
            function oneWay(obj, to, from) {
                return new Binding(to, from).oneWay().connect(obj);
            }

            __exports__.oneWay = oneWay;__exports__.Binding = Binding;
            __exports__.isGlobalPath = isGlobalPath;
        });
    enifed("ember-metal/cache",
        ["ember-metal/dictionary","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var dictionary = __dependency1__["default"];
            __exports__["default"] = Cache;

            function Cache(limit, func) {
                this.store  = dictionary(null);
                this.size   = 0;
                this.misses = 0;
                this.hits   = 0;
                this.limit  = limit;
                this.func   = func;
            }

            var UNDEFINED = function() { };

            Cache.prototype = {
                set: function(key, value) {
                    if (this.limit > this.size) {
                        this.size ++;
                        if (value === undefined) {
                            this.store[key] = UNDEFINED;
                        } else {
                            this.store[key] = value;
                        }
                    }

                    return value;
                },

                get: function(key) {
                    var value = this.store[key];

                    if (value === undefined) {
                        this.misses ++;
                        value = this.set(key, this.func(key));
                    } else if (value === UNDEFINED) {
                        this.hits ++;
                        value = undefined;
                    } else {
                        this.hits ++;
                        // nothing to translate
                    }

                    return value;
                },

                purge: function() {
                    this.store  = dictionary(null);
                    this.size   = 0;
                    this.hits   = 0;
                    this.misses = 0;
                }
            };
        });
    enifed("ember-metal/chains",
        ["ember-metal/core","ember-metal/property_get","ember-metal/utils","ember-metal/array","ember-metal/watch_key","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            // warn, assert, etc;
            var get = __dependency2__.get;
            var normalizeTuple = __dependency2__.normalizeTuple;
            var metaFor = __dependency3__.meta;
            var forEach = __dependency4__.forEach;
            var watchKey = __dependency5__.watchKey;
            var unwatchKey = __dependency5__.unwatchKey;

            var warn = Alto.warn;
            var FIRST_KEY = /^([^\.]+)/;

            function firstKey(path) {
                return path.match(FIRST_KEY)[0];
            }

            var pendingQueue = [];

            // attempts to add the pendingQueue chains again. If some of them end up
            // back in the queue and reschedule is true, schedules a timeout to try
            // again.
            function flushPendingChains() {
                if (pendingQueue.length === 0) { return; } // nothing to do

                var queue = pendingQueue;
                pendingQueue = [];

                forEach.call(queue, function(q) {
                    q[0].add(q[1]);
                });

                warn('Watching an undefined global, Alto expects watched globals to be' +
                    ' setup by the time the run loop is flushed, check for typos', pendingQueue.length === 0);
            }

            __exports__.flushPendingChains = flushPendingChains;function addChainWatcher(obj, keyName, node) {
                if (!obj || ('object' !== typeof obj)) { return; } // nothing to do

                var m = metaFor(obj);
                var nodes = m.chainWatchers;

                if (!m.hasOwnProperty('chainWatchers')) {
                    nodes = m.chainWatchers = {};
                }

                if (!nodes[keyName]) {
                    nodes[keyName] = [];
                }
                nodes[keyName].push(node);
                watchKey(obj, keyName, m);
            }

            function removeChainWatcher(obj, keyName, node) {
                if (!obj || 'object' !== typeof obj) { return; } // nothing to do

                var m = obj['__alto_meta__'];
                if (m && !m.hasOwnProperty('chainWatchers')) { return; } // nothing to do

                var nodes = m && m.chainWatchers;

                if (nodes && nodes[keyName]) {
                    nodes = nodes[keyName];
                    for (var i = 0, l = nodes.length; i < l; i++) {
                        if (nodes[i] === node) {
                            nodes.splice(i, 1);
                            break;
                        }
                    }
                }
                unwatchKey(obj, keyName, m);
            }

            // A ChainNode watches a single key on an object. If you provide a starting
            // value for the key then the node won't actually watch it. For a root node
            // pass null for parent and key and object for value.
            function ChainNode(parent, key, value) {
                this._parent = parent;
                this._key    = key;

                // _watching is true when calling get(this._parent, this._key) will
                // return the value of this node.
                //
                // It is false for the root of a chain (because we have no parent)
                // and for global paths (because the parent node is the object with
                // the observer on it)
                this._watching = value===undefined;

                this._value  = value;
                this._paths = {};
                if (this._watching) {
                    this._object = parent.value();
                    if (this._object) {
                        addChainWatcher(this._object, this._key, this);
                    }
                }

                // Special-case: the EachProxy relies on immediate evaluation to
                // establish its observers.
                //
                // TODO: Replace this with an efficient callback that the EachProxy
                // can implement.
                if (this._parent && this._parent._key === '@each') {
                    this.value();
                }
            }

            var ChainNodePrototype = ChainNode.prototype;

            function lazyGet(obj, key) {
                if (!obj) return undefined;

                var meta = obj['__alto_meta__'];
                // check if object meant only to be a prototype
                if (meta && meta.proto === obj) {
                    return undefined;
                }

                if (key === "@each") {
                    return get(obj, key);
                }

                // if a CP only return cached value
                var desc = meta && meta.descs[key];
                if (desc && desc._cacheable) {
                    if (key in meta.cache) {
                        return meta.cache[key];
                    } else {
                        return undefined;
                    }
                }

                return get(obj, key);
            }

            ChainNodePrototype.value = function() {
                if (this._value === undefined && this._watching) {
                    var obj = this._parent.value();
                    this._value = lazyGet(obj, this._key);
                }
                return this._value;
            };

            ChainNodePrototype.destroy = function() {
                if (this._watching) {
                    var obj = this._object;
                    if (obj) {
                        removeChainWatcher(obj, this._key, this);
                    }
                    this._watching = false; // so future calls do nothing
                }
            };

            // copies a top level object only
            ChainNodePrototype.copy = function(obj) {
                var ret = new ChainNode(null, null, obj);
                var paths = this._paths;
                var path;

                for (path in paths) {
                    // this check will also catch non-number vals.
                    if (paths[path] <= 0) {
                        continue;
                    }
                    ret.add(path);
                }
                return ret;
            };

            // called on the root node of a chain to setup watchers on the specified
            // path.
            ChainNodePrototype.add = function(path) {
                var obj, tuple, key, src, paths;

                paths = this._paths;
                paths[path] = (paths[path] || 0) + 1;

                obj = this.value();
                tuple = normalizeTuple(obj, path);

                // the path was a local path
                if (tuple[0] && tuple[0] === obj) {
                    path = tuple[1];
                    key  = firstKey(path);
                    path = path.slice(key.length+1);

                    // global path, but object does not exist yet.
                    // put into a queue and try to connect later.
                } else if (!tuple[0]) {
                    pendingQueue.push([this, path]);
                    tuple.length = 0;
                    return;

                    // global path, and object already exists
                } else {
                    src  = tuple[0];
                    key  = path.slice(0, 0-(tuple[1].length+1));
                    path = tuple[1];
                }

                tuple.length = 0;
                this.chain(key, path, src);
            };

            // called on the root node of a chain to teardown watcher on the specified
            // path
            ChainNodePrototype.remove = function(path) {
                var obj, tuple, key, src, paths;

                paths = this._paths;
                if (paths[path] > 0) {
                    paths[path]--;
                }

                obj = this.value();
                tuple = normalizeTuple(obj, path);
                if (tuple[0] === obj) {
                    path = tuple[1];
                    key  = firstKey(path);
                    path = path.slice(key.length+1);
                } else {
                    src  = tuple[0];
                    key  = path.slice(0, 0-(tuple[1].length+1));
                    path = tuple[1];
                }

                tuple.length = 0;
                this.unchain(key, path);
            };

            ChainNodePrototype.count = 0;

            ChainNodePrototype.chain = function(key, path, src) {
                var chains = this._chains;
                var node;
                if (!chains) {
                    chains = this._chains = {};
                }

                node = chains[key];
                if (!node) {
                    node = chains[key] = new ChainNode(this, key, src);
                }
                node.count++; // count chains...

                // chain rest of path if there is one
                if (path) {
                    key = firstKey(path);
                    path = path.slice(key.length+1);
                    node.chain(key, path); // NOTE: no src means it will observe changes...
                }
            };

            ChainNodePrototype.unchain = function(key, path) {
                var chains = this._chains;
                var node = chains[key];

                // unchain rest of path first...
                if (path && path.length > 1) {
                    var nextKey  = firstKey(path);
                    var nextPath = path.slice(nextKey.length + 1);
                    node.unchain(nextKey, nextPath);
                }

                // delete node if needed.
                node.count--;
                if (node.count<=0) {
                    delete chains[node._key];
                    node.destroy();
                }

            };

            ChainNodePrototype.willChange = function(events) {
                var chains = this._chains;
                if (chains) {
                    for(var key in chains) {
                        if (!chains.hasOwnProperty(key)) {
                            continue;
                        }
                        chains[key].willChange(events);
                    }
                }

                if (this._parent) {
                    this._parent.chainWillChange(this, this._key, 1, events);
                }
            };

            ChainNodePrototype.chainWillChange = function(chain, path, depth, events) {
                if (this._key) {
                    path = this._key + '.' + path;
                }

                if (this._parent) {
                    this._parent.chainWillChange(this, path, depth+1, events);
                } else {
                    if (depth > 1) {
                        events.push(this.value(), path);
                    }
                    path = 'this.' + path;
                    if (this._paths[path] > 0) {
                        events.push(this.value(), path);
                    }
                }
            };

            ChainNodePrototype.chainDidChange = function(chain, path, depth, events) {
                if (this._key) {
                    path = this._key + '.' + path;
                }

                if (this._parent) {
                    this._parent.chainDidChange(this, path, depth+1, events);
                } else {
                    if (depth > 1) {
                        events.push(this.value(), path);
                    }
                    path = 'this.' + path;
                    if (this._paths[path] > 0) {
                        events.push(this.value(), path);
                    }
                }
            };

            ChainNodePrototype.didChange = function(events) {
                // invalidate my own value first.
                if (this._watching) {
                    var obj = this._parent.value();
                    if (obj !== this._object) {
                        removeChainWatcher(this._object, this._key, this);
                        this._object = obj;
                        addChainWatcher(obj, this._key, this);
                    }
                    this._value  = undefined;

                    // Special-case: the EachProxy relies on immediate evaluation to
                    // establish its observers.
                    if (this._parent && this._parent._key === '@each') {
                        this.value();
                    }
                }

                // then notify chains...
                var chains = this._chains;
                if (chains) {
                    for(var key in chains) {
                        if (!chains.hasOwnProperty(key)) { continue; }
                        chains[key].didChange(events);
                    }
                }

                // if no events are passed in then we only care about the above wiring update
                if (events === null) {
                    return;
                }

                // and finally tell parent about my path changing...
                if (this._parent) {
                    this._parent.chainDidChange(this, this._key, 1, events);
                }
            };

            function finishChains(obj) {
                // We only create meta if we really have to
                var m = obj['__alto_meta__'];
                var chains, chainWatchers, chainNodes;

                if (m) {
                    // finish any current chains node watchers that reference obj
                    chainWatchers = m.chainWatchers;
                    if (chainWatchers) {
                        for(var key in chainWatchers) {
                            if (!chainWatchers.hasOwnProperty(key)) {
                                continue;
                            }

                            chainNodes = chainWatchers[key];
                            if (chainNodes) {
                                for (var i=0,l=chainNodes.length;i<l;i++) {
                                    chainNodes[i].didChange(null);
                                }
                            }
                        }
                    }
                    // copy chains from prototype
                    chains = m.chains;
                    if (chains && chains.value() !== obj) {
                        metaFor(obj).chains = chains = chains.copy(obj);
                    }
                }
            }

            __exports__.finishChains = finishChains;__exports__.removeChainWatcher = removeChainWatcher;
            __exports__.ChainNode = ChainNode;
        });
    enifed("ember-metal/computed",
        ["ember-metal/property_set","ember-metal/utils","ember-metal/expand_properties","ember-metal/error","ember-metal/properties","ember-metal/property_events","ember-metal/dependent_keys","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __exports__) {
            "use strict";
            var set = __dependency1__.set;
            var meta = __dependency2__.meta;
            var inspect = __dependency2__.inspect;
            var expandProperties = __dependency3__["default"];
            var AltoError = __dependency4__["default"];
            var Descriptor = __dependency5__.Descriptor;
            var defineProperty = __dependency5__.defineProperty;
            var propertyWillChange = __dependency6__.propertyWillChange;
            var propertyDidChange = __dependency6__.propertyDidChange;
            var addDependentKeys = __dependency7__.addDependentKeys;
            var removeDependentKeys = __dependency7__.removeDependentKeys;

            /**
             @module ember-metal
             */

            Alto.warn("The CP_DEFAULT_CACHEABLE flag has been removed and computed properties" +
                "are always cached by default. Use `volatile` if you don't want caching.", Alto.ENV.CP_DEFAULT_CACHEABLE !== false);

            var metaFor = meta;
            var a_slice = [].slice;

            function UNDEFINED() { }

            // ..........................................................
            // COMPUTED PROPERTY
            //

            /**
             A computed property transforms an object's function into a property.

             By default the function backing the computed property will only be called
             once and the result will be cached. You can specify various properties
             that your computed property depends on. This will force the cached
             result to be recomputed if the dependencies are modified.

             In the following example we declare a computed property (by calling
             `.property()` on the fullName function) and setup the property
             dependencies (depending on firstName and lastName). The fullName function
             will be called once (regardless of how many times it is accessed) as long
             as its dependencies have not changed. Once firstName or lastName are updated
             any future calls (or anything bound) to fullName will incorporate the new
             values.

             ```javascript
             var Person = Alto.Object.extend({
        // these will be supplied by `create`
        firstName: null,
        lastName: null,

        fullName: function() {
          var firstName = this.get('firstName');
          var lastName = this.get('lastName');

         return firstName + ' ' + lastName;
        }.property('firstName', 'lastName')
      });

             var tom = Person.create({
        firstName: 'Tom',
        lastName: 'Dale'
      });

             tom.get('fullName') // 'Tom Dale'
             ```

             You can also define what Alto should do when setting a computed property.
             If you try to set a computed property, it will be invoked with the key and
             value you want to set it to. You can also accept the previous value as the
             third parameter.

             ```javascript
             var Person = Alto.Object.extend({
        // these will be supplied by `create`
        firstName: null,
        lastName: null,

        fullName: function(key, value, oldValue) {
          // getter
          if (arguments.length === 1) {
            var firstName = this.get('firstName');
            var lastName = this.get('lastName');

            return firstName + ' ' + lastName;

          // setter
          } else {
            var name = value.split(' ');

            this.set('firstName', name[0]);
            this.set('lastName', name[1]);

            return value;
          }
        }.property('firstName', 'lastName')
      });

             var person = Person.create();

             person.set('fullName', 'Peter Wagenet');
             person.get('firstName'); // 'Peter'
             person.get('lastName');  // 'Wagenet'
             ```

             @class ComputedProperty
             @namespace Alto
             @extends Alto.Descriptor
             @constructor
             */
            function ComputedProperty(func, opts) {
                func.__alto_arity__ = func.length;
                this.func = func;

                this._dependentKeys = undefined;
                this._suspended = undefined;
                this._meta = undefined;

                this._cacheable = (opts && opts.cacheable !== undefined) ? opts.cacheable : true;
                this._dependentKeys = opts && opts.dependentKeys;
                this._readOnly = opts && (opts.readOnly !== undefined || !!opts.readOnly) || false;
            }

            ComputedProperty.prototype = new Descriptor();

            var ComputedPropertyPrototype = ComputedProperty.prototype;

            /**
             Properties are cacheable by default. Computed property will automatically
             cache the return value of your function until one of the dependent keys changes.

             Call `volatile()` to set it into non-cached mode. When in this mode
             the computed property will not automatically cache the return value.

             However, if a property is properly observable, there is no reason to disable
             caching.

             @method cacheable
             @param {Boolean} aFlag optional set to `false` to disable caching
             @return {Alto.ComputedProperty} this
             @chainable
             */
            ComputedPropertyPrototype.cacheable = function(aFlag) {
                this._cacheable = aFlag !== false;
                return this;
            };

            /**
             Call on a computed property to set it into non-cached mode. When in this
             mode the computed property will not automatically cache the return value.

             ```javascript
             var outsideService = Alto.Object.extend({
        value: function() {
          return OutsideService.getValue();
        }.property().volatile()
      }).create();
             ```

             @method volatile
             @return {Alto.ComputedProperty} this
             @chainable
             */
            ComputedPropertyPrototype["volatile"] = function() {
                return this.cacheable(false);
            };

            /**
             Call on a computed property to set it into read-only mode. When in this
             mode the computed property will throw an error when set.

             ```javascript
             var Person = Alto.Object.extend({
        guid: function() {
          return 'guid-guid-guid';
        }.property().readOnly()
      });

             var person = Person.create();

             person.set('guid', 'new-guid'); // will throw an exception
             ```

             @method readOnly
             @return {Alto.ComputedProperty} this
             @chainable
             */
            ComputedPropertyPrototype.readOnly = function(readOnly) {
                this._readOnly = readOnly === undefined || !!readOnly;
                return this;
            };

            /**
             Sets the dependent keys on this computed property. Pass any number of
             arguments containing key paths that this computed property depends on.

             ```javascript
             var President = Alto.Object.extend({
        fullName: computed(function() {
          return this.get('firstName') + ' ' + this.get('lastName');

          // Tell Alto that this computed property depends on firstName
          // and lastName
        }).property('firstName', 'lastName')
      });

             var president = President.create({
        firstName: 'Barack',
        lastName: 'Obama'
      });

             president.get('fullName'); // 'Barack Obama'
             ```

             @method property
             @param {String} path* zero or more property paths
             @return {Alto.ComputedProperty} this
             @chainable
             */
            ComputedPropertyPrototype.property = function() {
                var args;

                var addArg = function (property) {
                    args.push(property);
                };

                args = [];
                for (var i = 0, l = arguments.length; i < l; i++) {
                    expandProperties(arguments[i], addArg);
                }

                this._dependentKeys = args;
                return this;
            };

            /**
             In some cases, you may want to annotate computed properties with additional
             metadata about how they function or what values they operate on. For example,
             computed property functions may close over variables that are then no longer
             available for introspection.

             You can pass a hash of these values to a computed property like this:

             ```
             person: function() {
        var personId = this.get('personId');
        return App.Person.create({ id: personId });
      }.property().meta({ type: App.Person })
             ```

             The hash that you pass to the `meta()` function will be saved on the
             computed property descriptor under the `_meta` key. Alto runtime
             exposes a public API for retrieving these values from classes,
             via the `metaForProperty()` function.

             @method meta
             @param {Hash} meta
             @chainable
             */

            ComputedPropertyPrototype.meta = function(meta) {
                if (arguments.length === 0) {
                    return this._meta || {};
                } else {
                    this._meta = meta;
                    return this;
                }
            };

            /* impl descriptor API */
            ComputedPropertyPrototype.didChange = function(obj, keyName) {
                // _suspended is set via a CP.set to ensure we don't clear
                // the cached value set by the setter
                if (this._cacheable && this._suspended !== obj) {
                    var meta = metaFor(obj);
                    if (meta.cache[keyName] !== undefined) {
                        meta.cache[keyName] = undefined;
                        removeDependentKeys(this, obj, keyName, meta);
                    }
                }
            };

            function finishChains(chainNodes)
            {
                for (var i=0, l=chainNodes.length; i<l; i++) {
                    chainNodes[i].didChange(null);
                }
            }

            /**
             Access the value of the function backing the computed property.
             If this property has already been cached, return the cached result.
             Otherwise, call the function passing the property name as an argument.

             ```javascript
             var Person = Alto.Object.extend({
        fullName: function(keyName) {
          // the keyName parameter is 'fullName' in this case.
          return this.get('firstName') + ' ' + this.get('lastName');
        }.property('firstName', 'lastName')
      });


             var tom = Person.create({
        firstName: 'Tom',
        lastName: 'Dale'
      });

             tom.get('fullName') // 'Tom Dale'
             ```

             @method get
             @param {String} keyName The key being accessed.
             @return {Object} The return value of the function backing the CP.
             */
            ComputedPropertyPrototype.get = function(obj, keyName) {
                var ret, cache, meta, chainNodes;
                if (this._cacheable) {
                    meta = metaFor(obj);
                    cache = meta.cache;

                    var result = cache[keyName];

                    if (result === UNDEFINED) {
                        return undefined;
                    }  else if (result !== undefined) {
                        return result;
                    }

                    ret = this.func.call(obj, keyName);
                    if (ret === undefined) {
                        cache[keyName] = UNDEFINED;
                    } else {
                        cache[keyName] = ret;
                    }

                    chainNodes = meta.chainWatchers && meta.chainWatchers[keyName];
                    if (chainNodes) {
                        finishChains(chainNodes);
                    }
                    addDependentKeys(this, obj, keyName, meta);
                } else {
                    ret = this.func.call(obj, keyName);
                }
                return ret;
            };

            /**
             Set the value of a computed property. If the function that backs your
             computed property does not accept arguments then the default action for
             setting would be to define the property on the current object, and set
             the value of the property to the value being set.

             Generally speaking if you intend for your computed property to be set
             your backing function should accept either two or three arguments.

             ```javascript
             var Person = Alto.Object.extend({
        // these will be supplied by `create`
        firstName: null,
        lastName: null,

        fullName: function(key, value, oldValue) {
          // getter
          if (arguments.length === 1) {
            var firstName = this.get('firstName');
            var lastName = this.get('lastName');

            return firstName + ' ' + lastName;

          // setter
          } else {
            var name = value.split(' ');

            this.set('firstName', name[0]);
            this.set('lastName', name[1]);

            return value;
          }
        }.property('firstName', 'lastName')
      });

             var person = Person.create();

             person.set('fullName', 'Peter Wagenet');
             person.get('firstName'); // 'Peter'
             person.get('lastName');  // 'Wagenet'
             ```

             @method set
             @param {String} keyName The key being accessed.
             @param {Object} newValue The new value being assigned.
             @param {String} oldValue The old value being replaced.
             @return {Object} The return value of the function backing the CP.
             */
            ComputedPropertyPrototype.set = function computedPropertySetWithSuspend(obj, keyName, value) {
                var oldSuspended = this._suspended;

                this._suspended = obj;

                try {
                    this._set(obj, keyName, value);
                } finally {
                    this._suspended = oldSuspended;
                }
            };

            ComputedPropertyPrototype._set = function computedPropertySet(obj, keyName, value) {
                var cacheable      = this._cacheable;
                var func           = this.func;
                var meta           = metaFor(obj, cacheable);
                var cache          = meta.cache;
                var hadCachedValue = false;

                var funcArgLength, cachedValue, ret;

                if (this._readOnly) {
                    throw new AltoError('Cannot set read-only property "' + keyName + '" on object: ' + inspect(obj));
                }

                if (cacheable && cache[keyName] !== undefined) {
                    if(cache[keyName] !== UNDEFINED) {
                        cachedValue = cache[keyName];
                    }

                    hadCachedValue = true;
                }

                // Check if the CP has been wrapped. If it has, use the
                // length from the wrapped function.

                funcArgLength = func.wrappedFunction ? func.wrappedFunction.__alto_arity__ : func.__alto_arity__;

                // For backwards-compatibility with computed properties
                // that check for arguments.length === 2 to determine if
                // they are being get or set, only pass the old cached
                // value if the computed property opts into a third
                // argument.
                if (funcArgLength === 3) {
                    ret = func.call(obj, keyName, value, cachedValue);
                } else if (funcArgLength === 2) {
                    ret = func.call(obj, keyName, value);
                } else {
                    defineProperty(obj, keyName, null, cachedValue);
                    set(obj, keyName, value);
                    return;
                }

                if (hadCachedValue && cachedValue === ret) { return; }

                var watched = meta.watching[keyName];
                if (watched) {
                    propertyWillChange(obj, keyName);
                }

                if (hadCachedValue) {
                    cache[keyName] = undefined;
                }

                if (cacheable) {
                    if (!hadCachedValue) {
                        addDependentKeys(this, obj, keyName, meta);
                    }
                    if (ret === undefined) {
                        cache[keyName] = UNDEFINED;
                    } else {
                        cache[keyName] = ret;
                    }
                }

                if (watched) {
                    propertyDidChange(obj, keyName);
                }

                return ret;
            };

            /* called before property is overridden */
            ComputedPropertyPrototype.teardown = function(obj, keyName) {
                var meta = metaFor(obj);

                if (keyName in meta.cache) {
                    removeDependentKeys(this, obj, keyName, meta);
                }

                if (this._cacheable) { delete meta.cache[keyName]; }

                return null; // no value to restore
            };


            /**
             This helper returns a new property descriptor that wraps the passed
             computed property function. You can use this helper to define properties
             with mixins or via `Alto.defineProperty()`.

             The function you pass will be used to both get and set property values.
             The function should accept two parameters, key and value. If value is not
             undefined you should set the value first. In either case return the
             current value of the property.

             A computed property defined in this way might look like this:

             ```js
             var Person = Alto.Object.extend({
        firstName: 'Betty',
        lastName: 'Jones',

        fullName: Alto.computed('firstName', 'lastName', function(key, value) {
          return this.get('firstName') + ' ' + this.get('lastName');
        })
      });

             var client = Person.create();

             client.get('fullName'); // 'Betty Jones'

             client.set('lastName', 'Fuller');
             client.get('fullName'); // 'Betty Fuller'
             ```

             _Note: This is the prefered way to define computed properties when writing third-party
             libraries that depend on or use Alto, since there is no guarantee that the user
             will have prototype extensions enabled._

             You might use this method if you disabled
             [Prototype Extensions](http://emberjs.com/guides/configuring-ember/disabling-prototype-extensions/).
             The alternative syntax might look like this
             (if prototype extensions are enabled, which is the default behavior):

             ```js
             fullName: function () {
        return this.get('firstName') + ' ' + this.get('lastName');
      }.property('firstName', 'lastName')
             ```

             @method computed
             @for Alto
             @param {String} [dependentKeys*] Optional dependent keys that trigger this computed property.
             @param {Function} func The computed property function.
             @return {Alto.ComputedProperty} property descriptor instance
             */
            function computed(func) {
                var args;

                if (arguments.length > 1) {
                    args = a_slice.call(arguments);
                    func = args.pop();
                }

                if (typeof func !== "function") {
                    throw new AltoError("Computed Property declared without a property function");
                }

                var cp = new ComputedProperty(func);

                if (args) {
                    cp.property.apply(cp, args);
                }

                return cp;
            }

            /**
             Returns the cached value for a property, if one exists.
             This can be useful for peeking at the value of a computed
             property that is generated lazily, without accidentally causing
             it to be created.

             @method cacheFor
             @for Alto
             @param {Object} obj the object whose property you want to check
             @param {String} key the name of the property whose cached value you want
             to return
             @return {Object} the cached value
             */
            function cacheFor(obj, key) {
                var meta = obj['__alto_meta__'];
                var cache = meta && meta.cache;
                var ret = cache && cache[key];

                if (ret === UNDEFINED) {
                    return undefined;
                }
                return ret;
            }

            cacheFor.set = function(cache, key, value) {
                if (value === undefined) {
                    cache[key] = UNDEFINED;
                } else {
                    cache[key] = value;
                }
            };

            cacheFor.get = function(cache, key) {
                var ret = cache[key];
                if (ret === UNDEFINED) {
                    return undefined;
                }
                return ret;
            };

            cacheFor.remove = function(cache, key) {
                cache[key] = undefined;
            };

            __exports__.ComputedProperty = ComputedProperty;
            __exports__.computed = computed;
            __exports__.cacheFor = cacheFor;
        });
    enifed("ember-metal/computed_macros",
        ["ember-metal/core","ember-metal/property_get","ember-metal/property_set","ember-metal/computed","ember-metal/is_empty","ember-metal/is_none","ember-metal/alias"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__) {
            "use strict";
            var Alto = __dependency1__["default"];
            var get = __dependency2__.get;
            var set = __dependency3__.set;
            var computed = __dependency4__.computed;
            var isEmpty = __dependency5__["default"];
            var isNone = __dependency6__["default"];
            var alias = __dependency7__["default"];

            /**
             @module ember-metal
             */

            var a_slice = [].slice;

            function getProperties(self, propertyNames) {
                var ret = {};
                for(var i = 0; i < propertyNames.length; i++) {
                    ret[propertyNames[i]] = get(self, propertyNames[i]);
                }
                return ret;
            }

            function registerComputed(name, macro) {
                computed[name] = function(dependentKey) {
                    var args = a_slice.call(arguments);
                    return computed(dependentKey, function() {
                        return macro.apply(this, args);
                    });
                };
            }

            function registerComputedWithProperties(name, macro) {
                computed[name] = function() {
                    var properties = a_slice.call(arguments);

                    var computedFunc = computed(function() {
                        return macro.apply(this, [getProperties(this, properties)]);
                    });

                    return computedFunc.property.apply(computedFunc, properties);
                };
            }

            /**
             A computed property that returns true if the value of the dependent
             property is null, an empty string, empty array, or empty function.

             Example

             ```javascript
             var ToDoList = Alto.Object.extend({
        done: Alto.computed.empty('todos')
      });

             var todoList = ToDoList.create({
        todos: ['Unit Test', 'Documentation', 'Release']
      });

             todoList.get('done'); // false
             todoList.get('todos').clear();
             todoList.get('done'); // true
             ```

             @since 1.6.0
             @method computed.empty
             @for Alto
             @param {String} dependentKey
             @return {Alto.ComputedProperty} computed property which negate
             the original value for property
             */
            computed.empty = function (dependentKey) {
                return computed(dependentKey + '.length', function () {
                    return isEmpty(get(this, dependentKey));
                });
            };

            /**
             A computed property that returns true if the value of the dependent
             property is NOT null, an empty string, empty array, or empty function.

             Example

             ```javascript
             var Hamster = Alto.Object.extend({
        hasStuff: Alto.computed.notAltopty('backpack')
      });

             var hamster = Hamster.create({ backpack: ['Food', 'Sleeping Bag', 'Tent'] });

             hamster.get('hasStuff');         // true
             hamster.get('backpack').clear(); // []
             hamster.get('hasStuff');         // false
             ```

             @method computed.notAltopty
             @for Alto
             @param {String} dependentKey
             @return {Alto.ComputedProperty} computed property which returns true if
             original value for property is not empty.
             */
            computed.notAltopty = function(dependentKey) {
                return computed(dependentKey + '.length', function () {
                    return !isEmpty(get(this, dependentKey));
                });
            };

            /**
             A computed property that returns true if the value of the dependent
             property is null or undefined. This avoids errors from JSLint complaining
             about use of ==, which can be technically confusing.

             Example

             ```javascript
             var Hamster = Alto.Object.extend({
        isHungry: Alto.computed.none('food')
      });

             var hamster = Hamster.create();

             hamster.get('isHungry'); // true
             hamster.set('food', 'Banana');
             hamster.get('isHungry'); // false
             hamster.set('food', null);
             hamster.get('isHungry'); // true
             ```

             @method computed.none
             @for Alto
             @param {String} dependentKey
             @return {Alto.ComputedProperty} computed property which
             returns true if original value for property is null or undefined.
             */
            registerComputed('none', function(dependentKey) {
                return isNone(get(this, dependentKey));
            });

            /**
             A computed property that returns the inverse boolean value
             of the original value for the dependent property.

             Example

             ```javascript
             var User = Alto.Object.extend({
        isAnonymous: Alto.computed.not('loggedIn')
      });

             var user = User.create({loggedIn: false});

             user.get('isAnonymous'); // true
             user.set('loggedIn', true);
             user.get('isAnonymous'); // false
             ```

             @method computed.not
             @for Alto
             @param {String} dependentKey
             @return {Alto.ComputedProperty} computed property which returns
             inverse of the original value for property
             */
            registerComputed('not', function(dependentKey) {
                return !get(this, dependentKey);
            });

            /**
             A computed property that converts the provided dependent property
             into a boolean value.

             ```javascript
             var Hamster = Alto.Object.extend({
        hasBananas: Alto.computed.bool('numBananas')
      });

             var hamster = Hamster.create();

             hamster.get('hasBananas'); // false
             hamster.set('numBananas', 0);
             hamster.get('hasBananas'); // false
             hamster.set('numBananas', 1);
             hamster.get('hasBananas'); // true
             hamster.set('numBananas', null);
             hamster.get('hasBananas'); // false
             ```

             @method computed.bool
             @for Alto
             @param {String} dependentKey
             @return {Alto.ComputedProperty} computed property which converts
             to boolean the original value for property
             */
            registerComputed('bool', function(dependentKey) {
                return !!get(this, dependentKey);
            });

            /**
             A computed property which matches the original value for the
             dependent property against a given RegExp, returning `true`
             if they values matches the RegExp and `false` if it does not.

             Example

             ```javascript
             var User = Alto.Object.extend({
        hasValidAltoail: Alto.computed.match('email', /^.+@.+\..+$/)
             });

             var user = User.create({loggedIn: false});

             user.get('hasValidAltoail'); // false
             user.set('email', '');
             user.get('hasValidAltoail'); // false
             user.set('email', 'ember_hamster@example.com');
             user.get('hasValidAltoail'); // true
             ```

             @method computed.match
             @for Alto
             @param {String} dependentKey
             @param {RegExp} regexp
             @return {Alto.ComputedProperty} computed property which match
             the original value for property against a given RegExp
             */
            registerComputed('match', function(dependentKey, regexp) {
                var value = get(this, dependentKey);
                return typeof value === 'string' ? regexp.test(value) : false;
            });

            /**
             A computed property that returns true if the provided dependent property
             is equal to the given value.

             Example

             ```javascript
             var Hamster = Alto.Object.extend({
        napTime: Alto.computed.equal('state', 'sleepy')
      });

             var hamster = Hamster.create();

             hamster.get('napTime'); // false
             hamster.set('state', 'sleepy');
             hamster.get('napTime'); // true
             hamster.set('state', 'hungry');
             hamster.get('napTime'); // false
             ```

             @method computed.equal
             @for Alto
             @param {String} dependentKey
             @param {String|Number|Object} value
             @return {Alto.ComputedProperty} computed property which returns true if
             the original value for property is equal to the given value.
             */
            registerComputed('equal', function(dependentKey, value) {
                return get(this, dependentKey) === value;
            });

            /**
             A computed property that returns true if the provided dependent property
             is greater than the provided value.

             Example

             ```javascript
             var Hamster = Alto.Object.extend({
        hasTooManyBananas: Alto.computed.gt('numBananas', 10)
      });

             var hamster = Hamster.create();

             hamster.get('hasTooManyBananas'); // false
             hamster.set('numBananas', 3);
             hamster.get('hasTooManyBananas'); // false
             hamster.set('numBananas', 11);
             hamster.get('hasTooManyBananas'); // true
             ```

             @method computed.gt
             @for Alto
             @param {String} dependentKey
             @param {Number} value
             @return {Alto.ComputedProperty} computed property which returns true if
             the original value for property is greater than given value.
             */
            registerComputed('gt', function(dependentKey, value) {
                return get(this, dependentKey) > value;
            });

            /**
             A computed property that returns true if the provided dependent property
             is greater than or equal to the provided value.

             Example

             ```javascript
             var Hamster = Alto.Object.extend({
        hasTooManyBananas: Alto.computed.gte('numBananas', 10)
      });

             var hamster = Hamster.create();

             hamster.get('hasTooManyBananas'); // false
             hamster.set('numBananas', 3);
             hamster.get('hasTooManyBananas'); // false
             hamster.set('numBananas', 10);
             hamster.get('hasTooManyBananas'); // true
             ```

             @method computed.gte
             @for Alto
             @param {String} dependentKey
             @param {Number} value
             @return {Alto.ComputedProperty} computed property which returns true if
             the original value for property is greater or equal then given value.
             */
            registerComputed('gte', function(dependentKey, value) {
                return get(this, dependentKey) >= value;
            });

            /**
             A computed property that returns true if the provided dependent property
             is less than the provided value.

             Example

             ```javascript
             var Hamster = Alto.Object.extend({
        needsMoreBananas: Alto.computed.lt('numBananas', 3)
      });

             var hamster = Hamster.create();

             hamster.get('needsMoreBananas'); // true
             hamster.set('numBananas', 3);
             hamster.get('needsMoreBananas'); // false
             hamster.set('numBananas', 2);
             hamster.get('needsMoreBananas'); // true
             ```

             @method computed.lt
             @for Alto
             @param {String} dependentKey
             @param {Number} value
             @return {Alto.ComputedProperty} computed property which returns true if
             the original value for property is less then given value.
             */
            registerComputed('lt', function(dependentKey, value) {
                return get(this, dependentKey) < value;
            });

            /**
             A computed property that returns true if the provided dependent property
             is less than or equal to the provided value.

             Example

             ```javascript
             var Hamster = Alto.Object.extend({
        needsMoreBananas: Alto.computed.lte('numBananas', 3)
      });

             var hamster = Hamster.create();

             hamster.get('needsMoreBananas'); // true
             hamster.set('numBananas', 5);
             hamster.get('needsMoreBananas'); // false
             hamster.set('numBananas', 3);
             hamster.get('needsMoreBananas'); // true
             ```

             @method computed.lte
             @for Alto
             @param {String} dependentKey
             @param {Number} value
             @return {Alto.ComputedProperty} computed property which returns true if
             the original value for property is less or equal than given value.
             */
            registerComputed('lte', function(dependentKey, value) {
                return get(this, dependentKey) <= value;
            });

            /**
             A computed property that performs a logical `and` on the
             original values for the provided dependent properties.

             Example

             ```javascript
             var Hamster = Alto.Object.extend({
        readyForCamp: Alto.computed.and('hasTent', 'hasBackpack')
      });

             var hamster = Hamster.create();

             hamster.get('readyForCamp'); // false
             hamster.set('hasTent', true);
             hamster.get('readyForCamp'); // false
             hamster.set('hasBackpack', true);
             hamster.get('readyForCamp'); // true
             ```

             @method computed.and
             @for Alto
             @param {String} dependentKey*
             @return {Alto.ComputedProperty} computed property which performs
             a logical `and` on the values of all the original values for properties.
             */
            registerComputedWithProperties('and', function(properties) {
                for (var key in properties) {
                    if (properties.hasOwnProperty(key) && !properties[key]) {
                        return false;
                    }
                }
                return true;
            });

            /**
             A computed property which performs a logical `or` on the
             original values for the provided dependent properties.

             Example

             ```javascript
             var Hamster = Alto.Object.extend({
        readyForRain: Alto.computed.or('hasJacket', 'hasUmbrella')
      });

             var hamster = Hamster.create();

             hamster.get('readyForRain'); // false
             hamster.set('hasJacket', true);
             hamster.get('readyForRain'); // true
             ```

             @method computed.or
             @for Alto
             @param {String} dependentKey*
             @return {Alto.ComputedProperty} computed property which performs
             a logical `or` on the values of all the original values for properties.
             */
            registerComputedWithProperties('or', function(properties) {
                for (var key in properties) {
                    if (properties.hasOwnProperty(key) && properties[key]) {
                        return true;
                    }
                }
                return false;
            });

            /**
             A computed property that returns the first truthy value
             from a list of dependent properties.

             Example

             ```javascript
             var Hamster = Alto.Object.extend({
        hasClothes: Alto.computed.any('hat', 'shirt')
      });

             var hamster = Hamster.create();

             hamster.get('hasClothes'); // null
             hamster.set('shirt', 'Hawaiian Shirt');
             hamster.get('hasClothes'); // 'Hawaiian Shirt'
             ```

             @method computed.any
             @for Alto
             @param {String} dependentKey*
             @return {Alto.ComputedProperty} computed property which returns
             the first truthy value of given list of properties.
             */
            registerComputedWithProperties('any', function(properties) {
                for (var key in properties) {
                    if (properties.hasOwnProperty(key) && properties[key]) {
                        return properties[key];
                    }
                }
                return null;
            });

            /**
             A computed property that returns the array of values
             for the provided dependent properties.

             Example

             ```javascript
             var Hamster = Alto.Object.extend({
        clothes: Alto.computed.collect('hat', 'shirt')
      });

             var hamster = Hamster.create();

             hamster.get('clothes'); // [null, null]
             hamster.set('hat', 'Camp Hat');
             hamster.set('shirt', 'Camp Shirt');
             hamster.get('clothes'); // ['Camp Hat', 'Camp Shirt']
             ```

             @method computed.collect
             @for Alto
             @param {String} dependentKey*
             @return {Alto.ComputedProperty} computed property which maps
             values of all passed in properties to an array.
             */
            registerComputedWithProperties('collect', function(properties) {
                var res = Alto.A();
                for (var key in properties) {
                    if (properties.hasOwnProperty(key)) {
                        if (isNone(properties[key])) {
                            res.push(null);
                        } else {
                            res.push(properties[key]);
                        }
                    }
                }
                return res;
            });

            /**
             Creates a new property that is an alias for another property
             on an object. Calls to `get` or `set` this property behave as
             though they were called on the original property.

             ```javascript
             var Person = Alto.Object.extend({
        name: 'Alex Matchneer',
        nomen: Alto.computed.alias('name')
      });

             var alex = Person.create();

             alex.get('nomen'); // 'Alex Matchneer'
             alex.get('name');  // 'Alex Matchneer'

             alex.set('nomen', '@machty');
             alex.get('name');  // '@machty'
             ```

             @method computed.alias
             @for Alto
             @param {String} dependentKey
             @return {Alto.ComputedProperty} computed property which creates an
             alias to the original value for property.
             */
            computed.alias = alias;

            /**
             Where `computed.alias` aliases `get` and `set`, and allows for bidirectional
             data flow, `computed.oneWay` only provides an aliased `get`. The `set` will
             not mutate the upstream property, rather causes the current property to
             become the value set. This causes the downstream property to permanently
             diverge from the upstream property.

             Example

             ```javascript
             var User = Alto.Object.extend({
        firstName: null,
        lastName: null,
        nickName: Alto.computed.oneWay('firstName')
      });

             var teddy = User.create({
        firstName: 'Teddy',
        lastName:  'Zeenny'
      });

             teddy.get('nickName');              // 'Teddy'
             teddy.set('nickName', 'TeddyBear'); // 'TeddyBear'
             teddy.get('firstName');             // 'Teddy'
             ```

             @method computed.oneWay
             @for Alto
             @param {String} dependentKey
             @return {Alto.ComputedProperty} computed property which creates a
             one way computed property to the original value for property.
             */
            computed.oneWay = function(dependentKey) {
                return alias(dependentKey).oneWay();
            };

            /**
             This is a more semantically meaningful alias of `computed.oneWay`,
             whose name is somewhat ambiguous as to which direction the data flows.

             @method computed.reads
             @for Alto
             @param {String} dependentKey
             @return {Alto.ComputedProperty} computed property which creates a
             one way computed property to the original value for property.
             */
            computed.reads = computed.oneWay;

            /**
             Where `computed.oneWay` provides oneWay bindings, `computed.readOnly` provides
             a readOnly one way binding. Very often when using `computed.oneWay` one does
             not also want changes to propogate back up, as they will replace the value.

             This prevents the reverse flow, and also throws an exception when it occurs.

             Example

             ```javascript
             var User = Alto.Object.extend({
        firstName: null,
        lastName: null,
        nickName: Alto.computed.readOnly('firstName')
      });

             var teddy = User.create({
        firstName: 'Teddy',
        lastName:  'Zeenny'
      });

             teddy.get('nickName');              // 'Teddy'
             teddy.set('nickName', 'TeddyBear'); // throws Exception
             // throw new Alto.Error('Cannot Set: nickName on: <User:ember27288>' );`
             teddy.get('firstName');             // 'Teddy'
             ```

             @method computed.readOnly
             @for Alto
             @param {String} dependentKey
             @return {Alto.ComputedProperty} computed property which creates a
             one way computed property to the original value for property.
             @since 1.5.0
             */
            computed.readOnly = function(dependentKey) {
                return alias(dependentKey).readOnly();
            };
            /**
             A computed property that acts like a standard getter and setter,
             but returns the value at the provided `defaultPath` if the
             property itself has not been set to a value

             Example

             ```javascript
             var Hamster = Alto.Object.extend({
        wishList: Alto.computed.defaultTo('favoriteFood')
      });

             var hamster = Hamster.create({ favoriteFood: 'Banana' });

             hamster.get('wishList');                     // 'Banana'
             hamster.set('wishList', 'More Unit Tests');
             hamster.get('wishList');                     // 'More Unit Tests'
             hamster.get('favoriteFood');                 // 'Banana'
             ```

             @method computed.defaultTo
             @for Alto
             @param {String} defaultPath
             @return {Alto.ComputedProperty} computed property which acts like
             a standard getter and setter, but defaults to the value from `defaultPath`.
             @deprecated Use `Alto.computed.oneWay` or custom CP with default instead.
             */
                // ES6TODO: computed should have its own export path so you can do import {defaultTo} from computed
            computed.defaultTo = function(defaultPath) {
                return computed(function(key, newValue, cachedValue) {
                    Alto.deprecate('Usage of Alto.computed.defaultTo is deprecated, use `Alto.computed.oneWay` instead.');

                    if (arguments.length === 1) {
                        return get(this, defaultPath);
                    }
                    return newValue != null ? newValue : get(this, defaultPath);
                });
            };

            /**
             Creates a new property that is an alias for another property
             on an object. Calls to `get` or `set` this property behave as
             though they were called on the original property, but also
             print a deprecation warning.

             @method computed.deprecatingAlias
             @for Alto
             @param {String} dependentKey
             @return {Alto.ComputedProperty} computed property which creates an
             alias with a deprecation to the original value for property.
             @since 1.7.0
             */
            computed.deprecatingAlias = function(dependentKey) {
                return computed(dependentKey, function(key, value) {
                    Alto.deprecate('Usage of `' + key + '` is deprecated, use `' + dependentKey + '` instead.');

                    if (arguments.length > 1) {
                        set(this, dependentKey, value);
                        return value;
                    } else {
                        return get(this, dependentKey);
                    }
                });
            };
        });
    enifed("ember-metal/core",
        ["exports"],
        function(__exports__) {
            "use strict";
            /*globals Alto:true,ENV,AltoENV,MetamorphENV:true */

            /**
             @module ember
             @submodule ember-metal
             */

            /**
             All Alto methods and functions are defined inside of this namespace. You
             generally should not add new properties to this namespace as it may be
             overwritten by future versions of Alto.

             You can also use the shorthand `Alto` instead of `Alto`.

             Alto-Runtime is a framework that provides core functions for Alto including
             cross-platform functions, support for property observing and objects. Its
             focus is on small size and performance. You can use this in place of or
             along-side other cross-platform libraries such as jQuery.

             The core Runtime framework is based on the jQuery API with a number of
             performance optimizations.

             @class Alto
             @static
             @version 1.9.1
             */

            if ('undefined' === typeof Alto) {
                // Create core object. Make it act like an instance of Alto.Namespace so that
                // objects assigned to it are given a sane string representation.
                Alto = {};
            }

            // Default imports, exports and lookup to the global object;
            Alto.imports = Alto.imports || this;
            Alto.lookup  = Alto.lookup  || this;
            var exports   = Alto.exports = Alto.exports || this;

            // aliases needed to keep minifiers from removing the global context
            exports.Alto = exports.Alto = Alto;

            // Make sure these are set whether Alto was already defined or not

            Alto.isNamespace = true;

            Alto.toString = function() { return "Alto"; };


            /**
             @property VERSION
             @type String
             @default '1.9.1'
             @static
             */
            Alto.VERSION = '1.9.1';

            /**
             Standard environmental variables. You can define these in a global `AltoENV`
             variable before loading Alto to control various configuration settings.

             For backwards compatibility with earlier versions of Alto the global `ENV`
             variable will be used if `AltoENV` is not defined.

             @property ENV
             @type Hash
             */

            if (Alto.ENV) {
                // do nothing if Alto.ENV is already setup
            } else if ('undefined' !== typeof AltoENV) {
                Alto.ENV = AltoENV;
            } else if('undefined' !== typeof ENV) {
                Alto.ENV = ENV;
            } else {
                Alto.ENV = {};
            }

            Alto.config = Alto.config || {};

            // We disable the RANGE API by default for performance reasons
            if ('undefined' === typeof Alto.ENV.DISABLE_RANGE_API) {
                Alto.ENV.DISABLE_RANGE_API = true;
            }

            if ("undefined" === typeof MetamorphENV) {
                exports.MetamorphENV = {};
            }

            MetamorphENV.DISABLE_RANGE_API = Alto.ENV.DISABLE_RANGE_API;

            /**
             Hash of enabled Canary features. Add to this before creating your application.

             You can also define `ENV.FEATURES` if you need to enable features flagged at runtime.

             @class FEATURES
             @namespace Alto
             @static
             @since 1.1.0
             */

            Alto.FEATURES = Alto.ENV.FEATURES || {};

            /**
             Test that a feature is enabled. Parsed by Alto's build tools to leave
             experimental features out of beta/stable builds.

             You can define the following configuration options:

             * `ENV.ENABLE_ALL_FEATURES` - force all features to be enabled.
             * `ENV.ENABLE_OPTIONAL_FEATURES` - enable any features that have not been explicitly
             enabled/disabled.

             @method isEnabled
             @param {String} feature
             @return {Boolean}
             @for Alto.FEATURES
             @since 1.1.0
             */

            Alto.FEATURES.isEnabled = function(feature) {
                var featureValue = Alto.FEATURES[feature];

                if (Alto.ENV.ENABLE_ALL_FEATURES) {
                    return true;
                } else if (featureValue === true || featureValue === false || featureValue === undefined) {
                    return featureValue;
                } else if (Alto.ENV.ENABLE_OPTIONAL_FEATURES) {
                    return true;
                } else {
                    return false;
                }
            };

            // ..........................................................
            // BOOTSTRAP
            //

            /**
             Determines whether Alto should enhance some built-in object prototypes to
             provide a more friendly API. If enabled, a few methods will be added to
             `Function`, `String`, and `Array`. `Object.prototype` will not be enhanced,
             which is the one that causes most trouble for people.

             In general we recommend leaving this option set to true since it rarely
             conflicts with other code. If you need to turn it off however, you can
             define an `ENV.EXTEND_PROTOTYPES` config to disable it.

             @property EXTEND_PROTOTYPES
             @type Boolean
             @default true
             @for Alto
             */
            Alto.EXTEND_PROTOTYPES = Alto.ENV.EXTEND_PROTOTYPES;

            if (typeof Alto.EXTEND_PROTOTYPES === 'undefined') {
                Alto.EXTEND_PROTOTYPES = true;
            }

            /**
             Determines whether Alto logs a full stack trace during deprecation warnings

             @property LOG_STACKTRACE_ON_DEPRECATION
             @type Boolean
             @default true
             */
            Alto.LOG_STACKTRACE_ON_DEPRECATION = (Alto.ENV.LOG_STACKTRACE_ON_DEPRECATION !== false);

            /**
             Determines whether Alto should add ECMAScript 5 Array shims to older browsers.

             @property SHIM_ES5
             @type Boolean
             @default Alto.EXTEND_PROTOTYPES
             */
            Alto.SHIM_ES5 = (Alto.ENV.SHIM_ES5 === false) ? false : Alto.EXTEND_PROTOTYPES;

            /**
             Determines whether Alto logs info about version of used libraries

             @property LOG_VERSION
             @type Boolean
             @default true
             */
            Alto.LOG_VERSION = (Alto.ENV.LOG_VERSION === false) ? false : true;

            /**
             Altopty function. Useful for some operations. Always returns `this`.

             @method K
             @private
             @return {Object}
             */
            function K() { return this; }
            __exports__.K = K;
            Alto.K = K;
            //TODO: ES6 GLOBAL TODO

            // Stub out the methods defined by the ember-debug package in case it's not loaded

            if ('undefined' === typeof Alto.assert) { Alto.assert = Alto.K; }
            if ('undefined' === typeof Alto.warn) { Alto.warn = Alto.K; }
            if ('undefined' === typeof Alto.debug) { Alto.debug = Alto.K; }
            if ('undefined' === typeof Alto.runInDebug) { Alto.runInDebug = Alto.K; }
            if ('undefined' === typeof Alto.deprecate) { Alto.deprecate = Alto.K; }
            if ('undefined' === typeof Alto.deprecateFunc) {
                Alto.deprecateFunc = function(_, func) { return func; };
            }

            __exports__["default"] = Alto;
        });
    enifed("ember-metal/dependent_keys",
        ["ember-metal/platform","ember-metal/watching","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            // Remove "use strict"; from transpiled module until
            // https://bugs.webkit.org/show_bug.cgi?id=138038 is fixed
            //
            // REMOVE_USE_STRICT: true

            var o_create = __dependency1__.create;
            var watch = __dependency2__.watch;
            var unwatch = __dependency2__.unwatch;

            /**
             @module ember-metal
             */

            // ..........................................................
            // DEPENDENT KEYS
            //

            // data structure:
            //  meta.deps = {
            //    'depKey': {
            //      'keyName': count,
            //    }
            //  }

            /*
             This function returns a map of unique dependencies for a
             given object and key.
             */
            function keysForDep(depsMeta, depKey) {
                var keys = depsMeta[depKey];
                if (!keys) {
                    // if there are no dependencies yet for a the given key
                    // create a new empty list of dependencies for the key
                    keys = depsMeta[depKey] = {};
                } else if (!depsMeta.hasOwnProperty(depKey)) {
                    // otherwise if the dependency list is inherited from
                    // a superclass, clone the hash
                    keys = depsMeta[depKey] = o_create(keys);
                }
                return keys;
            }

            function metaForDeps(meta) {
                return keysForDep(meta, 'deps');
            }

            function addDependentKeys(desc, obj, keyName, meta) {
                // the descriptor has a list of dependent keys, so
                // add all of its dependent keys.
                var depKeys = desc._dependentKeys, depsMeta, idx, len, depKey, keys;
                if (!depKeys) return;

                depsMeta = metaForDeps(meta);

                for(idx = 0, len = depKeys.length; idx < len; idx++) {
                    depKey = depKeys[idx];
                    // Lookup keys meta for depKey
                    keys = keysForDep(depsMeta, depKey);
                    // Increment the number of times depKey depends on keyName.
                    keys[keyName] = (keys[keyName] || 0) + 1;
                    // Watch the depKey
                    watch(obj, depKey, meta);
                }
            }

            __exports__.addDependentKeys = addDependentKeys;function removeDependentKeys(desc, obj, keyName, meta) {
                // the descriptor has a list of dependent keys, so
                // remove all of its dependent keys.
                var depKeys = desc._dependentKeys, depsMeta, idx, len, depKey, keys;
                if (!depKeys) return;

                depsMeta = metaForDeps(meta);

                for(idx = 0, len = depKeys.length; idx < len; idx++) {
                    depKey = depKeys[idx];
                    // Lookup keys meta for depKey
                    keys = keysForDep(depsMeta, depKey);
                    // Decrement the number of times depKey depends on keyName.
                    keys[keyName] = (keys[keyName] || 0) - 1;
                    // Unwatch the depKey
                    unwatch(obj, depKey, meta);
                }
            }

            __exports__.removeDependentKeys = removeDependentKeys;
        });
    enifed("ember-metal/deprecate_property",
        ["ember-metal/core","ember-metal/platform","ember-metal/properties","ember-metal/property_get","ember-metal/property_set","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
            "use strict";
            /**
             @module ember-metal
             */

            var Alto = __dependency1__["default"];
            var hasPropertyAccessors = __dependency2__.hasPropertyAccessors;
            var defineProperty = __dependency3__.defineProperty;
            var get = __dependency4__.get;
            var set = __dependency5__.set;


            /**
             Used internally to allow changing properties in a backwards compatible way, and print a helpful
             deprecation warning.

             @method deprecateProperty
             @param {Object} object The object to add the deprecated property to.
             @param {String} deprecatedKey The property to add (and print deprecation warnings upon accessing).
             @param {String} newKey The property that will be aliased.
             @private
             @since 1.7.0
             */

            function deprecateProperty(object, deprecatedKey, newKey) {
                function deprecate() {
                    Alto.deprecate('Usage of `' + deprecatedKey + '` is deprecated, use `' + newKey + '` instead.');
                }

                if (hasPropertyAccessors) {
                    defineProperty(object, deprecatedKey, {
                        configurable: true,
                        enumerable: false,
                        set: function(value) { deprecate(); set(this, newKey, value); },
                        get: function() { deprecate(); return get(this, newKey); }
                    });
                }
            }

            __exports__.deprecateProperty = deprecateProperty;
        });
    enifed("ember-metal/dictionary",
        ["ember-metal/platform","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var create = __dependency1__.create;

            // the delete is meant to hint at runtimes that this object should remain in
            // dictionary mode. This is clearly a runtime specific hack, but currently it
            // appears worthwile in some usecases. Please note, these deletes do increase
            // the cost of creation dramatically over a plain Object.create. And as this
            // only makes sense for long-lived dictionaries that aren't instantiated often.
            __exports__["default"] = function makeDictionary(parent) {
                var dict = create(parent);
                dict['_dict'] = null;
                delete dict['_dict'];
                return dict;
            }
        });
    enifed("ember-metal/enumerable_utils",
        ["ember-metal/array","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var _filter = __dependency1__.filter;
            var a_forEach = __dependency1__.forEach;
            var _indexOf = __dependency1__.indexOf;
            var _map = __dependency1__.map;

            var splice = Array.prototype.splice;

            /**
             * Defines some convenience methods for working with Enumerables.
             * `Alto.EnumerableUtils` uses `Alto.ArrayPolyfills` when necessary.
             *
             * @class EnumerableUtils
             * @namespace Alto
             * @static
             * */

            /**
             * Calls the map function on the passed object with a specified callback. This
             * uses `Alto.ArrayPolyfill`'s-map method when necessary.
             *
             * @method map
             * @param {Object} obj The object that should be mapped
             * @param {Function} callback The callback to execute
             * @param {Object} thisArg Value to use as this when executing *callback*
             *
             * @return {Array} An array of mapped values.
             */
            function map(obj, callback, thisArg) {
                return obj.map ? obj.map(callback, thisArg) : _map.call(obj, callback, thisArg);
            }

            __exports__.map = map;/**
             * Calls the forEach function on the passed object with a specified callback. This
             * uses `Alto.ArrayPolyfill`'s-forEach method when necessary.
             *
             * @method forEach
             * @param {Object} obj The object to call forEach on
             * @param {Function} callback The callback to execute
             * @param {Object} thisArg Value to use as this when executing *callback*
             *
             */
            function forEach(obj, callback, thisArg) {
                return obj.forEach ? obj.forEach(callback, thisArg) : a_forEach.call(obj, callback, thisArg);
            }

            __exports__.forEach = forEach;/**
             * Calls the filter function on the passed object with a specified callback. This
             * uses `Alto.ArrayPolyfill`'s-filter method when necessary.
             *
             * @method filter
             * @param {Object} obj The object to call filter on
             * @param {Function} callback The callback to execute
             * @param {Object} thisArg Value to use as this when executing *callback*
             *
             * @return {Array} An array containing the filtered values
             * @since 1.4.0
             */
            function filter(obj, callback, thisArg) {
                return obj.filter ? obj.filter(callback, thisArg) : _filter.call(obj, callback, thisArg);
            }

            __exports__.filter = filter;/**
             * Calls the indexOf function on the passed object with a specified callback. This
             * uses `Alto.ArrayPolyfill`'s-indexOf method when necessary.
             *
             * @method indexOf
             * @param {Object} obj The object to call indexOn on
             * @param {Function} callback The callback to execute
             * @param {Object} index The index to start searching from
             *
             */
            function indexOf(obj, element, index) {
                return obj.indexOf ? obj.indexOf(element, index) : _indexOf.call(obj, element, index);
            }

            __exports__.indexOf = indexOf;/**
             * Returns an array of indexes of the first occurrences of the passed elements
             * on the passed object.
             *
             * ```javascript
             *  var array = [1, 2, 3, 4, 5];
             *  Alto.EnumerableUtils.indexesOf(array, [2, 5]); // [1, 4]
             *
             *  var fubar = "Fubarr";
             *  Alto.EnumerableUtils.indexesOf(fubar, ['b', 'r']); // [2, 4]
             * ```
             *
             * @method indexesOf
             * @param {Object} obj The object to check for element indexes
             * @param {Array} elements The elements to search for on *obj*
             *
             * @return {Array} An array of indexes.
             *
             */
            function indexesOf(obj, elements) {
                return elements === undefined ? [] : map(elements, function(item) {
                    return indexOf(obj, item);
                });
            }

            __exports__.indexesOf = indexesOf;/**
             * Adds an object to an array. If the array already includes the object this
             * method has no effect.
             *
             * @method addObject
             * @param {Array} array The array the passed item should be added to
             * @param {Object} item The item to add to the passed array
             *
             * @return 'undefined'
             */
            function addObject(array, item) {
                var index = indexOf(array, item);
                if (index === -1) { array.push(item); }
            }

            __exports__.addObject = addObject;/**
             * Removes an object from an array. If the array does not contain the passed
             * object this method has no effect.
             *
             * @method removeObject
             * @param {Array} array The array to remove the item from.
             * @param {Object} item The item to remove from the passed array.
             *
             * @return 'undefined'
             */
            function removeObject(array, item) {
                var index = indexOf(array, item);
                if (index !== -1) { array.splice(index, 1); }
            }

            __exports__.removeObject = removeObject;function _replace(array, idx, amt, objects) {
                var args = [].concat(objects);
                var ret = [];
                // https://code.google.com/p/chromium/issues/detail?id=56588
                var size = 60000;
                var start = idx;
                var ends = amt;
                var count, chunk;

                while (args.length) {
                    count = ends > size ? size : ends;
                    if (count <= 0) { count = 0; }

                    chunk = args.splice(0, size);
                    chunk = [start, count].concat(chunk);

                    start += size;
                    ends -= count;

                    ret = ret.concat(splice.apply(array, chunk));
                }
                return ret;
            }

            __exports__._replace = _replace;/**
             * Replaces objects in an array with the passed objects.
             *
             * ```javascript
             *   var array = [1,2,3];
             *   Alto.EnumerableUtils.replace(array, 1, 2, [4, 5]); // [1, 4, 5]
             *
             *   var array = [1,2,3];
             *   Alto.EnumerableUtils.replace(array, 1, 1, [4, 5]); // [1, 4, 5, 3]
             *
             *   var array = [1,2,3];
             *   Alto.EnumerableUtils.replace(array, 10, 1, [4, 5]); // [1, 2, 3, 4, 5]
             * ```
             *
             * @method replace
             * @param {Array} array The array the objects should be inserted into.
             * @param {Number} idx Starting index in the array to replace. If *idx* >=
             * length, then append to the end of the array.
             * @param {Number} amt Number of elements that should be removed from the array,
             * starting at *idx*
             * @param {Array} objects An array of zero or more objects that should be
             * inserted into the array at *idx*
             *
             * @return {Array} The modified array.
             */
            function replace(array, idx, amt, objects) {
                if (array.replace) {
                    return array.replace(idx, amt, objects);
                } else {
                    return _replace(array, idx, amt, objects);
                }
            }

            __exports__.replace = replace;/**
             * Calculates the intersection of two arrays. This method returns a new array
             * filled with the records that the two passed arrays share with each other.
             * If there is no intersection, an empty array will be returned.
             *
             * ```javascript
             * var array1 = [1, 2, 3, 4, 5];
             * var array2 = [1, 3, 5, 6, 7];
             *
             * Alto.EnumerableUtils.intersection(array1, array2); // [1, 3, 5]
             *
             * var array1 = [1, 2, 3];
             * var array2 = [4, 5, 6];
             *
             * Alto.EnumerableUtils.intersection(array1, array2); // []
             * ```
             *
             * @method intersection
             * @param {Array} array1 The first array
             * @param {Array} array2 The second array
             *
             * @return {Array} The intersection of the two passed arrays.
             */
            function intersection(array1, array2) {
                var result = [];
                forEach(array1, function(element) {
                    if (indexOf(array2, element) >= 0) {
                        result.push(element);
                    }
                });

                return result;
            }

            __exports__.intersection = intersection;// TODO: this only exists to maintain the existing api, as we move forward it
            // should only be part of the "global build" via some shim
            __exports__["default"] = {
                _replace: _replace,
                addObject: addObject,
                filter: filter,
                forEach: forEach,
                indexOf: indexOf,
                indexesOf: indexesOf,
                intersection: intersection,
                map: map,
                removeObject: removeObject,
                replace: replace
            };
        });
    enifed("ember-metal/error",
        ["ember-metal/platform","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var create = __dependency1__.create;

            var errorProps = [
                'description',
                'fileName',
                'lineNumber',
                'message',
                'name',
                'number',
                'stack'
            ];

            /**
             A subclass of the JavaScript Error object for use in Alto.

             @class Error
             @namespace Alto
             @extends Error
             @constructor
             */
            function AltoError() {
                var tmp = Error.apply(this, arguments);

                // Adds a `stack` property to the given error object that will yield the
                // stack trace at the time captureStackTrace was called.
                // When collecting the stack trace all frames above the topmost call
                // to this function, including that call, will be left out of the
                // stack trace.
                // This is useful because we can hide Alto implementation details
                // that are not very helpful for the user.
                if (Error.captureStackTrace) {
                    Error.captureStackTrace(this, Alto.Error);
                }
                // Unfortunately errors are not enumerable in Chrome (at least), so `for prop in tmp` doesn't work.
                for (var idx = 0; idx < errorProps.length; idx++) {
                    this[errorProps[idx]] = tmp[errorProps[idx]];
                }
            }

            AltoError.prototype = create(Error.prototype);

            __exports__["default"] = AltoError;
        });
    enifed("ember-metal/events",
        ["ember-metal/core","ember-metal/utils","ember-metal/platform","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            // Remove "use strict"; from transpiled module until
            // https://bugs.webkit.org/show_bug.cgi?id=138038 is fixed
            //
            // REMOVE_USE_STRICT: true

            /**
             @module ember-metal
             */
            var Alto = __dependency1__["default"];
            var metaFor = __dependency2__.meta;
            var tryFinally = __dependency2__.tryFinally;
            var apply = __dependency2__.apply;
            var applyStr = __dependency2__.applyStr;
            var create = __dependency3__.create;

            var a_slice = [].slice;

            /* listener flags */
            var ONCE = 1;
            var SUSPENDED = 2;


            /*
             The event system uses a series of nested hashes to store listeners on an
             object. When a listener is registered, or when an event arrives, these
             hashes are consulted to determine which target and action pair to invoke.

             The hashes are stored in the object's meta hash, and look like this:

             // Object's meta hash
             {
             listeners: {       // variable name: `listenerSet`
             "foo:changed": [ // variable name: `actions`
             target, method, flags
             ]
             }
             }

             */

            function indexOf(array, target, method) {
                var index = -1;
                // hashes are added to the end of the event array
                // so it makes sense to start searching at the end
                // of the array and search in reverse
                for (var i = array.length - 3 ; i >=0; i -= 3) {
                    if (target === array[i] && method === array[i + 1]) {
                        index = i; break;
                    }
                }
                return index;
            }

            function actionsFor(obj, eventName) {
                var meta = metaFor(obj, true);
                var actions;
                var listeners = meta.listeners;

                if (!listeners) {
                    listeners = meta.listeners = create(null);
                    listeners.__source__ = obj;
                } else if (listeners.__source__ !== obj) {
                    // setup inherited copy of the listeners object
                    listeners = meta.listeners = create(listeners);
                    listeners.__source__ = obj;
                }

                actions = listeners[eventName];

                // if there are actions, but the eventName doesn't exist in our listeners, then copy them from the prototype
                if (actions && actions.__source__ !== obj) {
                    actions = listeners[eventName] = listeners[eventName].slice();
                    actions.__source__ = obj;
                } else if (!actions) {
                    actions = listeners[eventName] = [];
                    actions.__source__ = obj;
                }

                return actions;
            }

            function listenersUnion(obj, eventName, otherActions) {
                var meta = obj['__alto_meta__'];
                var actions = meta && meta.listeners && meta.listeners[eventName];

                if (!actions) { return; }
                for (var i = actions.length - 3; i >= 0; i -= 3) {
                    var target = actions[i];
                    var method = actions[i+1];
                    var flags = actions[i+2];
                    var actionIndex = indexOf(otherActions, target, method);

                    if (actionIndex === -1) {
                        otherActions.push(target, method, flags);
                    }
                }
            }

            __exports__.listenersUnion = listenersUnion;function listenersDiff(obj, eventName, otherActions) {
                var meta = obj['__alto_meta__'];
                var actions = meta && meta.listeners && meta.listeners[eventName];
                var diffActions = [];

                if (!actions) { return; }
                for (var i = actions.length - 3; i >= 0; i -= 3) {
                    var target = actions[i];
                    var method = actions[i+1];
                    var flags = actions[i+2];
                    var actionIndex = indexOf(otherActions, target, method);

                    if (actionIndex !== -1) { continue; }

                    otherActions.push(target, method, flags);
                    diffActions.push(target, method, flags);
                }

                return diffActions;
            }

            __exports__.listenersDiff = listenersDiff;/**
             Add an event listener

             @method addListener
             @for Alto
             @param obj
             @param {String} eventName
             @param {Object|Function} target A target object or a function
             @param {Function|String} method A function or the name of a function to be called on `target`
             @param {Boolean} once A flag whether a function should only be called once
             */
            function addListener(obj, eventName, target, method, once) {
                Alto.assert("You must pass at least an object and event name to Alto.addListener", !!obj && !!eventName);

                if (!method && 'function' === typeof target) {
                    method = target;
                    target = null;
                }

                var actions = actionsFor(obj, eventName);
                var actionIndex = indexOf(actions, target, method);
                var flags = 0;

                if (once) flags |= ONCE;

                if (actionIndex !== -1) { return; }

                actions.push(target, method, flags);

                if ('function' === typeof obj.didAddListener) {
                    obj.didAddListener(eventName, target, method);
                }
            }

            __exports__.addListener = addListener;/**
             Remove an event listener

             Arguments should match those passed to `Alto.addListener`.

             @method removeListener
             @for Alto
             @param obj
             @param {String} eventName
             @param {Object|Function} target A target object or a function
             @param {Function|String} method A function or the name of a function to be called on `target`
             */
            function removeListener(obj, eventName, target, method) {
                Alto.assert("You must pass at least an object and event name to Alto.removeListener", !!obj && !!eventName);

                if (!method && 'function' === typeof target) {
                    method = target;
                    target = null;
                }

                function _removeListener(target, method) {
                    var actions = actionsFor(obj, eventName);
                    var actionIndex = indexOf(actions, target, method);

                    // action doesn't exist, give up silently
                    if (actionIndex === -1) { return; }

                    actions.splice(actionIndex, 3);

                    if ('function' === typeof obj.didRemoveListener) {
                        obj.didRemoveListener(eventName, target, method);
                    }
                }

                if (method) {
                    _removeListener(target, method);
                } else {
                    var meta = obj['__alto_meta__'];
                    var actions = meta && meta.listeners && meta.listeners[eventName];

                    if (!actions) { return; }
                    for (var i = actions.length - 3; i >= 0; i -= 3) {
                        _removeListener(actions[i], actions[i+1]);
                    }
                }
            }

            /**
             Suspend listener during callback.

             This should only be used by the target of the event listener
             when it is taking an action that would cause the event, e.g.
             an object might suspend its property change listener while it is
             setting that property.

             @method suspendListener
             @for Alto

             @private
             @param obj
             @param {String} eventName
             @param {Object|Function} target A target object or a function
             @param {Function|String} method A function or the name of a function to be called on `target`
             @param {Function} callback
             */
            function suspendListener(obj, eventName, target, method, callback) {
                if (!method && 'function' === typeof target) {
                    method = target;
                    target = null;
                }

                var actions = actionsFor(obj, eventName);
                var actionIndex = indexOf(actions, target, method);

                if (actionIndex !== -1) {
                    actions[actionIndex+2] |= SUSPENDED; // mark the action as suspended
                }

                function tryable()   { return callback.call(target); }
                function finalizer() { if (actionIndex !== -1) { actions[actionIndex+2] &= ~SUSPENDED; } }

                return tryFinally(tryable, finalizer);
            }

            __exports__.suspendListener = suspendListener;/**
             Suspends multiple listeners during a callback.

             @method suspendListeners
             @for Alto

             @private
             @param obj
             @param {Array} eventNames Array of event names
             @param {Object|Function} target A target object or a function
             @param {Function|String} method A function or the name of a function to be called on `target`
             @param {Function} callback
             */
            function suspendListeners(obj, eventNames, target, method, callback) {
                if (!method && 'function' === typeof target) {
                    method = target;
                    target = null;
                }

                var suspendedActions = [];
                var actionsList = [];
                var eventName, actions, i, l;

                for (i=0, l=eventNames.length; i<l; i++) {
                    eventName = eventNames[i];
                    actions = actionsFor(obj, eventName);
                    var actionIndex = indexOf(actions, target, method);

                    if (actionIndex !== -1) {
                        actions[actionIndex+2] |= SUSPENDED;
                        suspendedActions.push(actionIndex);
                        actionsList.push(actions);
                    }
                }

                function tryable() { return callback.call(target); }

                function finalizer() {
                    for (var i = 0, l = suspendedActions.length; i < l; i++) {
                        var actionIndex = suspendedActions[i];
                        actionsList[i][actionIndex+2] &= ~SUSPENDED;
                    }
                }

                return tryFinally(tryable, finalizer);
            }

            __exports__.suspendListeners = suspendListeners;/**
             Return a list of currently watched events

             @private
             @method watchedEvents
             @for Alto
             @param obj
             */
            function watchedEvents(obj) {
                var listeners = obj['__alto_meta__'].listeners, ret = [];

                if (listeners) {
                    for (var eventName in listeners) {
                        if (eventName !== '__source__' &&
                            listeners[eventName]) {
                            ret.push(eventName);
                        }
                    }
                }
                return ret;
            }

            __exports__.watchedEvents = watchedEvents;/**
             Send an event. The execution of suspended listeners
             is skipped, and once listeners are removed. A listener without
             a target is executed on the passed object. If an array of actions
             is not passed, the actions stored on the passed object are invoked.

             @method sendEvent
             @for Alto
             @param obj
             @param {String} eventName
             @param {Array} params Optional parameters for each listener.
             @param {Array} actions Optional array of actions (listeners).
             @return true
             */
            function sendEvent(obj, eventName, params, actions) {
                // first give object a chance to handle it
                if (obj !== Alto && 'function' === typeof obj.sendEvent) {
                    obj.sendEvent(eventName, params);
                }

                if (!actions) {
                    var meta = obj['__alto_meta__'];
                    actions = meta && meta.listeners && meta.listeners[eventName];
                }

                if (!actions) { return; }

                for (var i = actions.length - 3; i >= 0; i -= 3) { // looping in reverse for once listeners
                    var target = actions[i], method = actions[i+1], flags = actions[i+2];
                    if (!method) { continue; }
                    if (flags & SUSPENDED) { continue; }
                    if (flags & ONCE) { removeListener(obj, eventName, target, method); }
                    if (!target) { target = obj; }
                    if ('string' === typeof method) {
                        if (params) {
                            applyStr(target, method, params);
                        } else {
                            target[method]();
                        }
                    } else {
                        if (params) {
                            apply(target, method, params);
                        } else {
                            method.call(target);
                        }
                    }
                }
                return true;
            }

            __exports__.sendEvent = sendEvent;/**
             @private
             @method hasListeners
             @for Alto
             @param obj
             @param {String} eventName
             */
            function hasListeners(obj, eventName) {
                var meta = obj['__alto_meta__'];
                var actions = meta && meta.listeners && meta.listeners[eventName];

                return !!(actions && actions.length);
            }

            __exports__.hasListeners = hasListeners;/**
             @private
             @method listenersFor
             @for Alto
             @param obj
             @param {String} eventName
             */
            function listenersFor(obj, eventName) {
                var ret = [];
                var meta = obj['__alto_meta__'];
                var actions = meta && meta.listeners && meta.listeners[eventName];

                if (!actions) { return ret; }

                for (var i = 0, l = actions.length; i < l; i += 3) {
                    var target = actions[i];
                    var method = actions[i+1];
                    ret.push([target, method]);
                }

                return ret;
            }

            __exports__.listenersFor = listenersFor;/**
             Define a property as a function that should be executed when
             a specified event or events are triggered.


             ``` javascript
             var Job = Alto.Object.extend({
        logCompleted: Alto.on('completed', function() {
          console.log('Job completed!');
        })
      });

             var job = Job.create();

             Alto.sendEvent(job, 'completed'); // Logs 'Job completed!'
             ```

             @method on
             @for Alto
             @param {String} eventNames*
             @param {Function} func
             @return func
             */
            function on(){
                var func = a_slice.call(arguments, -1)[0];
                var events = a_slice.call(arguments, 0, -1);
                func.__alto_listens__ = events;
                return func;
            }

            __exports__.on = on;__exports__.removeListener = removeListener;
        });
    enifed("ember-metal/expand_properties",
        ["ember-metal/core","ember-metal/error","ember-metal/enumerable_utils","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            var AltoError = __dependency2__["default"];
            var forEach = __dependency3__.forEach;

            /**
             @module ember-metal
             */

            var BRACE_EXPANSION = /^((?:[^\.]*\.)*)\{(.*)\}$/;
            var SPLIT_REGEX = /\{|\}/;

            /**
             Expands `pattern`, invoking `callback` for each expansion.

             The only pattern supported is brace-expansion, anything else will be passed
             once to `callback` directly.

             Example

             ```js
             function echo(arg){ console.log(arg); }

             Alto.expandProperties('foo.bar', echo);              //=> 'foo.bar'
             Alto.expandProperties('{foo,bar}', echo);            //=> 'foo', 'bar'
             Alto.expandProperties('foo.{bar,baz}', echo);        //=> 'foo.bar', 'foo.baz'
             Alto.expandProperties('{foo,bar}.baz', echo);        //=> '{foo,bar}.baz'
             Alto.expandProperties('foo.{bar,baz}.@each', echo)   //=> 'foo.bar.@each', 'foo.baz.@each'
             Alto.expandProperties('{foo,bar}.{spam,eggs}', echo) //=> 'foo.spam', 'foo.eggs', 'bar.spam', 'bar.eggs'
             Alto.expandProperties('{foo}.bar.{baz}')             //=> 'foo.bar.baz'
             ```

             @method
             @private
             @param {String} pattern The property pattern to expand.
             @param {Function} callback The callback to invoke.  It is invoked once per
             expansion, and is passed the expansion.
             */
            __exports__["default"] = function expandProperties(pattern, callback) {
                if (pattern.indexOf(' ') > -1) {
                    throw new AltoError('Brace expanded properties cannot contain spaces, ' +
                        'e.g. `user.{firstName, lastName}` should be `user.{firstName,lastName}`');
                }


                return newExpandProperties(pattern, callback);
            }

            function oldExpandProperties(pattern, callback) {
                var match, prefix, list;

                if (match = BRACE_EXPANSION.exec(pattern)) {
                    prefix = match[1];
                    list = match[2];

                    forEach(list.split(','), function (suffix) {
                        callback(prefix + suffix);
                    });
                } else {
                    callback(pattern);
                }
            }

            function newExpandProperties(pattern, callback) {
                if ('string' === Alto.typeOf(pattern)) {
                    var parts = pattern.split(SPLIT_REGEX);
                    var properties = [parts];

                    forEach(parts, function(part, index) {
                        if (part.indexOf(',') >= 0) {
                            properties = duplicateAndReplace(properties, part.split(','), index);
                        }
                    });

                    forEach(properties, function(property) {
                        callback(property.join(''));
                    });
                } else {
                    callback(pattern);
                }
            }

            function duplicateAndReplace(properties, currentParts, index) {
                var all = [];

                forEach(properties, function(property) {
                    forEach(currentParts, function(part) {
                        var current = property.slice(0);
                        current[index] = part;
                        all.push(current);
                    });
                });

                return all;
            }
        });
    enifed("ember-metal/get_properties",
        ["ember-metal/property_get","ember-metal/utils","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var get = __dependency1__.get;
            var typeOf = __dependency2__.typeOf;

            /**
             To get multiple properties at once, call `Alto.getProperties`
             with an object followed by a list of strings or an array:

             ```javascript
             Alto.getProperties(record, 'firstName', 'lastName', 'zipCode');
             // { firstName: 'John', lastName: 'Doe', zipCode: '10011' }
             ```

             is equivalent to:

             ```javascript
             Alto.getProperties(record, ['firstName', 'lastName', 'zipCode']);
             // { firstName: 'John', lastName: 'Doe', zipCode: '10011' }
             ```

             @method getProperties
             @param obj
             @param {String...|Array} list of keys to get
             @return {Hash}
             */
            __exports__["default"] = function getProperties(obj) {
                var ret = {};
                var propertyNames = arguments;
                var i = 1;

                if (arguments.length === 2 && typeOf(arguments[1]) === 'array') {
                    i = 0;
                    propertyNames = arguments[1];
                }
                for(var len = propertyNames.length; i < len; i++) {
                    ret[propertyNames[i]] = get(obj, propertyNames[i]);
                }
                return ret;
            }
        });
    enifed("ember-metal/injected_property",
        ["ember-metal/core","ember-metal/computed","ember-metal/properties","ember-metal/platform","ember-metal/utils","ember-metal/error","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            // Alto.assert
            var ComputedProperty = __dependency2__.ComputedProperty;
            var Descriptor = __dependency3__.Descriptor;
            var create = __dependency4__.create;
            var inspect = __dependency5__.inspect;
            var AltoError = __dependency6__["default"];

            /**
             Read-only property that returns the result of a container lookup.

             @class InjectedProperty
             @namespace Alto
             @extends Alto.Descriptor
             @constructor
             @param {String} type The container type the property will lookup
             @param {String} name (optional) The name the property will lookup, defaults
             to the property's name
             */
            function InjectedProperty(type, name) {
                this.type = type;
                this.name = name;

                this._super$Constructor(function(keyName) {
                    Alto.assert("Attempting to lookup an injected property on an object " +
                        "without a container, ensure that the object was " +
                        "instantiated via a container.", this.container);

                    return this.container.lookup(type + ':' + (name || keyName));
                }, { readOnly: true });
            }

            InjectedProperty.prototype = create(Descriptor.prototype);

            var InjectedPropertyPrototype = InjectedProperty.prototype;
            var ComputedPropertyPrototype = ComputedProperty.prototype;

            InjectedPropertyPrototype._super$Constructor = ComputedProperty;

            InjectedPropertyPrototype.get = ComputedPropertyPrototype.get;

            InjectedPropertyPrototype.set = function(obj, keyName) {
                throw new AltoError("Cannot set injected property '" + keyName + "' on object: " + inspect(obj));
            };

            InjectedPropertyPrototype.teardown = ComputedPropertyPrototype.teardown;

            __exports__["default"] = InjectedProperty;
        });
    enifed("ember-metal/instrumentation",
        ["ember-metal/core","ember-metal/utils","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            var tryCatchFinally = __dependency2__.tryCatchFinally;

            /**
             The purpose of the Alto Instrumentation module is
             to provide efficient, general-purpose instrumentation
             for Alto.

             Subscribe to a listener by using `Alto.subscribe`:

             ```javascript
             Alto.subscribe("render", {
        before: function(name, timestamp, payload) {

        },

        after: function(name, timestamp, payload) {

        }
      });
             ```

             If you return a value from the `before` callback, that same
             value will be passed as a fourth parameter to the `after`
             callback.

             Instrument a block of code by using `Alto.instrument`:

             ```javascript
             Alto.instrument("render.handlebars", payload, function() {
        // rendering logic
      }, binding);
             ```

             Event names passed to `Alto.instrument` are namespaced
             by periods, from more general to more specific. Subscribers
             can listen for events by whatever level of granularity they
             are interested in.

             In the above example, the event is `render.handlebars`,
             and the subscriber listened for all events beginning with
             `render`. It would receive callbacks for events named
             `render`, `render.handlebars`, `render.container`, or
             even `render.handlebars.layout`.

             @class Instrumentation
             @namespace Alto
             @static
             */
            var subscribers = [];
            __exports__.subscribers = subscribers;var cache = {};

            var populateListeners = function(name) {
                var listeners = [];
                var subscriber;

                for (var i=0, l=subscribers.length; i<l; i++) {
                    subscriber = subscribers[i];
                    if (subscriber.regex.test(name)) {
                        listeners.push(subscriber.object);
                    }
                }

                cache[name] = listeners;
                return listeners;
            };

            var time = (function() {
                var perf = 'undefined' !== typeof window ? window.performance || {} : {};
                var fn = perf.now || perf.mozNow || perf.webkitNow || perf.msNow || perf.oNow;
                // fn.bind will be available in all the browsers that support the advanced window.performance... ;-)
                return fn ? fn.bind(perf) : function() { return +new Date(); };
            })();

            /**
             Notifies event's subscribers, calls `before` and `after` hooks.

             @method instrument
             @namespace Alto.Instrumentation

             @param {String} [name] Namespaced event name.
             @param {Object} payload
             @param {Function} callback Function that you're instrumenting.
             @param {Object} binding Context that instrument function is called with.
             */
            function instrument(name, _payload, callback, binding) {
                if (subscribers.length === 0) {
                    return callback.call(binding);
                }
                var payload = _payload || {};
                var finalizer = _instrumentStart(name, function () {
                    return payload;
                });
                if (finalizer) {
                    var tryable = function _instrumenTryable() {
                        return callback.call(binding);
                    };
                    var catchable = function _instrumentCatchable(e) {
                        payload.exception = e;
                    };
                    return tryCatchFinally(tryable, catchable, finalizer);
                } else {
                    return callback.call(binding);
                }
            }

            __exports__.instrument = instrument;// private for now
            function _instrumentStart(name, _payload) {
                var listeners = cache[name];

                if (!listeners) {
                    listeners = populateListeners(name);
                }

                if (listeners.length === 0) {
                    return;
                }

                var payload = _payload();

                var STRUCTURED_PROFILE = Alto.STRUCTURED_PROFILE;
                var timeName;
                if (STRUCTURED_PROFILE) {
                    timeName = name + ": " + payload.object;
                    console.time(timeName);
                }

                var l = listeners.length;
                var beforeValues = new Array(l);
                var i, listener;
                var timestamp = time();
                for (i=0; i<l; i++) {
                    listener = listeners[i];
                    beforeValues[i] = listener.before(name, timestamp, payload);
                }

                return function _instrumentEnd() {
                    var i, l, listener;
                    var timestamp = time();
                    for (i=0, l=listeners.length; i<l; i++) {
                        listener = listeners[i];
                        listener.after(name, timestamp, payload, beforeValues[i]);
                    }

                    if (STRUCTURED_PROFILE) {
                        console.timeEnd(timeName);
                    }
                };
            }

            __exports__._instrumentStart = _instrumentStart;/**
             Subscribes to a particular event or instrumented block of code.

             @method subscribe
             @namespace Alto.Instrumentation

             @param {String} [pattern] Namespaced event name.
             @param {Object} [object] Before and After hooks.

             @return {Subscriber}
             */
            function subscribe(pattern, object) {
                var paths = pattern.split("."), path, regex = [];

                for (var i=0, l=paths.length; i<l; i++) {
                    path = paths[i];
                    if (path === "*") {
                        regex.push("[^\\.]*");
                    } else {
                        regex.push(path);
                    }
                }

                regex = regex.join("\\.");
                regex = regex + "(\\..*)?";

                var subscriber = {
                    pattern: pattern,
                    regex: new RegExp("^" + regex + "$"),
                    object: object
                };

                subscribers.push(subscriber);
                cache = {};

                return subscriber;
            }

            __exports__.subscribe = subscribe;/**
             Unsubscribes from a particular event or instrumented block of code.

             @method unsubscribe
             @namespace Alto.Instrumentation

             @param {Object} [subscriber]
             */
            function unsubscribe(subscriber) {
                var index;

                for (var i=0, l=subscribers.length; i<l; i++) {
                    if (subscribers[i] === subscriber) {
                        index = i;
                    }
                }

                subscribers.splice(index, 1);
                cache = {};
            }

            __exports__.unsubscribe = unsubscribe;/**
             Resets `Alto.Instrumentation` by flushing list of subscribers.

             @method reset
             @namespace Alto.Instrumentation
             */
            function reset() {
                subscribers.length = 0;
                cache = {};
            }

            __exports__.reset = reset;
        });
    enifed("ember-metal/is_blank",
        ["ember-metal/is_empty","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var isEmpty = __dependency1__["default"];

            /**
             A value is blank if it is empty or a whitespace string.

             ```javascript
             Alto.isBlank();                // true
             Alto.isBlank(null);            // true
             Alto.isBlank(undefined);       // true
             Alto.isBlank('');              // true
             Alto.isBlank([]);              // true
             Alto.isBlank('\n\t');          // true
             Alto.isBlank('  ');            // true
             Alto.isBlank({});              // false
             Alto.isBlank('\n\t Hello');    // false
             Alto.isBlank('Hello world');   // false
             Alto.isBlank([1,2,3]);         // false
             ```

             @method isBlank
             @for Alto
             @param {Object} obj Value to test
             @return {Boolean}
             @since 1.5.0
             */
            __exports__["default"] = function isBlank(obj) {
                return isEmpty(obj) || (typeof obj === 'string' && obj.match(/\S/) === null);
            }
        });
    enifed("ember-metal/is_empty",
        ["ember-metal/property_get","ember-metal/is_none","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var get = __dependency1__.get;
            var isNone = __dependency2__["default"];

            /**
             Verifies that a value is `null` or an empty string, empty array,
             or empty function.

             Constrains the rules on `Alto.isNone` by returning true for empty
             string and empty arrays.

             ```javascript
             Alto.isEmpty();                // true
             Alto.isEmpty(null);            // true
             Alto.isEmpty(undefined);       // true
             Alto.isEmpty('');              // true
             Alto.isEmpty([]);              // true
             Alto.isEmpty({});              // false
             Alto.isEmpty('Adam Hawkins');  // false
             Alto.isEmpty([0,1,2]);         // false
             ```

             @method isEmpty
             @for Alto
             @param {Object} obj Value to test
             @return {Boolean}
             */
            function isEmpty(obj) {
                var none = isNone(obj);
                if (none) {
                    return none;
                }

                if (typeof obj.size === 'number') {
                    return !obj.size;
                }

                var objectType = typeof obj;

                if (objectType === 'object') {
                    var size = get(obj, 'size');
                    if (typeof size === 'number') {
                        return !size;
                    }
                }

                if (typeof obj.length === 'number' && objectType !== 'function') {
                    return !obj.length;
                }

                if (objectType === 'object') {
                    var length = get(obj, 'length');
                    if (typeof length === 'number') {
                        return !length;
                    }
                }

                return false;
            }

            __exports__["default"] = isEmpty;
        });
    enifed("ember-metal/is_none",
        ["exports"],
        function(__exports__) {
            "use strict";
            /**
             Returns true if the passed value is null or undefined. This avoids errors
             from JSLint complaining about use of ==, which can be technically
             confusing.

             ```javascript
             Alto.isNone();              // true
             Alto.isNone(null);          // true
             Alto.isNone(undefined);     // true
             Alto.isNone('');            // false
             Alto.isNone([]);            // false
             Alto.isNone(function() {});  // false
             ```

             @method isNone
             @for Alto
             @param {Object} obj Value to test
             @return {Boolean}
             */
            function isNone(obj) {
                return obj === null || obj === undefined;
            }

            __exports__["default"] = isNone;
        });
    enifed("ember-metal/is_present",
        ["ember-metal/is_blank","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var isBlank = __dependency1__["default"];
            var isPresent;


            /**
             A value is present if it not `isBlank`.

             ```javascript
             Alto.isPresent();                // false
             Alto.isPresent(null);            // false
             Alto.isPresent(undefined);       // false
             Alto.isPresent('');              // false
             Alto.isPresent([]);              // false
             Alto.isPresent('\n\t');          // false
             Alto.isPresent('  ');            // false
             Alto.isPresent({});              // true
             Alto.isPresent('\n\t Hello');    // true
             Alto.isPresent('Hello world');   // true
             Alto.isPresent([1,2,3]);         // true
             ```

             @method isPresent
             @for Alto
             @param {Object} obj Value to test
             @return {Boolean}
             @since 1.7.0
             */
            isPresent = function isPresent(obj) {
                return !isBlank(obj);
            };


            __exports__["default"] = isPresent;
        });
    enifed("ember-metal/keys",
        ["ember-metal/platform","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var canDefineNonEnumerableProperties = __dependency1__.canDefineNonEnumerableProperties;

            /**
             Returns all of the keys defined on an object or hash. This is useful
             when inspecting objects for debugging. On browsers that support it, this
             uses the native `Object.keys` implementation.

             @method keys
             @for Alto
             @param {Object} obj
             @return {Array} Array containing keys of obj
             */
            var keys = Object.keys;

            if (!keys || !canDefineNonEnumerableProperties) {
                // modified from
                // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys
                keys = (function () {
                    var hasOwnProperty = Object.prototype.hasOwnProperty,
                        hasDontEnumBug = !({toString: null}).propertyIsEnumerable('toString'),
                        dontEnums = [
                            'toString',
                            'toLocaleString',
                            'valueOf',
                            'hasOwnProperty',
                            'isPrototypeOf',
                            'propertyIsEnumerable',
                            'constructor'
                        ],
                        dontEnumsLength = dontEnums.length;

                    return function keys(obj) {
                        if (typeof obj !== 'object' && (typeof obj !== 'function' || obj === null)) {
                            throw new TypeError('Object.keys called on non-object');
                        }

                        var result = [];
                        var prop, i;

                        for (prop in obj) {
                            if (prop !== '_super' &&
                                prop.lastIndexOf('__',0) !== 0 &&
                                hasOwnProperty.call(obj, prop)) {
                                result.push(prop);
                            }
                        }

                        if (hasDontEnumBug) {
                            for (i = 0; i < dontEnumsLength; i++) {
                                if (hasOwnProperty.call(obj, dontEnums[i])) {
                                    result.push(dontEnums[i]);
                                }
                            }
                        }
                        return result;
                    };
                }());
            }

            __exports__["default"] = keys;
        });
    enifed("ember-metal/libraries",
        ["ember-metal/enumerable_utils","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            // Provides a way to register library versions with ember.
            var forEach = __dependency1__.forEach;
            var indexOf = __dependency1__.indexOf;

            var libraries = function() {
                var _libraries   = [];
                var coreLibIndex = 0;

                var getLibrary = function(name) {
                    for (var i = 0; i < _libraries.length; i++) {
                        if (_libraries[i].name === name) {
                            return _libraries[i];
                        }
                    }
                };

                _libraries.register = function(name, version) {
                    if (!getLibrary(name)) {
                        _libraries.push({name: name, version: version});
                    }
                };

                _libraries.registerCoreLibrary = function(name, version) {
                    if (!getLibrary(name)) {
                        _libraries.splice(coreLibIndex++, 0, {name: name, version: version});
                    }
                };

                _libraries.deRegister = function(name) {
                    var lib = getLibrary(name);
                    if (lib) _libraries.splice(indexOf(_libraries, lib), 1);
                };

                _libraries.each = function (callback) {
                    forEach(_libraries, function(lib) {
                        callback(lib.name, lib.version);
                    });
                };

                return _libraries;
            }();

            __exports__["default"] = libraries;
        });
    enifed("ember-metal/logger",
        ["ember-metal/core","ember-metal/error","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            var AltoError = __dependency2__["default"];

            function consoleMethod(name) {
                var consoleObj, logToConsole;
                if (Alto.imports.console) {
                    consoleObj = Alto.imports.console;
                } else if (typeof console !== 'undefined') {
                    consoleObj = console;
                }

                var method = typeof consoleObj === 'object' ? consoleObj[name] : null;

                if (method) {
                    // Older IE doesn't support bind, but Chrome needs it
                    if (typeof method.bind === 'function') {
                        logToConsole = method.bind(consoleObj);
                        logToConsole.displayName = 'console.' + name;
                        return logToConsole;
                    } else if (typeof method.apply === 'function') {
                        logToConsole = function() {
                            method.apply(consoleObj, arguments);
                        };
                        logToConsole.displayName = 'console.' + name;
                        return logToConsole;
                    } else {
                        return function() {
                            var message = Array.prototype.join.call(arguments, ', ');
                            method(message);
                        };
                    }
                }
            }

            function assertPolyfill(test, message) {
                if (!test) {
                    try {
                        // attempt to preserve the stack
                        throw new AltoError("assertion failed: " + message);
                    } catch(error) {
                        setTimeout(function() {
                            throw error;
                        }, 0);
                    }
                }
            }

            /**
             Inside Alto-Metal, simply uses the methods from `imports.console`.
             Override this to provide more robust logging functionality.

             @class Logger
             @namespace Alto
             */
            __exports__["default"] = {
                /**
                 Logs the arguments to the console.
                 You can pass as many arguments as you want and they will be joined together with a space.

                 ```javascript
                 var foo = 1;
                 Alto.Logger.log('log value of foo:', foo);
                 // "log value of foo: 1" will be printed to the console
                 ```

                 @method log
                 @for Alto.Logger
                 @param {*} arguments
                 */
                log:   consoleMethod('log')   || Alto.K,

                /**
                 Prints the arguments to the console with a warning icon.
                 You can pass as many arguments as you want and they will be joined together with a space.

                 ```javascript
                 Alto.Logger.warn('Something happened!');
                 // "Something happened!" will be printed to the console with a warning icon.
                 ```

                 @method warn
                 @for Alto.Logger
                 @param {*} arguments
                 */
                warn:  consoleMethod('warn')  || Alto.K,

                /**
                 Prints the arguments to the console with an error icon, red text and a stack trace.
                 You can pass as many arguments as you want and they will be joined together with a space.

                 ```javascript
                 Alto.Logger.error('Danger! Danger!');
                 // "Danger! Danger!" will be printed to the console in red text.
                 ```

                 @method error
                 @for Alto.Logger
                 @param {*} arguments
                 */
                error: consoleMethod('error') || Alto.K,

                /**
                 Logs the arguments to the console.
                 You can pass as many arguments as you want and they will be joined together with a space.

                 ```javascript
                 var foo = 1;
                 Alto.Logger.info('log value of foo:', foo);
                 // "log value of foo: 1" will be printed to the console
                 ```

                 @method info
                 @for Alto.Logger
                 @param {*} arguments
                 */
                info:  consoleMethod('info')  || Alto.K,

                /**
                 Logs the arguments to the console in blue text.
                 You can pass as many arguments as you want and they will be joined together with a space.

                 ```javascript
                 var foo = 1;
                 Alto.Logger.debug('log value of foo:', foo);
                 // "log value of foo: 1" will be printed to the console
                 ```

                 @method debug
                 @for Alto.Logger
                 @param {*} arguments
                 */
                debug: consoleMethod('debug') || consoleMethod('info') || Alto.K,

                /**
                 If the value passed into `Alto.Logger.assert` is not truthy it will throw an error with a stack trace.

                 ```javascript
                 Alto.Logger.assert(true); // undefined
                 Alto.Logger.assert(true === false); // Throws an Assertion failed error.
                 ```

                 @method assert
                 @for Alto.Logger
                 @param {Boolean} bool Value to test
                 */
                assert: consoleMethod('assert') || assertPolyfill
            };
        });
    enifed("ember-metal/map",
        ["ember-metal/utils","ember-metal/array","ember-metal/platform","ember-metal/deprecate_property","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            /**
             @module ember-metal
             */

            /*
             JavaScript (before ES6) does not have a Map implementation. Objects,
             which are often used as dictionaries, may only have Strings as keys.

             Because Alto has a way to get a unique identifier for every object
             via `Alto.guidFor`, we can implement a performant Map with arbitrary
             keys. Because it is commonly used in low-level bookkeeping, Map is
             implemented as a pure JavaScript object for performance.

             This implementation follows the current iteration of the ES6 proposal for
             maps (http://wiki.ecmascript.org/doku.php?id=harmony:simple_maps_and_sets),
             with one exception:  as we do not have the luxury of in-VM iteration, we implement a
             forEach method for iteration.

             Map is mocked out to look like an Alto object, so you can do
             `Alto.Map.create()` for symmetry with other Alto classes.
             */

            var guidFor = __dependency1__.guidFor;
            var indexOf = __dependency2__.indexOf;
            var create = __dependency3__.create;
            var deprecateProperty = __dependency4__.deprecateProperty;

            function missingFunction(fn) {
                throw new TypeError('' + Object.prototype.toString.call(fn) + " is not a function");
            }

            function missingNew(name) {
                throw new TypeError("Constructor " + name + "requires 'new'");
            }

            function copyNull(obj) {
                var output = create(null);

                for (var prop in obj) {
                    // hasOwnPropery is not needed because obj is Object.create(null);
                    output[prop] = obj[prop];
                }

                return output;
            }

            function copyMap(original, newObject) {
                var keys = original.keys.copy();
                var values = copyNull(original.values);

                newObject.keys = keys;
                newObject.values = values;
                newObject.size = original.size;

                return newObject;
            }

            /**
             This class is used internally by Alto and Alto Data.
             Please do not use it at this time. We plan to clean it up
             and add many tests soon.

             @class OrderedSet
             @namespace Alto
             @constructor
             @private
             */
            function OrderedSet() {

                if (this instanceof OrderedSet) {
                    this.clear();
                    this._silenceRemoveDeprecation = false;
                } else {
                    missingNew("OrderedSet");
                }
            }

            /**
             @method create
             @static
             @return {Alto.OrderedSet}
             */
            OrderedSet.create = function() {
                var Constructor = this;

                return new Constructor();
            };

            OrderedSet.prototype = {
                constructor: OrderedSet,
                /**
                 @method clear
                 */
                clear: function() {
                    this.presenceSet = create(null);
                    this.list = [];
                    this.size = 0;
                },

                /**
                 @method add
                 @param obj
                 @param guid (optional, and for internal use)
                 @return {Alto.OrderedSet}
                 */
                add: function(obj, _guid) {
                    var guid = _guid || guidFor(obj);
                    var presenceSet = this.presenceSet;
                    var list = this.list;

                    if (presenceSet[guid] === true) {
                        return;
                    }

                    presenceSet[guid] = true;
                    this.size = list.push(obj);

                    return this;
                },

                /**
                 @deprecated

                 @method remove
                 @param obj
                 @param _guid (optional and for internal use only)
                 @return {Boolean}
                 */
                remove: function(obj, _guid) {
                    Alto.deprecate('Calling `OrderedSet.prototype.remove` has been deprecated, please use `OrderedSet.prototype.delete` instead.', this._silenceRemoveDeprecation);

                    return this["delete"](obj, _guid);
                },

                /**
                 @method delete
                 @param obj
                 @param _guid (optional and for internal use only)
                 @return {Boolean}
                 */
                "delete": function(obj, _guid) {
                    var guid = _guid || guidFor(obj);
                    var presenceSet = this.presenceSet;
                    var list = this.list;

                    if (presenceSet[guid] === true) {
                        delete presenceSet[guid];
                        var index = indexOf.call(list, obj);
                        if (index > -1) {
                            list.splice(index, 1);
                        }
                        this.size = list.length;
                        return true;
                    } else {
                        return false;
                    }
                },

                /**
                 @method isEmpty
                 @return {Boolean}
                 */
                isEmpty: function() {
                    return this.size === 0;
                },

                /**
                 @method has
                 @param obj
                 @return {Boolean}
                 */
                has: function(obj) {
                    if (this.size === 0) { return false; }

                    var guid = guidFor(obj);
                    var presenceSet = this.presenceSet;

                    return presenceSet[guid] === true;
                },

                /**
                 @method forEach
                 @param {Function} fn
                 @param self
                 */
                forEach: function(fn /*, thisArg*/) {
                    if (typeof fn !== 'function') {
                        missingFunction(fn);
                    }

                    if (this.size === 0) { return; }

                    var list = this.list;
                    var length = arguments.length;
                    var i;

                    if (length === 2) {
                        for (i = 0; i < list.length; i++) {
                            fn.call(arguments[1], list[i]);
                        }
                    } else {
                        for (i = 0; i < list.length; i++) {
                            fn(list[i]);
                        }
                    }
                },

                /**
                 @method toArray
                 @return {Array}
                 */
                toArray: function() {
                    return this.list.slice();
                },

                /**
                 @method copy
                 @return {Alto.OrderedSet}
                 */
                copy: function() {
                    var Constructor = this.constructor;
                    var set = new Constructor();

                    set._silenceRemoveDeprecation = this._silenceRemoveDeprecation;
                    set.presenceSet = copyNull(this.presenceSet);
                    set.list = this.toArray();
                    set.size = this.size;

                    return set;
                }
            };

            deprecateProperty(OrderedSet.prototype, 'length', 'size');

            /**
             A Map stores values indexed by keys. Unlike JavaScript's
             default Objects, the keys of a Map can be any JavaScript
             object.

             Internally, a Map has two data structures:

             1. `keys`: an OrderedSet of all of the existing keys
             2. `values`: a JavaScript Object indexed by the `Alto.guidFor(key)`

             When a key/value pair is added for the first time, we
             add the key to the `keys` OrderedSet, and create or
             replace an entry in `values`. When an entry is deleted,
             we delete its entry in `keys` and `values`.

             @class Map
             @namespace Alto
             @private
             @constructor
             */
            function Map() {
                if (this instanceof this.constructor) {
                    this.keys = OrderedSet.create();
                    this.keys._silenceRemoveDeprecation = true;
                    this.values = create(null);
                    this.size = 0;
                } else {
                    missingNew("OrderedSet");
                }
            }

            Alto.Map = Map;

            /**
             @method create
             @static
             */
            Map.create = function() {
                var Constructor = this;
                return new Constructor();
            };

            Map.prototype = {
                constructor: Map,

                /**
                 This property will change as the number of objects in the map changes.

                 @property size
                 @type number
                 @default 0
                 */
                size: 0,

                /**
                 Retrieve the value associated with a given key.

                 @method get
                 @param {*} key
                 @return {*} the value associated with the key, or `undefined`
                 */
                get: function(key) {
                    if (this.size === 0) { return; }

                    var values = this.values;
                    var guid = guidFor(key);

                    return values[guid];
                },

                /**
                 Adds a value to the map. If a value for the given key has already been
                 provided, the new value will replace the old value.

                 @method set
                 @param {*} key
                 @param {*} value
                 @return {Alto.Map}
                 */
                set: function(key, value) {
                    var keys = this.keys;
                    var values = this.values;
                    var guid = guidFor(key);

                    // ensure we don't store -0
                    var k = key === -0 ? 0 : key;

                    keys.add(k, guid);

                    values[guid] = value;

                    this.size = keys.size;

                    return this;
                },

                /**
                 @deprecated see delete
                 Removes a value from the map for an associated key.

                 @method remove
                 @param {*} key
                 @return {Boolean} true if an item was removed, false otherwise
                 */
                remove: function(key) {
                    Alto.deprecate('Calling `Map.prototype.remove` has been deprecated, please use `Map.prototype.delete` instead.');

                    return this["delete"](key);
                },

                /**
                 Removes a value from the map for an associated key.

                 @method delete
                 @param {*} key
                 @return {Boolean} true if an item was removed, false otherwise
                 */
                "delete": function(key) {
                    if (this.size === 0) { return false; }
                    // don't use ES6 "delete" because it will be annoying
                    // to use in browsers that are not ES6 friendly;
                    var keys = this.keys;
                    var values = this.values;
                    var guid = guidFor(key);

                    if (keys["delete"](key, guid)) {
                        delete values[guid];
                        this.size = keys.size;
                        return true;
                    } else {
                        return false;
                    }
                },

                /**
                 Check whether a key is present.

                 @method has
                 @param {*} key
                 @return {Boolean} true if the item was present, false otherwise
                 */
                has: function(key) {
                    return this.keys.has(key);
                },

                /**
                 Iterate over all the keys and values. Calls the function once
                 for each key, passing in value, key, and the map being iterated over,
                 in that order.

                 The keys are guaranteed to be iterated over in insertion order.

                 @method forEach
                 @param {Function} callback
                 @param {*} self if passed, the `this` value inside the
                 callback. By default, `this` is the map.
                 */
                forEach: function(callback /*, thisArg*/) {
                    if (typeof callback !== 'function') {
                        missingFunction(callback);
                    }

                    if (this.size === 0) { return; }

                    var length = arguments.length;
                    var map = this;
                    var cb, thisArg;

                    if (length === 2) {
                        thisArg = arguments[1];
                        cb = function(key) {
                            callback.call(thisArg, map.get(key), key, map);
                        };
                    } else {
                        cb = function(key) {
                            callback(map.get(key), key, map);
                        };
                    }

                    this.keys.forEach(cb);
                },

                /**
                 @method clear
                 */
                clear: function() {
                    this.keys.clear();
                    this.values = create(null);
                    this.size = 0;
                },

                /**
                 @method copy
                 @return {Alto.Map}
                 */
                copy: function() {
                    return copyMap(this, new Map());
                }
            };

            deprecateProperty(Map.prototype, 'length', 'size');

            /**
             @class MapWithDefault
             @namespace Alto
             @extends Alto.Map
             @private
             @constructor
             @param [options]
             @param {*} [options.defaultValue]
             */
            function MapWithDefault(options) {
                this._super$constructor();
                this.defaultValue = options.defaultValue;
            }

            /**
             @method create
             @static
             @param [options]
             @param {*} [options.defaultValue]
             @return {Alto.MapWithDefault|Alto.Map} If options are passed, returns
             `Alto.MapWithDefault` otherwise returns `Alto.Map`
             */
            MapWithDefault.create = function(options) {
                if (options) {
                    return new MapWithDefault(options);
                } else {
                    return new Map();
                }
            };

            MapWithDefault.prototype = create(Map.prototype);
            MapWithDefault.prototype.constructor = MapWithDefault;
            MapWithDefault.prototype._super$constructor = Map;
            MapWithDefault.prototype._super$get = Map.prototype.get;

            /**
             Retrieve the value associated with a given key.

             @method get
             @param {*} key
             @return {*} the value associated with the key, or the default value
             */
            MapWithDefault.prototype.get = function(key) {
                var hasValue = this.has(key);

                if (hasValue) {
                    return this._super$get(key);
                } else {
                    var defaultValue = this.defaultValue(key);
                    this.set(key, defaultValue);
                    return defaultValue;
                }
            };

            /**
             @method copy
             @return {Alto.MapWithDefault}
             */
            MapWithDefault.prototype.copy = function() {
                var Constructor = this.constructor;
                return copyMap(this, new Constructor({
                    defaultValue: this.defaultValue
                }));
            };

            __exports__["default"] = Map;

            __exports__.OrderedSet = OrderedSet;
            __exports__.Map = Map;
            __exports__.MapWithDefault = MapWithDefault;
        });
    enifed("ember-metal/merge",
        ["ember-metal/keys","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var keys = __dependency1__["default"];

            /**
             Merge the contents of two objects together into the first object.

             ```javascript
             Alto.merge({first: 'Tom'}, {last: 'Dale'}); // {first: 'Tom', last: 'Dale'}
             var a = {first: 'Yehuda'}, b = {last: 'Katz'};
             Alto.merge(a, b); // a == {first: 'Yehuda', last: 'Katz'}, b == {last: 'Katz'}
             ```

             @method merge
             @for Alto
             @param {Object} original The object to merge into
             @param {Object} updates The object to copy properties from
             @return {Object}
             */
            __exports__["default"] = function merge(original, updates) {
                if (!updates || typeof updates !== 'object') {
                    return original;
                }

                var props = keys(updates);
                var prop;
                var length = props.length;

                for (var i = 0; i < length; i++) {
                    prop = props[i];
                    original[prop] = updates[prop];
                }

                return original;
            }
        });
    enifed("ember-metal/mixin",
        ["ember-metal/core","ember-metal/merge","ember-metal/array","ember-metal/platform","ember-metal/property_get","ember-metal/property_set","ember-metal/utils","ember-metal/expand_properties","ember-metal/properties","ember-metal/computed","ember-metal/binding","ember-metal/observer","ember-metal/events","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __dependency11__, __dependency12__, __dependency13__, __exports__) {
            // Remove "use strict"; from transpiled module until
            // https://bugs.webkit.org/show_bug.cgi?id=138038 is fixed
            //
            // REMOVE_USE_STRICT: true

            /**
             @module ember
             @submodule ember-metal
             */

            var Alto = __dependency1__["default"];
            // warn, assert, wrap, et;
            var merge = __dependency2__["default"];
            var a_indexOf = __dependency3__.indexOf;
            var a_forEach = __dependency3__.forEach;
            var o_create = __dependency4__.create;
            var get = __dependency5__.get;
            var set = __dependency6__.set;
            var trySet = __dependency6__.trySet;
            var guidFor = __dependency7__.guidFor;
            var metaFor = __dependency7__.meta;
            var wrap = __dependency7__.wrap;
            var makeArray = __dependency7__.makeArray;
            var apply = __dependency7__.apply;
            var isArray = __dependency7__.isArray;
            var expandProperties = __dependency8__["default"];
            var Descriptor = __dependency9__.Descriptor;
            var defineProperty = __dependency9__.defineProperty;
            var ComputedProperty = __dependency10__.ComputedProperty;
            var Binding = __dependency11__.Binding;
            var addObserver = __dependency12__.addObserver;
            var removeObserver = __dependency12__.removeObserver;
            var addBeforeObserver = __dependency12__.addBeforeObserver;
            var removeBeforeObserver = __dependency12__.removeBeforeObserver;
            var _suspendObserver = __dependency12__._suspendObserver;
            var addListener = __dependency13__.addListener;
            var removeListener = __dependency13__.removeListener;

            var REQUIRED;
            var a_slice = [].slice;

            function superFunction(){
                var func = this.__nextSuper;
                var ret;
                if (func) {
                    var args = new Array(arguments.length);
                    for (var i = 0, l = args.length; i < l; i++) {
                        args[i] = arguments[i];
                    }
                    this.__nextSuper = null;
                    ret = apply(this, func, args);
                    this.__nextSuper = func;
                }
                return ret;
            }

            function mixinsMeta(obj) {
                var m = metaFor(obj, true);
                var ret = m.mixins;
                if (!ret) {
                    ret = m.mixins = {};
                } else if (!m.hasOwnProperty('mixins')) {
                    ret = m.mixins = o_create(ret);
                }
                return ret;
            }

            function isMethod(obj) {
                return 'function' === typeof obj &&
                    obj.isMethod !== false &&
                    obj !== Boolean &&
                    obj !== Object &&
                    obj !== Number &&
                    obj !== Array &&
                    obj !== Date &&
                    obj !== String;
            }

            var CONTINUE = {};

            function mixinProperties(mixinsMeta, mixin) {
                var guid;

                if (mixin instanceof Mixin) {
                    guid = guidFor(mixin);
                    if (mixinsMeta[guid]) { return CONTINUE; }
                    mixinsMeta[guid] = mixin;
                    return mixin.properties;
                } else {
                    return mixin; // apply anonymous mixin properties
                }
            }

            function concatenatedMixinProperties(concatProp, props, values, base) {
                var concats;

                // reset before adding each new mixin to pickup concats from previous
                concats = values[concatProp] || base[concatProp];
                if (props[concatProp]) {
                    concats = concats ? concats.concat(props[concatProp]) : props[concatProp];
                }

                return concats;
            }

            function giveDescriptorSuper(meta, key, property, values, descs) {
                var superProperty;

                // Computed properties override methods, and do not call super to them
                if (values[key] === undefined) {
                    // Find the original descriptor in a parent mixin
                    superProperty = descs[key];
                }

                // If we didn't find the original descriptor in a parent mixin, find
                // it on the original object.
                superProperty = superProperty || meta.descs[key];

                if (superProperty === undefined || !(superProperty instanceof ComputedProperty)) {
                    return property;
                }

                // Since multiple mixins may inherit from the same parent, we need
                // to clone the computed property so that other mixins do not receive
                // the wrapped version.
                property = o_create(property);
                property.func = wrap(property.func, superProperty.func);

                return property;
            }

            var sourceAvailable = (function() {
                    return this;
                }).toString().indexOf('return this;') > -1;

            function giveMethodSuper(obj, key, method, values, descs) {
                var superMethod;

                // Methods overwrite computed properties, and do not call super to them.
                if (descs[key] === undefined) {
                    // Find the original method in a parent mixin
                    superMethod = values[key];
                }

                // If we didn't find the original value in a parent mixin, find it in
                // the original object
                superMethod = superMethod || obj[key];

                // Only wrap the new method if the original method was a function
                if (superMethod === undefined || 'function' !== typeof superMethod) {
                    return method;
                }

                var hasSuper;
                if (sourceAvailable) {
                    hasSuper = method.__hasSuper;

                    if (hasSuper === undefined) {
                        hasSuper = method.toString().indexOf('_super') > -1;
                        method.__hasSuper = hasSuper;
                    }
                }

                if (sourceAvailable === false || hasSuper) {
                    return wrap(method, superMethod);
                } else {
                    return method;
                }
            }

            function applyConcatenatedProperties(obj, key, value, values) {
                var baseValue = values[key] || obj[key];

                if (baseValue) {
                    if ('function' === typeof baseValue.concat) {
                        if (value === null || value === undefined) {
                            return baseValue;
                        } else {
                            return baseValue.concat(value);
                        }
                    } else {
                        return makeArray(baseValue).concat(value);
                    }
                } else {
                    return makeArray(value);
                }
            }

            function applyMergedProperties(obj, key, value, values) {
                var baseValue = values[key] || obj[key];

                Alto.assert("You passed in `" + JSON.stringify(value) + "` as the value for `" + key +
                    "` but `" + key + "` cannot be an Array", !isArray(value));

                if (!baseValue) { return value; }

                var newBase = merge({}, baseValue);
                var hasFunction = false;

                for (var prop in value) {
                    if (!value.hasOwnProperty(prop)) { continue; }

                    var propValue = value[prop];
                    if (isMethod(propValue)) {
                        // TODO: support for Computed Properties, etc?
                        hasFunction = true;
                        newBase[prop] = giveMethodSuper(obj, prop, propValue, baseValue, {});
                    } else {
                        newBase[prop] = propValue;
                    }
                }

                if (hasFunction) {
                    newBase._super = superFunction;
                }

                return newBase;
            }

            function addNormalizedProperty(base, key, value, meta, descs, values, concats, mergings) {
                if (value instanceof Descriptor) {
                    if (value === REQUIRED && descs[key]) { return CONTINUE; }

                    // Wrap descriptor function to implement
                    // __nextSuper() if needed
                    if (value.func) {
                        value = giveDescriptorSuper(meta, key, value, values, descs);
                    }

                    descs[key]  = value;
                    values[key] = undefined;
                } else {
                    if ((concats && a_indexOf.call(concats, key) >= 0) ||
                        key === 'concatenatedProperties' ||
                        key === 'mergedProperties') {
                        value = applyConcatenatedProperties(base, key, value, values);
                    } else if ((mergings && a_indexOf.call(mergings, key) >= 0)) {
                        value = applyMergedProperties(base, key, value, values);
                    } else if (isMethod(value)) {
                        value = giveMethodSuper(base, key, value, values, descs);
                    }

                    descs[key] = undefined;
                    values[key] = value;
                }
            }

            function mergeMixins(mixins, m, descs, values, base, keys) {
                var mixin, props, key, concats, mergings, meta;

                function removeKeys(keyName) {
                    delete descs[keyName];
                    delete values[keyName];
                }

                for(var i=0, l=mixins.length; i<l; i++) {
                    mixin = mixins[i];
                    Alto.assert('Expected hash or Mixin instance, got ' + Object.prototype.toString.call(mixin),
                        typeof mixin === 'object' && mixin !== null && Object.prototype.toString.call(mixin) !== '[object Array]');

                    props = mixinProperties(m, mixin);
                    if (props === CONTINUE) { continue; }

                    if (props) {
                        meta = metaFor(base);
                        if (base.willMergeMixin) { base.willMergeMixin(props); }
                        concats = concatenatedMixinProperties('concatenatedProperties', props, values, base);
                        mergings = concatenatedMixinProperties('mergedProperties', props, values, base);

                        for (key in props) {
                            if (!props.hasOwnProperty(key)) { continue; }
                            keys.push(key);
                            addNormalizedProperty(base, key, props[key], meta, descs, values, concats, mergings);
                        }

                        // manually copy toString() because some JS engines do not enumerate it
                        if (props.hasOwnProperty('toString')) { base.toString = props.toString; }
                    } else if (mixin.mixins) {
                        mergeMixins(mixin.mixins, m, descs, values, base, keys);
                        if (mixin._without) { a_forEach.call(mixin._without, removeKeys); }
                    }
                }
            }

            var IS_BINDING = /^.+Binding$/;

            function detectBinding(obj, key, value, m) {
                if (IS_BINDING.test(key)) {
                    var bindings = m.bindings;
                    if (!bindings) {
                        bindings = m.bindings = {};
                    } else if (!m.hasOwnProperty('bindings')) {
                        bindings = m.bindings = o_create(m.bindings);
                    }
                    bindings[key] = value;
                }
            }

            function connectStreamBinding(obj, key, stream) {
                var onNotify = function(stream) {
                    _suspendObserver(obj, key, null, didChange, function() {
                        trySet(obj, key, stream.value());
                    });
                };

                var didChange = function() {
                    stream.setValue(get(obj, key), onNotify);
                };

                // Initialize value
                set(obj, key, stream.value());

                addObserver(obj, key, null, didChange);

                stream.subscribe(onNotify);

                if (obj._streamBindingSubscriptions === undefined) {
                    obj._streamBindingSubscriptions = o_create(null);
                }

                obj._streamBindingSubscriptions[key] = onNotify;
            }

            function connectBindings(obj, m) {
                // TODO Mixin.apply(instance) should disconnect binding if exists
                var bindings = m.bindings;
                var key, binding, to;
                if (bindings) {
                    for (key in bindings) {
                        binding = bindings[key];
                        if (binding) {
                            to = key.slice(0, -7); // strip Binding off end
                            if (binding.isStream) {
                                connectStreamBinding(obj, to, binding);
                                continue;
                            } else if (binding instanceof Binding) {
                                binding = binding.copy(); // copy prototypes' instance
                                binding.to(to);
                            } else { // binding is string path
                                binding = new Binding(to, binding);
                            }
                            binding.connect(obj);
                            obj[key] = binding;
                        }
                    }
                    // mark as applied
                    m.bindings = {};
                }
            }

            function finishPartial(obj, m) {
                connectBindings(obj, m || metaFor(obj));
                return obj;
            }

            function followAlias(obj, desc, m, descs, values) {
                var altKey = desc.methodName;
                var value;
                if (descs[altKey] || values[altKey]) {
                    value = values[altKey];
                    desc  = descs[altKey];
                } else if (m.descs[altKey]) {
                    desc  = m.descs[altKey];
                    value = undefined;
                } else {
                    desc = undefined;
                    value = obj[altKey];
                }

                return { desc: desc, value: value };
            }

            function updateObserversAndListeners(obj, key, observerOrListener, pathsKey, updateMethod) {
                var paths = observerOrListener[pathsKey];

                if (paths) {
                    for (var i=0, l=paths.length; i<l; i++) {
                        updateMethod(obj, paths[i], null, key);
                    }
                }
            }

            function replaceObserversAndListeners(obj, key, observerOrListener) {
                var prev = obj[key];

                if ('function' === typeof prev) {
                    updateObserversAndListeners(obj, key, prev, '__alto_observesBefore__', removeBeforeObserver);
                    updateObserversAndListeners(obj, key, prev, '__alto_observes__', removeObserver);
                    updateObserversAndListeners(obj, key, prev, '__alto_listens__', removeListener);
                }

                if ('function' === typeof observerOrListener) {
                    updateObserversAndListeners(obj, key, observerOrListener, '__alto_observesBefore__', addBeforeObserver);
                    updateObserversAndListeners(obj, key, observerOrListener, '__alto_observes__', addObserver);
                    updateObserversAndListeners(obj, key, observerOrListener, '__alto_listens__', addListener);
                }
            }

            function applyMixin(obj, mixins, partial) {
                var descs = {};
                var values = {};
                var m = metaFor(obj);
                var keys = [];
                var key, value, desc;

                obj._super = superFunction;

                // Go through all mixins and hashes passed in, and:
                //
                // * Handle concatenated properties
                // * Handle merged properties
                // * Set up _super wrapping if necessary
                // * Set up computed property descriptors
                // * Copying `toString` in broken browsers
                mergeMixins(mixins, mixinsMeta(obj), descs, values, obj, keys);

                for(var i = 0, l = keys.length; i < l; i++) {
                    key = keys[i];
                    if (key === 'constructor' || !values.hasOwnProperty(key)) { continue; }

                    desc = descs[key];
                    value = values[key];

                    if (desc === REQUIRED) { continue; }

                    while (desc && desc instanceof Alias) {
                        var followed = followAlias(obj, desc, m, descs, values);
                        desc = followed.desc;
                        value = followed.value;
                    }

                    if (desc === undefined && value === undefined) { continue; }

                    replaceObserversAndListeners(obj, key, value);
                    detectBinding(obj, key, value, m);
                    defineProperty(obj, key, desc, value, m);
                }

                if (!partial) { // don't apply to prototype
                    finishPartial(obj, m);
                }

                return obj;
            }

            /**
             @method mixin
             @for Alto
             @param obj
             @param mixins*
             @return obj
             */
            function mixin(obj) {
                var args = a_slice.call(arguments, 1);
                applyMixin(obj, args, false);
                return obj;
            }

            __exports__.mixin = mixin;/**
             The `Alto.Mixin` class allows you to create mixins, whose properties can be
             added to other classes. For instance,

             ```javascript
             App.Editable = Alto.Mixin.create({
        edit: function() {
          console.log('starting to edit');
          this.set('isEditing', true);
        },
        isEditing: false
      });

             // Mix mixins into classes by passing them as the first arguments to
             // .extend.
             App.CommentView = Alto.View.extend(App.Editable, {
        template: Alto.Handlebars.compile('{{#if view.isEditing}}...{{else}}...{{/if}}')
      });

             commentView = App.CommentView.create();
             commentView.edit(); // outputs 'starting to edit'
             ```

             Note that Mixins are created with `Alto.Mixin.create`, not
             `Alto.Mixin.extend`.

             Note that mixins extend a constructor's prototype so arrays and object literals
             defined as properties will be shared amongst objects that implement the mixin.
             If you want to define a property in a mixin that is not shared, you can define
             it either as a computed property or have it be created on initialization of the object.

             ```javascript
             //filters array will be shared amongst any object implementing mixin
             App.Filterable = Alto.Mixin.create({
        filters: Alto.A()
      });

             //filters will be a separate  array for every object implementing the mixin
             App.Filterable = Alto.Mixin.create({
        filters: Alto.computed(function(){return Alto.A();})
      });

             //filters will be created as a separate array during the object's initialization
             App.Filterable = Alto.Mixin.create({
        init: function() {
          this._super();
          this.set("filters", Alto.A());
        }
      });
             ```

             @class Mixin
             @namespace Alto
             */
            __exports__["default"] = Mixin;
            function Mixin(args, properties) {
                this.properties = properties;

                var length = args && args.length;

                if (length > 0) {
                    var m = new Array(length);

                    for (var i = 0; i < length; i++) {
                        var x = args[i];
                        if (x instanceof Mixin) {
                            m[i] = x;
                        } else {
                            m[i] = new Mixin(undefined, x);
                        }
                    }

                    this.mixins = m;
                } else {
                    this.mixins = undefined;
                }
                this.ownerConstructor = undefined;
            }

            Mixin._apply = applyMixin;

            Mixin.applyPartial = function(obj) {
                var args = a_slice.call(arguments, 1);
                return applyMixin(obj, args, true);
            };

            Mixin.finishPartial = finishPartial;

            // ES6TODO: this relies on a global state?
            Alto.anyUnprocessedMixins = false;

            /**
             @method create
             @static
             @param arguments*
             */
            Mixin.create = function() {
                // ES6TODO: this relies on a global state?
                Alto.anyUnprocessedMixins = true;
                var M = this;
                var length = arguments.length;
                var args = new Array(length);
                for (var i = 0; i < length; i++) {
                    args[i] = arguments[i];
                }
                return new M(args, undefined);
            };

            var MixinPrototype = Mixin.prototype;

            /**
             @method reopen
             @param arguments*
             */
            MixinPrototype.reopen = function() {
                var mixin;

                if (this.properties) {
                    mixin = new Mixin(undefined, this.properties);
                    this.properties = undefined;
                    this.mixins = [mixin];
                } else if (!this.mixins) {
                    this.mixins = [];
                }

                var len = arguments.length;
                var mixins = this.mixins;
                var idx;

                for(idx=0; idx < len; idx++) {
                    mixin = arguments[idx];
                    Alto.assert('Expected hash or Mixin instance, got ' + Object.prototype.toString.call(mixin),
                        typeof mixin === 'object' && mixin !== null &&
                        Object.prototype.toString.call(mixin) !== '[object Array]');

                    if (mixin instanceof Mixin) {
                        mixins.push(mixin);
                    } else {
                        mixins.push(new Mixin(undefined, mixin));
                    }
                }

                return this;
            };

            /**
             @method apply
             @param obj
             @return applied object
             */
            MixinPrototype.apply = function(obj) {
                return applyMixin(obj, [this], false);
            };

            MixinPrototype.applyPartial = function(obj) {
                return applyMixin(obj, [this], true);
            };

            function _detect(curMixin, targetMixin, seen) {
                var guid = guidFor(curMixin);

                if (seen[guid]) { return false; }
                seen[guid] = true;

                if (curMixin === targetMixin) { return true; }
                var mixins = curMixin.mixins;
                var loc = mixins ? mixins.length : 0;
                while (--loc >= 0) {
                    if (_detect(mixins[loc], targetMixin, seen)) { return true; }
                }
                return false;
            }

            /**
             @method detect
             @param obj
             @return {Boolean}
             */
            MixinPrototype.detect = function(obj) {
                if (!obj) { return false; }
                if (obj instanceof Mixin) { return _detect(obj, this, {}); }
                var m = obj['__alto_meta__'];
                var mixins = m && m.mixins;
                if (mixins) {
                    return !!mixins[guidFor(this)];
                }
                return false;
            };

            MixinPrototype.without = function() {
                var ret = new Mixin([this]);
                ret._without = a_slice.call(arguments);
                return ret;
            };

            function _keys(ret, mixin, seen) {
                if (seen[guidFor(mixin)]) { return; }
                seen[guidFor(mixin)] = true;

                if (mixin.properties) {
                    var props = mixin.properties;
                    for (var key in props) {
                        if (props.hasOwnProperty(key)) { ret[key] = true; }
                    }
                } else if (mixin.mixins) {
                    a_forEach.call(mixin.mixins, function(x) { _keys(ret, x, seen); });
                }
            }

            MixinPrototype.keys = function() {
                var keys = {};
                var seen = {};
                var ret = [];
                _keys(keys, this, seen);
                for(var key in keys) {
                    if (keys.hasOwnProperty(key)) {
                        ret.push(key);
                    }
                }
                return ret;
            };

            // returns the mixins currently applied to the specified object
            // TODO: Make Alto.mixin
            Mixin.mixins = function(obj) {
                var m = obj['__alto_meta__'];
                var mixins = m && m.mixins;
                var ret = [];

                if (!mixins) { return ret; }

                for (var key in mixins) {
                    var mixin = mixins[key];

                    // skip primitive mixins since these are always anonymous
                    if (!mixin.properties) { ret.push(mixin); }
                }

                return ret;
            };

            REQUIRED = new Descriptor();
            REQUIRED.toString = function() { return '(Required Property)'; };

            /**
             Denotes a required property for a mixin

             @method required
             @for Alto
             */
            function required() {
                return REQUIRED;
            }

            __exports__.required = required;function Alias(methodName) {
                this.methodName = methodName;
            }

            Alias.prototype = new Descriptor();

            /**
             Makes a method available via an additional name.

             ```javascript
             App.Person = Alto.Object.extend({
        name: function() {
          return 'Tomhuda Katzdale';
        },
        moniker: Alto.aliasMethod('name')
      });

             var goodGuy = App.Person.create();

             goodGuy.name();    // 'Tomhuda Katzdale'
             goodGuy.moniker(); // 'Tomhuda Katzdale'
             ```

             @method aliasMethod
             @for Alto
             @param {String} methodName name of the method to alias
             @return {Alto.Descriptor}
             */
            function aliasMethod(methodName) {
                return new Alias(methodName);
            }

            __exports__.aliasMethod = aliasMethod;// ..........................................................
            // OBSERVER HELPER
            //

            /**
             Specify a method that observes property changes.

             ```javascript
             Alto.Object.extend({
        valueObserver: Alto.observer('value', function() {
          // Executes whenever the "value" property changes
        })
      });
             ```

             In the future this method may become asynchronous. If you want to ensure
             synchronous behavior, use `immediateObserver`.

             Also available as `Function.prototype.observes` if prototype extensions are
             enabled.

             @method observer
             @for Alto
             @param {String} propertyNames*
             @param {Function} func
             @return func
             */
            function observer() {
                var func  = a_slice.call(arguments, -1)[0];
                var paths;

                var addWatchedProperty = function (path) { paths.push(path); };
                var _paths = a_slice.call(arguments, 0, -1);

                if (typeof func !== "function") {
                    // revert to old, soft-deprecated argument ordering

                    func  = arguments[0];
                    _paths = a_slice.call(arguments, 1);
                }

                paths = [];

                for (var i=0; i<_paths.length; ++i) {
                    expandProperties(_paths[i], addWatchedProperty);
                }

                if (typeof func !== "function") {
                    throw new Alto.Error("Alto.observer called without a function");
                }

                func.__alto_observes__ = paths;
                return func;
            }

            __exports__.observer = observer;/**
             Specify a method that observes property changes.

             ```javascript
             Alto.Object.extend({
        valueObserver: Alto.immediateObserver('value', function() {
          // Executes whenever the "value" property changes
        })
      });
             ```

             In the future, `Alto.observer` may become asynchronous. In this event,
             `Alto.immediateObserver` will maintain the synchronous behavior.

             Also available as `Function.prototype.observesImmediately` if prototype extensions are
             enabled.

             @method immediateObserver
             @for Alto
             @param {String} propertyNames*
             @param {Function} func
             @return func
             */
            function immediateObserver() {
                for (var i=0, l=arguments.length; i<l; i++) {
                    var arg = arguments[i];
                    Alto.assert("Immediate observers must observe internal properties only, not properties on other objects.",
                        typeof arg !== "string" || arg.indexOf('.') === -1);
                }

                return observer.apply(this, arguments);
            }

            __exports__.immediateObserver = immediateObserver;/**
             When observers fire, they are called with the arguments `obj`, `keyName`.

             Note, `@each.property` observer is called per each add or replace of an element
             and it's not called with a specific enumeration item.

             A `beforeObserver` fires before a property changes.

             A `beforeObserver` is an alternative form of `.observesBefore()`.

             ```javascript
             App.PersonView = Alto.View.extend({
        friends: [{ name: 'Tom' }, { name: 'Stefan' }, { name: 'Kris' }],

        valueWillChange: Alto.beforeObserver('content.value', function(obj, keyName) {
          this.changingFrom = obj.get(keyName);
        }),

        valueDidChange: Alto.observer('content.value', function(obj, keyName) {
            // only run if updating a value already in the DOM
            if (this.get('state') === 'inDOM') {
              var color = obj.get(keyName) > this.changingFrom ? 'green' : 'red';
              // logic
            }
        }),

        friendsDidChange: Alto.observer('friends.@each.name', function(obj, keyName) {
          // some logic
          // obj.get(keyName) returns friends array
        })
             });
             ```

             Also available as `Function.prototype.observesBefore` if prototype extensions are
             enabled.

             @method beforeObserver
             @for Alto
             @param {String} propertyNames*
             @param {Function} func
             @return func
             */
            function beforeObserver() {
                var func  = a_slice.call(arguments, -1)[0];
                var paths;

                var addWatchedProperty = function(path) { paths.push(path); };

                var _paths = a_slice.call(arguments, 0, -1);

                if (typeof func !== "function") {
                    // revert to old, soft-deprecated argument ordering

                    func  = arguments[0];
                    _paths = a_slice.call(arguments, 1);
                }

                paths = [];

                for (var i=0; i<_paths.length; ++i) {
                    expandProperties(_paths[i], addWatchedProperty);
                }

                if (typeof func !== "function") {
                    throw new Alto.Error("Alto.beforeObserver called without a function");
                }

                func.__alto_observesBefore__ = paths;
                return func;
            }

            __exports__.beforeObserver = beforeObserver;__exports__.IS_BINDING = IS_BINDING;
            __exports__.Mixin = Mixin;
        });
    enifed("ember-metal/observer",
        ["ember-metal/watching","ember-metal/array","ember-metal/events","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            "use strict";
            var watch = __dependency1__.watch;
            var unwatch = __dependency1__.unwatch;
            var map = __dependency2__.map;
            var listenersFor = __dependency3__.listenersFor;
            var addListener = __dependency3__.addListener;
            var removeListener = __dependency3__.removeListener;
            var suspendListeners = __dependency3__.suspendListeners;
            var suspendListener = __dependency3__.suspendListener;
            /**
             @module ember-metal
             */

            var AFTER_OBSERVERS = ':change';
            var BEFORE_OBSERVERS = ':before';

            function changeEvent(keyName) {
                return keyName + AFTER_OBSERVERS;
            }

            function beforeEvent(keyName) {
                return keyName + BEFORE_OBSERVERS;
            }

            /**
             @method addObserver
             @for Alto
             @param obj
             @param {String} path
             @param {Object|Function} targetOrMethod
             @param {Function|String} [method]
             */
            function addObserver(obj, _path, target, method) {
                addListener(obj, changeEvent(_path), target, method);
                watch(obj, _path);

                return this;
            }

            __exports__.addObserver = addObserver;function observersFor(obj, path) {
                return listenersFor(obj, changeEvent(path));
            }

            __exports__.observersFor = observersFor;/**
             @method removeObserver
             @for Alto
             @param obj
             @param {String} path
             @param {Object|Function} target
             @param {Function|String} [method]
             */
            function removeObserver(obj, path, target, method) {
                unwatch(obj, path);
                removeListener(obj, changeEvent(path), target, method);

                return this;
            }

            __exports__.removeObserver = removeObserver;/**
             @method addBeforeObserver
             @for Alto
             @param obj
             @param {String} path
             @param {Object|Function} target
             @param {Function|String} [method]
             */
            function addBeforeObserver(obj, path, target, method) {
                addListener(obj, beforeEvent(path), target, method);
                watch(obj, path);

                return this;
            }

            __exports__.addBeforeObserver = addBeforeObserver;// Suspend observer during callback.
            //
            // This should only be used by the target of the observer
            // while it is setting the observed path.
            function _suspendBeforeObserver(obj, path, target, method, callback) {
                return suspendListener(obj, beforeEvent(path), target, method, callback);
            }

            __exports__._suspendBeforeObserver = _suspendBeforeObserver;function _suspendObserver(obj, path, target, method, callback) {
                return suspendListener(obj, changeEvent(path), target, method, callback);
            }

            __exports__._suspendObserver = _suspendObserver;function _suspendBeforeObservers(obj, paths, target, method, callback) {
                var events = map.call(paths, beforeEvent);
                return suspendListeners(obj, events, target, method, callback);
            }

            __exports__._suspendBeforeObservers = _suspendBeforeObservers;function _suspendObservers(obj, paths, target, method, callback) {
                var events = map.call(paths, changeEvent);
                return suspendListeners(obj, events, target, method, callback);
            }

            __exports__._suspendObservers = _suspendObservers;function beforeObserversFor(obj, path) {
                return listenersFor(obj, beforeEvent(path));
            }

            __exports__.beforeObserversFor = beforeObserversFor;/**
             @method removeBeforeObserver
             @for Alto
             @param obj
             @param {String} path
             @param {Object|Function} target
             @param {Function|String} [method]
             */
            function removeBeforeObserver(obj, path, target, method) {
                unwatch(obj, path);
                removeListener(obj, beforeEvent(path), target, method);

                return this;
            }

            __exports__.removeBeforeObserver = removeBeforeObserver;
        });
    enifed("ember-metal/observer_set",
        ["ember-metal/utils","ember-metal/events","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var guidFor = __dependency1__.guidFor;
            var sendEvent = __dependency2__.sendEvent;

            /*
             this.observerSet = {
             [senderGuid]: { // variable name: `keySet`
             [keyName]: listIndex
             }
             },
             this.observers = [
             {
             sender: obj,
             keyName: keyName,
             eventName: eventName,
             listeners: [
             [target, method, flags]
             ]
             },
             ...
             ]
             */
            __exports__["default"] = ObserverSet;
            function ObserverSet() {
                this.clear();
            }


            ObserverSet.prototype.add = function(sender, keyName, eventName) {
                var observerSet = this.observerSet;
                var observers = this.observers;
                var senderGuid = guidFor(sender);
                var keySet = observerSet[senderGuid];
                var index;

                if (!keySet) {
                    observerSet[senderGuid] = keySet = {};
                }
                index = keySet[keyName];
                if (index === undefined) {
                    index = observers.push({
                            sender: sender,
                            keyName: keyName,
                            eventName: eventName,
                            listeners: []
                        }) - 1;
                    keySet[keyName] = index;
                }
                return observers[index].listeners;
            };

            ObserverSet.prototype.flush = function() {
                var observers = this.observers;
                var i, len, observer, sender;
                this.clear();
                for (i=0, len=observers.length; i < len; ++i) {
                    observer = observers[i];
                    sender = observer.sender;
                    if (sender.isDestroying || sender.isDestroyed) { continue; }
                    sendEvent(sender, observer.eventName, [sender, observer.keyName], observer.listeners);
                }
            };

            ObserverSet.prototype.clear = function() {
                this.observerSet = {};
                this.observers = [];
            };
        });
    enifed("ember-metal/path_cache",
        ["ember-metal/cache","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var Cache = __dependency1__["default"];

            var IS_GLOBAL      = /^([A-Z$]|([0-9][A-Z$]))/;
            var IS_GLOBAL_PATH = /^([A-Z$]|([0-9][A-Z$])).*[\.]/;
            var HAS_THIS       = 'this.';

            var isGlobalCache       = new Cache(1000, function(key) { return IS_GLOBAL.test(key);          });
            var isGlobalPathCache   = new Cache(1000, function(key) { return IS_GLOBAL_PATH.test(key);     });
            var hasThisCache        = new Cache(1000, function(key) { return key.indexOf(HAS_THIS) !== -1; });
            var firstDotIndexCache  = new Cache(1000, function(key) { return key.indexOf('.');             });

            var firstKeyCache = new Cache(1000, function(path) {
                var index = firstDotIndexCache.get(path);
                if (index === -1) {
                    return path;
                } else {
                    return path.slice(0, index);
                }
            });

            var tailPathCache = new Cache(1000, function(path) {
                var index = firstDotIndexCache.get(path);
                if (index !== -1) {
                    return path.slice(index + 1);
                }
            });

            var caches = {
                isGlobalCache:      isGlobalCache,
                isGlobalPathCache:  isGlobalPathCache,
                hasThisCache:       hasThisCache,
                firstDotIndexCache: firstDotIndexCache,
                firstKeyCache:      firstKeyCache,
                tailPathCache:      tailPathCache
            };
            __exports__.caches = caches;
            function isGlobal(path) {
                return isGlobalCache.get(path);
            }

            __exports__.isGlobal = isGlobal;function isGlobalPath(path) {
                return isGlobalPathCache.get(path);
            }

            __exports__.isGlobalPath = isGlobalPath;function hasThis(path) {
                return hasThisCache.get(path);
            }

            __exports__.hasThis = hasThis;function isPath(path) {
                return firstDotIndexCache.get(path) !== -1;
            }

            __exports__.isPath = isPath;function getFirstKey(path) {
                return firstKeyCache.get(path);
            }

            __exports__.getFirstKey = getFirstKey;function getTailPath(path) {
                return tailPathCache.get(path);
            }

            __exports__.getTailPath = getTailPath;
        });
    enifed("ember-metal/platform",
        ["ember-metal/platform/define_property","ember-metal/platform/define_properties","ember-metal/platform/create","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            "use strict";
            var hasES5CompliantDefineProperty = __dependency1__.hasES5CompliantDefineProperty;
            var defineProperty = __dependency1__.defineProperty;
            var defineProperties = __dependency2__["default"];
            var create = __dependency3__["default"];

            /**
             @module ember-metal
             */

            var hasPropertyAccessors = hasES5CompliantDefineProperty;
            var canDefineNonEnumerableProperties = hasES5CompliantDefineProperty;

            /**
             Platform specific methods and feature detectors needed by the framework.

             @class platform
             @namespace Alto
             @static
             */

            __exports__.create = create;
            __exports__.defineProperty = defineProperty;
            __exports__.defineProperties = defineProperties;
            __exports__.hasPropertyAccessors = hasPropertyAccessors;
            __exports__.canDefineNonEnumerableProperties = canDefineNonEnumerableProperties;
        });
    enifed("ember-metal/platform/create",
        ["exports"],
        function(__exports__) {
            // Remove "use strict"; from transpiled module until
            // https://bugs.webkit.org/show_bug.cgi?id=138038 is fixed
            //
            // REMOVE_USE_STRICT: true

            /**
             @class platform
             @namespace Alto
             @static
             */

            /**
             Identical to `Object.create()`. Implements if not available natively.

             @method create
             @for Alto
             */
            var create;
            // ES5 15.2.3.5
            // http://es5.github.com/#x15.2.3.5
            if (!(Object.create && !Object.create(null).hasOwnProperty)) {
                /* jshint scripturl:true, proto:true */
                // Contributed by Brandon Benvie, October, 2012
                var createAltopty;
                var supportsProto = !({'__proto__':null} instanceof Object);
                // the following produces false positives
                // in Opera Mini => not a reliable check
                // Object.prototype.__proto__ === null
                if (supportsProto || typeof document === 'undefined') {
                    createAltopty = function () {
                        return { "__proto__": null };
                    };
                } else {
                    // In old IE __proto__ can't be used to manually set `null`, nor does
                    // any other method exist to make an object that inherits from nothing,
                    // aside from Object.prototype itself. Instead, create a new global
                    // object and *steal* its Object.prototype and strip it bare. This is
                    // used as the prototype to create nullary objects.
                    createAltopty = function () {
                        var iframe = document.createElement('iframe');
                        var parent = document.body || document.documentElement;
                        iframe.style.display = 'none';
                        parent.appendChild(iframe);
                        iframe.src = 'javascript:';
                        var empty = iframe.contentWindow.Object.prototype;
                        parent.removeChild(iframe);
                        iframe = null;
                        delete empty.constructor;
                        delete empty.hasOwnProperty;
                        delete empty.propertyIsEnumerable;
                        delete empty.isPrototypeOf;
                        delete empty.toLocaleString;
                        delete empty.toString;
                        delete empty.valueOf;

                        function Altopty() {}
                        Altopty.prototype = empty;
                        // short-circuit future calls
                        createAltopty = function () {
                            return new Altopty();
                        };
                        return new Altopty();
                    };
                }

                create = Object.create = function create(prototype, properties) {

                    var object;
                    function Type() {}  // An empty constructor.

                    if (prototype === null) {
                        object = createAltopty();
                    } else {
                        if (typeof prototype !== "object" && typeof prototype !== "function") {
                            // In the native implementation `parent` can be `null`
                            // OR *any* `instanceof Object`  (Object|Function|Array|RegExp|etc)
                            // Use `typeof` tho, b/c in old IE, DOM elements are not `instanceof Object`
                            // like they are in modern browsers. Using `Object.create` on DOM elements
                            // is...err...probably inappropriate, but the native version allows for it.
                            throw new TypeError("Object prototype may only be an Object or null"); // same msg as Chrome
                        }

                        Type.prototype = prototype;

                        object = new Type();
                    }

                    if (properties !== undefined) {
                        Object.defineProperties(object, properties);
                    }

                    return object;
                };
            } else {
                create = Object.create;
            }

            __exports__["default"] = create;
        });
    enifed("ember-metal/platform/define_properties",
        ["ember-metal/platform/define_property","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var defineProperty = __dependency1__.defineProperty;

            var defineProperties = Object.defineProperties;

            // ES5 15.2.3.7
            // http://es5.github.com/#x15.2.3.7
            if (!defineProperties) {
                defineProperties = function defineProperties(object, properties) {
                    for (var property in properties) {
                        if (properties.hasOwnProperty(property) && property !== "__proto__") {
                            defineProperty(object, property, properties[property]);
                        }
                    }
                    return object;
                };

                Object.defineProperties = defineProperties;
            }

            __exports__["default"] = defineProperties;
        });
    enifed("ember-metal/platform/define_property",
        ["exports"],
        function(__exports__) {
            "use strict";
            /*globals Node */

            /**
             @class platform
             @namespace Alto
             @static
             */

            /**
             Set to true if the platform supports native getters and setters.

             @property hasPropertyAccessors
             @final
             */

            /**
             Identical to `Object.defineProperty()`. Implements as much functionality
             as possible if not available natively.

             @method defineProperty
             @param {Object} obj The object to modify
             @param {String} keyName property name to modify
             @param {Object} desc descriptor hash
             @return {void}
             */
            var defineProperty = (function checkCompliance(defineProperty) {
                if (!defineProperty) return;
                try {
                    var a = 5;
                    var obj = {};
                    defineProperty(obj, 'a', {
                        configurable: true,
                        enumerable: true,
                        get: function () {
                            return a;
                        },
                        set: function (v) {
                            a = v;
                        }
                    });
                    if (obj.a !== 5) return;
                    obj.a = 10;
                    if (a !== 10) return;

                    // check non-enumerability
                    defineProperty(obj, 'a', {
                        configurable: true,
                        enumerable: false,
                        writable: true,
                        value: true
                    });
                    for (var key in obj) {
                        if (key === 'a') return;
                    }

                    // Detects a bug in Android <3.2 where you cannot redefine a property using
                    // Object.defineProperty once accessors have already been set.
                    if (obj.a !== true) return;

                    // defineProperty is compliant
                    return defineProperty;
                } catch (e) {
                    // IE8 defines Object.defineProperty but calling it on an Object throws
                    return;
                }
            })(Object.defineProperty);

            var hasES5CompliantDefineProperty = !!defineProperty;

            if (hasES5CompliantDefineProperty && typeof document !== 'undefined') {
                // This is for Safari 5.0, which supports Object.defineProperty, but not
                // on DOM nodes.
                var canDefinePropertyOnDOM = (function() {
                    try {
                        defineProperty(document.createElement('div'), 'definePropertyOnDOM', {});
                        return true;
                    } catch(e) { }

                    return false;
                })();

                if (!canDefinePropertyOnDOM) {
                    defineProperty = function(obj, keyName, desc) {
                        var isNode;

                        if (typeof Node === "object") {
                            isNode = obj instanceof Node;
                        } else {
                            isNode = typeof obj === "object" && typeof obj.nodeType === "number" && typeof obj.nodeName === "string";
                        }

                        if (isNode) {
                            // TODO: Should we have a warning here?
                            return (obj[keyName] = desc.value);
                        } else {
                            return Object.defineProperty(obj, keyName, desc);
                        }
                    };
                }
            }

            if (!hasES5CompliantDefineProperty) {
                defineProperty = function defineProperty(obj, keyName, desc) {
                    if (!desc.get) { obj[keyName] = desc.value; }
                };
            }

            __exports__.hasES5CompliantDefineProperty = hasES5CompliantDefineProperty;
            __exports__.defineProperty = defineProperty;
        });
    enifed("ember-metal/properties",
        ["ember-metal/core","ember-metal/utils","ember-metal/platform","ember-metal/property_events","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            /**
             @module ember-metal
             */

            var Alto = __dependency1__["default"];
            var metaFor = __dependency2__.meta;
            var objectDefineProperty = __dependency3__.defineProperty;
            var hasPropertyAccessors = __dependency3__.hasPropertyAccessors;
            var overrideChains = __dependency4__.overrideChains;
            // ..........................................................
            // DESCRIPTOR
            //

            /**
             Objects of this type can implement an interface to respond to requests to
             get and set. The default implementation handles simple properties.

             You generally won't need to create or subclass this directly.

             @class Descriptor
             @namespace Alto
             @private
             @constructor
             */
            function Descriptor() {}

            __exports__.Descriptor = Descriptor;// ..........................................................
            // DEFINING PROPERTIES API
            //

            function MANDATORY_SETTER_FUNCTION(name) {
                return function SETTER_FUNCTION(value) {
                    Alto.assert("You must use Alto.set() to set the `" + name + "` property (of " + this + ") to `" + value + "`.", false);
                };
            }

            __exports__.MANDATORY_SETTER_FUNCTION = MANDATORY_SETTER_FUNCTION;function DEFAULT_GETTER_FUNCTION(name) {
                return function GETTER_FUNCTION() {
                    var meta = this['__alto_meta__'];
                    return meta && meta.values[name];
                };
            }

            __exports__.DEFAULT_GETTER_FUNCTION = DEFAULT_GETTER_FUNCTION;/**
             NOTE: This is a low-level method used by other parts of the API. You almost
             never want to call this method directly. Instead you should use
             `Alto.mixin()` to define new properties.

             Defines a property on an object. This method works much like the ES5
             `Object.defineProperty()` method except that it can also accept computed
             properties and other special descriptors.

             Normally this method takes only three parameters. However if you pass an
             instance of `Alto.Descriptor` as the third param then you can pass an
             optional value as the fourth parameter. This is often more efficient than
             creating new descriptor hashes for each property.

             ## Examples

             ```javascript
             // ES5 compatible mode
             Alto.defineProperty(contact, 'firstName', {
        writable: true,
        configurable: false,
        enumerable: true,
        value: 'Charles'
      });

             // define a simple property
             Alto.defineProperty(contact, 'lastName', undefined, 'Jolley');

             // define a computed property
             Alto.defineProperty(contact, 'fullName', Alto.computed(function() {
        return this.firstName+' '+this.lastName;
      }).property('firstName', 'lastName'));
             ```

             @private
             @method defineProperty
             @for Alto
             @param {Object} obj the object to define this property on. This may be a prototype.
             @param {String} keyName the name of the property
             @param {Alto.Descriptor} [desc] an instance of `Alto.Descriptor` (typically a
             computed property) or an ES5 descriptor.
             You must provide this or `data` but not both.
             @param {*} [data] something other than a descriptor, that will
             become the explicit value of this property.
             */
            function defineProperty(obj, keyName, desc, data, meta) {
                var descs, existingDesc, watching, value;

                if (!meta) meta = metaFor(obj);
                descs = meta.descs;
                existingDesc = meta.descs[keyName];
                var watchEntry = meta.watching[keyName];

                watching = watchEntry !== undefined && watchEntry > 0;

                if (existingDesc instanceof Descriptor) {
                    existingDesc.teardown(obj, keyName);
                }

                if (desc instanceof Descriptor) {
                    value = desc;

                    descs[keyName] = desc;

                    if (watching && hasPropertyAccessors) {
                        objectDefineProperty(obj, keyName, {
                            configurable: true,
                            enumerable: true,
                            writable: true,
                            value: undefined // make enumerable
                        });
                    } else {
                        obj[keyName] = undefined; // make enumerable
                    }
                    if (desc.setup) { desc.setup(obj, keyName); }
                } else {
                    descs[keyName] = undefined; // shadow descriptor in proto
                    if (desc == null) {
                        value = data;


                        if (watching && hasPropertyAccessors) {
                            meta.values[keyName] = data;
                            objectDefineProperty(obj, keyName, {
                                configurable: true,
                                enumerable: true,
                                set: MANDATORY_SETTER_FUNCTION(keyName),
                                get: DEFAULT_GETTER_FUNCTION(keyName)
                            });
                        } else {
                            obj[keyName] = data;
                        }
                    } else {
                        value = desc;

                        // compatibility with ES5
                        objectDefineProperty(obj, keyName, desc);
                    }
                }

                // if key is being watched, override chains that
                // were initialized with the prototype
                if (watching) { overrideChains(obj, keyName, meta); }

                // The `value` passed to the `didDefineProperty` hook is
                // either the descriptor or data, whichever was passed.
                if (obj.didDefineProperty) { obj.didDefineProperty(obj, keyName, value); }

                return this;
            }

            __exports__.defineProperty = defineProperty;
        });
    enifed("ember-metal/property_events",
        ["ember-metal/utils","ember-metal/events","ember-metal/observer_set","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            "use strict";
            var guidFor = __dependency1__.guidFor;
            var tryFinally = __dependency1__.tryFinally;
            var sendEvent = __dependency2__.sendEvent;
            var listenersUnion = __dependency2__.listenersUnion;
            var listenersDiff = __dependency2__.listenersDiff;
            var ObserverSet = __dependency3__["default"];

            var beforeObserverSet = new ObserverSet();
            var observerSet = new ObserverSet();
            var deferred = 0;

            // ..........................................................
            // PROPERTY CHANGES
            //

            /**
             This function is called just before an object property is about to change.
             It will notify any before observers and prepare caches among other things.

             Normally you will not need to call this method directly but if for some
             reason you can't directly watch a property you can invoke this method
             manually along with `Alto.propertyDidChange()` which you should call just
             after the property value changes.

             @method propertyWillChange
             @for Alto
             @param {Object} obj The object with the property that will change
             @param {String} keyName The property key (or path) that will change.
             @return {void}
             */
            function propertyWillChange(obj, keyName) {
                var m = obj['__alto_meta__'];
                var watching = (m && m.watching[keyName] > 0) || keyName === 'length';
                var proto = m && m.proto;
                var desc = m && m.descs[keyName];

                if (!watching) {
                    return;
                }

                if (proto === obj) {
                    return;
                }

                if (desc && desc.willChange) {
                    desc.willChange(obj, keyName);
                }

                dependentKeysWillChange(obj, keyName, m);
                chainsWillChange(obj, keyName, m);
                notifyBeforeObservers(obj, keyName);
            }

            /**
             This function is called just after an object property has changed.
             It will notify any observers and clear caches among other things.

             Normally you will not need to call this method directly but if for some
             reason you can't directly watch a property you can invoke this method
             manually along with `Alto.propertyWillChange()` which you should call just
             before the property value changes.

             @method propertyDidChange
             @for Alto
             @param {Object} obj The object with the property that will change
             @param {String} keyName The property key (or path) that will change.
             @return {void}
             */
            function propertyDidChange(obj, keyName) {
                var m = obj['__alto_meta__'];
                var watching = (m && m.watching[keyName] > 0) || keyName === 'length';
                var proto = m && m.proto;
                var desc = m && m.descs[keyName];

                if (proto === obj) {
                    return;
                }

                // shouldn't this mean that we're watching this key?
                if (desc && desc.didChange) {
                    desc.didChange(obj, keyName);
                }

                if (!watching && keyName !== 'length') {
                    return;
                }

                if (m && m.deps && m.deps[keyName]) {
                    dependentKeysDidChange(obj, keyName, m);
                }

                chainsDidChange(obj, keyName, m, false);
                notifyObservers(obj, keyName);
            }

            var WILL_SEEN, DID_SEEN;
            // called whenever a property is about to change to clear the cache of any dependent keys (and notify those properties of changes, etc...)
            function dependentKeysWillChange(obj, depKey, meta) {
                if (obj.isDestroying) { return; }

                var deps;
                if (meta && meta.deps && (deps = meta.deps[depKey])) {
                    var seen = WILL_SEEN;
                    var top = !seen;

                    if (top) {
                        seen = WILL_SEEN = {};
                    }

                    iterDeps(propertyWillChange, obj, deps, depKey, seen, meta);

                    if (top) {
                        WILL_SEEN = null;
                    }
                }
            }

            // called whenever a property has just changed to update dependent keys
            function dependentKeysDidChange(obj, depKey, meta) {
                if (obj.isDestroying) { return; }

                var deps;
                if (meta && meta.deps && (deps = meta.deps[depKey])) {
                    var seen = DID_SEEN;
                    var top = !seen;

                    if (top) {
                        seen = DID_SEEN = {};
                    }

                    iterDeps(propertyDidChange, obj, deps, depKey, seen, meta);

                    if (top) {
                        DID_SEEN = null;
                    }
                }
            }

            function keysOf(obj) {
                var keys = [];

                for (var key in obj) {
                    keys.push(key);
                }

                return keys;
            }

            function iterDeps(method, obj, deps, depKey, seen, meta) {
                var keys, key, i, desc;
                var guid = guidFor(obj);
                var current = seen[guid];

                if (!current) {
                    current = seen[guid] = {};
                }

                if (current[depKey]) {
                    return;
                }

                current[depKey] = true;

                if (deps) {
                    keys = keysOf(deps);
                    var descs = meta.descs;
                    for (i=0; i<keys.length; i++) {
                        key = keys[i];
                        desc = descs[key];

                        if (desc && desc._suspended === obj) {
                            continue;
                        }

                        method(obj, key);
                    }
                }
            }

            function chainsWillChange(obj, keyName, m) {
                if (!(m.hasOwnProperty('chainWatchers') &&
                    m.chainWatchers[keyName])) {
                    return;
                }

                var nodes = m.chainWatchers[keyName];
                var events = [];
                var i, l;

                for(i = 0, l = nodes.length; i < l; i++) {
                    nodes[i].willChange(events);
                }

                for (i = 0, l = events.length; i < l; i += 2) {
                    propertyWillChange(events[i], events[i+1]);
                }
            }

            function chainsDidChange(obj, keyName, m, suppressEvents) {
                if (!(m && m.hasOwnProperty('chainWatchers') &&
                    m.chainWatchers[keyName])) {
                    return;
                }

                var nodes = m.chainWatchers[keyName];
                var events = suppressEvents ? null : [];
                var i, l;

                for(i = 0, l = nodes.length; i < l; i++) {
                    nodes[i].didChange(events);
                }

                if (suppressEvents) {
                    return;
                }

                for (i = 0, l = events.length; i < l; i += 2) {
                    propertyDidChange(events[i], events[i+1]);
                }
            }

            function overrideChains(obj, keyName, m) {
                chainsDidChange(obj, keyName, m, true);
            }

            /**
             @method beginPropertyChanges
             @chainable
             @private
             */
            function beginPropertyChanges() {
                deferred++;
            }

            /**
             @method endPropertyChanges
             @private
             */
            function endPropertyChanges() {
                deferred--;
                if (deferred<=0) {
                    beforeObserverSet.clear();
                    observerSet.flush();
                }
            }

            /**
             Make a series of property changes together in an
             exception-safe way.

             ```javascript
             Alto.changeProperties(function() {
        obj1.set('foo', mayBlowUpWhenSet);
        obj2.set('bar', baz);
      });
             ```

             @method changeProperties
             @param {Function} callback
             @param [binding]
             */
            function changeProperties(cb, binding) {
                beginPropertyChanges();
                tryFinally(cb, endPropertyChanges, binding);
            }

            function notifyBeforeObservers(obj, keyName) {
                if (obj.isDestroying) { return; }

                var eventName = keyName + ':before';
                var listeners, diff;
                if (deferred) {
                    listeners = beforeObserverSet.add(obj, keyName, eventName);
                    diff = listenersDiff(obj, eventName, listeners);
                    sendEvent(obj, eventName, [obj, keyName], diff);
                } else {
                    sendEvent(obj, eventName, [obj, keyName]);
                }
            }

            function notifyObservers(obj, keyName) {
                if (obj.isDestroying) { return; }

                var eventName = keyName + ':change';
                var listeners;
                if (deferred) {
                    listeners = observerSet.add(obj, keyName, eventName);
                    listenersUnion(obj, eventName, listeners);
                } else {
                    sendEvent(obj, eventName, [obj, keyName]);
                }
            }

            __exports__.propertyWillChange = propertyWillChange;
            __exports__.propertyDidChange = propertyDidChange;
            __exports__.overrideChains = overrideChains;
            __exports__.beginPropertyChanges = beginPropertyChanges;
            __exports__.endPropertyChanges = endPropertyChanges;
            __exports__.changeProperties = changeProperties;
        });
    enifed("ember-metal/property_get",
        ["ember-metal/core","ember-metal/error","ember-metal/path_cache","ember-metal/platform","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            /**
             @module ember-metal
             */

            var Alto = __dependency1__["default"];
            var AltoError = __dependency2__["default"];
            var isGlobalPath = __dependency3__.isGlobalPath;
            var isPath = __dependency3__.isPath;
            var pathHasThis = __dependency3__.hasThis;
            var hasPropertyAccessors = __dependency4__.hasPropertyAccessors;

            var FIRST_KEY = /^([^\.]+)/;

            // ..........................................................
            // GET AND SET
            //
            // If we are on a platform that supports accessors we can use those.
            // Otherwise simulate accessors by looking up the property directly on the
            // object.

            /**
             Gets the value of a property on an object. If the property is computed,
             the function will be invoked. If the property is not defined but the
             object implements the `unknownProperty` method then that will be invoked.

             If you plan to run on IE8 and older browsers then you should use this
             method anytime you want to retrieve a property on an object that you don't
             know for sure is private. (Properties beginning with an underscore '_'
             are considered private.)

             On all newer browsers, you only need to use this method to retrieve
             properties if the property might not be defined on the object and you want
             to respect the `unknownProperty` handler. Otherwise you can ignore this
             method.

             Note that if the object itself is `undefined`, this method will throw
             an error.

             @method get
             @for Alto
             @param {Object} obj The object to retrieve from.
             @param {String} keyName The property key to retrieve
             @return {Object} the property value or `null`.
             */
            var get = function get(obj, keyName) {
                // Helpers that operate with 'this' within an #each
                if (keyName === '') {
                    return obj;
                }

                if (!keyName && 'string' === typeof obj) {
                    keyName = obj;
                    obj = null;
                }

                Alto.assert("Cannot call get with "+ keyName +" key.", !!keyName);
                Alto.assert("Cannot call get with '"+ keyName +"' on an undefined object.", obj !== undefined);

                if (obj === null) {
                    var value = _getPath(obj, keyName);
                    Alto.deprecate(
                        "Alto.get fetched '"+keyName+"' from the global context. This behavior will change in the future (issue #3852)",
                        !value || (obj && obj !== Alto.lookup) || isPath(keyName) || isGlobalPath(keyName+".") // Add a . to ensure simple paths are matched.
                    );
                    return value;
                }

                var meta = obj['__alto_meta__'];
                var desc = meta && meta.descs[keyName];
                var ret;

                if (desc === undefined && isPath(keyName)) {
                    return _getPath(obj, keyName);
                }

                if (desc) {
                    return desc.get(obj, keyName);
                } else {

                    if (hasPropertyAccessors && meta && meta.watching[keyName] > 0) {
                        ret = meta.values[keyName];
                    } else {
                        ret = obj[keyName];
                    }

                    if (ret === undefined &&
                        'object' === typeof obj && !(keyName in obj) && 'function' === typeof obj.unknownProperty) {
                        return obj.unknownProperty(keyName);
                    }

                    return ret;
                }
            };

            // Currently used only by Alto Data tests
            if (Alto.config.overrideAccessors) {
                Alto.get = get;
                Alto.config.overrideAccessors();
                get = Alto.get;
            }

            /**
             Normalizes a target/path pair to reflect that actual target/path that should
             be observed, etc. This takes into account passing in global property
             paths (i.e. a path beginning with a captial letter not defined on the
             target).

             @private
             @method normalizeTuple
             @for Alto
             @param {Object} target The current target. May be `null`.
             @param {String} path A path on the target or a global property path.
             @return {Array} a temporary array with the normalized target/path pair.
             */
            function normalizeTuple(target, path) {
                var hasThis  = pathHasThis(path);
                var isGlobal = !hasThis && isGlobalPath(path);
                var key;

                if (!target || isGlobal) target = Alto.lookup;
                if (hasThis) path = path.slice(5);

                Alto.deprecate(
                    "normalizeTuple will return '"+path+"' as a non-global. This behavior will change in the future (issue #3852)",
                    target === Alto.lookup || !target || hasThis || isGlobal || !isGlobalPath(path+'.')
                );

                if (target === Alto.lookup) {
                    key = path.match(FIRST_KEY)[0];
                    target = get(target, key);
                    path   = path.slice(key.length+1);
                }

                // must return some kind of path to be valid else other things will break.
                if (!path || path.length===0) throw new AltoError('Path cannot be empty');

                return [ target, path ];
            }

            function _getPath(root, path) {
                var hasThis, parts, tuple, idx, len;

                // If there is no root and path is a key name, return that
                // property from the global object.
                // E.g. get('Alto') -> Alto
                if (root === null && !isPath(path)) {
                    return get(Alto.lookup, path);
                }

                // detect complicated paths and normalize them
                hasThis = pathHasThis(path);

                if (!root || hasThis) {
                    tuple = normalizeTuple(root, path);
                    root = tuple[0];
                    path = tuple[1];
                    tuple.length = 0;
                }

                parts = path.split(".");
                len = parts.length;
                for (idx = 0; root != null && idx < len; idx++) {
                    root = get(root, parts[idx], true);
                    if (root && root.isDestroyed) { return undefined; }
                }
                return root;
            }

            function getWithDefault(root, key, defaultValue) {
                var value = get(root, key);

                if (value === undefined) { return defaultValue; }
                return value;
            }

            __exports__.getWithDefault = getWithDefault;__exports__["default"] = get;
            __exports__.get = get;
            __exports__.normalizeTuple = normalizeTuple;
            __exports__._getPath = _getPath;
        });
    enifed("ember-metal/property_set",
        ["ember-metal/core","ember-metal/property_get","ember-metal/property_events","ember-metal/properties","ember-metal/error","ember-metal/path_cache","ember-metal/platform","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            var getPath = __dependency2__._getPath;
            var propertyWillChange = __dependency3__.propertyWillChange;
            var propertyDidChange = __dependency3__.propertyDidChange;
            var defineProperty = __dependency4__.defineProperty;
            var AltoError = __dependency5__["default"];
            var isPath = __dependency6__.isPath;
            var hasPropertyAccessors = __dependency7__.hasPropertyAccessors;

            var IS_GLOBAL = /^([A-Z$]|([0-9][A-Z$]))/;

            /**
             Sets the value of a property on an object, respecting computed properties
             and notifying observers and other listeners of the change. If the
             property is not defined but the object implements the `setUnknownProperty`
             method then that will be invoked as well.

             @method set
             @for Alto
             @param {Object} obj The object to modify.
             @param {String} keyName The property key to set
             @param {Object} value The value to set
             @return {Object} the passed value.
             */
            var set = function set(obj, keyName, value, tolerant) {
                if (typeof obj === 'string') {
                    Alto.assert("Path '" + obj + "' must be global if no obj is given.", IS_GLOBAL.test(obj));
                    value = keyName;
                    keyName = obj;
                    obj = null;
                }

                Alto.assert("Cannot call set with "+ keyName +" key.", !!keyName);

                if (!obj) {
                    return setPath(obj, keyName, value, tolerant);
                }

                var meta = obj['__alto_meta__'];
                var desc = meta && meta.descs[keyName];
                var isUnknown, currentValue;

                if (desc === undefined && isPath(keyName)) {
                    return setPath(obj, keyName, value, tolerant);
                }

                Alto.assert("You need to provide an object and key to `set`.", !!obj && keyName !== undefined);
                Alto.assert('calling set on destroyed object', !obj.isDestroyed);

                if (desc !== undefined) {
                    desc.set(obj, keyName, value);
                } else {

                    if (typeof obj === 'object' && obj !== null && value !== undefined && obj[keyName] === value) {
                        return value;
                    }

                    isUnknown = 'object' === typeof obj && !(keyName in obj);

                    // setUnknownProperty is called if `obj` is an object,
                    // the property does not already exist, and the
                    // `setUnknownProperty` method exists on the object
                    if (isUnknown && 'function' === typeof obj.setUnknownProperty) {
                        obj.setUnknownProperty(keyName, value);
                    } else if (meta && meta.watching[keyName] > 0) {

                        if (hasPropertyAccessors) {
                            currentValue = meta.values[keyName];
                        } else {
                            currentValue = obj[keyName];
                        }
                        // only trigger a change if the value has changed
                        if (value !== currentValue) {
                            propertyWillChange(obj, keyName);

                            if (hasPropertyAccessors) {
                                if (
                                    (currentValue === undefined && !(keyName in obj)) ||
                                    !Object.prototype.propertyIsEnumerable.call(obj, keyName)
                                ) {
                                    defineProperty(obj, keyName, null, value); // setup mandatory setter
                                } else {
                                    meta.values[keyName] = value;
                                }
                            } else {
                                obj[keyName] = value;
                            }
                            propertyDidChange(obj, keyName);
                        }
                    } else {
                        obj[keyName] = value;
                    }
                }
                return value;
            };

            // Currently used only by Alto Data tests
            // ES6TODO: Verify still true
            if (Alto.config.overrideAccessors) {
                Alto.set = set;
                Alto.config.overrideAccessors();
                set = Alto.set;
            }

            function setPath(root, path, value, tolerant) {
                var keyName;

                // get the last part of the path
                keyName = path.slice(path.lastIndexOf('.') + 1);

                // get the first part of the part
                path    = (path === keyName) ? keyName : path.slice(0, path.length-(keyName.length+1));

                // unless the path is this, look up the first part to
                // get the root
                if (path !== 'this') {
                    root = getPath(root, path);
                }

                if (!keyName || keyName.length === 0) {
                    throw new AltoError('Property set failed: You passed an empty path');
                }

                if (!root) {
                    if (tolerant) { return; }
                    else { throw new AltoError('Property set failed: object in path "'+path+'" could not be found or was destroyed.'); }
                }

                return set(root, keyName, value);
            }

            /**
             Error-tolerant form of `Alto.set`. Will not blow up if any part of the
             chain is `undefined`, `null`, or destroyed.

             This is primarily used when syncing bindings, which may try to update after
             an object has been destroyed.

             @method trySet
             @for Alto
             @param {Object} obj The object to modify.
             @param {String} path The property path to set
             @param {Object} value The value to set
             */
            function trySet(root, path, value) {
                return set(root, path, value, true);
            }

            __exports__.trySet = trySet;__exports__.set = set;
        });
    enifed("ember-metal/run_loop",
        ["ember-metal/core","ember-metal/utils","ember-metal/array","ember-metal/property_events","backburner","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            var apply = __dependency2__.apply;
            var GUID_KEY = __dependency2__.GUID_KEY;
            var indexOf = __dependency3__.indexOf;
            var beginPropertyChanges = __dependency4__.beginPropertyChanges;
            var endPropertyChanges = __dependency4__.endPropertyChanges;
            var Backburner = __dependency5__["default"];

            function onBegin(current) {
                run.currentRunLoop = current;
            }

            function onEnd(current, next) {
                run.currentRunLoop = next;
            }

            // ES6TODO: should Backburner become es6?
            var backburner = new Backburner(['sync', 'actions', 'destroy'], {
                GUID_KEY: GUID_KEY,
                sync: {
                    before: beginPropertyChanges,
                    after: endPropertyChanges
                },
                defaultQueue: 'actions',
                onBegin: onBegin,
                onEnd: onEnd,
                onErrorTarget: Alto,
                onErrorMethod: 'onerror'
            });
            var slice = [].slice;

            // ..........................................................
            // run - this is ideally the only public API the dev sees
            //

            /**
             Runs the passed target and method inside of a RunLoop, ensuring any
             deferred actions including bindings and views updates are flushed at the
             end.

             Normally you should not need to invoke this method yourself. However if
             you are implementing raw event handlers when interfacing with other
             libraries or plugins, you should probably wrap all of your code inside this
             call.

             ```javascript
             run(function() {
        // code to be execute within a RunLoop
      });
             ```

             @class run
             @namespace Alto
             @static
             @constructor
             @param {Object} [target] target of method to call
             @param {Function|String} method Method to invoke.
             May be a function or a string. If you pass a string
             then it will be looked up on the passed target.
             @param {Object} [args*] Any additional arguments you wish to pass to the method.
             @return {Object} return value from invoking the passed function.
             */
            __exports__["default"] = run;
            function run() {
                return backburner.run.apply(backburner, arguments);
            }

            /**
             If no run-loop is present, it creates a new one. If a run loop is
             present it will queue itself to run on the existing run-loops action
             queue.

             Please note: This is not for normal usage, and should be used sparingly.

             If invoked when not within a run loop:

             ```javascript
             run.join(function() {
        // creates a new run-loop
      });
             ```

             Alternatively, if called within an existing run loop:

             ```javascript
             run(function() {
        // creates a new run-loop
        run.join(function() {
          // joins with the existing run-loop, and queues for invocation on
          // the existing run-loops action queue.
        });
      });
             ```

             @method join
             @namespace Alto
             @param {Object} [target] target of method to call
             @param {Function|String} method Method to invoke.
             May be a function or a string. If you pass a string
             then it will be looked up on the passed target.
             @param {Object} [args*] Any additional arguments you wish to pass to the method.
             @return {Object} Return value from invoking the passed function. Please note,
             when called within an existing loop, no return value is possible.
             */
            run.join = function() {
                return backburner.join.apply(backburner, arguments);
            };

            /**
             Allows you to specify which context to call the specified function in while
             adding the execution of that function to the Alto run loop. This ability
             makes this method a great way to asynchronusly integrate third-party libraries
             into your Alto application.

             `run.bind` takes two main arguments, the desired context and the function to
             invoke in that context. Any additional arguments will be supplied as arguments
             to the function that is passed in.

             Let's use the creation of a TinyMCE component as an example. Currently,
             TinyMCE provides a setup configuration option we can use to do some processing
             after the TinyMCE instance is initialized but before it is actually rendered.
             We can use that setup option to do some additional setup for our component.
             The component itself could look something like the following:

             ```javascript
             App.RichTextEditorComponent = Alto.Component.extend({
        initializeTinyMCE: function(){
          tinymce.init({
            selector: '#' + this.$().prop('id'),
            setup: Alto.run.bind(this, this.setupEditor)
          });
        }.on('didInsertElement'),

        setupEditor: function(editor) {
          this.set('editor', editor);
          editor.on('change', function(){ console.log('content changed!')} );
        }
      });
             ```

             In this example, we use Alto.run.bind to bind the setupEditor message to the
             context of the App.RichTextEditorComponent and to have the invocation of that
             method be safely handled and excuted by the Alto run loop.

             @method bind
             @namespace Alto
             @param {Object} [target] target of method to call
             @param {Function|String} method Method to invoke.
             May be a function or a string. If you pass a string
             then it will be looked up on the passed target.
             @param {Object} [args*] Any additional arguments you wish to pass to the method.
             @return {Object} return value from invoking the passed function. Please note,
             when called within an existing loop, no return value is possible.
             @since 1.4.0
             */
            run.bind = function(target, method /* args */) {
                var args = slice.call(arguments);
                return function() {
                    return run.join.apply(run, args.concat(slice.call(arguments)));
                };
            };

            run.backburner = backburner;
            run.currentRunLoop = null;
            run.queues = backburner.queueNames;

            /**
             Begins a new RunLoop. Any deferred actions invoked after the begin will
             be buffered until you invoke a matching call to `run.end()`. This is
             a lower-level way to use a RunLoop instead of using `run()`.

             ```javascript
             run.begin();
             // code to be execute within a RunLoop
             run.end();
             ```

             @method begin
             @return {void}
             */
            run.begin = function() {
                backburner.begin();
            };

            /**
             Ends a RunLoop. This must be called sometime after you call
             `run.begin()` to flush any deferred actions. This is a lower-level way
             to use a RunLoop instead of using `run()`.

             ```javascript
             run.begin();
             // code to be execute within a RunLoop
             run.end();
             ```

             @method end
             @return {void}
             */
            run.end = function() {
                backburner.end();
            };

            /**
             Array of named queues. This array determines the order in which queues
             are flushed at the end of the RunLoop. You can define your own queues by
             simply adding the queue name to this array. Normally you should not need
             to inspect or modify this property.

             @property queues
             @type Array
             @default ['sync', 'actions', 'destroy']
             */

            /**
             Adds the passed target/method and any optional arguments to the named
             queue to be executed at the end of the RunLoop. If you have not already
             started a RunLoop when calling this method one will be started for you
             automatically.

             At the end of a RunLoop, any methods scheduled in this way will be invoked.
             Methods will be invoked in an order matching the named queues defined in
             the `run.queues` property.

             ```javascript
             run.schedule('sync', this, function() {
        // this will be executed in the first RunLoop queue, when bindings are synced
        console.log("scheduled on sync queue");
      });

             run.schedule('actions', this, function() {
        // this will be executed in the 'actions' queue, after bindings have synced.
        console.log("scheduled on actions queue");
      });

             // Note the functions will be run in order based on the run queues order.
             // Output would be:
             //   scheduled on sync queue
             //   scheduled on actions queue
             ```

             @method schedule
             @param {String} queue The name of the queue to schedule against.
             Default queues are 'sync' and 'actions'
             @param {Object} [target] target object to use as the context when invoking a method.
             @param {String|Function} method The method to invoke. If you pass a string it
             will be resolved on the target object at the time the scheduled item is
             invoked allowing you to change the target function.
             @param {Object} [arguments*] Optional arguments to be passed to the queued method.
             @return {void}
             */
            run.schedule = function(queue, target, method) {
                checkAutoRun();
                backburner.schedule.apply(backburner, arguments);
            };

            // Used by global test teardown
            run.hasScheduledTimers = function() {
                return backburner.hasTimers();
            };

            // Used by global test teardown
            run.cancelTimers = function () {
                backburner.cancelTimers();
            };

            /**
             Immediately flushes any events scheduled in the 'sync' queue. Bindings
             use this queue so this method is a useful way to immediately force all
             bindings in the application to sync.

             You should call this method anytime you need any changed state to propagate
             throughout the app immediately without repainting the UI (which happens
             in the later 'render' queue added by the `ember-views` package).

             ```javascript
             run.sync();
             ```

             @method sync
             @return {void}
             */
            run.sync = function() {
                if (backburner.currentInstance) {
                    backburner.currentInstance.queues.sync.flush();
                }
            };

            /**
             Invokes the passed target/method and optional arguments after a specified
             period of time. The last parameter of this method must always be a number
             of milliseconds.

             You should use this method whenever you need to run some action after a
             period of time instead of using `setTimeout()`. This method will ensure that
             items that expire during the same script execution cycle all execute
             together, which is often more efficient than using a real setTimeout.

             ```javascript
             run.later(myContext, function() {
        // code here will execute within a RunLoop in about 500ms with this == myContext
      }, 500);
             ```

             @method later
             @param {Object} [target] target of method to invoke
             @param {Function|String} method The method to invoke.
             If you pass a string it will be resolved on the
             target at the time the method is invoked.
             @param {Object} [args*] Optional arguments to pass to the timeout.
             @param {Number} wait Number of milliseconds to wait.
             @return {Object} Timer information for use in cancelling, see `run.cancel`.
             */
            run.later = function(/*target, method*/) {
                return backburner.later.apply(backburner, arguments);
            };

            /**
             Schedule a function to run one time during the current RunLoop. This is equivalent
             to calling `scheduleOnce` with the "actions" queue.

             @method once
             @param {Object} [target] The target of the method to invoke.
             @param {Function|String} method The method to invoke.
             If you pass a string it will be resolved on the
             target at the time the method is invoked.
             @param {Object} [args*] Optional arguments to pass to the timeout.
             @return {Object} Timer information for use in cancelling, see `run.cancel`.
             */
            run.once = function(/*target, method */) {
                checkAutoRun();
                var length = arguments.length;
                var args = new Array(length);
                args[0] = 'actions';
                for (var i = 0; i < length; i++) {
                    args[i + 1] = arguments[i];
                }
                return apply(backburner, backburner.scheduleOnce, args);
            };

            /**
             Schedules a function to run one time in a given queue of the current RunLoop.
             Calling this method with the same queue/target/method combination will have
             no effect (past the initial call).

             Note that although you can pass optional arguments these will not be
             considered when looking for duplicates. New arguments will replace previous
             calls.

             ```javascript
             run(function() {
        var sayHi = function() { console.log('hi'); }
        run.scheduleOnce('afterRender', myContext, sayHi);
        run.scheduleOnce('afterRender', myContext, sayHi);
        // sayHi will only be executed once, in the afterRender queue of the RunLoop
      });
             ```

             Also note that passing an anonymous function to `run.scheduleOnce` will
             not prevent additional calls with an identical anonymous function from
             scheduling the items multiple times, e.g.:

             ```javascript
             function scheduleIt() {
        run.scheduleOnce('actions', myContext, function() { console.log("Closure"); });
      }
             scheduleIt();
             scheduleIt();
             // "Closure" will print twice, even though we're using `run.scheduleOnce`,
             // because the function we pass to it is anonymous and won't match the
             // previously scheduled operation.
             ```

             Available queues, and their order, can be found at `run.queues`

             @method scheduleOnce
             @param {String} [queue] The name of the queue to schedule against. Default queues are 'sync' and 'actions'.
             @param {Object} [target] The target of the method to invoke.
             @param {Function|String} method The method to invoke.
             If you pass a string it will be resolved on the
             target at the time the method is invoked.
             @param {Object} [args*] Optional arguments to pass to the timeout.
             @return {Object} Timer information for use in cancelling, see `run.cancel`.
             */
            run.scheduleOnce = function(/*queue, target, method*/) {
                checkAutoRun();
                return backburner.scheduleOnce.apply(backburner, arguments);
            };

            /**
             Schedules an item to run from within a separate run loop, after
             control has been returned to the system. This is equivalent to calling
             `run.later` with a wait time of 1ms.

             ```javascript
             run.next(myContext, function() {
        // code to be executed in the next run loop,
        // which will be scheduled after the current one
      });
             ```

             Multiple operations scheduled with `run.next` will coalesce
             into the same later run loop, along with any other operations
             scheduled by `run.later` that expire right around the same
             time that `run.next` operations will fire.

             Note that there are often alternatives to using `run.next`.
             For instance, if you'd like to schedule an operation to happen
             after all DOM element operations have completed within the current
             run loop, you can make use of the `afterRender` run loop queue (added
             by the `ember-views` package, along with the preceding `render` queue
             where all the DOM element operations happen). Example:

             ```javascript
             App.MyCollectionView = Alto.CollectionView.extend({
        didInsertElement: function() {
          run.scheduleOnce('afterRender', this, 'processChildElements');
        },
        processChildElements: function() {
          // ... do something with collectionView's child view
          // elements after they've finished rendering, which
          // can't be done within the CollectionView's
          // `didInsertElement` hook because that gets run
          // before the child elements have been added to the DOM.
        }
      });
             ```

             One benefit of the above approach compared to using `run.next` is
             that you will be able to perform DOM/CSS operations before unprocessed
             elements are rendered to the screen, which may prevent flickering or
             other artifacts caused by delaying processing until after rendering.

             The other major benefit to the above approach is that `run.next`
             introduces an element of non-determinism, which can make things much
             harder to test, due to its reliance on `setTimeout`; it's much harder
             to guarantee the order of scheduled operations when they are scheduled
             outside of the current run loop, i.e. with `run.next`.

             @method next
             @param {Object} [target] target of method to invoke
             @param {Function|String} method The method to invoke.
             If you pass a string it will be resolved on the
             target at the time the method is invoked.
             @param {Object} [args*] Optional arguments to pass to the timeout.
             @return {Object} Timer information for use in cancelling, see `run.cancel`.
             */
            run.next = function() {
                var args = slice.call(arguments);
                args.push(1);
                return apply(backburner, backburner.later, args);
            };

            /**
             Cancels a scheduled item. Must be a value returned by `run.later()`,
             `run.once()`, `run.next()`, `run.debounce()`, or
             `run.throttle()`.

             ```javascript
             var runNext = run.next(myContext, function() {
        // will not be executed
      });
             run.cancel(runNext);

             var runLater = run.later(myContext, function() {
        // will not be executed
      }, 500);
             run.cancel(runLater);

             var runOnce = run.once(myContext, function() {
        // will not be executed
      });
             run.cancel(runOnce);

             var throttle = run.throttle(myContext, function() {
        // will not be executed
      }, 1, false);
             run.cancel(throttle);

             var debounce = run.debounce(myContext, function() {
        // will not be executed
      }, 1);
             run.cancel(debounce);

             var debounceImmediate = run.debounce(myContext, function() {
        // will be executed since we passed in true (immediate)
      }, 100, true);
             // the 100ms delay until this method can be called again will be cancelled
             run.cancel(debounceImmediate);
             ```

             @method cancel
             @param {Object} timer Timer object to cancel
             @return {Boolean} true if cancelled or false/undefined if it wasn't found
             */
            run.cancel = function(timer) {
                return backburner.cancel(timer);
            };

            /**
             Delay calling the target method until the debounce period has elapsed
             with no additional debounce calls. If `debounce` is called again before
             the specified time has elapsed, the timer is reset and the entire period
             must pass again before the target method is called.

             This method should be used when an event may be called multiple times
             but the action should only be called once when the event is done firing.
             A common example is for scroll events where you only want updates to
             happen once scrolling has ceased.

             ```javascript
             var myFunc = function() { console.log(this.name + ' ran.'); };
             var myContext = {name: 'debounce'};

             run.debounce(myContext, myFunc, 150);

             // less than 150ms passes

             run.debounce(myContext, myFunc, 150);

             // 150ms passes
             // myFunc is invoked with context myContext
             // console logs 'debounce ran.' one time.
             ```

             Immediate allows you to run the function immediately, but debounce
             other calls for this function until the wait time has elapsed. If
             `debounce` is called again before the specified time has elapsed,
             the timer is reset and the entire period must pass again before
             the method can be called again.

             ```javascript
             var myFunc = function() { console.log(this.name + ' ran.'); };
             var myContext = {name: 'debounce'};

             run.debounce(myContext, myFunc, 150, true);

             // console logs 'debounce ran.' one time immediately.
             // 100ms passes

             run.debounce(myContext, myFunc, 150, true);

             // 150ms passes and nothing else is logged to the console and
             // the debouncee is no longer being watched

             run.debounce(myContext, myFunc, 150, true);

             // console logs 'debounce ran.' one time immediately.
             // 150ms passes and nothing else is logged to the console and
             // the debouncee is no longer being watched

             ```

             @method debounce
             @param {Object} [target] target of method to invoke
             @param {Function|String} method The method to invoke.
             May be a function or a string. If you pass a string
             then it will be looked up on the passed target.
             @param {Object} [args*] Optional arguments to pass to the timeout.
             @param {Number} wait Number of milliseconds to wait.
             @param {Boolean} immediate Trigger the function on the leading instead
             of the trailing edge of the wait interval. Defaults to false.
             @return {Array} Timer information for use in cancelling, see `run.cancel`.
             */
            run.debounce = function() {
                return backburner.debounce.apply(backburner, arguments);
            };

            /**
             Ensure that the target method is never called more frequently than
             the specified spacing period. The target method is called immediately.

             ```javascript
             var myFunc = function() { console.log(this.name + ' ran.'); };
             var myContext = {name: 'throttle'};

             run.throttle(myContext, myFunc, 150);
             // myFunc is invoked with context myContext
             // console logs 'throttle ran.'

             // 50ms passes
             run.throttle(myContext, myFunc, 150);

             // 50ms passes
             run.throttle(myContext, myFunc, 150);

             // 150ms passes
             run.throttle(myContext, myFunc, 150);
             // myFunc is invoked with context myContext
             // console logs 'throttle ran.'
             ```

             @method throttle
             @param {Object} [target] target of method to invoke
             @param {Function|String} method The method to invoke.
             May be a function or a string. If you pass a string
             then it will be looked up on the passed target.
             @param {Object} [args*] Optional arguments to pass to the timeout.
             @param {Number} spacing Number of milliseconds to space out requests.
             @param {Boolean} immediate Trigger the function on the leading instead
             of the trailing edge of the wait interval. Defaults to true.
             @return {Array} Timer information for use in cancelling, see `run.cancel`.
             */
            run.throttle = function() {
                return backburner.throttle.apply(backburner, arguments);
            };

            // Make sure it's not an autorun during testing
            function checkAutoRun() {
                if (!run.currentRunLoop) {
                    Alto.assert("You have turned on testing mode, which disabled the run-loop's autorun." +
                        " You will need to wrap any code with asynchronous side-effects in an run", !Alto.testing);
                }
            }

            /**
             Add a new named queue after the specified queue.

             The queue to add will only be added once.

             @method _addQueue
             @param {String} name the name of the queue to add.
             @param {String} after the name of the queue to add after.
             @private
             */
            run._addQueue = function(name, after) {
                if (indexOf.call(run.queues, name) === -1) {
                    run.queues.splice(indexOf.call(run.queues, after)+1, 0, name);
                }
            };
        });
    enifed("ember-metal/set_properties",
        ["ember-metal/property_events","ember-metal/property_set","ember-metal/keys","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            "use strict";
            var changeProperties = __dependency1__.changeProperties;
            var set = __dependency2__.set;
            var keys = __dependency3__["default"];

            /**
             Set a list of properties on an object. These properties are set inside
             a single `beginPropertyChanges` and `endPropertyChanges` batch, so
             observers will be buffered.

             ```javascript
             var anObject = Alto.Object.create();

             anObject.setProperties({
        firstName: 'Stanley',
        lastName: 'Stuart',
        age: 21
      });
             ```

             @method setProperties
             @param obj
             @param {Object} properties
             @return obj
             */
            __exports__["default"] = function setProperties(obj, properties) {
                if (!properties || typeof properties !== "object") { return obj; }
                changeProperties(function() {
                    var props = keys(properties);
                    var propertyName;

                    for (var i = 0, l = props.length; i < l; i++) {
                        propertyName = props[i];

                        set(obj, propertyName, properties[propertyName]);
                    }
                });
                return obj;
            }
        });
    enifed("ember-metal/streams/read",
        ["exports"],
        function(__exports__) {
            "use strict";
            function read(object) {
                if (object && object.isStream) {
                    return object.value();
                } else {
                    return object;
                }
            }

            __exports__.read = read;function readArray(array) {
                var length = array.length;
                var ret = new Array(length);
                for (var i = 0; i < length; i++) {
                    ret[i] = read(array[i]);
                }
                return ret;
            }

            __exports__.readArray = readArray;function readHash(object) {
                var ret = {};
                for (var key in object) {
                    ret[key] = read(object[key]);
                }
                return ret;
            }

            __exports__.readHash = readHash;
        });
    enifed("ember-metal/streams/simple",
        ["ember-metal/merge","ember-metal/streams/stream","ember-metal/platform","ember-metal/streams/read","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            var merge = __dependency1__["default"];
            var Stream = __dependency2__["default"];
            var create = __dependency3__.create;
            var read = __dependency4__.read;

            function SimpleStream(source) {
                this.source = source;

                if (source && source.isStream) {
                    source.subscribe(this._didChange, this);
                }
            }

            SimpleStream.prototype = create(Stream.prototype);

            merge(SimpleStream.prototype, {
                valueFn: function() {
                    return read(this.source);
                },

                setValue: function(value) {
                    var source = this.source;

                    if (source && source.isStream) {
                        source.setValue(value);
                    }
                },

                setSource: function(nextSource) {
                    var prevSource = this.source;
                    if (nextSource !== prevSource) {
                        if (prevSource && prevSource.isStream) {
                            prevSource.unsubscribe(this._didChange, this);
                        }

                        if (nextSource && nextSource.isStream) {
                            nextSource.subscribe(this._didChange, this);
                        }

                        this.source = nextSource;
                        this.notify();
                    }
                },

                _didChange: function() {
                    this.notify();
                },

                destroy: function() {
                    if (this.source && this.source.isStream) {
                        this.source.unsubscribe(this._didChange, this);
                    }

                    this.source = undefined;
                    Stream.prototype.destroy.call(this);
                }
            });

            __exports__["default"] = SimpleStream;
        });
    enifed("ember-metal/streams/stream",
        ["ember-metal/platform","ember-metal/path_cache","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var create = __dependency1__.create;
            var getFirstKey = __dependency2__.getFirstKey;
            var getTailPath = __dependency2__.getTailPath;

            var NIL = function NIL(){};

            function Stream(fn) {
                this.valueFn = fn;
                this.cache = NIL;
                this.subscribers = undefined;
                this.children = undefined;
                this.destroyed = false;
            }

            Stream.prototype = {
                isStream: true,

                cache: NIL,

                get: function(path) {
                    var firstKey = getFirstKey(path);
                    var tailPath = getTailPath(path);

                    if (this.children === undefined) {
                        this.children = create(null);
                    }

                    var keyStream = this.children[firstKey];

                    if (keyStream === undefined) {
                        keyStream = this._makeChildStream(firstKey, path);
                        this.children[firstKey] = keyStream;
                    }

                    if (tailPath === undefined) {
                        return keyStream;
                    } else {
                        return keyStream.get(tailPath);
                    }
                },

                value: function() {
                    if (this.cache !== NIL) {
                        return this.cache;
                    } else {
                        return this.cache = this.valueFn();
                    }
                },

                setValue: function() {
                    throw new Error("Stream error: setValue not implemented");
                },

                notify: function() {
                    this.notifyExcept();
                },

                notifyExcept: function(callbackToSkip, contextToSkip) {
                    if (this.cache !== NIL) {
                        this.cache = NIL;
                        this.notifySubscribers(callbackToSkip, contextToSkip);
                    }
                },

                subscribe: function(callback, context) {
                    if (this.subscribers === undefined) {
                        this.subscribers = [callback, context];
                    } else {
                        this.subscribers.push(callback, context);
                    }
                },

                unsubscribe: function(callback, context) {
                    var subscribers = this.subscribers;

                    if (subscribers !== undefined) {
                        for (var i = 0, l = subscribers.length; i < l; i += 2) {
                            if (subscribers[i] === callback && subscribers[i+1] === context) {
                                subscribers.splice(i, 2);
                                return;
                            }
                        }
                    }
                },

                notifySubscribers: function(callbackToSkip, contextToSkip) {
                    var subscribers = this.subscribers;

                    if (subscribers !== undefined) {
                        for (var i = 0, l = subscribers.length; i < l; i += 2) {
                            var callback = subscribers[i];
                            var context = subscribers[i+1];

                            if (callback === callbackToSkip && context === contextToSkip) {
                                continue;
                            }

                            if (context === undefined) {
                                callback(this);
                            } else {
                                callback.call(context, this);
                            }
                        }
                    }
                },

                destroy: function() {
                    if (this.destroyed) return;
                    this.destroyed = true;

                    var children = this.children;
                    for (var key in children) {
                        children[key].destroy();
                    }
                },

                isGlobal: function() {
                    var stream = this;
                    while (stream !== undefined) {
                        if (stream._isRoot) {
                            return stream._isGlobal;
                        }
                        stream = stream.source;
                    }
                }
            };

            __exports__["default"] = Stream;
        });
    enifed("ember-metal/streams/stream_binding",
        ["ember-metal/platform","ember-metal/merge","ember-metal/run_loop","ember-metal/streams/stream","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            var create = __dependency1__.create;
            var merge = __dependency2__["default"];
            var run = __dependency3__["default"];
            var Stream = __dependency4__["default"];

            function StreamBinding(stream) {
                Alto.assert("StreamBinding error: tried to bind to object that is not a stream", stream && stream.isStream);

                this.stream = stream;
                this.senderCallback = undefined;
                this.senderContext = undefined;
                this.senderValue = undefined;
                this.destroyed = false;

                stream.subscribe(this._onNotify, this);
            }

            StreamBinding.prototype = create(Stream.prototype);

            merge(StreamBinding.prototype, {
                valueFn: function() {
                    return this.stream.value();
                },

                _onNotify: function() {
                    this._scheduleSync(undefined, undefined, this);
                },

                setValue: function(value, callback, context) {
                    this._scheduleSync(value, callback, context);
                },

                _scheduleSync: function(value, callback, context) {
                    if (this.senderCallback === undefined && this.senderContext === undefined) {
                        this.senderCallback = callback;
                        this.senderContext = context;
                        this.senderValue = value;
                        run.schedule('sync', this, this._sync);
                    } else if (this.senderContext !== this) {
                        this.senderCallback = callback;
                        this.senderContext = context;
                        this.senderValue = value;
                    }
                },

                _sync: function() {
                    if (this.destroyed) {
                        return;
                    }

                    if (this.senderContext !== this) {
                        this.stream.setValue(this.senderValue);
                    }

                    var senderCallback = this.senderCallback;
                    var senderContext = this.senderContext;
                    this.senderCallback = undefined;
                    this.senderContext = undefined;
                    this.senderValue = undefined;

                    // Force StreamBindings to always notify
                    this.cache = undefined;

                    this.notifyExcept(senderCallback, senderContext);
                },

                destroy: function() {
                    if (this.destroyed) {
                        return;
                    }

                    this.destroyed = true;
                    this.stream.unsubscribe(this._onNotify, this);
                }
            });

            __exports__["default"] = StreamBinding;
        });
    enifed("ember-metal/utils",
        ["ember-metal/core","ember-metal/platform","ember-metal/array","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            // Remove "use strict"; from transpiled module until
            // https://bugs.webkit.org/show_bug.cgi?id=138038 is fixed
            //
            // REMOVE_USE_STRICT: true

            var Alto = __dependency1__["default"];
            var o_defineProperty = __dependency2__.defineProperty;
            var canDefineNonEnumerableProperties = __dependency2__.canDefineNonEnumerableProperties;
            var hasPropertyAccessors = __dependency2__.hasPropertyAccessors;
            var o_create = __dependency2__.create;

            var forEach = __dependency3__.forEach;

            /**
             @module ember-metal
             */

            /**
             Previously we used `Alto.$.uuid`, however `$.uuid` has been removed from
             jQuery master. We'll just bootstrap our own uuid now.

             @private
             @return {Number} the uuid
             */
            var _uuid = 0;

            /**
             Generates a universally unique identifier. This method
             is used internally by Alto for assisting with
             the generation of GUID's and other unique identifiers
             such as `bind-attr` data attributes.

             @public
             @return {Number} [description]
             */
            function uuid() {
                return ++_uuid;
            }

            __exports__.uuid = uuid;/**
             Prefix used for guids through out Alto.
             @private
             @property GUID_PREFIX
             @for Alto
             @type String
             @final
             */
            var GUID_PREFIX = 'alto';

            // Used for guid generation...
            var numberCache  = [];
            var stringCache  = {};

            /**
             Strongly hint runtimes to intern the provided string.

             When do I need to use this function?

             For the most part, never. Pre-mature optimization is bad, and often the
             runtime does exactly what you need it to, and more often the trade-off isn't
             worth it.

             Why?

             Runtimes store strings in at least 2 different representations:
             Ropes and Symbols (interned strings). The Rope provides a memory efficient
             data-structure for strings created from concatenation or some other string
             manipulation like splitting.

             Unfortunately checking equality of different ropes can be quite costly as
             runtimes must resort to clever string comparison algorithims. These
             algorithims typically cost in proportion to the length of the string.
             Luckily, this is where the Symbols (interned strings) shine. As Symbols are
             unique by their string content, equality checks can be done by pointer
             comparision.

             How do I know if my string is a rope or symbol?

             Typically (warning general sweeping statement, but truthy in runtimes at
             present) static strings created as part of the JS source are interned.
             Strings often used for comparisions can be interned at runtime if some
             criteria are met.  One of these criteria can be the size of the entire rope.
             For example, in chrome 38 a rope longer then 12 characters will not
             intern, nor will segments of that rope.

             Some numbers: http://jsperf.com/eval-vs-keys/8

             Known Trick™

             @private
             @return {String} interned version of the provided string
             */
            function intern(str) {
                var obj = {};
                obj[str] = 1;
                for (var key in obj) {
                    if (key === str) return key;
                }
                return str;
            }

            /**
             A unique key used to assign guids and other private metadata to objects.
             If you inspect an object in your browser debugger you will often see these.
             They can be safely ignored.

             On browsers that support it, these properties are added with enumeration
             disabled so they won't show up when you iterate over your properties.

             @private
             @property GUID_KEY
             @for Alto
             @type String
             @final
             */
            var GUID_KEY = intern('__alto' + (+ new Date()));

            var GUID_DESC = {
                writable:    false,
                configurable: false,
                enumerable:  false,
                value: null
            };

            /**
             Generates a new guid, optionally saving the guid to the object that you
             pass in. You will rarely need to use this method. Instead you should
             call `Alto.guidFor(obj)`, which return an existing guid if available.

             @private
             @method generateGuid
             @for Alto
             @param {Object} [obj] Object the guid will be used for. If passed in, the guid will
             be saved on the object and reused whenever you pass the same object
             again.

             If no object is passed, just generate a new guid.
             @param {String} [prefix] Prefix to place in front of the guid. Useful when you want to
             separate the guid into separate namespaces.
             @return {String} the guid
             */
            function generateGuid(obj, prefix) {
                if (!prefix) prefix = GUID_PREFIX;
                var ret = (prefix + uuid());
                if (obj) {
                    if (obj[GUID_KEY] === null) {
                        obj[GUID_KEY] = ret;
                    } else {
                        GUID_DESC.value = ret;
                        o_defineProperty(obj, GUID_KEY, GUID_DESC);
                    }
                }
                return ret;
            }

            __exports__.generateGuid = generateGuid;/**
             Returns a unique id for the object. If the object does not yet have a guid,
             one will be assigned to it. You can call this on any object,
             `Alto.Object`-based or not, but be aware that it will add a `_guid`
             property.

             You can also use this method on DOM Element objects.

             @private
             @method guidFor
             @for Alto
             @param {Object} obj any object, string, number, Element, or primitive
             @return {String} the unique guid for this instance.
             */
            function guidFor(obj) {

                // special cases where we don't want to add a key to object
                if (obj === undefined) return "(undefined)";
                if (obj === null) return "(null)";

                var ret;
                var type = typeof obj;

                // Don't allow prototype changes to String etc. to change the guidFor
                switch(type) {
                    case 'number':
                        ret = numberCache[obj];
                        if (!ret) ret = numberCache[obj] = 'nu'+obj;
                        return ret;

                    case 'string':
                        ret = stringCache[obj];
                        if (!ret) ret = stringCache[obj] = 'st' + uuid();
                        return ret;

                    case 'boolean':
                        return obj ? '(true)' : '(false)';

                    default:
                        if (obj[GUID_KEY]) return obj[GUID_KEY];
                        if (obj === Object) return '(Object)';
                        if (obj === Array)  return '(Array)';
                        ret = GUID_PREFIX + uuid();

                        if (obj[GUID_KEY] === null) {
                            obj[GUID_KEY] = ret;
                        } else {
                            GUID_DESC.value = ret;
                            o_defineProperty(obj, GUID_KEY, GUID_DESC);
                        }
                        return ret;
                }
            }

            __exports__.guidFor = guidFor;// ..........................................................
            // META
            //

            var META_DESC = {
                writable: true,
                configurable: false,
                enumerable: false,
                value: null
            };

            function Meta(obj) {
                this.descs = {};
                this.watching = {};
                this.cache = {};
                this.cacheMeta = {};
                this.source = obj;
                this.deps = undefined;
                this.listeners = undefined;
                this.mixins = undefined;
                this.bindings = undefined;
                this.chains = undefined;
                this.values = undefined;
                this.proto = undefined;
            }

            Meta.prototype = {
                chainWatchers: null
            };

            if (!canDefineNonEnumerableProperties) {
                // on platforms that don't support enumerable false
                // make meta fail jQuery.isPlainObject() to hide from
                // jQuery.extend() by having a property that fails
                // hasOwnProperty check.
                Meta.prototype.__preventPlainObject__ = true;

                // Without non-enumerable properties, meta objects will be output in JSON
                // unless explicitly suppressed
                Meta.prototype.toJSON = function () { };
            }

            // Placeholder for non-writable metas.
            var EMPTY_META = new Meta(null);


            if (hasPropertyAccessors) {
                EMPTY_META.values = {};
            }


            /**
             Retrieves the meta hash for an object. If `writable` is true ensures the
             hash is writable for this object as well.

             The meta object contains information about computed property descriptors as
             well as any watched properties and other information. You generally will
             not access this information directly but instead work with higher level
             methods that manipulate this hash indirectly.

             @method meta
             @for Alto
             @private

             @param {Object} obj The object to retrieve meta for
             @param {Boolean} [writable=true] Pass `false` if you do not intend to modify
             the meta hash, allowing the method to avoid making an unnecessary copy.
             @return {Object} the meta hash for an object
             */
            function meta(obj, writable) {
                var ret = obj['__alto_meta__'];
                if (writable===false) return ret || EMPTY_META;

                if (!ret) {
                    if (canDefineNonEnumerableProperties) o_defineProperty(obj, '__alto_meta__', META_DESC);

                    ret = new Meta(obj);


                    if (hasPropertyAccessors) {
                        ret.values = {};
                    }


                    obj['__alto_meta__'] = ret;

                    // make sure we don't accidentally try to create constructor like desc
                    ret.descs.constructor = null;

                } else if (ret.source !== obj) {
                    if (canDefineNonEnumerableProperties) o_defineProperty(obj, '__alto_meta__', META_DESC);

                    ret = o_create(ret);
                    ret.descs     = o_create(ret.descs);
                    ret.watching  = o_create(ret.watching);
                    ret.cache     = {};
                    ret.cacheMeta = {};
                    ret.source    = obj;


                    if (hasPropertyAccessors) {
                        ret.values = o_create(ret.values);
                    }


                    obj['__alto_meta__'] = ret;
                }
                return ret;
            }

            function getMeta(obj, property) {
                var _meta = meta(obj, false);
                return _meta[property];
            }

            __exports__.getMeta = getMeta;function setMeta(obj, property, value) {
                var _meta = meta(obj, true);
                _meta[property] = value;
                return value;
            }

            __exports__.setMeta = setMeta;/**
             @deprecated
             @private

             In order to store defaults for a class, a prototype may need to create
             a default meta object, which will be inherited by any objects instantiated
             from the class's constructor.

             However, the properties of that meta object are only shallow-cloned,
             so if a property is a hash (like the event system's `listeners` hash),
             it will by default be shared across all instances of that class.

             This method allows extensions to deeply clone a series of nested hashes or
             other complex objects. For instance, the event system might pass
             `['listeners', 'foo:change', 'ember157']` to `prepareMetaPath`, which will
             walk down the keys provided.

             For each key, if the key does not exist, it is created. If it already
             exists and it was inherited from its constructor, the constructor's
             key is cloned.

             You can also pass false for `writable`, which will simply return
             undefined if `prepareMetaPath` discovers any part of the path that
             shared or undefined.

             @method metaPath
             @for Alto
             @param {Object} obj The object whose meta we are examining
             @param {Array} path An array of keys to walk down
             @param {Boolean} writable whether or not to create a new meta
             (or meta property) if one does not already exist or if it's
             shared with its constructor
             */
            function metaPath(obj, path, writable) {
                Alto.deprecate("Alto.metaPath is deprecated and will be removed from future releases.");
                var _meta = meta(obj, writable);
                var keyName, value;

                for (var i=0, l=path.length; i<l; i++) {
                    keyName = path[i];
                    value = _meta[keyName];

                    if (!value) {
                        if (!writable) { return undefined; }
                        value = _meta[keyName] = { __alto_source__: obj };
                    } else if (value.__alto_source__ !== obj) {
                        if (!writable) { return undefined; }
                        value = _meta[keyName] = o_create(value);
                        value.__alto_source__ = obj;
                    }

                    _meta = value;
                }

                return value;
            }

            __exports__.metaPath = metaPath;/**
             Wraps the passed function so that `this._super` will point to the superFunc
             when the function is invoked. This is the primitive we use to implement
             calls to super.

             @private
             @method wrap
             @for Alto
             @param {Function} func The function to call
             @param {Function} superFunc The super function.
             @return {Function} wrapped function.
             */
            function wrap(func, superFunc) {
                function superWrapper() {
                    var ret;
                    var sup  = this && this.__nextSuper;
                    var args = new Array(arguments.length);
                    for (var i = 0, l = args.length; i < l; i++) {
                        args[i] = arguments[i];
                    }
                    if(this) { this.__nextSuper = superFunc; }
                    ret = apply(this, func, args);
                    if(this) { this.__nextSuper = sup; }
                    return ret;
                }

                superWrapper.wrappedFunction = func;
                superWrapper.wrappedFunction.__alto_arity__ = func.length;
                superWrapper.__alto_observes__ = func.__alto_observes__;
                superWrapper.__alto_observesBefore__ = func.__alto_observesBefore__;
                superWrapper.__alto_listens__ = func.__alto_listens__;

                return superWrapper;
            }

            __exports__.wrap = wrap;var AltoArray;

            /**
             Returns true if the passed object is an array or Array-like.

             Alto Array Protocol:

             - the object has an objectAt property
             - the object is a native Array
             - the object is an Object, and has a length property

             Unlike `Alto.typeOf` this method returns true even if the passed object is
             not formally array but appears to be array-like (i.e. implements `Alto.Array`)

             ```javascript
             Alto.isArray();                                          // false
             Alto.isArray([]);                                        // true
             Alto.isArray(Alto.ArrayProxy.create({ content: [] }));  // true
             ```

             @method isArray
             @for Alto
             @param {Object} obj The object to test
             @return {Boolean} true if the passed object is an array or Array-like
             */
            // ES6TODO: Move up to runtime? This is only use in ember-metal by concatenatedProperties
            function isArray(obj) {
                var modulePath, type;

                if (typeof AltoArray === "undefined") {
                    modulePath = 'ember-runtime/mixins/array';
                    if (Alto.__loader.registry[modulePath]) {
                        AltoArray = Alto.__loader.require(modulePath)['default'];
                    }
                }

                if (!obj || obj.setInterval) { return false; }
                if (Array.isArray && Array.isArray(obj)) { return true; }
                if (AltoArray && AltoArray.detect(obj)) { return true; }

                type = typeOf(obj);
                if ('array' === type) { return true; }
                if ((obj.length !== undefined) && 'object' === type) { return true; }
                return false;
            }

            /**
             Forces the passed object to be part of an array. If the object is already
             an array or array-like, it will return the object. Otherwise, it will add the object to
             an array. If obj is `null` or `undefined`, it will return an empty array.

             ```javascript
             Alto.makeArray();            // []
             Alto.makeArray(null);        // []
             Alto.makeArray(undefined);   // []
             Alto.makeArray('lindsay');   // ['lindsay']
             Alto.makeArray([1, 2, 42]);  // [1, 2, 42]

             var controller = Alto.ArrayProxy.create({ content: [] });

             Alto.makeArray(controller) === controller;  // true
             ```

             @method makeArray
             @for Alto
             @param {Object} obj the object
             @return {Array}
             */
            function makeArray(obj) {
                if (obj === null || obj === undefined) { return []; }
                return isArray(obj) ? obj : [obj];
            }

            __exports__.makeArray = makeArray;/**
             Checks to see if the `methodName` exists on the `obj`.

             ```javascript
             var foo = { bar: Alto.K, baz: null };

             Alto.canInvoke(foo, 'bar'); // true
             Alto.canInvoke(foo, 'baz'); // false
             Alto.canInvoke(foo, 'bat'); // false
             ```

             @method canInvoke
             @for Alto
             @param {Object} obj The object to check for the method
             @param {String} methodName The method name to check for
             @return {Boolean}
             */
            function canInvoke(obj, methodName) {
                return !!(obj && typeof obj[methodName] === 'function');
            }

            /**
             Checks to see if the `methodName` exists on the `obj`,
             and if it does, invokes it with the arguments passed.

             ```javascript
             var d = new Date('03/15/2013');

             Alto.tryInvoke(d, 'getTime');              // 1363320000000
             Alto.tryInvoke(d, 'setFullYear', [2014]);  // 1394856000000
             Alto.tryInvoke(d, 'noSuchMethod', [2014]); // undefined
             ```

             @method tryInvoke
             @for Alto
             @param {Object} obj The object to check for the method
             @param {String} methodName The method name to check for
             @param {Array} [args] The arguments to pass to the method
             @return {*} the return value of the invoked method or undefined if it cannot be invoked
             */
            function tryInvoke(obj, methodName, args) {
                if (canInvoke(obj, methodName)) {
                    return args ? applyStr(obj, methodName, args) : applyStr(obj, methodName);
                }
            }

            __exports__.tryInvoke = tryInvoke;// https://github.com/emberjs/ember.js/pull/1617
            var needsFinallyFix = (function() {
                var count = 0;
                try{
                    try { }
                    finally {
                        count++;
                        throw new Error('needsFinallyFixTest');
                    }
                } catch (e) {}

                return count !== 1;
            })();

            /**
             Provides try/finally functionality, while working
             around Safari's double finally bug.

             ```javascript
             var tryable = function() {
        someResource.lock();
        runCallback(); // May throw error.
      };

             var finalizer = function() {
        someResource.unlock();
      };

             Alto.tryFinally(tryable, finalizer);
             ```

             @method tryFinally
             @for Alto
             @param {Function} tryable The function to run the try callback
             @param {Function} finalizer The function to run the finally callback
             @param {Object} [binding] The optional calling object. Defaults to 'this'
             @return {*} The return value is the that of the finalizer,
             unless that value is undefined, in which case it is the return value
             of the tryable
             */

            var tryFinally;
            if (needsFinallyFix) {
                tryFinally = function(tryable, finalizer, binding) {
                    var result, finalResult, finalError;

                    binding = binding || this;

                    try {
                        result = tryable.call(binding);
                    } finally {
                        try {
                            finalResult = finalizer.call(binding);
                        } catch (e) {
                            finalError = e;
                        }
                    }

                    if (finalError) { throw finalError; }

                    return (finalResult === undefined) ? result : finalResult;
                };
            } else {
                tryFinally = function(tryable, finalizer, binding) {
                    var result, finalResult;

                    binding = binding || this;

                    try {
                        result = tryable.call(binding);
                    } finally {
                        finalResult = finalizer.call(binding);
                    }

                    return (finalResult === undefined) ? result : finalResult;
                };
            }

            /**
             Provides try/catch/finally functionality, while working
             around Safari's double finally bug.

             ```javascript
             var tryable = function() {
        for (i = 0, l = listeners.length; i < l; i++) {
          listener = listeners[i];
          beforeValues[i] = listener.before(name, time(), payload);
        }

        return callback.call(binding);
      };

             var catchable = function(e) {
        payload = payload || {};
        payload.exception = e;
      };

             var finalizer = function() {
        for (i = 0, l = listeners.length; i < l; i++) {
          listener = listeners[i];
          listener.after(name, time(), payload, beforeValues[i]);
        }
      };

             Alto.tryCatchFinally(tryable, catchable, finalizer);
             ```

             @method tryCatchFinally
             @for Alto
             @param {Function} tryable The function to run the try callback
             @param {Function} catchable The function to run the catchable callback
             @param {Function} finalizer The function to run the finally callback
             @param {Object} [binding] The optional calling object. Defaults to 'this'
             @return {*} The return value is the that of the finalizer,
             unless that value is undefined, in which case it is the return value
             of the tryable.
             */
            var tryCatchFinally;
            if (needsFinallyFix) {
                tryCatchFinally = function(tryable, catchable, finalizer, binding) {
                    var result, finalResult, finalError;

                    binding = binding || this;

                    try {
                        result = tryable.call(binding);
                    } catch(error) {
                        result = catchable.call(binding, error);
                    } finally {
                        try {
                            finalResult = finalizer.call(binding);
                        } catch (e) {
                            finalError = e;
                        }
                    }

                    if (finalError) { throw finalError; }

                    return (finalResult === undefined) ? result : finalResult;
                };
            } else {
                tryCatchFinally = function(tryable, catchable, finalizer, binding) {
                    var result, finalResult;

                    binding = binding || this;

                    try {
                        result = tryable.call(binding);
                    } catch(error) {
                        result = catchable.call(binding, error);
                    } finally {
                        finalResult = finalizer.call(binding);
                    }

                    return (finalResult === undefined) ? result : finalResult;
                };
            }

            // ........................................
            // TYPING & ARRAY MESSAGING
            //

            var TYPE_MAP = {};
            var t = "Boolean Number String Function Array Date RegExp Object".split(" ");
            forEach.call(t, function(name) {
                TYPE_MAP[ "[object " + name + "]" ] = name.toLowerCase();
            });

            var toString = Object.prototype.toString;

            var AltoObject;

            /**
             Returns a consistent type for the passed item.

             Use this instead of the built-in `typeof` to get the type of an item.
             It will return the same result across all browsers and includes a bit
             more detail. Here is what will be returned:

             | Return Value  | Meaning                                              |
             |---------------|------------------------------------------------------|
             | 'string'      | String primitive or String object.                   |
             | 'number'      | Number primitive or Number object.                   |
             | 'boolean'     | Boolean primitive or Boolean object.                 |
             | 'null'        | Null value                                           |
             | 'undefined'   | Undefined value                                      |
             | 'function'    | A function                                           |
             | 'array'       | An instance of Array                                 |
             | 'regexp'      | An instance of RegExp                                |
             | 'date'        | An instance of Date                                  |
             | 'class'       | An Alto class (created using Alto.Object.extend()) |
             | 'instance'    | An Alto object instance                             |
             | 'error'       | An instance of the Error object                      |
             | 'object'      | A JavaScript object not inheriting from Alto.Object |

             Examples:

             ```javascript
             Alto.typeOf();                       // 'undefined'
             Alto.typeOf(null);                   // 'null'
             Alto.typeOf(undefined);              // 'undefined'
             Alto.typeOf('michael');              // 'string'
             Alto.typeOf(new String('michael'));  // 'string'
             Alto.typeOf(101);                    // 'number'
             Alto.typeOf(new Number(101));        // 'number'
             Alto.typeOf(true);                   // 'boolean'
             Alto.typeOf(new Boolean(true));      // 'boolean'
             Alto.typeOf(Alto.makeArray);        // 'function'
             Alto.typeOf([1, 2, 90]);             // 'array'
             Alto.typeOf(/abc/);                  // 'regexp'
             Alto.typeOf(new Date());             // 'date'
             Alto.typeOf(Alto.Object.extend());  // 'class'
             Alto.typeOf(Alto.Object.create());  // 'instance'
             Alto.typeOf(new Error('teamocil'));  // 'error'

             // 'normal' JavaScript object
             Alto.typeOf({ a: 'b' });             // 'object'
             ```

             @method typeOf
             @for Alto
             @param {Object} item the item to check
             @return {String} the type
             */
            function typeOf(item) {
                var ret, modulePath;

                // ES6TODO: Depends on Alto.Object which is defined in runtime.
                if (typeof AltoObject === "undefined") {
                    modulePath = 'ember-runtime/system/object';
                    if (Alto.__loader.registry[modulePath]) {
                        AltoObject = Alto.__loader.require(modulePath)['default'];
                    }
                }

                ret = (item === null || item === undefined) ? String(item) : TYPE_MAP[toString.call(item)] || 'object';

                if (ret === 'function') {
                    if (AltoObject && AltoObject.detect(item)) ret = 'class';
                } else if (ret === 'object') {
                    if (item instanceof Error) ret = 'error';
                    else if (AltoObject && item instanceof AltoObject) ret = 'instance';
                    else if (item instanceof Date) ret = 'date';
                }

                return ret;
            }

            /**
             Convenience method to inspect an object. This method will attempt to
             convert the object into a useful string description.

             It is a pretty simple implementation. If you want something more robust,
             use something like JSDump: https://github.com/NV/jsDump

             @method inspect
             @for Alto
             @param {Object} obj The object you want to inspect.
             @return {String} A description of the object
             @since 1.4.0
             */
            function inspect(obj) {
                var type = typeOf(obj);
                if (type === 'array') {
                    return '[' + obj + ']';
                }
                if (type !== 'object') {
                    return obj + '';
                }

                var v;
                var ret = [];
                for(var key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        v = obj[key];
                        if (v === 'toString') { continue; } // ignore useless items
                        if (typeOf(v) === 'function') { v = "function() { ... }"; }

                        if (v && typeof v.toString !== 'function') {
                            ret.push(key + ": " + toString.call(v));
                        } else {
                            ret.push(key + ": " + v);
                        }
                    }
                }
                return "{" + ret.join(", ") + "}";
            }

            __exports__.inspect = inspect;// The following functions are intentionally minified to keep the functions
            // below Chrome's function body size inlining limit of 600 chars.

            function apply(t /* target */, m /* method */, a /* args */) {
                var l = a && a.length;
                if (!a || !l) { return m.call(t); }
                switch (l) {
                    case 1:  return m.call(t, a[0]);
                    case 2:  return m.call(t, a[0], a[1]);
                    case 3:  return m.call(t, a[0], a[1], a[2]);
                    case 4:  return m.call(t, a[0], a[1], a[2], a[3]);
                    case 5:  return m.call(t, a[0], a[1], a[2], a[3], a[4]);
                    default: return m.apply(t, a);
                }
            }

            __exports__.apply = apply;function applyStr(t /* target */, m /* method */, a /* args */) {
                var l = a && a.length;
                if (!a || !l) { return t[m](); }
                switch (l) {
                    case 1:  return t[m](a[0]);
                    case 2:  return t[m](a[0], a[1]);
                    case 3:  return t[m](a[0], a[1], a[2]);
                    case 4:  return t[m](a[0], a[1], a[2], a[3]);
                    case 5:  return t[m](a[0], a[1], a[2], a[3], a[4]);
                    default: return t[m].apply(t, a);
                }
            }

            __exports__.applyStr = applyStr;__exports__.GUID_KEY = GUID_KEY;
            __exports__.META_DESC = META_DESC;
            __exports__.EMPTY_META = EMPTY_META;
            __exports__.meta = meta;
            __exports__.typeOf = typeOf;
            __exports__.tryCatchFinally = tryCatchFinally;
            __exports__.isArray = isArray;
            __exports__.canInvoke = canInvoke;
            __exports__.tryFinally = tryFinally;
        });
    enifed("ember-metal/watch_key",
        ["ember-metal/core","ember-metal/utils","ember-metal/platform","ember-metal/properties","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            var metaFor = __dependency2__.meta;
            var typeOf = __dependency2__.typeOf;
            var o_defineProperty = __dependency3__.defineProperty;
            var hasPropertyAccessors = __dependency3__.hasPropertyAccessors;
            var MANDATORY_SETTER_FUNCTION = __dependency4__.MANDATORY_SETTER_FUNCTION;
            var DEFAULT_GETTER_FUNCTION = __dependency4__.DEFAULT_GETTER_FUNCTION;

            function watchKey(obj, keyName, meta) {
                // can't watch length on Array - it is special...
                if (keyName === 'length' && typeOf(obj) === 'array') { return; }

                var m = meta || metaFor(obj), watching = m.watching;

                // activate watching first time
                if (!watching[keyName]) {
                    watching[keyName] = 1;

                    var desc = m.descs[keyName];
                    if (desc && desc.willWatch) { desc.willWatch(obj, keyName); }

                    if ('function' === typeof obj.willWatchProperty) {
                        obj.willWatchProperty(keyName);
                    }


                    if (hasPropertyAccessors) {
                        handleMandatorySetter(m, obj, keyName);
                    }

                } else {
                    watching[keyName] = (watching[keyName] || 0) + 1;
                }
            }

            __exports__.watchKey = watchKey;

            var handleMandatorySetter = function handleMandatorySetter(m, obj, keyName) {
                var descriptor = Object.getOwnPropertyDescriptor && Object.getOwnPropertyDescriptor(obj, keyName);
                var configurable = descriptor ? descriptor.configurable : true;

                // this x in Y deopts, so keeping it in this function is better;
                if (configurable && keyName in obj) {
                    m.values[keyName] = obj[keyName];
                    o_defineProperty(obj, keyName, {
                        configurable: true,
                        enumerable: Object.prototype.propertyIsEnumerable.call(obj, keyName),
                        set: MANDATORY_SETTER_FUNCTION(keyName),
                        get: DEFAULT_GETTER_FUNCTION(keyName)
                    });
                }
            };


            function unwatchKey(obj, keyName, meta) {
                var m = meta || metaFor(obj);
                var watching = m.watching;

                if (watching[keyName] === 1) {
                    watching[keyName] = 0;

                    var desc = m.descs[keyName];
                    if (desc && desc.didUnwatch) { desc.didUnwatch(obj, keyName); }

                    if ('function' === typeof obj.didUnwatchProperty) {
                        obj.didUnwatchProperty(keyName);
                    }


                    if (hasPropertyAccessors && keyName in obj) {
                        o_defineProperty(obj, keyName, {
                            configurable: true,
                            enumerable: Object.prototype.propertyIsEnumerable.call(obj, keyName),
                            set: function(val) {
                                // redefine to set as enumerable
                                o_defineProperty(obj, keyName, {
                                    configurable: true,
                                    writable: true,
                                    enumerable: true,
                                    value: val
                                });
                                delete m.values[keyName];
                            },
                            get: DEFAULT_GETTER_FUNCTION(keyName)
                        });
                    }

                } else if (watching[keyName] > 1) {
                    watching[keyName]--;
                }
            }

            __exports__.unwatchKey = unwatchKey;
        });
    enifed("ember-metal/watch_path",
        ["ember-metal/utils","ember-metal/chains","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var metaFor = __dependency1__.meta;
            var typeOf = __dependency1__.typeOf;
            var ChainNode = __dependency2__.ChainNode;

            // get the chains for the current object. If the current object has
            // chains inherited from the proto they will be cloned and reconfigured for
            // the current object.
            function chainsFor(obj, meta) {
                var m = meta || metaFor(obj);
                var ret = m.chains;
                if (!ret) {
                    ret = m.chains = new ChainNode(null, null, obj);
                } else if (ret.value() !== obj) {
                    ret = m.chains = ret.copy(obj);
                }
                return ret;
            }

            function watchPath(obj, keyPath, meta) {
                // can't watch length on Array - it is special...
                if (keyPath === 'length' && typeOf(obj) === 'array') { return; }

                var m = meta || metaFor(obj);
                var watching = m.watching;

                if (!watching[keyPath]) { // activate watching first time
                    watching[keyPath] = 1;
                    chainsFor(obj, m).add(keyPath);
                } else {
                    watching[keyPath] = (watching[keyPath] || 0) + 1;
                }
            }

            __exports__.watchPath = watchPath;function unwatchPath(obj, keyPath, meta) {
                var m = meta || metaFor(obj);
                var watching = m.watching;

                if (watching[keyPath] === 1) {
                    watching[keyPath] = 0;
                    chainsFor(obj, m).remove(keyPath);
                } else if (watching[keyPath] > 1) {
                    watching[keyPath]--;
                }
            }

            __exports__.unwatchPath = unwatchPath;
        });
    enifed("ember-metal/watching",
        ["ember-metal/utils","ember-metal/chains","ember-metal/watch_key","ember-metal/watch_path","ember-metal/path_cache","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
            "use strict";
            /**
             @module ember-metal
             */

            var typeOf = __dependency1__.typeOf;
            var removeChainWatcher = __dependency2__.removeChainWatcher;
            var flushPendingChains = __dependency2__.flushPendingChains;
            var watchKey = __dependency3__.watchKey;
            var unwatchKey = __dependency3__.unwatchKey;
            var watchPath = __dependency4__.watchPath;
            var unwatchPath = __dependency4__.unwatchPath;

            var isPath = __dependency5__.isPath;

            /**
             Starts watching a property on an object. Whenever the property changes,
             invokes `Alto.propertyWillChange` and `Alto.propertyDidChange`. This is the
             primitive used by observers and dependent keys; usually you will never call
             this method directly but instead use higher level methods like
             `Alto.addObserver()`

             @private
             @method watch
             @for Alto
             @param obj
             @param {String} keyName
             */
            function watch(obj, _keyPath, m) {
                // can't watch length on Array - it is special...
                if (_keyPath === 'length' && typeOf(obj) === 'array') { return; }

                if (!isPath(_keyPath)) {
                    watchKey(obj, _keyPath, m);
                } else {
                    watchPath(obj, _keyPath, m);
                }
            }

            __exports__.watch = watch;

            function isWatching(obj, key) {
                var meta = obj['__alto_meta__'];
                return (meta && meta.watching[key]) > 0;
            }

            __exports__.isWatching = isWatching;watch.flushPending = flushPendingChains;

            function unwatch(obj, _keyPath, m) {
                // can't watch length on Array - it is special...
                if (_keyPath === 'length' && typeOf(obj) === 'array') { return; }

                if (!isPath(_keyPath)) {
                    unwatchKey(obj, _keyPath, m);
                } else {
                    unwatchPath(obj, _keyPath, m);
                }
            }

            __exports__.unwatch = unwatch;var NODE_STACK = [];

            /**
             Tears down the meta on an object so that it can be garbage collected.
             Multiple calls will have no effect.

             @method destroy
             @for Alto
             @param {Object} obj  the object to destroy
             @return {void}
             */
            function destroy(obj) {
                var meta = obj['__alto_meta__'], node, nodes, key, nodeObject;
                if (meta) {
                    obj['__alto_meta__'] = null;
                    // remove chainWatchers to remove circular references that would prevent GC
                    node = meta.chains;
                    if (node) {
                        NODE_STACK.push(node);
                        // process tree
                        while (NODE_STACK.length > 0) {
                            node = NODE_STACK.pop();
                            // push children
                            nodes = node._chains;
                            if (nodes) {
                                for (key in nodes) {
                                    if (nodes.hasOwnProperty(key)) {
                                        NODE_STACK.push(nodes[key]);
                                    }
                                }
                            }
                            // remove chainWatcher in node object
                            if (node._watching) {
                                nodeObject = node._object;
                                if (nodeObject) {
                                    removeChainWatcher(nodeObject, node._key, node);
                                }
                            }
                        }
                    }
                }
            }

            __exports__.destroy = destroy;
        });
    enifed("ember-runtime",
        ["ember-metal","ember-runtime/core","ember-runtime/compare","ember-runtime/copy","ember-runtime/inject","ember-runtime/system/namespace","ember-runtime/system/object","ember-runtime/system/tracked_array","ember-runtime/system/subarray","ember-runtime/system/container","ember-runtime/system/array_proxy","ember-runtime/system/object_proxy","ember-runtime/system/core_object","ember-runtime/system/each_proxy","ember-runtime/system/native_array","ember-runtime/system/set","ember-runtime/system/string","ember-runtime/system/deferred","ember-runtime/system/lazy_load","ember-runtime/mixins/array","ember-runtime/mixins/comparable","ember-runtime/mixins/copyable","ember-runtime/mixins/enumerable","ember-runtime/mixins/freezable","ember-runtime/mixins/-proxy","ember-runtime/mixins/observable","ember-runtime/mixins/action_handler","ember-runtime/mixins/deferred","ember-runtime/mixins/mutable_enumerable","ember-runtime/mixins/mutable_array","ember-runtime/mixins/target_action_support","ember-runtime/mixins/evented","ember-runtime/mixins/promise_proxy","ember-runtime/mixins/sortable","ember-runtime/computed/array_computed","ember-runtime/computed/reduce_computed","ember-runtime/computed/reduce_computed_macros","ember-runtime/controllers/array_controller","ember-runtime/controllers/object_controller","ember-runtime/controllers/controller","ember-runtime/mixins/controller","ember-runtime/system/service","ember-runtime/ext/rsvp","ember-runtime/ext/string","ember-runtime/ext/function","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __dependency11__, __dependency12__, __dependency13__, __dependency14__, __dependency15__, __dependency16__, __dependency17__, __dependency18__, __dependency19__, __dependency20__, __dependency21__, __dependency22__, __dependency23__, __dependency24__, __dependency25__, __dependency26__, __dependency27__, __dependency28__, __dependency29__, __dependency30__, __dependency31__, __dependency32__, __dependency33__, __dependency34__, __dependency35__, __dependency36__, __dependency37__, __dependency38__, __dependency39__, __dependency40__, __dependency41__, __dependency42__, __dependency43__, __dependency44__, __dependency45__, __exports__) {
            "use strict";
            /**
             Alto Runtime

             @module ember
             @submodule ember-runtime
             @requires ember-metal
             */

            // BEGIN IMPORTS
            var Alto = __dependency1__["default"];
            var isEqual = __dependency2__.isEqual;
            var compare = __dependency3__["default"];
            var copy = __dependency4__["default"];
            var inject = __dependency5__["default"];

            var Namespace = __dependency6__["default"];
            var AltoObject = __dependency7__["default"];
            var TrackedArray = __dependency8__["default"];
            var SubArray = __dependency9__["default"];
            var Container = __dependency10__["default"];
            var ArrayProxy = __dependency11__["default"];
            var ObjectProxy = __dependency12__["default"];
            var CoreObject = __dependency13__["default"];
            var EachArray = __dependency14__.EachArray;
            var EachProxy = __dependency14__.EachProxy;

            var NativeArray = __dependency15__["default"];
            var Set = __dependency16__["default"];
            var AltoStringUtils = __dependency17__["default"];
            var Deferred = __dependency18__["default"];
            var onLoad = __dependency19__.onLoad;
            var runLoadHooks = __dependency19__.runLoadHooks;

            var AltoArray = __dependency20__["default"];
            var Comparable = __dependency21__["default"];
            var Copyable = __dependency22__["default"];
            var Enumerable = __dependency23__["default"];
            var Freezable = __dependency24__.Freezable;
            var FROZEN_ERROR = __dependency24__.FROZEN_ERROR;
            var _ProxyMixin = __dependency25__["default"];

            var Observable = __dependency26__["default"];
            var ActionHandler = __dependency27__["default"];
            var DeferredMixin = __dependency28__["default"];
            var MutableEnumerable = __dependency29__["default"];
            var MutableArray = __dependency30__["default"];
            var TargetActionSupport = __dependency31__["default"];
            var Evented = __dependency32__["default"];
            var PromiseProxyMixin = __dependency33__["default"];
            var SortableMixin = __dependency34__["default"];
            var arrayComputed = __dependency35__.arrayComputed;
            var ArrayComputedProperty = __dependency35__.ArrayComputedProperty;

            var reduceComputed = __dependency36__.reduceComputed;
            var ReduceComputedProperty = __dependency36__.ReduceComputedProperty;

            var sum = __dependency37__.sum;
            var min = __dependency37__.min;
            var max = __dependency37__.max;
            var map = __dependency37__.map;
            var sort = __dependency37__.sort;
            var setDiff = __dependency37__.setDiff;
            var mapBy = __dependency37__.mapBy;
            var mapProperty = __dependency37__.mapProperty;
            var filter = __dependency37__.filter;
            var filterBy = __dependency37__.filterBy;
            var filterProperty = __dependency37__.filterProperty;
            var uniq = __dependency37__.uniq;
            var union = __dependency37__.union;
            var intersect = __dependency37__.intersect;

            var ArrayController = __dependency38__["default"];
            var ObjectController = __dependency39__["default"];
            var Controller = __dependency40__["default"];
            var ControllerMixin = __dependency41__["default"];

            var Service = __dependency42__["default"];

            var RSVP = __dependency43__["default"];
            // just for side effect of extending Alto.RSVP
            // just for side effect of extending String.prototype
            // just for side effect of extending Function.prototype
            // END IMPORTS

            // BEGIN EXPORTS
            Alto.compare = compare;
            Alto.copy = copy;
            Alto.isEqual = isEqual;


            Alto.Array = AltoArray;

            Alto.Comparable = Comparable;
            Alto.Copyable = Copyable;

            Alto.SortableMixin = SortableMixin;

            Alto.Freezable = Freezable;
            Alto.FROZEN_ERROR = FROZEN_ERROR;

            Alto.DeferredMixin = DeferredMixin;

            Alto.MutableEnumerable = MutableEnumerable;
            Alto.MutableArray = MutableArray;

            Alto.TargetActionSupport = TargetActionSupport;
            Alto.Evented = Evented;

            Alto.PromiseProxyMixin = PromiseProxyMixin;

            Alto.Observable = Observable;

            Alto.arrayComputed = arrayComputed;
            Alto.ArrayComputedProperty = ArrayComputedProperty;
            Alto.reduceComputed = reduceComputed;
            Alto.ReduceComputedProperty = ReduceComputedProperty;

            // ES6TODO: this seems a less than ideal way/place to add properties to Alto.computed
            var AltoComputed = Alto.computed;

            AltoComputed.sum = sum;
            AltoComputed.min = min;
            AltoComputed.max = max;
            AltoComputed.map = map;
            AltoComputed.sort = sort;
            AltoComputed.setDiff = setDiff;
            AltoComputed.mapBy = mapBy;
            AltoComputed.mapProperty = mapProperty;
            AltoComputed.filter = filter;
            AltoComputed.filterBy = filterBy;
            AltoComputed.filterProperty = filterProperty;
            AltoComputed.uniq = uniq;
            AltoComputed.union = union;
            AltoComputed.intersect = intersect;

            Alto.String = AltoStringUtils;
            Alto.Object = AltoObject;
            Alto.TrackedArray = TrackedArray;
            Alto.SubArray = SubArray;
            Alto.Container = Container;
            Alto.Namespace = Namespace;
            Alto.Enumerable = Enumerable;
            Alto.ArrayProxy = ArrayProxy;
            Alto.ObjectProxy = ObjectProxy;
            Alto.ActionHandler = ActionHandler;
            Alto.CoreObject = CoreObject;
            Alto.EachArray = EachArray;
            Alto.EachProxy = EachProxy;
            Alto.NativeArray = NativeArray;
            // ES6TODO: Currently we must rely on the global from ember-metal/core to avoid circular deps
            // Alto.A = A;
            Alto.Set = Set;
            Alto.Deferred = Deferred;
            Alto.onLoad = onLoad;
            Alto.runLoadHooks = runLoadHooks;

            Alto.ArrayController = ArrayController;
            Alto.ObjectController = ObjectController;
            Alto.Controller = Controller;
            Alto.ControllerMixin = ControllerMixin;


            Alto._ProxyMixin = _ProxyMixin;

            Alto.RSVP = RSVP;
            // END EXPORTS

            __exports__["default"] = Alto;
        });
    enifed("ember-runtime/compare",
        ["ember-metal/utils","ember-runtime/mixins/comparable","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var typeOf = __dependency1__.typeOf;
            var Comparable = __dependency2__["default"];

            var TYPE_ORDER = {
                'undefined': 0,
                'null': 1,
                'boolean': 2,
                'number': 3,
                'string': 4,
                'array': 5,
                'object': 6,
                'instance': 7,
                'function': 8,
                'class': 9,
                'date': 10
            };

            //
            // the spaceship operator
            //
            function spaceship(a, b) {
                var diff = a - b;
                return (diff > 0) - (diff < 0);
            }

            /**
             This will compare two javascript values of possibly different types.
             It will tell you which one is greater than the other by returning:

             - -1 if the first is smaller than the second,
             - 0 if both are equal,
             - 1 if the first is greater than the second.

             The order is calculated based on `Alto.ORDER_DEFINITION`, if types are different.
             In case they have the same type an appropriate comparison for this type is made.

             ```javascript
             Alto.compare('hello', 'hello');  // 0
             Alto.compare('abc', 'dfg');      // -1
             Alto.compare(2, 1);              // 1
             ```

             @method compare
             @for Alto
             @param {Object} v First value to compare
             @param {Object} w Second value to compare
             @return {Number} -1 if v < w, 0 if v = w and 1 if v > w.
             */
            __exports__["default"] = function compare(v, w) {
                if (v === w) {
                    return 0;
                }

                var type1 = typeOf(v);
                var type2 = typeOf(w);

                if (Comparable) {
                    if (type1 ==='instance' && Comparable.detect(v.constructor)) {
                        return v.constructor.compare(v, w);
                    }

                    if (type2 === 'instance' && Comparable.detect(w.constructor)) {
                        return 1 - w.constructor.compare(w, v);
                    }
                }

                var res = spaceship(TYPE_ORDER[type1], TYPE_ORDER[type2]);
                if (res !== 0) {
                    return res;
                }

                // types are equal - so we have to check values now
                switch (type1) {
                    case 'boolean':
                    case 'number':
                        return spaceship(v,w);

                    case 'string':
                        return spaceship(v.localeCompare(w), 0);

                    case 'array':
                        var vLen = v.length;
                        var wLen = w.length;
                        var len = Math.min(vLen, wLen);

                        for (var i = 0; i < len; i++) {
                            var r = compare(v[i], w[i]);
                            if (r !== 0) {
                                return r;
                            }
                        }

                        // all elements are equal now
                        // shorter array should be ordered first
                        return spaceship(vLen, wLen);

                    case 'instance':
                        if (Comparable && Comparable.detect(v)) {
                            return v.compare(v, w);
                        }
                        return 0;

                    case 'date':
                        return spaceship(v.getTime(), w.getTime());

                    default:
                        return 0;
                }
            }
        });
    enifed("ember-runtime/computed/array_computed",
        ["ember-metal/core","ember-runtime/computed/reduce_computed","ember-metal/enumerable_utils","ember-metal/platform","ember-metal/observer","ember-metal/error","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            var ReduceComputedProperty = __dependency2__.ReduceComputedProperty;
            var forEach = __dependency3__.forEach;
            var o_create = __dependency4__.create;
            var addObserver = __dependency5__.addObserver;
            var AltoError = __dependency6__["default"];

            var a_slice = [].slice;

            function ArrayComputedProperty() {
                var cp = this;

                ReduceComputedProperty.apply(this, arguments);

                this.func = (function(reduceFunc) {
                    return function (propertyName) {
                        if (!cp._hasInstanceMeta(this, propertyName)) {
                            // When we recompute an array computed property, we need already
                            // retrieved arrays to be updated; we can't simply empty the cache and
                            // hope the array is re-retrieved.
                            forEach(cp._dependentKeys, function(dependentKey) {
                                addObserver(this, dependentKey, function() {
                                    cp.recomputeOnce.call(this, propertyName);
                                });
                            }, this);
                        }

                        return reduceFunc.apply(this, arguments);
                    };
                })(this.func);

                return this;
            }

            ArrayComputedProperty.prototype = o_create(ReduceComputedProperty.prototype);

            ArrayComputedProperty.prototype.initialValue = function () {
                return Alto.A();
            };

            ArrayComputedProperty.prototype.resetValue = function (array) {
                array.clear();
                return array;
            };

            // This is a stopgap to keep the reference counts correct with lazy CPs.
            ArrayComputedProperty.prototype.didChange = function (obj, keyName) {
                return;
            };

            /**
             Creates a computed property which operates on dependent arrays and
             is updated with "one at a time" semantics. When items are added or
             removed from the dependent array(s) an array computed only operates
             on the change instead of re-evaluating the entire array. This should
             return an array, if you'd like to use "one at a time" semantics and
             compute some value other then an array look at
             `Alto.reduceComputed`.

             If there are more than one arguments the first arguments are
             considered to be dependent property keys. The last argument is
             required to be an options object. The options object can have the
             following three properties.

             `initialize` - An optional initialize function. Typically this will be used
             to set up state on the instanceMeta object.

             `removedItem` - A function that is called each time an element is
             removed from the array.

             `addedItem` - A function that is called each time an element is
             added to the array.


             The `initialize` function has the following signature:

             ```javascript
             function(array, changeMeta, instanceMeta)
             ```

             `array` - The initial value of the arrayComputed, an empty array.

             `changeMeta` - An object which contains meta information about the
             computed. It contains the following properties:

             - `property` the computed property
             - `propertyName` the name of the property on the object

             `instanceMeta` - An object that can be used to store meta
             information needed for calculating your computed. For example a
             unique computed might use this to store the number of times a given
             element is found in the dependent array.


             The `removedItem` and `addedItem` functions both have the following signature:

             ```javascript
             function(accumulatedValue, item, changeMeta, instanceMeta)
             ```

             `accumulatedValue` - The value returned from the last time
             `removedItem` or `addedItem` was called or an empty array.

             `item` - the element added or removed from the array

             `changeMeta` - An object which contains meta information about the
             change. It contains the following properties:

             - `property` the computed property
             - `propertyName` the name of the property on the object
             - `index` the index of the added or removed item
             - `item` the added or removed item: this is exactly the same as
             the second arg
             - `arrayChanged` the array that triggered the change. Can be
             useful when depending on multiple arrays.

             For property changes triggered on an item property change (when
             depKey is something like `someArray.@each.someProperty`),
             `changeMeta` will also contain the following property:

             - `previousValues` an object whose keys are the properties that changed on
             the item, and whose values are the item's previous values.

             `previousValues` is important Alto coalesces item property changes via
             Alto.run.once. This means that by the time removedItem gets called, item has
             the new values, but you may need the previous value (eg for sorting &
             filtering).

             `instanceMeta` - An object that can be used to store meta
             information needed for calculating your computed. For example a
             unique computed might use this to store the number of times a given
             element is found in the dependent array.

             The `removedItem` and `addedItem` functions should return the accumulated
             value. It is acceptable to not return anything (ie return undefined)
             to invalidate the computation. This is generally not a good idea for
             arrayComputed but it's used in eg max and min.

             Example

             ```javascript
             Alto.computed.map = function(dependentKey, callback) {
        var options = {
          addedItem: function(array, item, changeMeta, instanceMeta) {
            var mapped = callback(item);
            array.insertAt(changeMeta.index, mapped);
            return array;
          },
          removedItem: function(array, item, changeMeta, instanceMeta) {
            array.removeAt(changeMeta.index, 1);
            return array;
          }
        };

        return Alto.arrayComputed(dependentKey, options);
      };
             ```

             @method arrayComputed
             @for Alto
             @param {String} [dependentKeys*]
             @param {Object} options
             @return {Alto.ComputedProperty}
             */
            function arrayComputed (options) {
                var args;

                if (arguments.length > 1) {
                    args = a_slice.call(arguments, 0, -1);
                    options = a_slice.call(arguments, -1)[0];
                }

                if (typeof options !== 'object') {
                    throw new AltoError('Array Computed Property declared without an options hash');
                }

                var cp = new ArrayComputedProperty(options);

                if (args) {
                    cp.property.apply(cp, args);
                }

                return cp;
            }

            __exports__.arrayComputed = arrayComputed;
            __exports__.ArrayComputedProperty = ArrayComputedProperty;
        });
    enifed("ember-runtime/computed/reduce_computed",
        ["ember-metal/core","ember-metal/property_get","ember-metal/utils","ember-metal/error","ember-metal/property_events","ember-metal/expand_properties","ember-metal/observer","ember-metal/computed","ember-metal/platform","ember-metal/enumerable_utils","ember-runtime/system/tracked_array","ember-runtime/mixins/array","ember-metal/run_loop","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __dependency11__, __dependency12__, __dependency13__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            // Alto.assert
            var e_get = __dependency2__.get;
            var guidFor = __dependency3__.guidFor;
            var metaFor = __dependency3__.meta;
            var AltoError = __dependency4__["default"];
            var propertyWillChange = __dependency5__.propertyWillChange;
            var propertyDidChange = __dependency5__.propertyDidChange;
            var expandProperties = __dependency6__["default"];
            var addObserver = __dependency7__.addObserver;
            var removeObserver = __dependency7__.removeObserver;
            var addBeforeObserver = __dependency7__.addBeforeObserver;
            var removeBeforeObserver = __dependency7__.removeBeforeObserver;
            var ComputedProperty = __dependency8__.ComputedProperty;
            var cacheFor = __dependency8__.cacheFor;
            var o_create = __dependency9__.create;
            var forEach = __dependency10__.forEach;
            var TrackedArray = __dependency11__["default"];
            var AltoArray = __dependency12__["default"];
            var run = __dependency13__["default"];
            var isArray = __dependency3__.isArray;

            var cacheSet = cacheFor.set;
            var cacheGet = cacheFor.get;
            var cacheRemove = cacheFor.remove;
            var a_slice = [].slice;
            // Here we explicitly don't allow `@each.foo`; it would require some special
            // testing, but there's no particular reason why it should be disallowed.
            var eachPropertyPattern = /^(.*)\.@each\.(.*)/;
            var doubleEachPropertyPattern = /(.*\.@each){2,}/;
            var arrayBracketPattern = /\.\[\]$/;

            function get(obj, key) {
                if (key === '@this') {
                    return obj;
                }

                return e_get(obj, key);
            }

            /*
             Tracks changes to dependent arrays, as well as to properties of items in
             dependent arrays.

             @class DependentArraysObserver
             */
            function DependentArraysObserver(callbacks, cp, instanceMeta, context, propertyName, sugarMeta) {
                // user specified callbacks for `addedItem` and `removedItem`
                this.callbacks = callbacks;

                // the computed property: remember these are shared across instances
                this.cp = cp;

                // the ReduceComputedPropertyInstanceMeta this DependentArraysObserver is
                // associated with
                this.instanceMeta = instanceMeta;

                // A map of array guids to dependentKeys, for the given context.  We track
                // this because we want to set up the computed property potentially before the
                // dependent array even exists, but when the array observer fires, we lack
                // enough context to know what to update: we can recover that context by
                // getting the dependentKey.
                this.dependentKeysByGuid = {};

                // a map of dependent array guids -> TrackedArray instances.  We use
                // this to lazily recompute indexes for item property observers.
                this.trackedArraysByGuid = {};

                // We suspend observers to ignore replacements from `reset` when totally
                // recomputing.  Unfortunately we cannot properly suspend the observers
                // because we only have the key; instead we make the observers no-ops
                this.suspended = false;

                // This is used to coalesce item changes from property observers within a
                // single item.
                this.changedItems = {};
                // This is used to coalesce item changes for multiple items that depend on
                // some shared state.
                this.changedItemCount = 0;
            }

            function ItemPropertyObserverContext (dependentArray, index, trackedArray) {
                Alto.assert('Internal error: trackedArray is null or undefined', trackedArray);

                this.dependentArray = dependentArray;
                this.index = index;
                this.item = dependentArray.objectAt(index);
                this.trackedArray = trackedArray;
                this.beforeObserver = null;
                this.observer = null;
                this.destroyed = false;
            }

            DependentArraysObserver.prototype = {
                setValue: function (newValue) {
                    this.instanceMeta.setValue(newValue, true);
                },

                getValue: function () {
                    return this.instanceMeta.getValue();
                },

                setupObservers: function (dependentArray, dependentKey) {
                    this.dependentKeysByGuid[guidFor(dependentArray)] = dependentKey;

                    dependentArray.addArrayObserver(this, {
                        willChange: 'dependentArrayWillChange',
                        didChange: 'dependentArrayDidChange'
                    });

                    if (this.cp._itemPropertyKeys[dependentKey]) {
                        this.setupPropertyObservers(dependentKey, this.cp._itemPropertyKeys[dependentKey]);
                    }
                },

                teardownObservers: function (dependentArray, dependentKey) {
                    var itemPropertyKeys = this.cp._itemPropertyKeys[dependentKey] || [];

                    delete this.dependentKeysByGuid[guidFor(dependentArray)];

                    this.teardownPropertyObservers(dependentKey, itemPropertyKeys);

                    dependentArray.removeArrayObserver(this, {
                        willChange: 'dependentArrayWillChange',
                        didChange: 'dependentArrayDidChange'
                    });
                },

                suspendArrayObservers: function (callback, binding) {
                    var oldSuspended = this.suspended;
                    this.suspended = true;
                    callback.call(binding);
                    this.suspended = oldSuspended;
                },

                setupPropertyObservers: function (dependentKey, itemPropertyKeys) {
                    var dependentArray = get(this.instanceMeta.context, dependentKey);
                    var length = get(dependentArray, 'length');
                    var observerContexts = new Array(length);

                    this.resetTransformations(dependentKey, observerContexts);

                    forEach(dependentArray, function (item, index) {
                        var observerContext = this.createPropertyObserverContext(dependentArray, index, this.trackedArraysByGuid[dependentKey]);
                        observerContexts[index] = observerContext;

                        forEach(itemPropertyKeys, function (propertyKey) {
                            addBeforeObserver(item, propertyKey, this, observerContext.beforeObserver);
                            addObserver(item, propertyKey, this, observerContext.observer);
                        }, this);
                    }, this);
                },

                teardownPropertyObservers: function (dependentKey, itemPropertyKeys) {
                    var dependentArrayObserver = this;
                    var trackedArray = this.trackedArraysByGuid[dependentKey];
                    var beforeObserver, observer, item;

                    if (!trackedArray) { return; }

                    trackedArray.apply(function (observerContexts, offset, operation) {
                        if (operation === TrackedArray.DELETE) { return; }

                        forEach(observerContexts, function (observerContext) {
                            observerContext.destroyed = true;
                            beforeObserver = observerContext.beforeObserver;
                            observer = observerContext.observer;
                            item = observerContext.item;

                            forEach(itemPropertyKeys, function (propertyKey) {
                                removeBeforeObserver(item, propertyKey, dependentArrayObserver, beforeObserver);
                                removeObserver(item, propertyKey, dependentArrayObserver, observer);
                            });
                        });
                    });
                },

                createPropertyObserverContext: function (dependentArray, index, trackedArray) {
                    var observerContext = new ItemPropertyObserverContext(dependentArray, index, trackedArray);

                    this.createPropertyObserver(observerContext);

                    return observerContext;
                },

                createPropertyObserver: function (observerContext) {
                    var dependentArrayObserver = this;

                    observerContext.beforeObserver = function (obj, keyName) {
                        return dependentArrayObserver.itemPropertyWillChange(obj, keyName, observerContext.dependentArray, observerContext);
                    };

                    observerContext.observer = function (obj, keyName) {
                        return dependentArrayObserver.itemPropertyDidChange(obj, keyName, observerContext.dependentArray, observerContext);
                    };
                },

                resetTransformations: function (dependentKey, observerContexts) {
                    this.trackedArraysByGuid[dependentKey] = new TrackedArray(observerContexts);
                },

                trackAdd: function (dependentKey, index, newItems) {
                    var trackedArray = this.trackedArraysByGuid[dependentKey];

                    if (trackedArray) {
                        trackedArray.addItems(index, newItems);
                    }
                },

                trackRemove: function (dependentKey, index, removedCount) {
                    var trackedArray = this.trackedArraysByGuid[dependentKey];

                    if (trackedArray) {
                        return trackedArray.removeItems(index, removedCount);
                    }

                    return [];
                },

                updateIndexes: function (trackedArray, array) {
                    var length = get(array, 'length');
                    // OPTIMIZE: we could stop updating once we hit the object whose observer
                    // fired; ie partially apply the transformations
                    trackedArray.apply(function (observerContexts, offset, operation, operationIndex) {
                        // we don't even have observer contexts for removed items, even if we did,
                        // they no longer have any index in the array
                        if (operation === TrackedArray.DELETE) { return; }
                        if (operationIndex === 0 && operation === TrackedArray.RETAIN && observerContexts.length === length && offset === 0) {
                            // If we update many items we don't want to walk the array each time: we
                            // only need to update the indexes at most once per run loop.
                            return;
                        }

                        forEach(observerContexts, function (context, index) {
                            context.index = index + offset;
                        });
                    });
                },

                dependentArrayWillChange: function (dependentArray, index, removedCount, addedCount) {
                    if (this.suspended) { return; }

                    var removedItem = this.callbacks.removedItem;
                    var changeMeta;
                    var guid = guidFor(dependentArray);
                    var dependentKey = this.dependentKeysByGuid[guid];
                    var itemPropertyKeys = this.cp._itemPropertyKeys[dependentKey] || [];
                    var length = get(dependentArray, 'length');
                    var normalizedIndex = normalizeIndex(index, length, 0);
                    var normalizedRemoveCount = normalizeRemoveCount(normalizedIndex, length, removedCount);
                    var item, itemIndex, sliceIndex, observerContexts;

                    observerContexts = this.trackRemove(dependentKey, normalizedIndex, normalizedRemoveCount);

                    function removeObservers(propertyKey) {
                        observerContexts[sliceIndex].destroyed = true;
                        removeBeforeObserver(item, propertyKey, this, observerContexts[sliceIndex].beforeObserver);
                        removeObserver(item, propertyKey, this, observerContexts[sliceIndex].observer);
                    }

                    for (sliceIndex = normalizedRemoveCount - 1; sliceIndex >= 0; --sliceIndex) {
                        itemIndex = normalizedIndex + sliceIndex;
                        if (itemIndex >= length) { break; }

                        item = dependentArray.objectAt(itemIndex);

                        forEach(itemPropertyKeys, removeObservers, this);

                        changeMeta = new ChangeMeta(dependentArray, item, itemIndex, this.instanceMeta.propertyName, this.cp, normalizedRemoveCount);
                        this.setValue(removedItem.call(
                            this.instanceMeta.context, this.getValue(), item, changeMeta, this.instanceMeta.sugarMeta));
                    }
                    this.callbacks.flushedChanges.call(this.instanceMeta.context, this.getValue(), this.instanceMeta.sugarMeta);
                },

                dependentArrayDidChange: function (dependentArray, index, removedCount, addedCount) {
                    if (this.suspended) { return; }

                    var addedItem = this.callbacks.addedItem;
                    var guid = guidFor(dependentArray);
                    var dependentKey = this.dependentKeysByGuid[guid];
                    var observerContexts = new Array(addedCount);
                    var itemPropertyKeys = this.cp._itemPropertyKeys[dependentKey];
                    var length = get(dependentArray, 'length');
                    var normalizedIndex = normalizeIndex(index, length, addedCount);
                    var endIndex = normalizedIndex + addedCount;
                    var changeMeta, observerContext;

                    forEach(dependentArray.slice(normalizedIndex, endIndex), function (item, sliceIndex) {
                        if (itemPropertyKeys) {
                            observerContext = this.createPropertyObserverContext(dependentArray, normalizedIndex + sliceIndex,
                                this.trackedArraysByGuid[dependentKey]);
                            observerContexts[sliceIndex] = observerContext;

                            forEach(itemPropertyKeys, function (propertyKey) {
                                addBeforeObserver(item, propertyKey, this, observerContext.beforeObserver);
                                addObserver(item, propertyKey, this, observerContext.observer);
                            }, this);
                        }

                        changeMeta = new ChangeMeta(dependentArray, item, normalizedIndex + sliceIndex, this.instanceMeta.propertyName, this.cp, addedCount);
                        this.setValue(addedItem.call(
                            this.instanceMeta.context, this.getValue(), item, changeMeta, this.instanceMeta.sugarMeta));
                    }, this);
                    this.callbacks.flushedChanges.call(this.instanceMeta.context, this.getValue(), this.instanceMeta.sugarMeta);
                    this.trackAdd(dependentKey, normalizedIndex, observerContexts);
                },

                itemPropertyWillChange: function (obj, keyName, array, observerContext) {
                    var guid = guidFor(obj);

                    if (!this.changedItems[guid]) {
                        this.changedItems[guid] = {
                            array: array,
                            observerContext: observerContext,
                            obj: obj,
                            previousValues: {}
                        };
                    }

                    ++this.changedItemCount;
                    this.changedItems[guid].previousValues[keyName] = get(obj, keyName);
                },

                itemPropertyDidChange: function (obj, keyName, array, observerContext) {
                    if (--this.changedItemCount === 0) {
                        this.flushChanges();
                    }
                },

                flushChanges: function () {
                    var changedItems = this.changedItems;
                    var key, c, changeMeta;

                    for (key in changedItems) {
                        c = changedItems[key];
                        if (c.observerContext.destroyed) { continue; }

                        this.updateIndexes(c.observerContext.trackedArray, c.observerContext.dependentArray);

                        changeMeta = new ChangeMeta(c.array, c.obj, c.observerContext.index, this.instanceMeta.propertyName, this.cp, changedItems.length, c.previousValues);
                        this.setValue(
                            this.callbacks.removedItem.call(this.instanceMeta.context, this.getValue(), c.obj, changeMeta, this.instanceMeta.sugarMeta));
                        this.setValue(
                            this.callbacks.addedItem.call(this.instanceMeta.context, this.getValue(), c.obj, changeMeta, this.instanceMeta.sugarMeta));
                    }

                    this.changedItems = {};
                    this.callbacks.flushedChanges.call(this.instanceMeta.context, this.getValue(), this.instanceMeta.sugarMeta);
                }
            };

            function normalizeIndex(index, length, newItemsOffset) {
                if (index < 0) {
                    return Math.max(0, length + index);
                } else if (index < length) {
                    return index;
                } else /* index > length */ {
                    return Math.min(length - newItemsOffset, index);
                }
            }

            function normalizeRemoveCount(index, length, removedCount) {
                return Math.min(removedCount, length - index);
            }

            function ChangeMeta(dependentArray, item, index, propertyName, property, changedCount, previousValues){
                this.arrayChanged = dependentArray;
                this.index = index;
                this.item = item;
                this.propertyName = propertyName;
                this.property = property;
                this.changedCount = changedCount;

                if (previousValues) {
                    // previous values only available for item property changes
                    this.previousValues = previousValues;
                }
            }

            function addItems(dependentArray, callbacks, cp, propertyName, meta) {
                forEach(dependentArray, function (item, index) {
                    meta.setValue( callbacks.addedItem.call(
                        this, meta.getValue(), item, new ChangeMeta(dependentArray, item, index, propertyName, cp, dependentArray.length), meta.sugarMeta));
                }, this);
                callbacks.flushedChanges.call(this, meta.getValue(), meta.sugarMeta);
            }

            function reset(cp, propertyName) {
                var hadMeta = cp._hasInstanceMeta(this, propertyName);
                var meta = cp._instanceMeta(this, propertyName);

                if (hadMeta) { meta.setValue(cp.resetValue(meta.getValue())); }

                if (cp.options.initialize) {
                    cp.options.initialize.call(this, meta.getValue(), {
                        property: cp,
                        propertyName: propertyName
                    }, meta.sugarMeta);
                }
            }

            function partiallyRecomputeFor(obj, dependentKey) {
                if (arrayBracketPattern.test(dependentKey)) {
                    return false;
                }

                var value = get(obj, dependentKey);
                return AltoArray.detect(value);
            }

            function ReduceComputedPropertyInstanceMeta(context, propertyName, initialValue) {
                this.context = context;
                this.propertyName = propertyName;
                this.cache = metaFor(context).cache;
                this.dependentArrays = {};
                this.sugarMeta = {};
                this.initialValue = initialValue;
            }

            ReduceComputedPropertyInstanceMeta.prototype = {
                getValue: function () {
                    var value = cacheGet(this.cache, this.propertyName);

                    if (value !== undefined) {
                        return value;
                    } else {
                        return this.initialValue;
                    }
                },

                setValue: function(newValue, triggerObservers) {
                    // This lets sugars force a recomputation, handy for very simple
                    // implementations of eg max.
                    if (newValue === cacheGet(this.cache, this.propertyName)) {
                        return;
                    }

                    if (triggerObservers) {
                        propertyWillChange(this.context, this.propertyName);
                    }

                    if (newValue === undefined) {
                        cacheRemove(this.cache, this.propertyName);
                    } else {
                        cacheSet(this.cache, this.propertyName, newValue);
                    }

                    if (triggerObservers) {
                        propertyDidChange(this.context, this.propertyName);
                    }
                }
            };

            /**
             A computed property whose dependent keys are arrays and which is updated with
             "one at a time" semantics.

             @class ReduceComputedProperty
             @namespace Alto
             @extends Alto.ComputedProperty
             @constructor
             */

            __exports__.ReduceComputedProperty = ReduceComputedProperty;
            // TODO: default export

            function ReduceComputedProperty(options) {
                var cp = this;

                this.options = options;
                this._dependentKeys = null;
                // A map of dependentKey -> [itemProperty, ...] that tracks what properties of
                // items in the array we must track to update this property.
                this._itemPropertyKeys = {};
                this._previousItemPropertyKeys = {};

                this.readOnly();
                this.cacheable();

                this.recomputeOnce = function(propertyName) {
                    // What we really want to do is coalesce by <cp, propertyName>.
                    // We need a form of `scheduleOnce` that accepts an arbitrary token to
                    // coalesce by, in addition to the target and method.
                    run.once(this, recompute, propertyName);
                };

                var recompute = function(propertyName) {
                    var meta = cp._instanceMeta(this, propertyName);
                    var callbacks = cp._callbacks();

                    reset.call(this, cp, propertyName);

                    meta.dependentArraysObserver.suspendArrayObservers(function () {
                        forEach(cp._dependentKeys, function (dependentKey) {
                            Alto.assert(
                                'dependent array ' + dependentKey + ' must be an `Alto.Array`.  ' +
                                'If you are not extending arrays, you will need to wrap native arrays with `Alto.A`',
                                !(isArray(get(this, dependentKey)) && !AltoArray.detect(get(this, dependentKey))));

                            if (!partiallyRecomputeFor(this, dependentKey)) { return; }

                            var dependentArray = get(this, dependentKey);
                            var previousDependentArray = meta.dependentArrays[dependentKey];

                            if (dependentArray === previousDependentArray) {
                                // The array may be the same, but our item property keys may have
                                // changed, so we set them up again.  We can't easily tell if they've
                                // changed: the array may be the same object, but with different
                                // contents.
                                if (cp._previousItemPropertyKeys[dependentKey]) {
                                    delete cp._previousItemPropertyKeys[dependentKey];
                                    meta.dependentArraysObserver.setupPropertyObservers(dependentKey, cp._itemPropertyKeys[dependentKey]);
                                }
                            } else {
                                meta.dependentArrays[dependentKey] = dependentArray;

                                if (previousDependentArray) {
                                    meta.dependentArraysObserver.teardownObservers(previousDependentArray, dependentKey);
                                }

                                if (dependentArray) {
                                    meta.dependentArraysObserver.setupObservers(dependentArray, dependentKey);
                                }
                            }
                        }, this);
                    }, this);

                    forEach(cp._dependentKeys, function(dependentKey) {
                        if (!partiallyRecomputeFor(this, dependentKey)) { return; }

                        var dependentArray = get(this, dependentKey);

                        if (dependentArray) {
                            addItems.call(this, dependentArray, callbacks, cp, propertyName, meta);
                        }
                    }, this);
                };


                this.func = function (propertyName) {
                    Alto.assert('Computed reduce values require at least one dependent key', cp._dependentKeys);

                    recompute.call(this, propertyName);

                    return cp._instanceMeta(this, propertyName).getValue();
                };
            }

            ReduceComputedProperty.prototype = o_create(ComputedProperty.prototype);

            function defaultCallback(computedValue) {
                return computedValue;
            }

            ReduceComputedProperty.prototype._callbacks = function () {
                if (!this.callbacks) {
                    var options = this.options;

                    this.callbacks = {
                        removedItem: options.removedItem || defaultCallback,
                        addedItem: options.addedItem || defaultCallback,
                        flushedChanges: options.flushedChanges || defaultCallback
                    };
                }

                return this.callbacks;
            };

            ReduceComputedProperty.prototype._hasInstanceMeta = function (context, propertyName) {
                return !!metaFor(context).cacheMeta[propertyName];
            };

            ReduceComputedProperty.prototype._instanceMeta = function (context, propertyName) {
                var cacheMeta = metaFor(context).cacheMeta;
                var meta = cacheMeta[propertyName];

                if (!meta) {
                    meta = cacheMeta[propertyName] = new ReduceComputedPropertyInstanceMeta(context, propertyName, this.initialValue());
                    meta.dependentArraysObserver = new DependentArraysObserver(this._callbacks(), this, meta, context, propertyName, meta.sugarMeta);
                }

                return meta;
            };

            ReduceComputedProperty.prototype.initialValue = function () {
                if (typeof this.options.initialValue === 'function') {
                    return this.options.initialValue();
                }
                else {
                    return this.options.initialValue;
                }
            };

            ReduceComputedProperty.prototype.resetValue = function (value) {
                return this.initialValue();
            };

            ReduceComputedProperty.prototype.itemPropertyKey = function (dependentArrayKey, itemPropertyKey) {
                this._itemPropertyKeys[dependentArrayKey] = this._itemPropertyKeys[dependentArrayKey] || [];
                this._itemPropertyKeys[dependentArrayKey].push(itemPropertyKey);
            };

            ReduceComputedProperty.prototype.clearItemPropertyKeys = function (dependentArrayKey) {
                if (this._itemPropertyKeys[dependentArrayKey]) {
                    this._previousItemPropertyKeys[dependentArrayKey] = this._itemPropertyKeys[dependentArrayKey];
                    this._itemPropertyKeys[dependentArrayKey] = [];
                }
            };

            ReduceComputedProperty.prototype.property = function () {
                var cp = this;
                var args = a_slice.call(arguments);
                var propertyArgs = {};
                var match, dependentArrayKey;

                forEach(args, function (dependentKey) {
                    if (doubleEachPropertyPattern.test(dependentKey)) {
                        throw new AltoError('Nested @each properties not supported: ' + dependentKey);
                    } else if (match = eachPropertyPattern.exec(dependentKey)) {
                        dependentArrayKey = match[1];

                        var itemPropertyKeyPattern = match[2];
                        var addItemPropertyKey = function (itemPropertyKey) {
                            cp.itemPropertyKey(dependentArrayKey, itemPropertyKey);
                        };

                        expandProperties(itemPropertyKeyPattern, addItemPropertyKey);
                        propertyArgs[guidFor(dependentArrayKey)] = dependentArrayKey;
                    } else {
                        propertyArgs[guidFor(dependentKey)] = dependentKey;
                    }
                });

                var propertyArgsToArray = [];
                for (var guid in propertyArgs) {
                    propertyArgsToArray.push(propertyArgs[guid]);
                }

                return ComputedProperty.prototype.property.apply(this, propertyArgsToArray);
            };

            /**
             Creates a computed property which operates on dependent arrays and
             is updated with "one at a time" semantics. When items are added or
             removed from the dependent array(s) a reduce computed only operates
             on the change instead of re-evaluating the entire array.

             If there are more than one arguments the first arguments are
             considered to be dependent property keys. The last argument is
             required to be an options object. The options object can have the
             following four properties:

             `initialValue` - A value or function that will be used as the initial
             value for the computed. If this property is a function the result of calling
             the function will be used as the initial value. This property is required.

             `initialize` - An optional initialize function. Typically this will be used
             to set up state on the instanceMeta object.

             `removedItem` - A function that is called each time an element is removed
             from the array.

             `addedItem` - A function that is called each time an element is added to
             the array.


             The `initialize` function has the following signature:

             ```javascript
             function(initialValue, changeMeta, instanceMeta)
             ```

             `initialValue` - The value of the `initialValue` property from the
             options object.

             `changeMeta` - An object which contains meta information about the
             computed. It contains the following properties:

             - `property` the computed property
             - `propertyName` the name of the property on the object

             `instanceMeta` - An object that can be used to store meta
             information needed for calculating your computed. For example a
             unique computed might use this to store the number of times a given
             element is found in the dependent array.


             The `removedItem` and `addedItem` functions both have the following signature:

             ```javascript
             function(accumulatedValue, item, changeMeta, instanceMeta)
             ```

             `accumulatedValue` - The value returned from the last time
             `removedItem` or `addedItem` was called or `initialValue`.

             `item` - the element added or removed from the array

             `changeMeta` - An object which contains meta information about the
             change. It contains the following properties:

             - `property` the computed property
             - `propertyName` the name of the property on the object
             - `index` the index of the added or removed item
             - `item` the added or removed item: this is exactly the same as
             the second arg
             - `arrayChanged` the array that triggered the change. Can be
             useful when depending on multiple arrays.

             For property changes triggered on an item property change (when
             depKey is something like `someArray.@each.someProperty`),
             `changeMeta` will also contain the following property:

             - `previousValues` an object whose keys are the properties that changed on
             the item, and whose values are the item's previous values.

             `previousValues` is important Alto coalesces item property changes via
             Alto.run.once. This means that by the time removedItem gets called, item has
             the new values, but you may need the previous value (eg for sorting &
             filtering).

             `instanceMeta` - An object that can be used to store meta
             information needed for calculating your computed. For example a
             unique computed might use this to store the number of times a given
             element is found in the dependent array.

             The `removedItem` and `addedItem` functions should return the accumulated
             value. It is acceptable to not return anything (ie return undefined)
             to invalidate the computation. This is generally not a good idea for
             arrayComputed but it's used in eg max and min.

             Note that observers will be fired if either of these functions return a value
             that differs from the accumulated value.  When returning an object that
             mutates in response to array changes, for example an array that maps
             everything from some other array (see `Alto.computed.map`), it is usually
             important that the *same* array be returned to avoid accidentally triggering observers.

             Example

             ```javascript
             Alto.computed.max = function(dependentKey) {
        return Alto.reduceComputed(dependentKey, {
          initialValue: -Infinity,

          addedItem: function(accumulatedValue, item, changeMeta, instanceMeta) {
            return Math.max(accumulatedValue, item);
          },

          removedItem: function(accumulatedValue, item, changeMeta, instanceMeta) {
            if (item < accumulatedValue) {
              return accumulatedValue;
            }
          }
        });
      };
             ```

             Dependent keys may refer to `@this` to observe changes to the object itself,
             which must be array-like, rather than a property of the object.  This is
             mostly useful for array proxies, to ensure objects are retrieved via
             `objectAtContent`.  This is how you could sort items by properties defined on an item controller.

             Example

             ```javascript
             App.PeopleController = Alto.ArrayController.extend({
        itemController: 'person',

        sortedPeople: Alto.computed.sort('@this.@each.reversedName', function(personA, personB) {
          // `reversedName` isn't defined on Person, but we have access to it via
          // the item controller App.PersonController.  If we'd used
          // `content.@each.reversedName` above, we would be getting the objects
             // directly and not have access to `reversedName`.
             //
             var reversedNameA = get(personA, 'reversedName');
             var reversedNameB = get(personB, 'reversedName');

             return Alto.compare(reversedNameA, reversedNameB);
             })
             });

             App.PersonController = Alto.ObjectController.extend({
        reversedName: function() {
          return reverse(get(this, 'name'));
        }.property('name')
      });
             ```

             Dependent keys whose values are not arrays are treated as regular
             dependencies: when they change, the computed property is completely
             recalculated.  It is sometimes useful to have dependent arrays with similar
             semantics.  Dependent keys which end in `.[]` do not use "one at a time"
             semantics.  When an item is added or removed from such a dependency, the
             computed property is completely recomputed.

             When the computed property is completely recomputed, the `accumulatedValue`
             is discarded, it starts with `initialValue` again, and each item is passed
             to `addedItem` in turn.

             Example

             ```javascript
             Alto.Object.extend({
        // When `string` is changed, `computed` is completely recomputed.
        string: 'a string',

        // When an item is added to `array`, `addedItem` is called.
        array: [],

        // When an item is added to `anotherArray`, `computed` is completely
        // recomputed.
        anotherArray: [],

        computed: Alto.reduceComputed('string', 'array', 'anotherArray.[]', {
          addedItem: addedItemCallback,
          removedItem: removedItemCallback
        })
      });
             ```

             @method reduceComputed
             @for Alto
             @param {String} [dependentKeys*]
             @param {Object} options
             @return {Alto.ComputedProperty}
             */
            function reduceComputed(options) {
                var args;

                if (arguments.length > 1) {
                    args = a_slice.call(arguments, 0, -1);
                    options = a_slice.call(arguments, -1)[0];
                }

                if (typeof options !== 'object') {
                    throw new AltoError('Reduce Computed Property declared without an options hash');
                }

                if (!('initialValue' in options)) {
                    throw new AltoError('Reduce Computed Property declared without an initial value');
                }

                var cp = new ReduceComputedProperty(options);

                if (args) {
                    cp.property.apply(cp, args);
                }

                return cp;
            }

            __exports__.reduceComputed = reduceComputed;
        });
    enifed("ember-runtime/computed/reduce_computed_macros",
        ["ember-metal/core","ember-metal/property_get","ember-metal/utils","ember-metal/error","ember-metal/enumerable_utils","ember-metal/run_loop","ember-metal/observer","ember-runtime/computed/array_computed","ember-runtime/computed/reduce_computed","ember-runtime/system/subarray","ember-metal/keys","ember-runtime/compare","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __dependency11__, __dependency12__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */

            var Alto = __dependency1__["default"];
            // Alto.assert
            var get = __dependency2__.get;
            var isArray = __dependency3__.isArray;
            var guidFor = __dependency3__.guidFor;
            var AltoError = __dependency4__["default"];
            var forEach = __dependency5__.forEach;
            var run = __dependency6__["default"];
            var addObserver = __dependency7__.addObserver;
            var arrayComputed = __dependency8__.arrayComputed;
            var reduceComputed = __dependency9__.reduceComputed;
            var SubArray = __dependency10__["default"];
            var keys = __dependency11__["default"];
            var compare = __dependency12__["default"];

            var a_slice = [].slice;

            /**
             A computed property that returns the sum of the value
             in the dependent array.

             @method computed.sum
             @for Alto
             @param {String} dependentKey
             @return {Alto.ComputedProperty} computes the sum of all values in the dependentKey's array
             @since 1.4.0
             */

            function sum(dependentKey){
                return reduceComputed(dependentKey, {
                    initialValue: 0,

                    addedItem: function(accumulatedValue, item, changeMeta, instanceMeta){
                        return accumulatedValue + item;
                    },

                    removedItem: function(accumulatedValue, item, changeMeta, instanceMeta){
                        return accumulatedValue - item;
                    }
                });
            }

            __exports__.sum = sum;/**
             A computed property that calculates the maximum value in the
             dependent array. This will return `-Infinity` when the dependent
             array is empty.

             ```javascript
             var Person = Alto.Object.extend({
        childAges: Alto.computed.mapBy('children', 'age'),
        maxChildAge: Alto.computed.max('childAges')
      });

             var lordByron = Person.create({ children: [] });

             lordByron.get('maxChildAge'); // -Infinity
             lordByron.get('children').pushObject({
        name: 'Augusta Ada Byron', age: 7
      });
             lordByron.get('maxChildAge'); // 7
             lordByron.get('children').pushObjects([{
        name: 'Allegra Byron',
        age: 5
      }, {
        name: 'Elizabeth Medora Leigh',
        age: 8
      }]);
             lordByron.get('maxChildAge'); // 8
             ```

             @method computed.max
             @for Alto
             @param {String} dependentKey
             @return {Alto.ComputedProperty} computes the largest value in the dependentKey's array
             */
            function max(dependentKey) {
                return reduceComputed(dependentKey, {
                    initialValue: -Infinity,

                    addedItem: function (accumulatedValue, item, changeMeta, instanceMeta) {
                        return Math.max(accumulatedValue, item);
                    },

                    removedItem: function (accumulatedValue, item, changeMeta, instanceMeta) {
                        if (item < accumulatedValue) {
                            return accumulatedValue;
                        }
                    }
                });
            }

            __exports__.max = max;/**
             A computed property that calculates the minimum value in the
             dependent array. This will return `Infinity` when the dependent
             array is empty.

             ```javascript
             var Person = Alto.Object.extend({
        childAges: Alto.computed.mapBy('children', 'age'),
        minChildAge: Alto.computed.min('childAges')
      });

             var lordByron = Person.create({ children: [] });

             lordByron.get('minChildAge'); // Infinity
             lordByron.get('children').pushObject({
        name: 'Augusta Ada Byron', age: 7
      });
             lordByron.get('minChildAge'); // 7
             lordByron.get('children').pushObjects([{
        name: 'Allegra Byron',
        age: 5
      }, {
        name: 'Elizabeth Medora Leigh',
        age: 8
      }]);
             lordByron.get('minChildAge'); // 5
             ```

             @method computed.min
             @for Alto
             @param {String} dependentKey
             @return {Alto.ComputedProperty} computes the smallest value in the dependentKey's array
             */
            function min(dependentKey) {
                return reduceComputed(dependentKey, {
                    initialValue: Infinity,

                    addedItem: function (accumulatedValue, item, changeMeta, instanceMeta) {
                        return Math.min(accumulatedValue, item);
                    },

                    removedItem: function (accumulatedValue, item, changeMeta, instanceMeta) {
                        if (item > accumulatedValue) {
                            return accumulatedValue;
                        }
                    }
                });
            }

            __exports__.min = min;/**
             Returns an array mapped via the callback

             The callback method you provide should have the following signature.
             `item` is the current item in the iteration.
             `index` is the integer index of the current item in the iteration.

             ```javascript
             function(item, index);
             ```

             Example

             ```javascript
             var Hamster = Alto.Object.extend({
        excitingChores: Alto.computed.map('chores', function(chore, index) {
          return chore.toUpperCase() + '!';
        })
      });

             var hamster = Hamster.create({
        chores: ['clean', 'write more unit tests']
      });

             hamster.get('excitingChores'); // ['CLEAN!', 'WRITE MORE UNIT TESTS!']
             ```

             @method computed.map
             @for Alto
             @param {String} dependentKey
             @param {Function} callback
             @return {Alto.ComputedProperty} an array mapped via the callback
             */
            function map(dependentKey, callback) {
                var options = {
                    addedItem: function(array, item, changeMeta, instanceMeta) {
                        var mapped = callback.call(this, item, changeMeta.index);
                        array.insertAt(changeMeta.index, mapped);
                        return array;
                    },
                    removedItem: function(array, item, changeMeta, instanceMeta) {
                        array.removeAt(changeMeta.index, 1);
                        return array;
                    }
                };

                return arrayComputed(dependentKey, options);
            }

            __exports__.map = map;/**
             Returns an array mapped to the specified key.

             ```javascript
             var Person = Alto.Object.extend({
        childAges: Alto.computed.mapBy('children', 'age')
      });

             var lordByron = Person.create({ children: [] });

             lordByron.get('childAges'); // []
             lordByron.get('children').pushObject({ name: 'Augusta Ada Byron', age: 7 });
             lordByron.get('childAges'); // [7]
             lordByron.get('children').pushObjects([{
        name: 'Allegra Byron',
        age: 5
      }, {
        name: 'Elizabeth Medora Leigh',
        age: 8
      }]);
             lordByron.get('childAges'); // [7, 5, 8]
             ```

             @method computed.mapBy
             @for Alto
             @param {String} dependentKey
             @param {String} propertyKey
             @return {Alto.ComputedProperty} an array mapped to the specified key
             */
            function mapBy (dependentKey, propertyKey) {
                var callback = function(item) { return get(item, propertyKey); };
                return map(dependentKey + '.@each.' + propertyKey, callback);
            }

            __exports__.mapBy = mapBy;/**
             @method computed.mapProperty
             @for Alto
             @deprecated Use `Alto.computed.mapBy` instead
             @param dependentKey
             @param propertyKey
             */
            var mapProperty = mapBy;
            __exports__.mapProperty = mapProperty;
            /**
             Filters the array by the callback.

             The callback method you provide should have the following signature.
             `item` is the current item in the iteration.
             `index` is the integer index of the current item in the iteration.

             ```javascript
             function(item, index);
             ```

             ```javascript
             var Hamster = Alto.Object.extend({
        remainingChores: Alto.computed.filter('chores', function(chore, index) {
          return !chore.done;
        })
      });

             var hamster = Hamster.create({
        chores: [
          { name: 'cook', done: true },
          { name: 'clean', done: true },
          { name: 'write more unit tests', done: false }
        ]
      });

             hamster.get('remainingChores'); // [{name: 'write more unit tests', done: false}]
             ```

             @method computed.filter
             @for Alto
             @param {String} dependentKey
             @param {Function} callback
             @return {Alto.ComputedProperty} the filtered array
             */
            function filter(dependentKey, callback) {
                var options = {
                    initialize: function (array, changeMeta, instanceMeta) {
                        instanceMeta.filteredArrayIndexes = new SubArray();
                    },

                    addedItem: function (array, item, changeMeta, instanceMeta) {
                        var match = !!callback.call(this, item, changeMeta.index);
                        var filterIndex = instanceMeta.filteredArrayIndexes.addItem(changeMeta.index, match);

                        if (match) {
                            array.insertAt(filterIndex, item);
                        }

                        return array;
                    },

                    removedItem: function(array, item, changeMeta, instanceMeta) {
                        var filterIndex = instanceMeta.filteredArrayIndexes.removeItem(changeMeta.index);

                        if (filterIndex > -1) {
                            array.removeAt(filterIndex);
                        }

                        return array;
                    }
                };

                return arrayComputed(dependentKey, options);
            }

            __exports__.filter = filter;/**
             Filters the array by the property and value

             ```javascript
             var Hamster = Alto.Object.extend({
        remainingChores: Alto.computed.filterBy('chores', 'done', false)
      });

             var hamster = Hamster.create({
        chores: [
          { name: 'cook', done: true },
          { name: 'clean', done: true },
          { name: 'write more unit tests', done: false }
        ]
      });

             hamster.get('remainingChores'); // [{ name: 'write more unit tests', done: false }]
             ```

             @method computed.filterBy
             @for Alto
             @param {String} dependentKey
             @param {String} propertyKey
             @param {*} value
             @return {Alto.ComputedProperty} the filtered array
             */
            function filterBy (dependentKey, propertyKey, value) {
                var callback;

                if (arguments.length === 2) {
                    callback = function(item) {
                        return get(item, propertyKey);
                    };
                } else {
                    callback = function(item) {
                        return get(item, propertyKey) === value;
                    };
                }

                return filter(dependentKey + '.@each.' + propertyKey, callback);
            }

            __exports__.filterBy = filterBy;/**
             @method computed.filterProperty
             @for Alto
             @param dependentKey
             @param propertyKey
             @param value
             @deprecated Use `Alto.computed.filterBy` instead
             */
            var filterProperty = filterBy;
            __exports__.filterProperty = filterProperty;
            /**
             A computed property which returns a new array with all the unique
             elements from one or more dependent arrays.

             Example

             ```javascript
             var Hamster = Alto.Object.extend({
        uniqueFruits: Alto.computed.uniq('fruits')
      });

             var hamster = Hamster.create({
        fruits: [
          'banana',
          'grape',
          'kale',
          'banana'
        ]
      });

             hamster.get('uniqueFruits'); // ['banana', 'grape', 'kale']
             ```

             @method computed.uniq
             @for Alto
             @param {String} propertyKey*
             @return {Alto.ComputedProperty} computes a new array with all the
             unique elements from the dependent array
             */
            function uniq() {
                var args = a_slice.call(arguments);

                args.push({
                    initialize: function(array, changeMeta, instanceMeta) {
                        instanceMeta.itemCounts = {};
                    },

                    addedItem: function(array, item, changeMeta, instanceMeta) {
                        var guid = guidFor(item);

                        if (!instanceMeta.itemCounts[guid]) {
                            instanceMeta.itemCounts[guid] = 1;
                            array.pushObject(item);
                        } else {
                            ++instanceMeta.itemCounts[guid];
                        }
                        return array;
                    },

                    removedItem: function(array, item, _, instanceMeta) {
                        var guid = guidFor(item);
                        var itemCounts = instanceMeta.itemCounts;

                        if (--itemCounts[guid] === 0) {
                            array.removeObject(item);
                        }

                        return array;
                    }
                });

                return arrayComputed.apply(null, args);
            }

            __exports__.uniq = uniq;/**
             Alias for [Alto.computed.uniq](/api/#method_computed_uniq).

             @method computed.union
             @for Alto
             @param {String} propertyKey*
             @return {Alto.ComputedProperty} computes a new array with all the
             unique elements from the dependent array
             */
            var union = uniq;
            __exports__.union = union;
            /**
             A computed property which returns a new array with all the duplicated
             elements from two or more dependent arrays.

             Example

             ```javascript
             var obj = Alto.Object.createWithMixins({
        adaFriends: ['Charles Babbage', 'John Hobhouse', 'William King', 'Mary Somerville'],
        charlesFriends: ['William King', 'Mary Somerville', 'Ada Lovelace', 'George Peacock'],
        friendsInCommon: Alto.computed.intersect('adaFriends', 'charlesFriends')
      });

             obj.get('friendsInCommon'); // ['William King', 'Mary Somerville']
             ```

             @method computed.intersect
             @for Alto
             @param {String} propertyKey*
             @return {Alto.ComputedProperty} computes a new array with all the
             duplicated elements from the dependent arrays
             */
            function intersect() {
                var args = a_slice.call(arguments);

                args.push({
                    initialize: function (array, changeMeta, instanceMeta) {
                        instanceMeta.itemCounts = {};
                    },

                    addedItem: function(array, item, changeMeta, instanceMeta) {
                        var itemGuid = guidFor(item);
                        var dependentGuid = guidFor(changeMeta.arrayChanged);
                        var numberOfDependentArrays = changeMeta.property._dependentKeys.length;
                        var itemCounts = instanceMeta.itemCounts;

                        if (!itemCounts[itemGuid]) {
                            itemCounts[itemGuid] = {};
                        }

                        if (itemCounts[itemGuid][dependentGuid] === undefined) {
                            itemCounts[itemGuid][dependentGuid] = 0;
                        }

                        if (++itemCounts[itemGuid][dependentGuid] === 1 &&
                            numberOfDependentArrays === keys(itemCounts[itemGuid]).length) {
                            array.addObject(item);
                        }

                        return array;
                    },

                    removedItem: function(array, item, changeMeta, instanceMeta) {
                        var itemGuid = guidFor(item);
                        var dependentGuid = guidFor(changeMeta.arrayChanged);
                        var numberOfArraysItemAppearsIn;
                        var itemCounts = instanceMeta.itemCounts;

                        if (itemCounts[itemGuid][dependentGuid] === undefined) {
                            itemCounts[itemGuid][dependentGuid] = 0;
                        }

                        if (--itemCounts[itemGuid][dependentGuid] === 0) {
                            delete itemCounts[itemGuid][dependentGuid];
                            numberOfArraysItemAppearsIn = keys(itemCounts[itemGuid]).length;

                            if (numberOfArraysItemAppearsIn === 0) {
                                delete itemCounts[itemGuid];
                            }

                            array.removeObject(item);
                        }

                        return array;
                    }
                });

                return arrayComputed.apply(null, args);
            }

            __exports__.intersect = intersect;/**
             A computed property which returns a new array with all the
             properties from the first dependent array that are not in the second
             dependent array.

             Example

             ```javascript
             var Hamster = Alto.Object.extend({
        likes: ['banana', 'grape', 'kale'],
        wants: Alto.computed.setDiff('likes', 'fruits')
      });

             var hamster = Hamster.create({
        fruits: [
          'grape',
          'kale',
        ]
      });

             hamster.get('wants'); // ['banana']
             ```

             @method computed.setDiff
             @for Alto
             @param {String} setAProperty
             @param {String} setBProperty
             @return {Alto.ComputedProperty} computes a new array with all the
             items from the first dependent array that are not in the second
             dependent array
             */
            function setDiff(setAProperty, setBProperty) {
                if (arguments.length !== 2) {
                    throw new AltoError('setDiff requires exactly two dependent arrays.');
                }

                return arrayComputed(setAProperty, setBProperty, {
                    addedItem: function (array, item, changeMeta, instanceMeta) {
                        var setA = get(this, setAProperty);
                        var setB = get(this, setBProperty);

                        if (changeMeta.arrayChanged === setA) {
                            if (!setB.contains(item)) {
                                array.addObject(item);
                            }
                        } else {
                            array.removeObject(item);
                        }

                        return array;
                    },

                    removedItem: function (array, item, changeMeta, instanceMeta) {
                        var setA = get(this, setAProperty);
                        var setB = get(this, setBProperty);

                        if (changeMeta.arrayChanged === setB) {
                            if (setA.contains(item)) {
                                array.addObject(item);
                            }
                        } else {
                            array.removeObject(item);
                        }

                        return array;
                    }
                });
            }

            __exports__.setDiff = setDiff;function binarySearch(array, item, low, high) {
                var mid, midItem, res, guidMid, guidItem;

                if (arguments.length < 4) {
                    high = get(array, 'length');
                }

                if (arguments.length < 3) {
                    low = 0;
                }

                if (low === high) {
                    return low;
                }

                mid = low + Math.floor((high - low) / 2);
                midItem = array.objectAt(mid);

                guidMid = guidFor(midItem);
                guidItem = guidFor(item);

                if (guidMid === guidItem) {
                    return mid;
                }

                res = this.order(midItem, item);

                if (res === 0) {
                    res = guidMid < guidItem ? -1 : 1;
                }


                if (res < 0) {
                    return this.binarySearch(array, item, mid+1, high);
                } else if (res > 0) {
                    return this.binarySearch(array, item, low, mid);
                }

                return mid;
            }


            /**
             A computed property which returns a new array with all the
             properties from the first dependent array sorted based on a property
             or sort function.

             The callback method you provide should have the following signature:

             ```javascript
             function(itemA, itemB);
             ```

             - `itemA` the first item to compare.
             - `itemB` the second item to compare.

             This function should return negative number (e.g. `-1`) when `itemA` should come before
             `itemB`. It should return positive number (e.g. `1`) when `itemA` should come after
             `itemB`. If the `itemA` and `itemB` are equal this function should return `0`.

             Therefore, if this function is comparing some numeric values, simple `itemA - itemB` or
             `itemA.get( 'foo' ) - itemB.get( 'foo' )` can be used instead of series of `if`.

             Example

             ```javascript
             var ToDoList = Alto.Object.extend({
        // using standard ascending sort
        todosSorting: ['name'],
        sortedTodos: Alto.computed.sort('todos', 'todosSorting'),

        // using descending sort
        todosSortingDesc: ['name:desc'],
        sortedTodosDesc: Alto.computed.sort('todos', 'todosSortingDesc'),

        // using a custom sort function
        priorityTodos: Alto.computed.sort('todos', function(a, b){
          if (a.priority > b.priority) {
            return 1;
          } else if (a.priority < b.priority) {
            return -1;
          }

          return 0;
        })
      });

             var todoList = ToDoList.create({todos: [
        { name: 'Unit Test', priority: 2 },
        { name: 'Documentation', priority: 3 },
        { name: 'Release', priority: 1 }
      ]});

             todoList.get('sortedTodos');      // [{ name:'Documentation', priority:3 }, { name:'Release', priority:1 }, { name:'Unit Test', priority:2 }]
             todoList.get('sortedTodosDesc');  // [{ name:'Unit Test', priority:2 }, { name:'Release', priority:1 }, { name:'Documentation', priority:3 }]
             todoList.get('priorityTodos');    // [{ name:'Release', priority:1 }, { name:'Unit Test', priority:2 }, { name:'Documentation', priority:3 }]
             ```

             @method computed.sort
             @for Alto
             @param {String} dependentKey
             @param {String or Function} sortDefinition a dependent key to an
             array of sort properties (add `:desc` to the arrays sort properties to sort descending) or a function to use when sorting
             @return {Alto.ComputedProperty} computes a new sorted array based
             on the sort property array or callback function
             */
            function sort(itemsKey, sortDefinition) {
                Alto.assert('Alto.computed.sort requires two arguments: an array key to sort and ' +
                    'either a sort properties key or sort function', arguments.length === 2);

                if (typeof sortDefinition === 'function') {
                    return customSort(itemsKey, sortDefinition);
                } else {
                    return propertySort(itemsKey, sortDefinition);
                }
            }

            __exports__.sort = sort;function customSort(itemsKey, comparator) {
                return arrayComputed(itemsKey, {
                    initialize: function (array, changeMeta, instanceMeta) {
                        instanceMeta.order = comparator;
                        instanceMeta.binarySearch = binarySearch;
                        instanceMeta.waitingInsertions = [];
                        instanceMeta.insertWaiting = function() {
                            var index, item;
                            var waiting = instanceMeta.waitingInsertions;
                            instanceMeta.waitingInsertions = [];
                            for (var i=0; i<waiting.length; i++) {
                                item = waiting[i];
                                index = instanceMeta.binarySearch(array, item);
                                array.insertAt(index, item);
                            }
                        };
                        instanceMeta.insertLater = function(item) {
                            this.waitingInsertions.push(item);
                        };
                    },

                    addedItem: function (array, item, changeMeta, instanceMeta) {
                        instanceMeta.insertLater(item);
                        return array;
                    },

                    removedItem: function (array, item, changeMeta, instanceMeta) {
                        array.removeObject(item);
                        return array;
                    },

                    flushedChanges: function(array, instanceMeta) {
                        instanceMeta.insertWaiting();
                    }
                });
            }

            function propertySort(itemsKey, sortPropertiesKey) {
                return arrayComputed(itemsKey, {
                    initialize: function (array, changeMeta, instanceMeta) {
                        function setupSortProperties() {
                            var sortPropertyDefinitions = get(this, sortPropertiesKey);
                            var sortProperties = instanceMeta.sortProperties = [];
                            var sortPropertyAscending = instanceMeta.sortPropertyAscending = {};
                            var sortProperty, idx, asc;

                            Alto.assert('Cannot sort: \'' + sortPropertiesKey + '\' is not an array.',
                                isArray(sortPropertyDefinitions));

                            changeMeta.property.clearItemPropertyKeys(itemsKey);

                            forEach(sortPropertyDefinitions, function (sortPropertyDefinition) {
                                if ((idx = sortPropertyDefinition.indexOf(':')) !== -1) {
                                    sortProperty = sortPropertyDefinition.substring(0, idx);
                                    asc = sortPropertyDefinition.substring(idx+1).toLowerCase() !== 'desc';
                                } else {
                                    sortProperty = sortPropertyDefinition;
                                    asc = true;
                                }

                                sortProperties.push(sortProperty);
                                sortPropertyAscending[sortProperty] = asc;
                                changeMeta.property.itemPropertyKey(itemsKey, sortProperty);
                            });

                            sortPropertyDefinitions.addObserver('@each', this, updateSortPropertiesOnce);
                        }

                        function updateSortPropertiesOnce() {
                            run.once(this, updateSortProperties, changeMeta.propertyName);
                        }

                        function updateSortProperties(propertyName) {
                            setupSortProperties.call(this);
                            changeMeta.property.recomputeOnce.call(this, propertyName);
                        }

                        addObserver(this, sortPropertiesKey, updateSortPropertiesOnce);
                        setupSortProperties.call(this);

                        instanceMeta.order = function (itemA, itemB) {
                            var sortProperty, result, asc;
                            var keyA = this.keyFor(itemA);
                            var keyB = this.keyFor(itemB);

                            for (var i = 0; i < this.sortProperties.length; ++i) {
                                sortProperty = this.sortProperties[i];

                                result = compare(keyA[sortProperty], keyB[sortProperty]);

                                if (result !== 0) {
                                    asc = this.sortPropertyAscending[sortProperty];
                                    return asc ? result : (-1 * result);
                                }
                            }

                            return 0;
                        };

                        instanceMeta.binarySearch = binarySearch;
                        setupKeyCache(instanceMeta);
                    },

                    addedItem: function (array, item, changeMeta, instanceMeta) {
                        var index = instanceMeta.binarySearch(array, item);
                        array.insertAt(index, item);
                        return array;
                    },

                    removedItem: function (array, item, changeMeta, instanceMeta) {
                        var index = instanceMeta.binarySearch(array, item);
                        array.removeAt(index);
                        instanceMeta.dropKeyFor(item);
                        return array;
                    }
                });
            }

            function setupKeyCache(instanceMeta) {
                instanceMeta.keyFor = function(item) {
                    var guid = guidFor(item);
                    if (this.keyCache[guid]) {
                        return this.keyCache[guid];
                    }
                    var sortProperty;
                    var key = {};
                    for (var i = 0; i < this.sortProperties.length; ++i) {
                        sortProperty = this.sortProperties[i];
                        key[sortProperty] = get(item, sortProperty);
                    }
                    return this.keyCache[guid] = key;
                };

                instanceMeta.dropKeyFor = function(item) {
                    var guid = guidFor(item);
                    this.keyCache[guid] = null;
                };

                instanceMeta.keyCache = {};
            }
        });
    enifed("ember-runtime/controllers/array_controller",
        ["ember-metal/core","ember-metal/property_get","ember-metal/enumerable_utils","ember-runtime/system/array_proxy","ember-runtime/mixins/sortable","ember-runtime/mixins/controller","ember-metal/computed","ember-metal/error","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */

            var Alto = __dependency1__["default"];
            var get = __dependency2__.get;
            var forEach = __dependency3__.forEach;
            var replace = __dependency3__.replace;
            var ArrayProxy = __dependency4__["default"];
            var SortableMixin = __dependency5__["default"];
            var ControllerMixin = __dependency6__["default"];
            var computed = __dependency7__.computed;
            var AltoError = __dependency8__["default"];


            /**
             `Alto.ArrayController` provides a way for you to publish a collection of
             objects so that you can easily bind to the collection from a Handlebars
             `#each` helper, an `Alto.CollectionView`, or other controllers.

             The advantage of using an `ArrayController` is that you only have to set up
             your view bindings once; to change what's displayed, simply swap out the
             `model` property on the controller.

             For example, imagine you wanted to display a list of items fetched via an XHR
             request. Create an `Alto.ArrayController` and set its `model` property:

             ```javascript
             MyApp.listController = Alto.ArrayController.create();

             $.get('people.json', function(data) {
        MyApp.listController.set('model', data);
      });
             ```

             Then, create a view that binds to your new controller:

             ```handlebars
             {{#each person in MyApp.listController}}
             {{person.firstName}} {{person.lastName}}
             {{/each}}
             ```

             Although you are binding to the controller, the behavior of this controller
             is to pass through any methods or properties to the underlying array. This
             capability comes from `Alto.ArrayProxy`, which this class inherits from.

             Sometimes you want to display computed properties within the body of an
             `#each` helper that depend on the underlying items in `model`, but are not
             present on those items.   To do this, set `itemController` to the name of a
             controller (probably an `ObjectController`) that will wrap each individual item.

             For example:

             ```handlebars
             {{#each post in controller}}
             <li>{{post.title}} ({{post.titleLength}} characters)</li>
             {{/each}}
             ```

             ```javascript
             App.PostsController = Alto.ArrayController.extend({
        itemController: 'post'
      });

             App.PostController = Alto.ObjectController.extend({
        // the `title` property will be proxied to the underlying post.
        titleLength: function() {
          return this.get('title').length;
        }.property('title')
      });
             ```

             In some cases it is helpful to return a different `itemController` depending
             on the particular item.  Subclasses can do this by overriding
             `lookupItemController`.

             For example:

             ```javascript
             App.MyArrayController = Alto.ArrayController.extend({
        lookupItemController: function( object ) {
          if (object.get('isSpecial')) {
            return "special"; // use App.SpecialController
          } else {
            return "regular"; // use App.RegularController
          }
        }
      });
             ```

             The itemController instances will have a `parentController` property set to
             the `ArrayController` instance.

             @class ArrayController
             @namespace Alto
             @extends Alto.ArrayProxy
             @uses Alto.SortableMixin
             @uses Alto.ControllerMixin
             */

            __exports__["default"] = ArrayProxy.extend(ControllerMixin, SortableMixin, {

                /**
                 The controller used to wrap items, if any. If the value is a string, it will
                 be used to lookup the container for the controller. As an alternative, you
                 can also provide a controller class as the value.

                 For example:

                 ```javascript
                 App.MyArrayController = Alto.ArrayController.extend({
          itemController: Alto.ObjectController.extend({
            //Item Controller Implementation
          })
        });
                 ```

                 @property itemController
                 @type String | Alto.Controller
                 @default null
                 */
                itemController: null,

                /**
                 Return the name of the controller to wrap items, or `null` if items should
                 be returned directly.  The default implementation simply returns the
                 `itemController` property, but subclasses can override this method to return
                 different controllers for different objects.

                 For example:

                 ```javascript
                 App.MyArrayController = Alto.ArrayController.extend({
          lookupItemController: function( object ) {
            if (object.get('isSpecial')) {
              return "special"; // use App.SpecialController
            } else {
              return "regular"; // use App.RegularController
            }
          }
        });
                 ```

                 @method lookupItemController
                 @param {Object} object
                 @return {String}
                 */
                lookupItemController: function(object) {
                    return get(this, 'itemController');
                },

                objectAtContent: function(idx) {
                    var length = get(this, 'length');
                    var arrangedContent = get(this, 'arrangedContent');
                    var object = arrangedContent && arrangedContent.objectAt(idx);
                    var controllerClass;

                    if (idx >= 0 && idx < length) {
                        controllerClass = this.lookupItemController(object);

                        if (controllerClass) {
                            return this.controllerAt(idx, object, controllerClass);
                        }
                    }

                    // When `controllerClass` is falsy, we have not opted in to using item
                    // controllers, so return the object directly.

                    // When the index is out of range, we want to return the "out of range"
                    // value, whatever that might be.  Rather than make assumptions
                    // (e.g. guessing `null` or `undefined`) we defer this to `arrangedContent`.
                    return object;
                },

                arrangedContentDidChange: function() {
                    this._super();
                    this._resetSubControllers();
                },

                arrayContentDidChange: function(idx, removedCnt, addedCnt) {
                    var subControllers = this._subControllers;

                    if (subControllers.length) {
                        var subControllersToRemove = subControllers.slice(idx, idx + removedCnt);

                        forEach(subControllersToRemove, function(subController) {
                            if (subController) {
                                subController.destroy();
                            }
                        });

                        replace(subControllers, idx, removedCnt, new Array(addedCnt));
                    }

                    // The shadow array of subcontrollers must be updated before we trigger
                    // observers, otherwise observers will get the wrong subcontainer when
                    // calling `objectAt`
                    this._super(idx, removedCnt, addedCnt);
                },

                init: function() {
                    this._super();
                    this._subControllers = [];
                },

                model: computed(function () {
                    return Alto.A();
                }),

                /**
                 * Flag to mark as being "virtual". Used to keep this instance
                 * from participating in the parentController hierarchy.
                 *
                 * @private
                 * @property _isVirtual
                 * @type Boolean
                 */
                _isVirtual: false,

                controllerAt: function(idx, object, controllerClass) {
                    var container = get(this, 'container');
                    var subControllers = this._subControllers;
                    var fullName, subController, subControllerFactory, parentController, options;

                    if (subControllers.length > idx) {
                        subController = subControllers[idx];

                        if (subController) {
                            return subController;
                        }
                    }

                    if (this._isVirtual) {
                        parentController = get(this, 'parentController');
                    } else {
                        parentController = this;
                    }


                    fullName = 'controller:' + controllerClass;

                    if (!container.has(fullName)) {
                        throw new AltoError('Could not resolve itemController: "' + controllerClass + '"');
                    }

                    subController = container.lookupFactory(fullName).create({
                        target: parentController,
                        parentController: parentController,
                        model: object
                    });


                    subControllers[idx] = subController;

                    return subController;
                },

                _subControllers: null,

                _resetSubControllers: function() {
                    var controller;
                    var subControllers = this._subControllers;

                    if (subControllers.length) {
                        for (var i = 0, length = subControllers.length; length > i; i++) {
                            controller = subControllers[i];

                            if (controller) {
                                controller.destroy();
                            }
                        }

                        subControllers.length = 0;
                    }
                },

                willDestroy: function() {
                    this._resetSubControllers();
                    this._super();
                }
            });
        });
    enifed("ember-runtime/controllers/controller",
        ["ember-metal/core","ember-runtime/system/object","ember-runtime/mixins/controller","ember-runtime/inject","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            // Alto.assert
            var AltoObject = __dependency2__["default"];
            var Mixin = __dependency3__["default"];
            var createInjectionHelper = __dependency4__.createInjectionHelper;

            /**
             @module ember
             @submodule ember-runtime
             */

            /**
             @class Controller
             @namespace Alto
             @extends Alto.Object
             @uses Alto.ControllerMixin
             */
            var Controller = AltoObject.extend(Mixin);

            function controllerInjectionHelper(factory) {
                Alto.assert("Defining an injected controller property on a " +
                    "non-controller is not allowed.", Controller.detect(factory));
            }


            __exports__["default"] = Controller;
        });
    enifed("ember-runtime/controllers/object_controller",
        ["ember-runtime/mixins/controller","ember-runtime/system/object_proxy","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var ControllerMixin = __dependency1__["default"];
            var ObjectProxy = __dependency2__["default"];

            /**
             @module ember
             @submodule ember-runtime
             */

            /**
             `Alto.ObjectController` is part of Alto's Controller layer. It is intended
             to wrap a single object, proxying unhandled attempts to `get` and `set` to the underlying
             model object, and to forward unhandled action attempts to its `target`.

             `Alto.ObjectController` derives this functionality from its superclass
             `Alto.ObjectProxy` and the `Alto.ControllerMixin` mixin.

             @class ObjectController
             @namespace Alto
             @extends Alto.ObjectProxy
             @uses Alto.ControllerMixin
             **/
            __exports__["default"] = ObjectProxy.extend(ControllerMixin);
        });
    enifed("ember-runtime/copy",
        ["ember-metal/enumerable_utils","ember-metal/utils","ember-runtime/system/object","ember-runtime/mixins/copyable","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            var indexOf = __dependency1__.indexOf;
            var typeOf = __dependency2__.typeOf;
            var AltoObject = __dependency3__["default"];
            var Copyable = __dependency4__["default"];

            function _copy(obj, deep, seen, copies) {
                var ret, loc, key;

                // primitive data types are immutable, just return them.
                if (typeof obj !== 'object' || obj === null) {
                    return obj;
                }

                // avoid cyclical loops
                if (deep && (loc = indexOf(seen, obj)) >= 0) {
                    return copies[loc];
                }

                Alto.assert('Cannot clone an Alto.Object that does not implement Alto.Copyable',
                    !(obj instanceof AltoObject) || (Copyable && Copyable.detect(obj)));

                // IMPORTANT: this specific test will detect a native array only. Any other
                // object will need to implement Copyable.
                if (typeOf(obj) === 'array') {
                    ret = obj.slice();

                    if (deep) {
                        loc = ret.length;

                        while (--loc >= 0) {
                            ret[loc] = _copy(ret[loc], deep, seen, copies);
                        }
                    }
                } else if (Copyable && Copyable.detect(obj)) {
                    ret = obj.copy(deep, seen, copies);
                } else if (obj instanceof Date) {
                    ret = new Date(obj.getTime());
                } else {
                    ret = {};

                    for (key in obj) {
                        // support Null prototype
                        if (!Object.prototype.hasOwnProperty.call(obj, key)) {
                            continue;
                        }

                        // Prevents browsers that don't respect non-enumerability from
                        // copying internal Alto properties
                        if (key.substring(0, 2) === '__') {
                            continue;
                        }

                        ret[key] = deep ? _copy(obj[key], deep, seen, copies) : obj[key];
                    }
                }

                if (deep) {
                    seen.push(obj);
                    copies.push(ret);
                }

                return ret;
            }

            /**
             Creates a clone of the passed object. This function can take just about
             any type of object and create a clone of it, including primitive values
             (which are not actually cloned because they are immutable).

             If the passed object implements the `copy()` method, then this function
             will simply call that method and return the result. Please see
             `Alto.Copyable` for further details.

             @method copy
             @for Alto
             @param {Object} obj The object to clone
             @param {Boolean} deep If true, a deep copy of the object is made
             @return {Object} The cloned object
             */
            __exports__["default"] = function copy(obj, deep) {
                // fast paths
                if ('object' !== typeof obj || obj === null) {
                    return obj; // can't copy primitives
                }

                if (Copyable && Copyable.detect(obj)) {
                    return obj.copy(deep);
                }

                return _copy(obj, deep, deep ? [] : null, deep ? [] : null);
            }
        });
    enifed("ember-runtime/core",
        ["exports"],
        function(__exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */

            /**
             Compares two objects, returning true if they are logically equal. This is
             a deeper comparison than a simple triple equal. For sets it will compare the
             internal objects. For any other object that implements `isEqual()` it will
             respect that method.

             ```javascript
             Alto.isEqual('hello', 'hello');  // true
             Alto.isEqual(1, 2);              // false
             Alto.isEqual([4, 2], [4, 2]);    // false
             ```

             @method isEqual
             @for Alto
             @param {Object} a first object to compare
             @param {Object} b second object to compare
             @return {Boolean}
             */
            var isEqual = function isEqual(a, b) {
                if (a && typeof a.isEqual === 'function') {
                    return a.isEqual(b);
                }

                if (a instanceof Date && b instanceof Date) {
                    return a.getTime() === b.getTime();
                }

                return a === b;
            };
            __exports__.isEqual = isEqual;
        });
    enifed("ember-runtime/ext/function",
        ["ember-metal/core","ember-metal/expand_properties","ember-metal/computed","ember-metal/mixin"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */

            var Alto = __dependency1__["default"];
            // Alto.EXTEND_PROTOTYPES, Alto.assert
            var expandProperties = __dependency2__["default"];
            var computed = __dependency3__.computed;
            var observer = __dependency4__.observer;

            var a_slice = Array.prototype.slice;
            var FunctionPrototype = Function.prototype;

            if (Alto.EXTEND_PROTOTYPES === true || Alto.EXTEND_PROTOTYPES.Function) {

                /**
                 The `property` extension of Javascript's Function prototype is available
                 when `Alto.EXTEND_PROTOTYPES` or `Alto.EXTEND_PROTOTYPES.Function` is
                 `true`, which is the default.

                 Computed properties allow you to treat a function like a property:

                 ```javascript
                 MyApp.President = Alto.Object.extend({
          firstName: '',
          lastName:  '',

          fullName: function() {
            return this.get('firstName') + ' ' + this.get('lastName');
          }.property() // Call this flag to mark the function as a property
        });

                 var president = MyApp.President.create({
          firstName: 'Barack',
          lastName: 'Obama'
        });

                 president.get('fullName'); // 'Barack Obama'
                 ```

                 Treating a function like a property is useful because they can work with
                 bindings, just like any other property.

                 Many computed properties have dependencies on other properties. For
                 example, in the above example, the `fullName` property depends on
                 `firstName` and `lastName` to determine its value. You can tell Alto
                 about these dependencies like this:

                 ```javascript
                 MyApp.President = Alto.Object.extend({
          firstName: '',
          lastName:  '',

          fullName: function() {
            return this.get('firstName') + ' ' + this.get('lastName');

            // Tell Alto.js that this computed property depends on firstName
            // and lastName
          }.property('firstName', 'lastName')
        });
                 ```

                 Make sure you list these dependencies so Alto knows when to update
                 bindings that connect to a computed property. Changing a dependency
                 will not immediately trigger an update of the computed property, but
                 will instead clear the cache so that it is updated when the next `get`
                 is called on the property.

                 See [Alto.ComputedProperty](/api/classes/Alto.ComputedProperty.html), [Alto.computed](/api/#method_computed).

                 @method property
                 @for Function
                 */
                FunctionPrototype.property = function () {
                    var ret = computed(this);
                    // ComputedProperty.prototype.property expands properties; no need for us to
                    // do so here.
                    return ret.property.apply(ret, arguments);
                };

                /**
                 The `observes` extension of Javascript's Function prototype is available
                 when `Alto.EXTEND_PROTOTYPES` or `Alto.EXTEND_PROTOTYPES.Function` is
                 true, which is the default.

                 You can observe property changes simply by adding the `observes`
                 call to the end of your method declarations in classes that you write.
                 For example:

                 ```javascript
                 Alto.Object.extend({
          valueObserver: function() {
            // Executes whenever the "value" property changes
          }.observes('value')
        });
                 ```

                 In the future this method may become asynchronous. If you want to ensure
                 synchronous behavior, use `observesImmediately`.

                 See `Alto.observer`.

                 @method observes
                 @for Function
                 */
                FunctionPrototype.observes = function() {
                    var length = arguments.length;
                    var args = new Array(length);
                    for (var x = 0; x < length; x++) {
                        args[x] = arguments[x];
                    }
                    return observer.apply(this, args.concat(this));
                };

                /**
                 The `observesImmediately` extension of Javascript's Function prototype is
                 available when `Alto.EXTEND_PROTOTYPES` or
                 `Alto.EXTEND_PROTOTYPES.Function` is true, which is the default.

                 You can observe property changes simply by adding the `observesImmediately`
                 call to the end of your method declarations in classes that you write.
                 For example:

                 ```javascript
                 Alto.Object.extend({
          valueObserver: function() {
            // Executes immediately after the "value" property changes
          }.observesImmediately('value')
        });
                 ```

                 In the future, `observes` may become asynchronous. In this event,
                 `observesImmediately` will maintain the synchronous behavior.

                 See `Alto.immediateObserver`.

                 @method observesImmediately
                 @for Function
                 */
                FunctionPrototype.observesImmediately = function () {
                    for (var i = 0, l = arguments.length; i < l; i++) {
                        var arg = arguments[i];
                        Alto.assert('Immediate observers must observe internal properties only, ' +
                            'not properties on other objects.', arg.indexOf('.') === -1);
                    }

                    // observes handles property expansion
                    return this.observes.apply(this, arguments);
                };

                /**
                 The `observesBefore` extension of Javascript's Function prototype is
                 available when `Alto.EXTEND_PROTOTYPES` or
                 `Alto.EXTEND_PROTOTYPES.Function` is true, which is the default.

                 You can get notified when a property change is about to happen by
                 by adding the `observesBefore` call to the end of your method
                 declarations in classes that you write. For example:

                 ```javascript
                 Alto.Object.extend({
          valueObserver: function() {
            // Executes whenever the "value" property is about to change
          }.observesBefore('value')
        });
                 ```

                 See `Alto.beforeObserver`.

                 @method observesBefore
                 @for Function
                 */
                FunctionPrototype.observesBefore = function () {
                    var watched = [];
                    var addWatchedProperty = function (obs) {
                        watched.push(obs);
                    };

                    for (var i = 0, l = arguments.length; i < l; ++i) {
                        expandProperties(arguments[i], addWatchedProperty);
                    }

                    this.__alto_observesBefore__ = watched;

                    return this;
                };

                /**
                 The `on` extension of Javascript's Function prototype is available
                 when `Alto.EXTEND_PROTOTYPES` or `Alto.EXTEND_PROTOTYPES.Function` is
                 true, which is the default.

                 You can listen for events simply by adding the `on` call to the end of
                 your method declarations in classes or mixins that you write. For example:

                 ```javascript
                 Alto.Mixin.create({
          doSomethingWithElement: function() {
            // Executes whenever the "didInsertElement" event fires
          }.on('didInsertElement')
        });
                 ```

                 See `Alto.on`.

                 @method on
                 @for Function
                 */
                FunctionPrototype.on = function () {
                    var events = a_slice.call(arguments);
                    this.__alto_listens__ = events;

                    return this;
                };
            }
        });
    enifed("ember-runtime/ext/rsvp",
        ["ember-metal/core","ember-metal/logger","ember-metal/run_loop","rsvp","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            /* globals RSVP:true */

            var Alto = __dependency1__["default"];
            var Logger = __dependency2__["default"];
            var run = __dependency3__["default"];

            // this is technically incorrect (per @wycats)
            // it should be `import * as RSVP from 'rsvp';` but
            // Esprima does not support this syntax yet (and neither does
            // es6-module-transpiler 0.4.0 - 0.6.2).
            var RSVP = __dependency4__;

            var testModuleName = 'ember-testing/test';
            var Test;

            var asyncStart = function() {
                if (Alto.Test && Alto.Test.adapter) {
                    Alto.Test.adapter.asyncStart();
                }
            };

            var asyncEnd = function() {
                if (Alto.Test && Alto.Test.adapter) {
                    Alto.Test.adapter.asyncEnd();
                }
            };

            RSVP.configure('async', function(callback, promise) {
                var async = !run.currentRunLoop;

                if (Alto.testing && async) { asyncStart(); }

                run.backburner.schedule('actions', function(){
                    if (Alto.testing && async) { asyncEnd(); }
                    callback(promise);
                });
            });

            RSVP.Promise.prototype.fail = function(callback, label){
                Alto.deprecate('RSVP.Promise.fail has been renamed as RSVP.Promise.catch');
                return this['catch'](callback, label);
            };

            RSVP.onerrorDefault = function (error) {
                if (error && error.name !== 'TransitionAborted') {
                    if (Alto.testing) {
                        // ES6TODO: remove when possible
                        if (!Test && Alto.__loader.registry[testModuleName]) {
                            Test = requireModule(testModuleName)['default'];
                        }

                        if (Test && Test.adapter) {
                            Test.adapter.exception(error);
                            Logger.error(error.stack);
                        } else {
                            throw error;
                        }
                    } else if (Alto.onerror) {
                        Alto.onerror(error);
                    } else {
                        Logger.error(error.stack);
                        Alto.assert(error, false);
                    }
                }
            };

            RSVP.on('error', RSVP.onerrorDefault);

            __exports__["default"] = RSVP;
        });
    enifed("ember-runtime/ext/string",
        ["ember-metal/core","ember-runtime/system/string"],
        function(__dependency1__, __dependency2__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */

            var Alto = __dependency1__["default"];
            // Alto.EXTEND_PROTOTYPES, Alto.assert, Alto.FEATURES
            var fmt = __dependency2__.fmt;
            var w = __dependency2__.w;
            var loc = __dependency2__.loc;
            var camelize = __dependency2__.camelize;
            var decamelize = __dependency2__.decamelize;
            var dasherize = __dependency2__.dasherize;
            var underscore = __dependency2__.underscore;
            var capitalize = __dependency2__.capitalize;
            var classify = __dependency2__.classify;

            var StringPrototype = String.prototype;

            if (Alto.EXTEND_PROTOTYPES === true || Alto.EXTEND_PROTOTYPES.String) {

                /**
                 See [Alto.String.fmt](/api/classes/Alto.String.html#method_fmt).

                 @method fmt
                 @for String
                 */
                StringPrototype.fmt = function () {
                    return fmt(this, arguments);
                };

                /**
                 See [Alto.String.w](/api/classes/Alto.String.html#method_w).

                 @method w
                 @for String
                 */
                StringPrototype.w = function () {
                    return w(this);
                };

                /**
                 See [Alto.String.loc](/api/classes/Alto.String.html#method_loc).

                 @method loc
                 @for String
                 */
                StringPrototype.loc = function () {
                    return loc(this, arguments);
                };

                /**
                 See [Alto.String.camelize](/api/classes/Alto.String.html#method_camelize).

                 @method camelize
                 @for String
                 */
                StringPrototype.camelize = function () {
                    return camelize(this);
                };

                /**
                 See [Alto.String.decamelize](/api/classes/Alto.String.html#method_decamelize).

                 @method decamelize
                 @for String
                 */
                StringPrototype.decamelize = function () {
                    return decamelize(this);
                };

                /**
                 See [Alto.String.dasherize](/api/classes/Alto.String.html#method_dasherize).

                 @method dasherize
                 @for String
                 */
                StringPrototype.dasherize = function () {
                    return dasherize(this);
                };

                /**
                 See [Alto.String.underscore](/api/classes/Alto.String.html#method_underscore).

                 @method underscore
                 @for String
                 */
                StringPrototype.underscore = function () {
                    return underscore(this);
                };

                /**
                 See [Alto.String.classify](/api/classes/Alto.String.html#method_classify).

                 @method classify
                 @for String
                 */
                StringPrototype.classify = function () {
                    return classify(this);
                };

                /**
                 See [Alto.String.capitalize](/api/classes/Alto.String.html#method_capitalize).

                 @method capitalize
                 @for String
                 */
                StringPrototype.capitalize = function () {
                    return capitalize(this);
                };
            }
        });
    enifed("ember-runtime/inject",
        ["ember-metal/core","ember-metal/enumerable_utils","ember-metal/injected_property","ember-metal/keys","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            // Alto.assert
            var indexOf = __dependency2__.indexOf;
            var InjectedProperty = __dependency3__["default"];
            var keys = __dependency4__["default"];

            /**
             Namespace for injection helper methods.

             @class inject
             @namespace Alto
             */
            function inject() {
                Alto.assert("Injected properties must be created through helpers, see `" +
                    keys(inject).join("`, `") + "`");
            }

            // Dictionary of injection validations by type, added to by `createInjectionHelper`
            var typeValidators = {};

            /**
             This method allows other Alto modules to register injection helpers for a
             given container type. Helpers are exported to the `inject` namespace as the
             container type itself.

             @private
             @method createInjectionHelper
             @namespace Alto
             @param {String} type The container type the helper will inject
             @param {Function} validator A validation callback that is executed at mixin-time
             */
            function createInjectionHelper(type, validator) {
                typeValidators[type] = validator;

                inject[type] = function(name) {
                    return new InjectedProperty(type, name);
                };
            }

            __exports__.createInjectionHelper = createInjectionHelper;/**
             Validation function intended to be invoked at when extending a factory with
             injected properties. Runs per-type validation functions once for each injected
             type encountered.

             Note that this currently modifies the mixin themselves, which is technically
             dubious but is practically of little consequence. This may change in the
             future.

             @private
             @method validatePropertyInjections
             @namespace Alto
             @param {Object} factory The factory object being extended
             @param {Object} props A hash of properties to be added to the factory
             */
            function validatePropertyInjections(factory, props) {
                var types = [];
                var key, desc, validator, i, l;

                for (key in props) {
                    desc = props[key];
                    if (desc instanceof InjectedProperty && indexOf(types, desc.type) === -1) {
                        types.push(desc.type);
                    }
                }

                if (types.length) {
                    for (i = 0, l = types.length; i < l; i++) {
                        validator = typeValidators[types[i]];

                        if (typeof validator === 'function') {
                            validator(factory);
                        }
                    }
                }

                return true;
            }

            __exports__.validatePropertyInjections = validatePropertyInjections;__exports__["default"] = inject;
        });
    enifed("ember-runtime/mixins/-proxy",
        ["ember-metal/core","ember-metal/property_get","ember-metal/property_set","ember-metal/utils","ember-metal/observer","ember-metal/property_events","ember-metal/computed","ember-metal/properties","ember-metal/mixin","ember-runtime/system/string","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */

            var Alto = __dependency1__["default"];
            // Alto.assert
            var get = __dependency2__.get;
            var set = __dependency3__.set;
            var meta = __dependency4__.meta;
            var addObserver = __dependency5__.addObserver;
            var removeObserver = __dependency5__.removeObserver;
            var addBeforeObserver = __dependency5__.addBeforeObserver;
            var removeBeforeObserver = __dependency5__.removeBeforeObserver;
            var propertyWillChange = __dependency6__.propertyWillChange;
            var propertyDidChange = __dependency6__.propertyDidChange;
            var computed = __dependency7__.computed;
            var defineProperty = __dependency8__.defineProperty;
            var Mixin = __dependency9__.Mixin;
            var observer = __dependency9__.observer;
            var fmt = __dependency10__.fmt;

            function contentPropertyWillChange(content, contentKey) {
                var key = contentKey.slice(8); // remove "content."
                if (key in this) { return; }  // if shadowed in proxy
                propertyWillChange(this, key);
            }

            function contentPropertyDidChange(content, contentKey) {
                var key = contentKey.slice(8); // remove "content."
                if (key in this) { return; } // if shadowed in proxy
                propertyDidChange(this, key);
            }

            /**
             `Alto.ProxyMixin` forwards all properties not defined by the proxy itself
             to a proxied `content` object.  See Alto.ObjectProxy for more details.

             @class ProxyMixin
             @namespace Alto
             */
            __exports__["default"] = Mixin.create({
                /**
                 The object whose properties will be forwarded.

                 @property content
                 @type Alto.Object
                 @default null
                 */
                content: null,
                _contentDidChange: observer('content', function() {
                    Alto.assert("Can't set Proxy's content to itself", get(this, 'content') !== this);
                }),

                isTruthy: computed.bool('content'),

                _debugContainerKey: null,

                willWatchProperty: function (key) {
                    var contentKey = 'content.' + key;
                    addBeforeObserver(this, contentKey, null, contentPropertyWillChange);
                    addObserver(this, contentKey, null, contentPropertyDidChange);
                },

                didUnwatchProperty: function (key) {
                    var contentKey = 'content.' + key;
                    removeBeforeObserver(this, contentKey, null, contentPropertyWillChange);
                    removeObserver(this, contentKey, null, contentPropertyDidChange);
                },

                unknownProperty: function (key) {
                    var content = get(this, 'content');
                    if (content) {
                        return get(content, key);
                    }
                },

                setUnknownProperty: function (key, value) {
                    var m = meta(this);
                    if (m.proto === this) {
                        // if marked as prototype then just defineProperty
                        // rather than delegate
                        defineProperty(this, key, null, value);
                        return value;
                    }

                    var content = get(this, 'content');
                    Alto.assert(fmt("Cannot delegate set('%@', %@) to the 'content' property of" +
                        " object proxy %@: its 'content' is undefined.", [key, value, this]), content);
                    return set(content, key, value);
                }

            });
        });
    enifed("ember-runtime/mixins/action_handler",
        ["ember-metal/merge","ember-metal/mixin","ember-metal/property_get","ember-metal/utils","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */
            var merge = __dependency1__["default"];
            var Mixin = __dependency2__.Mixin;
            var get = __dependency3__.get;
            var typeOf = __dependency4__.typeOf;

            /**
             The `Alto.ActionHandler` mixin implements support for moving an `actions`
             property to an `_actions` property at extend time, and adding `_actions`
             to the object's mergedProperties list.

             `Alto.ActionHandler` is available on some familiar classes including
             `Alto.Route`, `Alto.View`, `Alto.Component`, and controllers such as
             `Alto.Controller` and `Alto.ObjectController`.
             (Internally the mixin is used by `Alto.CoreView`, `Alto.ControllerMixin`,
             and `Alto.Route` and available to the above classes through
             inheritance.)

             @class ActionHandler
             @namespace Alto
             */
            var ActionHandler = Mixin.create({
                mergedProperties: ['_actions'],

                /**
                 The collection of functions, keyed by name, available on this
                 `ActionHandler` as action targets.

                 These functions will be invoked when a matching `{{action}}` is triggered
                 from within a template and the application's current route is this route.

                 Actions can also be invoked from other parts of your application
                 via `ActionHandler#send`.

                 The `actions` hash will inherit action handlers from
                 the `actions` hash defined on extended parent classes
                 or mixins rather than just replace the entire hash, e.g.:

                 ```js
                 App.CanDisplayBanner = Alto.Mixin.create({
          actions: {
            displayBanner: function(msg) {
              // ...
            }
          }
        });

                 App.WelcomeRoute = Alto.Route.extend(App.CanDisplayBanner, {
          actions: {
            playMusic: function() {
              // ...
            }
          }
        });

                 // `WelcomeRoute`, when active, will be able to respond
                 // to both actions, since the actions hash is merged rather
                 // then replaced when extending mixins / parent classes.
                 this.send('displayBanner');
                 this.send('playMusic');
                 ```

                 Within a Controller, Route, View or Component's action handler,
                 the value of the `this` context is the Controller, Route, View or
                 Component object:

                 ```js
                 App.SongRoute = Alto.Route.extend({
          actions: {
            myAction: function() {
              this.controllerFor("song");
              this.transitionTo("other.route");
              ...
            }
          }
        });
                 ```

                 It is also possible to call `this._super()` from within an
                 action handler if it overrides a handler defined on a parent
                 class or mixin:

                 Take for example the following routes:

                 ```js
                 App.DebugRoute = Alto.Mixin.create({
          actions: {
            debugRouteInformation: function() {
              console.debug("trololo");
            }
          }
        });

                 App.AnnoyingDebugRoute = Alto.Route.extend(App.DebugRoute, {
          actions: {
            debugRouteInformation: function() {
              // also call the debugRouteInformation of mixed in App.DebugRoute
              this._super();

              // show additional annoyance
              window.alert(...);
            }
          }
        });
                 ```

                 ## Bubbling

                 By default, an action will stop bubbling once a handler defined
                 on the `actions` hash handles it. To continue bubbling the action,
                 you must return `true` from the handler:

                 ```js
                 App.Router.map(function() {
          this.resource("album", function() {
            this.route("song");
          });
        });

                 App.AlbumRoute = Alto.Route.extend({
          actions: {
            startPlaying: function() {
            }
          }
        });

                 App.AlbumSongRoute = Alto.Route.extend({
          actions: {
            startPlaying: function() {
              // ...

              if (actionShouldAlsoBeTriggeredOnParentRoute) {
                return true;
              }
            }
          }
        });
                 ```

                 @property actions
                 @type Hash
                 @default null
                 */

                /**
                 Moves `actions` to `_actions` at extend time. Note that this currently
                 modifies the mixin themselves, which is technically dubious but
                 is practically of little consequence. This may change in the future.

                 @private
                 @method willMergeMixin
                 */
                willMergeMixin: function(props) {

                    var hashName;

                    if (!props._actions) {
                        Alto.assert("'actions' should not be a function", typeof(props.actions) !== 'function');

                        if (typeOf(props.actions) === 'object') {
                            hashName = 'actions';
                        } else if (typeOf(props.events) === 'object') {
                            Alto.deprecate('Action handlers contained in an `events` object are deprecated in favor' +
                                ' of putting them in an `actions` object', false);
                            hashName = 'events';
                        }

                        if (hashName) {
                            props._actions = merge(props._actions || {}, props[hashName]);
                        }

                        delete props[hashName];
                    }
                },

                /**
                 Triggers a named action on the `ActionHandler`. Any parameters
                 supplied after the `actionName` string will be passed as arguments
                 to the action target function.

                 If the `ActionHandler` has its `target` property set, actions may
                 bubble to the `target`. Bubbling happens when an `actionName` can
                 not be found in the `ActionHandler`'s `actions` hash or if the
                 action target function returns `true`.

                 Example

                 ```js
                 App.WelcomeRoute = Alto.Route.extend({
          actions: {
            playTheme: function() {
               this.send('playMusic', 'theme.mp3');
            },
            playMusic: function(track) {
              // ...
            }
          }
        });
                 ```

                 @method send
                 @param {String} actionName The action to trigger
                 @param {*} context a context to send with the action
                 */
                send: function(actionName) {
                    var args = [].slice.call(arguments, 1);
                    var target;

                    if (this._actions && this._actions[actionName]) {
                        if (this._actions[actionName].apply(this, args) === true) {
                            // handler returned true, so this action will bubble
                        } else {
                            return;
                        }
                    }

                    if (target = get(this, 'target')) {
                        Alto.assert("The `target` for " + this + " (" + target +
                            ") does not have a `send` method", typeof target.send === 'function');
                        target.send.apply(target, arguments);
                    }
                }
            });

            __exports__["default"] = ActionHandler;
        });
    enifed("ember-runtime/mixins/array",
        ["ember-metal/core","ember-metal/property_get","ember-metal/computed","ember-metal/is_none","ember-runtime/mixins/enumerable","ember-metal/enumerable_utils","ember-metal/mixin","ember-metal/property_events","ember-metal/events","ember-metal/watching","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */

            // ..........................................................
            // HELPERS
            //
            var Alto = __dependency1__["default"];
            // ES6TODO: Alto.A

            var get = __dependency2__.get;
            var computed = __dependency3__.computed;
            var cacheFor = __dependency3__.cacheFor;
            var isNone = __dependency4__["default"];
            var Enumerable = __dependency5__["default"];
            var map = __dependency6__.map;
            var Mixin = __dependency7__.Mixin;
            var required = __dependency7__.required;
            var propertyWillChange = __dependency8__.propertyWillChange;
            var propertyDidChange = __dependency8__.propertyDidChange;
            var addListener = __dependency9__.addListener;
            var removeListener = __dependency9__.removeListener;
            var sendEvent = __dependency9__.sendEvent;
            var hasListeners = __dependency9__.hasListeners;
            var isWatching = __dependency10__.isWatching;

            function arrayObserversHelper(obj, target, opts, operation, notify) {
                var willChange = (opts && opts.willChange) || 'arrayWillChange';
                var didChange  = (opts && opts.didChange) || 'arrayDidChange';
                var hasObservers = get(obj, 'hasArrayObservers');

                if (hasObservers === notify) {
                    propertyWillChange(obj, 'hasArrayObservers');
                }

                operation(obj, '@array:before', target, willChange);
                operation(obj, '@array:change', target, didChange);

                if (hasObservers === notify) {
                    propertyDidChange(obj, 'hasArrayObservers');
                }

                return obj;
            }

            // ..........................................................
            // ARRAY
            //
            /**
             This mixin implements Observer-friendly Array-like behavior. It is not a
             concrete implementation, but it can be used up by other classes that want
             to appear like arrays.

             For example, ArrayProxy and ArrayController are both concrete classes that can
             be instantiated to implement array-like behavior. Both of these classes use
             the Array Mixin by way of the MutableArray mixin, which allows observable
             changes to be made to the underlying array.

             Unlike `Alto.Enumerable,` this mixin defines methods specifically for
             collections that provide index-ordered access to their contents. When you
             are designing code that needs to accept any kind of Array-like object, you
             should use these methods instead of Array primitives because these will
             properly notify observers of changes to the array.

             Although these methods are efficient, they do add a layer of indirection to
             your application so it is a good idea to use them only when you need the
             flexibility of using both true JavaScript arrays and "virtual" arrays such
             as controllers and collections.

             You can use the methods defined in this module to access and modify array
             contents in a KVO-friendly way. You can also be notified whenever the
             membership of an array changes by using `.observes('myArray.[]')`.

             To support `Alto.Array` in your own class, you must override two
             primitives to use it: `replace()` and `objectAt()`.

             Note that the Alto.Array mixin also incorporates the `Alto.Enumerable`
             mixin. All `Alto.Array`-like objects are also enumerable.

             @class Array
             @namespace Alto
             @uses Alto.Enumerable
             @since Alto 0.9.0
             */
            __exports__["default"] = Mixin.create(Enumerable, {

                /**
                 Your array must support the `length` property. Your replace methods should
                 set this property whenever it changes.

                 @property {Number} length
                 */
                length: required(),

                /**
                 Returns the object at the given `index`. If the given `index` is negative
                 or is greater or equal than the array length, returns `undefined`.

                 This is one of the primitives you must implement to support `Alto.Array`.
                 If your object supports retrieving the value of an array item using `get()`
                 (i.e. `myArray.get(0)`), then you do not need to implement this method
                 yourself.

                 ```javascript
                 var arr = ['a', 'b', 'c', 'd'];

                 arr.objectAt(0);   // 'a'
                 arr.objectAt(3);   // 'd'
                 arr.objectAt(-1);  // undefined
                 arr.objectAt(4);   // undefined
                 arr.objectAt(5);   // undefined
                 ```

                 @method objectAt
                 @param {Number} idx The index of the item to return.
                 @return {*} item at index or undefined
                 */
                objectAt: function(idx) {
                    if (idx < 0 || idx >= get(this, 'length')) {
                        return undefined;
                    }

                    return get(this, idx);
                },

                /**
                 This returns the objects at the specified indexes, using `objectAt`.

                 ```javascript
                 var arr = ['a', 'b', 'c', 'd'];

                 arr.objectsAt([0, 1, 2]);  // ['a', 'b', 'c']
                 arr.objectsAt([2, 3, 4]);  // ['c', 'd', undefined]
                 ```

                 @method objectsAt
                 @param {Array} indexes An array of indexes of items to return.
                 @return {Array}
                 */
                objectsAt: function(indexes) {
                    var self = this;

                    return map(indexes, function(idx) {
                        return self.objectAt(idx);
                    });
                },

                // overrides Alto.Enumerable version
                nextObject: function(idx) {
                    return this.objectAt(idx);
                },

                /**
                 This is the handler for the special array content property. If you get
                 this property, it will return this. If you set this property to a new
                 array, it will replace the current content.

                 This property overrides the default property defined in `Alto.Enumerable`.

                 @property []
                 @return this
                 */
                '[]': computed(function(key, value) {
                    if (value !== undefined) {
                        this.replace(0, get(this, 'length'), value);
                    }

                    return this;
                }),

                firstObject: computed(function() {
                    return this.objectAt(0);
                }),

                lastObject: computed(function() {
                    return this.objectAt(get(this, 'length') - 1);
                }),

                // optimized version from Enumerable
                contains: function(obj) {
                    return this.indexOf(obj) >= 0;
                },

                // Add any extra methods to Alto.Array that are native to the built-in Array.
                /**
                 Returns a new array that is a slice of the receiver. This implementation
                 uses the observable array methods to retrieve the objects for the new
                 slice.

                 ```javascript
                 var arr = ['red', 'green', 'blue'];

                 arr.slice(0);       // ['red', 'green', 'blue']
                 arr.slice(0, 2);    // ['red', 'green']
                 arr.slice(1, 100);  // ['green', 'blue']
                 ```

                 @method slice
                 @param {Integer} beginIndex (Optional) index to begin slicing from.
                 @param {Integer} endIndex (Optional) index to end the slice at (but not included).
                 @return {Array} New array with specified slice
                 */
                slice: function(beginIndex, endIndex) {
                    var ret = Alto.A();
                    var length = get(this, 'length');

                    if (isNone(beginIndex)) {
                        beginIndex = 0;
                    }

                    if (isNone(endIndex) || (endIndex > length)) {
                        endIndex = length;
                    }

                    if (beginIndex < 0) {
                        beginIndex = length + beginIndex;
                    }

                    if (endIndex < 0) {
                        endIndex = length + endIndex;
                    }

                    while (beginIndex < endIndex) {
                        ret[ret.length] = this.objectAt(beginIndex++);
                    }

                    return ret;
                },

                /**
                 Returns the index of the given object's first occurrence.
                 If no `startAt` argument is given, the starting location to
                 search is 0. If it's negative, will count backward from
                 the end of the array. Returns -1 if no match is found.

                 ```javascript
                 var arr = ['a', 'b', 'c', 'd', 'a'];

                 arr.indexOf('a');       //  0
                 arr.indexOf('z');       // -1
                 arr.indexOf('a', 2);    //  4
                 arr.indexOf('a', -1);   //  4
                 arr.indexOf('b', 3);    // -1
                 arr.indexOf('a', 100);  // -1
                 ```

                 @method indexOf
                 @param {Object} object the item to search for
                 @param {Number} startAt optional starting location to search, default 0
                 @return {Number} index or -1 if not found
                 */
                indexOf: function(object, startAt) {
                    var len = get(this, 'length');
                    var idx;

                    if (startAt === undefined) {
                        startAt = 0;
                    }

                    if (startAt < 0) {
                        startAt += len;
                    }

                    for (idx = startAt; idx < len; idx++) {
                        if (this.objectAt(idx) === object) {
                            return idx;
                        }
                    }

                    return -1;
                },

                /**
                 Returns the index of the given object's last occurrence.
                 If no `startAt` argument is given, the search starts from
                 the last position. If it's negative, will count backward
                 from the end of the array. Returns -1 if no match is found.

                 ```javascript
                 var arr = ['a', 'b', 'c', 'd', 'a'];

                 arr.lastIndexOf('a');       //  4
                 arr.lastIndexOf('z');       // -1
                 arr.lastIndexOf('a', 2);    //  0
                 arr.lastIndexOf('a', -1);   //  4
                 arr.lastIndexOf('b', 3);    //  1
                 arr.lastIndexOf('a', 100);  //  4
                 ```

                 @method lastIndexOf
                 @param {Object} object the item to search for
                 @param {Number} startAt optional starting location to search, default 0
                 @return {Number} index or -1 if not found
                 */
                lastIndexOf: function(object, startAt) {
                    var len = get(this, 'length');
                    var idx;

                    if (startAt === undefined || startAt >= len) {
                        startAt = len-1;
                    }

                    if (startAt < 0) {
                        startAt += len;
                    }

                    for (idx = startAt; idx >= 0; idx--) {
                        if (this.objectAt(idx) === object) {
                            return idx;
                        }
                    }

                    return -1;
                },

                // ..........................................................
                // ARRAY OBSERVERS
                //

                /**
                 Adds an array observer to the receiving array. The array observer object
                 normally must implement two methods:

                 * `arrayWillChange(observedObj, start, removeCount, addCount)` - This method will be
                 called just before the array is modified.
                 * `arrayDidChange(observedObj, start, removeCount, addCount)` - This method will be
                 called just after the array is modified.

                 Both callbacks will be passed the observed object, starting index of the
                 change as well a a count of the items to be removed and added. You can use
                 these callbacks to optionally inspect the array during the change, clear
                 caches, or do any other bookkeeping necessary.

                 In addition to passing a target, you can also include an options hash
                 which you can use to override the method names that will be invoked on the
                 target.

                 @method addArrayObserver
                 @param {Object} target The observer object.
                 @param {Hash} opts Optional hash of configuration options including
                 `willChange` and `didChange` option.
                 @return {Alto.Array} receiver
                 */

                addArrayObserver: function(target, opts) {
                    return arrayObserversHelper(this, target, opts, addListener, false);
                },

                /**
                 Removes an array observer from the object if the observer is current
                 registered. Calling this method multiple times with the same object will
                 have no effect.

                 @method removeArrayObserver
                 @param {Object} target The object observing the array.
                 @param {Hash} opts Optional hash of configuration options including
                 `willChange` and `didChange` option.
                 @return {Alto.Array} receiver
                 */
                removeArrayObserver: function(target, opts) {
                    return arrayObserversHelper(this, target, opts, removeListener, true);
                },

                /**
                 Becomes true whenever the array currently has observers watching changes
                 on the array.

                 @property {Boolean} hasArrayObservers
                 */
                hasArrayObservers: computed(function() {
                    return hasListeners(this, '@array:change') || hasListeners(this, '@array:before');
                }),

                /**
                 If you are implementing an object that supports `Alto.Array`, call this
                 method just before the array content changes to notify any observers and
                 invalidate any related properties. Pass the starting index of the change
                 as well as a delta of the amounts to change.

                 @method arrayContentWillChange
                 @param {Number} startIdx The starting index in the array that will change.
                 @param {Number} removeAmt The number of items that will be removed. If you
                 pass `null` assumes 0
                 @param {Number} addAmt The number of items that will be added. If you
                 pass `null` assumes 0.
                 @return {Alto.Array} receiver
                 */
                arrayContentWillChange: function(startIdx, removeAmt, addAmt) {
                    var removing, lim;

                    // if no args are passed assume everything changes
                    if (startIdx === undefined) {
                        startIdx = 0;
                        removeAmt = addAmt = -1;
                    } else {
                        if (removeAmt === undefined) {
                            removeAmt = -1;
                        }

                        if (addAmt === undefined) {
                            addAmt = -1;
                        }
                    }

                    // Make sure the @each proxy is set up if anyone is observing @each
                    if (isWatching(this, '@each')) {
                        get(this, '@each');
                    }

                    sendEvent(this, '@array:before', [this, startIdx, removeAmt, addAmt]);

                    if (startIdx >= 0 && removeAmt >= 0 && get(this, 'hasEnumerableObservers')) {
                        removing = [];
                        lim = startIdx + removeAmt;

                        for (var idx = startIdx; idx < lim; idx++) {
                            removing.push(this.objectAt(idx));
                        }
                    } else {
                        removing = removeAmt;
                    }

                    this.enumerableContentWillChange(removing, addAmt);

                    return this;
                },

                /**
                 If you are implementing an object that supports `Alto.Array`, call this
                 method just after the array content changes to notify any observers and
                 invalidate any related properties. Pass the starting index of the change
                 as well as a delta of the amounts to change.

                 @method arrayContentDidChange
                 @param {Number} startIdx The starting index in the array that did change.
                 @param {Number} removeAmt The number of items that were removed. If you
                 pass `null` assumes 0
                 @param {Number} addAmt The number of items that were added. If you
                 pass `null` assumes 0.
                 @return {Alto.Array} receiver
                 */
                arrayContentDidChange: function(startIdx, removeAmt, addAmt) {
                    var adding, lim;

                    // if no args are passed assume everything changes
                    if (startIdx === undefined) {
                        startIdx = 0;
                        removeAmt = addAmt = -1;
                    } else {
                        if (removeAmt === undefined) {
                            removeAmt = -1;
                        }

                        if (addAmt === undefined) {
                            addAmt = -1;
                        }
                    }

                    if (startIdx >= 0 && addAmt >= 0 && get(this, 'hasEnumerableObservers')) {
                        adding = [];
                        lim = startIdx + addAmt;

                        for (var idx = startIdx; idx < lim; idx++) {
                            adding.push(this.objectAt(idx));
                        }
                    } else {
                        adding = addAmt;
                    }

                    this.enumerableContentDidChange(removeAmt, adding);
                    sendEvent(this, '@array:change', [this, startIdx, removeAmt, addAmt]);

                    var length = get(this, 'length');
                    var cachedFirst = cacheFor(this, 'firstObject');
                    var cachedLast = cacheFor(this, 'lastObject');

                    if (this.objectAt(0) !== cachedFirst) {
                        propertyWillChange(this, 'firstObject');
                        propertyDidChange(this, 'firstObject');
                    }

                    if (this.objectAt(length-1) !== cachedLast) {
                        propertyWillChange(this, 'lastObject');
                        propertyDidChange(this, 'lastObject');
                    }

                    return this;
                },

                // ..........................................................
                // ENUMERATED PROPERTIES
                //

                /**
                 Returns a special object that can be used to observe individual properties
                 on the array. Just get an equivalent property on this object and it will
                 return an enumerable that maps automatically to the named key on the
                 member objects.

                 If you merely want to watch for any items being added or removed to the array,
                 use the `[]` property instead of `@each`.

                 @property @each
                 */
                '@each': computed(function() {
                    if (!this.__each) {
                        // ES6TODO: GRRRRR
                        var EachProxy = requireModule('ember-runtime/system/each_proxy')['EachProxy'];

                        this.__each = new EachProxy(this);
                    }

                    return this.__each;
                })
            });
        });
    enifed("ember-runtime/mixins/comparable",
        ["ember-metal/mixin","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var Mixin = __dependency1__.Mixin;
            var required = __dependency1__.required;

            /**
             @module ember
             @submodule ember-runtime
             */

            /**
             Implements some standard methods for comparing objects. Add this mixin to
             any class you create that can compare its instances.

             You should implement the `compare()` method.

             @class Comparable
             @namespace Alto
             @since Alto 0.9
             */
            __exports__["default"] = Mixin.create({

                /**
                 Override to return the result of the comparison of the two parameters. The
                 compare method should return:

                 - `-1` if `a < b`
                 - `0` if `a == b`
                 - `1` if `a > b`

                 Default implementation raises an exception.

                 @method compare
                 @param a {Object} the first object to compare
                 @param b {Object} the second object to compare
                 @return {Integer} the result of the comparison
                 */
                compare: required(Function)
            });
        });
    enifed("ember-runtime/mixins/controller",
        ["ember-metal/mixin","ember-metal/computed","ember-runtime/mixins/action_handler","ember-runtime/mixins/controller_content_model_alias_deprecation","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            var Mixin = __dependency1__.Mixin;
            var computed = __dependency2__.computed;
            var ActionHandler = __dependency3__["default"];
            var ControllerContentModelAliasDeprecation = __dependency4__["default"];

            /**
             `Alto.ControllerMixin` provides a standard interface for all classes that
             compose Alto's controller layer: `Alto.Controller`,
             `Alto.ArrayController`, and `Alto.ObjectController`.

             @class ControllerMixin
             @namespace Alto
             @uses Alto.ActionHandler
             */
            __exports__["default"] = Mixin.create(ActionHandler, ControllerContentModelAliasDeprecation, {
                /* ducktype as a controller */
                isController: true,

                /**
                 The object to which actions from the view should be sent.

                 For example, when a Handlebars template uses the `{{action}}` helper,
                 it will attempt to send the action to the view's controller's `target`.

                 By default, the value of the target property is set to the router, and
                 is injected when a controller is instantiated. This injection is defined
                 in Alto.Application#buildContainer, and is applied as part of the
                 applications initialization process. It can also be set after a controller
                 has been instantiated, for instance when using the render helper in a
                 template, or when a controller is used as an `itemController`. In most
                 cases the `target` property will automatically be set to the logical
                 consumer of actions for the controller.

                 @property target
                 @default null
                 */
                target: null,

                container: null,

                parentController: null,

                store: null,

                /**
                 The controller's current model. When retrieving or modifying a controller's
                 model, this property should be used instead of the `content` property.

                 @property model
                 @public
                 */
                model: null,

                /**
                 @private
                 */
                content: computed.alias('model')

            });
        });
    enifed("ember-runtime/mixins/controller_content_model_alias_deprecation",
        ["ember-metal/core","ember-metal/mixin","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            // Alto.deprecate
            var Mixin = __dependency2__.Mixin;

            /**
             The ControllerContentModelAliasDeprecation mixin is used to provide a useful
             deprecation warning when specifying `content` directly on a `Alto.Controller`
             (without also specifying `model`).

             Alto versions prior to 1.7 used `model` as an alias of `content`, but due to
             much confusion this alias was reversed (so `content` is now an alias of `model).

             This change reduces many caveats with model/content, and also sets a
             simple ground rule: Never set a controllers content, rather always set
             it's model and ember will do the right thing.


             `Alto.ControllerContentModelAliasDeprecation` is used internally by Alto in
             `Alto.Controller`.

             @class ControllerContentModelAliasDeprecation
             @namespace Alto
             @private
             @since 1.7.0
             */
            __exports__["default"] = Mixin.create({
                /**
                 @private

                 Moves `content` to `model`  at extend time if a `model` is not also specified.

                 Note that this currently modifies the mixin themselves, which is technically
                 dubious but is practically of little consequence. This may change in the
                 future.

                 @method willMergeMixin
                 @since 1.4.0
                 */
                willMergeMixin: function(props) {
                    // Calling super is only OK here since we KNOW that
                    // there is another Mixin loaded first.
                    this._super.apply(this, arguments);

                    var modelSpecified = !!props.model;

                    if (props.content && !modelSpecified) {
                        props.model = props.content;
                        delete props['content'];

                        Alto.deprecate('Do not specify `content` on a Controller, use `model` instead.', false);
                    }
                }
            });
        });
    enifed("ember-runtime/mixins/copyable",
        ["ember-metal/property_get","ember-metal/mixin","ember-runtime/mixins/freezable","ember-runtime/system/string","ember-metal/error","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */


            var get = __dependency1__.get;
            var required = __dependency2__.required;
            var Freezable = __dependency3__.Freezable;
            var Mixin = __dependency2__.Mixin;
            var fmt = __dependency4__.fmt;
            var AltoError = __dependency5__["default"];


            /**
             Implements some standard methods for copying an object. Add this mixin to
             any object you create that can create a copy of itself. This mixin is
             added automatically to the built-in array.

             You should generally implement the `copy()` method to return a copy of the
             receiver.

             Note that `frozenCopy()` will only work if you also implement
             `Alto.Freezable`.

             @class Copyable
             @namespace Alto
             @since Alto 0.9
             */
            __exports__["default"] = Mixin.create({
                /**
                 Override to return a copy of the receiver. Default implementation raises
                 an exception.

                 @method copy
                 @param {Boolean} deep if `true`, a deep copy of the object should be made
                 @return {Object} copy of receiver
                 */
                copy: required(Function),

                /**
                 If the object implements `Alto.Freezable`, then this will return a new
                 copy if the object is not frozen and the receiver if the object is frozen.

                 Raises an exception if you try to call this method on a object that does
                 not support freezing.

                 You should use this method whenever you want a copy of a freezable object
                 since a freezable object can simply return itself without actually
                 consuming more memory.

                 @method frozenCopy
                 @return {Object} copy of receiver or receiver
                 */
                frozenCopy: function() {
                    if (Freezable && Freezable.detect(this)) {
                        return get(this, 'isFrozen') ? this : this.copy().freeze();
                    } else {
                        throw new AltoError(fmt("%@ does not support freezing", [this]));
                    }
                }
            });
        });
    enifed("ember-runtime/mixins/deferred",
        ["ember-metal/core","ember-metal/property_get","ember-metal/mixin","ember-metal/computed","ember-runtime/ext/rsvp","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            // Alto.FEATURES, Alto.Test
            var get = __dependency2__.get;
            var Mixin = __dependency3__.Mixin;
            var computed = __dependency4__.computed;
            var RSVP = __dependency5__["default"];

            /**
             @module ember
             @submodule ember-runtime
             */


            /**
             @class Deferred
             @namespace Alto
             */
            __exports__["default"] = Mixin.create({
                /**
                 Add handlers to be called when the Deferred object is resolved or rejected.

                 @method then
                 @param {Function} resolve a callback function to be called when done
                 @param {Function} reject  a callback function to be called when failed
                 */
                then: function(resolve, reject, label) {
                    var deferred, promise, entity;

                    entity = this;
                    deferred = get(this, '_deferred');
                    promise = deferred.promise;

                    function fulfillmentHandler(fulfillment) {
                        if (fulfillment === promise) {
                            return resolve(entity);
                        } else {
                            return resolve(fulfillment);
                        }
                    }

                    return promise.then(resolve && fulfillmentHandler, reject, label);
                },

                /**
                 Resolve a Deferred object and call any `doneCallbacks` with the given args.

                 @method resolve
                 */
                resolve: function(value) {
                    var deferred, promise;

                    deferred = get(this, '_deferred');
                    promise = deferred.promise;

                    if (value === this) {
                        deferred.resolve(promise);
                    } else {
                        deferred.resolve(value);
                    }
                },

                /**
                 Reject a Deferred object and call any `failCallbacks` with the given args.

                 @method reject
                 */
                reject: function(value) {
                    get(this, '_deferred').reject(value);
                },

                _deferred: computed(function() {
                    Alto.deprecate('Usage of Alto.DeferredMixin or Alto.Deferred is deprecated.', this._suppressDeferredDeprecation);

                    return RSVP.defer('Alto: DeferredMixin - ' + this);
                })
            });
        });
    enifed("ember-runtime/mixins/enumerable",
        ["ember-metal/core","ember-metal/property_get","ember-metal/property_set","ember-metal/utils","ember-metal/mixin","ember-metal/enumerable_utils","ember-metal/computed","ember-metal/property_events","ember-metal/events","ember-runtime/compare","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */

            // ..........................................................
            // HELPERS
            //

            var Alto = __dependency1__["default"];
            var get = __dependency2__.get;
            var set = __dependency3__.set;
            var apply = __dependency4__.apply;
            var Mixin = __dependency5__.Mixin;
            var required = __dependency5__.required;
            var aliasMethod = __dependency5__.aliasMethod;
            var indexOf = __dependency6__.indexOf;
            var computed = __dependency7__.computed;
            var propertyWillChange = __dependency8__.propertyWillChange;
            var propertyDidChange = __dependency8__.propertyDidChange;
            var addListener = __dependency9__.addListener;
            var removeListener = __dependency9__.removeListener;
            var sendEvent = __dependency9__.sendEvent;
            var hasListeners = __dependency9__.hasListeners;
            var compare = __dependency10__["default"];

            var a_slice = Array.prototype.slice;

            var contexts = [];

            function popCtx() {
                return contexts.length === 0 ? {} : contexts.pop();
            }

            function pushCtx(ctx) {
                contexts.push(ctx);
                return null;
            }

            function iter(key, value) {
                var valueProvided = arguments.length === 2;

                function i(item) {
                    var cur = get(item, key);
                    return valueProvided ? value === cur : !!cur;
                }

                return i;
            }

            /**
             This mixin defines the common interface implemented by enumerable objects
             in Alto. Most of these methods follow the standard Array iteration
             API defined up to JavaScript 1.8 (excluding language-specific features that
             cannot be emulated in older versions of JavaScript).

             This mixin is applied automatically to the Array class on page load, so you
             can use any of these methods on simple arrays. If Array already implements
             one of these methods, the mixin will not override them.

             ## Writing Your Own Enumerable

             To make your own custom class enumerable, you need two items:

             1. You must have a length property. This property should change whenever
             the number of items in your enumerable object changes. If you use this
             with an `Alto.Object` subclass, you should be sure to change the length
             property using `set().`

             2. You must implement `nextObject().` See documentation.

             Once you have these two methods implemented, apply the `Alto.Enumerable` mixin
             to your class and you will be able to enumerate the contents of your object
             like any other collection.

             ## Using Alto Enumeration with Other Libraries

             Many other libraries provide some kind of iterator or enumeration like
             facility. This is often where the most common API conflicts occur.
             Alto's API is designed to be as friendly as possible with other
             libraries by implementing only methods that mostly correspond to the
             JavaScript 1.8 API.

             @class Enumerable
             @namespace Alto
             @since Alto 0.9
             */
            __exports__["default"] = Mixin.create({

                /**
                 Implement this method to make your class enumerable.

                 This method will be call repeatedly during enumeration. The index value
                 will always begin with 0 and increment monotonically. You don't have to
                 rely on the index value to determine what object to return, but you should
                 always check the value and start from the beginning when you see the
                 requested index is 0.

                 The `previousObject` is the object that was returned from the last call
                 to `nextObject` for the current iteration. This is a useful way to
                 manage iteration if you are tracing a linked list, for example.

                 Finally the context parameter will always contain a hash you can use as
                 a "scratchpad" to maintain any other state you need in order to iterate
                 properly. The context object is reused and is not reset between
                 iterations so make sure you setup the context with a fresh state whenever
                 the index parameter is 0.

                 Generally iterators will continue to call `nextObject` until the index
                 reaches the your current length-1. If you run out of data before this
                 time for some reason, you should simply return undefined.

                 The default implementation of this method simply looks up the index.
                 This works great on any Array-like objects.

                 @method nextObject
                 @param {Number} index the current index of the iteration
                 @param {Object} previousObject the value returned by the last call to
                 `nextObject`.
                 @param {Object} context a context object you can use to maintain state.
                 @return {Object} the next object in the iteration or undefined
                 */
                nextObject: required(Function),

                /**
                 Helper method returns the first object from a collection. This is usually
                 used by bindings and other parts of the framework to extract a single
                 object if the enumerable contains only one item.

                 If you override this method, you should implement it so that it will
                 always return the same value each time it is called. If your enumerable
                 contains only one object, this method should always return that object.
                 If your enumerable is empty, this method should return `undefined`.

                 ```javascript
                 var arr = ['a', 'b', 'c'];
                 arr.get('firstObject');  // 'a'

                 var arr = [];
                 arr.get('firstObject');  // undefined
                 ```

                 @property firstObject
                 @return {Object} the object or undefined
                 */
                firstObject: computed('[]', function() {
                    if (get(this, 'length') === 0) {
                        return undefined;
                    }

                    // handle generic enumerables
                    var context = popCtx();
                    var ret = this.nextObject(0, null, context);

                    pushCtx(context);

                    return ret;
                }),

                /**
                 Helper method returns the last object from a collection. If your enumerable
                 contains only one object, this method should always return that object.
                 If your enumerable is empty, this method should return `undefined`.

                 ```javascript
                 var arr = ['a', 'b', 'c'];
                 arr.get('lastObject');  // 'c'

                 var arr = [];
                 arr.get('lastObject');  // undefined
                 ```

                 @property lastObject
                 @return {Object} the last object or undefined
                 */
                lastObject: computed('[]', function() {
                    var len = get(this, 'length');

                    if (len === 0) {
                        return undefined;
                    }

                    var context = popCtx();
                    var idx = 0;
                    var last = null;
                    var cur;

                    do {
                        last = cur;
                        cur = this.nextObject(idx++, last, context);
                    } while (cur !== undefined);

                    pushCtx(context);

                    return last;
                }),

                /**
                 Returns `true` if the passed object can be found in the receiver. The
                 default version will iterate through the enumerable until the object
                 is found. You may want to override this with a more efficient version.

                 ```javascript
                 var arr = ['a', 'b', 'c'];

                 arr.contains('a'); // true
                 arr.contains('z'); // false
                 ```

                 @method contains
                 @param {Object} obj The object to search for.
                 @return {Boolean} `true` if object is found in enumerable.
                 */
                contains: function(obj) {
                    var found = this.find(function(item) {
                        return item === obj;
                    });

                    return found !== undefined;
                },

                /**
                 Iterates through the enumerable, calling the passed function on each
                 item. This method corresponds to the `forEach()` method defined in
                 JavaScript 1.6.

                 The callback method you provide should have the following signature (all
                 parameters are optional):

                 ```javascript
                 function(item, index, enumerable);
                 ```

                 - `item` is the current item in the iteration.
                 - `index` is the current index in the iteration.
                 - `enumerable` is the enumerable object itself.

                 Note that in addition to a callback, you can also pass an optional target
                 object that will be set as `this` on the context. This is a good way
                 to give your iterator function access to the current object.

                 @method forEach
                 @param {Function} callback The callback to execute
                 @param {Object} [target] The target object to use
                 @return {Object} receiver
                 */
                forEach: function(callback, target) {
                    if (typeof callback !== 'function') {
                        throw new TypeError();
                    }

                    var context = popCtx();
                    var len = get(this, 'length');
                    var last = null;

                    if (target === undefined) {
                        target = null;
                    }

                    for(var idx = 0; idx < len; idx++) {
                        var next = this.nextObject(idx, last, context) ;
                        callback.call(target, next, idx, this);
                        last = next ;
                    }

                    last = null ;
                    context = pushCtx(context);

                    return this ;
                },

                /**
                 Alias for `mapBy`

                 @method getEach
                 @param {String} key name of the property
                 @return {Array} The mapped array.
                 */
                getEach: function(key) {
                    return this.mapBy(key);
                },

                /**
                 Sets the value on the named property for each member. This is more
                 efficient than using other methods defined on this helper. If the object
                 implements Alto.Observable, the value will be changed to `set(),` otherwise
                 it will be set directly. `null` objects are skipped.

                 @method setEach
                 @param {String} key The key to set
                 @param {Object} value The object to set
                 @return {Object} receiver
                 */
                setEach: function(key, value) {
                    return this.forEach(function(item) {
                        set(item, key, value);
                    });
                },

                /**
                 Maps all of the items in the enumeration to another value, returning
                 a new array. This method corresponds to `map()` defined in JavaScript 1.6.

                 The callback method you provide should have the following signature (all
                 parameters are optional):

                 ```javascript
                 function(item, index, enumerable);
                 ```

                 - `item` is the current item in the iteration.
                 - `index` is the current index in the iteration.
                 - `enumerable` is the enumerable object itself.

                 It should return the mapped value.

                 Note that in addition to a callback, you can also pass an optional target
                 object that will be set as `this` on the context. This is a good way
                 to give your iterator function access to the current object.

                 @method map
                 @param {Function} callback The callback to execute
                 @param {Object} [target] The target object to use
                 @return {Array} The mapped array.
                 */
                map: function(callback, target) {
                    var ret = Alto.A();

                    this.forEach(function(x, idx, i) {
                        ret[idx] = callback.call(target, x, idx,i);
                    });

                    return ret ;
                },

                /**
                 Similar to map, this specialized function returns the value of the named
                 property on all items in the enumeration.

                 @method mapBy
                 @param {String} key name of the property
                 @return {Array} The mapped array.
                 */
                mapBy: function(key) {
                    return this.map(function(next) {
                        return get(next, key);
                    });
                },

                /**
                 Similar to map, this specialized function returns the value of the named
                 property on all items in the enumeration.

                 @method mapProperty
                 @param {String} key name of the property
                 @return {Array} The mapped array.
                 @deprecated Use `mapBy` instead
                 */

                mapProperty: aliasMethod('mapBy'),

                /**
                 Returns an array with all of the items in the enumeration that the passed
                 function returns true for. This method corresponds to `filter()` defined in
                 JavaScript 1.6.

                 The callback method you provide should have the following signature (all
                 parameters are optional):

                 ```javascript
                 function(item, index, enumerable);
                 ```

                 - `item` is the current item in the iteration.
                 - `index` is the current index in the iteration.
                 - `enumerable` is the enumerable object itself.

                 It should return `true` to include the item in the results, `false`
                 otherwise.

                 Note that in addition to a callback, you can also pass an optional target
                 object that will be set as `this` on the context. This is a good way
                 to give your iterator function access to the current object.

                 @method filter
                 @param {Function} callback The callback to execute
                 @param {Object} [target] The target object to use
                 @return {Array} A filtered array.
                 */
                filter: function(callback, target) {
                    var ret = Alto.A();

                    this.forEach(function(x, idx, i) {
                        if (callback.call(target, x, idx, i)) {
                            ret.push(x);
                        }
                    });

                    return ret ;
                },

                /**
                 Returns an array with all of the items in the enumeration where the passed
                 function returns false for. This method is the inverse of filter().

                 The callback method you provide should have the following signature (all
                 parameters are optional):

                 ```javascript
                 function(item, index, enumerable);
                 ```

                 - *item* is the current item in the iteration.
                 - *index* is the current index in the iteration
                 - *enumerable* is the enumerable object itself.

                 It should return the a falsey value to include the item in the results.

                 Note that in addition to a callback, you can also pass an optional target
                 object that will be set as "this" on the context. This is a good way
                 to give your iterator function access to the current object.

                 @method reject
                 @param {Function} callback The callback to execute
                 @param {Object} [target] The target object to use
                 @return {Array} A rejected array.
                 */
                reject: function(callback, target) {
                    return this.filter(function() {
                        return !(apply(target, callback, arguments));
                    });
                },

                /**
                 Returns an array with just the items with the matched property. You
                 can pass an optional second argument with the target value. Otherwise
                 this will match any property that evaluates to `true`.

                 @method filterBy
                 @param {String} key the property to test
                 @param {*} [value] optional value to test against.
                 @return {Array} filtered array
                 */
                filterBy: function(key, value) {
                    return this.filter(apply(this, iter, arguments));
                },

                /**
                 Returns an array with just the items with the matched property. You
                 can pass an optional second argument with the target value. Otherwise
                 this will match any property that evaluates to `true`.

                 @method filterProperty
                 @param {String} key the property to test
                 @param {String} [value] optional value to test against.
                 @return {Array} filtered array
                 @deprecated Use `filterBy` instead
                 */
                filterProperty: aliasMethod('filterBy'),

                /**
                 Returns an array with the items that do not have truthy values for
                 key.  You can pass an optional second argument with the target value.  Otherwise
                 this will match any property that evaluates to false.

                 @method rejectBy
                 @param {String} key the property to test
                 @param {String} [value] optional value to test against.
                 @return {Array} rejected array
                 */
                rejectBy: function(key, value) {
                    var exactValue = function(item) {
                        return get(item, key) === value;
                    };

                    var hasValue = function(item) {
                        return !!get(item, key);
                    };

                    var use = (arguments.length === 2 ? exactValue : hasValue);

                    return this.reject(use);
                },

                /**
                 Returns an array with the items that do not have truthy values for
                 key.  You can pass an optional second argument with the target value.  Otherwise
                 this will match any property that evaluates to false.

                 @method rejectProperty
                 @param {String} key the property to test
                 @param {String} [value] optional value to test against.
                 @return {Array} rejected array
                 @deprecated Use `rejectBy` instead
                 */
                rejectProperty: aliasMethod('rejectBy'),

                /**
                 Returns the first item in the array for which the callback returns true.
                 This method works similar to the `filter()` method defined in JavaScript 1.6
                 except that it will stop working on the array once a match is found.

                 The callback method you provide should have the following signature (all
                 parameters are optional):

                 ```javascript
                 function(item, index, enumerable);
                 ```

                 - `item` is the current item in the iteration.
                 - `index` is the current index in the iteration.
                 - `enumerable` is the enumerable object itself.

                 It should return the `true` to include the item in the results, `false`
                 otherwise.

                 Note that in addition to a callback, you can also pass an optional target
                 object that will be set as `this` on the context. This is a good way
                 to give your iterator function access to the current object.

                 @method find
                 @param {Function} callback The callback to execute
                 @param {Object} [target] The target object to use
                 @return {Object} Found item or `undefined`.
                 */
                find: function(callback, target) {
                    var len = get(this, 'length');

                    if (target === undefined) {
                        target = null;
                    }

                    var context = popCtx();
                    var found = false;
                    var last = null;
                    var next, ret;

                    for(var idx = 0; idx < len && !found; idx++) {
                        next = this.nextObject(idx, last, context);

                        if (found = callback.call(target, next, idx, this)) {
                            ret = next;
                        }

                        last = next;
                    }

                    next = last = null;
                    context = pushCtx(context);

                    return ret;
                },

                /**
                 Returns the first item with a property matching the passed value. You
                 can pass an optional second argument with the target value. Otherwise
                 this will match any property that evaluates to `true`.

                 This method works much like the more generic `find()` method.

                 @method findBy
                 @param {String} key the property to test
                 @param {String} [value] optional value to test against.
                 @return {Object} found item or `undefined`
                 */
                findBy: function(key, value) {
                    return this.find(apply(this, iter, arguments));
                },

                /**
                 Returns the first item with a property matching the passed value. You
                 can pass an optional second argument with the target value. Otherwise
                 this will match any property that evaluates to `true`.

                 This method works much like the more generic `find()` method.

                 @method findProperty
                 @param {String} key the property to test
                 @param {String} [value] optional value to test against.
                 @return {Object} found item or `undefined`
                 @deprecated Use `findBy` instead
                 */
                findProperty: aliasMethod('findBy'),

                /**
                 Returns `true` if the passed function returns true for every item in the
                 enumeration. This corresponds with the `every()` method in JavaScript 1.6.

                 The callback method you provide should have the following signature (all
                 parameters are optional):

                 ```javascript
                 function(item, index, enumerable);
                 ```

                 - `item` is the current item in the iteration.
                 - `index` is the current index in the iteration.
                 - `enumerable` is the enumerable object itself.

                 It should return the `true` or `false`.

                 Note that in addition to a callback, you can also pass an optional target
                 object that will be set as `this` on the context. This is a good way
                 to give your iterator function access to the current object.

                 Example Usage:

                 ```javascript
                 if (people.every(isEngineer)) {
          Paychecks.addBigBonus();
        }
                 ```

                 @method every
                 @param {Function} callback The callback to execute
                 @param {Object} [target] The target object to use
                 @return {Boolean}
                 */
                every: function(callback, target) {
                    return !this.find(function(x, idx, i) {
                        return !callback.call(target, x, idx, i);
                    });
                },

                /**
                 @method everyBy
                 @param {String} key the property to test
                 @param {String} [value] optional value to test against.
                 @deprecated Use `isEvery` instead
                 @return {Boolean}
                 */
                everyBy: aliasMethod('isEvery'),

                /**
                 @method everyProperty
                 @param {String} key the property to test
                 @param {String} [value] optional value to test against.
                 @deprecated Use `isEvery` instead
                 @return {Boolean}
                 */
                everyProperty: aliasMethod('isEvery'),

                /**
                 Returns `true` if the passed property resolves to `true` for all items in
                 the enumerable. This method is often simpler/faster than using a callback.

                 @method isEvery
                 @param {String} key the property to test
                 @param {String} [value] optional value to test against.
                 @return {Boolean}
                 @since 1.3.0
                 */
                isEvery: function(key, value) {
                    return this.every(apply(this, iter, arguments));
                },

                /**
                 Returns `true` if the passed function returns true for any item in the
                 enumeration. This corresponds with the `some()` method in JavaScript 1.6.

                 The callback method you provide should have the following signature (all
                 parameters are optional):

                 ```javascript
                 function(item, index, enumerable);
                 ```

                 - `item` is the current item in the iteration.
                 - `index` is the current index in the iteration.
                 - `enumerable` is the enumerable object itself.

                 It should return the `true` to include the item in the results, `false`
                 otherwise.

                 Note that in addition to a callback, you can also pass an optional target
                 object that will be set as `this` on the context. This is a good way
                 to give your iterator function access to the current object.

                 Usage Example:

                 ```javascript
                 if (people.any(isManager)) {
          Paychecks.addBiggerBonus();
        }
                 ```

                 @method any
                 @param {Function} callback The callback to execute
                 @param {Object} [target] The target object to use
                 @return {Boolean} `true` if the passed function returns `true` for any item
                 */
                any: function(callback, target) {
                    var len = get(this, 'length');
                    var context = popCtx();
                    var found = false;
                    var last = null;
                    var next, idx;

                    if (target === undefined) {
                        target = null;
                    }

                    for (idx = 0; idx < len && !found; idx++) {
                        next  = this.nextObject(idx, last, context);
                        found = callback.call(target, next, idx, this);
                        last  = next;
                    }

                    next = last = null;
                    context = pushCtx(context);
                    return found;
                },

                /**
                 Returns `true` if the passed function returns true for any item in the
                 enumeration. This corresponds with the `some()` method in JavaScript 1.6.

                 The callback method you provide should have the following signature (all
                 parameters are optional):

                 ```javascript
                 function(item, index, enumerable);
                 ```

                 - `item` is the current item in the iteration.
                 - `index` is the current index in the iteration.
                 - `enumerable` is the enumerable object itself.

                 It should return the `true` to include the item in the results, `false`
                 otherwise.

                 Note that in addition to a callback, you can also pass an optional target
                 object that will be set as `this` on the context. This is a good way
                 to give your iterator function access to the current object.

                 Usage Example:

                 ```javascript
                 if (people.some(isManager)) {
          Paychecks.addBiggerBonus();
        }
                 ```

                 @method some
                 @param {Function} callback The callback to execute
                 @param {Object} [target] The target object to use
                 @return {Boolean} `true` if the passed function returns `true` for any item
                 @deprecated Use `any` instead
                 */
                some: aliasMethod('any'),

                /**
                 Returns `true` if the passed property resolves to `true` for any item in
                 the enumerable. This method is often simpler/faster than using a callback.

                 @method isAny
                 @param {String} key the property to test
                 @param {String} [value] optional value to test against.
                 @return {Boolean} `true` if the passed function returns `true` for any item
                 @since 1.3.0
                 */
                isAny: function(key, value) {
                    return this.any(apply(this, iter, arguments));
                },

                /**
                 @method anyBy
                 @param {String} key the property to test
                 @param {String} [value] optional value to test against.
                 @return {Boolean} `true` if the passed function returns `true` for any item
                 @deprecated Use `isAny` instead
                 */
                anyBy: aliasMethod('isAny'),

                /**
                 @method someProperty
                 @param {String} key the property to test
                 @param {String} [value] optional value to test against.
                 @return {Boolean} `true` if the passed function returns `true` for any item
                 @deprecated Use `isAny` instead
                 */
                someProperty: aliasMethod('isAny'),

                /**
                 This will combine the values of the enumerator into a single value. It
                 is a useful way to collect a summary value from an enumeration. This
                 corresponds to the `reduce()` method defined in JavaScript 1.8.

                 The callback method you provide should have the following signature (all
                 parameters are optional):

                 ```javascript
                 function(previousValue, item, index, enumerable);
                 ```

                 - `previousValue` is the value returned by the last call to the iterator.
                 - `item` is the current item in the iteration.
                 - `index` is the current index in the iteration.
                 - `enumerable` is the enumerable object itself.

                 Return the new cumulative value.

                 In addition to the callback you can also pass an `initialValue`. An error
                 will be raised if you do not pass an initial value and the enumerator is
                 empty.

                 Note that unlike the other methods, this method does not allow you to
                 pass a target object to set as this for the callback. It's part of the
                 spec. Sorry.

                 @method reduce
                 @param {Function} callback The callback to execute
                 @param {Object} initialValue Initial value for the reduce
                 @param {String} reducerProperty internal use only.
                 @return {Object} The reduced value.
                 */
                reduce: function(callback, initialValue, reducerProperty) {
                    if (typeof callback !== 'function') {
                        throw new TypeError();
                    }

                    var ret = initialValue;

                    this.forEach(function(item, i) {
                        ret = callback(ret, item, i, this, reducerProperty);
                    }, this);

                    return ret;
                },

                /**
                 Invokes the named method on every object in the receiver that
                 implements it. This method corresponds to the implementation in
                 Prototype 1.6.

                 @method invoke
                 @param {String} methodName the name of the method
                 @param {Object...} args optional arguments to pass as well.
                 @return {Array} return values from calling invoke.
                 */
                invoke: function(methodName) {
                    var ret = Alto.A();
                    var args;

                    if (arguments.length > 1) {
                        args = a_slice.call(arguments, 1);
                    }

                    this.forEach(function(x, idx) {
                        var method = x && x[methodName];

                        if ('function' === typeof method) {
                            ret[idx] = args ? apply(x, method, args) : x[methodName]();
                        }
                    }, this);

                    return ret;
                },

                /**
                 Simply converts the enumerable into a genuine array. The order is not
                 guaranteed. Corresponds to the method implemented by Prototype.

                 @method toArray
                 @return {Array} the enumerable as an array.
                 */
                toArray: function() {
                    var ret = Alto.A();

                    this.forEach(function(o, idx) {
                        ret[idx] = o;
                    });

                    return ret;
                },

                /**
                 Returns a copy of the array with all `null` and `undefined` elements removed.

                 ```javascript
                 var arr = ['a', null, 'c', undefined];
                 arr.compact();  // ['a', 'c']
                 ```

                 @method compact
                 @return {Array} the array without null and undefined elements.
                 */
                compact: function() {
                    return this.filter(function(value) {
                        return value != null;
                    });
                },

                /**
                 Returns a new enumerable that excludes the passed value. The default
                 implementation returns an array regardless of the receiver type unless
                 the receiver does not contain the value.

                 ```javascript
                 var arr = ['a', 'b', 'a', 'c'];
                 arr.without('a');  // ['b', 'c']
                 ```

                 @method without
                 @param {Object} value
                 @return {Alto.Enumerable}
                 */
                without: function(value) {
                    if (!this.contains(value)) {
                        return this; // nothing to do
                    }

                    var ret = Alto.A();

                    this.forEach(function(k) {
                        if (k !== value) {
                            ret[ret.length] = k;
                        }
                    });

                    return ret;
                },

                /**
                 Returns a new enumerable that contains only unique values. The default
                 implementation returns an array regardless of the receiver type.

                 ```javascript
                 var arr = ['a', 'a', 'b', 'b'];
                 arr.uniq();  // ['a', 'b']
                 ```

                 This only works on primitive data types, e.g. Strings, Numbers, etc.

                 @method uniq
                 @return {Alto.Enumerable}
                 */
                uniq: function() {
                    var ret = Alto.A();

                    this.forEach(function(k) {
                        if (indexOf(ret, k) < 0) {
                            ret.push(k);
                        }
                    });

                    return ret;
                },

                /**
                 This property will trigger anytime the enumerable's content changes.
                 You can observe this property to be notified of changes to the enumerables
                 content.

                 For plain enumerables, this property is read only. `Array` overrides
                 this method.

                 @property []
                 @type Array
                 @return this
                 */
                '[]': computed(function(key, value) {
                    return this;
                }),

                // ..........................................................
                // ENUMERABLE OBSERVERS
                //

                /**
                 Registers an enumerable observer. Must implement `Alto.EnumerableObserver`
                 mixin.

                 @method addEnumerableObserver
                 @param {Object} target
                 @param {Hash} [opts]
                 @return this
                 */
                addEnumerableObserver: function(target, opts) {
                    var willChange = (opts && opts.willChange) || 'enumerableWillChange';
                    var didChange  = (opts && opts.didChange) || 'enumerableDidChange';
                    var hasObservers = get(this, 'hasEnumerableObservers');

                    if (!hasObservers) {
                        propertyWillChange(this, 'hasEnumerableObservers');
                    }

                    addListener(this, '@enumerable:before', target, willChange);
                    addListener(this, '@enumerable:change', target, didChange);

                    if (!hasObservers) {
                        propertyDidChange(this, 'hasEnumerableObservers');
                    }

                    return this;
                },

                /**
                 Removes a registered enumerable observer.

                 @method removeEnumerableObserver
                 @param {Object} target
                 @param {Hash} [opts]
                 @return this
                 */
                removeEnumerableObserver: function(target, opts) {
                    var willChange = (opts && opts.willChange) || 'enumerableWillChange';
                    var didChange  = (opts && opts.didChange) || 'enumerableDidChange';
                    var hasObservers = get(this, 'hasEnumerableObservers');

                    if (hasObservers) {
                        propertyWillChange(this, 'hasEnumerableObservers');
                    }

                    removeListener(this, '@enumerable:before', target, willChange);
                    removeListener(this, '@enumerable:change', target, didChange);

                    if (hasObservers) {
                        propertyDidChange(this, 'hasEnumerableObservers');
                    }

                    return this;
                },

                /**
                 Becomes true whenever the array currently has observers watching changes
                 on the array.

                 @property hasEnumerableObservers
                 @type Boolean
                 */
                hasEnumerableObservers: computed(function() {
                    return hasListeners(this, '@enumerable:change') || hasListeners(this, '@enumerable:before');
                }),


                /**
                 Invoke this method just before the contents of your enumerable will
                 change. You can either omit the parameters completely or pass the objects
                 to be removed or added if available or just a count.

                 @method enumerableContentWillChange
                 @param {Alto.Enumerable|Number} removing An enumerable of the objects to
                 be removed or the number of items to be removed.
                 @param {Alto.Enumerable|Number} adding An enumerable of the objects to be
                 added or the number of items to be added.
                 @chainable
                 */
                enumerableContentWillChange: function(removing, adding) {
                    var removeCnt, addCnt, hasDelta;

                    if ('number' === typeof removing) {
                        removeCnt = removing;
                    } else if (removing) {
                        removeCnt = get(removing, 'length');
                    } else {
                        removeCnt = removing = -1;
                    }

                    if ('number' === typeof adding) {
                        addCnt = adding;
                    } else if (adding) {
                        addCnt = get(adding,'length');
                    } else {
                        addCnt = adding = -1;
                    }

                    hasDelta = addCnt < 0 || removeCnt < 0 || addCnt - removeCnt !== 0;

                    if (removing === -1) {
                        removing = null;
                    }

                    if (adding === -1) {
                        adding = null;
                    }

                    propertyWillChange(this, '[]');

                    if (hasDelta) {
                        propertyWillChange(this, 'length');
                    }

                    sendEvent(this, '@enumerable:before', [this, removing, adding]);

                    return this;
                },

                /**
                 Invoke this method when the contents of your enumerable has changed.
                 This will notify any observers watching for content changes. If you are
                 implementing an ordered enumerable (such as an array), also pass the
                 start and end values where the content changed so that it can be used to
                 notify range observers.

                 @method enumerableContentDidChange
                 @param {Alto.Enumerable|Number} removing An enumerable of the objects to
                 be removed or the number of items to be removed.
                 @param {Alto.Enumerable|Number} adding  An enumerable of the objects to
                 be added or the number of items to be added.
                 @chainable
                 */
                enumerableContentDidChange: function(removing, adding) {
                    var removeCnt, addCnt, hasDelta;

                    if ('number' === typeof removing) {
                        removeCnt = removing;
                    } else if (removing) {
                        removeCnt = get(removing, 'length');
                    } else {
                        removeCnt = removing = -1;
                    }

                    if ('number' === typeof adding) {
                        addCnt = adding;
                    } else if (adding) {
                        addCnt = get(adding, 'length');
                    } else {
                        addCnt = adding = -1;
                    }

                    hasDelta = addCnt < 0 || removeCnt < 0 || addCnt - removeCnt !== 0;

                    if (removing === -1) {
                        removing = null;
                    }

                    if (adding === -1) {
                        adding = null;
                    }

                    sendEvent(this, '@enumerable:change', [this, removing, adding]);

                    if (hasDelta) {
                        propertyDidChange(this, 'length');
                    }

                    propertyDidChange(this, '[]');

                    return this ;
                },

                /**
                 Converts the enumerable into an array and sorts by the keys
                 specified in the argument.

                 You may provide multiple arguments to sort by multiple properties.

                 @method sortBy
                 @param {String} property name(s) to sort on
                 @return {Array} The sorted array.
                 @since 1.2.0
                 */
                sortBy: function() {
                    var sortKeys = arguments;

                    return this.toArray().sort(function(a, b){
                        for(var i = 0; i < sortKeys.length; i++) {
                            var key = sortKeys[i];
                            var propA = get(a, key);
                            var propB = get(b, key);
                            // return 1 or -1 else continue to the next sortKey
                            var compareValue = compare(propA, propB);

                            if (compareValue) {
                                return compareValue;
                            }
                        }
                        return 0;
                    });
                }
            });
        });
    enifed("ember-runtime/mixins/evented",
        ["ember-metal/mixin","ember-metal/events","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var Mixin = __dependency1__.Mixin;
            var addListener = __dependency2__.addListener;
            var removeListener = __dependency2__.removeListener;
            var hasListeners = __dependency2__.hasListeners;
            var sendEvent = __dependency2__.sendEvent;

            /**
             @module ember
             @submodule ember-runtime
             */

            /**
             This mixin allows for Alto objects to subscribe to and emit events.

             ```javascript
             App.Person = Alto.Object.extend(Alto.Evented, {
        greet: function() {
          // ...
          this.trigger('greet');
        }
      });

             var person = App.Person.create();

             person.on('greet', function() {
        console.log('Our person has greeted');
      });

             person.greet();

             // outputs: 'Our person has greeted'
             ```

             You can also chain multiple event subscriptions:

             ```javascript
             person.on('greet', function() {
        console.log('Our person has greeted');
      }).one('greet', function() {
        console.log('Offer one-time special');
      }).off('event', this, forgetThis);
             ```

             @class Evented
             @namespace Alto
             */
            __exports__["default"] = Mixin.create({

                /**
                 Subscribes to a named event with given function.

                 ```javascript
                 person.on('didLoad', function() {
         // fired once the person has loaded
       });
                 ```

                 An optional target can be passed in as the 2nd argument that will
                 be set as the "this" for the callback. This is a good way to give your
                 function access to the object triggering the event. When the target
                 parameter is used the callback becomes the third argument.

                 @method on
                 @param {String} name The name of the event
                 @param {Object} [target] The "this" binding for the callback
                 @param {Function} method The callback to execute
                 @return this
                 */
                on: function(name, target, method) {
                    addListener(this, name, target, method);
                    return this;
                },

                /**
                 Subscribes a function to a named event and then cancels the subscription
                 after the first time the event is triggered. It is good to use ``one`` when
                 you only care about the first time an event has taken place.

                 This function takes an optional 2nd argument that will become the "this"
                 value for the callback. If this argument is passed then the 3rd argument
                 becomes the function.

                 @method one
                 @param {String} name The name of the event
                 @param {Object} [target] The "this" binding for the callback
                 @param {Function} method The callback to execute
                 @return this
                 */
                one: function(name, target, method) {
                    if (!method) {
                        method = target;
                        target = null;
                    }

                    addListener(this, name, target, method, true);
                    return this;
                },

                /**
                 Triggers a named event for the object. Any additional arguments
                 will be passed as parameters to the functions that are subscribed to the
                 event.

                 ```javascript
                 person.on('didEat', function(food) {
          console.log('person ate some ' + food);
        });

                 person.trigger('didEat', 'broccoli');

                 // outputs: person ate some broccoli
                 ```
                 @method trigger
                 @param {String} name The name of the event
                 @param {Object...} args Optional arguments to pass on
                 */
                trigger: function(name) {
                    var length = arguments.length;
                    var args = new Array(length - 1);

                    for (var i = 1; i < length; i++) {
                        args[i - 1] = arguments[i];
                    }

                    sendEvent(this, name, args);
                },

                /**
                 Cancels subscription for given name, target, and method.

                 @method off
                 @param {String} name The name of the event
                 @param {Object} target The target of the subscription
                 @param {Function} method The function of the subscription
                 @return this
                 */
                off: function(name, target, method) {
                    removeListener(this, name, target, method);
                    return this;
                },

                /**
                 Checks to see if object has any subscriptions for named event.

                 @method has
                 @param {String} name The name of the event
                 @return {Boolean} does the object have a subscription for event
                 */
                has: function(name) {
                    return hasListeners(this, name);
                }
            });
        });
    enifed("ember-runtime/mixins/freezable",
        ["ember-metal/mixin","ember-metal/property_get","ember-metal/property_set","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */

            var Mixin = __dependency1__.Mixin;
            var get = __dependency2__.get;
            var set = __dependency3__.set;

            /**
             The `Alto.Freezable` mixin implements some basic methods for marking an
             object as frozen. Once an object is frozen it should be read only. No changes
             may be made the internal state of the object.

             ## Enforcement

             To fully support freezing in your subclass, you must include this mixin and
             override any method that might alter any property on the object to instead
             raise an exception. You can check the state of an object by checking the
             `isFrozen` property.

             Although future versions of JavaScript may support language-level freezing
             object objects, that is not the case today. Even if an object is freezable,
             it is still technically possible to modify the object, even though it could
             break other parts of your application that do not expect a frozen object to
             change. It is, therefore, very important that you always respect the
             `isFrozen` property on all freezable objects.

             ## Example Usage

             The example below shows a simple object that implement the `Alto.Freezable`
             protocol.

             ```javascript
             Contact = Alto.Object.extend(Alto.Freezable, {
        firstName: null,
        lastName: null,

        // swaps the names
        swapNames: function() {
          if (this.get('isFrozen')) throw Alto.FROZEN_ERROR;
          var tmp = this.get('firstName');
          this.set('firstName', this.get('lastName'));
          this.set('lastName', tmp);
          return this;
        }

      });

             c = Contact.create({ firstName: "John", lastName: "Doe" });
             c.swapNames();  // returns c
             c.freeze();
             c.swapNames();  // EXCEPTION
             ```

             ## Copying

             Usually the `Alto.Freezable` protocol is implemented in cooperation with the
             `Alto.Copyable` protocol, which defines a `frozenCopy()` method that will
             return a frozen object, if the object implements this method as well.

             @class Freezable
             @namespace Alto
             @since Alto 0.9
             */
            var Freezable = Mixin.create({

                /**
                 Set to `true` when the object is frozen. Use this property to detect
                 whether your object is frozen or not.

                 @property isFrozen
                 @type Boolean
                 */
                isFrozen: false,

                /**
                 Freezes the object. Once this method has been called the object should
                 no longer allow any properties to be edited.

                 @method freeze
                 @return {Object} receiver
                 */
                freeze: function() {
                    if (get(this, 'isFrozen')) return this;
                    set(this, 'isFrozen', true);
                    return this;
                }

            });
            __exports__.Freezable = Freezable;
            var FROZEN_ERROR = "Frozen object cannot be modified.";
            __exports__.FROZEN_ERROR = FROZEN_ERROR;
        });
    enifed("ember-runtime/mixins/mutable_array",
        ["ember-metal/property_get","ember-metal/utils","ember-metal/error","ember-metal/mixin","ember-runtime/mixins/array","ember-runtime/mixins/mutable_enumerable","ember-runtime/mixins/enumerable","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */


            // require('ember-runtime/mixins/array');
            // require('ember-runtime/mixins/mutable_enumerable');

            // ..........................................................
            // CONSTANTS
            //

            var OUT_OF_RANGE_EXCEPTION = "Index out of range";
            var EMPTY = [];

            // ..........................................................
            // HELPERS
            //

            var get = __dependency1__.get;
            var isArray = __dependency2__.isArray;
            var AltoError = __dependency3__["default"];
            var Mixin = __dependency4__.Mixin;
            var required = __dependency4__.required;
            var AltoArray = __dependency5__["default"];
            var MutableEnumerable = __dependency6__["default"];
            var Enumerable = __dependency7__["default"];
            /**
             This mixin defines the API for modifying array-like objects. These methods
             can be applied only to a collection that keeps its items in an ordered set.
             It builds upon the Array mixin and adds methods to modify the array.
             Concrete implementations of this class include ArrayProxy and ArrayController.

             It is important to use the methods in this class to modify arrays so that
             changes are observable. This allows the binding system in Alto to function
             correctly.


             Note that an Array can change even if it does not implement this mixin.
             For example, one might implement a SparseArray that cannot be directly
             modified, but if its underlying enumerable changes, it will change also.

             @class MutableArray
             @namespace Alto
             @uses Alto.Array
             @uses Alto.MutableEnumerable
             */
            __exports__["default"] = Mixin.create(AltoArray, MutableEnumerable, {

                /**
                 __Required.__ You must implement this method to apply this mixin.

                 This is one of the primitives you must implement to support `Alto.Array`.
                 You should replace amt objects started at idx with the objects in the
                 passed array. You should also call `this.enumerableContentDidChange()`

                 @method replace
                 @param {Number} idx Starting index in the array to replace. If
                 idx >= length, then append to the end of the array.
                 @param {Number} amt Number of elements that should be removed from
                 the array, starting at *idx*.
                 @param {Array} objects An array of zero or more objects that should be
                 inserted into the array at *idx*
                 */
                replace: required(),

                /**
                 Remove all elements from the array. This is useful if you
                 want to reuse an existing array without having to recreate it.

                 ```javascript
                 var colors = ["red", "green", "blue"];
                 color.length();   //  3
                 colors.clear();   //  []
                 colors.length();  //  0
                 ```

                 @method clear
                 @return {Alto.Array} An empty Array.
                 */
                clear: function () {
                    var len = get(this, 'length');
                    if (len === 0) return this;
                    this.replace(0, len, EMPTY);
                    return this;
                },

                /**
                 This will use the primitive `replace()` method to insert an object at the
                 specified index.

                 ```javascript
                 var colors = ["red", "green", "blue"];
                 colors.insertAt(2, "yellow");  // ["red", "green", "yellow", "blue"]
                 colors.insertAt(5, "orange");  // Error: Index out of range
                 ```

                 @method insertAt
                 @param {Number} idx index of insert the object at.
                 @param {Object} object object to insert
                 @return {Alto.Array} receiver
                 */
                insertAt: function(idx, object) {
                    if (idx > get(this, 'length')) throw new AltoError(OUT_OF_RANGE_EXCEPTION);
                    this.replace(idx, 0, [object]);
                    return this;
                },

                /**
                 Remove an object at the specified index using the `replace()` primitive
                 method. You can pass either a single index, or a start and a length.

                 If you pass a start and length that is beyond the
                 length this method will throw an `OUT_OF_RANGE_EXCEPTION`.

                 ```javascript
                 var colors = ["red", "green", "blue", "yellow", "orange"];
                 colors.removeAt(0);     // ["green", "blue", "yellow", "orange"]
                 colors.removeAt(2, 2);  // ["green", "blue"]
                 colors.removeAt(4, 2);  // Error: Index out of range
                 ```

                 @method removeAt
                 @param {Number} start index, start of range
                 @param {Number} len length of passing range
                 @return {Alto.Array} receiver
                 */
                removeAt: function(start, len) {
                    if ('number' === typeof start) {

                        if ((start < 0) || (start >= get(this, 'length'))) {
                            throw new AltoError(OUT_OF_RANGE_EXCEPTION);
                        }

                        // fast case
                        if (len === undefined) len = 1;
                        this.replace(start, len, EMPTY);
                    }

                    return this;
                },

                /**
                 Push the object onto the end of the array. Works just like `push()` but it
                 is KVO-compliant.

                 ```javascript
                 var colors = ["red", "green"];
                 colors.pushObject("black");     // ["red", "green", "black"]
                 colors.pushObject(["yellow"]);  // ["red", "green", ["yellow"]]
                 ```

                 @method pushObject
                 @param {*} obj object to push
                 @return object same object passed as a param
                 */
                pushObject: function(obj) {
                    this.insertAt(get(this, 'length'), obj);
                    return obj;
                },

                /**
                 Add the objects in the passed numerable to the end of the array. Defers
                 notifying observers of the change until all objects are added.

                 ```javascript
                 var colors = ["red"];
                 colors.pushObjects(["yellow", "orange"]);  // ["red", "yellow", "orange"]
                 ```

                 @method pushObjects
                 @param {Alto.Enumerable} objects the objects to add
                 @return {Alto.Array} receiver
                 */
                pushObjects: function(objects) {
                    if (!(Enumerable.detect(objects) || isArray(objects))) {
                        throw new TypeError("Must pass Alto.Enumerable to Alto.MutableArray#pushObjects");
                    }
                    this.replace(get(this, 'length'), 0, objects);
                    return this;
                },

                /**
                 Pop object from array or nil if none are left. Works just like `pop()` but
                 it is KVO-compliant.

                 ```javascript
                 var colors = ["red", "green", "blue"];
                 colors.popObject();   // "blue"
                 console.log(colors);  // ["red", "green"]
                 ```

                 @method popObject
                 @return object
                 */
                popObject: function() {
                    var len = get(this, 'length');
                    if (len === 0) return null;

                    var ret = this.objectAt(len-1);
                    this.removeAt(len-1, 1);
                    return ret;
                },

                /**
                 Shift an object from start of array or nil if none are left. Works just
                 like `shift()` but it is KVO-compliant.

                 ```javascript
                 var colors = ["red", "green", "blue"];
                 colors.shiftObject();  // "red"
                 console.log(colors);   // ["green", "blue"]
                 ```

                 @method shiftObject
                 @return object
                 */
                shiftObject: function() {
                    if (get(this, 'length') === 0) return null;
                    var ret = this.objectAt(0);
                    this.removeAt(0);
                    return ret;
                },

                /**
                 Unshift an object to start of array. Works just like `unshift()` but it is
                 KVO-compliant.

                 ```javascript
                 var colors = ["red"];
                 colors.unshiftObject("yellow");    // ["yellow", "red"]
                 colors.unshiftObject(["black"]);   // [["black"], "yellow", "red"]
                 ```

                 @method unshiftObject
                 @param {*} obj object to unshift
                 @return object same object passed as a param
                 */
                unshiftObject: function(obj) {
                    this.insertAt(0, obj);
                    return obj;
                },

                /**
                 Adds the named objects to the beginning of the array. Defers notifying
                 observers until all objects have been added.

                 ```javascript
                 var colors = ["red"];
                 colors.unshiftObjects(["black", "white"]);   // ["black", "white", "red"]
                 colors.unshiftObjects("yellow"); // Type Error: 'undefined' is not a function
                 ```

                 @method unshiftObjects
                 @param {Alto.Enumerable} objects the objects to add
                 @return {Alto.Array} receiver
                 */
                unshiftObjects: function(objects) {
                    this.replace(0, 0, objects);
                    return this;
                },

                /**
                 Reverse objects in the array. Works just like `reverse()` but it is
                 KVO-compliant.

                 @method reverseObjects
                 @return {Alto.Array} receiver
                 */
                reverseObjects: function() {
                    var len = get(this, 'length');
                    if (len === 0) return this;
                    var objects = this.toArray().reverse();
                    this.replace(0, len, objects);
                    return this;
                },

                /**
                 Replace all the receiver's content with content of the argument.
                 If argument is an empty array receiver will be cleared.

                 ```javascript
                 var colors = ["red", "green", "blue"];
                 colors.setObjects(["black", "white"]);  // ["black", "white"]
                 colors.setObjects([]);                  // []
                 ```

                 @method setObjects
                 @param {Alto.Array} objects array whose content will be used for replacing
                 the content of the receiver
                 @return {Alto.Array} receiver with the new content
                 */
                setObjects: function(objects) {
                    if (objects.length === 0) return this.clear();

                    var len = get(this, 'length');
                    this.replace(0, len, objects);
                    return this;
                },

                // ..........................................................
                // IMPLEMENT Alto.MutableEnumerable
                //

                /**
                 Remove all occurrences of an object in the array.

                 ```javascript
                 var cities = ["Chicago", "Berlin", "Lima", "Chicago"];
                 cities.removeObject("Chicago");  // ["Berlin", "Lima"]
                 cities.removeObject("Lima");     // ["Berlin"]
                 cities.removeObject("Tokyo")     // ["Berlin"]
                 ```

                 @method removeObject
                 @param {*} obj object to remove
                 @return {Alto.Array} receiver
                 */
                removeObject: function(obj) {
                    var loc = get(this, 'length') || 0;
                    while(--loc >= 0) {
                        var curObject = this.objectAt(loc);
                        if (curObject === obj) this.removeAt(loc);
                    }
                    return this;
                },

                /**
                 Push the object onto the end of the array if it is not already
                 present in the array.

                 ```javascript
                 var cities = ["Chicago", "Berlin"];
                 cities.addObject("Lima");    // ["Chicago", "Berlin", "Lima"]
                 cities.addObject("Berlin");  // ["Chicago", "Berlin", "Lima"]
                 ```

                 @method addObject
                 @param {*} obj object to add, if not already present
                 @return {Alto.Array} receiver
                 */
                addObject: function(obj) {
                    if (!this.contains(obj)) this.pushObject(obj);
                    return this;
                }

            });
        });
    enifed("ember-runtime/mixins/mutable_enumerable",
        ["ember-metal/enumerable_utils","ember-runtime/mixins/enumerable","ember-metal/mixin","ember-metal/property_events","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            var forEach = __dependency1__.forEach;
            var Enumerable = __dependency2__["default"];
            var Mixin = __dependency3__.Mixin;
            var required = __dependency3__.required;
            var beginPropertyChanges = __dependency4__.beginPropertyChanges;
            var endPropertyChanges = __dependency4__.endPropertyChanges;

            /**
             @module ember
             @submodule ember-runtime
             */

            /**
             This mixin defines the API for modifying generic enumerables. These methods
             can be applied to an object regardless of whether it is ordered or
             unordered.

             Note that an Enumerable can change even if it does not implement this mixin.
             For example, a MappedEnumerable cannot be directly modified but if its
             underlying enumerable changes, it will change also.

             ## Adding Objects

             To add an object to an enumerable, use the `addObject()` method. This
             method will only add the object to the enumerable if the object is not
             already present and is of a type supported by the enumerable.

             ```javascript
             set.addObject(contact);
             ```

             ## Removing Objects

             To remove an object from an enumerable, use the `removeObject()` method. This
             will only remove the object if it is present in the enumerable, otherwise
             this method has no effect.

             ```javascript
             set.removeObject(contact);
             ```

             ## Implementing In Your Own Code

             If you are implementing an object and want to support this API, just include
             this mixin in your class and implement the required methods. In your unit
             tests, be sure to apply the Alto.MutableEnumerableTests to your object.

             @class MutableEnumerable
             @namespace Alto
             @uses Alto.Enumerable
             */
            __exports__["default"] = Mixin.create(Enumerable, {

                /**
                 __Required.__ You must implement this method to apply this mixin.

                 Attempts to add the passed object to the receiver if the object is not
                 already present in the collection. If the object is present, this method
                 has no effect.

                 If the passed object is of a type not supported by the receiver,
                 then this method should raise an exception.

                 @method addObject
                 @param {Object} object The object to add to the enumerable.
                 @return {Object} the passed object
                 */
                addObject: required(Function),

                /**
                 Adds each object in the passed enumerable to the receiver.

                 @method addObjects
                 @param {Alto.Enumerable} objects the objects to add.
                 @return {Object} receiver
                 */
                addObjects: function(objects) {
                    beginPropertyChanges(this);
                    forEach(objects, function(obj) { this.addObject(obj); }, this);
                    endPropertyChanges(this);
                    return this;
                },

                /**
                 __Required.__ You must implement this method to apply this mixin.

                 Attempts to remove the passed object from the receiver collection if the
                 object is present in the collection. If the object is not present,
                 this method has no effect.

                 If the passed object is of a type not supported by the receiver,
                 then this method should raise an exception.

                 @method removeObject
                 @param {Object} object The object to remove from the enumerable.
                 @return {Object} the passed object
                 */
                removeObject: required(Function),


                /**
                 Removes each object in the passed enumerable from the receiver.

                 @method removeObjects
                 @param {Alto.Enumerable} objects the objects to remove
                 @return {Object} receiver
                 */
                removeObjects: function(objects) {
                    beginPropertyChanges(this);
                    for (var i = objects.length - 1; i >= 0; i--) {
                        this.removeObject(objects[i]);
                    }
                    endPropertyChanges(this);
                    return this;
                }
            });
        });
    enifed("ember-runtime/mixins/observable",
        ["ember-metal/core","ember-metal/property_get","ember-metal/property_set","ember-metal/utils","ember-metal/get_properties","ember-metal/set_properties","ember-metal/mixin","ember-metal/events","ember-metal/property_events","ember-metal/observer","ember-metal/computed","ember-metal/is_none","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __dependency11__, __dependency12__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */
            var Alto = __dependency1__["default"];
            // Alto.assert

            var get = __dependency2__.get;
            var getWithDefault = __dependency2__.getWithDefault;
            var set = __dependency3__.set;
            var apply = __dependency4__.apply;
            var getProperties = __dependency5__["default"];
            var setProperties = __dependency6__["default"];
            var Mixin = __dependency7__.Mixin;
            var hasListeners = __dependency8__.hasListeners;
            var beginPropertyChanges = __dependency9__.beginPropertyChanges;
            var propertyWillChange = __dependency9__.propertyWillChange;
            var propertyDidChange = __dependency9__.propertyDidChange;
            var endPropertyChanges = __dependency9__.endPropertyChanges;
            var addObserver = __dependency10__.addObserver;
            var addBeforeObserver = __dependency10__.addBeforeObserver;
            var removeObserver = __dependency10__.removeObserver;
            var observersFor = __dependency10__.observersFor;
            var cacheFor = __dependency11__.cacheFor;
            var isNone = __dependency12__["default"];


            var slice = Array.prototype.slice;
            /**
             ## Overview

             This mixin provides properties and property observing functionality, core
             features of the Alto object model.

             Properties and observers allow one object to observe changes to a
             property on another object. This is one of the fundamental ways that
             models, controllers and views communicate with each other in an Alto
             application.

             Any object that has this mixin applied can be used in observer
             operations. That includes `Alto.Object` and most objects you will
             interact with as you write your Alto application.

             Note that you will not generally apply this mixin to classes yourself,
             but you will use the features provided by this module frequently, so it
             is important to understand how to use it.

             ## Using `get()` and `set()`

             Because of Alto's support for bindings and observers, you will always
             access properties using the get method, and set properties using the
             set method. This allows the observing objects to be notified and
             computed properties to be handled properly.

             More documentation about `get` and `set` are below.

             ## Observing Property Changes

             You typically observe property changes simply by adding the `observes`
             call to the end of your method declarations in classes that you write.
             For example:

             ```javascript
             Alto.Object.extend({
        valueObserver: function() {
          // Executes whenever the "value" property changes
        }.observes('value')
      });
             ```

             Although this is the most common way to add an observer, this capability
             is actually built into the `Alto.Object` class on top of two methods
             defined in this mixin: `addObserver` and `removeObserver`. You can use
             these two methods to add and remove observers yourself if you need to
             do so at runtime.

             To add an observer for a property, call:

             ```javascript
             object.addObserver('propertyKey', targetObject, targetAction)
             ```

             This will call the `targetAction` method on the `targetObject` whenever
             the value of the `propertyKey` changes.

             Note that if `propertyKey` is a computed property, the observer will be
             called when any of the property dependencies are changed, even if the
             resulting value of the computed property is unchanged. This is necessary
             because computed properties are not computed until `get` is called.

             @class Observable
             @namespace Alto
             */
            __exports__["default"] = Mixin.create({

                /**
                 Retrieves the value of a property from the object.

                 This method is usually similar to using `object[keyName]` or `object.keyName`,
                 however it supports both computed properties and the unknownProperty
                 handler.

                 Because `get` unifies the syntax for accessing all these kinds
                 of properties, it can make many refactorings easier, such as replacing a
                 simple property with a computed property, or vice versa.

                 ### Computed Properties

                 Computed properties are methods defined with the `property` modifier
                 declared at the end, such as:

                 ```javascript
                 fullName: function() {
          return this.get('firstName') + ' ' + this.get('lastName');
        }.property('firstName', 'lastName')
                 ```

                 When you call `get` on a computed property, the function will be
                 called and the return value will be returned instead of the function
                 itself.

                 ### Unknown Properties

                 Likewise, if you try to call `get` on a property whose value is
                 `undefined`, the `unknownProperty()` method will be called on the object.
                 If this method returns any value other than `undefined`, it will be returned
                 instead. This allows you to implement "virtual" properties that are
                 not defined upfront.

                 @method get
                 @param {String} keyName The property to retrieve
                 @return {Object} The property value or undefined.
                 */
                get: function(keyName) {
                    return get(this, keyName);
                },

                /**
                 To get the values of multiple properties at once, call `getProperties`
                 with a list of strings or an array:

                 ```javascript
                 record.getProperties('firstName', 'lastName', 'zipCode');
                 // { firstName: 'John', lastName: 'Doe', zipCode: '10011' }
                 ```

                 is equivalent to:

                 ```javascript
                 record.getProperties(['firstName', 'lastName', 'zipCode']);
                 // { firstName: 'John', lastName: 'Doe', zipCode: '10011' }
                 ```

                 @method getProperties
                 @param {String...|Array} list of keys to get
                 @return {Hash}
                 */
                getProperties: function() {
                    return apply(null, getProperties, [this].concat(slice.call(arguments)));
                },

                /**
                 Sets the provided key or path to the value.

                 This method is generally very similar to calling `object[key] = value` or
                 `object.key = value`, except that it provides support for computed
                 properties, the `setUnknownProperty()` method and property observers.

                 ### Computed Properties

                 If you try to set a value on a key that has a computed property handler
                 defined (see the `get()` method for an example), then `set()` will call
                 that method, passing both the value and key instead of simply changing
                 the value itself. This is useful for those times when you need to
                 implement a property that is composed of one or more member
                 properties.

                 ### Unknown Properties

                 If you try to set a value on a key that is undefined in the target
                 object, then the `setUnknownProperty()` handler will be called instead. This
                 gives you an opportunity to implement complex "virtual" properties that
                 are not predefined on the object. If `setUnknownProperty()` returns
                 undefined, then `set()` will simply set the value on the object.

                 ### Property Observers

                 In addition to changing the property, `set()` will also register a property
                 change with the object. Unless you have placed this call inside of a
                 `beginPropertyChanges()` and `endPropertyChanges(),` any "local" observers
                 (i.e. observer methods declared on the same object), will be called
                 immediately. Any "remote" observers (i.e. observer methods declared on
                 another object) will be placed in a queue and called at a later time in a
                 coalesced manner.

                 ### Chaining

                 In addition to property changes, `set()` returns the value of the object
                 itself so you can do chaining like this:

                 ```javascript
                 record.set('firstName', 'Charles').set('lastName', 'Jolley');
                 ```

                 @method set
                 @param {String} keyName The property to set
                 @param {Object} value The value to set or `null`.
                 @return {Alto.Observable}
                 */
                set: function(keyName, value) {
                    set(this, keyName, value);
                    return this;
                },


                /**
                 Sets a list of properties at once. These properties are set inside
                 a single `beginPropertyChanges` and `endPropertyChanges` batch, so
                 observers will be buffered.

                 ```javascript
                 record.setProperties({ firstName: 'Charles', lastName: 'Jolley' });
                 ```

                 @method setProperties
                 @param {Hash} hash the hash of keys and values to set
                 @return {Alto.Observable}
                 */
                setProperties: function(hash) {
                    return setProperties(this, hash);
                },

                /**
                 Begins a grouping of property changes.

                 You can use this method to group property changes so that notifications
                 will not be sent until the changes are finished. If you plan to make a
                 large number of changes to an object at one time, you should call this
                 method at the beginning of the changes to begin deferring change
                 notifications. When you are done making changes, call
                 `endPropertyChanges()` to deliver the deferred change notifications and end
                 deferring.

                 @method beginPropertyChanges
                 @return {Alto.Observable}
                 */
                beginPropertyChanges: function() {
                    beginPropertyChanges();
                    return this;
                },

                /**
                 Ends a grouping of property changes.

                 You can use this method to group property changes so that notifications
                 will not be sent until the changes are finished. If you plan to make a
                 large number of changes to an object at one time, you should call
                 `beginPropertyChanges()` at the beginning of the changes to defer change
                 notifications. When you are done making changes, call this method to
                 deliver the deferred change notifications and end deferring.

                 @method endPropertyChanges
                 @return {Alto.Observable}
                 */
                endPropertyChanges: function() {
                    endPropertyChanges();
                    return this;
                },

                /**
                 Notify the observer system that a property is about to change.

                 Sometimes you need to change a value directly or indirectly without
                 actually calling `get()` or `set()` on it. In this case, you can use this
                 method and `propertyDidChange()` instead. Calling these two methods
                 together will notify all observers that the property has potentially
                 changed value.

                 Note that you must always call `propertyWillChange` and `propertyDidChange`
                 as a pair. If you do not, it may get the property change groups out of
                 order and cause notifications to be delivered more often than you would
                 like.

                 @method propertyWillChange
                 @param {String} keyName The property key that is about to change.
                 @return {Alto.Observable}
                 */
                propertyWillChange: function(keyName) {
                    propertyWillChange(this, keyName);
                    return this;
                },

                /**
                 Notify the observer system that a property has just changed.

                 Sometimes you need to change a value directly or indirectly without
                 actually calling `get()` or `set()` on it. In this case, you can use this
                 method and `propertyWillChange()` instead. Calling these two methods
                 together will notify all observers that the property has potentially
                 changed value.

                 Note that you must always call `propertyWillChange` and `propertyDidChange`
                 as a pair. If you do not, it may get the property change groups out of
                 order and cause notifications to be delivered more often than you would
                 like.

                 @method propertyDidChange
                 @param {String} keyName The property key that has just changed.
                 @return {Alto.Observable}
                 */
                propertyDidChange: function(keyName) {
                    propertyDidChange(this, keyName);
                    return this;
                },

                /**
                 Convenience method to call `propertyWillChange` and `propertyDidChange` in
                 succession.

                 @method notifyPropertyChange
                 @param {String} keyName The property key to be notified about.
                 @return {Alto.Observable}
                 */
                notifyPropertyChange: function(keyName) {
                    this.propertyWillChange(keyName);
                    this.propertyDidChange(keyName);
                    return this;
                },

                addBeforeObserver: function(key, target, method) {
                    addBeforeObserver(this, key, target, method);
                },

                /**
                 Adds an observer on a property.

                 This is the core method used to register an observer for a property.

                 Once you call this method, any time the key's value is set, your observer
                 will be notified. Note that the observers are triggered any time the
                 value is set, regardless of whether it has actually changed. Your
                 observer should be prepared to handle that.

                 You can also pass an optional context parameter to this method. The
                 context will be passed to your observer method whenever it is triggered.
                 Note that if you add the same target/method pair on a key multiple times
                 with different context parameters, your observer will only be called once
                 with the last context you passed.

                 ### Observer Methods

                 Observer methods you pass should generally have the following signature if
                 you do not pass a `context` parameter:

                 ```javascript
                 fooDidChange: function(sender, key, value, rev) { };
                 ```

                 The sender is the object that changed. The key is the property that
                 changes. The value property is currently reserved and unused. The rev
                 is the last property revision of the object when it changed, which you can
                 use to detect if the key value has really changed or not.

                 If you pass a `context` parameter, the context will be passed before the
                 revision like so:

                 ```javascript
                 fooDidChange: function(sender, key, value, context, rev) { };
                 ```

                 Usually you will not need the value, context or revision parameters at
                 the end. In this case, it is common to write observer methods that take
                 only a sender and key value as parameters or, if you aren't interested in
                 any of these values, to write an observer that has no parameters at all.

                 @method addObserver
                 @param {String} key The key to observer
                 @param {Object} target The target object to invoke
                 @param {String|Function} method The method to invoke.
                 */
                addObserver: function(key, target, method) {
                    addObserver(this, key, target, method);
                },

                /**
                 Remove an observer you have previously registered on this object. Pass
                 the same key, target, and method you passed to `addObserver()` and your
                 target will no longer receive notifications.

                 @method removeObserver
                 @param {String} key The key to observer
                 @param {Object} target The target object to invoke
                 @param {String|Function} method The method to invoke.
                 */
                removeObserver: function(key, target, method) {
                    removeObserver(this, key, target, method);
                },

                /**
                 Returns `true` if the object currently has observers registered for a
                 particular key. You can use this method to potentially defer performing
                 an expensive action until someone begins observing a particular property
                 on the object.

                 @method hasObserverFor
                 @param {String} key Key to check
                 @return {Boolean}
                 */
                hasObserverFor: function(key) {
                    return hasListeners(this, key+':change');
                },

                /**
                 Retrieves the value of a property, or a default value in the case that the
                 property returns `undefined`.

                 ```javascript
                 person.getWithDefault('lastName', 'Doe');
                 ```

                 @method getWithDefault
                 @param {String} keyName The name of the property to retrieve
                 @param {Object} defaultValue The value to return if the property value is undefined
                 @return {Object} The property value or the defaultValue.
                 */
                getWithDefault: function(keyName, defaultValue) {
                    return getWithDefault(this, keyName, defaultValue);
                },

                /**
                 Set the value of a property to the current value plus some amount.

                 ```javascript
                 person.incrementProperty('age');
                 team.incrementProperty('score', 2);
                 ```

                 @method incrementProperty
                 @param {String} keyName The name of the property to increment
                 @param {Number} increment The amount to increment by. Defaults to 1
                 @return {Number} The new property value
                 */
                incrementProperty: function(keyName, increment) {
                    if (isNone(increment)) { increment = 1; }
                    Alto.assert("Must pass a numeric value to incrementProperty", (!isNaN(parseFloat(increment)) && isFinite(increment)));
                    set(this, keyName, (parseFloat(get(this, keyName)) || 0) + increment);
                    return get(this, keyName);
                },

                /**
                 Set the value of a property to the current value minus some amount.

                 ```javascript
                 player.decrementProperty('lives');
                 orc.decrementProperty('health', 5);
                 ```

                 @method decrementProperty
                 @param {String} keyName The name of the property to decrement
                 @param {Number} decrement The amount to decrement by. Defaults to 1
                 @return {Number} The new property value
                 */
                decrementProperty: function(keyName, decrement) {
                    if (isNone(decrement)) { decrement = 1; }
                    Alto.assert("Must pass a numeric value to decrementProperty", (!isNaN(parseFloat(decrement)) && isFinite(decrement)));
                    set(this, keyName, (get(this, keyName) || 0) - decrement);
                    return get(this, keyName);
                },

                /**
                 Set the value of a boolean property to the opposite of it's
                 current value.

                 ```javascript
                 starship.toggleProperty('warpDriveEngaged');
                 ```

                 @method toggleProperty
                 @param {String} keyName The name of the property to toggle
                 @return {Object} The new property value
                 */
                toggleProperty: function(keyName) {
                    set(this, keyName, !get(this, keyName));
                    return get(this, keyName);
                },

                /**
                 Returns the cached value of a computed property, if it exists.
                 This allows you to inspect the value of a computed property
                 without accidentally invoking it if it is intended to be
                 generated lazily.

                 @method cacheFor
                 @param {String} keyName
                 @return {Object} The cached value of the computed property, if any
                 */
                cacheFor: function(keyName) {
                    return cacheFor(this, keyName);
                },

                // intended for debugging purposes
                observersForKey: function(keyName) {
                    return observersFor(this, keyName);
                }
            });
        });
    enifed("ember-runtime/mixins/promise_proxy",
        ["ember-metal/property_get","ember-metal/set_properties","ember-metal/computed","ember-metal/mixin","ember-metal/error","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
            "use strict";
            var get = __dependency1__.get;
            var setProperties = __dependency2__["default"];
            var computed = __dependency3__.computed;
            var Mixin = __dependency4__.Mixin;
            var AltoError = __dependency5__["default"];

            var not = computed.not;
            var or = computed.or;

            /**
             @module ember
             @submodule ember-runtime
             */

            function tap(proxy, promise) {
                setProperties(proxy, {
                    isFulfilled: false,
                    isRejected: false
                });

                return promise.then(function(value) {
                    setProperties(proxy, {
                        content: value,
                        isFulfilled: true
                    });
                    return value;
                }, function(reason) {
                    setProperties(proxy, {
                        reason: reason,
                        isRejected: true
                    });
                    throw reason;
                }, "Alto: PromiseProxy");
            }

            /**
             A low level mixin making ObjectProxy, ObjectController or ArrayController's promise aware.

             ```javascript
             var ObjectPromiseController = Alto.ObjectController.extend(Alto.PromiseProxyMixin);

             var controller = ObjectPromiseController.create({
        promise: $.getJSON('/some/remote/data.json')
      });

             controller.then(function(json){
         // the json
      }, function(reason) {
         // the reason why you have no json
      });
             ```

             the controller has bindable attributes which
             track the promises life cycle

             ```javascript
             controller.get('isPending')   //=> true
             controller.get('isSettled')  //=> false
             controller.get('isRejected')  //=> false
             controller.get('isFulfilled') //=> false
             ```

             When the the $.getJSON completes, and the promise is fulfilled
             with json, the life cycle attributes will update accordingly.

             ```javascript
             controller.get('isPending')   //=> false
             controller.get('isSettled')   //=> true
             controller.get('isRejected')  //=> false
             controller.get('isFulfilled') //=> true
             ```

             As the controller is an ObjectController, and the json now its content,
             all the json properties will be available directly from the controller.

             ```javascript
             // Assuming the following json:
             {
        firstName: 'Stefan',
        lastName: 'Penner'
      }

             // both properties will accessible on the controller
             controller.get('firstName') //=> 'Stefan'
             controller.get('lastName')  //=> 'Penner'
             ```

             If the controller is backing a template, the attributes are
             bindable from within that template

             ```handlebars
             {{#if isPending}}
             loading...
             {{else}}
             firstName: {{firstName}}
             lastName: {{lastName}}
             {{/if}}
             ```
             @class Alto.PromiseProxyMixin
             */
            __exports__["default"] = Mixin.create({
                /**
                 If the proxied promise is rejected this will contain the reason
                 provided.

                 @property reason
                 @default null
                 */
                reason:  null,

                /**
                 Once the proxied promise has settled this will become `false`.

                 @property isPending
                 @default true
                 */
                isPending:  not('isSettled').readOnly(),

                /**
                 Once the proxied promise has settled this will become `true`.

                 @property isSettled
                 @default false
                 */
                isSettled:  or('isRejected', 'isFulfilled').readOnly(),

                /**
                 Will become `true` if the proxied promise is rejected.

                 @property isRejected
                 @default false
                 */
                isRejected:  false,

                /**
                 Will become `true` if the proxied promise is fulfilled.

                 @property isFulfilled
                 @default false
                 */
                isFulfilled: false,

                /**
                 The promise whose fulfillment value is being proxied by this object.

                 This property must be specified upon creation, and should not be
                 changed once created.

                 Example:

                 ```javascript
                 Alto.ObjectController.extend(Alto.PromiseProxyMixin).create({
          promise: <thenable>
        });
                 ```

                 @property promise
                 */
                promise: computed(function(key, promise) {
                    if (arguments.length === 2) {
                        return tap(this, promise);
                    } else {
                        throw new AltoError("PromiseProxy's promise must be set");
                    }
                }),

                /**
                 An alias to the proxied promise's `then`.

                 See RSVP.Promise.then.

                 @method then
                 @param {Function} callback
                 @return {RSVP.Promise}
                 */
                then: promiseAlias('then'),

                /**
                 An alias to the proxied promise's `catch`.

                 See RSVP.Promise.catch.

                 @method catch
                 @param {Function} callback
                 @return {RSVP.Promise}
                 @since 1.3.0
                 */
                'catch': promiseAlias('catch'),

                /**
                 An alias to the proxied promise's `finally`.

                 See RSVP.Promise.finally.

                 @method finally
                 @param {Function} callback
                 @return {RSVP.Promise}
                 @since 1.3.0
                 */
                'finally': promiseAlias('finally')

            });

            function promiseAlias(name) {
                return function () {
                    var promise = get(this, 'promise');
                    return promise[name].apply(promise, arguments);
                };
            }
        });
    enifed("ember-runtime/mixins/sortable",
        ["ember-metal/core","ember-metal/property_get","ember-metal/enumerable_utils","ember-metal/mixin","ember-runtime/mixins/mutable_enumerable","ember-runtime/compare","ember-metal/observer","ember-metal/computed","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */

            var Alto = __dependency1__["default"];
            // Alto.assert, Alto.A

            var get = __dependency2__.get;
            var forEach = __dependency3__.forEach;
            var Mixin = __dependency4__.Mixin;
            var MutableEnumerable = __dependency5__["default"];
            var compare = __dependency6__["default"];
            var addObserver = __dependency7__.addObserver;
            var removeObserver = __dependency7__.removeObserver;
            var computed = __dependency8__.computed;
            var beforeObserver = __dependency4__.beforeObserver;
            var observer = __dependency4__.observer;
            //ES6TODO: should we access these directly from their package or from how their exposed in ember-metal?

            /**
             `Alto.SortableMixin` provides a standard interface for array proxies
             to specify a sort order and maintain this sorting when objects are added,
             removed, or updated without changing the implicit order of their underlying
             model array:

             ```javascript
             songs = [
             {trackNumber: 4, title: 'Ob-La-Di, Ob-La-Da'},
             {trackNumber: 2, title: 'Back in the U.S.S.R.'},
             {trackNumber: 3, title: 'Glass Onion'},
             ];

             songsController = Alto.ArrayController.create({
        model: songs,
        sortProperties: ['trackNumber'],
        sortAscending: true
      });

             songsController.get('firstObject');  // {trackNumber: 2, title: 'Back in the U.S.S.R.'}

             songsController.addObject({trackNumber: 1, title: 'Dear Prudence'});
             songsController.get('firstObject');  // {trackNumber: 1, title: 'Dear Prudence'}
             ```

             If you add or remove the properties to sort by or change the sort direction the model
             sort order will be automatically updated.

             ```javascript
             songsController.set('sortProperties', ['title']);
             songsController.get('firstObject'); // {trackNumber: 2, title: 'Back in the U.S.S.R.'}

             songsController.toggleProperty('sortAscending');
             songsController.get('firstObject'); // {trackNumber: 4, title: 'Ob-La-Di, Ob-La-Da'}
             ```

             `SortableMixin` works by sorting the `arrangedContent` array, which is the array that
             `ArrayProxy` displays. Due to the fact that the underlying 'content' array is not changed, that
             array will not display the sorted list:

             ```javascript
             songsController.get('content').get('firstObject'); // Returns the unsorted original content
             songsController.get('firstObject'); // Returns the sorted content.
             ```

             Although the sorted content can also be accessed through the `arrangedContent` property,
             it is preferable to use the proxied class and not the `arrangedContent` array directly.

             @class SortableMixin
             @namespace Alto
             @uses Alto.MutableEnumerable
             */
            __exports__["default"] = Mixin.create(MutableEnumerable, {

                /**
                 Specifies which properties dictate the `arrangedContent`'s sort order.

                 When specifying multiple properties the sorting will use properties
                 from the `sortProperties` array prioritized from first to last.

                 @property {Array} sortProperties
                 */
                sortProperties: null,

                /**
                 Specifies the `arrangedContent`'s sort direction.
                 Sorts the content in ascending order by default. Set to `false` to
                 use descending order.

                 @property {Boolean} sortAscending
                 @default true
                 */
                sortAscending: true,

                /**
                 The function used to compare two values. You can override this if you
                 want to do custom comparisons. Functions must be of the type expected by
                 Array#sort, i.e.,

                 *  return 0 if the two parameters are equal,
                 *  return a negative value if the first parameter is smaller than the second or
                 *  return a positive value otherwise:

                 ```javascript
                 function(x, y) { // These are assumed to be integers
          if (x === y)
            return 0;
          return x < y ? -1 : 1;
        }
                 ```

                 @property sortFunction
                 @type {Function}
                 @default Alto.compare
                 */
                sortFunction: compare,

                orderBy: function(item1, item2) {
                    var result = 0;
                    var sortProperties = get(this, 'sortProperties');
                    var sortAscending = get(this, 'sortAscending');
                    var sortFunction = get(this, 'sortFunction');

                    Alto.assert("you need to define `sortProperties`", !!sortProperties);

                    forEach(sortProperties, function(propertyName) {
                        if (result === 0) {
                            result = sortFunction.call(this, get(item1, propertyName), get(item2, propertyName));
                            if ((result !== 0) && !sortAscending) {
                                result = (-1) * result;
                            }
                        }
                    }, this);

                    return result;
                },

                destroy: function() {
                    var content = get(this, 'content');
                    var sortProperties = get(this, 'sortProperties');

                    if (content && sortProperties) {
                        forEach(content, function(item) {
                            forEach(sortProperties, function(sortProperty) {
                                removeObserver(item, sortProperty, this, 'contentItemSortPropertyDidChange');
                            }, this);
                        }, this);
                    }

                    return this._super();
                },

                isSorted: computed.notAltopty('sortProperties'),

                /**
                 Overrides the default `arrangedContent` from `ArrayProxy` in order to sort by `sortFunction`.
                 Also sets up observers for each `sortProperty` on each item in the content Array.

                 @property arrangedContent
                 */
                arrangedContent: computed('content', 'sortProperties.@each', function(key, value) {
                    var content = get(this, 'content');
                    var isSorted = get(this, 'isSorted');
                    var sortProperties = get(this, 'sortProperties');
                    var self = this;

                    if (content && isSorted) {
                        content = content.slice();
                        content.sort(function(item1, item2) {
                            return self.orderBy(item1, item2);
                        });
                        forEach(content, function(item) {
                            forEach(sortProperties, function(sortProperty) {
                                addObserver(item, sortProperty, this, 'contentItemSortPropertyDidChange');
                            }, this);
                        }, this);
                        return Alto.A(content);
                    }

                    return content;
                }),

                _contentWillChange: beforeObserver('content', function() {
                    var content = get(this, 'content');
                    var sortProperties = get(this, 'sortProperties');

                    if (content && sortProperties) {
                        forEach(content, function(item) {
                            forEach(sortProperties, function(sortProperty) {
                                removeObserver(item, sortProperty, this, 'contentItemSortPropertyDidChange');
                            }, this);
                        }, this);
                    }

                    this._super();
                }),

                sortPropertiesWillChange: beforeObserver('sortProperties', function() {
                    this._lastSortAscending = undefined;
                }),

                sortPropertiesDidChange: observer('sortProperties', function() {
                    this._lastSortAscending = undefined;
                }),

                sortAscendingWillChange: beforeObserver('sortAscending', function() {
                    this._lastSortAscending = get(this, 'sortAscending');
                }),

                sortAscendingDidChange: observer('sortAscending', function() {
                    if (this._lastSortAscending !== undefined && get(this, 'sortAscending') !== this._lastSortAscending) {
                        var arrangedContent = get(this, 'arrangedContent');
                        arrangedContent.reverseObjects();
                    }
                }),

                contentArrayWillChange: function(array, idx, removedCount, addedCount) {
                    var isSorted = get(this, 'isSorted');

                    if (isSorted) {
                        var arrangedContent = get(this, 'arrangedContent');
                        var removedObjects = array.slice(idx, idx+removedCount);
                        var sortProperties = get(this, 'sortProperties');

                        forEach(removedObjects, function(item) {
                            arrangedContent.removeObject(item);

                            forEach(sortProperties, function(sortProperty) {
                                removeObserver(item, sortProperty, this, 'contentItemSortPropertyDidChange');
                            }, this);
                        }, this);
                    }

                    return this._super(array, idx, removedCount, addedCount);
                },

                contentArrayDidChange: function(array, idx, removedCount, addedCount) {
                    var isSorted = get(this, 'isSorted');
                    var sortProperties = get(this, 'sortProperties');

                    if (isSorted) {
                        var addedObjects = array.slice(idx, idx+addedCount);

                        forEach(addedObjects, function(item) {
                            this.insertItemSorted(item);

                            forEach(sortProperties, function(sortProperty) {
                                addObserver(item, sortProperty, this, 'contentItemSortPropertyDidChange');
                            }, this);
                        }, this);
                    }

                    return this._super(array, idx, removedCount, addedCount);
                },

                insertItemSorted: function(item) {
                    var arrangedContent = get(this, 'arrangedContent');
                    var length = get(arrangedContent, 'length');

                    var idx = this._binarySearch(item, 0, length);
                    arrangedContent.insertAt(idx, item);
                },

                contentItemSortPropertyDidChange: function(item) {
                    var arrangedContent = get(this, 'arrangedContent');
                    var oldIndex = arrangedContent.indexOf(item);
                    var leftItem = arrangedContent.objectAt(oldIndex - 1);
                    var rightItem = arrangedContent.objectAt(oldIndex + 1);
                    var leftResult = leftItem && this.orderBy(item, leftItem);
                    var rightResult = rightItem && this.orderBy(item, rightItem);

                    if (leftResult < 0 || rightResult > 0) {
                        arrangedContent.removeObject(item);
                        this.insertItemSorted(item);
                    }
                },

                _binarySearch: function(item, low, high) {
                    var mid, midItem, res, arrangedContent;

                    if (low === high) {
                        return low;
                    }

                    arrangedContent = get(this, 'arrangedContent');

                    mid = low + Math.floor((high - low) / 2);
                    midItem = arrangedContent.objectAt(mid);

                    res = this.orderBy(midItem, item);

                    if (res < 0) {
                        return this._binarySearch(item, mid+1, high);
                    } else if (res > 0) {
                        return this._binarySearch(item, low, mid);
                    }

                    return mid;
                }
            });
        });
    enifed("ember-runtime/mixins/target_action_support",
        ["ember-metal/core","ember-metal/property_get","ember-metal/utils","ember-metal/mixin","ember-metal/computed","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */
            var Alto = __dependency1__["default"];
            // Alto.lookup, Alto.assert

            var get = __dependency2__.get;
            var typeOf = __dependency3__.typeOf;
            var Mixin = __dependency4__.Mixin;
            var computed = __dependency5__.computed;

            /**
             `Alto.TargetActionSupport` is a mixin that can be included in a class
             to add a `triggerAction` method with semantics similar to the Handlebars
             `{{action}}` helper. In normal Alto usage, the `{{action}}` helper is
             usually the best choice. This mixin is most often useful when you are
             doing more complex event handling in View objects.

             See also `Alto.ViewTargetActionSupport`, which has
             view-aware defaults for target and actionContext.

             @class TargetActionSupport
             @namespace Alto
             @extends Alto.Mixin
             */
            var TargetActionSupport = Mixin.create({
                target: null,
                action: null,
                actionContext: null,

                targetObject: computed(function() {
                    var target = get(this, 'target');

                    if (typeOf(target) === "string") {
                        var value = get(this, target);
                        if (value === undefined) { value = get(Alto.lookup, target); }
                        return value;
                    } else {
                        return target;
                    }
                }).property('target'),

                actionContextObject: computed(function() {
                    var actionContext = get(this, 'actionContext');

                    if (typeOf(actionContext) === "string") {
                        var value = get(this, actionContext);
                        if (value === undefined) { value = get(Alto.lookup, actionContext); }
                        return value;
                    } else {
                        return actionContext;
                    }
                }).property('actionContext'),

                /**
                 Send an `action` with an `actionContext` to a `target`. The action, actionContext
                 and target will be retrieved from properties of the object. For example:

                 ```javascript
                 App.SaveButtonView = Alto.View.extend(Alto.TargetActionSupport, {
        target: Alto.computed.alias('controller'),
        action: 'save',
        actionContext: Alto.computed.alias('context'),
        click: function() {
          this.triggerAction(); // Sends the `save` action, along with the current context
                                // to the current controller
        }
      });
                 ```

                 The `target`, `action`, and `actionContext` can be provided as properties of
                 an optional object argument to `triggerAction` as well.

                 ```javascript
                 App.SaveButtonView = Alto.View.extend(Alto.TargetActionSupport, {
        click: function() {
          this.triggerAction({
            action: 'save',
            target: this.get('controller'),
            actionContext: this.get('context')
          }); // Sends the `save` action, along with the current context
              // to the current controller
        }
      });
                 ```

                 The `actionContext` defaults to the object you are mixing `TargetActionSupport` into.
                 But `target` and `action` must be specified either as properties or with the argument
                 to `triggerAction`, or a combination:

                 ```javascript
                 App.SaveButtonView = Alto.View.extend(Alto.TargetActionSupport, {
        target: Alto.computed.alias('controller'),
        click: function() {
          this.triggerAction({
            action: 'save'
          }); // Sends the `save` action, along with a reference to `this`,
              // to the current controller
        }
      });
                 ```

                 @method triggerAction
                 @param opts {Hash} (optional, with the optional keys action, target and/or actionContext)
                 @return {Boolean} true if the action was sent successfully and did not return false
                 */
                triggerAction: function(opts) {
                    opts = opts || {};
                    var action = opts.action || get(this, 'action');
                    var target = opts.target || get(this, 'targetObject');
                    var actionContext = opts.actionContext;

                    function args(options, actionName) {
                        var ret = [];
                        if (actionName) { ret.push(actionName); }

                        return ret.concat(options);
                    }

                    if (typeof actionContext === 'undefined') {
                        actionContext = get(this, 'actionContextObject') || this;
                    }

                    if (target && action) {
                        var ret;

                        if (target.send) {
                            ret = target.send.apply(target, args(actionContext, action));
                        } else {
                            Alto.assert("The action '" + action + "' did not exist on " + target, typeof target[action] === 'function');
                            ret = target[action].apply(target, args(actionContext));
                        }

                        if (ret !== false) ret = true;

                        return ret;
                    } else {
                        return false;
                    }
                }
            });

            __exports__["default"] = TargetActionSupport;
        });
    enifed("ember-runtime/system/application",
        ["ember-runtime/system/namespace","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var Namespace = __dependency1__["default"];

            __exports__["default"] = Namespace.extend();
        });
    enifed("ember-runtime/system/array_proxy",
        ["ember-metal/core","ember-metal/property_get","ember-metal/utils","ember-metal/computed","ember-metal/mixin","ember-metal/property_events","ember-metal/error","ember-runtime/system/object","ember-runtime/mixins/mutable_array","ember-runtime/mixins/enumerable","ember-runtime/system/string","ember-metal/alias","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __dependency11__, __dependency12__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            // Alto.K, Alto.assert
            var get = __dependency2__.get;
            var isArray = __dependency3__.isArray;
            var apply = __dependency3__.apply;
            var computed = __dependency4__.computed;
            var beforeObserver = __dependency5__.beforeObserver;
            var observer = __dependency5__.observer;
            var beginPropertyChanges = __dependency6__.beginPropertyChanges;
            var endPropertyChanges = __dependency6__.endPropertyChanges;
            var AltoError = __dependency7__["default"];
            var AltoObject = __dependency8__["default"];
            var MutableArray = __dependency9__["default"];
            var Enumerable = __dependency10__["default"];
            var fmt = __dependency11__.fmt;
            var alias = __dependency12__["default"];

            /**
             @module ember
             @submodule ember-runtime
             */

            var OUT_OF_RANGE_EXCEPTION = "Index out of range";
            var EMPTY = [];
            var K = Alto.K;

            /**
             An ArrayProxy wraps any other object that implements `Alto.Array` and/or
             `Alto.MutableArray,` forwarding all requests. This makes it very useful for
             a number of binding use cases or other cases where being able to swap
             out the underlying array is useful.

             A simple example of usage:

             ```javascript
             var pets = ['dog', 'cat', 'fish'];
             var ap = Alto.ArrayProxy.create({ content: Alto.A(pets) });

             ap.get('firstObject');                        // 'dog'
             ap.set('content', ['amoeba', 'paramecium']);
             ap.get('firstObject');                        // 'amoeba'
             ```

             This class can also be useful as a layer to transform the contents of
             an array, as they are accessed. This can be done by overriding
             `objectAtContent`:

             ```javascript
             var pets = ['dog', 'cat', 'fish'];
             var ap = Alto.ArrayProxy.create({
          content: Alto.A(pets),
          objectAtContent: function(idx) {
              return this.get('content').objectAt(idx).toUpperCase();
          }
      });

             ap.get('firstObject'); // . 'DOG'
             ```

             @class ArrayProxy
             @namespace Alto
             @extends Alto.Object
             @uses Alto.MutableArray
             */
            var ArrayProxy = AltoObject.extend(MutableArray, {

                /**
                 The content array. Must be an object that implements `Alto.Array` and/or
                 `Alto.MutableArray.`

                 @property content
                 @type Alto.Array
                 */
                content: null,

                /**
                 The array that the proxy pretends to be. In the default `ArrayProxy`
                 implementation, this and `content` are the same. Subclasses of `ArrayProxy`
                 can override this property to provide things like sorting and filtering.

                 @property arrangedContent
                 */
                arrangedContent: alias('content'),

                /**
                 Should actually retrieve the object at the specified index from the
                 content. You can override this method in subclasses to transform the
                 content item to something new.

                 This method will only be called if content is non-`null`.

                 @method objectAtContent
                 @param {Number} idx The index to retrieve.
                 @return {Object} the value or undefined if none found
                 */
                objectAtContent: function(idx) {
                    return get(this, 'arrangedContent').objectAt(idx);
                },

                /**
                 Should actually replace the specified objects on the content array.
                 You can override this method in subclasses to transform the content item
                 into something new.

                 This method will only be called if content is non-`null`.

                 @method replaceContent
                 @param {Number} idx The starting index
                 @param {Number} amt The number of items to remove from the content.
                 @param {Array} objects Optional array of objects to insert or null if no
                 objects.
                 @return {void}
                 */
                replaceContent: function(idx, amt, objects) {
                    get(this, 'content').replace(idx, amt, objects);
                },

                /**
                 Invoked when the content property is about to change. Notifies observers that the
                 entire array content will change.

                 @private
                 @method _contentWillChange
                 */
                _contentWillChange: beforeObserver('content', function() {
                    this._teardownContent();
                }),

                _teardownContent: function() {
                    var content = get(this, 'content');

                    if (content) {
                        content.removeArrayObserver(this, {
                            willChange: 'contentArrayWillChange',
                            didChange: 'contentArrayDidChange'
                        });
                    }
                },

                /**
                 Override to implement content array `willChange` observer.

                 @method contentArrayWillChange

                 @param {Alto.Array} contentArray the content array
                 @param {Number} start starting index of the change
                 @param {Number} removeCount count of items removed
                 @param {Number} addCount count of items added

                 */
                contentArrayWillChange: K,
                /**
                 Override to implement content array `didChange` observer.

                 @method contentArrayDidChange

                 @param {Alto.Array} contentArray the content array
                 @param {Number} start starting index of the change
                 @param {Number} removeCount count of items removed
                 @param {Number} addCount count of items added
                 */
                contentArrayDidChange: K,

                /**
                 Invoked when the content property changes. Notifies observers that the
                 entire array content has changed.

                 @private
                 @method _contentDidChange
                 */
                _contentDidChange: observer('content', function() {
                    var content = get(this, 'content');

                    Alto.assert("Can't set ArrayProxy's content to itself", content !== this);

                    this._setupContent();
                }),

                _setupContent: function() {
                    var content = get(this, 'content');

                    if (content) {
                        Alto.assert(fmt('ArrayProxy expects an Array or ' +
                                'Alto.ArrayProxy, but you passed %@', [typeof content]),
                            isArray(content) || content.isDestroyed);

                        content.addArrayObserver(this, {
                            willChange: 'contentArrayWillChange',
                            didChange: 'contentArrayDidChange'
                        });
                    }
                },

                _arrangedContentWillChange: beforeObserver('arrangedContent', function() {
                    var arrangedContent = get(this, 'arrangedContent');
                    var len = arrangedContent ? get(arrangedContent, 'length') : 0;

                    this.arrangedContentArrayWillChange(this, 0, len, undefined);
                    this.arrangedContentWillChange(this);

                    this._teardownArrangedContent(arrangedContent);
                }),

                _arrangedContentDidChange: observer('arrangedContent', function() {
                    var arrangedContent = get(this, 'arrangedContent');
                    var len = arrangedContent ? get(arrangedContent, 'length') : 0;

                    Alto.assert("Can't set ArrayProxy's content to itself", arrangedContent !== this);

                    this._setupArrangedContent();

                    this.arrangedContentDidChange(this);
                    this.arrangedContentArrayDidChange(this, 0, undefined, len);
                }),

                _setupArrangedContent: function() {
                    var arrangedContent = get(this, 'arrangedContent');

                    if (arrangedContent) {
                        Alto.assert(fmt('ArrayProxy expects an Array or ' +
                                'Alto.ArrayProxy, but you passed %@', [typeof arrangedContent]),
                            isArray(arrangedContent) || arrangedContent.isDestroyed);

                        arrangedContent.addArrayObserver(this, {
                            willChange: 'arrangedContentArrayWillChange',
                            didChange: 'arrangedContentArrayDidChange'
                        });
                    }
                },

                _teardownArrangedContent: function() {
                    var arrangedContent = get(this, 'arrangedContent');

                    if (arrangedContent) {
                        arrangedContent.removeArrayObserver(this, {
                            willChange: 'arrangedContentArrayWillChange',
                            didChange: 'arrangedContentArrayDidChange'
                        });
                    }
                },

                arrangedContentWillChange: K,
                arrangedContentDidChange: K,

                objectAt: function(idx) {
                    return get(this, 'content') && this.objectAtContent(idx);
                },

                length: computed(function() {
                    var arrangedContent = get(this, 'arrangedContent');
                    return arrangedContent ? get(arrangedContent, 'length') : 0;
                    // No dependencies since Enumerable notifies length of change
                }),

                _replace: function(idx, amt, objects) {
                    var content = get(this, 'content');
                    Alto.assert('The content property of '+ this.constructor + ' should be set before modifying it', content);
                    if (content) this.replaceContent(idx, amt, objects);
                    return this;
                },

                replace: function() {
                    if (get(this, 'arrangedContent') === get(this, 'content')) {
                        apply(this, this._replace, arguments);
                    } else {
                        throw new AltoError("Using replace on an arranged ArrayProxy is not allowed.");
                    }
                },

                _insertAt: function(idx, object) {
                    if (idx > get(this, 'content.length')) throw new AltoError(OUT_OF_RANGE_EXCEPTION);
                    this._replace(idx, 0, [object]);
                    return this;
                },

                insertAt: function(idx, object) {
                    if (get(this, 'arrangedContent') === get(this, 'content')) {
                        return this._insertAt(idx, object);
                    } else {
                        throw new AltoError("Using insertAt on an arranged ArrayProxy is not allowed.");
                    }
                },

                removeAt: function(start, len) {
                    if ('number' === typeof start) {
                        var content = get(this, 'content');
                        var arrangedContent = get(this, 'arrangedContent');
                        var indices = [];
                        var i;

                        if ((start < 0) || (start >= get(this, 'length'))) {
                            throw new AltoError(OUT_OF_RANGE_EXCEPTION);
                        }

                        if (len === undefined) len = 1;

                        // Get a list of indices in original content to remove
                        for (i=start; i<start+len; i++) {
                            // Use arrangedContent here so we avoid confusion with objects transformed by objectAtContent
                            indices.push(content.indexOf(arrangedContent.objectAt(i)));
                        }

                        // Replace in reverse order since indices will change
                        indices.sort(function(a,b) { return b - a; });

                        beginPropertyChanges();
                        for (i=0; i<indices.length; i++) {
                            this._replace(indices[i], 1, EMPTY);
                        }
                        endPropertyChanges();
                    }

                    return this ;
                },

                pushObject: function(obj) {
                    this._insertAt(get(this, 'content.length'), obj) ;
                    return obj ;
                },

                pushObjects: function(objects) {
                    if (!(Enumerable.detect(objects) || isArray(objects))) {
                        throw new TypeError("Must pass Alto.Enumerable to Alto.MutableArray#pushObjects");
                    }
                    this._replace(get(this, 'length'), 0, objects);
                    return this;
                },

                setObjects: function(objects) {
                    if (objects.length === 0) return this.clear();

                    var len = get(this, 'length');
                    this._replace(0, len, objects);
                    return this;
                },

                unshiftObject: function(obj) {
                    this._insertAt(0, obj) ;
                    return obj ;
                },

                unshiftObjects: function(objects) {
                    this._replace(0, 0, objects);
                    return this;
                },

                slice: function() {
                    var arr = this.toArray();
                    return arr.slice.apply(arr, arguments);
                },

                arrangedContentArrayWillChange: function(item, idx, removedCnt, addedCnt) {
                    this.arrayContentWillChange(idx, removedCnt, addedCnt);
                },

                arrangedContentArrayDidChange: function(item, idx, removedCnt, addedCnt) {
                    this.arrayContentDidChange(idx, removedCnt, addedCnt);
                },

                init: function() {
                    this._super();
                    this._setupContent();
                    this._setupArrangedContent();
                },

                willDestroy: function() {
                    this._teardownArrangedContent();
                    this._teardownContent();
                }
            });

            __exports__["default"] = ArrayProxy;
        });
    enifed("ember-runtime/system/container",
        ["ember-metal/property_set","container","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var set = __dependency1__.set;
            var Container = __dependency2__["default"];

            Container.set = set;

            __exports__["default"] = Container;
        });
    enifed("ember-runtime/system/core_object",
        ["ember-metal/core","ember-metal/property_get","ember-metal/utils","ember-metal/platform","ember-metal/chains","ember-metal/events","ember-metal/mixin","ember-metal/enumerable_utils","ember-metal/error","ember-metal/keys","ember-runtime/mixins/action_handler","ember-metal/properties","ember-metal/binding","ember-metal/computed","ember-metal/injected_property","ember-metal/run_loop","ember-metal/watching","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __dependency11__, __dependency12__, __dependency13__, __dependency14__, __dependency15__, __dependency16__, __dependency17__, __exports__) {
            // Remove "use strict"; from transpiled module until
            // https://bugs.webkit.org/show_bug.cgi?id=138038 is fixed
            //
            // REMOVE_USE_STRICT: true

            /**
             @module ember
             @submodule ember-runtime
             */

            var Alto = __dependency1__["default"];
            // Alto.assert, Alto.K, Alto.config

            // NOTE: this object should never be included directly. Instead use `Alto.Object`.
            // We only define this separately so that `Alto.Set` can depend on it.
            var get = __dependency2__.get;
            var guidFor = __dependency3__.guidFor;
            var apply = __dependency3__.apply;
            var o_create = __dependency4__.create;
            var generateGuid = __dependency3__.generateGuid;
            var GUID_KEY = __dependency3__.GUID_KEY;
            var meta = __dependency3__.meta;
            var makeArray = __dependency3__.makeArray;
            var finishChains = __dependency5__.finishChains;
            var sendEvent = __dependency6__.sendEvent;
            var IS_BINDING = __dependency7__.IS_BINDING;
            var Mixin = __dependency7__.Mixin;
            var required = __dependency7__.required;
            var indexOf = __dependency8__.indexOf;
            var AltoError = __dependency9__["default"];
            var o_defineProperty = __dependency4__.defineProperty;
            var keys = __dependency10__["default"];
            var ActionHandler = __dependency11__["default"];
            var defineProperty = __dependency12__.defineProperty;
            var Binding = __dependency13__.Binding;
            var ComputedProperty = __dependency14__.ComputedProperty;
            var computed = __dependency14__.computed;
            var InjectedProperty = __dependency15__["default"];
            var run = __dependency16__["default"];
            var destroy = __dependency17__.destroy;
            var K = __dependency1__.K;
            var hasPropertyAccessors = __dependency4__.hasPropertyAccessors;

            var schedule = run.schedule;
            var applyMixin = Mixin._apply;
            var finishPartial = Mixin.finishPartial;
            var reopen = Mixin.prototype.reopen;
            var hasCachedComputedProperties = false;

            var undefinedDescriptor = {
                configurable: true,
                writable: true,
                enumerable: false,
                value: undefined
            };

            var nullDescriptor = {
                configurable: true,
                writable: true,
                enumerable: false,
                value: null
            };

            function makeCtor() {

                // Note: avoid accessing any properties on the object since it makes the
                // method a lot faster. This is glue code so we want it to be as fast as
                // possible.

                var wasApplied = false;
                var initMixins, initProperties;

                var Class = function() {
                    if (!wasApplied) {
                        Class.proto(); // prepare prototype...
                    }
                    o_defineProperty(this, GUID_KEY, nullDescriptor);
                    o_defineProperty(this, '__nextSuper', undefinedDescriptor);
                    var m = meta(this);
                    var proto = m.proto;
                    m.proto = this;
                    if (initMixins) {
                        // capture locally so we can clear the closed over variable
                        var mixins = initMixins;
                        initMixins = null;
                        apply(this, this.reopen, mixins);
                    }
                    if (initProperties) {
                        // capture locally so we can clear the closed over variable
                        var props = initProperties;
                        initProperties = null;

                        var concatenatedProperties = this.concatenatedProperties;

                        for (var i = 0, l = props.length; i < l; i++) {
                            var properties = props[i];

                            Alto.assert("Alto.Object.create no longer supports mixing in other definitions, use createWithMixins instead.", !(properties instanceof Mixin));

                            if (typeof properties !== 'object' && properties !== undefined) {
                                throw new AltoError("Alto.Object.create only accepts objects.");
                            }

                            if (!properties) { continue; }

                            var keyNames = keys(properties);

                            for (var j = 0, ll = keyNames.length; j < ll; j++) {
                                var keyName = keyNames[j];
                                var value = properties[keyName];

                                if (IS_BINDING.test(keyName)) {
                                    var bindings = m.bindings;
                                    if (!bindings) {
                                        bindings = m.bindings = {};
                                    } else if (!m.hasOwnProperty('bindings')) {
                                        bindings = m.bindings = o_create(m.bindings);
                                    }
                                    bindings[keyName] = value;
                                }

                                var desc = m.descs[keyName];

                                Alto.assert("Alto.Object.create no longer supports defining computed properties. Define computed properties using extend() or reopen() before calling create().", !(value instanceof ComputedProperty));
                                Alto.assert("Alto.Object.create no longer supports defining methods that call _super.", !(typeof value === 'function' && value.toString().indexOf('._super') !== -1));
                                Alto.assert("`actions` must be provided at extend time, not at create " +
                                    "time, when Alto.ActionHandler is used (i.e. views, " +
                                    "controllers & routes).", !((keyName === 'actions') && ActionHandler.detect(this)));

                                if (concatenatedProperties &&
                                    concatenatedProperties.length > 0 &&
                                    indexOf(concatenatedProperties, keyName) >= 0) {
                                    var baseValue = this[keyName];

                                    if (baseValue) {
                                        if ('function' === typeof baseValue.concat) {
                                            value = baseValue.concat(value);
                                        } else {
                                            value = makeArray(baseValue).concat(value);
                                        }
                                    } else {
                                        value = makeArray(value);
                                    }
                                }

                                if (desc) {
                                    desc.set(this, keyName, value);
                                } else {
                                    if (typeof this.setUnknownProperty === 'function' && !(keyName in this)) {
                                        this.setUnknownProperty(keyName, value);
                                    } else {

                                        if (hasPropertyAccessors) {
                                            defineProperty(this, keyName, null, value); // setup mandatory setter
                                        } else {
                                            this[keyName] = value;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    finishPartial(this, m);
                    var length = arguments.length;
                    var args = new Array(length);
                    for (var x = 0; x < length; x++) {
                        args[x] = arguments[x];
                    }
                    apply(this, this.init, args);
                    m.proto = proto;
                    finishChains(this);
                    sendEvent(this, "init");
                };

                Class.toString = Mixin.prototype.toString;
                Class.willReopen = function() {
                    if (wasApplied) {
                        Class.PrototypeMixin = Mixin.create(Class.PrototypeMixin);
                    }

                    wasApplied = false;
                };
                Class._initMixins = function(args) { initMixins = args; };
                Class._initProperties = function(args) { initProperties = args; };

                Class.proto = function() {
                    var superclass = Class.superclass;
                    if (superclass) { superclass.proto(); }

                    if (!wasApplied) {
                        wasApplied = true;
                        Class.PrototypeMixin.applyPartial(Class.prototype);
                    }

                    return this.prototype;
                };

                return Class;

            }

            /**
             @class CoreObject
             @namespace Alto
             */
            var CoreObject = makeCtor();
            CoreObject.toString = function() { return "Alto.CoreObject"; };
            CoreObject.PrototypeMixin = Mixin.create({
                reopen: function() {
                    var length = arguments.length;
                    var args = new Array(length);
                    for (var i = 0; i < length; i++) {
                        args[i] = arguments[i];
                    }
                    applyMixin(this, args, true);
                    return this;
                },

                /**
                 An overridable method called when objects are instantiated. By default,
                 does nothing unless it is overridden during class definition.

                 Example:

                 ```javascript
                 App.Person = Alto.Object.extend({
          init: function() {
            alert('Name is ' + this.get('name'));
          }
        });

                 var steve = App.Person.create({
          name: "Steve"
        });

                 // alerts 'Name is Steve'.
                 ```

                 NOTE: If you do override `init` for a framework class like `Alto.View` or
                 `Alto.ArrayController`, be sure to call `this._super()` in your
                 `init` declaration! If you don't, Alto may not have an opportunity to
                 do important setup work, and you'll see strange behavior in your
                 application.

                 @method init
                 */
                init: function() {},

                /**
                 Defines the properties that will be concatenated from the superclass
                 (instead of overridden).

                 By default, when you extend an Alto class a property defined in
                 the subclass overrides a property with the same name that is defined
                 in the superclass. However, there are some cases where it is preferable
                 to build up a property's value by combining the superclass' property
                 value with the subclass' value. An example of this in use within Alto
                 is the `classNames` property of `Alto.View`.

                 Here is some sample code showing the difference between a concatenated
                 property and a normal one:

                 ```javascript
                 App.BarView = Alto.View.extend({
          someNonConcatenatedProperty: ['bar'],
          classNames: ['bar']
        });

                 App.FooBarView = App.BarView.extend({
          someNonConcatenatedProperty: ['foo'],
          classNames: ['foo']
        });

                 var fooBarView = App.FooBarView.create();
                 fooBarView.get('someNonConcatenatedProperty'); // ['foo']
                 fooBarView.get('classNames'); // ['ember-view', 'bar', 'foo']
                 ```

                 This behavior extends to object creation as well. Continuing the
                 above example:

                 ```javascript
                 var view = App.FooBarView.create({
          someNonConcatenatedProperty: ['baz'],
          classNames: ['baz']
        })
                 view.get('someNonConcatenatedProperty'); // ['baz']
                 view.get('classNames'); // ['ember-view', 'bar', 'foo', 'baz']
                 ```
                 Adding a single property that is not an array will just add it in the array:

                 ```javascript
                 var view = App.FooBarView.create({
          classNames: 'baz'
        })
                 view.get('classNames'); // ['ember-view', 'bar', 'foo', 'baz']
                 ```

                 Using the `concatenatedProperties` property, we can tell to Alto that mix
                 the content of the properties.

                 In `Alto.View` the `classNameBindings` and `attributeBindings` properties
                 are also concatenated, in addition to `classNames`.

                 This feature is available for you to use throughout the Alto object model,
                 although typical app developers are likely to use it infrequently. Since
                 it changes expectations about behavior of properties, you should properly
                 document its usage in each individual concatenated property (to not
                 mislead your users to think they can override the property in a subclass).

                 @property concatenatedProperties
                 @type Array
                 @default null
                 */
                concatenatedProperties: null,

                /**
                 Destroyed object property flag.

                 if this property is `true` the observers and bindings were already
                 removed by the effect of calling the `destroy()` method.

                 @property isDestroyed
                 @default false
                 */
                isDestroyed: false,

                /**
                 Destruction scheduled flag. The `destroy()` method has been called.

                 The object stays intact until the end of the run loop at which point
                 the `isDestroyed` flag is set.

                 @property isDestroying
                 @default false
                 */
                isDestroying: false,

                /**
                 Destroys an object by setting the `isDestroyed` flag and removing its
                 metadata, which effectively destroys observers and bindings.

                 If you try to set a property on a destroyed object, an exception will be
                 raised.

                 Note that destruction is scheduled for the end of the run loop and does not
                 happen immediately.  It will set an isDestroying flag immediately.

                 @method destroy
                 @return {Alto.Object} receiver
                 */
                destroy: function() {
                    if (this.isDestroying) { return; }
                    this.isDestroying = true;

                    schedule('actions', this, this.willDestroy);
                    schedule('destroy', this, this._scheduledDestroy);
                    return this;
                },

                /**
                 Override to implement teardown.

                 @method willDestroy
                 */
                willDestroy: K,

                /**
                 Invoked by the run loop to actually destroy the object. This is
                 scheduled for execution by the `destroy` method.

                 @private
                 @method _scheduledDestroy
                 */
                _scheduledDestroy: function() {
                    if (this.isDestroyed) { return; }
                    destroy(this);
                    this.isDestroyed = true;
                },

                bind: function(to, from) {
                    if (!(from instanceof Binding)) { from = Binding.from(from); }
                    from.to(to).connect(this);
                    return from;
                },

                /**
                 Returns a string representation which attempts to provide more information
                 than Javascript's `toString` typically does, in a generic way for all Alto
                 objects.

                 ```javascript
                 App.Person = Alto.Object.extend()
                 person = App.Person.create()
                 person.toString() //=> "<App.Person:ember1024>"
                 ```

                 If the object's class is not defined on an Alto namespace, it will
                 indicate it is a subclass of the registered superclass:

                 ```javascript
                 Student = App.Person.extend()
                 student = Student.create()
                 student.toString() //=> "<(subclass of App.Person):ember1025>"
                 ```

                 If the method `toStringExtension` is defined, its return value will be
                 included in the output.

                 ```javascript
                 App.Teacher = App.Person.extend({
          toStringExtension: function() {
            return this.get('fullName');
          }
        });
                 teacher = App.Teacher.create()
                 teacher.toString(); //=> "<App.Teacher:ember1026:Tom Dale>"
                 ```

                 @method toString
                 @return {String} string representation
                 */
                toString: function toString() {
                    var hasToStringExtension = typeof this.toStringExtension === 'function';
                    var extension = hasToStringExtension ? ":" + this.toStringExtension() : '';
                    var ret = '<'+this.constructor.toString()+':'+guidFor(this)+extension+'>';

                    this.toString = makeToString(ret);
                    return ret;
                }
            });

            CoreObject.PrototypeMixin.ownerConstructor = CoreObject;

            function makeToString(ret) {
                return function() { return ret; };
            }

            if (Alto.config.overridePrototypeMixin) {
                Alto.config.overridePrototypeMixin(CoreObject.PrototypeMixin);
            }

            CoreObject.__super__ = null;

            var ClassMixinProps = {

                ClassMixin: required(),

                PrototypeMixin: required(),

                isClass: true,

                isMethod: false,

                /**
                 Creates a new subclass.

                 ```javascript
                 App.Person = Alto.Object.extend({
          say: function(thing) {
            alert(thing);
           }
        });
                 ```

                 This defines a new subclass of Alto.Object: `App.Person`. It contains one method: `say()`.

                 You can also create a subclass from any existing class by calling its `extend()`  method. For example, you might want to create a subclass of Alto's built-in `Alto.View` class:

                 ```javascript
                 App.PersonView = Alto.View.extend({
          tagName: 'li',
          classNameBindings: ['isAdministrator']
        });
                 ```

                 When defining a subclass, you can override methods but still access the implementation of your parent class by calling the special `_super()` method:

                 ```javascript
                 App.Person = Alto.Object.extend({
          say: function(thing) {
            var name = this.get('name');
            alert(name + ' says: ' + thing);
          }
        });

                 App.Soldier = App.Person.extend({
          say: function(thing) {
            this._super(thing + ", sir!");
          },
          march: function(numberOfHours) {
            alert(this.get('name') + ' marches for ' + numberOfHours + ' hours.')
          }
        });

                 var yehuda = App.Soldier.create({
          name: "Yehuda Katz"
        });

                 yehuda.say("Yes");  // alerts "Yehuda Katz says: Yes, sir!"
                 ```

                 The `create()` on line #17 creates an *instance* of the `App.Soldier` class. The `extend()` on line #8 creates a *subclass* of `App.Person`. Any instance of the `App.Person` class will *not* have the `march()` method.

                 You can also pass `Mixin` classes to add additional properties to the subclass.

                 ```javascript
                 App.Person = Alto.Object.extend({
          say: function(thing) {
            alert(this.get('name') + ' says: ' + thing);
          }
        });

                 App.SingingMixin = Mixin.create({
          sing: function(thing){
            alert(this.get('name') + ' sings: la la la ' + thing);
          }
        });

                 App.BroadwayStar = App.Person.extend(App.SingingMixin, {
          dance: function() {
            alert(this.get('name') + ' dances: tap tap tap tap ');
          }
        });
                 ```

                 The `App.BroadwayStar` class contains three methods: `say()`, `sing()`, and `dance()`.

                 @method extend
                 @static

                 @param {Mixin} [mixins]* One or more Mixin classes
                 @param {Object} [arguments]* Object containing values to use within the new class
                 */
                extend: function extend() {
                    var Class = makeCtor();
                    var proto;
                    Class.ClassMixin = Mixin.create(this.ClassMixin);
                    Class.PrototypeMixin = Mixin.create(this.PrototypeMixin);

                    Class.ClassMixin.ownerConstructor = Class;
                    Class.PrototypeMixin.ownerConstructor = Class;

                    reopen.apply(Class.PrototypeMixin, arguments);

                    Class.superclass = this;
                    Class.__super__  = this.prototype;

                    proto = Class.prototype = o_create(this.prototype);
                    proto.constructor = Class;
                    generateGuid(proto);
                    meta(proto).proto = proto; // this will disable observers on prototype

                    Class.ClassMixin.apply(Class);
                    return Class;
                },

                /**
                 Equivalent to doing `extend(arguments).create()`.
                 If possible use the normal `create` method instead.

                 @method createWithMixins
                 @static
                 @param [arguments]*
                 */
                createWithMixins: function() {
                    var C = this;
                    var l= arguments.length;
                    if (l > 0) {
                        var args = new Array(l);
                        for (var i = 0; i < l; i++) {
                            args[i] = arguments[i];
                        }
                        this._initMixins(args);
                    }
                    return new C();
                },

                /**
                 Creates an instance of a class. Accepts either no arguments, or an object
                 containing values to initialize the newly instantiated object with.

                 ```javascript
                 App.Person = Alto.Object.extend({
          helloWorld: function() {
            alert("Hi, my name is " + this.get('name'));
          }
        });

                 var tom = App.Person.create({
          name: 'Tom Dale'
        });

                 tom.helloWorld(); // alerts "Hi, my name is Tom Dale".
                 ```

                 `create` will call the `init` function if defined during
                 `Alto.AnyObject.extend`

                 If no arguments are passed to `create`, it will not set values to the new
                 instance during initialization:

                 ```javascript
                 var noName = App.Person.create();
                 noName.helloWorld(); // alerts undefined
                 ```

                 NOTE: For performance reasons, you cannot declare methods or computed
                 properties during `create`. You should instead declare methods and computed
                 properties when using `extend` or use the `createWithMixins` shorthand.

                 @method create
                 @static
                 @param [arguments]*
                 */
                create: function() {
                    var C = this;
                    var l = arguments.length;
                    if (l > 0) {
                        var args = new Array(l);
                        for (var i = 0; i < l; i++) {
                            args[i] = arguments[i];
                        }
                        this._initProperties(args);
                    }
                    return new C();
                },

                /**
                 Destroys and object instance and removes it from scope of the window`.
                 @method destroyInstance
                 @static
                 @param {Alto.Object} An instance of an alto class
                 */
                destroyInstance: function(instance) {
                    var Class;
                    Class = window[instance.split('.')[0]][instance.split('.')[1]];
                    Class.destroy();
                    delete window[instance.split('.')[0]][instance.split('.')[1]];
                },

                /**
                 Augments a constructor's prototype with additional
                 properties and functions:

                 ```javascript
                 MyObject = Alto.Object.extend({
          name: 'an object'
        });

                 o = MyObject.create();
                 o.get('name'); // 'an object'

                 MyObject.reopen({
          say: function(msg){
            console.log(msg);
          }
        })

                 o2 = MyObject.create();
                 o2.say("hello"); // logs "hello"

                 o.say("goodbye"); // logs "goodbye"
                 ```

                 To add functions and properties to the constructor itself,
                 see `reopenClass`

                 @method reopen
                 */
                reopen: function() {
                    this.willReopen();

                    var l = arguments.length;
                    var args = new Array(l);
                    if (l > 0) {
                        for (var i = 0; i < l; i++) {
                            args[i] = arguments[i];
                        }
                    }

                    apply(this.PrototypeMixin, reopen, args);
                    return this;
                },

                /**
                 Augments a constructor's own properties and functions:

                 ```javascript
                 MyObject = Alto.Object.extend({
          name: 'an object'
        });

                 MyObject.reopenClass({
          canBuild: false
        });

                 MyObject.canBuild; // false
                 o = MyObject.create();
                 ```

                 In other words, this creates static properties and functions for the class. These are only available on the class
                 and not on any instance of that class.

                 ```javascript
                 App.Person = Alto.Object.extend({
          name : "",
          sayHello : function(){
            alert("Hello. My name is " + this.get('name'));
          }
        });

                 App.Person.reopenClass({
          species : "Homo sapiens",
          createPerson: function(newPersonsName){
            return App.Person.create({
              name:newPersonsName
            });
          }
        });

                 var tom = App.Person.create({
          name : "Tom Dale"
        });
                 var yehuda = App.Person.createPerson("Yehuda Katz");

                 tom.sayHello(); // "Hello. My name is Tom Dale"
                 yehuda.sayHello(); // "Hello. My name is Yehuda Katz"
                 alert(App.Person.species); // "Homo sapiens"
                 ```

                 Note that `species` and `createPerson` are *not* valid on the `tom` and `yehuda`
                 variables. They are only valid on `App.Person`.

                 To add functions and properties to instances of
                 a constructor by extending the constructor's prototype
                 see `reopen`

                 @method reopenClass
                 */
                reopenClass: function() {
                    var l = arguments.length;
                    var args = new Array(l);
                    if (l > 0) {
                        for (var i = 0; i < l; i++) {
                            args[i] = arguments[i];
                        }
                    }

                    apply(this.ClassMixin, reopen, args);
                    applyMixin(this, arguments, false);
                    return this;
                },

                detect: function(obj) {
                    if ('function' !== typeof obj) { return false; }
                    while(obj) {
                        if (obj===this) { return true; }
                        obj = obj.superclass;
                    }
                    return false;
                },

                detectInstance: function(obj) {
                    return obj instanceof this;
                },

                /**
                 In some cases, you may want to annotate computed properties with additional
                 metadata about how they function or what values they operate on. For
                 example, computed property functions may close over variables that are then
                 no longer available for introspection.

                 You can pass a hash of these values to a computed property like this:

                 ```javascript
                 person: function() {
          var personId = this.get('personId');
          return App.Person.create({ id: personId });
        }.property().meta({ type: App.Person })
                 ```

                 Once you've done this, you can retrieve the values saved to the computed
                 property from your class like this:

                 ```javascript
                 MyClass.metaForProperty('person');
                 ```

                 This will return the original hash that was passed to `meta()`.

                 @method metaForProperty
                 @param key {String} property name
                 */
                metaForProperty: function(key) {
                    var meta = this.proto()['__alto_meta__'];
                    var desc = meta && meta.descs[key];

                    Alto.assert("metaForProperty() could not find a computed property with key '"+key+"'.", !!desc && desc instanceof ComputedProperty);
                    return desc._meta || {};
                },

                _computedProperties: computed(function() {
                    hasCachedComputedProperties = true;
                    var proto = this.proto();
                    var descs = meta(proto).descs;
                    var property;
                    var properties = [];

                    for (var name in descs) {
                        property = descs[name];

                        if (property instanceof ComputedProperty) {
                            properties.push({
                                name: name,
                                meta: property._meta
                            });
                        }
                    }
                    return properties;
                }).readOnly(),

                /**
                 Iterate over each computed property for the class, passing its name
                 and any associated metadata (see `metaForProperty`) to the callback.

                 @method eachComputedProperty
                 @param {Function} callback
                 @param {Object} binding
                 */
                eachComputedProperty: function(callback, binding) {
                    var property, name;
                    var empty = {};

                    var properties = get(this, '_computedProperties');

                    for (var i = 0, length = properties.length; i < length; i++) {
                        property = properties[i];
                        name = property.name;
                        callback.call(binding || this, property.name, property.meta || empty);
                    }
                }
            };


            var ClassMixin = Mixin.create(ClassMixinProps);

            ClassMixin.ownerConstructor = CoreObject;

            if (Alto.config.overrideClassMixin) {
                Alto.config.overrideClassMixin(ClassMixin);
            }

            CoreObject.ClassMixin = ClassMixin;

            ClassMixin.apply(CoreObject);

            CoreObject.reopen({
                didDefineProperty: function(proto, key, value) {
                    if (hasCachedComputedProperties === false) { return; }
                    if (value instanceof Alto.ComputedProperty) {
                        var cache = Alto.meta(this.constructor).cache;

                        if (cache._computedProperties !== undefined) {
                            cache._computedProperties = undefined;
                        }
                    }
                }
            });

            __exports__["default"] = CoreObject;
        });
    enifed("ember-runtime/system/deferred",
        ["ember-metal/core","ember-runtime/mixins/deferred","ember-runtime/system/object","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            "use strict";
            var Alto = __dependency1__["default"];
            var DeferredMixin = __dependency2__["default"];
            var AltoObject = __dependency3__["default"];

            var Deferred = AltoObject.extend(DeferredMixin, {
                init: function() {
                    Alto.deprecate('Usage of Alto.Deferred is deprecated.');
                    this._super();
                }
            });

            Deferred.reopenClass({
                promise: function(callback, binding) {
                    var deferred = Deferred.create();
                    callback.call(binding, deferred);
                    return deferred;
                }
            });

            __exports__["default"] = Deferred;
        });
    enifed("ember-runtime/system/each_proxy",
        ["ember-metal/core","ember-metal/property_get","ember-metal/utils","ember-metal/enumerable_utils","ember-metal/array","ember-runtime/mixins/array","ember-runtime/system/object","ember-metal/computed","ember-metal/observer","ember-metal/events","ember-metal/properties","ember-metal/property_events","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __dependency11__, __dependency12__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */

            var Alto = __dependency1__["default"];
            // Alto.assert

            var get = __dependency2__.get;
            var guidFor = __dependency3__.guidFor;
            var forEach = __dependency4__.forEach;
            var indexOf = __dependency5__.indexOf;
            var AltoArray = __dependency6__["default"];
            // ES6TODO: WAT? Circular dep?
            var AltoObject = __dependency7__["default"];
            var computed = __dependency8__.computed;
            var addObserver = __dependency9__.addObserver;
            var addBeforeObserver = __dependency9__.addBeforeObserver;
            var removeBeforeObserver = __dependency9__.removeBeforeObserver;
            var removeObserver = __dependency9__.removeObserver;
            var typeOf = __dependency3__.typeOf;
            var watchedEvents = __dependency10__.watchedEvents;
            var defineProperty = __dependency11__.defineProperty;
            var beginPropertyChanges = __dependency12__.beginPropertyChanges;
            var propertyDidChange = __dependency12__.propertyDidChange;
            var propertyWillChange = __dependency12__.propertyWillChange;
            var endPropertyChanges = __dependency12__.endPropertyChanges;
            var changeProperties = __dependency12__.changeProperties;

            var EachArray = AltoObject.extend(AltoArray, {

                init: function(content, keyName, owner) {
                    this._super();
                    this._keyName = keyName;
                    this._owner   = owner;
                    this._content = content;
                },

                objectAt: function(idx) {
                    var item = this._content.objectAt(idx);
                    return item && get(item, this._keyName);
                },

                length: computed(function() {
                    var content = this._content;
                    return content ? get(content, 'length') : 0;
                })

            });

            var IS_OBSERVER = /^.+:(before|change)$/;

            function addObserverForContentKey(content, keyName, proxy, idx, loc) {
                var objects = proxy._objects;
                var guid;
                if (!objects) objects = proxy._objects = {};

                while(--loc>=idx) {
                    var item = content.objectAt(loc);
                    if (item) {
                        Alto.assert('When using @each to observe the array ' + content + ', the array must return an object', typeOf(item) === 'instance' || typeOf(item) === 'object');
                        addBeforeObserver(item, keyName, proxy, 'contentKeyWillChange');
                        addObserver(item, keyName, proxy, 'contentKeyDidChange');

                        // keep track of the index each item was found at so we can map
                        // it back when the obj changes.
                        guid = guidFor(item);
                        if (!objects[guid]) objects[guid] = [];
                        objects[guid].push(loc);
                    }
                }
            }

            function removeObserverForContentKey(content, keyName, proxy, idx, loc) {
                var objects = proxy._objects;
                if (!objects) objects = proxy._objects = {};
                var indicies, guid;

                while(--loc>=idx) {
                    var item = content.objectAt(loc);
                    if (item) {
                        removeBeforeObserver(item, keyName, proxy, 'contentKeyWillChange');
                        removeObserver(item, keyName, proxy, 'contentKeyDidChange');

                        guid = guidFor(item);
                        indicies = objects[guid];
                        indicies[indexOf.call(indicies, loc)] = null;
                    }
                }
            }

            /**
             This is the object instance returned when you get the `@each` property on an
             array. It uses the unknownProperty handler to automatically create
             EachArray instances for property names.

             @private
             @class EachProxy
             @namespace Alto
             @extends Alto.Object
             */
            var EachProxy = AltoObject.extend({

                init: function(content) {
                    this._super();
                    this._content = content;
                    content.addArrayObserver(this);

                    // in case someone is already observing some keys make sure they are
                    // added
                    forEach(watchedEvents(this), function(eventName) {
                        this.didAddListener(eventName);
                    }, this);
                },

                /**
                 You can directly access mapped properties by simply requesting them.
                 The `unknownProperty` handler will generate an EachArray of each item.

                 @method unknownProperty
                 @param keyName {String}
                 @param value {*}
                 */
                unknownProperty: function(keyName, value) {
                    var ret;
                    ret = new EachArray(this._content, keyName, this);
                    defineProperty(this, keyName, null, ret);
                    this.beginObservingContentKey(keyName);
                    return ret;
                },

                // ..........................................................
                // ARRAY CHANGES
                // Invokes whenever the content array itself changes.

                arrayWillChange: function(content, idx, removedCnt, addedCnt) {
                    var keys = this._keys;
                    var key, lim;

                    lim = removedCnt>0 ? idx+removedCnt : -1;
                    beginPropertyChanges(this);

                    for(key in keys) {
                        if (!keys.hasOwnProperty(key)) { continue; }

                        if (lim>0) { removeObserverForContentKey(content, key, this, idx, lim); }

                        propertyWillChange(this, key);
                    }

                    propertyWillChange(this._content, '@each');
                    endPropertyChanges(this);
                },

                arrayDidChange: function(content, idx, removedCnt, addedCnt) {
                    var keys = this._keys;
                    var lim;

                    lim = addedCnt>0 ? idx+addedCnt : -1;
                    changeProperties(function() {
                        for(var key in keys) {
                            if (!keys.hasOwnProperty(key)) { continue; }

                            if (lim>0) { addObserverForContentKey(content, key, this, idx, lim); }

                            propertyDidChange(this, key);
                        }

                        propertyDidChange(this._content, '@each');
                    }, this);
                },

                // ..........................................................
                // LISTEN FOR NEW OBSERVERS AND OTHER EVENT LISTENERS
                // Start monitoring keys based on who is listening...

                didAddListener: function(eventName) {
                    if (IS_OBSERVER.test(eventName)) {
                        this.beginObservingContentKey(eventName.slice(0, -7));
                    }
                },

                didRemoveListener: function(eventName) {
                    if (IS_OBSERVER.test(eventName)) {
                        this.stopObservingContentKey(eventName.slice(0, -7));
                    }
                },

                // ..........................................................
                // CONTENT KEY OBSERVING
                // Actual watch keys on the source content.

                beginObservingContentKey: function(keyName) {
                    var keys = this._keys;
                    if (!keys) keys = this._keys = {};
                    if (!keys[keyName]) {
                        keys[keyName] = 1;
                        var content = this._content;
                        var len = get(content, 'length');

                        addObserverForContentKey(content, keyName, this, 0, len);
                    } else {
                        keys[keyName]++;
                    }
                },

                stopObservingContentKey: function(keyName) {
                    var keys = this._keys;
                    if (keys && (keys[keyName]>0) && (--keys[keyName]<=0)) {
                        var content = this._content;
                        var len     = get(content, 'length');

                        removeObserverForContentKey(content, keyName, this, 0, len);
                    }
                },

                contentKeyWillChange: function(obj, keyName) {
                    propertyWillChange(this, keyName);
                },

                contentKeyDidChange: function(obj, keyName) {
                    propertyDidChange(this, keyName);
                }
            });

            __exports__.EachArray = EachArray;
            __exports__.EachProxy = EachProxy;
        });
    enifed("ember-runtime/system/lazy_load",
        ["ember-metal/core","ember-metal/array","ember-runtime/system/native_array","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            "use strict";
            /*globals CustomEvent */

            var Alto = __dependency1__["default"];
            // Alto.ENV.EMBER_LOAD_HOOKS
            var forEach = __dependency2__.forEach;
            // make sure Alto.A is setup.

            /**
             @module ember
             @submodule ember-runtime
             */

            var loadHooks = Alto.ENV.EMBER_LOAD_HOOKS || {};
            var loaded = {};

            /**
             Detects when a specific package of Alto (e.g. 'Alto.Handlebars')
             has fully loaded and is available for extension.

             The provided `callback` will be called with the `name` passed
             resolved from a string into the object:

             ``` javascript
             Alto.onLoad('Alto.Handlebars' function(hbars) {
        hbars.registerHelper(...);
      });
             ```

             @method onLoad
             @for Alto
             @param name {String} name of hook
             @param callback {Function} callback to be called
             */
            function onLoad(name, callback) {
                var object;

                loadHooks[name] = loadHooks[name] || Alto.A();
                loadHooks[name].pushObject(callback);

                if (object = loaded[name]) {
                    callback(object);
                }
            }

            __exports__.onLoad = onLoad;/**
             Called when an Alto.js package (e.g Alto.Handlebars) has finished
             loading. Triggers any callbacks registered for this event.

             @method runLoadHooks
             @for Alto
             @param name {String} name of hook
             @param object {Object} object to pass to callbacks
             */
            function runLoadHooks(name, object) {
                loaded[name] = object;

                if (typeof window === 'object' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === "function") {
                    var event = new CustomEvent(name, {detail: object, name: name});
                    window.dispatchEvent(event);
                }

                if (loadHooks[name]) {
                    forEach.call(loadHooks[name], function(callback) {
                        callback(object);
                    });
                }
            }

            __exports__.runLoadHooks = runLoadHooks;
        });
    enifed("ember-runtime/system/namespace",
        ["ember-metal/core","ember-metal/property_get","ember-metal/array","ember-metal/utils","ember-metal/mixin","ember-runtime/system/object","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */

            // Alto.lookup, Alto.BOOTED, Alto.deprecate, Alto.NAME_KEY, Alto.anyUnprocessedMixins
            var Alto = __dependency1__["default"];
            var get = __dependency2__.get;
            var indexOf = __dependency3__.indexOf;
            var GUID_KEY = __dependency4__.GUID_KEY;
            var guidFor = __dependency4__.guidFor;
            var Mixin = __dependency5__.Mixin;

            var AltoObject = __dependency6__["default"];

            /**
             A Namespace is an object usually used to contain other objects or methods
             such as an application or framework. Create a namespace anytime you want
             to define one of these new containers.

             # Example Usage

             ```javascript
             MyFramework = Alto.Namespace.create({
        VERSION: '1.0.0'
      });
             ```

             @class Namespace
             @namespace Alto
             @extends Alto.Object
             */
            var Namespace = AltoObject.extend({
                isNamespace: true,

                init: function() {
                    Namespace.NAMESPACES.push(this);
                    Namespace.PROCESSED = false;
                },

                toString: function() {
                    var name = get(this, 'name') || get(this, 'modulePrefix');
                    if (name) { return name; }

                    findNamespaces();
                    return this[NAME_KEY];
                },

                nameClasses: function() {
                    processNamespace([this.toString()], this, {});
                },

                destroy: function() {
                    var namespaces = Namespace.NAMESPACES;
                    var toString = this.toString();

                    if (toString) {
                        Alto.lookup[toString] = undefined;
                        delete Namespace.NAMESPACES_BY_ID[toString];
                    }
                    namespaces.splice(indexOf.call(namespaces, this), 1);
                    this._super();
                }
            });

            Namespace.reopenClass({
                NAMESPACES: [Alto],
                NAMESPACES_BY_ID: {},
                PROCESSED: false,
                processAll: processAllNamespaces,
                byName: function(name) {
                    if (!Alto.BOOTED) {
                        processAllNamespaces();
                    }

                    return NAMESPACES_BY_ID[name];
                }
            });

            var NAMESPACES_BY_ID = Namespace.NAMESPACES_BY_ID;

            var hasOwnProp = ({}).hasOwnProperty;

            function processNamespace(paths, root, seen) {
                var idx = paths.length;

                NAMESPACES_BY_ID[paths.join('.')] = root;

                // Loop over all of the keys in the namespace, looking for classes
                for(var key in root) {
                    if (!hasOwnProp.call(root, key)) { continue; }
                    var obj = root[key];

                    // If we are processing the `Alto` namespace, for example, the
                    // `paths` will start with `["Alto"]`. Every iteration through
                    // the loop will update the **second** element of this list with
                    // the key, so processing `Alto.View` will make the Array
                    // `['Alto', 'View']`.
                    paths[idx] = key;

                    // If we have found an unprocessed class
                    if (obj && obj.toString === classToString) {
                        // Replace the class' `toString` with the dot-separated path
                        // and set its `NAME_KEY`
                        obj.toString = makeToString(paths.join('.'));
                        obj[NAME_KEY] = paths.join('.');

                        // Support nested namespaces
                    } else if (obj && obj.isNamespace) {
                        // Skip aliased namespaces
                        if (seen[guidFor(obj)]) { continue; }
                        seen[guidFor(obj)] = true;

                        // Process the child namespace
                        processNamespace(paths, obj, seen);
                    }
                }

                paths.length = idx; // cut out last item
            }

            var STARTS_WITH_UPPERCASE = /^[A-Z]/;

            function tryIsNamespace(lookup, prop) {
                try {
                    var obj = lookup[prop];
                    return obj && obj.isNamespace && obj;
                } catch (e) {
                    // continue
                }
            }

            function findNamespaces() {
                var lookup = Alto.lookup;
                var obj;

                if (Namespace.PROCESSED) { return; }

                for (var prop in lookup) {
                    // Only process entities that start with uppercase A-Z
                    if (!STARTS_WITH_UPPERCASE.test(prop)) { continue; }

                    // Unfortunately, some versions of IE don't support window.hasOwnProperty
                    if (lookup.hasOwnProperty && !lookup.hasOwnProperty(prop)) { continue; }

                    // At times we are not allowed to access certain properties for security reasons.
                    // There are also times where even if we can access them, we are not allowed to access their properties.
                    obj = tryIsNamespace(lookup, prop);
                    if (obj) {
                        obj[NAME_KEY] = prop;
                    }
                }
            }

            var NAME_KEY = Alto.NAME_KEY = GUID_KEY + '_name';

            function superClassString(mixin) {
                var superclass = mixin.superclass;
                if (superclass) {
                    if (superclass[NAME_KEY]) { return superclass[NAME_KEY]; }
                    else { return superClassString(superclass); }
                } else {
                    return;
                }
            }

            function classToString() {
                if (!Alto.BOOTED && !this[NAME_KEY]) {
                    processAllNamespaces();
                }

                var ret;

                if (this[NAME_KEY]) {
                    ret = this[NAME_KEY];
                } else if (this._toString) {
                    ret = this._toString;
                } else {
                    var str = superClassString(this);
                    if (str) {
                        ret = "(subclass of " + str + ")";
                    } else {
                        ret = "(unknown mixin)";
                    }
                    this.toString = makeToString(ret);
                }

                return ret;
            }

            function processAllNamespaces() {
                var unprocessedNamespaces = !Namespace.PROCESSED;
                var unprocessedMixins = Alto.anyUnprocessedMixins;

                if (unprocessedNamespaces) {
                    findNamespaces();
                    Namespace.PROCESSED = true;
                }

                if (unprocessedNamespaces || unprocessedMixins) {
                    var namespaces = Namespace.NAMESPACES;
                    var namespace;

                    for (var i=0, l=namespaces.length; i<l; i++) {
                        namespace = namespaces[i];
                        processNamespace([namespace.toString()], namespace, {});
                    }

                    Alto.anyUnprocessedMixins = false;
                }
            }

            function makeToString(ret) {
                return function() { return ret; };
            }

            Mixin.prototype.toString = classToString; // ES6TODO: altering imported objects. SBB.

            __exports__["default"] = Namespace;
        });
    enifed("ember-runtime/system/native_array",
        ["ember-metal/core","ember-metal/property_get","ember-metal/enumerable_utils","ember-metal/mixin","ember-metal/array","ember-runtime/mixins/array","ember-runtime/mixins/mutable_array","ember-runtime/mixins/observable","ember-runtime/mixins/copyable","ember-runtime/mixins/freezable","ember-runtime/copy","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __dependency11__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */

            var Alto = __dependency1__["default"];
            // Alto.EXTEND_PROTOTYPES

            var get = __dependency2__.get;
            var replace = __dependency3__._replace;
            var forEach = __dependency3__.forEach;
            var Mixin = __dependency4__.Mixin;
            var indexOf = __dependency5__.indexOf;
            var lastIndexOf = __dependency5__.lastIndexOf;
            var AltoArray = __dependency6__["default"];
            var MutableArray = __dependency7__["default"];
            var Observable = __dependency8__["default"];
            var Copyable = __dependency9__["default"];
            var FROZEN_ERROR = __dependency10__.FROZEN_ERROR;
            var copy = __dependency11__["default"];

            // Add Alto.Array to Array.prototype. Remove methods with native
            // implementations and supply some more optimized versions of generic methods
            // because they are so common.

            /**
             The NativeArray mixin contains the properties needed to to make the native
             Array support Alto.MutableArray and all of its dependent APIs. Unless you
             have `Alto.EXTEND_PROTOTYPES` or `Alto.EXTEND_PROTOTYPES.Array` set to
             false, this will be applied automatically. Otherwise you can apply the mixin
             at anytime by calling `Alto.NativeArray.activate`.

             @class NativeArray
             @namespace Alto
             @uses Alto.MutableArray
             @uses Alto.Observable
             @uses Alto.Copyable
             */
            var NativeArray = Mixin.create(MutableArray, Observable, Copyable, {

                // because length is a built-in property we need to know to just get the
                // original property.
                get: function(key) {
                    if (key==='length') return this.length;
                    else if ('number' === typeof key) return this[key];
                    else return this._super(key);
                },

                objectAt: function(idx) {
                    return this[idx];
                },

                // primitive for array support.
                replace: function(idx, amt, objects) {

                    if (this.isFrozen) throw FROZEN_ERROR;

                    // if we replaced exactly the same number of items, then pass only the
                    // replaced range. Otherwise, pass the full remaining array length
                    // since everything has shifted
                    var len = objects ? get(objects, 'length') : 0;
                    this.arrayContentWillChange(idx, amt, len);

                    if (len === 0) {
                        this.splice(idx, amt);
                    } else {
                        replace(this, idx, amt, objects);
                    }

                    this.arrayContentDidChange(idx, amt, len);
                    return this;
                },

                // If you ask for an unknown property, then try to collect the value
                // from member items.
                unknownProperty: function(key, value) {
                    var ret;// = this.reducedProperty(key, value) ;
                    if (value !== undefined && ret === undefined) {
                        ret = this[key] = value;
                    }
                    return ret;
                },

                indexOf: indexOf,

                lastIndexOf: lastIndexOf,

                copy: function(deep) {
                    if (deep) {
                        return this.map(function(item) { return copy(item, true); });
                    }

                    return this.slice();
                }
            });

            // Remove any methods implemented natively so we don't override them
            var ignore = ['length'];
            forEach(NativeArray.keys(), function(methodName) {
                if (Array.prototype[methodName]) ignore.push(methodName);
            });

            if (ignore.length > 0) {
                NativeArray = NativeArray.without.apply(NativeArray, ignore);
            }

            /**
             Creates an `Alto.NativeArray` from an Array like object.
             Does not modify the original object. Alto.A is not needed if
             `Alto.EXTEND_PROTOTYPES` is `true` (the default value). However,
             it is recommended that you use Alto.A when creating addons for
             ember or when you can not guarantee that `Alto.EXTEND_PROTOTYPES`
             will be `true`.

             Example

             ```js
             var Pagination = Alto.CollectionView.extend({
        tagName: 'ul',
        classNames: ['pagination'],

        init: function() {
          this._super();
          if (!this.get('content')) {
            this.set('content', Alto.A());
          }
        }
      });
             ```

             @method A
             @for Alto
             @return {Alto.NativeArray}
             */
            var A = function(arr) {
                if (arr === undefined) { arr = []; }
                return AltoArray.detect(arr) ? arr : NativeArray.apply(arr);
            };

            /**
             Activates the mixin on the Array.prototype if not already applied. Calling
             this method more than once is safe. This will be called when ember is loaded
             unless you have `Alto.EXTEND_PROTOTYPES` or `Alto.EXTEND_PROTOTYPES.Array`
             set to `false`.

             Example

             ```js
             if (Alto.EXTEND_PROTOTYPES === true || Alto.EXTEND_PROTOTYPES.Array) {
        Alto.NativeArray.activate();
      }
             ```

             @method activate
             @for Alto.NativeArray
             @static
             @return {void}
             */
            NativeArray.activate = function() {
                NativeArray.apply(Array.prototype);

                A = function(arr) { return arr || []; };
            };

            if (Alto.EXTEND_PROTOTYPES === true || Alto.EXTEND_PROTOTYPES.Array) {
                NativeArray.activate();
            }

            Alto.A = A; // ES6TODO: Setting A onto the object returned by ember-metal/core to avoid circles
            __exports__.A = A;
            __exports__.NativeArray = NativeArray;
            __exports__["default"] = NativeArray;
        });
    enifed("ember-runtime/system/object",
        ["ember-metal/core","ember-runtime/system/core_object","ember-runtime/mixins/observable","ember-runtime/inject","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */

            var Alto = __dependency1__["default"];
            // Alto.assert
            var CoreObject = __dependency2__["default"];
            var Observable = __dependency3__["default"];
            var validatePropertyInjections = __dependency4__.validatePropertyInjections;

            /**
             `Alto.Object` is the main base class for all Alto objects. It is a subclass
             of `Alto.CoreObject` with the `Alto.Observable` mixin applied. For details,
             see the documentation for each of these.

             @class Object
             @namespace Alto
             @extends Alto.CoreObject
             @uses Alto.Observable
             */
            var AltoObject = CoreObject.extend(Observable);
            AltoObject.toString = function() {
                return "Alto.Object";
            };

            function injectedPropertyAssertion(props) {
                // Injection validations are a debugging aid only, so ensure that they are
                // not performed in production builds by invoking from an assertion
                Alto.assert("Injected properties are invalid", validatePropertyInjections(this.constructor, props));
            }


            __exports__["default"] = AltoObject;
        });
    enifed("ember-runtime/system/object_proxy",
        ["ember-runtime/system/object","ember-runtime/mixins/-proxy","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var AltoObject = __dependency1__["default"];
            var _ProxyMixin = __dependency2__["default"];

            /**
             `Alto.ObjectProxy` forwards all properties not defined by the proxy itself
             to a proxied `content` object.

             ```javascript
             object = Alto.Object.create({
        name: 'Foo'
      });

             proxy = Alto.ObjectProxy.create({
        content: object
      });

             // Access and change existing properties
             proxy.get('name')          // 'Foo'
             proxy.set('name', 'Bar');
             object.get('name')         // 'Bar'

             // Create new 'description' property on `object`
             proxy.set('description', 'Foo is a whizboo baz');
             object.get('description')  // 'Foo is a whizboo baz'
             ```

             While `content` is unset, setting a property to be delegated will throw an
             Error.

             ```javascript
             proxy = Alto.ObjectProxy.create({
        content: null,
        flag: null
      });
             proxy.set('flag', true);
             proxy.get('flag');         // true
             proxy.get('foo');          // undefined
             proxy.set('foo', 'data');  // throws Error
             ```

             Delegated properties can be bound to and will change when content is updated.

             Computed properties on the proxy itself can depend on delegated properties.

             ```javascript
             ProxyWithComputedProperty = Alto.ObjectProxy.extend({
        fullName: function () {
          var firstName = this.get('firstName'),
              lastName = this.get('lastName');
          if (firstName && lastName) {
            return firstName + ' ' + lastName;
          }
          return firstName || lastName;
        }.property('firstName', 'lastName')
      });

             proxy = ProxyWithComputedProperty.create();

             proxy.get('fullName');  // undefined
             proxy.set('content', {
        firstName: 'Tom', lastName: 'Dale'
      }); // triggers property change for fullName on proxy

             proxy.get('fullName');  // 'Tom Dale'
             ```

             @class ObjectProxy
             @namespace Alto
             @extends Alto.Object
             @extends Alto._ProxyMixin
             */

            __exports__["default"] = AltoObject.extend(_ProxyMixin);
        });
    enifed("ember-runtime/system/service",
        ["ember-runtime/system/object","ember-runtime/inject","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var Object = __dependency1__["default"];
            var createInjectionHelper = __dependency2__.createInjectionHelper;

            var Service;


            __exports__["default"] = Service;
        });
    enifed("ember-runtime/system/set",
        ["ember-metal/core","ember-metal/property_get","ember-metal/property_set","ember-metal/utils","ember-metal/is_none","ember-runtime/system/string","ember-runtime/system/core_object","ember-runtime/mixins/mutable_enumerable","ember-runtime/mixins/enumerable","ember-runtime/mixins/copyable","ember-runtime/mixins/freezable","ember-metal/error","ember-metal/property_events","ember-metal/mixin","ember-metal/computed","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __dependency11__, __dependency12__, __dependency13__, __dependency14__, __dependency15__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */
            var Alto = __dependency1__["default"];
            // Alto.isNone, Alto.A

            var get = __dependency2__.get;
            var set = __dependency3__.set;
            var guidFor = __dependency4__.guidFor;
            var isNone = __dependency5__["default"];
            var fmt = __dependency6__.fmt;
            var CoreObject = __dependency7__["default"];
            var MutableEnumerable = __dependency8__["default"];
            var Enumerable = __dependency9__["default"];
            var Copyable = __dependency10__["default"];
            var Freezable = __dependency11__.Freezable;
            var FROZEN_ERROR = __dependency11__.FROZEN_ERROR;
            var AltoError = __dependency12__["default"];
            var propertyWillChange = __dependency13__.propertyWillChange;
            var propertyDidChange = __dependency13__.propertyDidChange;
            var aliasMethod = __dependency14__.aliasMethod;
            var computed = __dependency15__.computed;

            /**
             An unordered collection of objects.

             A Set works a bit like an array except that its items are not ordered. You
             can create a set to efficiently test for membership for an object. You can
             also iterate through a set just like an array, even accessing objects by
             index, however there is no guarantee as to their order.

             All Sets are observable via the Enumerable Observer API - which works
             on any enumerable object including both Sets and Arrays.

             ## Creating a Set

             You can create a set like you would most objects using
             `new Alto.Set()`. Most new sets you create will be empty, but you can
             also initialize the set with some content by passing an array or other
             enumerable of objects to the constructor.

             Finally, you can pass in an existing set and the set will be copied. You
             can also create a copy of a set by calling `Alto.Set#copy()`.

             ```javascript
             // creates a new empty set
             var foundNames = new Alto.Set();

             // creates a set with four names in it.
             var names = new Alto.Set(["Charles", "Tom", "Juan", "Alex"]); // :P

             // creates a copy of the names set.
             var namesCopy = new Alto.Set(names);

             // same as above.
             var anotherNamesCopy = names.copy();
             ```

             ## Adding/Removing Objects

             You generally add or remove objects from a set using `add()` or
             `remove()`. You can add any type of object including primitives such as
             numbers, strings, and booleans.

             Unlike arrays, objects can only exist one time in a set. If you call `add()`
             on a set with the same object multiple times, the object will only be added
             once. Likewise, calling `remove()` with the same object multiple times will
             remove the object the first time and have no effect on future calls until
             you add the object to the set again.

             NOTE: You cannot add/remove `null` or `undefined` to a set. Any attempt to do
             so will be ignored.

             In addition to add/remove you can also call `push()`/`pop()`. Push behaves
             just like `add()` but `pop()`, unlike `remove()` will pick an arbitrary
             object, remove it and return it. This is a good way to use a set as a job
             queue when you don't care which order the jobs are executed in.

             ## Testing for an Object

             To test for an object's presence in a set you simply call
             `Alto.Set#contains()`.

             ## Observing changes

             When using `Alto.Set`, you can observe the `"[]"` property to be
             alerted whenever the content changes. You can also add an enumerable
             observer to the set to be notified of specific objects that are added and
             removed from the set. See [Alto.Enumerable](/api/classes/Alto.Enumerable.html)
             for more information on enumerables.

             This is often unhelpful. If you are filtering sets of objects, for instance,
             it is very inefficient to re-filter all of the items each time the set
             changes. It would be better if you could just adjust the filtered set based
             on what was changed on the original set. The same issue applies to merging
             sets, as well.

             ## Other Methods

             `Alto.Set` primary implements other mixin APIs. For a complete reference
             on the methods you will use with `Alto.Set`, please consult these mixins.
             The most useful ones will be `Alto.Enumerable` and
             `Alto.MutableEnumerable` which implement most of the common iterator
             methods you are used to on Array.

             Note that you can also use the `Alto.Copyable` and `Alto.Freezable`
             APIs on `Alto.Set` as well. Once a set is frozen it can no longer be
             modified. The benefit of this is that when you call `frozenCopy()` on it,
             Alto will avoid making copies of the set. This allows you to write
             code that can know with certainty when the underlying set data will or
             will not be modified.

             @class Set
             @namespace Alto
             @extends Alto.CoreObject
             @uses Alto.MutableEnumerable
             @uses Alto.Copyable
             @uses Alto.Freezable
             @since Alto 0.9
             @deprecated
             */
            __exports__["default"] = CoreObject.extend(MutableEnumerable, Copyable, Freezable, {

                // ..........................................................
                // IMPLEMENT ENUMERABLE APIS
                //

                /**
                 This property will change as the number of objects in the set changes.

                 @property length
                 @type number
                 @default 0
                 */
                length: 0,

                /**
                 Clears the set. This is useful if you want to reuse an existing set
                 without having to recreate it.

                 ```javascript
                 var colors = new Alto.Set(["red", "green", "blue"]);
                 colors.length;  // 3
                 colors.clear();
                 colors.length;  // 0
                 ```

                 @method clear
                 @return {Alto.Set} An empty Set
                 */
                clear: function() {
                    if (this.isFrozen) { throw new AltoError(FROZEN_ERROR); }

                    var len = get(this, 'length');
                    if (len === 0) { return this; }

                    var guid;

                    this.enumerableContentWillChange(len, 0);
                    propertyWillChange(this, 'firstObject');
                    propertyWillChange(this, 'lastObject');

                    for (var i=0; i < len; i++) {
                        guid = guidFor(this[i]);
                        delete this[guid];
                        delete this[i];
                    }

                    set(this, 'length', 0);

                    propertyDidChange(this, 'firstObject');
                    propertyDidChange(this, 'lastObject');
                    this.enumerableContentDidChange(len, 0);

                    return this;
                },

                /**
                 Returns true if the passed object is also an enumerable that contains the
                 same objects as the receiver.

                 ```javascript
                 var colors = ["red", "green", "blue"],
                 same_colors = new Alto.Set(colors);

                 same_colors.isEqual(colors);               // true
                 same_colors.isEqual(["purple", "brown"]);  // false
                 ```

                 @method isEqual
                 @param {Alto.Set} obj the other object.
                 @return {Boolean}
                 */
                isEqual: function(obj) {
                    // fail fast
                    if (!Enumerable.detect(obj)) return false;

                    var loc = get(this, 'length');
                    if (get(obj, 'length') !== loc) return false;

                    while(--loc >= 0) {
                        if (!obj.contains(this[loc])) return false;
                    }

                    return true;
                },

                /**
                 Adds an object to the set. Only non-`null` objects can be added to a set
                 and those can only be added once. If the object is already in the set or
                 the passed value is null this method will have no effect.

                 This is an alias for `Alto.MutableEnumerable.addObject()`.

                 ```javascript
                 var colors = new Alto.Set();
                 colors.add("blue");     // ["blue"]
                 colors.add("blue");     // ["blue"]
                 colors.add("red");      // ["blue", "red"]
                 colors.add(null);       // ["blue", "red"]
                 colors.add(undefined);  // ["blue", "red"]
                 ```

                 @method add
                 @param {Object} obj The object to add.
                 @return {Alto.Set} The set itself.
                 */
                add: aliasMethod('addObject'),

                /**
                 Removes the object from the set if it is found. If you pass a `null` value
                 or an object that is already not in the set, this method will have no
                 effect. This is an alias for `Alto.MutableEnumerable.removeObject()`.

                 ```javascript
                 var colors = new Alto.Set(["red", "green", "blue"]);
                 colors.remove("red");     // ["blue", "green"]
                 colors.remove("purple");  // ["blue", "green"]
                 colors.remove(null);      // ["blue", "green"]
                 ```

                 @method remove
                 @param {Object} obj The object to remove
                 @return {Alto.Set} The set itself.
                 */
                remove: aliasMethod('removeObject'),

                /**
                 Removes the last element from the set and returns it, or `null` if it's empty.

                 ```javascript
                 var colors = new Alto.Set(["green", "blue"]);
                 colors.pop();  // "blue"
                 colors.pop();  // "green"
                 colors.pop();  // null
                 ```

                 @method pop
                 @return {Object} The removed object from the set or null.
                 */
                pop: function() {
                    if (get(this, 'isFrozen')) throw new AltoError(FROZEN_ERROR);
                    var obj = this.length > 0 ? this[this.length-1] : null;
                    this.remove(obj);
                    return obj;
                },

                /**
                 Inserts the given object on to the end of the set. It returns
                 the set itself.

                 This is an alias for `Alto.MutableEnumerable.addObject()`.

                 ```javascript
                 var colors = new Alto.Set();
                 colors.push("red");   // ["red"]
                 colors.push("green"); // ["red", "green"]
                 colors.push("blue");  // ["red", "green", "blue"]
                 ```

                 @method push
                 @return {Alto.Set} The set itself.
                 */
                push: aliasMethod('addObject'),

                /**
                 Removes the last element from the set and returns it, or `null` if it's empty.

                 This is an alias for `Alto.Set.pop()`.

                 ```javascript
                 var colors = new Alto.Set(["green", "blue"]);
                 colors.shift();  // "blue"
                 colors.shift();  // "green"
                 colors.shift();  // null
                 ```

                 @method shift
                 @return {Object} The removed object from the set or null.
                 */
                shift: aliasMethod('pop'),

                /**
                 Inserts the given object on to the end of the set. It returns
                 the set itself.

                 This is an alias of `Alto.Set.push()`

                 ```javascript
                 var colors = new Alto.Set();
                 colors.unshift("red");    // ["red"]
                 colors.unshift("green");  // ["red", "green"]
                 colors.unshift("blue");   // ["red", "green", "blue"]
                 ```

                 @method unshift
                 @return {Alto.Set} The set itself.
                 */
                unshift: aliasMethod('push'),

                /**
                 Adds each object in the passed enumerable to the set.

                 This is an alias of `Alto.MutableEnumerable.addObjects()`

                 ```javascript
                 var colors = new Alto.Set();
                 colors.addEach(["red", "green", "blue"]);  // ["red", "green", "blue"]
                 ```

                 @method addEach
                 @param {Alto.Enumerable} objects the objects to add.
                 @return {Alto.Set} The set itself.
                 */
                addEach: aliasMethod('addObjects'),

                /**
                 Removes each object in the passed enumerable to the set.

                 This is an alias of `Alto.MutableEnumerable.removeObjects()`

                 ```javascript
                 var colors = new Alto.Set(["red", "green", "blue"]);
                 colors.removeEach(["red", "blue"]);  //  ["green"]
                 ```

                 @method removeEach
                 @param {Alto.Enumerable} objects the objects to remove.
                 @return {Alto.Set} The set itself.
                 */
                removeEach: aliasMethod('removeObjects'),

                // ..........................................................
                // PRIVATE ENUMERABLE SUPPORT
                //

                init: function(items) {
                    Alto.deprecate('Alto.Set is deprecated and will be removed in a future release.');
                    this._super();
                    if (items) this.addObjects(items);
                },

                // implement Alto.Enumerable
                nextObject: function(idx) {
                    return this[idx];
                },

                // more optimized version
                firstObject: computed(function() {
                    return this.length > 0 ? this[0] : undefined;
                }),

                // more optimized version
                lastObject: computed(function() {
                    return this.length > 0 ? this[this.length-1] : undefined;
                }),

                // implements Alto.MutableEnumerable
                addObject: function(obj) {
                    if (get(this, 'isFrozen')) throw new AltoError(FROZEN_ERROR);
                    if (isNone(obj)) return this; // nothing to do

                    var guid = guidFor(obj);
                    var idx  = this[guid];
                    var len  = get(this, 'length');
                    var added;

                    if (idx>=0 && idx<len && (this[idx] === obj)) return this; // added

                    added = [obj];

                    this.enumerableContentWillChange(null, added);
                    propertyWillChange(this, 'lastObject');

                    len = get(this, 'length');
                    this[guid] = len;
                    this[len] = obj;
                    set(this, 'length', len+1);

                    propertyDidChange(this, 'lastObject');
                    this.enumerableContentDidChange(null, added);

                    return this;
                },

                // implements Alto.MutableEnumerable
                removeObject: function(obj) {
                    if (get(this, 'isFrozen')) throw new AltoError(FROZEN_ERROR);
                    if (isNone(obj)) return this; // nothing to do

                    var guid = guidFor(obj);
                    var idx  = this[guid];
                    var len = get(this, 'length');
                    var isFirst = idx === 0;
                    var isLast = idx === len-1;
                    var last, removed;


                    if (idx>=0 && idx<len && (this[idx] === obj)) {
                        removed = [obj];

                        this.enumerableContentWillChange(removed, null);
                        if (isFirst) { propertyWillChange(this, 'firstObject'); }
                        if (isLast)  { propertyWillChange(this, 'lastObject'); }

                        // swap items - basically move the item to the end so it can be removed
                        if (idx < len-1) {
                            last = this[len-1];
                            this[idx] = last;
                            this[guidFor(last)] = idx;
                        }

                        delete this[guid];
                        delete this[len-1];
                        set(this, 'length', len-1);

                        if (isFirst) { propertyDidChange(this, 'firstObject'); }
                        if (isLast)  { propertyDidChange(this, 'lastObject'); }
                        this.enumerableContentDidChange(removed, null);
                    }

                    return this;
                },

                // optimized version
                contains: function(obj) {
                    return this[guidFor(obj)]>=0;
                },

                copy: function() {
                    var C = this.constructor, ret = new C(), loc = get(this, 'length');
                    set(ret, 'length', loc);
                    while(--loc>=0) {
                        ret[loc] = this[loc];
                        ret[guidFor(this[loc])] = loc;
                    }
                    return ret;
                },

                toString: function() {
                    var len = this.length, idx, array = [];
                    for(idx = 0; idx < len; idx++) {
                        array[idx] = this[idx];
                    }
                    return fmt("Alto.Set<%@>", [array.join(',')]);
                }
            });
        });
    enifed("ember-runtime/system/string",
        ["ember-metal/core","ember-metal/utils","ember-metal/cache","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            "use strict";
            /**
             @module ember
             @submodule ember-runtime
             */
            var Alto = __dependency1__["default"];
            // Alto.STRINGS, Alto.FEATURES
            var isArray = __dependency2__.isArray;
            var emberInspect = __dependency2__.inspect;

            var Cache = __dependency3__["default"];

            var STRING_DASHERIZE_REGEXP = (/[ _]/g);

            var STRING_DASHERIZE_CACHE = new Cache(1000, function(key) {
                return decamelize(key).replace(STRING_DASHERIZE_REGEXP, '-');
            });
            var CAMELIZE_CACHE = new Cache(1000, function(key) {
                return key.replace(STRING_CAMELIZE_REGEXP, function(match, separator, chr) {
                    return chr ? chr.toUpperCase() : '';
                }).replace(/^([A-Z])/, function(match, separator, chr) {
                    return match.toLowerCase();
                });
            });

            var CLASSIFY_CACHE = new Cache(1000, function(str) {
                var parts = str.split(".");
                var out = [];

                for (var i=0, l=parts.length; i<l; i++) {
                    var camelized = camelize(parts[i]);
                    out.push(camelized.charAt(0).toUpperCase() + camelized.substr(1));
                }

                return out.join(".");
            });

            var UNDERSCORE_CACHE = new Cache(1000, function(str) {
                return str.replace(STRING_UNDERSCORE_REGEXP_1, '$1_$2').
                    replace(STRING_UNDERSCORE_REGEXP_2, '_').toLowerCase();
            });

            var CAPITALIZE_CACHE = new Cache(1000, function(str) {
                return str.charAt(0).toUpperCase() + str.substr(1);
            });

            var DECAMELIZE_CACHE = new Cache(1000, function(str) {
                return str.replace(STRING_DECAMELIZE_REGEXP, '$1_$2').toLowerCase();
            });

            var STRING_DECAMELIZE_REGEXP = (/([a-z\d])([A-Z])/g);
            var STRING_CAMELIZE_REGEXP = (/(\-|_|\.|\s)+(.)?/g);
            var STRING_UNDERSCORE_REGEXP_1 = (/([a-z\d])([A-Z]+)/g);
            var STRING_UNDERSCORE_REGEXP_2 = (/\-|\s+/g);

            function fmt(str, formats) {
                var cachedFormats = formats;

                if (!isArray(cachedFormats) || arguments.length > 2) {
                    cachedFormats = new Array(arguments.length - 1);

                    for (var i = 1, l = arguments.length; i < l; i++) {
                        cachedFormats[i - 1] = arguments[i];
                    }
                }

                // first, replace any ORDERED replacements.
                var idx  = 0; // the current index for non-numerical replacements
                return str.replace(/%@([0-9]+)?/g, function(s, argIndex) {
                    argIndex = (argIndex) ? parseInt(argIndex, 10) - 1 : idx++;
                    s = cachedFormats[argIndex];
                    return (s === null) ? '(null)' : (s === undefined) ? '' : emberInspect(s);
                });
            }

            function loc(str, formats) {
                if (!isArray(formats) || arguments.length > 2) {
                    formats = Array.prototype.slice.call(arguments, 1);
                }

                str = Alto.STRINGS[str] || str;
                return fmt(str, formats);
            }

            function w(str) {
                return str.split(/\s+/);
            }

            function decamelize(str) {
                return DECAMELIZE_CACHE.get(str);
            }

            function dasherize(str) {
                return STRING_DASHERIZE_CACHE.get(str);
            }

            function camelize(str) {
                return CAMELIZE_CACHE.get(str);
            }

            function classify(str) {
                return CLASSIFY_CACHE.get(str);
            }

            function underscore(str) {
                return UNDERSCORE_CACHE.get(str);
            }

            function capitalize(str) {
                return CAPITALIZE_CACHE.get(str);
            }

            /**
             Defines the hash of localized strings for the current language. Used by
             the `Alto.String.loc()` helper. To localize, add string values to this
             hash.

             @property STRINGS
             @for Alto
             @type Hash
             */
            Alto.STRINGS = {};

            /**
             Defines string helper methods including string formatting and localization.
             Unless `Alto.EXTEND_PROTOTYPES.String` is `false` these methods will also be
             added to the `String.prototype` as well.

             @class String
             @namespace Alto
             @static
             */
            __exports__["default"] = {
                /**
                 Apply formatting options to the string. This will look for occurrences
                 of "%@" in your string and substitute them with the arguments you pass into
                 this method. If you want to control the specific order of replacement,
                 you can add a number after the key as well to indicate which argument
                 you want to insert.

                 Ordered insertions are most useful when building loc strings where values
                 you need to insert may appear in different orders.

                 ```javascript
                 "Hello %@ %@".fmt('John', 'Doe');     // "Hello John Doe"
                 "Hello %@2, %@1".fmt('John', 'Doe');  // "Hello Doe, John"
                 ```

                 @method fmt
                 @param {String} str The string to format
                 @param {Array} formats An array of parameters to interpolate into string.
                 @return {String} formatted string
                 */
                fmt: fmt,

                /**
                 Formats the passed string, but first looks up the string in the localized
                 strings hash. This is a convenient way to localize text. See
                 `Alto.String.fmt()` for more information on formatting.

                 Note that it is traditional but not required to prefix localized string
                 keys with an underscore or other character so you can easily identify
                 localized strings.

                 ```javascript
                 Alto.STRINGS = {
          '_Hello World': 'Bonjour le monde',
          '_Hello %@ %@': 'Bonjour %@ %@'
                 };

                 Alto.String.loc("_Hello World");  // 'Bonjour le monde';
                 Alto.String.loc("_Hello %@ %@", ["John", "Smith"]);  // "Bonjour John Smith";
                 ```

                 @method loc
                 @param {String} str The string to format
                 @param {Array} formats Optional array of parameters to interpolate into string.
                 @return {String} formatted string
                 */
                loc: loc,

                /**
                 Splits a string into separate units separated by spaces, eliminating any
                 empty strings in the process. This is a convenience method for split that
                 is mostly useful when applied to the `String.prototype`.

                 ```javascript
                 Alto.String.w("alpha beta gamma").forEach(function(key) {
          console.log(key);
        });

                 // > alpha
                 // > beta
                 // > gamma
                 ```

                 @method w
                 @param {String} str The string to split
                 @return {Array} array containing the split strings
                 */
                w: w,

                /**
                 Converts a camelized string into all lower case separated by underscores.

                 ```javascript
                 'innerHTML'.decamelize();           // 'inner_html'
                 'action_name'.decamelize();        // 'action_name'
                 'css-class-name'.decamelize();     // 'css-class-name'
                 'my favorite items'.decamelize();  // 'my favorite items'
                 ```

                 @method decamelize
                 @param {String} str The string to decamelize.
                 @return {String} the decamelized string.
                 */
                decamelize: decamelize,

                /**
                 Replaces underscores, spaces, or camelCase with dashes.

                 ```javascript
                 'innerHTML'.dasherize();          // 'inner-html'
                 'action_name'.dasherize();        // 'action-name'
                 'css-class-name'.dasherize();     // 'css-class-name'
                 'my favorite items'.dasherize();  // 'my-favorite-items'
                 ```

                 @method dasherize
                 @param {String} str The string to dasherize.
                 @return {String} the dasherized string.
                 */
                dasherize: dasherize,

                /**
                 Returns the lowerCamelCase form of a string.

                 ```javascript
                 'innerHTML'.camelize();          // 'innerHTML'
                 'action_name'.camelize();        // 'actionName'
                 'css-class-name'.camelize();     // 'cssClassName'
                 'my favorite items'.camelize();  // 'myFavoriteItems'
                 'My Favorite Items'.camelize();  // 'myFavoriteItems'
                 ```

                 @method camelize
                 @param {String} str The string to camelize.
                 @return {String} the camelized string.
                 */
                camelize: camelize,

                /**
                 Returns the UpperCamelCase form of a string.

                 ```javascript
                 'innerHTML'.classify();          // 'InnerHTML'
                 'action_name'.classify();        // 'ActionName'
                 'css-class-name'.classify();     // 'CssClassName'
                 'my favorite items'.classify();  // 'MyFavoriteItems'
                 ```

                 @method classify
                 @param {String} str the string to classify
                 @return {String} the classified string
                 */
                classify: classify,

                /**
                 More general than decamelize. Returns the lower\_case\_and\_underscored
                 form of a string.

                 ```javascript
                 'innerHTML'.underscore();          // 'inner_html'
                 'action_name'.underscore();        // 'action_name'
                 'css-class-name'.underscore();     // 'css_class_name'
                 'my favorite items'.underscore();  // 'my_favorite_items'
                 ```

                 @method underscore
                 @param {String} str The string to underscore.
                 @return {String} the underscored string.
                 */
                underscore: underscore,

                /**
                 Returns the Capitalized form of a string

                 ```javascript
                 'innerHTML'.capitalize()         // 'InnerHTML'
                 'action_name'.capitalize()       // 'Action_name'
                 'css-class-name'.capitalize()    // 'Css-class-name'
                 'my favorite items'.capitalize() // 'My favorite items'
                 ```

                 @method capitalize
                 @param {String} str The string to capitalize.
                 @return {String} The capitalized string.
                 */
                capitalize: capitalize
            };

            __exports__.fmt = fmt;
            __exports__.loc = loc;
            __exports__.w = w;
            __exports__.decamelize = decamelize;
            __exports__.dasherize = dasherize;
            __exports__.camelize = camelize;
            __exports__.classify = classify;
            __exports__.underscore = underscore;
            __exports__.capitalize = capitalize;
        });
    enifed("ember-runtime/system/subarray",
        ["ember-metal/error","ember-metal/enumerable_utils","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var AltoError = __dependency1__["default"];
            var EnumerableUtils = __dependency2__["default"];

            var RETAIN = 'r';
            var FILTER = 'f';

            function Operation(type, count) {
                this.type = type;
                this.count = count;
            }

            __exports__["default"] = SubArray;

            /**
             An `Alto.SubArray` tracks an array in a way similar to, but more specialized
             than, `Alto.TrackedArray`.  It is useful for keeping track of the indexes of
             items within a filtered array.

             @class SubArray
             @namespace Alto
             */
            function SubArray (length) {
                if (arguments.length < 1) { length = 0; }

                if (length > 0) {
                    this._operations = [new Operation(RETAIN, length)];
                } else {
                    this._operations = [];
                }
            }


            SubArray.prototype = {
                /**
                 Track that an item was added to the tracked array.

                 @method addItem

                 @param {Number} index The index of the item in the tracked array.
                 @param {Boolean} match `true` iff the item is included in the subarray.

                 @return {number} The index of the item in the subarray.
                 */
                addItem: function(index, match) {
                    var returnValue = -1;
                    var itemType = match ? RETAIN : FILTER;
                    var self = this;

                    this._findOperation(index, function(operation, operationIndex, rangeStart, rangeEnd, seenInSubArray) {
                        var newOperation, splitOperation;

                        if (itemType === operation.type) {
                            ++operation.count;
                        } else if (index === rangeStart) {
                            // insert to the left of `operation`
                            self._operations.splice(operationIndex, 0, new Operation(itemType, 1));
                        } else {
                            newOperation = new Operation(itemType, 1);
                            splitOperation = new Operation(operation.type, rangeEnd - index + 1);
                            operation.count = index - rangeStart;

                            self._operations.splice(operationIndex + 1, 0, newOperation, splitOperation);
                        }

                        if (match) {
                            if (operation.type === RETAIN) {
                                returnValue = seenInSubArray + (index - rangeStart);
                            } else {
                                returnValue = seenInSubArray;
                            }
                        }

                        self._composeAt(operationIndex);
                    }, function(seenInSubArray) {
                        self._operations.push(new Operation(itemType, 1));

                        if (match) {
                            returnValue = seenInSubArray;
                        }

                        self._composeAt(self._operations.length-1);
                    });

                    return returnValue;
                },

                /**
                 Track that an item was removed from the tracked array.

                 @method removeItem

                 @param {Number} index The index of the item in the tracked array.

                 @return {number} The index of the item in the subarray, or `-1` if the item
                 was not in the subarray.
                 */
                removeItem: function(index) {
                    var returnValue = -1;
                    var self = this;

                    this._findOperation(index, function (operation, operationIndex, rangeStart, rangeEnd, seenInSubArray) {
                        if (operation.type === RETAIN) {
                            returnValue = seenInSubArray + (index - rangeStart);
                        }

                        if (operation.count > 1) {
                            --operation.count;
                        } else {
                            self._operations.splice(operationIndex, 1);
                            self._composeAt(operationIndex);
                        }
                    }, function() {
                        throw new AltoError("Can't remove an item that has never been added.");
                    });

                    return returnValue;
                },


                _findOperation: function (index, foundCallback, notFoundCallback) {
                    var seenInSubArray = 0;
                    var operationIndex, len, operation, rangeStart, rangeEnd;

                    // OPTIMIZE: change to balanced tree
                    // find leftmost operation to the right of `index`
                    for (operationIndex = rangeStart = 0, len = this._operations.length; operationIndex < len; rangeStart = rangeEnd + 1, ++operationIndex) {
                        operation = this._operations[operationIndex];
                        rangeEnd = rangeStart + operation.count - 1;

                        if (index >= rangeStart && index <= rangeEnd) {
                            foundCallback(operation, operationIndex, rangeStart, rangeEnd, seenInSubArray);
                            return;
                        } else if (operation.type === RETAIN) {
                            seenInSubArray += operation.count;
                        }
                    }

                    notFoundCallback(seenInSubArray);
                },

                _composeAt: function(index) {
                    var op = this._operations[index];
                    var otherOp;

                    if (!op) {
                        // Composing out of bounds is a no-op, as when removing the last operation
                        // in the list.
                        return;
                    }

                    if (index > 0) {
                        otherOp = this._operations[index-1];
                        if (otherOp.type === op.type) {
                            op.count += otherOp.count;
                            this._operations.splice(index-1, 1);
                            --index;
                        }
                    }

                    if (index < this._operations.length-1) {
                        otherOp = this._operations[index+1];
                        if (otherOp.type === op.type) {
                            op.count += otherOp.count;
                            this._operations.splice(index+1, 1);
                        }
                    }
                },

                toString: function () {
                    var str = "";
                    EnumerableUtils.forEach(this._operations, function (operation) {
                        str += " " + operation.type + ":" + operation.count;
                    });
                    return str.substring(1);
                }
            };
        });
    enifed("ember-runtime/system/tracked_array",
        ["ember-metal/property_get","ember-metal/enumerable_utils","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var get = __dependency1__.get;
            var forEach = __dependency2__.forEach;

            var RETAIN = 'r';
            var INSERT = 'i';
            var DELETE = 'd';

            __exports__["default"] = TrackedArray;

            /**
             An `Alto.TrackedArray` tracks array operations.  It's useful when you want to
             lazily compute the indexes of items in an array after they've been shifted by
             subsequent operations.

             @class TrackedArray
             @namespace Alto
             @param {Array} [items=[]] The array to be tracked.  This is used just to get
             the initial items for the starting state of retain:n.
             */
            function TrackedArray(items) {
                if (arguments.length < 1) { items = []; }

                var length = get(items, 'length');

                if (length) {
                    this._operations = [new ArrayOperation(RETAIN, length, items)];
                } else {
                    this._operations = [];
                }
            }

            TrackedArray.RETAIN = RETAIN;
            TrackedArray.INSERT = INSERT;
            TrackedArray.DELETE = DELETE;

            TrackedArray.prototype = {

                /**
                 Track that `newItems` were added to the tracked array at `index`.

                 @method addItems
                 @param index
                 @param newItems
                 */
                addItems: function (index, newItems) {
                    var count = get(newItems, 'length');
                    if (count < 1) { return; }

                    var match = this._findArrayOperation(index);
                    var arrayOperation = match.operation;
                    var arrayOperationIndex = match.index;
                    var arrayOperationRangeStart = match.rangeStart;
                    var composeIndex, newArrayOperation;

                    newArrayOperation = new ArrayOperation(INSERT, count, newItems);

                    if (arrayOperation) {
                        if (!match.split) {
                            // insert left of arrayOperation
                            this._operations.splice(arrayOperationIndex, 0, newArrayOperation);
                            composeIndex = arrayOperationIndex;
                        } else {
                            this._split(arrayOperationIndex, index - arrayOperationRangeStart, newArrayOperation);
                            composeIndex = arrayOperationIndex + 1;
                        }
                    } else {
                        // insert at end
                        this._operations.push(newArrayOperation);
                        composeIndex = arrayOperationIndex;
                    }

                    this._composeInsert(composeIndex);
                },

                /**
                 Track that `count` items were removed at `index`.

                 @method removeItems
                 @param index
                 @param count
                 */
                removeItems: function (index, count) {
                    if (count < 1) { return; }

                    var match = this._findArrayOperation(index);
                    var arrayOperationIndex = match.index;
                    var arrayOperationRangeStart = match.rangeStart;
                    var newArrayOperation, composeIndex;

                    newArrayOperation = new ArrayOperation(DELETE, count);
                    if (!match.split) {
                        // insert left of arrayOperation
                        this._operations.splice(arrayOperationIndex, 0, newArrayOperation);
                        composeIndex = arrayOperationIndex;
                    } else {
                        this._split(arrayOperationIndex, index - arrayOperationRangeStart, newArrayOperation);
                        composeIndex = arrayOperationIndex + 1;
                    }

                    return this._composeDelete(composeIndex);
                },

                /**
                 Apply all operations, reducing them to retain:n, for `n`, the number of
                 items in the array.

                 `callback` will be called for each operation and will be passed the following arguments:

                 * {array} items The items for the given operation
                 * {number} offset The computed offset of the items, ie the index in the
                 array of the first item for this operation.
                 * {string} operation The type of the operation.  One of
                 `Alto.TrackedArray.{RETAIN, DELETE, INSERT}`

                 @method apply
                 @param {Function} callback
                 */
                apply: function (callback) {
                    var items = [];
                    var offset = 0;

                    forEach(this._operations, function (arrayOperation, operationIndex) {
                        callback(arrayOperation.items, offset, arrayOperation.type, operationIndex);

                        if (arrayOperation.type !== DELETE) {
                            offset += arrayOperation.count;
                            items = items.concat(arrayOperation.items);
                        }
                    });

                    this._operations = [new ArrayOperation(RETAIN, items.length, items)];
                },

                /**
                 Return an `ArrayOperationMatch` for the operation that contains the item at `index`.

                 @method _findArrayOperation

                 @param {Number} index the index of the item whose operation information
                 should be returned.
                 @private
                 */
                _findArrayOperation: function (index) {
                    var split = false;
                    var arrayOperationIndex, arrayOperation,
                        arrayOperationRangeStart, arrayOperationRangeEnd,
                        len;

                    // OPTIMIZE: we could search these faster if we kept a balanced tree.
                    // find leftmost arrayOperation to the right of `index`
                    for (arrayOperationIndex = arrayOperationRangeStart = 0, len = this._operations.length; arrayOperationIndex < len; ++arrayOperationIndex) {
                        arrayOperation = this._operations[arrayOperationIndex];

                        if (arrayOperation.type === DELETE) { continue; }

                        arrayOperationRangeEnd = arrayOperationRangeStart + arrayOperation.count - 1;

                        if (index === arrayOperationRangeStart) {
                            break;
                        } else if (index > arrayOperationRangeStart && index <= arrayOperationRangeEnd) {
                            split = true;
                            break;
                        } else {
                            arrayOperationRangeStart = arrayOperationRangeEnd + 1;
                        }
                    }

                    return new ArrayOperationMatch(arrayOperation, arrayOperationIndex, split, arrayOperationRangeStart);
                },

                _split: function (arrayOperationIndex, splitIndex, newArrayOperation) {
                    var arrayOperation = this._operations[arrayOperationIndex];
                    var splitItems = arrayOperation.items.slice(splitIndex);
                    var splitArrayOperation = new ArrayOperation(arrayOperation.type, splitItems.length, splitItems);

                    // truncate LHS
                    arrayOperation.count = splitIndex;
                    arrayOperation.items = arrayOperation.items.slice(0, splitIndex);

                    this._operations.splice(arrayOperationIndex + 1, 0, newArrayOperation, splitArrayOperation);
                },

                // see SubArray for a better implementation.
                _composeInsert: function (index) {
                    var newArrayOperation = this._operations[index];
                    var leftArrayOperation = this._operations[index-1]; // may be undefined
                    var rightArrayOperation = this._operations[index+1]; // may be undefined
                    var leftOp = leftArrayOperation && leftArrayOperation.type;
                    var rightOp = rightArrayOperation && rightArrayOperation.type;

                    if (leftOp === INSERT) {
                        // merge left
                        leftArrayOperation.count += newArrayOperation.count;
                        leftArrayOperation.items = leftArrayOperation.items.concat(newArrayOperation.items);

                        if (rightOp === INSERT) {
                            // also merge right (we have split an insert with an insert)
                            leftArrayOperation.count += rightArrayOperation.count;
                            leftArrayOperation.items = leftArrayOperation.items.concat(rightArrayOperation.items);
                            this._operations.splice(index, 2);
                        } else {
                            // only merge left
                            this._operations.splice(index, 1);
                        }
                    } else if (rightOp === INSERT) {
                        // merge right
                        newArrayOperation.count += rightArrayOperation.count;
                        newArrayOperation.items = newArrayOperation.items.concat(rightArrayOperation.items);
                        this._operations.splice(index + 1, 1);
                    }
                },

                _composeDelete: function (index) {
                    var arrayOperation = this._operations[index];
                    var deletesToGo = arrayOperation.count;
                    var leftArrayOperation = this._operations[index-1]; // may be undefined
                    var leftOp = leftArrayOperation && leftArrayOperation.type;
                    var nextArrayOperation;
                    var nextOp;
                    var nextCount;
                    var removeNewAndNextOp = false;
                    var removedItems = [];

                    if (leftOp === DELETE) {
                        arrayOperation = leftArrayOperation;
                        index -= 1;
                    }

                    for (var i = index + 1; deletesToGo > 0; ++i) {
                        nextArrayOperation = this._operations[i];
                        nextOp = nextArrayOperation.type;
                        nextCount = nextArrayOperation.count;

                        if (nextOp === DELETE) {
                            arrayOperation.count += nextCount;
                            continue;
                        }

                        if (nextCount > deletesToGo) {
                            // d:2 {r,i}:5  we reduce the retain or insert, but it stays
                            removedItems = removedItems.concat(nextArrayOperation.items.splice(0, deletesToGo));
                            nextArrayOperation.count -= deletesToGo;

                            // In the case where we truncate the last arrayOperation, we don't need to
                            // remove it; also the deletesToGo reduction is not the entirety of
                            // nextCount
                            i -= 1;
                            nextCount = deletesToGo;

                            deletesToGo = 0;
                        } else {
                            if (nextCount === deletesToGo) {
                                // Handle edge case of d:2 i:2 in which case both operations go away
                                // during composition.
                                removeNewAndNextOp = true;
                            }
                            removedItems = removedItems.concat(nextArrayOperation.items);
                            deletesToGo -= nextCount;
                        }

                        if (nextOp === INSERT) {
                            // d:2 i:3 will result in delete going away
                            arrayOperation.count -= nextCount;
                        }
                    }

                    if (arrayOperation.count > 0) {
                        // compose our new delete with possibly several operations to the right of
                        // disparate types
                        this._operations.splice(index+1, i-1-index);
                    } else {
                        // The delete operation can go away; it has merely reduced some other
                        // operation, as in d:3 i:4; it may also have eliminated that operation,
                        // as in d:3 i:3.
                        this._operations.splice(index, removeNewAndNextOp ? 2 : 1);
                    }

                    return removedItems;
                },

                toString: function () {
                    var str = "";
                    forEach(this._operations, function (operation) {
                        str += " " + operation.type + ":" + operation.count;
                    });
                    return str.substring(1);
                }
            };

            /**
             Internal data structure to represent an array operation.

             @method ArrayOperation
             @private
             @param {String} type The type of the operation.  One of
             `Alto.TrackedArray.{RETAIN, INSERT, DELETE}`
             @param {Number} count The number of items in this operation.
             @param {Array} items The items of the operation, if included.  RETAIN and
             INSERT include their items, DELETE does not.
             */
            function ArrayOperation (operation, count, items) {
                this.type = operation; // RETAIN | INSERT | DELETE
                this.count = count;
                this.items = items;
            }

            /**
             Internal data structure used to include information when looking up operations
             by item index.

             @method ArrayOperationMatch
             @private
             @param {ArrayOperation} operation
             @param {Number} index The index of `operation` in the array of operations.
             @param {Boolean} split Whether or not the item index searched for would
             require a split for a new operation type.
             @param {Number} rangeStart The index of the first item in the operation,
             with respect to the tracked array.  The index of the last item can be computed
             from `rangeStart` and `operation.count`.
             */
            function ArrayOperationMatch(operation, index, split, rangeStart) {
                this.operation = operation;
                this.index = index;
                this.split = split;
                this.rangeStart = rangeStart;
            }
        });
    enifed("ember",
        ["ember-metal","ember-runtime"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__) {
            "use strict";
            /* global navigator */
            // require the main entry points for each of these packages
            // this is so that the global exports occur properly

            // do this to ensure that Alto.Test is defined properly on the global
            // if it is present.
            if (Alto.__loader.registry['ember-testing']) {
                requireModule('ember-testing');
            }

            /**
             Alto

             @module ember
             */
//todo Banks: removed for alto build system
            // Alto.deprecate('Usage of Alto is deprecated for Internet Explorer 6 and 7, support will be removed in the next major version.', !navigator.userAgent.match(/MSIE [67]/));
        });
    enifed("rsvp",
        ["./rsvp/promise","./rsvp/events","./rsvp/node","./rsvp/all","./rsvp/all-settled","./rsvp/race","./rsvp/hash","./rsvp/hash-settled","./rsvp/rethrow","./rsvp/defer","./rsvp/config","./rsvp/map","./rsvp/resolve","./rsvp/reject","./rsvp/filter","./rsvp/asap","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __dependency11__, __dependency12__, __dependency13__, __dependency14__, __dependency15__, __dependency16__, __exports__) {
            "use strict";
            var Promise = __dependency1__["default"];
            var EventTarget = __dependency2__["default"];
            var denodeify = __dependency3__["default"];
            var all = __dependency4__["default"];
            var allSettled = __dependency5__["default"];
            var race = __dependency6__["default"];
            var hash = __dependency7__["default"];
            var hashSettled = __dependency8__["default"];
            var rethrow = __dependency9__["default"];
            var defer = __dependency10__["default"];
            var config = __dependency11__.config;
            var configure = __dependency11__.configure;
            var map = __dependency12__["default"];
            var resolve = __dependency13__["default"];
            var reject = __dependency14__["default"];
            var filter = __dependency15__["default"];
            var asap = __dependency16__["default"];

            config.async = asap; // default async is asap;
            var cast = resolve;
            function async(callback, arg) {
                config.async(callback, arg);
            }

            function on() {
                config.on.apply(config, arguments);
            }

            function off() {
                config.off.apply(config, arguments);
            }

            // Set up instrumentation through `window.__PROMISE_INTRUMENTATION__`
            if (typeof window !== 'undefined' && typeof window['__PROMISE_INSTRUMENTATION__'] === 'object') {
                var callbacks = window['__PROMISE_INSTRUMENTATION__'];
                configure('instrument', true);
                for (var eventName in callbacks) {
                    if (callbacks.hasOwnProperty(eventName)) {
                        on(eventName, callbacks[eventName]);
                    }
                }
            }

            __exports__.cast = cast;
            __exports__.Promise = Promise;
            __exports__.EventTarget = EventTarget;
            __exports__.all = all;
            __exports__.allSettled = allSettled;
            __exports__.race = race;
            __exports__.hash = hash;
            __exports__.hashSettled = hashSettled;
            __exports__.rethrow = rethrow;
            __exports__.defer = defer;
            __exports__.denodeify = denodeify;
            __exports__.configure = configure;
            __exports__.on = on;
            __exports__.off = off;
            __exports__.resolve = resolve;
            __exports__.reject = reject;
            __exports__.async = async;
            __exports__.map = map;
            __exports__.filter = filter;
        });
    enifed("rsvp.umd",
        ["./rsvp"],
        function(__dependency1__) {
            "use strict";
            var Promise = __dependency1__.Promise;
            var allSettled = __dependency1__.allSettled;
            var hash = __dependency1__.hash;
            var hashSettled = __dependency1__.hashSettled;
            var denodeify = __dependency1__.denodeify;
            var on = __dependency1__.on;
            var off = __dependency1__.off;
            var map = __dependency1__.map;
            var filter = __dependency1__.filter;
            var resolve = __dependency1__.resolve;
            var reject = __dependency1__.reject;
            var rethrow = __dependency1__.rethrow;
            var all = __dependency1__.all;
            var defer = __dependency1__.defer;
            var EventTarget = __dependency1__.EventTarget;
            var configure = __dependency1__.configure;
            var race = __dependency1__.race;
            var async = __dependency1__.async;

            var RSVP = {
                'race': race,
                'Promise': Promise,
                'allSettled': allSettled,
                'hash': hash,
                'hashSettled': hashSettled,
                'denodeify': denodeify,
                'on': on,
                'off': off,
                'map': map,
                'filter': filter,
                'resolve': resolve,
                'reject': reject,
                'all': all,
                'rethrow': rethrow,
                'defer': defer,
                'EventTarget': EventTarget,
                'configure': configure,
                'async': async
            };

            /* global define:true module:true window: true */
            if (typeof enifed === 'function' && enifed['amd']) {
                enifed(function() { return RSVP; });
            } else if (typeof module !== 'undefined' && module['exports']) {
                module['exports'] = RSVP;
            } else if (typeof this !== 'undefined') {
                this['RSVP'] = RSVP;
            }
        });
    enifed("rsvp/-internal",
        ["./utils","./instrument","./config","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            "use strict";
            var objectOrFunction = __dependency1__.objectOrFunction;
            var isFunction = __dependency1__.isFunction;

            var instrument = __dependency2__["default"];

            var config = __dependency3__.config;

            function  withOwnPromise() {
                return new TypeError('A promises callback cannot return that same promise.');
            }

            function noop() {}

            var PENDING   = void 0;
            var FULFILLED = 1;
            var REJECTED  = 2;

            var GET_THEN_ERROR = new ErrorObject();

            function getThen(promise) {
                try {
                    return promise.then;
                } catch(error) {
                    GET_THEN_ERROR.error = error;
                    return GET_THEN_ERROR;
                }
            }

            function tryThen(then, value, fulfillmentHandler, rejectionHandler) {
                try {
                    then.call(value, fulfillmentHandler, rejectionHandler);
                } catch(e) {
                    return e;
                }
            }

            function handleForeignThenable(promise, thenable, then) {
                config.async(function(promise) {
                    var sealed = false;
                    var error = tryThen(then, thenable, function(value) {
                        if (sealed) { return; }
                        sealed = true;
                        if (thenable !== value) {
                            resolve(promise, value);
                        } else {
                            fulfill(promise, value);
                        }
                    }, function(reason) {
                        if (sealed) { return; }
                        sealed = true;

                        reject(promise, reason);
                    }, 'Settle: ' + (promise._label || ' unknown promise'));

                    if (!sealed && error) {
                        sealed = true;
                        reject(promise, error);
                    }
                }, promise);
            }

            function handleOwnThenable(promise, thenable) {
                if (thenable._state === FULFILLED) {
                    fulfill(promise, thenable._result);
                } else if (promise._state === REJECTED) {
                    reject(promise, thenable._result);
                } else {
                    subscribe(thenable, undefined, function(value) {
                        if (thenable !== value) {
                            resolve(promise, value);
                        } else {
                            fulfill(promise, value);
                        }
                    }, function(reason) {
                        reject(promise, reason);
                    });
                }
            }

            function handleMaybeThenable(promise, maybeThenable) {
                if (maybeThenable.constructor === promise.constructor) {
                    handleOwnThenable(promise, maybeThenable);
                } else {
                    var then = getThen(maybeThenable);

                    if (then === GET_THEN_ERROR) {
                        reject(promise, GET_THEN_ERROR.error);
                    } else if (then === undefined) {
                        fulfill(promise, maybeThenable);
                    } else if (isFunction(then)) {
                        handleForeignThenable(promise, maybeThenable, then);
                    } else {
                        fulfill(promise, maybeThenable);
                    }
                }
            }

            function resolve(promise, value) {
                if (promise === value) {
                    fulfill(promise, value);
                } else if (objectOrFunction(value)) {
                    handleMaybeThenable(promise, value);
                } else {
                    fulfill(promise, value);
                }
            }

            function publishRejection(promise) {
                if (promise._onerror) {
                    promise._onerror(promise._result);
                }

                publish(promise);
            }

            function fulfill(promise, value) {
                if (promise._state !== PENDING) { return; }

                promise._result = value;
                promise._state = FULFILLED;

                if (promise._subscribers.length === 0) {
                    if (config.instrument) {
                        instrument('fulfilled', promise);
                    }
                } else {
                    config.async(publish, promise);
                }
            }

            function reject(promise, reason) {
                if (promise._state !== PENDING) { return; }
                promise._state = REJECTED;
                promise._result = reason;

                config.async(publishRejection, promise);
            }

            function subscribe(parent, child, onFulfillment, onRejection) {
                var subscribers = parent._subscribers;
                var length = subscribers.length;

                parent._onerror = null;

                subscribers[length] = child;
                subscribers[length + FULFILLED] = onFulfillment;
                subscribers[length + REJECTED]  = onRejection;

                if (length === 0 && parent._state) {
                    config.async(publish, parent);
                }
            }

            function publish(promise) {
                var subscribers = promise._subscribers;
                var settled = promise._state;

                if (config.instrument) {
                    instrument(settled === FULFILLED ? 'fulfilled' : 'rejected', promise);
                }

                if (subscribers.length === 0) { return; }

                var child, callback, detail = promise._result;

                for (var i = 0; i < subscribers.length; i += 3) {
                    child = subscribers[i];
                    callback = subscribers[i + settled];

                    if (child) {
                        invokeCallback(settled, child, callback, detail);
                    } else {
                        callback(detail);
                    }
                }

                promise._subscribers.length = 0;
            }

            function ErrorObject() {
                this.error = null;
            }

            var TRY_CATCH_ERROR = new ErrorObject();

            function tryCatch(callback, detail) {
                try {
                    return callback(detail);
                } catch(e) {
                    TRY_CATCH_ERROR.error = e;
                    return TRY_CATCH_ERROR;
                }
            }

            function invokeCallback(settled, promise, callback, detail) {
                var hasCallback = isFunction(callback),
                    value, error, succeeded, failed;

                if (hasCallback) {
                    value = tryCatch(callback, detail);

                    if (value === TRY_CATCH_ERROR) {
                        failed = true;
                        error = value.error;
                        value = null;
                    } else {
                        succeeded = true;
                    }

                    if (promise === value) {
                        reject(promise, withOwnPromise());
                        return;
                    }

                } else {
                    value = detail;
                    succeeded = true;
                }

                if (promise._state !== PENDING) {
                    // noop
                } else if (hasCallback && succeeded) {
                    resolve(promise, value);
                } else if (failed) {
                    reject(promise, error);
                } else if (settled === FULFILLED) {
                    fulfill(promise, value);
                } else if (settled === REJECTED) {
                    reject(promise, value);
                }
            }

            function initializePromise(promise, resolver) {
                try {
                    resolver(function resolvePromise(value){
                        resolve(promise, value);
                    }, function rejectPromise(reason) {
                        reject(promise, reason);
                    });
                } catch(e) {
                    reject(promise, e);
                }
            }

            __exports__.noop = noop;
            __exports__.resolve = resolve;
            __exports__.reject = reject;
            __exports__.fulfill = fulfill;
            __exports__.subscribe = subscribe;
            __exports__.publish = publish;
            __exports__.publishRejection = publishRejection;
            __exports__.initializePromise = initializePromise;
            __exports__.invokeCallback = invokeCallback;
            __exports__.FULFILLED = FULFILLED;
            __exports__.REJECTED = REJECTED;
            __exports__.PENDING = PENDING;
        });
    enifed("rsvp/all-settled",
        ["./enumerator","./promise","./utils","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            "use strict";
            var Enumerator = __dependency1__["default"];
            var makeSettledResult = __dependency1__.makeSettledResult;
            var Promise = __dependency2__["default"];
            var o_create = __dependency3__.o_create;

            function AllSettled(Constructor, entries, label) {
                this._superConstructor(Constructor, entries, false /* don't abort on reject */, label);
            }

            AllSettled.prototype = o_create(Enumerator.prototype);
            AllSettled.prototype._superConstructor = Enumerator;
            AllSettled.prototype._makeResult = makeSettledResult;
            AllSettled.prototype._validationError = function() {
                return new Error('allSettled must be called with an array');
            };

            /**
             `RSVP.allSettled` is similar to `RSVP.all`, but instead of implementing
             a fail-fast method, it waits until all the promises have returned and
             shows you all the results. This is useful if you want to handle multiple
             promises' failure states together as a set.

             Returns a promise that is fulfilled when all the given promises have been
             settled. The return promise is fulfilled with an array of the states of
             the promises passed into the `promises` array argument.

             Each state object will either indicate fulfillment or rejection, and
             provide the corresponding value or reason. The states will take one of
             the following formats:

             ```javascript
             { state: 'fulfilled', value: value }
             or
             { state: 'rejected', reason: reason }
             ```

             Example:

             ```javascript
             var promise1 = RSVP.Promise.resolve(1);
             var promise2 = RSVP.Promise.reject(new Error('2'));
             var promise3 = RSVP.Promise.reject(new Error('3'));
             var promises = [ promise1, promise2, promise3 ];

             RSVP.allSettled(promises).then(function(array){
        // array == [
        //   { state: 'fulfilled', value: 1 },
        //   { state: 'rejected', reason: Error },
        //   { state: 'rejected', reason: Error }
        // ]
        // Note that for the second item, reason.message will be '2', and for the
        // third item, reason.message will be '3'.
      }, function(error) {
        // Not run. (This block would only be called if allSettled had failed,
        // for instance if passed an incorrect argument type.)
      });
             ```

             @method allSettled
             @static
             @for RSVP
             @param {Array} promises
             @param {String} label - optional string that describes the promise.
             Useful for tooling.
             @return {Promise} promise that is fulfilled with an array of the settled
             states of the constituent promises.
             */

            __exports__["default"] = function allSettled(entries, label) {
                return new AllSettled(Promise, entries, label).promise;
            }
        });
    enifed("rsvp/all",
        ["./promise","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var Promise = __dependency1__["default"];

            /**
             This is a convenient alias for `RSVP.Promise.all`.

             @method all
             @static
             @for RSVP
             @param {Array} array Array of promises.
             @param {String} label An optional label. This is useful
             for tooling.
             */
            __exports__["default"] = function all(array, label) {
                return Promise.all(array, label);
            }
        });
    enifed("rsvp/asap",
        ["exports"],
        function(__exports__) {
            "use strict";
            var len = 0;

            __exports__["default"] = function asap(callback, arg) {
                queue[len] = callback;
                queue[len + 1] = arg;
                len += 2;
                if (len === 2) {
                    // If len is 1, that means that we need to schedule an async flush.
                    // If additional callbacks are queued before the queue is flushed, they
                    // will be processed by this flush that we are scheduling.
                    scheduleFlush();
                }
            }

            var browserWindow = (typeof window !== 'undefined') ? window : undefined
            var browserGlobal = browserWindow || {};
            var BrowserMutationObserver = browserGlobal.MutationObserver || browserGlobal.WebKitMutationObserver;

            // test for web worker but not in IE10
            var isWorker = typeof Uint8ClampedArray !== 'undefined' &&
                typeof importScripts !== 'undefined' &&
                typeof MessageChannel !== 'undefined';

            // node
            function useNextTick() {
                return function() {
                    process.nextTick(flush);
                };
            }

            // vertx
            function useVertxTimer() {
                return function() {
                    vertxNext(flush);
                };
            }

            function useMutationObserver() {
                var iterations = 0;
                var observer = new BrowserMutationObserver(flush);
                var node = document.createTextNode('');
                observer.observe(node, { characterData: true });

                return function() {
                    node.data = (iterations = ++iterations % 2);
                };
            }

            // web worker
            function useMessageChannel() {
                var channel = new MessageChannel();
                channel.port1.onmessage = flush;
                return function () {
                    channel.port2.postMessage(0);
                };
            }

            function useSetTimeout() {
                return function() {
                    setTimeout(flush, 1);
                };
            }

            var queue = new Array(1000);
            function flush() {
                for (var i = 0; i < len; i+=2) {
                    var callback = queue[i];
                    var arg = queue[i+1];

                    callback(arg);

                    queue[i] = undefined;
                    queue[i+1] = undefined;
                }

                len = 0;
            }

            function attemptVertex() {
                try {
                    var vertx = eriuqer('vertx');
                    var vertxNext = vertx.runOnLoop || vertx.runOnContext;
                    return useVertxTimer();
                } catch(e) {
                    return useSetTimeout();
                }
            }

            var scheduleFlush;
            // Decide what async method to use to triggering processing of queued callbacks:
            if (typeof process !== 'undefined' && {}.toString.call(process) === '[object process]') {
                scheduleFlush = useNextTick();
            } else if (BrowserMutationObserver) {
                scheduleFlush = useMutationObserver();
            } else if (isWorker) {
                scheduleFlush = useMessageChannel();
            } else if (browserWindow === undefined && typeof eriuqer === 'function') {
                scheduleFlush = attemptVertex();
            } else {
                scheduleFlush = useSetTimeout();
            }
        });
    enifed("rsvp/config",
        ["./events","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var EventTarget = __dependency1__["default"];

            var config = {
                instrument: false
            };

            EventTarget.mixin(config);

            function configure(name, value) {
                if (name === 'onerror') {
                    // handle for legacy users that expect the actual
                    // error to be passed to their function added via
                    // `RSVP.configure('onerror', someFunctionHere);`
                    config.on('error', value);
                    return;
                }

                if (arguments.length === 2) {
                    config[name] = value;
                } else {
                    return config[name];
                }
            }

            __exports__.config = config;
            __exports__.configure = configure;
        });
    enifed("rsvp/defer",
        ["./promise","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var Promise = __dependency1__["default"];

            /**
             `RSVP.defer` returns an object similar to jQuery's `$.Deferred`.
             `RSVP.defer` should be used when porting over code reliant on `$.Deferred`'s
             interface. New code should use the `RSVP.Promise` constructor instead.

             The object returned from `RSVP.defer` is a plain object with three properties:

             * promise - an `RSVP.Promise`.
             * reject - a function that causes the `promise` property on this object to
             become rejected
             * resolve - a function that causes the `promise` property on this object to
             become fulfilled.

             Example:

             ```javascript
             var deferred = RSVP.defer();

             deferred.resolve("Success!");

             defered.promise.then(function(value){
         // value here is "Success!"
       });
             ```

             @method defer
             @static
             @for RSVP
             @param {String} label optional string for labeling the promise.
             Useful for tooling.
             @return {Object}
             */

            __exports__["default"] = function defer(label) {
                var deferred = { };

                deferred['promise'] = new Promise(function(resolve, reject) {
                    deferred['resolve'] = resolve;
                    deferred['reject'] = reject;
                }, label);

                return deferred;
            }
        });
    enifed("rsvp/enumerator",
        ["./utils","./-internal","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var isArray = __dependency1__.isArray;
            var isMaybeThenable = __dependency1__.isMaybeThenable;

            var noop = __dependency2__.noop;
            var reject = __dependency2__.reject;
            var fulfill = __dependency2__.fulfill;
            var subscribe = __dependency2__.subscribe;
            var FULFILLED = __dependency2__.FULFILLED;
            var REJECTED = __dependency2__.REJECTED;
            var PENDING = __dependency2__.PENDING;

            function makeSettledResult(state, position, value) {
                if (state === FULFILLED) {
                    return {
                        state: 'fulfilled',
                        value: value
                    };
                } else {
                    return {
                        state: 'rejected',
                        reason: value
                    };
                }
            }

            __exports__.makeSettledResult = makeSettledResult;function Enumerator(Constructor, input, abortOnReject, label) {
                this._instanceConstructor = Constructor;
                this.promise = new Constructor(noop, label);
                this._abortOnReject = abortOnReject;

                if (this._validateInput(input)) {
                    this._input     = input;
                    this.length     = input.length;
                    this._remaining = input.length;

                    this._init();

                    if (this.length === 0) {
                        fulfill(this.promise, this._result);
                    } else {
                        this.length = this.length || 0;
                        this._enumerate();
                        if (this._remaining === 0) {
                            fulfill(this.promise, this._result);
                        }
                    }
                } else {
                    reject(this.promise, this._validationError());
                }
            }

            Enumerator.prototype._validateInput = function(input) {
                return isArray(input);
            };

            Enumerator.prototype._validationError = function() {
                return new Error('Array Methods must be provided an Array');
            };

            Enumerator.prototype._init = function() {
                this._result = new Array(this.length);
            };

            __exports__["default"] = Enumerator;

            Enumerator.prototype._enumerate = function() {
                var length  = this.length;
                var promise = this.promise;
                var input   = this._input;

                for (var i = 0; promise._state === PENDING && i < length; i++) {
                    this._eachEntry(input[i], i);
                }
            };

            Enumerator.prototype._eachEntry = function(entry, i) {
                var c = this._instanceConstructor;
                if (isMaybeThenable(entry)) {
                    if (entry.constructor === c && entry._state !== PENDING) {
                        entry._onerror = null;
                        this._settledAt(entry._state, i, entry._result);
                    } else {
                        this._willSettleAt(c.resolve(entry), i);
                    }
                } else {
                    this._remaining--;
                    this._result[i] = this._makeResult(FULFILLED, i, entry);
                }
            };

            Enumerator.prototype._settledAt = function(state, i, value) {
                var promise = this.promise;

                if (promise._state === PENDING) {
                    this._remaining--;

                    if (this._abortOnReject && state === REJECTED) {
                        reject(promise, value);
                    } else {
                        this._result[i] = this._makeResult(state, i, value);
                    }
                }

                if (this._remaining === 0) {
                    fulfill(promise, this._result);
                }
            };

            Enumerator.prototype._makeResult = function(state, i, value) {
                return value;
            };

            Enumerator.prototype._willSettleAt = function(promise, i) {
                var enumerator = this;

                subscribe(promise, undefined, function(value) {
                    enumerator._settledAt(FULFILLED, i, value);
                }, function(reason) {
                    enumerator._settledAt(REJECTED, i, reason);
                });
            };
        });
    enifed("rsvp/events",
        ["exports"],
        function(__exports__) {
            "use strict";
            function indexOf(callbacks, callback) {
                for (var i=0, l=callbacks.length; i<l; i++) {
                    if (callbacks[i] === callback) { return i; }
                }

                return -1;
            }

            function callbacksFor(object) {
                var callbacks = object._promiseCallbacks;

                if (!callbacks) {
                    callbacks = object._promiseCallbacks = {};
                }

                return callbacks;
            }

            /**
             @class RSVP.EventTarget
             */
            __exports__["default"] = {

                /**
                 `RSVP.EventTarget.mixin` extends an object with EventTarget methods. For
                 Example:

                 ```javascript
                 var object = {};

                 RSVP.EventTarget.mixin(object);

                 object.on('finished', function(event) {
          // handle event
        });

                 object.trigger('finished', { detail: value });
                 ```

                 `EventTarget.mixin` also works with prototypes:

                 ```javascript
                 var Person = function() {};
                 RSVP.EventTarget.mixin(Person.prototype);

                 var yehuda = new Person();
                 var tom = new Person();

                 yehuda.on('poke', function(event) {
          console.log('Yehuda says OW');
        });

                 tom.on('poke', function(event) {
          console.log('Tom says OW');
        });

                 yehuda.trigger('poke');
                 tom.trigger('poke');
                 ```

                 @method mixin
                 @for RSVP.EventTarget
                 @private
                 @param {Object} object object to extend with EventTarget methods
                 */
                mixin: function(object) {
                    object.on = this.on;
                    object.off = this.off;
                    object.trigger = this.trigger;
                    object._promiseCallbacks = undefined;
                    return object;
                },

                /**
                 Registers a callback to be executed when `eventName` is triggered

                 ```javascript
                 object.on('event', function(eventInfo){
          // handle the event
        });

                 object.trigger('event');
                 ```

                 @method on
                 @for RSVP.EventTarget
                 @private
                 @param {String} eventName name of the event to listen for
                 @param {Function} callback function to be called when the event is triggered.
                 */
                on: function(eventName, callback) {
                    var allCallbacks = callbacksFor(this), callbacks;

                    callbacks = allCallbacks[eventName];

                    if (!callbacks) {
                        callbacks = allCallbacks[eventName] = [];
                    }

                    if (indexOf(callbacks, callback) === -1) {
                        callbacks.push(callback);
                    }
                },

                /**
                 You can use `off` to stop firing a particular callback for an event:

                 ```javascript
                 function doStuff() { // do stuff! }
                 object.on('stuff', doStuff);

                 object.trigger('stuff'); // doStuff will be called

                 // Unregister ONLY the doStuff callback
                 object.off('stuff', doStuff);
                 object.trigger('stuff'); // doStuff will NOT be called
                 ```

                 If you don't pass a `callback` argument to `off`, ALL callbacks for the
                 event will not be executed when the event fires. For example:

                 ```javascript
                 var callback1 = function(){};
                 var callback2 = function(){};

                 object.on('stuff', callback1);
                 object.on('stuff', callback2);

                 object.trigger('stuff'); // callback1 and callback2 will be executed.

                 object.off('stuff');
                 object.trigger('stuff'); // callback1 and callback2 will not be executed!
                 ```

                 @method off
                 @for RSVP.EventTarget
                 @private
                 @param {String} eventName event to stop listening to
                 @param {Function} callback optional argument. If given, only the function
                 given will be removed from the event's callback queue. If no `callback`
                 argument is given, all callbacks will be removed from the event's callback
                 queue.
                 */
                off: function(eventName, callback) {
                    var allCallbacks = callbacksFor(this), callbacks, index;

                    if (!callback) {
                        allCallbacks[eventName] = [];
                        return;
                    }

                    callbacks = allCallbacks[eventName];

                    index = indexOf(callbacks, callback);

                    if (index !== -1) { callbacks.splice(index, 1); }
                },

                /**
                 Use `trigger` to fire custom events. For example:

                 ```javascript
                 object.on('foo', function(){
          console.log('foo event happened!');
        });
                 object.trigger('foo');
                 // 'foo event happened!' logged to the console
                 ```

                 You can also pass a value as a second argument to `trigger` that will be
                 passed as an argument to all event listeners for the event:

                 ```javascript
                 object.on('foo', function(value){
          console.log(value.name);
        });

                 object.trigger('foo', { name: 'bar' });
                 // 'bar' logged to the console
                 ```

                 @method trigger
                 @for RSVP.EventTarget
                 @private
                 @param {String} eventName name of the event to be triggered
                 @param {Any} options optional value to be passed to any event handlers for
                 the given `eventName`
                 */
                trigger: function(eventName, options) {
                    var allCallbacks = callbacksFor(this), callbacks, callback;

                    if (callbacks = allCallbacks[eventName]) {
                        // Don't cache the callbacks.length since it may grow
                        for (var i=0; i<callbacks.length; i++) {
                            callback = callbacks[i];

                            callback(options);
                        }
                    }
                }
            };
        });
    enifed("rsvp/filter",
        ["./promise","./utils","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var Promise = __dependency1__["default"];
            var isFunction = __dependency2__.isFunction;

            /**
             `RSVP.filter` is similar to JavaScript's native `filter` method, except that it
             waits for all promises to become fulfilled before running the `filterFn` on
             each item in given to `promises`. `RSVP.filter` returns a promise that will
             become fulfilled with the result of running `filterFn` on the values the
             promises become fulfilled with.

             For example:

             ```javascript

             var promise1 = RSVP.resolve(1);
             var promise2 = RSVP.resolve(2);
             var promise3 = RSVP.resolve(3);

             var promises = [promise1, promise2, promise3];

             var filterFn = function(item){
        return item > 1;
      };

             RSVP.filter(promises, filterFn).then(function(result){
        // result is [ 2, 3 ]
      });
             ```

             If any of the `promises` given to `RSVP.filter` are rejected, the first promise
             that is rejected will be given as an argument to the returned promise's
             rejection handler. For example:

             ```javascript
             var promise1 = RSVP.resolve(1);
             var promise2 = RSVP.reject(new Error('2'));
             var promise3 = RSVP.reject(new Error('3'));
             var promises = [ promise1, promise2, promise3 ];

             var filterFn = function(item){
        return item > 1;
      };

             RSVP.filter(promises, filterFn).then(function(array){
        // Code here never runs because there are rejected promises!
      }, function(reason) {
        // reason.message === '2'
      });
             ```

             `RSVP.filter` will also wait for any promises returned from `filterFn`.
             For instance, you may want to fetch a list of users then return a subset
             of those users based on some asynchronous operation:

             ```javascript

             var alice = { name: 'alice' };
             var bob   = { name: 'bob' };
             var users = [ alice, bob ];

             var promises = users.map(function(user){
        return RSVP.resolve(user);
      });

             var filterFn = function(user){
        // Here, Alice has permissions to create a blog post, but Bob does not.
        return getPrivilegesForUser(user).then(function(privs){
          return privs.can_create_blog_post === true;
        });
      };
             RSVP.filter(promises, filterFn).then(function(users){
        // true, because the server told us only Alice can create a blog post.
        users.length === 1;
        // false, because Alice is the only user present in `users`
        users[0] === bob;
      });
             ```

             @method filter
             @static
             @for RSVP
             @param {Array} promises
             @param {Function} filterFn - function to be called on each resolved value to
             filter the final results.
             @param {String} label optional string describing the promise. Useful for
             tooling.
             @return {Promise}
             */
            __exports__["default"] = function filter(promises, filterFn, label) {
                return Promise.all(promises, label).then(function(values) {
                    if (!isFunction(filterFn)) {
                        throw new TypeError("You must pass a function as filter's second argument.");
                    }

                    var length = values.length;
                    var filtered = new Array(length);

                    for (var i = 0; i < length; i++) {
                        filtered[i] = filterFn(values[i]);
                    }

                    return Promise.all(filtered, label).then(function(filtered) {
                        var results = new Array(length);
                        var newLength = 0;

                        for (var i = 0; i < length; i++) {
                            if (filtered[i]) {
                                results[newLength] = values[i];
                                newLength++;
                            }
                        }

                        results.length = newLength;

                        return results;
                    });
                });
            }
        });
    enifed("rsvp/hash-settled",
        ["./promise","./enumerator","./promise-hash","./utils","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
            "use strict";
            var Promise = __dependency1__["default"];
            var makeSettledResult = __dependency2__.makeSettledResult;
            var PromiseHash = __dependency3__["default"];
            var Enumerator = __dependency2__["default"];
            var o_create = __dependency4__.o_create;

            function HashSettled(Constructor, object, label) {
                this._superConstructor(Constructor, object, false, label);
            }

            HashSettled.prototype = o_create(PromiseHash.prototype);
            HashSettled.prototype._superConstructor = Enumerator;
            HashSettled.prototype._makeResult = makeSettledResult;

            HashSettled.prototype._validationError = function() {
                return new Error('hashSettled must be called with an object');
            };

            /**
             `RSVP.hashSettled` is similar to `RSVP.allSettled`, but takes an object
             instead of an array for its `promises` argument.

             Unlike `RSVP.all` or `RSVP.hash`, which implement a fail-fast method,
             but like `RSVP.allSettled`, `hashSettled` waits until all the
             constituent promises have returned and then shows you all the results
             with their states and values/reasons. This is useful if you want to
             handle multiple promises' failure states together as a set.

             Returns a promise that is fulfilled when all the given promises have been
             settled, or rejected if the passed parameters are invalid.

             The returned promise is fulfilled with a hash that has the same key names as
             the `promises` object argument. If any of the values in the object are not
             promises, they will be copied over to the fulfilled object and marked with state
             'fulfilled'.

             Example:

             ```javascript
             var promises = {
        myPromise: RSVP.Promise.resolve(1),
        yourPromise: RSVP.Promise.resolve(2),
        theirPromise: RSVP.Promise.resolve(3),
        notAPromise: 4
      };

             RSVP.hashSettled(promises).then(function(hash){
        // hash here is an object that looks like:
        // {
        //   myPromise: { state: 'fulfilled', value: 1 },
        //   yourPromise: { state: 'fulfilled', value: 2 },
        //   theirPromise: { state: 'fulfilled', value: 3 },
        //   notAPromise: { state: 'fulfilled', value: 4 }
        // }
      });
             ```

             If any of the `promises` given to `RSVP.hash` are rejected, the state will
             be set to 'rejected' and the reason for rejection provided.

             Example:

             ```javascript
             var promises = {
        myPromise: RSVP.Promise.resolve(1),
        rejectedPromise: RSVP.Promise.reject(new Error('rejection')),
        anotherRejectedPromise: RSVP.Promise.reject(new Error('more rejection')),
      };

             RSVP.hashSettled(promises).then(function(hash){
        // hash here is an object that looks like:
        // {
        //   myPromise:              { state: 'fulfilled', value: 1 },
        //   rejectedPromise:        { state: 'rejected', reason: Error },
        //   anotherRejectedPromise: { state: 'rejected', reason: Error },
        // }
        // Note that for rejectedPromise, reason.message == 'rejection',
        // and for anotherRejectedPromise, reason.message == 'more rejection'.
      });
             ```

             An important note: `RSVP.hashSettled` is intended for plain JavaScript objects that
             are just a set of keys and values. `RSVP.hashSettled` will NOT preserve prototype
             chains.

             Example:

             ```javascript
             function MyConstructor(){
        this.example = RSVP.Promise.resolve('Example');
      }

             MyConstructor.prototype = {
        protoProperty: RSVP.Promise.resolve('Proto Property')
      };

             var myObject = new MyConstructor();

             RSVP.hashSettled(myObject).then(function(hash){
        // protoProperty will not be present, instead you will just have an
        // object that looks like:
        // {
        //   example: { state: 'fulfilled', value: 'Example' }
        // }
        //
        // hash.hasOwnProperty('protoProperty'); // false
        // 'undefined' === typeof hash.protoProperty
      });
             ```

             @method hashSettled
             @for RSVP
             @param {Object} promises
             @param {String} label optional string that describes the promise.
             Useful for tooling.
             @return {Promise} promise that is fulfilled when when all properties of `promises`
             have been settled.
             @static
             */
            __exports__["default"] = function hashSettled(object, label) {
                return new HashSettled(Promise, object, label).promise;
            }
        });
    enifed("rsvp/hash",
        ["./promise","./promise-hash","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var Promise = __dependency1__["default"];
            var PromiseHash = __dependency2__["default"];

            /**
             `RSVP.hash` is similar to `RSVP.all`, but takes an object instead of an array
             for its `promises` argument.

             Returns a promise that is fulfilled when all the given promises have been
             fulfilled, or rejected if any of them become rejected. The returned promise
             is fulfilled with a hash that has the same key names as the `promises` object
             argument. If any of the values in the object are not promises, they will
             simply be copied over to the fulfilled object.

             Example:

             ```javascript
             var promises = {
        myPromise: RSVP.resolve(1),
        yourPromise: RSVP.resolve(2),
        theirPromise: RSVP.resolve(3),
        notAPromise: 4
      };

             RSVP.hash(promises).then(function(hash){
        // hash here is an object that looks like:
        // {
        //   myPromise: 1,
        //   yourPromise: 2,
        //   theirPromise: 3,
        //   notAPromise: 4
        // }
      });
             ````

             If any of the `promises` given to `RSVP.hash` are rejected, the first promise
             that is rejected will be given as the reason to the rejection handler.

             Example:

             ```javascript
             var promises = {
        myPromise: RSVP.resolve(1),
        rejectedPromise: RSVP.reject(new Error('rejectedPromise')),
        anotherRejectedPromise: RSVP.reject(new Error('anotherRejectedPromise')),
      };

             RSVP.hash(promises).then(function(hash){
        // Code here never runs because there are rejected promises!
      }, function(reason) {
        // reason.message === 'rejectedPromise'
      });
             ```

             An important note: `RSVP.hash` is intended for plain JavaScript objects that
             are just a set of keys and values. `RSVP.hash` will NOT preserve prototype
             chains.

             Example:

             ```javascript
             function MyConstructor(){
        this.example = RSVP.resolve('Example');
      }

             MyConstructor.prototype = {
        protoProperty: RSVP.resolve('Proto Property')
      };

             var myObject = new MyConstructor();

             RSVP.hash(myObject).then(function(hash){
        // protoProperty will not be present, instead you will just have an
        // object that looks like:
        // {
        //   example: 'Example'
        // }
        //
        // hash.hasOwnProperty('protoProperty'); // false
        // 'undefined' === typeof hash.protoProperty
      });
             ```

             @method hash
             @static
             @for RSVP
             @param {Object} promises
             @param {String} label optional string that describes the promise.
             Useful for tooling.
             @return {Promise} promise that is fulfilled when all properties of `promises`
             have been fulfilled, or rejected if any of them become rejected.
             */
            __exports__["default"] = function hash(object, label) {
                return new PromiseHash(Promise, object, label).promise;
            }
        });
    enifed("rsvp/instrument",
        ["./config","./utils","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var config = __dependency1__.config;
            var now = __dependency2__.now;

            var queue = [];

            function scheduleFlush() {
                setTimeout(function() {
                    var entry;
                    for (var i = 0; i < queue.length; i++) {
                        entry = queue[i];

                        var payload = entry.payload;

                        payload.guid = payload.key + payload.id;
                        payload.childGuid = payload.key + payload.childId;
                        if (payload.error) {
                            payload.stack = payload.error.stack;
                        }

                        config.trigger(entry.name, entry.payload);
                    }
                    queue.length = 0;
                }, 50);
            }

            __exports__["default"] = function instrument(eventName, promise, child) {
                if (1 === queue.push({
                        name: eventName,
                        payload: {
                            key: promise._guidKey,
                            id:  promise._id,
                            eventName: eventName,
                            detail: promise._result,
                            childId: child && child._id,
                            label: promise._label,
                            timeStamp: now(),
                            error: config["instrument-with-stack"] ? new Error(promise._label) : null
                        }})) {
                    scheduleFlush();
                }
            }
        });
    enifed("rsvp/map",
        ["./promise","./utils","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var Promise = __dependency1__["default"];
            var isFunction = __dependency2__.isFunction;

            /**
             `RSVP.map` is similar to JavaScript's native `map` method, except that it
             waits for all promises to become fulfilled before running the `mapFn` on
             each item in given to `promises`. `RSVP.map` returns a promise that will
             become fulfilled with the result of running `mapFn` on the values the promises
             become fulfilled with.

             For example:

             ```javascript

             var promise1 = RSVP.resolve(1);
             var promise2 = RSVP.resolve(2);
             var promise3 = RSVP.resolve(3);
             var promises = [ promise1, promise2, promise3 ];

             var mapFn = function(item){
        return item + 1;
      };

             RSVP.map(promises, mapFn).then(function(result){
        // result is [ 2, 3, 4 ]
      });
             ```

             If any of the `promises` given to `RSVP.map` are rejected, the first promise
             that is rejected will be given as an argument to the returned promise's
             rejection handler. For example:

             ```javascript
             var promise1 = RSVP.resolve(1);
             var promise2 = RSVP.reject(new Error('2'));
             var promise3 = RSVP.reject(new Error('3'));
             var promises = [ promise1, promise2, promise3 ];

             var mapFn = function(item){
        return item + 1;
      };

             RSVP.map(promises, mapFn).then(function(array){
        // Code here never runs because there are rejected promises!
      }, function(reason) {
        // reason.message === '2'
      });
             ```

             `RSVP.map` will also wait if a promise is returned from `mapFn`. For example,
             say you want to get all comments from a set of blog posts, but you need
             the blog posts first because they contain a url to those comments.

             ```javscript

             var mapFn = function(blogPost){
        // getComments does some ajax and returns an RSVP.Promise that is fulfilled
        // with some comments data
        return getComments(blogPost.comments_url);
      };

             // getBlogPosts does some ajax and returns an RSVP.Promise that is fulfilled
             // with some blog post data
             RSVP.map(getBlogPosts(), mapFn).then(function(comments){
        // comments is the result of asking the server for the comments
        // of all blog posts returned from getBlogPosts()
      });
             ```

             @method map
             @static
             @for RSVP
             @param {Array} promises
             @param {Function} mapFn function to be called on each fulfilled promise.
             @param {String} label optional string for labeling the promise.
             Useful for tooling.
             @return {Promise} promise that is fulfilled with the result of calling
             `mapFn` on each fulfilled promise or value when they become fulfilled.
             The promise will be rejected if any of the given `promises` become rejected.
             @static
             */
            __exports__["default"] = function map(promises, mapFn, label) {
                return Promise.all(promises, label).then(function(values) {
                    if (!isFunction(mapFn)) {
                        throw new TypeError("You must pass a function as map's second argument.");
                    }

                    var length = values.length;
                    var results = new Array(length);

                    for (var i = 0; i < length; i++) {
                        results[i] = mapFn(values[i]);
                    }

                    return Promise.all(results, label);
                });
            }
        });
    enifed("rsvp/node",
        ["./promise","./-internal","./utils","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            "use strict";
            var Promise = __dependency1__["default"];
            var noop = __dependency2__.noop;
            var resolve = __dependency2__.resolve;
            var reject = __dependency2__.reject;
            var isArray = __dependency3__.isArray;

            function Result() {
                this.value = undefined;
            }

            var ERROR = new Result();
            var GET_THEN_ERROR = new Result();

            function getThen(obj) {
                try {
                    return obj.then;
                } catch(error) {
                    ERROR.value= error;
                    return ERROR;
                }
            }


            function tryApply(f, s, a) {
                try {
                    f.apply(s, a);
                } catch(error) {
                    ERROR.value = error;
                    return ERROR;
                }
            }

            function makeObject(_, argumentNames) {
                var obj = {};
                var name;
                var i;
                var length = _.length;
                var args = new Array(length);

                for (var x = 0; x < length; x++) {
                    args[x] = _[x];
                }

                for (i = 0; i < argumentNames.length; i++) {
                    name = argumentNames[i];
                    obj[name] = args[i + 1];
                }

                return obj;
            }

            function arrayResult(_) {
                var length = _.length;
                var args = new Array(length - 1);

                for (var i = 1; i < length; i++) {
                    args[i - 1] = _[i];
                }

                return args;
            }

            function wrapThenable(then, promise) {
                return {
                    then: function(onFulFillment, onRejection) {
                        return then.call(promise, onFulFillment, onRejection);
                    }
                };
            }

            /**
             `RSVP.denodeify` takes a 'node-style' function and returns a function that
             will return an `RSVP.Promise`. You can use `denodeify` in Node.js or the
             browser when you'd prefer to use promises over using callbacks. For example,
             `denodeify` transforms the following:

             ```javascript
             var fs = require('fs');

             fs.readFile('myfile.txt', function(err, data){
        if (err) return handleError(err);
        handleData(data);
      });
             ```

             into:

             ```javascript
             var fs = require('fs');
             var readFile = RSVP.denodeify(fs.readFile);

             readFile('myfile.txt').then(handleData, handleError);
             ```

             If the node function has multiple success parameters, then `denodeify`
             just returns the first one:

             ```javascript
             var request = RSVP.denodeify(require('request'));

             request('http://example.com').then(function(res) {
        // ...
      });
             ```

             However, if you need all success parameters, setting `denodeify`'s
             second parameter to `true` causes it to return all success parameters
             as an array:

             ```javascript
             var request = RSVP.denodeify(require('request'), true);

             request('http://example.com').then(function(result) {
        // result[0] -> res
        // result[1] -> body
      });
             ```

             Or if you pass it an array with names it returns the parameters as a hash:

             ```javascript
             var request = RSVP.denodeify(require('request'), ['res', 'body']);

             request('http://example.com').then(function(result) {
        // result.res
        // result.body
      });
             ```

             Sometimes you need to retain the `this`:

             ```javascript
             var app = require('express')();
             var render = RSVP.denodeify(app.render.bind(app));
             ```

             The denodified function inherits from the original function. It works in all
             environments, except IE 10 and below. Consequently all properties of the original
             function are available to you. However, any properties you change on the
             denodeified function won't be changed on the original function. Example:

             ```javascript
             var request = RSVP.denodeify(require('request')),
             cookieJar = request.jar(); // <- Inheritance is used here

             request('http://example.com', {jar: cookieJar}).then(function(res) {
        // cookieJar.cookies holds now the cookies returned by example.com
      });
             ```

             Using `denodeify` makes it easier to compose asynchronous operations instead
             of using callbacks. For example, instead of:

             ```javascript
             var fs = require('fs');

             fs.readFile('myfile.txt', function(err, data){
        if (err) { ... } // Handle error
        fs.writeFile('myfile2.txt', data, function(err){
          if (err) { ... } // Handle error
          console.log('done')
        });
      });
             ```

             you can chain the operations together using `then` from the returned promise:

             ```javascript
             var fs = require('fs');
             var readFile = RSVP.denodeify(fs.readFile);
             var writeFile = RSVP.denodeify(fs.writeFile);

             readFile('myfile.txt').then(function(data){
        return writeFile('myfile2.txt', data);
      }).then(function(){
        console.log('done')
      }).catch(function(error){
        // Handle error
      });
             ```

             @method denodeify
             @static
             @for RSVP
             @param {Function} nodeFunc a 'node-style' function that takes a callback as
             its last argument. The callback expects an error to be passed as its first
             argument (if an error occurred, otherwise null), and the value from the
             operation as its second argument ('function(err, value){ }').
             @param {Boolean|Array} argumentNames An optional paramter that if set
             to `true` causes the promise to fulfill with the callback's success arguments
             as an array. This is useful if the node function has multiple success
             paramters. If you set this paramter to an array with names, the promise will
             fulfill with a hash with these names as keys and the success parameters as
             values.
             @return {Function} a function that wraps `nodeFunc` to return an
             `RSVP.Promise`
             @static
             */
            __exports__["default"] = function denodeify(nodeFunc, options) {
                var fn = function() {
                    var self = this;
                    var l = arguments.length;
                    var args = new Array(l + 1);
                    var arg;
                    var promiseInput = false;

                    for (var i = 0; i < l; ++i) {
                        arg = arguments[i];

                        if (!promiseInput) {
                            // TODO: clean this up
                            promiseInput = needsPromiseInput(arg);
                            if (promiseInput === GET_THEN_ERROR) {
                                var p = new Promise(noop);
                                reject(p, GET_THEN_ERROR.value);
                                return p;
                            } else if (promiseInput && promiseInput !== true) {
                                arg = wrapThenable(promiseInput, arg);
                            }
                        }
                        args[i] = arg;
                    }

                    var promise = new Promise(noop);

                    args[l] = function(err, val) {
                        if (err)
                            reject(promise, err);
                        else if (options === undefined)
                            resolve(promise, val);
                        else if (options === true)
                            resolve(promise, arrayResult(arguments));
                        else if (isArray(options))
                            resolve(promise, makeObject(arguments, options));
                        else
                            resolve(promise, val);
                    };

                    if (promiseInput) {
                        return handlePromiseInput(promise, args, nodeFunc, self);
                    } else {
                        return handleValueInput(promise, args, nodeFunc, self);
                    }
                };

                fn.__proto__ = nodeFunc;

                return fn;
            }

            function handleValueInput(promise, args, nodeFunc, self) {
                var result = tryApply(nodeFunc, self, args);
                if (result === ERROR) {
                    reject(promise, result.value);
                }
                return promise;
            }

            function handlePromiseInput(promise, args, nodeFunc, self){
                return Promise.all(args).then(function(args){
                    var result = tryApply(nodeFunc, self, args);
                    if (result === ERROR) {
                        reject(promise, result.value);
                    }
                    return promise;
                });
            }

            function needsPromiseInput(arg) {
                if (arg && typeof arg === 'object') {
                    if (arg.constructor === Promise) {
                        return true;
                    } else {
                        return getThen(arg);
                    }
                } else {
                    return false;
                }
            }
        });
    enifed("rsvp/promise-hash",
        ["./enumerator","./-internal","./utils","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
            "use strict";
            var Enumerator = __dependency1__["default"];
            var PENDING = __dependency2__.PENDING;
            var o_create = __dependency3__.o_create;

            function PromiseHash(Constructor, object, label) {
                this._superConstructor(Constructor, object, true, label);
            }

            __exports__["default"] = PromiseHash;

            PromiseHash.prototype = o_create(Enumerator.prototype);
            PromiseHash.prototype._superConstructor = Enumerator;
            PromiseHash.prototype._init = function() {
                this._result = {};
            };

            PromiseHash.prototype._validateInput = function(input) {
                return input && typeof input === 'object';
            };

            PromiseHash.prototype._validationError = function() {
                return new Error('Promise.hash must be called with an object');
            };

            PromiseHash.prototype._enumerate = function() {
                var promise = this.promise;
                var input   = this._input;
                var results = [];

                for (var key in input) {
                    if (promise._state === PENDING && input.hasOwnProperty(key)) {
                        results.push({
                            position: key,
                            entry: input[key]
                        });
                    }
                }

                var length = results.length;
                this._remaining = length;
                var result;

                for (var i = 0; promise._state === PENDING && i < length; i++) {
                    result = results[i];
                    this._eachEntry(result.entry, result.position);
                }
            };
        });
    enifed("rsvp/promise",
        ["./config","./instrument","./utils","./-internal","./promise/all","./promise/race","./promise/resolve","./promise/reject","exports"],
        function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __exports__) {
            "use strict";
            var config = __dependency1__.config;
            var instrument = __dependency2__["default"];

            var isFunction = __dependency3__.isFunction;
            var now = __dependency3__.now;

            var noop = __dependency4__.noop;
            var subscribe = __dependency4__.subscribe;
            var initializePromise = __dependency4__.initializePromise;
            var invokeCallback = __dependency4__.invokeCallback;
            var FULFILLED = __dependency4__.FULFILLED;
            var REJECTED = __dependency4__.REJECTED;

            var all = __dependency5__["default"];
            var race = __dependency6__["default"];
            var Resolve = __dependency7__["default"];
            var Reject = __dependency8__["default"];

            var guidKey = 'rsvp_' + now() + '-';
            var counter = 0;

            function needsResolver() {
                throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
            }

            function needsNew() {
                throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.");
            }
            __exports__["default"] = Promise;
            /**
             Promise objects represent the eventual result of an asynchronous operation. The
             primary way of interacting with a promise is through its `then` method, which
             registers callbacks to receive either a promise’s eventual value or the reason
             why the promise cannot be fulfilled.

             Terminology
             -----------

             - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
             - `thenable` is an object or function that defines a `then` method.
             - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
             - `exception` is a value that is thrown using the throw statement.
             - `reason` is a value that indicates why a promise was rejected.
             - `settled` the final resting state of a promise, fulfilled or rejected.

             A promise can be in one of three states: pending, fulfilled, or rejected.

             Promises that are fulfilled have a fulfillment value and are in the fulfilled
             state.  Promises that are rejected have a rejection reason and are in the
             rejected state.  A fulfillment value is never a thenable.

             Promises can also be said to *resolve* a value.  If this value is also a
             promise, then the original promise's settled state will match the value's
             settled state.  So a promise that *resolves* a promise that rejects will
             itself reject, and a promise that *resolves* a promise that fulfills will
             itself fulfill.


             Basic Usage:
             ------------

             ```js
             var promise = new Promise(function(resolve, reject) {
        // on success
        resolve(value);

        // on failure
        reject(reason);
      });

             promise.then(function(value) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
             ```

             Advanced Usage:
             ---------------

             Promises shine when abstracting away asynchronous interactions such as
             `XMLHttpRequest`s.

             ```js
             function getJSON(url) {
        return new Promise(function(resolve, reject){
          var xhr = new XMLHttpRequest();

          xhr.open('GET', url);
          xhr.onreadystatechange = handler;
          xhr.responseType = 'json';
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.send();

          function handler() {
            if (this.readyState === this.DONE) {
              if (this.status === 200) {
                resolve(this.response);
              } else {
                reject(new Error('getJSON: `' + url + '` failed with status: [' + this.status + ']'));
              }
            }
          };
        });
      }

             getJSON('/posts.json').then(function(json) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
             ```

             Unlike callbacks, promises are great composable primitives.

             ```js
             Promise.all([
             getJSON('/posts'),
             getJSON('/comments')
             ]).then(function(values){
        values[0] // => postsJSON
        values[1] // => commentsJSON

        return values;
      });
             ```

             @class RSVP.Promise
             @param {function} resolver
             @param {String} label optional string for labeling the promise.
             Useful for tooling.
             @constructor
             */
            function Promise(resolver, label) {
                this._id = counter++;
                this._label = label;
                this._state = undefined;
                this._result = undefined;
                this._subscribers = [];

                if (config.instrument) {
                    instrument('created', this);
                }

                if (noop !== resolver) {
                    if (!isFunction(resolver)) {
                        needsResolver();
                    }

                    if (!(this instanceof Promise)) {
                        needsNew();
                    }

                    initializePromise(this, resolver);
                }
            }

            Promise.cast = Resolve; // deprecated
            Promise.all = all;
            Promise.race = race;
            Promise.resolve = Resolve;
            Promise.reject = Reject;

            Promise.prototype = {
                constructor: Promise,

                _guidKey: guidKey,

                _onerror: function (reason) {
                    config.trigger('error', reason);
                },

                /**
                 The primary way of interacting with a promise is through its `then` method,
                 which registers callbacks to receive either a promise's eventual value or the
                 reason why the promise cannot be fulfilled.

                 ```js
                 findUser().then(function(user){
        // user is available
      }, function(reason){
        // user is unavailable, and you are given the reason why
      });
                 ```

                 Chaining
                 --------

                 The return value of `then` is itself a promise.  This second, 'downstream'
                 promise is resolved with the return value of the first promise's fulfillment
                 or rejection handler, or rejected if the handler throws an exception.

                 ```js
                 findUser().then(function (user) {
        return user.name;
      }, function (reason) {
        return 'default name';
      }).then(function (userName) {
        // If `findUser` fulfilled, `userName` will be the user's name, otherwise it
        // will be `'default name'`
      });

                 findUser().then(function (user) {
        throw new Error('Found user, but still unhappy');
      }, function (reason) {
        throw new Error('`findUser` rejected and we're unhappy');
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // if `findUser` fulfilled, `reason` will be 'Found user, but still unhappy'.
        // If `findUser` rejected, `reason` will be '`findUser` rejected and we're unhappy'.
      });
                 ```
                 If the downstream promise does not specify a rejection handler, rejection reasons will be propagated further downstream.

                 ```js
                 findUser().then(function (user) {
        throw new PedagogicalException('Upstream error');
      }).then(function (value) {
        // never reached
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // The `PedgagocialException` is propagated all the way down to here
      });
                 ```

                 Assimilation
                 ------------

                 Sometimes the value you want to propagate to a downstream promise can only be
                 retrieved asynchronously. This can be achieved by returning a promise in the
                 fulfillment or rejection handler. The downstream promise will then be pending
                 until the returned promise is settled. This is called *assimilation*.

                 ```js
                 findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // The user's comments are now available
      });
                 ```

                 If the assimliated promise rejects, then the downstream promise will also reject.

                 ```js
                 findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // If `findCommentsByAuthor` fulfills, we'll have the value here
      }, function (reason) {
        // If `findCommentsByAuthor` rejects, we'll have the reason here
      });
                 ```

                 Simple Example
                 --------------

                 Synchronous Example

                 ```javascript
                 var result;

                 try {
        result = findResult();
        // success
      } catch(reason) {
        // failure
      }
                 ```

                 Errback Example

                 ```js
                 findResult(function(result, err){
        if (err) {
          // failure
        } else {
          // success
        }
      });
                 ```

                 Promise Example;

                 ```javascript
                 findResult().then(function(result){
        // success
      }, function(reason){
        // failure
      });
                 ```

                 Advanced Example
                 --------------

                 Synchronous Example

                 ```javascript
                 var author, books;

                 try {
        author = findAuthor();
        books  = findBooksByAuthor(author);
        // success
      } catch(reason) {
        // failure
      }
                 ```

                 Errback Example

                 ```js

                 function foundBooks(books) {

      }

                 function failure(reason) {

      }

                 findAuthor(function(author, err){
        if (err) {
          failure(err);
          // failure
        } else {
          try {
            findBoooksByAuthor(author, function(books, err) {
              if (err) {
                failure(err);
              } else {
                try {
                  foundBooks(books);
                } catch(reason) {
                  failure(reason);
                }
              }
            });
          } catch(error) {
            failure(err);
          }
          // success
        }
      });
                 ```

                 Promise Example;

                 ```javascript
                 findAuthor().
                 then(findBooksByAuthor).
                 then(function(books){
          // found books
      }).catch(function(reason){
        // something went wrong
      });
                 ```

                 @method then
                 @param {Function} onFulfilled
                 @param {Function} onRejected
                 @param {String} label optional string for labeling the promise.
                 Useful for tooling.
                 @return {Promise}
                 */
                then: function(onFulfillment, onRejection, label) {
                    var parent = this;
                    var state = parent._state;

                    if (state === FULFILLED && !onFulfillment || state === REJECTED && !onRejection) {
                        if (config.instrument) {
                            instrument('chained', this, this);
                        }
                        return this;
                    }

                    parent._onerror = null;

                    var child = new this.constructor(noop, label);
                    var result = parent._result;

                    if (config.instrument) {
                        instrument('chained', parent, child);
                    }

                    if (state) {
                        var callback = arguments[state - 1];
                        config.async(function(){
                            invokeCallback(state, child, callback, result);
                        });
                    } else {
                        subscribe(parent, child, onFulfillment, onRejection);
                    }

                    return child;
                },

                /**
                 `catch` is simply sugar for `then(undefined, onRejection)` which makes it the same
                 as the catch block of a try/catch statement.

                 ```js
                 function findAuthor(){
        throw new Error('couldn't find that author');
      }

                 // synchronous
                 try {
        findAuthor();
      } catch(reason) {
        // something went wrong
      }

                 // async with promises
                 findAuthor().catch(function(reason){
        // something went wrong
      });
                 ```

                 @method catch
                 @param {Function} onRejection
                 @param {String} label optional string for labeling the promise.
                 Useful for tooling.
                 @return {Promise}
                 */
                'catch': function(onRejection, label) {
                    return this.then(null, onRejection, label);
                },

                /**
                 `finally` will be invoked regardless of the promise's fate just as native
                 try/catch/finally behaves

                 Synchronous example:

                 ```js
                 findAuthor() {
        if (Math.random() > 0.5) {
          throw new Error();
        }
        return new Author();
      }

                 try {
        return findAuthor(); // succeed or fail
      } catch(error) {
        return findOtherAuther();
      } finally {
        // always runs
        // doesn't affect the return value
      }
                 ```

                 Asynchronous example:

                 ```js
                 findAuthor().catch(function(reason){
        return findOtherAuther();
      }).finally(function(){
        // author was either found, or not
      });
                 ```

                 @method finally
                 @param {Function} callback
                 @param {String} label optional string for labeling the promise.
                 Useful for tooling.
                 @return {Promise}
                 */
                'finally': function(callback, label) {
                    var constructor = this.constructor;

                    return this.then(function(value) {
                        return constructor.resolve(callback()).then(function(){
                            return value;
                        });
                    }, function(reason) {
                        return constructor.resolve(callback()).then(function(){
                            throw reason;
                        });
                    }, label);
                }
            };
        });
    enifed("rsvp/promise/all",
        ["../enumerator","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var Enumerator = __dependency1__["default"];

            /**
             `RSVP.Promise.all` accepts an array of promises, and returns a new promise which
             is fulfilled with an array of fulfillment values for the passed promises, or
             rejected with the reason of the first passed promise to be rejected. It casts all
             elements of the passed iterable to promises as it runs this algorithm.

             Example:

             ```javascript
             var promise1 = RSVP.resolve(1);
             var promise2 = RSVP.resolve(2);
             var promise3 = RSVP.resolve(3);
             var promises = [ promise1, promise2, promise3 ];

             RSVP.Promise.all(promises).then(function(array){
        // The array here would be [ 1, 2, 3 ];
      });
             ```

             If any of the `promises` given to `RSVP.all` are rejected, the first promise
             that is rejected will be given as an argument to the returned promises's
             rejection handler. For example:

             Example:

             ```javascript
             var promise1 = RSVP.resolve(1);
             var promise2 = RSVP.reject(new Error("2"));
             var promise3 = RSVP.reject(new Error("3"));
             var promises = [ promise1, promise2, promise3 ];

             RSVP.Promise.all(promises).then(function(array){
        // Code here never runs because there are rejected promises!
      }, function(error) {
        // error.message === "2"
      });
             ```

             @method all
             @static
             @param {Array} entries array of promises
             @param {String} label optional string for labeling the promise.
             Useful for tooling.
             @return {Promise} promise that is fulfilled when all `promises` have been
             fulfilled, or rejected if any of them become rejected.
             @static
             */
            __exports__["default"] = function all(entries, label) {
                return new Enumerator(this, entries, true /* abort on reject */, label).promise;
            }
        });
    enifed("rsvp/promise/race",
        ["../utils","../-internal","exports"],
        function(__dependency1__, __dependency2__, __exports__) {
            "use strict";
            var isArray = __dependency1__.isArray;

            var noop = __dependency2__.noop;
            var resolve = __dependency2__.resolve;
            var reject = __dependency2__.reject;
            var subscribe = __dependency2__.subscribe;
            var PENDING = __dependency2__.PENDING;

            /**
             `RSVP.Promise.race` returns a new promise which is settled in the same way as the
             first passed promise to settle.

             Example:

             ```javascript
             var promise1 = new RSVP.Promise(function(resolve, reject){
        setTimeout(function(){
          resolve('promise 1');
        }, 200);
      });

             var promise2 = new RSVP.Promise(function(resolve, reject){
        setTimeout(function(){
          resolve('promise 2');
        }, 100);
      });

             RSVP.Promise.race([promise1, promise2]).then(function(result){
        // result === 'promise 2' because it was resolved before promise1
        // was resolved.
      });
             ```

             `RSVP.Promise.race` is deterministic in that only the state of the first
             settled promise matters. For example, even if other promises given to the
             `promises` array argument are resolved, but the first settled promise has
             become rejected before the other promises became fulfilled, the returned
             promise will become rejected:

             ```javascript
             var promise1 = new RSVP.Promise(function(resolve, reject){
        setTimeout(function(){
          resolve('promise 1');
        }, 200);
      });

             var promise2 = new RSVP.Promise(function(resolve, reject){
        setTimeout(function(){
          reject(new Error('promise 2'));
        }, 100);
      });

             RSVP.Promise.race([promise1, promise2]).then(function(result){
        // Code here never runs
      }, function(reason){
        // reason.message === 'promise 2' because promise 2 became rejected before
        // promise 1 became fulfilled
      });
             ```

             An example real-world use case is implementing timeouts:

             ```javascript
             RSVP.Promise.race([ajax('foo.json'), timeout(5000)])
             ```

             @method race
             @static
             @param {Array} promises array of promises to observe
             @param {String} label optional string for describing the promise returned.
             Useful for tooling.
             @return {Promise} a promise which settles in the same way as the first passed
             promise to settle.
             */
            __exports__["default"] = function race(entries, label) {
                /*jshint validthis:true */
                var Constructor = this;

                var promise = new Constructor(noop, label);

                if (!isArray(entries)) {
                    reject(promise, new TypeError('You must pass an array to race.'));
                    return promise;
                }

                var length = entries.length;

                function onFulfillment(value) {
                    resolve(promise, value);
                }

                function onRejection(reason) {
                    reject(promise, reason);
                }

                for (var i = 0; promise._state === PENDING && i < length; i++) {
                    subscribe(Constructor.resolve(entries[i]), undefined, onFulfillment, onRejection);
                }

                return promise;
            }
        });
    enifed("rsvp/promise/reject",
        ["../-internal","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var noop = __dependency1__.noop;
            var _reject = __dependency1__.reject;

            /**
             `RSVP.Promise.reject` returns a promise rejected with the passed `reason`.
             It is shorthand for the following:

             ```javascript
             var promise = new RSVP.Promise(function(resolve, reject){
        reject(new Error('WHOOPS'));
      });

             promise.then(function(value){
        // Code here doesn't run because the promise is rejected!
      }, function(reason){
        // reason.message === 'WHOOPS'
      });
             ```

             Instead of writing the above, your code now simply becomes the following:

             ```javascript
             var promise = RSVP.Promise.reject(new Error('WHOOPS'));

             promise.then(function(value){
        // Code here doesn't run because the promise is rejected!
      }, function(reason){
        // reason.message === 'WHOOPS'
      });
             ```

             @method reject
             @static
             @param {Any} reason value that the returned promise will be rejected with.
             @param {String} label optional string for identifying the returned promise.
             Useful for tooling.
             @return {Promise} a promise rejected with the given `reason`.
             */
            __exports__["default"] = function reject(reason, label) {
                /*jshint validthis:true */
                var Constructor = this;
                var promise = new Constructor(noop, label);
                _reject(promise, reason);
                return promise;
            }
        });
    enifed("rsvp/promise/resolve",
        ["../-internal","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var noop = __dependency1__.noop;
            var _resolve = __dependency1__.resolve;

            /**
             `RSVP.Promise.resolve` returns a promise that will become resolved with the
             passed `value`. It is shorthand for the following:

             ```javascript
             var promise = new RSVP.Promise(function(resolve, reject){
        resolve(1);
      });

             promise.then(function(value){
        // value === 1
      });
             ```

             Instead of writing the above, your code now simply becomes the following:

             ```javascript
             var promise = RSVP.Promise.resolve(1);

             promise.then(function(value){
        // value === 1
      });
             ```

             @method resolve
             @static
             @param {Any} value value that the returned promise will be resolved with
             @param {String} label optional string for identifying the returned promise.
             Useful for tooling.
             @return {Promise} a promise that will become fulfilled with the given
             `value`
             */
            __exports__["default"] = function resolve(object, label) {
                /*jshint validthis:true */
                var Constructor = this;

                if (object && typeof object === 'object' && object.constructor === Constructor) {
                    return object;
                }

                var promise = new Constructor(noop, label);
                _resolve(promise, object);
                return promise;
            }
        });
    enifed("rsvp/race",
        ["./promise","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var Promise = __dependency1__["default"];

            /**
             This is a convenient alias for `RSVP.Promise.race`.

             @method race
             @static
             @for RSVP
             @param {Array} array Array of promises.
             @param {String} label An optional label. This is useful
             for tooling.
             */
            __exports__["default"] = function race(array, label) {
                return Promise.race(array, label);
            }
        });
    enifed("rsvp/reject",
        ["./promise","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var Promise = __dependency1__["default"];

            /**
             This is a convenient alias for `RSVP.Promise.reject`.

             @method reject
             @static
             @for RSVP
             @param {Any} reason value that the returned promise will be rejected with.
             @param {String} label optional string for identifying the returned promise.
             Useful for tooling.
             @return {Promise} a promise rejected with the given `reason`.
             */
            __exports__["default"] = function reject(reason, label) {
                return Promise.reject(reason, label);
            }
        });
    enifed("rsvp/resolve",
        ["./promise","exports"],
        function(__dependency1__, __exports__) {
            "use strict";
            var Promise = __dependency1__["default"];

            /**
             This is a convenient alias for `RSVP.Promise.resolve`.

             @method resolve
             @static
             @for RSVP
             @param {Any} value value that the returned promise will be resolved with
             @param {String} label optional string for identifying the returned promise.
             Useful for tooling.
             @return {Promise} a promise that will become fulfilled with the given
             `value`
             */
            __exports__["default"] = function resolve(value, label) {
                return Promise.resolve(value, label);
            }
        });
    enifed("rsvp/rethrow",
        ["exports"],
        function(__exports__) {
            "use strict";
            /**
             `RSVP.rethrow` will rethrow an error on the next turn of the JavaScript event
             loop in order to aid debugging.

             Promises A+ specifies that any exceptions that occur with a promise must be
             caught by the promises implementation and bubbled to the last handler. For
             this reason, it is recommended that you always specify a second rejection
             handler function to `then`. However, `RSVP.rethrow` will throw the exception
             outside of the promise, so it bubbles up to your console if in the browser,
             or domain/cause uncaught exception in Node. `rethrow` will also throw the
             error again so the error can be handled by the promise per the spec.

             ```javascript
             function throws(){
        throw new Error('Whoops!');
      }

             var promise = new RSVP.Promise(function(resolve, reject){
        throws();
      });

             promise.catch(RSVP.rethrow).then(function(){
        // Code here doesn't run because the promise became rejected due to an
        // error!
      }, function (err){
        // handle the error here
      });
             ```

             The 'Whoops' error will be thrown on the next turn of the event loop
             and you can watch for it in your console. You can also handle it using a
             rejection handler given to `.then` or `.catch` on the returned promise.

             @method rethrow
             @static
             @for RSVP
             @param {Error} reason reason the promise became rejected.
             @throws Error
             @static
             */
            __exports__["default"] = function rethrow(reason) {
                setTimeout(function() {
                    throw reason;
                });
                throw reason;
            }
        });
    enifed("rsvp/utils",
        ["exports"],
        function(__exports__) {
            "use strict";
            function objectOrFunction(x) {
                return typeof x === 'function' || (typeof x === 'object' && x !== null);
            }

            __exports__.objectOrFunction = objectOrFunction;function isFunction(x) {
                return typeof x === 'function';
            }

            __exports__.isFunction = isFunction;function isMaybeThenable(x) {
                return typeof x === 'object' && x !== null;
            }

            __exports__.isMaybeThenable = isMaybeThenable;var _isArray;
            if (!Array.isArray) {
                _isArray = function (x) {
                    return Object.prototype.toString.call(x) === '[object Array]';
                };
            } else {
                _isArray = Array.isArray;
            }

            var isArray = _isArray;
            __exports__.isArray = isArray;
            // Date.now is not available in browsers < IE9
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now#Compatibility
            var now = Date.now || function() { return new Date().getTime(); };
            __exports__.now = now;
            function F() { }

            var o_create = (Object.create || function (o) {
                if (arguments.length > 1) {
                    throw new Error('Second argument not supported');
                }
                if (typeof o !== 'object') {
                    throw new TypeError('Argument must be an object');
                }
                F.prototype = o;
                return new F();
            });
            __exports__.o_create = o_create;
        });
    requireModule("ember");

    exports = module.exports = Alto;

})();