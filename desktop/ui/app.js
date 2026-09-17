'use strict';
const $=id=>document.getElementById(id);
let active=null, documents=[], busy=false, configs=null, searchEpoch=0;
async function api(route, options={}) {
  const response=await fetch('/api'+route,options);
  let data;try{data=await response.json();}catch{throw new Error(`服務回應異常 (${response.status})`);}
  if(!response.ok || data?.success===false) throw new Error(data.error || data.message || `操作失敗 (${response.status})`);
  return data;
}
const json=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,6500);}
function status(text){$('status').textContent=text;}
function element(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function setBusy(value){busy=value;for(const id of ['upload','search-button','new-workspace','delete-workspace'])$(id).disabled=value;}
function view(name){for(const id of ['welcome','workspace-view','connections-view'])$(id).hidden=id!==name;}
function tab(name){$('search-view').hidden=name!=='search';$('documents-view').hidden=name!=='documents';document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));}
async function refreshWorkspaces(){
  const rows=await api('/oa/workspaces');$('workspace-count').textContent=rows.length;$('workspaces').replaceChildren();
  for(const row of rows){const b=element('button',undefined,'workspace-item'+(row.slug===active?.slug?' active':''));b.append(element('span','▱'),element('span',row.name),element('small',String(row.documentCount)));b.onclick=()=>{if(!busy)selectWorkspace(row);};$('workspaces').append(b);}
  return rows;
}
async function selectWorkspace(row){
  if(busy)return;active=row;searchEpoch++;$('workspace-title').textContent=row.name;$('page-title').textContent=row.name;$('query').value='';$('results').replaceChildren(element('p','匯入文件後，輸入問題或關鍵字，這裡會顯示相關的原文片段。','empty'));view('workspace-view');tab('search');localStorage.setItem('oa-workspace',row.slug);await refreshDocuments();await refreshWorkspaces();
}
async function refreshDocuments(){
  if(!active)return;documents=await api('/oa/documents?workspace='+encodeURIComponent(active.slug));$('document-count').textContent=documents.length;$('document-summary').textContent=`${documents.length} 份已建立索引的文件 · 可供 MCP 搜尋`;$('documents').replaceChildren();
  if(!documents.length)$('documents').append(element('p','尚未匯入文件。請點擊上方「匯入文件」。','search-hint'));
  for(const doc of documents){const row=element('div',undefined,'document-row');const read=element('button','檢視來源');read.onclick=()=>readSource(doc.id);row.append(element('span','DOC','file-icon'),element('span',doc.title,'file-name'),read);$('documents').append(row);}
}
function openCreate(){if(busy)return;$('create-form').reset();$('create-dialog').showModal();$('workspace-name').focus();}
$('new-workspace').onclick=openCreate;$('welcome-create').onclick=openCreate;$('cancel-create').onclick=()=>$('create-dialog').close();
$('create-form').onsubmit=async event=>{event.preventDefault();const name=$('workspace-name').value.trim();if(!name)return;const button=event.submitter;button.disabled=true;try{const result=await api('/workspace/new',json({name}));if(!result.workspace)throw new Error(result.message||'無法建立知識庫');$('create-dialog').close();await selectWorkspace(result.workspace);toast('知識庫已建立，可以匯入文件。');}catch(e){toast(e.message);}finally{button.disabled=false;}};
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$('upload').onclick=()=>$('file-picker').click();$('dropzone').onclick=()=>{if(!busy)$('file-picker').click();};$('dropzone').onkeydown=e=>{if(e.key==='Enter'&&!busy)$('file-picker').click();};
$('file-picker').onchange=async()=>{await uploadFiles([...$('file-picker').files]);$('file-picker').value='';};
for(const name of ['dragenter','dragover'])$('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.add('dragging');});
$('dropzone').ondragleave=()=>$('dropzone').classList.remove('dragging');$('dropzone').ondrop=e=>{e.preventDefault();$('dropzone').classList.remove('dragging');uploadFiles([...e.dataTransfer.files]);};
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
async function uploadFiles(files){
  if(busy||!active||!files.length)return;setBusy(true);let successes=0;tab('documents');
  try{for(const file of files){if(!/\.(txt|md|pdf|docx|csv|xlsx|json)$/i.test(file.name)){toast('不支援此格式：'+file.name);continue;}status(`正在本機解析與建立索引：${file.name}（首次載入模型可能較久）`);const form=new FormData();form.append('file',file);try{await api('/workspace/'+encodeURIComponent(active.slug)+'/upload-and-embed',{method:'POST',body:form});successes++;}catch(error){toast(file.name+'：'+error.message);}}await refreshDocuments();await refreshWorkspaces();status(`匯入完成：${successes} / ${files.length} 份文件`);}catch(e){toast(e.message);status('匯入失敗，請查看訊息。');}finally{setBusy(false);}
}
$('search-form').onsubmit=async event=>{
  event.preventDefault();if(busy||!active)return;const query=$('query').value.trim();if(!query)return;setBusy(true);const epoch=++searchEpoch;status('正在本機搜尋…');$('results').replaceChildren(element('p','搜尋中…','search-hint'));
  try{const result=await api('/oa/search',json({workspace:active.slug,query,limit:5}));if(epoch!==searchEpoch)return;$('results').replaceChildren(element('div',`找到 ${result.matches.length} 個相關片段`,'result-count'));for(const [i,match] of result.matches.entries()){const card=element('article',undefined,'result');const heading=element('div',undefined,'result-header');heading.append(element('span',String(i+1).padStart(2,'0'),'result-index'),element('span',match.title),element('small','相似度 '+Math.round(match.similarity*100)+'%'));const button=element('button','讀取來源文件 →');button.onclick=()=>readSource(match.documentId);card.append(heading,element('p',match.text),button);$('results').append(card);}if(!result.matches.length)$('results').append(element('p','目前沒有可搜尋的索引，請先匯入文件。','search-hint'));status('搜尋完成 · 未呼叫對話模型');}catch(e){$('results').replaceChildren(element('p',e.message,'search-hint'));status('搜尋失敗');}finally{setBusy(false);}
};
async function readSource(id){try{const source=await api('/oa/read',json({workspace:active.slug,documentId:id,length:8000}));$('source-title').textContent=source.title;$('source-text').textContent=source.text+(source.nextOffset!==null?'\n\n（此視窗顯示前 8000 字元；MCP 可分段讀取。）':'');$('source-dialog').showModal();}catch(e){toast(e.message);}}
$('close-source').onclick=()=>$('source-dialog').close();
$('connections').onclick=async()=>{if(busy)return;view('connections-view');$('workspace-title').textContent='連接 AI 工具';try{configs=await api('/oa/mcp-config');$('codex-config').textContent=configs.codex;$('claude-config').textContent=configs.claude;}catch(e){toast(e.message);}};
for(const kind of ['codex','claude'])$('copy-'+kind).onclick=async()=>{try{await navigator.clipboard.writeText(configs[kind]);toast('已複製設定。');}catch{toast('無法使用剪貼簿，請選取設定文字後按 Ctrl+C。');}};
$('delete-workspace').onclick=async()=>{if(busy||!active)return;if(!confirm(`刪除「${active.name}」的工作區與索引？已解析的文件副本仍可能保留在資料目錄。`))return;try{await api('/workspace/'+encodeURIComponent(active.slug),{method:'DELETE'});active=null;localStorage.removeItem('oa-workspace');view('welcome');$('workspace-title').textContent='開始建立你的知識庫';await refreshWorkspaces();toast('已刪除工作區與索引。');}catch(e){toast(e.message);}};
(async()=>{try{const info=await api('/oa/status');$('storage-label').textContent=info.storage;$('storage-label').title=info.storage;const rows=await refreshWorkspaces();const last=rows.find(w=>w.slug===localStorage.getItem('oa-workspace'));if(last)await selectWorkspace(last);status('本機服務就緒 · MCP 可讀取已匯入的片段');}catch(e){status(e.message);toast(e.message);}})();
