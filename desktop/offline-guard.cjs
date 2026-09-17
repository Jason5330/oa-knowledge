// Loaded BEFORE application code, in both Node services. Defense in depth;
// IT should additionally validate with the corporate firewall / offline VM.
const net = require('node:net');
const dns = require('node:dns');
const spawnParserProcess=require('node:child_process').spawn;
const { allowedAddress, allowedUrl } = require('./policy.cjs');
const ports = (process.env.OA_LOCAL_PORTS || '').split(',').map(Number).filter(Boolean);
// Trusted runtime can allow ONE explicitly configured loopback model port.
const basePorts=[...ports];
module.exports.setModelPort=port=>{ports.splice(0,ports.length,...basePorts);if(Number.isInteger(port)&&port>=1024&&port<=65535)ports.push(port);};
module.exports.launchDocumentParser=()=>spawnParserProcess(process.execPath,['--max-old-space-size=512','--require',__filename,require('node:path').join(__dirname,'runtime/parser-process.cjs')],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,OA_PARENT_PID:String(process.pid)}});
function denied(target) {
  const error = new Error(`OA_OFFLINE: connection or process blocked (${target})`);
  error.code = 'OA_OFFLINE';
  return error;
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // Node normalizes connect arguments into an array for internal calls.
  const values = Array.isArray(args[0]) ? args[0] : args;
  const options = typeof values[0] === 'object' ? values[0] : { port: values[0], host: typeof values[1] === 'string' ? values[1] : 'localhost' };
  if (options.path || !allowedAddress(options.host || 'localhost', options.port, ports)) {
    throw denied('network destination');
  }
  return connect.apply(this, args);
};
const fetchOriginal = global.fetch;
global.fetch = function (input, init) {
  if (!allowedUrl(typeof input === 'string' || input instanceof URL ? input : input.url, ports)) {
    return Promise.reject(denied('fetch destination'));
  }
  return fetchOriginal.call(this, input, init);
};
const lookup = dns.lookup;
dns.lookup = function (host, ...args) {
  if (!['localhost','127.0.0.1','::1'].includes(host)) throw denied('DNS');
  return lookup.call(this, host, ...args);
};
for (const name of Object.keys(dns)) {
  if (name.startsWith('resolve') || name === 'reverse') dns[name] = () => { throw denied('DNS'); };
}
for (const name of Object.keys(dns.promises)) {
  if (name.startsWith('resolve') || name === 'reverse' || name === 'lookup') dns.promises[name] = async () => { throw denied('DNS'); };
}
require('node:dgram').createSocket = () => { throw denied('UDP'); };
for (const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']) {
  require('node:child_process')[name] = () => { throw denied('child process'); };
}
require('node:module').syncBuiltinESMExports();
// Sidecars terminate if the owning desktop exits unexpectedly.
const parentPid=Number(process.env.OA_PARENT_PID);
if(Number.isInteger(parentPid)&&parentPid>0)setInterval(()=>{
  try{process.kill(parentPid,0);}catch(error){if(error.code==='ESRCH')process.exit(0);}
},2000).unref();
