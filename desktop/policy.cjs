// Shared pure policy: no DNS aliases, remote addresses, or arbitrary local services.
const LOOPBACK = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);
function allowedAddress(host, port, ports) {
  return LOOPBACK.has(String(host).toLowerCase()) && ports.includes(Number(port));
}
function allowedUrl(value, ports) {
  try {
    const u = new URL(value);
    return ['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol) &&
      !u.username && !u.password && allowedAddress(u.hostname, u.port || (u.protocol === 'https:' ? 443 : 80), ports);
  } catch { return false; }
}
function allowedApi(method, route) {
  const p = route.replace(/^\/api/, '');
  if (method === 'GET' && p === '/ping') return true;
  if (method === 'POST' && p === '/workspace/new') return true;
  if (method === 'POST' && /^\/workspace\/[^/]+\/upload-and-embed$/.test(p)) return true;
  if (method === 'DELETE' && /^\/workspace\/[^/]+$/.test(p)) return true;
  return false;
}
module.exports = { allowedAddress, allowedUrl, allowedApi };
