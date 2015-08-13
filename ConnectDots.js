Games = new Mongo.Collection('games');
Players = new Mongo.Collection('players');
Sanitaire = {};

Sanitaire.boardWidth = 100;
Sanitaire.boardHeight = 100;

Sanitaire.getRandomLocationOnBoard = function (options) {
    options = _.extend({
        gameId: null,
        distance: 0,
        width: Sanitaire.boardWidth - 30,
        height: Sanitaire.boardHeight - 30,
        anchor: {x: 15, y: 15}
    }, options);

    var currentLocations = [];
    if (options.gameId) {
        // Get all the current locations if a game ID was specified
        var patientZeroLocation = Games.findOne(options.gameId).patientZero.location;
        currentLocations = [patientZeroLocation]
            .concat(_.pluck(Players.find({gameId: options.gameId}, {fields: {location: 1}}).fetch(), 'location'));
    }

    // Generate a random point until one is found at least distance away from all other locations
    var pt;
    for (var i = 0; i < 100; i++) {
        pt = {
            x: options.anchor.x + Math.random() * options.width,
            y: options.anchor.y + Math.random() * options.height
        };

        var withinAnyPoints = _.any(currentLocations, function (currentLocation) {
            return Math.sqrt(Math.pow(currentLocation.x - pt.x, 2) + Math.pow(currentLocation.y - pt.y, 2)) < options.distance;
        });

        if (!withinAnyPoints) {
            break;
        }
    }

    return pt;
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
        location: Sanitaire.getRandomLocationOnBoard({gameId: gameId, distance: 20}),
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
    },
    quitGame: function (gameId) {
        if (!this.userId) {
            throw new Meteor.Error(403, 'Permission denied.');
        }

        return Sanitaire.quitGame(gameId, this.userId);
    }
});

Router.configure({
    authenticate: 'login'
});

Router.route('/', {
    name: 'index',
    template: 'index'
});

Router.route('/games', {
    name: 'games',
    template: 'games'
});

Router.route('/login', {
    name: 'login',
    template: 'login',
    action: function () {
        var loggedIn = !!Meteor.userId();

        if (loggedIn) {
            var redirect = Session.get('iron-router-auth');
            this.redirect(redirect.route, redirect.params, {replaceState: true});
            return;
        }

        this.render();
    }
});

Router.route('/games/:gameId', {
    name: 'game',
    template: 'game',
    onBeforeAction: ['authenticate'],
    data: function () {
        return {gameId: this.params.gameId};
    },
    action: function () {
        if (!this.joined) {
            SanitaireClient.joinGame(this.params.gameId);
            this.joined = true;
        }

        this.render();
    }
});