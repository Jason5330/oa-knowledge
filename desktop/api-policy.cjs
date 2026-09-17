const { timingSafeEqual } = require('node:crypto');
const { allowedApi } = require('./policy.cjs');
function sameToken(value, expected) {
  if (!expected || typeof value !== 'string') return false;
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
module.exports = function oaPolicy(req, res, next) {
  if (!sameToken(req.headers['x-oa-session'], process.env.OA_SESSION_TOKEN)) return res.status(403).json({error:'Desktop session required'});
  if (!req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/api/oa/')) return next();
  if (!allowedApi(req.method, req.path)) return res.status(403).json({error:'此功能未包含在本機離線測試版。', success:false});
  next();
};
