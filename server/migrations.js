/**
 * @author Benjamin Berman
 * © 2014 All Rights Reserved
 **/

Migrations.add({
    name: 'Add start times',
    version: 1,
    up: function () {
        Games.find({startAt: {$exists: false}}).forEach(function (game) {
            Games.update(game._id, {
                $set: {
                    startAt: moment(game.createdAt).add(2, 'minutes'),
                    // 45 second duration
                    duration: 45 * 1000,
                    state: Sanitaire.gameStates.LOBBY
                }
            });
        });
    }
});

Migrations.add({
    name: 'Indices',
    version: 2,
    up: function () {
        Players._ensureIndex({gameId: 1});
    }
});

Version = 2;

Meteor.startup(function () {
    if (!Migrations._collection.findOne('control')
        && Meteor.users.find({}).count() === 0) {
        Migrations._collection.insert({_id: 'control', version: Version, locked: false});
    } else {
        Migrations.migrateTo(Version);
    }
});