const path=require('node:path');
let ready;
async function encoder(){
  if(!ready)ready=(async()=>{
    const {pipeline,env}=require('@huggingface/transformers');
    env.allowRemoteModels=false;env.allowLocalModels=true;env.useFSCache=false;
    env.localModelPath=path.resolve(__dirname,'../assets/models');
    env.backends.onnx.numThreads=Math.min(4,require('node:os').availableParallelism());
    return pipeline('feature-extraction','MintplexLabs/multilingual-e5-small',{dtype:'q8',device:'cpu'});
  })().catch(e=>{ready=null;throw e;});
  return ready;
}
async function embed(text,query=false){
  const model=await encoder();
  const out=await model((query?'query: ':'passage: ')+text,{pooling:'mean',normalize:true,truncation:true,max_length:512});
  const vector=Float32Array.from(out.data);
  if(vector.length!==384||!vector.every(Number.isFinite))throw new Error('嵌入模型輸出異常');
  return vector;
}
function chunks(pages){
  const out=[];
  for(const page of pages){
    if(page.kind==='excel-row'&&Array.isArray(page.fields)){
      const prefix=String(page.prefix||'').slice(0,180);let text=prefix;
      const push=()=>{if(text!==prefix){out.push({text,location:page.location});text=prefix;if(out.length>10000)throw new Error('單份文件超過 10,000 個片段，請拆分後匯入。');}};
      for(const field of page.fields){
        const label=field.slice(0,Math.min(field.indexOf('=')+1,150)),budget=550-prefix.length;
        if(field.length>budget){push();for(let i=0;i<field.length;i+=Math.max(80,budget-label.length)){text=prefix+(i?label+'（續）':'')+field.slice(i,i+Math.max(80,budget-label.length));push();}}
        else{if(text.length+field.length+1>550)push();text+=field+'\n';}
      }push();continue;
    }
    const text=page.text.replace(/\r\n/g,'\n').trim();
    for(let start=0;start<text.length;){
      let end=Math.min(start+600,text.length);
      if(end<text.length){const stop=Math.max(text.lastIndexOf('\n',end),text.lastIndexOf('。',end));if(stop>start+300)end=stop+1;}
      out.push({text:text.slice(start,end),location:page.location||''});
      if(out.length>10000)throw new Error('單份文件超過 10,000 個片段，請拆分後匯入。');
      if(end===text.length)break;start=end-80;
    }
  }
  return out;
}
module.exports={embed,chunks};
