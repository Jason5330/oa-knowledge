const chunks=[];let size=0;
process.stdin.on('data',c=>{size+=c.length;if(size>72*1024*1024)process.exit(2);chunks.push(c);});
process.stdin.on('end',async()=>{try{const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));const pages=await require('./parse.cjs').parse(Buffer.from(input.buffer,'base64'),input.name,input.options||{});process.stdout.write(JSON.stringify({pages}),()=>process.exit(0));}catch(e){process.stdout.write(JSON.stringify({error:e.message}),()=>process.exit(0));}});
