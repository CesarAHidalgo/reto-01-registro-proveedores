import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type Contexto = { directory: string; sessionId: string; fecha?: string; confirmadoEnTurnoAnterior?: boolean };
type Campo = { etiqueta: string; hoja?: string; celda_etiqueta?: string; celda_valor?: string; obligatorio?: boolean };
type Mapeado = { etiqueta: string; estado: 'lleno' | 'faltante' | 'requiere_confirmacion'; ruta_maestro?: string; valor?: string | number | boolean; nota?: string; equivalente_pais?: string };
type Mapeo = { llenos: Mapeado[]; faltantes: Mapeado[]; requiere_confirmacion: Mapeado[] };
type Resultado<T> = {ok: true; data: T} | {ok: false; error: string};
const casoSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100).describe('Nombre de carpeta del caso');
const solicitudSchema = z.object({ pais: z.string(), cliente: z.string(), formato: z.enum(['xlsx','pdf','portal']), de: z.string().optional() });
const campoSchema = z.object({ etiqueta: z.string().min(1), hoja: z.string().optional(), celda_etiqueta: z.string().regex(/^[A-Z]+[1-9][0-9]*$/).optional(), celda_valor: z.string().regex(/^[A-Z]+[1-9][0-9]*$/).optional(), obligatorio: z.boolean().optional() });
const soporteSchema = z.object({ tipo: z.string(), archivo: z.string().regex(/^[a-zA-Z0-9._-]+$/).refine(s=>s!=='.'&&s!=='..'), vigencia_hasta: z.string().nullable() });
const rootFixtures = (ctx: Contexto) => path.join(ctx.directory,'fixtures','reto-01');
const dirCaso = (ctx: Contexto, caso: string) => path.join(rootFixtures(ctx),'casos',casoSchema.parse(caso));
const dirOut = (ctx: Contexto, caso: string) => path.join(ctx.directory,'out',casoSchema.parse(caso));
async function leerJson(file: string): Promise<unknown> { return JSON.parse(await fs.readFile(file, 'utf8')) as unknown; }
async function guardar(file: string, content: string | Uint8Array) { await fs.mkdir(path.dirname(file), {recursive:true}); await fs.writeFile(file, content); }
function fecha(ctx: Contexto) { return ctx.fecha ?? new Intl.DateTimeFormat('en-CA',{timeZone:process.env.APP_TIMEZONE || 'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
async function registrar(ctx: Contexto, caso: string, herramienta: string, ok: boolean) {
  const casoValido=casoSchema.safeParse(caso).success;
  const line = JSON.stringify({ts:new Date().toISOString(),herramienta,ok,resumen:ok?'Operación completada':'Operación no completada'})+'\n';
  await fs.mkdir(path.join(ctx.directory,'out'),{recursive:true});
  await fs.appendFile(path.join(ctx.directory,'out','log.jsonl'),line);
  if (casoValido) { await fs.mkdir(dirOut(ctx,caso),{recursive:true}); await fs.appendFile(path.join(dirOut(ctx,caso),'log.jsonl'),line); }
}
async function ejecutar<T>(ctx: Contexto, caso: string, nombre: string, fn: () => Promise<T>): Promise<string> {
  let r: Resultado<T>;
  try { r={ok:true,data:await fn()}; } catch (e) {
    const mensaje = e instanceof Error && e.message.startsWith('USUARIO:') ? e.message.slice(8) : 'No fue posible procesar el caso. Verifica que exista y que sus archivos sean válidos.';
    r={ok:false,error:mensaje};
  }
  try { await registrar(ctx,caso,nombre,r.ok); } catch { return JSON.stringify({ok:false,error:'No fue posible registrar la operación.'}); }
  return JSON.stringify(r);
}
async function obtenerCaso(ctx: Contexto, caso: string) {
  const dir=dirCaso(ctx,caso);
  const solicitud=solicitudSchema.parse(await leerJson(path.join(dir,'solicitud.json')));
  const archivo=solicitud.formato==='xlsx'?'plantilla-celdas.json':'plantilla-campos.json';
  const soportes=z.array(z.string()).parse(await leerJson(path.join(dir,'soportes-exigidos.json')));
  let campos:Campo[]=[]; let error_plantilla:string|undefined;
  try {
    campos=z.array(campoSchema).parse(await leerJson(path.join(dir,archivo)));
    if (solicitud.formato==='xlsx' && campos.some(c=>!c.hoja||!c.celda_etiqueta||!c.celda_valor)) throw new Error('celdas incompletas');
  } catch {error_plantilla='La plantilla está ausente o es inválida; no se pueden determinar sus campos.';}
  return {...solicitud,campos,soportes,...(error_plantilla?{error_plantilla}:{})};
}
function rutaValor(master: unknown, key: string): unknown {
  let valor: unknown=master;
  for (const segmento of key.split('.')) {
    if (typeof valor!=='object'||valor===null||!Object.hasOwn(valor,segmento)) return undefined;
    valor=(valor as Record<string,unknown>)[segmento];
  }
  return valor;
}
async function calcularMapeo(ctx: Contexto, caso: string, campos: Campo[]): Promise<Mapeo> {
  const solicitud=await obtenerCaso(ctx,caso);
  const glosario=z.record(z.string(),z.string()).parse(await leerJson(path.join(rootFixtures(ctx),'glosario-campos.json')));
  const master=await leerJson(path.join(rootFixtures(ctx),'repositorio','maestro.json'));
  const permitidos=new Set(solicitud.campos.map(c=>c.etiqueta));
  const result: Mapeo={llenos:[],faltantes:[],requiere_confirmacion:[]};
  for (const {etiqueta} of campos) {
    if (!permitidos.has(etiqueta)) throw new Error('USUARIO:El campo no pertenece a la plantilla del caso.');
    const key=glosario[etiqueta]; const value=key ? rutaValor(master,key) : undefined;
    if (!key || value===undefined || value===null || !['string','number','boolean'].includes(typeof value)) { result.faltantes.push({etiqueta,estado:'faltante'}); continue; }
    const tributario=key==='nit';
    const ambiguo=tributario && (solicitud.pais!=='CO' || /identificaci[oó]n tributaria|n[uú]mero de identificaci[oó]n fiscal/i.test(etiqueta));
    const item: Mapeado={etiqueta,estado:ambiguo?'requiere_confirmacion':'lleno',ruta_maestro:key,valor:value as string|number|boolean};
    if (ambiguo) {item.nota=solicitud.pais!=='CO'?'identificador extranjero':'identificador tributario ambiguo';item.equivalente_pais=({CO:'NIT',EC:'RUC',PE:'RUC',PA:'RUC',HN:'RTN'} as Record<string,string>)[solicitud.pais]; result.requiere_confirmacion.push(item);} else result.llenos.push(item);
  }
  return result;
}
function valorCampo(mapeo: Mapeo, etiqueta: string): string | number | boolean | undefined {return [...mapeo.llenos,...mapeo.requiere_confirmacion].find(c=>c.etiqueta===etiqueta)?.valor;}
async function generar(ctx: Contexto, caso: string) {
  const s=await obtenerCaso(ctx,caso); if(s.error_plantilla)throw new Error(`USUARIO:${s.error_plantilla}`); const m=await calcularMapeo(ctx,caso,s.campos); const out=dirOut(ctx,caso);
  await guardar(path.join(out,'mapeo.json'),JSON.stringify(m,null,2));
  if(s.formato==='xlsx') {
    const workbook=new ExcelJS.Workbook();
    for(const campo of s.campos) {
      const sheet=workbook.getWorksheet(campo.hoja!) ?? workbook.addWorksheet(campo.hoja!);
      sheet.getCell(campo.celda_etiqueta!).value=campo.etiqueta;
      const value=valorCampo(m,campo.etiqueta); if(value!==undefined) sheet.getCell(campo.celda_valor!).value=value;
    }
    await fs.mkdir(out,{recursive:true}); await workbook.xlsx.writeFile(path.join(out,'formulario.xlsx'));
    return {ruta:`out/${caso}/formulario.xlsx`,formato:'xlsx'};
  }
  if(s.formato==='pdf') {
    const doc=await PDFDocument.create(); const font=await doc.embedFont(StandardFonts.Helvetica); let page=doc.addPage(); let y=page.getHeight()-50;
    for(const campo of s.campos) {
      const text=`${campo.etiqueta}: ${String(valorCampo(m,campo.etiqueta) ?? '[FALTANTE]')}`;
      const words=text.split(/\s+/); let line='';
      for(const word of words) {
        const next=line?`${line} ${word}`:word;
        if(font.widthOfTextAtSize(next,10)>page.getWidth()-90 && line) { if(y<50){page=doc.addPage();y=page.getHeight()-50;} page.drawText(line,{x:45,y,size:10,font,color:rgb(0,0,0)});y-=16;line=word; } else line=next;
      }
      if(y<50){page=doc.addPage();y=page.getHeight()-50;} page.drawText(line,{x:45,y,size:10,font}); y-=20;
    }
    await guardar(path.join(out,'formulario.pdf'),await doc.save({useObjectStreams:false}));
    return {ruta:`out/${caso}/formulario.pdf`,formato:'pdf'};
  }
  const lineas=s.campos.map(c=>`- **${c.etiqueta}:** ${String(valorCampo(m,c.etiqueta) ?? '[FALTANTE]')}`);
  await guardar(path.join(out,'valores-portal.md'),`# Valores para copiar\n\nFormato no soportado para automatización. El acceso y envío son humanos.\n\n${lineas.join('\n')}\n`);
  return {ruta:`out/${caso}/valores-portal.md`,formato:'portal',aviso:'formato no soportado para automatización'};
}
async function paquete(ctx: Contexto, caso: string) {
  const s=await obtenerCaso(ctx,caso); const m=await calcularMapeo(ctx,caso,s.campos); const out=dirOut(ctx,caso); const paq=path.join(out,'paquete');
  const formato=await generar(ctx,caso);
  const index=z.array(soporteSchema).parse(await leerJson(path.join(rootFixtures(ctx),'repositorio','soportes','index.json')));
  await fs.mkdir(paq,{recursive:true});
  // El paquete se reconstruye para que ejecuciones sucesivas no conserven soportes anteriores.
  for(const entry of await fs.readdir(paq)) await fs.rm(path.join(paq,entry),{recursive:true,force:true});
  await fs.copyFile(path.join(ctx.directory,formato.ruta),path.join(paq,path.basename(formato.ruta)));
  const checklist: {tipo:string;estado:'presente'|'ausente'|'vencido';vigencia_hasta:string|null}[]=[];
  for(const tipo of s.soportes) {
    const soporte=index.find(v=>v.tipo===tipo); let existe=false;
    if(soporte) {try {await fs.access(path.join(rootFixtures(ctx),'repositorio','soportes',soporte.archivo));existe=true;} catch {existe=false;}}
    const estado=!soporte||!existe?'ausente':soporte.vigencia_hasta && soporte.vigencia_hasta<fecha(ctx)?'vencido':'presente';
    checklist.push({tipo,estado,vigencia_hasta:soporte?.vigencia_hasta??null});
    if(soporte && existe) await fs.copyFile(path.join(rootFixtures(ctx),'repositorio','soportes',soporte.archivo),path.join(paq,soporte.archivo));
  }
  const listo=checklist.every(x=>x.estado==='presente');
  const lista=checklist.map(x=>`- ${x.tipo}: ${x.estado}${x.vigencia_hasta?` (vigencia hasta ${x.vigencia_hasta})`:''}`).join('\n');
  const faltantes=m.faltantes.map(x=>`- ${x.etiqueta}`).join('\n') || '- Ninguno';
  const confirmaciones=m.requiere_confirmacion.map(x=>`- ${x.etiqueta}: ${x.nota}`).join('\n') || '- Ninguna';
  await guardar(path.join(paq,'checklist.md'),`# Checklist\n\nFecha de evaluación: ${fecha(ctx)}\n\n## Soportes\n${lista}\n\n## Campos faltantes\n${faltantes}\n\n## Requieren confirmación\n${confirmaciones}\n\nListo para firma: ${listo?'sí':'no'}\n`);
  await guardar(path.join(paq,'borrador-correo.md'),`# Borrador de correo\n\nAsunto: Registro como proveedor - ${s.cliente}\n\nEstimados:\n\nAdjuntamos el formulario y los soportes disponibles para revisión y firma. Antes de cualquier envío, revise los faltantes y vigencias del checklist.\n\nCordialmente.\n`);
  return {ruta:`out/${caso}/paquete/`,listo_para_firma:listo,checklist};
}
const casoArgs={caso:casoSchema};
export const leer_solicitud={description:'Lee los campos y soportes solicitados en un caso.',args:casoArgs,async execute(args:{caso:string},ctx:Contexto){return ejecutar(ctx,args.caso,'leer_solicitud',()=>obtenerCaso(ctx,args.caso));}};
export const mapear_campos={description:'Cruza los campos solicitados con el glosario y el maestro.',args:{...casoArgs,campos:z.array(campoSchema).describe('Campos de la plantilla devueltos por leer_solicitud')},async execute(args:{caso:string;campos:Campo[]},ctx:Contexto){return ejecutar(ctx,args.caso,'mapear_campos',()=>calcularMapeo(ctx,args.caso,args.campos));}};
export const generar_formulario={description:'Genera el formulario solicitado usando únicamente los datos maestros.',args:{...casoArgs,mapeo:z.object({}).passthrough().describe('Mapeo devuelto por mapear_campos')},async execute(args:{caso:string;mapeo:unknown},ctx:Contexto){return ejecutar(ctx,args.caso,'generar_formulario',()=>generar(ctx,args.caso));}};
export const armar_paquete={description:'Arma el paquete y verifica los soportes para firma.',args:casoArgs,async execute(args:{caso:string},ctx:Contexto){return ejecutar(ctx,args.caso,'armar_paquete',()=>paquete(ctx,args.caso));}};
export const simular_envio={description:'Registra un envío simulado tras la confirmación explícita del usuario.',args:{...casoArgs,confirmado:z.boolean().describe('Confirmación explícita del usuario')},async execute(args:{caso:string;confirmado:boolean},ctx:Contexto){return ejecutar(ctx,args.caso,'simular_envio',async()=>{if(!args.confirmado||!ctx.confirmadoEnTurnoAnterior) throw new Error('USUARIO:requiere confirmación explícita'); await obtenerCaso(ctx,args.caso); const ruta=`out/${args.caso}/ENVIO-SIMULADO.md`;await guardar(path.join(ctx.directory,ruta),'# Envío simulado\n\nNo se envió ningún correo ni documento.\n');return {ruta};});}};
