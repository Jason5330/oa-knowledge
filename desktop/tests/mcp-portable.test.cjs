const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {configs,register}=require('../mcp-config.cjs');
const {Client}=require('../runtime/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const {StdioClientTransport}=require('../runtime/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js');

test('shared JSON and TOML contain no installation paths',()=>{
  const c=configs(),s=JSON.parse(c.claude).mcpServers['oa-knowledge'];
  assert.equal(s.command,'powershell.exe');assert.equal(s.env,undefined);
  assert.deepEqual(JSON.parse(c.codex.match(/^args = (.*)$/m)[1]),s.args);
  assert.ok(!JSON.stringify(c).includes(os.homedir()));
  assert.ok(!JSON.stringify(c).includes(__dirname));
  assert.match(c.codex,/env_vars = \["LOCALAPPDATA"\]/);
});

test('universal launcher resolves relocated Unicode paths and custom data, with desktop closed',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"oa-portable 中文 空格 ' $ "));
  const base=path.join(temp,'OA-Knowledge'),data=path.join(temp,'自訂資料'),desktop=path.resolve(__dirname,'..');
  const {Store}=require('../runtime/store.cjs');const store=new Store(data);store.create('中文知識庫測試');store.close();
  const before=fs.readFileSync(path.join(data,'knowledge.sqlite'));
  const node=path.join(desktop,'assets/node.exe'),server=path.join(desktop,'runtime/mcp.cjs');
  const cfg=JSON.parse(configs().claude).mcpServers['oa-knowledge'];
  async function check() {
    const client=new Client({name:'portable-test',version:'1.0'});
    try {
      await client.connect(new StdioClientTransport({...cfg,env:{...process.env,LOCALAPPDATA:temp,OA_DATA_DIR:path.join(temp,'wrong-data')},stderr:'pipe'}));
      const tools=await client.listTools();assert.equal(tools.tools.length,8);
      const result=await client.callTool({name:'list_workspaces',arguments:{}});
      assert.ok(!result.isError);assert.match(result.content[0].text,/中文知識庫測試/);
    } finally { await client.close(); }
  }
  try {
    // A tiny wrapper moves the actual entry point while retaining its dependencies.
    const first=path.join(temp,'第一版');fs.mkdirSync(first);
    fs.writeFileSync(path.join(first,'mcp.cjs'),`require(${JSON.stringify(server)});`);
    register({node,server:path.join(first,'mcp.cjs'),data,base});await check();
    const second=path.join(temp,'搬移後 第二版');fs.renameSync(first,second);
    register({node,server:path.join(second,'mcp.cjs'),data,base});await check();
    assert.deepEqual(fs.readFileSync(path.join(data,'knowledge.sqlite')),before);
    const manifest=JSON.parse(fs.readFileSync(path.join(base,'mcp/connection.json')));assert.equal(manifest.server,path.join(second,'mcp.cjs'));
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});
