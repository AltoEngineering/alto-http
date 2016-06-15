// ==========================================================================
// Project: Alto Server - JavaScript Application Framework
// Copyright: @2016 The Code Boutique, LLC
// License:   Intellectual property of The Code Boutique. LLC
// ==========================================================================

/*
 Expose Alto.Statechart namespace
 */
exports = Alto.Statechart;

Alto.Statechart = Alto.Object.extend({

    currentState: null,

    currentSubstate: null,

    goToState: function (state) {
        var currentState = this.get('currentState'),
            currentSubstate = this.get('currentSubstate'),
            that = this;

        if (Alto.isPresent(currentState) && Alto.isPresent(currentSubstate)) {
            this._exitAndResetStateSubstate(currentState, currentSubstate);
        } else if (Alto.isPresent(currentState)) {
            this._exitAndResetState(currentState);
        }

        Alto.run.next(function () {
            that._enterAndSetState(state);
        });
    },

    dispatchEvent: function () {
        var currentState = this.get('currentState'),
            eventName = Array.prototype.slice.call(arguments)[0],
            args = Array.prototype.slice.call(arguments);

        args.shift();

        currentState[eventName].apply(this, args);
    },

    _exitAndResetStateSubstate: function (currentState, currentSubstate) {
        currentSubstate.exitState();
        currentState.exitState();

        //console.log (clc.xterm(220)('Exit substate: %@'.fmt(currentSubstate)));
        //console.log (clc.xterm(220)('Exit state: %@'.fmt(currentState)));

        this.set('currentState', '');
        this.set('currentSubstate', '');
    },

    _exitAndResetState: function (currentState) {
        currentState.exitState();

        // console.log (clc.xterm(220)('Exit state: %@'.fmt(currentState)));

        this.set('currentState', '');
    },

    _enterAndSetState: function (state) {
        //console.log (clc.xterm(154)('Enter state: %@'.fmt(state)));
        this.set('currentState', state);
        state.enterState();
    }

});