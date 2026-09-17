const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {allowedUrl,allowedApi}=require('../policy.cjs');
test('allow only exact loopback ports, reject remote aliases and credentials',()=>{
  assert.equal(allowedUrl('http://127.0.0.1:32123/api',[32123]),true);
  for(const url of ['http://127.0.0.1:11434','https://example.com','http://127.0.0.1.evil.test:32123','file:///C:/secret','http://user@127.0.0.1:32123','http://192.168.1.2:32123'])assert.equal(allowedUrl(url,[32123]),false,url);
});
test('remote integrations and configuration mutation are denied',()=>{
  assert.equal(allowedApi('POST','/api/workspace/test/upload-and-embed'),true);
  for(const route of ['/api/workspace/test/upload-link','/api/system/update-env','/api/mcp-servers','/api/agent-flows','/api/system/validate-sql-connection','/api/system/transcribe-audio'])assert.equal(allowedApi('POST',route),false,route);
});
test('actual preload rejects network, DNS and subprocess attempts',()=>{
  const script=`const assert=require('assert/strict');const net=require('net');assert.throws(()=>net.connect(443,'1.1.1.1'),/OA_OFFLINE/);assert.throws(()=>require('dns').lookup('example.com',()=>{}),/OA_OFFLINE/);assert.throws(()=>require('child_process').spawn('cmd.exe'),/OA_OFFLINE/);assert.throws(()=>require('dgram').createSocket('udp4'),/OA_OFFLINE/);fetch('https://example.com').then(()=>process.exit(9),e=>{assert.match(e.message,/OA_OFFLINE/);console.log('blocked');});`;
  const result=spawnSync(process.execPath,['--require',path.resolve(__dirname,'../offline-guard.cjs'),'-e',script],{env:{...process.env,OA_LOCAL_PORTS:'32123'},encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/blocked/);
});
test('desktop API session token is mandatory',()=>{
  const middleware=require('../api-policy.cjs');process.env.OA_SESSION_TOKEN='expected-test-token';
  let status;const response={status:n=>(status=n,response),json:()=>{}};
  middleware({headers:{},path:'/api/oa/status'},response,()=>assert.fail('unauthenticated access'));
  assert.equal(status,403);
});
