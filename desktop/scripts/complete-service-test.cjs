const path=require('node:path'),fs=require('node:fs'),net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const desktop=path.resolve(__dirname,'..'),dataDir=process.env.OA_TEST_DATA||path.join(desktop,'test-output/complete-'+Date.now());fs.mkdirSync(dataDir,{recursive:true});
(async()=>{
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
 const token=crypto.randomBytes(32).toString('hex'),origin='http://127.0.0.1:'+port,headers={'X-OA-Session':token},nodeExe=path.join(desktop,'assets/node.exe');
 const log=fs.openSync(path.join(dataDir,'runtime.log'),'a');
 const child=spawn(nodeExe,['--require',path.join(desktop,'offline-guard.cjs'),path.join(desktop,'runtime/server.cjs')],{env:{...process.env,OA_DATA_DIR:dataDir,OA_LOCAL_PORTS:String(port),SERVER_PORT:String(port),OA_SESSION_TOKEN:token,OA_PARENT_PID:String(process.pid)},stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);
 try{let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/oa/status',{headers})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw new Error('Runtime failed to start');const report=await require('./complete-smoke.cjs')({origin,headers,nodeExe,dataDir});fs.writeFileSync(path.join(dataDir,'smoke-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({dataDir,...report}));}finally{child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
