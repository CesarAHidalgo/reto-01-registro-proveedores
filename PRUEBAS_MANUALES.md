# Guía de prueba manual

La solución dispone de dos formas diferentes de comprobación:

- `npm run demo` procesa los cuatro casos mediante herramientas deterministas. **No usa modelo ni clave.**
- El chat completo usa un modelo real para decidir qué herramientas llamar. El PRD permite escoger proveedor; la implementación actual utiliza Gemini y necesita una clave.

Los datos y documentos incluidos son ficticios. El agente no firma ni envía correos reales.

## A. Probar las herramientas sin clave

Desde la carpeta del proyecto:

```bash
npm ci
npm run demo
```

El comando elimina y regenera `out/` de este proyecto. No lo ejecutes mientras otra persona esté utilizando sus archivos generados. Muestra un resumen por caso y crea los formularios y paquetes:

| Caso | Archivo | Qué comprobar |
| --- | --- | --- |
| `co-industrias-delta` | `out/co-industrias-delta/formulario.xlsx` | Hojas y celdas de la plantilla; soportes en `paquete/`. |
| `ec-corp-andina` | `out/ec-corp-andina/formulario.pdf` | Campo de contribuyente especial faltante y RUC marcado para confirmación en el checklist. |
| `hn-agroexport-sula` | `out/hn-agroexport-sula/formulario.xlsx` | Referencias comerciales faltantes y RTN por confirmar. |
| `pa-logistica-istmo` | `out/pa-logistica-istmo/valores-portal.md` | Valores para copiar; el portal no se automatiza. |

Abre el `checklist.md` de cada `out/<caso>/paquete/` y revisa los soportes presentes, ausentes y vencidos. El estado depende de la fecha real de ejecución; un soporte vencido o ausente bloquea `listo_para_firma`. El borrador no incluye datos bancarios.

Para ejecutar las pruebas automatizadas adicionales:

```bash
npm run typecheck
npm test
npm audit --omit=dev
```

## B. Probar el chat completo con Gemini

Gemini es el proveedor configurado en esta implementación, aunque no es obligatorio según el PRD.

1. Entra a [Google AI Studio: API Keys](https://aistudio.google.com/apikey), inicia sesión y copia una clave o selecciona **Create API key**. Google puede pedir seleccionar o crear un proyecto. Comprueba la disponibilidad y cuota del nivel gratuito de tu cuenta.
2. Copia `.env.example` a `.env` si el archivo todavía no existe. Agrega la clave únicamente en la línea `GEMINI_API_KEY=` de `.env`. No incluyas la clave en el repositorio, en mensajes ni en capturas. `.env` está excluido por `.gitignore`.
3. Inicia o reinicia el servidor para que lea la nueva configuración:

   ```bash
   npm run dev
   ```

4. Abre [http://127.0.0.1:3000](http://127.0.0.1:3000). Si ya hay un servidor del proyecto ejecutándose, detén esa instancia antes de iniciarlo de nuevo.
5. Escribe:

   ```text
   Procesa el caso ec-corp-andina. Dime qué campos quedaron llenos, cuáles faltan, si el paquete está listo para firma y qué soportes debo actualizar. No envíes nada todavía.
   ```

6. Comprueba la respuesta basada en herramientas, sus llamadas visibles, los campos faltantes, la lista de soportes y la pregunta de confirmación. Descarga el paquete desde el enlace del chat.
7. Si deseas comprobar la simulación, responde **sí** a la pregunta de confirmación. Se crea `out/ec-corp-andina/ENVIO-SIMULADO.md`. No se envía ningún correo ni se firma ningún documento.

La interfaz puede abrir sin clave, pero mostrará un mensaje de configuración pendiente al intentar usar el chat. Las pruebas automatizadas incluyen modelos y respuestas de API simulados; no sustituyen esta prueba con un proveedor real.

## C. Ejecución compilada

```bash
npm ci --include=dev
npm run build
npm start
```

En modo local escucha en `127.0.0.1`. Para una demostración desplegada, configurar `NODE_ENV=production` y un `DEMO_ACCESS_CODE` de al menos 12 caracteres, además de la clave del modelo. El límite de peticiones y las sesiones están en memoria; esta configuración es para el reto, no para información real o uso multiusuario de producción.
