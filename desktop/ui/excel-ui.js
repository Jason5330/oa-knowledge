'use strict';
let excelDoc=null,excelInfo=null,excelOffset=0,excelRows=null;
async function openExcel(id){
  excelDoc=id;excelOffset=0;$('excel-details').open=false;$('excel-ready-note').textContent='正在讀取自動結構化結果…';$('excel-title').textContent='Excel 結構化解析';$('excel-dialog').showModal();$('excel-body').replaceChildren(e('p','讀取結構…'));await loadExcel();
}
async function loadExcel(){
  try{
    excelInfo=await api('excel/inspect',post({workspace:active.slug,documentId:excelDoc,limit:50}));
    $('excel-title').textContent=excelInfo.title;$('excel-ready-note').textContent=`已於匯入時自動建立結構化 JSON（${excelInfo.totalTables} 個資料區域），保存在本機資料庫。AI 可直接讀取，不需要匯出或重新匯入。${excelInfo.warnings.length?' 解析有 '+excelInfo.warnings.length+' 類注意事項，AI 讀取時也會收到這些提示。':''}`;$('excel-hidden').checked=excelInfo.options.includeHidden;$('excel-body').replaceChildren();
    const warnings=e('div',undefined,'excel-warnings');for(const w of excelInfo.warnings)warnings.append(e('p',w.message));$('excel-body').append(warnings);
    const label=e('label','資料區域'),select=e('select');select.id='excel-table';
    for(const t of excelInfo.tables){const option=e('option',`${t.sheet} · ${t.name} · ${t.range}（${t.rowCount} 列）`);option.value=t.id;select.append(option);}
    $('excel-body').append(label,select);select.onchange=()=>{excelOffset=0;renderExcelTable().catch(err=>toast(err.message));};
    if(excelInfo.nextOffset!==null)$('excel-body').append(e('p','介面顯示前 50 個區域；MCP 可分頁讀取其餘區域。','search-hint'));
    const preview=e('div');preview.id='excel-preview';$('excel-body').append(preview);if(excelInfo.tables.length)await renderExcelTable();else preview.append(e('p','沒有可見資料區域。可檢查是否全部資料皆隱藏。'));
  }catch(err){excelInfo=null;$('excel-ready-note').textContent='尚無可用結構化資料：'+err.message;$('excel-details').open=true;$('excel-body').replaceChildren(e('p',err.message+' 按下「重新解析」可從原始 XLSX 建立結構。','notice'));}
}
async function renderExcelTable(){
  const id=$('excel-table').value,t=excelInfo.tables.find(t=>t.id===id);excelRows=await api('excel/rows',post({workspace:active.slug,documentId:excelDoc,tableId:id,offset:excelOffset,limit:15}));
  const box=$('excel-preview');box.replaceChildren();box.append(e('p',`${t.headerSource==='manual'?'已指定表頭':t.headerSource==='excel-table'?'Excel Table 定義':'自動識別表頭（推測，已可供 AI 使用）'} · 欄位帶有儲存格位置，數字保留原始值與顯示值。`,'search-hint'));
  const controls=e('div',undefined,'buttons'),header=e('input');header.id='excel-header';header.value=t.headerRows.join(',');header.placeholder='例如 3,4；空白表示無表頭';header.className='field';header.setAttribute('aria-label','表頭列號');const confirmButton=action('套用表頭並重建',async()=>{const text=header.value.trim();if(text&&!/^\d+(\s*,\s*\d+)*$/.test(text))throw new Error('請填寫列號，例如 3,4');const rows=text?text.split(',').map(Number):[];await reparseExcel({...excelInfo.options,includeHidden:$('excel-hidden').checked,headerRows:{...excelInfo.options.headerRows,[t.id]:rows}});});controls.append(e('span','表頭列號'),header,confirmButton);const advanced=e('details'),summary=e('summary','手動調整表頭（選用）');advanced.append(summary,controls);box.append(advanced);
  const scroll=e('div',undefined,'excel-grid'),table=e('table'),thead=e('thead'),tr=e('tr');tr.append(e('th','列號'));for(const c of t.columns)tr.append(e('th',`${c.label}\n${c.column} · ${c.types.join('/')}`));thead.append(tr);table.append(thead);const tbody=e('tbody');
  for(const row of excelRows.rows){const tr=e('tr');tr.append(e('td',`${row.row}${row.role==='total'?' 合計':''}`));for(const c of t.columns){const cell=row.cells.find(x=>x.column===c.column),td=e('td');if(cell){td.append(e('strong',cell.display),e('small',`${cell.ref}${cell.mergedFrom?' ← '+cell.mergedFrom:''} · ${cell.kind}`));if(typeof cell.raw==='number')td.append(e('small','原始值：'+cell.raw));if(cell.formula)td.append(e('small',`${cell.formula.expression||'共用公式'} · ${cell.formula.cached?'儲存值，未重算':'沒有結果'}`));}tr.append(td);}tbody.append(tr);}table.append(tbody);scroll.append(table);box.append(scroll);
  const pages=e('div',undefined,'pagination'),prev=action('上一頁',async()=>{excelOffset=Math.max(0,excelOffset-15);await renderExcelTable();}),next=action('下一頁',async()=>{excelOffset=excelRows.nextOffset;await renderExcelTable();});prev.disabled=excelOffset===0;next.disabled=excelRows.nextOffset===null;prev.title=prev.disabled?'已是第一頁':'顯示上一頁資料';next.title=next.disabled?'此資料區域已沒有下一頁':'顯示下一頁資料';const first=excelRows.rows.length?excelOffset+1:0;pages.append(prev,e('span',`${first}–${excelOffset+excelRows.rows.length} / ${excelRows.totalRows}`),next);box.append(pages);if(next.disabled){const note=e('p',excelOffset===0?`已顯示此資料區域全部 ${excelRows.totalRows} 筆資料。其他工作表或區域請使用上方「資料區域」下拉選單。`:'已到此資料區域最後一頁。其他工作表或區域請使用上方「資料區域」下拉選單。','search-hint');note.setAttribute('role','status');box.append(note);}
}
async function reparseExcel(options){
  if(busy)return;lock(true);$('excel-reparse').disabled=true;
  try{const j=await api('excel/reparse',post({workspace:active.slug,documentId:excelDoc,options}));await waitJob(j.jobId,'重新解析 Excel 結構');await refresh();await renderDocuments();await loadExcel();toast('Excel 結構與索引已更新');}finally{jobId=null;$('job-panel').hidden=true;lock(false);$('excel-reparse').disabled=false;}
}
$('excel-close').onclick=()=>$('excel-dialog').close();
$('excel-reparse').onclick=()=>reparseExcel({...excelInfo?.options,includeHidden:$('excel-hidden').checked}).catch(err=>toast(err.message));
$('excel-export').onclick=()=>native('exportExcel',active.slug,excelDoc).catch(err=>toast(err.message));
