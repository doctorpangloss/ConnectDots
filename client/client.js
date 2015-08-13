/**
 * @author Benjamin Berman
 * © 2014 All Rights Reserved
 **/
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
        return Players.find({gameId: this.gameId}).map(function (player) {
            if (player.connectedToPlayerId) {
                // TODO: Maybe move this join to the server?
                player.connectedPlayer = Players.findOne(player.connectedToPlayerId, {reactive: false});
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