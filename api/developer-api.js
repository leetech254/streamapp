const handler = require('./developer/[...path].js');

module.exports = function developerApiRoot(req, res) {
  req.query = { ...(req.query || {}), path: req.query && req.query.path ? req.query.path : 'auth' };
  return handler(req, res);
};
