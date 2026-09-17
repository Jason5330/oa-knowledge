const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {initialize,configure}=require('../environment.cjs');
const root=path.resolve(__dirname,'../..');
const dataDir=path.join(root,'desktop/test-output/service');
const children=[];
async function port(){return new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});}
(async()=>{
 const a=await port(),b=await port();
 const secrets=initialize(dataDir);
 const env={...process.env,...configure({dataDir,appRoot:root,ports:[a,b]}),...secrets,SERVER_PORT:String(a),COLLECTOR_PORT:String(b),OA_SESSION_TOKEN:crypto.randomBytes(32).toString('hex'),OA_PARENT_PID:String(process.pid)};
 const nodeExe=path.resolve(__dirname,'../assets/node.exe');
 for(const name of ['server','collector']){const log=fs.openSync(path.join(dataDir,'logs',name+'.log'),'a');const child=spawn(nodeExe,['--require',path.resolve(__dirname,'../offline-guard.cjs'),path.join(root,name,'index.js')],{cwd:path.join(root,name),env,windowsHide:true,stdio:['ignore',log,log]});fs.closeSync(log);children.push(child);}
 const origin=`http://127.0.0.1:${a}`,headers={'X-OA-Session':env.OA_SESSION_TOKEN};
 let ready=false;
 for(let i=0;i<160;i++){if(children.some(c=>c.exitCode!==null))throw new Error('Service exited; inspect logs.');try{const x=await fetch(origin+'/api/oa/status',{headers,signal:AbortSignal.timeout(1000)}),y=await fetch(`http://127.0.0.1:${b}/accepts`,{signal:AbortSignal.timeout(1000)});if(x.ok&&y.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 if(!ready)throw new Error('Service startup timeout');
 console.log('Services ready; running import, retrieval and MCP checks…');
 const result=await require('./smoke.cjs')({origin,headers,nodeExe,dataDir,root});
 fs.writeFileSync(path.join(dataDir,'smoke-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const c of children)if(c.exitCode===null)c.kill();});
