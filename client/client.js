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
    return Session.get('gameId');
};
SanitaireClient.setCurrentGameId = function (gameId) {
    Session.set('gameId', gameId);
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
            } else {
                player.fill = '#034021';
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