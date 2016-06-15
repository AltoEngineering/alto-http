// ==========================================================================
// Project: Alto Server - JavaScript Application Framework
// Copyright: @2016 The Code Boutique, LLC
// License:   Intellectual property of The Code Boutique. LLC
// ==========================================================================

/*
 Expose Alto.CassandraQueryObject namespace
 */
exports = Alto.CassandraQueryObject;

Alto.CassandraQueryObject = Alto.Object.extend({

    keyspace: null,

    table: null,

    data: null,

    criteria: null,

    keys: Alto.computed(function () {
        return Alto.keys(this.get('data'));
    }),

    params: Alto.computed(function () {
        var that = this,
            values = this.get('keys').map(function (key) { return that.get('data')[key]});
        return values;
    }),

    _keys: Alto.computed('keys', function () {
        var keys = this.get('keys').join(',');

        return keys;
    }),

    _values: Alto.computed('keys', function () {
        var valuesArray = this.get('keys').map(function () { return '?'}),
            values = valuesArray.join(',');

        return values;
    }),

    _keysAndValuesConcat: Alto.computed('keys', function () {
        var that = this,
            keys = this.get('keys'),
            keysAndValuesArray = keys.map(function (key, idx) { return '%@=?'.fmt(key) }),
            keysAndValuesConcat = keysAndValuesArray.join(',');
        
        return keysAndValuesConcat;
    }),

    insertQuery: Alto.computed(function () {
        var query,
            keyspace = this.get('keyspace'),
            table = this.get('table'),
            keys = this.get('_keys'),
            values = this.get('_values');

        query = "INSERT INTO %@.%@ (%@) VALUES (%@)".fmt(keyspace, table, keys, values);
        
        return query;
    }),

    updateQuery: Alto.computed(function () {
        var query,
            keyspace = this.get('keyspace'),
            table = this.get('table'),
            keysAndValuesConcat = this.get('_keysAndValuesConcat'),
            criteria = this.get('criteria');

        query =  "UPDATE %@.%@ SET %@ WHERE %@".fmt(keyspace, table, keysAndValuesConcat, criteria);

        return query;
    }),

    selectQuery: Alto.computed(function () {
        var query,
            keyspace = this.get('keyspace'),
            table = this.get('table'),
            criteria = this.get('criteria');

        if (Alto.isPresent(criteria)) {
            query = "SELECT * FROM %@.%@ WHERE %@".fmt(keyspace, table, criteria);
        } else {
            query = "SELECT * FROM %@.%@".fmt(keyspace, table);
        }

        return query;
    }),

    deleteQuery: Alto.computed(function () {
        var query,
            keyspace = this.get('keyspace'),
            table = this.get('table'),
            criteria = this.get('criteria');

        if (Alto.isPresent(criteria)) {
            query = "DELETE FROM %@.%@ WHERE %@".fmt(keyspace, table, criteria);
        } else {
            query = "DELETE FROM %@.%@".fmt(keyspace, table);
        }

        return query;
    })

});
