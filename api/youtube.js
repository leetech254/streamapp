const handler = require('./youtube/index.js');

module.exports = function youtubeRootHandler(req, res) {
  return handler(req, res);
};
