// Manual fault injection: forward genuine PlantUML SVG, delay the first body.
import http from 'node:http';
import fs from 'node:fs';
const port=Number(process.env.PLANTUML_REVIEW_PORT||5174);let attempt=0;
const server=http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');
 const encoded=req.url?.match(/^\/svg\/([A-Za-z0-9_~-]+)$/)?.[1];
 if(!encoded){res.writeHead(404);res.end();return;}
 const id=++attempt,started=Date.now(),ctrl=new AbortController();let delay;
 res.on('close',()=>{clearTimeout(delay);ctrl.abort();console.log(JSON.stringify({id,event:'closed',elapsedMs:Date.now()-started,completed:res.writableEnded}));});
 try{
  const upstream=await fetch('https://www.plantuml.com/plantuml/svg/'+encoded,{signal:ctrl.signal});
  const body=Buffer.from(await upstream.arrayBuffer());
  console.log(JSON.stringify({id,event:'upstream',status:upstream.status,bytes:body.length,elapsedMs:Date.now()-started}));
  if(res.destroyed)return;
  res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'image/svg+xml','Cache-Control':'no-store'});
  if(id===1){res.write(body.subarray(0,100));delay=setTimeout(()=>res.end(body.subarray(100)),6500);}
  else res.end(body);
 }catch(error){if(!res.destroyed){res.writeHead(502);res.end(String(error));}}
});
server.listen(port,'127.0.0.1',()=>console.log('PlantUML real-response delay proxy on '+port));
