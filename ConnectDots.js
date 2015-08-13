Games = new Mongo.Collection('games');
Players = new Mongo.Collection('players');
Sanitaire = {};

Sanitaire.boardWidth = 100;
Sanitaire.boardHeight = 100;

/**
 * Is the given point inside the given polygon
 * @param point {[Number]} Point
 * @param polygon {[[Number]]} Polygon point list
 * @returns {boolean}
 */
Sanitaire._pointInsidePolygon = function (point, polygon) {
    // ray-casting algorithm based on
    // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html

    var x = point[0], y = point[1];

    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        var xi = polygon[i][0], yi = polygon[i][1];
        var xj = polygon[j][0], yj = polygon[j][1];

        var intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
};

Sanitaire._patientZeroInsidePlayers = function (patientZeroLocation, players) {
    return Sanitaire._pointInsidePolygon([patientZeroLocation.x, patientZeroLocation.y], _.map(players, function (player) {
        return [player.location.x, player.location.y];
    }));
};

Sanitaire.getCurrentPatientZeroLocation = function (game, time) {
    time = time || new Date();
    var t = Math.max(Math.min((Number(time) - Number(game.startAt)) / game.duration, 1), 0);
    var currentX = lerp(game.patientZero.startLocation.x, game.patientZero.endLocation.x, t);
    var currentY = lerp(game.patientZero.startLocation.y, game.patientZero.endLocation.y, t);
    return {x: currentX, y: currentY, t: t};
};

Sanitaire.isPatientZeroInCordon = function (gameId, time) {
    time = time || new Date();
    var game = Games.findOne(gameId, {fields: {patientZero: 1, startAt: 1, duration: 1}});
    if (!game) {
        return;
    }

    var location = Sanitaire.getCurrentPatientZeroLocation(game, time);

    var players = Players.find({gameId: gameId}, {
        fields: {
            location: 1,
            connectedToPlayerId: 1,
            _id: 1
        }
    }).fetch();

    var playerPolygons = Sanitaire._findPolygonPlayers(players);

    return _.any(playerPolygons, function (polygon) {
        return Sanitaire._patientZeroInsidePlayers(location, polygon)
    });
};

/**
 * Given a list of players, return arrays of polygons that they form.
 * @param players
 */
Sanitaire._findPolygonPlayers = _.memoize(function (players) {
    var playersById = _.indexBy(players, '_id');
    // Convert to vertices for Tarjan's algorithm
    var verticies = _.map(players, function (player) {
        return new Vertex(player._id);
    });

    var verticiesByName = _.indexBy(verticies, 'name');

    // Add connections
    _.each(verticies, function (vertex) {
        var connectedToPlayerId = playersById[vertex.name].connectedToPlayerId;
        if (connectedToPlayerId) {
            vertex.connections.push(verticiesByName[connectedToPlayerId]);
        }
    });

    // Create a graph representing the player polygons
    var graph = new Graph(verticies);

    // Create the Tarjan's algorithm state
    var tarjan = new Tarjan(graph);

    tarjan.run();
    // Get the polygons
    var polygons = tarjan.scc;
    // Get the polygons (polys greater than 3 length of unique items) in terms of players
    return _.map(_.filter(polygons, function (polygon) {
        return polygon.length >= 3;
    }), function (polygon) {
        return _.map(polygon, function (vertex) {
            return playersById[vertex.name];
        });
    });
}, function (players) {
    // Return the sorted edge list as the hash function
    var hash = '';

    if (players.length === 0) {
        return hash;
    }

    for (var i = 0, n = players.length; i < n; i++) {
        var player = players[i];
        hash += player._id + ':' + player.connectedToPlayerId + '/';
    }

    return hash;
});

/**
 * Reset positions for a given gameId
 * @param gameId
 */
Sanitaire.resetPositionsInGame = function (gameId) {
    Players.find({gameId: gameId}).forEach(function (player) {
        Players.update(player._id, {
            $set: {
                location: Sanitaire.getRandomLocationOnBoard({gameId: gameId, distance: 20})
            }
        });
    });
};

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

Sanitaire.gameStates = {
    LOBBY: 0,
    IN_PROGRESS: 10,
    ENDED: 20
};

Sanitaire.createGame = function (ownerUserId) {
    // Create a game to join into
    var now = new Date();
    var startAt = moment().add(2, 'minutes').toDate();
    var duration = 45 * 1000;
    var gameId = Games.insert({
        ownerId: ownerUserId,
        state: Sanitaire.gameStates.LOBBY,
        createdAt: now,
        startAt: startAt,
        userIds: [],
        playerIds: [],
        playerCount: 0,
        // Last for 45 seconds
        duration: duration,
        patientZero: {
            // Assign a location to patient zero
            startLocation: Sanitaire.getRandomLocationOnBoard(),
            endLocation: Sanitaire.getRandomLocationOnBoard()
        }
    });

    /*
     if (Meteor.isServer) {
     var startDelay = Number(startAt) - Number(now);
     Meteor.setTimeout(function () {
     Sanitaire.startGame(gameId);
     }, startDelay);
     }
     */
    /*
     // Schedule to start the game
     SyncedCron.add({
     name: 'Start game ' + gameId,
     schedule: function (parser) {
     return parser.text('at ' + startAt.toISOString());
     },
     job: function (intendedAt) {
     console.log('Starting game ' + gameId);
     Sanitaire.startGame(gameId);
     }
     });
     */
    return gameId;
};

Sanitaire.startGame = function (gameId) {
    var now = new Date();

    // Set the game to end automatically after a certain amount of time
    var game = Games.findOne(gameId, {fields: {duration: 1}});
    Meteor.setTimeout(function () {
        Sanitaire.endGame(gameId);
    }, now + game.duration);

    return Games.update({_id: gameId, state: Sanitaire.gameStates.LOBBY}, {
        $set: {
            startAt: now,
            state: Sanitaire.gameStates.IN_PROGRESS
        }
    });
};

Sanitaire.endGame = function (gameId) {
    return Games.update({_id: gameId, state: Sanitaire.gameStates.IN_PROGRESS}, {
        $set: {
            state: Sanitaire.gameStates.ENDED
        }
    });
};

Sanitaire.joinGame = function (gameId, userId) {
    if (Games.find(gameId).count() === 0) {
        if (Meteor.isClient) {
            return;
        }
        throw new Meteor.Error(504, 'No game found.');
    }
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

    // Are there enough players to start a game?
    var game = Games.findOne(gameId);
    if (game.playerCount >= 5) {
        Sanitaire.startGame(gameId);
    }

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