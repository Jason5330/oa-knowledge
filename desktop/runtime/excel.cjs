// SpreadsheetML ingestion: stored facts and explicit provenance, never formula execution.
const {unzipSync}=require('fflate'),{XMLParser}=require('fast-xml-parser'),SSF=require('ssf'),path=require('node:path').posix;
const arr=x=>x==null?[]:Array.isArray(x)?x:[x];
const yes=x=>x===true||x==='1'||x==='true';
function decode(s){return String(s??'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(all,k)=>{const chars={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(chars[k])return chars[k];const n=k.startsWith('#x')?parseInt(k.slice(2),16):Number(k.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):all;});}
function value(x){if(x==null)return '';if(typeof x!=='object')return decode(x);if(Array.isArray(x))return x.map(value).join('');return Object.entries(x).filter(([k])=>!k.startsWith('@_')&&k!=='rPr'&&k!=='phoneticPr'&&k!=='rPh').map(([,v])=>value(v)).join('');}
function col(n){let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
function address(ref){const m=/^\$?([A-Z]{1,3})\$?([1-9]\d*)$/i.exec(String(ref));if(!m)throw new Error('無效的 Excel 儲存格位置');let c=0;for(const ch of m[1].toUpperCase())c=c*26+ch.charCodeAt(0)-64;const r=Number(m[2]);if(c>16384||r>1048576)throw new Error('Excel 儲存格位置超出範圍');return {r,c};}
function range(ref){const [a,b]=String(ref).split(':').map(address);const end=b||a;if(end.r<a.r||end.c<a.c)throw new Error('無效的 Excel 範圍');return {r1:a.r,c1:a.c,r2:end.r,c2:end.c};}
const rangeName=b=>`${col(b.c1)}${b.r1}:${col(b.c2)}${b.r2}`;
function options(input={}){
  if(input.includeHidden!==undefined&&typeof input.includeHidden!=='boolean')throw new Error('隱藏資料選項無效');
  const headers=input.headerRows||{};if(!headers||typeof headers!=='object'||Array.isArray(headers)||Object.keys(headers).length>200)throw new Error('表頭設定無效');
  for(const [key,rows]of Object.entries(headers))if(key.length>512||!Array.isArray(rows)||rows.length>8||rows.some(r=>!Number.isInteger(r)||r<1||r>1048576)||new Set(rows).size!==rows.length)throw new Error('表頭須為不重複的 Excel 列號，最多 8 列');
  return {includeHidden:input.includeHidden===true,headerRows:headers};
}
function parseExcel(buffer,input={}){
  const config=options(input);let expanded=0,entries=0;
  const files=unzipSync(buffer,{filter:f=>{expanded+=f.originalSize;if(expanded>100*1024*1024||++entries>10000||f.originalSize>40*1024*1024)throw new Error('Excel 解壓縮後過大');return /^(xl\/.*\.(xml|rels)|_rels\/\.rels)$/.test(f.name);}});
  const xml=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,processEntities:false,parseTagValue:false,trimValues:false});
  function read(file){if(!files[file])throw new Error('Excel 缺少必要結構：'+file);const text=Buffer.from(files[file]).toString('utf8');if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('Excel 不接受外部 XML 實體');return xml.parse(text);}
  function rels(file){const rel=path.join(path.dirname(file),'_rels',path.basename(file)+'.rels');if(!files[rel])return new Map();return new Map(arr(read(rel).Relationships?.Relationship).map(r=>[r['@_Id'],r]));}
  function resolve(base,rel){if(!rel||rel['@_TargetMode']==='External')throw new Error('Excel 外部關聯不會載入');const target=decode(rel['@_Target']);if(/^[a-z]+:/i.test(target)||target.includes('\\'))throw new Error('Excel 關聯路徑無效');const file=path.normalize(target.startsWith('/')?target.slice(1):path.join(path.dirname(base),target));if(!file.startsWith('xl/')||file.includes('../'))throw new Error('Excel 關聯路徑超出活頁簿');return file;}
  const book=read('xl/workbook.xml').workbook;if(!book)throw new Error('無法讀取 Excel 活頁簿');
  const bookRels=rels('xl/workbook.xml'),date1904=yes(book.workbookPr?.['@_date1904']);
  const strings=files['xl/sharedStrings.xml']?arr(read('xl/sharedStrings.xml').sst?.si).map(value):[];
  const styles=files['xl/styles.xml']?read('xl/styles.xml').styleSheet:{};
  const formats={...SSF.get_table()};for(const f of arr(styles?.numFmts?.numFmt))formats[Number(f['@_numFmtId'])]=decode(f['@_formatCode']);
  const xfs=arr(styles?.cellXfs?.xf),warnings=new Map();function warn(code,message,count=1){const w=warnings.get(code);if(w)w.count+=count;else warnings.set(code,{code,message,count});}
  if(book.calcPr?.['@_calcMode']==='manual'||yes(book.calcPr?.['@_fullCalcOnLoad'])||yes(book.calcPr?.['@_forceFullCalc']))warn('recalculation','活頁簿要求重新計算或使用手動計算；儲存的公式結果可能過期。');
  if(Object.keys(files).some(x=>x.startsWith('xl/externalLinks/'))||files['xl/connections.xml'])warn('external-data','有外部連結或資料連線；不會連線、刷新或執行查詢。');
  if(Object.keys(files).some(x=>x.startsWith('xl/pivotTables/')))warn('pivot','樞紐分析只保留工作表已儲存的結果，不會重新整理。');
  if(Object.keys(files).some(x=>x.startsWith('xl/charts/')))warn('charts','圖表與圖形不作視覺解讀，請核對來源儲存格。');
  const report={kind:'excel',parserVersion:3,dateSystem:date1904?'1904':'1900',options:config,sheets:[],tables:[],warnings:[],formulaCount:0,missingFormulaResults:0,hiddenExcluded:{sheets:0,rows:0,columns:0,cells:0},definedNameCount:arr(book.definedNames?.definedName).length};
  let cellCount=0,tableCount=0;
  for(const sheet of arr(book.sheets?.sheet)){
    const hidden=['hidden','veryHidden'].includes(sheet['@_state']);if(hidden&&!config.includeHidden){report.hiddenExcluded.sheets++;continue;}
    const name=decode(sheet['@_name']),file=resolve('xl/workbook.xml',bookRels.get(sheet['@_id'])),data=read(file).worksheet;
    if(!data){warn('non-worksheet','略過非一般工作表的頁籤。');continue;}
    if(data.conditionalFormatting)warn('conditional-format','條件式格式與色彩意義未解讀；顯示值使用儲存格基本數值格式。');
    const hiddenColumns=arr(data.cols?.col).filter(c=>yes(c['@_hidden'])).map(c=>({start:Number(c['@_min']),end:Number(c['@_max'])}));
    if(hiddenColumns.some(c=>!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<1||c.end>16384||c.end<c.start))throw new Error('隱藏欄範圍無效');
    const hiddenCol=c=>hiddenColumns.some(x=>c>=x.start&&c<=x.end);
    const allRows=arr(data.sheetData?.row),hiddenRows=new Set(allRows.filter(r=>yes(r['@_hidden'])).map(r=>Number(r['@_r'])));
    if(!config.includeHidden){report.hiddenExcluded.rows+=hiddenRows.size;report.hiddenExcluded.columns+=hiddenColumns.reduce((n,x)=>n+x.end-x.start+1,0);}
    const cells=new Map(),rowMap=new Map(),shared=new Map();let inferredRow=0;
    for(const row of allRows){const rowNum=Number(row['@_r']||++inferredRow);inferredRow=rowNum;
      for(const source of arr(row.c)){
        if(++cellCount>200000)throw new Error('Excel 超過 200,000 個儲存格，請拆分活頁簿');
        const ref=source['@_r'];const a=address(ref);
        if(a.r!==rowNum)throw new Error('Excel 列號與儲存格位置不一致');
        if(!config.includeHidden&&(hiddenRows.has(a.r)||hiddenCol(a.c))){report.hiddenExcluded.cells++;continue;}
        const type=source['@_t']||'n',hasFormula=Object.hasOwn(source,'f'),formulaNode=source.f,rawValue=source.v;
        let raw=type==='s'?strings[Number(value(rawValue))]??'':type==='inlineStr'?value(source.is):type==='b'?value(rawValue)==='1':type==='n'&&value(rawValue)!==''?Number(value(rawValue)):value(rawValue);
        let kind=type==='e'?'error':type==='d'?'date':typeof raw==='number'?'number':typeof raw==='boolean'?'boolean':'text';
        if(typeof raw==='number'&&!Number.isFinite(raw)){raw=value(rawValue);kind='error';}
        const formatId=Number(xfs[Number(source['@_s']||0)]?.['@_numFmtId']||0),format=formats[formatId]||'General';
        let display=String(raw),isoDate;
        if(typeof raw==='number')try{display=SSF.format(format,raw,{date1904});if(SSF.is_date(format)){kind='date';const d=SSF.parse_date_code(raw,{date1904});if(d){isoDate=`${String(d.y).padStart(4,'0')}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`+(d.H||d.M||d.S?`T${String(d.H).padStart(2,'0')}:${String(d.M).padStart(2,'0')}:${String(d.S).padStart(2,'0')}`:'');if(!date1904&&Math.floor(raw)===60)warn('excel-leap-day','存在 Excel 1900 日期系統的虛構閏日，保留序號與顯示值。');}}else if(format.includes('%'))kind='percentage';}catch{warn('format','有數值格式無法完整顯示，已保留原始數值與格式碼。');}
        if(!formats[formatId])warn('unknown-format','有不支援的內建格式碼，顯示值以原始值替代。');
        let formula=null;
        if(hasFormula){
          report.formulaCount++;const expression=value(formulaNode),attributes=typeof formulaNode==='object'?formulaNode:{};
          const si=attributes['@_si'];if(attributes['@_t']==='shared'&&expression)shared.set(si,{ref,expression});
          formula={expression:expression?'='+expression:null,type:attributes['@_t']||'normal',sharedIndex:si??null,range:attributes['@_ref']||null,cached:Object.hasOwn(source,'v')&&(value(rawValue)!==''||type==='str'),recalculated:false};
          if(!formula.cached){report.missingFormulaResults++;display='（公式沒有儲存結果）';raw=null;kind='unknown';}
          if(/\[[^\]]+\].*!|WEBSERVICE\s*\(|RTD\s*\(/i.test(expression))warn('external-formula','存在外部或即時資料公式；僅記錄公式，不會執行。');
        }
        if(kind==='error')warn('cell-error','存在 Excel 錯誤值，計算統計時會排除。');
        if(raw===''&&!hasFormula)continue;
        const cell={ref,row:a.r,column:col(a.c),columnIndex:a.c,raw,display,kind,format,formatId,...(isoDate?{isoDate}:{}),...(formula?{formula}:{}),hidden:hidden||hiddenRows.has(a.r)||hiddenCol(a.c)};
        cells.set(ref,cell);if(!rowMap.has(a.r))rowMap.set(a.r,[]);rowMap.get(a.r).push(cell);
      }
    }
    for(const cell of cells.values())if(cell.formula?.type==='shared'&&!cell.formula.expression){const anchor=shared.get(cell.formula.sharedIndex);cell.formula.sharedMaster=anchor||null;}
    const merges=arr(data.mergeCells?.mergeCell).map(m=>({ref:m['@_ref'],...range(m['@_ref'])}));if(merges.length>10000)throw new Error('合併範圍過多');
    function at(r,c){const own=cells.get(col(c)+r);if(own)return own;const merge=merges.find(m=>r>=m.r1&&r<=m.r2&&c>=m.c1&&c<=m.c2);if(!merge)return null;const anchor=cells.get(col(merge.c1)+merge.r1);return anchor?{...anchor,ref:col(c)+r,row:r,column:col(c),columnIndex:c,mergedFrom:anchor.ref,hidden:hidden||hiddenRows.has(r)||hiddenCol(c)}:null;}
    const sheetInfo={name,state:hidden?sheet['@_state']:'visible',part:file,visibleRows:rowMap.size,cellCount:cells.size,merges:merges.length,tables:[]};report.sheets.push(sheetInfo);
    const declared=[],relations=rels(file);
    for(const part of arr(data.tableParts?.tablePart)){const table=read(resolve(file,relations.get(part['@_id']))).table;if(table)declared.push({bounds:range(table['@_ref']),name:decode(table['@_displayName']||table['@_name']),headerCount:Number(table['@_headerRowCount']??1),totalCount:Number(table['@_totalsRowCount']||0),columns:arr(table.tableColumns?.tableColumn).map(c=>decode(c['@_name']))});}
    // Infer additional regions from occupied rows, leaving declared Tables authoritative.
    const outside=[...rowMap.keys()].sort((a,b)=>a-b).filter(r=>rowMap.get(r).some(c=>!declared.some(t=>r>=t.bounds.r1&&r<=t.bounds.r2&&c.columnIndex>=t.bounds.c1&&c.columnIndex<=t.bounds.c2)));
    const rowGroups=[];for(const r of outside){const prev=rowGroups.at(-1);if(prev&&r-prev.at(-1)<=1+[...hiddenRows].filter(x=>x>prev.at(-1)&&x<r).length)prev.push(r);else rowGroups.push([r]);}
    const inferred=[];
    for(const group of rowGroups){const occupied=[...new Set(group.flatMap(r=>rowMap.get(r).filter(c=>!declared.some(t=>r>=t.bounds.r1&&r<=t.bounds.r2&&c.columnIndex>=t.bounds.c1&&c.columnIndex<=t.bounds.c2)).map(c=>c.columnIndex)))].sort((a,b)=>a-b);const colGroups=[];for(const c of occupied){const prev=colGroups.at(-1);if(prev&&Array.from({length:c-prev.at(-1)-1},(_,i)=>prev.at(-1)+i+1).every(hiddenCol))prev.push(c);else colGroups.push([c]);}for(const cols of colGroups)inferred.push({bounds:{r1:group[0],r2:group.at(-1),c1:cols[0],c2:cols.at(-1)},name:'區域 '+rangeName({r1:group[0],r2:group.at(-1),c1:cols[0],c2:cols.at(-1)})});}
    for(const region of [...declared,...inferred]){
      if(++tableCount>200)throw new Error('Excel 超過 200 個資料區域，請拆分檔案');
      const b=region.bounds;if(b.c2-b.c1>255)throw new Error('資料區域超過 256 欄，請拆分後匯入');
      const id=`${name}!${rangeName(b)}`,manual=Object.hasOwn(config.headerRows,id),isTable=Object.hasOwn(region,'headerCount');let headerRows=[];
      if(manual){headerRows=[...config.headerRows[id]].sort((a,b)=>a-b);if(headerRows.some(r=>r<b.r1||r>b.r2||hiddenRows.has(r)&&!config.includeHidden))throw new Error('指定表頭列不在可見資料區域內：'+id);}
      else if(isTable)headerRows=region.headerCount?[b.r1]:[];
      else{
        const candidates=[...rowMap.keys()].filter(r=>r>=b.r1&&r<=Math.min(b.r2,b.r1+10)).sort((a,b)=>a-b);
        let first;for(const r of candidates){const row=rowMap.get(r).filter(c=>c.columnIndex>=b.c1&&c.columnIndex<=b.c2);if(row.some(c=>c.kind!=='text'||c.formula))break;if(row.length>=Math.min(2,b.c2-b.c1+1)){first=r;break;}}
        if(first!==undefined){headerRows=[first];for(let r=first+1;r<=Math.min(first+3,b.r2);r++){const groups=merges.filter(m=>headerRows.includes(m.r1)&&m.c2>m.c1);if(!groups.length)break;const row=(rowMap.get(r)||[]).filter(c=>c.columnIndex>=b.c1&&c.columnIndex<=b.c2);if(!row.length||row.some(c=>c.kind!=='text'||c.formula||!groups.some(m=>c.columnIndex>=m.c1&&c.columnIndex<=m.c2)))break;headerRows.push(r);}}
      }
      const columns=[];for(let c=b.c1;c<=b.c2;c++){if(hiddenCol(c)&&!config.includeHidden)continue;const labels=headerRows.map(r=>at(r,c)?.display).filter(Boolean);const unique=[...new Set(labels)];columns.push({column:col(c),label:!manual&&isTable&&region.columns[c-b.c1]?region.columns[c-b.c1]:unique.join(' / ')||col(c),headerRefs:headerRows.map(r=>at(r,c)?.mergedFrom||col(c)+r),types:[]});}
      const context=[...rowMap.keys()].filter(r=>r>=b.r1&&headerRows.length&&r<headerRows[0]).flatMap(r=>rowMap.get(r).filter(c=>c.columnIndex>=b.c1&&c.columnIndex<=b.c2).map(c=>c.display)).join(' · ').slice(0,500);
      const table={id,name:region.name,sheet:name,range:rangeName(b),headerRows,headerSource:manual?'manual':isTable?'excel-table':'inferred',reviewRecommended:!manual&&!isTable,context,columns,rows:[]};
      for(const r of [...rowMap.keys()].filter(r=>r>=b.r1&&r<=b.r2).sort((a,b)=>a-b)){
        if(headerRows.includes(r)||headerRows.length&&r<headerRows[0])continue;
        const selected=columns.map(c=>{const cell=at(r,address(c.column+'1').c);return cell?{...cell,field:c.label}:null;}).filter(Boolean);if(!selected.length)continue;
        const total=!!(region.totalCount&&r>b.r2-region.totalCount)||selected.some(c=>/^(合計|總計|小計|總和|subtotal|grand total|total)([\s:：]|$)/i.test(c.display));
        const repeated=columns.length>1&&selected.length===columns.length&&selected.every(c=>columns.find(h=>h.column===c.column)?.label.split(' / ').at(-1)===c.display);
        if(repeated)continue;
        table.rows.push({row:r,role:total?'total':'data',cells:selected});
      }
      for(const c of columns)c.types=[...new Set(table.rows.flatMap(r=>r.cells.filter(cell=>cell.column===c.column).map(cell=>cell.kind)))];
      sheetInfo.tables.push(id);report.tables.push(table);
    }
  }
  if(report.formulaCount)warn('cached-formulas','公式只使用檔案已儲存的結果，未重新計算；不能保證結果是最新的。',report.formulaCount);
  if(report.missingFormulaResults)warn('missing-formula-results','公式缺少已儲存結果，標示為未知，不當成 0。',report.missingFormulaResults);
  if(report.tables.some(t=>t.reviewRecommended))warn('headers-inferred','部分表頭由規則自動推測，資料已可供 AI 讀取；欄位語意可能有誤，必要時可選擇修正。',report.tables.filter(t=>t.reviewRecommended).length);
  if(Object.values(report.hiddenExcluded).some(Boolean))warn('hidden-excluded','預設排除隱藏工作表、列與欄；可在解析設定明確選擇包含。');
  report.warnings=[...warnings.values()];
  const summary=`Excel 活頁簿：${report.sheets.length} 個已解析工作表，${report.tables.length} 個資料區域。\n${report.sheets.map(s=>s.name).join('、')}\n${report.warnings.map(w=>w.message).join('\n')}`;
  const pages=[{kind:'excel-workbook',text:summary,location:'Excel 解析摘要',workbook:report}];
  for(const table of report.tables)for(const row of table.rows){
    const fields=row.cells.map(cell=>{const label=table.columns.find(c=>c.column===cell.column)?.label||cell.column;return {cell,content:`${label} [${cell.ref}${cell.mergedFrom?'，合併來源 '+cell.mergedFrom:''}]=${cell.display}${cell.formula?'（公式'+(cell.formula.expression?' '+cell.formula.expression:'，共用公式')+'；'+(cell.formula.cached?'儲存結果，未重算':'缺少結果')+'）':''}`};});
    const prefix=`工作表 ${table.sheet}｜${table.name}｜第 ${row.row} 列${row.role==='total'?'（合計／小計）':''}${table.context?'｜'+table.context:''}\n`;
    const first=fields.find(f=>f.cell.kind==='text'&&!f.cell.formula)?.content.slice(0,160)||'';
    let batch=[],length=prefix.length;function flush(){if(batch.length){pages.push({kind:'excel-row',text:prefix+batch.join('\n'),prefix:prefix.slice(0,180),fields:batch,location:`工作表 ${table.sheet}!${table.range} · 第 ${row.row} 列`,tableId:table.id,row:row.row});batch=[];length=prefix.length;}}
    for(const f of fields){if(length+f.content.length>950&&batch.length){flush();if(first&&f.content!==first){batch.push('列識別：'+first);length+=first.length;}}batch.push(f.content);length+=f.content.length;}
    flush();
  }
  if(pages.reduce((n,p)=>n+p.text.length,0)>5_000_000)throw new Error('Excel 結構化文字超過 500 萬字元，請拆分活頁簿');
  return pages;
}
module.exports={parseExcel,options,address,range,col};
