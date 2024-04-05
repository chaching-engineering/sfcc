'use strict';

 /* global session */

var server = require('server');
server.extend(module.superModule);

server.append('Show', function (req, res, next) {
    var clickId = 'chachingc' in req.querystring ? req.querystring.chachingc : '';

    if (clickId) {
        if (!session.privacy.clickId || session.privacy.clickId !== clickId) {
            session.privacy.clickId = clickId;
        }
    }

    next();
});

module.exports = server.exports();
