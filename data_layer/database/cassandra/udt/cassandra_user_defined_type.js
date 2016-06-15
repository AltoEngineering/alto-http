// ==========================================================================
// Project: Alto Server - JavaScript Application Framework
// Copyright: @2016 The Code Boutique, LLC
// License:   Intellectual property of The Code Boutique. LLC
// ==========================================================================

/*
 Expose Alto.CassandraQueryObject namespace
 */
exports = Alto.CassandraUserDefinedType;

Alto.CassandraUserDefinedType = Alto.Object.extend({

    keyspace: null,

    udtType: null,

    toCql: Alto.computed(function () {
        var keys = Alto.keys(this),
            that = this,
            udtMeta = '';

        if (Alto.isNone(this.get('udtType'))) {
            Alto.Logger.error('Alto.CassandraUserDefinedType requires a udtType.  Make sure you provide a value.  Cassandra UDT can not be created.');
        }

        keys.forEach(function (key) {
            if (key != 'constructor' && key != '_super' && key != 'toString' && key != 'udtType' && key != 'toCql' && key != 'keyspace') {
                var value = that.get(key);

                if (Alto.isEmpty(udtMeta)) {
                    udtMeta = '%@ %@'.fmt(key, value)
                } else {
                    udtMeta = '%@, %@ %@'.fmt(udtMeta, key, value)
                }
            }
        });

        return 'CREATE TYPE IF NOT EXISTS %@.%@ (%@)'.fmt(this.get('keyspace'), this.get('udtType'), udtMeta);

    }).volatile()

});