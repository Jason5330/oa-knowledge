const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),{Store}=require('../runtime/store.cjs');
const root=path.resolve(__dirname,'../test-output/unit');fs.mkdirSync(root,{recursive:true});
test('invalid backup index rolls back every newly restored workspace',async()=>{
 const dir=fs.mkdtempSync(path.join(root,'restore-')),store=new Store(dir);const original=store.create('保留資料');
 const d='document-test';store.db.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?)').run(d,original.slug,'test.txt','test',Buffer.from('text'),'text','[]','today');
 store.db.prepare('INSERT INTO chunks VALUES(?,?,?,?,?,?,?)').run('chunk',d,original.slug,0,'text','全文',Buffer.from([1,2,3]));
 const file=await store.backup();const before=store.stats();assert.throws(()=>store.restore(path.join(dir,'backups',file.name)),/備份索引格式/);assert.deepEqual(store.stats(),before);assert.equal(store.listWorkspaces()[0].slug,original.slug);store.close();
});
test('read-only store cannot mutate and backup triggers are rejected',async()=>{
 const dir=fs.mkdtempSync(path.join(root,'readonly-')),store=new Store(dir);store.create('知識庫');const b=await store.backup();store.close();
 const reader=new Store(dir,{readOnly:true});assert.equal(reader.listWorkspaces().length,1);assert.throws(()=>reader.create('不能寫入'),/readonly/i);reader.close();
 const file=path.join(dir,'backups',b.name),db=new DatabaseSync(file);db.exec('CREATE TRIGGER test AFTER INSERT ON workspaces BEGIN SELECT 1; END');db.close();
 const live=new Store(dir);assert.throws(()=>live.restore(file),/不支援的資料結構/);assert.equal(live.listWorkspaces().length,1);live.close();
});
test('local model configuration rejects remote URLs and unusual paths',()=>{
 const {validate}=require('../runtime/local-model.cjs'),good={enabled:true,url:'http://127.0.0.1:1234/v1',model:'my-model',maxTokens:512};assert.ok(validate(good));
 for(const url of ['https://example.com/v1','http://192.168.0.1:1234/v1','http://127.0.0.1:1234/v1?target=https://example.com','http://user@127.0.0.1:1234/v1','http://127.0.0.1:1234/other','file:///secret'])assert.throws(()=>validate({...good,url}));
});
test('office extraction preserves Unicode and XML escapes without external entities',async()=>{
 const {zipSync,strToU8}=require('../runtime/node_modules/fflate'),{parse}=require('../runtime/parse.cjs');
 const bytes=zipSync({'word/document.xml':strToU8('<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>行政 A&amp;B &#x4E2D;文</w:t></w:r></w:p></w:body></w:document>')});
 assert.match((await parse(bytes,'test.docx'))[0].text,/行政 A&B 中文/);
 const malicious=zipSync({'word/document.xml':strToU8('<!DOCTYPE root [<!ENTITY x SYSTEM "file:///secret">]><root>&x;</root>')});await assert.rejects(parse(malicious,'test.docx'),/外部實體/);
});
