import 'dotenv/config';
import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ZipArchive } from 'archiver';
import { z } from 'zod';
import { Agente, type Session } from './agent.js';
import { Gemini } from './llm/gemini.js';

const env=z.object({PORT:z.coerce.number().int().min(1).max(65535).default(3000),GEMINI_API_KEY:z.string().optional(),GEMINI_MODEL:z.string().default('gemini-2.5-flash-lite'),MAX_TURN_ITERATIONS:z.coerce.number().int().min(1).max(25).default(8),MAX_SESSION_TOKENS:z.coerce.number().int().min(1000).max(1000000).default(30000),MAX_OUTPUT_TOKENS:z.coerce.number().int().min(64).max(8192).default(1024),LLM_TIMEOUT_MS:z.coerce.number().int().min(1000).max(120000).default(30000),DEMO_ACCESS_CODE:z.string().min(12).optional()}).parse(process.env);
const directory=process.cwd();
const prompt=await fs.readFile(path.join(directory,'agent','prompt.md'),'utf8');
const knowledge=await fs.readFile(path.join(directory,'src','knowledge','registro-proveedor.md'),'utf8');
const agente=env.GEMINI_API_KEY?new Agente(new Gemini(env.GEMINI_API_KEY,env.GEMINI_MODEL,env.LLM_TIMEOUT_MS,env.MAX_OUTPUT_TOKENS),`${prompt}\n\n${knowledge}`,directory,env.MAX_TURN_ITERATIONS,env.MAX_SESSION_TOKENS):undefined;
const app=express(); app.disable('x-powered-by');app.use(express.json({limit:'32kb'}));
app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");next();});
// Opcional para la demostración pública; no sustituye autenticación de producción.
app.use((req,res,next)=>{
  if(!env.DEMO_ACCESS_CODE)return next();
  const auth=req.headers.authorization??'';let received='';
  if(auth.startsWith('Basic ')){try{const decoded=Buffer.from(auth.slice(6),'base64').toString('utf8');received=decoded.slice(decoded.indexOf(':')+1);}catch{received='';}}
  const a=Buffer.from(received),b=Buffer.from(env.DEMO_ACCESS_CODE);
  if(a.length===b.length&&timingSafeEqual(a,b))return next();
  res.setHeader('WWW-Authenticate','Basic realm="Demostracion"');res.status(401).send('Acceso requerido');
});
const solicitudes=new Map<string,{inicio:number;cantidad:number}>();
app.use('/api',(req,res,next)=>{const now=Date.now(); const ip=req.ip??'local';const item=solicitudes.get(ip);if(!item||now-item.inicio>60_000){solicitudes.set(ip,{inicio:now,cantidad:1});return next();}if(++item.cantidad>30)return res.status(429).json({error:'Demasiadas solicitudes; espera un minuto.'});return next();});
const sessions=new Map<string,Session>();
app.get('/api/health',(_req,res)=>res.json({ok:true,provider:'gemini',model:env.GEMINI_MODEL,configured:Boolean(agente)}));
app.post('/api/chat',async(req,res)=>{
  const input=z.object({sessionId:z.string().uuid().optional(),message:z.string().trim().min(1).max(4000)}).safeParse(req.body);
  if(!input.success)return res.status(400).json({error:'Mensaje o sesión inválidos.'});
  if(!agente)return res.status(503).json({error:'Configura GEMINI_API_KEY en el entorno del servidor para usar el chat.'});
  const id=input.data.sessionId??randomUUID();let session=sessions.get(id);
  if(!session && input.data.sessionId)return res.status(404).json({error:'La sesión expiró. Inicia una conversación nueva.'});
  if(!session){if(sessions.size>=100)return res.status(503).json({error:'Capacidad de sesiones alcanzada.'});session={contenidos:[],historial:[],tokens:0,ocupada:false};sessions.set(id,session);}
  const result=await agente.conversar(session,id,input.data.message);return res.json({sessionId:id,...result});
});
app.get('/api/sessions/:id',(req,res)=>{const s=sessions.get(req.params.id);if(!s)return res.status(404).json({error:'Sesión no encontrada.'});return res.json({historial:s.historial});});
app.get('/api/casos/:caso/paquete',async(req,res)=>{
  const caso=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).safeParse(req.params.caso);if(!caso.success)return res.status(400).end();
  const dir=path.join(directory,'out',caso.data,'paquete');try{await fs.access(dir);}catch{return res.status(404).json({error:'El paquete aún no está disponible.'});}
  res.attachment(`${caso.data}-paquete.zip`);const archive=new ZipArchive({zlib:{level:9}});archive.on('error',()=>res.destroy());archive.pipe(res);archive.directory(dir,false);await archive.finalize();
});
app.use(express.static(path.join(directory,'web'),{index:'index.html'}));
app.use((_req,res)=>res.status(404).json({error:'Recurso no encontrado.'}));
app.use((error:unknown,_req:express.Request,res:express.Response,next:express.NextFunction)=>{
  if(res.headersSent)return next(error);
  const status=typeof error==='object' && error!==null && 'status' in error && (error as {status:unknown}).status===400?400:500;
  return res.status(status).json({error:status===400?'Solicitud inválida.':'No fue posible completar la operación.'});
});
app.listen(env.PORT,'0.0.0.0',()=>console.log(`Servidor listo en el puerto ${env.PORT}. Modelo configurado: ${Boolean(agente)}`));
