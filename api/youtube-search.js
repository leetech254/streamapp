const handler = require('./youtube/index.js');

module.exports = function youtubeSearchHandler(req, res) {
  return handler(req, res);
};
