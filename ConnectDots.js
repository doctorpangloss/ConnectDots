Games = new Mongo.Collection('games');
Players = new Mongo.Collection('players');
Sanitaire = {};

Sanitaire.createGame = function (ownerUserId) {
    // Create a game to join into
    return Games.insert({
        ownerId: ownerUserId,
        createdAt: new Date(),
        userIds: [],
        playerIds: [],
        patientZero: {
            // Assign a location to patient zero
            // TODO: Do patient zero location assignment in a more sophisticated way
            location: {
                x: Math.random(),
                y: Math.random()
            }
        }
    });
};

Sanitaire.joinGame = function (gameId, userId) {
    // Create a player record, which contains information about their dot
    if (Players.find({gameId: gameId, userId: userId}).count() > 0) {
        return;
    }

    // Create a new player record
    return Players.insert({
        gameId: gameId,
        userId: userId,
        // Assign the location to the player
        // TODO: Do player location assignment in a more sophisticated way
        location: {
            x: Math.random(),
            y: Math.random()
        },
        createdAt: new Date(),
        // Am I connected to any player? If yes, draw the line
        connectedToPlayerId: null,
        // How many connection attempts do I have remaining?
        connectionsRemainingCount: 5
    });
};

Sanitaire.tryConnectPlayers = function (originPlayerId, destinationPlayerId) {
    // Decrement the connections remaining count, and connect the players. If destination is null, do not decrement
    check(originPlayerId, String);
    check(destinationPlayerId, Match.OneOf(String, null));
    return Players.update({_id: originPlayerId, connectionsRemainingCount: {$gt: 0}}, {
        // If destination is null, do not decrement
        $inc: {connectionsRemainingCount: destinationPlayerId == null ? 0 : -1},
        $set: {connectedToPlayerId: destinationPlayerId}
    });
};

Accounts.onCreateUser(function () {

});

Meteor.methods({
    createdGame: function () {
        if (!this.userId) {
            throw new Meteor.Error(403, 'Permission denied.');
        }
        return Sanitaire.createGame(this.userId);
    },
    joinGame: function (gameId) {
        if (!this.userId) {
            throw new Meteor.Error(403, 'Permission denied.');
        }
        return Sanitaire.joinGame(gameId, this.userId);
    },
    connectToPlayer: function (destinationPlayerId) {
        if (!this.userId) {
            throw new Meteor.Error(403, 'Permission denied.');
        }

        // Reconstruct all the necessary information
        var destinationPlayer = Players.findOne(destinationPlayerId);
        var gameId = destinationPlayer.gameId;
        var thisPlayer = Players.findOne({gameId: gameId, userId: this.userId});
        return Sanitaire.tryConnectPlayers(thisPlayer._id, destinationPlayer._id);
    }
});