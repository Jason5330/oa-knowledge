// Minimal OOXML protocol fixtures. These are test inputs for the parser, not user-authored reports.
const {zipSync,strToU8}=require('../runtime/node_modules/fflate');
module.exports=function fixture({date1904=false,declared=false}={}){
 const files={
 'xl/workbook.xml':`<workbook xmlns:r="urn:relationships"><workbookPr date1904="${date1904?1:0}"/><sheets><sheet name="行政報表" sheetId="9" r:id="second"/><sheet name="機密" sheetId="2" state="veryHidden" r:id="first"/></sheets><calcPr calcMode="manual"/></workbook>`,
 'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="first" Target="worksheets/secret.xml"/><Relationship Id="second" Target="worksheets/report.xml"/></Relationships>',
 'xl/styles.xml':'<styleSheet><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="&quot;NT$&quot;#,##0.00"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="10"/><xf numFmtId="165"/></cellXfs></styleSheet>',
 'xl/worksheets/secret.xml':'<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>TOP-SECRET-MARKER</t></is></c></row></sheetData></worksheet>',
 'xl/worksheets/report.xml':`<worksheet xmlns:r="urn:relationships"><cols><col min="6" max="6" hidden="1"/></cols><sheetData>
 <row r="1"><c r="A1" t="inlineStr"><is><t>部門</t></is></c><c r="B1" t="inlineStr"><is><t>金額</t></is></c><c r="D1" t="inlineStr"><is><t>日期</t></is></c><c r="E1" t="inlineStr"><is><t>達成率</t></is></c><c r="F1" t="inlineStr"><is><t>隱藏備註</t></is></c></row>
 <row r="2"><c r="B2" t="inlineStr"><is><t>預算（元）</t></is></c><c r="C2" t="inlineStr"><is><t>實際（元）</t></is></c></row>
 <row r="3"><c r="A3" t="inlineStr"><is><t>行政</t></is></c><c r="B3" s="3"><v>1000</v></c><c r="C3" s="3"><f>B3*0.8</f><v>800</v></c><c r="D3" s="1"><v>45000</v></c><c r="E3" s="2"><v>0.8</v></c><c r="F3" t="inlineStr"><is><t>HIDDEN-COLUMN-MARKER</t></is></c></row>
 <row r="4"><c r="A4" t="inlineStr"><is><t>業務</t></is></c><c r="B4" s="3"><v>2000</v></c><c r="C4" s="3"><f>B4*0.75</f><v>1500</v></c><c r="D4" s="1"><v>45001</v></c><c r="E4" s="2"><v>0.75</v></c></row>
 <row r="5" hidden="1"><c r="A5" t="inlineStr"><is><t>HIDDEN-ROW-MARKER</t></is></c><c r="B5"><v>999999</v></c></row>
 <row r="6"><c r="A6" t="inlineStr"><is><t>缺值</t></is></c><c r="B6" s="3"><f>1+2</f></c><c r="C6" t="e"><v>#DIV/0!</v></c></row>
 <row r="7"><c r="A7" t="inlineStr"><is><t>合計</t></is></c><c r="B7" s="3"><f>SUM(B3:B4)</f><v>3000</v></c><c r="C7" s="3"><v>2300</v></c></row>
 </sheetData><mergeCells><mergeCell ref="A1:A2"/><mergeCell ref="B1:C1"/><mergeCell ref="D1:D2"/><mergeCell ref="E1:E2"/></mergeCells>${declared?'<tableParts><tablePart r:id="table"/></tableParts>':''}</worksheet>`,
 };
 if(declared){files['xl/worksheets/_rels/report.xml.rels']='<Relationships><Relationship Id="table" Target="../tables/table1.xml"/></Relationships>';files['xl/tables/table1.xml']='<table name="Costs" displayName="Costs" ref="A2:E7" headerRowCount="1" totalsRowCount="1"><tableColumns><tableColumn name="部門"/><tableColumn name="預算"/><tableColumn name="實際"/><tableColumn name="日期"/><tableColumn name="比例"/></tableColumns></table>';}
 return zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])));
};
