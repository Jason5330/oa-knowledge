const {unzipSync}=require('fflate');
const {XMLParser}=require('fast-xml-parser');
const MAX=50*1024*1024;
const arr=x=>x===undefined?[]:Array.isArray(x)?x:[x];
function xml(text){if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('不接受含有外部實體的 XML');return new XMLParser({ignoreAttributes:false,removeNSPrefix:true,processEntities:false,parseTagValue:false,trimValues:false}).parse(text);}
function textOf(x){if(x===undefined||x===null)return '';if(typeof x!=='object')return String(x);if(Array.isArray(x))return x.map(textOf).join('');return Object.entries(x).filter(([k])=>!k.startsWith('@_')).map(([k,v])=>textOf(v)+(k==='p'?'\n':'')).join('');}
function unzip(buffer){let size=0,count=0;return unzipSync(buffer,{filter:file=>{size+=file.originalSize;count++;if(size>100*1024*1024||count>10000||file.originalSize>40*1024*1024)throw new Error('文件解壓縮後過大');return /^(word\/document.xml|ppt\/slides\/slide\d+.xml|xl\/(sharedStrings.xml|workbook.xml|worksheets\/sheet\d+.xml))$/.test(file.name);}});}
async function parse(buffer,name,options={}){
  if(!buffer.length||buffer.length>MAX)throw new Error('文件須為 1 位元組至 50 MB');
  const ext=require('node:path').extname(name).toLowerCase();let pages=[];
  if(ext==='.xlsx')return require('./excel.cjs').parseExcel(buffer,options);
  if(['.txt','.md','.csv','.json'].includes(ext)){
    const encoding=buffer[0]===255&&buffer[1]===254?'utf-16le':'utf-8';
    let text=new TextDecoder(encoding,{fatal:true}).decode(buffer);
    if(ext==='.json')text=JSON.stringify(JSON.parse(text),null,2);
    pages=[{text,location:ext==='.csv'?'CSV 表格':'全文'}];
  }else if(ext==='.pdf'){
    const {PDFParse}=require('pdf-parse');const pdf=new PDFParse({data:buffer});
    try{const result=await pdf.getText();pages=result.pages.map(p=>({text:p.text,location:'第 '+p.num+' 頁'}));}finally{await pdf.destroy();}
  }else if(['.docx','.xlsx','.pptx'].includes(ext)){
    const files=unzip(buffer);const read=n=>files[n]?xml(Buffer.from(files[n]).toString('utf8')):null;
    if(ext==='.docx'){const d=read('word/document.xml');if(!d)throw new Error('DOCX 缺少主文件');pages=[{text:textOf(d.document?.body),location:'Word 文件'}];}
    if(ext==='.pptx')for(const key of Object.keys(files).filter(x=>/^ppt\/slides\/slide\d+.xml$/.test(x)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1])))pages.push({text:textOf(read(key)),location:'第 '+key.match(/slide(\d+)/)[1]+' 張投影片'});
    if(ext==='.xlsx'){
      const strings=arr(read('xl/sharedStrings.xml')?.sst?.si).map(textOf);
      const sheets=arr(read('xl/workbook.xml')?.workbook?.sheets?.sheet);
      for(const [i,key] of Object.keys(files).filter(x=>/^xl\/worksheets\/sheet\d+.xml$/.test(x)).sort((a,b)=>Number(a.match(/sheet(\d+)/)[1])-Number(b.match(/sheet(\d+)/)[1])).entries()){
        const rows=arr(read(key)?.worksheet?.sheetData?.row).map(row=>arr(row.c).map(c=>{let v=c['@_t']==='s'?strings[Number(c.v)]||'':c['@_t']==='inlineStr'?textOf(c.is):textOf(c.v);return (c['@_r']||'')+': '+v;}).join('\t')).join('\n');
        pages.push({text:rows,location:'工作表 '+(sheets[i]?.['@_name']||String(i+1))});
      }
    }
  }else throw new Error('不支援的格式。可使用 TXT、MD、PDF、DOCX、XLSX、PPTX、CSV、JSON。');
  const office=['.docx','.xlsx','.pptx'].includes(ext);
  function entities(text){return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(all,key)=>{const fixed={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(fixed[key])return fixed[key];const n=key.startsWith('#x')?parseInt(key.slice(2),16):Number(key.slice(1));return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):all;});}
  pages=pages.map(p=>({...p,text:(office?entities(p.text):p.text).replace(/\u0000/g,'').trim()})).filter(p=>p.text);
  if(!pages.length)throw new Error('找不到可索引文字。掃描文件請先以本機 OCR 轉為文字型 PDF。');
  if(pages.reduce((n,p)=>n+p.text.length,0)>5_000_000)throw new Error('文件超過 500 萬字元，請拆分後匯入。');
  return pages;
}
module.exports={parse,MAX};
