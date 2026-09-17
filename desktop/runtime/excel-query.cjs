// Read and aggregate explicit table rows. No SQL, Python, JS or Excel formulas supplied by clients are executed.
const {integer,str}=require('./store.cjs');
function workbook(store,workspace,documentId){const d=store.document(workspace,documentId),book=JSON.parse(d.pages).find(p=>p.kind==='excel-workbook')?.workbook;if(!book||book.parserVersion!==3)throw new Error('此文件尚未建立新版 Excel 結構；請在桌面按重新解析。');return {d,book};}
function table(book,id){const t=book.tables.find(t=>t.id===id);if(!t)throw new Error('找不到資料表，請先呼叫 inspect_excel 取得 tableId');return t;}
function inspect(store,{workspace,documentId,offset=0,limit=20}){integer(offset,0,10000);integer(limit,1,50);const {d,book}=workbook(store,workspace,documentId);return {documentId,title:d.name,parserVersion:book.parserVersion,dateSystem:book.dateSystem,options:book.options,warnings:book.warnings,hiddenExcluded:book.hiddenExcluded,formulaCount:book.formulaCount,missingFormulaResults:book.missingFormulaResults,sheets:book.sheets,totalTables:book.tables.length,nextOffset:offset+limit<book.tables.length?offset+limit:null,tables:book.tables.slice(offset,offset+limit).map(({rows,...t})=>({...t,rowCount:rows.length,totalRows:rows.filter(r=>r.role==='total').length}))};}
function readRows(store,{workspace,documentId,tableId,offset=0,limit=20}){integer(offset,0,1e7);integer(limit,1,50);const {book}=workbook(store,workspace,documentId),t=table(book,str(tableId,512));let size=0;const rows=[];for(const row of t.rows.slice(offset,offset+limit)){const safe={...row,cells:row.cells.map(c=>({...c,raw:typeof c.raw==='string'?c.raw.slice(0,2000):c.raw,display:c.display.slice(0,2000),truncated:typeof c.raw==='string'&&c.raw.length>2000||c.display.length>2000}))};size+=JSON.stringify(safe).length;if(size>150000&&rows.length)break;rows.push(safe);}return {documentId,tableId,columns:t.columns,headerSource:t.headerSource,requiresReview:t.requiresReview,rows,totalRows:t.rows.length,nextOffset:offset+rows.length<t.rows.length?offset+rows.length:null,warnings:book.warnings};}
function aggregate(store,{workspace,documentId,tableId,column,operation='sum',groupBy,filters=[],includeTotals=false,acceptInferredHeaders=false}){
  if(!['sum','average','min','max','count'].includes(operation))throw new Error('不支援的統計操作');
  if(typeof includeTotals!=='boolean'||typeof acceptInferredHeaders!=='boolean'||!Array.isArray(filters)||filters.length>8)throw new Error('統計條件格式錯誤');
  const {book}=workbook(store,workspace,documentId),t=table(book,str(tableId,512));
  if(t.requiresReview&&!acceptInferredHeaders)throw new Error('此表的表頭尚未確認；請在桌面確認表頭，或明確設定 acceptInferredHeaders=true 後核對結果。');
  function known(c){if(!t.columns.some(x=>x.column===c))throw new Error('欄位不存在，請使用 inspect_excel 傳回的欄位代碼（例如 B）');}
  if(operation!=='count'||column)known(column);if(groupBy)known(groupBy);
  for(const f of filters){known(f.column);if(!['eq','contains','gt','gte','lt','lte'].includes(f.op)||!['string','number','boolean'].includes(typeof f.value)||typeof f.value==='string'&&f.value.length>500||typeof f.value==='number'&&!Number.isFinite(f.value))throw new Error('篩選條件錯誤');}
  function match(row){return filters.every(f=>{const c=row.cells.find(c=>c.column===f.column);if(!c)return false;const v=c.raw;if(f.op==='contains')return c.display.toLowerCase().includes(String(f.value).toLowerCase());if(f.op==='eq')return v===f.value||typeof f.value==='string'&&c.display===f.value;if(typeof v!=='number'||typeof f.value!=='number'||!Number.isFinite(v))return false;return f.op==='gt'?v>f.value:f.op==='gte'?v>=f.value:f.op==='lt'?v<f.value:v<=f.value;});}
  const groups=new Map(),units=new Set();let excludedTotals=0,skipped=0,cachedFormulaValues=0,matchedRows=0;const usedRows=[];
  for(const row of t.rows){if(!includeTotals&&row.role==='total'){excludedTotals++;continue;}if(!match(row))continue;matchedRows++;const cell=column?row.cells.find(c=>c.column===column):null;
    if(operation!=='count'&&(!cell||!['number','percentage'].includes(cell.kind)||typeof cell.raw!=='number'||!Number.isFinite(cell.raw))){skipped++;continue;}
    if(operation==='count'&&column&&(!cell||cell.raw===null||cell.raw==='')){skipped++;continue;}
    if(cell?.mergedFrom&&cell.row!==require('./excel.cjs').address(cell.mergedFrom).r){skipped++;continue;}
    if(cell?.formula)cachedFormulaValues++;
    if(operation!=='count')units.add(cell.kind==='percentage'?'percentage':/[¥￥$€£]|\[\$/.test(cell.format)?cell.format.replace(/[0#?,.()\s-]/g,''):'number');
    const key=groupBy?row.cells.find(c=>c.column===groupBy)?.display??'（空白）':'全部';if(!groups.has(key)){if(groups.size>=1000)throw new Error('分組超過 1,000 組，請縮小篩選範圍');groups.set(key,{group:key,count:0,sum:0,correction:0,min:Infinity,max:-Infinity});}
    const g=groups.get(key),n=operation==='count'?1:cell.raw;g.count++;const y=n-g.correction,total=g.sum+y;if(!Number.isFinite(total))throw new Error('統計數值超出可計算範圍');g.correction=(total-g.sum)-y;g.sum=total;g.min=Math.min(g.min,n);g.max=Math.max(g.max,n);usedRows.push(row.row);
  }
  if(units.size>1)throw new Error('此欄包含不同的百分比／金額格式，請先分開欄位或縮小篩選範圍');
  return {documentId,tableId,operation,column:column||null,groupBy:groupBy||null,filters,includeTotals,matchedRows,excludedTotals,skippedCells:skipped,cachedFormulaValues,results:[...groups.values()].map(g=>({group:g.group,count:g.count,value:operation==='count'?g.count:operation==='average'?g.sum/g.count:operation==='min'?g.min:operation==='max'?g.max:g.sum})),sourceRows:usedRows.slice(0,200),sourceRowsTruncated:usedRows.length>200,warnings:['統計使用儲存的原始數值；沒有重新計算 Excel 公式。','合計列依 Table 設定或標籤判定；未標示的合計可能需要人工排除。',...(cachedFormulaValues?['結果包含公式的儲存值，可能不是最新計算結果。']:[]),...(t.requiresReview?['表頭為自動推測，使用者尚未確認。']:[])]};
}
module.exports={workbook,inspect,readRows,aggregate};
