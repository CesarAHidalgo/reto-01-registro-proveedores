import { promises as fs } from 'node:fs';
import path from 'node:path';
import { leer_solicitud, mapear_campos, generar_formulario, armar_paquete } from './src/tools/proveedor.js';

type Result = {ok:boolean;data?: Record<string,unknown>;error?:string};
const ctx={directory:process.cwd(),sessionId:'demo'};
const casos=await fs.readdir(path.join(ctx.directory,'fixtures','reto-01','casos'));
await fs.rm(path.join(ctx.directory,'out'),{recursive:true,force:true});
let fallos=0;
for(const caso of casos.sort()) {
  const leer=JSON.parse(await leer_solicitud.execute({caso},ctx)) as Result;
  if(!leer.ok || !leer.data) {console.error(`${caso}: ${leer.error}`);fallos++;continue;}
  const campos=leer.data.campos as {etiqueta:string}[];
  const m=JSON.parse(await mapear_campos.execute({caso,campos},ctx)) as Result;
  if(!m.ok || !m.data) {console.error(`${caso}: ${m.error}`);fallos++;continue;}
  const form=JSON.parse(await generar_formulario.execute({caso,mapeo:m.data},ctx)) as Result;
  const pack=JSON.parse(await armar_paquete.execute({caso},ctx)) as Result;
  if(!form.ok || !pack.ok) {console.error(`${caso}: ${form.error??pack.error}`);fallos++;continue;}
  console.log(JSON.stringify({caso,formato:form.data?.formato,ruta:form.data?.ruta,llenos:(m.data.llenos as unknown[]).length,faltantes:(m.data.faltantes as unknown[]).length,requiere_confirmacion:(m.data.requiere_confirmacion as unknown[]).length,listo_para_firma:pack.data?.listo_para_firma,checklist:pack.data?.checklist}));
}
if(fallos) process.exitCode=1;
