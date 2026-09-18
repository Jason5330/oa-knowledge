// Describe the JSON saved during import; downloading a copy is never a prerequisite.
function info(parserVersion,tableCount){
  if(parserVersion!==3)return null;
  return {status:'ready',format:'json',storage:'local-database',parserVersion,tableCount,automaticallyConverted:true,manualPreparationRequired:false,tools:['inspect_excel','read_excel_rows','aggregate_excel']};
}
module.exports={info};
