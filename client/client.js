/**
 * @author Benjamin Berman
 * © 2014 All Rights Reserved
 **/

Accounts.ui.config({
    passwordSignupFields: 'USERNAME_ONLY'
});

//Meteor.startup(function () {
//    // Create a guest account on startup if we're not logged in yet
//    if (!Meteor.userId()) {
//        Accounts.createUser({
//            username: 'Guest ' + Random.id(),
//            password: Random.id()
//        });
//    }
//});

// When we close the window, make sure to quit the game
$(window).bind("beforeunload", function () {
    var gameId = SanitaireClient.getCurrentGameId();
    if (gameId) {
        Meteor.call('quitGame', gameId);
    }
});

SanitaireClient = {};
SanitaireClient.getCurrentGameId = function () {
    return Router.current().params.gameId;
    //return Session.get('gameId');
};
SanitaireClient.setCurrentGameId = function (gameId) {
    //Session.set('gameId', gameId);
};

SanitaireClient.joinGame = function (gameId) {
    Meteor.call('joinGame', gameId, function (err, playerId) {
        if (err) {
            // TODO: Show an error toast
            return;
        }
        console.log('Joined game with playerId ' + playerId);
        SanitaireClient.setCurrentGameId(gameId);
    });
};

UI.registerHelper('$currentGameId', function () {
    return SanitaireClient.getCurrentGameId();
});

Template.board.helpers({
    players: function () {
        var userId = Meteor.userId();
        return Players.find({gameId: this.gameId}).map(function (player) {
            if (player.connectedToPlayerId) {
                // TODO: Maybe move this join to the server?
                player.connectedPlayer = Players.findOne(player.connectedToPlayerId, {reactive: false});
            }

            if (player.userId === userId) {
                player.fill = '#03FF21';
                player.stroke = '#210340';
            } else {
                player.fill = '#034021';
                player.stroke = '#000000';
            }

            return player;
        });
    },
    boardWidth: function () {
        return Sanitaire.boardWidth;
    },
    boardHeight: function () {
        return Sanitaire.boardHeight;
    },
    game: function () {
        return Games.findOne(this.gameId);
    }
});

Template.board.events({
    'click [data-action="connect"]': function () {
        Meteor.call('connectToPlayer', this._id);
    }
});

Template.games.helpers({
    games: function () {
        return Games.find();
    }
});

Template.games.events({
    'click [data-action="new-game"]': function () {
        Meteor.call('createGame');
    }
});

// Make sure there's a timer running. No good way to scope this.
var timerDependency = new Tracker.Dependency();
Meteor.setInterval(function () {
    timerDependency.changed();
}, 1000);

Template.game.helpers({
    isPatientZeroInCordon: function () {
        timerDependency.depend();
        var now = new Date();
        return Sanitaire.isPatientZeroInCordon(this.gameId, now);
    },
    timeRemaining: function () {
        timerDependency.depend();
        var game = Games.findOne(this.gameId, {fields: {startAt: 1, duration: 1}});
        var now = new Date();
        var millisecondsRemaining = game && (game.duration - Number(now) + Number(game.startAt));
        return game
            && game.startAt
            && Math.ceil(millisecondsRemaining / 1000);
    },
    game: function () {
        return Games.findOne(this.gameId);
    }
});

// Make sure to animate patient zero
Template.game.onRendered(function () {
    // Respond to changes to the game's patient zero document
    this.autorun(function () {
        var templateData = Template.currentData();
        var game = Games.findOne(templateData.gameId, {
            fields: {
                state: 1,
                patientZero: 1,
                duration: 1,
                startAt: 1
            }
        });

        // If no game is found return
        if (!game) {
            return;
        }

        // Get the patient zero element
        // Set its position to where it ought to be this moment
        var now = new Date();
        var location = Sanitaire.getCurrentPatientZeroLocation(game, now);

        var duration = Math.max(Number(game.startAt) + game.duration - Number(now), 0);
        // If we're not in progress mode return
        if (game.state !== Sanitaire.gameStates.IN_PROGRESS) {
            return;
        }

        Tracker.afterFlush(function () {
            var patientZeroElement = $('#patient-zero');

            patientZeroElement.attr('cx', location.x);
            patientZeroElement.attr('cy', location.y);
            // Set up its animation
            patientZeroElement.velocity('stop').velocity({
                properties: {cx: game.patientZero.endLocation.x, cy: game.patientZero.endLocation.y},
                options: {
                    duration: duration,
                    easing: 'linear'
                }
            });
        });

    });
});