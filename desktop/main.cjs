const {app,BrowserWindow,session,dialog,Menu,ipcMain,shell} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {defaultDataDir} = require('./paths.cjs');
const children=[];
let stopping=false;
app.setName('OA Knowledge');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('no-proxy-server');
app.setPath('userData',path.join(process.env.OA_DATA_DIR || defaultDataDir(),'desktop-profile'));
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{const w=BrowserWindow.getAllWindows()[0];if(w){w.restore();w.focus();}});
  app.whenReady().then(start).catch(error=>{
    console.error(error);
    stopping=true;for(const child of children)if(child.exitCode===null)child.kill();
    if(!process.env.OA_SMOKE_TEST) dialog.showErrorBox('OA 知識庫啟動失敗',error.message+'\n請查看資料目錄中的 logs。');
    app.exit(1);
  });
}
app.on('before-quit',()=>{stopping=true;for(const child of children) if(child.exitCode===null) child.kill();});
app.on('will-quit',()=>{for(const child of children) if(child.exitCode===null) child.kill();});
app.on('window-all-closed',()=>app.quit());
async function freePort() {
  return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
}
async function start() {
  const root=path.resolve(__dirname,'..');
  const dataDir=path.resolve(process.env.OA_DATA_DIR || defaultDataDir());
  fs.mkdirSync(path.join(dataDir,'logs'),{recursive:true});
  const serverPort=await freePort();
  const environment={OA_DATA_DIR:dataDir,OA_LOCAL_PORTS:String(serverPort),DO_NOT_TRACK:'1',HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'*'};
  const token=crypto.randomBytes(32).toString('hex');
  const nodeExe=path.join(__dirname,'assets','node.exe');
  const childEnv={};
  for(const key of ['SystemRoot','WINDIR','COMSPEC','PATH','PATHEXT','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE','ProgramFiles','ProgramFiles(x86)','ProgramData','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE']) if(process.env[key]) childEnv[key]=process.env[key];
  Object.assign(childEnv,environment,{SERVER_PORT:String(serverPort),OA_SESSION_TOKEN:token,OA_PARENT_PID:String(process.pid)});
  const origin=`http://127.0.0.1:${serverPort}`;
  const allowed=url=>{try {return new URL(url).origin===origin;}catch{return false;}};
  session.defaultSession.setPermissionRequestHandler((wc,permission,callback)=>callback(permission==='clipboard-sanitized-write' && allowed(wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc,permission,requestingOrigin)=>permission==='clipboard-sanitized-write' && allowed(requestingOrigin));
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!allowed(details.url)&&!details.url.startsWith('data:')&&!details.url.startsWith('blob:')}));
  session.defaultSession.webRequest.onBeforeSendHeaders((details,callback)=>{
    if(allowed(details.url)) details.requestHeaders['X-OA-Session']=token;
    callback({requestHeaders:details.requestHeaders});
  });
  session.defaultSession.webRequest.onHeadersReceived((details,callback)=>{
    const headers={...details.responseHeaders};
    headers['Content-Security-Policy']=["default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'self'"];
    callback({responseHeaders:headers});
  });
  Menu.setApplicationMenu(null);
  const win=new BrowserWindow({width:1380,height:900,minWidth:980,minHeight:680,show:!process.env.OA_SMOKE_TEST,title:'OA 知識庫',backgroundColor:'#111318',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false,backgroundThrottling:false,devTools:!app.isPackaged}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(!allowed(url))event.preventDefault();});
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html lang="zh-Hant"><body style="background:#111318;color:#eef1f5;font:18px Segoe UI;padding:80px"><h1>OA 知識庫</h1><p>正在啟動本機文件服務…</p></body></html>'));
  function launch(name) {
    const log=fs.openSync(path.join(dataDir,'logs',name+'.log'),'a');
    const child=spawn(nodeExe,['--require',path.join(__dirname,'offline-guard.cjs'),path.join(__dirname,'runtime/server.cjs')],{cwd:__dirname,env:childEnv,windowsHide:true,stdio:['ignore',log,log]});
    fs.closeSync(log);children.push(child);
    function failed(message){if(stopping)return;console.error(message);stopping=true;for(const other of children)if(other.exitCode===null)other.kill();if(!process.env.OA_SMOKE_TEST)dialog.showErrorBox('本機服務停止',message+'\n請重新開啟程式，詳細記錄位於 '+path.join(dataDir,'logs'));app.exit(1);}
    child.on('error',error=>failed(error.message));
    child.on('exit',code=>{if(!stopping)failed(`${name} stopped: ${code}`);});
  }
  launch('runtime');
  const headers={'X-OA-Session':token};
  async function call(route,body){const r=await fetch(origin+'/api/oa/'+route,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body||{})});const value=await r.json();if(!r.ok)throw new Error(value.error);return value;}
  ipcMain.handle('oa-native',async(event,action,args)=>{
    if(!allowed(event.senderFrame?.url||''))throw new Error('Invalid desktop origin');
    try{
      if(action==='open-data'){await shell.openPath(dataDir);return {success:true};}
      if(action==='backup'){
        const result=await call('backup');if(path.basename(result.name)!==result.name)throw new Error('Invalid backup filename');
        const selected=await dialog.showSaveDialog(win,{title:'儲存知識庫備份',defaultPath:result.name,filters:[{name:'OA 知識庫備份',extensions:['sqlite']}]});
        if(selected.canceled)return {cancelled:true};fs.copyFileSync(path.join(dataDir,'backups',result.name),selected.filePath);return {success:true,path:selected.filePath};
      }
      if(action==='restore'){
        const selected=await dialog.showOpenDialog(win,{title:'選擇要還原的 OA 備份（新增為獨立知識庫）',properties:['openFile'],filters:[{name:'OA 知識庫備份',extensions:['sqlite']}]});if(selected.canceled)return {cancelled:true};
        if(fs.statSync(selected.filePaths[0]).size>4*1024**3)throw new Error('備份超過 4 GB');
        const name='import-'+crypto.randomUUID()+'.sqlite',dir=path.join(dataDir,'backups'),temp=path.join(dir,name);fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(selected.filePaths[0],temp);
        try{return await call('restore',{name});}finally{fs.unlinkSync(temp);}
      }
      if(action==='export-document'||action==='export-excel'){
        if(!args||typeof args.workspace!=='string'||typeof args.documentId!=='string')throw new Error('Invalid document');
        const r=await fetch(origin+'/api/oa/'+(action==='export-excel'?'excel/export':'export')+'?'+new URLSearchParams(args),{headers});if(!r.ok)throw new Error((await r.json()).error);
        const name=path.basename(decodeURIComponent(r.headers.get('x-file-name')||'document.txt')).replace(/[<>:"|?*]/g,'_');
        const selected=await dialog.showSaveDialog(win,{title:'匯出原始文件',defaultPath:name});if(selected.canceled){await r.body.cancel();return {cancelled:true};}
        fs.writeFileSync(selected.filePath,Buffer.from(await r.arrayBuffer()));return {success:true};
      }
      throw new Error('Unknown native action');
    }catch(e){return {error:e.message};}
  });
  let ready=false;
  for(let i=0;i<180;i++) {
    if(children.some(child=>child.exitCode!==null)) throw new Error('本機服務啟動失敗。');
    try {const a=await fetch(origin+'/api/oa/status',{headers,signal:AbortSignal.timeout(1000)});if(a.ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  if(!ready)throw new Error('本機服務啟動逾時。');
  // Tests must never replace the real user's active MCP registration.
  if(!process.env.OA_SMOKE_TEST) require('./mcp-config.cjs').register({node:nodeExe,server:path.join(__dirname,'runtime/mcp.cjs'),data:dataDir});
  await win.loadURL(origin);
  if(process.env.OA_SMOKE_TEST) {
    try {
      const result=await require('./scripts/complete-smoke.cjs')({origin,headers,win,nodeExe,dataDir,root});
      fs.writeFileSync(path.join(dataDir,'smoke-result.json'),JSON.stringify(result,null,2));
      app.quit();
    } catch(error){fs.writeFileSync(path.join(dataDir,'smoke-error.txt'),error.stack);console.error(error);stopping=true;for(const child of children)child.kill();app.exit(1);}
  }
}
