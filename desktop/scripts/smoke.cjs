const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
module.exports=async({origin,headers,win,nodeExe,dataDir,root})=>{
  const checks=[];
  async function call(route,options={}){
    const r=await fetch(origin+'/api'+route,{...options,headers:{...headers,...options.headers}});
    const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;
  }
  const post=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const unauthorized=await fetch(origin+'/api/oa/status');assert.equal(unauthorized.status,403);checks.push('API rejects requests without desktop session');
  const forbidden=await fetch(origin+'/api/system/update-env',{...post({LLMProvider:'openai'}),headers:{...headers,'Content-Type':'application/json'}});assert.equal(forbidden.status,403);checks.push('Provider changes and external integrations blocked');
  const created=await call('/workspace/new',post({name:'IT 測試知識庫'}));assert.ok(created.workspace?.slug);const slug=created.workspace.slug;
  const file=fs.readFileSync(path.join(__dirname,'../fixtures/oa-example.txt'));
  const form=new FormData();form.append('file',new Blob([file],{type:'text/plain'}),'oa-example.txt');
  const uploaded=await call('/workspace/'+slug+'/upload-and-embed',{method:'POST',body:form});assert.equal(uploaded.success,true,JSON.stringify(uploaded));checks.push('Chinese TXT parsed, chunked, embedded and persisted locally');
  const result=await call('/oa/search',post({workspace:slug,query:'設備可以借用幾天？',limit:3}));assert.ok(result.matches.some(x=>x.text.includes('十四天')),JSON.stringify(result));checks.push('Chinese semantic query retrieves expected source');
  const source=await call('/oa/read',post({workspace:slug,documentId:result.matches[0].documentId}));assert.match(source.text,/OA-DEMO-2026-ALPHA/);checks.push('Source read is bounded to workspace documents');
  const invalid=await fetch(origin+'/api/oa/read',{...post({workspace:slug,documentId:'../../secret'}),headers:{...headers,'Content-Type':'application/json'}});assert.equal(invalid.status,400);checks.push('Arbitrary file reads rejected');
  if(process.env.OA_TEST_FORMATS==='1') {
    const other=await call('/workspace/new',post({name:'格式驗證'}));
    const isolated=await fetch(origin+'/api/oa/read',{...post({workspace:other.workspace.slug,documentId:result.matches[0].documentId}),headers:{...headers,'Content-Type':'application/json'}});assert.equal(isolated.status,400);checks.push('Cross-workspace source access denied');
    for(const fixture of await require('./format-test.cjs')()){
      const upload=new FormData();upload.append('file',new Blob([fixture.data],{type:fixture.type}),fixture.name);
      const response=await call('/workspace/'+other.workspace.slug+'/upload-and-embed',{method:'POST',body:upload});assert.equal(response.success,true,JSON.stringify(response));
      const docs=await call('/oa/documents?workspace='+other.workspace.slug);const latest=docs.at(-1);
      const text=await call('/oa/read',post({workspace:other.workspace.slug,documentId:latest.id,length:8000}));assert.ok(text.text.includes(fixture.marker),fixture.name+' lost source content');checks.push('Import + source content: '+fixture.name);
    }
  }
  if(win) {
  await win.webContents.executeJavaScript(`localStorage.setItem('oa-workspace',${JSON.stringify(slug)});`);
  await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.webContents.reload();});
  for(let i=0;i<60;i++){if(await win.webContents.executeJavaScript(`document.getElementById('page-title')?.textContent.includes('IT 測試知識庫') && document.getElementById('status')?.textContent.startsWith('本機服務就緒') || false`))break;await new Promise(r=>setTimeout(r,500));}
  await win.webContents.executeJavaScript(`document.getElementById('query').value='設備可以借用幾天？';document.getElementById('search-form').requestSubmit();`);
  let ready=false;for(let i=0;i<60;i++){if(await win.webContents.executeJavaScript(`!!document.querySelector('.result')`)){ready=true;break;}await new Promise(r=>setTimeout(r,500));}
  assert.ok(ready,'UI search result renders');
  await win.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  await new Promise(resolve=>setTimeout(resolve,300));
  fs.writeFileSync(path.join(dataDir,'desktop-search.png'),(await win.webContents.capturePage()).toPNG());checks.push('Packaged desktop UI renders search and citation');
  }
  const {Client}=require(path.join(root,'server/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js'));
  const {StdioClientTransport}=require(path.join(root,'server/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js'));
  const transport=new StdioClientTransport({command:nodeExe,args:[path.resolve(__dirname,'../mcp.cjs')],env:{...process.env,OA_DATA_DIR:dataDir},stderr:'pipe'});
  const client=new Client({name:'oa-local-smoke',version:'1.0.0'});
  try{
    await client.connect(transport);
    const list=await client.listTools();assert.equal(list.tools.length,4);assert.ok(list.tools.every(t=>t.annotations.readOnlyHint));
    const reply=await client.callTool({name:'search_knowledge',arguments:{workspace:slug,query:'設備可以借用幾天？',limit:2}},undefined,{timeout:120000});assert.ok(!reply.isError,JSON.stringify(reply));assert.match(reply.content[0].text,/十四天/);checks.push('Real stdio MCP handshake, tool listing and Chinese retrieval passed');
    const bad=await client.callTool({name:'read_document',arguments:{workspace:slug,documentId:'../../secret'}});assert.equal(bad.isError,true);checks.push('MCP rejects document traversal');
  }finally{await client.close();}
  return {passed:true,at:new Date().toISOString(),checks,workspace:slug,fixture:'Synthetic public test fixture only',network:'Application loopback guards enabled. Not an OS firewall isolation certification.'};
};
