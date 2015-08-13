Games = new Mongo.Collection('games');
Players = new Mongo.Collection('players');
Sanitaire = {};

Sanitaire.boardWidth = 320;
Sanitaire.boardHeight = 568;

Sanitaire.getRandomLocationOnBoard = function (options) {
    options = _.extend({
        width: Sanitaire.boardWidth,
        height: Sanitaire.boardHeight
    }, options);

    return {
        x: Math.random() * options.width,
        y: Math.random() * options.height
    }
};

Sanitaire.createGame = function (ownerUserId) {
    // Create a game to join into
    return Games.insert({
        ownerId: ownerUserId,
        createdAt: new Date(),
        userIds: [],
        playerIds: [],
        playerCount: 0,
        patientZero: {
            // Assign a location to patient zero
            // TODO: Do patient zero location assignment in a more sophisticated way
            location: Sanitaire.getRandomLocationOnBoard()
        }
    });
};

Sanitaire.joinGame = function (gameId, userId) {
    // Create a player record, which contains information about their dot
    var existingPlayer = Players.findOne({gameId: gameId, userId: userId});
    if (existingPlayer) {
        return existingPlayer._id;
    }

    // Create a new player record
    var playerId = Players.insert({
        gameId: gameId,
        userId: userId,
        // Assign the location to the player
        // TODO: Do player location assignment in a more sophisticated way
        location: Sanitaire.getRandomLocationOnBoard(),
        createdAt: new Date(),
        // Am I connected to any player? If yes, draw the line
        connectedToPlayerId: null,
        // How many connection attempts do I have remaining?
        connectionsRemainingCount: 9999
    });

    Games.update(gameId, {
        $addToSet: {
            playerIds: playerId,
            userIds: userId
        },
        $inc: {
            playerCount: 1
        }
    });

    return playerId;
};

Sanitaire.quitGame = function (gameId, userId) {
    var player = Players.findOne({gameId: gameId, userId: userId});
    if (!player) {
        throw new Meteor.Error(500, 'Cannot quit a game you haven\'t joined.');
    }

    Games.update(gameId, {
        $pull: {
            playerIds: player._id,
            userIds: userId
        },
        $inc: {
            playerCount: -1
        }
    });

    // Disconnect everyone connected to this player
    Players.update({gameId: gameId, connectedToPlayerId: player._id}, {$set: {connectedToPlayerId: null}});

    // Remove this player
    Players.remove(player._id);
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

Meteor.methods({
    createGame: function () {
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