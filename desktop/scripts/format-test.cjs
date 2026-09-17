// Additional synthetic format fixtures, with no company documents.
const path=require('node:path'),fs=require('node:fs');
const {PDFDocument,StandardFonts}=require(path.resolve(__dirname,'../../server/node_modules/pdf-lib'));
const {Document,Packer,Paragraph}=require(path.resolve(__dirname,'../../server/node_modules/docx'));
const ExcelJS=require(path.resolve(__dirname,'../../server/node_modules/exceljs'));
module.exports=async function fixtures(){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage().drawText('Synthetic OA test. Device loans last fourteen days. ID: OA-FORMAT-PDF',{x:40,y:730,size:14,font});
 const docx=new Document({sections:[{children:[new Paragraph('虛構測試資料：設備借用期限為十四天。識別碼 OA-FORMAT-DOCX。')]}]});
 const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('測試資料');sheet.addRow(['項目','期限','識別碼']);sheet.addRow(['設備借用','十四天','OA-FORMAT-XLSX']);
 const PptxGenJS=require(path.resolve(__dirname,'../../server/node_modules/pptxgenjs'));const slides=new PptxGenJS();slides.addSlide().addText('OA-FORMAT-PPTX：設備借用期限為十四天。',{x:1,y:1,w:8,h:1});
 return [
  {name:'行政測試.md',type:'text/markdown',data:Buffer.from('# 測試資料\n設備借用期限為十四天。OA-FORMAT-MD。'),marker:'OA-FORMAT-MD'},
  {name:'sample.pdf',type:'application/pdf',data:Buffer.from(await pdf.save()),marker:'OA-FORMAT-PDF'},
  {name:'sample.docx',type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',data:await Packer.toBuffer(docx),marker:'OA-FORMAT-DOCX'},
  {name:'sample.csv',type:'text/csv',data:Buffer.from('項目,期限,識別碼\n設備借用,十四天,OA-FORMAT-CSV'),marker:'OA-FORMAT-CSV'},
  {name:'sample.xlsx',type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',data:Buffer.from(await workbook.xlsx.writeBuffer()),marker:'OA-FORMAT-XLSX'},
  {name:'sample.json',type:'application/json',data:Buffer.from(JSON.stringify({type:'測試',期限:'十四天',id:'OA-FORMAT-JSON'})),marker:'OA-FORMAT-JSON'},
  {name:'sample.pptx',type:'application/vnd.openxmlformats-officedocument.presentationml.presentation',data:Buffer.from(await slides.write({outputType:'nodebuffer'})),marker:'OA-FORMAT-PPTX'},
 ];
};
